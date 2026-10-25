class_name CreatureMrMime
extends Creature
# Mr. Mime (Delia's; he helps at Pallet House). Rig: Waist (the pelvis, the
# root of both halves) - Hips - L/RThigh - Leg - Foot - Toe; Spine1 - Spine2
# (the chest) - Head with the two blue hair horns (L/RFeeler); Spine2 -
# L/RShoulder - Arm - ForeArm - Hand with five two-joint fingers (A the thumb
# .. E). L is his left (+x). The bind pose is a T: legs plumb, arms straight
# out, palms down, fingers spread.
#
# ---- the walk ----
# As Doduo's (creature_doduo.gd): each foot is planted (frozen in the world)
# or swinging to where the body will be half a stance later; the cycle grows
# with speed and the beat is speed / cycle, so the feet never slide. The legs
# reach their feet with a two-bone IK, knees forward. His step is a light,
# prancing one: up on his toes as a foot leaves, the body vaulting over the
# stance leg, the hips swaying, the chest turning against the hips and the
# arms swinging opposite the legs, hands open.
#
# ---- the hands (acts) ----
# Above the walk, what his arms, chest, head and face do is an act: a pose as
# a function of time (_act). Each gives the wrists' targets (in the chest's
# frame, or the ground's for things out in the world: a table, the broom's
# head, the invisible wall), which way the fingers and the back of each hand
# point, the elbows' pole, how far the fingers curl, the chest's bend and the
# face. The arms reach them with a two-bone IK; a change of act blends over
# FADE seconds. Two kinds:
#   task  (persistent, set by companions.gd): "" (stand / walk), "sweep"
#         (two hands on the broom, sweeping arcs), "wipe" (a cloth circling
#         on a table top at task_h), "tray" (a tray up on one palm, waiter
#         style; he walks with it), "serve" (puts the tray down at task_h),
#         "water" (the watering can, pouring), "wall" (miming an invisible
#         wall: pats, then sliding along it to find the edge), "sit" (on a
#         bench of height task_h, legs swinging), "rest" (sitting on the
#         ground, back to the wall; asleep when sleep is set), "listen"
#         (hands clasped, nodding: Delia is talking to him)
#   mood  (one-shot): "wave", "bow", "happy" (a hop and a clap), "laugh",
#         "shrug", "polish" (an invisible window), "rope" (hauls in an
#         invisible rope), "box" (traces an invisible box), "clap", "talk"
#         (a run of mime gestures, his side of a chat)
# carry: "broom" / "can" / "tray" while walking to a job.
# The props (broom, cloth, tray with a teapot and cups, watering can) are
# small meshes of his own, posed from his hands each frame (or the hands
# from them: the broom), drawn with the creature shading and inked.
#
# ---- the face ----
# Eye1 (the merged eye sheet) and Mouth1 are 2 x 4 atlases (uv_off): eyes
# open, determined, half-lidded, happy, closed, smug, squeezed; mouth smile,
# open, open wide, wavy, grin, flat.
#
# Cost: no allocation per frame (the poses are three preallocated _P).

# ---- tunables (the gait and the acts' timing; all in metres / seconds / radians) ----
# (the world editor's tunables: res://tunables/creatures.json "mrmime"; these are the defaults)
const T := preload("res://tunables.gd")
var WALK_DUTY := T.num2("creatures", "mrmime", "walk_duty", 0.6)            # the part of a cycle a foot is down, walking
var RUN_DUTY := T.num2("creatures", "mrmime", "run_duty", 0.38)            # and running
var FOOT_W := T.num2("creatures", "mrmime", "foot_w", 0.118)             # half the stance width
var ANKLE_H := T.num2("creatures", "mrmime", "ankle_h", 0.054)            # ankle height over the sole
var CYC_BASE := T.num2("creatures", "mrmime", "cyc_base", 0.32)            # stride length of a cycle (two steps) = BASE + PER_V * speed, clamped
var CYC_PER_V := T.num2("creatures", "mrmime", "cyc_per_v", 0.26)
var CYC_MIN := T.num2("creatures", "mrmime", "cyc_min", 0.42)
var CYC_MAX := T.num2("creatures", "mrmime", "cyc_max", 1.1)
var STEP_H_WALK := T.num2("creatures", "mrmime", "step_h_walk", 0.07)         # foot lift at a walk / a run
var STEP_H_RUN := T.num2("creatures", "mrmime", "step_h_run", 0.12)
var RUN_FROM := T.num2("creatures", "mrmime", "run_from", 1.8)             # speed where the walk starts to turn into a run, and is one
var RUN_AT := T.num2("creatures", "mrmime", "run_at", 3.2)
var BOB_WALK := T.num2("creatures", "mrmime", "bob_walk", 0.022)           # the body's vault over the stance leg
var BOB_RUN := T.num2("creatures", "mrmime", "bob_run", 0.035)
var HIP_SWAY := T.num2("creatures", "mrmime", "hip_sway", 0.12)            # the hips turn with the legs; the chest turns back COUNTER times as far
var CHEST_COUNTER := T.num2("creatures", "mrmime", "chest_counter", 1.6)
var ARM_SWING := T.num2("creatures", "mrmime", "arm_swing", 0.16)           # how far the hands swing (m)
var TIPTOE := T.num2("creatures", "mrmime", "tiptoe", 0.45)              # the foot's push-off pitch as it leaves the ground
var FADE := T.num2("creatures", "mrmime", "fade", 0.4)                 # seconds to blend from one act to the next
const WALKABLE := ["", "tray", "listen"]
const MOOD_LEN0 := {"wall": 4.5, "wave": 2.2, "bow": 2.1, "happy": 1.5, "laugh": 2.4, "shrug": 1.7, "polish": 3.2, "rope": 2.8, "box": 3.0, "clap": 1.6, "talk": 4.0}
var MOOD_LEN := T.dict2("creatures", "mrmime", "mood_len", MOOD_LEN0)   # seconds each mood act lasts

const EYES := {"open": Vector2(0, 0), "firm": Vector2(0.5, 0), "half": Vector2(0, 0.25), "happy": Vector2(0.5, 0.25),
	"closed": Vector2(0, 0.5), "smug": Vector2(0.5, 0.5), "squeeze": Vector2(0, 0.75)}
const MOUTH := {"smile": Vector2(0, 0), "open": Vector2(0.5, 0), "wide": Vector2(0, 0.25), "wavy": Vector2(0.5, 0.25),
	"grin": Vector2(0, 0.5), "flat": Vector2(0, 0.75)}

# one pose of the upper body
class _P:
	var w := [Vector3.ZERO, Vector3.ZERO]        # wrist targets, L and R
	var fd := [Vector3.ZERO, Vector3.ZERO]       # finger direction
	var bk := [Vector3.ZERO, Vector3.ZERO]       # back of the hand
	var pole := [Vector3.ZERO, Vector3.ZERO]     # where the elbow points
	var curl := [0.0, 0.0]
	var thumb := [0.0, 0.0]
	var ground := [false, false]                 # target in the ground's frame (else the chest's)
	var spine := Vector3.ZERO                    # pitch (forward), yaw (to his left), roll
	var head := Vector2.ZERO                     # yaw, pitch offsets
	var hip_dy := 0.0
	var tip := 0.0                               # up on his toes (0..1)
	var eye := "open"
	var mouth := "smile"
	var looks := true                            # may look at look_at_pos / about
	func copy_from(o: _P) -> void:
		for s in 2:
			w[s] = o.w[s]; fd[s] = o.fd[s]; bk[s] = o.bk[s]; pole[s] = o.pole[s]
			curl[s] = o.curl[s]; thumb[s] = o.thumb[s]; ground[s] = o.ground[s]
		spine = o.spine; head = o.head; hip_dy = o.hip_dy; tip = o.tip; eye = o.eye; mouth = o.mouth; looks = o.looks

