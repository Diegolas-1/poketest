#!/bin/sh
# Bundles stage.src.js and three.js into one plain script (no import maps or modules: older iPad Safari)
# and packs the model as base64 text. Needs esbuild and three@0.169.0 in $ESB (an npm prefix).
#   ./build.sh            stage.js + ashv2.glb.txt, for the published page
#   ./build.sh --single   also ashv2_stage.html: the whole stage in one file, to open anywhere
#                         (WEAR=jeans,shoes ./build.sh --single: what he starts out wearing)
cd "$(dirname "$0")"
NODE_PATH="$ESB/node_modules" "$ESB/node_modules/.bin/esbuild" stage.src.js --bundle --minify --format=iife --target=es2017 --outfile=stage.js
base64 -w0 ashv2.glb > ashv2.glb.txt
[ "$1" = "--single" ] || exit 0
{
  printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  sed -n '/<title>/,/<\/style>/p' index.html
  printf '</head><body>\n'
  sed -e '1,/<\/style>/d' -e '/<script src="stage.js"><\/script>/d' index.html
  printf '<script>window.ASHV2 = {glb: "%s"' "$(cat ashv2.glb.txt)"
  for k in color normal orm; do printf ', "ashv2_%s.webp": "%s"' $k "$(base64 -w0 ashv2_$k.webp)"; done
  printf ', "clothes.json": %s' "$(node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync("clothes.json","utf8")))')"
  [ -n "$WEAR" ] && printf ', "wear": "%s"' "$WEAR"
  printf '};</script>\n<script>\n'
  cat stage.js
  printf '</script>\n</body></html>\n'
} > ashv2_stage.html
