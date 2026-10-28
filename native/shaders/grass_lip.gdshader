// The grass lips (grass_lip.gd; web grasslip.js LIP_VS): the grass field's
// clump (the same blades, colours, light and wind as grass.gdshader) planted
// on a brim and bent out over the edge. Instance transform: local +x out over
// the edge, its scale; INSTANCE_CUSTOM = droop, stretch (blade length), a
// random number. No ink.
shader_type spatial;
render_mode unshaded, cull_disabled;

uniform vec3 sun_dir = vec3(-0.55, 0.75, 0.45);

varying vec3 v_col;
varying float v_light;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void vertex() {
	vec3 root = MODEL_MATRIX[3].xyz;
	float droop = INSTANCE_CUSTOM.x, st = INSTANCE_CUSTOM.y;
	float rnd = hash(root.xz * 3.1);
	// the clump turned its own way, its blades stretched, a little fuller
	float ra = rnd * 40.0, c = cos(ra), s = sin(ra);
	vec3 lp = vec3(VERTEX.x * c - VERTEX.z * s, VERTEX.y * st, VERTEX.x * s + VERTEX.z * c) * vec3(1.12, 1.0, 1.12);
	float t = UV.y;
	// bent over the edge (+x): more toward the tips and for the blades already
	// leaning out; the ones leaning back lie on the crown
	float h = max(lp.y, 0.0);
	float ow = lp.x / max(length(lp.xz), 0.02);
	float a = droop * pow(t, 1.15) * 1.25 * (0.62 + 0.38 * ow);
	float ca = cos(a), sa = sin(a);
	lp = vec3(lp.x * ca + h * sa, -lp.x * sa + h * ca, lp.z);
	// the field's wind (world x, z), a little more on what hangs free
	float sc = length(MODEL_MATRIX[0].xyz);
	float w = sin(TIME * 1.5 + root.x * 0.25 + root.z * 0.18) * 0.5 + sin(TIME * 3.1 + root.x * 0.9) * 0.2;
	float fr = 1.0 + max(0.0, -ca) * 0.8;
	vec3 wind_w = vec3(w * t * t * 0.12 * 3.0 * fr, 0.0, w * t * t * 0.05 * 3.0 * fr) * sc;
	lp += transpose(mat3(MODEL_MATRIX)) * wind_w / max(sc * sc, 1e-4);
	VERTEX = lp;
	float n = hash(floor(root.xz * 0.3));
	vec3 cr = vec3(0.03, 0.2, 0.1), body = mix(vec3(0.2, 0.52, 0.08), vec3(0.26, 0.58, 0.08), n);
	vec3 tip = mix(vec3(0.66, 0.86, 0.16), vec3(0.78, 0.9, 0.24), n);
	v_col = mix(mix(cr, body, smoothstep(0.0, 0.35, t)), tip, smoothstep(0.4, 0.85, t)) * mix(vec3(0.55, 0.75, 0.9), vec3(1.0), UV2.x);
	float fa = UV.x + ra + atan(MODEL_MATRIX[0].z, MODEL_MATRIX[0].x);
	vec3 nrm = normalize(vec3(cos(fa), 0.7, sin(fa)));
	// what hangs below the brim is in the turf's shade
	v_light = mix(0.78, 1.08, step(0.15, dot(nrm, normalize(sun_dir))) * step(-0.15, ca));
}

void fragment() {
	vec3 c = v_col * v_light;
	if (v_light < 0.9) c *= vec3(0.86, 0.95, 1.05);
	ALBEDO = c;
}
