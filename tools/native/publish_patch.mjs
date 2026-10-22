#!/usr/bin/env node
// Publishes an over-the-air patch of the native game (native/) for the phone.
//
// The installed app (boot.gd + updater.gd) reads
//   https://pallet-patches.jdohertybiochem.workers.dev/manifest.json?ch=stable
// and downloads the packs whose source changed since its own build. This
// script exports the packs with Godot (export presets "pack-<name>", iOS
// texture formats), uploads the new ones to the R2 bucket pallet-patches and
// writes the manifest. Packs whose sources did not change since the live
// manifest are reused as they are (no export, no upload).
//
//   node tools/native/publish_patch.mjs                 publish the committed native/
//   node tools/native/publish_patch.mjs --notes "..."   with a note for the phone
//   node tools/native/publish_patch.mjs --dry-run       export and show, upload nothing
//   node tools/native/publish_patch.mjs --status        the live manifest and history
//   node tools/native/publish_patch.mjs --rollback      live = the version before it
//   node tools/native/publish_patch.mjs --rollback --to 3
//   options: --channel <name> (default stable), --allow-dirty (uncommitted files,
//            for tests), --force-export (export every pack again)
//
// Needs: GODOT=<path to Godot 4.7.2> (the app's engine; patches from another
// version are refused by the phone), the iOS export template, wrangler (npx) and
// CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID in the environment. Commit first:
// the manifest records the commit, and the notes come from its log.
//
// What a patch cannot change (needs a new .ipa from the iOS workflow):
// project.godot (autoloads, input map, settings) and boot.gd; the engine
// version; anything native in the Xcode project (icons, Info.plist). Those
// change the "proj" id, and the phone then tells the player to reinstall.
// R2: packs/<file>, manifests/<ch>.json (live), manifests/<ch>/<v>.json,
// manifests/<ch>/index.json (history). Worker: workers/pallet-patches/.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = 'https://pallet-patches.jdohertybiochem.workers.dev';
const BUCKET = 'pallet-patches';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
const CH = opt('--channel', 'stable');
const PROJECT = join(ROOT, 'native');
if (!/^[a-z0-9_-]{1,32}$/.test(CH)) die('bad channel');

function die(m) { console.error('publish_patch: ' + m); process.exit(1); }
const run = (cmd, a, o = {}) => execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, ...o }).trim();

async function get(path) {
  const r = await fetch(URL + path, { headers: { 'cache-control': 'no-cache' } });
  if (r.status === 404) return null;
  if (!r.ok) die(`GET ${path}: ${r.status}`);
  return r.json();
}
async function exists(path) {
  const r = await fetch(URL + path, { method: 'HEAD' });
  return r.ok;
}

