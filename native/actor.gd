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
# hurt (body.gd, the "scraped" condition): 0..1, favouring the right leg as he walks
var limp := 0.0
# cloth and hair: the garments' cloth bones and the hair chains, simulated (cloth.gd)
var cloth: ClothSim
var cloth_far := false      # set by the owner: far off, the cloth just hangs
var cloth_rate := 60.0      # sim steps a second (fewer further off: the bones then move only with them)
var sim_cost_us := 0.0      # the last frame's sim time (dev)
# the ground's height under a point (x, z, world): set by the owner (the player's: the
# world's terrain); unset, the ground is level at the actor's own height
var ground: Callable
# on a bicycle (bike/rider.gd): the riding pose goes on top of the idle clip; the
# speed given to animate() then moves only the cloth's air
var rider: BikeRider = null
# crouching (cast.gd sets crouch for Ash): 0 / 1 wanted; crouch_w is the eased weight
# of the crouch layer (the sneak gait and the crouched idle, _crouch below)
var crouch := 0.0
var crouch_w := 0.0
var _crouch_v := 0.0
var CR := {}                # its numbers (CROUCH, with the world editor's tunables over them)
var _cr := {"look": 0.0, "lv": 0.0, "lt": 1.5, "lgoal": 0.0, "shift": 0.0, "sv": 0.0, "side": 1.0, "swap": 4.0,
	"peek": -1.0, "t": 0.0, "pitch": 0.0, "pv": 0.0, "pgoal": 0.0}

var phase := 0.0
var steps := 0              # feet put down so far (sfx_world.gd: one footstep sound each)
var _half := 0
var idle_t := 0.0
var w := {"idle": 1.0, "walk": 0.0, "run": 0.0}
var blink := 2.0
var look_yaw := NAN
# talking (conversation.gd): mouth 0..1 opens the jaw (FJlipL) while a line types
# out, nod adds a head pitch (radians, + = down), look_pitch tilts the head toward
# whoever they're facing (+ = up)
var mouth := 0.0
var nod := 0.0
var look_pitch := 0.0
var _mouth := 0.0
var _lpitch := 0.0
var _look_y := 0.0
var _rng := RandomNumberGenerator.new()
# life (idleLife in actor.js)
var L := {}
# jump
var air_w := 0.0
var was_air := false
var jump := {"t": 0.0, "vy": 0.0, "y": NAN, "run": 0.0, "lead": 0, "impact": 0.0, "land": 1.0, "kind": "jump", "var": "", "ld": "",
	"y0": 0.0, "top": 0.0, "vy0": 0.0, "air_t": 0.6, "spin": 0.0, "sa": 0.0}

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
	var riding := rider != null and rider.on > 0.001
	_clips(dt, 0.0 if riding else speed, air and not riding)
	if riding: rider.apply(dt)
	_head_look(dt)
	_talk_face(dt)
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
	# the crouch: eased in and out (a critically damped spring), and its own step rate
	var cs := Creature.spring(Vector2(crouch_w, _crouch_v), clampf(crouch, 0.0, 1.0), float(_crn("ease", 9.0)), dt)
	crouch_w = clampf(cs.x, 0.0, 1.0); _crouch_v = cs.y
	if crouch_w < 0.001 and crouch <= 0.0: crouch_w = 0.0; _crouch_v = 0.0
	var rate := minf(maxf(speed, 0.8) / (stride * gait), tempo * TEMPO_MAX)
	if crouch_w > 0.0: rate = lerpf(rate, crouch_rate(speed), _sm(0.0, 0.6, crouch_w))
	if not air: phase = fmod(phase + dt * rate, 1.0)
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
	var ncw := 1.0 - crouch_w   # (crouched: the crouch layer has the idle's place)
	_idle_life(dt, w.idle * (1.0 - air_w) * ncw, (w.idle + w.walk * 0.6) * (1.0 - air_w) * ncw)
	# feet a little apart at a walk, soles flat; arms a touch out from the sides
	var wwk: float = w.walk * (1.0 - air_w)
	if wwk > 0.001:
		for s in [["L", 1.0], ["R", -1.0]]:
			bend(s[0] + "Thigh", 0, 0, 1, s[1] * 0.05 * wwk); bend(s[0] + "Foot", 0, 0, 1, -s[1] * 0.05 * wwk)
	var wa: float = (w.walk * 0.06 + w.run * 0.08) * (1.0 - air_w)
	if wa > 0.001:
		for s in [["L", 1.0], ["R", -1.0]]: bend(s[0] + "ArmA", 0, 0, 1, s[1] * wa)
	if tired > 0.001: _tired(speed)
	if limp > 0.001: _limp()
	_jump(dt, speed, air)
	if crouch_w > 0.0: _crouch(dt, speed)
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
# the limp: on the sore right leg's step (phase 0.5 .. 1) he lurches onto it and off
# again quickly: the trunk tips to the left over the good leg, the hip drops, the
# sore knee kept stiffer, the head bobbing down with the hitch
func _limp() -> void:
	var lk := limp * clampf(w.walk + w.run * 0.7, 0.0, 1.0) * (1.0 - air_w)
	if lk < 0.001: return
	var sore := maxf(0.0, sin((phase - 0.5) * TAU))   # the right foot's stance
	var good := maxf(0.0, sin(phase * TAU))
	bend("Spine1", 0, 0, 1, (0.1 * sore - 0.03 * good) * lk)
	bend("Spine2", 0, 0, 1, 0.05 * sore * lk)
	bend("Hips", 0, 0, 1, -0.07 * sore * lk)
	bend("RLeg", 1, 0, 0, -0.18 * sore * lk)
	bend("Head", 1, 0, 0, 0.08 * sore * lk)
	bend("Spine2", 1, 0, 0, 0.06 * lk)

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
# All posed from the tables below. A pose is a dict of channels (missing ones take
# JDEF's value); the per-side ones are [lead, trail]: the leg that pushes off or leads
# (and the arm on its side), then the other. Angles in radians:
#   th thigh pitch (- = forward / up)   ta thigh out to the side   kn knee bend
#   ft foot pitch (+ = toe down; -(th + kn) keeps the sole flat)
#   sw arm swing (- = forward, -PI = straight up)   ab arm out from the side (PI/2 = level)
#   tz upper arm twist (- turns the elbow's bend upward)   el elbow bend   fs fist (0..1)
#   sp / ch chest pitch (Spine2 / Spine3, + = forward)   tw torso twist toward the lead side
#   rl torso lean toward the lead side   hd head pitch (- = up)   hr head tilt
#   wp / wr the whole body's pitch (+ = forward) / roll toward the lead side, at the waist
# A jump picks a variant (JSETS: standing, running, a ledge hop, stepping off a drop),
# never the one it had last time, and blends its poses: crouch (the anticipation, feet
# kept on the ground) -> push (the take-off) -> rise -> top (the apex) -> fall, by
# time and the vertical speed; "spin" turns him round in the air. A long fall flails
# (JFLAIL). The landing (LANDS: by the drop from the apex and the speed) plays a
# timeline of [u, pose, weight, {channel overrides}] keys over its duration.
const JDEF := {"th": [0.0, 0.0], "ta": [0.04, 0.04], "kn": [0.0, 0.0], "ft": [0.0, 0.0], "sw": [0.0, 0.0], "ab": [0.2, 0.2], "tz": [0.0, 0.0],
	"el": [0.3, 0.3], "fs": [0.0, 0.0], "sp": 0.0, "ch": 0.0, "tw": 0.0, "rl": 0.0, "hd": 0.0, "hr": 0.0, "wp": 0.0, "wr": 0.0}
