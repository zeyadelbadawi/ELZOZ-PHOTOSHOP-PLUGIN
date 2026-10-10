-- Features 1, 2 and 4 (2026-10):
--  * plugin version: a minimum version (forced update) and the latest version, set from the dashboard
--  * devices: each account works on a limited number of computers; the client can move the account
--    to a new computer once every few days; the owner can unlink computers and change the limit
--  * expiring credits: a list for the owner, and WhatsApp reminders (manual and automatic)

-- ---------------------------------------------------------------- app config

create table public.app_config (
    key text primary key check (key ~ '^[a-z0-9_]{1,40}$'),
    value jsonb not null,
    updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from public, anon, authenticated;
grant select on public.app_config to service_role;

insert into public.app_config (key, value) values
    ('min_plugin_version', '"0.0.0"'),      -- older plugins must update before they can generate
    ('latest_plugin_version', '"0.0.0"'),   -- newer than the plugin's version: "an update is available"
    ('update_url', '""'),                   -- where to download it (the bot link by default in the plugin)
    ('update_message', '""'),               -- what's new, shown with the update
    ('device_limit', '2'),                  -- computers per account (per-account override in credit_accounts)
    ('device_switch_days', '7'),            -- a client can move the account to a new computer once per N days
    ('require_device_id', 'false')          -- true: plugins that don't send a device id can't generate
on conflict (key) do nothing;

create function private.app_setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
    select value from public.app_config where key = p_key;
$$;

-- Compare dotted versions ("1.10.2" > "1.9"); a suffix ("-beta") counts as before the release.
create function private.version_cmp(a text, b text) returns integer
language plpgsql immutable set search_path = '' as $$
declare
    pa text[] := regexp_split_to_array(split_part(coalesce(a, '0'), '-', 1), '\.');
    pb text[] := regexp_split_to_array(split_part(coalesce(b, '0'), '-', 1), '\.');
    i integer;
    x integer;
    y integer;
begin
    for i in 1 .. greatest(array_length(pa, 1), array_length(pb, 1)) loop
        x := coalesce(nullif(regexp_replace(coalesce(pa[i], '0'), '\D', '', 'g'), '')::integer, 0);
        y := coalesce(nullif(regexp_replace(coalesce(pb[i], '0'), '\D', '', 'g'), '')::integer, 0);
        if x <> y then return sign(x - y)::integer; end if;
    end loop;
    if position('-' in coalesce(a, '')) > 0 and position('-' in coalesce(b, '')) = 0 then return -1; end if;
    if position('-' in coalesce(b, '')) > 0 and position('-' in coalesce(a, '')) = 0 then return 1; end if;
    return 0;
end $$;

-- What any plugin (signed in or not) needs to know about updates.
create function public.plugin_config() returns jsonb
language sql stable security definer set search_path = '' as $$
    select jsonb_build_object(
        'min_version', private.app_setting('min_plugin_version') #>> '{}',
        'latest_version', private.app_setting('latest_plugin_version') #>> '{}',
        'update_url', private.app_setting('update_url') #>> '{}',
        'update_message', private.app_setting('update_message') #>> '{}');
$$;

-- ---------------------------------------------------------------- devices

alter table public.credit_accounts add column max_devices integer check (max_devices between 1 and 20);
alter table public.credit_accounts add column device_switched_at timestamptz;

create table public.user_devices (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    device_id text not null check (length(device_id) between 8 and 100),
    name text check (length(name) <= 120),
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    unlinked_at timestamptz,
    unlinked_by text,
    unique (user_id, device_id)
);
create index user_devices_active on public.user_devices (user_id) where unlinked_at is null;
alter table public.user_devices enable row level security;
revoke all on public.user_devices from public, anon, authenticated;

create function private.device_limit(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
    select coalesce((select max_devices from public.credit_accounts where user_id = p_user),
                    (private.app_setting('device_limit'))::text::integer, 2);
$$;

create function private.devices_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'first_seen', first_seen, 'last_seen', last_seen) order by last_seen desc), '[]'::jsonb)
      from public.user_devices where user_id = p_user and unlinked_at is null;
$$;

