class_name Ambush
extends Node
# Ambushes: a kind of encounter of its own (wild.gd makes one; the numbers are
# life/wild.json "ambush"). Opportunistic Pokémon (Beedrill, Spearow, Ekans, Arbok,
# Rattata, Mankey: species.<id>, each with its cover, its temperaments and how likely
# each lies in wait) hide in cover by Ash's way and jump him when he walks past
# carelessly. Generic over the cover (AmbushCover: bushes, thickets, tall grass; tree
# tops later), so any place with cover can have them.
#   set           now and then (rate_s of walking near cover, per area; a cooldown
#                 after each) one settles in cover a few metres ahead of him; a swarm
#                 (2 to 4, the ones with "swarm") is rare: its own chance per area, its
#                 own cooldown and a minimum gap between two
#   lurking       hidden in the cover. Walking past upright (or fast) within its
#                 trigger_d: the warning beat (a rustle, the cry, a "!" bang) and the
#                 strike. Crouched and slow he usually spots it first (spot_p within
#                 spot_d): it shows as a tell (low at the cover's edge, the leaves
#                 twitching, a "?" over it); he can back off, or make the first move (A)
#   jumped        they burst out and land in front of him. His Pokémon already out
#                 intercept at once (the nearest of his to the nearest of them); else the
#                 standoff: RUN (an escape chance; it may chase a little way) or POKéMON
#                 (the party menu: the one picked is thrown, runs in by him and engages);
#                 he freezes too long and it attacks
#   the battle    Battle.start: Ash alone with no party is the prologue's battle (his
#                 stamina his health); one of his against one of them singles, two of
#                 his or a swarm doubles (battle/pkmn_doubles.gd), a swarm two at a time,
#                 the next two in when both are down (opts.waves). The world outside
#                 waits while it runs (opts.pause_world: Battle.world_paused)
#
# wild.gd: update(dt) each frame outside, use_pressed() on A, busy() / input() while it
# has the controls; force = {...} sets the next one (the arena, tests).

const COVER := preload("res://wild/ambush_cover.gd")

var wild: Wild
var game: Node3D
var cast: Node
var A: Dictionary = {}           # wild.json "ambush"
var T: Dictionary = {}           # its tuning
var cur: Dictionary = {}         # the ambush going on ({} none)
var covers: Array = []           # AmbushCover
var t := 0.0
var cooldown := 0.0
var swarm_cd := 0.0
var last_swarm := -1e9
var _check := 0.0
var force := {}                  # {species, n, cover: {at, kind, r}, level, temper} the next one, now
var on_arena := false            # (the arena's AMBUSH page: ambushes there)
var hud: Control
var stats := {"set": 0, "swarms": 0, "strikes": 0, "spotted": 0, "battles": 0, "ran": 0, "caught": 0, "escaped": 0}
var last_opts := {}              # (tests: the last battle's opts)
var battle_extra := {}           # (tests, renders: merged into the battle's opts: {"auto": true, "seed": n})
var log: Array = []              # (tests: what happened, in order)
var _rng := RandomNumberGenerator.new()
var _battle: Object = null

func setup(w: Wild) -> void:
	wild = w; game = w.game; cast = w.cast
	_rng.randomize()
	var j = JSON.parse_string(FileAccess.get_file_as_string(WildBrain.PATH)) if FileAccess.file_exists(WildBrain.PATH) else null
	A = (j as Dictionary).get("ambush", {}) if j is Dictionary else {}
	T = A.get("tuning", {})
	cooldown = float(T.get("first_s", 20.0))
	covers = [COVER.Town.new(self), COVER.Arena.new(self)]
	hud = Hud.new()
	hud.amb = self
	w.hud.get_parent().add_child(hud)

func tn(k: String, d := 0.0) -> float: return float(T.get(k, d))
func tv(k: String, sub: String, d := 0.0) -> float: return float(T.get(k, {}).get(sub, d))
func sp(id: String) -> Dictionary: return A.get("species", {}).get(id, {})
func ambushers() -> Array: return A.get("species", {}).keys()
func swarm_cfg() -> Dictionary: return A.get("swarm", {})
func comps() -> AshCompanions: return cast.get("companions")
func party() -> Array: return AshParty.members(game)

# the area Ash is in for ambushes ("" none): Route 1, or the arena with its page on
func region(p: Vector3) -> String:
	if BattleArena.I != null: return "arena" if on_arena else ""
	return "route1" if p.z < -66.0 and p.z > -420.0 else ""

func area(reg: String) -> Dictionary: return A.get("areas", {}).get(reg, {"rate": 1.0, "swarm": 1.0})

# ---------- what wild.gd asks ----------
func busy() -> bool:
	return String(cur.get("state", "")) in ["strike", "standoff", "menu", "throw", "intercept", "dash", "stumble"]

func lurking() -> bool: return String(cur.get("state", "")) in ["lurk", "spotted"]

# A: the first move on one he spotted (true = taken)
func use_pressed() -> bool:
	if String(cur.get("state", "")) != "spotted": return false
	if _d_lead() > 5.5: return false
	_first_move()
	return true

# the controls while it has them: A (the party menu), the run (Jump / B / Run)
func input(a: bool, run: bool) -> void:
	if String(cur.get("state", "")) != "standoff": return
	if run: _try_run()
	elif a: _open_menu()

# ---------- the frame ----------
func update(dt: float) -> void:
	t += dt
	if Battle.active: return
	if cur.is_empty():
		cooldown -= dt
		swarm_cd -= dt
		if not force.is_empty():
			_set_one(force)
			force = {}
			return
		_check -= dt
		if _check <= 0.0:
			_check = tn("check_s", 1.0)
			if cooldown <= 0.0: _try_set()
		return
	_step(dt)