const JP := {
	# anticipation: knees bent, arms swung back, chest over the knees
	"crouch": {"th": [-0.95, -0.9], "kn": [1.75, 1.7], "ft": [-0.8, -0.8], "sw": [0.85, 0.8], "ab": [0.3, 0.3], "el": [0.35, 0.35], "sp": 0.4, "ch": 0.15, "hd": -0.35, "wp": 0.12},
	"crouch_run": {"th": [-0.6, 0.15], "kn": [1.05, 0.9], "ft": [-0.45, -0.2], "sw": [0.7, -0.7], "ab": [0.25, 0.25], "el": [0.5, 0.9], "sp": 0.3, "ch": 0.1, "hd": -0.25, "wp": 0.12},
	# take-offs: everything extends, toes last off the ground
	"push": {"th": [0.05, 0.08], "kn": [0.1, 0.1], "ft": [0.7, 0.7], "sw": [-2.3, -2.2], "ab": [0.45, 0.45], "el": [0.3, 0.3], "sp": -0.08, "ch": -0.05, "hd": -0.2, "wp": -0.04},
	"push_run": {"th": [-0.7, 0.35], "kn": [0.7, 0.2], "ft": [0.3, 0.75], "sw": [0.7, -1.3], "ab": [0.3, 0.3], "el": [0.6, 1.1], "sp": 0.08, "hd": -0.15, "tw": -0.12},
	# standing: a tuck
	"tuck_rise": {"th": [-1.55, -1.5], "kn": [2.1, 2.05], "ft": [0.4, 0.4], "sw": [-0.95, -0.9], "ab": [0.45, 0.45], "el": [1.35, 1.3], "fs": [0.8, 0.8], "sp": 0.28, "ch": 0.12, "hd": 0.05},
	"tuck_top": {"th": [-1.75, -1.7], "kn": [2.3, 2.25], "ft": [0.5, 0.5], "sw": [-0.8, -0.75], "ab": [0.55, 0.55], "el": [1.6, 1.55], "fs": [1.0, 1.0], "sp": 0.35, "ch": 0.15, "hd": 0.12},
	"tuck_fall": {"th": [-0.45, -0.3], "kn": [0.6, 0.5], "ft": [0.1, 0.1], "sw": [-0.4, -0.3], "ab": [1.0, 1.05], "el": [0.45, 0.4], "sp": 0.05, "hd": 0.08},
	# standing: one knee up, the other leg hanging, the arms opposite
	"knee_rise": {"th": [-1.45, 0.12], "kn": [1.95, 0.55], "ft": [0.45, 0.6], "sw": [0.75, -1.1], "ab": [0.5, 0.35], "el": [0.5, 0.8], "fs": [0.6, 0.8], "sp": 0.06, "tw": -0.2, "rl": 0.06, "hd": -0.15},
	"knee_top": {"th": [-1.6, 0.2], "kn": [2.05, 0.8], "ft": [0.5, 0.65], "sw": [0.95, -1.35], "ab": [0.6, 0.4], "el": [0.45, 0.7], "fs": [0.7, 1.0], "sp": 0.04, "tw": -0.26, "rl": 0.08, "hd": -0.22},
	"knee_fall": {"th": [-0.6, -0.15], "kn": [0.75, 0.45], "ft": [0.15, 0.2], "sw": [0.1, -0.5], "ab": [0.9, 0.8], "el": [0.5, 0.6], "sp": 0.06, "tw": -0.06, "hd": 0.04},
	# standing: arms flung up in a V, heels kicked back to the seat, back arched
	"cheer_rise": {"th": [0.15, 0.2], "kn": [1.3, 1.25], "ft": [0.7, 0.7], "sw": [-0.4, -0.35], "ab": [2.2, 2.15], "el": [0.3, 0.3], "fs": [0.2, 0.2], "sp": -0.15, "ch": -0.1, "hd": -0.35, "wp": -0.06},
	"cheer_top": {"th": [0.3, 0.35], "kn": [1.85, 1.8], "ft": [0.8, 0.8], "sw": [-0.3, -0.25], "ab": [2.55, 2.5], "el": [0.15, 0.15], "fs": [0.0, 0.0], "sp": -0.25, "ch": -0.15, "hd": -0.45, "wp": -0.1, "hr": 0.1},
	"cheer_fall": {"th": [-0.35, -0.25], "kn": [0.6, 0.5], "ft": [0.15, 0.15], "sw": [-0.3, -0.25], "ab": [1.5, 1.45], "el": [0.4, 0.4], "sp": 0.0, "hd": -0.1},
	# standing: the excited fist pump, one fist punched at the sky, the other pulled down
	"pump_rise": {"th": [-1.1, 0.3], "kn": [1.6, 1.5], "ft": [0.4, 0.65], "sw": [-2.5, 0.15], "ab": [0.2, 0.45], "el": [0.5, 1.7], "fs": [1.0, 1.0], "sp": -0.1, "ch": -0.06, "tw": 0.12, "rl": -0.08, "hd": -0.45},
	"pump_top": {"th": [-1.3, 0.4], "kn": [1.85, 1.9], "ft": [0.5, 0.7], "sw": [-2.95, 0.25], "ab": [0.12, 0.5], "el": [0.12, 1.95], "fs": [1.0, 1.0], "sp": -0.16, "ch": -0.1, "tw": 0.15, "rl": -0.12, "hd": -0.55, "hr": -0.1},
	"pump_fall": {"th": [-0.5, -0.2], "kn": [0.7, 0.5], "ft": [0.15, 0.2], "sw": [-1.2, -0.2], "ab": [0.6, 0.7], "el": [0.8, 0.9], "fs": [1.0, 1.0], "sp": 0.02, "hd": -0.15},
	# standing: a spin, arms pulled in, then flung out
	"spin_rise": {"th": [-0.25, -0.2], "kn": [0.6, 0.55], "ft": [0.6, 0.6], "sw": [-0.7, -0.7], "ab": [0.25, 0.25], "el": [1.9, 1.9], "fs": [0.6, 0.6], "sp": -0.04, "hd": -0.1},
	"spin_top": {"th": [-0.6, 0.05], "kn": [1.1, 0.7], "ft": [0.5, 0.6], "sw": [-0.3, -0.5], "ab": [2.15, 1.5], "el": [0.35, 0.7], "sp": -0.1, "hd": -0.25},
	"spin_fall": {"th": [-0.4, -0.25], "kn": [0.6, 0.5], "ft": [0.15, 0.15], "sw": [-0.2, -0.2], "ab": [1.3, 1.25], "el": [0.4, 0.4], "sp": 0.04, "hd": 0.0},
	# running: a stride, the legs split, the arms swinging opposite
	"stride_rise": {"th": [-1.25, 0.55], "kn": [1.0, 1.05], "ft": [0.25, 0.65], "sw": [0.85, -1.35], "ab": [0.3, 0.3], "el": [0.65, 1.15], "fs": [0.5, 0.5], "sp": 0.16, "tw": -0.18, "hd": -0.08},
	"stride_top": {"th": [-1.35, 0.65], "kn": [0.9, 1.25], "ft": [0.2, 0.7], "sw": [0.95, -1.5], "ab": [0.35, 0.35], "el": [0.6, 1.2], "fs": [0.6, 0.6], "sp": 0.14, "tw": -0.2, "hd": -0.1},
	"stride_fall": {"th": [-0.95, 0.3], "kn": [0.55, 0.85], "ft": [0.05, 0.4], "sw": [0.4, -0.7], "ab": [0.5, 0.45], "el": [0.6, 0.9], "sp": 0.1, "tw": -0.08, "hd": 0.0},
	# running: a big split leap, legs straight, one arm reaching on ahead
	"leap_rise": {"th": [-1.35, 0.85], "kn": [0.3, 0.45], "ft": [0.45, 0.8], "sw": [0.4, -2.1], "ab": [0.9, 0.4], "el": [0.35, 0.3], "sp": 0.0, "ch": -0.08, "tw": -0.1, "hd": -0.3, "wp": -0.04},
	"leap_top": {"th": [-1.5, 1.0], "kn": [0.12, 0.25], "ft": [0.55, 0.85], "sw": [0.5, -2.5], "ab": [1.1, 0.35], "el": [0.2, 0.15], "sp": -0.05, "ch": -0.1, "tw": -0.12, "hd": -0.4, "wp": -0.06},
	"leap_fall": {"th": [-1.0, 0.45], "kn": [0.35, 0.7], "ft": [0.1, 0.5], "sw": [0.1, -1.1], "ab": [1.0, 0.6], "el": [0.4, 0.4], "sp": 0.06, "hd": -0.1},
	# running: a hurdle, lead leg reaching ahead, the trailing knee out to the side
	"hurdle_rise": {"th": [-1.4, 0.0], "kn": [0.35, 1.7], "ta": [0.04, 0.75], "ft": [0.2, 0.6], "sw": [0.6, -1.7], "ab": [0.45, 0.3], "el": [0.8, 0.5], "fs": [0.4, 0.3], "sp": 0.4, "ch": 0.15, "tw": -0.22, "hd": -0.3},
	"hurdle_top": {"th": [-1.5, -0.1], "kn": [0.2, 1.85], "ta": [0.04, 0.9], "ft": [0.2, 0.6], "sw": [0.7, -1.9], "ab": [0.5, 0.3], "el": [0.75, 0.4], "fs": [0.4, 0.3], "sp": 0.45, "ch": 0.18, "tw": -0.26, "hd": -0.35},
	"hurdle_fall": {"th": [-0.9, 0.0], "kn": [0.45, 1.0], "ta": [0.04, 0.3], "ft": [0.05, 0.35], "sw": [0.3, -0.8], "ab": [0.55, 0.45], "el": [0.6, 0.7], "sp": 0.15, "tw": -0.08, "hd": -0.05},
	# running: a bounding knee drive, the fist punched up and ahead
	"bound_rise": {"th": [-1.6, 0.5], "kn": [1.9, 0.35], "ft": [0.45, 0.8], "sw": [0.8, -2.3], "ab": [0.35, 0.2], "el": [0.9, 0.5], "fs": [1.0, 1.0], "sp": 0.0, "ch": -0.08, "tw": -0.22, "hd": -0.35},
	"bound_top": {"th": [-1.75, 0.6], "kn": [2.05, 0.45], "ft": [0.5, 0.85], "sw": [0.9, -2.6], "ab": [0.4, 0.15], "el": [0.85, 0.3], "fs": [1.0, 1.0], "sp": -0.05, "ch": -0.1, "tw": -0.25, "hd": -0.45},
	"bound_fall": {"th": [-0.9, 0.2], "kn": [0.8, 0.6], "ft": [0.1, 0.4], "sw": [0.35, -1.0], "ab": [0.5, 0.4], "el": [0.7, 0.8], "fs": [0.7, 0.7], "sp": 0.08, "tw": -0.08, "hd": -0.05},
	# hopping down a ledge: a little stride, the arms out for balance
	"hop_rise": {"th": [-0.9, 0.35], "kn": [0.9, 0.7], "ft": [0.25, 0.5], "sw": [0.3, -0.7], "ab": [1.25, 1.05], "el": [0.6, 0.7], "sp": 0.06, "hd": 0.1},
	"hop_fall": {"th": [-0.55, -0.15], "kn": [0.6, 0.5], "ft": [0.1, 0.2], "sw": [-0.1, -0.4], "ab": [1.45, 1.25], "el": [0.5, 0.6], "sp": 0.0, "hd": 0.12},
	# stepping off a drop: a startle (arms flung up, legs reaching down), then the fall
	"drop_top": {"th": [-0.75, 0.2], "kn": [0.9, 0.7], "ft": [0.3, 0.4], "sw": [-0.7, -0.6], "ab": [1.75, 1.7], "el": [0.5, 0.5], "sp": -0.05, "hd": 0.3, "wp": -0.05},
	"drop_fall": {"th": [-0.45, -0.1], "kn": [0.5, 0.4], "ft": [0.15, 0.2], "sw": [-0.3, -0.6], "ab": [2.3, 1.4], "el": [0.9, 0.6], "sp": -0.08, "hd": 0.2, "wp": -0.04},
	# landings
	"l_soft": {"th": [-0.3, -0.25], "kn": [0.6, 0.55], "ft": [-0.3, -0.3], "sw": [-0.25, -0.2], "ab": [0.4, 0.4], "el": [0.55, 0.5], "sp": 0.12, "hd": -0.08},
	"l_crouch": {"th": [-0.95, -0.85], "kn": [1.65, 1.55], "ft": [-0.7, -0.7], "sw": [-0.75, -0.7], "ab": [0.55, 0.55], "el": [0.55, 0.5], "sp": 0.38, "ch": 0.12, "hd": -0.35, "wp": 0.14},
	"l_wide": {"th": [-0.85, -0.6], "ta": [0.3, 0.3], "kn": [1.5, 1.3], "ft": [-0.65, -0.7], "sw": [-0.2, -0.15], "ab": [1.2, 1.15], "el": [0.35, 0.35], "sp": 0.3, "ch": 0.1, "rl": 0.08, "hd": -0.3, "wp": 0.1},
	"l_pop": {"th": [-0.08, -0.06], "kn": [0.15, 0.12], "ft": [0.05, 0.05], "sw": [-0.15, -0.1], "ab": [0.35, 0.35], "el": [0.45, 0.45], "sp": -0.06, "ch": -0.04, "hd": -0.12},
	# the three-point landing: lead foot planted, trailing knee down, a hand to the ground
	"l_heavy": {"th": [-1.45, -0.3], "kn": [2.35, 2.05], "ta": [0.12, 0.08], "ft": [-0.9, 0.35], "sw": [0.9, -0.55], "ab": [0.95, 0.35], "el": [0.45, 0.05], "fs": [0.7, 0.0], "sp": 0.5, "ch": 0.18, "tw": 0.12, "hd": -0.6, "wp": 0.3},
	"l_rise": {"th": [-0.5, -0.3], "kn": [0.85, 0.65], "ft": [-0.35, -0.35], "sw": [0.1, -0.2], "ab": [0.5, 0.45], "el": [0.5, 0.5], "sp": 0.2, "hd": -0.15, "wp": 0.05},
	# stumbling on: lurched forward, the arms flung ahead, then caught and thrown back
	"l_lurch": {"th": [-1.0, 0.35], "kn": [1.05, 0.65], "ft": [-0.2, 0.3], "sw": [-2.3, -1.2], "ab": [1.1, 0.8], "el": [0.4, 0.6], "sp": 0.6, "ch": 0.25, "tw": 0.15, "hd": -0.55, "wp": 0.4},
	"l_catch": {"th": [0.25, -0.75], "kn": [0.5, 1.1], "ft": [0.25, -0.3], "sw": [0.6, 0.3], "ab": [1.4, 1.3], "el": [0.3, 0.35], "sp": 0.15, "tw": -0.12, "hd": -0.2, "wp": 0.05, "rl": 0.08},
	# the roll: tucked into a ball, the chin on the chest
	"l_tuck": {"th": [-1.85, -1.8], "kn": [2.4, 2.35], "ft": [0.3, 0.3], "sw": [-0.9, -0.85], "ab": [0.35, 0.35], "el": [1.6, 1.6], "fs": [0.8, 0.8], "sp": 0.6, "ch": 0.3, "hd": 0.55},
}
# the variants: w (how often, against the others in its set), the poses of its phases,
# spin (turns in the air); and the sets they come from
const JV := {
	"tuck": {"w": 1.0, "crouch": "crouch", "push": "push", "rise": "tuck_rise", "top": "tuck_top", "fall": "tuck_fall"},
	"knee": {"w": 1.0, "crouch": "crouch", "push": "push", "rise": "knee_rise", "top": "knee_top", "fall": "knee_fall"},
	"cheer": {"w": 1.0, "crouch": "crouch", "push": "push", "rise": "cheer_rise", "top": "cheer_top", "fall": "cheer_fall"},
	"pump": {"w": 0.7, "crouch": "crouch", "push": "push", "rise": "pump_rise", "top": "pump_top", "fall": "pump_fall"},
	"spin": {"w": 0.4, "crouch": "crouch", "push": "push", "rise": "spin_rise", "top": "spin_top", "fall": "spin_fall", "spin": 1.0},
	"stride": {"w": 1.2, "crouch": "crouch_run", "push": "push_run", "rise": "stride_rise", "top": "stride_top", "fall": "stride_fall"},
	"leap": {"w": 1.0, "crouch": "crouch_run", "push": "push_run", "rise": "leap_rise", "top": "leap_top", "fall": "leap_fall"},
	"hurdle": {"w": 0.8, "crouch": "crouch_run", "push": "push_run", "rise": "hurdle_rise", "top": "hurdle_top", "fall": "hurdle_fall"},
	"bound": {"w": 0.8, "crouch": "crouch_run", "push": "push_run", "rise": "bound_rise", "top": "bound_top", "fall": "bound_fall"},
	"hop": {"w": 1.0, "push": "hop_rise", "rise": "hop_rise", "top": "hop_rise", "fall": "hop_fall"},
	"drop": {"w": 1.0, "push": "drop_top", "rise": "drop_top", "top": "drop_top", "fall": "drop_fall"},
}
const JSETS := {"stand": ["tuck", "knee", "cheer", "pump", "spin"], "run": ["stride", "leap", "hurdle", "bound"], "hop": ["hop"], "drop": ["drop"]}
# a long fall: the arms windmill, the legs pedal (amplitudes; rate in cycles a second)
const JFLAIL := {"rate": 2.6, "sw": 1.3, "ab": 1.5, "th": 0.55, "kn": 0.7, "vy0": -6.0, "vy1": -9.5}
# landings: picked by the drop (m, apex to ground); "run" when moving faster than RUN_FROM
const LANDS := [
	{"max": 0.45, "pick": ["soft"]},
	{"max": 1.5, "pick": ["land", "wide"]},
	{"max": 2.8, "pick": ["heavy"], "run": "stumble"},
	{"max": 1e9, "pick": ["heavy"], "run": "roll"},
]
const RUN_FROM := 3.5
# dur (s); keep: how much of it stays on at a run (the clip takes the rest)
const LAND := {
	"soft": {"dur": 0.24, "keep": 0.5, "keys": [[0.0, "l_soft", 0.0], [0.2, "l_soft", 1.0], [1.0, "l_soft", 0.0]]},
	"land": {"dur": 0.46, "keep": 0.5, "keys": [[0.0, "l_crouch", 0.0], [0.12, "l_crouch", 1.0], [0.5, "l_pop", 0.8], [1.0, "l_pop", 0.0]]},
	"wide": {"dur": 0.5, "keep": 0.5, "keys": [[0.0, "l_wide", 0.0], [0.12, "l_wide", 1.0], [0.3, "l_wide", 1.0], [0.62, "l_pop", 0.7], [1.0, "l_pop", 0.0]]},
	"heavy": {"dur": 0.95, "keep": 0.7, "keys": [[0.0, "l_heavy", 0.0], [0.07, "l_heavy", 1.0], [0.45, "l_heavy", 1.0], [0.75, "l_rise", 0.85], [1.0, "l_rise", 0.0]]},
	"stumble": {"dur": 0.75, "keep": 1.0, "keys": [[0.0, "l_crouch", 0.0], [0.08, "l_crouch", 1.0], [0.32, "l_lurch", 1.0], [0.6, "l_catch", 0.9], [1.0, "l_pop", 0.0]]},
	"roll": {"dur": 0.7, "keep": 1.0, "keys": [[0.0, "l_crouch", 0.0], [0.06, "l_crouch", 1.0], [0.18, "l_tuck", 1.0, {"wp": 1.0}], [0.62, "l_tuck", 1.0, {"wp": 1.0 + TAU}],
		[0.8, "l_rise", 1.0, {"wp": 0.1 + TAU}], [1.0, "l_pop", 0.0, {"wp": TAU}]]},
}
const JGRAV := 16.0      # cast.gd's gravity: the spin's timing from the take-off speed
const JUMP_BONES := ["Waist", "Spine1", "Spine2", "Spine3", "Head", "LThigh", "RThigh", "LLeg", "RLeg", "LFoot", "RFoot", "LArmA", "RArmA", "LForeArm", "RForeArm"]
const FIST := ["B", "C", "D"]
const LOW_PTS := [["LToe", 0.03], ["RToe", 0.03], ["LFoot", 0.083], ["RFoot", 0.083], ["LLeg", 0.06], ["RLeg", 0.06], ["LHand", 0.03], ["RHand", 0.03], ["Head", 0.13]]
static var _jn := {}
# dev: force every jump's variant / landing (dev/jump_shot.gd)
var jump_pick := ""
var land_pick := ""

