// Deep water (sea.gdshader where the sea is deeper than about 2 m, and the
// far ring): the same picture, opaque, so the GPU skips the sea floor under it.
shader_type spatial;
render_mode unshaded, cull_disabled;
#define SEA_DEEP
#include "res://shaders/sea.gdshaderinc"
