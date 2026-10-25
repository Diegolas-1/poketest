// The volcano's plume (web nature.js buildCinnabar): puffs as camera-facing
// quads (VERTEX = the vent, UV = corner -1..1, UV2.x = the puff's phase); each
// rises and drifts east on the wind, grows and fades, then starts again.
shader_type spatial;
render_mode unshaded, fog_disabled, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;

varying float v_a;
varying float v_t;

void vertex() {
	float t = fract(TIME * 0.02 + UV2.x);
	vec3 p = VERTEX + vec3(t * t * 170.0, t * 150.0, t * 25.0);
	float s = 12.0 + t * 62.0;
	vec4 vp = MODELVIEW_MATRIX * vec4(p, 1.0);
	vp.xy += UV * s;
	POSITION = PROJECTION_MATRIX * vp;
	v_t = t;
	v_a = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.55, 1.0, t));
}

void fragment() {
	float d = length(UV);
	float a = (1.0 - smoothstep(0.55, 1.0, d)) * v_a * 0.8;
	if (a < 0.01) discard;
	vec3 c = mix(vec3(0.42, 0.42, 0.44), vec3(0.75, 0.77, 0.8), smoothstep(-0.6, 0.6, UV.y + 0.3) * 0.7 + v_t * 0.3);
	ALBEDO = mix(c, vec3(0.78, 0.9, 0.93), 0.3);
	ALPHA = a;
}