static func _jpose(n: String) -> Dictionary:
	if not _jn.has(n):
		var o: Dictionary = JDEF.duplicate(true)
		for key in JP[n]: o[key] = JP[n][key]
		_jn[n] = o
	return _jn[n]

static func _jmix(a: Dictionary, b: Dictionary, u: float) -> Dictionary:
	if u <= 0.0: return a
	if u >= 1.0: return b
	var o := {}
	for key in a:
		if a[key] is Array: o[key] = [lerpf(a[key][0], b[key][0], u), lerpf(a[key][1], b[key][1], u)]
		else: o[key] = lerpf(a[key], b[key], u)
	return o

func _jump_pose(P: Dictionary, lead: int, spin: float) -> void:
	var sides := ["L", "R"] if lead == 0 else ["R", "L"]
	var ls := 1.0 if lead == 0 else -1.0     # + = toward the lead side
	for i in 2:
		var s: String = sides[i]
		var sg := 1.0 if s == "L" else -1.0
		pose(s + "Thigh", [[1, 0, 0, P.th[i]], [0, 0, 1, sg * P.ta[i]]])
		pose(s + "Leg", [[1, 0, 0, P.kn[i]]])
		pose(s + "Foot", [[1, 0, 0, P.ft[i]]])
		pose(s + "ArmA", [[1, 0, 0, P.sw[i]], [0, 0, 1, sg * P.ab[i]], [0, 0, 1, -sg * PI / 2.0], [1, 0, 0, P.tz[i]]])
		pose(s + "ForeArm", [[0, 1, 0, -sg * P.el[i]]])
	pose("Waist", [[0, 1, 0, spin], [1, 0, 0, P.wp], [0, 0, 1, -ls * P.wr]])
	pose("Spine1", [[0, 1, 0, ls * P.tw * 0.4], [0, 0, 1, -ls * P.rl * 0.5]])
	pose("Spine2", [[1, 0, 0, P.sp], [0, 1, 0, ls * P.tw * 0.6], [0, 0, 1, -ls * P.rl * 0.5]])
	pose("Spine3", [[1, 0, 0, P.ch]])
	pose("Head", [[1, 0, 0, P.hd], [0, 0, 1, -ls * P.hr]])

