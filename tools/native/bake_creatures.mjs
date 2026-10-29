// Bakes the Pokémon models (3DS X/Y rips, Source .smd) for the native game:
// native/creatures/<id>.glb, one skinned mesh per material on one skeleton,
// textures embedded (Godot extracts them on import), in the game's frame:
// metres, Y up, facing +Z (the people's forward), feet (or belly) at y = 0
// once posed. The rips have no animation; creature.gd animates the bones.
//
//   node tools/native/bake_creatures.mjs [id...] [--src dir]
//
// --src (default $CREATURE_SRC) holds the extracted rips as The Models
// Resource ships them: <src>/<Folder>/<Name>.SMD and <src>/<Folder>/images/*.png.
// Each species below names its files and its size. An .smd is plain text:
// bones (name, parent), the bind pose (position + XYZ euler per bone, Z up,
// the model facing -Y) and triangles (material, then per corner position,
// normal, uv and up to n bone weights). The bind pose becomes the skeleton's
// rest; vertices are in model space at that pose.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const require = createRequire(path.join(ROOT, 'tools/world/package.json'));
const { Document, NodeIO } = require('@gltf-transform/core');
const sharp = require('sharp');

const SPECIES = {
  // ~0.5 m long and ~0.4 m tall once its front is reared up (the bind pose lies straight)
  // its red forked horn has no bone of its own: the orange texels on the head get one ("Horn")
  caterpie: { dir: 'Caterpie', smd: 'Caterpie.SMD', scale: 0.025,
    extra: [{ name: 'Horn', parent: 'Head', png: 'pm0010_00_Body1.png', pick: ([r, g, b]) => r > 200 && g < 160 && b < 110, ramp: 1.2 }] },
  // the heads at about 1.2 m with the necks up (about Ben's chest)
  doduo: { dir: 'Doduo', smd: 'DoduoM.SMD', scale: 0.0082, split: { 'pm0084_00_Eye1.png': ['LHead', 'RHead'] }, solo: ['LNeck1', 'RNeck1'] },
  // Delia's Mr. Mime, about 1.3 m to the top of his head (a little under her shoulder).
  // The rip draws the pupils as a separate see-through sheet over the eye whites (Iris1):
  // the merged eye sheet (whites and pupils in one) is used instead and the iris dropped,
  // so the eyes and the mouth are each one 2 x 4 expression atlas (uv_off).
  mrmime: { dir: 'Mr. Mime', smd: 'MrMime.SMD', scale: 0.0101,
    swap: { 'pm0122_00_Eye1.png': 'pm0122_00_Eye1_Merged.png' }, drop: ['pm0122_00_Iris1.png'] },
  // Route 1's wild Pidgey, about 0.4 m to the top of its head (a real threat to a kid), from the X/Y rip as a
  // COLLADA file (3ds Max), its images in Images/. The eye sheet (Eye1) is a 1 x 4
  // atlas: both open, one shut, the other shut, both shut (uv_off: the blink).
  // The rip has each wing twice: spread (the bind pose: LArm - LForeArm - LHand, fanned
  // along x) and folded at the side (LFeeler1 - LFeeler2): separate meshes (parts).
  pidgey: { dir: 'Pidgey', dae: 'Pidgey.DAE', img: 'Images', scale: 0.0135,
    parts: { wing_l: ['LArm'], wing_r: ['RArm'], fold_l: ['LFeeler1'], fold_r: ['RFeeler1'] } },
  // ---- the rest of the Kanto 151 (--src holds <NNNN>/...: several rip layouts, the images
  // found by name anywhere under the folder). Sized by the Pokedex height (or a serpent's
  // length); no Mega, Gigantamax or Alolan forms; the sexes that differ bake <id>_f. Not in
  // the set: #018 Pidgeot, #092 Gastly, #097 Hypno; #084 Doduo keeps its own bake above.
  metapod: { dir: "0011/Pokemon XY/Metapod", smd: "Metapod.SMD", height: 0.7 },
  butterfree: { dir: "0012/Pokemon XY/Butterfree", smd: "ButterfreeM.SMD", height: 1.1 },
  butterfree_f: { dir: "0012/Pokemon XY/Butterfree", smd: "ButterfreeF.SMD", height: 1.1 },
  weedle: { dir: "0013/Pokemon XY/Weedle", dae: "Weedle.DAE", height: 0.3 },
  kakuna: { dir: "0014/Pokemon XY/Kakuna", dae: "Kakuna.DAE", height: 0.6 },
  beedrill: { dir: "0015/Pokemon XY/Beedrill", dae: "Beedrill.DAE", height: 1.0 },
  pidgeotto: { dir: "0017/Pokemon XY/Pidgeotto", dae: "Pidgeotto.DAE", height: 1.1 },
  wigglytuff: { dir: "0040/Pokemon XY/Wigglytuff", dae: "Wigglytuff.DAE", height: 1.0 },
  zubat: { dir: "0041/041. Zubat", dae: "zubat_m.dae", height: 0.8 },
  zubat_f: { dir: "0041/041. Zubat", dae: "zubat_f.dae", height: 0.8 },
  golbat: { dir: "0042/042. Golbat", dae: "golbat_m.dae", height: 1.6 },
  golbat_f: { dir: "0042/042. Golbat", dae: "golbat_f.dae", height: 1.6 },
  oddish: { dir: "0043/Pokemon XY/Oddish", dae: "Oddish.DAE", height: 0.5 },
  gloom: { dir: "0044/Pokemon XY/Gloom", dae: "Gloom_M.DAE", height: 0.8 },
  gloom_f: { dir: "0044/Pokemon XY/Gloom", dae: "Gloom_F.DAE", height: 0.8 },
  vileplume: { dir: "0045/Pokemon XY/Vileplume", dae: "Vileplume_M.DAE", height: 1.2 },
  vileplume_f: { dir: "0045/Pokemon XY/Vileplume", dae: "Vileplume_F.DAE", height: 1.2 },
  paras: { dir: "0046/Pokemon XY/Paras", dae: "Paras.DAE", height: 0.3 },
  parasect: { dir: "0047/Pokemon XY/Parasect", dae: "Parasect.DAE", height: 1.0 },
  venonat: { dir: "0048/Pokemon XY/Venonat", dae: "Venonat.DAE", height: 1.0 },
  venomoth: { dir: "0049/Pokemon XY/Venomoth", dae: "Venomoth.DAE", height: 1.5 },
  diglett: { dir: "0050/Pokemon XY/Diglett", dae: "Diglett.DAE", height: 0.2 },
  dugtrio: { dir: "0051/Pokemon XY/Dugtrio", dae: "Dugtrio.DAE", height: 0.7 },
  meowth: { dir: "0052/Pokemon XY/Meowth", dae: "Meowth.DAE", height: 0.4 },
  persian: { dir: "0053/Pokemon XY/Persian", dae: "Persian.DAE", height: 1.0 },
  psyduck: { dir: "0054/Pokemon XY/Psyduck", dae: "Psyduck.DAE", height: 0.8 },
  golduck: { dir: "0055/Pokemon XY/Golduck", dae: "Golduck.DAE", height: 1.7 },
  mankey: { dir: "0056/Pokemon XY/Mankey", dae: "Mankey.DAE", height: 0.5 },
  primeape: { dir: "0057/Pokemon XY/Primeape", dae: "Primeape.DAE", height: 1.0 },
  growlithe: { dir: "0058/Pokemon XY/Growlithe", dae: "Growlithe.DAE", height: 0.7 },
  arcanine: { dir: "0059/Pokemon XY/Arcanine", smd: "Arcanine.SMD", height: 1.9 },
  poliwag: { dir: "0060/060. Poliwag", dae: "poliwag.dae", height: 0.6 },
  poliwhirl: { dir: "0061/Pokemon XY/Poliwhirl", dae: "Poliwhirl.DAE", height: 1.0 },
  poliwrath: { dir: "0062/Pokemon XY/Poliwrath", dae: "Poliwrath.DAE", height: 1.3 },
  abra: { dir: "0063/Pokemon XY/Abra", smd: "Abra.SMD", height: 0.9 },
  kadabra: { dir: "0064/Pokemon XY/Kadabra", smd: "KadabraM.SMD", height: 1.3 },
  kadabra_f: { dir: "0064/Pokemon XY/Kadabra", smd: "KadabraF.SMD", height: 1.3 },
  alakazam: { dir: "0065/Pokemon XY/Alakazam", smd: "AlakazamM.SMD", height: 1.5 },
  alakazam_f: { dir: "0065/Pokemon XY/Alakazam", smd: "AlakazamF.SMD", height: 1.5 },
  machop: { dir: "0066/Pokemon XY/Machop", smd: "Machop.SMD", height: 0.8 },
  machoke: { dir: "0067/Pokemon XY/Machoke", smd: "Machoke.SMD", height: 1.5 },
  machamp: { dir: "0068/Pokemon XY/Machamp", smd: "Machamp.SMD", height: 1.6 },
  bellsprout: { dir: "0069/Pokemon XY/Bellsprout", dae: "Bellsprout.DAE", height: 0.7 },
  weepinbell: { dir: "0070/Pokemon XY/Weepinbell", smd: "Weepinbell.SMD", height: 1.0 },
  victreebel: { dir: "0071/Pokemon XY/Victreebel", dae: "Victreebel.DAE", height: 1.7 },
  tentacool: { dir: "0072/Pokemon XY/Tentacool", dae: "Tentacool.DAE", height: 0.9 },
  tentacruel: { dir: "0073/Pokemon XY/Tentacruel", dae: "Tentacruel.DAE", height: 1.6 },
  geodude: { dir: "0074/Pokemon XY/Geodude", dae: "Geodude.DAE", height: 0.4 },
  graveler: { dir: "0075/Pokemon XY/Graveler", dae: "Graveler.DAE", height: 1.0 },
  golem: { dir: "0076/Pokemon XY/Golem", dae: "Golem.DAE", height: 1.4 },
  ponyta: { dir: "0077/Pokemon XY/Ponyta", smd: "Ponyta.SMD", height: 1.0 },
  rapidash: { dir: "0078/Pokemon XY/Rapidash", smd: "Rapidash.SMD", height: 1.7 },
  slowpoke: { dir: "0079/Pokemon XY/Slowpoke", smd: "Slowpoke.SMD", height: 1.2 },
  slowbro: { dir: "0080/Pokemon XY/Slowbro", smd: "Slowbro.SMD", height: 1.6 },
  magnemite: { dir: "0081/Magnemite", dae: "pm0081_00.dae", height: 0.3 },
  magneton: { dir: "0082/Magneton", dae: "pm0082_00.dae", height: 1.0 },
  farfetchd: { dir: "0083/Pokemon XY/Farfetch'd", smd: "Farfetch'd.SMD", height: 0.8 },
  dodrio: { dir: "0085/Pokemon XY/Dodrio", smd: "DodrioM.SMD", height: 1.8 },
  dodrio_f: { dir: "0085/Pokemon XY/Dodrio", smd: "DodrioF.SMD", height: 1.8 },
  seel: { dir: "0086/Pokemon XY/Seel", smd: "Seel.SMD", height: 1.1 },
  dewgong: { dir: "0087/Pokemon XY/Dewgong", smd: "Dewgong.SMD", height: 1.7 },
  grimer: { dir: "0088/Grimer", dae: "pm0088_00.dae", height: 0.9 },
  muk: { dir: "0089/Muk", smd: "pm0089_00.smd", height: 1.2, yup: true, swap: { pm0089_00_BetoMask: 'pm0089_00_Beto1.png' } },
  shellder: { dir: "0090/Shellder", dae: "pm0090_00.dae", height: 0.3 },
  cloyster: { dir: "0091/Cloyster", dae: "pm0091_00.dae", height: 1.5 },
  haunter: { dir: "0093/Haunter", dae: "Haunter.dae", height: 1.6 },
  gengar: { dir: "0094/Pokemon XY/Gengar", smd: "Gengar.SMD", height: 1.5 },
  onix: { dir: "0095/Onix", dae: "Onix.dae", length: 8.8 },
  drowzee: { dir: "0096/Drowzee", dae: "Drowzee.dae", height: 1.0 },
  krabby: { dir: "0098/Krabby", dae: "Krabby.dae", height: 0.4 },
  kingler: { dir: "0099/Kingler", dae: "Kingler.dae", height: 1.3 },
  voltorb: { dir: "0100/Voltorb", dae: "pm0100_00.dae", height: 0.5, yup: true },
  electrode: { dir: "0101/Electrode", dae: "Electrode.dae", height: 1.2 },
  exeggcute: { dir: "0102/Exeggcute", dae: "Exeggcute.dae", height: 0.4 },
  exeggutor: { dir: "0103/Exeggutor", dae: "Exeggutor.dae", height: 2.0 },
  cubone: { dir: "0104/Pokemon XY/Cubone", smd: "Cubone.SMD", height: 0.4 },
  marowak: { dir: "0105/Pokemon XY/Marowak", smd: "Marowak.SMD", height: 1.0 },
  hitmonlee: { dir: "0106/Hitmonlee", dae: "Hitmonlee.dae", height: 1.5 },
  hitmonchan: { dir: "0107/Pokemon XY/Hitmonchan", smd: "Hitmonchan.SMD", height: 1.4 },
  lickitung: { dir: "0108/Lickitung", dae: "Lickitung.dae", height: 1.2 },
  koffing: { dir: "0109/Koffing", dae: "Koffing.dae", height: 0.6 },
  weezing: { dir: "0110/Weezing", dae: "Weezing.dae", height: 1.2 },
  rhyhorn: { dir: "0111/Rhyhorn", dae: "Rhyhorn.dae", height: 1.0 },
  rhydon: { dir: "0112/Pokemon XY/Rhydon", smd: "RhydonM.SMD", height: 1.9 },
  rhydon_f: { dir: "0112/Pokemon XY/Rhydon", smd: "RhydonF.SMD", height: 1.9 },
  chansey: { dir: "0113/Chansey", dae: "Chansey.dae", height: 1.1 },
  tangela: { dir: "0114/Tangela", dae: "Tangela.dae", height: 1.0 },
  kangaskhan: { dir: "0115/Pokemon XY/Kangaskhan", smd: "Kangaskhan.SMD", height: 2.2, alt: [{ file: 'KangaskhanKid.SMD', part: 'kid' }] },
  horsea: { dir: "0116/Horsea", dae: "Horsea.dae", height: 0.4 },
  seadra: { dir: "0117/Seadra", dae: "Seadra.dae", height: 1.2 },
  goldeen: { dir: "0118/Goldeen", dae: "Goldeen_M.dae", height: 0.6 },
  goldeen_f: { dir: "0118/Goldeen", dae: "Goldeen_F.dae", height: 0.6 },
  seaking: { dir: "0119/Seaking", dae: "Seaking_M.dae", height: 1.3 },
  seaking_f: { dir: "0119/Seaking", dae: "Seaking_F.dae", height: 1.3 },
  staryu: { dir: "0120/Staryu", dae: "pm0120_00.dae", height: 0.8 },
  starmie: { dir: "0121/Starmie", dae: "pm0121_00.dae", height: 1.1 },
  scyther: { dir: "0123/Pokemon XY/Scyther", smd: "Scyther.SMD", height: 1.5 },
  jynx: { dir: "0124/Jynx", dae: "Jynx.dae", height: 1.4 },
  electabuzz: { dir: "0125/Electabuzz", dae: "Electabuzz.dae", height: 1.1 },
  magmar: { dir: "0126/Magmar", dae: "Magmar.dae", height: 1.3 },
  pinsir: { dir: "0127/Pokemon XY/Pinsir", smd: "Pinsir.SMD", height: 1.5 },
  tauros: { dir: "0128/Tauros", dae: "Tauros.dae", height: 1.4 },
  magikarp: { dir: "0129/Pokemon XY/Magikarp", smd: "MagikarpM.SMD", height: 0.9 },
  magikarp_f: { dir: "0129/Pokemon XY/Magikarp", smd: "MagikarpF.SMD", height: 0.9 },
  gyarados: { dir: "0130/Pokemon XY/Gyarados", smd: "GyaradosM.SMD", length: 6.5 },
  gyarados_f: { dir: "0130/Pokemon XY/Gyarados", smd: "GyaradosF.SMD", length: 6.5 },
  lapras: { dir: "0131/Lapras", dae: "Lapras.dae", height: 2.5 },
  ditto: { dir: "0132/Ditto", dae: "pm0132_00.dae", height: 0.3 },
  eevee: { dir: "0133/Pokemon XY/Eevee", smd: "Eevee.SMD", height: 0.3 },
  vaporeon: { dir: "0134/Pokemon XY/Vaporeon", smd: "Vaporeon.SMD", height: 1.0 },
  jolteon: { dir: "0135/Pokemon XY/Jolteon", smd: "Jolteon.SMD", height: 0.8 },
  flareon: { dir: "0136/Pokemon XY/Flareon", smd: "Flareon.SMD", height: 0.9 },
  porygon: { dir: "0137/Pokemon XY/Porygon", smd: "Porygon.SMD", height: 0.8 },
  omanyte: { dir: "0138/Pokemon XY/Omanyte", smd: "Omanyte.SMD", height: 0.4 },
  omastar: { dir: "0139/Pokemon XY/Omastar", smd: "Omastar.SMD", height: 1.0 },
  kabuto: { dir: "0140/Kabuto", dae: "Kabuto.dae", height: 0.5 },
  kabutops: { dir: "0141/Kabutops", dae: "Kabutops.dae", height: 1.3 },
  aerodactyl: { dir: "0142/Pokemon XY/Aerodactyl", smd: "Aerodactyl.SMD", height: 1.8 },
  snorlax: { dir: "0143/143. Snorlax", dae: "snorlax.dae", height: 2.1 },
  articuno: { dir: "0144/Pokemon XY/Articuno", smd: "Articuno.SMD", height: 1.7 },
  zapdos: { dir: "0145/Pokemon XY/Zapdos", smd: "Zapdos.SMD", height: 1.6 },
  moltres: { dir: "0146/Pokemon XY/Moltres", smd: "Moltres.SMD", height: 2.0 },
  dratini: { dir: "0147/Pokemon XY/Dratini", smd: "Dratini.SMD", length: 1.8 },
  dragonair: { dir: "0148/Pokemon XY/Dragonair", smd: "Dragonair.SMD", length: 4.0 },
  dragonite: { dir: "0149/Pokemon XY/Dragonite", smd: "Dragonite.SMD", height: 2.2 },
  mewtwo: { dir: "0150/Pokemon XY/Mewtwo", smd: "Mewtwo.SMD", height: 2.0 },
  mew: { dir: "0151/Pokemon XY/Mew", smd: "Mew.SMD", height: 0.4 },
  // ---- the Kanto starters #001 - #009 (--src holds <0001>/Pokemon XY/<Name>/...; Mega forms not baked).
  // Bulbasaur's vines are their own files on the vine bones (L/RFeelerC01 ..): "vine_l", "vine_r";
  // the Charmander line's tail flame is two meshes (FireCore, FireSten: grey ramps the game colours)
  bulbasaur: { dir: '0001/Pokemon XY/Bulbasaur', smd: 'Bulbasaur.SMD', scale: 0.0100, merged: true,
    alt: [{ file: 'Bulbasaur_LVine.SMD', part: 'vine_l' }, { file: 'Bulbasaur_RVine.SMD', part: 'vine_r' }] },
  ivysaur: { dir: '0002/Pokemon XY/Ivysaur', smd: 'Ivysaur.SMD', scale: 0.0100 },
  venusaur: { dir: '0003/Pokemon XY/Venusaur', smd: 'VenusaurM.SMD', scale: 0.0105 },
  venusaur_f: { dir: '0003/Pokemon XY/Venusaur', smd: 'VenusaurF.SMD', scale: 0.0105 },
  charmander: { dir: '0004/Pokemon XY/Charmander', smd: 'Charmander.SMD', scale: 0.0100 },
  charmeleon: { dir: '0005/Pokemon XY/Charmeleon', smd: 'Charmeleon.SMD', scale: 0.0100, merged: true },
  charizard: { dir: '0006/Pokemon XY/Charizard', smd: 'Charizard.SMD', scale: 0.0100 },
  squirtle: { dir: '0007/Pokemon XY/Squirtle', smd: 'Squirtle.SMD', scale: 0.0113 },
  wartortle: { dir: '0008/Pokemon XY/Wartortle', smd: 'Wartortle.SMD', scale: 0.0100, merged: true },
  // the cannons out of the shell (Hydro Pump) are their own file on the shoulder bones: "cannons"
  // (CannonsB rides a bone the model does not have: left out)
  blastoise: { dir: '0009/Pokemon XY/Blastoise', smd: 'Blastoise.SMD', scale: 0.0115, merged: true,
    alt: [{ file: 'Blastoise_CannonsA.SMD', part: 'cannons' }] },
  // ---- #019 - #039, the X/Y rips as The Models Resource ships them, one folder per dex
  // number (--src holds <0019>/Pokemon XY/<Name>/...). The rips are authored at about a
  // centimetre a unit (scale 0.01 is the Pokedex height); each is set to its Pokedex
  // height (the top of the head or ears, a serpent's length), the game's species.json
  // fine-tunes it. Every eye (and mouth) sheet is a 2 x 4 atlas of expressions (uv_off
  // steps of 0.5 and 0.25; creature_rig.gd names them). The rips that draw the pupils as
  // a see-through sheet over the eye whites (Iris1) use the merged sheet instead, as
  // Mr. Mime does. Gendered ones bake the female as <id>_f (same skeleton).
  rattata: { dir: '0019/Pokemon XY/Rattata', dae: 'Rattata_M.DAE', img: 'Images', scale: 0.0100, merged: true },
  rattata_f: { dir: '0019/Pokemon XY/Rattata', dae: 'Rattata_F.DAE', img: 'Images_F', scale: 0.0100, merged: true },
  raticate: { dir: '0020/Pokemon XY/Raticate', dae: 'Raticate_M.DAE', img: 'Images', scale: 0.0097 },
  raticate_f: { dir: '0020/Pokemon XY/Raticate', dae: 'Raticate_F.DAE', img: 'Images_F', scale: 0.0097 },
  // Spearow has each wing twice like Pidgey: spread (LArm ..) and folded (LFeeler1 ..)
  spearow: { dir: '0021/Pokemon XY/Spearow', dae: 'Spearow.DAE', img: 'Images', scale: 0.0100,
    parts: { wing_l: ['LArm'], wing_r: ['RArm'], fold_l: ['LFeeler1'], fold_r: ['RFeeler1'] } },
  fearow: { dir: '0022/Pokemon XY/Fearow', dae: 'Fearow.DAE', img: 'Images', scale: 0.0148 },
  ekans: { dir: '0023/Pokemon XY/Ekans', smd: 'Ekans.SMD', scale: 0.0102 },
  arbok: { dir: '0024/Pokemon XY/Arbok', smd: 'Arbok.SMD', scale: 0.0100 },
  pikachu: { dir: '0025/Pokemon XY/Pikachu', smd: 'PikachuM.SMD', scale: 0.0084 },
  pikachu_f: { dir: '0025/Pokemon XY/Pikachu', smd: 'PikachuF.SMD', scale: 0.0084 },
  raichu: { dir: '0026/Pokemon XY/Raichu', smd: 'RaichuM.SMD', scale: 0.0095 },
  raichu_f: { dir: '0026/Pokemon XY/Raichu', smd: 'RaichuF.SMD', scale: 0.0095 },
  // Sandshrew rolled up is another file on the same skeleton: the mesh "roll"
  sandshrew: { dir: '0027/Pokemon XY/Sandshrew', smd: 'Sandshrew.SMD', scale: 0.0102, alt: [{ file: 'SandshrewRoll.SMD', part: 'roll' }] },
  sandslash: { dir: '0028/Pokemon XY/Sandslash', smd: 'Sandslash.SMD', scale: 0.0097 },
  nidoranf: { dir: '0029/Pokemon XY/NidoranF', smd: 'NidoranF.SMD', scale: 0.0097 },
  nidorina: { dir: '0030/Pokemon XY/Nidorina', smd: 'Nidorina.SMD', scale: 0.0113, merged: true },
  nidoqueen: { dir: '0031/Pokemon XY/Nidoqueen', smd: 'Nidoqueen.SMD', scale: 0.0102 },
  nidoranm: { dir: '0032/Pokemon XY/NidoranM', smd: 'NidoranM.SMD', scale: 0.0109, merged: true },
  nidorino: { dir: '0033/Pokemon XY/Nidorino', smd: 'Nidorino.SMD', scale: 0.0101 },
  nidoking: { dir: '0034/Pokemon XY/Nidoking', smd: 'Nidoking.SMD', scale: 0.0101 },
  // a Blender re-export with its own names (Body1_0.png ..) and the images beside it
  clefairy: { dir: '0035/035. Clefairy', dae: 'clefairy.dae', img: '.', scale: 0.0097 },
  clefable: { dir: '0036/Pokemon XY/Clefable', dae: 'Clefable.DAE', img: 'Images', scale: 0.0091 },
  vulpix: { dir: '0037/Pokemon XY/Vulpix', dae: 'Vulpix.DAE', img: 'Images', scale: 0.0105 },
  ninetales: { dir: '0038/Pokemon XY/Ninetales', dae: 'Ninetales.DAE', img: 'Images', scale: 0.0100 },
  jigglypuff: { dir: '0039/Pokemon XY/Jigglypuff', dae: 'Jigglypuff.DAE', img: 'Images', scale: 0.0089, merged: true },
};

