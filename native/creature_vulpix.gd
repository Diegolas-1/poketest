class_name CreatureVulpix
extends CreatureRig
# Vulpix (six curled tails) and Ninetales (nine long ones). Rig: the fox's legs on all
# fours (L/RThigh - Leg - Foot - Toe1 - Toe2, L/RArm - ForeArm - Hand - Finger), Spine1 -
# Spine2 - Neck(1 - 2) - Head (Vulpix's Hair / Feeler the curls on its crown; Ninetales'
# Hair1 - 2 and its tuft, Jaw), and the tails off the Hips: L/RTailA .. C (Vulpix) or
# L/RTailA .. D and TailA (Ninetales), each a chain of its own.
# The tails are its signature: each moves on its own, out of step with the next (a
# wave running across the fan from one side to the other), lifting and settling,
# swishing more when it is pleased or on edge; walking, they stream behind it.
# Moods (besides CreatureRig's): tail_sway (a slow wave through the fan), groom,
# stretch, shake, and the battle acts ember, flamethrower (fx("flame") a stream from the
# mouth), fire_spin (fx("fire_spin")), will_o_wisp (the tails fanned up, fx("wisp") at
# their tips), confuse_ray (fx("confuse")), hypnosis (Ninetales: the eyes, fx("hypnosis")),
# quick_attack, tackle, tail_whip, growl.
# Points: "mouth", "head", "tail" (the middle tail's tip), "tail0" .. "tailN".

var fan := []                     # per tail: {chain, sg (side), k (0 .. 1 across the fan), buf}
var fan_w := Vector2.ZERO

func _rig_ready() -> void:
	durs.merge({"tail_sway": 2.6, "flamethrower": 2.0, "fire_spin": 2.2, "will_o_wisp": 2.0, "confuse_ray": 1.6, "hypnosis": 2.2}, true)
	tails.clear()
	var names := []
	for i in skel.get_bone_count():
		var nm := skel.get_bone_name(i)
		if nm.ends_with("1") and nm.contains("Tail") and (parent[i] == HIPS or skel.get_bone_name(parent[i]) == "Hips"):
			names.append(nm)
	# order across the fan: right side outermost .. left side outermost
	var keyed := []
	for nm in names:
		var p := rest_at(_chain(nm)[_chain(nm).size() - 1])
		keyed.append([atan2(p.x, -p.z), nm])
	keyed.sort_custom(func(a, b2): return a[0] < b2[0])
	var n := keyed.size()
	for j in n:
		var nm: String = keyed[j][1]
		fan.append({"chain": _chain(nm), "k": float(j) / maxf(1, n - 1), "buf": [], "sg": signf(float(keyed[j][0]))})

func point(n: String) -> Vector3:
	if n.begins_with("tail") and n.length() > 4 and not fan.is_empty():
		var i := clampi(int(n.substr(4)), 0, fan.size() - 1)
		var ch: PackedInt32Array = fan[i].chain
		return to_world(G[ch[ch.size() - 1]].origin)
	if n == "tail" and not fan.is_empty():
		var ch: PackedInt32Array = fan[fan.size() / 2].chain
		return to_world(G[ch[ch.size() - 1]].origin)
	return super.point(n)

func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	var env := sm(0.0, 0.2, u) * sm(d, d - 0.3, u)
	match act:
		"tail_sway":
			P.fan = 1.0 * env
			P.hy = 0.6 * sin(u * 2.2) * env
			P.eye = "happy" if env > 0.6 and u > 1.0 else ""
			P.tp += 0.2 * env
		"flamethrower", "fire_spin":
			var load := bump(u, 0.0, 0.5)
			var blow := sm(0.4, 0.55, u) * sm(d, d - 0.25, u)
			P.lean += -0.2 * load + 0.2 * blow
			P.crouch += 0.3 * load + 0.2 * blow
			P.hp = 0.3 * load - 0.15 * blow
			P.hfwd += 0.1 * sz * blow
			P.jaw = 1.0 * blow
			P.mouth = "wide" if blow > 0.2 else ""
			P.eye = "angry"
			P.fan = 0.6 * (load + blow)
			P.tp += 0.4 * load
			if act == "fire_spin":
				P.hy = sin(u * TAU * 1.2) * 0.6 * blow
				P.hp += cos(u * TAU * 1.2) * 0.25 * blow
			var nb := 8
			for k in nb:
				if _ev("f%d" % k, 0.5 + k * (d - 0.8) / nb): fx.emit("flame" if act == "flamethrower" else "fire_spin", point("mouth"))
			if _ev("hit", 0.6): impact.emit(act)
		"will_o_wisp":
			var k := sm(0.0, 0.4, u) * sm(d, d - 0.3, u)
			P.tp += 0.9 * k
			P.fan = 0.8 * k
			P.spread = 0.6 * k
			P.hp = 0.2 * k
			P.eye = "angry"
			P.mouth = "smile"
			for i in fan.size():
				if _ev("w%d" % i, 0.5 + 0.08 * i): fx.emit("wisp", point("tail%d" % i))
			if _ev("hit", 1.2): impact.emit(act)
		"confuse_ray", "hypnosis":
			var k := sm(0.0, 0.3, u) * sm(d, d - 0.3, u)
			P.lean += 0.1 * k
			P.hp = -0.1 * k
			P.hy = sin(u * 3.0) * 0.25 * k if act == "hypnosis" else 0.0
			P.ht = sin(u * 3.0 + 1.0) * 0.2 * k
			P.eye = "angry" if act == "confuse_ray" else ("half" if k > 0.5 else "")
			P.fan = 0.7 * k
			P.tp += 0.4 * k
			if _ev("r", 0.5): fx.emit("confuse" if act == "confuse_ray" else "hypnosis", point("head"))
			if _ev("hit", 0.6): impact.emit(act)
		_:
			return false
	return true

