#!/usr/bin/env bash
# Verify all GitHub Actions workflow steps use pinned full commit SHAs.
set -euo pipefail

UNPINNED=$(grep -rn "uses:.*@" .github/workflows/ | grep -v "@[a-f0-9]\{40\}" || true)

if [ -n "$UNPINNED" ]; then
  echo "❌ Unpinned action references found:"
  echo "$UNPINNED"
  exit 1
fi

echo "✅ All action references are pinned to full commit SHAs."
