// toon_ds.gdshader (double sided) for cut-out materials: the cut's edge
// anti-aliased by alpha to coverage under MSAA.
shader_type spatial;
render_mode ambient_light_disabled, cull_disabled, alpha_to_coverage;
#define TOON_CUT
#include "res://shaders/toon.gdshaderinc"
