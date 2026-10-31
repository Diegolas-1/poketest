// The distant ranges (web nature.js buildMountains): rounded blue ridges, cel
// lit by the sun, streaked with vertical brush dashes, melting into the haze
// at their foot. UV = (row up the slope 0..1, place along the range 0..1).
shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled;
#include "res://shaders/aces.gdshaderinc"

uniform vec3 sun = vec3(-0.55, 0.75, 0.45);
uniform float far = 0.0;
varying vec3 v_n;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void vertex() { v_n = NORMAL; }

void fragment() {
	float vh = UV.x, va = UV.y;
	float l = dot(normalize(v_n), normalize(dn_light_dir(sun)));
	vec3 lt = mix(vec3(0.36, 0.72, 0.86), vec3(0.62, 0.84, 0.92), far);
	vec3 sh = mix(vec3(0.17, 0.42, 0.63), vec3(0.42, 0.66, 0.82), far);
	vec3 c = mix(sh, lt, smoothstep(0.08, 0.16, l));
	float col = floor(va * 1400.0);
	float row = floor(vh * 9.0 + hash(vec2(col, 1.0)) * 3.0);
	float dash = step(0.55 - (1.0 - smoothstep(0.0, 0.2, l)) * 0.25, hash(vec2(col, row)));
	c = mix(c, c * vec3(0.72, 0.8, 0.9), dash * 0.6 * (1.0 - far * 0.6));
	vec3 haze = vec3(0.78, 0.9, 0.93);
	c = mix(haze, c, smoothstep(0.0, 0.55, vh) * (1.0 - far * 0.35));
	ALBEDO = dn_relight(c, dn_unlit());
}
