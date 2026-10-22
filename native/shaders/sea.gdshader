// The sea as the anime paints it (terrain.js seaFrag): turquoise over sand,
// deep blue further out, white foam bands rolling in, a lapping white edge,
// a slow swell and glints of sun. Depth comes from the baked sea floor.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled;

uniform sampler2D seabed : filter_linear, repeat_disable;
uniform vec4 bed_box = vec4(-210.0, -210.0, 420.0, 420.0);
uniform float sea_y = -0.7;
varying vec3 v_w;

float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }

void vertex() {
	vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float far = smoothstep(80.0, 20.0, w.z);
	float dy = (sin(w.x * 0.06 + w.z * 0.11 - TIME * 0.9) * 0.09 + sin(w.x * 0.17 - w.z * 0.05 + TIME * 0.7) * 0.04) * (1.0 - far);
	w.y += dy;
	v_w = w;
	VERTEX.y += dy;   // the sea meshes are only moved, never turned or scaled
}

void fragment() {
	vec2 uv = (v_w.xz - bed_box.xy) / bed_box.zw;
	float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
	float depth = mix(30.0, sea_y - texture(seabed, clamp(uv, 0.0, 1.0)).r, inside);
	depth = mix(depth, 30.0, smoothstep(0.85, 1.0, uv.y));
	float wob = n(v_w.xz * 0.25 + vec2(TIME * 0.1, TIME * 0.05)) - 0.5;
	float dd = depth + wob * 0.5;
	vec3 c0 = vec3(0.47, 0.90, 0.84), c1 = vec3(0.20, 0.74, 0.82), c2 = vec3(0.13, 0.52, 0.78), c3 = vec3(0.10, 0.36, 0.66);
	vec3 c = mix(c0, c1, smoothstep(0.7, 1.0, dd));
	c = mix(c, c2, smoothstep(2.6, 3.1, dd));
	c = mix(c, c3, smoothstep(6.5, 8.0, dd));
	float sw = n(vec2(v_w.x * 0.05, v_w.z * 0.2 - TIME * 0.15));
	c += vec3(0.05, 0.07, 0.06) * smoothstep(0.62, 0.7, sw) * smoothstep(1.0, 4.0, dd);
	float ph = depth * 0.55 + TIME * 0.32 + n(v_w.xz * 0.12) * 0.6;
	float band = fract(ph);
	float brk = n(v_w.xz * vec2(0.35, 0.9) + vec2(0.0, TIME * 0.4));
	float foam = step(0.9, band) * step(0.35, brk) * (1.0 - smoothstep(2.2, 3.4, depth));
	foam = max(foam, step(0.955, band) * step(0.55, brk) * (1.0 - smoothstep(3.4, 5.0, depth)));
	float lap = 0.16 + 0.1 * sin(TIME * 1.1 + v_w.x * 0.08) + 0.05 * n(v_w.xz * 0.8 + TIME * 0.3);
	foam = max(foam, step(depth, lap));
	float rim = step(depth, lap + 0.22) * step(0.5, n(v_w.xz * 1.6 + vec2(TIME * 0.6, 0.0)));
	foam = max(foam, rim);
	c = mix(c, vec3(0.97, 0.99, 1.0), foam);
	vec2 g = floor(v_w.xz * vec2(0.9, 2.2));
	float tw = h(g); float on = step(0.985, tw) * step(0.5, fract(TIME * 0.35 + tw * 7.0));
	vec2 fp = fract(v_w.xz * vec2(0.9, 2.2)) - 0.5;
	c = mix(c, vec3(1.0), on * step(length(fp * vec2(1.0, 0.5)), 0.18) * smoothstep(3.0, 6.0, depth));
	ALBEDO = c;
	ALPHA = max(mix(0.72, 1.0, smoothstep(0.2, 1.6, depth)), foam);
}
