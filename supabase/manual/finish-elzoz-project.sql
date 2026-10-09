-- Finish the "elzoz" Supabase project (ref qxclgvmqeztonhdntvni).
--
-- Everything else was applied through the Supabase connector. These statements
-- contain DROP / DELETE, which the connector holds for an approval prompt that
-- could not be shown in the setup session, so they are run once by hand:
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run once on that project. Content is identical to the repository
-- migrations (20261009000001, 20261009000002, 20261010000001).

begin;

-- 1. Ledger entry types: add 'expiry' (from 20261010000001).
alter table public.credit_ledger drop constraint credit_ledger_kind_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check
    check (kind in ('purchase', 'grant', 'charge', 'refund', 'adjustment', 'expiry'));

-- 2. Release reservations of abandoned jobs (from 20261009000001).
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
revoke all on function private.expire_jobs(uuid) from public, anon, authenticated;

-- 3. The scheduled sweep: abandoned jobs, then expired credits (from 20261010000001).
create or replace function public.expire_stale_jobs() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
    n := private.expire_jobs(null);
    perform private.expire_credits(null);
    return n;
end $$;
revoke all on function public.expire_stale_jobs() from public, anon, authenticated;
grant execute on function public.expire_stale_jobs() to service_role;

-- 4. Run the sweep every 10 minutes (from 20261009000002; pg_cron is already enabled).
select cron.schedule('elzoz-expire-stale-jobs', '*/10 * * * *', 'select public.expire_stale_jobs()');

commit;

-- Check: should return 'elzoz-expire-stale-jobs' and true.
select jobname, active from cron.job where jobname = 'elzoz-expire-stale-jobs';
