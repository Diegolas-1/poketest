// Ink for characters and solid props without baked edges: an inverted hull,
// added by Ink.outline_mesh as the next pass of each surface material. The
// back faces are pushed out along the normal by a fixed number of pixels (the
// same width as the vector ink, thinning with distance from the player), so
// they show as a line around the silhouette and where one part passes in front
// of another (an arm against the body). Skinned meshes work: Godot skins the
// vertices before this shader runs. Needs smooth normals.
shader_type spatial;
render_mode unshaded, cull_front, blend_mix, depth_draw_never, shadows_disabled;
#include "res://shaders/aces.gdshaderinc"

global uniform vec3 ink_focus;
uniform vec4 ink_color : source_color = vec4(0.165, 0.129, 0.196, 1.0);
uniform float width_1080 = 1.1;
uniform vec2 fade = vec2(70.0, 170.0);
uniform vec2 focus_range = vec2(10.0, 55.0);
// the hull steps back a little so it never pokes through the front faces
uniform float push = 0.03;

varying float v_alpha;
varying vec3 v_col;

void vertex() {
	// DEFORM: a mesh that moves its vertices in its own shader repeats that here
	vec3 vp = (MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 vn = normalize(MODELVIEW_NORMAL_MATRIX * NORMAL);
	// width and fade from the object's origin (a character is small), so the
	// whole hull goes at once when it is too far
	vec3 vo = (MODELVIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float w = 1.0 - smoothstep(focus_range.x, focus_range.y, distance(vo, (VIEW_MATRIX * vec4(ink_focus, 1.0)).xyz));
	float fl = 1.0 - smoothstep(fade.x, fade.y, -vo.z);
	float core = max(1.0, width_1080 * VIEWPORT_SIZE.y / 1080.0) * w;
	// below a pixel the line keeps one pixel and fades instead
	float px = max(core, 1.0);
	vp += normalize(vp) * push;
	vec4 c = PROJECTION_MATRIX * vec4(vp, 1.0);
	vec2 nd = (PROJECTION_MATRIX * vec4(vn, 0.0)).xy * VIEWPORT_SIZE;
	float l = length(nd);
	if (l > 1e-5) c.xy += nd / l * px / (0.5 * VIEWPORT_SIZE) * c.w;
	POSITION = c;
	if (fl * w <= 0.003) POSITION = vec4(0.0, 0.0, -2.0, 1.0);   // too far: nothing to draw
	v_alpha = fl * min(core, 1.0) * ink_color.a;
	v_col = aces_three(ink_color.rgb);
}

void fragment() {
	if (v_alpha <= 0.003) discard;
	ALBEDO = v_col;
	ALPHA = v_alpha;
}