var task := ""
var task_h := 0.72            # the table's top / the bench's seat (m)
var carry := ""
var legs := []
var phase := 0.0
var cyc := 0.7
var duty := WALK_DUTY
var run_w := 0.0
var L1 := 0.263
var L2 := 0.212
var A1 := 0.322
var A2 := 0.201
var hip0 := 0.595
var hip_y := 0.57
var t := 0.0
var _vel := Vector3.ZERO
var _last_pos := Vector3(NAN, NAN, NAN)
var _last_frame := 0
var _need_reset := true
var _yaw_last := NAN
var turn_v := 0.0
var lean := 0.0
var roll := Vector2.ZERO
var bob := Vector2.ZERO
var mood_k := ""
var mood_t := -1.0
var act := ""                 # the act shown (the task, a mood, or "" when it may not be done walking)
var act_t := 0.0
var prev := ""
var prev_t := 0.0
var fade := 1.0
var seat_w := 0.0             # sit / rest: the legs off the walk
var head_yaw := Vector2.ZERO
var head_pitch := Vector2.ZERO
var look_y := 0.0
var look_p := 0.0
var look_cd := 2.0
var blink := 2.0
var _eye := ""
var _mouth := ""
var eye_mat: ShaderMaterial
var mouth_mat: ShaderMaterial
var feeler := Vector2.ZERO
var claps := 0                # counters for sounds (sfx_world.gd)
var sweeps := 0
var _sw_last := 0.0
var PA := _P.new()
var PB := _P.new()
var PO := _P.new()
# bones
var bW := -1; var bS1 := -1; var bS2 := -1; var bHd := -1
var arms := []                # per side: {sh, arm, fa, hand, end, fingers: [[b1, b2, axis]], sg}
var bFeel := [-1, -1]
# this frame's body
var _Dp := Basis()            # pelvis turn (delta from rest)
var _D1 := Basis()
var _D2 := Basis()            # chest turn
var _Wo := Vector3.ZERO       # pelvis pivot (skeleton space)
var _S2o := Vector3.ZERO      # chest pivot
# props
var props := {}               # name -> MeshInstance3D (children of the skeleton)
var _stream: MeshInstance3D

func _setup() -> void:
	t = rng.randf() * 10.0
	bW = b("Waist"); bS1 = b("Spine1"); bS2 = b("Spine2"); bHd = b("Head")
	hip0 = rest_at(bW).y
	for s in [["L", 1.0], ["R", -1.0]]:
		var th := b(s[0] + "Thigh")
		var lg := b(s[0] + "Leg")
		var ft := b(s[0] + "Foot")
		L1 = rest_at(th).distance_to(rest_at(lg))
		L2 = rest_at(lg).distance_to(rest_at(ft))
		legs.append({"thigh": th, "leg": lg, "foot": ft, "toe": b(s[0] + "Toe"), "sg": s[1], "p": Vector3.ZERO, "yaw": 0.0, "u": -1.0,
			"from": Vector3.ZERO, "to": Vector3.ZERO, "toyaw": 0.0, "fromyaw": 0.0, "dur": 0.3, "h": 0.07})
	for s in [["L", 1.0], ["R", -1.0]]:
		var arm := b(s[0] + "Arm")
		var fa := b(s[0] + "ForeArm")
		var hd := b(s[0] + "Hand")
		A1 = rest_at(arm).distance_to(rest_at(fa))
		A2 = rest_at(fa).distance_to(rest_at(hd))
		var fingers := []
		for f in ["A", "B", "C", "D", "E"]:
			var f1 := b("%sFinger%s1" % [s[0], f])
			var f2 := b("%sFinger%s2" % [s[0], f])
			var d := rest_dir(f1, f2)
			# curling turns a finger toward the palm (palms face down in the bind pose)
			fingers.append([f1, f2, d.cross(Vector3.DOWN).normalized()])
		arms.append({"sh": b(s[0] + "Shoulder"), "arm": arm, "fa": fa, "hand": hd, "end": b("End" + s[0] + "Hand"), "fingers": fingers, "sg": s[1],
			"rfd": rest_dir(hd, b("End" + s[0] + "Hand"))})
	bFeel = [b("LFeeler"), b("RFeeler")]
	eye_mat = mat_by.get("mrmime_eye1", null)
	mouth_mat = mat_by.get("mrmime_mouth1", null)
	_make_props()

func reset() -> void:
	_need_reset = true

func _reset_now() -> void:
	_need_reset = false
	var yaw := global_rotation.y
	for l in legs:
		l.p = _neutral(l, yaw, 0.0)
		l.yaw = yaw
		l.u = -1.0
	_last_pos = global_position
	_vel = Vector3.ZERO
	phase = 0.0
	_yaw_last = yaw

func mood(what: String) -> void:
	if not MOOD_LEN.has(what):
		match what:
			"hop": what = "happy"
			"peck", "call": what = "wave"
			_: return
	mood_k = what
	mood_t = 0.0
	if what == "happy": hops += 1

func animate(dt: float, speed: float) -> void:
	super.animate(dt, speed)
	_props_place()

func busy() -> bool:
	return mood_t >= 0.0 and mood_k in ["wave", "bow", "happy", "laugh", "shrug", "polish", "rope", "box", "clap", "wall"]

func contacts() -> Array:
	var out := []
	for l in legs: out.append(to_world(G[l.foot].origin) if l.u < 0.0 and seat_w < 0.05 else null)
	return out

func _neutral(l: Dictionary, yaw: float, ahead: float) -> Vector3:
	var f := Vector3(sin(yaw), 0, cos(yaw))
	var side := Vector3(cos(yaw), 0, -sin(yaw))
	var p: Vector3 = global_position + side * (FOOT_W * float(l.sg)) + f * (ahead + 0.01)
	p.y = global_position.y
	return p

# ======================================================================
# the frame
# ======================================================================
func _pose(dt: float, speed: float) -> void:
	var now := Engine.get_process_frames()
	if now - _last_frame > 30: _need_reset = true
	_last_frame = now
	if not _need_reset and global_position.distance_to(_last_pos) > 1.5: _need_reset = true
	if _need_reset: _reset_now()
	t += dt
	if dt > 0.0:
		var vel := (global_position - _last_pos) / dt
		vel.y = 0.0
		_vel = _vel.lerp(vel, 1.0 - exp(-dt * 12.0))
		var yaw := global_rotation.y
		if not is_nan(_yaw_last): turn_v = damp(turn_v, wrapf(yaw - _yaw_last, -PI, PI) / dt, 8.0, dt)
		_yaw_last = yaw
	_last_pos = global_position
	var v := _vel.length()
	# which act: a mood over the task; a task he can't do on the move gives way to the walk
	if mood_t >= 0.0:
		mood_t += dt
		if mood_t > float(MOOD_LEN.get(mood_k, 1.5)): mood_t = -1.0; mood_k = ""
	var tk := "rest" if sleep else task
	var want := mood_k if mood_t >= 0.0 else tk
	if v > 0.25 and not (want in WALKABLE) and not (want == "sweep" and v < 0.6): want = ""
	if want == "" and v > 0.25 and carry == "tray": want = "tray"
	if want != act:
		prev = act; prev_t = act_t; act = want; act_t = 0.0
		fade = 0.0 if fade >= 1.0 else 1.0 - fade
	act_t += dt
	prev_t += dt
	fade = minf(1.0, fade + dt / FADE)
	var sw: float = 1.0 if tk in ["sit", "rest"] else 0.0
	seat_w = damp(seat_w, sw, 3.5, dt)
	_gait(dt, v)
	_act(act, act_t, v, PA)
	if fade < 1.0:
		_act(prev, prev_t, v, PB)
	_body(dt, v)
	_legs_ik()
	_arms()
	_head(dt)
	_face(dt)
	# a little sweep sound counter
	if act == "sweep":
		var s := sin(act_t * 2.4)
		if signf(s) != signf(_sw_last): sweeps += 1
		_sw_last = s

