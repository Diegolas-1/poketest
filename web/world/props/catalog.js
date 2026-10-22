// The prop catalog: what every prop type IS, without how it is drawn (no
// three.js here, so map tools, validators and the native bake can read it).
// The drawing of each type lives in props/*.js (registered in props/index.js).
//
// Per type:
//   size   [w, d, h] metres at rot 0: w along x, d along z, h up. The prop's
//          origin is the middle of its footprint, on the floor (or on the
//          wall / under the ceiling for wall and ceiling mounts). Its front
//          faces +z at rot 0.
//   mount  'floor' (default) | 'wall' (back against a wall, y = height of its
//          middle) | 'ceiling' (hangs; y = the ceiling it hangs from) |
//          'top' (stands on another prop: y = that surface)
//   walk   'block' (default for floor props: a collider and blocked map cells)
//          | 'free' (walk through / under: rugs, hanging things)
//   shape  'box' (default) | 'round' footprint, for colliders and the plan
//   plan   how the top-down map draws it: a colour and a short label
//   params defaults for the builder (any key may be overridden per placement)
//   use    a default interaction (label + lines) a placement may replace
//   grow   notes on what the type should become as the library grows
export const CATALOG = {
  // ---------- furniture ----------
  desk: { size: [1.6, 0.8, 0.78], plan: ['#b07a4a', 'desk'], params: { wood: '#c9874f', drawers: 'right' } },
  desk_lamp: { size: [0.34, 0.34, 0.62], mount: 'top', walk: 'free', plan: ['#2f3b52', 'lamp'], params: { color: '#4a5a7a' } },
  swivel_chair: { size: [0.62, 0.62, 1.05], shape: 'round', plan: ['#7fa8d8', 'chair'], params: { color: '#8fb4e0' } },
  sofa: { size: [2.5, 0.95, 0.92], plan: ['#e8902e', 'sofa'], params: { color: '#f29a2e', seats: 3 },
    use: { label: 'Sit', lines: ['A big orange sofa. It still smells faintly of coffee.', 'PROF. OAK must nap here after long nights of research.'] } },
  drafting_table: { size: [1.3, 1.1, 1.55], plan: ['#e6eef2', 'drafting'], params: { tilt: 38 },
    use: { label: 'Look', lines: ['A drafting table. A half-finished blueprint is pinned to it.', 'It looks like plans for a new kind of POKé BALL.'] } },
  bookshelf: { size: [1.8, 0.46, 2.2], plan: ['#8a5a36', 'books'], params: { wood: '#9a6a40', shelves: 5, seed: 1 },
    use: { label: 'Read', lines: ['The shelves are crammed with research papers.', 'POKéMON EVOLUTION, VOL. 3... HABITATS OF KANTO... Heavy reading.'] } },
  round_table_holder: { size: [1.7, 1.7, 1.15], shape: 'round', plan: ['#3e8f7e', 'starters'], params: { balls: 3 },
    use: { label: 'Look', lines: ['Three POKé BALLS rest in the holder.', 'Each one holds a POKéMON PROF. OAK caught for new trainers.'] } },
  green_table: { size: [1.9, 1.0, 0.8], plan: ['#6cae6a', 'table'], params: { top: '#7cc07a' } },
  lab_counter: { size: [2.4, 0.75, 0.95], plan: ['#dfe6ea', 'counter'], params: { glass: 5, sink: false, seed: 1 },
    use: { label: 'Look', lines: ['Beakers and flasks bubble quietly on the counter.', 'Better not touch anything.'] } },
  crate: { size: [0.8, 0.8, 0.8], plan: ['#b88a52', 'crate'], params: { stack: 1, seed: 1 } },
  filing_cabinet: { size: [0.55, 0.65, 1.32], plan: ['#9aa6b0', 'files'], params: { color: '#a9b4bc' } },
  // ---------- machines ----------
  computer_console: { size: [2.6, 0.95, 2.0], plan: ['#cfd6dc', 'computer'], params: { beacon: '#ff5ea8' },
    use: { label: 'Look', lines: ['PROF. OAK\'s computer.', 'The screen is full of numbers about POKéMON growth and evolution.'] } },
  desk_computer: { size: [0.9, 0.6, 0.62], mount: 'top', walk: 'free', plan: ['#d9dde0', 'pc'], params: { screen: '#7fd0ff' } },
  tablet: { size: [0.26, 0.36, 0.06], mount: 'top', walk: 'free', plan: ['#e04848', 'dex'], params: { color: '#e0453e' } },
  specimen_tank: { size: [2.3, 2.1, 3.3], shape: 'round', plan: ['#53d6e0', 'tank'], params: { fluid: '#5fe8e6', duct: 4.6 },
    use: { label: 'Look', lines: ['A huge tank of glowing liquid.', 'It is used to study how POKéMON react to different energies.'] } },
  machinery_block: { size: [2.2, 1.3, 2.6], plan: ['#9fb2b0', 'machine'], params: { color: '#b9c8c6', beacon: '#ff4a3a', dials: 4, seed: 1 },
    use: { label: 'Look', lines: ['A big machine covered in dials and gauges.', 'The needles twitch. It hums like it\'s thinking.'] } },
  cylinder_machine: { size: [1.4, 1.4, 3.4], shape: 'round', plan: ['#8aa2c4', 'cylinder'], params: { color: '#9fb2cf', gauge: '#58d36a' } },
  green_tank_machine: { size: [1.7, 1.4, 2.7], plan: ['#7fc48a', 'green tank'], params: { fluid: '#8fe36a', color: '#a9bdb4' } },
  capsule_machine: { size: [1.3, 1.3, 1.95], plan: ['#f2f2f2', 'capsule'], params: { dome: '#e0473e' },
    use: { label: 'Look', lines: ['A white capsule machine with a red dome.', 'It is for sending POKéMON safely to the lab\'s storage system.'] } },
  // ---------- decor ----------
  potted_plant: { size: [0.62, 0.62, 1.2], shape: 'round', plan: ['#4f9a4a', 'plant'], params: { pot: '#c86a3e', size: 0.55, seed: 1 } },
  notice_board: { size: [1.3, 0.06, 0.9], mount: 'wall', walk: 'free', plan: ['#c8a670', 'board'], params: { title: 'NOTICES', lines: [] } },
  framed_picture: { size: [0.62, 0.05, 0.78], mount: 'wall', walk: 'free', plan: ['#b07a4a', 'pic'], params: { frame: '#b8864e', art: 'pokemon', seed: 1 } },
  wall_vent: { size: [0.62, 0.06, 0.42], mount: 'wall', walk: 'free', plan: ['#c9cfd2', 'vent'] },
  wall_clock: { size: [0.5, 0.06, 0.5], mount: 'wall', walk: 'free', plan: ['#f2efe6', 'clock'] },
  door_mat: { size: [1.5, 0.95, 0.02], walk: 'free', plan: ['#a64a3a', 'mat'], params: { color: '#a64a3a' } },
  rug: { size: [3.2, 2.2, 0.02], walk: 'free', plan: ['#7a6ab0', 'rug'], params: { color: '#7d6db8' } },
  globe: { size: [0.55, 0.55, 1.1], shape: 'round', plan: ['#4f8fc8', 'globe'] },
  // ---------- hanging ----------
  pendant_lamp: { size: [2.2, 2.2, 1.1], mount: 'ceiling', walk: 'free', shape: 'round', plan: ['#20252f', 'lamp'], params: { drop: 4.0, lights: 7 } },
  chain_hoist: { size: [0.6, 0.6, 2.0], mount: 'ceiling', walk: 'free', plan: ['#4a4f58', 'hoist'], params: { drop: 2.6 } },
  panel_light: { size: [1.2, 0.6, 0.06], mount: 'ceiling', walk: 'free', plan: ['#fffbe8', 'light'] },
  // ---------- architecture placed as props ----------
  door: { size: [1.1, 0.12, 2.3], mount: 'wall', walk: 'free', plan: ['#8a5634', 'door'], params: { wood: '#8a5634', locked: true },
    use: { label: 'Door', lines: ['It\'s locked.'] } },
};

export const propSize = (p, cat = CATALOG) => {
  const c = cat[p.type];
  const s = (p.params && p.params.size3) || (c ? c.size : [1, 1, 1]);
  const k = (p.params && p.params.scale) || 1;
  return [s[0] * k, s[1] * k, s[2] * k];
};
