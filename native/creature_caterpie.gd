class_name CreatureCaterpie
extends Creature
# Caterpie (Lily's Nibbles). The X/Y rig is a straight chain lying along the
# body: Tail3 (the teardrop tip) - Tail2 - Tail1 - Hips | Waist | Spine1 -
# Spine2 - Head, with two pairs of stubby feet (FeelerB under Spine1, FeelerA
# under Spine2), the mouth (Nose) and the red forked horn (Horn, a bone the
# bake adds: the rip skins it to the head). The bind pose lies straight up;
# the rear five joints are laid on the ground and the front (Spine2 and the
# head) stands up from them, as Caterpie holds itself.
#
# ---- the crawl ----
# A travelling wave on the five ground joints (tail tip J0 .. J4 under the
# raised front). A joint either stands planted - its ground point frozen in
# the world, so it cannot slide - or steps: it lifts, travels one stride
# forward along the trail the creature has crawled (so the body follows its
# path round corners) and plants again. The steps run tail to head (each
# joint DELAY of a cycle after the one behind it, as a real caterpillar's
# wave runs from the rear forward) and overlap, so a planted pair is never
# squeezed: the hump is where the joints are stepping, and its height comes
# from the bones themselves - a few passes of distance constraints between
# neighbours (fixed bone lengths) with the planted joints pinned, so a step
# that brings a joint closer to the next one pushes the segment up. The
# stride grows with speed (a lazy crawl to a quick scurry) and the wave's
# rate is speed / stride, so the body moves exactly as far as its feet do.
# Stopping finishes the wave (no joint is left half a stride out).
#
# ---- on top ----
# The raised front leans into the crawl and bobs as the wave reaches it; the
# head turns toward where it goes, or toward look_at_pos (Lily, the player),
# or looks about on its own; the horn and the tail tip trail behind on
# springs; it breathes; moods: "happy" (a wiggle and a rear-up, eyes shut
# "^ ^"), "hop" (a little jump), "talk" (the mouth chatters); sleep curls the
# body round into a C with the head down on the ground, eyes shut.

const STEP_W := 0.5        # the part of a cycle a joint spends stepping
const DELAY := 0.07        # cycle delay from one joint to the next (tail to head)
const SETTLE := 3.0        # cycles a second to finish a wave when stopping
const UP_IDLE := 1.36      # the front's lean from the ground (radians), standing
const UP_CRAWL := 1.05     # and at a crawl

var J: PackedInt32Array = []           # ground joints' bones, tail -> front
var jl := PackedFloat32Array()         # bone length from joint k to k+1
var clr := PackedFloat32Array()        # height of each joint above the ground (the belly under it)
var r_off := PackedFloat32Array()      # rest distance along the trail behind the front joint
var gp: Array[Vector3] = []            # joint k: planted ground point (world)
var step_u := PackedFloat32Array()     # 0..1 while stepping, -1 planted
var step_from: Array[Vector3] = []
var step_to := PackedFloat32Array()    # target arc along the trail
var steps := PackedInt32Array()        # steps taken (the wave is whole when all are equal)
var waves := {}                        # wave number -> the arc every joint steps to (less its rest offset)
var phase := 0.0
var delay := DELAY
var step_w := STEP_W
var stride := 0.06
var trail: Array[Vector3] = []
var arc := PackedFloat32Array()
var dist := 0.0                        # arc of the newest trail point
var Q: Array[Vector3] = []             # this frame's joint positions (world)
var _last_ms := 0
var _need_reset := true
# the front, the head, the springs
var up_ang := UP_IDLE
var head_yaw := Vector2.ZERO           # spring [angle, velocity]
var head_pitch := Vector2.ZERO
var look_t := 1.0
var look_goal := Vector2.ZERO
var horn_p := Vector2.ZERO
var horn_r := Vector2.ZERO
var tail_s := Vector2.ZERO
var tail_l := Vector2.ZERO
var _horn_last := Vector3(NAN, NAN, NAN)
var _horn_v := Vector3.ZERO
var _j0_last := Vector3(NAN, NAN, NAN)
var _j0_v := Vector3.ZERO
var t := 0.0
var blink := 2.5
var happy_t := -1.0
var hop_t := -1.0
var talk_t := -1.0
var sleep_w := 0.0
var curl: Array[Vector3] = []         # the curled-up joint points (world), made when it lies down
var _curl_side := 1.0
var lid_now := 0.0
var _fwd_s := Vector3.FORWARD

