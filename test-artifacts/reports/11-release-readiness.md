# 11. Release readiness (1.0.0)

**Verdict: the code is ready. Two things remain before the first sale.**
1. The plugin hasn't been run in Adobe Photoshop yet. That takes about 10 minutes with the self-test.
2. Your production backend, dashboard and package need to be set up. That's about an hour, following `docs/DEPLOYMENT.md`.

No known open defects. Every automated check is green.

## Gate status

| Gate | Status | Evidence |
|---|---|---|
| Domain, engine, UI logic | ✅ | 226/226 Vitest; 57/57 browser checks |
| Credits: server-authoritative, failed items never charged, outages, double-charge safety | ✅ (local Postgres + PostgREST) | `tests/db`, `tests/e2e`, scenarios A–D |
| **Manual sales model**: admin creates accounts with generated passwords, tops up with validity, resets passwords, disables | ✅ | `tests/db/lots-admin` (24), `tests/admin` (11, incl. Deno), scenario F (15 checks) |
| **Expiring credits**: 30 days default, earliest-expiry first, leftovers expire, running jobs protected | ✅ | lots tests incl. balance = Σ lots invariant; scenario F |
| **Designer features**: show/hide by column, shrink-to-fit, rows, subfolders, output size, free preview, remembered mapping | ✅ in the simulator | domain 14 + engine 7 + scenario G (9, psd-tools verified); self-test *features* step ready for Photoshop |
| No secrets in builds (legacy JWT and new `sb_secret_` keys) | ✅ | build guard + `check-secrets` on plugin, dashboard and functions |
| Dependencies | ✅ 0 vulnerabilities | `npm-audit*.json` |
| UI: 240–520 px, light/dark, Arabic RTL; dashboard on desktop and phone | ✅ in Chromium | 75 screenshots, 0 overflow |
| **Runs in Adobe Photoshop** | ❌ not yet run | Your action 1 (self-test, ~10 min per version) |
| Hosted Supabase (Auth, pg_cron, Edge Function deploy) | ⚠️ not yet deployed | Your actions 2–3; the function was tested under Deno with both key styles |
| Plugin packaging/installation (.ccx) | ⚠️ not yet done | Your action 4 |

## Honest limits to know at launch

- The Photoshop API behaviour has been simulated, not observed. The riskiest calls are Smart Object replacement, text replacement on 23.x, and shrink-to-fit on paragraph (box) text. Shrink-to-fit applies to point text; box text wraps and is left as designed.
- Video is QuickTime MOV (Photo-JPEG), not MP4.
- Rendering happens on the client's machine, so a modified plugin could misreport. The server reserves credits up front and keeps evidence (see `docs/SECURITY.md` T5/T6).
- RTL inside UXP is unverified (Chromium only).
- `.ccx` installation outside Adobe Exchange is controlled by Adobe and can change. Test it on one client machine first.

## Release sequence

1. Self-test passes on your Photoshop version(s), recorded in `docs/COMPATIBILITY.md`.
2. Staging: deploy and run one full cycle (dashboard → plugin → top-up → disable).
3. Production: same deployment, sign-ups off, admin MFA on, no test accounts.
4. `npm run build:prod && npm run check:secrets` → package `.ccx` → send it to the first client.
