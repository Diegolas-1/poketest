extends Node3D
# Ash's bike in the water (bike/bike.gd makes it; numbers in res://tunables/bike.json
# "water_fx"): what the wheels do to the water and the water to the bike.
#   - the bow wave: two wings of water pushed up and out in a V from the front tyre
#     (a mesh, shaders/bike_bow.gdshader), higher and longer with speed and depth;
#   - the water parting: the sea's shallows and the fresh water draw a V of foam
#     lines spreading back from the front wheel, churned water behind, the parted
#     water a shade deeper (shaders/part.gdshaderinc, two uniforms on each water
#     material, set only while he rides in it);
#   - spray fans thrown up and out from both tyres (more and higher at speed), a
#     rooster tail off the back tyre when fast, a burst where a tyre hits the water
#     at speed (or lands in it, or bumps), wake rings and patches of foam left behind
#     (shaders/bike_foam.gdshader); the drops and rings in water_fx.gd's pools;
#   - wet: the frame and tyres darken below a wet line (shaders/bike.gdshader wet_y)
#     that jumps to above the water (higher splashing through fast) and dries from the
#     top down; out of the water the wheels and frame drip for a while;
#   - sounds: the entry splash, a soft slosh now and then while the tyres churn
#     (the swish itself is bike_audio.gd's loop), a drip now and then after.
# Cheap: three MultiMeshes and one mesh (one draw call each), fixed pools, nothing
# made a frame; with the bike dry and still dripping done, it does nothing.

const T := preload("res://tunables.gd")
const FOAM := 40

var bike                   # AshBike
var fx: WaterFx
var foam: MultiMesh
var bow: MeshInstance3D
var bow_mat: ShaderMaterial
var mats: Array = []       # the water materials with the parting uniforms
var wet := 0.0             # the wet line on the bike (m above its ground)
var drip_t := 0.0          # s of dripping left
var depth_f := 0.0         # the water at the tyres now (m, as the bike sits in it)
var depth_r := 0.0
var in_water := false
var stats := {"us": 0.0, "us_max": 0.0, "bursts": 0}
var rng := RandomNumberGenerator.new()
var _fp := PackedVector3Array()
var _fa := PackedFloat32Array()     # age 0..1 (>= 1 free)
var _fl := PackedFloat32Array()     # life (s)
var _fs := PackedFloat32Array()     # size (m)
var _fy := PackedFloat32Array()     # yaw
var _fseed := PackedFloat32Array()
var _fnext := 0
var _flive := 0
var _foam_new := false
var _was_f := false
var _was_r := false
var _was_ground := true
var _squash := 0.0
var _acc_f := 0.0
var _acc_r := 0.0
var _acc_t := 0.0
var _foam_d := 0.0
var _ring_t := 0.0
var _slosh_t := 0.0
var _drip_acc := 0.0
var _drip_snd := 2.0
var _bow_k := 0.0
var _part_k := 0.0
var _part_set := false
var _wet_set := NAN

var FX := T.dict("bike", "water_fx", {})
var SPRAY := float(FX.get("spray", 150.0))
var ROOSTER_FROM := float(FX.get("rooster_from", 7.5))
var ROOSTER := float(FX.get("rooster", 110.0))
var BURST := float(FX.get("burst", 36.0))
var BOW_H := float(FX.get("bow_h", 0.26))
var BOW_LEN: Array = FX.get("bow_len", [1.0, 3.0])
var WAKE_LEN: Array = FX.get("wake_len", [2.0, 14.0])
var FOAM_GAP := float(FX.get("foam_gap", 0.5))
var FOAM_LIFE := float(FX.get("foam_life", 3.0))
var RING_GAP := float(FX.get("ring_gap", 0.22))
var DRIP_T := float(FX.get("drip_time", 7.0))
var DRIPS := float(FX.get("drips", 16.0))
var DRY := float(FX.get("dry", 0.01))
var WET_SPLASH := float(FX.get("wet_splash", 0.3))
var DEEP := float(FX.get("deep", 0.25))   # the tyre depth counted as fully in (m)

