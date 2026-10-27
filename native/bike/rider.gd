class_name BikeRider
extends RefCounted
# A person on a bicycle (CastActor.rider): the riding pose built on top of the
# idle clip each frame, in the skeleton's space, with the two-bone IK the idle
# acting uses (idles.gd _ik):
#   - the hips on the saddle (or up off it, standing on the pedals), the trunk
#     leaning forward far enough for the hands to reach the bars (more with speed),
#     the head kept up looking ahead
#   - the hands on the grips (wrists over them, fingers curled round), following
#     the bars as they steer; the thumb flicks the bell
#   - the feet on the pedals, the ball of the foot over the spindle, ankling
#     through the stroke; at a stop the left foot down on the ground and the hips
#     forward off the saddle
#   - mounting: the hands to the bars, the right leg swung over the back wheel,
#     the left foot up last; dismounting the same backwards and the kickstand
#     flicked down with the left foot
# The actor stands at the bike's own transform (lean included) while riding; the
# owner sets that, the bike's pose (bike_model.gd pose()) and these fields first.
#
#   var r := BikeRider.new(actor, bike_model)   # actor.rider = r
#   r.on = 1.0; r.speed = v; r.mount = 1.0 (0 standing beside it .. 1 riding)

var A: CastActor
var B: BikeModel
var on := 0.0            # 0 not riding (nothing done) .. 1
var mount := 1.0         # 0 standing at the left of the bike .. 1 seated (the mount / dismount runs this)
var mounting := true     # which way mount is going (true: getting on)
var speed := 0.0         # m/s (the cloth's air)
var lean_fwd := 0.0      # extra trunk lean with speed (radians)
var stand := 0.0         # 0 seated .. 1 standing on the pedals
var foot_down := 0.0     # 0 both feet on the pedals .. 1 the left foot on the ground (stopped)
var bell := 0.0          # 0..1 the thumb on the bell lever (left hand)
var kick_foot := 0.0     # 0..1 the left foot at the kickstand (dismount's end)
var look := 0.0          # radians the head turns (+ left)
var air := 0.0           # 0..1 a hop: legs and arms soak it up
var squash := 0.0        # 0..1 landing: knees and elbows bend
var side_spot := Vector3(0.48, 0.0, -0.12)    # (bike-local) where he stands to get on and off
var t := 0.0
var _bones := {}
var _lean := 0.0         # the trunk's lean, solved for the reach (kept from frame to frame)
var _stand_xf := {}      # the standing pose's points (skeleton space) at the mount's start
var cloth_caps: Array = []   # the saddle (world capsules for the cloth: cloth.gd obstacles)
var rel := Transform3D.IDENTITY   # bike-local -> the actor's own frame (getting on, he stands upright while it leans)

const TRUNK := ["Waist", "Hips", "Spine1", "Spine2", "Spine3", "Neck", "Head"]

func _init(a: CastActor, b: BikeModel) -> void:
	A = a
	B = b
	for n in A.bones: _bones[n] = A.bones[n]

func _bi(n: String) -> int: return _bones.get(n, -1)

# the seatpost set for this rider's legs: at the bottom of the stroke the knee keeps
# a little bend (hip to ankle = 0.93 of the leg), as a bike shop would set it
func fit_bike() -> void:
	var sk0: Skeleton3D = A.skel
	var hip := sk0.get_bone_global_rest(_bi("LThigh")).origin
	var knee := sk0.get_bone_global_rest(_bi("LLeg")).origin
	var ank := sk0.get_bone_global_rest(_bi("LFoot")).origin
	var leg := (hip.distance_to(knee) + knee.distance_to(ank)) * A.k
	var want := leg * 0.93
	var post := B.post
	for i in 6:
		B.fit_post(post)
		var h := B.saddle() + Vector3(0, 0.082, -0.03) * B.s
		var pd := B.BB + Vector3(0, -B.CRANK, 0) + Vector3(0.0, 0.012 * B.s, 0.0)
		var an := pd + Vector3(0, (0.03 + 0.053) * A.k, -0.0935 * A.k)
		var d := h.distance_to(an)
		post += (want - d) * 0.95
	B.fit_post(post)

# bike-local -> skeleton space (the actor stands at the bike's transform; the model's
# holder only moves and scales)
func sk(p: Vector3) -> Vector3:
	return (rel * p - A.holder.position) / A.k

static func _sm(a: float, b: float, x: float) -> float:
	var u := clampf((x - a) / (b - a), 0.0, 1.0)
	return u * u * (3.0 - 2.0 * u)

