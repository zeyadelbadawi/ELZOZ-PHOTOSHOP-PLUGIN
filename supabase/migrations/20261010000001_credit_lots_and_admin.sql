-- Expiring credits + admin console.
--
-- Credits are sold manually (the owner tops users up from the admin dashboard).
-- Every top-up is a "lot" that expires (default 30 days after the top-up):
--   * spending always uses the lot that expires first;
--   * when a lot expires, whatever is left of it is removed and recorded in the
--     ledger as kind 'expiry';
--   * credits reserved by a running job are never expired from under it; they
--     expire as soon as the job releases them.
-- Invariant: credit_accounts.balance = sum(credit_lots.remaining) for the user.
--
-- Admins are listed in private.admins (inserted with SQL by the owner, see
-- docs/ADMIN.md). Admin RPCs are callable by signed-in users but check that list
-- first. Creating auth users and setting passwords needs the service key, so that
-- part lives in the admin-users Edge Function, never in a browser.

-- ---------------------------------------------------------------- schema changes

alter table public.credit_ledger drop constraint credit_ledger_kind_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check
    check (kind in ('purchase', 'grant', 'charge', 'refund', 'adjustment', 'expiry'));
alter table public.credit_ledger add constraint expiry_shape check (kind <> 'expiry' or amount < 0);

alter table public.credit_accounts add column disabled boolean not null default false;

create table public.credit_lots (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    source text not null check (source in ('purchase', 'grant', 'adjustment', 'refund')),
    amount bigint not null check (amount > 0),
    remaining bigint not null check (remaining >= 0),
    expires_at timestamptz not null,
    ledger_id bigint references public.credit_ledger (id),
    created_at timestamptz not null default now(),
    constraint remaining_within_amount check (remaining <= amount)
);
create index credit_lots_open on public.credit_lots (user_id, expires_at, id) where remaining > 0;
create index credit_lots_expiring on public.credit_lots (expires_at) where remaining > 0;

revoke all on public.credit_lots from anon, authenticated;
grant select on public.credit_lots to authenticated;
alter table public.credit_lots enable row level security;
create policy "own lots" on public.credit_lots for select to authenticated using (user_id = (select auth.uid()));

create table private.admins (
    user_id uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);

-- Existing balances (development databases only; nothing is deployed yet) become one lot.
insert into public.credit_lots (user_id, source, amount, remaining, expires_at)
select user_id, 'grant', balance, balance, now() + interval '30 days' from public.credit_accounts where balance > 0;

-- ---------------------------------------------------------------- lot helpers (private)

create function private.add_lot(p_user uuid, p_source text, p_amount bigint, p_expires_at timestamptz, p_ledger_id bigint)
returns void language sql set search_path = '' as $$
    insert into public.credit_lots (user_id, source, amount, remaining, expires_at, ledger_id)
    values (p_user, p_source, p_amount, p_amount, p_expires_at, p_ledger_id);
$$;

-- Take p_amount from the user's lots, earliest expiry first. Caller holds the account lock.
create function private.consume_lots(p_user uuid, p_amount bigint)
returns void language plpgsql set search_path = '' as $$
declare
    lot record;
    left_ bigint := p_amount;
    take bigint;
begin
    for lot in
        select id, remaining from public.credit_lots
        where user_id = p_user and remaining > 0
        order by expires_at, id
        for update
    loop
        exit when left_ <= 0;
        take := least(lot.remaining, left_);
        update public.credit_lots set remaining = remaining - take where id = lot.id;
        left_ := left_ - take;
    end loop;
    if left_ > 0 then
        raise exception 'lots_inconsistent' using errcode = 'P0001', detail = format('missing %s', left_);
    end if;
end $$;

-- Expire what is left of lots past their date. p_user null = everyone.
-- Never takes credits that a running job has reserved (balance - reserved is the limit).
create function private.expire_credits(p_user uuid default null)
returns bigint language plpgsql set search_path = '' as $$
declare
    u record;
    lot record;
    acct public.credit_accounts%rowtype;
    free_ bigint;
    take bigint;
    total bigint := 0;
