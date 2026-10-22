class_name InteriorData
extends RefCounted
# A space's compiled blueprint (web/world/maps/format.js compile, baked to
# res://interiors/<id>.json by tools/native/bake_interior.mjs): the walk grid
# of every level, colliders per level, interactions, portals, spawns, actors,
# camera volumes and lights. Stands in for WorldData while you are inside
# (main.gd swaps `world`), with the same height_at / step / collide calls,
# plus the current level: the stairs are shared by the two levels they join,
# and climbing past their middle moves you to the upper one.
#
# Grid flags: 1 OPEN floor, 2 STAIR, 4 PROP, 8 WALL, 16 RAIL, 32 PORTAL.

const OPEN := 1
const STAIR := 2
const WALL := 8

var meta: Dictionary
var id := ""
var gx0: float; var gz0: float; var gres: float; var gnx: int; var gnz: int
var heights: Array = []      # per level PackedByteArray (int16 cm)
var flags: Array = []        # per level PackedByteArray
var level_y: PackedFloat32Array = []
var colliders: Array = []    # per level: [box?, x, z, hw|r, hd, rot] (WorldData layout)
var level := 0
var sea_y := -1000.0
var volumes: Array = []      # camera volumes
var cam_margin := 0.28

func load_space(path: String) -> bool:
	if not FileAccess.file_exists(path): return false
	meta = JSON.parse_string(FileAccess.get_file_as_string(path))
	id = meta.id
	var g: Dictionary = meta.grid
	gx0 = g.x0; gz0 = g.z0; gres = g.res; gnx = int(g.nx); gnz = int(g.nz)
	for L in meta.levels: level_y.append(float(L.y))
	for w in meta.walk:
		heights.append(Marshalls.base64_to_raw(w.h))
		flags.append(Marshalls.base64_to_raw(w.f))
		colliders.append([])
	for c in meta.colliders:
		colliders[int(c[0])].append(c.slice(1))
	volumes = meta.camera.volumes
	cam_margin = float(meta.camera.get("margin", 0.28))
	return true

func _cell(x: float, z: float) -> int:
	var i := int(floor((x - gx0) / gres))
	var j := int(floor((z - gz0) / gres))
	if i < 0 or j < 0 or i >= gnx or j >= gnz: return -1
	return j * gnx + i

func flag_at(x: float, z: float, L: int) -> int:
	var c := _cell(x, z)
	return 0 if c < 0 else flags[L][c]

func flag(x: float, z: float) -> int:
	return flag_at(x, z, level)

func height_at_level(x: float, z: float, L: int) -> float:
	var c := _cell(x, z)
	if c < 0: return level_y[L]
	if not (flags[L][c] & OPEN): return level_y[L]
	return heights[L].decode_s16(c * 2) / 100.0

func height_at(x: float, z: float) -> float:
	return height_at_level(x, z, level)

func bed_at(_x: float, _z: float) -> float:
	return sea_y

# try to move; blocked by walls, the edge of the floor, a step too high, and
# the level's colliders (sliding along them). Updates the level on stairs.
func step(pos: Vector3, dx: float, dz: float) -> Vector3:
	var nx := pos.x + dx
	var nz := pos.z + dz
	if not _ok(nx, nz, pos): return pos
	var p := collide(Vector3(nx, pos.y, nz))
	if not _ok(p.x, p.z, pos): return pos
	var f := flag_at(p.x, p.z, level)
	if f & STAIR:
		# on a stair: the level whose floor is nearest the tread you stand on
		var h := height_at_level(p.x, p.z, level)
		var best := level
		for L in level_y.size():
			if (flag_at(p.x, p.z, L) & STAIR) and absf(level_y[L] - h) < absf(level_y[best] - h): best = L
		level = best
	return p

func _ok(x: float, z: float, from: Vector3) -> bool:
	var f := flag_at(x, z, level)
	if not (f & OPEN) or (f & WALL): return false
	return absf(height_at_level(x, z, level) - height_at_level(from.x, from.z, level)) < 0.45

