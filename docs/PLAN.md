# Elzoz — Product Plan Based on Final Decisions

**Date:** 2026-10-09 · Supersedes the roadmap in `docs/audit/ELZOZ_AUDIT.md` (Deliverables 7–10, 12). The audit's findings (bug register, feature matrix) still stand.

**Decisions recorded (from the product owner):**
1. Pre-launch; no customers, no production data. Replace bad architecture freely; keep useful working pieces.
2. Keep credits, server-authoritative, commercial-grade.
3. Video Mode becomes a real feature (no simulation).
4. Support the widest *practical* Photoshop range, proven by feature detection and real tests.
5. Full UX/UI redesign.
6. Priority: P0 correctness → P1 engine + credits → P2 video + redesign → P3 release.

**Verification vocabulary used in every status line:**
- **Verified here:** automated test passes in this repo's CI-like environment (Node, PostgreSQL 16, ffmpeg).
- **Unverified in Photoshop:** code follows Adobe's documented API, but has not run inside Photoshop. Needs the checklist in §7.
- **Supported:** verified in that Photoshop version. Nothing is "supported" yet.

---

## 1. Revised architecture

```mermaid
flowchart TB
  subgraph Plugin[Photoshop UXP plugin · single panel]
    UI[UI · src/ui + src/app<br/>Spectrum UXP widgets, host theme tokens]
    State[Job state · useReducer]
    subgraph Domain[src/domain · pure JS, unit-tested]
      XL[excel] --- MAP[mapping] --- PF[preflight] --- NM[naming] --- PR[pricing preview]
      TL[video timeline · presets · frame planner]
    end
    subgraph Engine[src/engine · orchestration]
      DJ[design job runner]
      VJ[video job runner]
    end
    subgraph PS[src/ps · ONLY code importing 'photoshop']
      CMP[compat · feature detection]
      SES[session: open, duplicate working copy, snapshot/revert, close]
      TXT[text] --- IMG[images] --- EXP[export] --- FR[frame render]
    end
    subgraph Media[src/media · pure JS]
      MOV[MOV Photo-JPEG muxer] --- INS[container inspector / validator]
    end
    subgraph Net[src/account]
      AUTH[Supabase Auth client · secureStorage refresh token]
      CR[credits client · RPC with idempotency keys]
    end
  end
  subgraph Supabase[Supabase · server authority]
    GT[Auth (GoTrue)]
    DB[(Postgres<br/>RLS: read-own only<br/>no direct writes)]
    RPC[SECURITY DEFINER RPCs<br/>start_job · report_item · finish_job · grant_credits]
    WH[Edge Function · payments webhook · future]
  end
  UI --> State --> Engine
  Engine --> Domain
  Engine --> PS
  Engine --> Media
  Engine --> CR
  AUTH --> GT
  CR --> RPC --> DB
  WH --> RPC
```

**Key rules**
- **Never touch the template:** the engine opens the template, calls `Document.duplicate()` (PS 23.0+), works only on the duplicate, reverts it to a history snapshot after every row, and closes it without saving.
- **One modal scope per job:** `executeAsModal({ commandName })` with `reportProgress` and `isCancelled`. No nested modal scope per layer lookup.
- **Results are evidence-based:** a row is OK only when every mapped operation succeeded *and* every output file exists with non-zero size after writing (`entry.getMetadata()`).
- **The plugin holds no privileged secret:** only the Supabase URL and the public anon key, which can do nothing without a user session because of RLS and revoked grants.
- **Kept from the old code:** pickers and session-token handling, the SheetJS parsing approach, the layer-walk idea, and EN/AR translations (re-keyed). Everything else is replaced.
- **Removed:** custom password hashing, `SupabaseClient` direct table writes, `AccountContext`, `BatchProcessor`, `UXPBridge`, simulated video services, the debug button, and duplicate panels.

---

## 2. Secure credits design

### 2.1 Supabase suitability
Supabase fits. It provides Auth (sessions, refresh-token rotation, password reset, email verification), Postgres with RLS, and `SECURITY DEFINER` functions for atomic logic. Edge Functions handle the future payment webhook. No extra server is needed. Credit logic lives in **Postgres functions**, so every check, lock, and ledger write happens in one transaction.

