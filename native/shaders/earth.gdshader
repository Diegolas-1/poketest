// Earth faces (stream banks, Route 1's ledges): the web's props/earth.js.
// Vertex colours are the strata (loam, clay, sand, silt, gravel, moss, the wet
// band); UV is the face's own metres (along, up); UV2 = two tiles of the earth
// atlas (world/base/earth.webp: eight CC0 photo soils made into painted
// detail), blended by a seeded noise over the face, each at its own scale, so
// no face repeats. The atlas is detail around 1 (0.5 = the vertex colour).
// Then the cel bands of toon.gdshaderinc (the banks' CEL).
shader_type spatial;
render_mode ambient_light_disabled;
#include "res://shaders/aces.gdshaderinc"
#include "res://shaders/underwater.gdshaderinc"

uniform sampler2D earth_tex : filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec3 bands = vec3(0.1, 0.32, 0.6);
uniform vec3 deep = vec3(0.46, 0.5, 0.7);
uniform vec3 shade = vec3(0.64, 0.68, 0.86);
uniform vec3 lit = vec3(1.08, 1.05, 0.98);
uniform vec3 lit_add = vec3(0.02, 0.015, 0.0);
uniform float soft = 0.025;

varying vec3 v_w;

float e_hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float e_noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(e_hash(i), e_hash(i + vec2(1, 0)), f.x), mix(e_hash(i + vec2(0, 1)), e_hash(i + vec2(1, 1)), f.x), f.y); }
vec3 e_tile(vec2 p, float k) {
	vec2 cell = vec2(mod(k, 4.0), floor(k / 4.0));
	vec2 sc = vec2(480.0 / 2048.0, 480.0 / 1024.0);
	vec2 q = (cell * 512.0 + 16.0) / vec2(2048.0, 1024.0) + fract(p) * sc;
	return textureGrad(earth_tex, q, dFdx(p) * sc, dFdy(p) * sc).rgb;
}
vec3 e_detail(vec2 uv, vec2 tiles, vec3 wp) {
	vec2 p = uv / 1.6;
	float m = smoothstep(0.38, 0.62, e_noise(wp.xz * 0.45 + wp.y * 0.3 + 7.0) * 0.7 + e_noise(wp.xz * 1.3 - wp.y) * 0.3);
	vec3 a = e_tile(p + vec2(e_hash(vec2(tiles.x, 1.7)), 0.0), tiles.x);
	vec3 b = e_tile(p * 0.83 + vec2(0.37, 0.61), tiles.y);
	return mix(vec3(1.0), mix(a, b, m) * 2.0, 0.85);
}

void vertex() {
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 c = COLOR.rgb * e_detail(UV, floor(UV2 + 0.5), v_w);
	ALBEDO = c;
	float uwd = uw_depth(VERTEX, INV_VIEW_MATRIX);
	if (uwd > 0.0) {
		EMISSION = uw_colour(COLOR.rgb, uwd);
		ALBEDO = vec3(0.0);
	}
}

void light() {
	float t = clamp(dot(NORMAL, LIGHT), 0.0, 1.0) * ATTENUATION;
	float s0 = smoothstep(bands.x - soft, bands.x + soft, t);
	float s1 = smoothstep(bands.y - soft, bands.y + soft, t);
	float s2 = smoothstep(bands.z - soft, bands.z + soft, t);
	vec3 k = mix(deep, shade, s0);
	k = mix(k, vec3(1.0), s1);
	k = mix(k, lit, s2);
	DIFFUSE_LIGHT += tone_factor(ALBEDO, ALBEDO * k + lit_add * s2);
}
