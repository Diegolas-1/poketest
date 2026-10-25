#!/usr/bin/env node
// The world-dependent parts of native/cast/cast.json (what tools/native/
// bake_cast.mjs writes besides the models): the things to read (town.use),
// the villagers, Oak's lab door, Route 1's road, the tall grass and Route 1's
// people and moving parts. The editor's world edits move and add those, so
// tools/editor/publish.mjs refreshes them with this instead of the full cast
// bake (which needs the local base model sources a fresh session lacks).
// The looks (models, materials, cloth) are kept as they are.
// Run: WEB_PORT=<a server on this checkout's web/> node tools/editor/bake_use.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = process.env.WEB_PORT || '8790';
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 200, height: 120 } });
p.on('pageerror', (e) => console.error('page error:', e.message));
await p.goto(`http://localhost:${PORT}/world/?test&q=high&outline=0`);
await p.waitForFunction(() => window.worldReady, null, { timeout: 400000 });
const res = await p.evaluate(async () => {
  const T = await import('/world/terrain.js'), N = await import('/world/nature.js');
  const w = window.world, out = {};
  const LOOK_OF = { Girl: 'girl', Fisher: 'fisher', Kid: 'kid', 'Prof. Oak': 'oak' };
  out.npcs = w.npcs.map((n) => ({ look: LOOK_OF[n.name], name: n.name, x: n.home.x, z: n.home.z, yaw: n.yaw, wander: n.wander, lines: n.lines }));
  out.use = w.town.use.map((u) => ({ x: +u.x.toFixed(3), z: +u.z.toFixed(3), r: u.r, label: u.label, lines: u.lines }));
  out.labDoor = w.town.labDoor;
  out.road = T.ROADS[0].map(([x, z]) => [+x.toFixed(3), +z.toFixed(3)]);
  out.tallGrass = N.TALL_GRASS;
  out.route1 = w.town.r1 || null;
  return out;
});
await b.close();
const f = path.join(ROOT, 'native/cast/cast.json');
const cast = JSON.parse(fs.readFileSync(f, 'utf8'));
Object.assign(cast, res);
fs.writeFileSync(f, JSON.stringify(cast));
console.log('cast.json: use', res.use.length, 'npcs', res.npcs.length);
