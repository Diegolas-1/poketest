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
// alpha_to_coverage: with MSAA the cards' cut-out edges are smoothed by coverage
render_mode cull_disabled, ambient_light_disabled, specular_disabled, shadows_disabled, alpha_to_coverage;
#include "res://shaders/aces.gdshaderinc"
#include "res://shaders/veg.gdshaderinc"

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform vec3 tint : source_color = vec3(1.0);
uniform float alpha_scissor = 0.5;   // the cut (names as the town material, for Ink.outline_plant)

varying float v_ao;
varying float v_k;
varying float v_occ;
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
	v_occ = arena_occ((MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz, ip.y, veg_cam, CAMERA_POSITION_WORLD);
	v_ao = COLOR.r;
}

void fragment() {
	float kk = max(v_k, v_occ);
	if (kk > 0.0 && fd_b8(FRAGCOORD.xy) < kk) discard;
	vec4 tx = texture(albedo_tex, UV);
	// (no cut by the angle to the camera: it shrank and grew each lobe as the
	// camera turned, and in the shadow pass it followed the shadow camera, so
	// the leaves' own shadows crawled whenever the view moved)
	ALPHA = tx.a;
	// The leaf atlases' alpha is a distance field (tools/native/bake_leaves.mjs:
	// 0.5 on the leaf's edge, a smooth ramp across it), so the cut follows a
	// smooth curve at any zoom. Coverage is half at alpha = threshold + edge, on
	// the edge; the threshold sits just under the ramp's last pixel (from the
	// alpha's screen derivative), so MSAA gets the whole soft edge and without
	// MSAA the cut grows by under a pixel.
	float m = clamp(fwidth(tx.a) * 0.75, 0.02, 0.15);
	ALPHA_SCISSOR_THRESHOLD = max(alpha_scissor - m, 0.02);
	ALPHA_ANTIALIASING_EDGE = alpha_scissor - max(alpha_scissor - m, 0.02);
	// (UV, not texels: Godot then adds no mip-level boost to the alpha, which made
	// distant cards fuller than the cut drew them)
	ALPHA_TEXTURE_COORDINATE = UV;
	ALBEDO = tx.rgb * tint;   // before the occlusion (celify divides it back out)
	// keep the puff normal on the back faces too (celify noflip)
	if (!FRONT_FACING) NORMAL = -NORMAL;
}

void light() {
	const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
	float lit_ = clamp(dot(NORMAL, LIGHT), 0.0, 1.0) * ATTENUATION * SUN_LUM;
	float t = lit_ * 0.8 + (v_ao - 0.72) * 0.9;
	t += (dot(ALBEDO, LW) / max(dot(tint, LW), 1e-3) - mid) * detail;
	DIFFUSE_LIGHT += dn_tone(ALBEDO, cel(ALBEDO, t), t);
}
