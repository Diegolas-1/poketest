class_name CreatureBulbasaur
extends CreatureRig
# Bulbasaur, Ivysaur and Venusaur, on all fours. Rig: Waist - Hips - (L/RHips) -
# L/RThigh - Leg - Foot - Toe; Spine1 (the back: the plant on it) - Spine2 - (Neck1 - 2)
# - Head (Jaw; L/REar), L/RShoulder - Arm - ForeArm - Hand. The plant: Bulbasaur's bulb
# (Feeler) with the two vines inside it (L/RFeelerC01 .. C10, their own meshes "vine_l"
# / "vine_r", shown only while they are out); Ivysaur's bud (FeelerA1 - 2, FeelerB, C)
# and leaves (L/RFeeler1 - 3); Venusaur's flower (FeelerA1 - A2, the petals L/RFeelerB ..
# D) and fronds (L/RFeelerA1 - 3, FeelerB, C).
# The plant breathes with it (the bulb swelling, the leaves lifting), and the leaves
# rustle as it walks.
# Moods (besides CreatureRig's): vine_whip (the vines out of the bulb and lashed down at
# the target, twice: fx("vine") at their tips, an impact each), razor_leaf (a heave of
# the bulb, leaves flung: fx("leaf") from point("bulb")), leech_seed (fx("seed")),
# sleep_powder / poison_powder / stun_spore (the bulb shaken: fx("powder")), sweet_scent,
# growth (the plant swells: fx("glow")), synthesis (basking, fx("sun")), solar_beam (a
# charge drawn into the bulb, then the beam from the mouth: fx("solar_charge"), fx("beam")),
# petal_dance (Venusaur: a spin, petals flying), take_down, tackle, double_edge, seed_bomb.
# Points: "bulb" (the plant's top), "vine_l", "vine_r" (the vine tips), "mouth", "head".

var plant := PackedInt32Array()   # the plant's root bone(s) on the back
var leaves := []                  # [bone, sg] the leaves / fronds / petals that lift
var vines := []                   # per side: {chain, mesh, sg, out (spring)}
var swell := Vector2(1.0, 0.0)

func _rig_ready() -> void:
	durs.merge({"vine_whip": 2.2, "razor_leaf": 1.6, "leech_seed": 1.4, "sleep_powder": 1.8, "poison_powder": 1.8,
		"stun_spore": 1.8, "sweet_scent": 1.8, "growth": 2.0, "synthesis": 2.4, "solar_beam": 3.2, "petal_dance": 2.6,
		"take_down": 1.4, "double_edge": 1.6, "seed_bomb": 1.4, "power_whip": 2.2}, true)
	for nm in ["Feeler", "FeelerA1"]:
		if b(nm) >= 0: plant.append(b(nm))
	for i in skel.get_bone_count():
		var nm := skel.get_bone_name(i)
		if nm.begins_with("End") or not nm.contains("Feeler") or nm.contains("FeelerC0") or nm.contains("FeelerC1"): continue
		if plant.has(i): continue
		var sg := 1.0 if nm.begins_with("L") else (-1.0 if nm.begins_with("R") else 0.0)
		leaves.append([i, sg, rng.randf() * TAU])
	for s in [["L", 1.0], ["R", -1.0]]:
		var ch := PackedInt32Array()
		for k in range(1, 11):
			var bi := b("%sFeelerC%02d" % [s[0], k])
			if bi >= 0: ch.append(bi)
		if ch.is_empty(): continue
		var mesh: MeshInstance3D = null
		for m3 in meshes:
			if String(m3.name).ends_with("vine_" + String(s[0]).to_lower()): mesh = m3
		vines.append({"chain": ch, "mesh": mesh, "sg": s[1], "out": Vector2.ZERO})
		if mesh: mesh.visible = false