const args = process.argv.slice(2);
let src = process.env.CREATURE_SRC || '';
let outDir = '';
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--src') src = args[++i];
  else if (args[i] === '--out') outDir = args[++i];
  else ids.push(args[i]);
}
if (!src) throw new Error('--src <dir with the extracted rips> (or CREATURE_SRC)');
const OUT = outDir ? path.resolve(outDir) : path.join(ROOT, 'native/creatures');
fs.mkdirSync(OUT, { recursive: true });

// ---------- small 4x4 helpers (column-major like glTF) ----------
function rotXYZ(rx, ry, rz) {   // R = Rz * Ry * Rx
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}
const mat = (R, t) => ({ R, t });
const mul = (A, B) => ({
  R: A.R.map((row) => [0, 1, 2].map((j) => row[0] * B.R[0][j] + row[1] * B.R[1][j] + row[2] * B.R[2][j])),
  t: A.R.map((row, i) => row[0] * B.t[0] + row[1] * B.t[1] + row[2] * B.t[2] + A.t[i]),
});
const inv = (A) => {
  const RT = [0, 1, 2].map((i) => [0, 1, 2].map((j) => A.R[j][i]));
  return { R: RT, t: RT.map((row) => -(row[0] * A.t[0] + row[1] * A.t[1] + row[2] * A.t[2])) };
};
function quat(R) {
  const [m00, m01, m02] = R[0], [m10, m11, m12] = R[1], [m20, m21, m22] = R[2];
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
  const l = Math.hypot(x, y, z, w);
  return [x / l, y / l, z / l, w / l];
}
const col = (A) => [A.R[0][0], A.R[1][0], A.R[2][0], 0, A.R[0][1], A.R[1][1], A.R[2][1], 0, A.R[0][2], A.R[1][2], A.R[2][2], 0, A.t[0], A.t[1], A.t[2], 1];
// the rips' frame (Z up, facing -Y, model units) -> the game's (Y up, facing +Z, metres): (x, y, z) -> (x, z, -y)
const M = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
const toGame = (v) => [v[0], v[2], -v[1]];