# ---------- the walk ----------
func _gait(dt: float, v: float) -> void:
	run_w = damp(run_w, sm(RUN_FROM, RUN_AT, v), 5.0, dt)
	cyc = damp(cyc, clampf(CYC_BASE + CYC_PER_V * v, CYC_MIN, CYC_MAX), 5.0, dt)
	duty = lerpf(WALK_DUTY, RUN_DUTY, run_w)
	var yaw := global_rotation.y
	var moving := v > 0.06 and seat_w < 0.3
	var rate := v / cyc
	var ph0 := phase
	if moving: phase += rate * dt
	var swing := (1.0 - duty) / maxf(rate, 0.5)
	for i in 2:
		var l: Dictionary = legs[i]
		var off := 0.5 * i
		var late := false
		if moving and l.u < 0.0:
			var nb := _neutral(l, yaw, 0.0)
			var behind := Vector2(l.p.x - nb.x, l.p.z - nb.z).length()
			if (legs[1 - i].u < 0.0 and behind > cyc * duty * 0.5 + 0.06) or behind > 0.3:
				late = true
				phase = off + floor(phase - off) + 1e-4
		if moving and l.u < 0.0 and (late or floor(phase - off) > floor(ph0 - off)):
			var lead := cyc * duty * 0.5
			var land := _neutral(l, yaw + turn_v * swing, lead) + _vel * swing
			l.from = l.p; l.fromyaw = l.yaw
			l.to = land; l.toyaw = yaw + turn_v * swing
			l.dur = swing; l.u = 0.0
			l.h = lerpf(STEP_H_WALK, STEP_H_RUN, run_w) + v * 0.012
		elif not moving and l.u < 0.0 and legs[1 - i].u < 0.0 and seat_w < 0.3:
			var want := _neutral(l, yaw, 0.0)
			var off2 := Vector2(l.p.x - want.x, l.p.z - want.z).length()
			if off2 > 0.08 or absf(wrapf(l.yaw - yaw, -PI, PI)) > 0.45:
				l.from = l.p; l.fromyaw = l.yaw; l.to = want; l.toyaw = yaw
				l.dur = 0.24; l.u = 0.0; l.h = 0.05
		if l.u >= 0.0:
			l.u = minf(1.0, l.u + dt / maxf(0.08, l.dur))
			if moving:
				var left: float = (1.0 - float(l.u)) * float(l.dur)
				var lead2 := cyc * duty * 0.5
				var tgt: Vector3 = _neutral(l, yaw + turn_v * left, lead2) + _vel * left
				l.to = l.to.lerp(tgt, 1.0 - exp(-dt * 6.0))
				l.toyaw = yaw + turn_v * left
			if l.u >= 1.0:
				l.p = l.to; l.yaw = l.toyaw; l.u = -1.0
				footfalls += 1
		if seat_w > 0.5:
			# sitting: the feet are wherever the seat puts them; they stand up from under the body
			l.p = _neutral(l, yaw, 0.0); l.yaw = yaw; l.u = -1.0

# a foot this frame: [point (world), swing 0..1 (-1 planted), heading]
func _foot(l: Dictionary) -> Array:
	if l.u < 0.0: return [l.p, -1.0, l.yaw]
	var u: float = l.u
	var e := u * u * (3.0 - 2.0 * u)
	var p2: Vector3 = (l.from as Vector3).lerp(l.to, e)
	var h: float = l.h * sin(PI * minf(1.0, u * 1.1))
	return [p2 + Vector3.UP * h, u, lerp_angle(float(l.fromyaw), float(l.toyaw), e)]

# ---------- the body ----------
func _body(dt: float, v: float) -> void:
	var ph := fposmod(phase, 0.5) * 2.0
	var walk_b := -cos(ph * TAU) * BOB_WALK * sm(0.1, 0.6, v)
	var run_b := (cos(ph * TAU) * BOB_RUN + 0.015) * run_w
	var hop := 0.0
	if act == "happy":
		var u := act_t
		hop = maxf(0.0, sin(clampf((u - 0.15) / 0.45, 0.0, 1.0) * PI)) * 0.13
	var pose_dy := _mix_f(PA.hip_dy, PB.hip_dy)
	var want_y := hip0 * 0.965 + walk_b * (1.0 - run_w) + run_b + sin(t * 1.7) * 0.004 + hop + pose_dy - run_w * 0.03
	bob = spring(bob, want_y, 18.0, dt, 0.8)
	hip_y = bob.x
	# never higher than the planted feet can reach (on his toes they reach a little further)
	var tip := _mix_f(PA.tip, PB.tip)
	if seat_w < 0.5:
		for l in legs:
			if l.u >= 0.0: continue
			var pl := to_skel(l.p)
			var th: Vector3 = rest_at(l.thigh)
			var hx := Vector2(pl.x - th.x, pl.z - th.z).length()
			var r2 := (L1 + L2) * 0.99 + tip * 0.05
			if hx < r2: hip_y = minf(hip_y, pl.y + ANKLE_H + tip * 0.05 + sqrt(r2 * r2 - hx * hx) + (hip0 - th.y))
	var spn := Vector3(_mix_f(PA.spine.x, PB.spine.x), _mix_f(PA.spine.y, PB.spine.y), _mix_f(PA.spine.z, PB.spine.z))
	# the seat: hips down onto the bench / the ground
	var seat_y := task_h + 0.1 if _sitting() else task_h + 0.16
	var seat_z := -0.06 if _sitting() else -0.02
	var hy := lerpf(hip_y, seat_y, seat_w)
	lean = damp(lean, 0.05 + v * 0.06 + spn.x * 0.15, 6.0, dt)
	var r := 0.0
	for l in legs:
		if l.u < 0.0: r += float(l.sg)
	r *= 0.05 * sm(0.1, 0.8, v)
	r += clampf(-turn_v * v * 0.04, -0.2, 0.2)
	roll = spring(roll, r, 9.0, dt, 0.7)
	var sway := sin(phase * TAU) * HIP_SWAY * sm(0.1, 1.0, v)     # the hips turn with the legs
	var sitting := _sitting()
	_Dp = Basis(Vector3.UP, sway) * Basis(Vector3.RIGHT, lean * 0.5 - seat_w * 0.12) * Basis(Vector3(0, 0, 1), -roll.x)
	_Wo = Vector3(-roll.x * 0.04, hy, rest_at(bW).z + seat_w * seat_z)
	# the chest: the act's bend on the pelvis, turned back against the hips' sway
	var chest := Basis(Vector3.UP, -sway * CHEST_COUNTER + spn.y) * Basis(Vector3.RIGHT, lean * 0.5 + spn.x + seat_w * (0.1 if sitting else 0.18)) * Basis(Vector3(0, 0, 1), spn.z + roll.x * 0.6)
	_D1 = _Dp * Basis(Vector3.UP, (-sway * CHEST_COUNTER + spn.y) * 0.4) * Basis(Vector3.RIGHT, (lean * 0.5 + spn.x) * 0.45)
	_D2 = _Dp * chest
	_S2o = _Wo + _D1 * (rest_at(bS2) - rest_at(bS1))
	set_local_pos(bW, rest_g[parent[bW]].affine_inverse() * _Wo)
	set_global(bW, _Dp * rest_g[bW].basis)
	set_global(bS1, _D1 * rest_g[bS1].basis)
	set_global(bS2, _D2 * rest_g[bS2].basis)

