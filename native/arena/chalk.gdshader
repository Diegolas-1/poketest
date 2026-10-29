// The battle field's chalk lines (arena/arena.gd): powdery off-white strips on
// the clay, grainy at the edges, scuffed and thinner here and there, the clay
// showing through. UV.x runs along a line (m), UV.y across it (0..1).
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, blend_mix;
#include "res://shaders/aces.gdshaderinc"

float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p) {
	vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
}

varying vec3 v_w;
void vertex() { v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }

void fragment() {
	float across = abs(UV.y - 0.5) * 2.0;
	float edge = 0.78 + (vn(v_w.xz * 9.0) - 0.5) * 0.35;
	float body = smoothstep(edge, edge - 0.25, across);
	float scuff = smoothstep(0.18, 0.5, vn(v_w.xz * 1.3 + 4.0)) * 0.55 + 0.45;
	float grain = 0.75 + 0.25 * h2(floor(v_w.xz * 90.0));
	ALBEDO = vec3(0.95, 0.94, 0.9) * (0.92 + 0.08 * grain);
	ALPHA = clamp(body * scuff * grain * 0.92, 0.0, 1.0);
}
