class_name BattlePkmn
extends Node
# Mode "pkmn" of the battle (battle.gd): a Pokémon against a Pokémon, on the same
# in-world stage as Ash's prologue (the arena spread on the real ground, the
# camera, the effects). The rules are energy v2's PkmnBattle (battle/pkmn_battle.gd)
# and the HUD its PkmnHud (ui/pkmn_hud.gd: FIGHT, POKéMON, ITEMS, FLEE, the pools
# and focus bars); this file only hosts them: it builds the battle from the
# battle's opts, puts his partner in front of Ash (Ash stays back, its trainer),
# runs the turns through the HUD, and stages each event on the stage.
#
#   Battle.start(game, {"mode": "pkmn",            (or just a "partner": a has_starter save picks this mode too)
#       "partner": {"species": "pikachu", "level": 9, "known": [...], "equip": [...], "focus": 30.0},
#       "species": "pidgey", "level": 8, "ai": "wild", "state": "startled",   (the other side)
#       "kind": "wild" | "trainer" | ..., "trainer": "CAMPER" (a trainer's banner),
#       "auto": true (both sides by the AI: renders), "seed": n})
# The result (battle.result): outcome ash_won | ash_down | ran | fled (the
# contract's), and pkmn_outcome: PkmnBattle's own (won | lost | fled | wild_fled | blown_away).
#
# Staging, by the move's anim key (life/moves.json):
#   contact      tackle, quick_attack (white afterimages), scratch, bite, iron_tail,
#                volt_tackle, wing_attack, rapid_spin, counter, ground_pound: a lunge, the impact
#   wind         gust, whirlwind: battle_fx's vortex carried across at the target
#   sand         sand_attack, smokescreen: a spray at its face
#   bolt         thunder_shock, thunderbolt, thunder (from the sky), thunder_wave: a jagged bolt, sparks
#   shot         every other attack: a stream of motes in the move type's colour
#   self         growl, tail_whip, double_team, protect, withdraw, focus, dodge...: rings off it, a hop
#   dig, fly...  "commit": under the ground (a mound of dirt) or up in the air; "strike" from there

const DEFAULT_PARTNER := {"species": "pikachu", "level": 9, "focus": 30.0,
	"known": ["thunder_shock", "growl", "tail_whip", "quick_attack", "dodge", "thunder_wave", "double_team"],
	"equip": ["thunder_shock", "quick_attack", "dodge", "thunder_wave", "growl"]}
const CONTACT := ["tackle", "quick_attack", "scratch", "bite", "iron_tail", "volt_tackle", "wing_attack", "rapid_spin", "counter", "ground_pound"]
const BOLT := ["thunder_shock", "thunderbolt", "thunder", "thunder_wave"]
const SELF := ["growl", "tail_whip", "double_team", "protect", "withdraw", "focus", "dodge", "hypnosis"]
const TYPE_COL := {"electric": Color("ffe14a"), "fire": Color("ff7a2a"), "water": Color("5ab8ff"), "grass": Color("7ad84a"),
	"psychic": Color("ff6ad0"), "dragon": Color("8a6aff"), "normal": Color("f4f0e0"), "flying": Color("cfe8ff"), "ground": Color("d8b070"), "bug": Color("b8d84a")}

var battle: Battle
var B: PkmnBattle
var hud: PkmnHud
var auto := false
var _busy := false
var _over := false
var _semi := {"a": "", "b": ""}
var _mound := {}
var _lift := {"a": 0.0, "b": 0.0}

func setup(b: Battle) -> void:
	battle = b
	var o: Dictionary = b.opts
	auto = bool(o.get("auto", false))
	var a: Dictionary = DEFAULT_PARTNER.duplicate(true)
	a.merge(o.get("partner", {}), true)
	a["ai"] = "balanced" if auto else "player"
	var foe := {"species": String(o.get("species", "pidgey")), "level": int(o.get("level", 5)),
		"ai": String(o.get("ai", "wild" if String(o.get("kind", "wild")) == "wild" else "balanced")), "state": String(o.get("state", "hidden"))}
	if o.has("foe_name"): foe["name"] = String(o.foe_name)
	if o.has("foe_focus"): foe["focus"] = float(o.foe_focus)
	var bo := {"a": a, "b": foe, "kind": String(o.get("kind", "wild"))}
	if o.has("seed"): bo["seed"] = int(o.seed)
	B = PkmnBattle.new(bo)