begin
    for u in
        select distinct user_id from public.credit_lots
        where remaining > 0 and expires_at <= now() and (p_user is null or user_id = p_user)
        order by user_id
    loop
        select * into acct from public.credit_accounts where user_id = u.user_id for update;
        free_ := acct.balance - acct.reserved;
        for lot in
            select id, remaining from public.credit_lots
            where user_id = u.user_id and remaining > 0 and expires_at <= now()
            order by expires_at, id
            for update
        loop
            exit when free_ <= 0;
            take := least(lot.remaining, free_);
            update public.credit_lots set remaining = remaining - take where id = lot.id;
            update public.credit_accounts set balance = balance - take, updated_at = now()
                where user_id = u.user_id returning balance into acct.balance;
            insert into public.credit_ledger (user_id, kind, amount, balance_after, actor, note)
                values (u.user_id, 'expiry', -take, acct.balance, 'system', format('lot %s expired', lot.id));
            free_ := free_ - take;
            total := total + take;
        end loop;
    end loop;
    return total;
end $$;

create function private.require_admin() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := private.require_user();
begin
    if not exists (select 1 from private.admins where user_id = uid) then
        raise exception 'not_admin' using errcode = '42501';
    end if;
    return uid;
end $$;

create function private.admin_actor(p_admin uuid) returns text
language sql stable set search_path = '' as $$
    select 'admin:' || coalesce((select email from auth.users where id = p_admin), p_admin::text);
$$;

-- ---------------------------------------------------------------- credit movements (replaces 20261009000001 versions)

drop function public.grant_credits(uuid, bigint, text, text, text, text);

