// How each tileset turns into 3D, and the colours the 3D view paints the Game
// Boy's four shades with. Only tile numbers live here; the pictures themselves
// are read from the player's ROM at run time.

// A ramp gives the colour of each Game Boy shade: [lightest, light, dark, darkest].
export const RAMPS = {
  grass:     ['#d6efa4', '#97d36a', '#55a04a', '#24522e'],
  tallgrass: ['#c2e48c', '#74bd52', '#3b843c', '#173f24'],
  path:      ['#f4e6c0', '#ddc290', '#ab8a5c', '#5a4630'],
  tree:      ['#cdeb9c', '#6cb24e', '#2f7038', '#143421'],
  flower:    ['#d6efa4', '#ffa2b8', '#d6567a', '#4a2a34'],
  water:     ['#e2f6ff', '#86c8f0', '#3f86cc', '#1c3c78'],
  roofRed:   ['#ffe2d2', '#ec7a62', '#ae3c30', '#4a1a18'],
  roofBlue:  ['#dcebff', '#78a2e4', '#3d5fb4', '#1a2650'],
  roofLab:   ['#f1f4f2', '#a9bdb6', '#62786f', '#26302c'],
  wall:      ['#fffaf0', '#ead8b8', '#ad9270', '#3e3024'],
  window:    ['#f2fbff', '#a6d6f2', '#4f7fa8', '#22303e'],
  door:      ['#f6dfba', '#c8945e', '#8a5632', '#3a2414'],
  wood:      ['#f6e0bc', '#cf9f68', '#8e5c36', '#3a2414'],
  fence:     ['#ffffff', '#e2dbd2', '#948a80', '#302a26'],
  floorWood: ['#f7e8cc', '#dfbc8c', '#a47c52', '#4a3220'],
  rug:       ['#ffe8e0', '#e98a78', '#a8443c', '#401c1a'],
  iwall:     ['#fbf3e4', '#d3bfa2', '#927a5e', '#3a2e22'],
  tv:        ['#eef0f4', '#a3a9b8', '#555a6a', '#1c1e26'],
  pc:        ['#f2f6f8', '#b2c2cc', '#5a6e7c', '#1c262e'],
  bed:       ['#ffffff', '#ee8c8c', '#a8484c', '#3a1c20'],
  plant:     ['#e0f4b0', '#78c058', '#357a3c', '#143421'],
  pot:       ['#ffe4cc', '#d88c5c', '#94502e', '#3a1c10'],
  picture:   ['#fffaf0', '#8fc8e8', '#5a8a4a', '#2c2420'],
  labFloor:  ['#f4f6f2', '#d4dcd4', '#8a9890', '#30383a'],
  labWall:   ['#fbfcf8', '#d7e0dc', '#8d9c98', '#2e3634'],
  paper:     ['#ffffff', '#e8e4d8', '#9a9488', '#2c2a26'],
  metal:     ['#f0f4f6', '#b9c4ca', '#6a7880', '#22282c'],
  void:      ['#1a1a22', '#1a1a22', '#1a1a22', '#1a1a22'],
};

// Overworld sprites, by picture ID: [light (skin), main colour, darkest].
// Shade 0 is always transparent.
export const SPRITE_COLORS = {
  0x01: ['#f8dcb8', '#e2443c', '#24202c'], // Red
  0x02: ['#f8dcb8', '#7a62d6', '#24202c'], // Blue
  0x03: ['#f6efe2', '#9c7a5a', '#24202c'], // Oak
  0x0d: ['#f8dcb8', '#e46a9a', '#24202c'], // girl
  0x11: ['#f8dcb8', '#c8743e', '#24202c'], // Daisy
  0x20: ['#f6f6f6', '#6f94ae', '#24202c'], // scientist
  0x2f: ['#f8dcb8', '#4a8fc2', '#24202c'], // fisher
  0x33: ['#f8dcb8', '#d47a52', '#24202c'], // Mom
  0x3d: ['#ffffff', '#e23a36', '#24202c'], // Poké Ball
  0x41: ['#ffffff', '#d63a3a', '#24202c'], // Pokédex / town map
  default: ['#f8dcb8', '#8c8ca8', '#24202c'],
};

const ids = (...a) => a;

