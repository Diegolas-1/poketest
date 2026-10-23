// The painted grass field (web assets.js grassField): clumps of broad blades,
// green root to pale tip, lit or in cool shade by which way each blade faces
// the sun, swaying in the wind. Each tile of clumps is moved next to the
// player (node position); INSTANCE_CUSTOM = clump x, z in the tile, two randoms.
shader_type spatial;
render_mode unshaded, cull_disabled;

uniform sampler2D height_map : filter_linear, repeat_disable;   // R height, G density
uniform vec4 area;   // x0, z0, w, d
uniform vec3 cam;
uniform float field_size = 64.0;
instance uniform float thin = 1.0;   // share of this tile's clumps drawn (grass.gd)
uniform vec3 sun_dir = vec3(-0.55, 0.75, 0.45);
// people walking through (grass.gd set_walkers): x, z, radius, strength. Strength
// 1 under someone, then a damped spring as they pass (below 0 the blades overshoot
// back past upright before settling)
const int PUSH_MAX = 16;
uniform vec4 push[PUSH_MAX];
uniform int push_n = 0;

varying vec3 v_col;
varying float v_light;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void vertex() {
	vec4 off = INSTANCE_CUSTOM;
	vec2 p = off.xy + MODEL_MATRIX[3].xz;
	vec4 hm = texture(height_map, (p - area.xy) / area.zw);
	float dens = hm.g;
	float dist = length(p - cam.xz);
	float fk = smoothstep(field_size * 0.3, field_size * 0.5, dist);
	float keep = step(off.z, dens) * (1.0 - smoothstep(off.w * 0.75, off.w * 0.75 + 0.25, fk)) * (1.0 - fk * 0.35);
	float sc = (0.45 + off.w * 0.35) * (0.6 + dens * 0.6) * keep * min(2.2, pow(thin, -0.3));   // fewer clumps far out: bigger ones
	if (sc <= 0.0) {
		// no grass here: every vertex to one point, so nothing is drawn
		VERTEX = vec3(0.0);
		v_col = vec3(0.0); v_light = 0.0;
	} else {
		float ra = off.z * 40.0, c = cos(ra), s = sin(ra);
		vec3 lp = vec3(VERTEX.x * c - VERTEX.z * s, VERTEX.y, VERTEX.x * s + VERTEX.z * c) * sc;
		float t = UV.y;
		float w = sin(TIME * 1.5 + p.x * 0.25 + p.y * 0.18) * 0.5 + sin(TIME * 3.1 + p.x * 0.9) * 0.2;
		lp.x += w * t * t * 0.12 * sc * 3.0; lp.z += w * t * t * 0.05 * sc * 3.0;
		vec3 wp = vec3(p.x, hm.r, p.y) + lp;
		// parted by whoever walks through: each clump bent away from them and pressed
		// down a little, more toward the tip (lp.y: the height up the blade)
		if (push_n > 0 && dist < 40.0) {
			vec2 bend = vec2(0.0);
			float press = 0.0;
			for (int i = 0; i < PUSH_MAX; i++) {
				if (i >= push_n) break;
				vec4 q = push[i];
				vec2 dv = p - q.xy;   // from the clump's root: its blades bend as one (per vertex they shear into sheets)
				float d = length(dv);
				float f = 1.0 - smoothstep(q.z * 0.3, q.z * 1.25, d);
				if (f <= 0.0) continue;
				bend += (d > 1e-3 ? dv / d : vec2(0.0)) * f * q.w;
				press += f * q.w;
			}
			// a turn of the blade about its root (keeps its length): up to ~60 degrees away,
			// a few degrees back toward them on the overshoot
			float bl = length(bend);
			if (bl > 1e-4) {
				float th = clamp(bl, 0.0, 1.0) * 1.05 * sign(press + 1e-4);
				vec2 dir = bend / bl;
				float h = max(lp.y, 0.0);
				wp.xz += dir * sin(th) * h;
				wp.y -= (1.0 - cos(th)) * h;
			}
		}
		float n = hash(floor(p * 0.3));
		vec3 root = vec3(0.03, 0.2, 0.1), body = mix(vec3(0.2, 0.52, 0.08), vec3(0.26, 0.58, 0.08), n);
		vec3 tip = mix(vec3(0.66, 0.86, 0.16), vec3(0.78, 0.9, 0.24), n);
		v_col = mix(mix(root, body, smoothstep(0.0, 0.35, t)), tip, smoothstep(0.4, 0.85, t)) * mix(vec3(0.55, 0.75, 0.9), vec3(1.0), UV2.x);
		float fa = UV.x + ra;
		vec3 nrm = normalize(vec3(cos(fa), 0.7, sin(fa)));
		v_light = mix(0.78, 1.08, step(0.15, dot(nrm, normalize(sun_dir))));
		VERTEX = wp - MODEL_MATRIX[3].xyz;
	}
}

void fragment() {
	vec3 c = v_col * v_light;
	if (v_light < 0.9) c *= vec3(0.86, 0.95, 1.05);
	ALBEDO = c;
}
