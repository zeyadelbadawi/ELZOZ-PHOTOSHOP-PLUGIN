# Deploying Elzoz (production)

Three parts, all of them yours:

| Part | What it is | Where it runs |
|---|---|---|
| **Backend** | Supabase project: database (credits, ledger, admin functions), Auth, the `admin-users` Edge Function | Supabase |
| **Admin dashboard** | `admin/`: a static web app where you create clients and add credits | Any static host (Netlify, Vercel, Cloudflare Pages…) |
| **Plugin** | The Photoshop panel your clients install | Your clients' computers |

Do everything once on a **staging** project first, then repeat on **production**.
Arabic quick guide for daily use: [`ADMIN_GUIDE_AR.md`](ADMIN_GUIDE_AR.md).

---

## 1. Backend (Supabase)

You need the Supabase CLI (`npm i -g supabase`, or see the official install page) and a Supabase account.

1. Create a project in the Supabase dashboard. Note the **Project URL** and the **publishable** (or legacy *anon*) key from *Settings → API keys*. **Never** copy the *secret* / *service_role* key anywhere else.
2. *Database → Extensions*: enable **pg_cron**. It's needed for the automatic expiry sweep every 10 minutes. Without it, expiry still happens whenever a client opens their balance or starts a job.
3. From this repository:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push                      # applies supabase/migrations/*
   supabase functions deploy admin-users
   supabase secrets set ELZOZ_ADMIN_ORIGINS=https://<your-dashboard-host>
   ```
   If you enabled pg_cron after `db push`, run this once in the SQL editor:
   `select cron.schedule('elzoz-expire-stale-jobs', '*/10 * * * *', 'select public.expire_stale_jobs()');`
4. *Authentication → Sign In / Providers*: turn **"Allow new users to sign up" OFF**. Only you create accounts.
5. Create **your admin account**:
   - *Authentication → Users → Add user*: your email, a long unique password, and tick *Auto confirm*.
   - *SQL editor*:
     ```sql
     insert into private.admins (user_id)
     select id from auth.users where email = 'you@example.com';
     ```
   - Recommended: turn on MFA for this account.
6. Optional: *SQL editor* → change prices later from the dashboard (*Settings*). The defaults are 1 credit per design and 1 credit per started 5 s of video (×2 above 1920 px).

Smoke test with the publishable key (must be refused):
```bash
curl -s -X PATCH "$URL/rest/v1/credit_accounts?user_id=neq.0" -H "apikey: $PUBLISHABLE" -H "Content-Type: application/json" -d '{"balance":999999}'
# -> 401/403 or an empty result; never an update
```

## 2. Admin dashboard

```bash
cd admin
npm ci
VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key> npm run build
```
Upload `admin/dist/` to any static host on **HTTPS**. Use the same URL in `ELZOZ_ADMIN_ORIGINS` (step 1.3). The build uses relative paths, so it can live in a sub-folder. Sign in with your admin account; any other account is refused.

## 3. Plugin

1. Create `.env` in the repository root (it's git-ignored):
   ```
   ELZOZ_SUPABASE_URL=https://<ref>.supabase.co
   ELZOZ_SUPABASE_ANON_KEY=<publishable-or-anon-key>
   ELZOZ_CONTACT_URL=https://wa.me/20XXXXXXXXXX
   ```
   `ELZOZ_CONTACT_URL` is what clients see for "no account", "forgot password" and "top up". The build refuses secret/service keys.
2. Build and check:
   ```bash
   npm ci
   npm run build:prod && npm run check:secrets
   ```
3. Package: in **UXP Developer Tool**, *Add Plugin* → `dist/manifest.json` → *••• → Package*. This produces a `.ccx` file.
4. Distribute: send the `.ccx` to clients, who double-click it to install through Creative Cloud. Or publish it on Adobe Exchange; Adobe assigns a new plugin ID there, which goes in `plugin/manifest.json` → `id`. Test the install on one machine first. Creative Cloud's handling of `.ccx` files from outside Exchange is controlled by Adobe and can change.

## 4. Before the first sale

- [ ] `bash scripts/qa-all.sh` is green.
- [ ] `docs/PHOTOSHOP_TESTING.md` self-test passed on the Photoshop versions you will support, and is recorded in `docs/COMPATIBILITY.md`.
- [ ] On staging, run the full cycle once: create a client in the dashboard, sign in to the plugin with the generated password, generate, top up, disable/enable.
- [ ] Sign-ups OFF, admin MFA on, `ELZOZ_ADMIN_ORIGINS` set, no test accounts in production.

## Updating later

- Database: add a new migration file; `supabase db push`. Never edit an applied migration.
- Function: `supabase functions deploy admin-users`.
- Dashboard: rebuild and re-upload `admin/dist/`.
- Plugin: bump `version` in `plugin/manifest.json` and `package.json`, rebuild, package, send the new `.ccx`.
