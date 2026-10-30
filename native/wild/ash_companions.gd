class_name AshCompanions
extends Node3D
# Ash's own Pokémon out of their balls, walking with him in the world (up to two:
# life/wild.json follow.max). Not the townspeople's (companions.gd). cast.gd makes
# one; the party they come from is AshParty's (ash_party.gd).
#   sending out   send_out(i): he throws the ball (DuelActs' duel_throw), it arcs out
#                 and pops open in its flash, the Pokémon grows out of it; recall(k):
#                 the red beam, it shrinks back into the ball and the ball to his hand
#   following     each keeps to Ash's own trail (his breadcrumbs: where he walked, so
#                 round whatever he went round) a little behind and to its side (the
#                 first right, the second left), quicker when it falls back, by its
#                 species' gait (follow.species / families: run, walk, hop, fly, float,
#                 slither); clear of his feet and of each other; a step blocked is
#                 tried a little to either side; stuck or far behind it is put back by
#                 him (a puff of dust). He stops: they come up beside him (never in
#                 front), idle and look about, now and then at him. He crouches: they
#                 sneak (CreatureRig.sneak), birds come down and walk
#   water         follow.species.<id>.water: "no" never into water, "wade" / "swim"
#                 the shallows (deep water waits for the wading work)
#   persistence   who is out is saved (user://companions.save) and comes back with him
#                 through doors (hidden indoors, out again by him on the way out), into
#                 and out of the arena, after a warp, and on the next start (by species:
#                 one the party there doesn't have waits till it does)
#   battles       hidden through any battle that isn't lending them (lend / give_back:
#                 the ambushes' battles take the ones that went in, ambush.gd)
#
#   update(dt) once a frame (cast.gd, after Ash moved); busy() while a throw plays
#   out[k]: {species, level, node, pos, yaw, v, slot, state: "out" | "throw" | "recall" | "away" | "lent"}

const SAVE := "user://companions.save"
const PATH := "res://life/wild.json"

var game: Node3D
var cast: Node
var D: Dictionary = {}           # follow data
var DF: Dictionary = {}          # its defaults
var out: Array = []
var trail: Array = []            # Ash's breadcrumbs, newest first (Vector3)
var fx: BattleFx
var save_path := SAVE
var autosave := true
var t := 0.0
var _last_ash := Vector3(NAN, NAN, NAN)
var _still := 0.0
var _rng := RandomNumberGenerator.new()
var _loaded := false
var _was_indoors := false
var _was_battle := false
var _sync_t := 0.0
var log: Array = []              # (tests: teleports, blocks)

func setup(g: Node3D, c: Node) -> void:
	game = g; cast = c
	name = "AshCompanions"
	_rng.randomize()
	var j = JSON.parse_string(FileAccess.get_file_as_string(PATH)) if FileAccess.file_exists(PATH) else null
	D = (j as Dictionary).get("follow", {}) if j is Dictionary else {}
	DF = D.get("defaults", {})
	fx = BattleFx.new()
	fx.name = "CompanionFx"
	add_child(fx)
	fx.setup(game.cam, func(x: float, z: float) -> float: return game.world.height_at(x, z))
	if OS.get_cmdline_user_args().has("--fresh-companions"): save_path = "user://companions_dev.save"

func cap() -> int: return int(D.get("max", 2))
func num(k: String, d := 0.0) -> float: return float(DF.get(k, d))

# a species' following: {gait, water, speed} (its own over its family's)
func info(sp: String) -> Dictionary:
	var fam := String(Creature.species_info(sp).get("family", "legged"))
	var o: Dictionary = {"gait": "run", "water": "no", "speed": 1.0}
	o.merge(D.get("families", {}).get(fam, {}), true)
	if fam == "legged" and String(Creature.species_info(sp).get("stance", "")) == "round": o.gait = "hop"
	o.merge(D.get("species", {}).get(sp, {}), true)
	return o

static func can_water(sp_info: Dictionary) -> bool: return String(sp_info.get("water", "no")) != "no"

func party() -> Array: return AshParty.members(game)

func count() -> int: return out.filter(func(c): return String(c.state) != "recall").size()

