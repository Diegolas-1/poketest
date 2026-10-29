// A Pokémon's flame (the meshes the bake files as "flame": the Charmander line's tail
// tips, Ponyta's mane, Magmar's tail, Moltres' wings; species.json can give a material
// "shader": "flame" too). The X/Y rips draw fire as grey sheets the game colours and
// scrolls: a core (a hard-edged white shape) and a stencil (soft noise), slid along the
// sheet's v as time goes so the edges lick upward and the noise rises through it. Here
// the same: the lookup scrolls (scroll, per second), wavers sideways, and the grey is the
// heat, mapped from a dark red edge through orange to a yellow heart (white only when
// it blazes); blended over what is behind it by that heat, unlit, both sides.
// power: 0 out .. 1 as it burns .. 2 a blaze (the creature drives it with its mood).
shader_type spatial;
render_mode unshaded, blend_mix, cull_disabled, depth_draw_never, shadows_disabled;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform vec2 uv_off = vec2(0.0);
uniform float power = 1.0;
uniform float flicker = 1.0;
uniform float scroll = 0.7;
uniform vec3 hot : source_color = vec3(1.0, 0.86, 0.35);
uniform vec3 warm : source_color = vec3(1.0, 0.45, 0.05);
uniform vec3 cool : source_color = vec3(0.78, 0.1, 0.02);
uniform float seed = 0.0;

void fragment() {
	float t = TIME + seed;
	vec2 uv = UV + uv_off;
	// rising: the sheet slides along v, and wavers across it
	vec2 a = uv + vec2(sin(uv.y * 9.0 + t * 6.0) * 0.02 * flicker, t * scroll);
	vec2 b = uv * vec2(1.0, 0.8) + vec2(0.37, t * scroll * 1.6);
	float g = texture(albedo_tex, a).r * 0.75 + texture(albedo_tex, b).r * 0.35;
	float wob = 0.88 + 0.12 * sin(t * 13.0) * flicker;
	float h = clamp(g * power * wob, 0.0, 2.0);
	vec3 c = mix(cool, warm, smoothstep(0.1, 0.4, h));
	c = mix(c, hot, smoothstep(0.5, 0.9, h));
	c = mix(c, vec3(1.0, 0.97, 0.78), smoothstep(1.2, 1.7, h));
	ALBEDO = c;
	ALPHA = smoothstep(0.08, 0.45, h) * clamp(power, 0.0, 1.0);
}
