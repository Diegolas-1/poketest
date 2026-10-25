// The cel shader's body, shared by toon.gdshader and toon_ds.gdshader
// (double-sided: the web's side DoubleSide materials, e.g. leaf cards, cloth, thin panels).
#include "res://shaders/aces.gdshaderinc"
#include "res://shaders/underwater.gdshaderinc"

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
	float uwd = uw_depth(VERTEX, INV_VIEW_MATRIX);
	if (uwd > 0.0) {
		vec3 uw_base = albedo.rgb * (use_vc ? COLOR.rgb : vec3(1.0)) * (use_tex ? textureLod(albedo_tex, UV, 7.0).rgb : vec3(1.0));
		EMISSION = uw_colour(uw_base, uwd);
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
