// The battle arena (battle/battle.gd): the plants and the grass round the spot
// slide away outward, all directions, opening a clear ring; the real ground
// stays as the floor. Everything is moved here, in the vertex shaders of the
// grass and the plants (and their ink and shadows: the same shaders), by two
// globals the battle animates, so nothing is rebuilt and no instance buffer is
// touched (Mobile: a uniform branch, free while no battle is on).
//   battle_arena    x, z: the centre; z: the radius kept clear (m); w: how
//                   open (0 shut .. 1 open; a little past 1 on the overshoot)
//   battle_arena_v  how fast w changes (1/s): the tops trail behind as things slide
// A thing standing at distance r from the centre goes out to
//   r + w * R * 1.05 * (1 - r / (2.6 R))^1.5        (r < 2.6 R; past that it stays)
// which is monotonic (no two things swap places), puts the middle at 1.05 R and
// packs everything that was inside into a ring 1.05 R .. 1.5 R: a wall of tall
// grass and bushes round the floor, thinning out to the untouched field.
global uniform vec4 battle_arena;
global uniform float battle_arena_v;

// the offset (world) for something rooted at root (world); h: how high this
// vertex is above the root (m) for the trailing lean
vec3 arena_push(vec3 root, float h) {
	float R = battle_arena.z;
	vec2 d = root.xz - battle_arena.xy;
	float r = length(d);
	float reach = R * 2.6;
	if (r >= reach) return vec3(0.0);
	vec2 dir = r > 1e-3 ? d / r : vec2(0.7071, 0.7071);
	float f = 1.0 - r / reach;
	float a_out = battle_arena.w * R * 1.05 * f * sqrt(f);
	// the top lags the root while it slides (and swings past it as it settles)
	float a_lean = clamp(-battle_arena_v * 0.09 * f, -0.5, 0.5) * h;
	// a little sink as it goes (what reaches the ring is half hidden in it)
	float sink = -0.12 * battle_arena.w * f * clamp(h, 0.0, 1.0);
	return vec3(dir.x * (a_out + a_lean), sink, dir.y * (a_out + a_lean));
}

bool arena_on() { return battle_arena.w != 0.0 && battle_arena.z > 0.0; }

// the battle's camera (oc_cam) looks at the arena's middle: what stands between them,
// near that line or right by the lens, dithers away so the Pokémon show (a forest's
// crowns, a thicket at the ring). oc_p: the point (world); oc_g: the floor's height
// by it; oc_eye: the pass's camera. 0 kept .. 1 gone; only in the battle camera's own pass
// (the shadows stay whole). (oc_ names: grass.gdshader has a uniform cam)
float arena_occ(vec3 oc_p, float oc_g, vec3 oc_cam, vec3 oc_eye) {
	if (!arena_on() || distance(oc_eye, oc_cam) > 3.0) return 0.0;
	vec3 oc_ab = vec3(battle_arena.x, oc_g + 1.2, battle_arena.y) - oc_cam;
	float oc_u = dot(oc_p - oc_cam, oc_ab) / max(dot(oc_ab, oc_ab), 1e-4);
	float oc_d = distance(oc_p, oc_cam + oc_ab * clamp(oc_u, 0.0, 1.0));
	float oc_r = mix(2.4, 3.6, clamp(oc_u, 0.0, 1.0));
	float oc_k = (1.0 - smoothstep(oc_r * 0.55, oc_r, oc_d)) * (1.0 - smoothstep(0.85, 1.0, oc_u)) * step(-0.05, oc_u);
	oc_k = max(oc_k, 1.0 - smoothstep(2.4, 3.6, distance(oc_p, oc_cam)));
	return oc_k * clamp(battle_arena.w * 1.5, 0.0, 1.0);
}
