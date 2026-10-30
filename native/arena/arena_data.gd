class_name ArenaData
extends WorldData
# The Battle Arena's ground (arena/arena.gd): a WorldData of its own, made here
# instead of baked, so everything that reads the world (Ash's steps, the camera,
# the grass field, the battle's stage) works there unchanged. A training ground
# about 100 m square far from the town (its own place: the town is hidden while
# Ash is here), its middle a trainer's battle field of packed clay with chalk
# lines, dirt paths, meadow grass, tall-grass patches for wild battles, trees and
# bushes round a wooden fence: the hub. Round it the regions (arena/regions/*.gd,
# ArenaRegions), each through a gate in the fence: their rects are flat ground
# (the hills climb round the hub and them together), their paths, tall grass and
# floor join the hub's here.
#
# Everything is in metres from the arena's centre (C, in the world), x east, z south.

const C := Vector2(3000.0, 3000.0)   # far out past the sea: nothing of the town in sight
const HALF := 66.0                   # the hub's grids' half size (m): the fence at 46, the berm and trees beyond
const FENCE := 46.0
const WALK := 45.2                   # Ash keeps inside this (in the hub)
const FIELD := Vector2(6.5, 11.0)    # the clay field's half size (x across, z along)
const TRAINER_Z := 7.6               # where the trainers stand (the chalk boxes), each end
const MARGIN := 34.0                 # the grids reach this far past a region's rect (its hills)
# the hub's tall grass: [x, z, half x, half z] (blobs round these boxes): the hunt's
# fields (arena/arena_hunt.gd), each path's end running into one, the clay field and
# the gate's way in kept clear
const TALL := [[-28.0, -26.0, 10.0, 7.0], [27.0, -25.0, 8.5, 7.5], [-31.0, 24.0, 9.0, 6.5], [32.0, 15.0, 7.0, 10.0],
	[-19.0, -3.0, 4.5, 6.0], [-2.0, -31.0, 8.0, 5.0], [-38.0, -6.0, 4.5, 6.0]]

# every tall patch, the hub's first (TALL, indices 0..6), then each region's: [x, z, hx, hz];
# ZONE: which each is in ("hub" or a region's id)
static var PATCHES: Array = TALL.duplicate()
static var ZONE: Array = []
static var REG: Array = []           # the regions' defs (ArenaRegions.all())
static var RECTS: Array = []         # their rects (Rect2, local), the same order
static var BOX := Rect2(-HALF, -HALF, HALF * 2.0, HALF * 2.0)   # the grids' extent (local)

var paths := []                      # segments [a, b, half width] (local): the hub's, then the regions'
var _pbox := []                      # each segment's box, grown by its reach (a quick miss in dirt_sd)

func build() -> void:
	_regions()
	meta = {"spawn": [C.x, 0.0, C.y + 38.0], "yaw": PI, "inst": [], "sea": -60.0}
	sea_y = -60.0
	paths = [[Vector2(0, 47), Vector2(0, 11.5), 1.15], [Vector2(-1.5, 30), Vector2(-24, 18), 0.8], [Vector2(1.5, 26), Vector2(26, 10), 0.8],
		[Vector2(-3, -11.5), Vector2(-20, -22), 0.75], [Vector2(3, -11.5), Vector2(22, -20), 0.75],
		[Vector2(-6.0, 0.0), Vector2(-9.6, 0.0), 1.5]]   # (the referee's stand by the side line)
	for r in REG:
		# the way to its gate from the hub's paths, then its own trail
		var lk: Array = r.get("link", [])
		for i in range(lk.size() - 1): paths.append([Vector2(lk[i][0], lk[i][1]), Vector2(lk[i + 1][0], lk[i + 1][1]), 0.9])
		for s in r.get("paths", []): paths.append(s)
	_pbox = []
	for s in paths:
		var a: Vector2 = s[0]; var b: Vector2 = s[1]
		_pbox.append(Rect2(a, Vector2.ZERO).expand(b).grow(float(s[2]) + 4.5))
	# the walk grid: 0.5 m
	gres = 0.5
	gnx = int(BOX.size.x / gres); gnz = int(BOX.size.y / gres)
	gx0 = C.x + BOX.position.x; gz0 = C.y + BOX.position.y
	heights = PackedByteArray(); heights.resize(gnx * gnz * 2)
	flags = PackedByteArray(); flags.resize(gnx * gnz)
	for j in gnz:
		for i in gnx:
			var x := BOX.position.x + (i + 0.5) * gres
			var z := BOX.position.y + (j + 0.5) * gres
			var k := j * gnx + i
			heights.encode_u16(k * 2, int(round(ground(x, z) * 100.0)) + 2000)
			flags[k] = 0 if walkable(x, z) else NO_WALK
	colliders = []
	_grass_map()
	_path_map()

