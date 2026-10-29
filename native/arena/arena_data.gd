class_name ArenaData
extends WorldData
# The Battle Arena's ground (arena/arena.gd): a WorldData of its own, made here
# instead of baked, so everything that reads the world (Ash's steps, the camera,
# the grass field, the battle's stage) works there unchanged. A training ground
# about 100 m square far from the town (its own place: the town is hidden while
# Ash is here), its middle a trainer's battle field of packed clay with chalk
# lines, dirt paths, meadow grass, tall-grass patches for wild battles, trees and
# bushes round a wooden fence.
#
# Everything is in metres from the arena's centre (C, in the world), x east, z south.

const C := Vector2(3000.0, 3000.0)   # far out past the sea: nothing of the town in sight
const HALF := 66.0                   # the grids' half size (m): the fence at 46, the berm and trees beyond
const FENCE := 46.0
const WALK := 45.2                   # Ash keeps inside this
const FIELD := Vector2(6.5, 11.0)    # the clay field's half size (x across, z along)
const TRAINER_Z := 7.6               # where the trainers stand (the chalk boxes), each end
# tall grass: [x, z, half x, half z] (blobs round these boxes)
const TALL := [[-28.0, -26.0, 8.0, 5.5], [27.0, -25.0, 6.5, 6.5], [-30.0, 23.0, 6.5, 5.0], [32.0, 15.0, 5.0, 7.5], [-19.0, -3.0, 3.5, 4.5]]

var paths := []                      # segments [a, b, half width] (local)

func build() -> void:
	meta = {"spawn": [C.x, 0.0, C.y + 38.0], "yaw": PI, "inst": [], "sea": -60.0}
	sea_y = -60.0
	paths = [[Vector2(0, 47), Vector2(0, 11.5), 1.15], [Vector2(-1.5, 30), Vector2(-24, 18), 0.8], [Vector2(1.5, 26), Vector2(26, 10), 0.8],
		[Vector2(-3, -11.5), Vector2(-20, -22), 0.75], [Vector2(3, -11.5), Vector2(22, -20), 0.75],
		[Vector2(-6.0, 0.0), Vector2(-9.6, 0.0), 1.5]]   # (the referee's stand by the side line)
	# the walk grid: 0.5 m
	gres = 0.5
	gnx = int(HALF * 2.0 / gres); gnz = gnx
	gx0 = C.x - HALF; gz0 = C.y - HALF
	heights = PackedByteArray(); heights.resize(gnx * gnz * 2)
	flags = PackedByteArray(); flags.resize(gnx * gnz)
	for j in gnz:
		for i in gnx:
			var x := -HALF + (i + 0.5) * gres
			var z := -HALF + (j + 0.5) * gres
			var k := j * gnx + i
			heights.encode_u16(k * 2, int(round(ground(x, z) * 100.0)) + 2000)
			flags[k] = NO_WALK if (absf(x) > WALK or absf(z) > WALK) else 0
	colliders = []
	_grass_map()
	_path_map()

# the ground's height (local x, z): flat round the field, a gentle roll in the
# meadow, a berm rising past the fence
static func ground(x: float, z: float) -> float:
	var d := maxf(absf(x) - 12.0, 0.0) + maxf(absf(z) - 16.0, 0.0)
	var roll := 0.22 * sin(x * 0.11 + z * 0.07) + 0.16 * sin(z * 0.13 - x * 0.05 + 1.3) + 0.08 * sin(x * 0.31 + 0.7) * cos(z * 0.27)
	var k := clampf(d / 10.0, 0.0, 1.0)
	k = k * k * (3.0 - 2.0 * k)
	var h := roll * k
	# past the fence the ground climbs into a ring of wooded hills (the horizon)
	var e := maxf(absf(x), absf(z)) - FENCE - 1.5
	if e > 0.0:
		var ang := atan2(z, x)
		var ridge := 7.0 + 3.0 * sin(ang * 3.0 + 0.6) + 2.0 * sin(ang * 7.0 + 2.1)
		var u := clampf(e / 55.0, 0.0, 1.0)
		h += minf(e * 0.22, 2.6) * (0.8 + 0.2 * sin(x * 0.2 + z * 0.17)) + ridge * u * u * (3.0 - 2.0 * u)
	return h

