// The anime clouds (web clouds.js): painted sprites from one atlas, each a
// quad turned to the camera (VERTEX = the sprite's anchor, UV2 = the corner's
// offset in metres), the whole sky of them turning slowly about the y axis.
shader_type spatial;
render_mode unshaded, fog_disabled, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
#include "res://shaders/aces.gdshaderinc"

uniform sampler2D atlas : source_color, filter_linear_mipmap, repeat_disable;
uniform float spin = 0.003;

void vertex() {
	float a = TIME * spin, c = cos(a), s = sin(a);
	vec3 p = vec3(VERTEX.x * c + VERTEX.z * s, VERTEX.y, -VERTEX.x * s + VERTEX.z * c);
	vec4 vp = MODELVIEW_MATRIX * vec4(p, 1.0);
	vp.xy += UV2;
	POSITION = PROJECTION_MATRIX * vp;
}

void fragment() {
	vec4 t = texture(atlas, UV);
	ALBEDO = dn_relight(t.rgb, mix(dn_unlit(), dn_sun.rgb, 0.5));
	ALPHA = t.a * COLOR.a;
}
