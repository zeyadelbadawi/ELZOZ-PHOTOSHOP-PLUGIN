-- "Notify the client on WhatsApp?" for every dashboard action that changes a client.
--
-- Each admin action takes p_notify (default true, so older dashboards keep notifying).
-- It is passed to the capture code as a transaction-local setting (elzoz.notify), which the
-- deferred credit_ledger trigger reads at commit. The functions are dropped and recreated
-- because a new argument changes their signature (an overload would confuse PostgREST);
-- bodies are unchanged apart from the setting.

create function private.notify_wanted() returns boolean
language sql stable set search_path = '' as $$
    select coalesce(current_setting('elzoz.notify', true), '') <> 'off';
$$;

create function private.set_notify(p_notify boolean) returns void
language sql set search_path = '' as $$
    select set_config('elzoz.notify', case when p_notify is false then 'off' else 'on' end, true);
$$;

create or replace function private.bot_notify_ledger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if new.actor like 'admin:%' and new.kind in ('purchase', 'grant', 'adjustment', 'refund') and private.notify_wanted() then
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

-- ---------------------------------------------------------------- credits

drop function public.admin_grant_credits(uuid, bigint, integer, text, text);
create function public.admin_grant_credits(p_user uuid, p_amount bigint, p_valid_days integer, p_note text, p_idempotency_key text,
                                           p_notify boolean default true)
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
    perform private.set_notify(p_notify);
    res := public.grant_credits(p_user, p_amount, 'purchase', null, private.admin_actor(admin_id), p_note,
                                now() + make_interval(days => p_valid_days));
    perform private.idempotent_store(admin_id, p_idempotency_key, 'admin_grant_credits', h, res);
    return res;
end $$;

drop function public.admin_remove_credits(uuid, bigint, text, text);
create function public.admin_remove_credits(p_user uuid, p_amount bigint, p_note text, p_idempotency_key text,
                                            p_notify boolean default true)
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
    perform private.set_notify(p_notify);
    res := public.grant_credits(p_user, -p_amount, 'adjustment', null, private.admin_actor(admin_id), p_note);
    perform private.idempotent_store(admin_id, p_idempotency_key, 'admin_remove_credits', h, res);
    return res;
end $$;

drop function public.admin_refund_charge(bigint, text);
create function public.admin_refund_charge(p_ledger_id bigint, p_note text, p_notify boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := private.require_admin();
begin
    perform private.set_notify(p_notify);
    return public.refund_charge(p_ledger_id, private.admin_actor(admin_id), p_note);
end $$;

-- ---------------------------------------------------------------- account state

drop function public.admin_set_disabled(uuid, boolean);
create function public.admin_set_disabled(p_user uuid, p_disabled boolean, p_notify boolean default true) returns jsonb
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
    if was is distinct from p_disabled and p_notify is not false then
        insert into public.bot_notifications (user_id, kind, actor)
        values (p_user, case when p_disabled then 'disabled' else 'enabled' end, private.admin_actor(admin_id));
    end if;
    return jsonb_build_object('user_id', p_user, 'disabled', p_disabled);
end $$;

-- ---------------------------------------------------------------- orders

drop function public.admin_bot_reject(text, text);
create function public.admin_bot_reject(p_code text, p_reason text, p_notify boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    uid uuid := private.require_admin();
    r jsonb;
begin
    r := public.bot_reject(p_code, private.admin_actor(uid), p_reason);
    if (r ->> 'changed')::boolean and p_notify is not false then
        insert into public.bot_notifications (user_id, contact_id, kind, data, actor)
        values ((r #>> '{order,user_id}')::uuid, (r #>> '{order,contact_id}')::bigint, 'order_rejected',
                jsonb_build_object('code', r #>> '{order,code}'), private.admin_actor(uid));
    end if;
    return r;
end $$;

-- ---------------------------------------------------------------- privileges

revoke all on function private.notify_wanted() from public, anon, authenticated;
revoke all on function private.set_notify(boolean) from public, anon, authenticated;
revoke all on function public.admin_grant_credits(uuid, bigint, integer, text, text, boolean) from public, anon;
revoke all on function public.admin_remove_credits(uuid, bigint, text, text, boolean) from public, anon;
revoke all on function public.admin_refund_charge(bigint, text, boolean) from public, anon;
revoke all on function public.admin_set_disabled(uuid, boolean, boolean) from public, anon;
revoke all on function public.admin_bot_reject(text, text, boolean) from public, anon;

grant execute on function public.admin_grant_credits(uuid, bigint, integer, text, text, boolean) to authenticated;
grant execute on function public.admin_remove_credits(uuid, bigint, text, text, boolean) to authenticated;
grant execute on function public.admin_refund_charge(bigint, text, boolean) to authenticated;
grant execute on function public.admin_set_disabled(uuid, boolean, boolean) to authenticated;
grant execute on function public.admin_bot_reject(text, text, boolean) to authenticated;
