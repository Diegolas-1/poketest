extends Node3D
# Dev only: a playable Pokemon-vs-Pokemon battle (battle/pkmn_battle.gd) with the
# new HUD (ui/pkmn_hud.gd), on a plain arena with placeholder visuals: the real
# Pidgey (Creature.make("pidgey")), simple stand-ins for the rest. The rules stay
# in PkmnBattle; this file only presents its events, as the BATTLE worker's arena
# and camera would (see the hosting calls in pkmn_battle.gd's header).
#   godot --path native res://dev/pkmn_battle.tscn -- [--fight=wild|trainer] [--auto]
#     [--safe=L,T,R,B] (safe-area insets to simulate, in viewport units)
#     [--state=pools|locks|dig|pick|moves|lockedin] (a frozen HUD state for shots)
#     [--seed=n] [--device=touch|pad|keys]
#     [--shot=/path.png --shot-at=seconds] (saves the whole viewport, then quits)
# wild:    Pikachu (Lv 9) vs a wild Pidgey (Lv 8, startled)
# trainer: Pikachu (Lv 14) vs Camper's Sandshrew (Lv 11, a cautious trainer)
# Controls: the menu (FIGHT, POKEMON, ITEMS, FLEE), the move list (several moves
# a turn while the chips last, END TURN), B to take the last one back, a tap on a
# pool (or 1-4) when a new chip needs one.

var A := {}
var B: PkmnBattle
var hud: PkmnHud
var cam: Camera3D
var bodies := {}                 # side -> Node3D
var homes := {}                  # side -> Vector3
var t := 0.0
var auto := false
var _busy := false
var _anim := {}                  # side -> {kind, t}
var marks := {}                  # side -> [dirt mound, shadow]

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	if A.has("device"): UIInput.force(String(A.device))
	add_child(UIInput.new())
	if Settings.menu: Settings.menu.cog.visible = false
	if Settings.overlay: Settings.overlay.visible = false
	auto = A.has("auto")
	_world()
	var fight := String(A.get("fight", "wild"))
	var seed := int(A.get("seed", "7"))
	if fight == "trainer":
		B = PkmnBattle.new({"a": {"species": "pikachu", "level": 14, "focus": 40.0, "ai": "balanced" if auto else "player",
				"known": ["thunder_shock", "quick_attack", "dodge", "swift", "feint", "tail_whip", "growl", "thunder_wave", "double_team"],
				"equip": ["thunder_shock", "quick_attack", "dodge", "swift", "feint"]},
			"b": {"species": "sandshrew", "level": 11, "ai": "cautious", "name": "Sandshrew", "focus": 30.0}, "kind": "trainer", "seed": seed})
	else:
		B = PkmnBattle.new({"a": {"species": "pikachu", "level": 9, "focus": 30.0, "ai": "balanced" if auto else "player",
				"known": ["thunder_shock", "growl", "tail_whip", "quick_attack", "dodge", "thunder_wave", "double_team"],
				"equip": ["thunder_shock", "quick_attack", "dodge", "thunder_wave", "growl"]},
			"b": {"species": "pidgey", "level": 8, "ai": "wild", "state": "startled"}, "kind": "wild", "seed": seed})
	_spawn("a", B.fighter("a").species, Vector3(-1.6, 0, 1.4))
	_spawn("b", B.fighter("b").species, Vector3(1.7, 0, -1.6))
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	hud = PkmnHud.new()
	layer.add_child(hud)
	if A.has("safe"):
		var p := String(A.safe).split(",")
		var vs := get_viewport().get_visible_rect().size
		hud.safe_override = Rect2(float(p[0]), float(p[1]), vs.x - float(p[0]) - float(p[2]), vs.y - float(p[1]) - float(p[3]))
	hud.bind(B)
	if A.has("show-safe"):
		var ov := Control.new()
		ov.set_anchors_preset(Control.PRESET_FULL_RECT)
		ov.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var lay2 := CanvasLayer.new()
		lay2.layer = 30
		add_child(lay2)
		lay2.add_child(ov)
		ov.draw.connect(func():
			var S := hud.sr()
			var vs := ov.size
			var shade := Color(0, 0, 0, 0.45)
			ov.draw_rect(Rect2(0, 0, S.position.x, vs.y), shade)
			ov.draw_rect(Rect2(S.end.x, 0, vs.x - S.end.x, vs.y), shade)
			ov.draw_rect(Rect2(S.position.x, S.end.y, S.size.x, vs.y - S.end.y), shade)
			# the notch (left, landscape) and the home indicator
			ov.draw_colored_polygon(UITheme.rounded_points(Rect2(0, vs.y * 0.5 - 115, S.position.x * 0.62, 230), 26, 5), Color(0, 0, 0, 0.95))
			ov.draw_colored_polygon(UITheme.rounded_points(Rect2(vs.x * 0.5 - 135, vs.y - (vs.y - S.end.y) * 0.5 - 5, 270, 10), 5, 3), Color(1, 1, 1, 0.85))
			ov.draw_polyline(PackedVector2Array([S.position, Vector2(S.end.x, S.position.y), S.end, Vector2(S.position.x, S.end.y), S.position]), Color(1, 0.3, 0.3, 0.6), 2.0))
		ov.queue_redraw()
	hud.command.connect(_on_command)
	hud.move_picked.connect(_on_move)
	hud.end_turn.connect(_on_end_turn)
	hud.pool_picked.connect(_on_pool)
	hud.undo.connect(func(): B.unqueue("a"); hud.refresh_moves())
	B.start()
	if A.has("state"): _state.call_deferred(String(A.state))
	else: _next_turn.call_deferred()

