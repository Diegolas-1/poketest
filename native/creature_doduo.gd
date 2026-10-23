class_name CreatureDoduo
extends Creature
# Doduo (Farmer Ben's). Rig: Waist (the round body) - Hips - L/RThigh - Leg -
# Foot (four toes A..D), and two necks off the body, L/RNeck1..3 - Head with
# an upper and a lower beak. L is the bird's left (+x). The bind pose stands
# straight: legs and necks plumb.
#
# ---- the gait ----
# One cycle is two steps. Each foot is planted (its world point and heading
# frozen: it cannot slide) or swinging: it lifts, travels to where the body
# will be when it lands plus half the ground it covers in stance, and plants.
# The cycle length grows with speed (a stroll to a sprint) and the beat is
# speed / cycle, so the body covers exactly what the feet do; the stance part
# of the cycle (duty) shrinks from 0.62 at a walk (both feet down between
# steps) to 0.36 at a run (both off the ground between steps: the bounce).
# The legs reach their feet with a two-bone IK (knee behind, as a bird's);
# the body rides on them: up over the stance leg at a walk, down into it at
# a run (spring), leaning into speed, rolling over the foot that carries it.
# Standing, a foot left out of place by a turn or a stop takes its own small
# step back under the body (the shuffle).
#
# ---- the heads ----
# Each head has its own mind: it looks round, glances at the other head,
# watches look_at_pos, pecks at the ground, preens its shoulder, dozes (one
# eye shut, the neck sagging, a start awake) while the other keeps watch.
# Looks bend the neck from the base up (more at the head); a peck reaches for
# a point on the ground with a few CCD passes on the neck, the body tipping
# forward to help. The eye sheet (doduo_eye1: 2 x 4 faces) gives each head
# its own expression. Moods: "happy" (both heads up, a hop on the spot,
# happy eyes), "call" (heads up, beaks wide: Do-do!), "talk" (beaks chatter),
# "argue" (the heads face each other and bicker), "peck", "stamp".
# Asleep it settles down on its folded legs, heads tucked onto its back.

const WALK_DUTY := 0.62
const RUN_DUTY := 0.36
const FOOT_W := 0.072             # half the stance width
const ANKLE_H := 0.062

var legs := []                    # per side: {thigh, leg, foot, toes, sg, p (world), yaw, u (-1 planted), from, to, toyaw, dur}
var phase := 0.0
var cyc := 0.8
var duty := WALK_DUTY
var run_w := 0.0
var L1 := 0.226
var L2 := 0.205
var hip0 := 0.548                 # rest height of the hip joint (Waist)
var hip_y := 0.5
var _vel := Vector3.ZERO
var _last_pos := Vector3(NAN, NAN, NAN)
var _last_frame := 0
var _need_reset := true
var t := 0.0
var lean := 0.0
var roll := Vector2.ZERO
var bob := Vector2.ZERO
var heads := []                   # per head: {neck: [n1, n2, n3, head], up, lo, mat, yaw, pitch (springs), act, ...}
var mood_t := -1.0
var mood_k := ""
var stamp_t := -1.0
var sit_w := 0.0
var crouch := 0.0                 # body lowered (pecks)
var _yaw_last := NAN
var turn_v := 0.0