-- Add credits (positive) or remove them (negative 'adjustment'). Positive amounts create a lot
-- that expires at p_expires_at (default: 30 days from now).
create function public.grant_credits(p_user uuid, p_amount bigint, p_kind text, p_reference text, p_actor text,
                                     p_note text default null, p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    acct public.credit_accounts%rowtype;
    bal bigint;
    entry_id bigint;
    expires timestamptz := coalesce(p_expires_at, now() + interval '30 days');
begin
    if p_kind not in ('purchase', 'grant', 'adjustment') then
        raise exception 'invalid_kind' using errcode = '22023';
    end if;
    if p_amount = 0 or (p_kind <> 'adjustment' and p_amount < 0) or abs(p_amount) > 10000000 then
        raise exception 'invalid_amount' using errcode = '22023';
    end if;
    if p_actor is null or length(p_actor) = 0 then
        raise exception 'actor_required' using errcode = '22023';
    end if;
    if p_amount > 0 and expires <= now() then
        raise exception 'invalid_expiry' using errcode = '22023';
    end if;
    if p_reference is not null and exists (
        select 1 from public.credit_ledger where kind = p_kind and reference = p_reference and kind in ('purchase', 'grant')) then
        select balance into bal from public.credit_accounts where user_id = p_user;
        return jsonb_build_object('duplicate', true, 'balance', bal);
    end if;

    select * into acct from public.credit_accounts where user_id = p_user for update;
    if not found then
        raise exception 'account_missing' using errcode = 'P0001';
    end if;
    perform private.expire_credits(p_user);
    select * into acct from public.credit_accounts where user_id = p_user;
    if acct.balance + p_amount < acct.reserved then
        raise exception 'adjustment_below_reserved' using errcode = 'P0001',
            detail = json_build_object('available', acct.balance - acct.reserved)::text;
    end if;

    update public.credit_accounts set balance = balance + p_amount, updated_at = now()
        where user_id = p_user returning balance into bal;
    insert into public.credit_ledger (user_id, kind, amount, balance_after, reference, actor, note)
        values (p_user, p_kind, p_amount, bal, p_reference, p_actor, p_note) returning id into entry_id;
    if p_amount > 0 then
        perform private.add_lot(p_user, p_kind, p_amount, expires, entry_id);
    else
        perform private.consume_lots(p_user, -p_amount);
    end if;
    return jsonb_build_object('ledger_id', entry_id, 'balance', bal, 'expires_at', case when p_amount > 0 then expires end);
end $$;

-- Refunds return the credits as a new lot valid for 30 days.
create or replace function public.refund_charge(p_ledger_id bigint, p_actor text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    c public.credit_ledger%rowtype;
    bal bigint;
    entry_id bigint;
begin
    select * into c from public.credit_ledger where id = p_ledger_id and kind = 'charge';
    if not found then
        raise exception 'charge_not_found' using errcode = 'P0002';
    end if;
    if p_actor is null or length(p_actor) = 0 then
        raise exception 'actor_required' using errcode = '22023';
    end if;
    perform 1 from public.credit_accounts where user_id = c.user_id for update;
    update public.credit_accounts set balance = balance - c.amount, updated_at = now()
        where user_id = c.user_id returning balance into bal;
    insert into public.credit_ledger (user_id, kind, amount, balance_after, job_id, item_key, refund_of, actor, note)
        values (c.user_id, 'refund', -c.amount, bal, c.job_id, c.item_key, c.id, p_actor, p_note) returning id into entry_id;
    perform private.add_lot(c.user_id, 'refund', -c.amount, now() + interval '30 days', entry_id);
    return jsonb_build_object('ledger_id', entry_id, 'balance', bal);
end $$;

-- start_job: expire first, refuse disabled accounts. Body otherwise unchanged from 20261009000001.
create or replace function public.start_job(p_kind text, p_items jsonb, p_idempotency_key text, p_client_info jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    uid uuid := private.require_user();
    req jsonb := jsonb_build_object('kind', p_kind, 'items', p_items, 'client', p_client_info);
    h text := private.request_hash(req);
    prior jsonb;
    rule public.pricing_rules%rowtype;
    acct public.credit_accounts%rowtype;
    v_job_id uuid;
    item jsonb;
    n integer;
    total bigint := 0;
    units integer;
    dur integer; w integer; ht integer;
    response jsonb;
begin
    prior := private.idempotent_lookup(uid, p_idempotency_key, 'start_job', h);
    if prior is not null then return prior; end if;

    perform private.hit_rate_limit(uid, 'start_job', 20, 60);
    perform private.expire_jobs(uid);
    perform private.expire_credits(uid);

    if p_kind not in ('design', 'video') then
        raise exception 'invalid_kind' using errcode = '22023';
    end if;
    if jsonb_typeof(p_items) <> 'array' then
        raise exception 'invalid_items' using errcode = '22023';
    end if;
    n := jsonb_array_length(p_items);
    if n < 1 or n > 5000 then
        raise exception 'invalid_items' using errcode = '22023', detail = 'between 1 and 5000 items';
    end if;
    if (select count(distinct e ->> 'key') from jsonb_array_elements(p_items) e) <> n
       or exists (select 1 from jsonb_array_elements(p_items) e where coalesce(length(e ->> 'key'), 0) not between 1 and 200) then
        raise exception 'invalid_items' using errcode = '22023', detail = 'item keys must be unique, 1-200 chars';
    end if;
    if pg_column_size(p_client_info) > 2048 then
        raise exception 'invalid_client_info' using errcode = '22023';
    end if;
    if (select count(*) from public.jobs where user_id = uid and status = 'active') >= 3 then
        raise exception 'too_many_active_jobs' using errcode = 'P0001';
    end if;

    select * into rule from public.pricing_rules where unit = case p_kind when 'design' then 'design' else 'video_5s' end;

    select * into acct from public.credit_accounts where user_id = uid for update;
    if not found then
        raise exception 'account_missing' using errcode = 'P0001';
    end if;
    if acct.disabled then
        raise exception 'account_disabled' using errcode = 'P0001';
    end if;

    insert into public.jobs (user_id, kind, unit_price, planned_items, reserved_total, client_info, expires_at)
    values (uid, p_kind, rule.price, n, 0, p_client_info, now() + interval '2 hours')
    returning id into v_job_id;

    for item in select * from jsonb_array_elements(p_items) loop
        if p_kind = 'design' then
            units := 1;
        else
            dur := (item ->> 'duration_ms')::integer;
            w := (item ->> 'width')::integer;
            ht := (item ->> 'height')::integer;
            if dur is null or dur not between 1000 and 60000 or w not between 16 and 4096 or ht not between 16 and 4096 then
                raise exception 'invalid_video_spec' using errcode = '22023', detail = item::text;
            end if;
            units := ceil(dur / 5000.0)::integer * (case when greatest(w, ht) > rule.hd_long_edge then rule.hd_multiplier else 1 end);
        end if;
        insert into public.job_items (job_id, item_key, units, cost, spec)
        values (v_job_id, item ->> 'key', units, units * rule.price, item - 'key');
        total := total + units * rule.price;
    end loop;

    if acct.balance - acct.reserved < total then
        raise exception 'insufficient_credits' using errcode = 'P0001',
            detail = json_build_object('needed', total, 'available', acct.balance - acct.reserved)::text;
    end if;

    update public.jobs set reserved_total = total where id = v_job_id;
    update public.credit_accounts set reserved = reserved + total, updated_at = now() where user_id = uid;

    response := jsonb_build_object('job_id', v_job_id, 'reserved', total, 'unit_price', rule.price, 'items', n,
                                   'available_after', acct.balance - acct.reserved - total,
                                   'expires_at', now() + interval '2 hours');
    perform private.idempotent_store(uid, p_idempotency_key, 'start_job', h, response);
    return response;
end $$;

-- report_item: a charge also takes the credits from the earliest-expiring lots.
create or replace function public.report_item(p_job_id uuid, p_item_key text, p_status text, p_evidence jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    uid uuid := private.require_user();
    h text := private.request_hash(jsonb_build_object('job', p_job_id, 'item', p_item_key, 'status', p_status, 'evidence', p_evidence));
    prior jsonb;
    j public.jobs%rowtype;
    it public.job_items%rowtype;
    bal bigint;
    charged bigint := 0;
    response jsonb;
begin
    prior := private.idempotent_lookup(uid, p_idempotency_key, 'report_item', h);
    if prior is not null then return prior; end if;
    perform private.hit_rate_limit(uid, 'report_item', 1200, 60);

    if p_status not in ('succeeded', 'failed') then
        raise exception 'invalid_status' using errcode = '22023';
    end if;
    if p_evidence is not null and pg_column_size(p_evidence) > 8192 then
        raise exception 'evidence_too_large' using errcode = '22023';
    end if;

    perform 1 from public.credit_accounts where user_id = uid for update;
    select * into j from public.jobs where id = p_job_id and user_id = uid for update;
    if not found then
        raise exception 'job_not_found' using errcode = 'P0002';
    end if;
    if j.status = 'active' and j.expires_at < now() then
        raise exception 'job_expired' using errcode = 'P0001';
    end if;
    if j.status <> 'active' then
        raise exception 'job_not_active' using errcode = 'P0001', detail = j.status;
    end if;

    select * into it from public.job_items where job_id = p_job_id and item_key = p_item_key for update;
    if not found then
        raise exception 'item_not_found' using errcode = 'P0002';
    end if;
    if it.status <> 'reserved' then
        raise exception 'item_already_reported' using errcode = 'P0001', detail = it.status;
    end if;

    if p_status = 'succeeded' then
        charged := it.cost;
        update public.credit_accounts
            set balance = balance - it.cost, reserved = reserved - it.cost, updated_at = now()
            where user_id = uid returning balance into bal;
        if it.cost > 0 then
            insert into public.credit_ledger (user_id, kind, amount, balance_after, job_id, item_key, actor)
            values (uid, 'charge', -it.cost, bal, p_job_id, p_item_key, 'system');
            perform private.consume_lots(uid, it.cost);
        end if;
        update public.jobs set charged_total = charged_total + it.cost where id = p_job_id;
    else
        update public.credit_accounts set reserved = reserved - it.cost, updated_at = now()
            where user_id = uid returning balance into bal;
    end if;

    update public.job_items set status = p_status, evidence = p_evidence, reported_at = now()
        where job_id = p_job_id and item_key = p_item_key;
    update public.jobs set heartbeat_at = now(), expires_at = now() + interval '2 hours' where id = p_job_id;

    response := jsonb_build_object('item_key', p_item_key, 'status', p_status, 'charged', charged, 'balance', bal);
    perform private.idempotent_store(uid, p_idempotency_key, 'report_item', h, response);
    return response;
end $$;

-- Sweep: abandoned jobs, then expired credits (scheduled by 20261009000002 when pg_cron exists).
create or replace function public.expire_stale_jobs() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
    n := private.expire_jobs(null);
    perform private.expire_credits(null);
    return n;
end $$;

-- ---------------------------------------------------------------- user RPC

-- The signed-in user's credits, with expiry applied first. The plugin shows this.
create function public.my_credits() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    uid uuid := private.require_user();
    acct public.credit_accounts%rowtype;
    lots jsonb;
begin
    perform private.expire_credits(uid);
    select * into acct from public.credit_accounts where user_id = uid;
    if not found then
        raise exception 'account_missing' using errcode = 'P0001';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('remaining', remaining, 'expires_at', expires_at) order by expires_at), '[]'::jsonb)
        into lots from public.credit_lots where user_id = uid and remaining > 0 and expires_at > now();
    return jsonb_build_object('balance', acct.balance, 'reserved', acct.reserved, 'available', acct.balance - acct.reserved,
                              'disabled', acct.disabled, 'lots', lots,
                              'next_expiry', lots -> 0);
end $$;

-- ---------------------------------------------------------------- admin RPCs

create function public.am_i_admin() returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (select 1 from private.admins where user_id = auth.uid());
$$;

create function public.admin_list_users(p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    total integer;
    rows_ jsonb;
    q text := nullif(trim(coalesce(p_search, '')), '');
begin
    perform private.require_admin();
    perform private.expire_credits(null);
    select count(*) into total from auth.users u where q is null or u.email ilike '%' || q || '%';
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) into rows_ from (
        select u.id, u.email, u.created_at,
               coalesce(a.balance, 0) as balance, coalesce(a.reserved, 0) as reserved,
               coalesce(a.balance - a.reserved, 0) as available, coalesce(a.disabled, false) as disabled,
               (select min(l.expires_at) from public.credit_lots l where l.user_id = u.id and l.remaining > 0 and l.expires_at > now()) as next_expiry,
               (select max(j.created_at) from public.jobs j where j.user_id = u.id) as last_job_at,
               (select coalesce(-sum(e.amount), 0) from public.credit_ledger e
                 where e.user_id = u.id and e.kind = 'charge' and e.created_at > now() - interval '30 days') as used_30d,
               exists (select 1 from private.admins ad where ad.user_id = u.id) as is_admin
        from auth.users u left join public.credit_accounts a on a.user_id = u.id
        where q is null or u.email ilike '%' || q || '%'
        order by u.created_at desc
        limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
    ) r;
    return jsonb_build_object('total', total, 'users', rows_);
end $$;

create function public.admin_user_detail(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out_ jsonb;
begin
    perform private.require_admin();
    perform private.expire_credits(p_user);
    select jsonb_build_object(
        'user', (select jsonb_build_object('id', u.id, 'email', u.email) from auth.users u where u.id = p_user),
        'account', (select to_jsonb(a) - 'user_id' || jsonb_build_object('available', a.balance - a.reserved)
                    from public.credit_accounts a where a.user_id = p_user),
        'lots', (select coalesce(jsonb_agg(to_jsonb(l) - 'user_id' order by l.expires_at desc), '[]'::jsonb)
                 from (select * from public.credit_lots where user_id = p_user order by expires_at desc limit 50) l),
        'ledger', (select coalesce(jsonb_agg(to_jsonb(e) - 'user_id' order by e.id desc), '[]'::jsonb)
                   from (select * from public.credit_ledger where user_id = p_user order by id desc limit 100) e),
        'jobs', (select coalesce(jsonb_agg(to_jsonb(j) - 'user_id' - 'client_info' order by j.created_at desc), '[]'::jsonb)
                 from (select * from public.jobs where user_id = p_user order by created_at desc limit 20) j)
    ) into out_;
    if out_ -> 'user' is null or out_ -> 'user' = 'null'::jsonb then
        raise exception 'user_not_found' using errcode = 'P0002';
    end if;
    return out_;
end $$;

-- Top up a user. p_valid_days: how long these credits last (default 30).
-- The idempotency key makes a double-click or a retried request add credits only once.
create function public.admin_grant_credits(p_user uuid, p_amount bigint, p_valid_days integer, p_note text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    admin_id uuid := private.require_admin();
    h text := private.request_hash(jsonb_build_object('user', p_user, 'amount', p_amount, 'days', p_valid_days, 'note', p_note));
    prior jsonb;
    res jsonb;
begin
    prior := private.idempotent_lookup(admin_id, p_idempotency_key, 'admin_grant_credits', h);
    if prior is not null then return prior; end if;
    if p_amount is null or p_amount <= 0 then
        raise exception 'invalid_amount' using errcode = '22023';
    end if;
    if p_valid_days is null or p_valid_days not between 1 and 3660 then
        raise exception 'invalid_validity' using errcode = '22023';
    end if;
    res := public.grant_credits(p_user, p_amount, 'purchase', null, private.admin_actor(admin_id), p_note,
                                now() + make_interval(days => p_valid_days));
    perform private.idempotent_store(admin_id, p_idempotency_key, 'admin_grant_credits', h, res);
    return res;
end $$;

-- Remove credits (e.g. a top-up entered by mistake). Can't touch credits reserved by a running job.
create function public.admin_remove_credits(p_user uuid, p_amount bigint, p_note text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    admin_id uuid := private.require_admin();
    h text := private.request_hash(jsonb_build_object('user', p_user, 'amount', p_amount, 'note', p_note));
    prior jsonb;
    res jsonb;
begin
    prior := private.idempotent_lookup(admin_id, p_idempotency_key, 'admin_remove_credits', h);
    if prior is not null then return prior; end if;
    if p_amount is null or p_amount <= 0 then
        raise exception 'invalid_amount' using errcode = '22023';
    end if;
    if p_note is null or length(trim(p_note)) = 0 then
        raise exception 'note_required' using errcode = '22023';
    end if;
    res := public.grant_credits(p_user, -p_amount, 'adjustment', null, private.admin_actor(admin_id), p_note);
    perform private.idempotent_store(admin_id, p_idempotency_key, 'admin_remove_credits', h, res);
    return res;
end $$;

create function public.admin_set_disabled(p_user uuid, p_disabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    update public.credit_accounts set disabled = p_disabled, updated_at = now() where user_id = p_user;
    if not found then
        raise exception 'account_missing' using errcode = 'P0001';
    end if;
    return jsonb_build_object('user_id', p_user, 'disabled', p_disabled);
end $$;

create function public.admin_refund_charge(p_ledger_id bigint, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := private.require_admin();
begin
    return public.refund_charge(p_ledger_id, private.admin_actor(admin_id), p_note);
end $$;

create function public.admin_set_price(p_unit text, p_price integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    if p_price is null or p_price < 0 or p_price > 100000 then
        raise exception 'invalid_price' using errcode = '22023';
    end if;
    update public.pricing_rules set price = p_price, updated_at = now() where unit = p_unit;
    if not found then
        raise exception 'invalid_unit' using errcode = '22023';
    end if;
    return (select jsonb_agg(to_jsonb(p) order by p.unit) from public.pricing_rules p);
end $$;

create function public.admin_stats() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    perform private.expire_credits(null);
    return jsonb_build_object(
        'users', (select count(*) from public.credit_accounts),
        'active_users_30d', (select count(distinct user_id) from public.jobs where created_at > now() - interval '30 days'),
        'credits_outstanding', (select coalesce(sum(balance), 0) from public.credit_accounts),
        'credits_sold_30d', (select coalesce(sum(amount), 0) from public.credit_ledger
                             where kind in ('purchase', 'grant') and created_at > now() - interval '30 days'),
        'credits_used_30d', (select coalesce(-sum(amount), 0) from public.credit_ledger
                             where kind = 'charge' and created_at > now() - interval '30 days'),
        'credits_expired_30d', (select coalesce(-sum(amount), 0) from public.credit_ledger
                                where kind = 'expiry' and created_at > now() - interval '30 days'),
        'jobs_30d', (select count(*) from public.jobs where created_at > now() - interval '30 days'),
        'expiring_7d', (select coalesce(sum(remaining), 0) from public.credit_lots
                        where remaining > 0 and expires_at between now() and now() + interval '7 days'),
        'pricing', (select jsonb_agg(to_jsonb(p) order by p.unit) from public.pricing_rules p)
    );
end $$;

-- ---------------------------------------------------------------- function privileges

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.grant_credits(uuid, bigint, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, bigint, text, text, text, text, timestamptz) to service_role;

revoke all on function public.my_credits() from public, anon;
grant execute on function public.my_credits() to authenticated;

revoke all on function public.am_i_admin() from public, anon;
revoke all on function public.admin_list_users(text, integer, integer) from public, anon;
revoke all on function public.admin_user_detail(uuid) from public, anon;
revoke all on function public.admin_grant_credits(uuid, bigint, integer, text, text) from public, anon;
revoke all on function public.admin_remove_credits(uuid, bigint, text, text) from public, anon;
revoke all on function public.admin_set_disabled(uuid, boolean) from public, anon;
revoke all on function public.admin_refund_charge(bigint, text) from public, anon;
revoke all on function public.admin_set_price(text, integer) from public, anon;
revoke all on function public.admin_stats() from public, anon;
-- Callable by signed-in users; each one checks private.admins first.
grant execute on function public.am_i_admin() to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_grant_credits(uuid, bigint, integer, text, text) to authenticated;
grant execute on function public.admin_remove_credits(uuid, bigint, text, text) to authenticated;
grant execute on function public.admin_set_disabled(uuid, boolean) to authenticated;
grant execute on function public.admin_refund_charge(bigint, text) to authenticated;
grant execute on function public.admin_set_price(text, integer) to authenticated;
grant execute on function public.admin_stats() to authenticated;
