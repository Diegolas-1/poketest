// toon.gdshader for cut-out materials (alpha scissor: leaf cards, fences of
// slats, decals): the cut's edge anti-aliased by alpha to coverage under MSAA.
shader_type spatial;
render_mode ambient_light_disabled, alpha_to_coverage;
#define TOON_CUT
#include "res://shaders/toon.gdshaderinc"
