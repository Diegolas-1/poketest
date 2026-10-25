#!/usr/bin/env node
// Cuts a single-file bake of the native world (what bake.mjs and bake_ink.mjs
// make in their staging folder: world.json, town.glb, veg.bin, ink.bin...)
// into native/world's regions (see regions.mjs). The bakes call it
// themselves; this is for doing it by hand:
//
//   node tools/native/split_world.mjs <folder> [--parts world,ink]
//
// <folder> may be native/world itself holding an old single-file bake: the
// single files are removed once they are split. With GODOT set, Godot then
// imports the new files (commit their .import files with them).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitWorld, godotImport, report } from './regions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEST = path.join(ROOT, 'native/world');
const args = process.argv.slice(2);
const src = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(src)) { console.error('usage: split_world.mjs <folder with the single-file bake> [--parts world,ink]'); process.exit(1); }
const i = args.indexOf('--parts');
const parts = i >= 0 ? args[i + 1].split(',') : ['world', 'ink'].filter((p) => fs.existsSync(path.join(src, p === 'world' ? 'world.json' : 'ink.bin')));
const stats = splitWorld(src, DEST, parts);
if (src === DEST) {
  // the old single files (and their .import files)
  for (const f of fs.readdirSync(DEST)) if (fs.statSync(path.join(DEST, f)).isFile()) fs.rmSync(path.join(DEST, f));
}
report(stats, DEST);
godotImport(path.join(ROOT, 'native'));