func setup(b) -> void:
	name = "BikeWater"
	bike = b
	top_level = true
	rng.randomize()
	fx = WaterFx.new(int(FX.get("drops", 256)), int(FX.get("rings", 24)))
	add_child(fx)
	fx.tint(Color(0.95, 0.99, 1.0, 0.95))
	# the foam patches: flat quads on the surface
	var qm := PlaneMesh.new()
	qm.size = Vector2(1, 1)
	var fm := ShaderMaterial.new()
	fm.shader = preload("res://shaders/bike_foam.gdshader")
	fm.render_priority = 1
	qm.material = fm
	foam = MultiMesh.new()
	foam.transform_format = MultiMesh.TRANSFORM_3D
	foam.use_custom_data = true
	foam.mesh = qm
	foam.instance_count = FOAM
	foam.visible_instance_count = 0
	var fmi := MultiMeshInstance3D.new()
	fmi.multimesh = foam
	fmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	fmi.extra_cull_margin = 8.0
	add_child(fmi)
	_fp.resize(FOAM); _fa.resize(FOAM); _fl.resize(FOAM); _fs.resize(FOAM); _fy.resize(FOAM); _fseed.resize(FOAM)
	for i in FOAM: _fa[i] = 1.0
	# the bow wave
	bow_mat = ShaderMaterial.new()
	bow_mat.shader = preload("res://shaders/bike_bow.gdshader")
	bow_mat.render_priority = 2
	bow = MeshInstance3D.new()
	bow.mesh = _bow_mesh()
	bow.material_override = bow_mat
	bow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	bow.extra_cull_margin = 1.0
	bow.visible = false
	add_child(bow)
	_find_mats()   # (main.gd made the water before the cast: found once, while loading)

# the water materials the parting is drawn on (main.gd's water: the sea's shallows, the
# pond and the streams)
func _find_mats() -> void:
	mats = []
	var root = bike.game.get("water_root")
	if root == null: return
	var seen := {}
	for mi in (root as Node).find_children("*", "MeshInstance3D", true, false):
		var m = (mi as MeshInstance3D).material_override
		if not (m is ShaderMaterial) or seen.has(m): continue
		var sh: Shader = (m as ShaderMaterial).shader
		if sh == null: continue
		var p := sh.resource_path
		if p.ends_with("/sea.gdshader") or p.ends_with("/fresh.gdshader"):
			seen[m] = true
			mats.append(m)

# two wings in a V, each a strip from the tyre back and out (local: +z ahead, +x left)
func _bow_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var NA := 10
	var NX := 5
	for sd in [-1.0, 1.0]:
		for j in NA:
			for i in NX:
				var q := []
				for c in [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]:
					var u := float(c[0]) / NX
					var y := float(c[1]) / NA
					# along the wing: back (-z) and out at about 30 degrees, curving out a little
					var back := y
					var out := 0.05 + y * 0.52 + y * y * 0.1 + (u - 0.15) * 0.28
					q.append([Vector3(sd * out, 0.0, 0.08 - back), Vector2(u, y)])
				for e in q:
					st.set_uv(e[1])
					st.add_vertex(e[0])
	return st.commit()

func pools_live() -> int:
	return fx.live() + _flive + (1 if bow.visible else 0)

# the water at a tyre: [surface or NAN, depth as the bike sits in it]
func _at(p: Vector3) -> Vector2:
	var W = bike.game.world
	var fl: int = W.flag(p.x, p.z)
	if fl == 255 or (fl & 1) == 0 or (fl & 4) != 0: return Vector2(NAN, 0.0)   # (dry: the quick way out)
	var s: float = W.water_surface(p.x, p.z)
	if is_nan(s): return Vector2(NAN, 0.0)
	return Vector2(s, maxf(0.0, s - W.ash_ground(p.x, p.z)))

