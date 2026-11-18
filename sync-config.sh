#!/usr/bin/env bash
# Copy mods/umbe-settings/config.js (the source of truth) into every other mod
# that keeps a copy. Each mod is installed on its own, so they can't share it.
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO/mods/umbe-settings/config.js"
for dir in "$REPO"/mods/*/; do
  dir="${dir%/}"
  [ "$dir" = "$REPO/mods/umbe-settings" ] && continue
  if [ -f "$dir/config.js" ]; then
    cp "$SRC" "$dir/config.js"
    echo "synced $(basename "$dir")/config.js"
  fi
done