func is_out(sp: String) -> bool:
	return out.any(func(c): return String(c.species) == sp and String(c.state) != "recall")

func of(sp: String) -> Dictionary:
	for c in out:
		if String(c.species) == sp: return c
	return {}

func busy() -> bool:
	return out.any(func(c): return String(c.state) == "throw" and float(c.t) < 0.75)

func shown() -> Array:
	return out.filter(func(c): return String(c.state) in ["out", "throw"] and c.node != null and is_instance_valid(c.node) and (c.node as Node3D).visible)

# ---------- out of the ball / back into it ----------
# party index i out (true = done); at: where it lands (default ahead of him, to his
# right); quick: no throw, it is just there (a load, a door)
func send_out(i: int, quick := false, at = null) -> bool:
	var P := party()
	if i < 0 or i >= P.size(): return false
	var m: Dictionary = P[i]
	var sp := String(m.species)
	if is_out(sp) or count() >= cap(): return false
	var me: Vector3 = game.pos
	var fwd := Vector3(sin(game.yaw), 0, cos(game.yaw))
	var rt := Vector3(-fwd.z, 0, fwd.x)
	var slot := _free_slot()
	var land: Vector3 = at if at is Vector3 else me + fwd * 1.8 + rt * (0.7 if slot == 0 else -0.7)
	land = game.world.collide(Vector3(land.x, 0, land.z), 0.3)
	land.y = game.world.height_at(land.x, land.z)
	var node := Wild.make_creature(sp)
	add_child(node)
	node.top_level = true
	if "auto" in node: node.auto = true
	var c := {"species": sp, "level": int(m.get("level", 5)), "node": node, "pos": land, "yaw": game.yaw, "v": 0.0, "slot": slot,
		"state": "out" if quick else "throw", "t": 0.0, "info": info(sp), "stuck": 0.0, "look_t": 1.0, "fly": false, "still": 0.0}
	node.global_position = land
	node.rotation.y = game.yaw
	out.append(c)
	if quick:
		node.scale = Vector3.ONE
	else:
		node.scale = Vector3.ONE * 0.001
		node.visible = false
		_throw(c)
	_save()
	print("companions: %s out%s" % [sp, " (quick)" if quick else ""])
	return true

func recall(k: int, quick := false) -> void:
	if k < 0 or k >= out.size(): return
	var c: Dictionary = out[k]
	if quick or c.node == null or not is_instance_valid(c.node):
		_drop(c); return
	c.state = "recall"; c.t = 0.0
	Sfx.play("whoosh", (c.node as Node3D).global_position, {"vol": -6.0, "pitch": 1.6})
	print("companions: %s recalled" % c.species)

func recall_species(sp: String, quick := false) -> void:
	for k in out.size():
		if String(out[k].species) == sp: recall(k, quick); return

func _drop(c: Dictionary) -> void:
	if c.node != null and is_instance_valid(c.node): (c.node as Node).queue_free()
	out.erase(c)
	_save()

func _free_slot() -> int:
	var used := out.map(func(c): return int(c.slot))
	return 0 if not 0 in used else 1

func _throw(c: Dictionary) -> void:
	DuelActs.register()
	var p: CastActor = cast.player
	game.speed = 0.0
	if p and p.idles: p.idles.force("duel_throw")
	# face where it goes
	var to: Vector3 = c.pos
	game.yaw = atan2(to.x - game.pos.x, to.z - game.pos.z)

func _hand() -> Vector3:
	var p: CastActor = cast.player
	if p == null: return game.pos + Vector3(0, 1.2, 0)
	var bi: int = p.bones.get("RHand", -1)
	if bi < 0: return p.global_position + Vector3(0, 1.2, 0)
	return p.skel.global_transform * p.skel.get_bone_global_pose(bi).origin