func _setup() -> void:
	t = rng.randf() * 10.0
	hip0 = rest_at(b("Waist")).y
	for s in [["L", 1.0], ["R", -1.0]]:
		var th := b(s[0] + "Thigh")
		var lg := b(s[0] + "Leg")
		var ft := b(s[0] + "Foot")
		L1 = rest_at(th).distance_to(rest_at(lg))
		L2 = rest_at(lg).distance_to(rest_at(ft))
		var toes := []
		for tn in ["A", "B", "C", "D"]: toes.append([b(s[0] + "Toe" + tn + "1"), b(s[0] + "Toe" + tn + "2")])
		legs.append({"thigh": th, "leg": lg, "foot": ft, "toes": toes, "sg": s[1], "p": Vector3.ZERO, "yaw": 0.0, "u": -1.0,
			"from": Vector3.ZERO, "to": Vector3.ZERO, "toyaw": 0.0, "fromyaw": 0.0, "dur": 0.3, "h": 0.08})
	for s in [["L", 1.0], ["R", -1.0]]:
		var m: ShaderMaterial = mat_by.get("doduo_eye1_" + s[0].to_lower() + "head", null)
		heads.append({"n": [b(s[0] + "Neck1"), b(s[0] + "Neck2"), b(s[0] + "Neck3"), b(s[0] + "Head")], "up": b(s[0] + "UpperBeak"),
			"lo": b(s[0] + "LowerBeak"), "tip": b("End" + s[0] + "UpperBeak"), "sg": s[1], "mat": m,
			"yaw": Vector2.ZERO, "pitch": Vector2.ZERO, "lean": Vector2.ZERO, "act": "look", "at": 0.0, "dur": 2.0,
			"gy": 0.0, "gp": 0.0, "blink": rng.randf_range(1.0, 4.0), "eye": "", "beak": 0.0, "doze": 0.0, "peck": 0.0, "pk": Vector3.ZERO,
			"preen": 0.0, "q": []})

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
	match what:
		"stamp": stamp_t = 0.0
		"peck":
			for h in heads: if h.act != "peck": _head_act(h, "peck"); break
		_:
			mood_k = what; mood_t = 0.0
			if what == "happy": hops += 1

func busy() -> bool:
	return mood_t >= 0.0 and mood_k in ["happy", "call", "argue"]

func contacts() -> Array:
	var out := []
	for l in legs: out.append(to_world(G[l.foot].origin) if l.u < 0.0 and stamp_t < 0.0 else null)
	return out

# where a foot stands under the body at rest
func _neutral(l: Dictionary, yaw: float, ahead: float) -> Vector3:
	var f := Vector3(sin(yaw), 0, cos(yaw))
	var side := Vector3(cos(yaw), 0, -sin(yaw))   # the bird's left (+x at yaw 0)
	var p: Vector3 = global_position + side * (FOOT_W * float(l.sg)) + f * (ahead - 0.012)
	p.y = global_position.y
	return p

# ---------- the frame ----------
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
	sit_w = damp(sit_w, 1.0 if sleep else 0.0, 1.4, dt)
	if mood_t >= 0.0:
		mood_t += dt
		if mood_t > {"happy": 1.6, "call": 1.4, "talk": 1.0, "argue": 2.6}.get(mood_k, 1.2): mood_t = -1.0
	_gait(dt, v)
	_body(dt, v)
	_legs_ik()
	_necks(dt, v)

