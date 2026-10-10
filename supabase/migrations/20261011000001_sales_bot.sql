-- Sales bot: WhatsApp conversations, orders with unique amounts, payment
-- notifications from the owner's phone, automatic or owner-approved fulfilment.
-- Plan: docs/AUTOMATION_PLAN_AR.md. Code: supabase/functions/sales-bot/.
--
-- Security model
--   * Every bot_* table has RLS on and NO policies, and anon/authenticated have
--     no privileges: only service_role (the sales-bot Edge Function) reads/writes.
--   * bot_* functions are executable by service_role only.
--   * admin_bot_* functions are for the dashboard: authenticated + private.require_admin().
--   * Money decisions are made here, in SQL, atomically: an order is paid only by
--     an exact unique-amount match with a trusted payment notification, or by the owner.
--   * This file has no destructive statements, so it can be applied through the
--     Supabase connector.

-- ---------------------------------------------------------------- tables

create table public.bot_packages (
    id bigint generated always as identity primary key,
    code text not null unique check (code ~ '^[a-z0-9_]{2,32}$'),
    name text not null check (length(name) between 1 and 24),          -- WhatsApp list row title limit
    credits integer not null check (credits between 1 and 1000000),
    valid_days integer not null check (valid_days between 1 and 3660),
    price_egp integer not null check (price_egp between 1 and 1000000),
    active boolean not null default true,
    sort integer not null default 0,
    updated_at timestamptz not null default now()
);

create table public.bot_contacts (
    id bigint generated always as identity primary key,
    wa_id text not null unique check (wa_id ~ '^[0-9]{6,20}$'),
    name text,
    source text,
    user_id uuid,                                  -- linked after a paid order (no FK: users may be removed from Auth)
    state text not null default 'idle',
    state_data jsonb not null default '{}'::jsonb,
    human_until timestamptz,                       -- bot silent for this contact until then
    blocked boolean not null default false,
    ref_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
    referred_by bigint references public.bot_contacts (id),
    first_seen_at timestamptz not null default now(),
    last_inbound_at timestamptz,
    updated_at timestamptz not null default now()
);
create index bot_contacts_user on public.bot_contacts (user_id);

create table public.bot_messages (
    id bigint generated always as identity primary key,
    contact_id bigint not null references public.bot_contacts (id),
    direction text not null check (direction in ('in', 'out')),
    kind text not null,
    body text,
    wa_message_id text unique,
    created_at timestamptz not null default now()
);
create index bot_messages_contact on public.bot_messages (contact_id, created_at desc);
create index bot_messages_created on public.bot_messages (created_at);

create table public.bot_orders (
    id bigint generated always as identity primary key,
    code text not null unique,
    contact_id bigint not null references public.bot_contacts (id),
    package_id bigint not null references public.bot_packages (id),
    kind text not null check (kind in ('new', 'renewal')),
    email text not null,
    user_id uuid,
    credits integer not null,
    valid_days integer not null,
    price_egp integer not null,
    amount_due numeric(12, 2) not null check (amount_due > 0),
    status text not null default 'awaiting_payment'
        check (status in ('awaiting_payment', 'paid', 'fulfilling', 'fulfilled', 'rejected', 'expired', 'cancelled')),
    claimed_at timestamptz,
    claim jsonb,
    claim_media_id text,
    payment_event_id bigint,
    approved_by text,
    paid_at timestamptz,
    fulfill_started_at timestamptz,
    fulfilled_at timestamptz,
    credentials_sent boolean not null default false,
    note text,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);
-- The heart of payment matching: no two open orders can expect the same amount.
create unique index bot_orders_open_amount on public.bot_orders (amount_due) where status = 'awaiting_payment';
create index bot_orders_contact on public.bot_orders (contact_id, created_at desc);
create index bot_orders_status on public.bot_orders (status, created_at desc);