func _sitting() -> bool:
	return task == "sit" and not sleep

func _mix_f(a: float, b2: float) -> float:
	return a if fade >= 1.0 else lerpf(b2, a, sm(0.0, 1.0, fade))

# where a bone under the pelvis is this frame (rest offsets turned with it)
func _under_pelvis(bi: int) -> Vector3:
	return _Wo + _Dp * (rest_at(bi) - rest_at(bW))

func _legs_ik() -> void:
	var W2S := skel.global_transform.affine_inverse()
	var tip := _mix_f(PA.tip, PB.tip)
	for l in legs:
		var fp := _foot(l)
		var u: float = fp[1]
		var A := W2S * ((fp[0] as Vector3) + Vector3.UP * ANKLE_H)
		var fy: float = float(fp[2]) - global_rotation.y
		# on his toes: the ankle up, the foot pitched down (and pushing off as it leaves)
		var pitch := 0.0
		var tp := tip
		if u >= 0.0: pitch = TIPTOE * (1.0 - sm(0.0, 0.5, u)) - 0.25 * sm(0.55, 0.85, u) * (1.0 - sm(0.85, 1.0, u))
		pitch += tp * 0.55
		A.y += maxf(0.0, pitch) * 0.09
		var kpole := Vector3(float(l.sg) * 0.12, 0, 1)
		if seat_w > 0.01:
			# seated: the feet out in front (dangling when they can't reach the ground)
			var sitting := _sitting()
			var kick := sin(t * 2.6 + float(l.sg) * 1.6) * 0.06 if sitting else 0.0
			var fx := float(l.sg) * (0.12 if sitting else 0.16)
			var sA := Vector3(fx, ANKLE_H + (0.0 if not sitting else 0.0), (0.24 if sitting else 0.36) + kick)
			A = A.lerp(sA, seat_w)
			pitch = lerpf(pitch, -0.2 if sitting else -0.5, seat_w)
			kpole = kpole.lerp(Vector3(float(l.sg) * 0.2, 1.0, 0.6), seat_w)
		var H := _under_pelvis(l.thigh)
		var d := A - H
		var dl := d.length()
		var reach := (L1 + L2) * 0.999
		if dl > reach:
			A = H + d / dl * reach; d = A - H; dl = reach
		dl = maxf(dl, absf(L1 - L2) + 0.01)
		var a1 := acos(clampf((L1 * L1 + dl * dl - L2 * L2) / (2.0 * L1 * dl), -1.0, 1.0))
		var axis := d.normalized()
		var pole := _Dp * kpole
		pole = (pole - axis * pole.dot(axis)).normalized()
		var K := H + axis * (L1 * cos(a1)) + pole * (L1 * sin(a1))
		var kn1 := (K - H).cross(pole.cross(K - H)).normalized()
		var kn2 := (A - K).cross(pole.cross(A - K)).normalized()
		aim(l.thigh, K - H, kn1, rest_dir(l.thigh, l.leg), Vector3(0, 0, 1))
		aim(l.leg, A - K, kn2, rest_dir(l.leg, l.foot), Vector3(0, 0, 1))
		set_global(l.foot, Basis(Vector3.UP, fy) * Basis(Vector3.RIGHT, pitch) * rest_g[l.foot].basis)
		# the toes stay flat on the ground when the heel is up
		turn_rest(l.toe, Vector3.RIGHT, -maxf(0.0, pitch) * 0.8)

# ---------- the arms ----------
func _arms() -> void:
	var f := sm(0.0, 1.0, fade)
	for s in 2:
		var am: Dictionary = arms[s]
		var sg: float = am.sg
		var W := _tgt(PA, s)
		var fd: Vector3 = _dir(PA, PA.fd[s])
		var bk: Vector3 = _dir(PA, PA.bk[s])
		var pole: Vector3 = _D2 * (PA.pole[s] as Vector3)
		var curl: float = PA.curl[s]
		var thumb: float = PA.thumb[s]
		if f < 1.0:
			W = _tgt(PB, s).lerp(W, f)
			fd = _dir(PB, PB.fd[s]).lerp(fd, f).normalized()
			bk = _dir(PB, PB.bk[s]).lerp(bk, f).normalized()
			pole = (_D2 * (PB.pole[s] as Vector3)).lerp(pole, f)
			curl = lerpf(PB.curl[s], curl, f)
			thumb = lerpf(PB.thumb[s], thumb, f)
		var S := _S2o + _D2 * (rest_at(am.arm) - rest_at(bS2))
		var d := W - S
		var dl := d.length()
		var reach := (A1 + A2) * 0.995
		if dl > reach:
			W = S + d / dl * reach; d = W - S; dl = reach
		dl = maxf(dl, absf(A1 - A2) + 0.02)
		var a1 := acos(clampf((A1 * A1 + dl * dl - A2 * A2) / (2.0 * A1 * dl), -1.0, 1.0))
		var axis := d.normalized()
		var pl := pole - axis * pole.dot(axis)
		if pl.length_squared() < 1e-6: pl = axis.cross(Vector3(0, 0, 1))
		pl = pl.normalized()
		var E := S + axis * (A1 * cos(a1)) + pl * (A1 * sin(a1))
		# the bend axis maps onto the rest one (-y for the left arm, +y for the right)
		var bend := (E - S).cross(W - E)
		if bend.length_squared() < 1e-8: bend = axis.cross(pl)
		bend = bend.normalized()
		var up := -bend * sg
		aim(am.arm, E - S, up, rest_dir(am.arm, am.fa), Vector3.UP)
		# the forearm takes half the hand's roll, so the wrist doesn't wring
		var fup := up.slerp(_perp(bk, W - E), 0.5) if _perp(bk, W - E).length_squared() > 0.5 else up
		aim(am.fa, W - E, fup, rest_dir(am.fa, am.hand), Vector3.UP)
		aim(am.hand, fd, bk, am.rfd, Vector3.UP)
		for fi in 5:
			var fg: Array = am.fingers[fi]
			var c := thumb if fi == 0 else curl
			# a little life in the fingers
			c += sin(t * 3.1 + fi * 1.3 + sg) * 0.04
			turn_rest(fg[0], fg[2], c * 0.75)
			turn_rest(fg[1], fg[2], c * 1.0)

static func _perp(v: Vector3, axis: Vector3) -> Vector3:
	var a := axis.normalized()
	var p := v - a * v.dot(a)
	return p.normalized() if p.length_squared() > 1e-6 else Vector3.ZERO

func _tgt(P: _P, s: int) -> Vector3:
	if P.ground[s]: return P.w[s]
	return _S2o + _D2 * (P.w[s] as Vector3)

func _dir(_P0: _P, v: Vector3) -> Vector3:
	return (_D2 * v).normalized()