# ---------- setting one ----------
func _try_set() -> void:
	var me: Vector3 = game.pos
	var reg := region(me)
	if reg == "" or bool(game.get("indoors")) or wild.tut.running() or wild.hunt != null or not wild.encs.is_empty(): return
	if cast.bike != null and cast.bike.riding(): return
	if BattleArena.I == null and not bool(wild.tut.get("done")): return
	var spd := absf(float(game.speed))
	var ar := area(reg)
	var walking := 1.0 if spd > 0.6 else 0.35
	var p := 1.0 - exp(-tn("check_s", 1.0) / maxf(1.0, tn("rate_s", 150.0)) * float(ar.get("rate", 1.0)) * walking)
	if _rng.randf() >= p: return
	var spot := _cover_ahead(me, float(game.yaw))
	if spot.is_empty(): return
	var id := _pick_species(reg, String(spot.kind))
	if id == "": return
	var S := sp(id)
	var temper := _weighted(S.get("temper", {"aggressive": 1.0}))
	if _rng.randf() >= float(S.get("strike", {}).get(temper, 0.8)):
		cooldown = 10.0
		return
	_set_one({"species": id, "temper": temper, "cover": spot, "n": swarm_size(id, reg)})

# how many come: 1, or a swarm (2 to 4) now and then: never within its cooldown or the
# minimum gap since the last swarm, and then only at its per-area chance
func swarm_size(id: String, reg: String) -> int:
	var sw: Dictionary = sp(id).get("swarm", {})
	var SW := swarm_cfg()
	if sw.is_empty() or swarm_cd > 0.0 or t - last_swarm < float(SW.get("min_gap_s", 900.0)): return 1
	if _rng.randf() >= float(SW.get("chance", 0.18)) * float(area(reg).get("swarm", 1.0)) * float(sw.get("weight", 1.0)): return 1
	var sz: Array = sw.get("size", [2, 4])
	return clampi(_rng.randi_range(int(sz[0]), int(sz[1])), 2, int(SW.get("max", 4)))

# a spot of cover ahead of him (set_d, in a cone round where he faces), facing his way
func _cover_ahead(me: Vector3, yaw: float) -> Dictionary:
	var dd: Array = T.get("set_d", [5.0, 10.0])
	var cone := tn("set_cone", 0.9)
	var fwd := Vector3(sin(yaw), 0, cos(yaw))
	var best := {}
	var bs := -INF
	for cv in covers:
		for c in cv.spots(me, float(dd[1]) + 2.0, yaw, float(dd[0]), float(dd[1]), _rng):
			var at: Vector3 = c.at
			var v := Vector3(at.x - me.x, 0, at.z - me.z)
			var d := v.length()
			if d < float(dd[0]) or d > float(dd[1]): continue
			var ang := acos(clampf(v.normalized().dot(fwd), -1.0, 1.0))
			if ang > cone: continue
			var s := -ang + _rng.randf() * 0.5
			if s > bs: bs = s; best = c
	return best

func _pick_species(reg: String, kind: String) -> String:
	var w := {}
	for id in ambushers():
		var S := sp(id)
		if not (S.get("regions", []) as Array).has(reg): continue
		var cw := float(S.get("cover", {}).get(kind, 0.0))
		if cw <= 0.0: continue
		w[id] = cw * float(S.get("rate", 1.0))
	return _weighted(w) if not w.is_empty() else ""

func _weighted(w: Dictionary) -> String:
	var tot := 0.0
	for k in w: tot += maxf(0.0, float(w[k]))
	if tot <= 0.0: return String(w.keys()[0]) if not w.is_empty() else ""
	var r := _rng.randf() * tot
	for k in w:
		r -= maxf(0.0, float(w[k]))
		if r <= 0.0: return String(k)
	return String(w.keys()[-1])

# o: {species, n, cover: {at, kind, r}, temper?, level?}
func _set_one(o: Dictionary) -> void:
	var id := String(o.species)
	var S := sp(id)
	var n := clampi(int(o.get("n", 1)), 1, int(swarm_cfg().get("max", 4)))
	var cv: Dictionary = o.cover
	var temper := String(o.get("temper", _weighted(S.get("temper", {"aggressive": 1.0}))))
	var lv: Array = S.get("level", [5, 9])
	var me: Vector3 = game.pos
	var at: Vector3 = cv.at
	# at the cover's edge on his side (a bush's, a thicket's; in tall grass where it is)
	var toward := Vector3(me.x - at.x, 0, me.z - at.z).normalized()
	var edge := at + toward * float(cv.get("r", 0.0)) * (0.55 if String(cv.kind) != "tall_grass" else 0.0)
	var side := Vector3(-toward.z, 0, toward.x)
	var members := []
	for i in n:
		var off := side * (float(i) - (n - 1) * 0.5) * 0.75 - toward * (0.35 if i % 2 == 1 else 0.0)
		var p := edge + off
		p.y = game.world.height_at(p.x, p.z)
		var node := Wild.make_creature(id)
		cast.add_child(node)
		node.position = p
		node.rotation.y = atan2(toward.x, toward.z)
		node.visible = false
		if "auto" in node: node.auto = false
		node.call("mood", "hide")
		members.append({"node": node, "home": p, "level": int(o.get("level", _rng.randi_range(int(lv[0]), int(lv[1])))), "from": p, "to": p, "out": false})
	cur = {"species": id, "temper": temper, "kind": String(cv.kind), "cover": cv, "members": members, "state": "lurk", "t": 0.0, "life": 0.0,
		"spotted": false, "rolled": false, "swarm": n > 1, "far_t": 0.0, "rustle_t": 2.0, "notice_t": 0.0, "first": "wild", "engaged": []}
	stats.set = int(stats.set) + 1
	if n > 1:
		stats.swarms = int(stats.swarms) + 1
		last_swarm = t
		swarm_cd = float(swarm_cfg().get("cooldown_s", 600.0))
	cooldown = tn("cooldown_s", 75.0)
	_log("set", {"species": id, "n": n, "kind": cv.kind, "temper": temper})
	print("ambush: %s%s (%s) in a %s at %s, %.1f m from Ash" % [id, " x%d" % n if n > 1 else "", temper, cv.kind, str(edge), Wild._d2(me, edge)])

