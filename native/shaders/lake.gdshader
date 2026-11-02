// Viridian's crater lake (terrain.js lakeFrag, mesh fresh5_*): still deep
// water that mirrors the sky and the ring of mountains round it (a painted
// reflection: the sky's own bands from the day and night, a dark band of the
// far shore's mountains near the horizon, broken by slow ripples), lighter
// over the shallows at its edge, a glint where the sun lies on it.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_always, cull_disabled;

#include "res://shaders/aces.gdshaderinc"
varying vec3 v_w;

float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
#include "res://shaders/part.gdshaderinc"

void vertex() { v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }

void fragment() {
	vec3 V = normalize(CAMERA_POSITION_WORLD - v_w);
	// ripples bend the mirrored ray a little
	float rp = n(v_w.xz * vec2(0.09, 0.6) + vec2(TIME * 0.04, 0.0)) - 0.5;
	float el = clamp(V.y + rp * 0.03, 0.0, 1.0);
	float az = atan(-V.x, -V.z);
	// the sky: its own bands (day and night), as the sky shader paints them
	vec3 sky = mix(dn_sky_hor.rgb, dn_sky_mid.rgb, smoothstep(0.02, 0.3, el));
	sky = mix(sky, dn_sky_top.rgb, smoothstep(0.3, 0.9, el));
	// the crater's walls round the lake, upside down: the near wooded rim (high
	// where the mountains stand close, to the west), a bluer range over it,
	// and toward the city (east) the low line of its roofs and towers
	vec2 dir = -V.xz / max(length(V.xz), 1e-3);
	float west = clamp(-dir.x * 0.8 + 0.25, 0.0, 1.0);
	float rim = mix(0.07, 0.34, west) + 0.07 * n(vec2(az * 4.0, 1.3)) + 0.025 * n(vec2(az * 15.0, 7.1));
	float back = rim + 0.05 + 0.08 * n(vec2(az * 2.6, 3.7)) + 0.02 * n(vec2(az * 9.0, 2.2));
	float city = (1.0 - west) * step(0.0, dir.x) * (0.03 + 0.05 * step(0.55, n(vec2(az * 40.0, 4.0))));
	rim = max(rim * mix(0.35, 1.0, west), city);
	float m1 = 1.0 - smoothstep(rim - 0.006, rim + 0.006, el);
	float m2 = 1.0 - smoothstep(back - 0.006, back + 0.006, el);
	vec3 air = mix(dn_fog.rgb, dn_sky_hor.rgb, 0.3);
	vec3 green = mix(vec3(0.12, 0.27, 0.22), vec3(0.22, 0.42, 0.30), n(vec2(az * 30.0, el * 60.0))) * dn_water();
	vec3 blue = mix(vec3(0.26, 0.40, 0.50) * dn_water(), air, 0.5);
	vec3 refl = mix(sky, blue, m2 * 0.9);
	refl = mix(refl, mix(green, air, 0.18 + 0.3 * smoothstep(0.0, rim, el)), m1 * 0.92);
	// the water itself: deep blue-green, lighter over the shelf at the edge
	float edge = UV.x;
	vec3 deep = mix(vec3(0.07, 0.26, 0.38), vec3(0.24, 0.56, 0.56), edge * 0.8) * dn_water();
	float fr = 0.35 + 0.6 * pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
	vec3 c = mix(deep, refl, fr);
	// streaks of brighter ripple
	float s = n(v_w.xz * vec2(0.07, 0.45) + vec2(TIME * 0.05, 0.0));
	c = mix(c, c * 1.25 + vec3(0.04), step(0.8, s) * 0.5 * (1.0 - fr * 0.5));
	// the sun's (or moon's) glint
	vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
	float g = pow(max(dot(R, normalize(dn_sun_pos.xyz)), 0.0), 220.0) * step(0.0, dn_sun_pos.y);
	c += vec3(1.0, 0.92, 0.78) * g * step(0.6, n(v_w.xz * 1.7 + TIME * 0.3)) * 1.5;
	float pdark;
	float pf = bike_part(v_w.xz, pdark);
	c = mix(c * (1.0 - 0.16 * pdark), vec3(0.97, 1.0, 1.0), pf);
	ALBEDO = c;
	ALPHA = max(0.94, pf);
}
