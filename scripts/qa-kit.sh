#!/usr/bin/env bash
# Builds the Photoshop QA kit: a developer build of the plugin + the fixture
# kit + the testing guide -> dist-qa/elzoz-photoshop-qa-kit.zip
# The developer build has no server configured and charges no credits.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist-qa/elzoz-photoshop-qa-kit"
cd "$ROOT"

# A developer build with no server settings (ignores .env and the environment).
npx webpack --mode development --env noServer >/dev/null
node scripts/check-secrets.js dist >/dev/null

rm -rf "$ROOT/dist-qa"
mkdir -p "$OUT/kit"
cp -R dist "$OUT/plugin"
for d in templates spreadsheets images; do cp -R "test-artifacts/fixtures/$d" "$OUT/kit/$d"; done
cp docs/PHOTOSHOP_TESTING.md "$OUT/README.md"
(cd "$ROOT/dist-qa" && zip -qr elzoz-photoshop-qa-kit.zip elzoz-photoshop-qa-kit)
echo "QA kit: dist-qa/elzoz-photoshop-qa-kit.zip ($(du -h "$ROOT/dist-qa/elzoz-photoshop-qa-kit.zip" | cut -f1))"
