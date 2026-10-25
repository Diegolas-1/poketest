// Checks native/life/*.json the way native/life.gd and quests.gd read them:
// people's homes, friends and schedules (times, activities, places resolved
// as life.gd _goal does), dialogue speakers, relations and pairs, quests
// (givers, step people, items, unlock order), rumours and companions.
// Used by tools/editor/check.mjs and by the editor (web/world/editor/life.js
// imports the same rules). validateLife(root) or validateData({people, places, ...}).
import fs from 'node:fs';
import path from 'node:path';
import { validateData } from '../../web/world/editor/lifecheck.js';
export { validateData };

export function validateLife(root) {
  const dir = path.join(root, 'native/life'), data = {}, errors = [];
  for (const f of ['people', 'places', 'dialogue', 'quests', 'lore', 'companions']) {
    const p = path.join(dir, f + '.json');
    if (!fs.existsSync(p)) continue;
    try { data[f] = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { errors.push(`native/life/${f}.json: ${e.message}`); }
  }
  const r = validateData(data);
  return { errors: [...errors, ...r.errors], warnings: r.warnings };
}

