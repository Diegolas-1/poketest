#!/usr/bin/env bash
# Builds Pokémon Red (or Blue) from the pret/pokered disassembly and copies the
# ROM into web/ so the browser player can load it.
#   ./build.sh          # Red
#   ./build.sh blue     # Blue
set -euo pipefail
cd "$(dirname "$0")"

GAME="${1:-red}"
case "$GAME" in red|blue) ;; *) echo "usage: $0 [red|blue]" >&2; exit 1 ;; esac

RGBDS_VERSION=1.0.4
RGBDS_DIR="$PWD/tools/rgbds-$RGBDS_VERSION"

if [ ! -f pokered/Makefile ]; then
  git submodule update --init pokered
fi

# Use rgbds from PATH if it is the right version, else download the release.
if command -v rgbasm >/dev/null && rgbasm --version | grep -q "v$RGBDS_VERSION"; then
  :
else
  if [ ! -x "$RGBDS_DIR/rgbasm" ]; then
    case "$(uname -s)-$(uname -m)" in
      Linux-x86_64) ASSET=rgbds-linux-x86_64.tar.xz ;;
      Darwin-*)     ASSET=rgbds-macos.zip ;;
      *) echo "No prebuilt rgbds $RGBDS_VERSION for $(uname -s)-$(uname -m); install it: https://rgbds.gbdev.io/install" >&2; exit 1 ;;
    esac
    mkdir -p "$RGBDS_DIR"
    URL="https://github.com/gbdev/rgbds/releases/download/v$RGBDS_VERSION/$ASSET"
    echo "Downloading $URL"
    curl -fsSL -o "$RGBDS_DIR/$ASSET" "$URL"
    case "$ASSET" in
      *.tar.xz) tar -xf "$RGBDS_DIR/$ASSET" -C "$RGBDS_DIR" ;;
      *.zip)    unzip -qo "$RGBDS_DIR/$ASSET" -d "$RGBDS_DIR" ;;
    esac
  fi
  export PATH="$RGBDS_DIR:$PATH"
fi

JOBS="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)"
make -C pokered -j"$JOBS" "$GAME"

ROM="pokered/poke$GAME.gbc"
(cd pokered && sha1sum -c --ignore-missing roms.sha1) || echo "warning: checksum does not match the original ROM" >&2
cp "$ROM" web/pokered.gbc
echo "Built $ROM -> web/pokered.gbc"
echo "Play: python3 -m http.server 8000 -d web, then open http://localhost:8000"
