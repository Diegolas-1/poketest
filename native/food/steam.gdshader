// Steam off a hot dish (food/dishes.gd): a few soft wisps, each a camera-facing
// quad rising, curling and fading; its phase in COLOR.r. Unshaded, a soft white.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;

uniform float height = 0.16;
uniform float speed = 0.22;
uniform float strength = 0.3;
uniform float spread = 0.03;

varying float v_a;

void vertex() {
	float ph = COLOR.r;
	float u = fract(TIME * speed + ph);
	vec3 base = vec3(sin(ph * 37.0) * spread, u * height, cos(ph * 23.0) * spread);
	base.x += sin(u * 5.0 + ph * 12.0) * 0.02 * u;
	base.z += cos(u * 4.0 + ph * 9.0) * 0.015 * u;
	float s = 0.014 + u * 0.034;
	mat4 inv = inverse(MODELVIEW_MATRIX);
	vec3 right = normalize((inv * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
	vec3 up = normalize((inv * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
	VERTEX = base + (right * (UV.x - 0.5) + up * (UV.y - 0.5) * 1.7) * s;
	v_a = sin(u * 3.14159) * strength;
}

void fragment() {
	vec2 d = UV - 0.5;
	float r = length(d * vec2(1.0, 0.7));
	float wisp = smoothstep(0.5, 0.05, r) * (0.65 + 0.35 * sin(UV.y * 9.0 + UV.x * 4.0));
	ALBEDO = vec3(0.97, 0.97, 1.0);
	ALPHA = clamp(wisp * v_a * 1.6, 0.0, 1.0);
}