# the regions: their defs, rects, tall patches; the grids grown to hold them
static func _regions() -> void:
	REG = ArenaRegions.all()
	RECTS = REG.map(func(r): return ArenaRegions.rect(r))
	PATCHES = TALL.duplicate()
	ZONE = []
	for i in TALL.size(): ZONE.append("hub")
	var box := Rect2(-HALF, -HALF, HALF * 2.0, HALF * 2.0)
	for i in REG.size():
		for t in REG[i].get("tall", []):
			PATCHES.append(t)
			ZONE.append(String(REG[i].id))
		box = box.merge((RECTS[i] as Rect2).grow(MARGIN))
	BOX = Rect2(floorf(box.position.x), floorf(box.position.y), ceilf(box.size.x), ceilf(box.size.y))

# where Ash may walk: inside the hub's fence, a region's walk rect, or through a gate
static func walkable(x: float, z: float) -> bool:
	if absf(x) <= WALK and absf(z) <= WALK: return true
	for r in REG:
		if ArenaRegions.walk_rect(r).has_point(Vector2(x, z)): return true
		var g := ArenaRegions.gate_at(r, FENCE)
		var o := ArenaRegions.gate_out(r)
		var hw := float(r.get("gate", {}).get("half", 2.2)) - 0.3
		var d := Vector2(x, z) - g
		var along := d.dot(o)
		var across := absf(d.dot(Vector2(o.y, -o.x)))
		if across < hw and along > -1.5 and along < 4.5: return true
	return false

# the region a local point is in ("" = the hub), and how far inside it (m, 0 outside)
static func region_at(x: float, z: float) -> String:
	for i in RECTS.size():
		if (RECTS[i] as Rect2).has_point(Vector2(x, z)): return String(REG[i].id)
	return ""

static func region_in(i: int, x: float, z: float) -> float:
	return maxf(0.0, -ArenaRegions.rect_sd(RECTS[i], x, z))

# the ground's height (local x, z): flat round the field, a gentle roll in the
# meadow, a berm rising past the fence (and past each region's rect)
static func ground(x: float, z: float) -> float:
	var d := maxf(absf(x) - 12.0, 0.0) + maxf(absf(z) - 16.0, 0.0)
	var roll := 0.22 * sin(x * 0.11 + z * 0.07) + 0.16 * sin(z * 0.13 - x * 0.05 + 1.3) + 0.08 * sin(x * 0.31 + 0.7) * cos(z * 0.27)
	var k := clampf(d / 10.0, 0.0, 1.0)
	k = k * k * (3.0 - 2.0 * k)
	var h := roll * k
	# past the fence the ground climbs into a ring of wooded hills (the horizon)
	var e := maxf(absf(x), absf(z)) - FENCE - 1.5
	for i in RECTS.size():
		var rc: Rect2 = RECTS[i]
		var sd := ArenaRegions.rect_sd(rc, x, z)
		if sd < 30.0:
			# a region's own floor: its roll (a forest's hummocks), and no hills on it
			var w := clampf(-sd / 8.0, 0.0, 1.0)
			if w > 0.0:
				var rf := float(REG[i].get("ground", {}).get("roll", 1.0))
				h += roll * (rf - 1.0) * w + 0.35 * w * (rf - 1.0) * sin(x * 0.21 + 1.7) * sin(z * 0.17 - 0.4)
		e = minf(e, sd - 1.5)
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
	for i in PATCHES.size(): best = maxf(best, tall_blob(i, x, z))
	return best

# one patch's blob (0..1): its box scaled to a unit circle with a ragged rim
static func tall_blob(i: int, x: float, z: float) -> float:
	var t: Array = PATCHES[i]
	var u := Vector2((x - t[0]) / t[2], (z - t[1]) / t[3])
	if u.length_squared() > 2.0: return 0.0
	return clampf((tall_rim(i, atan2(u.y, u.x)) - u.length()) * 3.0, 0.0, 1.0)

# the rim's radius that way (in the box's units)
static func tall_rim(i: int, ang: float) -> float:
	var t: Array = PATCHES[i]
	return 1.0 + 0.12 * sin(ang * 3.0 + t[0]) + 0.08 * sin(ang * 5.0 + t[1])

# the patches of a zone ("hub", or a region's id): their indices into PATCHES
static func zone_patches(zone: String) -> Array:
	var out := []
	for i in PATCHES.size():
		if (ZONE[i] if i < ZONE.size() else "hub") == zone: out.append(i)
	return out

