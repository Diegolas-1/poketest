class_name WildTallGrass
extends WildSource
# Route 1's tall grass as an encounter source: the patches are the baked
# rectangles (cast.json tallGrass: [x0, z0, x1, z1]); Route 1 is south of
# z -66 (cast.gd's area banner). A spot to settle is a few metres from Ash,
# inside a patch (MARGIN from its edge), toward where he faces when it can be.

const MARGIN := 0.9
var rects: Array = []      # [x0, z0, x1, z1]

func _init(r: Array = []) -> void:
	id = "tall_grass"
	tells = "grass"
	rects = r

func region(p: Vector3) -> String:
	return "route1" if p.z < -66.0 and p.z > -420.0 else ""

func distance(p: Vector3) -> float:
	var best := INF
	for b in rects:
		var dx := maxf(maxf(float(b[0]) - p.x, p.x - float(b[2])), 0.0)
		var dz := maxf(maxf(float(b[1]) - p.z, p.z - float(b[3])), 0.0)
		best = minf(best, sqrt(dx * dx + dz * dz))
	return best

func patch_of(p: Vector3) -> int:
	for i in rects.size():
		var b: Array = rects[i]
		if p.x > float(b[0]) and p.x < float(b[2]) and p.z > float(b[1]) and p.z < float(b[3]): return i
	return -1

func inside(p: Vector3, margin := MARGIN) -> bool:
	for b in rects:
		if p.x > float(b[0]) + margin and p.x < float(b[2]) - margin and p.z > float(b[1]) + margin and p.z < float(b[3]) - margin: return true
	return false

func pick_spot(ash: Vector3, yaw: float, dmin: float, dmax: float, rng: RandomNumberGenerator) -> Variant:
	var best = null
	var bs := -INF
	for k in 28:
		# ahead of him mostly (the first tries in a cone in front), then anywhere round
		var spread := 1.2 if k < 16 else PI
		var a := yaw + rng.randf_range(-spread, spread)
		var d := rng.randf_range(dmin, dmax)
		var p := ash + Vector3(sin(a), 0.0, cos(a)) * d
		if not inside(p): continue
		var s := cos(wrapf(a - yaw, -PI, PI)) - absf(d - (dmin + dmax) * 0.5) * 0.1 + rng.randf() * 0.3
		if s > bs: bs = s; best = Vector3(p.x, 0.0, p.z)
	return best

func safe_spots(from: Vector3, r: float) -> Array:
	var out := []
	var me := patch_of(from)
	for i in rects.size():
		if i == me: continue
		var b: Array = rects[i]
		# the part of that patch nearest the one fleeing, a little way in
		var x := clampf(from.x, float(b[0]) + 2.5, float(b[2]) - 2.5)
		var z := clampf(from.z, float(b[1]) + 2.5, float(b[3]) - 2.5)
		var p := Vector3(x, 0.0, z)
		if Vector2(p.x - from.x, p.z - from.z).length() <= r: out.append({"at": p, "kind": "tall_grass", "patch": i})
	return out
