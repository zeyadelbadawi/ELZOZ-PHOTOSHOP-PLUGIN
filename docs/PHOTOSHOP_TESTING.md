# Testing Elzoz in real Photoshop

Everything in `test-artifacts/` was produced on a **simulated** Photoshop host
(Chromium + a behavioural fake). Only a run inside Adobe Photoshop can show
that the Photoshop API calls work. This guide keeps your part as short as
possible: **about 15 minutes per Photoshop version.**

## What you need

- A Mac or Windows machine with a licensed Photoshop **23.3 or later**.
- **Adobe UXP Developer Tool (UDT)**: install it from the Creative Cloud desktop app (*Apps → All apps → UXP Developer Tools*).
- The QA kit `elzoz-photoshop-qa-kit.zip`, built with `npm run qa:kit` (it is written to `dist-qa/`).

No Elzoz account, Supabase project or credits are needed. The kit is a developer build, and its self-test uses the development billing stub, which charges nothing.

## Steps (per Photoshop version)

1. Unzip `elzoz-photoshop-qa-kit.zip`. You get `plugin/`, `kit/` and this guide.
2. Start Photoshop, then UDT. In UDT, click **Add Plugin** and select `plugin/manifest.json`. Then use **••• → Load** on the Elzoz row.
3. In Photoshop, open **Plugins → Elzoz**. The panel says the build has no server. Click **Continue in developer mode**.
4. Click the **DEV** chip in the top-right corner of the panel to open Account. Click **Run self-test**, then choose the `kit/` folder.
5. Wait for all 15 steps to finish (typically 2–4 minutes; Select Subject and Remove Background take a few seconds per row).
6. Send back:
   - `kit/selftest-<date>/elzoz-selftest-report.json` (always send this, pass or fail)
   - a screenshot of the panel showing the step list
   - UDT's log if anything failed (*UDT → Elzoz row → ••• → Debug → Console*)
7. Do the 12 visual checks printed in the report under `manualChecks`, and note anything odd. These checks are things only a human can judge, for example whether the text sits nicely.

### What the self-test does

The self-test calls the same code paths as a real job (`src/dev/selfTest.js`):

| Step | Checks |
|---|---|
| kit | QA kit files are present and readable through UXP storage |
| spreadsheet | `products-valid.xlsx` parses: 8 rows |
| integrity-before | Hash of the template file is recorded |
| inspect | Template opens and its layer tree matches the expected 12 layers (groups, text, Smart Objects, pixel layers) |
| design | 3 rows (an extension-less image name and an Arabic row included) are rendered to JPG, PNG and PSD by the real engine |
| outputs | Each file exists and is non-empty; the JPG and PNG files are 1080×1350; the PSD has a valid header |
| features | Rows 2–3 and 5 only, Badge shown/hidden from the Badge column, Description shrink-to-fit, files in `NEW/` and `HOT/` subfolders, 540 px output width |
| integrity-after | Template file is byte-identical, and no extra documents are left open |
| video | One 2 s, 24 fps Reel is rendered as **MP4 (H.264)** (slide-up text, Ken Burns photo). The writer re-reads the MP4 and verifies its codec, size, frame count and duration |
| integrity-video | No documents are left open after the video |
| artboards | Feature 5. `social-sizes-artboards.psd` is read through batchPlay (`artboardEnabled`, `artboardRect`): Post 1080², Story 1080×1920, Banner 1200×628. Two rows × 3 artboards are exported, each cropped to its artboard, into one folder per size |
| print-pdf | Feature 13. A 2-row job with the print PDF on: `Print.pdf` is written with 2 pages |
| proof | Feature 14. Free approval sheet for 3 rows: the PROOF watermark (a text layer made with batchPlay), the label strip (`resizeCanvas`), the PDF and the proof images. No documents are left open |
| subject | Features 7 + 12. Smart crop with **Select Subject**, then the same with **Remove Background**. It fails if Photoshop finds no subject or can't remove the background |
| colors | Feature 11. The product name's text color comes from a column (#E63946 and #1D4ED8) |

All outputs of these 5 steps are in `kit/selftest-<date>/new/`, one folder per feature.

## Version matrix

Run the steps once on each version you have. These versions give the widest coverage:

| Version | Why |
|---|---|
| 23.5 (oldest supported) | Text goes through the batchPlay fallback; no DOM text API |
| 24.7 | Last 2023 release; DOM text API |
| 25.12 | Last 2024 release |
| Latest 26.x | |
| Latest 27.x | Current |

Record each result in `docs/COMPATIBILITY.md` → *Results log*. A version is only called **supported** after it passes.

## Full checklist (before launch, needs a staging Supabase project)

The self-test covers the Photoshop integration. The end-to-end paid flow also needs a staging backend. Follow `docs/PLAN.md` §7: 25 rows, missing images, cancel, killing Photoshop mid-job, video, and checking credits against the server ledger.

## If something fails

The report names the step, the message and the first lines of the stack trace. That is usually enough to fix the problem without another session. When you send it back, include the Photoshop version (Help → System Info) and your OS.