### 2.2 Billing rules (configurable in `pricing_rules`)

| Unit | Default price | Charged when |
|---|---|---|
| `design` (one spreadsheet record → all selected formats of that record) | 1 credit | All outputs of the record were written and verified |
| `video` | 1 credit per started 5 s of duration, ×1 up to 1080p, ×2 above | The video file was written and passed container validation |

- **Reserve, then settle:** `start_job` reserves `planned_units × price` (fails if `balance − active reservations < cost`). Nothing is charged on click or on start.
- **Per item:** `report_item(job, item_key, 'succeeded', evidence)` converts that item's reserved amount into a **charge** ledger entry. `'failed'` releases it (no charge).
- **Partial success:** pay only for succeeded items.
- **Cancellation:** `finish_job(job, 'cancelled')` releases every unreported item.
- **Interruption** (crash, Photoshop quit): reservations expire after `job_ttl` (default 2 h) without a heartbeat. Expired reservations are released lazily on the next call and by a scheduled sweep.
- **Retries:** an item already charged can never be charged again (`unique(job_id, item_key)` where charged). "Retry failed rows" reuses the same job if it's still open; otherwise it starts a new job containing only those rows.
- **Duplicate requests:** every mutating RPC takes an `idempotency_key`; a replay returns the stored result.
- **Export failure after render:** counts as a failed item (not charged).
- **Refunds/adjustments:** administrative only, through `service_role` (`grant_credits`, `refund_charge`), always with a reason and an actor.

### 2.3 Data model (see `supabase/migrations/`)
- `profiles(user_id PK → auth.users)`
- `credit_accounts(user_id PK, balance ≥ 0, reserved ≥ 0, updated_at)`
- `credit_ledger(id, user_id, kind[purchase|grant|charge|refund|adjustment], amount ≠ 0, balance_after, job_id, item_key, reference, actor, created_at)`, **append-only** (trigger blocks UPDATE/DELETE)
- `jobs(id, user_id, kind[design|video], status, planned_units, unit_price snapshot, reserved, charged, created_at, heartbeat_at, expires_at, client_info)`
- `job_items(job_id, item_key, status[reserved|succeeded|failed|released], cost, evidence jsonb, reported_at)`
- `idempotency_keys(user_id, key, request_hash, response jsonb)`
- `pricing_rules(unit, price, multipliers jsonb, active)`
- `rate_limits(user_id, bucket, window_start, count)`

**Access:** RLS on every table; `authenticated` may `SELECT` only rows where `user_id = auth.uid()`; **no INSERT/UPDATE/DELETE grants** for `anon`/`authenticated` on any table. Writes happen only inside `SECURITY DEFINER` functions with a fixed `search_path`. `EXECUTE` is revoked from `public` and granted per function.

### 2.4 Auth flow
1. Sign in from the plugin: `POST /auth/v1/token?grant_type=password` → access JWT (short-lived) + refresh token.
2. The refresh token is stored in UXP `secureStorage` (encrypted per OS user; Adobe documents it as a cache, not a vault). The access token stays in memory only.
3. Refresh happens on expiry or on a 401 (Supabase rotates refresh tokens and detects reuse).
4. Sign-up, email verification, and password reset use Supabase-hosted flows opened in the browser via `shell.openExternal` (consent prompt under Manifest v5).

### 2.5 Threat model (summary — full table in `docs/SECURITY.md`)

| Attack | Control | Residual risk |
|---|---|---|
| Grant self credits via REST | No write grants; only definer RPCs; ledger append-only | Supabase misconfiguration → caught by SQL tests in CI |
| Read others' data | RLS `user_id = auth.uid()`; tests per table | — |
| Replay or double-submit | Idempotency keys; unique charged item | — |
| Concurrent jobs double-spend | `SELECT … FOR UPDATE` on account row; `balance − reserved` check | — |
| Under-report successes to avoid paying | Pre-reservation; evidence (file size + SHA-256) recorded; per-account failure-ratio monitoring; caps on reported failures | **Real:** rendering is local, so the server cannot see outputs. A patched plugin can lie about success. Mitigated by monitoring, not prevented. |
| Patched plugin skipping credit calls | Engine requires a server job ID before rendering | **Real:** a modified plugin can render without calling the server. Inherent to local rendering. |
| Token theft from disk | `secureStorage` + rotation + short JWT | Malware running as the user can read it |
| Brute-force login | Supabase Auth rate limits + captcha option | — |
| Abuse of RPCs (spam jobs) | Per-user rate limits in SQL | — |
| Secrets in bundle | Only URL + anon key; build fails if a `service_role` key pattern is found | — |