func update(dt: float) -> void:
	var t0 := Time.get_ticks_usec()
	var b = bike
	var riding: bool = b.state == "ride" and b.visible and not b.game.indoors
	var idle: bool = not riding and wet <= 0.0 and drip_t <= 0.0 and pools_live() == 0 and not _part_set
	if idle:
		stats.us = 0.0
		return
	var f := Vector3(sin(b.yaw), 0, cos(b.yaw))
	var l := Vector3(cos(b.yaw), 0, -sin(b.yaw))
	var wb: float = b.model.WB * 0.5
	var fp: Vector3 = b.at + f * wb
	var rp: Vector3 = b.at - f * wb
	var v: float = absf(b.v)
	var wf := _at(fp) if riding else Vector2(NAN, 0.0)
	var wr := _at(rp) if riding else Vector2(NAN, 0.0)
	depth_f = wf.y
	depth_r = wr.y
	var ground: bool = b.cast.ground
	var in_f := riding and not is_nan(wf.x) and wf.y > 0.015 and ground
	var in_r := riding and not is_nan(wr.x) and wr.y > 0.015 and ground
	in_water = in_f or in_r
	var dkf := clampf(wf.y / DEEP, 0.0, 1.0)
	var dkr := clampf(wr.y / DEEP, 0.0, 1.0)
	var vel: Vector3 = f * float(b.v)
	# a landing or a bump in the water: a burst
	var bumped: bool = b.squash > _squash + 0.12
	_squash = b.squash
	var landed: bool = ground and not _was_ground
	_was_ground = ground
	if in_f and ((not _was_f and v > 1.8) or (landed or bumped)):
		_burst(Vector3(fp.x, wf.x, fp.z), v, dkf, f, landed or bumped)
	if in_r and not _was_r and v > 1.8 and not in_f:
		_burst(Vector3(rp.x, wr.x, rp.z), v * 0.7, dkr, f, false)
	_was_f = in_f
	_was_r = in_r
	# spray fans off both tyres, more and higher at speed and deeper
	var vk := clampf(v / 6.0, 0.0, 2.0)
	if in_f and v > 0.4:
		_acc_f += dt * SPRAY * vk * (0.35 + 0.65 * dkf)
		while _acc_f >= 1.0:
			_acc_f -= 1.0
			var sd := 1.0 if rng.randf() < 0.5 else -1.0
			var o := Vector3(fp.x, wf.x + 0.02, fp.z) + l * sd * rng.randf_range(0.03, 0.09) + f * rng.randf_range(-0.05, 0.12)
			var up := rng.randf_range(1.3, 2.8) * (0.6 + v * 0.11) * (0.6 + 0.6 * dkf)
			var dv: Vector3 = vel * rng.randf_range(0.35, 0.8) + l * sd * rng.randf_range(0.7, 1.7) * (0.4 + v * 0.15) + Vector3(0, up, 0)
			fx.drop(o, dv, wf.x - 0.02, rng.randf_range(0.04, 0.085) * (0.8 + 0.5 * dkf), 1.4)
	if in_r and v > 0.4:
		_acc_r += dt * SPRAY * 0.6 * vk * (0.35 + 0.65 * dkr)
		while _acc_r >= 1.0:
			_acc_r -= 1.0
			var sd2 := 1.0 if rng.randf() < 0.5 else -1.0
			var o2 := Vector3(rp.x, wr.x + 0.02, rp.z) + l * sd2 * rng.randf_range(0.03, 0.08)
			var up2 := rng.randf_range(0.9, 2.0) * (0.45 + v * 0.1) * (0.6 + 0.6 * dkr)
			var dv2: Vector3 = vel * rng.randf_range(0.2, 0.6) + l * sd2 * rng.randf_range(0.5, 1.3) * (0.4 + v * 0.12) + Vector3(0, up2, 0)
			fx.drop(o2, dv2, wr.x - 0.02, rng.randf_range(0.035, 0.07) * (0.8 + 0.5 * dkr), 1.4)
		# the rooster tail: fast, the back tyre throws a plume up and back
		if v > ROOSTER_FROM:
			_acc_t += dt * ROOSTER * clampf((v - ROOSTER_FROM) / 6.0, 0.0, 1.5) * (0.4 + 0.6 * dkr)
			while _acc_t >= 1.0:
				_acc_t -= 1.0
				var o3 := Vector3(rp.x, wr.x + 0.05, rp.z) - f * rng.randf_range(0.05, 0.2)
				var dv3: Vector3 = -f * rng.randf_range(0.4, 2.0) + l * rng.randf_range(-0.4, 0.4) + Vector3(0, rng.randf_range(2.6, 4.6) * (0.7 + (v - ROOSTER_FROM) * 0.05), 0) + vel * rng.randf_range(0.0, 0.25)
				fx.drop(o3, dv3, wr.x - 0.02, rng.randf_range(0.035, 0.07), 1.8)
	# wake rings and foam left behind the back tyre
	var wake := in_r if in_r else in_f
	var wpt := Vector3(rp.x, wr.x, rp.z) if in_r else Vector3(fp.x, wf.x, fp.z)
	var dk := maxf(dkf, dkr)
	if wake:
		_ring_t -= dt
		if _ring_t <= 0.0:
			_ring_t = RING_GAP if v > 0.4 else rng.randf_range(0.9, 1.6)
			fx.ring(wpt + Vector3(0, 0.012, 0) - f * minf(0.5, v * 0.05), 0.8 + v * 0.16 + dk * 1.2)
		_foam_d += v * dt
		if _foam_d > FOAM_GAP and v > 1.0:
			_foam_d = 0.0
			_foam(wpt + Vector3(0, 0.015, 0) - f * 0.25 + l * rng.randf_range(-0.12, 0.12), 0.45 + v * 0.06 + dk * 0.35, b.yaw)
		# the water churning round the tyres: a soft slosh now and then
		if v > 1.0:
			_slosh_t -= dt
			if _slosh_t <= 0.0:
				_slosh_t = rng.randf_range(0.4, 0.9) * 6.0 / (v + 3.0)
				Sfx.play("step_water_run" if rng.randf() < 0.5 else "step_water", null, {"vol": -25.0 + 7.0 * dk + minf(v, 10.0) * 0.4, "pitch": rng.randf_range(0.72, 0.9)})
	# the bow wave
	var bow_want := clampf(v / 2.5, 0.0, 1.0) * (0.35 + 0.65 * dkf) if in_f else 0.0
	if bow_want > 0.0 or _bow_k > 0.0: _bow_k = move_toward(_bow_k, bow_want, dt * (6.0 if bow_want > _bow_k else 3.0))
	var bv := _bow_k > 0.01 and riding
	if bow.visible != bv: bow.visible = bv
	if bv:
		var sy: float = wf.x if not is_nan(wf.x) else b.at.y
		var L := lerpf(float(BOW_LEN[0]), float(BOW_LEN[1]), clampf(v / 14.0, 0.0, 1.0)) * (0.7 + 0.5 * dkf)
		var wdt := 0.8 + 0.5 * dkf + clampf(v / 14.0, 0.0, 1.0) * 0.6
		bow.global_transform = Transform3D(Basis(Vector3.UP, b.yaw) * Basis.from_scale(Vector3(wdt, 1.0, L)), Vector3(fp.x, sy + 0.004, fp.z) + f * 0.08)
		bow_mat.set_shader_parameter("amp", BOW_H * (0.3 + 0.7 * clampf(v / 9.0, 0.0, 1.3)) * (0.5 + dkf))
		bow_mat.set_shader_parameter("k", _bow_k)
		bow_mat.set_shader_parameter("spd", v)
	# the water itself parting (the water shaders)
	var pk := clampf(v / 4.0, 0.0, 1.0) * clampf(wf.y / 0.05, 0.0, 1.0) if in_f else 0.0
	if pk > 0.0 or _part_k > 0.0: _part_k = move_toward(_part_k, pk, dt * (5.0 if pk > _part_k else 2.5))
	if _part_k > 0.002:
		if mats.is_empty(): _find_mats()
		var wl := lerpf(float(WAKE_LEN[0]), float(WAKE_LEN[1]), clampf(v / 15.0, 0.0, 1.0))
		var pp := Vector4(fp.x, fp.z, f.x, f.z)
		var kk := Vector4(_part_k, wl, dkf, v)
		for m in mats:
			m.set_shader_parameter("part_p", pp)
			m.set_shader_parameter("part_k", kk)
		_part_set = true
	elif _part_set:
		for m in mats: m.set_shader_parameter("part_k", Vector4.ZERO)
		_part_set = false
	# wet: the line jumps to above the water (higher splashing through fast), dries slowly
	if in_water:
		var top := maxf(depth_f, depth_r) + 0.05 + WET_SPLASH * clampf(v / 12.0, 0.0, 1.0) * dk
		wet = minf(1.1, maxf(wet, top))
		drip_t = DRIP_T
	else:
		wet = maxf(0.0, wet - dt * DRY * (1.0 + v * 0.05))
		drip_t = maxf(0.0, drip_t - dt)
		if drip_t > 0.0 and b.visible: _drips(dt, f, v)
	var wy: float = b.at.y + wet if wet > 0.01 else -10000.0
	if is_nan(_wet_set) or absf(wy - _wet_set) > 0.003:
		_wet_set = wy
		for k in b.model.mats: (b.model.mats[k] as ShaderMaterial).set_shader_parameter("wet_y", wy)
	fx.update(dt)
	_foam_update(dt)
	var us := float(Time.get_ticks_usec() - t0)
	stats.us = us
	stats.us_max = maxf(stats.us_max, us)