# the pose P over the bones as they are, by wt (and the fists closed by its fs)
func _jump_apply(P: Dictionary, wt: float, lead: int, spin := 0.0) -> void:
	if wt < 0.002: return
	var saved := []
	for n in JUMP_BONES: saved.append(q[bones[n]] if bones.has(n) else Quaternion())
	_jump_pose(P, lead, spin)
	for i in JUMP_BONES.size():
		var bi: int = bones.get(JUMP_BONES[i], -1)
		if bi >= 0: q[bi] = saved[i].slerp(q[bi], wt)
	for i in 2:
		var cu: float = P.fs[i] * wt
		if cu < 0.01: continue
		var s := ("L" if i == 0 else "R") if lead == 0 else ("R" if i == 0 else "L")
		var sg := 1.0 if s == "L" else -1.0
		for f in FIST:
			for j in range(1, 4): bend("%sFinger%s%d" % [s, f, j], 0, 0, 1, -sg * cu * (1.1 if j == 1 else 1.3))

# the lowest point of the body (feet, knees, hands, head; skeleton space)
func _low_pt() -> float:
	var lo := INF
	for p in LOW_PTS:
		var bi: int = bones.get(p[0], -1)
		if bi >= 0: lo = minf(lo, gxf(bi).origin.y - float(p[1]))
	return lo