func point(n: String) -> Vector3:
	match n:
		"bulb":
			if not plant.is_empty():
				var k := _kids(plant[0])
				return to_world(G[k[0]].origin if not k.is_empty() else G[plant[0]].origin)
		"vine_l", "vine_r":
			for v in vines:
				if (v.sg > 0.0) == (n == "vine_l"):
					var ch: PackedInt32Array = v.chain
					return to_world(G[ch[ch.size() - 1]].origin)
	return super.point(n)

func _base_species(P: Dictionary, _dt: float, _v: float) -> void:
	P.merge({"vine": [0.0, 0.0], "lash": [0.0, 0.0], "reachv": [0.0, 0.0], "swell": 1.0, "leaf": 0.0, "spin": 0.0}, true)
	P.swell += sin(t * 2.2) * 0.025
	P.leaf += sin(t * 2.2) * 0.08 + walk_w * 0.25 * sin(phase * TAU * 2.0) + 0.15 * battle_w

func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	var env := sm(0.0, 0.15, u) * sm(d, d - 0.3, u)
	match act:
		"vine_whip", "power_whip":
			# the vines snake out of the bulb, rear up and back, and crack down at the
			# target one after the other (twice), then draw back in
			var out := sm(0.05, 0.4, u) * (1.0 - sm(d - 0.45, d - 0.05, u))
			P.crouch += 0.3 * env
			P.lean += 0.1 * env
			P.eye = "angry"
			P.mouth = "frown"
			for i in 2:
				P.vine[i] = out
				var lash := 0.0
				for n in 2:
					var at := 0.65 + n * 0.6 + i * 0.18
					# reared back (+), then the crack down (-)
					lash += bump(u, at - 0.32, at - 0.03) - bump(u, at - 0.06, at + 0.22)
					if _ev("h%d%d" % [n, i], at):
						impact.emit(act)
						fx.emit("vine", point("vine_l" if i == 0 else "vine_r"))
				P.lash[i] = lash
		"razor_leaf", "leech_seed", "seed_bomb":
			var heave := bump(u, 0.2, 0.7)
			P.crouch += 0.5 * bump(u, 0.0, 0.3) - 0.2 * heave
			P.lean -= 0.15 * heave
			P.swell += 0.12 * heave
			P.leaf += 0.9 * heave
			P.eye = "angry"
			var n := 4 if act == "razor_leaf" else 1
			for k in n:
				if _ev("l%d" % k, 0.45 + k * 0.1):
					fx.emit({"razor_leaf": "leaf", "leech_seed": "seed", "seed_bomb": "seed"}[act], point("bulb"))
			if _ev("hit", 0.7): impact.emit(act)
		"sleep_powder", "poison_powder", "stun_spore", "sweet_scent":
			# the bulb shaken: a cloud of powder puffed out of it
			var k := sm(0.0, 0.25, u) * sm(d, d - 0.3, u)
			P.roll += sin(u * 30.0) * 0.06 * k
			P.swell += 0.08 * k + sin(u * 30.0) * 0.03 * k
			P.leaf += 0.6 * k
			P.crouch += 0.25 * k
			P.eye = "closed" if act == "sweet_scent" else "angry"
			for n in 4:
				if _ev("p%d" % n, 0.4 + n * 0.25): fx.emit("powder" if act != "sweet_scent" else "scent", point("bulb"))
			if _ev("hit", 0.9): impact.emit(act)
		"growth", "synthesis":
			var k := sm(0.0, 0.5, u) * sm(d, d - 0.5, u)
			P.swell += 0.18 * k
			P.leaf += 1.2 * k
			P.lean -= 0.12 * k
			P.hp = 0.45 * k
			P.eye = "closed" if k > 0.4 else ""
			P.mouth = "smile"
			if _ev("g", 0.5): fx.emit("glow" if act == "growth" else "sun", point("bulb"))
		"solar_beam":
			# the light drawn into the bulb (glowing, the leaves raised to it), then the beam
			var charge := sm(0.0, 0.5, u) * (1.0 - sm(1.8, 1.9, u))
			var fire := sm(1.85, 1.95, u) * sm(d, d - 0.4, u)
			P.swell += 0.12 * charge + 0.05 * fire
			P.leaf += 1.0 * charge + 0.4 * fire
			P.lean -= 0.1 * charge
			P.hp = 0.3 * charge - 0.1 * fire
			P.crouch += 0.4 * fire
			P.jaw = 1.0 * fire
			P.mouth = "wide" if fire > 0.2 else ""
			P.eye = "closed" if charge > 0.3 else "angry"
			for n in 4:
				if _ev("c%d" % n, 0.3 + n * 0.35): fx.emit("solar_charge", point("bulb"))
			if _ev("b", 1.9):
				impact.emit(act)
				fx.emit("beam", point("mouth"))
		"petal_dance":
			var k := sm(0.0, 0.3, u) * sm(d, d - 0.4, u)
			P.spin = TAU * 1.5 * sm(0.2, d - 0.3, u)
			P.leaf += 1.0 * k
			P.swell += 0.1 * k
			P.eye = "happy"
			P.y += absf(sin(u * 8.0)) * 0.05 * sz * k
			for n in 6:
				if _ev("p%d" % n, 0.3 + n * 0.35): fx.emit("petals", point("bulb"))
			if _ev("hit", 1.3): impact.emit(act)
		"take_down", "double_edge":
			_strike(P, dt, u, d, 1.2, true)
			P.lean += 0.25 * env
			P.hp = -0.3 * env
		_:
			return false
	return true

