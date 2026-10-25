#!/usr/bin/env node
// Writes the world editor's edits into the repo (web/world/edits/ and the
// edited native/life/*.json), from the pallet-editor Worker.
//
//   node tools/editor/pull.mjs                 the latest saved version
//   node tools/editor/pull.mjs --version 7     that version
//   node tools/editor/pull.mjs --draft         the working draft (unsaved work)
//   node tools/editor/pull.mjs --file b.json   a bundle saved to a file
//   options: --commit "message" (git add + commit what changed), --dry-run
//
// Needs the editor passphrase: PALLET_EDITOR_TOKEN in the environment, or the
// file ~/.pallet-editor-token. The bundle is { doc, tiles: { key: base64 PNG },
// life: { 'people.json': { base, data } }, meta }. Life files are merged three
// ways: what the editor changed (base -> data) is applied to the file as it is
// in the repo now, key by key, so other changes made in the repo meanwhile are
// kept; where both changed the same key, the editor wins and it is reported.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const API = process.env.PALLET_EDITOR_API || 'https://pallet-editor.jdohertybiochem.workers.dev';
export function token() {
  if (process.env.PALLET_EDITOR_TOKEN) return process.env.PALLET_EDITOR_TOKEN.trim();
  const f = path.join(os.homedir(), '.pallet-editor-token');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  throw new Error('set PALLET_EDITOR_TOKEN (the editor passphrase) or write it to ~/.pallet-editor-token');
}
export async function call(method, p, body) {
  const r = await fetch(API + p, { method, headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { error: t }; }
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${j.error || ''}`);
  return j;
}

// ---------- three-way JSON merge ----------
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function merge3(base, mine, theirs, at = '', conflicts = []) {
  if (eq(mine, base)) return theirs;          // the editor did not touch it
  if (eq(theirs, base) || eq(theirs, mine)) return mine;
  if (isObj(base) && isObj(mine) && isObj(theirs)) {
    const out = {};
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(base)])) {
      const v = merge3(base[k], mine[k], theirs[k], at + '/' + k, conflicts);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  // arrays of records with an id (people, quests...): merged by id
  if (Array.isArray(base) && Array.isArray(mine) && Array.isArray(theirs) && [...base, ...mine, ...theirs].every((x) => isObj(x) && x.id !== undefined)) {
    const by = (l) => new Map(l.map((x) => [x.id, x]));
    const B = by(base), M = by(mine), T = by(theirs), out = [];
    const order = [...theirs.map((x) => x.id), ...mine.map((x) => x.id).filter((id) => !T.has(id))];
    for (const id of order) { const v = merge3(B.get(id), M.get(id), T.get(id), `${at}[${id}]`, conflicts); if (v !== undefined) out.push(v); }
    return out;
  }
  conflicts.push(at || '/');
  return mine;
}

// JSON with short arrays (numbers, coordinates) kept on one line: readable diffs
export function pretty(v) {
  return JSON.stringify(v, null, 1).replace(/\[\s*([^\[\]{}]*?)\s*\]/g, (m, inner) => (inner.length < 120 ? '[' + inner.replace(/\s*\n\s*/g, ' ') + ']' : m));
}

// ---------- writing a bundle into the repo ----------
export function writeBundle(b, { dry = false, log = console.log } = {}) {
  const dir = path.join(ROOT, 'web/world/edits'), tdir = path.join(dir, 'tiles');
  const changed = [];
  const put = (f, data) => {
    const old = fs.existsSync(f) ? fs.readFileSync(f) : null;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (old && old.equals(buf)) return;
    changed.push(path.relative(ROOT, f));
    if (!dry) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); }
  };
  const doc = { ...b.doc, tiles: Object.keys(b.tiles || {}).sort() };
  put(path.join(dir, 'world.json'), pretty(doc) + '\n');
  for (const [k, v] of Object.entries(b.tiles || {})) {
    if (!/^[hpm]_\d+_\d+$/.test(k)) throw new Error('bad tile name ' + k);
    put(path.join(tdir, k + '.png'), Buffer.from(v, 'base64'));
  }
  if (fs.existsSync(tdir)) for (const f of fs.readdirSync(tdir)) if (f.endsWith('.png') && !(f.slice(0, -4) in (b.tiles || {}))) { changed.push('web/world/edits/tiles/' + f + ' (removed)'); if (!dry) fs.rmSync(path.join(tdir, f)); }
  const conflicts = [];
  for (const [name, { base, data }] of Object.entries(b.life || {})) {
    if (!/^[\w.-]+\.json$/.test(name)) throw new Error('bad life file ' + name);
    const f = path.join(ROOT, 'native/life', name);
    const theirs = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : base;
    const c = [];
    const merged = base === undefined ? data : merge3(base, data, theirs, '', c);
    for (const x of c) conflicts.push(name + x);
    put(f, JSON.stringify(merged, null, 1) + '\n');
  }
  for (const c of conflicts) log('both changed (the editor\'s value kept): ' + c);
  return { changed, conflicts };
}

async function main() {
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; }, flag = (k) => args.includes(k);
  let b, label;
  if (opt('--file')) { b = JSON.parse(fs.readFileSync(opt('--file'), 'utf8')); label = opt('--file'); }
  else if (flag('--draft')) { b = await call('GET', '/api/draft'); label = 'draft'; }
  else {
    let v = opt('--version');
    if (!v) { const vs = await call('GET', '/api/versions'); if (!vs.length) throw new Error('no saved versions yet'); v = vs[vs.length - 1].id; }
    b = await call('GET', '/api/versions/' + v); label = 'version ' + v;
  }
  const { changed } = writeBundle(b, { dry: flag('--dry-run') });
  console.log(`${label}: ${changed.length ? changed.join('\n  ') : 'nothing changed'}`);
  if (opt('--commit') && changed.length && !flag('--dry-run')) {
    execFileSync('git', ['add', '-A', 'web/world/edits', 'native/life'], { cwd: ROOT });
    execFileSync('git', ['commit', '-q', '-m', opt('--commit')], { cwd: ROOT, stdio: 'inherit' });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error('pull: ' + e.message); process.exit(1); });
