#!/usr/bin/env node
// Puts the world editor's "Publish to phone" requests into the game, safely
// and unattended (a scheduled Claude session runs it):
//
//   node tools/editor/publish.mjs              handle the newest pending request
//   node tools/editor/publish.mjs --dry-run    everything but push and publish
//   node tools/editor/publish.mjs --status     list the requests
//
// For the newest pending request (older pending ones are marked superseded):
//   1. exits at once when nothing is pending;
//   2. takes a lock: a lockfile here and a lease on the server (two runs on two
//      machines never collide); the lease is renewed while it works;
//   3. the repo must be clean; rebases on origin/main;
//   4. writes the version into the repo (pull.mjs, three-way merge of life files);
//   5. checks it: tools/qa/scan.mjs when it exists, and tools/editor/check.mjs
//      (edit document, life data, and the game loading with the edits); any
//      error and it stops, puts the files back and reports to the editor;
//   6. commits and pushes the edits; if the world changed, bakes the native
//      world, ink, cast and places (tools/native/bake*.mjs), commits and pushes;
//      life data only needs the code pack, so nothing is baked;
//   7. publishes the patch (tools/native/publish_patch.mjs; packs whose sources
//      did not change are reused) and marks the request done with the patch
//      version, or failed with the error. The editor's Versions window shows it.
//
// Needs: the editor passphrase (PALLET_EDITOR_TOKEN or ~/.pallet-editor-token),
// git push access, CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID (publish_patch.mjs).
// Godot 4.7.2, its iOS template and Chromium come from tools/native/setup.sh
// (run only when a request is pending, so an idle run stays instant).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { call, writeBundle } from './pull.mjs';
import { check } from './check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), flag = (k) => args.includes(k);
const DRY = flag('--dry-run');
const OWNER = `${os.hostname()}:${process.pid}`;
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const say = (t) => console.log(`[publish] ${t}`);

async function main() {
  if (flag('--status')) { for (const r of await call('GET', '/api/requests')) console.log(`#${r.id} v${r.version} ${r.status} ${new Date(r.at).toISOString()} ${r.message}`); return; }
  const reqs = await call('GET', '/api/requests');
  const pending = reqs.filter((r) => r.status === 'pending');
  if (!pending.length) { say('nothing pending'); return; }
  // ---------- the lock ----------
  const lockFile = path.join(os.tmpdir(), 'pallet-publish.lock');
  try { fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' }); } catch {
    const pid = +fs.readFileSync(lockFile, 'utf8');
    let alive = false; try { process.kill(pid, 0); alive = true; } catch { /* gone */ }
    if (alive) { say(`another run (pid ${pid}) is working`); return; }
    fs.writeFileSync(lockFile, String(process.pid));
  }
  let lease = null;
  try {
    lease = await call('POST', '/api/lock', { owner: OWNER, ttl: 3 * 3600e3 }).catch((e) => ({ ok: false, e }));
    if (!lease.ok) { say('the server lock is held by ' + (lease.held?.owner || '?')); return; }
    const renew = setInterval(() => call('POST', '/api/lock', { owner: OWNER, ttl: 3 * 3600e3 }).catch(() => {}), 20 * 60e3);
    try { await handle(pending); } finally { clearInterval(renew); }
  } finally {
    if (lease && lease.ok) await call('DELETE', '/api/lock', { owner: OWNER }).catch(() => {});
    fs.rmSync(lockFile, { force: true });
  }
}