func _jpick(set_name: String) -> String:
	if jump_pick != "" and JV.has(jump_pick): return jump_pick
	var names: Array = JSETS[set_name]
	var tot := 0.0
	for n in names: if n != jump.var or names.size() == 1: tot += float(JV[n].w)
	var r := _rng.randf() * tot
	for n in names:
		if n == jump.var and names.size() > 1: continue
		r -= float(JV[n].w)
		if r <= 0.0: return n
	return names[-1]

func _lpick(drop: float, speed: float) -> String:
	if land_pick != "" and LAND.has(land_pick): return land_pick
	for L in LANDS:
		if drop > float(L.max): continue
		if speed > RUN_FROM and L.has("run"): return L.run
		var p: Array = L.pick
		if p.size() == 1: return p[0]
		var c: String = p[_rng.randi() % p.size()]
		return c if c != jump.ld else p[(p.find(c) + 1) % p.size()]
	return "land"

# the landing's timeline at u: [pose, weight]
func _land_at(u: float) -> Array:
	var K: Array = LAND[jump.ld].keys
	for i in range(1, K.size()):
		if u > float(K[i][0]) and i < K.size() - 1: continue
		var a: Array = K[i - 1]
		var b: Array = K[i]
		var f := _sm(float(a[0]), float(b[0]), u)
		var P := _jmix(_jpose(a[1]), _jpose(b[1]), f)
		if a.size() > 3 or b.size() > 3:
			P = P.duplicate()
			for key in ["wp"]:
				var va: float = a[3].get(key, _jpose(a[1])[key]) if a.size() > 3 else _jpose(a[1])[key]
				var vb: float = b[3].get(key, _jpose(b[1])[key]) if b.size() > 3 else _jpose(b[1])[key]
				P[key] = lerpf(va, vb, f)
		return [P, lerpf(float(a[2]), float(b[2]), f)]
	return [_jpose(K[-1][1]), 0.0]