function parseSMD(text) {
  const L = text.split(/\r?\n/);
  let i = L.indexOf('nodes') + 1;
  const nodes = [];
  for (; L[i] !== 'end'; i++) {
    const m = L[i].match(/^\s*(\d+)\s+"([^"]*)"\s+(-?\d+)/);
    nodes[+m[1]] = { name: m[2], parent: +m[3] };
  }
  i = L.indexOf('time 0', i) + 1;
  for (; L[i] !== 'end'; i++) {
    const v = L[i].trim().split(/\s+/).map(Number);
    nodes[v[0]].local = mat(rotXYZ(v[4], v[5], v[6]), [v[1], v[2], v[3]]);
  }
  i = L.indexOf('triangles', i) + 1;
  const tris = [];
  for (; L[i] !== 'end' && i < L.length; i += 4) {
    const tri = { mat: L[i].trim(), v: [] };
    for (let k = 1; k <= 3; k++) {
      const t = L[i + k].trim().split(/\s+/).map(Number);
      const n = t[9] || 0;
      const w = [];
      for (let j = 0; j < n; j++) w.push([t[10 + 2 * j], t[11 + 2 * j]]);
      if (!w.length) w.push([t[0], 1]);
      tri.v.push({ p: t.slice(1, 4), n: t.slice(4, 7), uv: [t[7], t[8]], w });
    }
    tris.push(tri);
  }
  return { nodes, tris };
}