func _log(what: String, d := {}) -> void:
	var e := {"t": t, "what": what}
	e.merge(d)
	log.append(e)

func name_of(id: String) -> String: return String(BattleEnergy.species_data(id).get("name", id.capitalize()))
func _lead() -> Dictionary: return cur.members[0] if not cur.is_empty() and not (cur.members as Array).is_empty() else {}
func _d_lead() -> float:
	var l := _lead()
	return Wild._d2(game.pos, (l.node as Node3D).position) if not l.is_empty() else INF

# ---------- one ambush, a frame ----------
func _step(dt: float) -> void:
	cur.t = float(cur.t) + dt
	cur.life = float(cur.life) + dt
	var me: Vector3 = game.pos
	var spd := absf(float(game.speed))
	var crouched: bool = bool(cast.crouching)
	var careless: bool = not crouched or spd > tn("careless_v", 1.7)
	var S := sp(String(cur.species))
	var d := _d_lead()
	match String(cur.state):
		"lurk", "spotted":
			var spotted := bool(cur.spotted)
			if not spotted and not careless and not bool(cur.rolled) and d < tn("spot_d", 7.5):
				cur.rolled = true
				if _rng.randf() < tn("spot_p", 0.85): _spot()
			var trig := float(S.get("trigger_d", 3.2)) * (tn("spot_close", 0.55) if not careless else 1.0)
			if bool(cur.spotted):
				# seen first: it springs only if he gets careless by it, or right on it
				cur.notice_t = float(cur.notice_t) - dt
				if d < float(S.get("trigger_d", 3.2)) and careless: _warn()
				elif d < tn("notice_close_d", 1.3) and cur.notice_t <= 0.0:
					cur.notice_t = 1.0
					if _rng.randf() < tn("notice_close_p", 0.35): _warn()
				_tell(dt)
			elif d < trig: _warn()
			else:
				# a faint rustle now and then for one who listens
				cur.rustle_t = float(cur.rustle_t) - dt
				if cur.rustle_t <= 0.0:
					cur.rustle_t = _rng.randf_range(4.0, 8.0)
					if d < 10.0: _rustle(0.4)
			# he went on his way: it gives up waiting
			if d > tn("leave_d", 16.0): cur.far_t = float(cur.far_t) + dt
			else: cur.far_t = 0.0
			if String(cur.state) in ["lurk", "spotted"] and (float(cur.far_t) > 4.0 or float(cur.life) > tn("lurk_s", 45.0)):
				_log("gave_up")
				_clear()
				return
		"warn": _warn_step(dt)
		"strike": _strike_step(dt)
		"standoff":
			_face_all(me, dt)
			if float(cur.t) > tn("standoff_s", 3.2):
				_log("froze")
				wild.toaster.push("warn", "IT ATTACKS!", "%s didn't wait for you to make up your mind!" % name_of(String(cur.species)), "bang", 1.6)
				var P := party()
				if P.is_empty(): _start_battle("wild")
				else: _send(0, "wild")
		"menu": _face_all(me, dt)
		"throw":
			_face_all(me, dt)
			var c := comps()
			var ready := true
			for e in cur.engaged:
				if String(e.get("state", "")) != "out": ready = false
			if ready or float(cur.t) > 3.0: _intercept()
		"intercept": _intercept_step(dt)
		"dash": _dash_step(dt)
		"chase": _chase_step(dt)
		"stumble":
			if float(cur.t) > 0.5: _start_battle("wild")
		"leave": _leave_step(dt)
		"out":
			if float(cur.t) > 1.6: _clear()
	for m in cur.get("members", []):
		var n: Node3D = m.node
		if not is_instance_valid(n): continue
		var v := 0.0
		if m.has("last"): v = (n.position - (m.last as Vector3)).length() / maxf(dt, 1e-4)
		m.last = n.position
		if n.has_method("animate"): n.call("animate", dt, v)

# ---------- seen first ----------
func _spot() -> void:
	cur.spotted = true
	cur.state = "spotted"
	cur.t = 0.0
	stats.spotted = int(stats.spotted) + 1
	_log("spotted")
	for m in cur.members:
		var n: Node3D = m.node
		n.visible = true
		n.call("mood", "hide")
	var nm := name_of(String(cur.species))
	var what := ("%d %s" % [cur.members.size(), nm.to_upper()]) if bool(cur.swarm) else nm.to_upper()
	wild.toaster.push("info", "YOU SPOTTED IT FIRST", "%s lying in wait in the %s. Back off quietly, or press A to make the first move." % [what if bool(cur.swarm) else "A " + what, _kind_text(String(cur.kind))], "star", 3.4)
	Sfx.play("ui_confirm", null, {"vol": -10.0})

