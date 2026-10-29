// Every garment builder by archetype (catalog.json's item.base). Each file in
// this folder exports its builders; later files may override earlier ones.
import * as basics from './basics.js';

const pick = (m) => Object.fromEntries(Object.entries(m).filter(([, f]) => typeof f === 'function' && !/Shell$|Tree$/.test(f.name)));
export const BUILDERS = {
  ...pick(basics),
  tee_longsleeve: basics.tee, tank: basics.tee, chinos: basics.trousers, skinny_pants: basics.jeans,
  shorts_cargo: basics.shorts, shorts_sport: basics.shorts, sneaker_high: basics.sneaker_low, runner: basics.sneaker_low,
};
