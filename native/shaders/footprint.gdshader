shader_type spatial;
// footprints.gd: one print per instance of a flat quad laid on the ground. The
// ground under it is multiplied darker by the print's depth (fx/footprints.png,
// one cell per kind), so it reads on any ground in any light. INSTANCE_CUSTOM:
// x the cell (+ 16 for a mirrored, right foot), y its birth (s, mod 1024: the
// shader's clock), z its life (s; 0 = gone), w its strength (how dark).
render_mode unshaded, blend_mul, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform sampler2D atlas : hint_default_white, filter_linear_mipmap, repeat_disable;
uniform float now = 0.0;          // seconds, mod 1024
uniform vec3 tint = vec3(0.27, 0.2, 0.15);   // the colour of the deepest part (multiplied in)
uniform float far_fade = 46.0;    // m from the camera where they are gone

varying vec2 cuv;
varying float amt;

void vertex() {
	float c = INSTANCE_CUSTOM.x;
	float flip = step(15.5, c);
	c -= flip * 16.0;
	float age = mod(now - INSTANCE_CUSTOM.y + 1024.0, 1024.0);
	float life = INSTANCE_CUSTOM.z;
	// fresh, then a slow fade over the last two thirds of its life
	float f = 1.0 - smoothstep(life * 0.33, life, age);
	f *= step(0.01, life) * step(age, life);
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float d = length(wp - CAMERA_POSITION_WORLD);
	f *= 1.0 - smoothstep(far_fade * 0.7, far_fade, d);
	amt = f * INSTANCE_CUSTOM.w;
	// local x across, z along (the toe at +z): the cell's top is the toe, its right the
	// print's own right (seen from above)
	float u = 0.5 - VERTEX.x;
	u = mix(u, 1.0 - u, flip);
	float v = 0.5 - VERTEX.z;
	vec2 cell = vec2(mod(c, 4.0), floor(c / 4.0));
	// (a trail tiles end to end: its cell holds a little more than one period, so it
	// keeps off the top and bottom rows the mipmaps mix with the next cell's; atlas.py PAD)
	if (c > 8.5) v = (v + 0.0625) / 1.125;
	cuv = (cell + clamp(vec2(u, v), vec2(0.004), vec2(0.996))) / vec2(4.0, 3.0);
	// a little toward the camera, so the ground's own triangles (not quite the height
	// map's surface) never hide it
	vec3 to_cam = normalize(CAMERA_POSITION_WORLD - wp) * min(0.18, d * 0.012);
	VERTEX += inverse(mat3(MODEL_MATRIX)) * to_cam;
	if (amt <= 0.001) VERTEX = vec3(0.0);   // (gone: nothing drawn)
}

void fragment() {
	float k = texture(atlas, cuv).r * amt;
	ALBEDO = mix(vec3(1.0), tint, clamp(k, 0.0, 1.0));
}
