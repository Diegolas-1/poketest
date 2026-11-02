// Checks native/life/*.json the way native/life.gd and quests.gd read them:
// people's homes, friends and schedules (times, activities, places resolved
// as life.gd _goal does), dialogue speakers, relations and pairs, quests
// (givers, step people, items, unlock order), rumours and companions.
// Shared by the editor (in the browser) and tools/editor/check.mjs.
export function validateData({ people, places, dialogue, quests, lore, companions }) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);
  const ids = new Set((people?.people || []).map((p) => p.id));
  const houses = { ...(places?.houses || {}) }, pl = { ...(places?.places || {}) };
  // PALLET HOUSE's lists are made at load (life.gd _pallet_house), and its door is a house
  if (pl.pallet_house) { pl.pallet_house = { ...pl.pallet_house, terrace: 1, spots: 1, seats: 1, porch: 1, garden: 1, roses: 1, kitchen: 1, bench: 1, fence: 1 }; houses.pallet_house ||= { yard: [] }; }
  const acts = new Set(people?.activities || []);
  // a place string resolves (life.gd _goal)
  const placeOk = (s, home) => {
    if (s === 'home') return !!home;
    if (s.startsWith('route:')) return s.slice(6).split(',').every((h) => houses[h]);
    if (s === 'lighthouse' || houses[s]) return true;
    const [a, b] = s.split('.');
    if (b !== undefined && pl[a] && pl[a][b] !== undefined) return true;
    if (houses[a]) return b === undefined || ['door', 'doorway', 'porch', 'gate', 'lane', 'mailbox', 'yard'].includes(b);
    if (pl[a]) return b === undefined ? !!pl[a].spots : false;
    return false;
  };
  const hm = (t) => { const m = /^(\d\d):(\d\d)$/.exec(t); return m ? +m[1] * 60 + +m[2] : null; };
  if (people) {
    const seen = new Set();
    for (const p of people.people || []) {
      if (!p.id) { E('people.json: a person without an id'); continue; }
      if (seen.has(p.id)) E(`people.json: ${p.id} twice`);
      seen.add(p.id);
      if (p.home && !houses[p.home] && p.home !== 'lighthouse' && p.home !== 'pallet_house') W(`people.json: ${p.id}'s home "${p.home}" is not a house in places.json`);
      for (const f of p.friends || []) if (!ids.has(f)) W(`people.json: ${p.id}'s friend "${f}" is nobody`);
      for (const [day, blocks] of Object.entries(p.schedule || {})) {
        let last = -1;
        if (!Array.isArray(blocks) || !blocks.length) { E(`people.json: ${p.id} schedule ${day} is empty`); continue; }
        blocks.forEach((b, i) => {
          const at = `people.json: ${p.id} ${day} block ${i + 1}`;
          if (!Array.isArray(b) || b.length < 3) return E(`${at}: should be [time, activity, place, opts?]`);
          const t = hm(b[0]);
          if (t === null) E(`${at}: time "${b[0]}" is not HH:MM`); else { if (t < last) E(`${at}: ${b[0]} comes before the block above`); last = t; }
          if (acts.size && !acts.has(b[1])) W(`${at}: activity "${b[1]}" is not in the activities list`);
          for (const s of String(b[2]).split('|')) if (!placeOk(s, p.home)) W(`${at}: place "${s}" does not resolve (life.gd would send them home)`);
          const o = b[3];
          if (o) {
            if (o.p !== undefined && !(o.p >= 0 && o.p <= 1)) E(`${at}: p must be between 0 and 1`);
            if (o.else) { if (!Array.isArray(o.else) || o.else.length !== 2) E(`${at}: else must be [activity, place]`); else for (const s of String(o.else[1]).split('|')) if (!placeOk(s, p.home)) W(`${at}: else place "${s}" does not resolve`); }
          }
        });
        if (hm(blocks[0][0]) !== 0) W(`people.json: ${p.id} ${day} does not start at 00:00`);
      }
    }
  }
  if (dialogue) {
    for (const id of Object.keys(dialogue.people || {})) if (ids.size && !ids.has(id)) W(`dialogue.json: lines for "${id}", who is not in people.json`);
    for (const k of Object.keys(dialogue.relations || {})) if (k !== '_doc') for (const id of k.split('|')) if (ids.size && !ids.has(id)) W(`dialogue.json relations: "${id}" is nobody`);
    for (const [k, list] of Object.entries(dialogue.pairs || {})) {
      if (k === '_doc') continue;
      const pair = k.split('|');
      for (const ex of list) for (const ln of (Array.isArray(ex) ? ex : ex.lines || [])) if (Array.isArray(ln) && !pair.includes(ln[0])) W(`dialogue.json pairs ${k}: line spoken by "${ln[0]}"`);
    }
  }
  if (quests) {
    const qids = new Set(), items = quests.items || {};
    for (const q of quests.quests || []) { if (qids.has(q.id)) E(`quests.json: quest ${q.id} twice`); qids.add(q.id); }
    for (const q of quests.quests || []) {
      const at = `quests.json ${q.id}`;
      if (q.giver && ids.size && !ids.has(q.giver)) E(`${at}: giver "${q.giver}" is nobody`);
      for (const a of q.unlock?.after || []) if (!qids.has(a)) E(`${at}: unlock after "${a}", which is no quest`);
      if (!q.steps || !q.steps.length) E(`${at}: no steps`);
      (q.steps || []).forEach((s, i) => {
        const who = s.who === 'giver' ? [q.giver] : [].concat(s.who || []);
        for (const w of who) if (w && w !== 'giver' && ids.size && !ids.has(w)) E(`${at} step ${i + 1}: "${w}" is nobody`);
        for (const k of ['needs', 'give', 'take']) for (const it of [].concat(s[k] || [])) if (!items[it]) E(`${at} step ${i + 1}: ${k} item "${it}" is not in items`);
        if (s.say && !Array.isArray(s.say)) for (const w of Object.keys(s.say)) if (!who.includes(w)) W(`${at} step ${i + 1}: say has lines for "${w}", who is not in who`);
      });
      if (q.reward?.item && !items[q.reward.item]) E(`${at}: reward item "${q.reward.item}" is not in items`);
    }
  }
  if (lore) {
    const rids = new Set((lore.rumors || []).map((r) => r.id));
    for (const r of lore.rumors || []) {
      for (const t of Object.keys(r.tellers || {})) if (ids.size && !ids.has(t)) W(`lore.json ${r.id}: teller "${t}" is nobody`);
      if (r.requires && r.requires.startsWith('rumor:') && !rids.has(r.requires.slice(6))) E(`lore.json ${r.id}: requires unknown rumour ${r.requires}`);
    }
  }
  if (companions) for (const c of companions.companions || []) if (c.owner && ids.size && !ids.has(c.owner)) W(`companions.json ${c.id}: owner "${c.owner}" is nobody`);
  return { errors, warnings };
}