# ---------- the arena ----------
func _world() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.58, 0.76, 0.92)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.75, 0.8, 0.9)
	env.ambient_light_energy = 0.5
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.light_energy = 1.2
	add_child(sun)
	sun.look_at_from_position(Vector3(-4, 9, 5), Vector3.ZERO)
	var img := Image.create(256, 256, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 3
	for j in 256:
		for i in 256:
			var d := Vector2(i - 128, j - 128).length() / 128.0
			var g := Color(0.42, 0.6, 0.3).lerp(Color(0.62, 0.55, 0.38), clampf(1.0 - d * 1.4, 0.0, 1.0))
			img.set_pixel(i, j, g.darkened(rng.randf() * 0.08))
	var fm := StandardMaterial3D.new()
	fm.albedo_texture = ImageTexture.create_from_image(img)
	var fl := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(14, 14)
	fl.mesh = pm
	fl.material_override = fm
	add_child(fl)
	# tufts of grass round the edge, a few rocks
	for i in 70:
		var ang := rng.randf() * TAU
		var r := rng.randf_range(4.6, 7.0)
		var tuft := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.0; cm.bottom_radius = rng.randf_range(0.12, 0.25); cm.height = rng.randf_range(0.3, 0.6)
		tuft.mesh = cm
		var tm := StandardMaterial3D.new()
		tm.albedo_color = Color(0.25, 0.48, 0.2).darkened(rng.randf() * 0.2)
		tuft.material_override = tm
		tuft.position = Vector3(cos(ang) * r, cm.height * 0.5, sin(ang) * r)
		add_child(tuft)
	cam = Camera3D.new()
	cam.fov = 42.0
	add_child(cam)
	cam.current = true
	cam.look_at_from_position(Vector3(-3.6, 5.6, 6.4), Vector3(0.3, 0.2, -0.2))

func _mat(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 0.8
	return m

func _spawn(side: String, sp: String, at: Vector3) -> void:
	var n: Node3D
	if sp == "pidgey" and ResourceLoader.exists("res://creatures/pidgey.glb"):
		n = Creature.make("pidgey")
		n.scale = Vector3.ONE * 2.2
	else:
		n = _standin(sp)
	add_child(n)
	n.position = at
	homes[side] = at
	# a mound of dirt (shown while it's underground) and a shadow (while it's in the air)
	var mound := MeshInstance3D.new()
	var mm := SphereMesh.new(); mm.radius = 0.55; mm.height = 0.36
	mound.mesh = mm
	mound.material_override = _mat(Color("7a5a36"))
	mound.position = at + Vector3(0, 0.02, 0)
	mound.scale = Vector3(1, 0.6, 1)
	mound.visible = false
	add_child(mound)
	var shadow := MeshInstance3D.new()
	var cm2 := CylinderMesh.new(); cm2.top_radius = 0.45; cm2.bottom_radius = 0.45; cm2.height = 0.01
	shadow.mesh = cm2
	var sm := _mat(Color(0, 0, 0, 0.35)); sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	shadow.material_override = sm
	shadow.position = at + Vector3(0, 0.01, 0)
	shadow.visible = false
	add_child(shadow)
	marks[side] = [mound, shadow]
	var other := Vector3(1.7, 0, -1.6) if side == "a" else Vector3(-1.6, 0, 1.4)
	n.look_at(other, Vector3.UP, true)
	bodies[side] = n

# a simple stand-in: a body, a head, ears or a shell, by species
func _standin(sp: String) -> Node3D:
	var root := Node3D.new()
	var cols := {"pikachu": Color("f6d03b"), "sandshrew": Color("d9b45e"), "diglett": Color("8b5a3c"), "charmander": Color("f08a3a"), "squirtle": Color("6db8e6"), "bulbasaur": Color("6cc08b")}
	var c: Color = cols.get(sp, Color(0.7, 0.7, 0.7))
	var body := MeshInstance3D.new()
	var bm := SphereMesh.new(); bm.radius = 0.32; bm.height = 0.7
	body.mesh = bm; body.material_override = _mat(c); body.position = Vector3(0, 0.36, 0)
	root.add_child(body)
	var head := MeshInstance3D.new()
	var hm := SphereMesh.new(); hm.radius = 0.27; hm.height = 0.52
	head.mesh = hm; head.material_override = _mat(c); head.position = Vector3(0, 0.82, 0.05)
	root.add_child(head)
	for sx in [-1.0, 1.0]:
		var eye := MeshInstance3D.new()
		var em := SphereMesh.new(); em.radius = 0.045; em.height = 0.09
		eye.mesh = em; eye.material_override = _mat(Color.BLACK); eye.position = Vector3(0.11 * sx, 0.88, 0.27)
		root.add_child(eye)
		if sp == "pikachu":
			var ear := MeshInstance3D.new()
			var cm := CylinderMesh.new(); cm.top_radius = 0.0; cm.bottom_radius = 0.07; cm.height = 0.42
			ear.mesh = cm; ear.material_override = _mat(c); ear.position = Vector3(0.16 * sx, 1.18, 0.0); ear.rotation.z = -0.35 * sx
			root.add_child(ear)
			var tip := MeshInstance3D.new()
			var tm := CylinderMesh.new(); tm.top_radius = 0.0; tm.bottom_radius = 0.045; tm.height = 0.14
			tip.mesh = tm; tip.material_override = _mat(Color(0.12, 0.1, 0.08)); tip.position = Vector3(0.22 * sx, 1.35, 0.0); tip.rotation.z = -0.35 * sx
			root.add_child(tip)
			var cheek := MeshInstance3D.new()
			var chm := SphereMesh.new(); chm.radius = 0.06; chm.height = 0.12
			cheek.mesh = chm; cheek.material_override = _mat(Color("e8483a")); cheek.position = Vector3(0.19 * sx, 0.78, 0.2)
			root.add_child(cheek)
	if sp == "pikachu":
		var tail := MeshInstance3D.new()
		var tb := BoxMesh.new(); tb.size = Vector3(0.08, 0.5, 0.2)
		tail.mesh = tb; tail.material_override = _mat(c); tail.position = Vector3(0, 0.6, -0.38); tail.rotation.x = -0.6
		root.add_child(tail)
	if sp == "sandshrew":
		var back := MeshInstance3D.new()
		var sm := SphereMesh.new(); sm.radius = 0.34; sm.height = 0.55
		back.mesh = sm; back.material_override = _mat(Color("b88a3e")); back.position = Vector3(0, 0.45, -0.1)
		root.add_child(back)
	return root

# ---------- the loop ----------
func _next_turn() -> void:
	if B.over: _ended(); return
	await _play(B.begin_turn(), 0.35)
	if B.needs_pick("a"):
		if auto: B.pick_pool("a", "")
		else:
			hud.show_pick()
			return
	_open_menu()

func _open_menu() -> void:
	if auto:
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
			if B.flee("a"): hud.say("Got away safely!", UITheme.SKY); hud.busy(); _ended()
			else: hud.say("Can't escape!", UITheme.RED); _on_end_turn()
		"items":
			if B.use_item("a", "energy_shard") > 0: hud.say("Used an Energy Shard: +1 chip.", UITheme.YELLOW)
			else: hud.say("No room for more chips.", UITheme.RED)
		"pokemon": hud.say("Pikachu is your only Pokémon.", UITheme.SKY)

func _on_move(id: String) -> void:
	if B.queue("a", id):
		hud.say("%s queued." % String(BattleEnergy.move(id).name), UITheme.SKY)
		hud.refresh_moves()
		# a commitment or a finisher ends the picking
		if B.committed_now("a") or BattleEnergy.is_all(id): _on_end_turn()

func _on_end_turn() -> void:
	if _busy: return
	_busy = true
	hud.busy()
	B.ai_queue("b")
	B.begin_resolve()
	while B.resolving():
		await _play(B.step(), 0.0)
	_busy = false
	if B.over: _ended()
	else: _next_turn()

func _ended() -> void:
	hud.busy()
	hud.say({"won": "You won!", "lost": "Pikachu fainted...", "fled": "Got away safely!", "wild_fled": "The wild one fled!", "blown_away": "Blown away!"}.get(B.outcome, "The battle is over."), UITheme.YELLOW)
	B.finish()

# plays a step's events: a line each, with a small act on the 3D figures
func _play(evs: Array, gap: float) -> void:
	for e in evs:
		var txt := String(e.get("text_owner", e.text)) if e.get("side", "") == "a" else String(e.get("text", ""))
		var hold := 0.0
		match String(e.t):
			"move", "strike":
				_act(e.side, "lunge")
				_mood(e.side, String(BattleEnergy.move(String(e.move)).get("anim", "tackle")))
				var to := _screen(B.other(e.side))
				var bar := hud.bar_a if e.side == "a" else hud.bar_b
				bar.fly_target = to
				hold = 0.75
			"hit", "counter", "tick", "hurt_self":
				_act(e.side, "hurt"); _mood(e.side, "hurt"); Sfx.play("whoosh", null, {"vol": -10.0, "pitch": 0.7}); hold = 0.55
			"commit":
				_act(e.side, String(e.semi)); hold = 0.8
			"pulled_out", "forced_out":
				_act(e.side, "surface"); hold = 0.6
			"dodged":
				_act(e.side, "dodge"); hold = 0.6
			"faint":
				_act(e.side, "faint"); _mood(e.side, "faint"); hold = 1.0
			"lock", "disrupt", "locked_in", "wasted", "protected", "untargetable", "miss", "status", "stat", "broken", "flinch", "asleep":
				hold = 0.6
			"turn", "gain":
				hold = 0.0
			_:
				hold = 0.35
		if txt != "" and String(e.t) not in ["turn", "gain"]:
			hud.say(txt, UITheme.SKY if e.get("side", "") == "a" else UITheme.YELLOW)
		if String(e.t) == "strike": _act(e.side, "surface")
		if hold > 0.0: await get_tree().create_timer(hold).timeout
	if gap > 0.0: await get_tree().create_timer(gap).timeout

func _screen(side: String) -> Vector2:
	var at: Vector3 = homes[side] + Vector3(0, 0.6, 0)
	return cam.unproject_position(at) if not cam.is_position_behind(at) else Vector2(640, 300)

func _mood(side: String, m: String) -> void:
	var n = bodies.get(side)
	if n is Creature: n.mood(m)

func _act(side: String, kind: String) -> void:
	_anim[side] = {"kind": kind, "t": 0.0}

func _process(dt: float) -> void:
	t += dt
	if A.has("shot") and t >= float(A.get("shot-at", "1.5")) and not A.has("_shot_done"):
		A["_shot_done"] = "1"
		_save_shot.call_deferred()
	for side in bodies:
		var n: Node3D = bodies[side]
		var home: Vector3 = homes[side]
		var p := home
		var semi: String = B.fighter(side).e.semi() if B else ""
		var a: Dictionary = _anim.get(side, {})
		if not a.is_empty(): a.t += dt
		var k: float = a.get("t", 9.0)
		var dir: Vector3 = (homes[B.other(side)] - home).normalized() if B else Vector3.FORWARD
		match String(a.get("kind", "")):
			"lunge": p += dir * sin(clampf(k / 0.4, 0, 1) * PI) * 1.1
			"hurt": p += Vector3(sin(k * 60.0), 0, cos(k * 50.0)) * 0.06 * maxf(0.0, 1.0 - k / 0.4)
			"dodge": p += dir.cross(Vector3.UP) * sin(clampf(k / 0.5, 0, 1) * PI) * 0.8
			"faint": p.y -= minf(k, 1.0) * 0.4
		if semi == "underground": p.y = -1.2
		elif semi == "airborne": p.y = 2.6 + sin(t * 3.0) * 0.1
		elif semi == "underwater": p.y = -1.2
		n.position = n.position.lerp(p, 1.0 - exp(-dt * 14.0))
		n.visible = n.position.y > -0.9
		if marks.has(side):
			marks[side][0].visible = semi in ["underground", "underwater"]
			marks[side][0].scale = Vector3(1.0 + sin(t * 9.0) * 0.04, 0.6 + sin(t * 7.0) * 0.05, 1.0)
			marks[side][1].visible = semi == "airborne"
		if n is Creature:
			(n as Creature).animate(dt, 0.0)
		elif semi == "" and String(a.get("kind", "")) != "faint":
			n.position.y = home.y + absf(sin(t * 4.0 + (0.0 if side == "a" else 1.5))) * 0.05
		if String(a.get("kind", "")) == "faint": n.rotation.z = lerpf(n.rotation.z, 1.4, 1.0 - exp(-dt * 5.0))

func _save_shot() -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(String(A.shot))
	get_tree().quit()

# ---------- frozen HUD states for shots ----------
func _state(s: String) -> void:
	var a := B.fighter("a")
	var b := B.fighter("b")
	match s:
		"pools":
			B.begin_turn()
			a.e.set_focus(70.0, "shot"); b.e.set_focus(60.0, "shot")
			B.queue("a", "thunder_shock")
			hud.say("Pikachu used THUNDER SHOCK!", UITheme.SKY)
			hud.show_menu()
		"locks":
			B.begin_turn()
			a.e.set_focus(80.0, "shot"); b.e.set_focus(80.0, "shot")
			a.e.teach("dodge", true); a.e.equip("dodge")
			a.e.lock("dodge")
			b.e.teach("dodge", true); b.e.equip("dodge")
			b.e.lock("dodge")
			hud.say("The wild PIDGEY is ready for something...", UITheme.YELLOW)
			hud.show_menu()
		"dig":
			B.begin_turn()
			a.e.set_focus(60.0, "shot"); b.e.set_focus(70.0, "shot")
			if not B.queue("b", "dig"): b.e.commit_to("dig")
			B.begin_resolve()
			while B.resolving(): B.step()
			hud.say("Camper's SANDSHREW burrowed underground!", UITheme.YELLOW)
			hud.show_fight()
		"pick":
			var e := BattleEnergy.make("bulbasaur", 16)
			e.set_focus(50.0, "shot")
			B.fighter("a").e = e
			B.fighter("a").species = "bulbasaur"; B.fighter("a").name = "Bulbasaur"; B.fighter("a").types = ["grass", "poison"]
			B.fighter("a").level = 16
			bodies.a.queue_free()
			_spawn("a", "bulbasaur", homes.a)
			hud.bind(B)
			e.pick_mode = "player"
			e.begin_turn()
			b.e.set_focus(40.0, "shot")
			hud.show_pick()
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
