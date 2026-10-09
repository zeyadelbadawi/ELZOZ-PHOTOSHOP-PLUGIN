# 6. Build report

| Build | Command | Result |
|---|---|---|
| Production plugin (1.0.0) | `npm run build:prod` | `dist/`: `index.js` 620,127 bytes (+33 KB from SheetJS 0.20.3, +14 KB features); manifest `minVersion 23.3.0`; `allowCodeGenerationFromStrings: false` |
| Admin dashboard | `cd admin && npm run build` | `admin/dist/` 188 KB (React 18, Vite 8); static, relative paths |
| Edge Function | `deno check supabase/functions/admin-users/index.ts` | Type-checks under Deno 2.5; exercised end-to-end under Deno by `tests/admin` |
| Secret scan | `npm run check:secrets` | Passed: only an anon-role JWT may appear; no Stripe or service-role patterns; production bundle contains neither the dev billing stub nor the developer self-test |
| Developer build (QA kit) | `npm run qa:kit` | `dist-qa/elzoz-photoshop-qa-kit.zip` (4.9 MB): `plugin/` (dev build, `--env noServer`, so no server URL or key even if `.env` exists), `kit/` (templates, spreadsheets, images), `README.md` (= `docs/PHOTOSHOP_TESTING.md`) |
| E2E harness | built by `tests/harness/e2e-run.js` | `.harness-e2e/`, never shipped; carries a disposable test anon key for the local backend only |

Notes:
- The production build reads `ELZOZ_SUPABASE_URL` / `ELZOZ_SUPABASE_ANON_KEY` from the environment or `.env`, and refuses to build if the key's role is anything other than `anon`.
- copy-webpack-plugin 14: the old `Compilation.assets` deprecation warning is gone. `npm run watch` uses webpack's own watch mode (nodemon removed).
- SheetJS 0.20.3 via `npm:@e965/xlsx@0.20.3` (pinned; provenance-signed rebuild of the official tag, because cdn.sheetjs.com is blocked from the build sandbox). To switch to the official tarball: `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` and run `npm test`.
- License unchanged: `package.json` is `Apache-2.0`, matching `LICENSE`.