# a tyre hitting the water at speed: a crown of drops, a ring, the splash
func _burst(p: Vector3, v: float, dk: float, f: Vector3, small: bool) -> void:
	stats.bursts += 1
	var n := int(BURST * (0.4 + v / 10.0) * (0.6 + 0.6 * dk) * (0.6 if small else 1.0))
	for k in n:
		var a := rng.randf() * TAU
		var d := Vector3(cos(a), 0, sin(a))
		var dv := d * rng.randf_range(0.6, 1.8) * (0.5 + v * 0.12) + f * v * rng.randf_range(0.2, 0.6) + Vector3(0, rng.randf_range(1.8, 3.6) * (0.5 + v * 0.07), 0)
		fx.drop(p + d * 0.12 + Vector3(0, 0.02, 0), dv, p.y - 0.02, rng.randf_range(0.035, 0.08), 1.5)
	fx.ring(p + Vector3(0, 0.012, 0), 1.0 + v * 0.15)
	_foam(p + Vector3(0, 0.015, 0), 0.7 + v * 0.06, bike.yaw)
	Sfx.play("land_water", null, {"vol": clampf(-16.0 + v * 1.2 + dk * 4.0, -16.0, -4.0) - (5.0 if small else 0.0), "pitch": rng.randf_range(0.9, 1.08)})

