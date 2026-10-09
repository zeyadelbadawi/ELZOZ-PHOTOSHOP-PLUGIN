-- Elzoz credits: server-authoritative balances, reservations and an append-only ledger.
--
-- Access model
--   * Clients (anon/authenticated) cannot INSERT/UPDATE/DELETE any table.
--   * authenticated may SELECT only its own rows (RLS).
--   * All mutations go through SECURITY DEFINER functions with search_path = ''.
--   * Purchases, grants, refunds and adjustments are service_role only.
--
-- Billing rules (see docs/PLAN.md §2.2)
--   * start_job reserves the cost of every planned item; nothing is charged yet.
--   * report_item('succeeded') charges that item once; 'failed' releases it.
--   * finish_job / expiry release whatever was not reported.

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------- tables

create table public.pricing_rules (
    unit text primary key check (unit in ('design', 'video_5s')),
    price integer not null check (price >= 0),
    -- video: multiplier applied when the long edge is above hd_long_edge pixels
    hd_long_edge integer not null default 1920,
    hd_multiplier integer not null default 2 check (hd_multiplier >= 1),
    updated_at timestamptz not null default now()
);
insert into public.pricing_rules (unit, price) values ('design', 1), ('video_5s', 1);

create table public.credit_accounts (
    user_id uuid primary key references auth.users (id) on delete cascade,
    balance bigint not null default 0 check (balance >= 0),
    reserved bigint not null default 0 check (reserved >= 0),
    updated_at timestamptz not null default now(),
    constraint reserved_within_balance check (reserved <= balance)
);

create table public.jobs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    kind text not null check (kind in ('design', 'video')),
    status text not null default 'active'
        check (status in ('active', 'completed', 'completed_with_errors', 'cancelled', 'failed', 'expired')),
    unit_price integer not null,
    planned_items integer not null check (planned_items > 0),
    reserved_total bigint not null check (reserved_total >= 0),
    charged_total bigint not null default 0 check (charged_total >= 0),
    client_info jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    heartbeat_at timestamptz not null default now(),
    expires_at timestamptz not null,
    finished_at timestamptz
);
create index jobs_user_active on public.jobs (user_id) where status = 'active';
create index jobs_expiring on public.jobs (expires_at) where status = 'active';

create table public.job_items (
    job_id uuid not null references public.jobs (id) on delete cascade,
    item_key text not null check (length(item_key) between 1 and 200),
    units integer not null check (units > 0),
    cost bigint not null check (cost >= 0),
    status text not null default 'reserved' check (status in ('reserved', 'succeeded', 'failed', 'released')),
    spec jsonb not null default '{}'::jsonb,
    evidence jsonb,
    reported_at timestamptz,
    primary key (job_id, item_key)
);

create table public.credit_ledger (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    kind text not null check (kind in ('purchase', 'grant', 'charge', 'refund', 'adjustment')),
    amount bigint not null check (amount <> 0),
    balance_after bigint not null check (balance_after >= 0),
    job_id uuid references public.jobs (id),
    item_key text,
    refund_of bigint unique references public.credit_ledger (id),
    reference text,
    actor text not null,
    note text,
    created_at timestamptz not null default now(),
    constraint charge_shape check (kind <> 'charge' or (amount < 0 and job_id is not null and item_key is not null)),
    constraint refund_shape check (kind <> 'refund' or (amount > 0 and refund_of is not null))
);
-- An item can be charged at most once, whatever happens upstream.
create unique index credit_ledger_one_charge_per_item on public.credit_ledger (job_id, item_key) where kind = 'charge';
create index credit_ledger_user on public.credit_ledger (user_id, created_at desc);
-- Purchases/grants with an external reference (e.g. payment id) are recorded once.
create unique index credit_ledger_reference on public.credit_ledger (kind, reference) where reference is not null and kind in ('purchase', 'grant');

create table private.idempotency_keys (
    user_id uuid not null,
    key text not null,
    fn text not null,
    request_hash text not null,
    response jsonb not null,
    created_at timestamptz not null default now(),
    primary key (user_id, key)
);

create table private.rate_limits (
    user_id uuid not null,
    bucket text not null,
    window_start timestamptz not null,
    count integer not null default 0,
    primary key (user_id, bucket, window_start)
);

-- Ledger is append-only for everyone, including service_role.
create function private.forbid_ledger_change() returns trigger
language plpgsql set search_path = '' as $$
begin
    raise exception 'credit_ledger is append-only' using errcode = '42501';
end $$;
create trigger credit_ledger_no_update before update or delete on public.credit_ledger
    for each row execute function private.forbid_ledger_change();
create trigger credit_ledger_no_truncate before truncate on public.credit_ledger
    for each statement execute function private.forbid_ledger_change();

-- ---------------------------------------------------------------- privileges & RLS