func intro_name() -> String:
	if battle.opts.has("trainer"): return "%s WANTS TO BATTLE!" % String(battle.opts.trainer).to_upper()
	return String(B.fighter("b").name).to_upper()

func intro_sub() -> String:
	return "LV. %d" % B.fighter("b").level

func make_partner() -> Node3D:
	var sp := String(B.fighter("a").species)
	var n: Node3D = Creature.make(sp) if ResourceLoader.exists("res://creatures/%s.glb" % sp) else PkmnStandin.make(sp)
	battle.add_child(n)
	n.top_level = true
	return n

func lift(side: String) -> float: return float(_lift.get(side, 0.0))

func _node(side: String) -> Node3D: return battle.partner if side == "a" else battle.foe
func _pos(side: String) -> Vector3: return battle.partner_pos if side == "a" else battle.foe_pos
func _set_pos(side: String, p: Vector3) -> void:
	if side == "a": battle.partner_pos = p
	else: battle.foe_pos = p
func _home(side: String) -> Vector3:
	var h := battle.ash_spot + battle.fwd * Battle.PARTNER_AHEAD + battle.side * Battle.PARTNER_SIDE if side == "a" else battle.foe_spot
	h.y = battle._gy(h)
	return h

# the act a creature plays for a move: creatures/species.json's "acts" (and its
# "alias": a move's id to the act that stands for it), tried as the move id, its
# alias, its anim key, then the fallback; a creature with its own script (Pidgey)
# says what it has with acts()
static var _species := {}

func _act(side: String, id: String, anim: String, fallback := "tackle") -> String:
	var n := _node(side)
	var acts: Array = []
	var alias := {}
	if _species.is_empty() and FileAccess.file_exists("res://creatures/species.json"):
		var v = JSON.parse_string(FileAccess.get_file_as_string("res://creatures/species.json"))
		_species = v.get("species", {}) if v is Dictionary else {}
	var d: Dictionary = _species.get(String(B.fighter(side).species), {})
	acts = d.get("acts", [])
	alias = d.get("alias", {})
	if acts.is_empty() and n and n.has_method("acts"): acts = n.acts()
	if acts.is_empty(): return fallback
	for c in [id, String(alias.get(id, "")), anim, String(alias.get(anim, "")), fallback, "tackle", "taunt"]:
		if c != "" and c in acts: return c
	return fallback

func _mood(side: String, m: String) -> void:
	var n := _node(side)
	if n and is_instance_valid(n) and n.has_method("mood"): n.mood(m)

func _process(dt: float) -> void:
	if battle == null: return
	# where each one is: under the ground (hidden, a mound over it), in the air, here
	for s in ["a", "b"]:
		var want := 0.0
		if _semi[s] == "airborne": want = 2.4 + sin(Time.get_ticks_msec() * 0.003) * 0.1
		_lift[s] = lerpf(float(_lift[s]), want, 1.0 - exp(-dt * 6.0))
		var n := _node(s)
		if n and is_instance_valid(n): n.visible = not _semi[s] in ["underground", "underwater"]
		if _mound.has(s) and is_instance_valid(_mound[s]):
			_mound[s].visible = _semi[s] in ["underground", "underwater"]
			_mound[s].global_position = _pos(s) + Vector3(0, 0.02, 0)
	if battle.foe: battle.foe_lift = float(_lift.b)

# ---------- the loop ----------
func run() -> void:
	hud = PkmnHud.new()
	battle.layer.add_child(hud)
	hud.bind(B)
	hud.command.connect(_on_command)
	hud.move_picked.connect(_on_move)
	hud.end_turn.connect(_on_end_turn)
	hud.pool_picked.connect(_on_pool)
	hud.undo.connect(func(): B.unqueue("a"); hud.refresh_moves())
	for s in ["a", "b"]: _make_mound(s)
	await _play(B.start(), 0.2)
	battle.shot("overview", 2.5)
	if battle.opts.has("hud_state"):
		# a frozen HUD for shots: it stays up for good
		_state(String(battle.opts.hud_state))
		while true: await get_tree().process_frame
	_next_turn()
	while not _over: await get_tree().process_frame
	await _end()

