// The anime sky (nature.js buildSky): deep blue overhead, bright blue band,
// pale hazy horizon, a warm glow round the sun. Its colours come from the day
// and night (daynight.gdshaderinc: the defaults are the midday sky); at night
// stars come out and the moon shows its phase.
shader_type sky;
#include "res://shaders/daynight.gdshaderinc"

uniform vec3 sun_dir = vec3(-0.55, 0.75, 0.45);

float sk_hash(vec3 sk_p) { return fract(sin(dot(sk_p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void sky() {
	vec3 d = EYEDIR;
	float y = d.y;
	vec3 sd = normalize(dn_sun_pos.w > 0.5 ? dn_sun_pos.xyz : sun_dir);
	vec3 c = mix(dn_sky_hor.rgb, dn_sky_mid.rgb, smoothstep(0.0, 0.18, y));
	c = mix(c, dn_sky_top.rgb, smoothstep(0.12, 0.6, y));
	float s = max(dot(d, sd), 0.0);
	float disc = dn_sun_pos.w > 0.5 ? clamp(smoothstep(-0.06, 0.02, sd.y), 0.0, 1.0) : 1.0;
	// the glow round the sun, wider and warmer near the horizon (dawn, dusk)
	float low = 1.0 - smoothstep(0.0, 0.35, sd.y);
	float glow = dn_sky_mid.a > 0.0 ? dn_sky_mid.a : 1.0;
	c += vec3(1.0, 0.92, 0.7) * pow(s, 64.0) * 0.8 * disc + vec3(1.0, 0.85, 0.6) * pow(s, 6.0) * 0.18 * glow;
	c += vec3(1.0, 0.55, 0.3) * pow(s, 3.0) * 0.35 * low * glow * smoothstep(-0.25, 0.05, y) * (1.0 - smoothstep(0.0, 0.5, y));
	// night: stars on a fixed grid of the sky dome; the moon
	float st = dn_sky_top.a;
	if (st > 0.001 && y > -0.02) {
		vec3 q = d * 140.0;
		vec3 qi = floor(q);
		float r = sk_hash(qi);
		vec3 qf = fract(q) - 0.5 - (vec3(sk_hash(qi + 1.7), sk_hash(qi + 3.1), sk_hash(qi + 5.3)) - 0.5) * 0.6;
		float star = step(0.986, r) * (1.0 - smoothstep(0.04, 0.16, length(qf)));
		// (no TIME here: a sky shader that reads it is redrawn into its radiance map every frame)
		c += vec3(0.85, 0.9, 1.0) * star * st * smoothstep(-0.02, 0.25, y) * (0.6 + 0.4 * fract(r * 91.0));
		// a faint milky band
		float band = 1.0 - smoothstep(0.0, 0.32, abs(dot(d, normalize(vec3(0.5, 0.35, -0.8)))));
		c += vec3(0.12, 0.13, 0.2) * band * st * smoothstep(0.05, 0.4, y) * (0.6 + 0.4 * sk_hash(floor(d * 30.0)));
	}
	vec3 md = normalize(dn_moon.xyz);
	float mv = clamp(smoothstep(-0.03, 0.05, md.y), 0.0, 1.0) * max(st, 0.18 * (1.0 - step(0.5, disc * smoothstep(0.1, 0.3, sd.y))));
	if (dn_sun_pos.w > 0.5 && mv > 0.001) {
		float mr = 0.026;   // the disc's radius (radians)
		float md_cos = dot(d, md);
		if (md_cos > cos(mr * 4.0)) {
			// the disc's own frame: x across, y up the sky
			vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), md));
			vec3 my = cross(md, mx);
			vec2 mp = vec2(dot(d, mx), dot(d, my)) / mr;
			float mrr = length(mp);
			float inside = 1.0 - smoothstep(0.92, 1.0, mrr);
			// the lit part: a terminator moving across the disc with the phase
			float ph = dn_moon.w;
			float k = cos(ph * 6.2831853);   // 1 new, -1 full
			float zz = sqrt(max(0.0, 1.0 - mrr * mrr));
			// the sun seen from the moon: behind it at new, behind us at full
			float lit = smoothstep(-0.05, 0.05, mp.x * sin(ph * 6.2831853) - k * zz);
			float maria = 0.86 + 0.14 * sk_hash(floor(vec3(mp * 4.0, 1.0)));
			vec3 mcol = mix(vec3(0.1, 0.12, 0.2) * 0.4, vec3(1.0, 0.98, 0.9) * maria, lit);
			c = mix(c, c * 0.5 + mcol, inside * mv);
			// the halo
			c += vec3(0.5, 0.6, 0.8) * pow(max(md_cos, 0.0), 900.0) * 0.25 * mv * (1.0 - inside) * (0.3 + 0.35 * (1.0 - k));
		}
	}
	c = mix(c, vec3(0.86, 0.9, 0.86) * dn_unlit(), smoothstep(0.0, -0.2, y));
	COLOR = c;
}