func _body(P: Dictionary, dt: float) -> void:
	super._body(P, dt)
	var sp := float(P.get("spin", 0.0))
	if absf(sp) > 0.001:
		var B: Basis = _tg[W]
		set_global(W, Basis(Vector3.UP, sp) * B)
		_Tw = Transform3D(Basis(Vector3.UP, sp) * B, _Tw.origin)

func _after(P: Dictionary, dt: float) -> void:
	# the plant: swelling with each breath (and an act), its leaves lifting and rustling
	swell = spring(swell, float(P.swell), 14.0, dt, 0.5)
	for pb in plant: skel.set_bone_pose_scale(pb, Vector3.ONE * swell.x)
	var lf := float(P.leaf)
	for l in leaves:
		var a := (lf * 0.25 + sin(t * 3.1 + float(l[2])) * 0.04) * (1.0 if l[1] != 0.0 else 0.6)
		turn_rest(l[0], Vector3(0, 0, 1), float(l[1]) * a)
		turn_rest(l[0], Vector3.RIGHT, -a * 0.5)
	# the vines: grown out of the bulb (the chain scaled up from nothing), then curled
	# forward over the head, lashing (lash < 0: the crack down at the target)
	for i in vines.size():
		var v: Dictionary = vines[i]
		v.out = spring(v.out, float(P.vine[i]), 10.0, dt, 0.8)
		var o := clampf(v.out.x, 0.0, 1.0)
		var mesh: MeshInstance3D = v.mesh
		if mesh: mesh.visible = o > 0.02
		var ch: PackedInt32Array = v.chain
		if o <= 0.02: continue
		skel.set_bone_pose_scale(ch[0], Vector3.ONE * maxf(0.02, o))
		var lash := float(P.lash[i])
		var n := ch.size()
		var sg: float = v.sg
		for k in n:
			var f := float(k) / n
			# out to its side, up and over forward; lash > 0 reared back, < 0 cracked down
			var bend := (0.12 + 0.08 * f) - 0.22 * lash * (1.0 - f) + 0.1 * sin(t * 5.0 + f * 6.0) * (1.0 - absf(lash))
			if lash < 0.0: bend = 0.2 + 0.12 * f + 0.1 * (-lash)
			turn_rest(ch[k], Vector3.RIGHT, bend)
			if k == 0: turn_rest(ch[k], Vector3(0, 0, 1), -sg * 0.6)
