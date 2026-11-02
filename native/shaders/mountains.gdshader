// The distant ranges (web nature.js buildMountains): rounded blue ridges, cel
// lit by the sun, streaked with vertical brush dashes, melting into the haze
// at their foot. UV = (row up the slope 0..1, place along the range 0..1).
// kind 1: the ranges round Viridian's valley (nature.js valleyRanges):
// forested green ridges with rock outcrops and gullies, each layer paler and
// bluer with distance (far), melting into the day's own haze (dn_fog) at the
// foot, so they sit in the same air as the valley at dusk and at night.
shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled;
#include "res://shaders/aces.gdshaderinc"

uniform vec3 sun = vec3(-0.55, 0.75, 0.45);
uniform float far = 0.0;
uniform float kind = 0.0;
varying vec3 v_n;
varying vec3 v_w;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }

void vertex() { v_n = NORMAL; v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }

void fragment() {
	float vh = UV.x, va = UV.y;
	float l = dot(normalize(v_n), normalize(dn_light_dir(sun)));
	if (kind > 0.5) {
		// the place on the range in metres (along it, up it): crowns, gullies, rock
		vec2 q = vec2(va * 10000.0, v_w.y);   // (va: metres along the range / 10000)
		float lit = smoothstep(-0.05, 0.12, l);
		vec3 fl = mix(vec3(0.27, 0.50, 0.30), vec3(0.42, 0.62, 0.40), vn(q * 0.004));
		vec3 fs = vec3(0.13, 0.30, 0.27);
		vec3 c = mix(fs, fl, lit);
		// tree crowns: dabs of darker green, finer near the top
		float cr = vn(q * vec2(0.09, 0.12));
		c *= 1.0 - 0.22 * smoothstep(0.55, 0.8, cr);
		// gullies running down the slope, in shade
		float gu = vn(vec2(q.x * 0.018, q.y * 0.002));
		c = mix(c, fs * 0.9, smoothstep(0.62, 0.78, gu) * 0.55);
		// grey rock outcrops and cliffs high up, lit on the sun's side
		float rk = vn(q * vec2(0.012, 0.02)) * 0.7 + vn(q * 0.05) * 0.3;
		float rock = smoothstep(0.58, 0.64, rk + vh * 0.35 - 0.22);
		c = mix(c, mix(vec3(0.42, 0.44, 0.46), vec3(0.72, 0.70, 0.66), lit), rock * 0.85);
		c = dn_relight(c, dn_unlit());
		// the air: paler and bluer the further, thickest at the foot
		vec3 air = mix(dn_fog.rgb, dn_sky_hor.rgb, 0.25);
		float hz = clamp(far + (1.0 - smoothstep(0.0, 0.7, vh)) * (0.45 + far * 0.4), 0.0, 0.94);
		ALBEDO = mix(c, air, hz);
	} else {
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
}