# ---------- the head ----------
func _head(dt: float) -> void:
	var hy := _mix_f(PA.head.x, PB.head.x)
	var hp := _mix_f(PA.head.y, PB.head.y)
	var looks := PA.looks
	look_cd -= dt
	if look_cd <= 0.0:
		look_cd = rng.randf_range(1.2, 4.0)
		look_y = rng.randf_range(-0.8, 0.8) if rng.randf() < 0.6 else 0.0
		look_p = rng.randf_range(-0.15, 0.2)
	var gy := hy
	var gp := hp
	if looks:
		if not is_nan(look_at_pos.x):
			var hpw := to_world(G[bHd].origin + Vector3(0, 0.15, 0))
			var to := look_at_pos - hpw
			var ty := wrapf(atan2(to.x, to.z) - global_rotation.y, -PI, PI)
			gy += clampf(ty - _D2.get_euler().y, -1.2, 1.2)
			gp += clampf(atan2(to.y, Vector2(to.x, to.z).length()), -0.6, 0.6)
		elif _vel.length() < 0.2 and act == "":
			gy += look_y; gp += look_p
	head_yaw = spring(head_yaw, gy, 7.0, dt, 0.85)
	head_pitch = spring(head_pitch, gp, 7.0, dt, 0.85)
	var dh := _D2 * Basis(Vector3.UP, head_yaw.x) * Basis(Vector3.RIGHT, -head_pitch.x)
	set_global(bHd, dh * rest_g[bHd].basis)
	# the hair horns trail the head's motion on a spring, bouncing with his step
	feeler = spring(feeler, (bob.y * 0.6 + head_yaw.y * 0.05), 11.0, dt, 0.35)
	for k in 2:
		var bf: int = bFeel[k]
		if bf < 0: continue
		var sgn := 1.0 if k == 0 else -1.0
		turn_rest(bf, Vector3(0, 0, 1), sgn * clampf(-feeler.x * 1.5, -0.35, 0.35) + sgn * sin(t * 1.3 + k) * 0.03)

# ---------- the face ----------
func _face(dt: float) -> void:
	var e := PA.eye
	var m := PA.mouth
	blink -= dt
	if e == "open" and blink < 0.0:
		e = "closed"
		if blink < -0.12: blink = rng.randf_range(1.8, 5.0)
	if e != _eye and eye_mat:
		_eye = e
		eye_mat.set_shader_parameter("uv_off", EYES.get(e, Vector2.ZERO))
	if m != _mouth and mouth_mat:
		_mouth = m
		mouth_mat.set_shader_parameter("uv_off", MOUTH.get(m, Vector2.ZERO))

# ======================================================================
# the acts
# ======================================================================
# chest frame: rest skeleton axes, origin at the chest pivot (Spine2: y 0.744);
# the shoulders sit at (+-0.29, 0.064, 0)

func _hand(P: _P, s: int, w: Vector3, fd: Vector3, bk: Vector3, pole: Vector3, curl: float, ground := false) -> void:
	P.w[s] = w; P.fd[s] = fd; P.bk[s] = bk; P.pole[s] = pole; P.curl[s] = curl; P.thumb[s] = curl * 0.6; P.ground[s] = ground

# hands in the ground's frame give their directions in it too: turned into the chest's here
func _gdir(v: Vector3) -> Vector3:
	return _D2.inverse() * v

# a hand gripping a point of a handle (ground frame): the fingers wrap it from
# the side `out`, the thumb along `up`
func _grip(P: _P, s: int, at: Vector3, up: Vector3, out: Vector3, pole: Vector3, curl := 0.8) -> void:
	var fd := _perp(out, up)
	var th := up.normalized()
	var bk := th.cross(fd) if s == 0 else fd.cross(th)
	var w := at - fd * 0.085 + bk * 0.035
	_hand(P, s, w, _gdir(fd), _gdir(bk), pole, curl, true)

