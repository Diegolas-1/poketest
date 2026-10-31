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
// lit at night (main.gd marks the town's glass and lamp globes; daynight.gdshaderinc):
// 1 = window glass (a house's windows lit or dark by where they are and the hour's
// share, dn_glow.y), 2 = a lamp's globe (dn_glow.x), 3 = a merged mesh whose lamp
// globes are painted in its vertex colours (the web's lamp whites, either space)
uniform float night_glow = 0.0;

bool dn_is_lamp(vec3 dn_v) {
	const vec3 DN_L[8] = vec3[](vec3(1.0, 0.945, 0.769), vec3(1.0, 0.906, 0.651), vec3(1.0, 0.984, 0.918), vec3(1.0, 0.953, 0.753),
		vec3(1.0, 0.88, 0.552), vec3(1.0, 0.799, 0.381), vec3(1.0, 0.965, 0.823), vec3(1.0, 0.896, 0.527));
	for (int dn_i = 0; dn_i < 8; dn_i++) {
		vec3 dn_d = abs(dn_v - DN_L[dn_i]);
		if (dn_d.x + dn_d.y + dn_d.z < 0.025) return true;
	}
	return false;
}

void vertex() {
	if (lift > 0.0) VERTEX += NORMAL * lift;
}

void fragment() {
	vec4 c = albedo;
	if (use_vc) c *= COLOR;
	if (use_tex) c *= texture(albedo_tex, UV);
#ifdef TOON_CUT
	// cut-out cards (toon_cut / toon_ds_cut: render_mode alpha_to_coverage): with
	// MSAA the cut's edge is smoothed by coverage instead of stair steps
	ALPHA = c.a;
	// (the coverage is half at alpha = threshold + edge: there, as the old cut;
	// without MSAA the cut falls back to the threshold, a little under the old one)
	ALPHA_SCISSOR_THRESHOLD = max(alpha_scissor - 0.15, 0.02);
	ALPHA_ANTIALIASING_EDGE = alpha_scissor - max(alpha_scissor - 0.15, 0.02);
	// (UV, not texels: Godot then adds no mip-level boost to the alpha, which made
	// distant cards fuller than the cut drew them)
	ALPHA_TEXTURE_COORDINATE = UV;
#else
	if (alpha_scissor > 0.0 && c.a < alpha_scissor) discard;
#endif
	ALBEDO = c.rgb;
	if (night_glow > 0.0 && dn_glow.x + dn_glow.y > 0.0) {
		if (night_glow < 1.5) {
			vec3 dn_wp = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
			float dn_r = fract(sin(dot(floor(dn_wp.xz / 3.5) + floor(dn_wp.y / 2.6) * 7.0, vec2(12.9898, 78.233))) * 43758.5453);
			float dn_on = 1.0 - smoothstep(dn_glow.y - 0.04, dn_glow.y, dn_r);
			vec3 dn_room = mix(vec3(1.0, 0.66, 0.3), vec3(1.0, 0.82, 0.5), fract(dn_r * 17.0));
			EMISSION = mix(c.rgb * 0.25, dn_room, 0.85) * dn_on * dn_sun.a * 1.15;
			ALBEDO = c.rgb * (1.0 - 0.6 * dn_on * dn_sun.a);
		} else if (night_glow < 2.5 || (dn_glow.x > 0.0 && dn_is_lamp(albedo.rgb * COLOR.rgb))) {
			EMISSION = mix(c.rgb, vec3(1.0, 0.86, 0.56), 0.4) * dn_glow.x * 1.25;
		}
	}
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
	DIFFUSE_LIGHT += dn_tone(ALBEDO, ALBEDO * k + lit_add * s2, t);
}
