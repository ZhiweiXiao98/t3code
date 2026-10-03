#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:?node-pty source directory is required}"
output_file="${2:?output pty.node path is required}"
work_dir="$(mktemp -d /tmp/t3code-node-pty.XXXXXX)"

cleanup() {
  if [[ -d "$work_dir" && "$work_dir" == /tmp/t3code-node-pty.* ]]; then
    rm -rf -- "$work_dir"
  fi
}
trap cleanup EXIT

mkdir -p "$work_dir/package"
cp -a "$source_dir/." "$work_dir/package/"
rm -rf -- "$work_dir/package/build" "$work_dir/package/node_modules"

cd "$work_dir/package"
npm install --ignore-scripts --omit=dev --no-audit --no-fund
node_root="$(dirname "$(dirname "$(node -p process.execPath)")")"
npx --yes node-gyp@11.4.2 rebuild --nodedir="$node_root"

mkdir -p "$(dirname "$output_file")"
cp build/Release/pty.node "$output_file"
file "$output_file"
