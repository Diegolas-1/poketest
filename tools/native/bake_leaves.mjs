// The leaf atlases (web foliage.js leafAtlas: green, autumn, meadow, crop) at
// a higher resolution for the native game, with a smooth alpha: the alpha
// channel holds the signed distance to the leaf's edge, so the cut-out edge
// (veg_leaf, toon_cut) and the canopy's ink (ink_leaf) follow a smooth curve at
// any zoom instead of stepping along the texels, and mipmaps keep the edges
// smooth at a distance.
//
// The web paints each atlas on a 1024 px canvas (4 x 4 tiles of 256 px). Here
// the same painting runs on a canvas K times larger (the painting is all
// vector paths, so it is the same picture, sharper), then tools/native/
// leaf_sdf.py makes the OUT px atlas from it:
//   colour  the painting's colour, averaged over each texel's pixels by
//           coverage, and spread outward past the edge (no dark fringe when
//           the texture filter reaches outside the leaf)
//   alpha   0.5 + d / SPREAD, d = signed distance to the edge in texels
//           (inside > 0), clamped: the edge is at alpha 0.5 (the cut); each
//           tile on its own, so no tile's field leaks into the next
// The files keep the names the bake gave them (native/world/plants/leaf_<variant>_
// <hash>.png, and any town picture that is one of them: the town's copy of the
// green atlas is upside down, three.js flips canvas textures there). Pictures
// are found by comparing them with the 1024 px atlases painted here.
//
//   node tools/native/bake_leaves.mjs            rebuild every leaf atlas in native/world
//   node tools/native/bake_leaves.mjs --check    only report which files are leaf atlases
// Runs at the end of tools/native/bake.mjs too. Needs python3 with numpy, scipy
// and Pillow, and Playwright (as bake.mjs).
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const WORLD = path.join(ROOT, 'native/world');
export const OUT = 2048;      // the atlas's size (px): tiles of 512
export const K = 8;           // the painting's scale over the web's 1024 px (8192 px)
export const SPREAD = 24;     // alpha 0 .. 1 over this many texels across the edge
const VARIANTS = ['green', 'autumn', 'meadow', 'crop'];

export async function bakeLeaves({ check = false } = {}) {
  const PORT = process.env.WEB_PORT || '8790';
  const up = async () => { try { return (await fetch(`http://localhost:${PORT}/world/`)).ok; } catch { return false; } };
  if (!(await up())) {
    spawn('python3', ['-m', 'http.server', PORT], { cwd: path.join(ROOT, 'web'), stdio: 'ignore', detached: true }).unref();
    for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pallet-leaves-'));
  // (a software canvas: an 8192 px GPU canvas is lost now and then and comes back blank)
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-accelerated-2d-canvas'] });
  const p = await b.newPage({ viewport: { width: 200, height: 120 } });
  p.on('pageerror', (e) => console.error('page error:', e.message));
  // a blank page with the web's import map, and foliage.js painting at scale k
  // (window.LEAF_K) when asked
  await p.route('**/world/leafgen.html', (r) => r.fulfill({ contentType: 'text/html', body:
    '<!doctype html><script type="importmap">{ "imports": { "three": "../lib/three/three.module.min.js", "three/addons/": "../lib/three/addons/" } }</script><body></body>' }));
  const A = "const S = 256, c = document.createElement('canvas'); c.width = c.height = S * 4;\n  const ctx = c.getContext('2d');";
  await p.route('**/world/foliage.js*', async (route) => {
    const r = await route.fetch();
    const body = await r.text();
    if (!body.includes(A)) throw new Error('bake_leaves: foliage.js leafAtlas changed: update the patch');
    await route.fulfill({ response: r, headers: { ...r.headers(), 'content-type': 'text/javascript' },
      body: body.replace(A, "const S = 256, c = document.createElement('canvas'), LK = window.LEAF_K || 1; c.width = c.height = S * 4 * LK;\n  const ctx = c.getContext('2d'); ctx.scale(LK, LK);") });
  });
  await p.goto(`http://localhost:${PORT}/world/leafgen.html`);
  const files = {};
  for (const [k, tag] of [[1, 'ref'], ...(check ? [] : [[K, 'hi']])]) {
    for (const v of VARIANTS) {
      // a fresh module each time (leafAtlas caches its canvases)
      const b64s = await p.evaluate(async ({ v, k }) => {
        window.LEAF_K = k;
        const F = await import('/world/foliage.js?k=' + k + '&v=' + v);
        const cv = F.leafAtlas(v).image;
        const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
        cv.width = cv.height = 1;   // (free it: each variant is a new module that keeps its canvas)
        const u8 = new Uint8Array(await blob.arrayBuffer()), out = [];
        for (let i = 0; i < u8.length; i += 1 << 20) {
          let s = ''; const part = u8.subarray(i, i + (1 << 20));
          for (let j = 0; j < part.length; j += 0x8000) s += String.fromCharCode.apply(null, part.subarray(j, j + 0x8000));
          out.push(btoa(s));
        }
        return out;
      }, { v, k });
      const f = path.join(tmp, `${tag}_${v}.png`);
      if (b64s.reduce((n, s) => n + s.length, 0) < (k === 1 ? 200000 : 4000000)) throw new Error(`bake_leaves: the ${v} painting at ${k}x came out (nearly) empty`);
      fs.writeFileSync(f, Buffer.concat(b64s.map((s) => Buffer.from(s, 'base64'))));
      files[`${tag}_${v}`] = f;
    }
  }
  await b.close();
  const args = [path.join(ROOT, 'tools/native/leaf_sdf.py'), '--world', WORLD, '--tmp', tmp, '--out', String(OUT), '--spread', String(SPREAD)];
  if (check) args.push('--check');
  execFileSync('python3', args, { stdio: 'inherit' });
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (import.meta.url === `file://${process.argv[1]}`) await bakeLeaves({ check: process.argv.includes('--check') });
