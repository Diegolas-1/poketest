// A patch of foam left on the water behind Ash's bike (bike/bike_water.gd): a
// quad on the surface; INSTANCE_CUSTOM.x = its age 0..1, .y a seed. A lumpy
// white blob in hard anime edges that breaks into flecks and thins out as it ages.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;

varying float v_age;
varying float v_seed;

float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }

void vertex() {
	v_age = INSTANCE_CUSTOM.x;
	v_seed = INSTANCE_CUSTOM.y;
}

void fragment() {
	vec2 q = UV - 0.5;
	float r = length(q * vec2(1.0, 0.8)) * 2.0;
	float v = n(UV * 4.0 + v_seed * 17.0) * 0.65 + n(UV * 10.0 - v_seed * 5.0) * 0.35;
	float body = v * (1.0 - r);
	float th = 0.12 + v_age * 0.42;
	float foam = smoothstep(th, th + 0.03, body);
	// an outline of thinner foam round it (the lace)
	float lace = smoothstep(th - 0.05, th - 0.03, body) * (1.0 - foam) * 0.45;
	ALBEDO = vec3(0.96, 0.99, 1.0);
	ALPHA = clamp((foam * 0.9 + lace) * (1.0 - v_age * v_age), 0.0, 1.0);
}
