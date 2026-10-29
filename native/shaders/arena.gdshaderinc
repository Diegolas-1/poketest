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
	float push = battle_arena.w * R * 1.05 * f * sqrt(f);
	// the top lags the root while it slides (and swings past it as it settles)
	float lean = clamp(-battle_arena_v * 0.09 * f, -0.5, 0.5) * h;
	// a little sink as it goes (what reaches the ring is half hidden in it)
	float sink = -0.12 * battle_arena.w * f * clamp(h, 0.0, 1.0);
	return vec3(dir.x * (push + lean), sink, dir.y * (push + lean));
}

bool arena_on() { return battle_arena.w != 0.0 && battle_arena.z > 0.0; }
