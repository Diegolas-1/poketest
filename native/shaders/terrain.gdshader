// The ground, ported from the web build (terrain.js colours, paths.js dirt,
// toon.js bands): vertex colours times the painted grass texture, and the dirt
// paths painted into the surface from the baked path map, with a ragged edge,
// grass blades leaning over it, ruts, wear, stones and pebbles. In shade the
// dirt keeps a lavender-brown hue instead of going grey.
shader_type spatial;
render_mode ambient_light_disabled;
#include "res://shaders/aces.gdshaderinc"

uniform sampler2D grass_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D path_map : filter_linear_mipmap, repeat_disable;
uniform sampler2D dirt_tex : filter_linear_mipmap_anisotropic, repeat_enable;
// the earth atlas (world/base/earth.webp: eight CC0 soils as painted detail
// around 0.5, 4 x 2 tiles of 512 px with a 16 px wrapped border; web
// props/earth.js): the steep earth's strata and the paths' soils
uniform sampler2D earth_tex : filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec2 pm_origin;
uniform vec2 pm_size;
uniform vec3 sun_dir = vec3(-0.55, 0.75, 0.45);
uniform vec3 d_mid : source_color = vec3(0.847, 0.667, 0.439);
uniform vec3 d_light : source_color = vec3(0.91, 0.784, 0.565);
uniform vec3 d_edge : source_color = vec3(0.769, 0.604, 0.424);
uniform vec3 d_dark : source_color = vec3(0.525, 0.349, 0.227);
uniform vec3 d_pale : source_color = vec3(0.902, 0.812, 0.612);
// ground deeper than this under the sea is hidden by the opaque deep sea
// (sea_deep.gdshader): drawn flat, none of the path work below
uniform float hidden_y = -1000.0;

varying vec3 v_w;
varying vec3 v_n;
varying float v_dirt;