func _setup() -> void:
	for n in ["Tail3", "Tail2", "Tail1", "Waist", "Spine2"]: J.append(b(n))
	var belly := Vector3(0, 0, 1)      # the bind pose's belly side (its feet point +z)
	for k in 5:
		if k < 4: jl.append(rest_at(J[k]).distance_to(rest_at(J[k + 1])))
	var depth := PackedFloat32Array()
	for k in 4: depth.append(mesh_depth(rest_at(J[k]), rest_at(J[k + 1]), belly))
	for k in 5:
		var d := 0.0
		if k > 0: d = maxf(d, depth[k - 1])
		if k < 4: d = maxf(d, depth[k])
		clr.append(d)
	r_off.resize(5)
	r_off[4] = 0.0
	for k in range(3, -1, -1):
		var dh := clr[k + 1] - clr[k]
		r_off[k] = r_off[k + 1] + sqrt(maxf(1e-6, jl[k] * jl[k] - dh * dh))
	gp.resize(5); step_from.resize(5); Q.resize(5)
	step_u.resize(5); step_to.resize(5); steps.resize(5)
	t = rng.randf() * 10.0
	_curl_side = -1.0 if rng.randf() < 0.5 else 1.0
	var m: ShaderMaterial = mats[0]
	# the painted eyes on the body sheet (512 x 256): centres and radii in uv
	m.set_shader_parameter("eye_l", Vector4(0.3516, 0.875, 0.043, 0.086))
	m.set_shader_parameter("eye_r", Vector4(0.6465, 0.875, 0.043, 0.086))
	m.set_shader_parameter("lid_from", Vector2(0.0, -1.45))

func reset() -> void:
	_need_reset = true

func _reset_now() -> void:
	_need_reset = false
	var fwd := global_basis.z
	fwd.y = 0.0
	fwd = fwd.normalized() if fwd.length_squared() > 1e-6 else Vector3.BACK
	trail.clear(); arc.clear()
	for i in 13:
		var d := (12 - i) * 0.1
		trail.append(global_position - fwd * d)
		arc.append(-d)
	dist = 0.0
	for k in 5:
		gp[k] = _trail_at(-r_off[k] - stride * 0.25)
		step_u[k] = -1.0
		steps[k] = 0
	waves.clear()
	phase = -1e-4
	_horn_last = Vector3(NAN, NAN, NAN)
	_j0_last = Vector3(NAN, NAN, NAN)
	_fwd_s = fwd

func mood(what: String) -> void:
	match what:
		"happy": if happy_t < 0.0 and hop_t < 0.0: happy_t = 0.0
		"hop": if hop_t < 0.0: hop_t = 0.0; happy_t = -1.0
		"talk": talk_t = 0.0

func busy() -> bool:
	return hop_t >= 0.0 or happy_t >= 0.0

func contacts() -> Array:
	var out := []
	for k in 5: out.append(to_world(G[J[k]].origin) if step_u[k] < 0.0 and hop_t < 0.0 else null)
	return out

# ---------- the trail ----------
func _trail_at(s: float) -> Vector3:
	var n := trail.size()
	if s >= arc[n - 1]:
		var f := _fwd_s
		return trail[n - 1] + f * (s - arc[n - 1])
	if s <= arc[0]:
		var d0 := (trail[0] - trail[1]).normalized()
		return trail[0] + d0 * (arc[0] - s)
	var i := n - 2
	while i > 0 and arc[i] > s: i -= 1
	var u := (s - arc[i]) / maxf(1e-5, arc[i + 1] - arc[i])
	return trail[i].lerp(trail[i + 1], u)

func _trail_push(p: Vector3) -> void:
	var last := trail[trail.size() - 1]
	var d := Vector2(p.x - last.x, p.z - last.z).length()
	if d < 0.012:
		trail[trail.size() - 1].y = p.y
		return
	dist += d
	trail.append(p); arc.append(dist)
	while trail.size() > 4 and arc[1] < dist - 1.4:
		trail.remove_at(0); arc.remove_at(0)

