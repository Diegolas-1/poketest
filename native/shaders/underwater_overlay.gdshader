// The part of a thing under the sea, drawn again after the sea (scenery.gd
// _underwater: a copy of each rock, pile, boat and wall that dips below the
// waterline): a flat, darker version of its own colour, so it reads through
// the water at any depth, with a crisp edge at the waterline. Above the water
// it draws nothing.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_back, shadows_disabled;
#include "res://shaders/aces.gdshaderinc"
#include "res://shaders/underwater.gdshaderinc"

uniform vec3 base_col = vec3(0.5);   // linear
uniform bool use_vc = false;

// a hair toward the camera, so it passes the depth test over its own solid copy
void vertex() {
	vec4 vp = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	vp.xyz *= 0.996;
	POSITION = PROJECTION_MATRIX * vp;
}

void fragment() {
	float d = uw_depth(VERTEX, INV_VIEW_MATRIX);
	if (d <= 0.0) discard;
	vec3 b = base_col * (use_vc ? COLOR.rgb : vec3(1.0));
	ALBEDO = uw_colour(b, d);
	ALPHA = clamp(0.9 - d * 0.06, 0.55, 0.9);
}
