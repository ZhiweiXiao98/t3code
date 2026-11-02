#!/bin/bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 || ( $# -eq 2 && "$2" != --signature-only && "$2" != --require-notarized ) ]]; then
  echo "Usage: bash verify-macos-distribution.sh <application.app> [--signature-only|--require-notarized]" >&2
  exit 2
fi

app="$1"
if [[ "$app" != *.app || ! -d "$app" ]]; then
  echo "Expected an existing .app bundle: $app" >&2
  exit 2
fi

/usr/bin/codesign --verify --deep --strict --verbose=4 "$app"
if [[ "${2:-}" == --signature-only ]]; then
  echo "Bundle signature is valid; Gatekeeper distribution has not been verified."
  exit 0
fi

if ! /usr/bin/xattr -p com.apple.quarantine "$app" >/dev/null 2>&1; then
  echo "Distribution verification requires a quarantined test copy of the downloaded application." >&2
  exit 1
fi

failed=0
/usr/sbin/spctl --assess --type execute --verbose=4 "$app" || failed=1
/usr/bin/xcrun stapler validate "$app" || failed=1
if [[ "$failed" -ne 0 ]]; then
  echo "Bundle integrity passed. Gatekeeper/notarization did not approve this artifact; normal macOS user authorization may still be required."
  if [[ "${2:-}" == --require-notarized ]]; then
    echo "The explicitly requested notarized-distribution check failed." >&2
    exit 1
  fi
  exit 0
fi
echo "Quarantined application passed signature, Gatekeeper and stapled-ticket validation."
