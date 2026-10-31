// Cinnabar Island on the southern horizon (web nature.js buildCinnabar): the
// land's vertex colours (linear), two cel bands from the sun, and the haze
// painted in (no fog: it stands past the fog's end, like the mountains).
shader_type spatial;
render_mode unshaded, fog_disabled, cull_back, shadows_disabled;
#include "res://shaders/aces.gdshaderinc"

uniform vec3 sun = vec3(-0.55, 0.75, 0.45);
varying vec3 v_n;
varying float v_y;

void vertex() { v_n = NORMAL; v_y = VERTEX.y; }

void fragment() {
	float l = dot(normalize(v_n), normalize(dn_light_dir(sun)));
	vec3 c = COLOR.rgb * mix(0.62, 1.0, smoothstep(0.08, 0.16, l));
	c = mix(c, vec3(0.78, 0.9, 0.93), 0.16 + 0.42 * (1.0 - smoothstep(0.0, 45.0, v_y)));
	ALBEDO = dn_relight(c, dn_unlit());
}