// ---------- COLLADA (.dae, as 3ds Max's OpenCOLLADA writes the newer rips) ----------
// A small XML reader (no entities, no CDATA: the rips have neither), then the same
// { nodes, tris } as parseSMD: nodes (name, parent, local {R, t}) from the visual
// scene (translate / rotate (axis, degrees) / matrix / scale, in order), and the
// skinned triangles posed at that scene (sum of w * joint * inverse bind * bind shape),
// in the rip's frame (Z up). A triangle's material is its image file.
function xml(text) {
  const root = { tag: '#', kids: [], a: {} }, st = [root];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|<\?[^>]*\?>|<!--[\s\S]*?-->/g;
  let m, last = 0;
  while ((m = re.exec(text))) {
    const top = st[st.length - 1];
    const txt = text.slice(last, m.index);
    if (txt.trim()) top.text = (top.text || '') + txt;
    last = re.lastIndex;
    if (!m[2]) continue;
    if (m[1]) { st.pop(); continue; }
    const a = {};
    for (const am of m[3].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) a[am[1]] = am[2];
    const n = { tag: m[2], a, kids: [] };
    top.kids.push(n);
    if (!m[4]) st.push(n);
  }
  return root;
}
const kid = (n, tag) => n.kids.find((k) => k.tag === tag);
const kidsOf = (n, tag) => n.kids.filter((k) => k.tag === tag);
function walk(n, f) { f(n); for (const k of n.kids) walk(k, f); }
const nums = (n) => (n.text || '').trim().split(/\s+/).filter(Boolean).map(Number);
const ID3 = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const m4 = (a, o = 0) => ({ R: [[a[o], a[o + 1], a[o + 2]], [a[o + 4], a[o + 5], a[o + 6]], [a[o + 8], a[o + 9], a[o + 10]]], t: [a[o + 3], a[o + 7], a[o + 11]] });
function axisAngle(x, y, z, deg) {
  const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), C = 1 - c;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
}
const xf = (A, v) => A.R.map((r, i) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2] + A.t[i]);
const xr = (A, v) => A.R.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
function parseDAE(text) {
  const doc = xml(text);
  const byId = {};
  walk(doc, (n) => { if (n.a.id) byId[n.a.id] = n; });
  const ref = (u) => byId[u.replace(/^#/, '')];
  const imgFile = (id) => { const im = byId[id]; return im && kid(im, 'init_from') ? path.basename(kid(im, 'init_from').text.trim()) : null; };
  // material symbol -> image file (effect: surface init_from -> image, or a texture's image id)
  const imgOf = {};
  walk(doc, (n) => {
    if (n.tag !== 'instance_material') return;
    const eff = ref(kid(ref(n.a.target), 'instance_effect').a.url);
    let file = null;
    walk(eff, (k) => {
      if (!file && k.tag === 'surface' && kid(k, 'init_from')) file = imgFile(kid(k, 'init_from').text.trim());
      if (!file && k.tag === 'texture') file = imgFile(k.a.texture.replace(/-sampler$/, ''));
    });
    imgOf[n.a.symbol] = file;
  });
  const nodes = [], bySid = {}, byNodeId = {}, ctrls = [];
  const col = doc.kids.find((k) => k.tag === 'COLLADA');
  const vs = ref(kid(kid(col, 'scene'), 'instance_visual_scene').a.url);
  const visit = (n, parent) => {
    let L = { R: ID3(), t: [0, 0, 0] };
    for (const k of n.kids) {
      const v = nums(k);
      if (k.tag === 'translate') L = mul(L, { R: ID3(), t: v });
      else if (k.tag === 'rotate') L = mul(L, { R: axisAngle(...v), t: [0, 0, 0] });
      else if (k.tag === 'matrix') L = mul(L, m4(v));
      else if (k.tag === 'scale') L = mul(L, { R: [[v[0], 0, 0], [0, v[1], 0], [0, 0, v[2]]], t: [0, 0, 0] });
    }
    const i = nodes.length;
    nodes.push({ name: (n.a.name || n.a.id).replace(/^_\d+_/, ''), parent, local: L, joint: n.a.type === 'JOINT' });
    if (n.a.sid) bySid[n.a.sid] = i;
    byNodeId[n.a.id] = i;
    for (const k of n.kids) if (k.tag === 'instance_controller') ctrls.push(k);
    for (const k of kidsOf(n, 'node')) visit(k, i);
  };
  for (const k of kidsOf(vs, 'node')) visit(k, -1);
  const W = [];
  nodes.forEach((n, i) => { W[i] = n.parent >= 0 ? mul(W[n.parent], n.local) : n.local; });
  const tris = [];
  for (const ic of ctrls) {
    const skin = kid(ref(ic.a.url), 'skin');
    const mesh = kid(ref(skin.a.source), 'mesh');
    const BSM = m4(nums(kid(skin, 'bind_shape_matrix')));
    const srcArr = (id) => {
      const s = ref(id), fa = kid(s, 'float_array') || kid(s, 'Name_array'), acc = kid(kid(s, 'technique_common'), 'accessor');
      return { d: fa.tag === 'Name_array' ? fa.text.trim().split(/\s+/) : nums(fa), st: +acc.a.stride };
    };
    const jIn = kid(skin, 'joints').kids;
    const names = srcArr(jIn.find((k) => k.a.semantic === 'JOINT').a.source).d;
    const ibm = srcArr(jIn.find((k) => k.a.semantic === 'INV_BIND_MATRIX').a.source).d;
    const jn = names.map((nm) => bySid[nm] ?? byNodeId[nm]);
    const JM = names.map((nm, j) => mul(W[jn[j]], m4(ibm, j * 16)));
    const vw = kid(skin, 'vertex_weights');
    const wIn = kidsOf(vw, 'input');
    const wts = srcArr(wIn.find((k) => k.a.semantic === 'WEIGHT').a.source).d;
    const jo = +wIn.find((k) => k.a.semantic === 'JOINT').a.offset, wo = +wIn.find((k) => k.a.semantic === 'WEIGHT').a.offset, ws = wIn.length;
    const vc = nums(kid(vw, 'vcount')), vv = nums(kid(vw, 'v'));
    const VW = [];
    for (let i = 0, o = 0; i < vc.length; i++) { const l = []; for (let k = 0; k < vc[i]; k++, o += ws) l.push([vv[o + jo], wts[vv[o + wo]]]); VW.push(l); }
    const P = srcArr(kid(kid(mesh, 'vertices'), 'input').a.source);
    for (const pl of mesh.kids.filter((k) => k.tag === 'triangles' || k.tag === 'polylist')) {
      const ins = kidsOf(pl, 'input');
      const stride = Math.max(...ins.map((k) => +k.a.offset)) + 1;
      const get = (sem) => ins.find((k) => k.a.semantic === sem && (!k.a.set || k.a.set === '0'));
      const iv = get('VERTEX'), inn = get('NORMAL'), iuv = get('TEXCOORD');
      const N = inn && srcArr(inn.a.source), UV = iuv && srcArr(iuv.a.source);
      const idx = nums(kid(pl, 'p'));
      const file = imgOf[pl.a.material] || pl.a.material;
      const corner = (c) => {
        const o = c * stride, pi = idx[o + +iv.a.offset];
        const p0 = xf(BSM, P.d.slice(pi * 3, pi * 3 + 3));
        const ni = N ? idx[o + +inn.a.offset] * N.st : 0, ui = UV ? idx[o + +iuv.a.offset] * UV.st : 0;
        const n0 = N ? xr(BSM, N.d.slice(ni, ni + 3)) : [0, 0, 1];
        const uv = UV ? UV.d.slice(ui, ui + 2) : [0, 0];
        const p = [0, 0, 0], n = [0, 0, 0];
        let sw = 0;
        for (const [j, w] of VW[pi]) { const a = xf(JM[j], p0), b2 = xr(JM[j], n0); for (let k = 0; k < 3; k++) { p[k] += a[k] * w; n[k] += b2[k] * w; } sw += w; }
        for (let k = 0; k < 3; k++) { p[k] /= sw || 1; n[k] /= sw || 1; }
        return { p, n, uv, w: VW[pi].map(([j, w]) => [jn[j], w]) };
      };
      const polys = kid(pl, 'vcount') ? nums(kid(pl, 'vcount')) : Array(idx.length / stride / 3).fill(3);
      let c = 0;
      for (const k of polys) {
        for (let f = 1; f + 1 < k; f++) tris.push({ mat: file, v: [corner(c), corner(c + f), corner(c + f + 1)] });
        c += k;
      }
    }
  }
  return { nodes, tris };
}

async function bake(id) {
  const sp = SPECIES[id];
  const dir = path.join(src, sp.dir);
  const text = fs.readFileSync(path.join(dir, sp.dae || sp.smd), 'utf8');
  const { nodes, tris: all } = sp.dae ? parseDAE(text) : parseSMD(text);
  const imgDir = path.join(dir, sp.img || (sp.height || sp.length ? '.' : 'images'));
  // an image by its file name: in imgDir, or anywhere under the species' folder (not the
  // shiny set), matched without case and with the rips' odd extensions (x.tga -> x.tga.png)
  const found = {};
  const findImg = (png) => {
    if (found[png]) return found[png];
    const direct = path.join(imgDir, png);
    if (fs.existsSync(direct)) return (found[png] = direct);
    const bn = path.basename(png).toLowerCase();
    const want = [bn, bn + '.png', bn.replace(/\.[a-z]+$/, '.png'), bn.replace(/\.png$/, '.tga.png')];
    // a material named for its role, not its image (Blender rips: "BodySpc_mat-material",
    // "BodyA_mat"): that role's first texture (pm0128_00_Body1.png)
    if (!/\.(png|tga)$/i.test(bn)) {
      const role = bn.replace(/_mat.*$/, '').replace(/(spc|vco)+$/, '');
      want.push(`_${role}1.png`, `${role}1_0.png`);
    }
    const top = path.join(src, sp.dir.split('/')[0]);
    const walk2 = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const q = path.join(d, f.name);
        if (f.isDirectory()) { if (!/shiny/i.test(f.name)) { const r = walk2(q); if (r) return r; } }
        else if (want.some((w) => (w.startsWith('_') ? f.name.toLowerCase().endsWith(w) : f.name.toLowerCase() === w))) return q;
      }
      return null;
    };
    const r = walk2(top);
    if (!r) throw new Error(`${id}: no image ${png}`);
    return (found[png] = r);
  };
  // alt: other files rigged to the same skeleton (Sandshrew's rolled-up ball), each
  // baked as its own mesh (part) the game shows instead of the body
  for (const a of sp.alt || []) {
    const t2 = fs.readFileSync(path.join(dir, a.file), 'utf8');
    const o = a.file.match(/\.dae$/i) ? parseDAE(t2) : parseSMD(t2);
    const map = o.nodes.map((n) => nodes.findIndex((m) => m.name === n.name));
    for (const t of o.tris) {
      if (t.v.some((v) => v.w.some(([j]) => map[j] < 0))) continue;
      all.push({ ...t, part: a.part, v: t.v.map((v) => ({ ...v, w: v.w.map(([j, w]) => [map[j], w]) })) });
    }
  }
  // a rip that draws its pupils as a see-through sheet over the eye whites (Iris1): the
  // merged eye sheet (whites and pupils in one) instead, the iris dropped (always, where
  // the merged sheet is there; else the iris is a card, drawn by its alpha)
  const irisM = all.find((t) => /_Iris1(\.png)?$/i.test(path.basename(t.mat)));
  if (sp.merged || irisM) {
    const eye = all.find((t) => /_Eye1(\.png)?$/i.test(path.basename(t.mat)));
    let mf = null;
    if (eye) { try { mf = path.basename(findImg(path.basename(eye.mat).replace(/(\.png)?$/i, '').replace(/_Eye1$/i, '_Eye1_Merged.png'))); } catch (e) { mf = null; } }
    if (mf) {
      const pre = mf.replace(/_Eye1_Merged\.png$/i, '');
      sp.swap = { ...(sp.swap || {}), [pre + '_Eye1.png']: pre + '_Eye1_Merged.png' };
      sp.drop = [...(sp.drop || []), pre + '_Iris1.png'];
    }
  }
  // (some rips name a material by its image's path: the file name is what counts)
  for (const t of all) t.mat = path.basename(t.mat);
  // a rip exported Y up (some of the Blender re-exports): turned to the others' Z up
  if (sp.yup) {
    const R = { R: [[1, 0, 0], [0, 0, -1], [0, 1, 0]], t: [0, 0, 0] };
    for (const n of nodes) if (n.parent < 0 && n.local) n.local = mul(R, n.local);
    const r3 = (v) => [v[0], -v[2], v[1]];
    for (const t of all) for (const v of t.v) { v.p = r3(v.p); v.n = r3(v.n); }
  }
  const tris = all.filter((t) => !(sp.drop || []).includes(t.mat));
  // the face sheets (eyes, mouth, the cheeks' overlay) are their own shells laid over
  // the body, with flatter normals of their own: lit by those, the cel bands put a
  // lighter (or darker) box round the eyes. Each face corner takes the normal of the
  // nearest body corner instead, so the face shades as one surface with the head.
  if (!['caterpie', 'doduo', 'mrmime', 'pidgey'].includes(id)) {
    const face = (m) => /(Eye|Mouth|Iris|Inc)/i.test(m);
    const body = [];
    for (const t of tris) if (!face(t.mat) && !t.part) for (const v of t.v) body.push(v);
    let n = 0;
    for (const t of tris) {
      if (!face(t.mat)) continue;
      for (const v of t.v) {
        let best = null, bd = 1e18;
        for (const q of body) {
          const d = (q.p[0] - v.p[0]) ** 2 + (q.p[1] - v.p[1]) ** 2 + (q.p[2] - v.p[2]) ** 2;
          if (d < bd) { bd = d; best = q; }
        }
        if (best && best.n[0] * v.n[0] + best.n[1] * v.n[1] + best.n[2] * v.n[2] > -0.2) { v.n = [...best.n]; n++; }
      }
    }
    if (n) console.log(`  ${n} face corners shaded with the head`);
  }
  // the size: scale as given, or set from the species' height (the rip's up extent; a
  // serpent's length: its longest extent) in metres
  let s = sp.scale;
  if (!s) {
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const t of tris) if (!t.part) for (const v of t.v) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], v.p[j]); hi[j] = Math.max(hi[j], v.p[j]); }
    const ext = hi.map((x, j) => x - lo[j]);
    s = sp.length ? sp.length / Math.max(...ext) : sp.height / ext[2];
    console.log(`  scale ${s.toFixed(5)} (${sp.length ? 'length' : 'height'} ${sp.length || sp.height} m)`);
  }
  // world bind matrices in the rip's frame, then in the game's (rotation by M, translation scaled)
  const W = [];
  nodes.forEach((n, i) => { W[i] = n.parent >= 0 ? mul(W[n.parent], n.local) : n.local; });
  const G = W.map((w) => ({ R: M.map((row) => [0, 1, 2].map((j) => row[0] * w.R[0][j] + row[1] * w.R[1][j] + row[2] * w.R[2][j])), t: toGame(w.t).map((x) => x * s) }));
  // a joint's rotation without scale (some Blender re-exports scale their armature): the
  // skeleton is rotations and offsets only; the mesh is already posed in metres
  const ortho = (R) => {
    const c = [0, 1, 2].map((j) => [R[0][j], R[1][j], R[2][j]]);
    const nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const x = nrm(c[0]);
    let y = c[1].map((v, k) => v - dot(c[1], x) * x[k]); y = nrm(y);
    const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    return [0, 1, 2].map((r) => [x[r], y[r], z[r]]);
  };
  for (const g of G) g.R = ortho(g.R);
  // extra bones: texels picked by colour on a bone's skin move to a new child bone, based
  // at the picked vertex nearest the parent's origin (weights ramp in over `ramp` units)
  const extra = [];
  for (const e of sp.extra || []) {
    const pi = nodes.findIndex((n) => n.name === e.parent);
    const { data, info } = await sharp(findImg(e.png)).raw().toBuffer({ resolveWithObject: true });
    const texel = (uv) => {
      const x = Math.min(info.width - 1, Math.floor((((uv[0] % 1) + 1) % 1) * info.width));
      const y = Math.min(info.height - 1, Math.floor((1 - (((uv[1] % 1) + 1) % 1)) * info.height));
      const o = (y * info.width + x) * info.channels;
      return [data[o], data[o + 1], data[o + 2]];
    };
    const picked = [];
    for (const t of tris) if (t.mat === e.png) for (const v of t.v) if (v.w.length === 1 && v.w[0][0] === pi && e.pick(texel(v.uv))) picked.push(v);
    let base = null, bd = 1e9;
    for (const v of picked) { const d = Math.hypot(...v.p.map((x, j) => x - W[pi].t[j])); if (d < bd) { bd = d; base = v.p; } }
    const ni = nodes.length;
    nodes.push({ name: e.name, parent: pi });
    W[ni] = { R: W[pi].R, t: base };
    G[ni] = { R: G[pi].R, t: toGame(base).map((x) => x * s) };
    for (const v of picked) {
      const d = Math.hypot(...v.p.map((x, j) => x - base[j]));
      const a = Math.min(1, d / e.ramp), k = a * a * (3 - 2 * a);
      v.w = k >= 0.999 ? [[ni, 1]] : [[ni, k], [pi, 1 - k]];
    }
    extra.push(`${e.name}: ${picked.length} corners`);
  }
  if (extra.length) console.log('  extra bones', extra.join(', '));
  if (process.env.DUMP) {
    nodes.forEach((n, i) => console.log(i, n.name, n.parent, G[i].t.map((x) => x.toFixed(3)).join(' ')));
    const cnt = {};
    for (const t of tris) for (const v of t.v) { const b = v.w.reduce((a, c) => (c[1] > a[1] ? c : a))[0]; const k = nodes[b].name + ' ' + t.mat; cnt[k] = (cnt[k] || 0) + 1; }
    console.log(cnt);
  }
  // the skeleton: every node under the model's root except the mesh holders
  // (and the Blender re-exports' mesh holders and stray scene nodes)
  const skip = (n, i) => n.parent < 0 || /Skin$|^VriVis|^vsn_mesh_|_OptMesh_|^mesh\d+$|EnvironmentAmbientLight|^Armature$/.test(n.name);
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene(id);
  doc.getRoot().setDefaultScene(scene);
  const top = doc.createNode(id);
  scene.addChild(top);
  const jn = [];   // node index -> joint Node
  nodes.forEach((n, i) => {
    if (skip(n, i)) return;
    const pi = nodes[n.parent] && !skip(nodes[n.parent], n.parent) ? n.parent : -1;
    const loc = pi >= 0 ? mul(inv(G[pi]), G[i]) : G[i];
    const nd = doc.createNode(n.name).setTranslation(loc.t).setRotation(quat(loc.R));
    jn[i] = nd;
    if (pi >= 0) jn[pi].addChild(nd); else top.addChild(nd);
  });
  const joints = [];
  const jidx = {};
  jn.forEach((nd, i) => { if (nd) { jidx[i] = joints.length; joints.push(i); } });
  const skin = doc.createSkin(id + '_skin');
  for (const i of joints) skin.addJoint(jn[i]);
  skin.setSkeleton(jn[joints[0]]);
  skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(new Float32Array(joints.flatMap((i) => col(inv(G[i]))))).setBuffer(buf));
  // materials (embedded textures); a split material gets one copy per named bone's branch
  const byName = Object.fromEntries(nodes.map((n, i) => [n.name, i]));
  const under = (b, root) => { for (let k = b; k >= 0; k = nodes[k].parent) if (k === root) return true; return false; };
  const mats = {};
  const material = (key, png) => {
    if (mats[key]) return mats[key];
    const img = fs.readFileSync(findImg((sp.swap && sp.swap[png]) || png));
    const nm = key.slice(id.length + 1);   // Godot names the extracted file <glb>_<texture>.png
    const tex = doc.createTexture(nm).setImage(img).setMimeType('image/png').setURI(nm + '.png');
    return (mats[key] = doc.createMaterial(key).setBaseColorTexture(tex).setRoughnessFactor(1).setMetallicFactor(0));
  };
  // branches that must not share a triangle (Doduo's two necks: the heads touch in the
  // bind pose and a few faces are welded across, which stretch into a web as they part):
  // a corner on the other branch gets this triangle's own copy, weighted like the rest
  if (sp.solo) {
    const roots = sp.solo.map((nm) => byName[nm]);
    const branch = (v) => { const b = v.w.reduce((a, c) => (c[1] > a[1] ? c : a))[0]; return roots.findIndex((r) => under(b, r)); };
    let fixed = 0;
    for (const t of tris) {
      const br = t.v.map(branch), on = br.filter((x) => x >= 0);
      if (new Set(on).size < 2) continue;
      const keep = [0, 1].map((k) => on.filter((x) => x === k).length);
      const major = keep[0] >= keep[1] ? 0 : 1, donor = t.v[br.indexOf(major)];
      t.v = t.v.map((v, k) => (br[k] >= 0 && br[k] !== major ? { ...v, w: donor.w.map((x) => [...x]) } : v));
      fixed++;
    }
    if (fixed) console.log(`  ${fixed} faces welded across ${sp.solo.join(' / ')} split`);
  }
  // cards: sheets that rely on their texture's alpha (fur and feather fins, gas puffs, eye
  // glints) or are flat (a single-sided plane: decals, fins). Opaque and outlined they draw as
  // black planes; they go to the mesh "cards" (see-through by the texture's alpha, both sides,
  // no ink hull, no shadow). Effect sheets (FireGeom: smoke shapes) go with the flame mesh.
  {
    const alphaOf = {};
    const mats0 = [...new Set(tris.filter((t) => !t.part).map((t) => t.mat))];
    for (const m of mats0) {
      if (/(Eye|Mouth)/i.test(m)) continue;   // face sheets: opaque by design (an iris left over: a card)
      let f;
      try { f = findImg((sp.swap && sp.swap[m]) || m); } catch (e) { continue; }
      const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const ts = tris.filter((t) => t.mat === m && !t.part);
      let clear = 0;
      for (const t of ts) {
        const u = (t.v[0].uv[0] + t.v[1].uv[0] + t.v[2].uv[0]) / 3, v = (t.v[0].uv[1] + t.v[1].uv[1] + t.v[2].uv[1]) / 3;
        const x = Math.min(info.width - 1, Math.floor((((u % 1) + 1) % 1) * info.width));
        const y = Math.min(info.height - 1, Math.floor((1 - (((v % 1) + 1) % 1)) * info.height));
        if (data[(y * info.width + x) * 4 + 3] < 128) clear++;
      }
      alphaOf[m] = ts.length ? clear / ts.length : 0;
    }
    // flatness: the smallest spread of the sheet's points against the largest (covariance)
    const flatOf = {};
    for (const m of mats0) {
      const ps = [];
      for (const t of tris) if (t.mat === m && !t.part) for (const v of t.v) ps.push(v.p);
      if (ps.length < 3) continue;
      const c = [0, 1, 2].map((j) => ps.reduce((a, p) => a + p[j], 0) / ps.length);
      const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (const p of ps) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (p[i] - c[i]) * (p[j] - c[j]) / ps.length;
      // eigenvalues of a symmetric 3x3 (closed form)
      const p1 = C[0][1] ** 2 + C[0][2] ** 2 + C[1][2] ** 2;
      const q = (C[0][0] + C[1][1] + C[2][2]) / 3;
      const p2 = (C[0][0] - q) ** 2 + (C[1][1] - q) ** 2 + (C[2][2] - q) ** 2 + 2 * p1;
      const pp = Math.sqrt(p2 / 6) || 1e-9;
      const Bm = C.map((r, i) => r.map((x, j) => (x - (i === j ? q : 0)) / pp));
      const det = Bm[0][0] * (Bm[1][1] * Bm[2][2] - Bm[1][2] * Bm[2][1]) - Bm[0][1] * (Bm[1][0] * Bm[2][2] - Bm[1][2] * Bm[2][0]) + Bm[0][2] * (Bm[1][0] * Bm[2][1] - Bm[1][1] * Bm[2][0]);
      const phi = Math.acos(Math.max(-1, Math.min(1, det / 2))) / 3;
      const e1 = q + 2 * pp * Math.cos(phi), e3 = q + 2 * pp * Math.cos(phi + 2 * Math.PI / 3);
      flatOf[m] = Math.sqrt(Math.max(0, e3)) / (Math.sqrt(Math.max(1e-12, e1)) || 1);
    }
    const cards = [];
    for (const m of mats0) {
      const a = alphaOf[m] || 0, fl = flatOf[m] ?? 1;
      if (a > 0.03 || fl < 0.02) cards.push(`${m} (alpha ${(a * 100).toFixed(0)}%, flat ${fl.toFixed(3)})`);
    }
    for (const t of tris) {
      if (t.part) continue;
      if ((alphaOf[t.mat] || 0) > 0.03 || (flatOf[t.mat] ?? 1) < 0.02) t.part = 'cards';
    }
    if (cards.length) console.log('  cards: ' + cards.join(', '));
  }
  const groups = {};
  for (const t of tris) {
    // the texture's name without the rip's prefix (pm0025_00_) or the Blender rip's suffix (_0)
    let key = (id + '_' + t.mat.replace(/\.png$/i, '').replace(/\.tga$/i, '').replace(/^pm\d+_\d+_/, '').replace(/_0$/, '')).toLowerCase();
    const sp2 = sp.split && sp.split[t.mat];
    if (sp2) {
      const b = t.v[0].w.reduce((a, c) => (c[1] > a[1] ? c : a))[0];
      const hit = sp2.find((nm) => under(b, byName[nm]));
      if (hit) key += '_' + hit.toLowerCase();
    }
    // parts: a triangle with a corner on a named bone's branch goes to that part's own
    // mesh (Pidgey's open and folded wings: separate shells the game shows one at a time)
    // (the tail flame's sheets, FireCore / FireSten, are their own mesh: drawn as fire, no ink outline)
    let part = t.part || (/(^|_)Fire(Core|Sten|Geom)/i.test(t.mat) ? 'flame' : '');
    if (!part && sp.parts) {
      const bs = t.v.map((v) => v.w.reduce((a, c) => (c[1] > a[1] ? c : a))[0]);
      part = Object.keys(sp.parts).find((pn) => sp.parts[pn].some((nm) => bs.some((b) => under(b, byName[nm])))) || '';
    }
    const gk = part + '|' + key;
    (groups[gk] = groups[gk] || { png: t.mat, tris: [], part, key }).tris.push(t);
  }
  const meshes = {};
  let flipped = 0, faces = 0;
  for (const gk of Object.keys(groups).sort()) {
    const g = groups[gk], key = g.key;
    const mesh = meshes[g.part] || (meshes[g.part] = doc.createMesh(g.part ? id + '_' + g.part : id));
    const pos = [], nor = [], uv = [], J = [], Wt = [], idx = [];
    const seen = new Map();
    const vert = (v) => {
      const w = v.w.filter((x) => jidx[x[0]] !== undefined).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = w.reduce((a, x) => a + x[1], 0) || 1;
      const k = [...v.p, ...v.n, ...v.uv, ...w.flat()].map((x) => x.toFixed(5)).join(',');
      if (seen.has(k)) return seen.get(k);
      const n = pos.length / 3;
      pos.push(...toGame(v.p).map((x) => x * s));
      const nn = toGame(v.n), nl = Math.hypot(...nn) || 1;
      nor.push(...nn.map((x) => x / nl));
      uv.push(v.uv[0], 1 - v.uv[1]);
      for (let j = 0; j < 4; j++) { J.push(w[j] ? jidx[w[j][0]] : 0); Wt.push(w[j] ? w[j][1] / sum : 0); }
      seen.set(k, n);
      return n;
    };
    for (const t of g.tris) {
      const ix = t.v.map(vert);
      // glTF fronts are counter-clockwise: keep the winding that agrees with the normals
      const p = ix.map((k) => pos.slice(k * 3, k * 3 + 3));
      const e1 = p[1].map((x, j) => x - p[0][j]), e2 = p[2].map((x, j) => x - p[0][j]);
      const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const vn = [0, 1, 2].map((j) => nor[ix[0] * 3 + j] + nor[ix[1] * 3 + j] + nor[ix[2] * 3 + j]);
      faces++;
      if (fn[0] * vn[0] + fn[1] * vn[1] + fn[2] * vn[2] < 0) { idx.push(ix[0], ix[2], ix[1]); flipped++; }
      else idx.push(...ix);
    }
    const acc = (type, arr, C = Float32Array) => doc.createAccessor().setType(type).setArray(new C(arr)).setBuffer(buf);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', acc('VEC3', pos)).setAttribute('NORMAL', acc('VEC3', nor)).setAttribute('TEXCOORD_0', acc('VEC2', uv))
      .setAttribute('JOINTS_0', acc('VEC4', J, Uint16Array)).setAttribute('WEIGHTS_0', acc('VEC4', Wt))
      .setIndices(acc('SCALAR', idx, Uint32Array)).setMaterial(material(key.replace(/_(l|r)head$/, ''), g.png));
    if (key !== key.replace(/_(l|r)head$/, '')) {
      // its own material (same texture) so each head's eyes can change on their own
      const m2 = material(key.replace(/_(l|r)head$/, ''), g.png).clone().setName(key);
      prim.setMaterial(m2);
    }
    mesh.addPrimitive(prim);
    const u0 = [1e9, 1e9], u1 = [-1e9, -1e9];
    for (let k = 0; k < uv.length; k += 2) for (let j = 0; j < 2; j++) { u0[j] = Math.min(u0[j], uv[k + j]); u1[j] = Math.max(u1[j], uv[k + j]); }
    console.log(`  ${g.part ? g.part + ' ' : ''}${key}: ${pos.length / 3} vertices, ${idx.length / 3} triangles, uv ${u0.map((x) => x.toFixed(3))} .. ${u1.map((x) => x.toFixed(3))}`);
  }
  for (const part of Object.keys(meshes).sort()) top.addChild(doc.createNode(part ? id + '_' + part : id + '_mesh').setMesh(meshes[part]).setSkin(skin));
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const t of tris) for (const v of t.v) toGame(v.p).forEach((x, j) => { lo[j] = Math.min(lo[j], x * s); hi[j] = Math.max(hi[j], x * s); });
  const out = path.join(OUT, id + '.glb');
  await new NodeIO().writeBinary(doc).then((b) => fs.writeFileSync(out, b));
  console.log(`${id}: ${joints.length} bones, ${faces} faces (${flipped} rewound), bind box ${lo.map((x) => x.toFixed(2))} .. ${hi.map((x) => x.toFixed(2))} -> ${path.relative(ROOT, out)}`);
}

for (const id of ids.length ? ids : Object.keys(SPECIES)) await bake(id);
