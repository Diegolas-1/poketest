// Leaf cards (web foliage.js leafMaterial): painted atlas, cut out, both
// sides lit with the puff's normals, cards seen edge-on thinning out, wind
// sway shared with the wood plus a little flutter, cel bands with the
// vertex colour as ambient occlusion.
shader_type spatial;
// shadows_disabled: the leaves cast shadows (from veg.gd's stand-ins) but do
// not receive them. A canopy's own shadow on its cut-out cards came from
// stand-ins that do not match them, at ~10 cm shadow texels: it fell as dark
// blotches that crawled with the wind and jumped as the camera moved (the
// shadow cascades follow it). The cel bands come from the puff normals and
// the baked occlusion instead.
render_mode cull_disabled, ambient_light_disabled, specular_disabled, shadows_disabled;
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
		VERTEX = arena_vertex(v * mix(1.0, shrink, v_k), MODEL_MATRIX);
	}
	v_ao = COLOR.r;
}

void fragment() {
	if (v_k > 0.0 && fd_b8(FRAGCOORD.xy) < v_k) discard;
	vec4 tx = texture(albedo_tex, UV);
	// (no cut by the angle to the camera: it shrank and grew each lobe as the
	// camera turned, and in the shadow pass it followed the shadow camera, so
	// the leaves' own shadows crawled whenever the view moved)
	if (tx.a < alpha_scissor) discard;
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