# ---------- the frame ----------
func _pose(dt: float, speed: float) -> void:
	var now := Engine.get_process_frames()
	if now - _last_ms > 30 or trail.is_empty(): _need_reset = true
	_last_ms = now
	if not _need_reset and Vector2(global_position.x - trail[trail.size() - 1].x, global_position.z - trail[trail.size() - 1].z).length() > 0.6:
		_need_reset = true
	if _need_reset: _reset_now()
	t += dt
	var fwd := global_basis.z
	fwd.y = 0.0
	fwd = fwd.normalized()
	_fwd_s = _fwd_s.slerp(fwd, 1.0 - exp(-dt * 10.0)).normalized()
	var d0 := dist
	_trail_push(global_position)
	var moved := dist - d0
	var v := maxf(speed, moved / maxf(dt, 1e-4)) if speed > 0.02 else moved / maxf(dt, 1e-4)
	v = minf(v, 3.0)
	sleep_w = damp(sleep_w, 1.0 if sleep else 0.0, 1.6 if sleep else 3.0, dt)
	_gait(dt, v)
	_body(dt, v)

func _gait(dt: float, v: float) -> void:
	# a longer stride the faster it goes: a lazy crawl, a quick scurry
	stride = damp(stride, clampf(0.04 + 0.09 * v, 0.04, 0.15), 4.0, dt)
	var fast := sm(0.2, 1.0, v)
	delay = lerpf(DELAY, 0.045, fast)
	step_w = lerpf(STEP_W, 0.6, fast)
	var n := maxi(maxi(1, ceili(dt / 0.034)), ceili(dt * v / stride / step_w / 0.07))
	for i in n: _steps(dt / n, v)
	_place()

func _steps(dt: float, v: float) -> void:
	var stepping := false
	for k in 5: if step_u[k] >= 0.0 or steps[k] != steps[0]: stepping = true
	var rate := v / stride
	if v < 0.03: rate = SETTLE if stepping else 0.0
	var ph0 := phase
	phase += rate * dt
	for k in 5:
		var go := false
		if step_u[k] < 0.0:
			if k == 0:
				# a new wave once a cycle (not while stopping)
				go = v >= 0.03 and floor(phase) > floor(ph0)
				# (not when the body is still ahead of where it is going: after a stop, a turn)
				if go and dist + stride * 1.4 - float(waves.get(steps[0], -INF)) < stride * 0.3: go = false
			else:
				# each joint follows the one behind it DELAY of a cycle later, so the wave
				# always runs tail to head and no planted pair is ever squeezed or stretched
				go = steps[k] < steps[k - 1] and (step_u[k - 1] < 0.0 or step_u[k - 1] >= delay / step_w)
		if go:
			if k == 0:
				# every joint of a wave steps to the same reference: the spacing comes out whole
				waves[steps[0] + 1] = dist + stride * 1.4
				waves.erase(steps[0] - 3)
			step_u[k] = 0.0
			step_from[k] = gp[k]
			steps[k] += 1
			step_to[k] = float(waves.get(steps[k], dist + stride * 0.72)) - r_off[k]
		if step_u[k] >= 0.0:
			step_u[k] = minf(1.0, step_u[k] + rate * dt / step_w)
			if step_u[k] >= 1.0:
				gp[k] = _trail_at(step_to[k])
				step_u[k] = -1.0