func _jump(dt: float, speed: float, air: bool) -> void:
	var y := position.y
	var raw: float = (y - float(jump.y)) / dt if not is_nan(jump.y) and dt > 0.0 else 0.0
	if not is_nan(jump.y) and dt > 0.0: jump.vy += (raw - jump.vy) * minf(1.0, dt * 30.0)
	jump.y = y
	if air and not was_air:
		jump.t = 0.0; jump.y0 = y; jump.top = y; jump.vy0 = raw
		jump.kind = "jump" if raw > 3.8 else ("hop" if raw > 1.0 else "drop")
		var running := speed > 2.0
		var st: String = jump.kind if jump.kind != "jump" else ("run" if running else "stand")
		jump.var = _jpick(st)
		jump.run = 1.0 if st == "run" else 0.0
		jump.lead = (0 if phase < 0.5 else 1) if speed > 0.8 else _rng.randi() % 2
		jump.spin = float(JV[jump.var].get("spin", 0.0)) * (1.0 if _rng.randf() < 0.5 else -1.0)
		jump.air_t = maxf(0.3, 2.0 * maxf(raw, 0.0) / JGRAV)
	if air: jump.top = maxf(jump.top, y)
	if not air and was_air:
		var drop: float = jump.top - y
		jump.ld = _lpick(drop, speed)
		jump.land = 0.0
		jump.impact = clampf(drop / 1.2, 0.35, 1.0)
	was_air = air
	# (a jump snaps into its crouch: the anticipation is only a few frames)
	air_w += ((1.0 if air else 0.0) - air_w) * (1.0 - exp(-dt * ((40.0 if jump.kind == "jump" else 18.0) if air else 12.0)))
	var landing: bool = jump.land < 1.0
	if air_w < 0.002 and not landing and absf(jump.sa) < 1e-4:
		holder.position.y = y0
		return
	var lo0 := _low_pt()
	var V: Dictionary = JV.get(jump.var, JV.tuck)
	var t: float = jump.t
	# the spin: through the air, and finished off quickly after a landing
	var full: float = jump.spin * TAU
	if air and full != 0.0: jump.sa = full * _sm(0.08, 0.9, t / jump.air_t)
	elif absf(jump.sa) > 0.0:
		jump.sa = move_toward(jump.sa, full, dt * 16.0)
		if absf(jump.sa - full) < 1e-4: jump.sa = 0.0; jump.spin = 0.0
	var plant := 0.0
	if air_w > 0.002:
		if air: jump.t += dt
		var jk: bool = jump.kind == "jump"
		var P: Dictionary
		if jk:
			P = _jmix(_jpose(V.crouch), _jpose(V.push), _sm(0.05, 0.12, t))
			P = _jmix(P, _jpose(V.rise), _sm(0.12, 0.26, t))
			plant = 1.0 - _sm(0.06, 0.13, t)
		else:
			P = _jmix(_jpose(V.push), _jpose(V.rise), _sm(0.0, 0.12, t))
		P = _jmix(P, _jpose(V.top), _sm(2.4, 0.2, jump.vy) * (_sm(0.14, 0.28, t) if jk else 1.0))
		P = _jmix(P, _jpose(V.fall), _sm(-0.2, -3.4, jump.vy))
		var fl := _sm(JFLAIL.vy0, JFLAIL.vy1, jump.vy)
		if fl > 0.001:
			P = P.duplicate(true)
			var ph: float = t * TAU * JFLAIL.rate
			for i in 2:
				var o := PI * i
				P.sw[i] += (sin(ph + o) * JFLAIL.sw - 0.6) * fl
				P.ab[i] += (JFLAIL.ab - P.ab[i] * 0.5) * fl
				P.th[i] += sin(ph * 0.8 + o) * JFLAIL.th * fl
				P.kn[i] += (0.5 + 0.5 * sin(ph * 0.8 + o + 1.2)) * JFLAIL.kn * fl
			P.hd += 0.2 * fl
		_jump_apply(P, air_w, jump.lead, jump.sa)
	elif jump.sa != 0.0:
		var bi: int = bones.get("Waist", -1)
		if bi >= 0: q[bi] = Quaternion(Vector3.UP, jump.sa) * q[bi]
	# the landing
	if landing:
		var D: Dictionary = LAND[jump.ld]
		jump.land = minf(1.0, jump.land + dt / (float(D.dur) * (0.8 + 0.3 * jump.impact)))
		var r := _land_at(jump.land)
		var lw: float = r[1] * (1.0 - air_w) * (1.0 - (1.0 - float(D.keep)) * _sm(2.0, WALK_V, speed))
		if jump.ld in ["soft", "land", "wide"]: lw *= 0.6 + 0.4 * jump.impact
		_jump_apply(r[0], lw, jump.lead, jump.sa)
	# the feet stay where the clips put them: on the ground through the anticipation and
	# the landing (the body comes down instead of the feet up), off it in the air
	var lo1 := _low_pt()
	var off := 0.0
	if not air: off = -(lo1 - lo0) * k
	elif plant > 0.0: off = ((float(jump.y0) - y) - (lo1 - lo0) * k) * plant
	holder.position.y = y0 + off