func world_ground(x: float, z: float) -> float: return ground(x - C.x, z - C.y)

# how much of a tall-grass patch is here (0..1, a ragged blob)
static func tall_at(x: float, z: float) -> float:
	var best := 0.0
	for t in TALL:
		var u := Vector2((x - t[0]) / t[2], (z - t[1]) / t[3])
		var ang := atan2(u.y, u.x)
		var r := 1.0 + 0.12 * sin(ang * 3.0 + t[0]) + 0.08 * sin(ang * 5.0 + t[1])
		best = maxf(best, clampf((r - u.length()) * 3.0, 0.0, 1.0))
	return best

# the dirt's signed distance (m; < 0 on it): the clay field (a rounded box) and the paths
func dirt_sd(x: float, z: float) -> float:
	var q := Vector2(absf(x), absf(z)) - FIELD + Vector2(1.6, 1.6)
	var sd := Vector2(maxf(q.x, 0.0), maxf(q.y, 0.0)).length() + minf(maxf(q.x, q.y), 0.0) - 1.6
	var p := Vector2(x, z)
	for s in paths:
		var a: Vector2 = s[0]; var b: Vector2 = s[1]
		var ab := b - a
		var h := clampf((p - a).dot(ab) / ab.length_squared(), 0.0, 1.0)
		var wob := 0.12 * sin(h * 17.0 + a.x) + 0.08 * sin(h * 41.0)
		sd = minf(sd, (p - (a + ab * h)).length() - float(s[2]) - wob)
	return sd

# the grass map (1 m): R the ground's height, G the density (meadow 0.45..0.9; + 2
# in tall grass, the grass shader's rule; 0 on the dirt)
func _grass_map() -> void:
	var n := int(HALF * 2.0)
	var img := Image.create(n, n, false, Image.FORMAT_RGF)
	for j in n:
		for i in n:
			var x := -HALF + i + 0.5
			var z := -HALF + j + 0.5
			var dens := 0.34 + 0.14 * sin(x * 0.23 + z * 0.11) * cos(z * 0.19 - x * 0.07) + 0.06 * sin(x * 0.9 + z * 0.7)   # (a mown training ground: short and sparse, the tall patches stand out)
			var sd := dirt_sd(x, z)
			dens *= clampf((sd - 0.1) / 0.9, 0.0, 1.0)
			if absf(x) > FENCE + 6.0 or absf(z) > FENCE + 6.0: dens *= 0.5
			var tall := tall_at(x, z)
			if tall > 0.35 and sd > 0.5: dens = 2.0 + clampf(0.75 + tall * 0.25, 0.0, 1.0)
			img.set_pixel(i, j, Color(ground(x, z), clampf(dens, 0.0, 3.0), 0.0))
	grass_tex = ImageTexture.create_from_image(img)
	grass_area = Vector4(C.x - HALF, C.y - HALF, HALF * 2.0, HALF * 2.0)

# the path map (0.25 m; terrain.gdshader): R the signed distance (sd + 4) / 8, A
# a paler packed clay on the battle field
var pm_origin := Vector2.ZERO
var pm_size := Vector2.ZERO
func _path_map() -> void:
	var span := 104.0
	var res := 0.25
	var n := int(span / res)
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for j in n:
		for i in n:
			var x := -span * 0.5 + (i + 0.5) * res
			var z := -span * 0.5 + (j + 0.5) * res
			var sd := dirt_sd(x, z)
			var on_field := absf(x) < FIELD.x + 0.5 and absf(z) < FIELD.y + 0.5
			img.set_pixel(i, j, Color(clampf((sd + 4.0) / 8.0, 0.0, 1.0), 0.0, 0.0 if on_field else 0.35, 0.18 if on_field else 0.0))
	img.generate_mipmaps()
	path_tex = ImageTexture.create_from_image(img)
	pm_origin = Vector2(C.x - span * 0.5, C.y - span * 0.5)
	pm_size = Vector2(span, span)

func add_circle(x: float, z: float, r: float) -> void:
	colliders.append([0, C.x + x, C.y + z, r, 0.0, 0.0])
	_bk = {}

func add_box(x: float, z: float, hw: float, hd: float, rot := 0.0) -> void:
	colliders.append([1, C.x + x, C.y + z, hw, hd, rot])
	_bk = {}
