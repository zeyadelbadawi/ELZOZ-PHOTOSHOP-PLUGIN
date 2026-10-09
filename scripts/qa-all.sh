#!/usr/bin/env bash
# One command for the whole automated QA run on this machine (Linux/macOS):
#   bash scripts/qa-all.sh
# 1. starts the disposable local backend (Postgres + PostgREST, scripts/test-env.sh)
# 2. unit, simulator, DB-security and HTTP billing tests (Vitest)
# 3. browser end-to-end scenarios A-E with screenshots and recordings
# 4. production build, secret scan, dependency audit
# 5. the Photoshop QA kit (dist-qa/)
# Results: test-artifacts/reports/. Nothing here touches a production database.
# Needs: Node 22, PostgreSQL 16 binaries, ffmpeg, Python 3 with Pillow + psd-tools, Playwright + Chromium.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REPORTS="$ROOT/test-artifacts/reports"
mkdir -p "$REPORTS"
status=0
step() { echo; echo "=== $1"; }
record() { echo "$1|$2" >> "$REPORTS/.qa-steps"; [ "$2" = pass ] || status=1; }
rm -f "$REPORTS/.qa-steps"

step "Backend (local, disposable)"
bash scripts/test-env.sh start && record backend pass || { record backend fail; exit 1; }
# shellcheck disable=SC1091
source "${ELZOZ_TEST_HOME:-/tmp/elzoz-test}/env"

step "Vitest: unit, simulator, DB security, HTTP billing"
if npx vitest run --reporter=default --reporter=json --outputFile="$REPORTS/vitest-results.json"; then record vitest pass; else record vitest fail; fi

step "Browser end-to-end scenarios A-E"
if PLAYWRIGHT_MODULE="${PLAYWRIGHT_MODULE:-playwright}" node tests/harness/e2e-run.js; then record e2e pass; else record e2e fail; fi
node scripts/artifact-index.js || true

step "Production build + secret scan"
if npm run --silent build:prod >/dev/null && node scripts/check-secrets.js; then record build pass; else record build fail; fi
echo "bundle: $(wc -c < dist/index.js) bytes" | tee "$REPORTS/bundle-size.txt"

step "Dependency audit (production dependencies)"
npm audit --omit=dev --json > "$REPORTS/npm-audit.json" 2>/dev/null
node -e 'const a=require(process.argv[1]);const v=(a.metadata||{}).vulnerabilities||{};console.log(JSON.stringify(v))' "$REPORTS/npm-audit.json" | tee "$REPORTS/npm-audit-summary.txt" || true
echo "audit|info" >> "$REPORTS/.qa-steps"

step "Photoshop QA kit"
if bash scripts/qa-kit.sh; then record qa-kit pass; else record qa-kit fail; fi

echo; echo "=== Summary"; sed "s/|/  /" "$REPORTS/.qa-steps"
exit $status
