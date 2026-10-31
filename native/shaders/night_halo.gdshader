// The night: soft halos round the town's lamps (night_fx.gd), camera-facing
// quads (UV2 = the corner offset in metres), added on top while the lamps are lit.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;
#include "res://shaders/daynight.gdshaderinc"
void vertex() {
	vec3 hc = (MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	hc.xy += UV2;
	hc.z += 0.35;   // toward the camera: the lamp's own cage does not cut it
	POSITION = PROJECTION_MATRIX * vec4(hc, 1.0);
	if (dn_glow.x <= 0.001) POSITION = vec4(0.0, 0.0, -2.0, 1.0);
}
void fragment() {
	float hr = length(UV);
	float ha = pow(max(0.0, 1.0 - hr), 2.4) * 0.6 + pow(max(0.0, 1.0 - hr * 3.0), 2.0) * 0.5;
	// fainter close up (a halo seen from under the lamp would wash the screen)
	float hd = smoothstep(1.5, 5.0, -VERTEX.z);
	ALBEDO = vec3(1.0, 0.8, 0.5) * ha * dn_glow.x * hd;
}
