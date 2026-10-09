# Elzoz — batch designs and videos for Photoshop

Elzoz is a Photoshop UXP panel that turns a spreadsheet and a PSD template into one finished design (JPG/PNG/PSD) or one animated video (MOV) per row. Credits are server-authoritative (Supabase).

> **Status (2026-10-09):** pre-launch. The engine, credits backend and UI are implemented and covered by automated tests. **Nothing has been verified inside Photoshop yet.** See `docs/PLAN.md` §7 for the Photoshop checklist.

## How it works

```
Data (xlsx/csv) → Template (PSD) → Map columns to layers → [Animate] → Check → Generate → Results
```

- The template is **never modified or saved**: Elzoz duplicates it, renders each row as one history state, exports copies, reverts, and closes the duplicate without saving.
- A row succeeds only if every text/image change succeeded **and** every output file exists on disk (videos are re-read and validated frame by frame).
- Credits are **reserved** when a job starts and **charged only for succeeded items**; failed, cancelled and abandoned items are released.

## Repository layout

| Path | What |
|---|---|
| `src/domain/` | Pure logic: spreadsheet parsing, mapping, image matching, naming, preflight, video timeline |
| `src/ps/` | The only code that touches Photoshop (`require('photoshop')`): compatibility, layer tree, text, images, export, video frames, the non-destructive port |
| `src/media/` | MOV (Photo-JPEG) writer, JPEG and container validation |
| `src/engine/` | Design and video job runners (reservation → render → verify → report) |
| `src/account/` | Supabase Auth client, credits client (idempotent RPCs) |
| `src/app/`, `src/ui/` | React UI: guided flow, design system, EN/AR |
| `supabase/migrations/` | Database schema, RLS, credit RPCs |
| `tests/` | Unit, contract (fake Photoshop), media (ffmpeg), database (PostgreSQL) tests; browser harness |
| `docs/` | Audit, plan, security, compatibility, design system |

## Develop

Requirements: Node 22, npm 10. For database tests: PostgreSQL 15+. For media tests: ffmpeg/ffprobe.

```bash
npm ci
cp .env.example .env          # ELZOZ_SUPABASE_URL / ELZOZ_SUPABASE_ANON_KEY (public anon key only)
npm run build                 # development build into dist/ (developer mode available)
npm run build:prod            # production build (no eval, no developer mode)
npm test                      # unit + contract + media tests
ELZOZ_TEST_ADMIN_URL=postgresql://postgres@localhost:5432/postgres npm run test:db
npm run check:secrets         # fails if a privileged key or the dev billing stub is bundled
npm run harness && node tests/harness/walkthrough.js   # browser preview + flow walkthrough (not UXP)
```

Load in Photoshop with the **UXP Developer Tool**: *Add Plugin* → `dist/manifest.json` → *Load*. Without a Supabase configuration, a development build offers **developer mode** (nothing is charged); production builds never include it.

## Testing

- `bash scripts/qa-all.sh` runs everything automated: unit and simulator tests, credits DB over HTTP, browser scenarios with screenshots and recordings, the production build with a secret scan, and the audit. Results and artifacts: `test-artifacts/INDEX.md`.
- Testing in real Photoshop: `npm run qa:kit`, then `docs/PHOTOSHOP_TESTING.md` (in-plugin self-test, about 10 minutes per version).
- The browser runs use a **simulated** Photoshop host. They verify Elzoz's logic and UI flow, not Photoshop itself.

## Backend

See `docs/SECURITY.md` for the deployment and secrets checklist. In short: create a Supabase project, enable `pg_cron`, run `supabase db push`, configure Auth (email confirmation, CAPTCHA), and put only the URL and anon key in `.env`.

## Compatibility

Manifest minimum Photoshop **23.3** (Manifest v5). Recommended **24.2+**. Supported versions are only those that pass the Photoshop checklist; see `docs/COMPATIBILITY.md`.

## License

The project started from Adobe's React starter plugin, whose `LICENSE` (Apache-2.0) is kept. Decide the product license before release.
