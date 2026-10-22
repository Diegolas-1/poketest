class_name CastActor
extends Node3D
# A person: the finished model baked from the web build (tools/native/bake_cast.mjs
# -> res://cast/<look>.glb, one skeleton) animated like web/world/actor.js
# (calemActor): the idle, walk and run clips blended by speed with one stride
# phase (walk up to WALK_V, run from there), life on top of the idle (posture,
# breathing, weight shifts, looking around), posed jumps and landings, the head
# turned toward lookYaw, and blinking.
#
#   var a := CastActor.make("ash")
#   a.animate(dt, speed, in_air)      # once a frame, after placing it
#   a.look_yaw = 0.4                  # head look (radians, + = his left); NAN = off

const SHADER := preload("res://shaders/actor.gdshader")
const SHADER_DS := preload("res://shaders/actor_ds.gdshader")
const WALK_V := 4.5
const RUN_V := 8.5
const TEMPO_MAX := 3.0

static var _data: Dictionary = {}
static var _scenes: Dictionary = {}

var look := ""
var skel: Skeleton3D
var holder: Node3D
var y0 := 0.0
var k := 1.0
var meta: Dictionary
var anims := {}          # name -> Animation
var rot_tr := {}         # name -> { bone: track }
var pos_tr := {}         # name -> track of Waist.position (or -1)
var bones := {}          # bone name -> index
var rest_q: Array[Quaternion] = []
var rest_w: Array[Quaternion] = []   # rest rotation in the model's frame (inverted)
var rest_waist := Vector3.ZERO
var used: PackedInt32Array = []      # bones written every frame
var q: Array[Quaternion] = []
var waist := -1
var eyes: ShaderMaterial
var meshes: Array[MeshInstance3D] = []

var phase := 0.0
var idle_t := 0.0
var w := {"idle": 1.0, "walk": 0.0, "run": 0.0}
var blink := 2.0
var look_yaw := NAN
var _look_y := 0.0
var _rng := RandomNumberGenerator.new()
# life (idleLife in actor.js)
var L := {}
# jump
var air_w := 0.0
var was_air := false
var jump := {"t": 0.0, "vy": 0.0, "y": NAN, "run": 0.0, "lead": 0, "impact": 0.0, "land": 1.0}

static func data() -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string("res://cast/cast.json"))
	return _data

static func make(look_name: String) -> CastActor:
	var a := CastActor.new()
	a.name = "Actor_" + look_name
	a._build(look_name)
	return a

func _build(look_name: String) -> void:
	look = look_name
	_rng.randomize()
	var d: Dictionary = data().looks[look]
	meta = d.meta
	if not _scenes.has(look): _scenes[look] = load("res://cast/%s.glb" % look)
	var root: Node3D = _scenes[look].instantiate()
	add_child(root)
	holder = root.get_child(0) as Node3D
	y0 = holder.position.y
	k = holder.scale.x
	skel = root.find_child("Skeleton3D", true, false)
	var ap: AnimationPlayer = root.find_child("AnimationPlayer", true, false)
	for an in ["idle", "walk", "run"]:
		anims[an] = ap.get_animation(an)
	# the clips are sampled by hand; the player itself is not needed
	ap.get_parent().remove_child(ap)
	ap.free()
	for i in skel.get_bone_count():
		bones[skel.get_bone_name(i)] = i
		rest_q.append(skel.get_bone_rest(i).basis.get_rotation_quaternion())
		rest_w.append(skel.get_bone_global_rest(i).basis.get_rotation_quaternion().inverse())
	q.resize(skel.get_bone_count())
	waist = bones.get("Waist", -1)
	if waist >= 0: rest_waist = skel.get_bone_rest(waist).origin
	var u := {}
	for an in anims:
		var A: Animation = anims[an]
		var rt := {}
		pos_tr[an] = -1
		for t in A.get_track_count():
			var bn := String(A.track_get_path(t).get_concatenated_subnames())
			if not bones.has(bn): continue
			var bi: int = bones[bn]
			if A.track_get_type(t) == Animation.TYPE_ROTATION_3D:
				rt[bi] = t; u[bi] = true
			elif A.track_get_type(t) == Animation.TYPE_POSITION_3D and bi == waist:
				pos_tr[an] = t
		rot_tr[an] = rt
	for n in ["Spine1", "Spine2", "Spine3", "Neck", "Head", "LShoulder", "RShoulder", "LArmA", "RArmA", "LForeArm", "RForeArm",
			"LThigh", "RThigh", "LLeg", "RLeg", "LFoot", "RFoot"]:
		if bones.has(n): u[bones[n]] = true
	for bi in u: used.append(bi)
	_materials(root, d.mats)
	idle_t = _rng.randf() * float(anims.idle.length)
	blink = 2.0 + _rng.randf() * 3.0
	L = {"t": _rng.randf() * 20.0, "yaw": 0.0, "pitch": 0.0, "vy": 0.0, "vp": 0.0, "ty": 0.0, "tp": 0.0,
		"look": 2.0 + _rng.randf() * 3.0, "side": -1.0 if _rng.randf() < 0.5 else 1.0, "cp": 0.0, "swap": 15.0 + _rng.randf() * 15.0}
	L.cp = L.side