// kind 'outdoor': trees, signs, fences and buildings are found by tile number.
// kind 'indoor': the top two tile rows are the back wall; everything that is
// not floor becomes furniture (a box, a tall box against the wall, or a card).
export const TILESETS = {
  // OVERWORLD (Pallet Town, routes)
  0: {
    kind: 'outdoor',
    ramp: 'path',
    ramps: {
      grass: ids(0x2c, 0x2d, 0x2e, 0x3d, 0x3e, 0x27, 0x36, 0x37, 0x34, 0x3c),
      tallgrass: ids(0x52),
      tree: ids(0x2a, 0x2b, 0x3a, 0x3b, 0x40, 0x41, 0x50, 0x51),
      flower: ids(0x03),
      water: ids(0x14, 0x32, 0x33, 0x54, 0x48, 0x49, 0x58, 0x59),
      wood: ids(0x46, 0x47, 0x56, 0x57),
      fence: ids(0x0e, 0x55),
    },
    // 2x2 trees: [top-left, top-right, bottom-left, bottom-right]
    trees: [[0x2a, 0x2b, 0x3a, 0x3b], [0x40, 0x41, 0x50, 0x51]],
    treeUnder: 0x2c,
    signs: ids(0x46, 0x47, 0x56, 0x57),
    fences: ids(0x0e, 0x55),
    buildings: ids(0x05, 0x06, 0x07, 0x08, 0x09, 0x15, 0x16, 0x17, 0x18, 0x19,
      0x25, 0x26, 0x28, 0x29, 0x0a, 0x22, 0x5c, 0x5d, 0x0f, 0x0b, 0x0c, 0x1f,
      0x4e, 0x1a, 0x1b, 0x1c, 0x4f, 0x53, 0x38, 0x12, 0x4b),
    eave: 0x17,                     // the roof's lowest row is mostly this tile
    windowTiles: ids(0x0a),
    doorTiles: ids(0x0b, 0x0c, 0x1b, 0x1c),
    wallTiles: ids(0x22, 0x0f, 0x1f, 0x4e, 0x4f, 0x1a, 0x4b),
    fill: 0x23,                     // ground under buildings, signs and fences
    // roof colour per building on a map, buildings in reading order
    roofs: { 0x00: ['roofRed', 'roofBlue', 'roofLab'] },
  },
  // REDS_HOUSE_1 and REDS_HOUSE_2 (same pictures)
  1: 'reds',
  4: 'reds',
  reds: {
    kind: 'indoor',
    ramp: 'wood',
    floor: ids(0x01, 0x04, 0x14, 0x0c, 0x0d, 0x1c, 0x1d, 0x0a, 0x0b, 0x1a, 0x1b),
    wall: ids(0x00, 0x24, 0x25, 0x34, 0x35),
    cards: ids(0x44, 0x45, 0x08, 0x09, 0x46, 0x47, 0x18, 0x19, 0x06, 0x07, 0x16, 0x17),
    tall: ids(0x22, 0x23, 0x30, 0x31, 0x32, 0x33, 0x20, 0x21, 0x42, 0x43, 0x40, 0x41),
    fill: 0x01,
    wallFill: 0x00,
    ramps: {
      floorWood: ids(0x01),
      rug: ids(0x04, 0x14),
      iwall: ids(0x00),
      window: ids(0x24, 0x25, 0x34, 0x35),
      tv: ids(0x06, 0x07, 0x16, 0x17, 0x0e, 0x0f, 0x1e, 0x1f),
      pc: ids(0x40, 0x41, 0x20, 0x21, 0x42, 0x43),
      bed: ids(0x2d, 0x2e, 0x3d, 0x3e, 0x3f, 0x2f),
      plant: ids(0x44, 0x45, 0x08, 0x09),
      pot: ids(0x46, 0x47, 0x18, 0x19),
    },
  },
  // HOUSE (Blue's house)
  8: {
    kind: 'indoor',
    ramp: 'wood',
    floor: ids(0x01, 0x04, 0x14),
    wall: ids(0x00, 0x24, 0x34, 0x2d, 0x2e, 0x3d, 0x3e),
    cards: ids(0x0a, 0x0b, 0x08, 0x09, 0x1a, 0x1b, 0x18, 0x19),
    tall: ids(0x0e, 0x0f, 0x1e, 0x1f, 0x30, 0x31),
    fill: 0x01,
    wallFill: 0x00,
    ramps: {
      floorWood: ids(0x01),
      rug: ids(0x04, 0x14),
      iwall: ids(0x00),
      window: ids(0x24, 0x34),
      picture: ids(0x2d, 0x2e, 0x3d, 0x3e),
      plant: ids(0x0a, 0x0b, 0x08, 0x09),
      pot: ids(0x1a, 0x1b, 0x18, 0x19),
    },
  },
  // DOJO (Oak's lab uses the gym pictures)
  5: {
    kind: 'indoor',
    ramp: 'metal',
    floor: ids(0x11, 0x06, 0x16),
    wall: ids(0x05, 0x10),
    cards: ids(),
    tall: ids(0x0d, 0x0e, 0x1d, 0x1e),
    fill: 0x11,
    wallFill: 0x05,
    ramps: {
      labFloor: ids(0x11),
      rug: ids(0x06, 0x16),
      labWall: ids(0x05, 0x10),
      paper: ids(0x34, 0x43, 0x52, 0x53),
      wood: ids(0x29, 0x2a, 0x0d, 0x0e, 0x1d, 0x1e),
    },
  },
};

export function tilesetConfig(id) {
  let c = TILESETS[id];
  if (typeof c === 'string') c = TILESETS[c];
  return c || null;
}
