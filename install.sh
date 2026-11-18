#!/usr/bin/env bash
# Install (or reinstall) every Herdr mod in ./mods and merge the key bindings
# from ./keys.json into the Herdr config. Safe to run again: mods that are
# already installed are replaced, and bindings already present are kept as-is.
#
# Usage: ./install.sh [--copy] [--no-keys]
#   --copy     copy the mod folders instead of symlinking them
#   --no-keys  leave keys.json alone
# HERDR_CONFIG overrides the config folder (default ~/.config/herdr-app).

set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
DEST="${HERDR_CONFIG:-$HOME/.config/herdr-app}"
MODE=link
KEYS=1

for arg in "$@"; do
  case "$arg" in
    --copy) MODE=copy ;;
    --no-keys) KEYS=0 ;;
    -h | --help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

mkdir -p "$DEST/mods"

installed=()
for dir in "$REPO"/mods/*/; do
  dir="${dir%/}"
  [ -f "$dir/mod.json" ] || continue
  name="$(basename "$dir")"
  target="$DEST/mods/$name"

  verb=installed
  if [ -L "$target" ] || [ -e "$target" ]; then
    verb=reinstalled
    # A symlink is replaced by ln -sfn; a copied folder has to go first.
    if [ ! -L "$target" ] || [ "$MODE" = copy ]; then
      rm -rf "$target"
    fi
  fi

  if [ "$MODE" = copy ]; then
    cp -r "$dir" "$target"
  else
    ln -sfn "$dir" "$target"
  fi
  echo "$verb $name ($MODE)"
  installed+=("$name")
done

if [ "${#installed[@]}" -eq 0 ]; then
  echo "no mods found in $REPO/mods" >&2
  exit 1
fi

if [ "$KEYS" -eq 1 ]; then
  python3 - "$REPO/keys.json" "$DEST/keys.json" <<'EOF'
import json, os, sys

src, dst = sys.argv[1], sys.argv[2]
with open(src) as f:
    wanted = json.load(f)
current = {}
if os.path.exists(dst):
    with open(dst) as f:
        current = json.load(f)

changed = []
for section, bindings in wanted.items():
    have = current.setdefault(section, {})
    for key, action in bindings.items():
        if have.get(key) != action:
            have[key] = action
            changed.append(f"{section}.{key} -> {action}")

if changed:
    with open(dst, "w") as f:
        json.dump(current, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"updated {dst}:")
    for line in changed:
        print(f"  {line}")
else:
    print(f"key bindings already in {dst}")
EOF
fi

if command -v herdr-app >/dev/null 2>&1; then
  failed=0
  for name in "${installed[@]}"; do
    herdr-app check "$DEST/mods/$name" || failed=1
  done
  exit "$failed"
else
  echo "herdr-app not on PATH: skipped mod checks"
fi
