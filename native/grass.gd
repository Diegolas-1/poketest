extends Node3D
# The grass field (web assets.js grassField): clumps of layered tufts on a
# square of side SIZE that repeats around the player. The square is cut into
# tiles; each frame every tile moves to its copy nearest the player, tiles out
# of view are culled by Godot (custom AABB), tiles past the round edge are
# hidden, and farther tiles use lighter clumps (in metres from the player:
# fewer segments per blade, then past FAR3 half the blades, a little wider, at
# a distance where a blade is a pixel or two). "count" is the density over a
# 64 m square, so a bigger field keeps the same grass up close; every clump is
# drawn out to the grass distance (no thinning).
#
# Only the clumps the grass map keeps are sent to the GPU: the shader drops a
# clump where its random number is above the map's density (roads, water,
# yards, thin meadow), which is two thirds of them on Route 1 and nearly all
# by the sea. Each time a tile moves to a new spot a worker thread sorts its
# clumps, the ones the map keeps there first (the same test as the shader),
# and the tile draws only those (visible_instance_count); until that is done
# the tile draws all of them, so nothing ever goes missing.

const SHADER := preload("res://shaders/grass.gdshader")

var size := 64.0
var tiles: Array = []
var mat: ShaderMaterial
var world  # WorldData, for heights under each tile
var t_size := 8.0
# m from the player (to a tile's nearest edge) where the lighter clumps start
const MID_D := 9.6
const FAR_D := 19.2
const FAR2 := 45.0
const FAR3 := 80.0
const MOVE := 0.2
var _map: PackedFloat32Array   # the grass map, [height, density] per texel (world_data.gd)
var _mapn := Vector2i.ZERO
var _queue: Array = []          # tiles waiting for their sort
var _job := -1                  # the worker task sorting a batch (WorkerThreadPool)
var _jobs: Array = []