func _gait(dt: float, v: float) -> void:
	run_w = damp(run_w, sm(1.6, 3.0, v), 5.0, dt)
	cyc = damp(cyc, clampf(0.3 + 0.27 * v, 0.4, 1.3), 5.0, dt)
	duty = lerpf(WALK_DUTY, RUN_DUTY, run_w)
	var yaw := global_rotation.y
	var moving := v > 0.08 and sit_w < 0.3
	var rate := v / cyc
	var ph0 := phase
	if moving: phase += rate * dt
	var swing := (1.0 - duty) / maxf(rate, 0.5)    # seconds in the air
	for i in 2:
		var l: Dictionary = legs[i]
		var off := 0.5 * i
		var late := false
		if moving and l.u < 0.0:
			# left behind (setting off, a change of pace): step now and take up the beat from here
			var nb := _neutral(l, yaw, 0.0)
			var behind := Vector2(l.p.x - nb.x, l.p.z - nb.z).length()
			if (legs[1 - i].u < 0.0 and behind > cyc * duty * 0.5 + 0.06) or behind > 0.3:
				late = true
				phase = off + floor(phase - off) + 1e-4
		if moving and l.u < 0.0 and (late or floor(phase - off) > floor(ph0 - off)):
			# lift: land where the body will be, half a stance ahead of it
			var lead := cyc * duty * 0.5
			var land := _neutral(l, yaw + turn_v * swing, lead) + _vel * swing
			l.from = l.p; l.fromyaw = l.yaw
			l.to = land; l.toyaw = yaw + turn_v * swing
			l.dur = swing; l.u = 0.0
			l.h = lerpf(0.06, 0.13, run_w) + v * 0.01
		elif not moving and l.u < 0.0 and legs[1 - i].u < 0.0 and sit_w < 0.3:
			# standing: a foot out of place steps back under the body
			var want := _neutral(l, yaw, 0.0)
			var off2 := Vector2(l.p.x - want.x, l.p.z - want.z).length()
			if off2 > 0.09 or absf(wrapf(l.yaw - yaw, -PI, PI)) > 0.5:
				l.from = l.p; l.fromyaw = l.yaw; l.to = want; l.toyaw = yaw
				l.dur = 0.26; l.u = 0.0; l.h = 0.05
		if l.u >= 0.0:
			l.u = minf(1.0, l.u + dt / maxf(0.08, l.dur))
			if moving:
				# keep the landing up to date with the body (a turn, a change of pace)
				var left: float = (1.0 - float(l.u)) * float(l.dur)
				var lead2 := cyc * duty * 0.5
				var tgt: Vector3 = _neutral(l, yaw + turn_v * left, lead2) + _vel * left
				l.to = l.to.lerp(tgt, 1.0 - exp(-dt * 6.0))
				l.toyaw = yaw + turn_v * left
			if l.u >= 1.0:
				l.p = l.to; l.yaw = l.toyaw; l.u = -1.0
				footfalls += 1
	# the stamp: the right foot comes down hard twice
	if stamp_t >= 0.0:
		stamp_t += dt
		if stamp_t > 1.1: stamp_t = -1.0

# a foot's point this frame (world) and its lift
func _foot(l: Dictionary) -> Array:
	if l.u < 0.0:
		var p: Vector3 = l.p
		var lift := 0.0
		if stamp_t >= 0.0 and l.sg < 0.0:
			lift = maxf(0.0, sin(stamp_t * TAU * 1.8)) * 0.09 * (1.0 - sm(0.8, 1.1, stamp_t))
		return [p + Vector3.UP * lift, 0.0, l.yaw]
	var u: float = l.u
	var e := u * u * (3.0 - 2.0 * u)
	var p2: Vector3 = (l.from as Vector3).lerp(l.to, e)
	var h: float = l.h * sin(PI * minf(1.0, u * 1.15))
	return [p2 + Vector3.UP * h, u, lerp_angle(float(l.fromyaw), float(l.toyaw), e)]

