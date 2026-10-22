#!/usr/bin/env bash
# Prints the patch ids of native/ as JSON (used by the iOS build to write
# native/patch_base.json into the app, and by publish_patch.mjs):
#   build     the commit (with "+dirty" when native/ has uncommitted changes)
#   built_at  its commit time (unix seconds; now when dirty)
#   engine    the Godot version, e.g. 4.7.2.stable (argument 1)
#   proj      what a patch cannot change: project.godot and boot.gd. A patch
#             with another proj id is refused; that change needs a new .ipa
#   src       one id per pack, from the git trees of its files (the working
#             tree when dirty), so the same sources always give the same id
# Packs, in load order (code last: its class list and uid cache win):
#   world (native/world), cast (native/cast), interiors (native/interiors),
#   code (everything else in native/).
# Usage: tools/native/pack_ids.sh 4.7.2.stable
set -euo pipefail
ENGINE="${1:?engine version, e.g. 4.7.2.stable}"
cd "$(git rev-parse --show-toplevel)"
ASSETS="world cast interiors"

# a tree of native/ as it is on disk (tracked + untracked, minus .gitignore)
IDX=$(mktemp); trap 'rm -f "$IDX"' EXIT
export GIT_INDEX_FILE="$IDX"
git read-tree HEAD
git add -A native
TREE=$(git write-tree --prefix=native/)
unset GIT_INDEX_FILE
HEAD_TREE=$(git rev-parse HEAD:native)

if command -v sha256sum >/dev/null; then h() { sha256sum | cut -c1-16; }; else h() { shasum -a 256 | cut -c1-16; }; fi
PRESETS=$(git rev-parse "$TREE:export_presets.cfg")
PROJECT=$(git rev-parse "$TREE:project.godot")
PROJ=$( { echo "$PROJECT"; git rev-parse "$TREE:boot.gd"; } | h)
SRC=""
for d in $ASSETS; do
  # (export presets and project settings change how a pack is exported)
  id=$( { git rev-parse "$TREE:$d"; echo "$PRESETS"; echo "$PROJECT"; } | h)
  SRC="$SRC\"$d\":\"$id\","
done
pat=$(echo $ASSETS | sed 's/ /|/g')
code=$(git ls-tree "$TREE" | awk -F'\t' -v p="^($pat)\$" '$2 !~ p' | h)
SRC="$SRC\"code\":\"$code\""

SHA=$(git rev-parse --short=12 HEAD)
if [ "$TREE" = "$HEAD_TREE" ]; then
  BUILD="$SHA"; AT=$(git log -1 --format=%ct HEAD)
else
  BUILD="$SHA+dirty"; AT=$(date +%s)
fi
printf '{"build":"%s","built_at":%s,"engine":"%s","proj":"%s","src":{%s}}\n' "$BUILD" "$AT" "$ENGINE" "$PROJ" "$SRC"
