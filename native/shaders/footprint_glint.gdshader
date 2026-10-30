shader_type spatial;
// footprints.gd: the faint glint on a fresh wild Pokémon's prints near Ash while he
// crouches. A small star facing the camera, twinkling. INSTANCE_CUSTOM.x its
// phase, .y how strong (0 = off).
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform sampler2D atlas : hint_default_black, filter_linear_mipmap, repeat_disable;
uniform vec3 color = vec3(1.0, 0.93, 0.7);

varying float amt;
varying vec2 cuv;

void vertex() {
	// a billboard at the instance's place, its own size kept
	float s = length(MODEL_MATRIX[0].xyz);
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0] * s, INV_VIEW_MATRIX[1] * s, INV_VIEW_MATRIX[2] * s, MODEL_MATRIX[3]);
	float tw = sin(TIME * 2.6 + INSTANCE_CUSTOM.x * 6.283);
	amt = INSTANCE_CUSTOM.y * pow(max(tw, 0.0), 3.0);
	vec2 uv = vec2(VERTEX.x + 0.5, 0.5 - VERTEX.y);
	cuv = (vec2(3.0, 2.0) + clamp(uv, vec2(0.004), vec2(0.996))) / vec2(4.0, 3.0);
	if (amt <= 0.001) VERTEX = vec3(0.0);
}

void fragment() {
	ALBEDO = color * texture(atlas, cuv).r * amt;
}
