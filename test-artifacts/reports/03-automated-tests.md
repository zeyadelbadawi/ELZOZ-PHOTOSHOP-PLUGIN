# 3. Automated test report

Last full run: 2026-10-10 (`bash scripts/qa-all.sh`, with `ELZOZ_DENO` set). **Result: all green.**

| Suite | Result | Runs on |
|---|---|---|
| Vitest: unit, simulator, DB, HTTP billing, admin function | **226 / 226 passed** | Node + local Postgres 16 + PostgREST 12; one test runs the Edge Function under Deno 2.5 |
| Browser e2e, scenarios A–G | **57 / 57 checks**; 0 console/page errors; 0 layout overflow findings in 75 screenshots | Chromium + **simulated** Photoshop host + real local credits backend + the admin dashboard |
| Production builds + secret scan | passed: plugin 620,127 bytes, dashboard 188 KB; no secret keys, no dev billing or self-test code in production | webpack / Vite |
| npm audit | **0 vulnerabilities** (plugin incl. dev dependencies; dashboard) | npm |

Machine-readable: `vitest-results.json`, `e2e-results.json`, `npm-audit.json`, `npm-audit-admin.json`, `bundle-size.txt`.

## Vitest by file

| File | Tests | Covers |
|---|---|---|
| tests/db/credits.test.js | 30 | RLS, RPC authorisation, reservation, idempotency, rate limits, refunds, job expiry, append-only ledger |
| tests/db/lots-admin.test.js | 24 | **Expiring credits** (30-day default, earliest-expiry spending, leftovers expire, reserved credits never expire mid-job, scheduled sweep, refund lots, invariant balance = Σ lots); **admin RPCs** (non-admins refused for all 8, idempotent top-ups with audit actor, removals never below reservations, list/search/detail, disable, prices, stats, refunds) |
| tests/admin/admin-users.test.js | 11 | Edge Function over HTTP: anonymous/non-admin refused, create client with generated password + initial credits, duplicate email, input validation, password reset, disable/enable (sign-in and job start blocked), CORS; key env (new + legacy); **through Deno with only the new Supabase key variables** |
| tests/e2e/billing-http.test.js | 6 | Credits over real HTTP (PostgREST + JWT) |
| tests/domain/designer-features.test.js | 14 | Row selection (incl. Arabic digits), show/hide words (EN/AR), subfolders from the pattern, text-fit maths, preflight with all options |
| tests/engine/designer-features-engine.test.js | 7 | Show/hide per row with Photoshop's default non-undoable visibility (+ mutation check), subfolders (designs and video), output size, shrink-to-fit with 30% floor |
| tests/domain/* (others) | 50 | Spreadsheets, naming, images, mapping, preflight, video timeline |
| tests/app/state.test.js, i18n.test.js | 15 + 3 | App state, retry plan, preview plan, mapping memory; Arabic/English key parity for plugin and dashboard |
| tests/account/account.test.js | 10 | Auth client (incl. disabled-account message), credits client (`my_credits` with expiry) |
| tests/engine (design, video) | 23 | Non-destructive runners on the behavioural fake |
| tests/media, tests/ps | 14 | MOV muxer (ffmpeg-decoded), compatibility, export verification |
| tests/sim/* | 19 | Real fixtures through the simulator (psd-tools verified), simulator contract + 3 mutation checks, in-plugin self-test incl. the new *features* step |

## Browser scenarios

| Scenario | Checks | Key results |
|---|---|---|
| A: design batch | 9 | 16 files, Pillow/psd-tools verified, server balance 100 → 92 |
| B: missing assets | 7 | Fix before spending; corrupt image not charged; retry charges 1 |
| C: video | 7 | 3 MOVs (ffprobe: mjpeg 1080×1920, 48 frames, 24 fps); preview shows row 1 |
| D: billing failures | 6 | Lost response → no double charge; outage at start → nothing charged, Try again works; insufficient credits blocked |
| E: responsive / themes / RTL / errors | 4 | 240–520 px, light/dark, Arabic RTL, error states |
| **F: selling cycle** | 15 | Admin creates client (generated password) → client signs in to the plugin, sees credits + expiry, generates (charged 3) → admin top-up 100/60 days → oldest pack expires (plugin shows only valid credits; dashboard history shows the expiry) → password reset (old refused) → disable (plugin shows a clear message) → enable; dashboard fits a 390 px phone; a client can't open the dashboard |
| **G: designer features** | 9 | Show/hide Badge by column (psd-tools: visible exactly where the sheet has a badge), shrink-to-fit, rows 2–5 only (4 charged), subfolders NEW/HOT/SALE, 540×675 outputs, free 512×640 preview (0 charged), mapping restored for the same template |
