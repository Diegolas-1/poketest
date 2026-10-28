// The bow wave off Ash's front wheel (bike/bike_water.gd): two wings of water
// pushed up and out from the tyre in a V, each a raised ridge with a white crest
// that breaks up toward its tail, light see-through water on its flanks.
// The mesh: UV.x across a wing (0 its inner edge .. 1 its outer), UV.y along it
// (0 at the tyre .. 1 its tail); amp = the ridge's height (m), k = how strong.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;

uniform float amp = 0.1;
uniform float k = 1.0;
uniform float spd = 4.0;
varying vec3 v_w;

float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }

void vertex() {
	float x = UV.x, y = UV.y;
	float prof = pow(sin(3.14159 * clamp(x * 1.15, 0.0, 1.0)), 1.4);
	float env = smoothstep(0.0, 0.12, y) * pow(1.0 - y, 1.3);
	float wob = 0.85 + 0.15 * sin(TIME * 9.0 + y * 11.0);
	VERTEX.y += amp * prof * env * wob;
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float x = UV.x, y = UV.y;
	float crest = 1.0 - smoothstep(0.08, 0.16, abs(x - 0.42));
	float brk = n(vec2(x * 5.0, y * 9.0 - TIME * spd * 0.9)) + 0.3 * n(v_w.xz * 8.0 + TIME);
	float foam = crest * step(0.15 + 0.75 * y, brk);
	// spatter of foam flecks on the outer flank
	foam = max(foam, step(0.82 - 0.2 * (1.0 - y), n(v_w.xz * 11.0 - TIME * 2.0)) * smoothstep(0.45, 0.6, x) * (1.0 - smoothstep(0.85, 1.0, x)) * (1.0 - y));
	vec3 water = vec3(0.72, 0.94, 0.95);
	float edge = smoothstep(0.0, 0.12, x) * (1.0 - smoothstep(0.82, 1.0, x)) * (1.0 - smoothstep(0.7, 1.0, y)) * smoothstep(0.0, 0.05, y);
	ALBEDO = mix(water, vec3(0.98, 1.0, 1.0), foam);
	ALPHA = clamp(mix(0.55, 1.0, foam) * edge * k, 0.0, 1.0);
}
