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
# the walk -> run crossfade (m/s): Ash's (the clips are styled for his 4.5 / 8.5);
# the townspeople set slower ones (life.gd), so a kid at tag runs instead of
# power-walking
var walk_v := WALK_V
var gait := 1.0          # this frame's stride scale (1 = the clip's own)
var run_v := RUN_V
# the step rate a gait settles at (cycles of two steps a second; 0 = off, Ash):
# slower than that the stride shortens (the legs swing less) instead of the steps
# slowing, so a slow walker takes small steps at a natural pace, not slow-motion
# long ones
var cad_walk := 0.0
var cad_run := 0.0

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
var ax_x: Array[Vector3] = []        # the model's x / y / z axes in each bone's rest frame
var ax_y: Array[Vector3] = []
var ax_z: Array[Vector3] = []
var trk := {}                        # name -> PackedInt32Array: rotation track per used bone (-1 = none)
var used: PackedInt32Array = []      # bones written every frame
var q: Array[Quaternion] = []
var waist := -1
var waist_pos := Vector3.ZERO
var rest_pos: Array[Vector3] = []
var idles: IdleActions
var eyes: ShaderMaterial
var meshes: Array[MeshInstance3D] = []
var mat_src := {}           # ShaderMaterial -> its cast.json material name (body.gd: the wet look per material)
# worn out (body.gd, fatigue): 0..1, a hunched, panting posture on top of the clips
var tired := 0.0
# cloth and hair: the garments' cloth bones and the hair chains, simulated (cloth.gd)
var cloth: ClothSim
var cloth_far := false      # set by the owner: far off, the cloth just hangs
var cloth_rate := 60.0      # sim steps a second (fewer further off: the bones then move only with them)
var sim_cost_us := 0.0      # the last frame's sim time (dev)
# the ground's height under a point (x, z, world): set by the owner (the player's: the
# world's terrain); unset, the ground is level at the actor's own height
var ground: Callable

var phase := 0.0
var steps := 0              # feet put down so far (sfx_world.gd: one footstep sound each)
var _half := 0
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

func _exit_tree() -> void:
	if cloth: cloth.finish()

static func data() -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string("res://cast/cast.json"))
		_overrides(_data)
	return _data

# The world editor's character edits (res://tunables/cast.json, looks.<look>):
# mats.<src> {albedo, cel {...}} over the material of that name, meta.<clip>
# {stride, lead}, sim.chains.<i> {ks, drag, damp, vmax, flut, cone, ...} over
# that cloth chain, clips.<clip>.tracks.<bone> {t: [...], q: [[x, y, z, w]...]}
# (keyframes that replace the bone's rotation track; applied in _build)
static func _overrides(d: Dictionary) -> void:
	var o = preload("res://tunables.gd").file("cast").get("looks")
	if not o is Dictionary: return
	for lk in o:
		if not d.looks.has(lk) or not o[lk] is Dictionary: continue
		var L: Dictionary = d.looks[lk]
		var e: Dictionary = o[lk]
		if e.get("mats") is Dictionary:
			for m in L.mats:
				var me = e.mats.get(m.src)
				if not me is Dictionary: continue
				if me.has("albedo"): m.albedo = me.albedo
				if me.get("cel") is Dictionary:
					if not m.get("cel") is Dictionary: m.cel = {}
					for ck in me.cel: m.cel[ck] = me.cel[ck]
		if e.get("meta") is Dictionary:
			for cn in e.meta: if L.meta.has(cn) and e.meta[cn] is Dictionary: for mk in e.meta[cn]: L.meta[cn][mk] = e.meta[cn][mk]
		if e.get("sim") is Dictionary and e.sim.get("chains") is Dictionary and L.get("sim") is Dictionary:
			for ci in e.sim.chains:
				var i := int(ci)
				if i >= 0 and i < L.sim.chains.size(): for pk in e.sim.chains[ci]: L.sim.chains[i][pk] = e.sim.chains[ci][pk]
		if e.get("clips") is Dictionary: L["clips_override"] = e.clips