revoke all on public.pricing_rules, public.credit_accounts, public.jobs, public.job_items, public.credit_ledger from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
grant select on public.pricing_rules, public.credit_accounts, public.jobs, public.job_items, public.credit_ledger to authenticated;

alter table public.pricing_rules enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.jobs enable row level security;
alter table public.job_items enable row level security;
alter table public.credit_ledger enable row level security;

create policy "pricing readable" on public.pricing_rules for select to authenticated using (true);
create policy "own account" on public.credit_accounts for select to authenticated using (user_id = (select auth.uid()));
create policy "own jobs" on public.jobs for select to authenticated using (user_id = (select auth.uid()));
create policy "own job items" on public.job_items for select to authenticated
    using (exists (select 1 from public.jobs j where j.id = job_id and j.user_id = (select auth.uid())));
create policy "own ledger" on public.credit_ledger for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- helpers (private)

create function private.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
    if uid is null then
        raise exception 'not_authenticated' using errcode = '28000';
    end if;
    return uid;
end $$;

create function private.hit_rate_limit(p_user uuid, p_bucket text, p_max integer, p_window_seconds integer)
returns void language plpgsql set search_path = '' as $$
declare
    w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
    n integer;
begin
    insert into private.rate_limits as r (user_id, bucket, window_start, count)
    values (p_user, p_bucket, w, 1)
    on conflict (user_id, bucket, window_start) do update set count = r.count + 1
    returning count into n;
    if n > p_max then
        raise exception 'rate_limited' using errcode = 'P0001', detail = format('%s: max %s per %s s', p_bucket, p_max, p_window_seconds);
    end if;
end $$;

-- Returns the stored response for a replayed request, or null for a new one.
create function private.idempotent_lookup(p_user uuid, p_key text, p_fn text, p_hash text)
returns jsonb language plpgsql set search_path = '' as $$
declare rec record;
begin
    if p_key is null or length(p_key) < 8 or length(p_key) > 100 then
        raise exception 'invalid_idempotency_key' using errcode = '22023';
    end if;
    select * into rec from private.idempotency_keys where user_id = p_user and key = p_key;
    if not found then
        return null;
    end if;
    if rec.fn <> p_fn or rec.request_hash <> p_hash then
        raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    return rec.response;
end $$;

create function private.idempotent_store(p_user uuid, p_key text, p_fn text, p_hash text, p_response jsonb)
returns void language sql set search_path = '' as $$
    insert into private.idempotency_keys (user_id, key, fn, request_hash, response)
    values (p_user, p_key, p_fn, p_hash, p_response);
$$;

create function private.request_hash(p jsonb) returns text
language sql immutable set search_path = '' as $$
    select encode(sha256(convert_to(p::text, 'UTF8')), 'hex');
$$;

-- Release reservations of active jobs past their expiry. p_user null = all users.
-- Lock order matches the RPCs (account, then job) to avoid deadlocks.
create function private.expire_jobs(p_user uuid default null) returns integer
language plpgsql set search_path = '' as $$
declare
    cand record;
    released bigint;
    n integer := 0;
begin
    for cand in
        select id, user_id from public.jobs
        where status = 'active' and expires_at < now() and (p_user is null or user_id = p_user)
        order by user_id, id
    loop
        perform 1 from public.credit_accounts where user_id = cand.user_id for update;
        perform 1 from public.jobs where id = cand.id and status = 'active' and expires_at < now() for update;
        if not found then
            continue; -- reported or finished meanwhile
        end if;
        with r as (
            update public.job_items set status = 'released' where job_id = cand.id and status = 'reserved' returning cost
        ) select coalesce(sum(cost), 0) into released from r;
        update public.credit_accounts set reserved = reserved - released, updated_at = now() where user_id = cand.user_id;
        update public.jobs set status = 'expired', finished_at = now() where id = cand.id;
        n := n + 1;
    end loop;
    delete from private.rate_limits where window_start < now() - interval '1 day';
    return n;
end $$;

-- ---------------------------------------------------------------- account bootstrap

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into public.credit_accounts (user_id) values (new.id) on conflict do nothing;
    return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
    for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------- client RPCs

-- p_items: [{ "key": "row-2" }]                                    for kind 'design'
--          [{ "key": "row-2", "duration_ms": 6000, "width": 1080, "height": 1920 }] for 'video'
create function public.start_job(p_kind text, p_items jsonb, p_idempotency_key text, p_client_info jsonb default '{}'::jsonb)
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

    -- Lock the account row: concurrent start_job calls for one user serialize here.
    select * into acct from public.credit_accounts where user_id = uid for update;
    if not found then
        raise exception 'account_missing' using errcode = 'P0001';
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