---

## 3. Video Mode — scope and feasibility

### 3.1 What exists today
Four UI panels, `VideoContext`, and six services. Generation is a `setTimeout` loop (`VideoExecutePanel.jsx:20-30`). `VideoCompilationService` "simulates" rendering, optimization, and encoding. **No frame is rendered and no file is written.** The UI ideas are reused (scene list, presets, duration/resolution). The code is not.

### 3.2 Platform facts (Adobe docs)
- The UXP Photoshop DOM has **no timeline or video-export API**; the docs have no `timeline`/`videoExport` entries.
- Available pieces: layer `translate`/`scale`/`rotate` (23.0), `opacity`/`visible` (22.5), history states (22.5), `Document.duplicate` (23.0), `saveAs.jpg/png` (22.5), the Imaging API `getPixels`/`encodeImageData` (24.2, labelled beta), and WebAssembly (supported per Adobe samples; crashes were reported with PS 26.0).
- Photoshop's native *Render Video* is reachable only via an undocumented `batchPlay` `videoExport` descriptor, and needs a timeline document. A public forum report shows the export dialog still appearing.

### 3.3 Chosen pipeline

```
record → apply text/images (design engine) → for each frame t:
   revert to record snapshot → apply animated transforms at t (DOM) → write frame JPEG (saveAs.jpg copy)
→ mux frames into MOV (Photo-JPEG) in pure JS → validate container (structure, frame count, duration)
→ optional: H.264 MP4 encode (see 3.4) → verify → report item
```

| Capability | Where it runs | Status |
|---|---|---|
| Frame planning (presets, easing, timing, aspect ratios, fps) | Plugin, pure JS | **Build now**, verified here |
| Frame rendering (transforms, opacity, visibility per layer) | Inside Photoshop (DOM 23.0+) | Build now, unverified in Photoshop |
| JPEG frame sequence output | Inside Photoshop (`saveAs.jpg`) | Build now, unverified in Photoshop |
| **MOV (Photo-JPEG) video file** | Plugin, pure JS muxer | **Build now**, verified here: plays/decodes with ffmpeg |
| Container validation before reporting success | Plugin, pure JS | Build now, verified here |
| **H.264 MP4 (social-ready)** | Option A: Photoshop native Render Video (licensed by Adobe, undocumented) · Option B: WASM encoder in plugin · Option C: cloud worker | **Not promised yet.** Next spike (§3.4) |
| Compilation of several records into one video | Plugin muxer (concatenate frames) | P3 |
| Audio | — | Out of scope (no audio pipeline) |

**Why MOV (Photo-JPEG) first:** Photoshop itself writes the JPEG frames, so the encoder is just a container writer. It's royalty-free, has no WASM risk, and is a real video file that plays in QuickTime/VLC and imports into Premiere, After Effects, DaVinci, and CapCut desktop. It is **not** guaranteed to be accepted by Instagram or TikTok upload, so the UI says "Edit-ready MOV". MP4 is the next milestone.