float p_hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float pvn(vec2 p) {
	vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(p_hash(i), p_hash(i + vec2(1, 0)), f.x), mix(p_hash(i + vec2(0, 1)), p_hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 e_tile(vec2 p, float k) {
	vec2 cell = vec2(mod(k, 4.0), floor(k / 4.0));
	vec2 sc = vec2(480.0 / 2048.0, 480.0 / 1024.0);
	vec2 q = (cell * 512.0 + 16.0) / vec2(2048.0, 1024.0) + fract(p) * sc;
	return textureGrad(earth_tex, q, dFdx(p) * sc, dFdy(p) * sc).rgb;
}
float p_sd(vec2 w) { return texture(path_map, (w - pm_origin) / pm_size).r * 8.0 - 4.0; }

// Steep ground (the same in paths.js pathGround): the grass picture projected
// from the side as well as from above (no stretching down a slope), and on
// the steepest slopes bare earth showing through in painted strata, rain
// streaks and pebbles (a = along the face, y = height), with patches of
// grass holding on. Ground under ~25 degrees is drawn exactly as before.
vec3 earth_col(float a, float y) {
	float wob = (pvn(vec2(a * 0.25, 1.7)) - 0.5) * 0.9 + (pvn(vec2(a * 1.1, 5.3)) - 0.5) * 0.2;
	float b = (y + wob) / 1.05, bi = floor(b), bf = fract(b);
	float pk = p_hash(vec2(bi, 3.7));
	vec3 c = pk < 0.3 ? vec3(0.39, 0.18, 0.076) : pk < 0.52 ? vec3(0.27, 0.17, 0.11) : pk < 0.68 ? vec3(0.64, 0.43, 0.19) : vec3(0.33, 0.16, 0.08);
	c *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.06, bf));
	c *= 0.95 + 0.08 * sin(y * 27.0 + pvn(vec2(a * 0.7, y)) * 4.0);
	float st = pvn(vec2(a * 7.0, y * 0.4));
	c *= 0.95 + 0.12 * smoothstep(0.55, 0.7, st) - 0.08 * smoothstep(0.35, 0.2, st);
	vec2 pc = vec2(a, y) / 0.3, ci = floor(pc), fp = fract(pc) - 0.5;
	float h = p_hash(ci + 5.1);
	if (h < 0.24) {
		vec2 off = (vec2(p_hash(ci + 1.3), p_hash(ci + 2.9)) - 0.5) * 0.4;
		float r = 0.12 + h * 0.45, d = length((fp - off) * vec2(1.0, 1.3));
		float sh = smoothstep(r * 1.15, r * 0.95, length((fp - off + vec2(0.0, 0.07)) * vec2(1.0, 1.3)));
		c *= 1.0 - 0.35 * sh * step(r, d);
		vec3 pcol = vec3(0.36, 0.34, 0.31) * (0.8 + h);
		c = mix(c, pcol, smoothstep(r, r - 0.03, d));
		c = mix(c, pcol * 1.45, smoothstep(r * 0.55, r * 0.35, length(fp - off + vec2(0.03, -0.05))));
	}
	return c;
}
vec3 steep_ground(vec3 w, vec3 n, vec3 vc, vec3 flat_grass, out float earth) {
	float s = 1.0 - n.y;
	earth = 0.0;
	if (s < 0.1) return flat_grass;
	vec3 bw = pow(abs(n), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
	vec3 g = texture(grass_tex, w.xz / 4.0).rgb * bw.y + texture(grass_tex, w.zy / 4.0).rgb * bw.x + texture(grass_tex, w.xy / 4.0).rgb * bw.z;
	vec3 grass = mix(flat_grass, vc * g, smoothstep(0.1, 0.2, s));
	float k = smoothstep(0.2, 0.42, s);
	if (k <= 0.0) return grass;
	k *= smoothstep(0.3, 0.55, pvn(w.xz * 0.5 + w.y * 0.4) + k * 0.45);
	float sx = bw.x / max(bw.x + bw.z, 1e-4);
	vec3 e = mix(earth_col(w.x, w.y), earth_col(w.z, w.y), sx);
	// the soil's own detail from the earth atlas: each stratum its soil
	// (loam, clay, eroded silt or dark clay), two soils blended over the face
	float ea = mix(w.x, w.z, sx);
	float band = floor((w.y + (pvn(vec2(ea * 0.25, 1.7)) - 0.5) * 0.9) / 1.05);
	float bt = p_hash(vec2(band, 3.7));
	float t0 = bt < 0.3 ? 2.0 : bt < 0.52 ? 0.0 : bt < 0.68 ? 5.0 : 6.0;
	vec2 ep = vec2(ea, w.y) / 1.6;
	vec3 ed = mix(e_tile(ep, t0), e_tile(ep * 0.83 + vec2(0.37, 0.61), t0 == 0.0 ? 4.0 : 3.0), smoothstep(0.4, 0.6, pvn(w.xz * 0.45 + w.y * 0.3)));
	e *= mix(vec3(1.0), ed * 2.0, 0.8);
	// grass darker where it hangs on over the earth (a soft edge, no line)
	grass *= mix(1.0, 0.8, k);
	earth = k;
	return mix(grass, e, k);
}

void vertex() {
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_n = (MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz;
}

void fragment() {
	vec2 wp = v_w.xz;
	if (v_w.y < hidden_y) {
		ALBEDO = COLOR.rgb;
		v_dirt = 0.0;
	} else {
	float s_earth;
	vec3 base = steep_ground(v_w, normalize(v_n), COLOR.rgb, COLOR.rgb * texture(grass_tex, wp / 4.0).rgb, s_earth);
	vec4 pm = texture(path_map, (wp - pm_origin) / pm_size);
	vec3 dt = texture(dirt_tex, wp / 3.0).rgb;
	float sd = pm.r * 8.0 - 4.0, det = dt.r;
	float pxw = max(length(dFdx(wp)), length(dFdy(wp)));
	// the blades along the dirt's edge stop by 20 m whatever the screen's
	// resolution (on a phone's sharp screen pxw alone ran them much farther)
	float far_k = max(smoothstep(0.02, 0.05, pxw), smoothstep(12.0, 20.0, -VERTEX.z));
	float e_s = sd + (pvn(wp * 0.9) - 0.5) * 0.34 + (pvn(wp * 3.3 + 7.0) - 0.5) * 0.14;
	float e = e_s + (det - 0.45) * 0.08 * (1.0 - far_k);
	float aa = max(fwidth(e), 1e-3);
	float on_dirt = smoothstep(aa, -aa, e);
	vec3 ldw = normalize(sun_dir);
	vec2 s_off = -normalize(ldw.xz + 1e-4) * 0.035;
	float blade = 0.0, b_shade = 0.0, b_tip = 0.5, b_tone = 0.5;
	if (far_k < 0.999 && e_s > -0.42 && e_s < 0.36) {
		vec2 gr = vec2(p_sd(wp + vec2(0.3, 0.0)) - p_sd(wp - vec2(0.3, 0.0)), p_sd(wp + vec2(0.0, 0.3)) - p_sd(wp - vec2(0.0, 0.3)));
		vec2 n = normalize(gr + vec2(1e-5, 0.0));
		float cs = 0.25;
		vec2 ci = floor(wp / cs);
		for (int j = -2; j <= 2; j++) {
			for (int i = -2; i <= 2; i++) {
				vec2 cc = ci + vec2(float(i), float(j));
				vec2 cw = (cc + 0.5) * cs;
				if (abs(e_s + dot(cw - wp, n)) > 0.48) continue;
				float clump = pvn(cw * 1.3 + 21.0);
				for (int k = 0; k < 4; k++) {
					vec2 hs = cc * 1.7 + float(k) * 13.1;
					float h0 = p_hash(hs + 0.3), h1 = p_hash(hs + 5.7), h2 = p_hash(hs + 9.1), h3 = p_hash(hs + 2.9), h4 = p_hash(hs + 7.3);
					if (h0 > 0.55 + clump * 0.45) continue;
					vec2 r0 = (cc + vec2(h1, h2)) * cs;
					float er = e_s + dot(r0 - wp, n);
					float keep = smoothstep(0.3, 0.2, abs(er));
					if (keep <= 0.0) continue;
					float l = (0.12 + h3 * h3 * 0.26) * (0.7 + clump * 0.5);
					vec2 rr = r0 - n * (er - h4 * 0.07);
					vec2 q = wp - rr;
					if (dot(q, q) > (l + 0.05) * (l + 0.05)) continue;
					float an = (h1 - 0.5) * 1.0 + (clump - 0.5) * 0.5, ca = cos(an), sa = sin(an);
					vec2 d = -vec2(ca * n.x - sa * n.y, sa * n.x + ca * n.y), s = vec2(-d.y, d.x);
					float wd = (0.019 + h2 * 0.016) * keep, bend = (h4 - 0.5) * 1.2 / l;
					float al = dot(q, d), ac = dot(q, s) - bend * al * al, tt = al / l;
					float ds = max(max(abs(ac) - wd * pow(max(1.0 - tt, 0.0), 0.7), -al), al - l);
					float cv = smoothstep(pxw * 0.6, -pxw * 0.6, ds);
					if (cv > blade) { blade = cv; b_tip = clamp(tt, 0.0, 1.0); b_tone = h0 / (0.55 + clump * 0.45); }
					vec2 q2 = q - s_off;
					al = dot(q2, d); ac = dot(q2, s) - bend * al * al; tt = al / l;
					ds = max(max(abs(ac) - wd * 1.2 * pow(max(1.0 - tt, 0.0), 0.7), -al), al - l);
					b_shade = max(b_shade, smoothstep(pxw * 0.8, -pxw * 0.8, ds));
				}
			}
		}
	}
	float avg_b = smoothstep(-0.16, 0.03, e_s) * 0.8;
	blade = mix(blade, avg_b, far_k);
	b_shade = mix(b_shade * (1.0 - blade), smoothstep(-0.26, -0.04, e_s) * (1.0 - avg_b) * 0.5, far_k);
	float p_dirt = on_dirt * (1.0 - blade);
	vec3 grass = base;
	float bl = blade * (1.0 - far_k);
	grass *= mix(1.0, mix(0.8, 1.26, b_tip * b_tip) * (0.9 + b_tone * 0.2), bl);
	grass *= mix(1.0, 0.92, far_k * blade);
	grass *= 1.0 + 0.06 * (1.0 - smoothstep(0.0, 0.16, e_s)) * step(0.0, e_s) * (1.0 - bl);
	vec3 c = grass;
	vec2 p_nrm = vec2(0.0);
	if (p_dirt > 0.001) {
		float depth = -sd;
		c = mix(d_edge, d_mid, smoothstep(0.0, 0.75, -e_s));
		c = mix(c, d_light, smoothstep(0.5, 1.7, depth) * 0.5);
		c = mix(c, d_pale, pm.a * smoothstep(0.1, 1.2, depth));
		float lat = pm.g * 3.0 + (pvn(wp * 0.6 + 3.0) - 0.5) * 0.16;
		float rk = pm.b * smoothstep(0.2, 0.9, depth);
		c *= 1.0 - 0.2 * rk * (1.0 - smoothstep(0.08, 0.2, abs(lat - 0.6)));
		c = mix(c, d_light * 1.04, 0.4 * rk * (1.0 - smoothstep(0.03, 0.09, abs(lat - 0.83))));
		float pn = pvn(wp * 0.32 + 11.0) * 0.65 + pvn(wp * 0.9 + 3.0) * 0.35;
		c *= 0.86 + smoothstep(0.25, 0.75, pn) * 0.22;
		// the soils of the track: sandy and gravelly patches from the earth atlas
		// (a seeded blend, so no stretch of path repeats), faint far off
		if (far_k < 0.99) {
			vec2 sp = wp / 2.2;
			vec3 sd2 = mix(e_tile(sp, 1.0), e_tile(sp * 0.83 + vec2(0.3, 0.7), 3.0), smoothstep(0.35, 0.65, pvn(wp * 0.12 + 5.0)));
			c *= mix(vec3(1.0), sd2 * 2.0, 0.3 * (1.0 - far_k));
		}
		float dq = mix(det, floor(det * 4.0 + 0.5) / 4.0, 0.65 * (1.0 - far_k));
		c *= 0.66 + dq * 0.72;
		vec2 nn = dt.gb * 2.0 - 1.0;
		float rel = dot(vec3(nn.x, 0.0, -nn.y), ldw);
		c *= 1.0 + clamp(rel * 1.6, -0.35, 0.3);
		c = mix(c, d_dark, smoothstep(0.2, 0.06, det) * 0.6);
		c = mix(c, d_light * 1.12, smoothstep(0.74, 0.88, det) * 0.55);
		float lip_w = 0.24 + pxw * 6.0;
		float lip = 1.0 - smoothstep(0.0, lip_w, -e_s);
		c *= mix(vec3(1.0), vec3(0.9, 0.86, 0.85), lip);
		c *= 1.0 - 0.3 * b_shade;
		vec2 pc = wp / 0.32, pci = floor(pc), fp = fract(pc) - 0.5;
		float hr = p_hash(pci + 17.0);
		if (hr < 0.22 && -e > 0.12) {
			vec2 off = (vec2(p_hash(pci + 3.1), p_hash(pci + 7.7)) - 0.5) * 0.36;
			float rad = 0.07 + p_hash(pci + 1.3) * 0.09 + step(0.19, hr) * 0.06;
			float an = p_hash(pci + 9.0) * 6.283, ca = cos(an), sa = sin(an);
			vec2 q = fp - off; q = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y); q.y *= 1.35;
			vec2 sdir = -normalize(ldw.xz + 1e-4) * 0.55;
			vec2 qs = fp - off - sdir * rad * 1.5; qs = vec2(ca * qs.x - sa * qs.y, sa * qs.x + ca * qs.y); qs.y *= 1.35;
			float pw = pxw / 0.32 + 1e-3;
			float sh = smoothstep(pw, -pw, length(qs) - rad * 1.1);
			float bd = smoothstep(pw, -pw, length(q) - rad);
			float tp = smoothstep(pw, -pw, length(q + sdir * rad * 0.5) - rad * 0.5);
			vec3 pcol = mix(d_mid, vec3(0.62, 0.58, 0.54), 0.3 + p_hash(pci + 4.4) * 0.4) * (0.7 + p_hash(pci + 5.5) * 0.18);
			c *= 1.0 - 0.55 * sh * (1.0 - bd);
			c = mix(c, pcol, bd);
			c = mix(c, pcol * 1.3, tp * 0.85);
		}
		p_nrm = (dt.gb * 2.0 - 1.0) * p_dirt * (1.0 - far_k * 0.5);
	}
	ALBEDO = mix(grass, c, p_dirt);
	v_dirt = p_dirt;
	NORMAL = normalize(NORMAL + mat3(VIEW_MATRIX) * vec3(p_nrm.x, 0.0, -p_nrm.y) * 0.5);
	}
}

// toon.js bands for the ground (detail 0.5, mid 0.4), then the dirt's
// lavender-brown shade
void light() {
	const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
	float lb = max(dot(ALBEDO, LW), 1e-4);
	float t = clamp(dot(NORMAL, LIGHT), 0.0, 1.0) * ATTENUATION + (lb - 0.4) * 0.5;
	float soft = 0.04;
	float s0 = smoothstep(0.08 - soft, 0.08 + soft, t);
	float s1 = smoothstep(0.22 - soft, 0.22 + soft, t);
	float s2 = smoothstep(0.5 - soft, 0.5 + soft, t);
	vec3 k = mix(vec3(0.5, 0.62, 0.8), vec3(0.66, 0.78, 0.9), s0);
	k = mix(k, vec3(1.0), s1);
	k = mix(k, vec3(1.06, 1.06, 0.98), s2);
	vec3 outc = ALBEDO * k;
	float lo = dot(outc, LW), rr = lo / lb;
	float shd = 1.0 - smoothstep(0.86, 1.0, rr);
	if (v_dirt > 0.001 && shd > 0.0) {
		vec3 wm = ALBEDO * mix(vec3(0.72, 0.64, 0.8), vec3(0.86, 0.8, 0.88), smoothstep(0.5, 0.85, rr));
		wm *= mix(lo, lb * 0.92, 0.6) / max(dot(wm, LW), 1e-4);
		outc = mix(outc, wm, shd * v_dirt * 0.8);
	}
	DIFFUSE_LIGHT += tone_factor(ALBEDO, outc);
}
