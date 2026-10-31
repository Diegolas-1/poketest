// Anti-aliasing for the ink (ink_lines, ink_hull, ink_leaf).
//
// INK_SOFT: half the width of the soft edge in pixels. The coverage of a pixel
// by a line is taken over a filter a little wider than a pixel (1.3 px), so a
// stroke reads as a smooth vector line with no stair steps, and it survives a
// video encoder's chroma smear (AirPlay re-encodes the TV picture).
const float INK_SOFT = 0.65;

// ink_even: the share of a pixel covered by ink, made even for the eye. The
// frame blends in linear light and is shown in sRGB, so a dark line's edge
// pixel at 50 % coverage looks only about a quarter as dark as its core: a
// thin line looks like beads on a string ("roping") and its edges like stairs.
// This makes a pixel's darkness follow its coverage as seen (the ink is
// dark and the scene mostly light).
float ink_even(float cov) {
	cov = clamp(cov, 0.0, 1.0);
	return 1.0 - pow(1.0 - cov, 2.2);
}

// ink_cover: a line of width w pixels, a fragment dpx pixels from its centre.
// Under a pixel the line keeps one pixel and fades (alpha = w) instead of
// thinning, which would make it flicker as it crosses pixel centres.
float ink_cover(float dpx, float w) {
	float cw = max(w, 1.0);
	float cov = clamp((cw * 0.5 - dpx) / (2.0 * INK_SOFT) + 0.5, 0.0, 1.0);
	return ink_even(cov) * clamp(w, 0.0, 1.0);
}