# keyframes from the editor replace a clip's rotation track for a bone (once per look)
static var _clips_done := {}
func _clip_overrides(d: Dictionary) -> void:
	var co = d.get("clips_override")
	if not co is Dictionary or _clips_done.has(look): return
	_clips_done[look] = true
	for cn in co:
		if not anims.has(cn) or not co[cn] is Dictionary or not co[cn].get("tracks") is Dictionary: continue
		var A: Animation = anims[cn]
		for bn in co[cn].tracks:
			var tr = co[cn].tracks[bn]
			if not tr is Dictionary or not tr.get("t") is Array or not tr.get("q") is Array: continue
			var ti := -1
			for t in A.get_track_count():
				if A.track_get_type(t) == Animation.TYPE_ROTATION_3D and String(A.track_get_path(t).get_concatenated_subnames()) == bn: ti = t
			if ti < 0:
				ti = A.add_track(Animation.TYPE_ROTATION_3D)
				A.track_set_path(ti, NodePath(String(A.track_get_path(0).get_concatenated_names()) + ":" + bn))
			while A.track_get_key_count(ti) > 0: A.track_remove_key(ti, 0)
			for k in mini(tr.t.size(), tr.q.size()):
				var v: Array = tr.q[k]
				A.rotation_track_insert_key(ti, float(tr.t[k]), Quaternion(v[0], v[1], v[2], v[3]))

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
	_clip_overrides(d)
	for i in skel.get_bone_count():
		bones[skel.get_bone_name(i)] = i
		rest_q.append(skel.get_bone_rest(i).basis.get_rotation_quaternion())
		rest_pos.append(skel.get_bone_rest(i).origin)
		rest_w.append(skel.get_bone_global_rest(i).basis.get_rotation_quaternion().inverse())
		ax_x.append((rest_w[i] * Vector3.RIGHT).normalized())
		ax_y.append((rest_w[i] * Vector3.UP).normalized())
		ax_z.append((rest_w[i] * Vector3.BACK).normalized())
	q.resize(skel.get_bone_count())
	for i in skel.get_bone_count(): q[i] = rest_q[i]
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
			"LThigh", "RThigh", "LLeg", "RLeg", "LFoot", "RFoot", "Waist", "Hips", "LHand", "RHand", "LToe", "RToe", "FJlipL",
			"LFingerB1", "LFingerB2", "LFingerB3", "LFingerC1", "LFingerC2", "LFingerC3", "LFingerD1", "LFingerD2", "LFingerD3",
			"RFingerB1", "RFingerB2", "RFingerB3", "RFingerC1", "RFingerC2", "RFingerC3", "RFingerD1", "RFingerD2", "RFingerD3"]:
		if bones.has(n): u[bones[n]] = true
	for bi in u: used.append(bi)
	for an in anims:
		var arr := PackedInt32Array()
		for bi in used: arr.append(rot_tr[an].get(bi, -1))
		trk[an] = arr
	_materials(root, d.mats)
	add_to_group("characters")   # for the ink pass: meshes in .meshes, opt-outs in meta "no_ink"
	idle_t = _rng.randf() * float(anims.idle.length)
	blink = 2.0 + _rng.randf() * 3.0
	L = {"t": _rng.randf() * 20.0, "yaw": 0.0, "pitch": 0.0, "vy": 0.0, "vp": 0.0, "ty": 0.0, "tp": 0.0,
		"look": 2.0 + _rng.randf() * 3.0, "side": -1.0 if _rng.randf() < 0.5 else 1.0, "cp": 0.0, "swap": 15.0 + _rng.randf() * 15.0}
	L.cp = L.side
	idles = IdleActions.new(self, look != "ash", look == "ash")
	cloth = ClothSim.make(self)

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
				m.set_shader_parameter("albedo", Color(info.albedo) if info.get("albedo") is String else src.albedo_color)   # (the world editor's tint)
				if src.albedo_texture:
					m.set_shader_parameter("albedo_tex", src.albedo_texture)
					m.set_shader_parameter("use_tex", true)
			m.set_shader_parameter("use_vc", info.get("vc", false))
			if float(info.get("alpha", 0.0)) > 0.0: m.set_shader_parameter("alpha_scissor", float(info.alpha))
			# the eye patch fills a hole in the face (no offset); the logo lies on the cap
			if info.get("decal", false) and not info.get("eyes", false): m.set_shader_parameter("lift", 0.002)
			var cel = info.get("cel")
			if cel is Dictionary:
				for key in [["bands", "bands"], ["deep", "deep"], ["shade", "shade"], ["lit", "lit"], ["litAdd", "lit_add"]]:
					if cel.has(key[0]):
						var v: Array = cel[key[0]]
						m.set_shader_parameter(key[1], Vector3(v[0], v[1], v[2]))
			if info.get("eyes", false): eyes = m
			mat_src[m] = String(info.get("src", nm)) + ("|eyes" if info.get("eyes", false) else "")
			if not info.get("shadow", true): shadow = false
			# ink lines: the web leaves the logo out (outline: false); the eye patch draws with the face
			if not info.get("ink", true): m3.set_meta("no_ink", true)
			if info.get("eyes", false): m3.set_meta("ink_group", "face")
			made[nm] = m
			m3.set_surface_override_material(s, m)
		if not shadow: m3.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

