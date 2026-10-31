// Interiors: light added on top (pools under lamps, sunlight on the floor,
// streaks on glass, the doorway's glow): unshaded, additive, no depth write.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;
#include "res://shaders/daynight.gdshaderinc"
uniform vec4 albedo : source_color = vec4(1.0);
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_disable;
uniform bool use_tex = false;
uniform bool use_vc = false;
uniform float opacity = 1.0;
// interior.gd: daylight 1 = sunlight through a window (gone at night), 0.6 =
// the doorway's glow (fainter); lamp 1 = a lamp's pool (brighter at night)
uniform float daylight = 0.0;
uniform float lamp = 0.0;
void fragment() {
	vec4 c = albedo;
	if (use_vc) c *= COLOR;
	if (use_tex) c *= texture(albedo_tex, UV);
	ALBEDO = c.rgb * c.a * opacity * (1.0 - daylight * dn_sun.a) * (1.0 + lamp * 0.7 * dn_sun.a);
}