# ---------- crouching: the sneak and the crouched idle ----------
# Low, knees bent and a little out, the chest over the knees, the head up and
# forward, the arms in. Each leg is a two-bone IK (idles.gd _ik) to a foot the
# gait places: the stance carries the planted foot back at the body's own speed
# (so it never slides), the swing lifts it high and sets the ball of the foot
# down first, the heel peeling off at the end of the stance. Standing still the
# feet settle staggered, the weight shifts from leg to leg, the head scans, and
# now and then he rises a little to peek. Blended in by crouch_w: the feet go
# from where the clips put them to the crouch's spots, so they stay on the
# ground through the change. Skeleton space throughout (skel units = m / k).
const CROUCH := {
	"ease": 9.0,                 # the spring in and out (rad/s, critically damped)
	"hip_walk": 0.66,            # the hip's height above the ankle, as a part of the leg: sneaking
	"hip_idle": 0.53,            # and crouched still
	"cad0": 0.8, "cad1": 0.35,   # step cycles a second: cad0 + cad1 * speed (1.29 at 1.4 m/s)
	"stance": 0.62,              # the part of a cycle a foot is down
	"lift": 0.11,                # how high the swinging foot comes up (skel units)
	"width": 0.084,              # the feet from the middle (skel units)
	"bob": 0.011, "sway": 0.017, # the hips down at each footfall, and over the planted foot
	"lean": [0.32, 0.44, 0.15],  # Spine1..3 pitched forward, sneaking
	"lean_idle": [0.34, 0.44, 0.16],
	"hips": 0.34,                # the pelvis tipped forward
	"arm_walk": [-0.5, 0.26, 1.3, 0.14],   # upper arm swing (- forward), out from the side, elbow, swing amplitude
	"arm_idle": [-0.78, 0.34, 0.98, 0.0],
}
var _cg := {}   # the leg's geometry from the rest pose (once)

func _crn(key: String, d):
	if CR.is_empty():
		CR = CROUCH.duplicate(true)
		var o = preload("res://tunables.gd").dict("cast", "crouch", {})
		if o is Dictionary: for kk in o: CR[kk] = o[kk]
	return CR.get(key, d)

# step cycles a second while crouched (main.gd: the step rate is the actor's phase)
func crouch_rate(speed: float) -> float:
	return float(_crn("cad0", 0.8)) + float(_crn("cad1", 0.35)) * maxf(speed, 0.0)

func _crouch_geo() -> void:
	var g := func(n: String) -> Vector3: return skel.get_bone_global_rest(bones[n]).origin
	var th: Vector3 = g.call("LThigh")
	var kn: Vector3 = g.call("LLeg")
	var an: Vector3 = g.call("LFoot")
	_cg = {"thigh_y": th.y, "leg": th.distance_to(kn) + kn.distance_to(an), "ankle": an.y, "toe": g.call("LToe") - an,
		"fq": [skel.get_bone_global_rest(bones.LFoot).basis.get_rotation_quaternion(), skel.get_bone_global_rest(bones.RFoot).basis.get_rotation_quaternion()]}

# a foot through the sneak: (z forward of the hips, lift, pitch + = toe down), u the leg's
# own phase (0 = its foot comes down), ss the length of a cycle (skel units)
func _sneak_foot(u: float, ss: float) -> Vector3:
	var b := float(CR.stance)
	if u < b:
		var s := u / b
		return Vector3(ss * b * (0.5 - s), 0.0, 0.12 * (1.0 - _sm(0.0, 0.14, s)) + 0.3 * _sm(0.72, 1.0, s))
	var s2 := (u - b) / (1.0 - b)
	var z := ss * b * (_sm(0.0, 0.86, s2) - 0.5)
	var lift := float(CR.lift) * pow(sin(PI * clampf(s2 / 0.94, 0.0, 1.0)), 0.85)
	var p := lerpf(0.3, -0.2, _sm(0.0, 0.4, s2))
	p = lerpf(p, 0.12, _sm(0.62, 1.0, s2))
	return Vector3(z, lift, p)

