# 1. Environment report

Run date: 2026-10-09. Machine: cloud Linux VM (Ubuntu 24.04, kernel 6.18, x86_64, 4 CPU, 15 GB RAM).

## What exists here

| Component | Version | Used for |
|---|---|---|
| Node.js / npm | 22.22.0 / 10.9.4 | Build, Vitest, harness, e2e server |
| PostgreSQL | 16.15 (local, disposable, port 54329) | Credits schema, RLS and RPC tests |
| PostgREST | 12.2.3 (port 54331, random JWT secret per start) | The same HTTP layer Supabase uses for RPCs |
| Auth | Local stub inside `tests/harness/e2e-server.js` | Issues HS256 JWTs like Supabase Auth (not GoTrue itself) |
| Chromium + Playwright | 1.56.1 (Chromium build 1194) | Browser e2e, screenshots, recordings |
| ffmpeg / ffprobe | 6.1.1 | MOV verification, recording conversion |
| Python: Pillow / psd-tools | 12.3.0 / 1.24.0 | Independent checks of exported JPG/PNG/PSD |
| ag-psd | 31.0.3 (dev dependency) | Writing the fixture PSDs, simulator PSD reading and writing |

## What is not available, and why

| Missing | Reason | Consequence |
|---|---|---|
| Adobe Photoshop / UXP | Photoshop needs macOS or Windows and a licence; this is Linux. No licensing bypass was attempted | No result here is evidence that the Photoshop API calls work. See report 8 |
| UXP Developer Tool | Same | The plugin was never loaded in a UXP runtime |
| Supabase CLI / Docker images | Image pulls are blocked (HTTP 403) | Local Postgres with a Supabase-compatible stub of `auth.*`, roles and grants; the real migrations are applied to it |
| Hosted Supabase project | No credentials given (and none needed) | Auth email flows, pg_cron scheduling and Supabase's own GoTrue are untested |
| cdn.sheetjs.com | Blocked by the environment's network policy | The SheetJS security upgrade could not be applied (report 11) |

## How the test environment is built

`bash scripts/test-env.sh start` (or `npm run test-env start`) does the following:
1. `initdb` a throwaway cluster in `/tmp/elzoz-test`, then create `anon`, `authenticated`, `service_role` and `authenticator`.
2. Apply `supabase/tests/supabase_stub.sql` and then every file in `supabase/migrations/`, in order.
3. Start PostgREST against it with a freshly generated JWT secret.
4. Write `/tmp/elzoz-test/env` with the `ELZOZ_TEST_*` variables.

Every test that writes to a database refuses to run unless the URL points at localhost. No production system is contacted. `scripts/test-env.sh stop` shuts everything down.