### 3.4 H.264 MP4 — decision path (recommended order)
1. **Spike A: native Render Video, ~1 day on a real Photoshop.** Open the JPEG sequence as an image-sequence document, then send the `batchPlay` `videoExport` descriptor with `dialogOptions: "dontDisplay"`. If it renders without a dialog on ≥ 2 Photoshop versions, use it: no codec licensing on our side, and Adobe's encoder quality.
2. **Spike B: WASM encoder** (only if A fails). Needs a codec licensing review before commercial use (H.264 patent pool; OpenH264's Cisco patent coverage applies only to Cisco-distributed binaries), plus a test on PS 26.x for the reported WASM crash.
3. **Option C: cloud encode worker** (ffmpeg). Uploads ~50–100 MB per 10 s 1080p video, adds running cost and a privacy surface. Last resort.

### 3.5 Recommended product scope (value order)
1. One video per record (product showcase), with presets: **Reel/Story 1080×1920, Square 1080×1080, Landscape 1920×1080**; 24/30 fps; 3–15 s.
2. Per-layer animation presets: fade, slide (4 directions), zoom-in, pop, Ken Burns (slow zoom/pan for image layers), plus a global fade-out. Each has start, duration, and easing.
3. Preview: render any frame time `t` onto the working copy (scrub), and render a low-fps preview of record 1.
4. Real progress (frame N of M, record R of N), cancel, per-record result, retry failed.
5. Naming pattern shared with designs; outputs in `<output>/<job-name>/videos/`.
6. **Later:** compilation video, MP4 (after spike), GIF, audio.

### 3.6 Video acceptance tests
- **Verified here:** planner (all presets, easing endpoints, aspect ratios, fps rounding), muxer output decoded by `ffprobe`/`ffmpeg -f null` (exact frame count, duration, dimensions), corrupted or missing frame → failure, naming collisions, cancellation mid-sequence.
- **In Photoshop:** the checklist in §7, including actual playback in QuickTime and VLC.

---

## 4. Photoshop compatibility strategy

### 4.1 Feature matrix (from Adobe docs; **all unverified until tested**)

| Feature | Needs | PS 23.0–23.2 | 23.3–24.1 | 24.2–24.x | 25.x | 26.x–27.x |
|---|---|---|---|---|---|---|
| Plugin loads (Manifest v5) | PS 23.3 / UXP 6.0 | ✗ | ✓ | ✓ | ✓ | ✓ |
| Layer tree, kinds, ids | 22.5/23.0 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Working copy (`duplicate`) + history revert | 23.0 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Text replace | DOM `textItem.contents` 24.2, else `batchPlay set textLayer textKey` | — | fallback | DOM | DOM | DOM |
| Smart Object replace | `batchPlay placedLayerReplaceContents` + session token | — | ✓? | ✓? | ✓? | ✓? |
| Export JPG/PNG/PSD (`saveAs`, copy) | 22.5 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Persistent file tokens | UXP | ✓ | ✓ | ✓ | ✓ | ✓ |
| `crypto.getRandomValues` | UXP 6.2 | ✗ | 23.x? | ✓ | ✓ | ✓ |
| Video frames (transforms) | 23.0 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Imaging API (faster frames) | 24.2 (beta) | ✗ | ✗ | ✓ | ✓ | ✓ |
| Spectrum UXP widgets (`sp-*`) | UXP ≥ 4 | ✓ | ✓ | ✓ | ✓ | ✓ |

(✓? = API exists, but its behavior is the most uncertain area; forum reports of `-25920` require the target layer to be selected first.)

### 4.2 Recommendation
- **Manifest minimum `host.minVersion = 23.3.0`.** That's the oldest version that loads a Manifest v5 plugin, which we need for the permission model and network domains.
- **Recommended version: 24.2+** (DOM text API).
- **Marketed "Supported" list:** only versions that pass §7. Proposed test set: **23.5 (oldest), 24.7 (2023 final), 25.12 (2024 final), 26.x latest, 27.x latest**.

### 4.3 Implementation
- `src/ps/compat.js` detects features once per session (`app.version`, `uxp.versions.uxp`, probes like `'textItem' in layer`, `photoshop.imaging?.getPixels`, `typeof WebAssembly`) and exposes `caps`.
- Adapters branch on **capabilities, not version strings**, and only where behavior differs (text, frame capture). There are no per-version copies of the engine.
- The UI reads `caps` to show "Requires Photoshop 24.2 or later" next to an unavailable option, instead of failing at run time.

---

## 5. Implementation sequence

| # | Milestone | Content | Verifiable here |
|---|---|---|---|
| M0 | Baseline | Import sanitized source, test runner, baseline build | Build |
| M1 | Correct engine (P0) | compat, session/working copy, text, SO replace, export + verify, domain (excel, mapping, naming, preflight), job runner (results, cancel) | Unit + adapter contract tests |
| M2 | Credits (P1) | Migrations, RPCs, RLS, SQL security tests, auth/credits client, wire into runner | SQL tests on PG16, client unit tests |
| M3 | Video engine (P2) | Timeline/presets/planner, frame renderer, MOV muxer, validator, video runner | Unit + ffmpeg decode tests |
| M4 | Redesign (P2) | Tokens, components, shell, guided flow for designs + video, account | Build; UI is unverified in Photoshop |
| M5 | Release prep (P3) | Photoshop test matrix, perf (500 rows), security review, docs, prod build, deployment | Needs your machine |

---

## 6. Tools, access, environment

| Need | Status |
|---|---|
| Node 22, npm, webpack | Available here |
| PostgreSQL 16 (local, Supabase-like auth stub) | Available here; real Supabase images can't be pulled here (403) |
| ffmpeg/ffprobe for video verification | Available here |
| **Photoshop + UXP Developer Tool** on your machine, versions per §4.2 | **Required from you** for §7 |
| **Supabase project** (staging first): project URL, anon key for the plugin, `supabase` CLI login for migrations; **never** share the `service_role` key in chat | Required for deploying M2 |
| Fixture PSDs/Excel/images | Required from you; I'll also add synthetic fixtures |
| Payment provider (Stripe) | Later (P3) |

## 7. Photoshop verification checklist (run per version in §4.2)
1. Load via UDT; no console errors; panel docks at 260 px.
2. Design job, 25 rows, 3 text layers (EN + AR), 1 Smart Object, nested groups: 25 × (JPG, PNG, PSD) files with correct content; **template file hash unchanged**.
3. Missing image (3 rows): preflight lists them; "skip" produces 22 outputs; credits charged = 22.
4. Cancel at row 10: rows 11–25 cancelled; charged = rows completed.
5. Kill Photoshop mid-job, relaunch: reservation released after the TTL; no charge for unreported rows.
6. Video job, 3 records, Reel 1080×1920, 30 fps, 6 s, 3 presets: 3 MOV files play in QuickTime and VLC, with correct duration and frame count, and are charged 2 credits each.
7. Spike A (§3.4) result recorded.


---

## 8. Implementation status (2026-10-09)

| Milestone | Delivered | Verified here | Not verified |
|---|---|---|---|
| M0 Baseline | Sanitized import, prod build (558 KiB), secret scan, CI | Builds | — |
| M1 Engine | compat, working copy, text (DOM + fallback), SO/pixel images, saveAs export with on-disk check, partial-output cleanup, job runner | 21 contract tests on a Photoshop fake | Everything inside Photoshop |
| M2 Credits | Migrations, RLS, definer RPCs, idempotency, rate limits, expiry, refunds; auth + credits clients; security doc | 30 DB tests on PostgreSQL 16 (mutation-checked), 10 client tests | Real Supabase project, Auth settings, pg_cron |
| M3 Video | Timeline/presets, frame renderer, MOV writer, verifier, video runner | 17 timeline, 5 ffmpeg-checked media, 8 engine tests | Rendering in Photoshop; playback of Photoshop-produced files; performance |
| M4 UI | Design system, guided flow for designs and video, account, EN/AR, dev mode (dev builds only) | 10 state tests; browser walkthrough of both flows at 260/320/520 px with zero errors | UXP rendering, RTL in UXP, Spectrum widget behavior |
| QA | Test environment (local Postgres + PostgREST), fixtures (real PSD/xlsx/images), PSD-backed simulator with mutation checks, browser e2e A–E with screenshots and recordings, in-plugin Photoshop self-test + QA kit, 7 UX fixes | 164 Vitest + 33 e2e checks green (`test-artifacts/INDEX.md`) | Everything inside Photoshop (`docs/PHOTOSHOP_TESTING.md`) |

**Remaining before launch (P3):** run §7 on the version matrix; Spike A (native H.264 MP4); deploy staging Supabase; performance test (500 rows, 15 s videos); upgrade SheetJS from its official CDN; product license decision; Adobe Marketplace listing (plugin id issued by Adobe).
