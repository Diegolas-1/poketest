// Seen through the sea: below the waterline a thing is drawn as a flat,
// darker version of its own colour (no texture, paint or light bands), sinking
// toward the deep sea's blue with depth, with a crisp edge at the waterline.
// Used by toon (piles, boats), veg_stone (rocks, walls, the islet) and
// veg_solid (rocks, posts). uw_flat: ALBEDO 0 (no light) + EMISSION.
uniform float uw_sea_y = -0.7;
const vec3 UW_DEEP = vec3(0.012, 0.075, 0.16);   // linear, the sea's deep blue darkened
// world y of this fragment (fragment(): VERTEX is in view space)
float uw_depth(vec3 view_pos, mat4 inv_view) { return uw_sea_y - (inv_view * vec4(view_pos, 1.0)).y; }
vec3 uw_colour(vec3 base, float depth) {
	float k = clamp(0.38 + depth * 0.08, 0.38, 0.78);
	return aces_three(mix(base * 0.62, UW_DEEP, k));
}
