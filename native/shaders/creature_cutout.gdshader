// The Pokémon's shading for a sheet with see-through texels (species.json: a
// material's "blend": "cutout"): texels under alpha_cut are not drawn.
shader_type spatial;
render_mode ambient_light_disabled;
#define CUTOUT
#include "res://shaders/creature.gdshaderinc"
