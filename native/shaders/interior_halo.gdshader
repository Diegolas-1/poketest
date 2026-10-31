// Interiors: soft halos round lamps and beacons, camera-facing quads (UV2 =
// the corner offset in metres), added on top.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;
#include "res://shaders/daynight.gdshaderinc"
varying vec4 v_col;
void vertex() {
	vec3 c = (MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	c.xy += UV2;
	c.z += 0.2;   // a little toward the camera, so the lamp's own parts do not cut it
	POSITION = PROJECTION_MATRIX * vec4(c, 1.0);
	v_col = COLOR;
}
void fragment() {
	float r = length(UV);
	float a = pow(max(0.0, 1.0 - r), 2.2) * 0.55;
	ALBEDO = v_col.rgb * a * (1.0 + 0.9 * dn_sun.a);
}
