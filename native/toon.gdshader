// Cel shading in the anime background style: light in a few flat bands, and
// shade that turns cool (teal and blue) instead of grey. Same look as the web
// build's toon.js.
shader_type spatial;
render_mode specular_disabled;

uniform vec3 albedo : source_color = vec3(1.0);
uniform vec3 shade_tint : source_color = vec3(0.55, 0.68, 0.9);
uniform vec3 deep_tint : source_color = vec3(0.3, 0.42, 0.66);
uniform float band_shadow = 0.3;
uniform float band_lit = 0.62;

void fragment() {
	ALBEDO = albedo;
}

void light() {
	float nl = dot(NORMAL, LIGHT) * 0.5 + 0.5;
	float t = nl * ATTENUATION;
	float s1 = smoothstep(band_shadow - 0.02, band_shadow + 0.02, t);
	float s2 = smoothstep(band_lit - 0.02, band_lit + 0.02, t);
	vec3 c = mix(deep_tint, shade_tint, s1);
	c = mix(c, vec3(1.08, 1.06, 0.96), s2);
	DIFFUSE_LIGHT += c * LIGHT_COLOR / PI;
}
