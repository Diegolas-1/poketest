// The day and night (daynight.gd sets these globals a few times a second; their
// defaults are the fixed midday look, so a scene without daynight.gd, a test or
// the cycle switched off, draws exactly as before). Every name here starts
// with dn_: the shaders that include this keep their own locals clear of them.
//   dn_sun      the tint of lit surfaces (rgb); a: night 0 (day) .. 1 (deep night)
//   dn_amb      the tint of surfaces in shade (rgb); a: unused
//   dn_dir      toward the light that casts the shadows (sun, or moon at night);
//               w 1 while daynight.gd drives it (else the shader's own sun uniform)
//   dn_sun_pos  toward the sun itself, below the horizon too; w: its disc 0..1
//   dn_moon     toward the moon; w: its phase 0 new .. 0.5 full .. 1 new
//   dn_sky_top / dn_sky_mid / dn_sky_hor   the sky's three bands; top.a: stars,
//               mid.a: sun glow strength, hor.a: unused
//   dn_fog      the haze colour (rgb); a: unused
//   dn_glow     x: street and porch lamps lit, y: windows lit (share of them),
//               z: fireflies, w: the unlit things' night (water, grass blades)
//   dn_view     interiors: the tint of the views out of the windows (rgb); a: unused
#ifndef DN_INC
#define DN_INC
global uniform vec4 dn_sun;
global uniform vec4 dn_amb;
global uniform vec4 dn_dir;
global uniform vec4 dn_sun_pos;
global uniform vec4 dn_moon;
global uniform vec4 dn_sky_top;
global uniform vec4 dn_sky_mid;
global uniform vec4 dn_sky_hor;
global uniform vec4 dn_fog;
global uniform vec4 dn_glow;
global uniform vec4 dn_view;

// the light's direction: the live one while the cycle runs, else the fallback
vec3 dn_light_dir(vec3 dn_fallback) { return dn_dir.w > 0.5 ? dn_dir.xyz : dn_fallback; }
// the tint for a surface lit by dn_lit (0 in shade .. 1 in full light)
vec3 dn_tint(float dn_lit) { return mix(dn_amb.rgb, dn_sun.rgb, smoothstep(0.1, 0.5, dn_lit)); }
// unshaded surfaces (water, grass blades, clouds, ranges): mostly the sun's tint
vec3 dn_unlit() { return mix(dn_amb.rgb, dn_sun.rgb, 0.65); }
#endif
