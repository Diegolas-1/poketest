// The Pokémon's shading for a sheet with see-through texels (species.json: a
// material's "blend": "cutout", and every "cards" mesh the bake finds): texels under
// alpha_cut are not drawn, and both sides are (a fin or a puff is a single sheet).
shader_type spatial;
render_mode ambient_light_disabled, cull_disabled;
#define CUTOUT
#include "res://shaders/creature.gdshaderinc"