func _body(dt: float, v: float) -> void:
	# height over the feet: a vault at a walk, a spring at a run
	var stance_bob := 0.0
	var any_down := false
	for l in legs:
		if l.u < 0.0:
			any_down = true
	var ph := fposmod(phase, 0.5) * 2.0          # 0..1 over each step
	var walk_b := -cos(ph * TAU) * 0.018 * sm(0.1, 0.6, v)
	var run_b := (cos(ph * TAU) * 0.035 + 0.02) * run_w
	stance_bob = walk_b * (1.0 - run_w) + run_b
	if not any_down and run_w > 0.5: stance_bob += 0.01
	var happy := 0.0
	if mood_t >= 0.0 and mood_k == "happy":
		var u := mood_t
		happy = maxf(0.0, sin(clampf((u - 0.2) / 0.5, 0.0, 1.0) * PI)) * 0.16 + maxf(0.0, sin(clampf((u - 0.8) / 0.4, 0.0, 1.0) * PI)) * 0.08
	var base := hip0 * 0.955 - crouch * 0.17 - sm(0.0, 1.0, run_w) * 0.03
	var breath := sin(t * 1.9) * 0.004
	var want_y := base + stance_bob + breath + happy
	want_y = lerpf(want_y, 0.27, sit_w)
	bob = spring(bob, want_y, 18.0, dt, 0.8)
	hip_y = bob.x
	# never higher than the planted feet can reach (a stretched leg would drag its foot)
	var drop := hip0 - rest_at(legs[0].thigh).y
	for l in legs:
		if l.u >= 0.0 or sit_w > 0.5: continue
		var pl := to_skel(l.p)
		var hx := Vector2(pl.x - rest_at(l.thigh).x, pl.z - rest_at(l.thigh).z).length() + lean * 0.05
		var r2 := (L1 + L2) * 0.985
		if hx < r2: hip_y = minf(hip_y, pl.y + ANKLE_H + sqrt(r2 * r2 - hx * hx) + drop)
	# lean into speed and into a peck; roll over the foot that carries it
	var lw := 0.06 + v * 0.07 + crouch * 1.0 - sit_w * 0.05
	lean = damp(lean, clampf(lw, -0.1, 1.05), 6.0, dt)
	var r := 0.0
	for l in legs:
		if l.u < 0.0: r += float(l.sg)
	r *= 0.035 * sm(0.1, 0.8, v) * (1.0 - run_w * 0.5)
	r += clampf(-turn_v * v * 0.04, -0.2, 0.2)
	roll = spring(roll, r, 9.0, dt, 0.7)
	var wst := b("Waist")
	var basis := Basis(Vector3.RIGHT, lean) * Basis(Vector3(0, 0, 1), -roll.x)
	basis = Basis(Vector3.UP, sin(phase * TAU) * 0.05 * sm(0.1, 1.0, v)) * basis
	var wp := Vector3(0, hip_y, rest_at(wst).z + lean * 0.02 - sit_w * 0.02)
	wp.x = -roll.x * 0.05
	set_local_pos(wst, rest_g[parent[wst]].affine_inverse() * wp)
	set_global(wst, basis * rest_g[wst].basis)
	_tg_waist = rest_g[parent[wst]] * Transform3D(rest_g[parent[wst]].basis.inverse() * basis * rest_g[wst].basis, rest_g[parent[wst]].affine_inverse() * wp)

var _tg_waist := Transform3D.IDENTITY

# a bone's skeleton-space transform from the Waist pose being built (rest below it)
func _under_waist(bi: int) -> Transform3D:
	var chain := []
	var k := bi
	while k >= 0 and k != b("Waist"):
		chain.push_front(k); k = parent[k]
	var x := _tg_waist
	for c in chain: x = x * rest_l[c]
	return x

func _legs_ik() -> void:
	var W2S := skel.global_transform.affine_inverse()
	var fwdS := Vector3(0, 0, 1)
	for l in legs:
		var fp := _foot(l)
		var ankle_w: Vector3 = (fp[0] as Vector3) + Vector3.UP * ANKLE_H
		if sit_w > 0.01:
			# folded: the ankles back under the body, the shins on the ground
			var under := to_world(Vector3(float(l.sg) * FOOT_W * 1.1, ANKLE_H * 0.8, -0.1))
			ankle_w = ankle_w.lerp(under, sit_w)
		var A := W2S * ankle_w
		var hipT := _under_waist(l.thigh)
		var H := hipT.origin
		var d := A - H
		var dl := d.length()
		var reach := (L1 + L2) * 0.999
		if dl > reach:
			A = H + d / dl * reach; d = A - H; dl = reach
		dl = maxf(dl, absf(L1 - L2) + 0.01)
		# the knee: behind the hip-ankle line (a bird's), a touch outward
		var a1 := acos(clampf((L1 * L1 + dl * dl - L2 * L2) / (2.0 * L1 * dl), -1.0, 1.0))
		var axis := d.normalized()
		var pole := (-fwdS + Vector3(float(l.sg) * 0.15, 0, 0)).normalized()
		pole = (pole - axis * pole.dot(axis)).normalized()
		var K := H + axis * (L1 * cos(a1)) + pole * (L1 * sin(a1))
		var fz := Vector3(0, 0, 1)
		aim(l.thigh, K - H, fz, rest_dir(l.thigh, l.leg), Vector3(0, 0, 1))
		aim(l.leg, A - K, fz, rest_dir(l.leg, l.foot), Vector3(0, 0, 1))
		# the foot: flat, along its planted heading; the toes curl up in the air
		var fy: float = float(fp[2]) - global_rotation.y
		var u: float = fp[1]
		var pitch := 0.0
		if l.u >= 0.0: pitch = -0.5 * sin(PI * u) + 0.25 * sm(0.0, 0.25, u) * (1.0 - sm(0.25, 0.5, u))
		if sit_w > 0.01: pitch = lerpf(pitch, -0.5, sit_w)
		set_global(l.foot, Basis(Vector3.UP, fy) * Basis(Vector3.RIGHT, pitch) * rest_g[l.foot].basis)
		var curl := 0.0
		if l.u >= 0.0: curl = sin(PI * u) * 0.55
		curl = maxf(curl, sit_w * 0.5)
		for tb in l.toes:
			turn_rest(tb[0], Vector3.RIGHT, curl * 0.5)
			turn_rest(tb[1], Vector3.RIGHT, curl * 0.6)