func _base_species(P: Dictionary, _dt: float, _v: float) -> void:
	P.merge({"fan": 0.0, "spread": 0.0}, true)
	P.fan += 0.2 * battle_w

# the fan of tails. Each rises from the rump in a crown (species.json "crown": base,
# the lift at the root; bend, each bone after it arcing back over; curl, the tips
# turned up; fan, the outer ones splayed out to the sides; outer, how much lower the
# outer ones ride), and moves on its own: a slow drift out of step with its neighbours,
# the act's wave running across the fan, swishing when it is pleased or on edge. It
# lowers them to stream behind it when it runs, and wraps them round itself asleep.
# Each tail is lifted about its own side axis (across its line), so the fan opens up
# like a peacock's rather than twisting.
func _tails(P: Dictionary, dt: float, v: float) -> void:
	if _tail_kick != 0.0:
		tail_y.y += _tail_kick * 5.0
		_tail_kick = 0.0
	tail_p = spring(tail_p, float(P.tp) - _acc.length() * 0.02, 9.0, dt, 0.5)
	tail_y = spring(tail_y, float(P.ty), 8.0, dt, 0.45)
	fan_w = spring(fan_w, float(P.fan), 5.0, dt, 0.7)
	var cr: Dictionary = I.get("crown", {})
	var c_base := float(cr.get("base", 0.4))
	var c_bend := float(cr.get("bend", 0.0))
	var c_curl := float(cr.get("curl", 0.0))
	var c_fan := float(cr.get("fan", 0.2))
	var c_outer := float(cr.get("outer", 0.2))
	var lag := float(gait.tail_lag)
	var drift := 1.0 - 0.6 * run_w
	var down := clampf(run_w * 0.85 + sleep_w * 0.9 + faint_w * 0.9 + hide_w * 0.6, 0.0, 1.0)
	for tl in fan:
		var k: float = tl.k
		var side := (k - 0.5) * 2.0
		var ph := k * 2.4
		var wave := sin(t * 2.2 - ph * 1.6)
		var lift := tail_p.x + 0.14 * drift * sin(t * 1.3 + ph * 2.1) + 0.4 * fan_w.x * maxf(0.0, wave)
		var sway := tail_y.x + 0.12 * drift * sin(t * 0.9 + ph * 1.7) + 0.35 * fan_w.x * wave
		sway += float(P.get("spread", 0.0)) * side * 0.8
		sway += float(P.wag) * sin(t * float(P.wagf) - ph) * 0.4
		var buf: Array = tl.buf
		buf.push_front(Vector2(lift, sway))
		var ch: PackedInt32Array = tl.chain
		var maxn := int(ceil(lag * ch.size() / maxf(dt, 0.008))) + 2
		while buf.size() > maxn: buf.pop_back()
		var axis: Vector3 = tl.get("axis", Vector3.ZERO)
		if axis == Vector3.ZERO:
			var d := rest_at(ch[ch.size() - 1]) - rest_at(ch[0])
			d.y = 0.0
			if d.length() < 1e-4: d = Vector3(0, 0, -1)
			axis = d.normalized().cross(Vector3.UP).normalized()
			tl["axis"] = axis
		var n := ch.size()
		for j in n:
			var dd := mini(buf.size() - 1, int(round(j * lag / maxf(dt, 0.008))))
			var s: Vector2 = buf[dd]
			var w := (1.0 + 0.6 * float(j) / n) / (n * 1.3)
			# the crown's shape: up at the root, arcing back over, the tip curled up
			var shape := 0.0
			if j == 0: shape = c_base * (1.0 - c_outer * absf(side)) * (1.0 - down)
			else: shape = c_bend * (1.0 - 0.6 * down)
			if j >= n - 2: shape += c_curl * (1.0 - 0.5 * down)
			if j == 0: shape -= 0.35 * run_w
			var splay := (-c_fan * side * (1.0 - 0.5 * down) if j == 0 else 0.0)
			# (the turn about the up axis first: it acts last, so the tail is lifted along its
			# own line and then swung out, never twisted)
			turn_rest(ch[j], Vector3.UP, splay + s.y * w * 1.8 + float(P.curl) * 0.35 * (1.0 if j > 0 else 0.5))
			turn_rest(ch[j], axis, shape + s.x * w)
