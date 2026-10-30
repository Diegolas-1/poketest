// Dappled sunlight on a forest floor (props/prop_mats.gd pool): a flat card on the
// ground where light gets through the canopy, added over it as a few soft warm
// blobs (a pattern from the card's own corner, so no two pools match), the
// edge fading out, the blobs breathing a little as the leaves move. Unshaded,
// no depth write, no texture: a handful of cards per forest.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform vec3 tint : source_color = vec3(1.0, 0.86, 0.5);
uniform float power = 0.3;
uniform vec2 far_fade = vec2(45.0, 60.0);

varying float v_k;

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_k = 1.0 - smoothstep(far_fade.x, far_fade.y, distance(wp, INV_VIEW_MATRIX[3].xyz));
}

void fragment() {
	vec2 uv = UV * 2.0 - 1.0;
	float edge = 1.0 - smoothstep(0.55, 1.0, length(uv));
	vec2 seed = floor(COLOR.rg * 97.0);
	float a = 0.0;
	for (int i = 0; i < 7; i++) {
		vec2 c = vec2(h21(seed + float(i) * 3.1), h21(seed + float(i) * 7.7 + 1.3)) * 1.5 - 0.75;
		float r = 0.12 + 0.2 * h21(seed + float(i) * 1.9 + 4.0);
		r *= 1.0 + 0.08 * sin(TIME * (0.7 + float(i) * 0.13) + float(i));
		float d = length((uv - c) * vec2(1.0, 1.25)) / r;
		a = max(a, 1.0 - smoothstep(0.55, 1.0, d));
	}
	ALBEDO = tint * a * edge * power * v_k;
}