# the foot's pitch on a pedal at this crank angle (+ toes down): ankling through the stroke
static func foot_pitch(cr: float, sd: float) -> float:
	var th := cr + (PI if sd > 0.0 else 0.0)    # the arm's angle from straight up
	return 0.13 - 0.14 * cos(th - 0.35)

# ---------- the frame (CastActor.animate, after the clips) ----------
# (the bones' frames are worked out down each chain from the trunk once, not from the
# root for every bone: about a fifth of the cost of looking each one up)
func _loc(bi: int) -> Transform3D:
	return Transform3D(Basis(A.q[bi]), A.waist_pos if bi == A.waist else A.rest_pos[bi])

# two-bone IK under a parent frame pg (skeleton space): b1 aimed and twisted so b3 lands on T
# with the middle joint toward pole; b2 bent about its hinge axis (rest frame) by sign hs.
# Returns b2's frame (for orienting b3)
func _ik2(pg: Transform3D, b1: int, b2: int, b3: int, T: Vector3, pole: Vector3, hax: Vector3, hs: float) -> Transform3D:
	var G1 := pg * _loc(b1)
	var p1 := G1.origin
	var a: float = (A.rest_pos[b2] as Vector3).length()
	var c: float = (A.rest_pos[b3] as Vector3).length()
	var d := clampf(T.distance_to(p1), absf(a - c) + 1e-4, (a + c) * 0.9995)
	var bend := acos(clampf((d * d - a * a - c * c) / (2.0 * a * c), -1.0, 1.0))
	A.q[b2] = A.rest_q[b2] * Quaternion(hax, hs * bend)
	var G2 := G1 * _loc(b2)
	var G3 := G2 * _loc(b3)
	# the limb is not quite straight at rest: one Newton step on the reach (as idles.gd)
	var d0 := G3.origin.distance_to(p1)
	var sb := sin(bend)
	if sb > 0.05 and absf(d0 - d) > 1e-6:
		bend = clampf(bend + (d0 - d) * d0 / (a * c * sb), 0.0, PI - 0.01)
		A.q[b2] = A.rest_q[b2] * Quaternion(hax, hs * bend)
		G2 = G1 * _loc(b2)
		G3 = G2 * _loc(b3)
	var v3 := (G3.origin - p1).normalized()
	var dir := (T - p1).normalized()
	var q1 := Quaternion(v3, dir) if v3.dot(dir) > -0.999 else Quaternion(v3.cross(Vector3.UP).normalized(), PI)
	var kk := q1 * (G2.origin - p1)
	kk -= dir * kk.dot(dir)
	var pp := pole - dir * pole.dot(dir)
	if kk.length_squared() > 1e-10 and pp.length_squared() > 1e-8:
		kk = kk.normalized(); pp = pp.normalized()
		q1 = Quaternion(dir, atan2(kk.cross(pp).dot(dir), kk.dot(pp))) * q1
	var w1 := q1 * G1.basis.get_rotation_quaternion()
	A.q[b1] = (pg.basis.get_rotation_quaternion().inverse() * w1).normalized()
	return pg * _loc(b1) * _loc(b2)

# set a bone's orientation (skeleton space) under its parent's frame pg, blended by w
func _orient2(pg: Transform3D, bi: int, qr: Quaternion, w: float) -> void:
	A.q[bi] = A.q[bi].slerp((pg.basis.get_rotation_quaternion().inverse() * qr).normalized(), w)

var _ix := {}
func _idx() -> void:
	for n in ["Waist", "Hips", "Spine1", "Spine2", "Spine3", "LShoulder", "RShoulder", "LArmA", "RArmA", "LForeArm", "RForeArm",
			"LHand", "RHand", "LThigh", "RThigh", "LLeg", "RLeg", "LFoot", "RFoot"]:
		_ix[n] = _bi(n)