# ---------- the frame ----------
func update(dt: float) -> void:
	t += dt
	fx.update(dt)
	if not _loaded and t > 0.5: _load()
	var me: Vector3 = game.pos
	var indoors: bool = bool(game.get("indoors"))
	# a warp (a door, the arena, a staged battle's wipe): they are put back by him
	var jumped: bool = not is_nan(_last_ash.x) and Vector2(me.x - _last_ash.x, me.z - _last_ash.z).length() > 6.0
	_last_ash = me
	if jumped: trail.clear()
	_trail(me)
	var battle: bool = Battle.active and Battle.current != null
	if absf(float(game.speed)) > 0.3: _still = 0.0
	else: _still += dt
	_sync_t -= dt
	if _sync_t <= 0.0:
		_sync_t = 1.0
		_sync_party()
	for c in out.duplicate():
		var node: Node3D = c.node
		if node == null or not is_instance_valid(node):
			if String(c.state) == "lent": continue
			# (a battle may have freed it: a new one where it was)
			if String(c.state) == "recall": out.erase(c); continue
			node = Wild.make_creature(String(c.species))
			add_child(node); node.top_level = true
			c.node = node
			_put_back(c)
		c.t = float(c.t) + dt
		match String(c.state):
			"lent": continue
			"away":
				node.visible = false
				continue
			"recall":
				_recall_step(c, dt)
				continue
			"throw":
				_throw_step(c, dt)
				continue
		var hide: bool = indoors or (battle and not bool(c.get("lent", false)))
		if hide:
			node.visible = false
			continue
		if not node.visible or (_was_indoors and not indoors) or (_was_battle and not battle) or jumped:
			_put_back(c)
			node.visible = true
		_follow(c, dt, me)
	_was_indoors = indoors
	_was_battle = battle

func _trail(me: Vector3) -> void:
	if trail.is_empty() or Vector2(me.x - trail[0].x, me.z - trail[0].z).length() > num("crumb", 0.45):
		trail.push_front(me)
		if trail.size() > 60: trail.pop_back()

# the trail point s metres back along it from Ash (or the last crumb)
func _back_along(s: float) -> Vector3:
	var acc := 0.0
	var prev: Vector3 = game.pos
	for p in trail:
		var seg := Vector2(p.x - prev.x, p.z - prev.z).length()
		if acc + seg >= s and seg > 1e-4:
			return prev.lerp(p, (s - acc) / seg)
		acc += seg
		prev = p
	return prev

# its place: on the move, behind on his trail and out to its side; stopped, beside him
func _goal(c: Dictionary, me: Vector3, spd: float) -> Vector3:
	var fwd := Vector3(sin(game.yaw), 0, cos(game.yaw))
	var rt := Vector3(-fwd.z, 0, fwd.x)
	var sg := 1.0 if int(c.slot) == 0 else -1.0
	var bh: Array = DF.get("behind", [1.6, 2.6])
	var g: Vector3
	if spd > 0.4 or _still < 0.7:
		var s := float(bh[mini(int(c.slot), bh.size() - 1)]) + minf(spd, 9.0) * 0.12
		g = _back_along(s)
		# out to its side of the trail (the trail's own direction there)
		var ahead := _back_along(maxf(0.0, s - 0.6))
		var d := Vector3(ahead.x - g.x, 0, ahead.z - g.z)
		var side := Vector3(-d.z, 0, d.x).normalized() if d.length() > 0.05 else rt
		g += side * sg * num("side", 0.75)
		if String(c.info.gait) == "fly" and bool(c.fly): g -= (fwd * 0.6)
	else:
		g = me + rt * sg * num("beside", 1.15) - fwd * 0.25
	# never in the camera's face: a place by the lens goes over to his other side
	var cam: Camera3D = game.cam
	if cam != null:
		var cp := cam.global_position
		var lim := 3.2 if String(c.info.gait) == "fly" else 2.2
		var to_cam := Vector3(cp.x - me.x, 0, cp.z - me.z)
		var axis := to_cam.normalized()
		var lat := Vector3(g.x - me.x, 0, g.z - me.z)
		var along := lat.dot(axis)
		var most := to_cam.length() - lim
		if along > most: g = me + lat - axis * (along - most)
	var q: Vector3 = game.world.collide(Vector3(g.x, 0, g.z), 0.3)
	return Vector3(q.x, 0, q.z)