# ---------- the heads ----------
func _head_act(h: Dictionary, act: String) -> void:
	h.act = act
	h.at = 0.0
	match act:
		"look":
			h.dur = rng.randf_range(1.2, 3.5)
			h.gy = rng.randf_range(-1.0, 1.0) if rng.randf() < 0.7 else 0.0
			h.gp = rng.randf_range(-0.25, 0.35)
			h.blink = minf(h.blink, 0.06)
		"glance": h.dur = rng.randf_range(0.8, 1.6)
		"peck":
			pecks += 1
			h.dur = rng.randf_range(1.6, 2.6)
			var fwd := Vector3(sin(global_rotation.y), 0, cos(global_rotation.y))
			var side := Vector3(cos(global_rotation.y), 0, -sin(global_rotation.y))
			h.pk = global_position + fwd * rng.randf_range(0.42, 0.55) + side * (float(h.sg) * rng.randf_range(0.04, 0.16))
		"preen": h.dur = rng.randf_range(2.0, 3.5)
		"doze": h.dur = rng.randf_range(6.0, 14.0)
		"watch": h.dur = rng.randf_range(1.5, 3.0)

func _pick(h: Dictionary, other: Dictionary, v: float) -> void:
	if v > 0.4:
		_head_act(h, "look" if rng.randf() < 0.85 else "glance"); return
	var x := rng.randf()
	if not is_nan(look_at_pos.x) and x < 0.45: _head_act(h, "watch"); return
	x = rng.randf()
	if x < 0.32: _head_act(h, "look")
	elif x < 0.5: _head_act(h, "glance")
	elif x < 0.72: _head_act(h, "peck")
	elif x < 0.84: _head_act(h, "preen")
	elif other.act != "doze": _head_act(h, "doze")
	else: _head_act(h, "look")