func _tell(dt: float) -> void:
	cur.rustle_t = float(cur.rustle_t) - dt
	if cur.rustle_t <= 0.0:
		cur.rustle_t = _rng.randf_range(1.4, 2.8)
		_rustle(0.5)
	for m in cur.members:
		var n: Node3D = m.node
		if "look_at_pos" in n: n.look_at_pos = Vector3(NAN, NAN, NAN)

func _rustle(k: float) -> void:
	var l := _lead()
	if l.is_empty(): return
	var at: Vector3 = (l.node as Node3D).position
	if String(cur.kind) == "tall_grass":
		Sfx.play("creature_rustle", at, {"vol": -12.0 + k * 6.0, "dist": 18.0})
		wild._feather(at + Vector3(0, 0.5, 0), true)
	else:
		Sfx.play("bush_rustle", at + Vector3(0, 0.8, 0), {"vol": -14.0 + k * 8.0, "dist": 18.0})
		for i in int(1 + k * 3.0): wild._feather(at + Vector3(_rng.randf_range(-0.5, 0.5), 0.9, _rng.randf_range(-0.5, 0.5)), true)

# A on one he spotted: his move first
func _first_move() -> void:
	_log("first_move")
	cur.first = "ash"
	for m in cur.members: (m.node as Node3D).visible = true
	var c := comps()
	if c and not c.shown().is_empty():
		cur.state = "standoff"
		_intercept()
		return
	if party().is_empty():
		_start_battle("ash")
		return
	cur.state = "standoff"; cur.t = 0.0
	_open_menu()

# ---------- the warning beat, the strike ----------
func _warn() -> void:
	cur.state = "warn"; cur.t = 0.0
	cur.beat = 0
	stats.strikes = int(stats.strikes) + 1
	_log("warn")
	_rustle(1.0)

func _warn_step(_dt: float) -> void:
	var W: Dictionary = T.get("warn", {})
	var r := float(W.get("rustle", 0.55))
	var c := float(W.get("cry", 0.4))
	var b := float(W.get("bang", 0.45))
	var tt := float(cur.t)
	if int(cur.beat) == 0 and tt > r * 0.5:
		cur.beat = 1
		_rustle(1.0)
	if int(cur.beat) == 1 and tt > r:
		cur.beat = 2
		_cry()
		for m in cur.members:
			(m.node as Node3D).visible = true
			(m.node as Node3D).call("mood", "startle")
	if int(cur.beat) == 2 and tt > r + c:
		cur.beat = 3
		cur.bang_t = t
		Sfx.play("encounter", null, {"vol": -3.0})
		var nm := name_of(String(cur.species)).to_upper()
		wild.toaster.push("warn", ("A SWARM OF %s!" % nm) if bool(cur.swarm) else "%s AMBUSH!" % nm, "%s burst out of the %s at you!" % [("%d of them" % cur.members.size()) if bool(cur.swarm) else "It", _kind_text(String(cur.kind))], "bang", 2.0)
	if tt > r + c + b: _strike()

func _cry() -> void:
	var l := _lead()
	var at: Vector3 = (l.node as Node3D).position + Vector3(0, 0.6, 0)
	match String(sp(String(cur.species)).get("cry", "")):
		"buzz":
			Sfx.play("wing_flap_small", at, {"vol": 0.0, "pitch": 2.2})
			Sfx.play("critter_chirp", at, {"vol": -2.0, "pitch": 0.6})
		"screech": Sfx.play("bird_call", at, {"vol": 0.0, "pitch": 1.35})
		"hiss": Sfx.play("sand_spray", at, {"vol": -6.0, "pitch": 1.6})
		"squeak": Sfx.play("critter_squeak", at, {"vol": 0.0})
		_: Sfx.play("creature_call", at, {"vol": -2.0})

func _strike() -> void:
	cur.state = "strike"; cur.t = 0.0
	_log("strike", {"n": cur.members.size()})
	var me: Vector3 = game.pos
	var l := _lead()
	var lp: Vector3 = (l.node as Node3D).position
	var to_me := Vector3(me.x - lp.x, 0, me.z - lp.z).normalized()
	var face := -to_me
	# he spins round to it, jolted
	cast.set_crouch(false)
	game.speed = 0.0
	game.yaw = atan2(face.x, face.z)
	if cast.player and cast.player.idles: cast.player.idles.force("b_startle")
	var ld: Array = T.get("land_d", [1.8, 2.6])
	var n: int = cur.members.size()
	var side := Vector3(-face.z, 0, face.x)
	for i in n:
		var m: Dictionary = cur.members[i]
		var spread := (float(i) - (n - 1) * 0.5) * 0.55
		var d := lerpf(float(ld[0]), float(ld[1]), _rng.randf())
		var to := me + face * d * cos(spread) + side * d * sin(spread) * 1.4
		to = game.world.collide(Vector3(to.x, 0, to.z), 0.3)
		to.y = game.world.height_at(to.x, to.z)
		m.from = (m.node as Node3D).position
		m.to = to
		m.out = true
		(m.node as Node3D).visible = true
		(m.node as Node3D).call("mood", "tackle" if i == 0 else "startle")
	Sfx.play("whoosh", lp, {"vol": 0.0})