create function public.report_item(p_job_id uuid, p_item_key text, p_status text, p_evidence jsonb, p_idempotency_key text)
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

    -- Lock order everywhere: account, then job, then item.
    perform 1 from public.credit_accounts where user_id = uid for update;
    select * into j from public.jobs where id = p_job_id and user_id = uid for update;
    if not found then
        raise exception 'job_not_found' using errcode = 'P0002';
    end if;
    if j.status = 'active' and j.expires_at < now() then
        -- Reservation already lapsed; the item can't be charged any more.
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

create function public.finish_job(p_job_id uuid, p_status text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    uid uuid := private.require_user();
    h text := private.request_hash(jsonb_build_object('job', p_job_id, 'status', p_status));
    prior jsonb;
    j public.jobs%rowtype;
    released bigint;
    bal bigint;
    response jsonb;
begin
    prior := private.idempotent_lookup(uid, p_idempotency_key, 'finish_job', h);
    if prior is not null then return prior; end if;
    perform private.hit_rate_limit(uid, 'finish_job', 60, 60);

    if p_status not in ('completed', 'completed_with_errors', 'cancelled', 'failed') then
        raise exception 'invalid_status' using errcode = '22023';
    end if;

    perform 1 from public.credit_accounts where user_id = uid for update;
    select * into j from public.jobs where id = p_job_id and user_id = uid for update;
    if not found then
        raise exception 'job_not_found' using errcode = 'P0002';
    end if;

    if j.status = 'active' then
        with r as (
            update public.job_items set status = 'released' where job_id = p_job_id and status = 'reserved' returning cost
        ) select coalesce(sum(cost), 0) into released from r;
        update public.credit_accounts set reserved = reserved - released, updated_at = now()
            where user_id = uid;
        update public.jobs set status = p_status, finished_at = now() where id = p_job_id
            returning * into j;
    else
        released := 0;
    end if;

    select balance into bal from public.credit_accounts where user_id = uid;
    response := jsonb_build_object('job_id', p_job_id, 'status', j.status, 'charged', j.charged_total,
                                   'released_now', released, 'balance', bal);
    perform private.idempotent_store(uid, p_idempotency_key, 'finish_job', h, response);
    return response;
end $$;

-- ---------------------------------------------------------------- service_role only

-- Purchases (payment webhook), promotional grants and manual adjustments.
create function public.grant_credits(p_user uuid, p_amount bigint, p_kind text, p_reference text, p_actor text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    acct public.credit_accounts%rowtype;
    bal bigint;
    entry_id bigint;
begin
    if p_kind not in ('purchase', 'grant', 'adjustment') then
        raise exception 'invalid_kind' using errcode = '22023';
    end if;
    if p_amount = 0 or (p_kind <> 'adjustment' and p_amount < 0) then
        raise exception 'invalid_amount' using errcode = '22023';
    end if;
    if p_actor is null or length(p_actor) = 0 then
        raise exception 'actor_required' using errcode = '22023';
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
    if acct.balance + p_amount < acct.reserved then
        raise exception 'adjustment_below_reserved' using errcode = 'P0001';
    end if;
    update public.credit_accounts set balance = balance + p_amount, updated_at = now()
        where user_id = p_user returning balance into bal;
    insert into public.credit_ledger (user_id, kind, amount, balance_after, reference, actor, note)
        values (p_user, p_kind, p_amount, bal, p_reference, p_actor, p_note) returning id into entry_id;
    return jsonb_build_object('ledger_id', entry_id, 'balance', bal);
end $$;

-- Refund one charge (e.g. support decided an output was defective).
create function public.refund_charge(p_ledger_id bigint, p_actor text, p_note text)
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
    -- refund_of is unique: a second refund of the same charge fails here.
    insert into public.credit_ledger (user_id, kind, amount, balance_after, job_id, item_key, refund_of, actor, note)
        values (c.user_id, 'refund', -c.amount, bal, c.job_id, c.item_key, c.id, p_actor, p_note) returning id into entry_id;
    return jsonb_build_object('ledger_id', entry_id, 'balance', bal);
end $$;

create function public.expire_stale_jobs() returns integer
language sql security definer set search_path = '' as $$
    select private.expire_jobs(null);
$$;

-- ---------------------------------------------------------------- function privileges

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.start_job(text, jsonb, text, jsonb) from public, anon;
revoke all on function public.report_item(uuid, text, text, jsonb, text) from public, anon;
revoke all on function public.finish_job(uuid, text, text) from public, anon;
revoke all on function public.grant_credits(uuid, bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function public.refund_charge(bigint, text, text) from public, anon, authenticated;
revoke all on function public.expire_stale_jobs() from public, anon, authenticated;

grant execute on function public.start_job(text, jsonb, text, jsonb) to authenticated;
grant execute on function public.report_item(uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.finish_job(uuid, text, text) to authenticated;
grant execute on function public.grant_credits(uuid, bigint, text, text, text, text) to service_role;
grant execute on function public.refund_charge(bigint, text, text) to service_role;
grant execute on function public.expire_stale_jobs() to service_role;
