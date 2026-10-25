// Bark and stones (web foliage.js barkMaterial / makeRock): the painted
// bark texture (moss low on one side for ridged and smooth barks) or the
// stone's vertex colours, swaying with the leaves, cel bands.
shader_type spatial;
render_mode ambient_light_disabled, specular_disabled;
#include "res://shaders/aces.gdshaderinc"
#include "res://shaders/veg.gdshaderinc"
#include "res://shaders/underwater.gdshaderinc"

uniform sampler2D bark_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform bool use_tex = true;
uniform bool use_vc = false;
uniform bool mossy = false;
uniform vec3 color : source_color = vec3(1.0);

varying float v_k;
varying vec3 v_mp;
varying vec3 v_mn;

void vertex() {
	vec3 ip = MODEL_MATRIX[3].xyz;
	v_k = fade_k(ip);
	v_mp = VERTEX; v_mn = NORMAL;
	if (v_k >= 0.999) VERTEX = vec3(0.0);
	else VERTEX = sway(VERTEX, ip, TIME) * mix(1.0, shrink, v_k);
}

void fragment() {
	if (v_k > 0.0 && fd_b8(FRAGCOORD.xy) < v_k) discard;
	vec3 c = color;
	if (use_tex) c *= texture(bark_tex, UV).rgb;
	if (use_vc) c *= COLOR.rgb;
	if (mossy) {
		const vec3 MOSS = vec3(0.159, 0.323, 0.048);   // #6f9a3e, linear
		float ang = atan(v_mp.z, v_mp.x), top = 1.1 + 0.6 * sin(ang * 3.0 + 1.3) + 0.3 * sin(ang * 7.0);
		float mz = smoothstep(top, top - 0.9, v_mp.y) * smoothstep(-0.1, 0.5, dot(normalize(v_mn), normalize(vec3(-0.7, 0.15, -0.7))));
		float lum = dot(c, vec3(0.3, 0.6, 0.1)) / max(dot(color, vec3(0.3, 0.6, 0.1)), 1e-3);
		float mm = smoothstep(0.0, 0.04, mz - (1.0 - lum * 1.6) * 0.7);
		vec3 mc = mix(MOSS * 0.6, MOSS * 1.25, step(0.5, lum * 2.2));
		c = mix(c, mc, mm * 0.85);
	}
	ALBEDO = c;
	float uwd = uw_depth(VERTEX, INV_VIEW_MATRIX);
	if (uwd > 0.0) {
		vec3 uw_base = color * (use_vc ? COLOR.rgb : vec3(1.0)) * (use_tex ? textureLod(bark_tex, UV, 7.0).rgb : vec3(1.0));
		EMISSION = uw_colour(uw_base, uwd);
		ALBEDO = vec3(0.0);
	}
}

void light() {
	const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
	float t = clamp(dot(NORMAL, LIGHT), 0.0, 1.0) * ATTENUATION * SUN_LUM;
	t += (dot(ALBEDO, LW) / max(dot(color, LW), 1e-3) - mid) * detail;
	DIFFUSE_LIGHT += tone_factor(ALBEDO, cel(ALBEDO, t));
}
