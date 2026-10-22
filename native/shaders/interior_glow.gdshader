// Interiors: light added on top (pools under lamps, sunlight on the floor,
// streaks on glass, the doorway's glow): unshaded, additive, no depth write.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;
uniform vec4 albedo : source_color = vec4(1.0);
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_disable;
uniform bool use_tex = false;
uniform bool use_vc = false;
uniform float opacity = 1.0;
void fragment() {
	vec4 c = albedo;
	if (use_vc) c *= COLOR;
	if (use_tex) c *= texture(albedo_tex, UV);
	ALBEDO = c.rgb * c.a * opacity;
}