func _foam(p: Vector3, size: float, yaw: float) -> void:
	var i := _fnext
	_fnext = (_fnext + 1) % FOAM
	_fp[i] = p; _fa[i] = 0.0; _fs[i] = size; _fy[i] = yaw + rng.randf_range(-0.4, 0.4); _fseed[i] = rng.randf()
	_fl[i] = FOAM_LIFE * rng.randf_range(0.8, 1.2)
	_foam_new = true

func _foam_update(dt: float) -> void:
	if _flive == 0 and not _foam_new: return
	_foam_new = false
	var m := 0
	for i in FOAM:
		if _fa[i] >= 1.0: continue
		_fa[i] += dt / _fl[i]
		if _fa[i] >= 1.0: continue
		var s := _fs[i] * (1.0 + _fa[i] * 0.8)
		foam.set_instance_transform(m, Transform3D(Basis(Vector3.UP, _fy[i]) * Basis.from_scale(Vector3(s, 1.0, s * 1.5)), _fp[i]))
		foam.set_instance_custom_data(m, Color(_fa[i], _fseed[i], 0, 0))
		m += 1
	if m != _flive or m > 0:
		foam.visible_instance_count = m
		_flive = m

# out of the water: drops off the tyres, the rims and the frame's low parts, fewer as it drains
func _drips(dt: float, f: Vector3, v: float) -> void:
	var b = bike
	var W = b.game.world
	var k := drip_t / DRIP_T
	_drip_acc += dt * DRIPS * k * k * clampf(wet / 0.35, 0.2, 1.0)
	var R: float = b.model.R
	var wb: float = b.model.WB * 0.5
	var vel: Vector3 = f * float(b.v) * 0.9
	while _drip_acc >= 1.0:
		_drip_acc -= 1.0
		var c: Vector3
		var r := rng.randf()
		if r < 0.8:
			# a tyre or rim: a point round the lower part of a wheel
			var wc: Vector3 = b.at + f * (wb if r < 0.4 else -wb) + Vector3(0, R, 0)
			var a := rng.randf_range(PI * 1.1, PI * 1.9)
			c = wc + f * cos(a) * R * rng.randf_range(0.75, 1.0) + Vector3(0, sin(a) * R, 0)
		else:
			# the bottom bracket and the chainstays
			c = b.at + f * rng.randf_range(-0.35, 0.05) + Vector3(0, R * 0.9, 0)
		if c.y > b.at.y + wet: continue
		var fl: float = W.ash_ground(c.x, c.z)
		fx.drop(c, vel + Vector3(rng.randf_range(-0.1, 0.1), -0.3, rng.randf_range(-0.1, 0.1)), fl, rng.randf_range(0.018, 0.028), 1.2)
	_drip_snd -= dt
	if _drip_snd <= 0.0:
		_drip_snd = rng.randf_range(1.2, 2.8)
		if v < 0.5 and k > 0.25: Sfx.play("water_drip", null, {"vol": -22.0 + 6.0 * k})

func clear() -> void:
	fx.clear()
	for i in FOAM: _fa[i] = 1.0
	foam.visible_instance_count = 0
	_flive = 0
	bow.visible = false
	_bow_k = 0.0
	_part_k = 0.0
	if _part_set:
		for m in mats: m.set_shader_parameter("part_k", Vector4.ZERO)
		_part_set = false