create function private.next_switch_at(p_user uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
    select a.device_switched_at + make_interval(days => coalesce((private.app_setting('device_switch_days'))::text::integer, 7))
      from public.credit_accounts a where a.user_id = p_user;
$$;

-- Device status for this computer; registers it when there is room. Never raises.
create function private.device_status(p_user uuid, p_device text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    d public.user_devices%rowtype;
    active integer;
    lim integer := private.device_limit(p_user);
    nxt timestamptz := private.next_switch_at(p_user);
begin
    if p_device is null or length(p_device) not between 8 and 100 then
        return jsonb_build_object('status', 'unknown');
    end if;
    select * into d from public.user_devices where user_id = p_user and device_id = p_device;
    if found and d.unlinked_at is null then
        update public.user_devices set last_seen = now(), name = coalesce(left(p_name, 120), name) where id = d.id;
        return jsonb_build_object('status', 'ok', 'limit', lim);
    end if;
    select count(*) into active from public.user_devices where user_id = p_user and unlinked_at is null;
    if active < lim then
        insert into public.user_devices (user_id, device_id, name) values (p_user, p_device, left(p_name, 120))
        on conflict (user_id, device_id) do update set unlinked_at = null, unlinked_by = null, last_seen = now(), name = excluded.name;
        return jsonb_build_object('status', 'ok', 'limit', lim, 'new', true);
    end if;
    return jsonb_build_object('status', 'limit', 'limit', lim, 'devices', private.devices_json(p_user),
                              'can_switch', nxt is null or nxt <= now(), 'next_switch_at', nxt);
end $$;

-- Called by start_job: an old plugin must update; an extra computer can't generate.
create function private.check_client(p_user uuid, p_client jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
    v text := p_client ->> 'plugin';
    min_v text := coalesce(private.app_setting('min_plugin_version') #>> '{}', '0.0.0');
    dev text := p_client ->> 'device_id';
    st jsonb;
begin
    if private.version_cmp(coalesce(v, '0.0.0'), min_v) < 0 then
        raise exception 'update_required' using errcode = 'P0001', detail = json_build_object('min_version', min_v)::text;
    end if;
    if dev is null then
        if coalesce((private.app_setting('require_device_id'))::text::boolean, false) then
            raise exception 'update_required' using errcode = 'P0001', detail = json_build_object('min_version', min_v)::text;
        end if;
        return;
    end if;
    st := private.device_status(p_user, dev, p_client ->> 'device_name');
    if st ->> 'status' = 'limit' then
        raise exception 'device_limit' using errcode = 'P0001', detail = st::text;
    end if;
end $$;

-- The plugin's check at sign-in / start: update status and this computer's status.
create function public.check_in(p_client_info jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    uid uuid := private.require_user();
    v text := p_client_info ->> 'plugin';
    cfg jsonb := public.plugin_config();
    required boolean := private.version_cmp(coalesce(v, '0.0.0'), cfg ->> 'min_version') < 0;
begin
    perform private.hit_rate_limit(uid, 'check_in', 30, 60);
    return jsonb_build_object(
        'update', cfg || jsonb_build_object(
            'required', required,
            'available', private.version_cmp(coalesce(v, '0.0.0'), cfg ->> 'latest_version') < 0),
        -- A plugin that must update can't work anyway: it doesn't take one of the account's computer slots.
        'device', case when required then jsonb_build_object('status', 'unknown')
                       else private.device_status(uid, p_client_info ->> 'device_id', p_client_info ->> 'device_name') end);
end $$;

-- The client moves the account to this computer (the least recently used one is unlinked).
create function public.switch_device(p_client_info jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    uid uuid := private.require_user();
    dev text := p_client_info ->> 'device_id';
    nxt timestamptz := private.next_switch_at(uid);
begin
    perform private.hit_rate_limit(uid, 'switch_device', 5, 3600);
    if dev is null or length(dev) not between 8 and 100 then
        raise exception 'invalid_device' using errcode = '22023';
    end if;
    if nxt is not null and nxt > now() then
        raise exception 'switch_too_soon' using errcode = 'P0001', detail = json_build_object('next_switch_at', nxt)::text;
    end if;
    perform 1 from public.credit_accounts where user_id = uid for update;
    -- Free one slot for this computer (more when the owner lowered the limit), least recently used first.
    update public.user_devices set unlinked_at = now(), unlinked_by = 'switch'
     where id in (select id from public.user_devices where user_id = uid and unlinked_at is null and device_id <> dev
                   order by last_seen asc
                   limit greatest((select count(*) from public.user_devices where user_id = uid and unlinked_at is null and device_id <> dev)
                                  - private.device_limit(uid) + 1, 0));
    update public.credit_accounts set device_switched_at = now() where user_id = uid;
    return private.device_status(uid, dev, p_client_info ->> 'device_name');
end $$;

create function public.my_devices() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user();
begin
    return jsonb_build_object('limit', private.device_limit(uid), 'devices', private.devices_json(uid), 'next_switch_at', private.next_switch_at(uid));
end $$;

-- ---------------------------------------------------------------- start_job (replaces 20261010000001; same signature)

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
    -- Plugin version and device checks (features 1 and 2).
    perform private.check_client(uid, p_client_info);
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

-- ---------------------------------------------------------------- admin: devices and plugin config

create function public.admin_user_devices(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return jsonb_build_object(
        'limit', private.device_limit(p_user),
        'custom_limit', (select max_devices from public.credit_accounts where user_id = p_user),
        'default_limit', (private.app_setting('device_limit'))::text::integer,
        'next_switch_at', private.next_switch_at(p_user),
        'devices', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'first_seen', first_seen, 'last_seen', last_seen,
                                                                 'unlinked_at', unlinked_at, 'unlinked_by', unlinked_by) order by unlinked_at nulls first, last_seen desc)
                             from public.user_devices where user_id = p_user), '[]'::jsonb));
end $$;

create function public.admin_unlink_device(p_device bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare admin_ uuid := private.require_admin();
begin
    update public.user_devices set unlinked_at = now(), unlinked_by = private.admin_actor(admin_)
     where id = p_device and unlinked_at is null;
    if not found then raise exception 'device_not_found' using errcode = 'P0002'; end if;
end $$;

-- p_limit null = the default limit.
create function public.admin_set_device_limit(p_user uuid, p_limit integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    if p_limit is not null and p_limit not between 1 and 20 then
        raise exception 'invalid_limit' using errcode = '22023';
    end if;
    update public.credit_accounts set max_devices = p_limit where user_id = p_user;
    if not found then raise exception 'account_missing' using errcode = 'P0002'; end if;
end $$;

create function public.admin_app_config() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return (select jsonb_object_agg(key, value) from public.app_config);
end $$;

create function public.admin_set_app_config(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    if p_key in ('min_plugin_version', 'latest_plugin_version') then
        if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~ '^[0-9]+(\.[0-9]+){0,3}(-[A-Za-z0-9.]+)?$' then
            raise exception 'invalid_version' using errcode = '22023';
        end if;
    elsif p_key in ('update_url', 'update_message') then
        if jsonb_typeof(p_value) <> 'string' or length(p_value #>> '{}') > 500 then
            raise exception 'invalid_value' using errcode = '22023';
        end if;
        if p_key = 'update_url' and (p_value #>> '{}') <> '' and (p_value #>> '{}') !~ '^https://' then
            raise exception 'invalid_url' using errcode = '22023';
        end if;
    elsif p_key = 'device_limit' then
        if jsonb_typeof(p_value) <> 'number' or (p_value)::text::numeric not between 1 and 20 then
            raise exception 'invalid_value' using errcode = '22023';
        end if;
    elsif p_key = 'device_switch_days' then
        if jsonb_typeof(p_value) <> 'number' or (p_value)::text::numeric not between 0 and 365 then
            raise exception 'invalid_value' using errcode = '22023';
        end if;
    elsif p_key = 'require_device_id' then
        if jsonb_typeof(p_value) <> 'boolean' then raise exception 'invalid_value' using errcode = '22023'; end if;
    else
        raise exception 'unknown_setting' using errcode = '22023';
    end if;
    insert into public.app_config (key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- ---------------------------------------------------------------- expiring credits and reminders

alter table public.bot_notifications drop constraint bot_notifications_kind_check;
alter table public.bot_notifications add constraint bot_notifications_kind_check
    check (kind in ('credits_added', 'credits_removed', 'refund', 'disabled', 'enabled',
                    'password_reset', 'order_rejected', 'expiry_reminder'));

insert into public.bot_settings (key, value) values
    ('expiry_reminder_days', '3'),     -- automatic WhatsApp reminder N days before credits expire (0 = off)
    ('expiry_template', '""'),         -- approved WhatsApp template for reminders outside the 24-hour window
    ('expiry_template_lang', '"ar"')
on conflict (key) do nothing;

-- The reminder settings can be changed from the dashboard (replaces 20261011000001; same signature).
create or replace function public.admin_bot_set_setting(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    if p_key not in ('paused', 'auto_approve', 'instapay_address', 'vodafone_cash_number', 'work_hours', 'reply_sla',
                     'demo_url', 'install_url', 'download_url', 'ccx_path', 'order_ttl_hours', 'max_orders_per_day',
                     'referral_bonus_credits', 'report_hour', 'faq', 'timezone',
                     'expiry_reminder_days', 'expiry_template', 'expiry_template_lang') then
        raise exception 'unknown_setting' using errcode = '22023';
    end if;
    if p_key = 'expiry_reminder_days' and (jsonb_typeof(p_value) <> 'number' or (p_value)::text::numeric not between 0 and 30) then
        raise exception 'invalid_value' using errcode = '22023';
    end if;
    if p_key in ('expiry_template', 'expiry_template_lang') and (jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~ '^[A-Za-z0-9_]{0,512}$') then
        raise exception 'invalid_value' using errcode = '22023';
    end if;
    insert into public.bot_settings (key, value) values (p_key, p_value)
        on conflict (key) do update set value = excluded.value, updated_at = now();
    return jsonb_build_object('key', p_key, 'value', p_value);
end $$;

-- Credits that will expire within p_days, per client, with the last reminder.
create function public.admin_expiring(p_days integer default 7) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
    perform private.require_admin();
    perform private.expire_credits(null);
    return coalesce((
        select jsonb_agg(r order by r.expires_at) from (
            select u.id as user_id, u.email,
                   sum(l.remaining) as credits, min(l.expires_at) as expires_at,
                   coalesce(a.balance - a.reserved, 0) as available,
                   (select max(e.created_at) from public.credit_ledger e where e.user_id = u.id and e.kind in ('purchase', 'grant')) as last_topup_at,
                   (select max(j.created_at) from public.jobs j where j.user_id = u.id) as last_job_at,
                   (select c.wa_id from public.bot_contacts c where c.user_id = u.id order by c.last_inbound_at desc nulls last limit 1) as wa_id,
                   (select max(n.created_at) from public.bot_notifications n where n.user_id = u.id and n.kind = 'expiry_reminder') as reminded_at
              from public.credit_lots l
              join auth.users u on u.id = l.user_id
              left join public.credit_accounts a on a.user_id = u.id
             where l.remaining > 0 and l.expires_at > now() and l.expires_at <= now() + make_interval(days => least(greatest(p_days, 1), 90))
             group by u.id, u.email, a.balance, a.reserved
        ) r), '[]'::jsonb);
end $$;

create function private.queue_expiry_reminder(p_user uuid, p_actor text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
    credits bigint;
    first_exp timestamptz;
    days integer := greatest(coalesce((private.bot_setting('expiry_reminder_days'))::text::integer, 3), 1);
    nid bigint;
begin
    select sum(remaining), min(expires_at) into credits, first_exp from public.credit_lots
     where user_id = p_user and remaining > 0 and expires_at > now() and expires_at <= now() + make_interval(days => greatest(days, 7));
    if coalesce(credits, 0) <= 0 then return null; end if;
    insert into public.bot_notifications (user_id, kind, data, actor)
    values (p_user, 'expiry_reminder', jsonb_build_object('credits', credits, 'expires_at', first_exp), p_actor)
    returning id into nid;
    return nid;
end $$;

-- The owner reminds a client now (the bot sends it).
create function public.admin_remind_expiring(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    admin_ uuid := private.require_admin();
    nid bigint;
begin
    nid := private.queue_expiry_reminder(p_user, private.admin_actor(admin_));
    if nid is null then raise exception 'nothing_expiring' using errcode = 'P0002'; end if;
    return jsonb_build_object('notification_id', nid);
end $$;

-- The bot's cron: one automatic reminder per client per expiring batch, N days before.
create function public.bot_queue_expiry_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
    days integer := coalesce((private.bot_setting('expiry_reminder_days'))::text::integer, 3);
    r record;
    n integer := 0;
begin
    if days <= 0 then return 0; end if;
    for r in
        select l.user_id, min(l.expires_at) as first_exp from public.credit_lots l
         where l.remaining > 0 and l.expires_at > now() and l.expires_at <= now() + make_interval(days => days)
         group by l.user_id
    loop
        -- Not again for the same credits: skip when a reminder was made after these credits were added.
        if not exists (select 1 from public.bot_notifications n where n.user_id = r.user_id and n.kind = 'expiry_reminder'
                        and n.created_at > now() - make_interval(days => days)) then
            if private.queue_expiry_reminder(r.user_id, 'system') is not null then n := n + 1; end if;
        end if;
    end loop;
    return n;
end $$;

-- ---------------------------------------------------------------- privileges

revoke all on function public.plugin_config(), public.check_in(jsonb), public.switch_device(jsonb), public.my_devices(),
    public.admin_user_devices(uuid), public.admin_unlink_device(bigint), public.admin_set_device_limit(uuid, integer),
    public.admin_app_config(), public.admin_set_app_config(text, jsonb), public.admin_expiring(integer),
    public.admin_remind_expiring(uuid), public.bot_queue_expiry_reminders() from public, anon, authenticated;
revoke all on function private.app_setting(text), private.version_cmp(text, text), private.device_limit(uuid), private.devices_json(uuid),
    private.next_switch_at(uuid), private.device_status(uuid, text, text), private.check_client(uuid, jsonb),
    private.queue_expiry_reminder(uuid, text) from public, anon, authenticated;
grant execute on function public.plugin_config() to anon, authenticated;
grant execute on function public.check_in(jsonb), public.switch_device(jsonb), public.my_devices() to authenticated;
grant execute on function public.admin_user_devices(uuid), public.admin_unlink_device(bigint), public.admin_set_device_limit(uuid, integer),
    public.admin_app_config(), public.admin_set_app_config(text, jsonb), public.admin_expiring(integer), public.admin_remind_expiring(uuid) to authenticated;
grant execute on function public.bot_queue_expiry_reminders() to service_role;
