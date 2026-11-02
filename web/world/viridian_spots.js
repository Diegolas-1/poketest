// Viridian City: the named spots that more than one builder needs, in one
// place (the city's layout itself is viridian.js). World metres: x east, z
// south (north is -z), y up. A pad is level ground at height y, w (along x)
// by d (along z) before turning; rot turns it about y, and its front faces
// (sin rot, cos rot): rot 0 = the front faces south (+z).
//
// The two landmark buildings are models of their own (props/viridian.js:
// pokemonCenter(), viridianGym()); the city leaves their pads flat and level
// and stands a placeholder there until the model exists (viridian_city.js
// looks for them). A model's origin is the middle of its pad at ground level,
// its front (door, stairs) toward +z.
export const PADS = {
  // the POKéMON CENTER: centre-south of the city, its doors facing the round
  // plaza (south), a hedge-lined approach between them
  center: { x: 10, z: -672, y: 19.6, rot: 0, w: 40, d: 40, door: [10, -652] },
  // the GYM: on the rise in the north-east, facing the street (south); the pad
  // holds the building, its double stairs and the fountain in front
  gym: { x: 75, z: -800, y: 25.2, rot: 0, w: 46, d: 36, door: [75, -782] },
  // placeholders for now (massing only), real models later
  mart: { x: 68, z: -690, y: 20.6, rot: -Math.PI / 2, w: 14, d: 18, door: [59, -690] },     // across Mart Street, east of the Center; door west
  school: { x: -46, z: -705, y: 20.2, rot: Math.PI / 2, w: 14, d: 20, door: [-36, -705] },    // the Trainer School, north-west; door east onto Old Street
  nickname: { x: -43, z: -752, y: 20.6, rot: Math.PI / 2, w: 10, d: 11, door: [-37.5, -752] }, // the nickname house; door east onto Old Street
  police: { x: -14, z: -588, y: 20.4, rot: Math.PI / 2, w: 5, d: 6, door: [-11.5, -588] },    // Officer Jenny's police box at the South Square
};

// Places the story needs (design/ash_arc.md, "The Spearow thread"): marked here
// so a scene can find them; nothing is scripted. [x, y, z] (y: absolute).
export const STORY = {
  // the motorbike route from the gate to the Center's doors (the road, as a
  // polyline at road level; the bike follows it)
  bikeRoute: [[-2, -438], [-1, -470], [1, -497], [5, -530], [6, -560], [6, -590], [8, -612], [10, -640], [10, -650]],
  gate: [-2, 23, -436],                       // the opened Viridian gate (Route 1 side)
  centerDoors: [10, 19.6, -652],
  jennyBoard: [-10.2, 20.4, -592.6],          // Officer Jenny's notice board, beside the police box
  // perch points for the marked Spearow: rooftops and the Center's dome
  perches: {
    centerDome: [10, 33.5, -672],             // the dome's crown (w35's model may refine)
    martRoof: [68, 27.6, -690],
    schoolRoof: [-46, 28.5, -705],
    clockTower: [-12.6, 47.0, -790],          // the old clock tower on Old Street (its belfry ledge)
    towerLedge: [120, 61.0, -650],            // a downtown tower's roof garden
    lakeLamp: [-131.5, 18.6, -737],           // reachable on foot: the lamp at the pier's root (a low lamp, a wall beside it)
  },
  nicknameHouse: { door: [-37.5, 20.6, -752], perch: [-44, 21.9, -753] },   // Speary's perch inside
  // where travellers sit: benches on the Route 2 street (Old Street, north end)
  travellers: [[-15.8, -812, -Math.PI / 2], [-15.8, -832, -Math.PI / 2], [-28.2, -846, Math.PI / 2], [-15.8, -852, -Math.PI / 2]],
  route2Gate: [-22, 26, -886],
  route22Gate: [-166, 15, -818],
  pierEnd: [-162, 14.6, -735],                // the fisher's spot
};