func _follow(c: Dictionary, dt: float, me: Vector3) -> void:
	var node: Node3D = c.node
	var I: Dictionary = c.info
	var gait := String(I.gait)
	var spd := absf(float(game.speed))
	var crouched: bool = bool(cast.crouching)
	var pos: Vector3 = c.pos
	var goal := _goal(c, me, spd)
	var to := Vector3(goal.x - pos.x, 0, goal.z - pos.z)
	var dist := to.length()
	var dash := Vector2(pos.x - me.x, pos.z - me.z).length()
	# far behind (or stuck): back by him, out of the way
	if dash > num("teleport_d", 24.0) or float(c.stuck) > num("stuck_s", 2.5):
		log.append({"t": "teleport", "species": c.species, "d": dash, "stuck": float(c.stuck)})
		_put_back(c, true)
		return
	# how fast: his pace, more to catch up, easing in as it arrives
	var top := num("run_v", 9.4) if gait in ["run", "fly", "float", "hop"] else num("walk_v", 4.6) * 1.35
	top *= float(I.get("speed", 1.0))
	if crouched: top = minf(top, num("sneak_v", 1.5) + maxf(0.0, dist - 2.0) * 0.8)
	var want := 0.0
	if dist > 0.2:
		want = (spd if spd > 0.4 else 0.0) + clampf((dist - 0.35) * (2.2 if dist < num("hurry_d", 4.0) else 3.4), 0.0, 8.0)
		if spd <= 0.4: want = clampf(dist * 2.0, 0.5, num("walk_v", 4.6))
	want = minf(want, top)
	c.v = move_toward(float(c.v), want, num("accel", 9.0) * dt)
	var dir := to / maxf(dist, 1e-4)
	# clear of his feet, and of the other one
	var off := Vector3(pos.x - me.x, 0, pos.z - me.z)
	if off.length() < num("personal", 0.8) and off.length() > 1e-3:
		dir = (dir + off.normalized() * 1.5).normalized()
		c.v = maxf(float(c.v), 1.2)
	for o in out:
		if o == c or String(o.state) != "out": continue
		var oo := Vector3(pos.x - o.pos.x, 0, pos.z - o.pos.z)
		if oo.length() < num("apart", 0.75) and oo.length() > 1e-3: dir = (dir + oo.normalized() * 0.8).normalized()
	var stepv := dir * float(c.v) * dt
	var wade := can_water(I)
	var np: Vector3 = game.world.step(pos, stepv.x, stepv.z, wade)
	var got := Vector2(np.x - pos.x, np.z - pos.z).length()
	if stepv.length() > 0.004 and got < stepv.length() * 0.3:
		# blocked: a little to one side or the other
		for a in [0.8, -0.8, 1.5, -1.5]:
			var d2 := stepv.rotated(Vector3.UP, a)
			var np2: Vector3 = game.world.step(pos, d2.x, d2.z, wade)
			if Vector2(np2.x - pos.x, np2.z - pos.z).length() > stepv.length() * 0.5:
				np = np2; got = d2.length(); break
		if got < stepv.length() * 0.3: c.stuck = float(c.stuck) + dt
	else:
		c.stuck = maxf(0.0, float(c.stuck) - dt * 2.0)
	pos = Vector3(np.x, game.world.height_at(np.x, np.z), np.z)
	c.pos = pos
	# which way it faces: where it goes; standing, his way or about
	var mv := got / maxf(dt, 1e-4)
	if mv > 0.25:
		c.yaw = lerp_angle(float(c.yaw), atan2(stepv.x, stepv.z), 1.0 - exp(-dt * num("turn", 10.0)))
	else:
		var face: float = game.yaw
		if dist < 0.4 and _still > 1.5:
			face = atan2(me.x - pos.x, me.z - pos.z) if fmod(t * 0.17 + int(c.slot) * 0.5, 1.0) < 0.3 else game.yaw + (0.6 if int(c.slot) == 0 else -0.6)
		c.yaw = lerp_angle(float(c.yaw), face, 1.0 - exp(-dt * 3.0))
	# its looks: his face now and then while he stands, its own idle looks the rest
	c.look_t = float(c.look_t) - dt
	if c.look_t <= 0.0:
		c.look_t = _rng.randf_range(2.0, 4.5)
		c.look_at = (me + Vector3(0, 1.3, 0)) if _still > 1.0 and _rng.randf() < 0.4 else Vector3(NAN, NAN, NAN)
	if "look_at_pos" in node: node.look_at_pos = c.get("look_at", Vector3(NAN, NAN, NAN))
	if "sneak" in node: node.sneak = 1.0 if crouched else 0.0
	_gait_moods(c, node, gait, spd, dist, crouched)
	node.global_position = pos
	node.rotation = Vector3(0, float(c.yaw), 0)
	node.scale = Vector3.ONE
	if node.has_method("animate"): node.animate(dt, mv)