func build(w, count: int, field_size: float, sun_dir: Vector3) -> void:
	world = w
	size = field_size
	var rng := [12345]
	var r := func() -> float:
		rng[0] = (rng[0] * 1664525 + 1013904223) & 0xFFFFFFFF
		return rng[0] / 4294967296.0
	# the clump: blade records first (same random order as the web build)
	var blades: Array = []
	var blade_at := func(rx: float, rz: float, ang: float, lean: float, ln: float, wid: float, notch: bool, layer: float, curl: float, role: int) -> void:
		blades.append([rx, rz, ang, lean, ln, wid, notch, layer, curl, role, (r.call() - 0.5) * 0.6])
	var tuft := func(cx: float, cz: float, sc: float) -> void:
		var R := func(k: float) -> float: return (r.call() - 0.5) * k
		for k in 6: blade_at.call(cx + R.call(0.08) * sc, cz + R.call(0.08) * sc, r.call() * 6.28, 0.12, (0.32 + r.call() * 0.15) * sc, 0.07 * sc, false, 0.55, 0.0, 1)
		for k in 7: blade_at.call(cx + R.call(0.12) * sc, cz + R.call(0.12) * sc, r.call() * 6.28, 0.22 + r.call() * 0.2, (0.65 + r.call() * 0.3) * sc, 0.09 * sc, r.call() < 0.3, 0.8, 0.0, 0)
		for k in 8: blade_at.call(cx + R.call(0.14) * sc, cz + R.call(0.14) * sc, (k / 8.0) * 6.28 + R.call(0.6), 0.45 + r.call() * 0.35, (0.85 + r.call() * 0.4) * sc, 0.1 * sc, r.call() < 0.4, 1.0, 0.0, 0)
		for k in 4: blade_at.call(cx + R.call(0.1) * sc, cz + R.call(0.1) * sc, r.call() * 6.28, 0.5 + r.call() * 0.6, (0.8 + r.call() * 0.4) * sc, 0.014 * sc, false, 0.9, 0.0, 2)
		for k in 2: blade_at.call(cx + R.call(0.2) * sc, cz + R.call(0.2) * sc, r.call() * 6.28, 1.6, 0.28 * sc, 0.045 * sc, false, 0.85, 1.0, 3)
	tuft.call(0.0, 0.0, 1.0)
	for k in 3:
		var a: float = k * 2.1 + r.call()
		var d: float = 0.3 + r.call() * 0.15
		tuft.call(cos(a) * d, sin(a) * d, 0.55 + r.call() * 0.3)
	var near := _clump(blades, 5, 3)
	var mid := _clump(blades, 4, 1)
	var far := _clump(blades, 2, 0)   # (2 segments: a third fewer triangles where a blade is a few pixels)
	var far2 := _clump(blades, 1, 0)  # past FAR2: one segment, a blade is a pixel or two there
	var far3 := _clump(blades, 1, 0, 1.6)   # past FAR3: the outer ring of tall blades only, wider
	var n := int(round(count / 14.0 * maxf(1.0, size * size / 4096.0)))
	var offs := PackedFloat32Array()
	offs.resize(n * 4)
	for i in n:
		offs[i * 4] = r.call() * size; offs[i * 4 + 1] = r.call() * size; offs[i * 4 + 2] = r.call(); offs[i * 4 + 3] = r.call()
	mat = ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter("height_map", world.grass_tex)
	mat.set_shader_parameter("area", world.grass_area)
	mat.set_shader_parameter("field_size", size)
	mat.set_shader_parameter("sun_dir", sun_dir)
	var gimg: Image = world.grass_tex.get_image()
	_map = gimg.get_data().to_float32_array()
	_mapn = Vector2i(gimg.get_width(), gimg.get_height())
	var g := clampi(roundi(size / 7.0), 4, 22)   # tiles grow past 154 m to bound the draw calls
	t_size = size / g
	var bins: Array = []
	bins.resize(g * g)
	for k in g * g: bins[k] = PackedInt32Array()
	for i in n:
		var bi := mini(g - 1, int(offs[i * 4] / t_size)) * g + mini(g - 1, int(offs[i * 4 + 1] / t_size))
		bins[bi].append(i)
	for gi in g:
		for gj in g:
			var ids: PackedInt32Array = bins[gi * g + gj]
			if ids.is_empty(): continue
			var t := {"cx": (gi + 0.5) * t_size, "cz": (gj + 0.5) * t_size, "kx": 99999, "kz": 99999, "mm": [], "n": 0,
				"ver": 0, "ready": false, "alive": 0, "st": [-1, -1, -1, -1, -1], "vc": [-2, -2, -2, -2, -2], "queued": false}
			# one buffer per tile, shared by its four meshes: 12 floats of
			# transform (identity) + 4 of custom data per clump
			var buf := PackedFloat32Array()
			buf.resize(ids.size() * 16)
			for k in ids.size():
				var id := ids[k]; var o := k * 16
				buf[o] = 1.0; buf[o + 5] = 1.0; buf[o + 10] = 1.0
				buf[o + 12] = offs[id * 4]; buf[o + 13] = offs[id * 4 + 1]; buf[o + 14] = offs[id * 4 + 2]; buf[o + 15] = offs[id * 4 + 3]
			t.full = buf
			t.buf = buf
			for mesh in [near, mid, far, far2, far3]:
				var mm := MultiMesh.new()
				mm.transform_format = MultiMesh.TRANSFORM_3D
				mm.use_custom_data = true
				mm.mesh = mesh
				mm.instance_count = ids.size()
				mm.buffer = buf
				t.mm.append(mm)
			t.n = ids.size()
			var mi := MultiMeshInstance3D.new()
			mi.multimesh = t.mm[0]
			mi.material_override = mat
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(mi)
			t.node = mi
			tiles.append(t)

