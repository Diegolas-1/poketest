#!/usr/bin/env node
// Checks the editor's edits before they are published (tools/editor/publish.mjs
// runs it; run it by hand after a pull too):
//   - web/world/edits/world.json has the right shape and every tile it lists
//   - native/life/*.json parse and refer to things that exist (validate.mjs)
//   - with --game: the web game loads with the edits in a headless browser,
//     with no page errors, and every object edit still finds its piece
// Prints errors and warnings; exits 1 on any error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { validateLife } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function check({ game = false, port = process.env.WEB_PORT || '8790', log = console.log } = {}) {
  const errors = [], warnings = [];
  // ---------- the edit document ----------
  const dir = path.join(ROOT, 'web/world/edits');
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(path.join(dir, 'world.json'), 'utf8')); } catch (e) { errors.push('web/world/edits/world.json: ' + e.message); }
  if (doc) {
    if (doc.format !== 'pallet-edits v1') errors.push('world.json: unknown format ' + doc.format);
    for (const k of doc.tiles || []) if (!fs.existsSync(path.join(dir, 'tiles', k + '.png'))) errors.push('world.json lists a missing tile ' + k);
    for (const [id, e] of Object.entries(doc.objects || {})) {
      if (!e.at) warnings.push('object edit without an anchor: ' + id);
      for (const k of ['pos', 'rot', 'scl']) if (e[k] && (!Array.isArray(e[k]) || e[k].length !== 3 || e[k].some((v) => !Number.isFinite(v)))) errors.push(`${id}: bad ${k}`);
      if (e.scl && e.scl.some((v) => Math.abs(v) < 1e-3 || Math.abs(v) > 100)) errors.push(`${id}: scale out of range`);
    }
    const ids = new Set();
    for (const a of doc.added || []) {
      if (!a.id || ids.has(a.id)) errors.push('added object with a missing or repeated id: ' + a.id);
      ids.add(a.id);
      if (!/^(outdoor|prop|sign|tree|clone):|^(bush|rock)$/.test(a.kind || '')) errors.push(`${a.id}: unknown kind ${a.kind}`);
      if (!Array.isArray(a.pos) || a.pos.some((v) => !Number.isFinite(v))) errors.push(`${a.id}: bad position`);
      else if (Math.abs(a.pos[0]) > 500 || a.pos[2] < -900 || a.pos[2] > 320) errors.push(`${a.id}: outside the world`);
    }
    for (const r of [...Object.values(doc.roads?.edit || {}), ...(doc.roads?.added || [])]) if (r.ctrl && (r.ctrl.length < 2 || r.ctrl.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v))))) errors.push('a road with bad control points');
  }
  // ---------- the game data ----------
  const life = validateLife(ROOT);
  errors.push(...life.errors); warnings.push(...life.warnings);
  // ---------- the game loads ----------
  if (game && !errors.length) {
    const r = await loadGame(port);
    errors.push(...r.errors); warnings.push(...r.warnings);
  }
  for (const w of warnings) log('warning: ' + w);
  for (const e of errors) log('ERROR: ' + e);
  return { errors, warnings };
}

async function loadGame(port) {
  const errors = [], warnings = [];
  const PW = [process.env.PLAYWRIGHT, '/opt/node-tools/node_modules/playwright/index.mjs', '/opt/node22/lib/node_modules/playwright/index.mjs'].find((f) => f && fs.existsSync(f));
  if (!PW) return { errors, warnings: ['playwright not found: the game load was not checked'] };
  const { chromium } = await import(PW);
  const up = async () => { try { return (await fetch(`http://localhost:${port}/world/`)).ok; } catch { return false; } };
  if (!(await up())) {
    spawn('python3', ['-m', 'http.server', port], { cwd: path.join(ROOT, 'web'), stdio: 'ignore', detached: true }).unref();
    for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
  }
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const p = await b.newPage({ viewport: { width: 320, height: 200 } });
    p.on('pageerror', (e) => errors.push('page error: ' + e.message));
    await p.goto(`http://localhost:${port}/world/?test&q=high&outline=0`);
    await p.waitForFunction(() => window.worldReady, null, { timeout: 400000 });
    const r = await p.evaluate(async () => { const { E } = await import('/world/editlayer/index.js'); return { orphans: E.orphans }; });
    for (const o of r.orphans) warnings.push(`edit lost its piece (${o.kind}): ${o.id || o.key}${o.why ? ' ' + o.why : ''}`);
  } catch (e) { errors.push('the game did not load: ' + e.message); } finally { await b.close(); }
  return { errors, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await check({ game: process.argv.includes('--game') });
  console.log(r.errors.length ? `${r.errors.length} error(s)` : 'ok' + (r.warnings.length ? ` (${r.warnings.length} warning(s))` : ''));
  process.exit(r.errors.length ? 1 : 0);
}
