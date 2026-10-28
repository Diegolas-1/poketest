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

# the fan of tails: each its own lift and sway (a slow drift, out of step with its
# neighbours), the act's wave across them, streamed back and down when it runs
func _tails(P: Dictionary, dt: float, v: float) -> void:
	if _tail_kick != 0.0:
		tail_y.y += _tail_kick * 5.0
		_tail_kick = 0.0
	tail_p = spring(tail_p, float(P.tp) - _acc.length() * 0.02, 9.0, dt, 0.5)
	tail_y = spring(tail_y, float(P.ty), 8.0, dt, 0.45)
	fan_w = spring(fan_w, float(P.fan), 5.0, dt, 0.7)
	var shape: Array = I.get("tail_shape", [])
	var lag := float(gait.tail_lag)
	var drift := 1.0 - 0.6 * run_w
	for tl in fan:
		var k: float = tl.k
		var ph := k * 2.4
		var wave := sin(t * 2.2 - ph * 1.6)
		var lift := tail_p.x + 0.12 * drift * sin(t * 1.3 + ph * 2.1) + 0.35 * fan_w.x * maxf(0.0, wave) - 0.3 * run_w
		var sway := tail_y.x + 0.1 * drift * sin(t * 0.9 + ph * 1.7) + 0.35 * fan_w.x * wave
		# spread: the fan opened (each tail turned out to its side)
		sway += float(P.get("spread", 0.0)) * (k - 0.5) * 1.5
		sway += float(P.wag) * sin(t * float(P.wagf) - ph) * 0.4
		var buf: Array = tl.buf
		buf.push_front(Vector2(lift, sway))
		var ch: PackedInt32Array = tl.chain
		var maxn := int(ceil(lag * ch.size() / maxf(dt, 0.008))) + 2
		while buf.size() > maxn: buf.pop_back()
		for j in ch.size():
			var dd := mini(buf.size() - 1, int(round(j * lag / maxf(dt, 0.008))))
			var s: Vector2 = buf[dd]
			var w := (1.0 + 0.6 * float(j) / ch.size()) / (ch.size() * 1.3)
			var base := float(shape[j]) if j < shape.size() else 0.0
			turn_rest(ch[j], Vector3.RIGHT, base + s.x * w + float(P.curl) * 0.2)
			turn_rest(ch[j], Vector3.UP, s.y * w * 1.8 + float(P.curl) * 0.3)