func _next_turn() -> void:
	if B.over: _over = true; return
	await _play(B.begin_turn(), 0.3)
	if B.needs_pick("a"):
		if auto: B.pick_pool("a", "")
		else:
			hud.show_pick()
			return
	_open_menu()

func _open_menu() -> void:
	battle.shot("overview", 2.5)
	if auto:
		await get_tree().create_timer(0.6).timeout
		B.ai_queue("a")
		_on_end_turn()
		return
	hud.show_menu()

func _on_pool(k: String) -> void:
	if hud.mode != "pick": return
	B.pick_pool("a", k)
	Sfx.ui("ui_confirm")
	if B.needs_pick("a"): return
	_open_menu()

func _on_command(c: String) -> void:
	match c:
		"fight": hud.show_fight()
		"flee":
			if B.flee("a"):
				hud.say("Got away safely!", UITheme.SKY); hud.busy()
				_over = true
			else:
				hud.say("Can't escape!", UITheme.RED); _on_end_turn()
		"items":
			if B.use_item("a", "energy_shard") > 0: hud.say("Used an Energy Shard: +1 chip.", UITheme.YELLOW)
			else: hud.say("No room for more chips.", UITheme.RED)
		"pokemon": hud.say("%s is your only Pokémon." % B.fighter("a").name, UITheme.SKY)

func _on_move(id: String) -> void:
	if B.queue("a", id):
		hud.say("%s queued." % String(BattleEnergy.move(id).name), UITheme.SKY)
		hud.refresh_moves()
		if B.committed_now("a") or BattleEnergy.is_all(id): _on_end_turn()

func _on_end_turn() -> void:
	if _busy: return
	_busy = true
	hud.busy()
	B.ai_queue("b")
	B.begin_resolve()
	while B.resolving():
		await _play(B.step(), 0.15)
	_busy = false
	if B.over: _over = true
	else: _next_turn()

func _end() -> void:
	hud.busy()
	var oc := B.outcome
	hud.say({"won": "You won!", "lost": "%s fainted..." % B.fighter("a").name, "fled": "Got away safely!", "wild_fled": "The wild one fled!", "blown_away": "Blown away!"}.get(oc, "The battle is over."), UITheme.YELLOW)
	B.finish()
	battle.result = {"outcome": {"won": "ash_won", "lost": "ash_down", "fled": "ran", "wild_fled": "fled", "blown_away": "ran"}.get(oc, "ran"),
		"pkmn_outcome": oc, "species": String(B.fighter("b").species), "foe_hp": B.fighter("b").hp, "partner_hp": B.fighter("a").hp, "turns": B.turn,
		"creature": battle.foe if not battle.own_foe else null}
	match oc:
		"won":
			battle.ui.show_outcome("YOU WON!", "%s did it!" % B.fighter("a").name, UITheme.GREEN)
			_mood("a", "taunt")
		"lost":
			battle.ui.show_outcome("%s FAINTED..." % String(B.fighter("a").name).to_upper(), "Ash runs to it", UITheme.RED)
		"wild_fled":
			battle.ui.show_outcome("%s FLED!" % String(B.fighter("b").name).to_upper(), "", UITheme.PURPLE)
			_mood("b", "flee")
			await _move("b", _pos("b") + battle.fwd * 9.0, 1.3, 2.5)
		_:
			battle.ui.show_outcome("GOT AWAY SAFELY!", "", UITheme.GREEN)
	await _wait(1.8)
	hud.visible = false

