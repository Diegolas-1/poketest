// The Pokémon (creature.gd): the people's cel shading (actor.gdshaderinc's
// light bands), plus what the X/Y textures need:
//  - an eye atlas offset (uv_off), for models with an eye sheet (Doduo);
//  - painted eyelids, for models whose eyes are only painted on the body
//    texture (Caterpie): each eye is an ellipse in uv (eye_l / eye_r: centre
//    u, v and radii); lid 0 open .. 1 shut covers it from the top with the
//    skin colour sampled just above it (lid_from), and draws the lid's edge
//    as an ink line, curved down (lid_curve > 0, a sleepy "u") or up (< 0,
//    a happy "^") as it closes.
shader_type spatial;
render_mode ambient_light_disabled;
#include "res://shaders/aces.gdshaderinc"

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec2 uv_off = vec2(0.0);
uniform vec3 tint = vec3(1.0);             // a per-material colour multiply (some rips' sheets are paler than the games show them)
uniform vec4 eye_l = vec4(0.0);
uniform vec4 eye_r = vec4(0.0);
uniform vec2 lid_from = vec2(0.0, -1.7);   // where the skin is sampled, in eye radii from the centre
uniform float lid = 0.0;
uniform float lid_curve = 0.35;
uniform vec4 lid_ink : source_color = vec4(0.14, 0.12, 0.1, 1.0);
uniform vec3 bands = vec3(0.1, 0.3, 0.62);
uniform vec3 deep = vec3(0.5, 0.52, 0.7);
uniform vec3 shade = vec3(0.7, 0.74, 0.9);
uniform vec3 lit = vec3(1.05, 1.04, 1.0);
uniform vec3 lit_add = vec3(0.02, 0.02, 0.01);
uniform float soft = 0.025;

vec3 eyelid(vec3 c, vec2 uv, vec4 e) {
	if (e.z <= 0.0 || lid <= 0.01) return c;
	vec2 q = (uv - e.xy) / e.zw;           // the eye as a unit disc, +y down the texture
	float r = length(q);
	if (r > 1.12) return c;
	// the lid's edge: from the top (-1.1) down past the bottom (1.1) as it shuts, curved as it nears shut
	float edge = mix(-1.15, 0.25, lid) + lid_curve * lid * (1.0 - q.x * q.x);
	vec3 skin = texture(albedo_tex, e.xy + lid_from * e.zw).rgb;
	float aa = fwidth(q.y) * 1.2;
	float cover = 1.0 - smoothstep(edge - aa, edge + aa, q.y);
	// shut: the lower part goes to skin as well, only the line remains
	cover = max(cover, smoothstep(0.85, 1.0, lid));
	vec3 o = mix(c, skin, cover);
	float line = 1.0 - smoothstep(0.06, 0.06 + aa * 1.5, abs(q.y - edge));
	line *= 1.0 - smoothstep(0.92, 1.08, r);
	return mix(o, lid_ink.rgb, line * lid_ink.a);
}

void fragment() {
	vec2 uv = UV + uv_off;
	vec3 c = texture(albedo_tex, uv).rgb;
	c = eyelid(c, uv, eye_l);
	c = eyelid(c, uv, eye_r);
	ALBEDO = c * tint;
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
}
