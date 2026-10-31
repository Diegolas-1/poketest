#!/usr/bin/env bash
# Builds the TV output GDExtension for the iPhone (on a Mac with Xcode; ios.yml runs
# it before the export) and writes, into the folder given (native/tv/ios in CI):
#   libpallet_tv.a           the plugin and godot-cpp in one static archive
#   pallet_tv.gdextension    the extension's description (iOS only: a desktop run
#                            never sees it, the folder is in .gitignore)
# The export links the archive into the app and registers its entry symbol;
# GDScript reaches it as the engine singleton "PalletTV" (native/tv/tv_link.gd).
#   tools/native/tv_plugin/build_ios.sh native/tv/ios
# GODOT_CPP: a godot-cpp checkout (cloned at $TAG when missing; ~/godot-cpp by default)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(mkdir -p "$1" && cd "$1" && pwd)
CPP=${GODOT_CPP:-$HOME/godot-cpp}
TAG=godot-4.5-stable
if [ ! -f "$CPP/SConstruct" ]; then
  rm -rf "$CPP"
  git clone -q --depth 1 --branch "$TAG" https://github.com/godotengine/godot-cpp "$CPP"
fi
cd "$HERE"
JOBS=$(sysctl -n hw.ncpu 2>/dev/null || nproc)
GODOT_CPP="$CPP" scons platform=ios arch=arm64 target=template_release ios_min_version=16.0 \
  build_profile="$HERE/build_profile.json" -j"$JOBS"
LIB=bin/libpallet_tv.ios.template_release.arm64.a
CPPLIB=$(ls "$CPP"/bin/libgodot-cpp.ios.template_release.arm64*.a | head -1)
# the Objective-C side, with ARC and modules (so the frameworks it uses, AVKit,
# Metal, QuartzCore..., are named in the object and linked into the app by
# themselves, with no change to the exported Xcode project)
xcrun -sdk iphoneos clang -arch arm64 -miphoneos-version-min=16.0 -fobjc-arc -fmodules -O2 \
  -Wall -Wno-deprecated-declarations -Isrc -c src/tv_ios.m -o bin/tv_ios.o
otool -l bin/tv_ios.o | grep -A4 LC_LINKER_OPTION | grep -E "string" | head -12 || true
libtool -static -o "$OUT/libpallet_tv.a" "$LIB" bin/tv_ios.o "$CPPLIB"
# the entry point and the Objective-C side are in it, for arm64
nm -g "$OUT/libpallet_tv.a" > bin/syms.txt 2>/dev/null || true
grep " T _pallet_tv_init" bin/syms.txt || { echo "build_ios: no _pallet_tv_init"; exit 1; }
grep " T _pt_tv_status" bin/syms.txt || { echo "build_ios: no _pt_tv_status"; exit 1; }
lipo -info "$OUT/libpallet_tv.a"
cat > "$OUT/pallet_tv.gdextension" <<'GDE'
[configuration]

entry_symbol = "pallet_tv_init"
compatibility_minimum = "4.5"
reloadable = false

[libraries]

ios.arm64 = "res://tv/ios/libpallet_tv.a"
GDE
ls -la "$OUT"