# a bird flies to keep up with him and lands when he stops (or crouches); the rest go on foot
func _gait_moods(c: Dictionary, node: Node3D, gait: String, spd: float, dist: float, crouched: bool) -> void:
	if gait != "fly" or node.get("flying") == null: return
	var up: bool = bool(node.flying)
	if not up and not crouched and (spd > 3.0 or dist > 5.0):
		node.set("fly_height", 2.4)
		node.mood("fly")
		c.fly = true
		Sfx.play("wing_flap_small", node.global_position, {"vol": -10.0, "dist": 18.0})
	elif up and (crouched or (spd < 0.3 and _still > 0.8 and dist < 1.2)):
		node.mood("land")
		c.fly = false

# by him again: the place it would be, out of his way (or a little behind when that is blocked)
func _put_back(c: Dictionary, puff := false) -> void:
	var g := _goal(c, game.pos, 0.0)
	if Vector2(g.x - game.pos.x, g.z - game.pos.z).length() < 0.5 or game.world.flag(g.x, g.z) == 255:
		g = game.pos - Vector3(sin(game.yaw), 0, cos(game.yaw)) * 1.4
	g.y = game.world.height_at(g.x, g.z)
	c.pos = g
	c.v = 0.0
	c.stuck = 0.0
	c.yaw = game.yaw
	var node: Node3D = c.node
	if node and is_instance_valid(node):
		node.global_position = g
		node.rotation = Vector3(0, game.yaw, 0)
		node.scale = Vector3.ONE
		if node.has_method("reset"): node.reset()
		if node.get("flying") != null and bool(node.flying): node.set("flying", false)
	if puff: fx.dust(g, 6, Color("cdb68a"), 0.5, 0.3, 0.35)

func _throw_step(c: Dictionary, dt: float) -> void:
	var node: Node3D = c.node
	var tt := float(c.t)
	var rel := DuelActs.RELEASE
	if tt >= rel and not c.has("ball") and not c.has("pop_t"):
		var nb := PkmnBall.make()
		add_child(nb)
		c.ball = nb
		c.from = _hand()
		Sfx.play("throw", game.pos, {"vol": -4.0})
	if c.has("ball"):
		var u := clampf((tt - rel) / 0.55, 0.0, 1.0)
		var b = c.ball
		var land: Vector3 = c.pos + Vector3(0, 0.45, 0)
		if is_instance_valid(b):
			(b as Node3D).global_position = (c.from as Vector3).lerp(land, u) + Vector3(0, sin(u * PI) * 1.2, 0)
			(b as Node3D).rotation.x = -u * 10.0
		if u >= 1.0:
			if is_instance_valid(b): (b as Node).queue_free()
			c.erase("ball")
			PkmnBall.burst(fx, land)
			Sfx.play("whoosh", land, {"vol": -2.0, "pitch": 0.8})
			node.visible = true
			c.pop_t = tt
	if c.has("pop_t"):
		var k := clampf((tt - float(c.pop_t)) / 0.4, 0.0, 1.0)
		node.scale = Vector3.ONE * maxf(0.001, UITheme.ease_back(k, 1.6))
		node.global_position = c.pos
		node.rotation = Vector3(0, float(c.yaw), 0)
		if node.has_method("animate"): node.animate(dt, 0.0)
		if k >= 1.0:
			c.state = "out"
			c.erase("pop_t")
			if node.has_method("mood"): node.mood("happy" if _rng.randf() < 0.6 else "taunt")
			Sfx.play("critter_chirp", c.pos + Vector3(0, 0.4, 0), {"vol": -4.0, "pitch": 1.1})

