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

export const PROPS = {
  desk: F.desk, swivel_chair: F.swivel_chair, sofa: F.sofa, drafting_table: F.drafting_table, bookshelf: F.bookshelf,
  round_table_holder: F.round_table_holder, green_table: F.green_table, lab_counter: F.lab_counter, crate: F.crate,
  filing_cabinet: F.filing_cabinet, door_mat: F.door_mat, rug: F.rug,
  computer_console: M.computer_console, desk_computer: M.desk_computer, tablet: M.tablet, specimen_tank: M.specimen_tank,
  machinery_block: M.machinery_block, cylinder_machine: M.cylinder_machine, green_tank_machine: M.green_tank_machine, capsule_machine: M.capsule_machine,
  potted_plant: D.potted_plant, notice_board: D.notice_board, framed_picture: D.framed_picture, wall_vent: D.wall_vent, wall_clock: D.wall_clock,
  globe: D.globe, desk_lamp: D.desk_lamp, pendant_lamp: D.pendant_lamp, chain_hoist: D.chain_hoist, panel_light: D.panel_light, door: D.door,
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