func _necks(dt: float, v: float) -> void:
	var W2S := skel.global_transform.affine_inverse()
	var want_crouch := 0.0
	for i in 2:
		var h: Dictionary = heads[i]
		var o: Dictionary = heads[1 - i]
		h.at += dt
		if sleep and h.act != "sleep":
			h.act = "sleep"; h.at = 0.0
		elif not sleep and h.act == "sleep": _head_act(h, "look")
		if h.act != "sleep" and h.at > h.dur: _pick(h, o, v)
		if v > 0.6 and h.act in ["peck", "preen", "doze"]: _head_act(h, "look")
		var gy := 0.0
		var gp := 0.0
		var beak := 0.0
		var droop := 0.0
		var reach := 0.0              # 0..1 toward the peck point
		var eye := "open"
		match h.act:
			"look": gy = h.gy; gp = h.gp
			"glance":
				# toward the other head (they are side by side: the other is across)
				gy = -float(h.sg) * 1.25; gp = 0.05
				if h.at > 0.3 and h.at < 0.9 and o.act == "glance": beak = absf(sin(h.at * 18.0)) * 0.25
			"watch":
				var hp := to_world(G[h.n[3]].origin)
				var to := look_at_pos - hp
				gy = clampf(wrapf(atan2(to.x, to.z) - global_rotation.y, -PI, PI), -1.4, 1.4)
				gp = clampf(atan2(to.y, Vector2(to.x, to.z).length()), -0.5, 0.6)
			"peck":
				var u: float = h.at / h.dur
				reach = sm(0.0, 0.25, u) * (1.0 - sm(0.75, 1.0, u))
				want_crouch = maxf(want_crouch, reach)
			"preen":
				gy = float(h.sg) * 2.2; gp = -0.75
				beak = absf(sin(h.at * 14.0)) * 0.22 * sm(0.4, 0.8, h.at)
			"doze":
				droop = sm(0.0, 2.5, h.at) * (0.75 + sin(h.at * 0.7) * 0.08)
				# a start: the head jerks up now and then
				if fmod(h.at, 5.0) > 4.6: droop *= 0.2
				eye = "closed" if droop > 0.4 else "sleepy"
				gy = float(h.sg) * 0.25
			"sleep":
				droop = 1.0; eye = "closed"; gy = float(h.sg) * (0.45 + 0.1 * sin(t * 0.3)); gp = -0.35
		if mood_t >= 0.0:
			match mood_k:
				"happy": gp = 0.45; gy = float(h.sg) * 0.25; eye = "happy"; beak = 0.35 * sm(0.0, 0.3, mood_t) * (1.0 - sm(1.0, 1.6, mood_t)); droop = 0.0; reach = 0.0
				"call":
					gp = 0.7; gy = float(h.sg) * 0.15; droop = 0.0; reach = 0.0
					var ph := mood_t - (0.0 if i == 0 else 0.35)
					beak = 0.75 * maxf(0.0, sin(clampf(ph / 0.45, 0.0, 1.0) * PI))
				"talk": beak = absf(sin(mood_t * (13.0 + i * 3.0))) * 0.4; gp = maxf(gp, 0.1)
				"argue":
					gy = -float(h.sg) * 1.3; gp = 0.12; droop = 0.0; reach = 0.0; eye = "angry"
					beak = absf(sin(mood_t * 11.0 + i * 1.7)) * 0.5
		h.yaw = spring(h.yaw, gy, 6.5 if h.act != "glance" else 10.0, dt, 0.85)
		h.pitch = spring(h.pitch, gp, 6.5, dt, 0.85)
		h.peck = damp(h.peck, reach, 7.0, dt)
		h.doze = damp(h.doze, droop, 2.5, dt)
		h.beak = damp(h.beak, beak, 22.0, dt)
		var y: float = h.yaw.x
		var p: float = h.pitch.x
		var dz: float = h.doze
		# the neck: an S standing, leaning forward with speed; the turn spread down the neck
		var spd := sm(0.3, 3.0, v)
		var base_p := [-0.12 + spd * 0.55 + dz * 0.35, 0.18 + spd * 0.2 + dz * 0.45, 0.12 - spd * 0.1 + dz * 0.4, -0.18 - spd * 0.5 + dz * 0.3]
		var share := [0.15, 0.25, 0.25, 0.35]
		var outw := float(h.sg) * (0.05 + spd * 0.05)
		for k in 4:
			var bi: int = h.n[k]
			turn_rest(bi, Vector3(0, 0, 1), -outw if k == 0 else (outw * 0.5 if k == 1 else 0.0))
			turn_rest(bi, Vector3.UP, y * share[k])
			turn_rest(bi, Vector3.RIGHT, base_p[k] - p * share[k] * 1.2 - (lean * 0.9 if k == 0 else 0.0))
		# a run: the heads hold steady against the bounce, bobbing forward with each step
		if spd > 0.05:
			turn_rest(h.n[3], Vector3.RIGHT, -sin(phase * TAU * 2.0) * 0.08 * spd)
		# a peck: CCD on the neck toward the ground point, the beak tip leading
		if h.peck > 0.01:
			# quick jabs at the ground once down there
			var jab := absf(sin(maxf(0.0, h.at - h.dur * 0.25) * 9.0)) * sm(0.2, 0.3, h.at / h.dur)
			var tgt := W2S * (h.pk as Vector3 + Vector3.UP * (0.015 + 0.09 * jab))
			_ccd(h, tgt, h.peck)
			beak = maxf(beak, 0.2 * h.peck)
		turn_rest(h.lo, Vector3.RIGHT, h.beak * 0.9)
		turn_rest(h.up, Vector3.RIGHT, -h.beak * 0.25)
		_eye(h, dt, eye)
	if heads_solid: _heads_apart()
	crouch = damp(crouch, want_crouch, 5.0, dt)

