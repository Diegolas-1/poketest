// Food (food/dishes.gd): the people's cel bands (actor.gdshaderinc) with what
// makes anime food look delicious: a hard glossy highlight (sauces, syrup,
// glazes, a wet grain of rice), a soft warm rim light, vertex colours for
// baked browning and gradients, and a little sparkle on sugar and glaze.
shader_type spatial;
render_mode ambient_light_disabled;
#include "res://shaders/aces.gdshaderinc"

uniform vec4 albedo : source_color = vec4(1.0);
uniform bool use_vc = true;
uniform vec3 bands = vec3(0.06, 0.26, 0.58);
uniform vec3 deep = vec3(0.66, 0.55, 0.62);
uniform vec3 shade = vec3(0.84, 0.77, 0.84);
uniform vec3 lit = vec3(1.07, 1.05, 1.0);
uniform float soft = 0.06;
uniform float gloss = 0.0;          // 0 matte .. 1 a hard wet highlight
uniform float gloss_size = 0.94;    // the highlight's edge (dot(N, H)): higher = smaller
uniform vec4 rim : source_color = vec4(1.0, 0.92, 0.8, 0.25);
uniform float sparkle = 0.0;        // sugar, glaze: little glints
uniform float glow = 0.0;           // a little light of its own (the inside of a cup of tea)
varying vec3 v_lp;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void vertex() { v_lp = VERTEX; }

void fragment() {
	vec4 c = albedo;
	if (use_vc) c *= COLOR;
	ALBEDO = c.rgb;
	// the rim: a warm edge where the surface turns away
	float fr = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	EMISSION = rim.rgb * rim.a * fr * c.rgb + c.rgb * glow;
	if (sparkle > 0.0) {
		float h = hash(floor(v_lp * 260.0));
		float tw = step(0.985, h) * (0.5 + 0.5 * sin(TIME * 3.0 + h * 40.0));
		EMISSION += vec3(1.0, 0.97, 0.9) * tw * sparkle * pow(clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.0);
	}
}

void light() {
	float t = clamp(dot(NORMAL, LIGHT), 0.0, 1.0) * ATTENUATION;
	float s0 = smoothstep(bands.x - soft, bands.x + soft, t);
	float s1 = smoothstep(bands.y - soft, bands.y + soft, t);
	float s2 = smoothstep(bands.z - soft, bands.z + soft, t);
	vec3 k = mix(deep, shade, s0);
	k = mix(k, vec3(1.0), s1);
	k = mix(k, lit, s2);
	DIFFUSE_LIGHT += tone_factor(ALBEDO, ALBEDO * k);
	if (gloss > 0.0) {
		vec3 H = normalize(LIGHT + VIEW);
		float sp = smoothstep(gloss_size, gloss_size + 0.012, dot(NORMAL, H)) * gloss * ATTENUATION;
		SPECULAR_LIGHT += vec3(1.0, 0.98, 0.94) * sp * 1.4;
	}
}
