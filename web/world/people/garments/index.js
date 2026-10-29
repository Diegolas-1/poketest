// Every garment builder by archetype (catalog.json's item.base). Each file in this
// folder exports its builders by archetype name; later files override earlier ones.
import * as basics from './basics.js';
import * as tops from './tops.js';
import * as outer from './outer.js';
import * as dresses from './dresses.js';
import * as bottoms from './bottoms.js';
import * as legwear from './legwear.js';
import * as shoes from './shoes.js';
import * as gloves from './gloves.js';
import * as hats from './hats.js';
import * as eyewear from './eyewear.js';
import * as bags from './bags.js';
import * as accessories from './accessories.js';

// builders are the exported functions taking (ctx, it); helpers end in Shell, Tree or Helper
const pick = (m) => Object.fromEntries(Object.entries(m).filter(([k, f]) => typeof f === 'function' && !/(Shell|Tree|Helper)$/.test(k)));
export const BUILDERS = {
  ...pick(basics),
  tee_longsleeve: basics.tee, tank: basics.tee, chinos: basics.trousers, skinny_pants: basics.jeans,
  shorts_cargo: basics.shorts, shorts_sport: basics.shorts, sneaker_high: basics.sneaker_low, runner: basics.sneaker_low,
  ...pick(tops), ...pick(outer), ...pick(dresses), ...pick(bottoms), ...pick(legwear), ...pick(shoes), ...pick(gloves),
  ...pick(hats), ...pick(eyewear), ...pick(bags), ...pick(accessories),
};
