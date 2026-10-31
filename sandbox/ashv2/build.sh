#!/bin/sh
# Bundles stage.src.js and three.js into one plain script (no import maps or modules: older iPad Safari)
# and packs the model as base64 text. Needs esbuild and three@0.169.0 in $ESB (an npm prefix).
cd "$(dirname "$0")"
NODE_PATH="$ESB/node_modules" "$ESB/node_modules/.bin/esbuild" stage.src.js --bundle --minify --format=iife --target=safari14 --outfile=stage.js
base64 -w0 ashv2.glb > ashv2.glb.txt