func _act(name: String, at: float, v: float, P: _P) -> void:
	# the stand / walk: arms loose and swinging, a mime's open hands
	var sw := sin(phase * TAU) * sm(0.05, 0.9, v) * (ARM_SWING + run_w * 0.1)
	for s in 2:
		var sg := 1.0 if s == 0 else -1.0
		var ss := sw * (sg)        # the left arm forward as the right leg is
		var idle := sin(t * 1.3 + s * 2.0) * 0.01
		_hand(P, s, Vector3(sg * (0.4 - run_w * 0.04), -0.2 + absf(ss) * 0.25 + idle + run_w * 0.1, 0.12 + ss), Vector3(sg * 0.35, -0.55, 0.75 + ss), Vector3(sg, 0.25, -0.25), Vector3(sg * 0.6, -0.4, -1.0), 0.28 + run_w * 0.3)
	P.spine = Vector3(0.0, 0.0, 0.0)
	P.head = Vector2.ZERO
	P.hip_dy = 0.0
	P.tip = 0.0
	P.eye = "open"
	P.mouth = "smile"
	P.looks = true
	match name:
		"wave":
			var k := sm(0.0, 0.35, at) * (1.0 - sm(1.8, 2.2, at))
			var x := sin(at * 9.0) * 0.09
			_hand(P, 1, Vector3(-0.32 + x, -0.3 + 0.75 * k, 0.09 + 0.06 * k), Vector3(x * 2.0, 0.2 + k, 0.1 - k * 0.1), Vector3(0, 0.1, -1.0 * k + 0.2 * (1.0 - k)).lerp(Vector3(-1, 0.1, -0.2), 1.0 - k), Vector3(-1, -0.6, -0.2), 0.05)
			P.head = Vector2(0.1, 0.12)
			P.spine.z = -0.06 * k
			P.eye = "happy" if k > 0.5 else "open"
			P.mouth = "grin" if k > 0.5 else "smile"
		"bow":
			var k := sm(0.0, 0.6, at) * (1.0 - sm(1.4, 2.0, at))
			P.spine.x = 0.75 * k
			P.head.y = -0.3 * k
			_hand(P, 1, Vector3(-0.06, -0.18, 0.25).lerp(Vector3(-0.3, -0.3, 0.09), 1.0 - k), Vector3(1, -0.1, 0.1), Vector3(0, 0, 1), Vector3(-1, -0.4, -0.6), 0.15)
			_hand(P, 0, Vector3(0.62, 0.05, -0.08).lerp(Vector3(0.3, -0.3, 0.09), 1.0 - k), Vector3(1, 0.25, -0.3), Vector3(0, 1, 0), Vector3(0.2, -1, -0.5), 0.05)
			P.hip_dy = -0.02 * k
			P.eye = "closed" if k > 0.4 else "open"
			P.looks = k < 0.2
		"happy":
			var c := absf(sin(clampf((at - 0.6) / 0.9, 0.0, 1.0) * PI * 3.0))
			for s in 2:
				var sg := 1.0 if s == 0 else -1.0
				_hand(P, s, Vector3(sg * (0.05 + 0.14 * c), 0.12, 0.3), Vector3(0, 1, 0.2), Vector3(sg, 0, 0), Vector3(sg, -0.8, -0.4), 0.0)
			if at > 0.6 and c < 0.15 and fmod(at, 0.3) < 0.05: claps += 1
			P.eye = "happy"; P.mouth = "grin"; P.tip = 0.4
		"clap":
			var c := absf(sin(at * PI * 3.2))
			for s in 2:
				var sg := 1.0 if s == 0 else -1.0
				_hand(P, s, Vector3(sg * (0.06 + 0.13 * c), 0.05, 0.3), Vector3(0, 1, 0.3), Vector3(sg, 0, 0), Vector3(sg, -0.8, -0.4), 0.0)
			if c < 0.12 and _clap_gate(at): claps += 1
			P.eye = "happy"; P.mouth = "smile"
		"laugh":
			var shake := sin(at * 22.0) * 0.03 * sm(0.1, 0.4, at) * (1.0 - sm(2.0, 2.4, at))
			for s in 2:
				var sg := 1.0 if s == 0 else -1.0
				_hand(P, s, Vector3(sg * 0.12, -0.2 + shake, 0.22), Vector3(-sg, -0.2, 0.1), Vector3(0, 0, 1), Vector3(sg, -0.5, -0.8), 0.3)
			P.spine = Vector3(0.25 + shake * 2.0, 0.0, shake)
			P.head = Vector2(0.0, 0.2)
			P.eye = "squeeze"; P.mouth = "grin"; P.looks = false
		"shrug":
			var k := sm(0.0, 0.4, at) * (1.0 - sm(1.3, 1.7, at))
			for s in 2:
				var sg := 1.0 if s == 0 else -1.0
				_hand(P, s, Vector3(sg * (0.3 + 0.12 * k), -0.3 + 0.2 * k, 0.09 + 0.12 * k), Vector3(sg, 0.0, 0.3), Vector3(0, -1, 0).lerp(Vector3(sg, 0.1, -0.2), 1.0 - k), Vector3(sg, -0.5, -0.8), 0.05)
			P.head = Vector2(0, 0.0); P.spine.z = 0.12 * k
			P.eye = "half"; P.mouth = "wavy"
		"polish":
			# an invisible window in front of him: both palms on it, circling
			var k := sm(0.0, 0.4, at) * (1.0 - sm(2.8, 3.2, at))
			for s in 2:
				var sg := 1.0 if s == 0 else -1.0
				var a := at * 5.0 * sg + float(s) * PI
				var w := Vector3(sg * 0.3 + cos(a) * 0.08, 0.84 + sin(a) * 0.08, 0.43)
				_hand(P, s, w.lerp(_S2o + _D2 * _tgt_rest(P, s), 1.0 - k), _gdir(Vector3(0, 1, 0.05)), _gdir(Vector3(0, 0, -1)), Vector3(sg, -0.6, -0.5), 0.0, true)
			P.eye = "happy" if fmod(at, 1.4) > 0.7 else "open"; P.mouth = "smile"
			P.spine.z = sin(at * 5.0) * 0.05
			P.looks = false
		"wall", "box":
			_wall(P, at, name == "box")
		"rope":
			# hand over hand, hauling in a rope that isn't there
			var k := sm(0.0, 0.3, at) * (1.0 - sm(2.4, 2.8, at))
			for s in 2:
				var sg := 1.0 if s == 0 else -1.0
				var u := fposmod(at * 1.4 + 0.5 * s, 1.0)
				var z := lerpf(0.45, 0.05, sm(0.0, 0.6, u)) if u < 0.6 else lerpf(0.05, 0.45, sm(0.6, 1.0, u))
				var y := 0.1 + (0.06 if u >= 0.6 else 0.0)
				_hand(P, s, Vector3(sg * 0.03, y, z).lerp(_tgt_rest(P, s), 1.0 - k), Vector3(-sg * 0.8, 0, 0.6), Vector3(0, 1, 0), Vector3(sg, -0.6, -0.6), 0.85 if u < 0.6 else 0.2)
			P.spine.x = -0.15 * k + sin(at * 8.8) * 0.03 * k
			P.hip_dy = -0.03 * k
			P.eye = "firm"; P.mouth = "wavy"
		"talk":
			# his side of a chat: a run of little gestures
			var seg := int(at / 1.0) % 4
			var u := fmod(at, 1.0)
			var k := sm(0.0, 0.25, u) * (1.0 - sm(0.8, 1.0, u)) * (1.0 - sm(3.6, 4.0, at))
			match seg:
				0:   # points at himself
					_hand(P, 1, Vector3(-0.08, 0.0, 0.2).lerp(_tgt_rest(P, 1), 1.0 - k), Vector3(0.6, 0, -0.5), Vector3(0, 1, 0), Vector3(-1, -0.6, -0.5), 0.6)
				1:   # hands out, a big round thing
					for s in 2:
						var sg := 1.0 if s == 0 else -1.0
						_hand(P, s, Vector3(sg * 0.38, 0.15, 0.25).lerp(_tgt_rest(P, s), 1.0 - k), Vector3(-sg * 0.3, 0.2, 0.9), Vector3(sg, 0.3, 0), Vector3(sg, -0.6, -0.5), 0.2)
				2:   # a finger up: an idea
					_hand(P, 0, Vector3(0.22, 0.35, 0.18).lerp(_tgt_rest(P, 0), 1.0 - k), Vector3(0, 1, 0.1), Vector3(0, 0, -1), Vector3(1, -0.6, -0.3), 0.7)
					P.eye = "firm"
				3:   # hand to the cheek, head tilted
					_hand(P, 1, Vector3(-0.14, 0.42, 0.14).lerp(_tgt_rest(P, 1), 1.0 - k), Vector3(0.3, 1, 0), Vector3(-1, 0, 0), Vector3(-1, -0.7, -0.4), 0.1)
					P.head = Vector2(0, 0.05); P.spine.z = -0.08 * k
					P.eye = "happy"
			P.mouth = "open" if fmod(at, 0.5) < 0.25 else "smile"
		"listen":
			# hands clasped in front, nodding along
			for s in 2:
				var sg := 1.0 if s == 0 else -1.0
				_hand(P, s, Vector3(sg * 0.07, -0.12, 0.24), Vector3(-sg, 0.1, 0.4), Vector3(0, 0.3, 1).lerp(Vector3(0, 1, 0), 0.4), Vector3(sg, -0.5, -0.8), 0.5)
			P.head.y = -0.06 + maxf(0.0, sin(at * 2.2)) * 0.12 * float(int(at / 3.0) % 2 == 0)
			P.eye = "half" if fmod(at, 6.0) > 4.5 else "open"
			P.mouth = "smile"
		"sweep":
			_sweep(P, at)
		"wipe":
			var a := at * 4.0
			var cx := -0.08 + cos(a) * 0.13
			var cz := 0.42 + sin(a) * 0.08
			var sv := Vector3(cos(a + PI * 0.5), 0, sin(a + PI * 0.5))
			_hand(P, 1, Vector3(cx - 0.0, task_h + 0.05, cz - 0.1), _gdir(Vector3(0.0, -0.15, 1).normalized() + sv * 0.2), _gdir(Vector3.UP), Vector3(-1, -0.2, -0.8), 0.15, true)
			_hand(P, 0, Vector3(0.24, task_h + 0.04, 0.22), _gdir(Vector3(0.2, -0.2, 1)), _gdir(Vector3.UP), Vector3(1, -0.3, -0.6), 0.25, true)
			P.spine = Vector3(0.18 + absf(sin(a)) * 0.04, -0.1 + cos(a) * 0.08, sin(a) * 0.04)
			P.head = Vector2(-0.1, -0.35)
			P.tip = 0.2 + (0.5 if task_h > 0.65 else 0.0)
			P.looks = false
			P.eye = "open"; P.mouth = "smile"
		"tray":
			# up on his right palm, waiter style; the left hand out for balance
			_hand(P, 1, Vector3(-0.27, 0.3 + sin(t * 2.0) * 0.008, 0.2), Vector3(0.1, 0.25, -1), Vector3(0, -1, 0.1), Vector3(-1, -0.8, -0.1), 0.2)
			_hand(P, 0, Vector3(0.42, -0.08 + sin(phase * TAU) * 0.02, 0.12), Vector3(1, 0.4, 0.35), Vector3(0, 1, -0.2), Vector3(0.6, -0.8, -0.5), 0.0)
			P.thumb[0] = 0.0
			P.spine.z = 0.05
			P.mouth = "smile"
		"serve":
			var k := sm(0.2, 1.2, at) * (1.0 - sm(1.8, 2.6, at))
			var up := Vector3(-0.27, 0.3, 0.2)
			var dn := _D2.inverse() * (Vector3(-0.05, task_h + 0.04, 0.42) - _S2o)
			_hand(P, 1, up.lerp(dn, k), Vector3(0.1, 0.25, -1).lerp(Vector3(0.2, 0.0, 1), k), Vector3(0, -1, 0.1), Vector3(-1, -0.8, -0.1), 0.2)
			_hand(P, 0, Vector3(0.42, -0.08, 0.12).lerp(Vector3(0.25, 0.0, 0.3), k), Vector3(1, 0.4, 0.35), Vector3(0, 1, -0.2), Vector3(0.6, -0.8, -0.5), 0.0)
			P.spine.x = 0.2 * k
			P.head = Vector2(0, -0.3 * k)
			P.eye = "happy" if at > 2.0 else "open"
			P.looks = false
		"water":
			var pour := sm(0.6, 1.4, at) * (0.85 + sin(at * 1.3) * 0.15)
			_hand(P, 1, Vector3(-0.24, -0.12 + pour * 0.06, 0.3), Vector3(-0.2, -0.2 - pour * 0.4, 1).normalized(), Vector3(0, 1, 0.2 + pour * 0.4), Vector3(-1, -0.5, -0.6), 0.85)
			_hand(P, 0, Vector3(0.25, -0.28, -0.02), Vector3(-0.3, -1, 0.1), Vector3(1, -0.1, -0.4), Vector3(1, 0, -0.4), 0.4)
			P.spine.x = 0.12
			P.head = Vector2(-0.15, -0.4)
			P.looks = false
			P.eye = "half" if fmod(at, 5.0) > 3.5 else "open"
		"sit":
			for s in 2:
				var sg := 1.0 if s == 0 else -1.0
				var on := Vector3(sg * 0.24, task_h + 0.05, -0.04)
				_hand(P, s, on, _gdir(Vector3(sg * 0.2, -0.2, 1)), _gdir(Vector3.UP), Vector3(sg, 0, -1), 0.3, true)
			P.head = Vector2(0, 0.08)
			P.eye = "half" if fmod(at, 9.0) > 5.0 else "open"
			P.mouth = "smile"
		"rest":
			for s in 2:
				var sg := 1.0 if s == 0 else -1.0
				_hand(P, s, Vector3(-sg * 0.03, -0.38, 0.26), Vector3(-sg, -0.1, 0.2), Vector3(0, 1, 0.3), Vector3(sg, -0.2, -0.6), 0.45)
			P.spine.x = 0.15 if sleep else 0.0
			P.head = Vector2(0.15, -0.45 + sin(t * 0.9) * 0.03) if sleep else Vector2(0, 0)
			P.eye = "closed" if sleep else "half"
			P.mouth = "flat" if sleep else "smile"
			P.looks = not sleep

