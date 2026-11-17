#!/usr/bin/env bash
set -euo pipefail
[[ "$FORMAT" == dmg || "$FORMAT" == zip ]]
if [[ "${REQUIRE_DMG_CLEANUP:-false}" == true ]]; then
  node --input-type=module - "$RUNNER_TEMP/acceptance-artifacts-dmg/clean-first-start.json" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(report.processExited, true, 'ZIP blocked: DMG process exit is unproven');
assert.ok(['isolated', 'absent'].includes(report.profileCleanup), 'ZIP blocked: DMG profile cleanup is unproven');
assert.equal(report.cleanupError, undefined, 'ZIP blocked: DMG cleanup failed');
JS
fi
install_root=$(mktemp -d "$RUNNER_TEMP/t3-clean-install-$FORMAT.XXXXXX")
artifacts="$RUNNER_TEMP/acceptance-artifacts-$FORMAT"
mkdir -p "$artifacts"
asset="$GITHUB_WORKSPACE/candidate/T3-Code-$CLIENT_VERSION-$ARCH.$FORMAT"
shasum -a 256 "$asset" | tee "$artifacts/asset-sha256.txt"
if [[ "$FORMAT" == dmg ]]; then
  mount="$install_root/mount"
  hdiutil attach -nobrowse -readonly -mountpoint "$mount" "$asset"
  trap 'hdiutil detach "$mount" >/dev/null || true' EXIT
  ditto "$mount/T3 Code (Beta).app" "$install_root/T3 Code (Beta).app"
else
  ditto -x -k "$asset" "$install_root"
fi
app="$install_root/T3 Code (Beta).app"
bash .github/scripts/verify-macos-distribution.sh "$app" --signature-only 2>&1 | tee "$artifacts/signature.txt"
executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")
node .github/scripts/check-clean-desktop-first-start.mjs --executable "$app/Contents/MacOS/$executable" --platform macOS \
  --playwright-module "$RUNNER_TEMP/acceptance-tools/node_modules/playwright-core/index.mjs" --artifacts-dir "$artifacts"
node --input-type=module - "$asset" "$artifacts" <<'JS'
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const [asset, artifacts] = process.argv.slice(2);
writeFileSync(join(artifacts, 'acceptance-manifest.json'), JSON.stringify({
  schemaVersion: 1,
  sourceSha: process.env.SOURCE_SHA,
  runId: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  arch: process.env.ARCH,
  format: process.env.FORMAT,
  assetName: basename(asset),
  assetSha256: createHash('sha256').update(readFileSync(asset)).digest('hex'),
  result: 'passed',
}, null, 2));
JS