# ---------- the staging ----------
func _play(evs: Array, gap: float) -> void:
	for e in evs:
		var t := String(e.get("t", ""))
		var s := String(e.get("side", ""))
		var txt := String(e.get("text_owner", e.get("text", ""))) if s == "a" else String(e.get("text", ""))
		if txt != "" and not t in ["turn", "gain"]:
			hud.say(txt, UITheme.SKY if s == "a" else UITheme.YELLOW)
		match t:
			"move", "strike":
				await _stage_move(s, String(e.move), t == "strike")
			"hit", "counter", "tick", "hurt_self":
				_hit(s, e)
				await _wait(0.5)
			"commit":
				await _commit(s, String(e.get("semi", "")))
			"pulled_out", "forced_out":
				_semi[s] = ""
				battle.fx.dust(_pos(s), 8, Color("cdb68a"), 0.8, 0.6, 0.45)
				await _wait(0.5)
			"miss", "dodged", "untargetable":
				await _dodge(s if t != "miss" else B.other(s))
			"protected":
				battle.fx.spawn("ring", _pos(s) + Vector3(0, 0.4, 0), Vector3.ZERO, {"life": 0.5, "size": 0.6, "size_end": 1.6, "col": Color(0.6, 0.9, 1.0, 0.9)})
				await _wait(0.5)
			"faint":
				_mood(s, "faint")
				battle.fx.dust(_pos(s), 8, Color("cdb68a"), 0.7, 0.3, 0.45)
				Sfx.play("land_dirt", _pos(s), {"vol": 0.0})
				await _wait(1.0)
			"status", "stat", "lock", "disrupt", "locked_in", "wasted", "broken", "flinch", "asleep", "paralysed", "confused", "woke", "expired":
				if t == "stat" and int(e.get("d", 0)) != 0:
					battle.ui.pop(("%s UP" if int(e.d) > 0 else "%s DOWN") % String(e.get("stat", "")).to_upper(), _pos(s) + Vector3(0, 1.0, 0), UITheme.ORANGE, 22, "word")
				await _wait(0.55)
			"turn", "gain", "pick", "picked":
				pass
			_:
				await _wait(0.3)
	if gap > 0.0: await _wait(gap)

func _stage_move(s: String, id: String, strike: bool) -> void:
	var m := BattleEnergy.move(id)
	var anim := String(m.get("anim", id))
	var col: Color = TYPE_COL.get(String(m.get("type", "normal")), Color.WHITE)
	var o := B.other(s)
	battle.ui.say(String(B.fighter(s).name).to_upper(), String(m.get("name", id)).to_upper() + "!", col if col != TYPE_COL.normal else UITheme.ORANGE)
	battle.shot("pk_" + s, 0.0)   # (a cut: a glide between the two sides passes overhead)
	# a committed strike comes out of wherever it went (up, under)
	if strike:
		_semi[s] = ""
		battle.fx.dust(_pos(s), 10, Color("cdb68a"), 1.0, 0.8, 0.5)
		battle.shake = 0.4
	var from := _pos(s)
	var to := _pos(o)
	var d := (to - from); d.y = 0.0; d = d.normalized()
	if anim in CONTACT:
		var quick := anim == "quick_attack"
		_mood(s, _act(s, id, anim, "quick_attack" if quick else "tackle"))
		Sfx.play("whoosh", from, {"vol": 0.0, "pitch": 1.4 if quick else 1.0})
		await _wait(0.12 if quick else 0.3)
		var hit_at := to - d * 0.45
		await _move(s, hit_at, 0.12 if quick else 0.24, 0.0, func(): battle.fx.afterimage(_pos(s), d * 12.0, 0.4) if quick else battle.fx.speed_lines(_pos(s), d * 10.0, 3))
		await _move(s, from, 0.45, 0.4)
	elif anim in ["gust", "whirlwind"]:
		_mood(s, _act(s, id, anim, "gust"))
		await _wait(0.35)
		var g := battle.fx.gust_begin(from)
		Sfx.play("gust_vortex", from, {"vol": 2.0})
		var t := 0.0
		while t < 1.3:
			t += get_process_delta_time()
			var u := clampf(t / 1.3, 0.0, 1.0)
			var at := from.lerp(to, UITheme.ease_in(clampf((u - 0.3) / 0.7, 0.0, 1.0)))
			at.y = battle._gy(at)
			battle.fx.gust_move(g, at, clampf(u * 2.5, 0.0, 1.0), clampf(sin(t * 18.0), 0.0, 1.0), d)
			battle.shake = maxf(battle.shake, 0.1 + 0.2 * u)
			await get_tree().process_frame
		battle.fx.gust_hit(g, to)
		battle.fx.gust_end(g)
	elif anim in ["sand_attack", "smokescreen"]:
		_mood(s, _act(s, id, anim, "sand_attack"))
		Sfx.play("sand_spray", from, {"vol": 0.0})
		for i in 8:
			battle.fx.sand_blast(from + Vector3(0, 0.1, 0), to + Vector3(0, 0.35, 0), 18, 0.25, Color("e2c98f") if anim == "sand_attack" else Color("6a6a70"))
			await _wait(0.08)
	elif anim in BOLT:
		_mood(s, _act(s, id, anim, "thunder"))
		Sfx.play("whoosh", from, {"vol": -4.0, "pitch": 1.8})
		await _wait(0.3)
		var top := to + Vector3(0, 7.0, 0) if anim == "thunder" else from + Vector3(0, 0.55, 0) + d * 0.2
		for k in 3:
			_bolt(top, to + Vector3(0, 0.3, 0), col)
			battle.shake = 0.35
			await _wait(0.07)
	elif anim in SELF:
		_mood(s, _act(s, id, anim, "taunt"))
		for k in 3:
			battle.fx.spawn("ring", from + Vector3(0, 0.5, 0), Vector3.ZERO, {"life": 0.45, "size": 0.3, "size_end": 1.4 + k * 0.3, "col": Color(col, 0.8)})
			await _wait(0.12)
	else:
		# a stream of motes at it in the move's colour
		_mood(s, _act(s, id, anim, "tackle"))
		for k in 14:
			var p := from + Vector3(0, 0.45, 0)
			var v := ((to + Vector3(0, 0.35, 0)) - p) / 0.35 + Vector3(randf_range(-0.6, 0.6), randf_range(-0.3, 0.6), randf_range(-0.6, 0.6))
			battle.fx.spawn("star", p, v, {"life": 0.35, "size": 0.22, "size_end": 0.1, "col": Color(col, 1.0), "rot": randf() * TAU})
			await _wait(0.03)
	await _wait(0.1)

