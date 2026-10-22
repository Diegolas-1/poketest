// The anime sky (nature.js buildSky): deep blue overhead, bright blue band,
// pale hazy horizon, a warm glow round the sun.
shader_type sky;

uniform vec3 sun_dir = vec3(-0.55, 0.75, 0.45);

void sky() {
	vec3 d = EYEDIR;
	float y = d.y;
	vec3 top = vec3(0.07, 0.30, 0.82), mid = vec3(0.28, 0.60, 0.95), hor = vec3(0.80, 0.92, 0.96);
	vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, y));
	c = mix(c, top, smoothstep(0.12, 0.6, y));
	float s = max(dot(d, normalize(sun_dir)), 0.0);
	c += vec3(1.0, 0.92, 0.7) * pow(s, 64.0) * 0.8 + vec3(1.0, 0.85, 0.6) * pow(s, 6.0) * 0.18;
	c = mix(c, vec3(0.86, 0.9, 0.86), smoothstep(0.0, -0.2, y));
	COLOR = c;
}