func _strike_step(dt: float) -> void:
	var dur := tn("strike_s", 0.65)
	var u := clampf(float(cur.t) / dur, 0.0, 1.0)
	var e := 1.0 - pow(1.0 - u, 2.2)
	var flies := bool(sp(String(cur.species)).get("flies", false))
	for i in cur.members.size():
		var m: Dictionary = cur.members[i]
		var n: Node3D = m.node
		var uu := clampf((float(cur.t) - i * 0.08) / dur, 0.0, 1.0)
		var ee := 1.0 - pow(1.0 - uu, 2.2)
		var p := (m.from as Vector3).lerp(m.to, ee)
		p.y = game.world.height_at(p.x, p.z) + sin(uu * PI) * (1.3 if flies else 0.6)
		n.position = p
		var mv := (m.to as Vector3) - (m.from as Vector3)
		if mv.length() > 0.1: n.rotation.y = atan2(mv.x, mv.z)
		if uu >= 1.0 and not bool(m.get("landed", false)):
			m.landed = true
			wild._feather(p + Vector3(0, 0.3, 0), true)
	_face_all(game.pos, dt, 0.3)
	if u >= 1.0 and float(cur.t) > dur + 0.08 * cur.members.size():
		var c := comps()
		if c and not c.shown().is_empty():
			cur.first = "wild"
			_intercept()
		else:
			cur.state = "standoff"; cur.t = 0.0
			_log("standoff")
			for m in cur.members: (m.node as Node3D).call("mood", "angry")

func _face_all(at: Vector3, dt: float, k := 1.0) -> void:
	for m in cur.members:
		var n: Node3D = m.node
		var want := atan2(at.x - n.position.x, at.z - n.position.z)
		n.rotation.y = lerp_angle(n.rotation.y, want, 1.0 - exp(-dt * 8.0 * k))
		if "look_at_pos" in n: n.look_at_pos = at + Vector3(0, 1.2, 0)

# ---------- POKéMON: the party menu ----------
func _open_menu() -> void:
	var pm = cast.get("party_menu")
	if pm == null:
		_send(0, String(cur.first)); return
	cur.state = "menu"
	pm.open("ambush", func(i: int):
		if String(cur.get("state", "")) != "menu": return
		if i < 0:
			cur.state = "standoff"; cur.t = minf(float(cur.t), tn("standoff_s", 3.2) - 1.2)
			return
		_send(i, String(cur.first)))

# party member i thrown out by him toward them, then in it runs
func _send(i: int, first: String) -> void:
	cur.first = first
	var c := comps()
	if c == null: _start_battle(first); return
	var me: Vector3 = game.pos
	var near := _nearest_member(me)
	var at: Vector3 = me.lerp((near.node as Node3D).position, 0.45)
	var P := party()
	var sp_id := String(P[clampi(i, 0, P.size() - 1)].species)
	if c.is_out(sp_id):
		# (already out: it just goes)
		_intercept(); return
	if c.count() >= c.cap(): c.recall(c.out.size() - 1, true)
	if not c.send_out(i, false, at):
		_start_battle(first); return
	cur.engaged = [c.of(sp_id)]
	cur.state = "throw"; cur.t = 0.0
	_log("sent", {"species": sp_id})

func _nearest_member(p: Vector3) -> Dictionary:
	var best := {}
	var bd := INF
	for m in cur.members:
		var d := Wild._d2(p, (m.node as Node3D).position)
		if d < bd: bd = d; best = m
	return best

# ---------- his Pokémon go in: the nearest of his to the nearest of them ----------
func _intercept() -> void:
	var c := comps()
	var mine: Array = c.shown() if c else []
	if mine.is_empty(): _start_battle(String(cur.first)); return
	mine = mine.slice(0, 2)
	# the pairs: nearest first
	var pairs := []
	var free_m: Array = cur.members.duplicate()
	var free_c: Array = mine.duplicate()
	while not free_c.is_empty():
		var bd := INF
		var bp := []
		for cc in free_c:
			for m in free_m:
				var d := Wild._d2(cc.pos, (m.node as Node3D).position)
				if d < bd: bd = d; bp = [cc, m]
		if bp.is_empty():
			# more of his than of them: the rest go at the nearest
			bp = [free_c[0], _nearest_member(free_c[0].pos)]
		pairs.append(bp)
		free_c.erase(bp[0])
		free_m.erase(bp[1])
		if free_m.is_empty() and not free_c.is_empty(): free_m = cur.members.duplicate()
	cur.pairs = pairs
	cur.engaged = pairs.map(func(p): return p[0])
	cur.state = "intercept"; cur.t = 0.0
	var me: Vector3 = game.pos
	for p in pairs:
		var cc: Dictionary = p[0]
		var m: Dictionary = p[1]
		var mp: Vector3 = (m.node as Node3D).position
		var dir := Vector3(me.x - mp.x, 0, me.z - mp.z).normalized()
		var stop := mp + dir * 1.15
		stop = game.world.collide(Vector3(stop.x, 0, stop.z), 0.3)
		stop.y = game.world.height_at(stop.x, stop.z)
		cc.icpt = {"from": cc.pos, "to": stop, "at": mp}
		c.lend(cc)
		if (cc.node as Node3D).has_method("mood"): (cc.node as Node3D).call("mood", "run")
	_log("intercept", {"pairs": pairs.map(func(p): return [String(p[0].species), cur.members.find(p[1])])})
	print("ambush: intercept: %s" % ", ".join(pairs.map(func(p): return "%s -> %s #%d" % [p[0].species, cur.species, cur.members.find(p[1])])))