func _bolt(a: Vector3, b: Vector3, col: Color) -> void:
	var n := 9
	var prev := a
	for i in range(1, n + 1):
		var u := float(i) / n
		var p := a.lerp(b, u)
		if i < n: p += Vector3(randf_range(-0.35, 0.35), randf_range(-0.15, 0.15), randf_range(-0.35, 0.35)) * (1.0 - absf(u - 0.5))
		var seg := p - prev
		# (a streak's length is its speed x len: crawling, with a long len, it stays put)
		var mid := prev.lerp(p, 0.5)
		battle.fx.spawn("streak", mid, seg.normalized() * 0.01, {"life": 0.22, "size": 0.0, "len": seg.length() / 0.01, "w": 0.09, "col": Color(1, 1, 0.95, 1.0)})
		battle.fx.spawn("streak", mid, seg.normalized() * 0.01, {"life": 0.26, "size": 0.0, "len": seg.length() / 0.01, "w": 0.36, "col": Color(col, 0.6)})
		prev = p
	battle.fx.spawn("star", a, Vector3.ZERO, {"life": 0.18, "size": 0.5, "size_end": 0.9, "col": Color(col.lightened(0.3), 1.0)})
	battle.fx.spawn("star", b, Vector3.ZERO, {"life": 0.22, "size": 0.9, "size_end": 1.6, "col": Color(col.lightened(0.3), 1.0)})
	battle.fx.spawn("ring", b, Vector3.ZERO, {"life": 0.3, "size": 0.4, "size_end": 1.8, "col": Color(col, 0.9)})
	for i in 8:
		battle.fx.spawn("star", b, Vector3(randf_range(-3, 3), randf_range(0.5, 4), randf_range(-3, 3)), {"life": 0.25, "size": 0.25, "size_end": 0.05, "col": Color(col, 1.0), "rot": randf() * TAU})

func _hit(s: String, e: Dictionary) -> void:
	var n := _node(s)
	var at := _pos(s) + Vector3(0, 0.4, 0)
	battle.fx.flash(n, Color.WHITE, 0.2)
	battle.fx.impact(at, -battle.fwd if s == "b" else battle.fwd, 0.8)
	battle.hitstop(0.08)
	battle.shake = maxf(battle.shake, 0.45)
	Sfx.play("hit_heavy", at, {"vol": 0.0})
	if int(e.get("dmg", 0)) > 0:
		battle.ui.pop("-%d" % int(e.dmg), at + Vector3(0, 0.5, 0), Color("ff5a4a") if s == "a" else UITheme.YELLOW, 60)
	var eff := float(e.get("eff", 1.0))
	if eff > 1.0: battle.ui.pop("SUPER EFFECTIVE!", at + Vector3(0, 1.0, 0), UITheme.ORANGE, 22, "word")
	elif eff < 1.0 and eff > 0.0: battle.ui.pop("NOT VERY EFFECTIVE", at + Vector3(0, 1.0, 0), Color(0.85, 0.88, 0.95), 20, "word")
	if bool(e.get("crit", false)): battle.ui.pop("CRITICAL!", at + Vector3(0, 1.3, 0), UITheme.RED, 22, "word")
	_mood(s, "hurt")

