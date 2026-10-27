shader_type spatial;
// The bicycle's cel shading (bike/bike_model.gd): the people's light bands
// (actor.gdshaderinc) plus what a bicycle needs: a hard anime glint on paint
// and chrome (gloss), chrome's dark band where it turns away (chrome), and a
// few patterns drawn from the UVs instead of textures: the chain's links
// (scrolled as the cranks turn), the basket's weave, the tyres' tread, and the
// lamp's lit lens (glow).
render_mode ambient_light_disabled;
#include "res://shaders/aces.gdshaderinc"

uniform vec4 albedo : source_color = vec4(1.0);
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform bool use_tex = false;
uniform float alpha_scissor = 0.0;
uniform float lift = 0.0;
uniform vec3 bands = vec3(0.1, 0.3, 0.62);
uniform vec3 deep = vec3(0.5, 0.52, 0.7);
uniform vec3 shade = vec3(0.7, 0.74, 0.9);
uniform vec3 lit = vec3(1.05, 1.04, 1.0);
uniform vec3 lit_add = vec3(0.02, 0.02, 0.01);
uniform float soft = 0.025;
uniform float gloss = 0.0;      // 0 none .. 1 a bright glint
uniform float chrome = 0.0;     // 0 paint .. 1 mirror chrome (a dark band at grazing angles)
uniform int pattern = 0;        // 0 none, 1 chain, 2 weave, 3 tread, 4 lens
uniform float chain_off = 0.0;  // the chain's travel (m)
uniform float glow = 0.0;       // a lit lamp
uniform vec4 col2 : source_color = vec4(0.2, 0.2, 0.22, 1.0);   // the pattern's second colour

void vertex() {
	if (lift > 0.0) VERTEX += NORMAL * lift;
}

void fragment() {
	vec4 c = albedo;
	if (use_tex) c *= texture(albedo_tex, UV);
	if (alpha_scissor > 0.0 && c.a < alpha_scissor) discard;
	if (pattern == 1) {
		// links every 12.7 mm (half an inch): outer plates, rollers between
		float u = fract((UV.x + chain_off) / 0.0127);
		float plate = step(0.18, u) * step(u, 0.82);
		float roll = 1.0 - smoothstep(0.0, 0.12, abs(u - 0.0)) * (1.0 - smoothstep(0.88, 1.0, u));
		c.rgb = mix(col2.rgb, c.rgb, plate * 0.85 + 0.15);
		c.rgb *= 1.0 - 0.35 * (1.0 - plate);
	} else if (pattern == 2) {
		// over-and-under weave: canes along v, crossed by bands
		vec2 g = vec2(UV.x * 26.0, UV.y * 34.0);
		vec2 f = fract(g);
		float cell = mod(floor(g.x) + floor(g.y), 2.0);
		float cane = smoothstep(0.0, 0.25, f.x) * smoothstep(1.0, 0.75, f.x);
		float band = smoothstep(0.0, 0.3, f.y) * smoothstep(1.0, 0.7, f.y);
		float k = mix(cane, band, cell);
		c.rgb = mix(c.rgb * 0.62, c.rgb * 1.08, k);
	} else if (pattern == 3) {
		// tread blocks round the tyre (UV.y round, UV.x across the profile)
		float r = fract(UV.y * 96.0);
		float mid = smoothstep(0.25, 0.32, UV.x) * smoothstep(0.75, 0.68, UV.x);
		c.rgb *= 1.0 - 0.18 * step(0.5, r) * mid;
	} else if (pattern == 4) {
		float d = length(UV - vec2(0.5));
		c.rgb = mix(c.rgb, col2.rgb, smoothstep(0.32, 0.5, d));
	}
	ALBEDO = c.rgb;
	// chrome: the surroundings in it (a light sky band above, a dark ground band below the horizon line)
	if (chrome > 0.0) {
		vec3 wn = (INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz;
		vec3 wv = (INV_VIEW_MATRIX * vec4(VIEW, 0.0)).xyz;
		vec3 r = reflect(-wv, wn);
		float sky = smoothstep(-0.05, 0.05, r.y);
		float rim = smoothstep(0.35, 0.42, 1.0 - dot(NORMAL, VIEW));
		vec3 env = mix(ALBEDO * 0.42, ALBEDO * 1.1, sky);
		ALBEDO = mix(ALBEDO, env * (1.0 - 0.3 * rim), chrome);
	}
	if (glow > 0.0) EMISSION = ALBEDO * glow;
}

void light() {
	float t = clamp(dot(NORMAL, LIGHT), 0.0, 1.0) * ATTENUATION;
	float s0 = smoothstep(bands.x - soft, bands.x + soft, t);
	float s1 = smoothstep(bands.y - soft, bands.y + soft, t);
	float s2 = smoothstep(bands.z - soft, bands.z + soft, t);
	vec3 k = mix(deep, shade, s0);
	k = mix(k, vec3(1.0), s1);
	k = mix(k, lit, s2);
	DIFFUSE_LIGHT += tone_factor(ALBEDO, ALBEDO * k + lit_add * s2);
	if (gloss > 0.0) {
		vec3 h = normalize(LIGHT + VIEW);
		float sp = pow(clamp(dot(NORMAL, h), 0.0, 1.0), 60.0) * ATTENUATION;
		SPECULAR_LIGHT += vec3(smoothstep(0.45, 0.5, sp) * gloss * 0.9);
	}
}
