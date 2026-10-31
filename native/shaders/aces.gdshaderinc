#include "res://shaders/daynight.gdshaderinc"
// three.js ACESFilmicToneMapping (exposure 1), applied by the cel shaders
// themselves: in the web build only lit surfaces are tone mapped, while the
// sky, water and grass blades are not. Godot's own tonemapper stays Linear.
vec3 rrt_odt_fit(vec3 v) {
	vec3 a = v * (v + 0.0245786) - 0.000090537;
	vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
	return a / b;
}
vec3 aces_three(vec3 c) {
	const mat3 IN_M = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
	const mat3 OUT_M = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
	c *= 1.0 / 0.6;
	c = OUT_M * rrt_odt_fit(IN_M * c);
	return clamp(c, 0.0, 1.0);
}
// one sun, no ambient: the engine's result is ALBEDO * DIFFUSE_LIGHT, so a
// tone mapped colour is written back as a light factor
vec3 tone_factor(vec3 albedo, vec3 lit_color) {
	return aces_three(lit_color) / max(albedo, vec3(1e-4));
}
// the same, under the day and night's light (daynight.gdshaderinc): dn_la is
// the light() function's N.L times attenuation, so shade takes dn_amb and
// lit faces dn_sun (both white at midday: tone_factor exactly)
// an unshaded colour under the same light: darkened through the curve the
// way a cel surface of that colour is (identity while dn_glow.w is 0: midday)
// night colours fade toward the moonlight's blue (dn_amb.a: how much)
vec3 dn_desat(vec3 dn_x) {
	if (dn_amb.a <= 0.0) return dn_x;
	const vec3 DN_LW = vec3(0.2126, 0.7152, 0.0722);
	vec3 dn_b = dn_sun.rgb / max(dot(dn_sun.rgb, DN_LW), 1e-3);
	return mix(dn_x, dot(dn_x, DN_LW) * dn_b, dn_amb.a);
}
vec3 dn_relight(vec3 dn_c, vec3 dn_t) {
	if (dn_glow.w <= 0.0) return dn_c;
	return dn_c * aces_three(dn_desat(dn_c * dn_t)) / max(aces_three(dn_c), vec3(1e-4));
}
vec3 dn_tone(vec3 dn_alb, vec3 dn_lc, float dn_la) {
	return aces_three(dn_desat(dn_lc * dn_tint(dn_la))) / max(dn_alb, vec3(1e-4));
}