create table public.bot_payment_events (
    id bigint generated always as identity primary key,
    channel text not null check (channel in ('vodafone_cash', 'instapay', 'bank', 'unknown')),
    sender text,
    trusted boolean not null,                      -- sender is on the allow-list (set by the function)
    amount numeric(12, 2),
    payer text,
    reference text,
    raw_text text not null check (length(raw_text) <= 2000),
    fingerprint text not null unique,
    order_id bigint references public.bot_orders (id),
    status text not null default 'unmatched' check (status in ('matched', 'unmatched', 'ignored')),
    received_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);
create unique index bot_payment_events_ref on public.bot_payment_events (channel, reference) where reference is not null;
alter table public.bot_orders add constraint bot_orders_payment_event
    foreign key (payment_event_id) references public.bot_payment_events (id);

create table public.bot_settings (
    key text primary key check (key ~ '^[a-z0-9_]{1,40}$'),
    value jsonb not null,
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- privileges

alter table public.bot_packages enable row level security;
alter table public.bot_contacts enable row level security;
alter table public.bot_messages enable row level security;
alter table public.bot_orders enable row level security;
alter table public.bot_payment_events enable row level security;
alter table public.bot_settings enable row level security;

revoke all on public.bot_packages, public.bot_contacts, public.bot_messages, public.bot_orders,
              public.bot_payment_events, public.bot_settings from public, anon, authenticated;
grant select, insert, update on public.bot_packages, public.bot_contacts, public.bot_messages, public.bot_orders,
              public.bot_payment_events, public.bot_settings to service_role;

-- ---------------------------------------------------------------- defaults (dummy data; edit from the dashboard)

insert into public.bot_packages (code, name, credits, valid_days, price_egp, sort) values
    ('trial',   'تجربة - 20 تصميم',     20,   7,   50, 1),
    ('basic',   'أساسي - 100 تصميم',    100,  30,  200, 2),
    ('pro',     'محترف - 300 تصميم',    300,  30,  500, 3),
    ('agency',  'وكالة - 1000 تصميم',   1000, 30, 1500, 4)
on conflict (code) do nothing;

insert into public.bot_settings (key, value) values
    ('paused', 'false'),
    ('auto_approve', 'true'),
    ('instapay_address', '"elbadawi@instapay"'),
    ('vodafone_cash_number', '"01069942554"'),
    ('timezone', '"Africa/Cairo"'),
    ('work_hours', '{"start": 10, "end": 22}'),
    ('reply_sla', '"خلال ساعتين أو تلاتة"'),
    ('demo_url', '"https://example.com/elzoz-demo"'),
    ('install_url', '"https://example.com/elzoz-install"'),
    ('download_url', '""'),
    ('ccx_path', '"elzoz.ccx"'),
    ('order_ttl_hours', '24'),
    ('max_orders_per_day', '5'),
    ('referral_bonus_credits', '10'),
    ('report_hour', '22'),
    ('last_report_date', '""'),
    ('faq', '[
        {"q": "البلجن بيشتغل على أنهي فوتوشوب؟", "a": "Photoshop 2023 (23.3) أو أحدث، والأفضل 24.2 أو أحدث، على ويندوز أو ماك."},
        {"q": "الكريدت بيتحسب إزاي؟", "a": "كل تصميم ناجح = 1 كريدت. الفيديو = 1 كريدت لكل 5 ثواني. التصميم اللي يفشل مش بيتحسب."},
        {"q": "الكريدت بيخلص إمتى؟", "a": "كل باقة ليها مدة (مثلاً 30 يوم). الكريدت اللي ما يتستخدمش في المدة بيخلص. لو جددت قبلها، الجديد بيتضاف."},
        {"q": "ينفع أستخدم الحساب على أكتر من جهاز؟", "a": "الحساب لشخص واحد. لو محتاج كذا مصمم، كلمنا على باقة الوكالات."},
        {"q": "بيشتغل بالعربي؟", "a": "أيوه، الواجهة عربي وإنجليزي، والنصوص العربي بتتكتب في التصميم عادي."},
        {"q": "ممكن أجرب الأول؟", "a": "اطلب باقة التجربة، أو اطلب المعاينة المجانية جوه البلجن قبل ما تصرف كريدت."}
    ]')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- helpers

create function private.bot_setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
    select value from public.bot_settings where key = p_key;
$$;

create function private.bot_account(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
    select case when p_user is null then null else jsonb_build_object(
        'user_id', p_user,
        'email', (select email from auth.users where id = p_user),
        'available', (select balance - reserved from public.credit_accounts where user_id = p_user),
        'disabled', (select disabled from public.credit_accounts where user_id = p_user),
        'next_expiry', (select min(expires_at) from public.credit_lots where user_id = p_user and remaining > 0 and expires_at > now())
    ) end;
$$;

-- ---------------------------------------------------------------- bot RPCs (service_role only)

-- Create or refresh a contact on every inbound message. The first message may carry a
-- source tag like "[IG-BIO]" or a referral "[REF-AB12CD]" (data only: never grants access).
create function public.bot_touch_contact(p_wa_id text, p_name text, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    c public.bot_contacts%rowtype;
    is_new boolean := false;
    tag text := upper(substring(coalesce(p_text, '') from '\[([A-Za-z0-9-]{2,24})\]'));
    ref_id bigint;
begin
    select * into c from public.bot_contacts where wa_id = p_wa_id for update;
    if not found then
        if tag like 'REF-%' then
            select id into ref_id from public.bot_contacts where ref_code = substr(tag, 5);
        end if;
        insert into public.bot_contacts (wa_id, name, source, referred_by)
            values (p_wa_id, left(p_name, 80), coalesce(tag, 'direct'), ref_id)
            on conflict (wa_id) do nothing;
        select * into c from public.bot_contacts where wa_id = p_wa_id for update;
        is_new := true;
    end if;
    update public.bot_contacts
       set last_inbound_at = now(), updated_at = now(), name = coalesce(left(p_name, 80), name)
     where id = c.id
    returning * into c;
    return to_jsonb(c) || jsonb_build_object('is_new', is_new, 'account', private.bot_account(c.user_id));
end $$;

-- Log an inbound message. Returns fresh=false for a WhatsApp retry of the same message,
-- and how many messages this contact sent in the last minute (flood protection).
create function public.bot_log_in(p_contact bigint, p_wa_message_id text, p_kind text, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    new_id bigint;
    recent integer;
begin
    insert into public.bot_messages (contact_id, direction, kind, body, wa_message_id)
        values (p_contact, 'in', left(p_kind, 20), left(p_body, 4000), p_wa_message_id)
        on conflict (wa_message_id) do nothing
        returning id into new_id;
    select count(*) into recent from public.bot_messages
        where contact_id = p_contact and direction = 'in' and created_at > now() - interval '1 minute';
    return jsonb_build_object('fresh', new_id is not null, 'recent', recent);
end $$;

create function public.bot_find_user(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
    select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

-- New order with an amount no other open order expects: price minus a small discount
-- (at most 10% and 30 EGP). The partial unique index makes a race impossible.
create function public.bot_create_order(p_contact bigint, p_package text, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    c public.bot_contacts%rowtype;
    p public.bot_packages%rowtype;
    email_ text := lower(trim(coalesce(p_email, '')));
    uid uuid;
    max_k integer;
    amt numeric(12, 2);
    code_ text;
    o public.bot_orders%rowtype;
    ttl integer := coalesce((private.bot_setting('order_ttl_hours'))::text::integer, 24);
    per_day integer := coalesce((private.bot_setting('max_orders_per_day'))::text::integer, 5);
begin
    if email_ !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(email_) > 254 then
        raise exception 'invalid_email' using errcode = '22023';
    end if;
    select * into c from public.bot_contacts where id = p_contact for update;
    if not found or c.blocked then
        raise exception 'contact_unavailable' using errcode = 'P0001';
    end if;
    select * into p from public.bot_packages where code = p_package and active;
    if not found then
        raise exception 'package_unavailable' using errcode = 'P0001';
    end if;
    if (select count(*) from public.bot_orders where contact_id = p_contact and created_at > now() - interval '1 day') >= per_day then
        raise exception 'too_many_orders' using errcode = 'P0001';
    end if;

    -- One open order per contact: a new request replaces the previous unpaid one.
    update public.bot_orders set status = 'cancelled', note = 'replaced by a newer order'
     where contact_id = p_contact and status = 'awaiting_payment';

    uid := public.bot_find_user(email_);

    perform pg_advisory_xact_lock(hashtext('elzoz_bot_amounts'));
    max_k := least(30, floor(p.price_egp * 0.10)::integer);
    select p.price_egp - k into amt
      from generate_series(0, max_k) k
     where not exists (select 1 from public.bot_orders where status = 'awaiting_payment' and amount_due = p.price_egp - k)
     order by k limit 1;
    if amt is null then
        raise exception 'no_amount_slot' using errcode = 'P0001';
    end if;

    loop
        code_ := 'EZ-' || lpad((floor(random() * 900000) + 100000)::integer::text, 6, '0');
        exit when not exists (select 1 from public.bot_orders where code = code_);
    end loop;

    insert into public.bot_orders (code, contact_id, package_id, kind, email, user_id, credits, valid_days, price_egp,
                                   amount_due, expires_at)
        values (code_, p_contact, p.id, case when uid is null then 'new' else 'renewal' end, email_, uid,
                p.credits, p.valid_days, p.price_egp, amt, now() + make_interval(hours => ttl))
        returning * into o;
    return to_jsonb(o) || jsonb_build_object('package_name', p.name);
end $$;

-- A payment notification forwarded from the owner's phone. Stored once (fingerprint and
-- transaction reference are unique). A trusted notification whose amount equals exactly one
-- open order pays that order, when auto-approval is on.
create function public.bot_record_payment(p_channel text, p_sender text, p_trusted boolean, p_amount numeric,
                                          p_payer text, p_reference text, p_raw_text text, p_fingerprint text,
                                          p_received_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    eid bigint;
    o public.bot_orders%rowtype;
    auto_ boolean := coalesce((private.bot_setting('auto_approve'))::text::boolean, true);
    late public.bot_orders%rowtype;
begin
    insert into public.bot_payment_events (channel, sender, trusted, amount, payer, reference, raw_text, fingerprint, received_at)
        values (p_channel, left(p_sender, 120), p_trusted, p_amount, left(p_payer, 120), left(p_reference, 80),
                left(p_raw_text, 2000), p_fingerprint, coalesce(p_received_at, now()))
        on conflict do nothing
        returning id into eid;
    if eid is null then
        return jsonb_build_object('duplicate', true);
    end if;
    if not p_trusted or p_amount is null or p_amount <= 0 then
        return jsonb_build_object('event_id', eid, 'matched', false, 'reason', 'untrusted_or_no_amount');
    end if;

    select * into o from public.bot_orders
     where status = 'awaiting_payment' and amount_due = p_amount
     for update;
    if found then
        if not auto_ then
            return jsonb_build_object('event_id', eid, 'matched', false, 'reason', 'auto_approve_off', 'candidate', o.code);
        end if;
        update public.bot_orders
           set status = 'paid', paid_at = now(), payment_event_id = eid, approved_by = 'auto'
         where id = o.id returning * into o;
        update public.bot_payment_events set status = 'matched', order_id = o.id where id = eid;
        return jsonb_build_object('event_id', eid, 'matched', true, 'order', to_jsonb(o));
    end if;

    -- Paid after the order expired: never automatic (the amount may have been reused).
    select * into late from public.bot_orders
     where status = 'expired' and amount_due = p_amount and expires_at > now() - interval '2 days'
     order by expires_at desc limit 1;
    return jsonb_build_object('event_id', eid, 'matched', false, 'reason', 'no_open_order',
                              'late_candidate', case when late.id is null then null else late.code end);
end $$;

-- Owner approval (Telegram or dashboard): open, claimed or expired orders become paid.
create function public.bot_mark_paid(p_code text, p_by text, p_event bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.bot_orders%rowtype;
begin
    update public.bot_orders
       set status = 'paid', paid_at = now(), approved_by = left(p_by, 120),
           payment_event_id = coalesce(p_event, payment_event_id)
     where code = upper(p_code) and status in ('awaiting_payment', 'expired')
     returning * into o;
    if not found then
        select * into o from public.bot_orders where code = upper(p_code);
        return jsonb_build_object('changed', false, 'status', o.status);
    end if;
    if p_event is not null then
        update public.bot_payment_events set status = 'matched', order_id = o.id where id = p_event and order_id is null;
    end if;
    return jsonb_build_object('changed', true, 'order', to_jsonb(o));
end $$;

create function public.bot_reject(p_code text, p_by text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.bot_orders%rowtype;
begin
    update public.bot_orders
       set status = 'rejected', approved_by = left(p_by, 120), note = left(p_reason, 300)
     where code = upper(p_code) and status in ('awaiting_payment', 'expired')
     returning * into o;
    if not found then
        select * into o from public.bot_orders where code = upper(p_code);
        return jsonb_build_object('changed', false, 'status', o.status);
    end if;
    return jsonb_build_object('changed', true, 'order', to_jsonb(o));
end $$;

-- Take a paid order for fulfilment (one worker wins; a stuck one is retried after 10 minutes).
create function public.bot_begin_fulfillment(p_order bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.bot_orders%rowtype;
begin
    update public.bot_orders set status = 'fulfilling', fulfill_started_at = now()
     where id = p_order
       and (status = 'paid' or (status = 'fulfilling' and fulfill_started_at < now() - interval '10 minutes'))
     returning * into o;
    if not found then
        return null;
    end if;
    return to_jsonb(o) || jsonb_build_object(
        'wa_id', (select wa_id from public.bot_contacts where id = o.contact_id),
        'package_name', (select name from public.bot_packages where id = o.package_id));
end $$;

-- Credits + link + done, in one transaction. Idempotent: the ledger reference is the order code.
-- Pays the referral bonus once, on the referred contact's first fulfilled order.
create function public.bot_finish_fulfillment(p_order bigint, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    o public.bot_orders%rowtype;
    grant_ jsonb;
    c public.bot_contacts%rowtype;
    ref public.bot_contacts%rowtype;
    bonus integer := coalesce((private.bot_setting('referral_bonus_credits'))::text::integer, 0);
    referral jsonb := null;
begin
    select * into o from public.bot_orders where id = p_order for update;
    if not found or o.status not in ('fulfilling', 'fulfilled') then
        raise exception 'order_not_fulfilling' using errcode = 'P0001';
    end if;
    grant_ := public.grant_credits(p_user, o.credits, 'purchase', o.code, 'bot',
                                   'WhatsApp order ' || o.code || ' (' || o.amount_due || ' EGP)',
                                   now() + make_interval(days => o.valid_days));
    update public.bot_orders set status = 'fulfilled', fulfilled_at = coalesce(fulfilled_at, now()), user_id = p_user
     where id = o.id returning * into o;
    update public.bot_contacts set user_id = p_user, updated_at = now() where id = o.contact_id returning * into c;

    if bonus > 0 and c.referred_by is not null
       and (select count(*) from public.bot_orders where contact_id = c.id and status = 'fulfilled') = 1 then
        select * into ref from public.bot_contacts where id = c.referred_by;
        if ref.user_id is not null then
            perform public.grant_credits(ref.user_id, bonus, 'grant', 'referral-' || o.code, 'bot',
                                         'Referral bonus for ' || o.code, now() + interval '30 days');
            referral := jsonb_build_object('wa_id', ref.wa_id, 'credits', bonus);
        end if;
    end if;
    return jsonb_build_object('order', to_jsonb(o), 'grant', grant_, 'referral', referral,
                              'account', private.bot_account(p_user));
end $$;

-- Called every few minutes by the function's cron route.
create function public.bot_cron_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    expired jsonb;
    to_fulfill jsonb;
    tz text := coalesce(private.bot_setting('timezone') #>> '{}', 'Africa/Cairo');
    local_now timestamp := now() at time zone tz;
    report_hour integer := coalesce((private.bot_setting('report_hour'))::text::integer, 22);
    last_report text := coalesce(private.bot_setting('last_report_date') #>> '{}', '');
    report jsonb := null;
begin
    with e as (
        update public.bot_orders set status = 'expired'
         where status = 'awaiting_payment' and expires_at < now()
        returning code, contact_id, amount_due
    ) select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into expired from e;

    select coalesce(jsonb_agg(id), '[]'::jsonb) into to_fulfill from public.bot_orders
     where status = 'paid' or (status = 'fulfilling' and fulfill_started_at < now() - interval '10 minutes');

    if extract(hour from local_now) >= report_hour and last_report <> to_char(local_now, 'YYYY-MM-DD') then
        update public.bot_settings set value = to_jsonb(to_char(local_now, 'YYYY-MM-DD')), updated_at = now()
         where key = 'last_report_date';
        report := public.bot_report(now() - interval '1 day');
    end if;
    return jsonb_build_object('expired', expired, 'to_fulfill', to_fulfill, 'report', report);
end $$;

create function public.bot_report(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
    select jsonb_build_object(
        'new_contacts', (select count(*) from public.bot_contacts where first_seen_at > p_since),
        'orders_created', (select count(*) from public.bot_orders where created_at > p_since),
        'sales', (select count(*) from public.bot_orders where fulfilled_at > p_since),
        'revenue', (select coalesce(sum(amount_due), 0) from public.bot_orders where fulfilled_at > p_since),
        'auto_approved', (select count(*) from public.bot_orders where fulfilled_at > p_since and approved_by = 'auto'),
        'waiting_owner', (select coalesce(jsonb_agg(code), '[]'::jsonb) from public.bot_orders
                           where status = 'awaiting_payment' and claimed_at is not null),
        'unmatched_payments', (select count(*) from public.bot_payment_events where status = 'unmatched' and trusted and created_at > p_since),
        'expiring_3d', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                            select u.email, min(l.expires_at) as expires_at
                              from public.credit_lots l join auth.users u on u.id = l.user_id
                             where l.remaining > 0 and l.expires_at between now() and now() + interval '3 days'
                             group by u.email order by 2 limit 15) x),
        'inactive_new', (select coalesce(jsonb_agg(o.email), '[]'::jsonb) from public.bot_orders o
                          where o.kind = 'new' and o.status = 'fulfilled'
                            and o.fulfilled_at between now() - interval '7 days' and now() - interval '1 day'
                            and not exists (select 1 from public.jobs j where j.user_id = o.user_id))
    );
$$;

-- The cron route proves it was called by pg_cron with a key that only lives in Vault.
create function public.bot_cron_key_ok(p_key text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare k text;
begin
    if p_key is null or length(p_key) < 32 or to_regclass('vault.decrypted_secrets') is null then
        return false;
    end if;
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into k using 'elzoz_bot_cron_key';
    return k is not null and k = p_key;
end $$;

-- pg_cron -> pg_net -> sales-bot/cron. URL and key come from Vault (set up once per project:
-- supabase/manual/sales-bot-live.sql). Does nothing until both exist.
create function private.bot_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare u text; k text;
begin
    if to_regclass('vault.decrypted_secrets') is null then
        return;
    end if;
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into u using 'elzoz_bot_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into k using 'elzoz_bot_cron_key';
    if u is null or k is null then
        return;
    end if;
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 25000)'
        using u || '/cron', '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', k);
end $$;

-- ---------------------------------------------------------------- admin RPCs (dashboard)

create function public.admin_bot_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return public.bot_report(now() - interval '1 day') || jsonb_build_object(
        'paused', private.bot_setting('paused'),
        'open_orders', (select count(*) from public.bot_orders where status = 'awaiting_payment'),
        'contacts_total', (select count(*) from public.bot_contacts));
end $$;

create function public.admin_bot_orders(p_status text default null, p_search text default null, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q text := nullif(trim(coalesce(p_search, '')), '');
begin
    perform private.require_admin();
    return (select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) from (
        select o.id, o.code, o.kind, o.email, o.status, o.amount_due, o.price_egp, o.credits, o.valid_days,
               o.approved_by, o.claimed_at, o.claim, o.paid_at, o.fulfilled_at, o.created_at, o.expires_at, o.note,
               o.credentials_sent, c.wa_id, c.name as contact_name, p.name as package_name
          from public.bot_orders o
          join public.bot_contacts c on c.id = o.contact_id
          join public.bot_packages p on p.id = o.package_id
         where (p_status is null or o.status = p_status)
           and (q is null or o.code ilike '%' || q || '%' or o.email ilike '%' || q || '%' or c.wa_id like '%' || q || '%')
         order by o.created_at desc
         limit least(greatest(p_limit, 1), 200)) r);
end $$;

create function public.admin_bot_contacts(p_search text default null, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q text := nullif(trim(coalesce(p_search, '')), '');
begin
    perform private.require_admin();
    return (select coalesce(jsonb_agg(r order by r.last_inbound_at desc nulls last), '[]'::jsonb) from (
        select c.id, c.wa_id, c.name, c.source, c.state, c.human_until, c.blocked, c.ref_code, c.first_seen_at, c.last_inbound_at,
               (select email from auth.users where id = c.user_id) as email,
               (select count(*) from public.bot_orders o where o.contact_id = c.id and o.status = 'fulfilled') as paid_orders,
               (select body from public.bot_messages m where m.contact_id = c.id and m.direction = 'in' order by m.id desc limit 1) as last_message
          from public.bot_contacts c
         where q is null or c.wa_id like '%' || q || '%' or c.name ilike '%' || q || '%' or c.source ilike '%' || q || '%'
         order by c.last_inbound_at desc nulls last
         limit least(greatest(p_limit, 1), 200)) r);
end $$;

create function public.admin_bot_payments(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return (select coalesce(jsonb_agg(r order by r.id desc), '[]'::jsonb) from (
        select e.id, e.channel, e.sender, e.trusted, e.amount, e.payer, e.reference, e.status, e.received_at, e.raw_text,
               (select code from public.bot_orders o where o.id = e.order_id) as order_code
          from public.bot_payment_events e order by e.id desc limit least(greatest(p_limit, 1), 200)) r);
end $$;

-- Approve from the dashboard: the order becomes paid; the bot fulfils it on its next run (within 5 minutes).
create function public.admin_bot_approve(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_admin();
begin
    return public.bot_mark_paid(p_code, private.admin_actor(uid));
end $$;

create function public.admin_bot_reject(p_code text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_admin();
begin
    return public.bot_reject(p_code, private.admin_actor(uid), p_reason);
end $$;

create function public.admin_bot_packages() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return (select coalesce(jsonb_agg(to_jsonb(p) order by p.sort, p.id), '[]'::jsonb) from public.bot_packages p);
end $$;

create function public.admin_bot_save_package(p_code text, p_name text, p_credits integer, p_valid_days integer,
                                              p_price_egp integer, p_active boolean, p_sort integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.bot_packages%rowtype;
begin
    perform private.require_admin();
    insert into public.bot_packages (code, name, credits, valid_days, price_egp, active, sort)
        values (lower(trim(p_code)), trim(p_name), p_credits, p_valid_days, p_price_egp, coalesce(p_active, true), coalesce(p_sort, 0))
        on conflict (code) do update set name = excluded.name, credits = excluded.credits, valid_days = excluded.valid_days,
            price_egp = excluded.price_egp, active = excluded.active, sort = excluded.sort, updated_at = now()
        returning * into p;
    return to_jsonb(p);
end $$;

create function public.admin_bot_settings() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.bot_settings);
end $$;

create function public.admin_bot_set_setting(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    if p_key not in ('paused', 'auto_approve', 'instapay_address', 'vodafone_cash_number', 'work_hours', 'reply_sla',
                     'demo_url', 'install_url', 'download_url', 'ccx_path', 'order_ttl_hours', 'max_orders_per_day',
                     'referral_bonus_credits', 'report_hour', 'faq', 'timezone') then
        raise exception 'unknown_setting' using errcode = '22023';
    end if;
    insert into public.bot_settings (key, value) values (p_key, p_value)
        on conflict (key) do update set value = excluded.value, updated_at = now();
    return jsonb_build_object('key', p_key, 'value', p_value);
end $$;

-- Hand a contact back to the bot, or block/unblock them.
create function public.admin_bot_contact_update(p_contact bigint, p_blocked boolean default null, p_release boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.bot_contacts%rowtype;
begin
    perform private.require_admin();
    update public.bot_contacts
       set blocked = coalesce(p_blocked, blocked),
           human_until = case when p_release then null else human_until end,
           state = case when p_release then 'idle' else state end,
           updated_at = now()
     where id = p_contact returning * into c;
    return to_jsonb(c);
end $$;

-- ---------------------------------------------------------------- function privileges

revoke all on function private.bot_setting(text) from public, anon, authenticated;
revoke all on function private.bot_account(uuid) from public, anon, authenticated;
revoke all on function private.bot_tick() from public, anon, authenticated;

revoke all on function public.bot_touch_contact(text, text, text) from public, anon, authenticated;
revoke all on function public.bot_log_in(bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.bot_find_user(text) from public, anon, authenticated;
revoke all on function public.bot_create_order(bigint, text, text) from public, anon, authenticated;
revoke all on function public.bot_record_payment(text, text, boolean, numeric, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.bot_mark_paid(text, text, bigint) from public, anon, authenticated;
revoke all on function public.bot_reject(text, text, text) from public, anon, authenticated;
revoke all on function public.bot_begin_fulfillment(bigint) from public, anon, authenticated;
revoke all on function public.bot_finish_fulfillment(bigint, uuid) from public, anon, authenticated;
revoke all on function public.bot_cron_tick() from public, anon, authenticated;
revoke all on function public.bot_report(timestamptz) from public, anon, authenticated;
revoke all on function public.bot_cron_key_ok(text) from public, anon, authenticated;

grant execute on function public.bot_touch_contact(text, text, text) to service_role;
grant execute on function public.bot_log_in(bigint, text, text, text) to service_role;
grant execute on function public.bot_find_user(text) to service_role;
grant execute on function public.bot_create_order(bigint, text, text) to service_role;
grant execute on function public.bot_record_payment(text, text, boolean, numeric, text, text, text, text, timestamptz) to service_role;
grant execute on function public.bot_mark_paid(text, text, bigint) to service_role;
grant execute on function public.bot_reject(text, text, text) to service_role;
grant execute on function public.bot_begin_fulfillment(bigint) to service_role;
grant execute on function public.bot_finish_fulfillment(bigint, uuid) to service_role;
grant execute on function public.bot_cron_tick() to service_role;
grant execute on function public.bot_report(timestamptz) to service_role;
grant execute on function public.bot_cron_key_ok(text) to service_role;

revoke all on function public.admin_bot_overview() from public, anon;
revoke all on function public.admin_bot_orders(text, text, integer) from public, anon;
revoke all on function public.admin_bot_contacts(text, integer) from public, anon;
revoke all on function public.admin_bot_payments(integer) from public, anon;
revoke all on function public.admin_bot_approve(text) from public, anon;
revoke all on function public.admin_bot_reject(text, text) from public, anon;
revoke all on function public.admin_bot_packages() from public, anon;
revoke all on function public.admin_bot_save_package(text, text, integer, integer, integer, boolean, integer) from public, anon;
revoke all on function public.admin_bot_settings() from public, anon;
revoke all on function public.admin_bot_set_setting(text, jsonb) from public, anon;
revoke all on function public.admin_bot_contact_update(bigint, boolean, boolean) from public, anon;

grant execute on function public.admin_bot_overview() to authenticated;
grant execute on function public.admin_bot_orders(text, text, integer) to authenticated;
grant execute on function public.admin_bot_contacts(text, integer) to authenticated;
grant execute on function public.admin_bot_payments(integer) to authenticated;
grant execute on function public.admin_bot_approve(text) to authenticated;
grant execute on function public.admin_bot_reject(text, text) to authenticated;
grant execute on function public.admin_bot_packages() to authenticated;
grant execute on function public.admin_bot_save_package(text, text, integer, integer, integer, boolean, integer) to authenticated;
grant execute on function public.admin_bot_settings() to authenticated;
grant execute on function public.admin_bot_set_setting(text, jsonb) to authenticated;
grant execute on function public.admin_bot_contact_update(bigint, boolean, boolean) to authenticated;
