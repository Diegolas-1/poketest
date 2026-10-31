extends Node
# Dev test for the Pokémon battle's interface (ui/pkmn_hud.gd, ui/pkmn_fight.gd,
# ui/ui_input.gd, battle/battle_pkmn.gd), in the real game: a wild battle (Pikachu
# against a Pidgey) driven by input events, then a doubles one.
#   godot --headless --path native res://dev/battle_ui_test.tscn [-- --shots=DIR]
# Checks: B never ends the turn (the menu, the window); CONFIRM commits the queue;
# BACK returns to the menu and keeps the queue; a reorder changes the resolve order; a
# removed card comes back by a tap on its row; the energy pick comes up every turn a
# new chip waits; held input repeats after 0.35 s at no more than ~8 a second (the
# stick's flood and the key echo step once); taps hit the menu, the tiles, the rows;
# the camera stays on one side of the line while choosing and while the turn plays;
# the spacing (the two Pokémon apart, Ash back behind his); Ash in his battle stance
# and acting, never a random idle. --shots=DIR (with a renderer) saves labelled stills;
# --frames=DIR --every=n every n-th frame of the first turn played out (singles, doubles).
# Prints PASS / FAIL lines and "BATTLE UI TEST GREEN".

var main: Node
var fails := 0
var checks := 0
var shots := ""
var battle: Battle
var pk: BattlePkmn
var hud: PkmnHud
var cam_min := INF               # the camera's least distance to the +side of the line (it must stay > 0)
var cam_frames := 0
var watching := false
var ash_acts := {}
var frames_dir := ""
var every := 8
var grab := ""
var _f := 0

func ok(c: bool, what: String) -> void:
	checks += 1
	if not c: fails += 1
	print(("PASS " if c else "FAIL ") + what)

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shots="): shots = a.get_slice("=", 1)
		if a.begins_with("--frames="): frames_dir = a.get_slice("=", 1)
		if a.begins_with("--every="): every = maxi(1, int(a.get_slice("=", 1)))
	UIInput.force("pad")
	main = load("res://main.tscn").instantiate()
	add_child(main)
	_run.call_deferred()

func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout

func _frames(n: int) -> void:
	for i in n: await get_tree().process_frame

func _act(name: String, pressed := true) -> InputEventAction:
	var e := InputEventAction.new()
	e.action = name
	e.pressed = pressed
	return e

func send(e: InputEvent) -> void:
	hud._unhandled_input(e)

func tap(p: Vector2) -> void:
	var d := InputEventScreenTouch.new(); d.position = p; d.pressed = true
	send(d)
	await get_tree().process_frame
	var u := InputEventScreenTouch.new(); u.position = p; u.pressed = false
	send(u)
	await get_tree().process_frame

func shot(label: String) -> void:
	if shots == "": return
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("%s/%s.png" % [shots, label])

func _process(_dt: float) -> void:
	_f += 1
	if frames_dir != "" and grab != "" and _f % every == 0: _grab.call_deferred("%s/%s_%05d.png" % [frames_dir, grab, _f])
	if not watching or battle == null or not is_instance_valid(battle): return
	# the camera: which side of the line (partner to foe) it is on
	var d: float = (battle.cam_pos - battle.partner_pos).dot(battle.side)
	cam_min = minf(cam_min, d)
	cam_frames += 1
	var p = battle.player
	if p and p.idles:
		var n: String = p.idles.acting()
		if n != "": ash_acts[n] = true