# ---------- the heads are solid to each other ----------
# Each head is a ball round its crown and its beak a capsule. After the necks are
# posed (looks, glances, pecks, moods), they are checked against each other: balls
# kept HEAD_GAP apart (the bind pose has them just touching), a beak kept outside
# the other ball. Overlap splays the necks outward (both, from the base) or turns
# the beak's head away, a few passes, so two heads glancing or arguing stop face
# to face instead of passing through each other.
const HEAD_R := 0.092             # the crown ball (skeleton units; the mesh is wider at the cheeks but they nest)
const BEAK_R := 0.032
const HEAD_GAP := 2.0 * HEAD_R
var heads_solid := true           # (dev: --soft shows the heads passing through each other)
var _head_pts := []               # per head, rest-local points: [crown in the head's frame, beak root, beak tip]

func _head_fk(i: int) -> Array:
	var chain: Array = heads[i].n
	var hp: Array = _head_pts[i]
	var x := _under_waist(chain[0]) * rest_l[chain[0]].affine_inverse()
	var xs := [x]                     # each neck bone's parent frame, then the head's own
	for k in 4:
		var bi: int = chain[k]
		x = x * Transform3D(Basis(_tl.get(bi, rest_l[bi].basis.get_rotation_quaternion())), rest_l[bi].origin)
		xs.append(x)
	return [x, x * (hp[0] as Vector3), x * (hp[1] as Vector3), x * (hp[2] as Vector3), xs]

# turn a neck bone by `a` about a skeleton-space axis through its joint, given its parent's frame
func _turn_sk(bi: int, parent_g: Transform3D, axis: Vector3, a: float) -> void:
	var la := (parent_g.basis.inverse() * axis).normalized()
	_tl[bi] = Quaternion(la, a) * (_tl.get(bi, rest_l[bi].basis.get_rotation_quaternion()) as Quaternion)

func _head_points() -> void:
	if _head_pts.is_empty():
		for h in heads:
			var inv: Transform3D = rest_g[h.n[3]].affine_inverse()
			var hp: Vector3 = rest_at(h.n[3])
			_head_pts.append([inv * (hp + Vector3(0, 0.11, 0.01)), inv * rest_at(h.up), inv * rest_at(h.tip)])

# dev: [crown gap, worst beak overlap] this frame (after apply), skeleton units
func head_clearance() -> Vector2:
	_head_points()
	var P := []
	for i in 2:
		var g: Transform3D = G[heads[i].n[3]]
		P.append([g * (_head_pts[i][0] as Vector3), g * (_head_pts[i][1] as Vector3), g * (_head_pts[i][2] as Vector3)])
	var gap: float = (P[0][0] as Vector3).distance_to(P[1][0]) - HEAD_GAP
	var pen := 0.0
	for i in 2:
		pen = maxf(pen, HEAD_R + BEAK_R - float(_seg_dist(P[1 - i][0], P[i][1], P[i][2])[0]))
	return Vector2(gap, pen)

static func _seg_dist(p: Vector3, a: Vector3, b2: Vector3) -> Array:   # [distance, closest point]
	var ab := b2 - a
	var u := clampf((p - a).dot(ab) / maxf(ab.length_squared(), 1e-8), 0.0, 1.0)
	var c := a + ab * u
	return [p.distance_to(c), c]