function put(key, file, type, cache) {
  const a = ['-y', 'wrangler@4', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--remote', '--content-type', type];
  if (cache) a.push('--cache-control', cache);
  const r = spawnSync('npx', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) die(`upload ${key} failed:\n${r.stdout}\n${r.stderr}`);
}
function putJSON(key, obj, dir) {
  const f = join(dir, key.replace(/\//g, '_'));
  writeFileSync(f, JSON.stringify(obj, null, 1) + '\n');
  put(key, f, 'application/json', 'no-cache');
}

function godot() {
  const g = process.env.GODOT || 'godot';
  let v;
  try { v = run(g, ['--version']); } catch { die('set GODOT to the Godot 4.7.2 binary'); }
  return { bin: g, engine: v.split('\n').pop().split('.').slice(0, 4).join('.') };
}

const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

async function status() {
  const m = await get(`/manifest.json?ch=${CH}`);
  const idx = (await get(`/history.json?ch=${CH}`)) || [];
  if (!m) return console.log(`channel ${CH}: nothing published`);
  console.log(`channel ${CH}: live v${m.v} (${m.date}, ${m.git.slice(0, 12)}, engine ${m.engine})`);
  for (const p of m.packs) console.log(`  ${p.name.padEnd(10)} ${p.file}  ${mb(p.size)}`);
  console.log('history:');
  for (const e of idx) console.log(`  v${e.v} ${e.date} ${e.git.slice(0, 12)}${e.rolled_back ? '  (rolled back)' : ''}${e.v === m.v ? '  <- live' : ''}  ${(e.notes || [])[0] || ''}`);
}

async function rollback() {
  const m = await get(`/manifest.json?ch=${CH}`);
  const idx = (await get(`/history.json?ch=${CH}`)) || [];
  if (!m) die('nothing published on ' + CH);
  let to = opt('--to');
  if (to === undefined) {
    const older = idx.filter((e) => e.v < m.v && !e.rolled_back).map((e) => e.v);
    if (!older.length) die(`no version before v${m.v} to go back to`);
    to = Math.max(...older);
  }
  to = Number(to);
  const target = await get(`/manifest.json?ch=${CH}&v=${to}`);
  if (!target) die(`v${to} not found`);
  const dir = mkdtempSync(join(tmpdir(), 'patch-'));
  for (const e of idx) if (e.v === m.v && to < m.v) e.rolled_back = true;
  for (const e of idx) if (e.v === to) delete e.rolled_back;
  putJSON(`manifests/${CH}/index.json`, idx, dir);
  putJSON(`manifests/${CH}.json`, target, dir);
  const live = await get(`/manifest.json?ch=${CH}`);
  if (live?.v !== to) die('the live manifest did not change');
  console.log(`channel ${CH}: live is now v${to} (was v${m.v}). Phones switch at their next check and launch.`);
}

async function publish() {
  const G = godot();
  const ids = JSON.parse(run('bash', [join(ROOT, 'tools/native/pack_ids.sh'), G.engine], { cwd: PROJECT }));
  if (ids.build.endsWith('+dirty') && !flag('--allow-dirty')) die('native/ has uncommitted changes: commit first (or --allow-dirty for a test)');
  const cur = await get(`/manifest.json?ch=${CH}`);
  const idx = (await get(`/history.json?ch=${CH}`)) || [];
  const dir = mkdtempSync(join(tmpdir(), 'patch-'));
  const packs = [];
  let imported = false;
  for (const name of Object.keys(ids.src)) {
    const old = cur?.engine === G.engine ? cur.packs.find((p) => p.name === name && p.src === ids.src[name]) : null;
    if (old && !flag('--force-export')) { packs.push(old); console.log(`${name}: unchanged, reusing ${old.file}`); continue; }
    if (!imported) {
      console.log('importing…');
      spawnSync(G.bin, ['--headless', '--path', PROJECT, '--import'], { stdio: 'ignore' });
      imported = true;
    }
    const out = join(dir, name + '.pck');
    const r = spawnSync(G.bin, ['--headless', '--path', PROJECT, '--export-pack', 'pack-' + name, out], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status !== 0 || !existsSync(out)) die(`export of pack-${name} failed:\n${(r.stderr || '').slice(-3000)}`);
    const h = sha256(out);
    const p = { name, file: `${name}-${h.slice(0, 16)}.pck`, sha256: h, size: statSync(out).size, src: ids.src[name], path: out };
    console.log(`${name}: exported ${p.file} (${mb(p.size)})`);
    packs.push(p);
  }
  const v = Math.max(0, cur?.v || 0, ...idx.map((e) => e.v)) + 1;
  const git = run('git', ['rev-parse', 'HEAD']) + (ids.build.endsWith('+dirty') ? '+dirty' : '');
  let log = [];
  const since = cur?.git?.replace('+dirty', '');
  try {
    if (since) run('git', ['merge-base', '--is-ancestor', since, 'HEAD']);
    log = run('git', ['log', '--format=%s', '-n', '15', ...(since ? [`${since}..HEAD`] : ['-n', '5']), '--', 'native']).split('\n').filter(Boolean);
  } catch { log = run('git', ['log', '--format=%s', '-n', '5', '--', 'native']).split('\n').filter(Boolean); }
  const notes = [...(opt('--notes') ? [opt('--notes')] : []), ...log];
  const m = {
    v, channel: CH, date: new Date().toISOString(), git, built_at: ids.built_at,
    engine: G.engine, proj: ids.proj, notes,
    packs: packs.map(({ name, file, sha256, size, src }) => ({ name, file, sha256, size, src })),
  };
  console.log(JSON.stringify(m, null, 1));
  if (flag('--dry-run')) return console.log(`dry run: packs in ${dir}`);
  for (const p of packs) {
    if (!p.path) continue;
    if (await exists('/packs/' + p.file)) { console.log(`${p.file}: already on the server`); continue; }
    console.log(`uploading ${p.file} (${mb(p.size)})…`);
    put('packs/' + p.file, p.path, 'application/octet-stream', 'public, max-age=31536000, immutable');
    if (!(await exists('/packs/' + p.file))) die(`${p.file} did not arrive`);
  }
  putJSON(`manifests/${CH}/${v}.json`, m, dir);
  idx.push({ v, date: m.date, git, notes: notes.slice(0, 3) });
  putJSON(`manifests/${CH}/index.json`, idx, dir);
  putJSON(`manifests/${CH}.json`, m, dir);
  const live = await get(`/manifest.json?ch=${CH}`);
  if (live?.v !== v) die('the live manifest did not update');
  console.log(`published v${v} on ${CH}: ${URL}/manifest.json?ch=${CH}`);
}

if (flag('--status')) await status();
else if (flag('--rollback')) await rollback();
else await publish();
