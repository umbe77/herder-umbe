#!/usr/bin/env bash
# Remove every Herdr mod in ./mods and theme in ./themes from the Herdr config,
# and the key bindings that install.sh added. Safe to run again: missing mods,
# themes and bindings are skipped. A binding is only removed while it still
# points at the action from ./keys.json, so a key you have since rebound is
# left alone.
#
# Usage: ./uninstall.sh [--no-keys]
#   --no-keys  leave keys.json alone
# HERDR_CONFIG overrides the config folder (default ~/.config/herdr-app).

set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
DEST="${HERDR_CONFIG:-$HOME/.config/herdr-app}"
KEYS=1

for arg in "$@"; do
  case "$arg" in
    --no-keys) KEYS=0 ;;
    -h | --help)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

for dir in "$REPO"/mods/*/; do
  dir="${dir%/}"
  [ -f "$dir/mod.json" ] || continue
  name="$(basename "$dir")"
  target="$DEST/mods/$name"
  if [ -L "$target" ] || [ -e "$target" ]; then
    rm -rf "$target"
    echo "removed $name"
  else
    echo "not installed: $name"
  fi
done

for file in "$REPO"/themes/*.json; do
  [ -f "$file" ] || continue
  name="$(basename "$file" .json)"
  target="$DEST/themes/$name.json"
  if [ -L "$target" ] || [ -e "$target" ]; then
    rm -f "$target"
    echo "removed theme $name"
  else
    echo "not installed: theme $name"
  fi
done

if [ "$KEYS" -eq 1 ]; then
  python3 - "$REPO/keys.json" "$DEST/keys.json" <<'EOF'
import json, os, sys

src, dst = sys.argv[1], sys.argv[2]
if not os.path.exists(dst):
    print(f"no {dst}: nothing to unbind")
    sys.exit(0)
with open(src) as f:
    ours = json.load(f)
with open(dst) as f:
    current = json.load(f)

removed = []
for section, bindings in ours.items():
    have = current.get(section)
    if not isinstance(have, dict):
        continue
    for key, action in bindings.items():
        if have.get(key) == action:
            del have[key]
            removed.append(f"{section}.{key} ({action})")

if removed:
    with open(dst, "w") as f:
        json.dump(current, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"updated {dst}, removed:")
    for line in removed:
        print(f"  {line}")
else:
    print(f"no bindings to remove from {dst}")
EOF
fi
