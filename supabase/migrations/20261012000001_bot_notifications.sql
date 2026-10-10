-- Client notifications: every change the owner makes to a client's account from the dashboard
-- (credits added/removed, refund, account paused/resumed, password reset, order rejected) is
-- queued here and the sales bot tells the client on WhatsApp.
--
-- Delivery (sales-bot, lib/bot.mjs):
--   * WhatsApp allows free-form messages only within 24 hours of the client's last message.
--     Inside that window the notice is sent at once; outside it the notice waits ('waiting')
--     and is sent with the bot's next reply to that client. The owner is told on Telegram.
--   * A client is reachable when a WhatsApp contact is linked to the account
--     (bot_contacts.user_id, set when the bot sells to them). Otherwise: 'no_contact'.
--   * Inserting a notice pokes the bot through pg_net (private.bot_tick), so delivery is
--     immediate; the 5-minute cron is the fallback.
--
-- Same security model as the sales bot: RLS on, no policies, service_role only;
-- admin_* functions require private.require_admin(). No destructive statements.

create table public.bot_notifications (
    id bigint generated always as identity primary key,
    user_id uuid,                                   -- the client's account (null for an order without an account)
    contact_id bigint references public.bot_contacts (id),   -- set when the target contact is known up front
    kind text not null check (kind in ('credits_added', 'credits_removed', 'refund', 'disabled', 'enabled',
                                       'password_reset', 'order_rejected')),
    data jsonb not null default '{}'::jsonb,
    actor text,
    status text not null default 'pending'
        check (status in ('pending', 'sending', 'sent', 'waiting', 'no_contact', 'skipped', 'failed')),
    attempts integer not null default 0,
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    sent_at timestamptz,
    check (user_id is not null or contact_id is not null)
);
create index bot_notifications_open on public.bot_notifications (status, id) where status in ('pending', 'sending', 'waiting');
create index bot_notifications_user on public.bot_notifications (user_id, id);

alter table public.bot_notifications enable row level security;
revoke all on public.bot_notifications from public, anon, authenticated;
grant select, insert, update on public.bot_notifications to service_role;

-- ---------------------------------------------------------------- capture

-- Credit movements made by an admin (dashboard). The bot's own sales ('bot'), job charges
-- and expiry ('system') are not owner edits and are not notified here.
create function private.bot_notify_ledger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if new.actor like 'admin:%' and new.kind in ('purchase', 'grant', 'adjustment', 'refund') then
        insert into public.bot_notifications (user_id, kind, data, actor)
        values (new.user_id,
                case when new.kind = 'refund' then 'refund'
                     when new.amount > 0 then 'credits_added'
                     else 'credits_removed' end,
                jsonb_build_object('amount', abs(new.amount), 'note', left(coalesce(new.note, ''), 300),
                                   'ledger_id', new.id,
                                   'expires_at', (select l.expires_at from public.credit_lots l where l.ledger_id = new.id limit 1)),
                new.actor);
    end if;
    return null;
end $$;

-- The lot is inserted after its ledger row, so read it at the end of the statement.
create constraint trigger credit_ledger_notify after insert on public.credit_ledger
    deferrable initially deferred for each row execute function private.bot_notify_ledger();

-- Wake the bot right away (pg_net sends after commit; does nothing until Vault is set up).
create function private.bot_notifications_poke() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    perform private.bot_tick();
    return null;
end $$;

create trigger bot_notifications_poke after insert on public.bot_notifications
    for each statement execute function private.bot_notifications_poke();