func _intercept_step(dt: float) -> void:
	var dur := tn("intercept_s", 0.75)
	var u := clampf(float(cur.t) / dur, 0.0, 1.0)
	for p in cur.pairs:
		var cc: Dictionary = p[0]
		var n: Node3D = cc.node
		if not is_instance_valid(n): continue
		var I: Dictionary = cc.icpt
		var e := u * u * (3.0 - 2.0 * u)
		var prev := n.global_position
		var q := (I.from as Vector3).lerp(I.to, e)
		q.y = game.world.height_at(q.x, q.z)
		n.global_position = q
		cc.pos = q
		var at: Vector3 = I.at
		var mv := q - prev
		n.rotation.y = atan2(mv.x, mv.z) if Vector2(mv.x, mv.z).length() > 0.01 else lerp_angle(n.rotation.y, atan2(at.x - q.x, at.z - q.z), 1.0 - exp(-dt * 10.0))
		if n.has_method("animate"): n.call("animate", dt, mv.length() / maxf(dt, 1e-4))
	_face_all(game.pos, dt)
	if u >= 1.0 and float(cur.t) > dur + 0.25:
		for p in cur.pairs:
			var n: Node3D = p[0].node
			if is_instance_valid(n) and n.has_method("mood"): n.call("mood", "angry")
		_start_battle(String(cur.first))

# ---------- RUN ----------
func run_chance() -> float:
	var R: Dictionary = T.get("run", {})
	var S := sp(String(cur.species))
	var n: int = cur.members.size()
	var p := float(R.get("base", 0.75)) - float(R.get("per_foe", 0.1)) * (n - 1) - float(R.get("chaser_k", 0.08)) * maxf(0.0, float(S.get("chase_v", 6.0)) - 6.0)
	return clampf(p, float(R.get("min", 0.25)), float(R.get("max", 0.92)))

var force_run := -1              # (tests: 1 always gets away, 0 never)
var force_chase := -1            # (tests: 1 it chases, 0 it doesn't)
func _try_run() -> void:
	stats.ran = int(stats.ran) + 1
	var p := run_chance()
	var ok := _rng.randf() < p if force_run < 0 else force_run == 1
	_log("run", {"p": p, "ok": ok})
	var me: Vector3 = game.pos
	var lp: Vector3 = (_nearest_member(me).node as Node3D).position
	var away := Vector3(me.x - lp.x, 0, me.z - lp.z).normalized()
	if ok:
		cur.state = "dash"; cur.t = 0.0
		cur.dash = {"dir": away}
		game.yaw = atan2(away.x, away.z)
		if cast.player and cast.player.idles and cast.player.idles.acting() != "": cast.player.idles.release()
		wild.toaster.push("start", "RUN!", "Ash bolts for it!", "jump", 1.4)
		Sfx.play("step_grass_run", null, {"vol": -2.0})
	else:
		cur.state = "stumble"; cur.t = 0.0
		if cast.player and cast.player.idles: cast.player.idles.force("b_flinch")
		wild.toaster.push("warn", "CAN'T ESCAPE!", "It cut you off!", "bang", 1.6)
		Sfx.play("scuff", null, {"vol": 0.0})
		for m in cur.members: (m.node as Node3D).call("mood", "taunt")

func _dash_step(dt: float) -> void:
	var R: Dictionary = T.get("run", {})
	var dir: Vector3 = cur.dash.dir
	var v := float(R.get("dash_v", 9.0))
	var np: Vector3 = game.world.step(game.pos, dir.x * v * dt, dir.z * v * dt, true)
	game.pos.x = np.x; game.pos.z = np.z
	game.speed = v
	game.yaw = atan2(dir.x, dir.z)
	if float(cur.t) > float(R.get("dash_s", 0.8)):
		game.speed = 6.0
		# it may come after him a little way
		var S := sp(String(cur.species))
		var cp := float(S.get("chase", {}).get(String(cur.temper), 0.4))
		var chases := _rng.randf() < cp if force_chase < 0 else force_chase == 1
		if chases:
			cur.state = "chase"; cur.t = 0.0
			_log("chase")
			for m in cur.members: (m.node as Node3D).call("mood", "run")
		else:
			stats.escaped = int(stats.escaped) + 1
			_log("escaped")
			wild.toaster.push("complete", "GOT AWAY!", "It didn't follow you.", "check", 2.0)
			_go()

func _chase_step(dt: float) -> void:
	var S := sp(String(cur.species))
	var v := float(S.get("chase_v", 6.5))
	var me: Vector3 = game.pos
	var flies := bool(S.get("flies", false))
	var caught := false
	for m in cur.members:
		var n: Node3D = m.node
		var to := Vector3(me.x - n.position.x, 0, me.z - n.position.z)
		var d := to.length()
		if d < tn("chase_catch_d", 1.1): caught = true
		var stepv := to.normalized() * minf(d, v * dt)
		var np: Vector3 = game.world.step(n.position, stepv.x, stepv.z) if not flies else n.position + stepv
		np.y = game.world.height_at(np.x, np.z) + (0.5 + 0.15 * sin(t * 9.0) if flies else 0.0)
		n.position = np
		n.rotation.y = atan2(to.x, to.z)
	if caught:
		stats.caught = int(stats.caught) + 1
		_log("caught")
		wild.toaster.push("warn", "IT CAUGHT UP!", "%s won't let you go that easily!" % name_of(String(cur.species)), "bang", 1.8)
		cur.state = "stumble"; cur.t = 0.0
		cur.first = "wild"
		game.speed = 0.0
		if cast.player and cast.player.idles: cast.player.idles.force("b_flinch")
		return
	if float(cur.t) > tn("chase_s", 3.0):
		stats.escaped = int(stats.escaped) + 1
		_log("escaped")
		wild.toaster.push("complete", "GOT AWAY!", "It gave up the chase.", "check", 2.0)
		_go()