# one clump mesh: segs per blade; roles kept: 3 = all, 1 = no wisps or curls, 0 = main blades;
# outer > 0: only each tuft's outer ring of tall blades (layer 1), that much wider
# (the same cover from half the blades, where a blade is a pixel or two wide).
# A one-segment blade is drawn twice as wide: it loses the bulge of its middle
# vertex, so it covers what the two-segment blade does
func _clump(blades: Array, segs: int, max_role: int, outer := 0.0) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var base := 0
	for b in blades:
		if b[9] > max_role: continue
		if outer > 0.0 and b[7] < 0.99: continue
		var rx: float = b[0]; var rz: float = b[1]; var ang: float = b[2]; var lean: float = b[3]
		var ln: float = b[4]; var wid: float = b[5] * maxf(1.0, outer) * (2.0 if segs == 1 else 1.0); var notch: bool = b[6]; var layer: float = b[7]
		var curl: float = b[8]; var twist: float = b[10]
		var dx := cos(ang); var dz := sin(ang); var sx := -dz; var sz := dx
		for i in segs + 1:
			var t := i / float(segs)
			var w := wid * minf(1.0, t * 5.0 + 0.35) * pow(1.0 - t, 0.85)
			var out := lean * t * t * ln * 0.8 + curl * t * 0.2
			var y := ln * t * (1.0 - lean * 0.25 * t) * (1.0 - curl * t * 0.6)
			var cx := rx + dx * out; var cz := rz + dz * out
			var tw := twist * t
			var ux := sx * cos(tw) - dx * sin(tw); var uz := sz * cos(tw) - dz * sin(tw)
			var wl := w * (2.4 if notch and absf(t - 0.4) < 0.11 else 1.0)
			st.set_uv(Vector2(ang, t)); st.set_uv2(Vector2(layer, 0)); st.add_vertex(Vector3(cx - ux * wl, y, cz - uz * wl))
			st.set_uv(Vector2(ang, t)); st.set_uv2(Vector2(layer, 0)); st.add_vertex(Vector3(cx + ux * w, y, cz + uz * w))
			if i < segs:
				var q := base + i * 2
				st.add_index(q); st.add_index(q + 1); st.add_index(q + 2)
				st.add_index(q + 1); st.add_index(q + 3); st.add_index(q + 2)
		base += (segs + 1) * 2
	return st.commit()

# ---------- walking through it ----------
# set_walkers() each frame with who is about: [id, world position, radius]. The
# grass is pressed under each of them and keeps a short trail of where they
# stepped: each point springs back (a damped spring, a little past upright, then
# still) as it ages. The nearest walkers to the camera get the budget of
# PUSH_MAX points (shaders/grass.gdshader push[]).
const PUSH_MAX := 12
const NEAR := 14.0               # metres from Ash (the camera's target) a walker is pressed into the grass
const TRAIL_STEP := 0.22          # metres between trail points
const TRAIL_LIFE := 1.3           # seconds a point takes to settle
var _trails := {}                 # id -> {"last": Vector2, "pts": [[Vector2, age, r]]}
var _push := PackedVector4Array()
# other things that stir the grass this frame (wild/wild.gd: a Pokémon hiding in it
# twitches its blades): [x, z, radius, strength], strength may swing below 0
var extra: Array = []
var _sent_n := -1

static func _spring(age: float) -> float:
	# 1 when just left, through 0 at ~0.3 s, a small overshoot (~-0.2), settled by ~1.2 s
	return exp(-3.4 * age) * cos(5.2 * age)

