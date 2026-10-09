# 9. Running the tests (one command)

## Everything (automated, on Linux or macOS)

```bash
npm ci
bash scripts/qa-all.sh          # or: npm run qa
```

The script starts the disposable backend and runs Vitest (164 tests), the browser scenarios A–E, the production build with the secret scan, and the dependency audit. It then builds the Photoshop QA kit. Results go to `test-artifacts/reports/`; screenshots, recordings and outputs are regenerated with their indexes. It exits non-zero on any failure.

Prerequisites: Node 22, PostgreSQL 16 server binaries (`initdb`, `pg_ctl`), ffmpeg, Python 3 with `Pillow` and `psd-tools`, and Playwright with Chromium. PostgREST 12.2.3 is downloaded automatically into `/tmp/elzoz-test` if missing. If Playwright isn't a project dependency, set `PLAYWRIGHT_MODULE` to its path.

## Pieces

| What | Command |
|---|---|
| Unit + simulator tests only (no DB) | `npm test` |
| Start / stop the local backend | `npm run test-env start` / `npm run test-env stop` |
| DB + HTTP billing tests | `npm run test-env start && npm run test:e2e` |
| Browser scenarios (all, or some) | `npm run test:ui-e2e` / `ELZOZ_E2E_ONLY=A,C npm run test:ui-e2e` |
| Regenerate fixtures | `npm run fixtures` |
| Production build + secret scan | `npm run build:prod && npm run check:secrets` |
| Photoshop QA kit | `npm run qa:kit` |

## In Photoshop

See `docs/PHOTOSHOP_TESTING.md`.
