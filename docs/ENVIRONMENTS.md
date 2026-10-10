# Environments

## Production: Supabase project `elzoz`

| | |
|---|---|
| Project ref | `qxclgvmqeztonhdntvni` |
| Region | eu-central-1 (Frankfurt) |
| Organisation | "task's projects" (Vercel-managed, free plan) |
| API URL | `https://qxclgvmqeztonhdntvni.supabase.co` |
| Public key used by the plugin and dashboard | the **publishable** key `sb_publishable_TI82…` (Settings → API keys). Public by design |
| Edge Function | `admin-users` (verify JWT: on); secret `ELZOZ_ADMIN_ORIGINS=https://elzoadmin.vercel.app` |
| Admin dashboard | `https://elzoadmin.vercel.app` (Vercel, root directory `admin`) |
| Admin account | the owner's account, in `private.admins` |
| Contact link in the plugin | WhatsApp (`ELZOZ_CONTACT_URL` in the local `.env`) |
| Sales bot | Edge Function `sales-bot` (verify JWT: off, each route checks its own secret); cron `elzoz-bot-tick` every 5 min (key in Vault); Storage bucket `releases` (private). Setup: [`SALES_BOT_SETUP_AR.md`](SALES_BOT_SETUP_AR.md) |
| Sales bot status (2026-10-10) | WhatsApp Cloud API live on Meta's **test number** (app "Elzoz Sales Bot" in Live mode, WABA subscribed via `POST /<WABA_ID>/subscribed_apps`, permanent System User token in `WA_TOKEN`). Tested end to end: menu → order → approval → account delivered. Telegram owner bot live. Client notifications for dashboard changes live (`bot_notifications`, migrations `20261012000001`, `20261013000001`). **Not done yet:** real business number, payment forwarder phone (`PAY_WEBHOOK_KEY`), `releases/elzoz.ccx` upload |
| Applied by hand | `20261013000001_notify_option.sql` was run in the SQL editor (the connector's approval prompt for its `DROP FUNCTION`s timed out) |
| Created | 2026-10-09 via the Supabase connector |

Never store the secret / service_role key here or anywhere in the repository.

### How it was set up

These parts were applied through the Supabase connector, with content identical to `supabase/migrations/`:
- `pg_cron`.
- Tables, RLS and helpers.
- The new-user trigger.
- The RPCs.
- Credit packs and the admin functions.
- The `admin-users` function.

The statements that contain `DROP` / `DELETE` are in `supabase/manual/finish-elzoz-project.sql` and are run once in the SQL editor. They are the ledger `expiry` type, `expire_jobs`, `expire_stale_jobs` and the 10-minute cron schedule.

The old 6-argument `grant_credits` from the first migration was never created on this project, because the later migration replaces it. The end state is the same as running the three migration files.

### Migration history and the CLI

On this project the migration history holds the connector's step names (`credits_1_tables`, `lots_admin_2_functions`, …), not the repository's file versions. Before the first `supabase db push` from this repository, mark the repository files as already applied:

```bash
supabase link --project-ref qxclgvmqeztonhdntvni
supabase migration repair --status applied 20261009000001 20261009000002 20261010000001 20261011000001
```

After that, new migration files are pushed normally.

### Remaining one-time settings (owner)

1. Run `supabase/manual/finish-elzoz-project.sql` in the SQL editor.
2. Authentication → Sign In / Providers → **Allow new users to sign up: OFF**.
3. Authentication → Users → Add user (your admin email, a strong password, *Auto confirm*). Then in the SQL editor:
   `insert into private.admins (user_id) select id from auth.users where email = 'YOUR-EMAIL';`
4. Host `admin/dist` (Netlify Drop, Vercel or Cloudflare Pages). Then set the Edge Function secret `ELZOZ_ADMIN_ORIGINS` to the dashboard's URL (Edge Functions → Secrets).
5. Put your WhatsApp link in `.env` → `ELZOZ_CONTACT_URL`, run `npm run build:prod`, and package the `.ccx` with UDT.
