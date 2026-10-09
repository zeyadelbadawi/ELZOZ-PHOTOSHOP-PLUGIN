# 11. Release readiness

**Verdict: not releasable yet.** The code is complete for launch scope and green on every check that can run without Photoshop. Two blockers remain: the plugin has never run in Adobe Photoshop, and there is one high-severity dependency advisory.

## Gate status

| Gate | Status | Evidence |
|---|---|---|
| Domain, engine and UI logic | ✅ Pass | 164/164 Vitest; e2e 33/33 |
| Server-authoritative credits (RLS, RPCs, idempotency, failed rows not charged, outage handling) | ✅ Pass on local Postgres + PostgREST | `tests/db` (30), `tests/e2e` (6), e2e A/B/C/D ledger checks |
| No privileged secrets in source or builds | ✅ Pass | `check-secrets`; anon-only build guard; QA kit has no server config |
| UI: responsive 240–520 px, light/dark, Arabic RTL, error states | ✅ Pass **in Chromium** | 55 screenshots, 0 overflow findings, 0 console errors |
| Video output validity | ✅ MOV format verified (ffprobe; MOV writer self-verifies) | e2e C; `tests/media` |
| **Runs in Adobe Photoshop** | ❌ **Not verified** | Report 8; needs action 1 in report 10 |
| **Dependency advisories** | ❌ `xlsx` 0.18.5: prototype pollution + ReDoS (high) | `npm-audit.json`; action 2 in report 10 |
| Hosted Supabase (GoTrue auth, pg_cron expiry) | ⚠️ Not tested | Action 3 |
| Paid flow on staging in Photoshop (PLAN §7) | ⚠️ Not run | Action 4 |
| Performance at scale in Photoshop | ⚠️ Unknown | Engine overhead is 0.28 s per 1000 rows in the simulator; Photoshop render time must be measured |
| Payments (buying credits) | Out of scope for this phase | "Buy credits" opens the website URL |

## Known limitations to state honestly at launch

- Video is QuickTime MOV (Photo-JPEG), not MP4/H.264.
- Supported Photoshop versions: none confirmed yet. The manifest allows 23.3+; 24.0+ is the practical minimum for billing (secure random).
- RTL in UXP is unverified: `direction` is not in UXP's documented CSS.
- Rows skipped by preflight (missing images) can be recovered before generating via **Fix**. After a job has run, generating only the skipped rows means a new job with a spreadsheet that contains just those rows; there's no one-click "generate the skipped rows" yet.

## Release sequence once blockers clear

1. Apply the SheetJS upgrade, then run `npm test`.
2. Self-test passes on at least the latest Photoshop 26.x/27.x and 24.x, and is recorded in `docs/COMPATIBILITY.md`.
3. Staging backend plus the PLAN §7 checklist on one version.
4. Production Supabase: migrations, `pg_cron`, Auth settings (email confirmation, rate limits).
5. `npm run build:prod && npm run check:secrets`, package with UDT, then submit to Adobe Exchange (or distribute privately).
