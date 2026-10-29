// Screenshots of web/world/people/preview.html (or another page) for checking
// the generator without a screen:
//   node tools/people/shot.mjs <out.png> '<query string>' [width] [height] [page]
// e.g. node tools/people/shot.mjs /tmp/a.png 'row=age:4,11,25|sex:0,1&view=full'
// Serves web/ on $WEB_PORT (8791) if nothing is there.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PW = [process.env.PLAYWRIGHT, '/opt/node-tools/node_modules/playwright/index.mjs', '/opt/node22/lib/node_modules/playwright/index.mjs'].find((f) => f && fs.existsSync(f));
const { chromium } = await import(PW || 'playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const [out, qs = '', W = '1200', Hh = '800', page = 'world/people/preview.html'] = process.argv.slice(2);
const PORT = process.env.WEB_PORT || '8791';
const up = async () => { try { return (await fetch(`http://localhost:${PORT}/world/`)).ok; } catch { return false; } };
if (!(await up())) {
  spawn('python3', ['-m', 'http.server', PORT], { cwd: path.join(ROOT, 'web'), stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +W, height: +Hh } });
const errs = [];
p.on('pageerror', (e) => errs.push('page error: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push('console: ' + m.text().slice(0, 300)); });
await p.goto(`http://localhost:${PORT}/${page}?${qs.replace(/#/g, '%23')}`);
const failed = new Promise((r) => p.on('pageerror', r));
try { await Promise.race([p.waitForFunction(() => window.ready, null, { timeout: +(process.env.TIMEOUT || 240000) }), failed]); }
catch (e) { errs.push('timeout'); }
const shots = (process.env.SHOTS || '').split(';').filter(Boolean);
if (errs.length) for (const e of errs) console.log(e);
if (shots.length && await p.evaluate(() => !!window.shot)) {
  for (const [i, s] of shots.entries()) {
    const [view, yaw] = s.split(',');
    await p.evaluate(([v, y]) => window.shot(v, +y), [view, yaw || 0]);
    await p.screenshot({ path: out.replace(/\.png$/, `_${i}.png`) });
  }
} else await p.screenshot({ path: out });
const info = await p.evaluate(() => document.getElementById('i')?.textContent || '');
console.log(info);
for (const e of errs) console.log(e);
await b.close();
