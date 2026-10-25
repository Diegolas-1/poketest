#!/usr/bin/env bash
# Sets up a fresh machine (a new cloud session) to bake and publish the
# native game: Godot 4.7.2 and its iOS export template, a Playwright Chromium,
# and (with --render) Vulkan + Xvfb for Godot renders. Everything is cached
# in ~/.cache/pallet and skipped when already there.
#   source tools/native/setup.sh          (exports GODOT and PLAYWRIGHT)
#   tools/native/setup.sh --render        (also the render packages)
# tools/editor/publish.mjs runs it before handling a publish request.
set -eu
V=4.7.2
CACHE="${PALLET_CACHE:-$HOME/.cache/pallet}"
mkdir -p "$CACHE"
REL="https://github.com/godotengine/godot/releases/download/$V-stable"

# ---------- Godot ----------
G="$CACHE/Godot_v$V-stable_linux.x86_64"
if [ -n "${GODOT:-}" ] && [ -x "$GODOT" ]; then G="$GODOT"; fi
if [ ! -x "$G" ]; then
  echo "setup: downloading Godot $V" >&2
  curl -fsSL "$REL/Godot_v$V-stable_linux.x86_64.zip" -o "$CACHE/godot.zip"
  (cd "$CACHE" && python3 -c "import zipfile,sys; zipfile.ZipFile('godot.zip').extractall('.')" && rm godot.zip)
  chmod +x "$G"
fi
export GODOT="$G"

# ---------- the iOS export template (only ios.zip and version.txt, read
# out of the 1.3 GB templates archive with HTTP ranges) ----------
T="$HOME/.local/share/godot/export_templates/$V.stable"
if [ ! -f "$T/ios.zip" ]; then
  echo "setup: fetching the iOS export template" >&2
  mkdir -p "$T"
  python3 - "$REL/Godot_v$V-stable_export_templates.tpz" "$T" <<'PY'
import sys, io, zipfile, urllib.request, os
url, out = sys.argv[1], sys.argv[2]
class Remote(io.RawIOBase):
    def __init__(s, url):
        s.url = url; s.pos = 0
        r = urllib.request.urlopen(urllib.request.Request(url, method='HEAD')); s.size = int(r.headers['Content-Length']); s.url = r.geturl()
    def seekable(s): return True
    def readable(s): return True
    def tell(s): return s.pos
    def seek(s, o, w=0):
        s.pos = o if w == 0 else s.pos + o if w == 1 else s.size + o
        return s.pos
    def read(s, n=-1):
        if n < 0: n = s.size - s.pos
        if n == 0 or s.pos >= s.size: return b''
        end = min(s.size, s.pos + n) - 1
        r = urllib.request.urlopen(urllib.request.Request(s.url, headers={'Range': f'bytes={s.pos}-{end}'}))
        d = r.read(); s.pos += len(d); return d
    def readinto(s, b):
        d = s.read(len(b)); b[:len(d)] = d; return len(d)
z = zipfile.ZipFile(io.BufferedReader(Remote(url), buffer_size=1 << 20))
for n in z.namelist():
    base = os.path.basename(n)
    if base in ('ios.zip', 'version.txt'):
        with z.open(n) as src, open(os.path.join(out, base), 'wb') as dst:
            while True:
                b = src.read(1 << 22)
                if not b: break
                dst.write(b)
        print('setup:', base, os.path.getsize(os.path.join(out, base)), file=sys.stderr)
PY
fi

# ---------- Playwright and its Chromium ----------
PW="${PLAYWRIGHT:-}"
for f in /opt/node-tools/node_modules/playwright/index.mjs /opt/node22/lib/node_modules/playwright/index.mjs "$CACHE/node_modules/playwright/index.mjs"; do
  if [ -z "$PW" ] && [ -f "$f" ]; then PW="$f"; fi
done
if [ -z "$PW" ]; then
  echo "setup: installing Playwright" >&2
  (cd "$CACHE" && npm install --silent --no-audit --no-fund playwright@1 >/dev/null && npx playwright install chromium >/dev/null)
  PW="$CACHE/node_modules/playwright/index.mjs"
fi
export PLAYWRIGHT="$PW"

# ---------- renders (Godot with Vulkan in Xvfb): only when asked ----------
if [ "${1:-}" = "--render" ]; then
  need=""
  dpkg -s mesa-vulkan-drivers >/dev/null 2>&1 || need="$need mesa-vulkan-drivers"
  command -v xvfb-run >/dev/null 2>&1 || need="$need xvfb"
  if [ -n "$need" ]; then echo "setup: installing$need" >&2; (sudo -n true 2>/dev/null && S=sudo || S=""; $S apt-get update -qq && $S apt-get install -y -qq $need >/dev/null); fi
fi
echo "GODOT=$GODOT"
echo "PLAYWRIGHT=$PLAYWRIGHT"
