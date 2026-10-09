# 6. Build report

| Build | Command | Result |
|---|---|---|
| Production plugin | `npm run build:prod` | `dist/`: `index.js` is 573,308 bytes (558 KiB before QA; +15 KB for the QA fixes); manifest `minVersion 23.3.0`; `allowCodeGenerationFromStrings: false` |
| Secret scan | `npm run check:secrets` | Passed: only an anon-role JWT may appear; no Stripe or service-role patterns; production bundle contains neither the dev billing stub nor the developer self-test |
| Developer build (QA kit) | `npm run qa:kit` | `dist-qa/elzoz-photoshop-qa-kit.zip` (4.9 MB): `plugin/` (dev build, `--env noServer`, so no server URL or key even if `.env` exists), `kit/` (templates, spreadsheets, images), `README.md` (= `docs/PHOTOSHOP_TESTING.md`) |
| E2E harness | built by `tests/harness/e2e-run.js` | `.harness-e2e/`, never shipped; carries a disposable test anon key for the local backend only |

Notes:
- The production build reads `ELZOZ_SUPABASE_URL` / `ELZOZ_SUPABASE_ANON_KEY` from the environment or `.env`, and refuses to build if the key's role is anything other than `anon`.
- `npm run build` prints a webpack deprecation warning from `copy-webpack-plugin`'s asset transform (`Compilation.assets`). It is harmless in webpack 5.105 and was already present before QA.
- License unchanged: `package.json` is `Apache-2.0`, matching `LICENSE`.