# ---------- the battle ----------
func _start_battle(first: String) -> void:
	if Battle.active: return
	var me: Vector3 = game.pos
	var c := comps()
	var engaged: Array = cur.get("engaged", [])
	engaged = engaged.filter(func(e): return e is Dictionary and not e.is_empty() and e.node != null and is_instance_valid(e.node))
	var P := party()
	# who leads for them: the one his first goes at, else the nearest to him
	var lead: Dictionary = cur.pairs[0][1] if cur.has("pairs") and not (cur.pairs as Array).is_empty() else _nearest_member(me)
	var members: Array = cur.members.duplicate()
	members.erase(lead)
	members.push_front(lead)
	var ln: Node3D = lead.node
	var temper := String(cur.temper)
	var opts := {"species": String(cur.species), "creature": ln, "at": ln.global_position, "temper": "aggressive" if temper != "timid" else "timid",
		"state": "attacking" if first == "wild" else "startled", "where": "tall_grass" if String(cur.kind) == "tall_grass" else "bush",
		"first_strike": first, "level": int(lead.level), "pause_world": true, "ambush": true, "kind": "wild"}
	if bool(cur.swarm): opts["banner"] = "A SWARM OF %s!" % name_of(String(cur.species)).to_upper()
	if P.is_empty():
		opts["mode"] = "prologue"
	else:
		var pa: Array = []
		for e in engaged:
			for m in P:
				if String(m.species) == String(e.species) and not pa.has(m): pa.append(m)
		for m in P:
			if not pa.has(m) and pa.size() < 6: pa.append(m)
		var pb: Array = members.map(func(m): return {"species": String(cur.species), "level": int(m.level), "ai": "wild", "state": "attacking"})
		opts.merge({"mode": "pkmn", "partner": pa[0], "party_a": pa, "party_b": pb, "ai": "wild", "log": true}, true)
		if not engaged.is_empty():
			opts["partner_node"] = engaged[0].node
			opts["keep_partner"] = true
			if engaged.size() >= 2: opts["partner_node2"] = engaged[1].node
		if engaged.size() >= 2 or pb.size() >= 2:
			opts["doubles"] = true
			if pb.size() > int(swarm_cfg().get("at_once", 2)): opts["waves"] = true
	opts.merge(battle_extra, true)
	for e in engaged: if c: c.lend(e)
	# the rest of them wait out of the way (the battle shows its own)
	for m in cur.members:
		if m != lead: (m.node as Node3D).visible = false
	cur.state = "battle"; cur.t = 0.0
	stats.battles = int(stats.battles) + 1
	last_opts = opts
	_log("battle", {"mode": opts.mode, "doubles": bool(opts.get("doubles", false)), "waves": bool(opts.get("waves", false)), "a": (opts.get("party_a", []) as Array).size(), "b": (opts.get("party_b", []) as Array).size(), "first": first})
	print("ambush: battle (%s%s, %d of theirs, first %s)" % [opts.mode, " doubles" if opts.has("doubles") else "", members.size(), first])
	var B := Wild._battle_script()
	var r = B.call("start", game, opts)
	_battle = r if r is Object and (r as Object).has_signal("finished") else null
	if _battle: _battle.connect("finished", _on_finished, CONNECT_ONE_SHOT)

func _on_finished(res: Dictionary) -> void:
	_battle = null
	var out := String(res.get("outcome", "ran"))
	_log("over", {"outcome": out, "pkmn": String(res.get("pkmn_outcome", ""))})
	print("ambush: battle over: %s" % out)
	var c := comps()
	if c:
		c.give_back()
		# the ones that fainted go back in their balls
		var pr: Dictionary = res.get("party", {})
		for f in pr.get("a", []):
			if bool(f.get("fainted", false)) and c.is_out(String(f.species)):
				c.recall_species(String(f.species))
				wild.toaster.push("info", "%s IS WORN OUT" % String(f.name).to_upper(), "Back in its ball for a rest.", "ball", 2.2)
	if cur.is_empty(): return
	for m in cur.members:
		var n: Node3D = m.node
		if not is_instance_valid(n): continue
		if n.get_parent() != cast:
			var gp := n.global_position
			n.get_parent().remove_child(n); cast.add_child(n); n.global_position = gp
		n.scale = Vector3.ONE
		n.position.y = game.world.height_at(n.position.x, n.position.z)
		n.visible = true
	cooldown = tn("cooldown_s", 75.0)
	if out == "ash_won" and String(res.get("pkmn_outcome", "won")) in ["won", ""] and String(res.get("mode", "")) != "prologue" and res.has("pkmn_outcome"):
		cur.state = "out"; cur.t = 0.0
		for m in cur.members: (m.node as Node3D).call("mood", "faint")
		wild.toaster.push("complete", "AMBUSH BEATEN!", "The %s won't bother you again." % ("swarm" if bool(cur.swarm) else name_of(String(cur.species))), "check", 2.6)
	else:
		_go()

# off they go (for good)
func _go() -> void:
	cur.state = "leave"; cur.t = 0.0
	var me: Vector3 = game.pos
	for m in cur.members:
		var n: Node3D = m.node
		var away := Vector3(n.position.x - me.x, 0, n.position.z - me.z).normalized()
		if away.length() < 0.1: away = Vector3.FORWARD
		m.from = n.position
		m.away = away
		n.call("mood", "flee")

func _leave_step(dt: float) -> void:
	var flies := bool(sp(String(cur.species)).get("flies", false))
	for m in cur.members:
		var n: Node3D = m.node
		var a: Vector3 = m.away
		n.position += a * dt * (7.0 if flies else 5.0)
		n.position.y = game.world.height_at(n.position.x, n.position.z) + (minf(3.0, float(cur.t) * 2.0) if flies else 0.0)
		n.rotation.y = atan2(a.x, a.z)
	if float(cur.t) > 1.8: _clear()

