// The pond and the stream (terrain.js freshFrag): lighter green-blue, gentle
// ripples; the stream flows along its ribbon with white water at its banks.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_always, cull_disabled;

#include "res://shaders/aces.gdshaderinc"
uniform float flow = 0.0;
varying vec3 v_w;

float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
#include "res://shaders/part.gdshaderinc"

void vertex() { v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }

void fragment() {
	float e = abs(UV.x - 0.5) * 2.0;
	vec3 c = mix(vec3(0.18, 0.55, 0.72), vec3(0.42, 0.82, 0.82), smoothstep(0.2, 0.75, e));
	vec2 q = flow > 0.5 ? vec2(UV.x * 6.0, UV.y * 0.6 - TIME * 0.9) : v_w.xz * 0.6 + TIME * 0.1;
	float s = n(q);
	c = mix(c, vec3(0.78, 0.95, 0.96), step(0.72, s) * 0.8);
	c = mix(c, vec3(0.97, 1.0, 1.0), step(0.86, e + n(v_w.xz * 1.3 + TIME * 0.5) * 0.15) * flow);
	// the bike's wheels parting the water (part.gdshaderinc)
	float pdark;
	float pf = bike_part(v_w.xz, pdark);
	c = mix(c * (1.0 - 0.16 * pdark), vec3(0.97, 1.0, 1.0), pf);
	ALBEDO = dn_relight(c, dn_water());
	ALPHA = max(0.9, pf);
}
