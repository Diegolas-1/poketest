// The people's cel shading (web actor.js / toon.js: SKIN and CLOTH bands):
// the same flat light bands as toon.gdshader, plus what a character needs:
// an eye atlas offset (blinking), alpha cut-outs, vertex colours and decals
// (face paint and logos, pushed a hair off the surface instead of a depth offset).
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

void vertex() {
	if (lift > 0.0) VERTEX += NORMAL * lift;
}

void fragment() {
	vec4 c = albedo;
	if (use_vc) c *= COLOR;
	if (use_tex) c *= texture(albedo_tex, UV + uv_off);
	if (alpha_scissor > 0.0 && c.a < alpha_scissor) discard;
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
	DIFFUSE_LIGHT += tone_factor(ALBEDO, ALBEDO * k + lit_add * s2);
}
