// Interiors: glossy tile floors. The cel shading of toon.gdshaderinc (its
// uniforms and light() copied here, kept the same) plus a cheap painted shine
// instead of reflections: a soft bright band that grows toward grazing views
// (fresnel), broken into the long diagonal streaks the anime paints on
// polished floors. No screen-space or planar reflection.
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

uniform float gloss = 0.13;
uniform vec3 gloss_color : source_color = vec3(1.0, 0.97, 1.0);
varying vec3 w_pos;

void vertex() {
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec4 c = albedo;
	if (use_vc) c *= COLOR;
	if (use_tex) c *= texture(albedo_tex, UV);
	ALBEDO = c.rgb;
	vec3 V = normalize(CAMERA_POSITION_WORLD - w_pos);
	float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
	// streaks: bands across the floor, wobbling a little, stepped like paint
	float s = sin(w_pos.x * 0.55 + w_pos.z * 0.85 + sin(w_pos.z * 0.3) * 1.5);
	float streak = smoothstep(0.35, 0.6, s) * 0.7 + smoothstep(0.85, 0.95, s) * 0.5;
	EMISSION = gloss_color * gloss * (0.35 + fres * 1.6) * (0.4 + streak);
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