func collide(p: Vector3, r := 0.35) -> Vector3:
	for c in colliders[level]:
		var cx: float = c[1]; var cz: float = c[2]
		if c[0] == 1:
			var dx := p.x - cx; var dz := p.z - cz
			var rot: float = c[5]
			var cs := cos(rot); var sn := sin(rot)
			var lx := dx * cs - dz * sn; var lz := dx * sn + dz * cs
			var ox: float = c[3] + r - absf(lx); var oz: float = c[4] + r - absf(lz)
			if ox > 0.0 and oz > 0.0:
				var mx := 0.0; var mz := 0.0
				if ox < oz: mx = signf(lx) * ox
				else: mz = signf(lz) * oz
				p.x += mx * cs + mz * sn; p.z += -mx * sn + mz * cs
		else:
			var dx2 := p.x - cx; var dz2 := p.z - cz
			var d := sqrt(dx2 * dx2 + dz2 * dz2)
			var m: float = c[3] + r
			if d < m and d > 1e-4:
				p.x += dx2 / d * (m - d); p.z += dz2 / d * (m - d)
	return p

# the portal the player stands in (on the current level), or {}
func portal_at(p: Vector3) -> Dictionary:
	for po in meta.portals:
		if int(po.level) != level: continue
		var r: Array = po.rect
		if p.x >= r[0] and p.x <= r[2] and p.z >= r[1] and p.z <= r[3]: return po
	return {}

func spawn(sid: String) -> Dictionary:
	for s in meta.spawns:
		if s.id == sid: return s
	return meta.spawns[0]

# ---------- camera volumes ----------
func in_volume(v: Dictionary, p: Vector3, m: float) -> bool:
	var b: Array = v.box
	if p.x < b[0] + m or p.x > b[3] - m or p.z < b[2] + m or p.z > b[5] - m or p.y < b[1] + m: return false
	var top: float = b[4]
	if v.has("vault"):
		var g: Dictionary = v.vault
		var half: float = (b[5] - b[2]) * 0.5 if g.axis == "x" else (b[3] - b[0]) * 0.5
		var c: float = p.z - (b[2] + b[5]) * 0.5 if g.axis == "x" else p.x - (b[0] + b[3]) * 0.5
		top = minf(top, float(g.spring) + float(g.rise) * sqrt(maxf(0.0, 1.0 - (c / half) * (c / half))))
	return p.y <= top - m

func _in_any(p: Vector3) -> bool:
	for v in volumes:
		if in_volume(v, p, 0.0): return true
	return false

# is a ball of radius m round p inside the union of the volumes? (checked at
# its middle and six points round it; shrinking each volume instead would
# open gaps where two volumes meet)
const _AX := [Vector3(1, 0, 0), Vector3(-1, 0, 0), Vector3(0, 1, 0), Vector3(0, -1, 0), Vector3(0, 0, 1), Vector3(0, 0, -1)]
func inside(p: Vector3, m: float) -> bool:
	if not _in_any(p): return false
	if m <= 0.0: return true
	for a in _AX:
		if not _in_any(p + a * m): return false
	return true

# the volume that frames the player (first one holding the point), or {}
func volume_at(p: Vector3) -> Dictionary:
	for v in volumes:
		if in_volume(v, p, 0.0): return v
	return {}

# how far the camera may go from t toward dir (unit) before leaving the
# volumes (kept `margin` inside them): walls, ceilings and slabs stop it
func boom(t: Vector3, dir: Vector3, want: float) -> float:
	var m := cam_margin
	if not inside(t, m): m = 0.0
	if not inside(t, m): return 0.3
	var d := 0.0
	var step := 0.06
	while d < want:
		var nd := minf(want, d + step)
		if not inside(t + dir * nd, m): return d
		d = nd
	return want
