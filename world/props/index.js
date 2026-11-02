// The prop library: one builder per catalog type (props/catalog.js says what
// each type is; furniture.js, machines.js and decor.js draw them). A new prop
// type = a catalog entry + a builder registered here.
//   buildProp(placement) -> THREE.Group, footprint centred on the origin,
//   front toward +z (the caller places and turns it)
import * as THREE from 'three';
import { CATALOG } from './catalog.js';
import * as F from './furniture.js';
import * as M from './machines.js';
import * as D from './decor.js';
import * as FA from './farm.js';
import * as BK from './buildings.js';
import * as CR from '../crops.js';
import * as HM from './home.js';

// outdoor builders take their own option names; these adapt a placement's params
const flatGround = () => 0;
const cottage = ({ params: p }) => BK.building({ W: p.W, D: p.D, floors: p.floors, seed: p.seed,
  wall: { kind: p.wall, col: p.wallCol }, roof: { type: p.roof, cover: p.cover, col: p.roofCol },
  chimney: p.chimney ? { x: -p.W * 0.28, z: -p.D * 0.15 } : [],
  openings: [{ face: 'front', kind: 'door', x: -p.W * 0.22, canopy: true, lamp: 'right' },
    { face: 'front', kind: 'window', x: p.W * 0.22, w: 1.4, h: 1.3, panes: [3, 2], box: '#c99a62' },
    { face: 'back', kind: 'window', x: 0 }, { face: 'left', kind: 'window', x: 0 }, { face: 'right', kind: 'window', x: 0, shutters: '#3f7a52' },
    ...(p.floors > 1 ? [{ face: 'front', kind: 'window', x: -p.W * 0.22, floor: 1 }, { face: 'front', kind: 'window', x: p.W * 0.22, floor: 1 }] : [])] });
const cropBed = ({ params: p, size }) => {
  const G = new THREE.Group();
  const one = p.crop && CR.CROPS.includes(p.crop) ? [[p.crop, p.spacing || 0.55, p.stage ?? 2]] : undefined;
  FA.cropField(G, { x: 0, z: 0, w: size[0], d: size[1], rot: 0, kind: p.kind }, flatGround, { plan: one, seed: p.seed || 1 });
  return G;
};
const cropPlant = ({ params: p }) => { const G = new THREE.Group(); CR.plantAt(G, p.crop, [[0, 0, 0, 0, 1]], { stage: p.stage, seeds: 1 }); return G; };

export const PROPS = {
  desk: F.desk, swivel_chair: F.swivel_chair, sofa: F.sofa, drafting_table: F.drafting_table, bookshelf: F.bookshelf,
  round_table_holder: F.round_table_holder, green_table: F.green_table, lab_counter: F.lab_counter, crate: F.crate,
  filing_cabinet: F.filing_cabinet, door_mat: F.door_mat, rug: F.rug,
  computer_console: M.computer_console, desk_computer: M.desk_computer, tablet: M.tablet, specimen_tank: M.specimen_tank,
  machinery_block: M.machinery_block, cylinder_machine: M.cylinder_machine, green_tank_machine: M.green_tank_machine, capsule_machine: M.capsule_machine,
  potted_plant: D.potted_plant, notice_board: D.notice_board, framed_picture: D.framed_picture, wall_vent: D.wall_vent, wall_clock: D.wall_clock,
  globe: D.globe, desk_lamp: D.desk_lamp, pendant_lamp: D.pendant_lamp, chain_hoist: D.chain_hoist, panel_light: D.panel_light, door: D.door,
  kit_cottage: cottage, kit_shed: ({ params: p }) => FA.farmShed(p), gazebo: ({ params: p }) => BK.gazebo(p),
  crop_bed: cropBed, crop_plant: cropPlant, scarecrow: ({ params: p }) => FA.scarecrow(p), hay_bale: ({ params: p }) => FA.haybale(p),
  square_bale: () => FA.squareBale(), wheelbarrow: ({ params: p }) => FA.wheelbarrow(p), watering_can: ({ params: p }) => FA.wateringCan(p),
  tool_rack: () => FA.toolRack(), water_trough: () => FA.trough(), produce_crates: ({ params: p }) => FA.crateStack(p),
  grain_sack: ({ params: p }) => FA.sack(p), garden_trellis: () => FA.trellis(),
  dining_table: HM.dining_table, dining_chair: HM.dining_chair, kitchen_counter: HM.kitchen_counter, stove: HM.stove, fridge: HM.fridge,
  wall_cabinets: HM.wall_cabinets, range_hood: HM.range_hood, tv_set: HM.tv_set, home_sofa: HM.home_sofa, armchair: HM.armchair,
  coffee_table: HM.coffee_table, side_table: HM.side_table, flower_vase: HM.flower_vase, photo_frame: HM.photo_frame, apron_hook: HM.apron_hook,
  broom: HM.broom, entry_bench: HM.entry_bench, umbrella_stand: HM.umbrella_stand, staircase: HM.staircase, curtains: HM.curtains,
  hanging_lamp: HM.hanging_lamp, wall_lamp: HM.wall_lamp, wall_shelf: HM.wall_shelf, telephone: HM.telephone, fruit_bowl: HM.fruit_bowl,
  inn_counter: HM.inn_counter, menu_board: HM.menu_board, fireplace: HM.fireplace, plate_dresser: HM.plate_dresser, barrel: HM.barrel,
  coat_stand: HM.coat_stand, low_table: HM.low_table, zabuton: HM.zabuton, tea_set: HM.tea_set, hanging_scroll: HM.hanging_scroll,
  tokonoma: HM.tokonoma, ikebana: HM.ikebana, andon: HM.andon, paper_lantern: HM.paper_lantern, tea_counter: HM.tea_counter,
  folding_screen: HM.folding_screen, bonsai: HM.bonsai, shoji_panel: HM.shoji_panel,
  bed: HM.bed, alarm_clock: HM.alarm_clock, poster: HM.poster, plush: HM.plush, backpack: HM.backpack, clothes_pile: HM.clothes_pile,
};

export function buildProp(p, cat = CATALOG) {
  const c = cat[p.type];
  const params = { ...(c.params || {}), ...(p.params || {}) };
  const s = params.size3 || c.size, k = params.scale || 1;
  const G = PROPS[p.type]({ id: p.id, params, size: [s[0] * k, s[1] * k, s[2] * k] });
  G.name = 'prop_' + p.id;
  G.userData.prop = p.id;
  return G;
}
export const missingBuilders = () => Object.keys(CATALOG).filter((t) => !PROPS[t]);
void THREE;