func _recall_step(c: Dictionary, dt: float) -> void:
	var node: Node3D = c.node
	var u := clampf(float(c.t) / 0.5, 0.0, 1.0)
	var p := node.global_position + Vector3(0, 0.4, 0)
	var h := _hand()
	if int(float(c.t) * 60.0) % 2 == 0:
		fx.spawn("star", h.lerp(p, randf()), Vector3.ZERO, {"life": 0.18, "size": 0.22, "size_end": 0.05, "col": Color(1.0, 0.25, 0.2, 1.0), "rot": randf() * TAU})
	fx.flash(node, Color(1.0, 0.3, 0.25), 0.1)
	node.scale = Vector3.ONE * maxf(0.001, 1.0 - u)
	if node.has_method("animate"): node.animate(dt, 0.0)
	if u >= 1.0:
		fx.spawn("ring", p, Vector3.ZERO, {"life": 0.3, "size": 0.2, "size_end": 1.0, "col": Color(1.0, 0.3, 0.25, 0.9)})
		_drop(c)

# ---------- the ambushes' battles borrow them (ambush.gd) ----------
func lend(c: Dictionary) -> void:
	c.state = "lent"
	c.lent = true

# after the battle: each lent one back by him (a new node if the battle used its own)
func give_back() -> void:
	for c in out:
		if String(c.state) == "lent":
			c.state = "out"
			c.erase("lent")
			if c.node != null and is_instance_valid(c.node):
				var n: Node3D = c.node
				if n.get_parent() != self:
					var gp := n.global_position
					n.get_parent().remove_child(n); add_child(n); n.global_position = gp
				n.top_level = true
				n.scale = Vector3.ONE
				if n.has_meta("battle"): n.remove_meta("battle")
				if "battle" in n: n.battle = false
				if "auto" in n: n.auto = true
				if n.has_method("mood"): n.mood("idle")
				n.visible = true
				c.pos = Vector3(n.global_position.x, game.world.height_at(n.global_position.x, n.global_position.z), n.global_position.z)
	_was_battle = false

# the nearest shown one to p: {} if none
func nearest(p: Vector3) -> Dictionary:
	var best := {}
	var bd := INF
	for c in shown():
		var d := Vector2(c.pos.x - p.x, c.pos.z - p.z).length()
		if d < bd: bd = d; best = c
	return best

# ---------- who is out: the party there, and the save ----------
func _sync_party() -> void:
	var P := party()
	var have := P.map(func(m): return String(m.species))
	for c in out:
		var there: bool = have.has(String(c.species))
		if String(c.state) == "out" and not there: c.state = "away"
		elif String(c.state) == "away" and there:
			c.state = "out"
			_put_back(c)

func _save() -> void:
	if not autosave: return
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f == null: return
	f.store_string(JSON.stringify({"out": out.filter(func(c): return String(c.state) != "recall").map(func(c): return {"species": c.species, "level": c.level})}))

func saved() -> Array:
	if not FileAccess.file_exists(save_path): return []
	var v = JSON.parse_string(FileAccess.get_file_as_string(save_path))
	return v.get("out", []) if v is Dictionary else []

func _load() -> void:
	_loaded = true
	var want := saved()
	if want.is_empty(): return
	var P := party()
	var was := autosave
	autosave = false
	for w in want:
		var idx := -1
		for i in P.size():
			if String(P[i].species) == String(w.species): idx = i; break
		if idx >= 0: send_out(idx, true)
		else:
			# not in this party (yet): kept, away
			var node := Wild.make_creature(String(w.species))
			add_child(node); node.top_level = true; node.visible = false
			out.append({"species": String(w.species), "level": int(w.get("level", 5)), "node": node, "pos": game.pos, "yaw": 0.0, "v": 0.0,
				"slot": _free_slot(), "state": "away", "t": 0.0, "info": info(String(w.species)), "stuck": 0.0, "look_t": 1.0, "fly": false})
	autosave = was
	print("companions: back out: %s" % ", ".join(out.map(func(c): return String(c.species))))