func _materials(root: Node, mats: Array) -> void:
	var made := {}
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var m3 := mi as MeshInstance3D
		meshes.append(m3)
		m3.extra_cull_margin = 0.5
		var shadow := true
		for s in m3.mesh.get_surface_count():
			var src := m3.mesh.surface_get_material(s)
			var nm := String(src.resource_name) if src else ""
			if made.has(nm):
				m3.set_surface_override_material(s, made[nm]); continue
			var idx := int(nm.substr(1)) if nm.begins_with("c") else -1
			var info: Dictionary = mats[idx] if idx >= 0 and idx < mats.size() else {}
			var m := ShaderMaterial.new()
			m.shader = SHADER_DS if info.get("ds", false) else SHADER
			if src is BaseMaterial3D:
				m.set_shader_parameter("albedo", src.albedo_color)
				if src.albedo_texture:
					m.set_shader_parameter("albedo_tex", src.albedo_texture)
					m.set_shader_parameter("use_tex", true)
			m.set_shader_parameter("use_vc", info.get("vc", false))
			if float(info.get("alpha", 0.0)) > 0.0: m.set_shader_parameter("alpha_scissor", float(info.alpha))
			if info.get("decal", false): m.set_shader_parameter("lift", 0.004)
			var cel = info.get("cel")
			if cel is Dictionary:
				for key in [["bands", "bands"], ["deep", "deep"], ["shade", "shade"], ["lit", "lit"], ["litAdd", "lit_add"]]:
					if cel.has(key[0]):
						var v: Array = cel[key[0]]
						m.set_shader_parameter(key[1], Vector3(v[0], v[1], v[2]))
			if info.get("eyes", false): eyes = m
			if not info.get("shadow", true): shadow = false
			made[nm] = m
			m3.set_surface_override_material(s, m)
		if not shadow: m3.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

