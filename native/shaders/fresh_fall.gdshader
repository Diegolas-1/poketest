// Falling water, its foam and its spray (terrain.js fallFrag, word for word in
// spirit): mode 2 = a falling sheet (white streak bands scrolling down over the
// water colour, thinning and breaking into spray toward its foot), 3 = foam
// rings spreading on a plunge pool or under a cascade, 4 = mist (soft puffs
// rising from the foot of a fall). UV: sheet (across 0..1, down 0..1); foam
// and mist: 0..1 over the quad / disk.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;

#include "res://shaders/aces.gdshaderinc"
uniform float mode = 2.0;
varying vec3 v_w;

float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }

void vertex() { v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }

void fragment() {
	vec3 c; float a;
	if (mode < 2.5) {
		float u = UV.x, t = UV.y;
		float e = abs(u - 0.5) * 2.0;
		c = mix(vec3(0.36, 0.72, 0.84), vec3(0.66, 0.9, 0.94), smoothstep(0.1, 0.9, e) * 0.6 + t * 0.4);
		// streak bands falling fast, two layers
		float s1 = n(vec2(u * 9.0, v_w.y * 0.55 + TIME * 2.6));
		float s2 = n(vec2(u * 17.0 + 3.1, v_w.y * 1.1 + TIME * 3.9));
		float w = max(step(0.6, s1), step(0.68, s2) * 0.85);
		c = mix(c, vec3(0.97, 1.0, 1.0), w);
		// toward the foot it whitens and breaks up into spray
		float brk = n(vec2(u * 14.0, v_w.y * 2.0 + TIME * 5.0));
		c = mix(c, vec3(0.96, 0.99, 1.0), smoothstep(0.55, 0.95, t));
		a = mix(0.82, 0.55, t) * (1.0 - smoothstep(0.78, 1.0, e + (brk - 0.5) * 0.5));
		a *= 1.0 - smoothstep(0.82, 1.0, t) * step(brk, 0.55 + (1.0 - t) * 2.0);
		a = max(a, w * (1.0 - t * 0.6) * (1.0 - smoothstep(0.85, 1.0, e)));
	} else if (mode < 3.5) {
		vec2 q = UV - 0.5; float r = length(q) * 2.0;
		float ring = fract(r * 2.6 - TIME * 0.55);
		float brk = n(q * 14.0 + vec2(TIME * 0.3, 0.0));
		float f = step(0.72, ring) * step(0.35, brk) * (1.0 - smoothstep(0.55, 1.0, r));
		f = max(f, (1.0 - smoothstep(0.12, 0.42, r + (brk - 0.5) * 0.25)) * 0.95);
		c = vec3(0.96, 0.99, 1.0);
		a = f * 0.9;
	} else {
		vec2 q = UV - 0.5; float r = length(q * vec2(1.0, 0.8)) * 2.0;
		float p = n(UV * 4.0 + vec2(0.0, -TIME * 0.5)) * 0.6 + n(UV * 9.0 + vec2(TIME * 0.2, -TIME * 0.9)) * 0.4;
		c = vec3(0.95, 0.98, 1.0);
		a = (1.0 - smoothstep(0.15, 1.0, r)) * smoothstep(0.35, 0.75, p) * 0.42 * smoothstep(0.0, 0.25, UV.y);
	}
	ALBEDO = dn_relight(c, dn_water());
	ALPHA = clamp(a, 0.0, 1.0);
}
