// Shared by the plant shaders (web foliage.js, assets.js, toon.js celify):
// wind sway from the plant's position, distance fade as a screen-door dither
// (the far billboard takes exactly the pixels the model gives up), and the
// cel bands. veg_cam is the player's camera (a global, so the shadow pass
// fades the same plants as the picture).
global uniform vec3 veg_cam;
#include "res://shaders/arena.gdshaderinc"
uniform vec2 fade = vec2(1000000.0, 1000001.0);   // start, end (metres from the camera)
uniform float shrink = 1.0;                 // a fading plant shrinks to this toward its root
uniform float wind = 0.0;
uniform vec3 bands = vec3(0.12, 0.34, 0.62);
uniform float soft = 0.025;
uniform vec3 deep = vec3(0.42, 0.5, 0.68);
uniform vec3 shade = vec3(0.62, 0.7, 0.86);
uniform vec3 lit = vec3(1.06, 1.04, 0.98);
uniform vec3 lit_add = vec3(0.02, 0.02, 0.0);
uniform float detail = 0.0;
uniform float mid = 0.3;
uniform float gain = 1.0;

float fd_b2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float fd_b4(vec2 a) { return fd_b2(0.5 * a) * 0.25 + fd_b2(a); }
float fd_b8(vec2 a) { return fd_b4(0.5 * a) * 0.25 + fd_b2(a); }

// 0 shown .. 1 gone, for a plant standing at p
float fade_k(vec3 p) { return smoothstep(fade.x, fade.y, distance(p, veg_cam)); }

// the web's swayGLSL: phase from the plant's place, bend grows with height
vec3 sway(vec3 v, vec3 ip, float t) {
	float s = sin(t * 1.2 + ip.x * 0.2 + ip.z * 0.17) * 0.6 + sin(t * 2.3 + ip.x * 0.5) * 0.25;
	float k = clamp(v.y / 8.0, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k);
	return v + vec3(s * wind * k * 3.0, 0.0, s * wind * 0.6 * k * 3.0);
}

// three's Lambert under the sun (#fff0d4 x 2.9) seen by celify: N.L times
// the sun colour's luminance, in the shadow
const float SUN_LUM = 0.883;
vec3 cel(vec3 base, float t) {
	float s0 = smoothstep(bands.x - soft, bands.x + soft, t);
	float s1 = smoothstep(bands.y - soft, bands.y + soft, t);
	float s2 = smoothstep(bands.z - soft, bands.z + soft, t);
	vec3 c = mix(base * deep, base * shade, s0);
	c = mix(c, base, s1);
	c = mix(c, base * lit + lit_add, s2);
	return c * gain;
}

// a battle's arena (arena.gdshaderinc): the whole plant slides out, the vertex
// given in the instance's space, moved by a world offset
vec3 arena_vertex(vec3 v, mat4 model) {
	if (!arena_on()) return v;
	mat3 m = mat3(model);
	vec3 o = arena_push(model[3].xyz, (m * v).y);
	return v + inverse(m) * o;
}