# ---------- helpers ----------
static func _sm(a: float, b: float, x: float) -> float:
	var t := clampf((x - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

# rotate a bone about an axis given in the model's rest frame, on top of what it has
func bend(n: String, x: float, y: float, z: float, a: float) -> void:
	var bi: int = bones.get(n, -1)
	if bi < 0 or a == 0.0: return
	q[bi] = q[bi] * Quaternion((rest_w[bi] * Vector3(x, y, z)).normalized(), a)

# the same, on top of the rest pose
func pose(n: String, turns: Array) -> void:
	var bi: int = bones.get(n, -1)
	if bi < 0: return
	var r := rest_q[bi]
	for t in turns:
		if t[3] == 0.0: continue
		r = r * Quaternion((rest_w[bi] * Vector3(t[0], t[1], t[2])).normalized(), t[3])
	q[bi] = r

# ---------- the frame ----------
func animate(dt: float, speed: float, air: bool) -> void:
	_clips(dt, speed, air)
	_head_look(dt)
	for bi in used: skel.set_bone_pose_rotation(bi, q[bi])
	_blink(dt)

func _clips(dt: float, speed: float, air: bool) -> void:
	var dW: float = anims.walk.length
	var dR: float = anims.run.length
	var loco := _sm(0.05, 0.7, speed)
	var rb := _sm(WALK_V * 1.05, WALK_V + (RUN_V - WALK_V) * 0.7, speed)
	var tw := {"idle": 1.0 - loco, "walk": loco * (1.0 - rb), "run": loco * rb}
	var e := 1.0 - exp(-dt * 10.0)
	for n in tw: w[n] += (tw[n] - w[n]) * e
	var sw: float = float(meta.walk.stride)
	var sr: float = float(meta.run.stride)
	var stride := lerpf(sw, sr, w.run / maxf(1e-3, w.walk + w.run)) * k
	var tempo := lerpf(1.0 / dW, 1.0 / dR, rb)
	if not air: phase = fmod(phase + dt * minf(maxf(speed, 0.8) / stride, tempo * TEMPO_MAX), 1.0)
	idle_t = fmod(idle_t + dt, float(anims.idle.length))
	var times := {"idle": idle_t, "walk": fmod(phase + float(meta.walk.lead), 1.0) * dW, "run": fmod(phase + float(meta.run.lead), 1.0) * dR}
	# blended clip pose (weights add to one; a clip without a track holds the rest pose)
	for bi in used:
		var acc := Quaternion(0, 0, 0, 0)
		for an in w:
			var wt: float = w[an]
			if wt < 0.001: continue
			var A: Animation = anims[an]
			var tr = rot_tr[an].get(bi, -1)
			var r: Quaternion = A.rotation_track_interpolate(tr, times[an]) if tr >= 0 else rest_q[bi]
			if acc.dot(r) < 0.0: r = -r
			acc += r * wt
		q[bi] = acc.normalized() if acc.length_squared() > 1e-8 else rest_q[bi]
	if waist >= 0:
		var p := Vector3.ZERO
		var sum := 0.0
		for an in w:
			var wt: float = w[an]
			if wt < 0.001: continue
			var tr: int = pos_tr[an]
			p += (anims[an].position_track_interpolate(tr, times[an]) if tr >= 0 else rest_waist) * wt
			sum += wt
		skel.set_bone_pose_position(waist, p / maxf(sum, 1e-4))
	# a sprint past the run clip's own speed leans into it
	var lean := _sm(RUN_V * 1.1, RUN_V * 1.8, speed) * (1.0 - air_w)
	if lean > 0.001:
		bend("Spine2", 1, 0, 0, lean * 0.14); bend("Spine3", 1, 0, 0, lean * 0.07); bend("Head", 1, 0, 0, -lean * 0.12)
	_idle_life(dt, w.idle * (1.0 - air_w), (w.idle + w.walk * 0.6) * (1.0 - air_w))
	# feet a little apart at a walk, soles flat; arms a touch out from the sides
	var ww: float = w.walk * (1.0 - air_w)
	if ww > 0.001:
		for s in [["L", 1.0], ["R", -1.0]]:
			bend(s[0] + "Thigh", 0, 0, 1, s[1] * 0.05 * ww); bend(s[0] + "Foot", 0, 0, 1, -s[1] * 0.05 * ww)
	var wa: float = (w.walk * 0.06 + w.run * 0.08) * (1.0 - air_w)
	if wa > 0.001:
		for s in [["L", 1.0], ["R", -1.0]]: bend(s[0] + "ArmA", 0, 0, 1, s[1] * wa)
	_jump(dt, speed, air)

# ---------- life on top of the idle clip ----------
func _idle_life(dt: float, wI: float, wP: float) -> void:
	L.t += dt
	if wP > 0.001:
		bend("Spine2", 1, 0, 0, -0.06 * wP); bend("Spine3", 1, 0, 0, -0.07 * wP); bend("Neck", 1, 0, 0, -0.04 * wP); bend("Head", 1, 0, 0, -0.02 * wP)
		bend("LShoulder", 0, 1, 0, 0.14 * wP); bend("RShoulder", 0, 1, 0, -0.14 * wP)
	if wI < 0.001: return
	for i in 2:
		var s := "L" if i == 0 else "R"
		var sg := 1.0 if i == 0 else -1.0
		bend(s + "Shoulder", 0, 0, 1, -sg * 0.04 * wI)
		bend(s + "ArmA", 0, 0, 1, sg * (0.17 if i else 0.21) * wI); bend(s + "ArmA", 0, 1, 0, sg * (0.22 if i else 0.27) * wI)
		bend(s + "ForeArm", 0, 1, 0, -sg * (0.42 if i else 0.52) * wI)
	L.swap -= dt
	if L.swap < 0.0:
		L.side = -L.side; L.swap = 15.0 + _rng.randf() * 15.0
	L.cp += (L.side - L.cp) * (1.0 - exp(-dt * 1.2))
	var cp: float = L.cp * wI
	var rl := "R" if L.cp > 0.0 else "L"
	var ca := absf(cp)
	bend("Spine1", 0, 0, 1, 0.05 * cp); bend("Spine3", 0, 0, 1, -0.04 * cp); bend("Head", 0, 0, 1, -0.035 * cp)
	bend(rl + "Thigh", 1, 0, 0, -0.07 * ca); bend(rl + "Thigh", 0, 0, 1, (1.0 if rl == "L" else -1.0) * 0.03 * ca)
	bend(rl + "Leg", 1, 0, 0, 0.26 * ca); bend(rl + "Foot", 1, 0, 0, -0.12 * ca)
	var br: float = sin(L.t * 1.6) * wI
	var sway: float = sin(L.t * 0.45) * wI
	bend("Spine2", 1, 0, 0, -0.025 * br); bend("Spine3", 1, 0, 0, -0.015 * br); bend("Head", 1, 0, 0, 0.03 * br)
	bend("LShoulder", 0, 0, 1, 0.025 * br); bend("RShoulder", 0, 0, 1, -0.025 * br)
	bend("Spine1", 0, 0, 1, 0.025 * sway); bend("Spine3", 0, 0, 1, -0.018 * sway)
	# look around: pick a spot, turn to it (head leads, neck and chest follow)
	L.look -= dt
	if not is_nan(look_yaw):
		L.ty = 0.0; L.tp = 0.0; L.look = 1.0
	if L.look < 0.0:
		L.look = 3.0 + _rng.randf() * 5.0
		var ty := ((-1.0 if _rng.randf() < 0.5 else 1.0) * (0.5 + _rng.randf() * 0.35)) if _rng.randf() < 0.35 else (_rng.randf() - 0.5) * 0.5
		if absf(ty - L.yaw) > 0.4: blink = minf(blink, 0.04)
		L.ty = ty; L.tp = (_rng.randf() - 0.65) * 0.25
	var n := mini(60, ceili(dt / 0.02))
	var h := dt / maxf(1, n)
	var om := 3.5
	for i in n:
		L.vy += ((L.ty - L.yaw) * om * om - 2.0 * om * L.vy) * h; L.yaw += L.vy * h
		L.vp += ((L.tp - L.pitch) * om * om - 2.0 * om * L.vp) * h; L.pitch += L.vp * h
	var yw: float = L.yaw * wI
	var pt: float = L.pitch * wI
	bend("Spine3", 0, 1, 0, yw * 0.15); bend("Neck", 0, 1, 0, yw * 0.35); bend("Head", 0, 1, 0, yw * 0.5)
	bend("Neck", 1, 0, 0, pt * 0.4); bend("Head", 1, 0, 0, pt * 0.6)

# ---------- jumps and landings ----------
const J := {
	"take": {"th": [-0.1, 0.05], "kn": [0.15, 0.1], "ft": [0.55, 0.5], "sw": [-0.45, -0.4], "ab": [0.25, 0.25], "el": [0.6, 0.6], "sp": -0.04, "hd": -0.06},
	"rise": {"th": [-0.85, -0.6], "kn": [1.35, 1.15], "ft": [0.35, 0.3], "sw": [-0.5, -0.4], "ab": [0.4, 0.4], "el": [1.2, 1.1], "sp": 0.06, "hd": -0.06},
	"fall": {"th": [-0.35, -0.15], "kn": [0.5, 0.35], "ft": [0.15, 0.1], "sw": [-0.2, -0.1], "ab": [0.7, 0.65], "el": [0.5, 0.45], "sp": 0.08, "hd": 0.06},
	"riseR": {"th": [-0.95, 0.3], "kn": [1.2, 0.75], "ft": [0.2, 0.45], "sw": [0.55, -0.9], "ab": [0.25, 0.25], "el": [0.9, 1.0], "sp": 0.12, "hd": -0.06},
	"fallR": {"th": [-0.6, 0.1], "kn": [0.55, 0.45], "ft": [0.05, 0.3], "sw": [0.2, -0.4], "ab": [0.45, 0.4], "el": [0.6, 0.6], "sp": 0.1, "hd": 0.02},
}
const JUMP_BONES := ["LThigh", "RThigh", "LLeg", "RLeg", "LFoot", "RFoot", "LArmA", "RArmA", "LForeArm", "RForeArm", "Spine2", "Head"]

static func _jmix(a: Dictionary, b: Dictionary, u: float) -> Dictionary:
	var o := {}
	for key in a:
		if a[key] is Array: o[key] = [lerpf(a[key][0], b[key][0], u), lerpf(a[key][1], b[key][1], u)]
		else: o[key] = lerpf(a[key], b[key], u)
	return o

func _jump_pose(P: Dictionary) -> void:
	var sides := ["L", "R"] if jump.lead == 0 else ["R", "L"]
	for i in 2:
		var s: String = sides[i]
		var sg := 1.0 if s == "L" else -1.0
		pose(s + "Thigh", [[1, 0, 0, P.th[i]], [0, 0, 1, sg * 0.04]])
		pose(s + "Leg", [[1, 0, 0, P.kn[i]]])
		pose(s + "Foot", [[1, 0, 0, P.ft[i]]])
		pose(s + "ArmA", [[1, 0, 0, P.sw[i]], [0, 0, 1, sg * P.ab[i]], [0, 0, 1, -sg * PI / 2.0]])
		pose(s + "ForeArm", [[0, 1, 0, -sg * P.el[i]]])
	pose("Spine2", [[1, 0, 0, P.sp]])
	pose("Head", [[1, 0, 0, P.hd]])

func _jump(dt: float, speed: float, air: bool) -> void:
	var y := global_position.y
	if not is_nan(jump.y) and dt > 0.0: jump.vy += ((y - jump.y) / dt - jump.vy) * minf(1.0, dt * 30.0)
	jump.y = y
	if air and not was_air:
		jump.t = 0.0; jump.run = _sm(1.5, WALK_V, speed); jump.lead = 0 if phase < 0.5 else 1
	if not air and was_air:
		jump.land = 0.0; jump.impact = minf(1.0, maxf(0.25, -jump.vy / 6.0))
	was_air = air
	air_w += ((1.0 if air else 0.0) - air_w) * (1.0 - exp(-dt * (18.0 if air else 12.0)))
	if air_w > 0.002:
		if air: jump.t += dt
		var ext: float = _sm(0.04, 0.2, jump.t)
		var fall: float = _sm(1.5, -2.5, jump.vy)
		var rise := _jmix(_jmix(J.take, J.rise, ext), _jmix(J.take, J.riseR, ext), jump.run)
		var P := _jmix(rise, _jmix(J.fall, J.fallR, jump.run), fall)
		var saved := []
		for n in JUMP_BONES: saved.append(q[bones[n]] if bones.has(n) else Quaternion())
		_jump_pose(P)
		for i in JUMP_BONES.size():
			var bi: int = bones.get(JUMP_BONES[i], -1)
			if bi >= 0: q[bi] = saved[i].slerp(q[bi], air_w)
	jump.land = minf(1.0, jump.land + dt / (0.32 + jump.impact * 0.12))
	var u: float = jump.land
	var cr: float = (minf(1.0, u / 0.12) * pow(1.0 - _sm(0.12, 1.0, u), 1.3) if u < 1.0 else 0.0) * jump.impact * (1.0 - air_w) * (1.0 - 0.5 * _sm(2.0, WALK_V, speed))
	if cr > 0.001:
		for s in ["L", "R"]:
			bend(s + "Thigh", 1, 0, 0, -0.5 * cr); bend(s + "Leg", 1, 0, 0, 1.0 * cr); bend(s + "Foot", 1, 0, 0, -0.5 * cr)
		bend("Spine2", 1, 0, 0, 0.22 * cr); bend("Head", 1, 0, 0, -0.14 * cr)
		for s in [["L", 1.0], ["R", -1.0]]:
			bend(s[0] + "ArmA", 1, 0, 0, -0.35 * cr); bend(s[0] + "ArmA", 0, 0, 1, s[1] * 0.15 * cr)
	holder.position.y = y0 - cr * 0.1 * k / 1.3

# ---------- head look and blinking ----------
func _head_look(dt: float) -> void:
	if is_nan(look_yaw): return
	_look_y += (look_yaw - _look_y) * (1.0 - exp(-dt * 6.0))
	bend("Spine3", 0, 1, 0, _look_y * 0.12); bend("Neck", 0, 1, 0, _look_y * 0.35); bend("Head", 0, 1, 0, _look_y * 0.5)

# the eye atlas has the closed eyes half a texture to the right
func _blink(dt: float) -> void:
	blink -= dt
	if eyes:
		eyes.set_shader_parameter("uv_off", Vector2(0.5 if blink < 0.0 else 0.0, 0.0))
	if blink < -0.12: blink = 2.0 + _rng.randf() * 4.0