const CROUCH_BONES := ["Waist", "Hips", "Spine1", "Spine2", "Spine3", "Neck", "Head", "LArmA", "RArmA", "LForeArm", "RForeArm"]
func _crouch(dt: float, speed: float) -> void:
	var W := crouch_w * (1.0 - air_w)
	if W < 0.002: return
	_crn("ease", 9.0)
	if _cg.is_empty(): _crouch_geo()
	var C := _cr
	C.t += dt
	var mv := _sm(0.12, 0.9, speed)
	var ph := phase
	var ss := speed / crouch_rate(speed) / k       # a cycle's length, skel units
	# the clips' feet (actor-local), their turn, which way their knees point
	var hp0 := holder.position
	var clip_f := []; var clip_q := []; var clip_p := []
	for s in ["L", "R"]:
		var tf := gxf(bones[s + "Thigh"]); var lf := gxf(bones[s + "Leg"]); var ff := gxf(bones[s + "Foot"])
		clip_f.append(hp0 + ff.origin * k)
		clip_q.append(ff.basis.get_rotation_quaternion())
		var kp := lf.origin - (tf.origin + ff.origin) * 0.5
		clip_p.append(kp.normalized() if kp.length() > 1e-4 else Vector3.BACK)
	# the head: scanning about (wider when still), and the weight from leg to leg
	C.lt -= dt
	if C.lt <= 0.0:
		C.lt = _rng.randf_range(1.2, 3.6)
		var wide := lerpf(0.75, 0.32, mv)
		C.lgoal = _rng.randf_range(-wide, wide) if _rng.randf() < 0.75 else 0.0
		C.pgoal = _rng.randf_range(-0.12, 0.06)
	var sp := Creature.spring(Vector2(C.look, C.lv), C.lgoal, 5.0, dt, 0.8)
	C.look = sp.x; C.lv = sp.y
	var pp := Creature.spring(Vector2(C.pitch, C.pv), C.pgoal, 4.0, dt)
	C.pitch = pp.x; C.pv = pp.y
	C.swap -= dt
	if C.swap <= 0.0:
		C.swap = _rng.randf_range(2.8, 6.0); C.side = -C.side
		if mv < 0.2 and C.peek < 0.0 and _rng.randf() < 0.35: C.peek = 0.0   # a peek over the grass
	var sh := Creature.spring(Vector2(C.shift, C.sv), C.side * (1.0 - mv), 3.0, dt)
	C.shift = sh.x; C.sv = sh.y
	var peek := 0.0
	if C.peek >= 0.0:
		C.peek += dt
		peek = _sm(0.0, 0.45, C.peek) * (1.0 - _sm(1.5, 2.1, C.peek)) * (1.0 - mv)
		if C.peek > 2.1: C.peek = -1.0
	# ---- the body: hips, spine, head, arms (posed, then blended in by W) ----
	var saved := []
	for n in CROUCH_BONES: saved.append(q[bones[n]] if bones.has(n) else Quaternion())
	var tw := cos(TAU * (ph - 0.31))     # + while the left foot carries him
	var br := sin(C.t * 2.1)
	var la: Array = CR.lean_idle; var lw: Array = CR.lean
	var l0 := lerpf(la[0], lw[0], mv) - peek * 0.08
	var l1 := lerpf(la[1], lw[1], mv) - peek * 0.1
	var l2 := lerpf(la[2], lw[2], mv)
	pose("Waist", [[0, 1, 0, -0.06 * tw * mv], [0, 0, 1, 0.025 * tw * mv - 0.03 * C.shift]])
	pose("Hips", [[1, 0, 0, float(CR.hips) * (1.0 - peek * 0.4)]])
	pose("Spine1", [[1, 0, 0, l0 + 0.01 * br], [0, 1, 0, 0.05 * tw * mv], [0, 0, 1, 0.02 * C.shift]])
	pose("Spine2", [[1, 0, 0, l1 + 0.02 * br], [0, 1, 0, 0.04 * tw * mv]])
	pose("Spine3", [[1, 0, 0, l2 + 0.01 * br], [0, 1, 0, C.look * 0.15]])
	var tot := l0 + l1 + l2
	pose("Neck", [[1, 0, 0, 0.06 - tot * 0.15], [0, 1, 0, C.look * 0.35]])
	pose("Head", [[1, 0, 0, -tot * 0.78 + C.pitch - peek * 0.12 - 0.015 * br], [0, 1, 0, C.look * 0.5], [0, 0, 1, -0.04 * C.shift]])
	var aw: Array = CR.arm_walk; var ai: Array = CR.arm_idle
	for i in 2:
		var s := "L" if i == 0 else "R"
		var sg := 1.0 if i == 0 else -1.0
		# the arm swings with the opposite leg, a little; out, the elbows bent, hands loose
		var swing := float(aw[3]) * cos(TAU * (ph - (0.5 if i == 0 else 0.0))) * mv
		var sw := lerpf(ai[0], aw[0], mv) - swing + peek * 0.25
		var ab := lerpf(ai[1], aw[1], mv)
		var el := lerpf(ai[2], aw[2], mv) + 0.08 * br * (1.0 - mv) - peek * 0.2
		pose(s + "ArmA", [[1, 0, 0, sw], [0, 0, 1, sg * ab], [0, 0, 1, -sg * PI / 2.0], [1, 0, 0, -0.25]])
		pose(s + "ForeArm", [[0, 1, 0, -sg * el]])
	for i in CROUCH_BONES.size():
		var bi: int = bones.get(CROUCH_BONES[i], -1)
		if bi >= 0: q[bi] = (saved[i] as Quaternion).slerp(q[bi], W)
	for s in ["L", "R"]:
		var sg := 1.0 if s == "L" else -1.0
		for f in FIST:
			for j in range(1, 4): bend("%sFinger%s%d" % [s, f, j], 0, 0, 1, -sg * 0.45 * W * (0.8 if j == 1 else 1.0))
	if waist >= 0:
		var swx: float = float(CR.sway) * tw * mv + 0.02 * C.shift
		waist_pos = waist_pos.lerp(rest_waist + Vector3(swx, 0.0, 0.0), W)
		skel.set_bone_pose_position(waist, waist_pos)
	# ---- the height: the hips over the bent legs, down a little at each footfall ----
	var L: float = _cg.leg
	var hf := lerpf(float(CR.hip_idle), float(CR.hip_walk), mv) + peek * 0.11
	var bob := -float(CR.bob) * cos(TAU * 2.0 * ph) * mv
	var hc := y0 + (float(_cg.ankle) + hf * L + bob - float(_cg.thigh_y)) * k
	holder.position.y = lerpf(hp0.y, hc, W)
	# ---- the legs ----
	var toe: Vector3 = _cg.toe
	for i in 2:
		var s := "L" if i == 0 else "R"
		var sg := 1.0 if i == 0 else -1.0
		var u := fmod(ph + (0.0 if i == 0 else 0.5), 1.0)
		var gf := _sneak_foot(u, ss)
		var zi: float = (0.075 if i == 0 else -0.055) + 0.012 * C.shift * sg
		var z := lerpf(zi, gf.x, mv)
		var lift := gf.y * mv
		var pitch := gf.z * mv
		# a pitched foot turns about the ball while it is down (the toe keeps its place)
		var rq := Quaternion(Vector3.RIGHT, pitch)
		var piv := (toe - rq * toe) * (1.0 - _sm(0.0, 0.03, lift))
		var x := sg * float(CR.width) * lerpf(1.18, 1.0, mv)
		var tc := Vector3(x * k, y0 + (float(_cg.ankle) + lift + piv.y) * k, (z + piv.z) * k)
		var T: Vector3 = (clip_f[i] as Vector3).lerp(tc, W)
		var pole: Vector3 = (clip_p[i] as Vector3).lerp(Vector3(sg * 0.32, 0.0, 1.0).normalized(), W).normalized()
		idles._ik(s + "Thigh", s + "Leg", s + "Foot", (T - holder.position) / k, pole, [1, 0, 0, 1], 1.0)
		var cq: Quaternion = Quaternion(Vector3.UP, sg * 0.14) * rq * (_cg.fq[i] as Quaternion)
		idles._orient(s + "Foot", (clip_q[i] as Quaternion).slerp(cq, W), 1.0)
		if pitch > 0.02 and lift < 0.02: bend(s + "Toe", 1, 0, 0, -pitch * W * (1.0 - _sm(0.0, 0.02, lift)))

# ---------- head look and blinking ----------
func _head_look(dt: float) -> void:
	if is_nan(look_yaw): return
	_look_y += (look_yaw - _look_y) * (1.0 - exp(-dt * 6.0))
	bend("Spine3", 0, 1, 0, _look_y * 0.12); bend("Neck", 0, 1, 0, _look_y * 0.35); bend("Head", 0, 1, 0, _look_y * 0.5)

func _talk_face(dt: float) -> void:
	_mouth += (mouth - _mouth) * (1.0 - exp(-dt * 22.0))
	_lpitch += (look_pitch - _lpitch) * (1.0 - exp(-dt * 5.0))
	if _mouth > 0.002:
		var jb: int = bones.get("FJlipL", -1)
		if jb >= 0: q[jb] = q[jb] * Quaternion(Vector3.UP, _mouth * 0.3)
	var p := nod - _lpitch
	if absf(p) > 0.0005:
		bend("Neck", 1, 0, 0, p * 0.4); bend("Head", 1, 0, 0, p * 0.6)

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