func _heads_apart() -> void:
	_head_points()
	for it in 6:
		var A := _head_fk(0)
		var Bh := _head_fk(1)
		var hit := false
		# crown against crown: splay both necks outward from the base
		var dd: float = (A[1] as Vector3).distance_to(Bh[1])
		if dd < HEAD_GAP:
			var a := minf((HEAD_GAP - dd) / 0.7, 0.25)   # ~0.7: crown height over the neck base
			for h in heads:
				turn_rest(h.n[0], Vector3(0, 0, 1), -float(h.sg) * a * 0.6)
				turn_rest(h.n[1], Vector3(0, 0, 1), -float(h.sg) * a * 0.4)
			hit = true
		# a beak against the other crown: that head turns away from it (yaw outward)
		for i in 2:
			var me: Array = A if i == 0 else Bh
			var ot: Array = Bh if i == 0 else A
			var r := _seg_dist(ot[1], me[2], me[3])
			var pen: float = HEAD_R + BEAK_R - float(r[0])
			if pen > 0.0:
				# swing the head (and the top of the neck) so the beak's nearest point moves
				# straight away from the other crown
				var h: Dictionary = heads[i]
				var xs: Array = me[4]
				var away := ((r[1] as Vector3) - (ot[1] as Vector3)).normalized()
				for k in [3, 2]:
					var piv: Vector3 = (xs[k + 1] as Transform3D).origin
					var arm := (r[1] as Vector3) - piv
					var ax := arm.cross(away)
					if ax.length_squared() < 1e-10: ax = Vector3.UP * float(h.sg)
					var a2 := minf((pen + 0.004) / maxf(arm.length(), 0.05), 0.3) * (0.65 if k == 3 else 0.35)
					_turn_sk(h.n[k], xs[k], ax.normalized(), a2)
				hit = true
		if not hit: break

# a few CCD passes on the neck (and head) so the beak tip comes to tgt (skeleton space), weighted by w
func _ccd(h: Dictionary, tgt: Vector3, w: float) -> void:
	var chain: Array = h.n
	var locs := []
	for bi in chain: locs.append(_tl.get(bi, rest_l[bi].basis.get_rotation_quaternion()))
	var orig := locs.duplicate()
	var tip_bi: int = h.tip
	var tip_local := (rest_g[chain[3]].affine_inverse() * rest_g[tip_bi]).origin
	var base := _under_waist(chain[0]) * rest_l[chain[0]].affine_inverse()   # the neck's parent (the body)
	for it in 6:
		for j in range(3, -1, -1):
			# forward kinematics of the chain with the current guesses
			var xs := []
			var x := base
			for k in 4:
				x = x * Transform3D(Basis(locs[k]), rest_l[chain[k]].origin)
				xs.append(x)
			var tip: Vector3 = xs[3] * tip_local
			var jp: Vector3 = (xs[j] as Transform3D).origin
			var a := (tip - jp).normalized()
			var c := (tgt - jp).normalized()
			var ang := acos(clampf(a.dot(c), -1.0, 1.0))
			if ang < 1e-4: continue
			var ax := a.cross(c).normalized()
			ang = minf(ang, 0.6) * 0.85
			# the axis into the joint's own (parent-relative) frame
			var pg: Transform3D = base if j == 0 else xs[j - 1]
			var la := (pg.basis.inverse() * ax).normalized()
			locs[j] = Quaternion(la, ang) * locs[j]
	for k in 4:
		_tl[chain[k]] = (orig[k] as Quaternion).slerp(locs[k], w)

const EYES := {"open": Vector2(0, 0), "angry": Vector2(0.5, 0), "sleepy": Vector2(0, 0.25), "happy": Vector2(0.5, 0.25),
	"closed": Vector2(0, 0.5), "squint": Vector2(0.5, 0.5)}

func _eye(h: Dictionary, dt: float, want: String) -> void:
	h.blink -= dt
	var e := want
	if e == "open" and h.blink < 0.0:
		e = "closed"
		if h.blink < -0.12: h.blink = rng.randf_range(1.5, 5.0)
	if e != h.eye and h.mat:
		h.eye = e
		(h.mat as ShaderMaterial).set_shader_parameter("uv_off", EYES.get(e, Vector2.ZERO))
