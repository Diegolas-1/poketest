// Leaf cards (web foliage.js leafMaterial): painted atlas, cut out, both
// sides lit with the puff's normals, cards seen edge-on thinning out, wind
// sway shared with the wood plus a little flutter, cel bands with the
// vertex colour as ambient occlusion.
shader_type spatial;
render_mode cull_disabled, ambient_light_disabled, specular_disabled;
#include "res://shaders/aces.gdshaderinc"
#include "res://shaders/veg.gdshaderinc"

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform vec3 tint : source_color = vec3(1.0);
uniform float alpha_scissor = 0.45;   // (names as the town material, for Ink.outline_plant)

varying float v_ao;
varying float v_k;
varying vec3 v_base;

void vertex() {
	vec3 ip = MODEL_MATRIX[3].xyz;
	v_k = fade_k(ip);
	if (v_k >= 0.999) {
		VERTEX = vec3(0.0);
	} else {
		vec3 v = sway(VERTEX, ip, TIME);
		float fl = UV2.x;
		v += NORMAL * sin(TIME * 4.0 + fl * 30.0) * 0.03 * fl;
		VERTEX = v * mix(1.0, shrink, v_k);
	}
	v_ao = COLOR.r;
}

void fragment() {
	if (v_k > 0.0 && fd_b8(FRAGCOORD.xy) < v_k) discard;
	vec4 tx = texture(albedo_tex, UV);
	vec3 fN = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
	float edge_on = abs(dot(fN, normalize(VERTEX)));
	vec2 tl = fract(UV * 4.0) - 0.5;
	if (tx.a < alpha_scissor || length(tl) > mix(0.0, 0.75, smoothstep(0.1, 0.5, edge_on))) discard;
	ALBEDO = tx.rgb * tint;   // before the occlusion (celify divides it back out)
	// keep the puff normal on the back faces too (celify noflip)
	if (!FRONT_FACING) NORMAL = -NORMAL;
}

void light() {
	const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
	float lit_ = clamp(dot(NORMAL, LIGHT), 0.0, 1.0) * ATTENUATION * SUN_LUM;
	float t = lit_ * 0.8 + (v_ao - 0.72) * 0.9;
	t += (dot(ALBEDO, LW) / max(dot(tint, LW), 1e-3) - mid) * detail;
	DIFFUSE_LIGHT += tone_factor(ALBEDO, cel(ALBEDO, t));
}
