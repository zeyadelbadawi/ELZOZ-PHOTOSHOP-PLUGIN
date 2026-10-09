# 8. Photoshop integration status

**Status: NOT VERIFIED IN ADOBE PHOTOSHOP.** No Photoshop or UXP runtime was available (Linux VM, no licence). No result in `test-artifacts/` comes from Photoshop.

## Verified here vs. not

| Area | Verified here (how) | Still needs real Photoshop |
|---|---|---|
| Spreadsheet, mapping, preflight, naming, credits | Yes: unit tests, real DB over HTTP, browser e2e | Nothing Photoshop-specific |
| Engine logic (order of operations, non-destructive working copy, cleanup, billing reports) | Yes, on a behavioural fake that models Adobe's documented semantics | That Photoshop behaves like the fake |
| Text replacement (DOM 24.2+ / batchPlay fallback) | Logic only | Both paths, on 24.2+ and on 23.x |
| Smart Object replace (`select` + `placedLayerReplaceContents`) | Logic only | **Highest risk.** Behaviour, error codes, transforms |
| Fit/fill sizing, pixel-layer placement | Maths checked against real image sizes (simulator) | Photoshop bounds and effects |
| JPG/PNG/PSD export via `saveAs` (copy) | Writing and on-disk verification logic | Real files, quality settings |
| Video frames + MOV | MOV container verified with ffmpeg; frame logic in simulator | Frame rendering speed; MOV written through UXP file I/O |
| UI | Chromium at 5 widths, 2 themes, RTL | UXP CSS support, Spectrum widgets, RTL in UXP |
| `secureStorage`, `crypto.getRandomValues` | Code paths tested in Node | Availability per Photoshop/UXP version |

## Ready for you to run

- **QA kit:** `npm run qa:kit` → `dist-qa/elzoz-photoshop-qa-kit.zip`
- **In-plugin self-test** (developer builds only): 9 steps on the real engine (designs, outputs, template integrity, open documents, video). It writes `elzoz-selftest-report.json`. It is itself tested on the simulator, including its failure reporting (`tests/sim/selftest.test.js`).
- **Guide:** `docs/PHOTOSHOP_TESTING.md` (about 10 minutes per version). Record results in `docs/COMPATIBILITY.md` → Results log.

Until a version passes the self-test and the `docs/PLAN.md` §7 checklist, no Photoshop version should be called supported.
