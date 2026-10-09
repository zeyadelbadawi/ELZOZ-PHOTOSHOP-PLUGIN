-- Sweep abandoned jobs every 10 minutes so their reservations are released even
-- if the user never comes back. Requires the pg_cron extension (enable it in
-- Supabase: Database -> Extensions). Without pg_cron, expiry still happens lazily
-- whenever the same user starts a new job.
do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.schedule('elzoz-expire-stale-jobs', '*/10 * * * *', 'select public.expire_stale_jobs()');
    else
        raise notice 'pg_cron not installed: stale job expiry runs lazily only';
    end if;
end $$;
