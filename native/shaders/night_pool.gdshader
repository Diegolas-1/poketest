// The night: a pool of warm light on the ground under each lamp (night_fx.gd),
// a flat quad a few centimetres up, added on top while the lamps are lit.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;
#include "res://shaders/daynight.gdshaderinc"
void vertex() {
	if (dn_glow.x <= 0.001) POSITION = vec4(0.0, 0.0, -2.0, 1.0);
}
void fragment() {
	float pr = length(UV);
	float pa = pow(max(0.0, 1.0 - pr), 1.8);
	ALBEDO = vec3(1.0, 0.72, 0.4) * pa * 0.42 * dn_glow.x;
}