func _grab(path: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(path)

func _wait_mode(modes: Array, secs := 30.0) -> bool:
	var t := 0.0
	while t < secs:
		if hud and hud.mode in modes: return true
		if battle == null or not is_instance_valid(battle) or pk == null: return false
		await get_tree().process_frame
		t += get_process_delta_time()
	return false

func _setup_world() -> void:
	while main.cast == null or main.cast.get("wild") == null: await get_tree().process_frame
	await _wait(0.8)
	var W: Wild = main.cast.wild
	W.tut.done = true
	W.cooldown = 1e9
	if W.ambush: W.ambush.cooldown = 1e9
	main.cast.clock.real = false; main.cast.clock.set_time(10.5)

func _place(at: Vector2) -> void:
	var p := Vector3(at.x, main.world.height_at(at.x, at.y), at.y)
	main.pos = p; main.speed = 0.0
	main.cast.land(p.y)
	main.cam_yaw = main.yaw + PI
	await _frames(10)

func _start(o: Dictionary) -> void:
	var d := Vector3(sin(main.yaw), 0, cos(main.yaw))
	o.merge({"mode": "pkmn", "at": main.pos + d * 4.4, "where": "tall_grass", "seed": 7, "auto": false})
	battle = Battle.start(main, o)
	while battle.pk == null or battle.pk.hud == null: await get_tree().process_frame
	pk = battle.pk
	hud = pk.hud

func _run() -> void:
	_nav_checks()
	await _setup_world()
	await _place(Vector2(-13.0, -95.0))
	await _singles()
	await _doubles()
	print("battle_ui_test: %d checks, %d failures" % [checks, fails])
	print("BATTLE UI TEST GREEN" if fails == 0 else "BATTLE UI TEST RED")
	get_tree().quit(1 if fails > 0 else 0)

# ---- held input: one step a press, a repeat after the delay, at most ~8 a second ----
func _nav_checks() -> void:
	var n := UIInput.Nav.new()
	n.poll = false
	var steps := []
	var dn := InputEventAction.new(); dn.action = "ui_down"; dn.pressed = true
	if n.event(dn) != Vector2i.ZERO: steps.append(0.0)
	n.held_dir = Vector2i.DOWN
	var t := 0.0
	while t < 2.0:
		t += 1.0 / 60.0
		if n.tick(1.0 / 60.0) != Vector2i.ZERO: steps.append(t)
	var early := steps.filter(func(x): return x > 0.0 and x < UIInput.NAV_DELAY - 0.01).size()
	var late := steps.filter(func(x): return x >= 1.0 and x < 2.0).size()
	ok(steps.size() >= 1 and steps[0] == 0.0, "a press steps at once")
	ok(early == 0, "held: no repeat before the delay (%d)" % early)
	ok(late >= 6 and late <= 9, "held: ~8 steps a second after the delay (%d in a second)" % late)
	ok(steps.size() <= 1 + int((2.0 - UIInput.NAV_DELAY) * UIInput.NAV_RATE) + 1, "held 2 s: %d steps (no flood)" % steps.size())
	# a long hitch never fires a burst
	n.held_dir = Vector2i.DOWN
	var burst := 0
	for i in 3: if n.tick(0.6) != Vector2i.ZERO: burst += 1
	ok(burst <= 3, "a long frame steps once, not a backlog (%d in 3 frames)" % burst)
	n.held_dir = Vector2i.ZERO
	n.tick(0.016)
	# the stick: a stream of motion events steps once, and again only after it comes back
	var m := UIInput.Nav.new()
	var sticks := 0
	for i in 40:
		var mo := InputEventJoypadMotion.new(); mo.axis = JOY_AXIS_LEFT_Y; mo.axis_value = 0.3 + i * 0.0175
		if m.event(mo) != Vector2i.ZERO: sticks += 1
	ok(sticks == 1, "the stick pushed and held: one step (%d)" % sticks)
	for v in [0.5, 0.2, 0.0, 0.7]:
		var mo2 := InputEventJoypadMotion.new(); mo2.axis = JOY_AXIS_LEFT_Y; mo2.axis_value = v
		if m.event(mo2) != Vector2i.ZERO: sticks += 1
	ok(sticks == 2, "released and pushed again: a second step (%d)" % sticks)
	var k := InputEventKey.new(); k.keycode = KEY_DOWN; k.physical_keycode = KEY_DOWN; k.pressed = true; k.echo = true
	ok(m.event(k) == Vector2i.ZERO, "a key's own echo never steps")

func _ids_ready() -> Array:
	return hud.fight.move_rows().filter(func(id): return hud.fight.state_of(String(id)) == "ready")

func _row_of(id: String) -> int:
	for i in hud.fight.rows.size():
		if hud.fight.rows[i].has("id") and String(hud.fight.rows[i].id) == id: return i
	return -1

func _singles() -> void:
	await _start({"partner": {"species": "pikachu", "level": 9, "focus": 30.0,
			"known": ["thunder_shock", "growl", "tail_whip", "quick_attack", "dodge", "thunder_wave", "double_team"],
			"equip": ["thunder_shock", "quick_attack", "dodge", "thunder_wave", "growl"]},
		"species": "pidgey", "level": 8, "ai": "wild", "state": "startled", "kind": "wild"})
	watching = true
	var plog: Array = pk.pick_log
	ok(await _wait_mode(["pick", "menu"]), "the battle reaches Ash's first choice (%s)" % hud.mode)
	# spacing: room between the Pokémon, Ash back behind his, the floor clear past them
	var pp := battle.partner_pos
	var fp := battle.foe_pos
	var ap := battle.ash_pos
	ok(Vector2(pp.x - fp.x, pp.z - fp.z).length() >= 4.2, "the two Pokémon stand apart (%.1f m)" % Vector2(pp.x - fp.x, pp.z - fp.z).length())
	ok(Vector2(ap.x - pp.x, ap.z - pp.z).length() >= 2.5, "Ash commands from behind his Pokémon (%.1f m back)" % Vector2(ap.x - pp.x, ap.z - pp.z).length())
	ok(battle.c.distance_to(Vector3(ap.x, battle.c.y, ap.z)) < battle.arena_r - 0.5 and battle.c.distance_to(Vector3(fp.x, battle.c.y, fp.z)) < battle.arena_r - 0.5, "the cleared floor reaches past Ash and the foe (r %.1f)" % battle.arena_r)
	# Ash: his battle stance, no random idles
	var idl = battle.player.idles if battle.player else null
	ok(idl != null and idl.stance in ["pk_ready", "pk_worried"] and idl.hold, "Ash holds his trainer stance, the random idles off (%s)" % (idl.stance if idl else "?"))
	ok(idl == null or idl.acting() == "" or idl.acting().begins_with("pk_"), "Ash isn't playing a plain idle (%s)" % (idl.acting() if idl else ""))
	# turn 1: a new chip waits: the energy pick
	ok(hud.mode == "pick" and battle.pk.B.needs_pick("a"), "turn 1: the energy pick comes up (%s)" % hud.mode)
	ok(hud.pick_opts.size() == 2 and String(hud.pick_opts[0].kind) == "electric", "the pick offers Lightning and Colorless (%s)" % [hud.pick_opts.map(func(o): return o.kind)])
	await _wait(0.6)
	await shot("03_energy_pick")
	var b0 := InputEventAction.new(); b0.action = "back"; b0.pressed = true
	send(b0)
	ok(hud.mode == "pick", "B can't skip the pick")
	await tap(hud.pick_tile(0).get_center())
	ok(hud.mode == "menu" and not pk.B.needs_pick("a") and int(pk.B.fighter("a").e.pools.electric.ready) >= 1, "a tap on the Lightning tile picks it (%s)" % hud.mode)
	await _wait(0.5)
	await shot("01_menu")
	# the camera while choosing: the choosing frame, on Ash's side
	ok(String(battle._shot.get("name", "")) == "overview", "choosing: the steady choosing frame (%s)" % battle._shot.get("name", ""))
	var turn0 := pk.B.turn
	# B in the menu: nothing
	send(_act("back"))
	await _frames(3)
	ok(hud.mode == "menu" and pk.B.turn == turn0 and not pk._busy, "B in the menu does nothing (no turn skipped)")
	# FIGHT by a tap
	await tap(hud.menu_rect(0).get_center())
	ok(hud.mode == "fight" and hud.fight.on, "a tap on FIGHT opens the window")
	await _wait(0.4)
	# B in the window, nothing queued: back to the menu, no turn
	send(_act("back"))
	await _frames(3)
	ok(hud.mode == "menu" and pk.B.turn == turn0 and pk.B.queued("a").is_empty() and not pk._busy, "B in the window goes back to the menu (no turn)")
	send(_act("use"))   # (the cursor is on FIGHT)
	ok(hud.mode == "fight", "A on FIGHT opens it again")
	# queue two moves with A
	var r1 := _ids_ready()
	ok(r1.has("growl") and r1.has("thunder_shock"), "Growl and Thunder Shock are ready (%s)" % [r1])
	# (two moves of the same priority: Quick Attack would go first whatever the order)
	hud.fight.sel = _row_of("growl"); hud.fight.col = 0
	send(_act("use"))
	hud.fight.sel = _row_of("thunder_shock")
	send(_act("use"))
	ok(pk.B.queued("a") == ["growl", "thunder_shock"], "A adds moves to the queue in order (%s)" % [pk.B.queued("a")])
	await _wait(0.4)
	await shot("02_fight_queue")
	# BACK keeps the queue
	send(_act("back"))
	await _frames(2)
	ok(hud.mode == "menu" and pk.B.queued("a").size() == 2 and pk.B.turn == turn0, "BACK: the menu, the queue kept, no turn")
	send(_act("use"))
	ok(hud.mode == "fight" and pk.B.queued("a").size() == 2, "FIGHT again: the queue is still there")
	# reorder on the pad: right into the queue, A picks up the first, down, A puts it down
	send(_act("ui_right"))
	hud.fight.qsel = 0
	send(_act("use"))
	ok(hud.fight.held == 0, "A picks up a queued card")
	await _wait(0.2)
	await shot("02b_fight_reorder_held")
	send(_act("ui_down"))
	send(_act("use"))
	ok(pk.B.queued("a") == ["thunder_shock", "growl"] and hud.fight.held < 0, "down and A: the order changed (%s)" % [pk.B.queued("a")])
	# touch: X on a card removes it, a tap on its row brings it back
	await tap(hud.fight.x_rect(1).get_center())
	ok(pk.B.queued("a") == ["thunder_shock"], "a tap on X removes a card (%s)" % [pk.B.queued("a")])
	await tap(hud.fight.row_rect(_row_of("growl")).get_center())
	ok(pk.B.queued("a") == ["thunder_shock", "growl"], "a tap on a row adds it (%s)" % [pk.B.queued("a")])
	# a drag on the touch list scrolls instead of adding
	var nq := pk.B.queued("a").size()
	var lr := hud.fight.list_rect()
	var dd := InputEventScreenTouch.new(); dd.position = lr.get_center(); dd.pressed = true
	send(dd)
	var dg := InputEventScreenDrag.new(); dg.position = lr.get_center() + Vector2(0, -60); send(dg)
	var du := InputEventScreenTouch.new(); du.position = lr.get_center() + Vector2(0, -60); du.pressed = false
	await get_tree().process_frame
	send(du)
	ok(pk.B.queued("a").size() == nq, "a drag on the list doesn't add a move")
	# a held card can be put back with B (it doesn't close the window)
	hud.fight.col = 1; hud.fight.qsel = 1
	send(_act("use")); send(_act("back"))
	ok(hud.mode == "fight" and hud.fight.held < 0, "B puts a held card back (the window stays)")
	await _wait(0.3)
	await shot("02c_fight_confirm_ready")
	# camera: still the choosing frame, same side
	ok(cam_min > 0.0, "while choosing the camera stays on Ash's side of the line (%.2f)" % cam_min)
	# CONFIRM (START): the turn goes, in the new order
	var hist0 := pk.B.history.size()
	send(_act("menu"))
	await _frames(2)
	ok(hud.mode == "busy" and pk._busy, "CONFIRM commits the turn")
	ok(not pk.turn_log.is_empty() and pk.turn_log.back().a == ["thunder_shock", "growl"], "the committed queue is the reordered one (%s)" % [pk.turn_log.back().a if not pk.turn_log.is_empty() else []])
	grab = "s"
	await shot("04_resolve_a")
	await _wait(1.6)
	await shot("04_resolve_b")
	await _wait_mode(["pick", "menu"], 40.0)
	await _wait(1.0)
	grab = ""
	var moves_a := pk.B.history.slice(hist0).filter(func(e): return String(e.get("t", "")) == "move" and String(e.get("side", "")) == "a").map(func(e): return String(e.move))
	ok(moves_a.size() >= 1 and moves_a[0] == "thunder_shock", "the moves resolved in the queue's order (%s)" % [moves_a])
	ok(cam_min > 0.0, "the turn played out on the same side of the line (%.2f over %d frames)" % [cam_min, cam_frames])
	ok(ash_acts.has("pk_command"), "Ash commanded his move (%s)" % [ash_acts.keys()])
	ok(ash_acts.keys().all(func(n): return String(n).begins_with("pk_")), "every act Ash played was a battle one (%s)" % [ash_acts.keys()])
	# the log: compact by default, L opens it
	ok(not hud.log_open and hud.log_all.size() >= 3, "the log: compact, every line kept (%d)" % hud.log_all.size())
	await shot("05_log_compact")
	send(_act("recenter"))
	ok(hud.log_open, "L opens the log")
	await _wait(0.35)
	await shot("06_log_open")
	send(_act("back"))
	ok(not hud.log_open and hud.mode in ["menu", "pick"], "B closes the log (and nothing else)")
	await tap(hud.log_btn_rect().get_center())
	ok(hud.log_open, "a tap on LOG opens it")
	await tap(Vector2(hud.get_viewport_rect().size.x * 0.8, hud.get_viewport_rect().size.y * 0.5))
	ok(not hud.log_open, "a tap off it closes it")
	# a few more turns by hand: the pick every turn a chip waits
	var guard := 0
	while is_instance_valid(battle) and is_instance_valid(pk) and not pk.B.over and guard < 4:
		guard += 1
		if not await _wait_mode(["pick", "menu"], 40.0): break
		if hud.mode == "pick":
			await _wait(0.3)
			send(_act("use"))
			await _frames(2)
		if hud.mode != "menu": continue
		hud.sel = 0
		send(_act("use"))
		var rr := _ids_ready()
		if not rr.is_empty():
			hud.fight.sel = _row_of(String(rr[0])); hud.fight.col = 0
			send(_act("use"))
		send(_act("menu"))
		await _frames(2)
	var missed := plog.filter(func(p): return int(p.pending) > 0 and not bool(p.prompted))
	var asked := plog.filter(func(p): return bool(p.prompted)).size()
	ok(missed.is_empty() and asked >= 2, "the energy pick came up every turn a chip waited (%d of %d turns; missed %s)" % [asked, plog.size(), missed])
	ok(cam_min > 0.0, "the whole battle kept one side of the line (%.2f)" % cam_min)
	# the rest skipped: Ash runs (at his next choice), the battle closes
	await _end_battle()
	watching = false
	ok(not is_instance_valid(battle) or battle.done, "the battle ran to its end")
	await _wait(2.5)

# ends the battle at Ash's next choice (as if it fled), and waits for it to close
func _end_battle() -> void:
	if is_instance_valid(battle) and is_instance_valid(pk) and not pk.B.over:
		await _wait_mode(["pick", "menu"], 60.0)
		if is_instance_valid(pk):
			pk.B.over = true; pk.B.outcome = "fled"; pk._over = true
	var t := 0.0
	while is_instance_valid(battle) and not battle.done and t < 30.0:
		await get_tree().process_frame
		t += get_process_delta_time()

func _doubles() -> void:
	cam_min = INF
	ash_acts = {}
	await _place(Vector2(-13.0, -100.0))
	while Battle.active: await get_tree().process_frame
	await _start({"partner": {"species": "pikachu", "level": 14}, "party_a": [{"species": "pikachu", "level": 14}, {"species": "bulbasaur", "level": 14}],
		"party_b": [{"species": "pidgey", "level": 10}, {"species": "rattata", "level": 10}], "doubles": true, "kind": "trainer", "trainer": "Camper",
		"species": "pidgey", "level": 10, "ai": "balanced"})
	watching = true
	ok(await _wait_mode(["pick", "menu"], 40.0), "doubles: Ash's first choice (%s)" % hud.mode)
	var a0 := pk._pos_at("a", 0); var a1 := pk._pos_at("a", 1); var b0 := pk._pos_at("b", 0)
	ok(a0.distance_to(a1) >= 2.8 and Vector2(a0.x - b0.x, a0.z - b0.z).length() >= 4.2, "doubles: room between the four (%.1f across, %.1f to the foe)" % [a0.distance_to(a1), Vector2(a0.x - b0.x, a0.z - b0.z).length()])
	if hud.mode == "pick": send(_act("use")); await _frames(2)
	hud.sel = 0
	send(_act("use"))
	ok(hud.mode == "fight" and hud.fight.confirm_label.begins_with("NEXT"), "doubles: the first one's CONFIRM moves on to the next (%s)" % hud.fight.confirm_label)
	await _wait(0.4)
	await shot("07_doubles_fight")
	send(_act("menu"))
	await _frames(2)
	ok(pk._inp == 1 and hud.mode in ["menu", "pick"] and not pk._busy, "doubles: CONFIRM for the first: now the second chooses, no turn yet")
	if hud.mode == "pick": send(_act("use")); await _frames(2)
	await _wait(0.4)
	await shot("08_doubles_menu")
	hud.sel = 0
	send(_act("use"))
	ok(hud.fight.confirm_label == "CONFIRM", "doubles: the last one's button is CONFIRM")
	send(_act("menu"))
	await _frames(2)
	grab = "d"
	ok(pk._busy, "doubles: the second CONFIRM plays the turn")
	await _wait(1.5)
	await shot("09_doubles_resolve")
	await _wait_mode(["pick", "menu"], 60.0)
	grab = ""
	await _end_battle()
	ok(cam_min > 0.0, "doubles: the camera kept one side of the line (%.2f over %d frames)" % [cam_min, cam_frames])
	watching = false