// a fresh machine: Godot, the iOS template and Chromium (tools/native/setup.sh; cached after the first run)
function setup() {
  const r = spawnSync('bash', [path.join(ROOT, 'tools/native/setup.sh')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24, timeout: 3600e3 });
  if (r.status !== 0) throw new Error('tools/native/setup.sh failed:\n' + (r.stderr || '').slice(-2000));
  for (const l of r.stdout.split('\n')) { const m = /^(GODOT|PLAYWRIGHT)=(.+)$/.exec(l); if (m) process.env[m[1]] = m[2]; }
}
async function handle(pending) {
  const req = pending[pending.length - 1];
  for (const r of pending.slice(0, -1)) await call('POST', '/api/requests/' + r.id, { status: 'superseded', log: `superseded by request #${req.id}` });
  const report = (status, log, result) => call('POST', '/api/requests/' + req.id, { status, log, result }).catch((e) => say('could not report: ' + e.message));
  say(`request #${req.id}: version ${req.version} (${req.message})`);
  await report('working', `picked up by ${OWNER}`);
  try { setup(); } catch (e) { await report('failed', e.message); process.exitCode = 1; return; }
  let headR = git('rev-parse', 'HEAD');
  try {
    // ---------- 3. a clean tree on top of main ----------
    if (git('status', '--porcelain', '--untracked-files=no')) throw new Error('the repo has uncommitted changes: commit or stash them first');
    git('fetch', '-q', 'origin', 'main');
    git('rebase', '-q', 'FETCH_HEAD');
    headR = git('rev-parse', 'HEAD');
    // ---------- 4. the version into the repo ----------
    const b = await call('GET', '/api/versions/' + req.version);
    const { changed, conflicts } = writeBundle(b, { log: say });
    if (conflicts.length) await report('working', 'merged with changes made in the repo meanwhile (the editor\'s values kept): ' + conflicts.join(', '));
    const world = changed.some((f) => f.startsWith('web/world/edits/'));
    const life = changed.some((f) => f.startsWith('native/life/'));
    await report('working', changed.length ? 'changed: ' + changed.join(', ') : 'the version matches the repo already');
    // ---------- 5. checks ----------
    const logs = [];
    const qa = path.join(ROOT, 'tools/qa/scan.mjs');
    if (fs.existsSync(qa) && world) {
      const r = spawnSync('node', [qa], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 3600e3 });
      if (r.status !== 0) throw new Error('QA scan failed:\n' + (r.stdout + r.stderr).slice(-3000));
      logs.push('QA scan ok');
    }
    const port = world ? await ownServer() : null;
    const c = await check({ game: world, port, log: (t) => logs.push(t) });
    if (c.errors.length) throw new Error('checks failed:\n' + c.errors.join('\n'));
    await report('working', ['checks ok' + (c.warnings.length ? ` (${c.warnings.length} warnings)` : ''), ...logs.slice(-10)]);
    if (DRY) { say('dry run: stopping before commit'); git('checkout', '--', 'web/world/edits', 'native/life'); git('clean', '-fdq', 'web/world/edits'); await report('pending', 'dry run done (nothing pushed)'); return; }
    // ---------- 6. commit, bake, push ----------
    if (changed.length) {
      git('add', '-A', 'web/world/edits', 'native/life');
      git('commit', '-q', '-m', `Editor: version ${req.version} (${req.message || 'edits'})\n\nPublished from the world editor (request #${req.id}).`);
    }
    if (world) {
      const env = { ...process.env, WEB_PORT: port };
      for (const s of ['bake.mjs', 'bake_ink.mjs', 'bake_cast.mjs', 'bake_places.mjs']) {
        await report('working', 'baking: ' + s);
        const r = spawnSync('node', [path.join(ROOT, 'tools/native', s)], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 3 * 3600e3 });
        if (r.status !== 0) throw new Error(`${s} failed:\n` + (r.stdout + r.stderr).slice(-3000));
      }
      git('add', '-A', 'native');
      if (git('status', '--porcelain', 'native')) git('commit', '-q', '-m', `Rebake for editor version ${req.version}`);
    }
    push();
    // ---------- 7. the patch ----------
    if (!world && !life) { await report('done', 'nothing new to publish (the game already has this version)', { patch: null }); return; }
    await report('working', 'publishing the patch');
    const GODOT = process.env.GODOT || 'godot';
    const r = spawnSync('node', [path.join(ROOT, 'tools/native/publish_patch.mjs'), '--notes', `Editor: ${req.message || 'world edits'}`], { cwd: ROOT, env: { ...process.env, GODOT }, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 3 * 3600e3 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status !== 0) throw new Error('publish_patch failed:\n' + out.slice(-3000));
    const m = /published v(\d+) on (\S+)/.exec(out);
    await report('done', out.split('\n').filter((l) => /exported|reusing|published/.test(l)).slice(-8), { patch: m ? +m[1] : null, channel: m ? m[2] : null, git: git('rev-parse', 'HEAD') });
    say('done: patch v' + (m ? m[1] : '?'));
  } catch (e) {
    say('failed: ' + e.message);
    // put back anything not pushed
    try { if (!pushed) git('reset', '-q', '--hard', headR); git('checkout', '--', 'web/world/edits', 'native/life'); git('clean', '-fdq', 'web/world/edits'); } catch { /* */ }
    await report('failed', String(e.message).slice(0, 3800));
    process.exitCode = 1;
  }
}
// a web server on this checkout's web/ (bakes and checks must load this code,
// not another checkout's that happens to serve the usual port)
async function ownServer() {
  const probe = path.join(ROOT, 'web/world/.publish-probe'), nonce = OWNER + Math.random();
  fs.writeFileSync(probe, nonce);
  try {
    for (let port = 8791; port < 8811; port++) {
      const get = async () => { try { const r = await fetch(`http://localhost:${port}/world/.publish-probe`); return r.ok ? await r.text() : ''; } catch { return null; } };
      let t = await get();
      if (t === null) {
        spawnSync('bash', ['-c', `cd ${JSON.stringify(path.join(ROOT, 'web'))} && (python3 -m http.server ${port} >/dev/null 2>&1 &)`]);
        for (let i = 0; i < 50 && (t = await get()) === null; i++) await new Promise((r) => setTimeout(r, 200));
      }
      if (t === nonce) return String(port);
    }
  } finally { fs.rmSync(probe, { force: true }); }
  throw new Error('could not start a web server for this checkout');
}
let pushed = false;
function push() {
  for (let i = 0; i < 5; i++) {
    try { git('push', '-q', 'origin', 'HEAD:main'); pushed = true; return; } catch {
      git('fetch', '-q', 'origin', 'main');
      git('rebase', '-q', 'FETCH_HEAD');
    }
  }
  throw new Error('could not push to main');
}

main().catch((e) => { console.error('publish: ' + e.message); process.exit(1); });
