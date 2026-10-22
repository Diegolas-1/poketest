// Ink for tree canopies and bushes made of alpha cut-out leaf cards, added by
// Ink.outline_plant as the next pass of the leaf material. The cards are drawn
// once more in ink, grown outward on screen by the line width (along the
// cards' puff normals, or away from the plant's centre when use_center) and
// pushed back in depth: the real leaves cover the inside, so only one
// silhouette per plant shows (no line per card).
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_opaque, shadows_disabled;
#include "res://shaders/aces.gdshaderinc"

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

varying float v_w;

void vertex() {
	// WIND: copy the leaf shader's sway here (applied to VERTEX) if the leaves move
	vec3 vp = (MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 vc = use_center ? (MODELVIEW_MATRIX * vec4(center, 1.0)).xyz : vp;
	float w = 1.0 - smoothstep(focus_range.x, focus_range.y, distance(vc, (VIEW_MATRIX * vec4(ink_focus, 1.0)).xyz));
	w *= 1.0 - smoothstep(fade.x, fade.y, -vc.z);
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
	v_w = w;
}

void fragment() {
	float a = use_tex ? texture(leaf_tex, UV).a : 1.0;
	if (a < cut || v_w <= 0.01 || (!double_sided && !FRONT_FACING)) discard;
	ALBEDO = aces_three(ink_color.rgb);
}
