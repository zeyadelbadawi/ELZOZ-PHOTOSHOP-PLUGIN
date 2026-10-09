# Elzoz — Credits & Account Security

Scope: accounts, sessions, credit balances, billing of design and video jobs.
Implementation: `supabase/migrations/`, `src/account/`, `src/engine/*Job.js`.
Tests: `tests/db/` (54 tests on PostgreSQL 16, incl. expiry and admin RPCs), `tests/admin/` (Edge Function over HTTP and through Deno), `tests/account/` (client).

**Sales model:** there is no self sign-up and no online payment. Clients pay the seller directly
(e.g. via WhatsApp); the seller creates the account and adds credits in the admin dashboard.
Every top-up expires (default 30 days); leftovers expire automatically.

> This system is designed to make abuse expensive and visible. It is **not**
> unhackable: rendering happens on the customer's computer, so some risks
> can only be reduced and monitored. They are listed explicitly in §4.

## 1. Architecture

| Component | Trust | Holds |
|---|---|---|
| Photoshop plugin | **Untrusted** (runs on the customer's machine and can be modified) | Supabase URL + anon key (public), user's access token (memory), refresh token (UXP `secureStorage`) |
| Supabase Auth | Trusted | Users, password hashes (bcrypt, managed by Supabase), sessions, refresh-token rotation |
| Postgres + RLS + `SECURITY DEFINER` RPCs | Trusted, **the authority** | Balances, reservations, jobs, append-only ledger, pricing |
| Admin dashboard (`admin/`, static web app) | Untrusted code, **trusted user** | Anon key (public) and the admin's own session only. Every action is authorised server-side |
| `admin-users` Edge Function | Trusted | `service_role` key (Supabase-provided secret). Creates users / sets passwords / bans, only after `am_i_admin()` passes with the caller's own token |

## 2. Controls

| Area | Control | Where |
|---|---|---|
| Authentication | Supabase Auth; no custom hashing; accounts and passwords created by the admin (generated 12-character passwords, ~70 bits); banned users get a clear message | `src/account/auth.js`, `supabase/functions/admin-users` |
| Session handling | Access token in memory only; refresh token in `secureStorage`; single-flight refresh (rotation-safe); local sign-out on rejected refresh | `auth.js` |
| Authorization | No INSERT/UPDATE/DELETE grants to `anon`/`authenticated` on any table; SELECT own rows only (RLS); `private` schema not exposed | migration §privileges |
| Mutations | Only `start_job`, `report_item`, `finish_job`, `my_credits` for users; `grant_credits`, `refund_charge`, `expire_stale_jobs` for `service_role` only | migration §RPCs |
| Admin actions | `admin_*` RPCs check `private.admins` first (`not_admin` otherwise) and record `admin:<email>` as the actor in the ledger; top-ups are idempotent per form submission | `20261010000001`, `tests/db/lots-admin.test.js` |
| Expiry | Credits live in lots with `expires_at`; spending uses the earliest-expiring lot; leftovers are written off as `expiry` ledger entries; credits reserved by a running job are never expired from under it; invariant balance = Σ lot.remaining is tested | same |
| Disabled accounts | `credit_accounts.disabled` blocks new jobs immediately (even with a still-valid token); the Edge Function also bans sign-in (`ban_duration`) | tests |
| No self sign-up | Supabase Auth "Allow new users to sign up" OFF; the plugin has no sign-up or reset-email flow | deployment checklist |
| Definer safety | Every `SECURITY DEFINER` function sets `search_path = ''` and fully qualifies objects; EXECUTE revoked from `public` | migration |
| Atomicity | Each RPC is one transaction; account row locked `FOR UPDATE`; lock order account → job → item everywhere | migration |
| Double spend | Available = balance − reserved, checked under the account lock; `reserved <= balance` constraint | test "two concurrent jobs" |
| Double charge | `report_item` only from `reserved`; unique `(job_id, item_key)` charge index | tests |
| Idempotency | Every mutating RPC requires a key; replay returns the stored response; same key + different payload is rejected; client reuses one key across retries | tests |
| Ledger integrity | Append-only (UPDATE/DELETE/TRUNCATE blocked by trigger, even for `service_role`); `balance_after` on every row; refunds reference the charge (unique) | tests |
| Pricing | Server-side table; video cost computed from duration/resolution on the server | `pricing_rules` |
| Interruption | Reservations expire 2 h after the last report; swept by `pg_cron` every 10 min and lazily on next job | `expire_jobs` |
| Abuse limits | 20 job starts/min, 1200 reports/min, 3 active jobs per user; payload size caps (items ≤ 5000, evidence ≤ 8 KB) | `hit_rate_limit` |
| Randomness | Idempotency keys from `crypto.randomUUID`/`getRandomValues`; no `Math.random` fallback | `src/account/random.js` |
| Secrets | Build refuses any Supabase key whose JWT role ≠ `anon`; `npm run check:secrets` scans the bundle | `webpack.config.js`, `scripts/check-secrets.js` |
| Logging | The new code logs no tokens, passwords or row contents | `src/account/*`, `src/engine/*` |

## 3. Billing rules (implemented)

| Situation | Outcome |
|---|---|
| Job started | Credits **reserved**, not charged |
| Item succeeded (all outputs written and verified on disk / video validated) | That item charged once |
| Item failed (render, image, export, validation) | Released, not charged |
| User cancels | Unreported items released |
| Plugin crashes / Photoshop quits | Released at expiry (≤ 2 h + sweep interval) |
| Network drop while reporting | Client retries with the same idempotency key; if it still fails, the job stops rendering |
| Retry failed rows | New job containing only those rows |
| Duplicate request | Stored response returned; no second effect |
| Support refund | `refund_charge` (service role), once per charge, with actor and note |

## 4. Threat model

| # | Threat | Likelihood | Control | Residual risk |
|---|---|---|---|---|
| T1 | User edits balances via REST with the anon key | High (key is public) | No write grants; RLS; tests | Misconfigured deploy. Mitigation: CI tests every migration |
| T2 | User reads others' accounts, jobs, ledger | Medium | RLS on every table; tests per table | — |
| T3 | Replay or double submit to get double service or double charge | Medium | Idempotency keys; state machine; unique charge index | — |
| T4 | Two parallel jobs spending the same credits | Medium | Account row lock + available check | — |
| T5 | **Under-reporting**: a modified plugin reports successful items as failed | Medium | Credits reserved up front; evidence (file names/sizes) stored per item; per-account failure ratio is queryable for monitoring | **Real.** The server cannot see local files. Detect via monitoring (high failure ratios, repeated failed jobs for the same data); act through account `status`/suspension |
| T6 | **Bypass**: a modified plugin renders without calling the server | Low–medium | The official engine requires a server job before rendering | **Real.** Inherent to client-side rendering. Only server-side rendering removes it, at large cost. Licence terms + monitoring |
| T7 | Stolen refresh token from disk | Low | `secureStorage` (OS-user encrypted), rotation with reuse detection, sign-out revokes | Malware running as the same OS user |
| T8 | Credential stuffing / brute force | Medium | Supabase Auth rate limits; enable CAPTCHA and leaked-password protection | — |
| T9 | Spamming RPCs (DoS, table growth) | Medium | Per-user rate limits; payload caps; active-job cap | Many accounts: rely on sign-up CAPTCHA + Supabase/platform limits |
| T10 | `service_role` key leak | Low | Never in plugin (build guard + scan); only in Edge Function secrets | Operator error: rotate keys |
| T11 | SQL injection via RPC parameters | Low | Typed parameters, no dynamic SQL | — |
| T12 | Definer function hijack via `search_path` | Low | `search_path = ''` on all definer functions | — |
| T13 | Spreadsheet/file path abuse (`../`) | Low | Image cells must be plain file names inside a user-granted folder | — |
| T14 | Malicious spreadsheet (SheetJS advisories) | Low | SheetJS 0.20.3 (fixes the 0.18.5 prototype-pollution and ReDoS advisories); local files only | `@e965/xlsx` is a provenance-signed rebuild of the official tag; swap for the official CDN tarball when convenient |
| T15 | Admin account takeover | Low–medium | Admin list in `private.admins` (SQL only); dashboard is `noindex`; CORS limited to the dashboard origin; use a long unique password and enable MFA for the admin account | An attacker with the admin password can mint credits. Ledger shows every admin action with the admin's email |
| T16 | Someone signs up with the public anon key | Medium if sign-ups are on | Sign-ups OFF in Supabase Auth; a self-made account has 0 credits and can't grant any | Misconfiguration: covered by the checklist |
| T17 | Client shares their account | Medium | Credits are per account and expire; disable the account from the dashboard | Business risk, not technical |

## 5. Deployment and secrets checklist

See `docs/DEPLOYMENT.md` for the full step-by-step. Security-relevant items:

**Supabase project (staging first, then production)**
- [ ] Create separate **staging** and **production** projects.
- [ ] `supabase link` and `supabase db push` (applies `supabase/migrations`).
- [ ] Enable `pg_cron` (Database → Extensions) *before* applying `20261009000002`, or re-run it after.
- [ ] Auth → **Allow new users to sign up: OFF** (accounts are created from the admin dashboard).
- [ ] Auth → minimum password length ≥ 8 (generated passwords are 14 characters).
- [ ] Auth → Rate limits reviewed; CAPTCHA on password sign-in if abuse appears.
- [ ] Admin account: long unique password, MFA enabled; added to `private.admins` by SQL.
- [ ] `supabase functions deploy admin-users`; `supabase secrets set ELZOZ_ADMIN_ORIGINS=https://<dashboard host>`.
- [ ] Verify with the anon key that `PATCH /rest/v1/credit_accounts` returns 401/403 (smoke test).
- [ ] Set up a monitoring query or dashboard: failed-item ratio per user per week.

**Secrets**
- [ ] Plugin build: only `ELZOZ_SUPABASE_URL`, `ELZOZ_SUPABASE_ANON_KEY` and `ELZOZ_CONTACT_URL` (from `.env`, git-ignored).
- [ ] `service_role` key: only in Supabase Edge Function secrets / your password manager. Never in chat, the repo, or the plugin.
- [ ] Admin dashboard build: only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- [ ] Rotate keys immediately if any of the above appears in a commit, log or screenshot.

**Release**
- [ ] `npm test`, `npm run test:db`, `npm run build:prod`, `npm run check:secrets` all green.
- [ ] Manifest `network.domains` lists exactly the production Supabase URL.
- [ ] Remove any test accounts and grants from production.