var _clap_last := -1.0
func _clap_gate(at: float) -> bool:
	if at - _clap_last < 0.2 and at >= _clap_last: return false
	_clap_last = at
	return true

# the stand pose's wrist (chest frame), for easing in and out of a gesture
func _tgt_rest(_P0: _P, s: int) -> Vector3:
	var sg := 1.0 if s == 0 else -1.0
	return Vector3(sg * 0.4, -0.2, 0.12)

func _wall(P: _P, at: float, box: bool) -> void:
	# the invisible wall 0.44 in front of him (ground frame). A 6 s round: pats
	# up and down it, then both hands slide right feeling for the edge, then
	# left; the body leans after the hands. "box": the walls close in on all
	# sides (the hands find a wall above, then left, then right).
	var k := sm(0.0, 0.35, at)
	var u := fmod(at, 6.0)
	var lx := 0.31
	var ly := 0.86
	var rx := -0.31
	var ry := 0.86
	var slide := 0.0
	if u < 2.4:
		# pats: one hand lifts off and comes down somewhere new
		var pat := int(u / 0.6)
		var pu := fmod(u, 0.6) / 0.6
		var off := sin(pu * PI) * 0.06
		var heights := [0.84, 1.0, 0.92, 0.78]
		if pat % 2 == 0:
			ly = lerpf(heights[(pat + 3) % 4], heights[pat], sm(0.0, 1.0, pu)); lx = 0.31 + off * 0.5
		else:
			ry = lerpf(heights[(pat + 2) % 4], heights[pat], sm(0.0, 1.0, pu)); rx = -0.31 - off * 0.5
	elif u < 4.2:
		slide = sm(2.4, 3.8, u) * -0.28
	else:
		slide = lerpf(-0.28, 0.2, sm(4.2, 5.6, u)) * (1.0 - sm(5.6, 6.0, u))
	var z := 0.44
	if box:
		var bu := fmod(at, 3.0)
		if bu < 1.0: ly = 1.3; ry = 1.3; lx = 0.2; rx = -0.2; z = 0.25
		elif bu < 2.0: lx = 0.45; rx = -0.45; ly = 0.9; ry = 0.9; z = 0.18
		else: lx = 0.31; rx = -0.31
	for s in 2:
		var sg := 1.0 if s == 0 else -1.0
		var x := (lx if s == 0 else rx) + slide
		var y := ly if s == 0 else ry
		var fd := Vector3(0, 1, 0.05)
		var bk := Vector3(0, 0, -1)
		var zz := z
		if box and fmod(at, 3.0) < 1.0: fd = Vector3(0, 0, 1); bk = Vector3(0, -1, 0)    # palms up on the lid
		elif box and fmod(at, 3.0) < 2.0: fd = Vector3(0, 1, 0); bk = Vector3(-sg, 0, 0); zz = 0.2   # palms out on the sides
		var w := Vector3(x, y, zz)
		var tgt := Vector3(x, y - 0.07, zz - 0.03) if not box else w + Vector3(0, -0.06, 0)
		_hand(P, s, tgt.lerp(_S2o + _D2 * _tgt_rest(P, s), 1.0 - k), _gdir(fd), _gdir(bk), Vector3(sg, -0.6, -0.5), 0.0, true)
	P.spine = Vector3(0.05, slide * 0.6, -slide * 0.5)
	P.head = Vector2(slide * 1.2, 0.05)
	P.eye = "firm" if u < 2.4 else ("smug" if u > 5.0 else "open")
	P.mouth = "wavy" if u < 4.2 else "smile"
	P.tip = 0.15 if not box else 0.0
	P.looks = false

func _sweep(P: _P, at: float) -> void:
	# the broom's head swings in arcs before him; its top stays near his right
	# side; the hands slide on the handle (right above, left below)
	var w := 2.4
	var s := sin(at * w)
	var head := Vector3(0.26 * s, 0.035, 0.66 + 0.05 * cos(at * w * 2.0))
	var top := Vector3(-0.34 + 0.06 * s, 0.86, 0.16)
	var ax := (top - head).normalized()
	var out := Vector3(0, 0, 1)
	_grip(P, 1, head + ax * 0.74, ax, out + Vector3(0.3, 0, 0), Vector3(-1, -0.5, -0.6), 0.8)
	_grip(P, 0, head + ax * 0.44, ax, out + Vector3(-0.3, 0, 0), Vector3(1, -0.5, -0.6), 0.8)
	P.spine = Vector3(0.18, -s * 0.18, s * 0.05)
	P.head = Vector2(s * 0.25, -0.35)
	P.hip_dy = -0.02
	P.looks = false
	P.eye = "open" if fmod(at, 7.0) < 5.5 else "happy"
	P.mouth = "smile"
	_broom = [head, ax]

var _broom := [Vector3.ZERO, Vector3.UP]

# ======================================================================
# props
# ======================================================================
func _solid(c: Color) -> ShaderMaterial:
	var img := Image.create(4, 4, false, Image.FORMAT_RGB8)
	img.fill(c)
	var m := ShaderMaterial.new()
	m.shader = SHADER
	m.set_shader_parameter("albedo_tex", ImageTexture.create_from_image(img))
	return m