func apply(dt: float) -> void:
	if on <= 0.001: return
	if _ix.is_empty(): _idx()
	t += dt
	var I := A.idles
	if I.P.act != null: I._end()
	I.P.wait = maxf(I.P.wait, 4.0)
	var m := clampf(mount, 0.0, 1.0)
	var me := _sm(0.0, 1.0, m)
	# the base: the idle pose, stood at the side spot (where he walked up to the bike)
	var blend := on < 0.999
	var base_q: Array = A.q.duplicate() if blend else []
	var stand_off := sk(side_spot) - sk(Vector3.ZERO)
	stand_off.y = 0.0
	var base_wp := A.waist_pos + stand_off
	A.waist_pos = base_wp
	var st := {}
	if m < 1.0:
		for n in ["Hips", "LFoot", "RFoot", "LHand", "RHand"]: st[n] = A.gxf(_bi(n)).origin
	# ---- the trunk ----
	for n in TRUNK:
		var bi := _bi(n)
		if bi >= 0: A.q[bi] = A.rest_q[bi].slerp(A.q[bi], 0.35)   # mostly the rest pose, a little of the idle's life
	var lean_want := clampf(_lean + lean_fwd, 0.05, 0.9)
	var pel := lean_want * 0.35 * me
	A.bend("Waist", 1, 0, 0, pel)
	var sp := lean_want * me - pel
	A.bend("Spine1", 1, 0, 0, sp * 0.3)
	A.bend("Spine2", 1, 0, 0, sp * 0.4 + 0.12 * stand * me)
	A.bend("Spine3", 1, 0, 0, sp * 0.3)
	# the head up, looking ahead (and where he's going)
	A.bend("Neck", 1, 0, 0, -(lean_want * 0.45 + pel * 0.2) * me)
	A.bend("Head", 1, 0, 0, -(lean_want * 0.35) * me)
	A.bend("Neck", 0, 1, 0, look * 0.4 * me)
	A.bend("Head", 0, 1, 0, look * 0.5 * me)
	# the shoulders forward to the bars
	A.bend("LShoulder", 0, 1, 0, 0.18 * me)
	A.bend("RShoulder", 0, 1, 0, -0.18 * me)
	# ---- the hips: from standing to the saddle, over the back ----
	var root: Transform3D = A.gxf(A.skel.get_bone_parent(A.waist))
	var GW := root * _loc(A.waist)
	var hips_now := (GW * _loc(_ix.Hips)).origin
	var seat := sk(B.saddle() + Vector3(0, 0.082, -0.03) * B.s)
	seat += Vector3(0, 0.13, 0.13) / A.k * stand
	seat += Vector3(0, -0.07, 0.14) / A.k * foot_down
	var up := Vector3(0, 0.22, 0) / A.k * sin(me * PI) * (1.0 if mounting else 0.6)
	var hips_want: Vector3 = (st.Hips as Vector3).lerp(seat, me) + up * 0.5 if m < 1.0 else seat
	A.waist_pos += hips_want - hips_now
	GW = root * _loc(A.waist)
	var GH := GW * _loc(_ix.Hips)
	var G3 := GW * _loc(_ix.Spine1) * _loc(_ix.Spine2) * _loc(_ix.Spine3)
	# ---- the reach: lean more or less so the hands land on the grips ----
	if me > 0.5:
		var reach := 0.0
		var arm := 0.0
		for i in 2:
			var s := "L" if i == 0 else "R"
			var sh := (G3 * _loc(_ix[s + "Shoulder"]) * _loc(_ix[s + "ArmA"])).origin
			reach += sh.distance_to(sk(B.grip(1.0 - 2.0 * i))) * 0.5
			arm += ((A.rest_pos[_ix[s + "ForeArm"]] as Vector3).length() + (A.rest_pos[_ix[s + "Hand"]] as Vector3).length()) * 0.5
		_lean = clampf(_lean + (reach - arm * 0.86) * 2.2 * minf(1.0, dt * 8.0), 0.0, 0.75)
	# ---- the arms ----
	for i in 2:
		var s := "L" if i == 0 else "R"
		var sd := 1.0 if i == 0 else -1.0
		var g := B.grip(sd)
		var wrist := sk(g + Vector3(-sd * 0.012, 0.03, -0.045) * B.s)
		if s == "L" and bell > 0.0: wrist += Vector3(-0.03, 0.012, 0.01) / A.k * bell
		var aw := _sm(0.0, 0.35, m) if mounting else _sm(0.15, 0.6, m)
		var T: Vector3 = (st[s + "Hand"] as Vector3).lerp(wrist, aw) if m < 1.0 else wrist
		var pole := Vector3(sd * 0.9, -0.6, -0.5).normalized()
		var b1: int = _ix[s + "ArmA"]
		var b2: int = _ix[s + "ForeArm"]
		var hb: int = _ix[s + "Hand"]
		var GS := G3 * _loc(_ix[s + "Shoulder"])
		var GF := _ik2(GS, b1, b2, hb, T, pole, A.ax_y[b2], sd)
		if squash > 0.001:
			A.bend(s + "ForeArm", 0, 1, 0, sd * 0.25 * squash)
			GF = GS * _loc(b1) * _loc(b2)
		# the hand: knuckles forward over the grip, palm down round it
		if aw > 0.01:
			var hp := (GF * _loc(hb)).origin
			var fwd := (sk(g + Vector3(sd * 0.02, -0.005, 0.03) * B.s) - hp).normalized()
			var q0 := Quaternion(Vector3(sd, 0, 0), fwd)
			# roll so the palm faces down onto the grip (the thumb toward the stem)
			var palm := q0 * Vector3.DOWN
			var want_palm := Vector3(-sd * 0.25, -1.0, 0.15).normalized()
			want_palm = (want_palm - fwd * want_palm.dot(fwd)).normalized()
			var roll := atan2(palm.cross(want_palm).dot(fwd), palm.dot(want_palm))
			_orient2(GF, hb, Quaternion(fwd, roll) * q0 * A.rest_w[hb].inverse(), aw)
			# fingers round the grip, the thumb under it
			var curl := aw * (0.95 if not (s == "L" and bell > 0.3) else 0.6)
			for f in ["B", "C", "D"]:
				for j in 3:
					A.bend(s + "Finger" + f + str(j + 1), 0, 0, 1, -sd * curl * (0.9 if j == 0 else 1.1))
			A.bend(s + "FingerA1", 0, 1, 0, sd * 0.4 * aw)
			A.bend(s + "FingerA2", 0, 0, 1, -sd * 0.5 * aw * (1.0 - bell if s == "L" else 1.0))
	# ---- the legs ----
	var ball := Vector3(0, -0.053, 0.0935)    # ankle to the ball of the foot (skeleton units, the foot flat)
	for i in 2:
		var s := "L" if i == 0 else "R"
		var sd := 1.0 if i == 0 else -1.0
		var fb: int = _ix[s + "Foot"]
		var pitch: float = _pitch[i]
		var Q := Quaternion(Vector3.RIGHT, pitch)
		var pd := sk(B.pedal(sd)) + Vector3(0, 0.03, 0)
		var T := pd - Q * ball
		var foot_q := Q * A.rest_w[fb].inverse()
		# the left foot down at a stop: beside the bike, flat on the ground
		if s == "L" and foot_down > 0.001:
			var gp := _ground_local(Vector3(0.3 * B.s, 0.0, B.BB.z + 0.06 * B.s))
			var gT := sk(gp) + Vector3(0, 0.083, 0) - Vector3(0, 0, 0.03)
			T = T.lerp(gT, foot_down)
			foot_q = foot_q.slerp(A.rest_w[fb].inverse(), foot_down)
		# getting on / off: from the standing foot, the right leg swung high over the back
		if m < 1.0:
			var stand_foot: Vector3 = st[s + "Foot"]
			if s == "R":
				var u := _sm(0.12, 0.85, m)
				var over := sk(Vector3(-0.05, B.saddle().y + 0.2 * B.s, B.saddle().z - 0.35 * B.s))
				var a1 := stand_foot.lerp(over, _sm(0.0, 0.5, u))
				T = a1.lerp(T, _sm(0.5, 1.0, u))
				T.y += sin(u * PI) * 0.12 / A.k
			else:
				T = stand_foot.lerp(T, _sm(0.55, 1.0, m))
				if kick_foot > 0.0:
					T = T.lerp(sk(B.kick_tip() + Vector3(0.02, 0.06, 0.04)), kick_foot)
			foot_q = A.rest_w[fb].inverse().slerp(foot_q, me)
		var pole := Vector3(sd * 0.18, 0.15, 1.0).normalized()
		var lb: int = _ix[s + "Leg"]
		var GL := _ik2(GH, _ix[s + "Thigh"], lb, fb, T, pole, A.ax_x[lb], 1.0)
		_orient2(GL, fb, foot_q, 1.0)
	# blend in from the plain pose (the first instants of getting on)
	if blend:
		for bi in A.used: A.q[bi] = base_q[bi].slerp(A.q[bi], on)
		A.waist_pos = base_wp.lerp(A.waist_pos, on)
	A.skel.set_bone_pose_position(A.waist, A.waist_pos)
	_cloth_caps()

var _pitch := [0.0, 0.0]
func set_pitch(l: float, r: float) -> void:
	_pitch = [l, r]

# a point on the ground under a bike-local point (the bike may lean), back in bike-local
func _ground_local(p: Vector3) -> Vector3:
	var gx: Transform3D = B.global_transform
	var w := gx * p
	var g = A.get("ground")
	var gy := gx.origin.y
	if g is Callable and (g as Callable).is_valid(): gy = float((g as Callable).call(w.x, w.z))
	w.y = gy
	return gx.affine_inverse() * w

# the saddle as a capsule for the cloth (the jacket's tails rest on it, not through it)
func _cloth_caps() -> void:
	if A.cloth == null or not B.is_inside_tree(): return
	var gx: Transform3D = B.global_transform
	var sa := B.saddle()
	var a := gx * (sa + Vector3(0, -0.035, 0.1) * B.s)
	var b := gx * (sa + Vector3(0, -0.04, -0.07) * B.s)
	A.cloth.obstacles = [[a, b, 0.07 * B.s]]
