// Checks map blueprints (web/world/maps/*.json, format in web/world/maps/format.js)
// against the prop catalog: references, shapes, openings, stairs, prop
// placement, reachability and camera coverage. Exit code 1 on any error.
// Run: node tools/maps/validate.mjs [web/world/maps/oak_lab.json ...]
import fs from 'node:fs';
import path from 'node:path';
import { validate } from '../../web/world/maps/format.js';
import { CATALOG } from '../../web/world/props/catalog.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dir = path.join(ROOT, 'web/world/maps');
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
let bad = 0;
for (const f of files) {
  const bp = JSON.parse(fs.readFileSync(f, 'utf8'));
  const r = validate(bp, CATALOG);
  console.log(`${path.basename(f)}: ${r.errors.length} errors, ${r.warnings.length} warnings`);
  for (const e of r.errors) console.log('  error  ', e);
  for (const w of r.warnings) console.log('  warning', w);
  if (r.space) {
    const S = r.space;
    console.log(`  ${S.grid.nx}x${S.grid.nz} cells per level, ${S.levels.length} levels, ${S.colliders.length} colliders, ${S.uses.length} interactions, ${S.props.length} props, ${S.portals.length} portals`);
  }
  if (r.errors.length) bad++;
}
process.exit(bad ? 1 : 0);