func _dodge(s: String) -> void:
	var p := _pos(s)
	await _move(s, p + battle.side * 0.7, 0.18, 0.2)
	await _move(s, p, 0.3)

func _commit(s: String, semi: String) -> void:
	_semi[s] = semi
	if semi in ["underground", "underwater"]:
		battle.fx.dust(_pos(s), 14, Color("8a6a44") if semi == "underground" else Color("8ac8ff"), 1.0, 0.8, 0.5)
		Sfx.play("dig", _pos(s), {"vol": 0.0})
	elif semi == "airborne":
		_mood(s, "takeoff")
		battle.fx.dust(_pos(s), 8, Color("cdb68a"), 0.8, 0.4, 0.4)
		Sfx.play("wing_flap_large", _pos(s), {"vol": 0.0})
	await _wait(0.8)

func _move(s: String, to: Vector3, secs: float, hop := 0.0, each: Callable = Callable()) -> void:
	var from := _pos(s)
	var t := 0.0
	while t < secs:
		t += get_process_delta_time()
		var u := clampf(t / secs, 0.0, 1.0)
		var p := from.lerp(to, u)
		p.y = battle._gy(p) + hop * sin(u * PI)
		_set_pos(s, p)
		if each.is_valid(): each.call()
		await get_tree().process_frame

func _make_mound(s: String) -> void:
	var mound := MeshInstance3D.new()
	var mm := SphereMesh.new(); mm.radius = 0.5; mm.height = 0.3
	mound.mesh = mm
	var mat := StandardMaterial3D.new(); mat.albedo_color = Color("7a5a36")
	mound.material_override = mat
	mound.scale = Vector3(1, 0.6, 1)
	mound.top_level = true
	mound.visible = false
	add_child(mound)
	_mound[s] = mound

func _wait(secs: float) -> void:
	await get_tree().create_timer(secs).timeout

# ---------- frozen HUD states (shots of the HUD: dev/pkmn_battle --state=...) ----------
func _state(st: String) -> void:
	var a := B.fighter("a")
	var b := B.fighter("b")
	match st:
		"pools":
			B.begin_turn()
			a.e.set_focus(70.0, "shot"); b.e.set_focus(60.0, "shot")
			B.queue("a", "thunder_shock")
			hud.say("Pikachu used THUNDER SHOCK!", UITheme.SKY)
			hud.show_menu()
		"locks":
			B.begin_turn()
			a.e.set_focus(80.0, "shot"); b.e.set_focus(80.0, "shot")
			a.e.teach("dodge", true); a.e.equip("dodge"); a.e.lock("dodge")
			b.e.teach("dodge", true); b.e.equip("dodge"); b.e.lock("dodge")
			hud.say("The wild PIDGEY is ready for something...", UITheme.YELLOW)
			hud.show_menu()
		"dig":
			B.begin_turn()
			a.e.set_focus(60.0, "shot"); b.e.set_focus(70.0, "shot")
			if not B.queue("b", "dig"): b.e.commit_to("dig")
			B.begin_resolve()
			while B.resolving(): B.step()
			_semi["b"] = "underground"
			hud.say("Camper's SANDSHREW burrowed underground!", UITheme.YELLOW)
			hud.show_fight()
		"moves":
			B.begin_turn()
			a.e.set_focus(60.0, "shot")
			for id in ["swift", "dig", "counter", "protect"]: a.e.teach(id, true)
			B.queue("a", "quick_attack")
			hud.show_fight()
			hud.moves.select(6)
		"lockedin":
			a.e.set_focus(90.0, "shot")
			B.begin_turn()
			b.e.set_focus(50.0, "shot")
			hud.say("PIKACHU is LOCKED IN!", UITheme.YELLOW)
			hud.show_fight()
			hud.moves.select(0)
		_:
			B.begin_turn()
			hud.show_menu()