func _place() -> void:
	# joint positions: planted ones where they stand; stepping ones on their way, lifted
	for k in 5:
		var up := Vector3.UP
		if step_u[k] < 0.0:
			Q[k] = gp[k] + up * clr[k]
		else:
			var u := step_u[k]
			var e := u * u * (3.0 - 2.0 * u)
			var to := _trail_at(step_to[k])
			Q[k] = step_from[k].lerp(to, e) + up * (clr[k] + stride * 0.2 * sin(PI * u))
	# breathing: the middle swells a hair
	var br := sin(t * 2.2) * 0.0025 * (1.0 - sleep_w * 0.4)
	Q[2] += Vector3.UP * br * 0.6
	Q[3] += Vector3.UP * br
	# curled up asleep: blend toward a C on the ground (made once it starts to lie down)
	if sleep_w > 0.01:
		if curl.is_empty():
			curl.resize(5)
			var dir := -_fwd_s
			var p := gp[4]
			curl[4] = p
			for k in range(3, -1, -1):
				dir = dir.rotated(Vector3.UP, _curl_side * 0.62)
				p += dir * (r_off[k] - r_off[k + 1])
				curl[k] = p
		for k in 5:
			Q[k] = Q[k].lerp(curl[k] + Vector3.UP * (clr[k] + br), sleep_w)
	elif not curl.is_empty() and sleep_w <= 0.01:
		curl.clear()
	# fixed bone lengths: a few passes with the planted joints pinned (they never move)
	# fixed bone lengths, the planted joints pinned (they never move): first the stepping
	# joints only rise or sink (they keep to their step, so nothing pops), then a few
	# free passes settle what is left
	var lying := sleep_w >= 0.5
	for it in 12:
		var free_pass := it >= 7 or lying
		for k2 in 4:
			var k := k2 if it % 2 == 0 else 3 - k2
			var wa := 0.0 if (step_u[k] < 0.0 and not lying) else 1.0
			var wc := 0.0 if (step_u[k + 1] < 0.0 and not lying) else 1.0
			if wa + wc <= 0.0: continue
			var a := Q[k]
			var c := Q[k + 1]
			var dv := c - a
			var h := Vector2(dv.x, dv.z).length()
			if free_pass or h >= jl[k]:
				var dl := dv.length()
				if dl < 1e-5: continue
				var corr := dv * ((dl - jl[k]) / dl) / (wa + wc)
				Q[k] = a + corr * wa
				Q[k + 1] = c - corr * wc
			else:
				var need := sqrt(jl[k] * jl[k] - h * h)
				var sg := 1.0
				if wa > 0.0 and wc <= 0.0: sg = -1.0
				elif wa > 0.0 and wc > 0.0: sg = 1.0 if dv.y >= 0.0 else -1.0
				var delta := sg * need - dv.y
				Q[k + 1].y += delta * wc / (wa + wc)
				Q[k].y -= delta * wa / (wa + wc)
		for k in 5:
			var gy := (gp[k].y if step_u[k] < 0.0 else _trail_at(step_to[k]).y) + clr[k]
			if step_u[k] >= 0.0 and it == 6: gy += stride * 0.12 * sin(PI * step_u[k])
			if Q[k].y < gy: Q[k].y = gy

