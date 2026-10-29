// A hit's flash on whoever is hit (battle/battle_fx.gd): put first in the mesh's
// overlay chain (the ink hull after it), the surface washed toward a colour.
shader_type spatial;
render_mode unshaded, cull_back, depth_draw_never, shadows_disabled;
uniform vec4 color : source_color = vec4(1.0);
uniform float amount = 0.0;

void fragment() {
	float rim = pow(1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0), 1.5);
	ALBEDO = color.rgb;
	ALPHA = clamp(amount * (0.75 + 0.25 * rim), 0.0, 1.0);
}
