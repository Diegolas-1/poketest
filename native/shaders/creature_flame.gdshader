// A Pokémon's flame (the Charmander line's tail tip; species.json: a material's
// "shader": "flame"). The rips draw it as grey ramps the game colours: here the grey
// is the heat, mapped from deep orange through yellow to white-hot, added on top
// (it glows, unlit), the texture's lookup wavering upward so it licks and flickers.
// power: 0 out .. 1 as it burns .. 2 blazing (the creature drives it with its mood).
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform vec2 uv_off = vec2(0.0);
uniform float power = 1.0;
uniform float flicker = 1.0;
uniform vec3 hot : source_color = vec3(1.0, 0.95, 0.6);
uniform vec3 warm : source_color = vec3(1.0, 0.55, 0.08);
uniform vec3 cool : source_color = vec3(0.75, 0.12, 0.02);
uniform float seed = 0.0;

void fragment() {
	float t = TIME * 6.0 + seed;
	vec2 uv = UV + uv_off;
	uv.x += sin(uv.y * 9.0 + t) * 0.025 * flicker;
	uv.y += sin(t * 1.7 + uv.x * 5.0) * 0.03 * flicker;
	float g = texture(albedo_tex, uv).r;
	float wob = 0.85 + 0.15 * sin(t * 2.3) * flicker;
	float h = clamp(g * power * wob, 0.0, 1.6);
	vec3 c = mix(cool, warm, smoothstep(0.05, 0.45, h));
	c = mix(c, hot, smoothstep(0.8, 1.35, h));
	ALBEDO = c * smoothstep(0.02, 0.25, h) * min(power, 1.4);
}