func _clear() -> void:
	for m in cur.get("members", []):
		if is_instance_valid(m.node): (m.node as Node).queue_free()
	cur = {}
	if game.speed > 6.5: game.speed = 6.0

func clear() -> void: _clear()

static func _kind_text(k: String) -> String:
	return {"bush": "bush", "thicket": "thicket", "tall_grass": "tall grass", "tree": "tree"}.get(k, "cover")

# ---------- the HUD: the tell's "?", the "!" bang, the standoff's choice ----------
class Hud extends Control:
	var amb
	func _ready() -> void:
		set_anchors_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(_dt: float) -> void:
		visible = not amb.cur.is_empty() and not Battle.active
		if visible: queue_redraw()

	# a tap on a choice (true = taken)
	func _input(e: InputEvent) -> void:
		if not visible or String(amb.cur.get("state", "")) != "standoff": return
		var p = null
		if e is InputEventScreenTouch and e.pressed: p = e.position
		elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: p = e.position
		if p == null: return
		var R := _rects()
		if R.run.has_point(p): amb._try_run(); get_viewport().set_input_as_handled()
		elif R.has("mon") and R.mon.has_point(p): amb._open_menu(); get_viewport().set_input_as_handled()

	func _rects() -> Dictionary:
		var S := UITheme.safe_rect(self)
		var w := 250.0
		var y := S.end.y - 150.0
		var cx := S.get_center().x
		var out := {"run": Rect2(cx + 14.0, y, w, 64.0)}
		if not amb.party().is_empty(): out["mon"] = Rect2(cx - 14.0 - w, y, w, 64.0)
		else: out.run = Rect2(cx - w * 0.5, y, w, 64.0)
		return out

	func _draw() -> void:
		var cam: Camera3D = amb.game.cam
		var c: Dictionary = amb.cur
		var st := String(c.get("state", ""))
		var l: Dictionary = amb._lead()
		if l.is_empty() or cam == null: return
		var ln: Node3D = l.node
		var head := ln.global_position + Vector3(0, 1.2, 0)
		# spotted: a yellow "?" over it, bobbing
		if st == "spotted" and not cam.is_position_behind(head):
			var p := cam.unproject_position(head) + Vector2(0, sin(Time.get_ticks_msec() * 0.005) * 4.0)
			draw_circle(p, 19.0, Color(UITheme.INK, 0.85), true, -1.0, true)
			draw_arc(p, 19.0, 0.0, TAU, 32, Color(UITheme.YELLOW, 1.0), 3.0, true)
			UITheme.text_mid(self, p + Vector2(0, 1), "?", "display", 28, UITheme.YELLOW, 1)
		# the bang: "!" over them, a pop then a hold
		if st in ["warn", "strike"] and c.has("bang_t"):
			var k := clampf((float(amb.t) - float(c.bang_t)) / 0.18, 0.0, 1.0)
			for m in c.members:
				var hp: Vector3 = (m.node as Node3D).global_position + Vector3(0, 1.3, 0)
				if cam.is_position_behind(hp): continue
				var p2 := cam.unproject_position(hp)
				var s := maxf(0.15, UITheme.ease_back(k, 2.0))
				draw_circle(p2, 22.0 * s, Color(UITheme.RED, 0.95), true, -1.0, true)
				draw_arc(p2, 22.0 * s, 0.0, TAU, 32, Color(UITheme.WHITE, 1.0), 3.0, true)
				UITheme.text_mid(self, p2 + Vector2(0, 1), "!", "display", int(34 * s), UITheme.WHITE, 1)
		# the standoff: RUN or POKéMON, and how long he has
		if st == "standoff":
			var R := _rects()
			var left := 1.0 - clampf(float(c.t) / float(amb.tn("standoff_s", 3.2)), 0.0, 1.0)
			_choice(R.run, "RUN!", "jump", UITheme.SKY, "%d%%" % roundi(amb.run_chance() * 100.0))
			if R.has("mon"): _choice(R.mon, "POKéMON", "use", UITheme.RED, "SEND ONE OUT")
			var S := UITheme.safe_rect(self)
			var bar := Rect2(S.get_center().x - 200.0, R.run.end.y + 14.0, 400.0, 10.0)
			UITheme.bar(self, bar, left, UITheme.YELLOW if left > 0.35 else UITheme.RED, 1.0)
			var nm: String = ("%d %s" % [c.members.size(), amb.name_of(String(c.species)).to_upper()]) if bool(c.swarm) else amb.name_of(String(c.species)).to_upper()
			UITheme.text_mid(self, Vector2(S.get_center().x, R.run.position.y - 26.0), "%s JUMPED YOU!" % nm, "display", 34, UITheme.WHITE, 1, 4)

	func _choice(r: Rect2, label: String, action: String, accent: Color, sub: String) -> void:
		UITheme.plate(self, r, 1.0)
		UITheme.accent_bar(self, r, accent, 1.0, UITheme.SKEW, 6.0)
		UITheme.glyph(self, Vector2(r.position.x + 34.0, r.get_center().y), action, 34.0)
		UITheme.text_mid(self, Vector2(r.position.x + 62.0, r.get_center().y - 8.0), label, "display", 30, UITheme.WHITE, 0)
		UITheme.text_mid(self, Vector2(r.position.x + 64.0, r.get_center().y + 17.0), sub, "label", 13, UITheme.TEXT_DIM, 0)
