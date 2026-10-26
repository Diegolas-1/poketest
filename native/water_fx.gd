class_name WaterFx
extends Node3D
# Water round Ash's legs (body.gd drives it): spray kicked up at his feet as he
# wades (more, higher and further the faster he goes, a burst at each step),
# rings spreading on the surface round him (a ring every fraction of a second
# while he moves: a wake trailing behind; now and then while he stands), and
# drops falling off his wet clothes (more when soaked).
# Cheap on the phone: two MultiMeshes (one draw call each), the drops moved here
# in a fixed pool, the rings' growth and fade done in their shader from an age
# in the instance's custom data.

const DROPS := 96
const RINGS := 14
const RING_LIFE := 1.25

var drops: MultiMesh
var rings: MultiMesh
var _dp := PackedVector3Array()      # position
var _dv := PackedVector3Array()      # velocity
var _dl := PackedFloat32Array()      # life left (s); <= 0 free
var _dfloor := PackedFloat32Array()  # the height it ends at (the water or the ground)
var _ds := PackedFloat32Array()      # size
var _rp := PackedVector3Array()
var _ra := PackedFloat32Array()      # age (s); >= RING_LIFE free
var _rs := PackedFloat32Array()      # final radius
var _next_d := 0
var _next_r := 0
var _live_d := 0
var _live_r := 0
var rng := RandomNumberGenerator.new()

func _init() -> void:
	name = "WaterFx"
	top_level = true
	rng.randomize()
	# the drops: little stretched spheres, light and a touch see-through
	var dm := SphereMesh.new()
	dm.radius = 0.5; dm.height = 1.0; dm.radial_segments = 6; dm.rings = 3
	var dmat := StandardMaterial3D.new()
	dmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dmat.albedo_color = Color(0.86, 0.95, 1.0, 0.85)
	dmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dmat.render_priority = 2
	dm.material = dmat
	drops = MultiMesh.new()
	drops.transform_format = MultiMesh.TRANSFORM_3D
	drops.mesh = dm
	drops.instance_count = DROPS
	drops.visible_instance_count = 0
	var dmi := MultiMeshInstance3D.new()
	dmi.multimesh = drops
	dmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	dmi.extra_cull_margin = 4.0
	add_child(dmi)
	_dp.resize(DROPS); _dv.resize(DROPS); _dl.resize(DROPS); _dfloor.resize(DROPS); _ds.resize(DROPS)
	# the rings: a flat quad, the ring drawn by its shader
	var rm := PlaneMesh.new()
	rm.size = Vector2(2, 2)
	var rmat := ShaderMaterial.new()
	rmat.shader = preload("res://shaders/ripple.gdshader")
	rmat.render_priority = 1   # over the water's surface (fresh / sea at 0)
	rm.material = rmat
	rings = MultiMesh.new()
	rings.transform_format = MultiMesh.TRANSFORM_3D
	rings.use_custom_data = true
	rings.mesh = rm
	rings.instance_count = RINGS
	rings.visible_instance_count = 0
	var rmi := MultiMeshInstance3D.new()
	rmi.multimesh = rings
	rmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	rmi.extra_cull_margin = 4.0
	add_child(rmi)
	_rp.resize(RINGS); _ra.resize(RINGS); _rs.resize(RINGS)
	for i in RINGS: _ra[i] = RING_LIFE

# a drop thrown from p at velocity v, ending (gone) when it falls below floor
func drop(p: Vector3, v: Vector3, floor_y: float, size := 0.022, life := 1.2) -> void:
	var i := _next_d
	_next_d = (_next_d + 1) % DROPS
	_dp[i] = p; _dv[i] = v; _dl[i] = life; _dfloor[i] = floor_y; _ds[i] = size

# spray at the feet: n drops round p on the surface y, kicked up by speed (m/s)
# along dir (the way he goes)
func spray(p: Vector3, n: int, speed: float, dir: Vector3) -> void:
	for k in n:
		var a := rng.randf() * TAU
		var r := rng.randf_range(0.05, 0.22)
		var at := p + Vector3(cos(a) * r, 0.02, sin(a) * r)
		var up := rng.randf_range(1.1, 2.4) * (0.55 + speed / 8.0)
		var out := Vector3(cos(a), 0, sin(a)) * rng.randf_range(0.3, 1.1) + dir * speed * rng.randf_range(0.15, 0.45)
		drop(at, Vector3(out.x, up, out.z), p.y - 0.02, rng.randf_range(0.03, 0.06), 1.0)

func ring(p: Vector3, radius: float) -> void:
	var i := _next_r
	_next_r = (_next_r + 1) % RINGS
	_rp[i] = p; _ra[i] = 0.0; _rs[i] = radius

func update(dt: float) -> void:
	# drops
	var n := 0
	var g := Vector3(0, -9.8, 0)
	for i in DROPS:
		if _dl[i] <= 0.0: continue
		_dl[i] -= dt
		_dv[i] += g * dt
		_dp[i] += _dv[i] * dt
		if _dp[i].y < _dfloor[i]: _dl[i] = 0.0
		if _dl[i] <= 0.0: continue
		var s := _ds[i]
		var stretch := clampf(_dv[i].length() * 0.06, 1.0, 2.4)
		drops.set_instance_transform(n, Transform3D(Basis.from_scale(Vector3(s, s * stretch, s)), _dp[i]))
		n += 1
	if n != _live_d or n > 0:
		drops.visible_instance_count = n
		_live_d = n
	# rings
	var m := 0
	for i in RINGS:
		if _ra[i] >= RING_LIFE: continue
		_ra[i] += dt
		if _ra[i] >= RING_LIFE: continue
		var u := _ra[i] / RING_LIFE
		var r := lerpf(0.25, _rs[i], 1.0 - pow(1.0 - u, 2.2))
		rings.set_instance_transform(m, Transform3D(Basis.from_scale(Vector3(r, 1, r)), _rp[i]))
		rings.set_instance_custom_data(m, Color(u, r, 0, 0))
		m += 1
	if m != _live_r or m > 0:
		rings.visible_instance_count = m
		_live_r = m

func clear() -> void:
	for i in DROPS: _dl[i] = 0.0
	for i in RINGS: _ra[i] = RING_LIFE
	drops.visible_instance_count = 0
	rings.visible_instance_count = 0
