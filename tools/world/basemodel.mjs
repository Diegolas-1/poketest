// Builds the base body from the turnaround sheets (web/world/basemodel/body.js)
// in a headless browser and writes it to web/world/basemodel/ash_base.glb.
// Run: node tools/world/basemodel.mjs            (serves web/ on :8790 if nothing is there)
//      node tools/world/basemodel.mjs --shot=out.png [--bg=0]   also renders the
//      TURNAROUND_G layout (2000 x 1116, in the sheet's pixel space) to out.png
//      --view=angles|orbit  renders that view instead; --no-glb skips the export;
//      --query='cell=0.002&tris=60000' passes options to the page
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PW = [process.env.PLAYWRIGHT, '/opt/node-tools/node_modules/playwright/index.mjs', '/opt/node22/lib/node_modules/playwright/index.mjs'].find((f) => f && fs.existsSync(f));
if (!PW) throw new Error('playwright not found: set PLAYWRIGHT to its index.mjs');
const { chromium } = await import(PW);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const SHOT = arg('shot'), VIEW = arg('view') || 'sheet', BG = arg('bg'), QUERY = arg('query'), GLB = !process.argv.includes('--no-glb');

const PORT = process.env.WEB_PORT || '8790';
const up = async () => { try { return (await fetch(`http://localhost:${PORT}/world/`)).ok; } catch { return false; } };
if (!(await up())) {
  spawn('python3', ['-m', 'http.server', PORT], { cwd: path.join(ROOT, 'web'), stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const vp = VIEW === 'sheet' ? { width: 2000, height: 1116 } : { width: 1600, height: 1000 };
const p = await b.newPage({ viewport: vp });
p.on('pageerror', (e) => console.error('page error:', e.message));
p.on('console', (m) => console.log('page:', m.text().slice(0, 300)));
const qs = new URLSearchParams(QUERY);
qs.set('view', VIEW); if (BG) qs.set('bg', BG);
await p.goto(`http://localhost:${PORT}/world/basemodel.html?${qs}`);
await p.waitForFunction(() => window.basemodel, null, { timeout: 60000 });
await p.evaluate(() => window.basemodel.ready);
if (SHOT) {
  await p.waitForTimeout(1500);
  const png = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  fs.writeFileSync(SHOT, Buffer.from(png.split(',')[1], 'base64'));
  console.log('wrote', SHOT);
}
if (GLB) {
  const b64 = await p.evaluate(async () => {
    const u8 = new Uint8Array(await window.basemodel.exportGLB());
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const out = path.join(ROOT, 'web/world/basemodel/ash_base.glb');
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log('wrote', path.relative(ROOT, out), (fs.statSync(out).size / 1024).toFixed(0), 'KB');
}
await b.close();