func _body(dt: float, v: float) -> void:
	# acts
	var hop_y := 0.0
	var hop_lean := 0.0
	if hop_t >= 0.0:
		hop_t += dt
		var h := hop_t
		if h < 0.12: hop_lean = -sm(0.0, 0.12, h) * 0.25                    # crouch
		elif h < 0.5:
			var u := (h - 0.12) / 0.38
			hop_y = 4.0 * u * (1.0 - u) * 0.075
			hop_lean = 0.25 * sin(PI * u)
		elif h < 0.68: hop_lean = -0.18 * sin(PI * (h - 0.5) / 0.18)          # landing squash
		else: hop_t = -1.0
	var wig := 0.0
	var rear := 0.0
	if happy_t >= 0.0:
		happy_t += dt
		var e := sm(0.0, 0.25, happy_t) * (1.0 - sm(1.35, 1.8, happy_t))
		wig = sin(happy_t * 15.0) * 0.28 * e
		rear = e
		if happy_t > 1.8: happy_t = -1.0
	var talk := 0.0
	if talk_t >= 0.0:
		talk_t += dt
		talk = absf(sin(talk_t * 13.0)) * (1.0 - sm(0.6, 0.9, talk_t))
		if talk_t > 0.9: talk_t = -1.0
	if hop_y > 0.0:
		for k in 5: Q[k] += Vector3.UP * hop_y
	# the front: leans into a crawl, up for a rear-up, down asleep; bobs with the wave at the front
	var crawl := sm(0.03, 0.4, v)
	var want := lerpf(UP_IDLE, UP_CRAWL, crawl) + rear * 0.3 + hop_lean + sin(t * 2.2) * 0.015
	want = lerpf(want, 0.42, sleep_w)
	up_ang = damp(up_ang, want, 7.0, dt)
	var fwd := (Q[4] - Q[3])
	fwd.y = 0.0
	fwd = fwd.normalized() if fwd.length_squared() > 1e-8 else _fwd_s
	# turning in place: the front turns ahead of the body (within reason)
	var dy := clampf(wrapf(atan2(_fwd_s.x, _fwd_s.z) - atan2(fwd.x, fwd.z), -PI, PI), -0.8, 0.8)
	fwd = fwd.rotated(Vector3.UP, dy * 0.8)
	var side := fwd.cross(Vector3.UP).normalized()   # its right
	var a := up_ang
	var sdir := (fwd * cos(a) + Vector3.UP * sin(a)).rotated(fwd, wig * 0.5)
	var sback := (Vector3.UP * cos(a) - fwd * sin(a)).rotated(fwd, wig * 0.5)
	# ground chain bones (tail -> front) aimed joint to joint, backs up
	var back := Vector3(0, 0, -1)    # the bind pose's back (dorsal) side
	var bh := b("Hips"); var b1 := b("Tail1"); var b2 := b("Tail2"); var s1 := b("Spine1"); var s2 := b("Spine2")
	var W2S := skel.global_transform.affine_inverse()
	var q := []
	for k in 5: q.append(W2S * Q[k])
	var upS := W2S.basis * Vector3.UP
	aim(bh, q[2] - q[3], upS, rest_dir(bh, b1), back)
	aim(b1, q[1] - q[2], upS, rest_dir(b1, b2), back)
	aim(b2, q[0] - q[1], upS, rest_dir(b2, J[0]), back)
	aim(s1, q[4] - q[3], upS, rest_dir(s1, s2), back)
	var wst := b("Waist")
	set_local_pos(wst, rest_g[parent[wst]].affine_inverse() * (q[3] as Vector3))
	set_global(wst, rest_g[wst].basis)
	var hd := b("Head")
	aim(s2, W2S.basis * sdir, W2S.basis * sback, rest_dir(s2, hd), back)
	# the head: where it goes, what it watches, or a look round
	look_t -= dt
	var hp := to_world(G[hd].origin)
	var goal := Vector2.ZERO
	if not is_nan(look_at_pos.x) and sleep_w < 0.5:
		var to := look_at_pos - hp
		var yaw := wrapf(atan2(to.x, to.z) - atan2(fwd.x, fwd.z), -PI, PI)
		var pit := atan2(to.y, Vector2(to.x, to.z).length())
		goal = Vector2(clampf(yaw, -1.1, 1.1), clampf(pit, -0.4, 0.75))
	elif crawl > 0.5:
		goal = Vector2(clampf(dy * 1.4, -0.7, 0.7), -0.08)
	else:
		if look_t < 0.0:
			look_t = 1.8 + rng.randf() * 3.5
			look_goal = Vector2(rng.randf_range(-0.9, 0.9) if rng.randf() < 0.6 else 0.0, rng.randf_range(-0.2, 0.45))
			if absf(look_goal.x - head_yaw.x) > 0.5: blink = minf(blink, 0.05)
		goal = look_goal
	if sleep_w > 0.01: goal = goal.lerp(Vector2(_curl_side * -0.85, 0.62), sleep_w)
	head_yaw = spring(head_yaw, goal.x, 7.0, dt)
	head_pitch = spring(head_pitch, goal.y, 7.0, dt)
	var hy := head_yaw.x + wig * 0.6
	var face := fwd.rotated(Vector3.UP, hy)
	var hside := face.cross(Vector3.UP).normalized()
	# head pitch relative to upright (the front's own lean carried partly)
	# the head follows most of the front's lean (upright, the chin closes on the chest)
	var tilt := head_pitch.x + (a - PI / 2.0) * 0.85 + sin(t * 2.2 + 0.6) * 0.02
	# (+ looks up)
	var top := Vector3.UP.rotated(hside, tilt).rotated(face, wig * 0.8 + sin(t * 0.7) * 0.03 * (1.0 - crawl))
	var facev := face.rotated(hside, tilt)
	if sleep_w > 0.01:
		# lying: the front low, the head turned in toward the tail and laid on one cheek
		top = top.rotated(facev, -_curl_side * 0.45 * sleep_w)
	aim(hd, W2S.basis * top, W2S.basis * (-facev), rest_dir(hd, b("EndHead")), back)
	# the mouth chatters when it talks; a yawn now and then asleep
	var nose := b("Nose")
	turn_rest(nose, Vector3.RIGHT, -talk * 0.32)
	# the feet: the front pair paddles at a crawl, waves when happy
	var pad := sin(phase * TAU) * crawl * 0.35 + wig * 0.9
	turn_rest(b("LFeelerA"), Vector3.RIGHT, pad); turn_rest(b("RFeelerA"), Vector3.RIGHT, -pad)
	turn_rest(b("LFeelerB"), Vector3.RIGHT, -pad * 0.5); turn_rest(b("RFeelerB"), Vector3.RIGHT, pad * 0.5)
	# the horn lags behind the head; the tail tip behind the tail
	var horn := b("Horn")
	var hb := to_world(G[horn].origin) if horn >= 0 else hp
	if not is_nan(_horn_last.x) and dt > 0.0:
		var vel := (hb - _horn_last) / dt
		var acc := (vel - _horn_v) / dt
		_horn_v = _horn_v.lerp(vel, 0.6)
		var af := acc.dot(face); var asd := acc.dot(hside); var av := acc.y
		horn_p = spring(horn_p, clampf(-af * 0.012 + av * 0.006, -0.5, 0.5), 16.0, dt, 0.22)
		horn_r = spring(horn_r, clampf(asd * 0.012, -0.5, 0.5), 16.0, dt, 0.22)
	_horn_last = hb
	var idle_w := sin(t * 3.1) * 0.03 + sin(t * 5.3) * 0.015
	turn_rest(horn, Vector3.RIGHT, horn_p.x + idle_w)
	turn_rest(horn, Vector3(0, 0, 1), horn_r.x + wig * 0.3)
	var j0 := Q[0]
	if not is_nan(_j0_last.x) and dt > 0.0:
		var vel2 := (j0 - _j0_last) / dt
		var acc2 := (vel2 - _j0_v) / dt
		_j0_v = _j0_v.lerp(vel2, 0.6)
		tail_s = spring(tail_s, clampf(-acc2.y * 0.01, -0.6, 0.6), 13.0, dt, 0.3)
		tail_l = spring(tail_l, clampf(acc2.dot(side) * 0.01, -0.6, 0.6) + wig * 0.6, 13.0, dt, 0.3)
	_j0_last = j0
	# the teardrop tip: held up off the ground behind the last segment, swinging on its spring
	var tl := b("Tail3")
	var tback := Q[0] - Q[1]
	tback.y = 0.0
	tback = tback.normalized() if tback.length_squared() > 1e-8 else -fwd
	var ta := 0.42 + tail_s.x + sin(t * 1.7) * 0.06 - sleep_w * 0.3 + rear * 0.25
	var tdir := (tback * cos(ta) + Vector3.UP * sin(ta)).rotated(Vector3.UP, tail_l.x)
	var tup := (Vector3.UP * cos(ta) - tback * sin(ta))
	aim(tl, W2S.basis * tdir, W2S.basis * tup, rest_dir(tl, b("EndTail3")), back)
	_eyes(dt)

func _eyes(dt: float) -> void:
	blink -= dt
	var want := 0.0
	var curve := 0.35
	if blink < 0.0:
		want = 1.0
		if blink < -0.13: blink = 2.0 + rng.randf() * 3.5
	if happy_t >= 0.0 and happy_t > 0.15 and happy_t < 1.5: want = 1.0; curve = -0.55
	if sleep_w > 0.4: want = 1.0; curve = 0.45
	lid_now = damp(lid_now, want, 30.0, dt)
	var m: ShaderMaterial = mats[0]
	m.set_shader_parameter("lid", lid_now)
	m.set_shader_parameter("lid_curve", curve)
