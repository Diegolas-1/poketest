// Cel shading in the anime background style, the same as the web build's
// toon.js: light falls in flat bands (deep shade, shade, base, lit) and shade
// turns cool instead of grey. The bands replace all lighting: no ambient, no
// specular, only the sun (and its shadows) picks the band.
shader_type spatial;
render_mode ambient_light_disabled;
#include "res://shaders/aces.gdshaderinc"

uniform vec4 albedo : source_color = vec4(1.0);
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform bool use_tex = false;
uniform bool use_vc = false;   // vertex colours (merged meshes carry their colours in the vertices)
uniform float alpha_scissor = 0.0;
uniform vec3 bands = vec3(0.12, 0.34, 0.62);
uniform vec3 deep = vec3(0.42, 0.5, 0.68);
uniform vec3 shade = vec3(0.62, 0.7, 0.86);
uniform vec3 lit = vec3(1.06, 1.04, 0.98);
uniform vec3 lit_add = vec3(0.02, 0.02, 0.0);
uniform float soft = 0.025;
// decals (painted details lying on a surface): pushed toward the camera
uniform float lift = 0.0;

void vertex() {
	if (lift > 0.0) VERTEX += NORMAL * lift;
}

void fragment() {
	vec4 c = albedo;
	if (use_vc) c *= COLOR;
	if (use_tex) c *= texture(albedo_tex, UV);
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
