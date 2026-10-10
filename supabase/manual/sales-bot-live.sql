-- One-time setup of the sales bot on a Supabase project (after migration 20261011000001).
-- Replace the project URL if this is not the "elzoz" project. Safe to run again.

create extension if not exists pg_net;

-- Where pg_cron sends the tick, and the key the function checks (generated here, never shown).
select vault.create_secret('https://qxclgvmqeztonhdntvni.supabase.co/functions/v1/sales-bot', 'elzoz_bot_url', 'sales-bot base URL')
 where not exists (select 1 from vault.secrets where name = 'elzoz_bot_url');
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'elzoz_bot_cron_key', 'sales-bot cron key')
 where not exists (select 1 from vault.secrets where name = 'elzoz_bot_cron_key');

-- Every 5 minutes: fulfil paid orders, expire old ones, daily report.
select cron.schedule('elzoz-bot-tick', '*/5 * * * *', 'select private.bot_tick()');

-- Private bucket for the plugin file (.ccx); the bot sends 7-day signed links.
insert into storage.buckets (id, name, public, file_size_limit)
values ('releases', 'releases', false, 52428800)
on conflict (id) do nothing;

-- Check
select jobname, schedule, active from cron.job where jobname = 'elzoz-bot-tick';
select name from vault.secrets where name like 'elzoz_bot_%';