# the dirt's signed distance (m; < 0 on it): the clay field (a rounded box) and the paths
func dirt_sd(x: float, z: float) -> float:
	var q := Vector2(absf(x), absf(z)) - FIELD + Vector2(1.6, 1.6)
	var sd := Vector2(maxf(q.x, 0.0), maxf(q.y, 0.0)).length() + minf(maxf(q.x, q.y), 0.0) - 1.6
	var p := Vector2(x, z)
	for i in paths.size():
		if i < _pbox.size() and not (_pbox[i] as Rect2).has_point(p): continue
		var s: Array = paths[i]
		var a: Vector2 = s[0]; var b: Vector2 = s[1]
		var ab := b - a
		var h := clampf((p - a).dot(ab) / ab.length_squared(), 0.0, 1.0)
		var wob := 0.12 * sin(h * 17.0 + a.x) + 0.08 * sin(h * 41.0)
		sd = minf(sd, (p - (a + ab * h)).length() - float(s[2]) - wob)
	return sd

# the grass map (1 m): R the ground's height, G the density (meadow 0.45..0.9; + 2
# in tall grass, the grass shader's rule; 0 on the dirt); a region's floor its own
# density (a forest's sparse grass under the trees)
func _grass_map() -> void:
	var nx := int(BOX.size.x)
	var nz := int(BOX.size.y)
	var img := Image.create(nx, nz, false, Image.FORMAT_RGF)
	for j in nz:
		for i in nx:
			var x := BOX.position.x + i + 0.5
			var z := BOX.position.y + j + 0.5
			var dens := 0.34 + 0.14 * sin(x * 0.23 + z * 0.11) * cos(z * 0.19 - x * 0.07) + 0.06 * sin(x * 0.9 + z * 0.7)   # (a mown training ground: short and sparse, the tall patches stand out)
			var sd := dirt_sd(x, z)
			dens *= clampf((sd - 0.1) / 0.9, 0.0, 1.0)
			var out := absf(x) > FENCE + 6.0 or absf(z) > FENCE + 6.0
			for ri in RECTS.size():
				var w := clampf(region_in(ri, x, z) / 4.0, 0.0, 1.0)
				if w > 0.0:
					out = false
					var rd := float(REG[ri].get("ground", {}).get("dens", dens))
					dens = lerpf(dens, rd * (0.6 + 0.8 * clampf(0.5 + 0.5 * sin(x * 0.31 + z * 0.17) * cos(z * 0.23), 0.0, 1.0)) * clampf((sd - 0.1) / 0.9, 0.0, 1.0), w)
			if out: dens *= 0.5
			var tall := tall_at(x, z)
			if tall > 0.35 and sd > 0.5: dens = 2.0 + clampf(0.75 + tall * 0.25, 0.0, 1.0)
			img.set_pixel(i, j, Color(ground(x, z), clampf(dens, 0.0, 3.0), 0.0))
	grass_tex = ImageTexture.create_from_image(img)
	grass_area = Vector4(C.x + BOX.position.x, C.y + BOX.position.y, nx, nz)

# the path map (0.25 m; terrain.gdshader): R the signed distance (sd + 4) / 8, A
# a paler packed clay on the battle field; it covers the hub and every region
var pm_origin := Vector2.ZERO
var pm_size := Vector2.ZERO
func _path_map() -> void:
	var area := Rect2(-52.0, -52.0, 104.0, 104.0)
	for rc in RECTS: area = area.merge((rc as Rect2).grow(2.0))
	var res := 0.25
	var nx := int(ceilf(area.size.x / res))
	var nz := int(ceilf(area.size.y / res))
	var img := Image.create(nx, nz, false, Image.FORMAT_RGBA8)
	var far := Color(1.0, 0.0, 0.35, 0.0)
	for j in nz:
		var z := area.position.y + (j + 0.5) * res
		for i in nx:
			var x := area.position.x + (i + 0.5) * res
			var sd := dirt_sd(x, z)
			if sd > 4.0:
				img.set_pixel(i, j, far)
				continue
			var on_field := absf(x) < FIELD.x + 0.5 and absf(z) < FIELD.y + 0.5
			img.set_pixel(i, j, Color(clampf((sd + 4.0) / 8.0, 0.0, 1.0), 0.0, 0.0 if on_field else 0.35, 0.18 if on_field else 0.0))
	img.generate_mipmaps()
	path_tex = ImageTexture.create_from_image(img)
	pm_origin = Vector2(C.x + area.position.x, C.y + area.position.y)
	pm_size = Vector2(nx * res, nz * res)

func add_circle(x: float, z: float, r: float) -> void:
	colliders.append([0, C.x + x, C.y + z, r, 0.0, 0.0])
	_bk = {}

func add_box(x: float, z: float, hw: float, hd: float, rot := 0.0) -> void:
	colliders.append([1, C.x + x, C.y + z, hw, hd, rot])
	_bk = {}
