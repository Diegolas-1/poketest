// Grass blades for the MultiMesh field: green root to pale tip, swaying in
// the wind, two flat light bands like the web build's grass.
shader_type spatial;
render_mode cull_disabled, specular_disabled;

varying float v_t;

void vertex() {
	v_t = UV.y;
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float w = sin(TIME * 1.5 + wp.x * 0.25 + wp.z * 0.18) * 0.5 + sin(TIME * 3.1 + wp.x * 0.9) * 0.2;
	VERTEX.x += w * v_t * v_t * 0.18;
	VERTEX.z += w * v_t * v_t * 0.08;
	NORMAL = vec3(0.0, 1.0, 0.0);
}

void fragment() {
	vec3 root = vec3(0.03, 0.2, 0.1), body = vec3(0.22, 0.54, 0.08), tip = vec3(0.7, 0.88, 0.2);
	ALBEDO = mix(mix(root, body, smoothstep(0.0, 0.35, v_t)), tip, smoothstep(0.4, 0.85, v_t));
}

void light() {
	float lit = step(0.0, dot(vec3(0.0, 1.0, 0.0), LIGHT)) * ATTENUATION;
	DIFFUSE_LIGHT += mix(vec3(0.62, 0.74, 0.9), vec3(1.05), step(0.5, lit)) * LIGHT_COLOR / PI;
}