func set_walkers(list: Array, dt: float, cam_pos: Vector3, focus: Vector3) -> void:
	var live := {}
	for w in list:
		var id: String = w[0]
		var p2 := Vector2((w[1] as Vector3).x, (w[1] as Vector3).z)
		live[id] = true
		var tr: Dictionary = _trails.get(id, {})
		if tr.is_empty():
			tr = {"last": p2, "pts": []}
			_trails[id] = tr
		if p2.distance_to(tr.last) > TRAIL_STEP:
			tr.pts.push_front([tr.last, 0.0, float(w[2])])
			tr.last = p2
		tr.cur = p2; tr.r = float(w[2])
		tr.d = Vector2(focus.x, focus.z).distance_to(p2)
	for id in _trails.keys():
		var tr: Dictionary = _trails[id]
		var keep := []
		for q in tr.pts:
			q[1] += dt
			if q[1] < TRAIL_LIFE: keep.append(q)
		tr.pts = keep
		if not live.has(id):
			tr.erase("cur")
			if keep.is_empty(): _trails.erase(id)
	# nearest first: each walker's own spot, then its newest trail points
	var order := _trails.keys()
	order.sort_custom(func(a, b): return _trails[a].get("d", 1e9) < _trails[b].get("d", 1e9))
	_push.clear()
	for id in order:
		var tr: Dictionary = _trails[id]
		if tr.has("cur") and tr.d < NEAR and _push.size() < PUSH_MAX:
			_push.append(Vector4(tr.cur.x, tr.cur.y, tr.r, 1.0))
	for e in extra:
		if _push.size() < PUSH_MAX: _push.append(e)
	for id in order:
		var tr: Dictionary = _trails[id]
		if tr.get("d", 1e9) > NEAR: continue
		for q in tr.pts:
			if _push.size() >= PUSH_MAX: break
			_push.append(Vector4(q[0].x, q[0].y, q[2], _spring(q[1])))
	var n := _push.size()
	# a circle round every point's reach, so the shader skips the loop for all the
	# grass outside it (most of the field)
	var c := Vector2.ZERO
	var rad := -1.0
	if n > 0:
		var lo := Vector2(1e9, 1e9); var hi := Vector2(-1e9, -1e9)
		for q in _push:
			lo = lo.min(Vector2(q.x - q.z * 1.3, q.y - q.z * 1.3)); hi = hi.max(Vector2(q.x + q.z * 1.3, q.y + q.z * 1.3))
		c = (lo + hi) * 0.5; rad = (hi - lo).length() * 0.5 + 0.6
	while _push.size() < PUSH_MAX: _push.append(Vector4(0, 0, 0, 0))
	if n == 0 and _sent_n == 0: return    # nothing to change
	_sent_n = n
	mat.set_shader_parameter("push", _push)
	mat.set_shader_parameter("push_n", n)
	mat.set_shader_parameter("push_c", Vector3(c.x, c.y, rad))

var _last := Vector3(INF, 0.0, INF)
func update(cam_pos: Vector3) -> void:
	mat.set_shader_parameter("cam", cam_pos)
	# the tiles change only as the player moves: they are looked at again after
	# MOVE metres or when sorted tiles come back from the worker (every distance
	# below has MOVE of slack)
	var got := _collect()
	if not got and Vector2(cam_pos.x - _last.x, cam_pos.z - _last.z).length_squared() < MOVE * MOVE: return
	_last = cam_pos
	var edge := size * 0.5
	# lighter clumps by distance in metres (as at the old 64 m field; a smaller
	# field switches sooner)
	var mid_d := minf(size * 0.15, MID_D)
	var far_d := minf(size * 0.3, FAR_D)
	for t in tiles:
		var kx := floori((cam_pos.x - t.cx) / size + 0.5)
		var kz := floori((cam_pos.z - t.cz) / size + 0.5)
		var x: float = t.cx + kx * size
		var z: float = t.cz + kz * size
		if kx != t.kx or kz != t.kz:
			t.kx = kx; t.kz = kz
			t.node.position = Vector3(kx * size, 0.0, kz * size)
			var lo := INF; var hi := -INF
			for o in [Vector2(0, 0), Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]:
				var h: float = world.height_at(x + o.x * t_size * 0.5, z + o.y * t_size * 0.5)
				lo = minf(lo, h); hi = maxf(hi, h)
			t.node.custom_aabb = AABB(Vector3(t.cx - t_size * 0.5 - 1.5, lo - 0.5, t.cz - t_size * 0.5 - 1.5), Vector3(t_size + 3.0, hi - lo + 2.5, t_size + 3.0))
			# its clumps for the new spot: all of them until the worker has sorted them
			t.ver += 1; t.ready = false
			if not t.queued: t.queued = true; _queue.append(t)
		var dx := maxf(0.0, absf(cam_pos.x - x) - t_size * 0.5)
		var dz := maxf(0.0, absf(cam_pos.z - z) - t_size * 0.5)
		var d := maxf(0.0, sqrt(dx * dx + dz * dz) - MOVE)
		# the field's round edge: the shader drops a clump once fk (by its distance
		# from the player) passes 0.75 w + 0.25, w its second random number; the
		# sorted clumps are by w, largest first, so the ones the nearest corner of
		# the tile still keeps are the first vc
		var vc: int = t.alive if t.ready else -1
		if t.ready and d > size * 0.3:
			var fk := smoothstep(size * 0.3, size * 0.5, d)
			var ws: PackedFloat32Array = t.ws
			vc = ws.bsearch(-((fk - 0.25) / 0.75 - 0.01), true)
		var show: bool = d < edge and vc != 0
		if t.node.visible != show: t.node.visible = show
		if not show: continue
		var li := 4 if d > FAR3 else (3 if d > FAR2 else (2 if d > far_d else (1 if d > mid_d else 0)))
		var mm: MultiMesh = t.mm[li]
		var key: int = t.ver * 2 + (1 if t.ready else 0)
		if t.st[li] != key:
			t.st[li] = key
			mm.buffer = t.buf if t.ready else t.full
			t.vc[li] = -2
		if t.vc[li] != vc:
			t.vc[li] = vc
			mm.visible_instance_count = vc if vc < t.n else -1
		if t.node.multimesh != mm: t.node.multimesh = mm
	if _job == -1 and not _queue.is_empty(): _launch()

