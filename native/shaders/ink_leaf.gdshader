// Ink for tree canopies and bushes made of alpha cut-out leaf cards, added by
// Ink.outline_plant as the next pass of the leaf material. The cards are drawn
// once more in ink, grown outward on screen by the line width (along the
// cards' puff normals, or away from the plant's centre when use_center) and
// pushed back in depth: the real leaves cover the inside, so only one
// silhouette per plant shows (no line per card).
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_opaque, shadows_disabled;
#include "res://shaders/aces.gdshaderinc"
#include "res://shaders/arena.gdshaderinc"

global uniform vec3 ink_focus;
uniform vec4 ink_color : source_color = vec4(0.165, 0.129, 0.196, 1.0);
uniform float width_1080 = 1.6;
uniform vec2 fade = vec2(70.0, 170.0);
uniform vec2 focus_range = vec2(10.0, 55.0);
uniform bool use_center = false;
uniform vec3 center;        // the plant's middle in the mesh's (instance's) space
uniform float push = 0.15;  // metres the ink copy steps back
uniform sampler2D leaf_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform bool use_tex = true;
uniform float cut = 0.5;
// as the leaf material: false = its back faces are culled (so are the ink's)
uniform bool double_sided = false;
// plants from veg.gd: their wind, and where their model ends (metres)
global uniform vec3 veg_cam;
uniform float leaf_wind = 0.0;
uniform bool atlas_cut = true;   // the leaf texture is the 4 x 4 leaf atlas
uniform vec2 leaf_fade = vec2(100000.0, 100001.0);
uniform vec2 ink_far = vec2(100000.0, 100001.0);   // the ink thins out over these metres from the camera (veg.gd switches it off past them)

varying float v_w;

void vertex() {
	// WIND: the plants' sway and distance fade (veg_leaf.gdshader, veg.gd):
	// the ink moves with the leaves and goes when the plant hands over to its billboard
	bool plant_gone = false;
	if (leaf_wind > 0.0 || leaf_fade.x < 99999.0) {
		vec3 ip = MODEL_MATRIX[3].xyz;
		plant_gone = distance(ip, veg_cam) > min(leaf_fade.x, ink_far.y);
		float sw = sin(TIME * 1.2 + ip.x * 0.2 + ip.z * 0.17) * 0.6 + sin(TIME * 2.3 + ip.x * 0.5) * 0.25;
		float k = clamp(VERTEX.y / 8.0, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k);
		VERTEX += vec3(sw * leaf_wind * k * 3.0, 0.0, sw * leaf_wind * 0.6 * k * 3.0);
		VERTEX += NORMAL * sin(TIME * 4.0 + UV2.x * 30.0) * 0.03 * UV2.x;
		// a battle's arena: the ink slides out with its plant (arena.gdshaderinc)
		if (arena_on()) VERTEX += inverse(mat3(MODEL_MATRIX)) * arena_push(ip, (mat3(MODEL_MATRIX) * VERTEX).y);
	}
	vec3 vp = (MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 vc = use_center ? (MODELVIEW_MATRIX * vec4(center, 1.0)).xyz : vp;
	float w = 1.0 - smoothstep(focus_range.x, focus_range.y, distance(vc, (VIEW_MATRIX * vec4(ink_focus, 1.0)).xyz));
	w *= 1.0 - smoothstep(fade.x, fade.y, -vc.z);
	w *= 1.0 - smoothstep(ink_far.x, ink_far.y, distance(MODEL_MATRIX[3].xyz, veg_cam));
	// a battle: gone with the leaves that dither away before its camera
	w *= 1.0 - smoothstep(0.1, 0.4, arena_occ((MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz, MODEL_MATRIX[3].y, veg_cam, CAMERA_POSITION_WORLD));
	float px = max(1.0, width_1080 * VIEWPORT_SIZE.y / 1080.0) * w;
	vec4 cv = PROJECTION_MATRIX * vec4(vp, 1.0);
	vec2 d;
	if (use_center) {
		vec4 cc = PROJECTION_MATRIX * vec4(vc, 1.0);
		d = (cv.xy / cv.w - cc.xy / cc.w) * VIEWPORT_SIZE;
	} else {
		d = (PROJECTION_MATRIX * vec4(normalize(MODELVIEW_NORMAL_MATRIX * NORMAL), 0.0)).xy * VIEWPORT_SIZE;
	}
	float l = length(d);
	vp += normalize(vp) * push;
	vec4 c = PROJECTION_MATRIX * vec4(vp, 1.0);
	if (l > 1e-4) c.xy += d / l * px / (0.5 * VIEWPORT_SIZE) * c.w;
	POSITION = c;
	// one plant too far from the player: nothing to draw (the whole plant at once,
	// so no triangle is left half collapsed)
	if (use_center && w <= 0.01) POSITION = vec4(0.0, 0.0, -2.0, 1.0);
	if (plant_gone) { POSITION = vec4(0.0, 0.0, -2.0, 1.0); w = 0.0; }
	v_w = w;
}

void fragment() {
	float a = use_tex ? texture(leaf_tex, UV).a : 1.0;
	if (a < cut || v_w <= 0.01 || (!double_sided && !FRONT_FACING)) discard;
	// a leaf card seen edge-on draws no ink (its grown copy would streak
	// across the canopy). Only the whole card goes, and only when it is
	// nearly a line: the leaf shader no longer trims the cards by the view
	// angle, so the ink keeps the same lobes as the leaves at any angle.
	if (atlas_cut && use_tex) {
		vec3 fN = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
		if (abs(dot(fN, VIEW)) < 0.12) discard;
	}
	ALBEDO = aces_three(ink_color.rgb);
}