-- Pause / resume from the dashboard: notify only when the state really changes.
create or replace function public.admin_set_disabled(p_user uuid, p_disabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    admin_id uuid := private.require_admin();
    was boolean;
begin
    select disabled into was from public.credit_accounts where user_id = p_user for update;
    if not found then
        raise exception 'account_missing' using errcode = 'P0001';
    end if;
    update public.credit_accounts set disabled = p_disabled, updated_at = now() where user_id = p_user;
    if was is distinct from p_disabled then
        insert into public.bot_notifications (user_id, kind, actor)
        values (p_user, case when p_disabled then 'disabled' else 'enabled' end, private.admin_actor(admin_id));
    end if;
    return jsonb_build_object('user_id', p_user, 'disabled', p_disabled);
end $$;

-- Called by the admin-users function after it set a new password. The password itself is
-- never stored here: the owner gives it to the client.
create function public.admin_note_password_reset(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := private.require_admin();
begin
    if not exists (select 1 from auth.users where id = p_user) then
        raise exception 'account_missing' using errcode = 'P0001';
    end if;
    insert into public.bot_notifications (user_id, kind, actor) values (p_user, 'password_reset', private.admin_actor(admin_id));
    return jsonb_build_object('queued', true);
end $$;

-- Order rejected from the dashboard (Telegram rejections already message the client).
create or replace function public.admin_bot_reject(p_code text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    uid uuid := private.require_admin();
    r jsonb;
begin
    r := public.bot_reject(p_code, private.admin_actor(uid), p_reason);
    if (r ->> 'changed')::boolean then
        insert into public.bot_notifications (user_id, contact_id, kind, data, actor)
        values ((r #>> '{order,user_id}')::uuid, (r #>> '{order,contact_id}')::bigint, 'order_rejected',
                jsonb_build_object('code', r #>> '{order,code}'), private.admin_actor(uid));
    end if;
    return r;
end $$;

-- ---------------------------------------------------------------- delivery (service_role)

-- The contact a notice goes to: the given one, else the most recently active contact linked
-- to the account.
create function private.bot_notice_contact(p_contact bigint, p_user uuid) returns public.bot_contacts
language sql stable security definer set search_path = '' as $$
    select c.* from public.bot_contacts c
     where (p_contact is not null and c.id = p_contact)
        or (p_contact is null and c.user_id = p_user)
     order by c.last_inbound_at desc nulls last, c.id desc
     limit 1;
$$;

create function private.bot_notice_json(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    n public.bot_notifications%rowtype;
    c public.bot_contacts%rowtype;
begin
    select * into n from public.bot_notifications where id = p_id;
    c := private.bot_notice_contact(n.contact_id, n.user_id);
    return jsonb_build_object(
        'id', n.id, 'kind', n.kind, 'data', n.data, 'created_at', n.created_at, 'attempts', n.attempts,
        'account', private.bot_account(n.user_id),
        'contact', case when c.id is null then null else jsonb_build_object(
            'id', c.id, 'wa_id', c.wa_id, 'name', c.name, 'blocked', c.blocked,
            -- WhatsApp's 24-hour window, with a 10-minute margin.
            'in_window', coalesce(c.last_inbound_at > now() - interval '23 hours 50 minutes', false)) end);
end $$;

-- Claim new notices (and ones stuck in 'sending' for 10 minutes) for delivery.
create function public.bot_claim_notifications(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
    with picked as (
        select id from public.bot_notifications
         where status = 'pending' or (status = 'sending' and updated_at < now() - interval '10 minutes')
         order by id
         limit least(greatest(p_limit, 1), 50)
         for update skip locked
    ), claimed as (
        update public.bot_notifications n
           set status = 'sending', attempts = n.attempts + 1, updated_at = now()
          from picked where n.id = picked.id
        returning n.*
    ) select coalesce(jsonb_agg(private.bot_notice_json(claimed.id) order by claimed.id), '[]'::jsonb) into out from claimed;
    return out;
end $$;

-- Notices waiting for this contact to write (outside the 24-hour window when they were made).
create function public.bot_take_waiting_notifications(p_contact bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    c public.bot_contacts%rowtype;
    out jsonb;
begin
    select * into c from public.bot_contacts where id = p_contact;
    if not found then
        return '[]'::jsonb;
    end if;
    with picked as (
        select id from public.bot_notifications
         where status = 'waiting'
           and (contact_id = c.id or (contact_id is null and c.user_id is not null and user_id = c.user_id))
         order by id
         limit 10
         for update skip locked
    ), claimed as (
        update public.bot_notifications n
           set status = 'sending', attempts = n.attempts + 1, updated_at = now()
          from picked where n.id = picked.id
        returning n.*
    ) select coalesce(jsonb_agg(private.bot_notice_json(claimed.id) order by claimed.id), '[]'::jsonb) into out from claimed;
    return out;
end $$;

create function public.bot_notification_done(p_id bigint, p_status text, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if p_status not in ('sent', 'waiting', 'no_contact', 'skipped', 'failed') then
        raise exception 'invalid_status' using errcode = 'P0001';
    end if;
    update public.bot_notifications
       set status = p_status, error = left(p_error, 300), updated_at = now(),
           sent_at = case when p_status = 'sent' then now() else sent_at end
     where id = p_id;
end $$;

-- ---------------------------------------------------------------- dashboard

create function public.admin_client_notifications(p_user uuid, p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return (select coalesce(jsonb_agg(x order by x.id desc), '[]'::jsonb) from (
        select n.id, n.kind, n.data, n.status, n.error, n.created_at, n.sent_at
          from public.bot_notifications n
         where n.user_id = p_user
         order by n.id desc
         limit least(greatest(p_limit, 1), 100)) x);
end $$;

-- ---------------------------------------------------------------- privileges

revoke all on function private.bot_notify_ledger() from public, anon, authenticated;
revoke all on function private.bot_notifications_poke() from public, anon, authenticated;
revoke all on function private.bot_notice_contact(bigint, uuid) from public, anon, authenticated;
revoke all on function private.bot_notice_json(bigint) from public, anon, authenticated;
revoke all on function public.bot_claim_notifications(integer) from public, anon, authenticated;
revoke all on function public.bot_take_waiting_notifications(bigint) from public, anon, authenticated;
revoke all on function public.bot_notification_done(bigint, text, text) from public, anon, authenticated;
revoke all on function public.admin_note_password_reset(uuid) from public, anon;
revoke all on function public.admin_client_notifications(uuid, integer) from public, anon;

grant execute on function public.bot_claim_notifications(integer) to service_role;
grant execute on function public.bot_take_waiting_notifications(bigint) to service_role;
grant execute on function public.bot_notification_done(bigint, text, text) to service_role;
grant execute on function public.admin_note_password_reset(uuid) to authenticated;
grant execute on function public.admin_client_notifications(uuid, integer) to authenticated;