func _part(parent_n: Node3D, mesh: Mesh, mat: Material, at: Vector3, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = at
	mi.rotation = rot
	parent_n.add_child(mi)
	meshes.append(mi)
	return mi

func _cyl(r1: float, r2: float, h: float, seg := 10) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = r1; c.bottom_radius = r2; c.height = h; c.radial_segments = seg; c.rings = 1
	return c

func _box(x: float, y: float, z: float) -> BoxMesh:
	var bx := BoxMesh.new()
	bx.size = Vector3(x, y, z)
	return bx

func _make_props() -> void:
	var wood := _solid(Color(0.62, 0.42, 0.24))
	var straw := _solid(Color(0.93, 0.78, 0.38))
	var red := _solid(Color(0.8, 0.22, 0.2))
	var white := _solid(Color(0.97, 0.96, 0.92))
	var blue := _solid(Color(0.45, 0.68, 0.9))
	var silver := _solid(Color(0.82, 0.84, 0.86))
	var green := _solid(Color(0.36, 0.68, 0.42))
	# the broom: its head at the origin, the handle up +y (1.15 m)
	var broom := Node3D.new(); broom.name = "Broom"
	skel.add_child(broom)
	_part(broom, _cyl(0.014, 0.014, 1.1), wood, Vector3(0, 0.6, 0))
	_part(broom, _cyl(0.05, 0.09, 0.2, 12), straw, Vector3(0, 0.06, 0))
	_part(broom, _cyl(0.052, 0.052, 0.025, 12), red, Vector3(0, 0.15, 0))
	props.broom = broom
	# the cloth: under the right palm
	var cloth := Node3D.new(); cloth.name = "Cloth"
	skel.add_child(cloth)
	_part(cloth, _box(0.2, 0.025, 0.16), white, Vector3(0, -0.01, 0))
	_part(cloth, _box(0.162, 0.027, 0.02), blue, Vector3(0, 0, 0.04))
	props.cloth = cloth
	# the tray with a teapot and two cups: its centre at the origin
	var tray := Node3D.new(); tray.name = "Tray"
	skel.add_child(tray)
	_part(tray, _cyl(0.2, 0.19, 0.02, 20), silver, Vector3(0, 0.01, 0))
	var pot := SphereMesh.new(); pot.radius = 0.065; pot.height = 0.11; pot.radial_segments = 12; pot.rings = 6
	_part(tray, pot, white, Vector3(-0.05, 0.075, 0.02))
	_part(tray, _cyl(0.012, 0.012, 0.025), white, Vector3(-0.05, 0.14, 0.02))
	_part(tray, _cyl(0.008, 0.012, 0.07, 6), white, Vector3(0.02, 0.09, 0.02), Vector3(0, 0, -0.9))
	_part(tray, _cyl(0.03, 0.025, 0.045, 10), blue, Vector3(0.09, 0.043, -0.06))
	_part(tray, _cyl(0.03, 0.025, 0.045, 10), blue, Vector3(0.08, 0.043, 0.09))
	props.tray = tray
	# the watering can: the handle's grip at the origin, the spout forward (+z)
	var can := Node3D.new(); can.name = "Can"
	skel.add_child(can)
	_part(can, _cyl(0.08, 0.085, 0.17, 14), green, Vector3(0, -0.13, 0.0))
	_part(can, _cyl(0.012, 0.012, 0.13, 6), green, Vector3(0, -0.015, 0.0), Vector3(0, 0, 0))
	_part(can, _box(0.025, 0.02, 0.12), green, Vector3(0, 0.0, 0.0))
	_part(can, _cyl(0.012, 0.02, 0.26, 8), green, Vector3(0, -0.08, 0.17), Vector3(1.0, 0, 0))
	_part(can, _cyl(0.03, 0.012, 0.03, 8), silver, Vector3(0, 0.02, 0.275), Vector3(1.0, 0, 0))
	props.can = can
	# the water from the rose
	var sm2 := StandardMaterial3D.new()
	sm2.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm2.albedo_color = Color(0.7, 0.88, 1.0, 0.55)
	sm2.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_stream = MeshInstance3D.new()
	_stream.mesh = _cyl(0.02, 0.05, 1.0, 8)
	_stream.material_override = sm2
	_stream.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_stream.set_meta("no_ink", true)
	skel.add_child(_stream)
	for k in props: (props[k] as Node3D).visible = false
	_stream.visible = false

func _show_prop(n: String, on: bool) -> void:
	var p: Node3D = props[n]
	if p.visible != on: p.visible = on

func _props_place() -> void:
	var main := act if fade > 0.5 or prev == "" else prev
	var rh: int = arms[1].hand
	# what's in his hands: the act's prop, or what he carries on the way
	var broom := main == "sweep" or (carry == "broom" and main == "")
	var cloth := main == "wipe"
	var tray := main in ["tray", "serve"] and not (main == "serve" and act_t > 1.9) or (carry == "tray" and main == "")
	var can := main == "water" or (carry == "can" and main == "")
	_show_prop("broom", broom)
	_show_prop("cloth", cloth)
	_show_prop("tray", tray)
	_show_prop("can", can)
	var hr: Transform3D = G[rh]
	var rb := hr.basis.orthonormalized()
	# the right hand's frame: x along the fingers (rest -x for the right hand), y its back
	var rfd := (rb * (rest_g[rh].basis.inverse() * Vector3(-1, 0, 0))).normalized()
	var rbk := (rb * (rest_g[rh].basis.inverse() * Vector3.UP)).normalized()
	var palm := hr.origin + rfd * 0.1 - rbk * 0.04
	if broom:
		var p: Node3D = props.broom
		if main == "sweep":
			p.transform = Transform3D(frame(_broom[1], Vector3(0, 0, 1)), _broom[0])
		else:
			# carried: held upright at his side by the handle
			p.transform = Transform3D(frame(Vector3(0, 1, 0.12), Vector3(0, 0, 1)), palm - Vector3(0, 0.62, 0) + rbk * 0.0)
	if cloth:
		(props.cloth as Node3D).transform = Transform3D(frame(-rbk, rfd), palm - rbk * 0.035)
	if tray:
		var tp: Node3D = props.tray
		if main == "serve" and act_t > 1.2:
			pass   # left where it was set down until he lets go
		else:
			var up := -rbk
			tp.transform = Transform3D(frame(up.lerp(Vector3.UP, 0.7).normalized(), Vector3(0, 0, 1)), palm + up * 0.04)
		if main == "" and carry == "tray": pass
	if can:
		var cp: Node3D = props.can
		# the grip in the palm, the spout the way the fingers point
		var f := rfd
		f.y = 0.0
		if f.length_squared() < 1e-4: f = Vector3(0, 0, 1)
		var tilt := 0.0
		if main == "water": tilt = sm(0.6, 1.4, act_t) * 0.75
		var bas := Basis(Vector3.UP, atan2(f.x, f.z)) * Basis(Vector3.RIGHT, tilt)
		cp.transform = Transform3D(bas, palm + Vector3(0, -0.02, 0))
		var pouring := main == "water" and tilt > 0.45
		if _stream.visible != pouring: _stream.visible = pouring
		if pouring:
			var rose: Vector3 = cp.transform * Vector3(0, 0.02, 0.29)
			var ground := Vector3(rose.x, 0.0, rose.z) + bas.z * 0.12
			var dv := ground - rose
			_stream.transform = Transform3D(frame(-dv, Vector3(0, 0, 1)) * Basis.from_scale(Vector3(1, dv.length(), 1)), (rose + ground) * 0.5)
	elif _stream.visible: _stream.visible = false
