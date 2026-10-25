// QA scan of the 3D world: loads web/world headless with every placed piece
// kept unmerged (?qa, town.js) and checks each piece, mesh and instance for
// orientation and placement bugs (checks.js runs in the page).
//
//   python3 -m http.server 8800 -d web &        (or any static server on web/)
//   node tools/qa/scan.mjs --port 8800 [--out tools/qa/findings.json] [--map map.png] [--only up,ground,...]
//
// Writes the findings JSON (id, check, severity, location, object, source,
// fix, owner) and a top-down map of them. Whitelisted findings (whitelist.json:
// intended tilts, open-sided structures...) are listed under "allowed" and do
// not count. Exit code 1 when anything not whitelisted is severity "high".
// Run it before publishing a world bake.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', '8800');
const OUT = path.resolve(arg('out', path.join(HERE, 'findings.json')));
const MAP = arg('map', null);
const ONLY = arg('only', '');
const BASE = `http://localhost:${PORT}`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
// three.js through a wrapper module that records, for every object added to a
// parent, where in web/world it was added (userData.__src: file:line frames),
// so a finding names the generator that placed it
const threeURL = /\/lib\/three\/three\.module\.min\.js$/;
await page.route(threeURL, (route) => route.fulfill({ contentType: 'text/javascript', body: `
export * from './three.real.js';
import { Object3D } from './three.real.js';
const add = Object3D.prototype.add;
Object3D.prototype.add = function (...objs) {
  const fr = new Error().stack.split('\\n').slice(2).map((l) => l.match(/at (?:([\\w$.]+) \\()?\\S*\\/world\\/([\\w./-]+\\.js):(\\d+)/)).filter(Boolean);
  for (const o of objs) if (o && o.userData && !o.userData.__src) { o.userData.__src = fr.slice(0, 6).map((m) => m[2] + ':' + m[3]); o.userData.__fn = fr.slice(0, 6).map((m) => m[1] || ''); }
  return add.apply(this, objs);
};` }));
await page.route(/\/lib\/three\/three\.real\.js$/, (route) => route.fulfill({ contentType: 'text/javascript', path: path.join(REPO, 'web/lib/three/three.module.min.js') }));

const t0 = Date.now();
await page.goto(`${BASE}/world/?test&q=high&qa`);
await page.waitForFunction(() => window.worldReady, null, { timeout: 900000 });
console.error(`world ready in ${((Date.now() - t0) / 1000).toFixed(0)} s, scanning...`);
await page.addScriptTag({ path: path.join(HERE, 'checks.js') });
const res = await page.evaluate(async (only) => { try { return await window.__qaRun({ only: only ? only.split(',') : null }); } catch (e) { return { error: e.stack }; } }, ONLY);
if (res.error) { console.error(res.error); process.exit(2); }

// whitelist: [{check, src | name | near: [x, z, r], why}]
const WL = JSON.parse(fs.readFileSync(path.join(HERE, 'whitelist.json'), 'utf8'));
// (prefer fn = a generator function on the object's stack, or near: line
// numbers move as the code changes)
const allowedBy = (f) => WL.find((w) => (!w.check || w.check === f.check)
  && (!w.fn || (f.fns || []).some((s) => s === w.fn || s.endsWith('.' + w.fn)) || (f.object || '').includes(' ' + w.fn + '()'))
  && (!w.src || (f.src || []).some((s) => s.startsWith(w.src)))
  && (!w.name || (f.object || '').includes(w.name))
  && (!w.near || Math.hypot(f.at[0] - w.near[0], f.at[2] - w.near[1]) < w.near[2]));
const findings = [], allowed = [];
for (const f of res.findings) { const w = allowedBy(f); if (w) allowed.push({ ...f, why: w.why }); else findings.push(f); }
findings.forEach((f, i) => { f.id = 'QA' + String(i + 1).padStart(3, '0'); });
const counts = {};
for (const f of findings) counts[f.check] = (counts[f.check] || 0) + 1;
const out = { scanned: res.stats, counts, total: findings.length, allowed: allowed.length + res.tagged.length, findings, allowedFindings: allowed, taggedInCode: res.tagged };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`checked ${JSON.stringify(res.stats)}`);
console.log(`${findings.length} findings (${allowed.length} whitelisted, ${res.tagged.length} tagged in code):`, JSON.stringify(counts));
for (const f of findings.slice(0, 60)) console.log(`${f.id} ${f.sev.padEnd(4)} ${f.check.padEnd(10)} (${f.at.map((v) => v.toFixed(1)).join(', ')}) ${f.object}  ${f.msg}`);

if (MAP) {
  // a top-down map: the world from above, findings as numbered dots
  const png = await page.evaluate(async (list) => window.__qaMap(list), findings.map((f) => ({ id: f.id, at: f.at, sev: f.sev })));
  fs.writeFileSync(MAP, Buffer.from(png.split(',')[1], 'base64'));
  console.log('map:', MAP);
}
await browser.close();
process.exit(findings.some((f) => f.sev === 'high') ? 1 : 0);
