// Interiors: unshaded opaque surfaces (screens, the views out of the windows,
// glowing fluids), tone mapped like the web build's basic materials.
shader_type spatial;
render_mode unshaded, shadows_disabled;
#include "res://shaders/aces.gdshaderinc"
uniform vec4 albedo : source_color = vec4(1.0);
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform bool use_tex = false;
uniform bool use_vc = false;
uniform float opacity = 1.0;
// a view out of a window (interior.gd): it takes the hour's outdoor look (dn_view)
uniform float view = 0.0;
void fragment() {
	vec4 c = albedo;
	if (use_vc) c *= COLOR;
	if (use_tex) c *= texture(albedo_tex, UV);
	ALBEDO = aces_three(c.rgb * mix(vec3(1.0), dn_view.rgb, view));
}
