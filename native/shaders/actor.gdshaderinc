// The people's cel shading (web actor.js / toon.js: SKIN and CLOTH bands):
// the same flat light bands as toon.gdshader, plus what a character needs:
// an eye atlas offset (blinking), alpha cut-outs, vertex colours and decals
// (face paint and logos, pushed a hair off the surface instead of a depth offset),
// and the wet look (body.gd: below the wet line, wet_y in world height, the
// clothes and hair darker and more saturated, a darker tide mark at the line;
// wet_k is how much a material shows it: cloth 1, skin less, the eyes none).
render_mode ambient_light_disabled;
#include "res://shaders/aces.gdshaderinc"

uniform vec4 albedo : source_color = vec4(1.0);
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform bool use_tex = false;
uniform bool use_vc = false;
uniform float alpha_scissor = 0.0;
uniform vec2 uv_off = vec2(0.0);
uniform float lift = 0.0;
uniform vec3 bands = vec3(0.1, 0.3, 0.62);
uniform vec3 deep = vec3(0.5, 0.52, 0.7);
uniform vec3 shade = vec3(0.7, 0.74, 0.9);
uniform vec3 lit = vec3(1.05, 1.04, 1.0);
uniform vec3 lit_add = vec3(0.02, 0.02, 0.01);
uniform float soft = 0.025;
uniform float wet_y = -10000.0;
uniform float wet_k = 1.0;
// scraped and dirty (body.gd, the "scraped" condition, 0..1): dirt ground into the
// clothes in patches, scratches on the bare skin; not on the eyes (wet_k 0)
uniform float dirt = 0.0;
varying vec3 v_wp;

float a_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float a_noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(a_hash(i), a_hash(i + vec2(1, 0)), f.x), mix(a_hash(i + vec2(0, 1)), a_hash(i + vec2(1, 1)), f.x), f.y);
}

void vertex() {
	if (lift > 0.0) VERTEX += NORMAL * lift;
	v_wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec4 c = albedo;
	if (use_vc) c *= COLOR;
	if (use_tex) c *= texture(albedo_tex, UV + uv_off);
	if (alpha_scissor > 0.0 && c.a < alpha_scissor) discard;
	if (wet_y > -9000.0 && wet_k > 0.0) {
		// a ragged line: cloth soaks unevenly
		float wob = sin(v_wp.x * 31.0 + v_wp.z * 17.0) * 0.010 + sin(v_wp.z * 43.0 - v_wp.x * 11.0) * 0.007;
		float y = v_wp.y + wob;
		// bare skin (in the clothes' atlases too: the arms): hardly darker
		float rb = c.r - c.b;
		float skin = step(0.6, c.r) * step(c.b, c.g) * step(c.g, c.r) * smoothstep(0.06, 0.12, rb) * (1.0 - smoothstep(0.38, 0.48, rb));
		float wet = (1.0 - smoothstep(wet_y - 0.035, wet_y + 0.01, y)) * wet_k * (1.0 - 0.85 * skin);
		float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
		vec3 sat = clamp(mix(vec3(lum), c.rgb, 1.45), 0.0, 1.0);
		vec3 w = sat * sat * 0.55 + sat * 0.17;   // darker, deeper colour
		float mark = (1.0 - smoothstep(0.0, 0.022, abs(y - wet_y + 0.012))) * 0.22 * wet_k * (1.0 - 0.85 * skin);
		c.rgb = mix(c.rgb, w, wet) * (1.0 - mark);
	}
	if (dirt > 0.001 && wet_k > 0.0) {
		float rb2 = c.r - c.b;
		float skin2 = step(0.6, c.r) * step(c.b, c.g) * step(c.g, c.r) * smoothstep(0.06, 0.12, rb2) * (1.0 - smoothstep(0.38, 0.48, rb2));
		vec2 duv = UV * 9.0;
		float n = a_noise(duv) * 0.6 + a_noise(duv * 2.7 + 1.7) * 0.4;
		float patch = smoothstep(0.5, 0.72, n) * dirt;
		vec3 mud = vec3(0.33, 0.25, 0.17);
		c.rgb = mix(c.rgb, c.rgb * 0.5 + mud * 0.38, patch * 0.85 * (1.0 - skin2));
		c.rgb = mix(c.rgb, c.rgb * 0.8 + mud * 0.15, patch * 0.5 * skin2);
		// scratches: short thin red lines where the noise allows, on the skin
		float l = abs(fract(dot(UV, vec2(41.0, 67.0)) + n * 0.7) - 0.5);
		float scratch = smoothstep(0.045, 0.0, l) * smoothstep(0.6, 0.7, a_noise(UV * 6.0 + 3.1)) * dirt * skin2;
		c.rgb = mix(c.rgb, vec3(0.72, 0.2, 0.18), scratch * 0.85);
		// frayed scuffs on the cloth: a few paler scrapes
		float scuff = smoothstep(0.035, 0.0, abs(fract(dot(UV, vec2(-53.0, 29.0)) + n) - 0.5)) * smoothstep(0.72, 0.8, a_noise(UV * 4.0 + 7.3)) * dirt * (1.0 - skin2);
		c.rgb = mix(c.rgb, c.rgb * 0.6 + vec3(0.42, 0.38, 0.33), scuff * 0.6);
	}
	ALBEDO = c.rgb;
}

void light() {
	float t = clamp(dot(NORMAL, LIGHT), 0.0, 1.0) * ATTENUATION;
	float s0 = smoothstep(bands.x - soft, bands.x + soft, t);
	float s1 = smoothstep(bands.y - soft, bands.y + soft, t);
	float s2 = smoothstep(bands.z - soft, bands.z + soft, t);
	vec3 k = mix(deep, shade, s0);
	k = mix(k, vec3(1.0), s1);
	k = mix(k, lit, s2);
	DIFFUSE_LIGHT += dn_tone(ALBEDO, ALBEDO * k + lit_add * s2, t);
}
