// Stone (web stone.js stoneMaterial): faceted rocks, walls and the islet.
// Vertex colour = the stone's tint and painted occlusion, UV.x = rounded rim
// (it catches the sun), UV.y = the stone's tone; the paint (blotches, pits,
// specks, cracks, moss) is stone.gdshaderinc, the web's own GLSL. Fades and
// cel bands as the other plants (veg.gdshaderinc).
shader_type spatial;
render_mode ambient_light_disabled, specular_disabled;
#include "res://shaders/aces.gdshaderinc"
#include "res://shaders/veg.gdshaderinc"
#include "res://shaders/stone.gdshaderinc"
#include "res://shaders/underwater.gdshaderinc"

varying float v_k;
varying vec3 v_sp;
varying vec3 v_sn;
varying float v_rim;

void vertex() {
	vec3 ip = MODEL_MATRIX[3].xyz;
	v_k = fade_k(ip);
	v_sp = VERTEX * length(MODEL_MATRIX[0].xyz) + ip * 0.37;
	v_sn = NORMAL;
	v_rim = UV.x;
	if (v_k >= 0.999) VERTEX = vec3(0.0);
	else VERTEX *= mix(1.0, shrink, v_k);
}

void fragment() {
	if (v_k > 0.0 && fd_b8(FRAGCOORD.xy) < v_k) discard;
	ALBEDO = COLOR.rgb * stone_paint(v_sp, normalize(v_sn), UV, length(fwidth(v_sp)));
	float uwd = uw_depth(VERTEX, INV_VIEW_MATRIX);
	if (uwd > 0.0) { EMISSION = uw_colour(COLOR.rgb, uwd); ALBEDO = vec3(0.0); }
}

void light() {
	float t = clamp(dot(NORMAL, LIGHT), 0.0, 1.0) * ATTENUATION * SUN_LUM;
	vec3 c = cel(ALBEDO, t);
	c += (ALBEDO * 0.3 + vec3(0.05, 0.05, 0.03)) * v_rim * smoothstep(0.5, 0.58, t);
	DIFFUSE_LIGHT += tone_factor(ALBEDO, c);
}
