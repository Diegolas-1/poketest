// A ring spreading on the water round Ash's legs (water_fx.gd): the quad is
// scaled to the ring's radius; INSTANCE_CUSTOM.x = its age 0..1, .y = radius (m).
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
#include "res://shaders/aces.gdshaderinc"

varying float v_age;
varying float v_r;

void vertex() {
	v_age = INSTANCE_CUSTOM.x;
	v_r = max(INSTANCE_CUSTOM.y, 0.05);
}

void fragment() {
	float d = length(UV - 0.5) * 2.0;           // 0 middle, 1 the quad's edge
	float w = clamp(0.07 / v_r, 0.03, 0.25);     // the ring about 7 cm wide whatever its size
	float ring = smoothstep(1.0 - w * 2.0, 1.0 - w, d) * (1.0 - smoothstep(1.0 - w * 0.5, 1.0, d));
	float inner = smoothstep(0.55, 0.95, d) * 0.12;   // a faint sheen inside it
	float fade = (1.0 - v_age) * (1.0 - v_age);
	ALBEDO = dn_relight(vec3(0.93, 0.98, 1.0), dn_unlit());
	ALPHA = clamp((ring * 0.75 + inner) * fade, 0.0, 1.0);
}
