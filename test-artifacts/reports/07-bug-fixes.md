# 7. Bug-fix report (QA phase)

Every product fix has a regression test. "Found by" names the test that exposed the bug.

| # | Defect | User impact | Fix | Regression test | Found by |
|---|---|---|---|---|---|
| 1 | Auto-map mapped an image layer to a same-named column of plain text (e.g. a "Badge" text column onto a "Badge" pixel layer) | Every row skipped as "image not found" until the user noticed and unmapped it | `autoMap` maps image layers only to columns that contain image file names (`src/domain/mapping.js`) | `naming-images-mapping.test.js` › does not auto-map an image layer to a column of plain text | Simulator run on real fixtures |
| 2 | Animate preview ignored row data until an output folder was chosen | The preview claimed to show row 1 but showed the bare template | `previewPlan()` builds the plan without needing an output folder (`src/app/state.js`, `AnimateStep.jsx`) | `state.test.js` › preview plan has row items before an output folder is chosen | Screenshot review (C04) |
| 3 | When the server was unreachable at job start, the results screen offered only "New job" | User had to redo the whole setup after a short outage | `retryKeys()` includes rows that never started; the button reads **Try again** (`GenerateStep.jsx`) | `state.test.js` › retries failed rows and rows that never started; e2e D2 | E2E scenario D |
| 4 | Warnings had no way to the place where they're fixed | Missing images were found in Check, but the user had to work out where to fix them | Warnings with a `fix` target get a **Fix** button, as blocking issues already had (`CheckStep.jsx`) | e2e B (clicks Fix → Map, re-chooses the folder, warning disappears) | E2E scenario B |
| 5 | Map step's disabled-Next hint showed "— not used —" | Confusing hint | New message "Connect at least one column to a layer." in EN and AR (`map.needOne`) | `state.test.js` (blocker key) | Screenshot review (A05) |
| 6 | A corrupt or encrypted workbook showed the raw library error "Unsupported ZIP encryption" | Meaningless error | `readWorkbook` throws a coded `unreadable_workbook` error with a clear, translated message | `excel.test.js` › turns an unreadable workbook into a clear, coded error | Screenshot review (E-data-corrupt) |
| 7 | Account: "Buy credits" touched the "Credit history" heading | Cosmetic | Spacing (`ez-mb3`) | Screenshot A14 | Screenshot review |

## Found while building the sales model and designer features (2026-10-10)

| # | Defect | Fix | Regression test |
|---|---|---|---|
| 8 | Admin function: "valid for 0 days" silently became 30 days (`0 || 30`) | Defaults apply only to missing values; 0 is rejected | `admin-users.test.js` › rejects … bad input |
| 9 | Dashboard lost the open client page on refresh / back button | Page kept in the URL hash | e2e F › refresh keeps the client page open |
| 10 | Row selection "3 – 5" (spaces around the dash) was rejected | Dashes are normalised before splitting | `designer-features.test.js` |
| 11 | Plugin had no label for the new "expiry" history entries; dashboard showed internal "lot N expired" notes and English job statuses in Arabic | Labels added (EN/AR), internal notes hidden | `i18n.test.js` (key parity), screenshots F09/F12 |
| 12 | A new Supabase project may expose only the new API-key variables (`SUPABASE_SECRET_KEYS`…); the function read only the legacy ones | Both supported (`pickKey`); build and secret scan also reject `sb_secret_…` keys | `admin-users.test.js` › pickKey, Deno run with new keys only |
| 13 | Simulator: Image Size wasn't a history state, so a row reset undid an output resize (real Photoshop records it) | Fake fixed to match Photoshop | `designer-features-engine.test.js` › output size |

## Test-infrastructure fixes (not product bugs)

- Simulator PSD writer: Smart Object IDs must be GUIDs, and placed layers need a size (ag-psd requirements).
- Fake UXP `File.write` now accepts strings as UTF-8, as UXP does.
- Fake folders support subfolders, which the self-test's kit needs.
- E2E harness light theme: quiet buttons no longer get a border (a harness CSS artifact, not product CSS).
- E2E: network errors from deliberately injected faults are recorded as *expected*, not as defects.

## Observations kept as-is (by design)

- Choosing a template opens it in Photoshop and leaves it open, so the user can see it. Jobs work on a duplicate that is always closed. The self-test checks that jobs leave nothing else open.
- `{row}` in file names is the data row number (row 7 stays `7_…` when only some rows are generated).
- The `no-mappable-layers.psd` fixture still offers its Background pixel layer, since Elzoz can place an image on a pixel layer. The fixture description was corrected.
- In the results list, Arabic file names mixed with Latin text follow normal bidi ordering. This is readable, but could be isolated per file name if UXP supports `<bdi>`, which is untested.