# ---------- which clumps the map keeps (on a worker thread) ----------
func _launch() -> void:
	_jobs = []
	for t in _queue:
		t.queued = false
		_jobs.append({"t": t, "ver": t.ver, "full": t.full, "ox": t.kx * size, "oz": t.kz * size})
	_queue.clear()
	_job = WorkerThreadPool.add_task(_sort_jobs.bind(_jobs, _map, _mapn, world.grass_area), false, "grass sort")

func _collect() -> bool:
	if _job == -1 or not WorkerThreadPool.is_task_completed(_job): return false
	WorkerThreadPool.wait_for_task_completion(_job)
	_job = -1
	for j in _jobs:
		var t: Dictionary = j.t
		if t.ver != j.ver: continue   # moved again meanwhile (it is queued again)
		t.buf = j.out; t.alive = j.alive; t.ws = j.ws; t.ready = true
	_jobs = []
	return true

func _exit_tree() -> void:
	if _job != -1: WorkerThreadPool.wait_for_task_completion(_job); _job = -1

# each tile's buffer with the clumps the grass map keeps at its spot first: the
# shader's own test (grass.gdshader: the map read with linear filtering; tall
# grass is density + 2; a clump stays where its random number <= the density),
# with a small margin so the shader always has the last word
static func _sort_jobs(jobs: Array, map: PackedFloat32Array, mn: Vector2i, area: Vector4) -> void:
	var sx := float(mn.x) / area.z; var sz := float(mn.y) / area.w
	for j in jobs:
		var full: PackedFloat32Array = j.full
		var n := full.size() / 16
		var keep := PackedInt32Array(); var drop := PackedInt32Array()
		for i in n:
			var o := i * 16
			var fx: float = (full[o + 12] + j.ox - area.x) * sx - 0.5
			var fz: float = (full[o + 13] + j.oz - area.y) * sz - 0.5
			var x0 := floori(fx); var z0 := floori(fz)
			var tx := fx - x0; var tz := fz - z0
			var xa := clampi(x0, 0, mn.x - 1); var xb := clampi(x0 + 1, 0, mn.x - 1)
			var za := clampi(z0, 0, mn.y - 1); var zb := clampi(z0 + 1, 0, mn.y - 1)
			var g00 := map[(za * mn.x + xa) * 2 + 1]; var g10 := map[(za * mn.x + xb) * 2 + 1]
			var g01 := map[(zb * mn.x + xa) * 2 + 1]; var g11 := map[(zb * mn.x + xb) * 2 + 1]
			var g := lerpf(lerpf(g00, g10, tx), lerpf(g01, g11, tx), tz)
			var dens := g - 2.0 if g >= 1.5 else g
			if full[o + 14] <= dens + 0.01 or absf(g - 1.5) < 0.02: keep.append(i)
			else: drop.append(i)
		# the kept ones by w, largest first (ws: -w, ascending, for bsearch)
		var wk: Array = []
		for i in keep: wk.append([full[i * 16 + 15], i])
		wk.sort_custom(func(a, b): return a[0] > b[0])
		var ws := PackedFloat32Array()
		keep = PackedInt32Array()
		for e in wk: keep.append(e[1]); ws.append(-e[0])
		j.ws = ws
		var out := PackedFloat32Array()
		for list in [keep, drop]:
			for i in list: out.append_array(full.slice(i * 16, i * 16 + 16))
		j.out = out; j.alive = keep.size()
