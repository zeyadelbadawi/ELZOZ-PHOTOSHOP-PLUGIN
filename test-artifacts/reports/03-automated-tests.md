# 3. Automated test report

Last full run: `bash scripts/qa-all.sh` on 2026-10-09. **Result: all green.**

| Suite | Tests | Result | Runs on |
|---|---|---|---|
| Vitest: unit, simulator, DB, HTTP billing | 164 | 164 passed, 0 skipped | Node + local Postgres + PostgREST |
| Browser e2e, scenarios A–E | 33 checks | 33 passed; 0 console/page errors; 0 layout overflow findings across 55 screenshots | Chromium + **simulated** Photoshop host + real local credits backend |
| Production build + secret scan | – | passed (573,308 bytes; anon-key-only guard; no dev billing or self-test code in the prod bundle) | webpack |
| npm audit (production deps) | – | 1 high finding: `xlsx` 0.18.5 (see report 11) | npm |

Machine-readable results: `vitest-results.json`, `e2e-results.json`, `npm-audit.json`, `bundle-size.txt`.

## Vitest by file

| File | Tests | What it covers |
|---|---|---|
| tests/domain/excel.test.js | 10 | Spreadsheet parsing: headers, duplicates, blank rows, limits, CSV, clear error for unreadable files |
| tests/domain/naming-images-mapping.test.js | 14 | File naming and sanitizing, image resolution (case, missing extension, ambiguity, path traversal), auto-map |
| tests/domain/preflight.test.js | 9 | Blocking issues versus warnings, skipped rows, cost |
| tests/domain/timeline.test.js | 17 | Video timeline, presets, easing, limits, pricing units |
| tests/app/state.test.js | 12 | App state, step blockers, retry plan, preview plan |
| tests/account/account.test.js | 10 | Auth client (token storage and refresh), credits client (idempotency keys, retries) |
| tests/ps/compat-export.test.js | 9 | Capability detection, export with on-disk verification and partial-file cleanup |
| tests/engine/designJob.test.js | 15 | Design runner on the fake host: non-destructive working copy, failures, cancel, billing reports |
| tests/engine/videoJob.test.js | 8 | Video runner: frames, MOV, cleanup, billing |
| tests/media/mov.test.js | 5 | MOV muxer output decoded by ffmpeg |
| tests/db/credits.test.js | 30 | RLS, RPC authorisation, atomic reservation, idempotency, rate limits, refunds, expiry, ledger append-only (mutation-checked) |
| tests/e2e/billing-http.test.js | 6 | The same rules over real HTTP (PostgREST + JWT): anonymous, forged and direct-write requests rejected; failed rows not charged; lost-response retry; concurrency; cross-user isolation |
| tests/sim/fixtures-engine.test.js | 8 | Real engine on the real fixture PSDs, spreadsheets and images (simulated host); PSD outputs checked with psd-tools; 1000-row performance |
| tests/sim/simulator-contract.test.js | 7 | The simulator checked against Pillow and psd-tools, plus 3 mutation checks |
| tests/sim/selftest.test.js | 4 | The in-plugin Photoshop self-test, plus its failure reporting |

## Simulator self-validation (mutation checks)

Each deliberately broken simulator is caught by the output verification the tests rely on. In all three cases the engine itself reports success, which is exactly why outputs are verified independently:

| Mutant | Caught by |
|---|---|
| Replace Contents silently does nothing | psd-tools: Smart Object file ≠ row image |
| Text edits dropped | psd-tools: text ≠ row value |
| Stale session token (every row gets row 1's photo) | psd-tools: Smart Object file ≠ row image |

## E2E scenarios (Chromium, simulated host, real credits DB)

| Scenario | Checks | Key results |
|---|---|---|
| A: successful batch | 9 | 8 rows → 16 files; every JPG decodes at 1080×1350 (Pillow); PSD text and Smart Objects match each row, Arabic included (psd-tools); balance 100 → 92 on the server; 8 ledger charges; job `completed` |
| B: missing assets | 7 | Missing image flagged in Check before any spend; fixed through *Fix → Map → re-choose folder*; corrupt image fails at render and is **not charged** (3 of 4); retrying only that row charges exactly 1 more; no partial file left behind |
| C: video | 7 | 3 MOVs: ffprobe reports mjpeg 1080×1920, 48 frames, 24 fps, 2.000 s each; preview shows row 1 at 1.0 s; 3 credits charged |
| D: billing failures | 6 | Lost response to a report: safe retry, exactly 3 charged, job completed. Server down at start (5 × 503): nothing rendered, nothing charged, **Try again** succeeds. Insufficient credits: blocked with exact numbers and Next disabled |
| E: responsive / theme / RTL / errors | 4 + 33 screenshots | 240/260/320/400/520 px, light and dark, Arabic RTL (`dir=rtl`), wrong password, corrupt workbook, headers-only sheet, minimal template, PS 23.5 compatibility notice |

## Performance (simulated host)

Parsing and preflighting 1000 rows takes 120 ms, and the engine loop over 1000 rows takes 281 ms, **excluding** Photoshop's rendering time, which only a run in Photoshop can measure.
