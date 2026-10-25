class_name WorldData
extends RefCounted
# The baked world (tools/native/bake.mjs): walk grid with heights and flags,
# colliders, path map, sea floor, grass map. Mirrors the web build's
# groundAt / step / collide in main.js.

const DIR := "res://world/"
# walk grid flags (tools/native/bake.mjs)
const WATER := 1; const NO_WALK := 2; const DECK := 4; const SEA := 8; const SAND := 16; const LEDGE := 32
var meta: Dictionary
var gx0: float; var gz0: float; var gres: float; var gnx: int; var gnz: int
var heights: PackedByteArray   # uint16 cm + 2000, little endian
var flags: PackedByteArray
var colliders: Array = []      # [box?, x, z, hw|r, hd, rot]
var grass_tex: ImageTexture
var grass_area: Vector4
var path_tex: ImageTexture
var seabed_tex: ImageTexture
var sea_y := -0.7
var seabed: PackedFloat32Array   # terrain height every metre (seabed.bin)
var bed_x0 := -210.0; var bed_z0 := -210.0; var bed_n := 420

func _bytes(f: String) -> PackedByteArray:
	return FileAccess.get_file_as_bytes(DIR + f)

func load_all() -> void:
	meta = JSON.parse_string(FileAccess.get_file_as_string(DIR + "world.json"))
	sea_y = meta.sea
	var g: Dictionary = meta.ground
	gx0 = g.x0; gz0 = g.z0; gres = g.res; gnx = int(g.nx); gnz = int(g.nz)
	var gb := _bytes("ground.bin")
	heights = gb.slice(0, gnx * gnz * 2)
	flags = gb.slice(gnx * gnz * 2)
	colliders = meta.colliders
	# grass map: float pairs [height, density]
	var gm: Dictionary = meta.grassmap
	var gimg := Image.create_from_data(int(gm.nx), int(gm.nz), false, Image.FORMAT_RGF, _bytes("grassmap.bin"))
	grass_tex = ImageTexture.create_from_image(gimg)
	grass_area = Vector4(gm.x0, gm.z0, gm.w, gm.d)
	var pm: Dictionary = meta.pathmap
	var pimg := Image.create_from_data(int(pm.nx), int(pm.nz), false, Image.FORMAT_RGBA8, _bytes("pathmap.rgba"))
	pimg.generate_mipmaps()
	path_tex = ImageTexture.create_from_image(pimg)
	var sb: Dictionary = meta.seabed
	var sbytes := _bytes("seabed.bin")
	seabed = sbytes.to_float32_array()
	bed_x0 = sb.x0; bed_z0 = sb.z0; bed_n = int(sb.n)
	var simg := Image.create_from_data(int(sb.n), int(sb.n), false, Image.FORMAT_RF, sbytes)
	seabed_tex = ImageTexture.create_from_image(simg)

func _cell(x: float, z: float) -> int:
	var i := int((x - gx0) / gres)
	var j := int((z - gz0) / gres)
	if i < 0 or j < 0 or i >= gnx or j >= gnz: return -1
	return j * gnx + i

# ground height (bilinear between cell centres, so slopes stay smooth)
func height_at(x: float, z: float) -> float:
	var fx := (x - gx0) / gres - 0.5
	var fz := (z - gz0) / gres - 0.5
	var i := clampi(floori(fx), 0, gnx - 2)
	var j := clampi(floori(fz), 0, gnz - 2)
	var tx := clampf(fx - i, 0.0, 1.0)
	var tz := clampf(fz - j, 0.0, 1.0)
	var h00 := _h(j * gnx + i); var h10 := _h(j * gnx + i + 1)
	var h01 := _h((j + 1) * gnx + i); var h11 := _h((j + 1) * gnx + i + 1)
	# a step (stairs, a deck edge): no blending across it
	if maxf(maxf(h00, h10), maxf(h01, h11)) - minf(minf(h00, h10), minf(h01, h11)) > 0.12:
		var c := _cell(x, z)
		if c >= 0: return _h(c)
	return lerpf(lerpf(h00, h10, tx), lerpf(h01, h11, tx), tz)

func _h(k: int) -> float:
	return (heights.decode_u16(k * 2) - 2000) / 100.0

func flag(x: float, z: float) -> int:
	var c := _cell(x, z)
	return 255 if c < 0 else flags[c]

# web main.js step(): try to move, false when blocked
func step(pos: Vector3, dx: float, dz: float) -> Vector3:
	var nx := pos.x + dx
	var nz := pos.z + dz
	var f := flag(nx, nz)
	if f == 255: return pos
	if (f & 1) and not (f & 4): return pos
	var here := flag(pos.x, pos.z)
	# Route 1's ledges (32): hop down them going south (+z), never climb them
	if (f & LEDGE) and (dz < -1e-4 if (here != 255 and (here & LEDGE)) else dz <= 1e-4): return pos
	if (f & 2) and not (here & 2): return pos
	var p := Vector3(nx, pos.y, nz)
	p = collide(p)
	if (flag(p.x, p.z) & 2) and not (here & 2): return pos
	return p

func collide(p: Vector3, r := 0.35) -> Vector3:
	for c in colliders:
		var cx: float = c[1]; var cz: float = c[2]
		if absf(p.x - cx) > 12.0 or absf(p.z - cz) > 12.0: continue
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

# terrain height from the 1 m sea-floor grid (outside it: deep sea)
func bed_at(x: float, z: float) -> float:
	var i := int(floor(x - bed_x0)); var j := int(floor(z - bed_z0))
	if i < 0 or j < 0 or i >= bed_n or j >= bed_n: return sea_y - 30.0
	return seabed[j * bed_n + i]