# ---------- helpers ----------
static func _sm(a: float, b: float, x: float) -> float:
	var t := clampf((x - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

# rotate a bone about an axis given in the model's rest frame, on top of what it has
func bend(n: String, x: float, y: float, z: float, a: float) -> void:
	if a == 0.0: return
	var bi: int = bones.get(n, -1)
	if bi < 0: return
	var axis: Vector3 = ax_x[bi] if x != 0.0 else (ax_y[bi] if y != 0.0 else ax_z[bi])
	q[bi] = q[bi] * Quaternion(axis, a)

# the same, on top of the rest pose
func pose(n: String, turns: Array) -> void:
	var bi: int = bones.get(n, -1)
	if bi < 0: return
	var r := rest_q[bi]
	for t in turns:
		if t[3] == 0.0: continue
		r = r * Quaternion(ax_x[bi] if t[0] != 0 else (ax_y[bi] if t[1] != 0 else ax_z[bi]), t[3])
	q[bi] = r

# ---------- the frame ----------
func animate(dt: float, speed: float, air: bool) -> void:
	_clips(dt, speed, air)
	_head_look(dt)
	for bi in used: skel.set_bone_pose_rotation(bi, q[bi])
	if cloth:
		var t0 := Time.get_ticks_usec()
		if cloth_far: cloth.hold()
		else: cloth.update(dt, speed, cloth_rate)
		sim_cost_us = Time.get_ticks_usec() - t0
	_blink(dt)

func _clips(dt: float, speed: float, air: bool) -> void:
	var dW: float = anims.walk.length
	var dR: float = anims.run.length
	var loco := _sm(0.05, 0.7, speed)
	var rb := _sm(walk_v * 1.05, walk_v + (run_v - walk_v) * 0.7, speed)
	var tw := {"idle": 1.0 - loco, "walk": loco * (1.0 - rb), "run": loco * rb}
	var e := 1.0 - exp(-dt * 10.0)
	for n in tw: w[n] += (tw[n] - w[n]) * e
	var sw: float = float(meta.walk.stride)
	var sr: float = float(meta.run.stride)
	var stride := lerpf(sw, sr, w.run / maxf(1e-3, w.walk + w.run)) * k
	var tempo := lerpf(1.0 / dW, 1.0 / dR, rb)
	var cad := lerpf(cad_walk, cad_run, rb)
	gait = clampf(maxf(speed, 0.8) / (cad * stride), 0.35, 1.0) if cad > 0.0 else 1.0
	if not air: phase = fmod(phase + dt * minf(maxf(speed, 0.8) / (stride * gait), tempo * TEMPO_MAX), 1.0)
	# a foot comes down at phase 0 (the left, as the clip's lead) and at 0.5 (the right)
	var half := int(phase * 2.0)
	if half != _half:
		_half = half
		if speed > 0.3 and not air: steps += 1
	idle_t = fmod(idle_t + dt, float(anims.idle.length))
	var times := {"idle": idle_t, "walk": fmod(phase + float(meta.walk.lead), 1.0) * dW, "run": fmod(phase + float(meta.run.lead), 1.0) * dR}
	# blended clip pose (weights add to one; a clip without a track holds the rest pose)
	var wi: float = w.idle
	var ww: float = w.walk
	var wr: float = w.run
	var Ai: Animation = anims.idle
	var Aw: Animation = anims.walk
	var Ar: Animation = anims.run
	var ti: float = times.idle
	var tw2: float = times.walk
	var tr2: float = times.run
	var ki: PackedInt32Array = trk.idle
	var kw: PackedInt32Array = trk.walk
	var kr: PackedInt32Array = trk.run
	for j in used.size():
		var bi := used[j]
		var rq := rest_q[bi]
		var acc := Quaternion(0, 0, 0, 0)
		if wi > 0.001:
			acc = (Ai.rotation_track_interpolate(ki[j], ti) if ki[j] >= 0 else rq) * wi
		var still: Quaternion = (Ai.rotation_track_interpolate(ki[j], ti) if ki[j] >= 0 else rq) if gait < 1.0 else rq
		if ww > 0.001:
			var r: Quaternion = Aw.rotation_track_interpolate(kw[j], tw2) if kw[j] >= 0 else rq
			if gait < 1.0: r = still.slerp(r, gait)
			if acc.dot(r) < 0.0: r = -r
			acc += r * ww
		if wr > 0.001:
			var r2: Quaternion = Ar.rotation_track_interpolate(kr[j], tr2) if kr[j] >= 0 else rq
			if gait < 1.0: r2 = still.slerp(r2, gait)
			if acc.dot(r2) < 0.0: r2 = -r2
			acc += r2 * wr
		q[bi] = acc.normalized() if acc.length_squared() > 1e-8 else rq
	if waist >= 0:
		var p := Vector3.ZERO
		var sum := 0.0
		for an in w:
			var wt: float = w[an]
			if wt < 0.001: continue
			var tr: int = pos_tr[an]
			var wp: Vector3 = anims[an].position_track_interpolate(tr, times[an]) if tr >= 0 else rest_waist
			if an != "idle" and gait < 1.0:
				var ip: Vector3 = anims.idle.position_track_interpolate(pos_tr.idle, times.idle) if pos_tr.idle >= 0 else rest_waist
				wp = ip.lerp(wp, gait)
			p += wp * wt
			sum += wt
		waist_pos = p / maxf(sum, 1e-4)
		skel.set_bone_pose_position(waist, waist_pos)
	# a sprint past the run clip's own speed leans into it
	var lean := _sm(run_v * 1.1, run_v * 1.8, speed) * (1.0 - air_w)
	if lean > 0.001:
		bend("Spine2", 1, 0, 0, lean * 0.14); bend("Spine3", 1, 0, 0, lean * 0.07); bend("Head", 1, 0, 0, -lean * 0.12)
	_idle_life(dt, w.idle * (1.0 - air_w), (w.idle + w.walk * 0.6) * (1.0 - air_w))
	# feet a little apart at a walk, soles flat; arms a touch out from the sides
	var wwk: float = w.walk * (1.0 - air_w)
	if wwk > 0.001:
		for s in [["L", 1.0], ["R", -1.0]]:
			bend(s[0] + "Thigh", 0, 0, 1, s[1] * 0.05 * wwk); bend(s[0] + "Foot", 0, 0, 1, -s[1] * 0.05 * wwk)
	var wa: float = (w.walk * 0.06 + w.run * 0.08) * (1.0 - air_w)
	if wa > 0.001:
		for s in [["L", 1.0], ["R", -1.0]]: bend(s[0] + "ArmA", 0, 0, 1, s[1] * wa)
	if tired > 0.001: _tired(speed)
	_jump(dt, speed, air)
	idles.post(dt)

# a bone's transform in the skeleton's space, from the pose being built this frame
func gxf(bi: int) -> Transform3D:
	var chain := PackedInt32Array()
	var b := bi
	while b >= 0:
		chain.append(b); b = skel.get_bone_parent(b)
	var t := Transform3D.IDENTITY
	for j in range(chain.size() - 1, -1, -1):
		var c := chain[j]
		t = t * Transform3D(Basis(q[c]), waist_pos if c == waist else rest_pos[c])
	return t

# ---------- life on top of the idle clip ----------
func _idle_life(dt: float, wI: float, wP: float) -> void:
	L.t += dt
	idles.update(dt, wI)
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
	if not idles.busy and L.swap < 0.0:
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

# ---------- worn out: hunched, panting (body.gd sets tired) ----------
func _tired(_speed: float) -> void:
	var tk := tired * (1.0 - air_w)
	var st: float = w.idle   # standing: bent over further, hands toward the knees
	var pant := sin(L.t * 9.0)
	bend("Spine1", 1, 0, 0, (0.04 + 0.06 * st) * tk)
	bend("Spine2", 1, 0, 0, (0.08 + 0.12 * st) * tk + pant * 0.035 * tk)
	bend("Spine3", 1, 0, 0, (0.04 + 0.06 * st) * tk + pant * 0.02 * tk)
	bend("Neck", 1, 0, 0, -(0.10 + 0.12 * st) * tk)
	bend("Head", 1, 0, 0, -(0.06 + 0.08 * st) * tk - pant * 0.02 * tk)
	for s in [["L", 1.0], ["R", -1.0]]:
		bend(s[0] + "Shoulder", 0, 0, 1, -s[1] * (0.06 + pant * 0.025) * tk)
		# standing: the arms hang forward, the hands near the knees
		bend(s[0] + "ArmA", 1, 0, 0, -0.30 * st * tk)
		bend(s[0] + "ArmA", 0, 0, 1, s[1] * 0.10 * st * tk)
		bend(s[0] + "ForeArm", 0, 1, 0, -s[1] * 0.25 * st * tk)
		bend(s[0] + "Thigh", 1, 0, 0, -0.14 * st * tk)
		bend(s[0] + "Leg", 1, 0, 0, 0.24 * st * tk)
		bend(s[0] + "Foot", 1, 0, 0, -0.10 * st * tk)

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
	var y := position.y
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
var _shut := false
func _blink(dt: float) -> void:
	blink -= dt
	if eyes:
		var shut: bool = blink < 0.0 or idles.eyes
		if shut != _shut:
			_shut = shut
			eyes.set_shader_parameter("uv_off", Vector2(0.5 if shut else 0.0, 0.0))
	if blink < -0.12: blink = 2.0 + _rng.randf() * 4.0
