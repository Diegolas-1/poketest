class_name Cast
extends Node3D
# The people and the gameplay around them (web/world/main.js): Ash (the
# player's model, CastActor "ash"), the townspeople living their days (life.gd
# on the game clock, clock.gd), talking (A / "use": the player and the person
# stop and turn to face each other; the lines come from Quests.talk), signs and
# other things to read (town.use, baked to cast.json), the
# jump, the area banners, and Prof. Oak stopping you at the tall grass north
# of town and leading you back down Route 1 to his lab.
#
# main.gd owns the player's position, yaw and speed and the camera; it calls
#   busy()          -> true while a text box or a scene has the controls
#   update(dt)      after moving the player (handles the rest)

var game: Node3D        # main.gd: pos, yaw, speed, cam, cam_yaw, world
var player: CastActor
var dialog: DialogBox
var npcs: Array = []     # Prof. Oak (the townspeople are life.gd's)
var oak: Dictionary
var clock: GameClock
var life: TownLife
var uses: Array = []
var road: Array = []
var tall: Array = []
var lab_door := Vector2.ZERO
var script_phase := -1   # Oak's scene: -1 none, 0 runs to you, 1 talking, 2 walking to the lab
var walk_path: Array = []
var vy := 0.0
var ground := true
var face := NAN
var area := "town"
var ready_t := 0.0
var _air_y := 0.0
var _rng := RandomNumberGenerator.new()
# touch buttons (A, Jump)
var btn_ui: Control
var _btn_a := false
var _btn_jump := false
var _touch_btn := {}     # touch index -> "use" | "jump"

func setup(g: Node3D) -> void:
	game = g
	_rng.randomize()
	_actions()
	_test_init()
	var d := CastActor.data()
	player = CastActor.make("ash")
	add_child(player)
	for n in d.npcs:
		if n.name != "Prof. Oak": continue   # the old wandering villagers: life.gd has the town now
		var a := CastActor.make(n.look)
		add_child(a)
		var x: float = n.x
		var z: float = n.z
		var e := {"actor": a, "name": n.name, "home": Vector2(x, z), "pos": Vector3(x, game.world.height_at(x, z), z),
			"yaw": float(n.yaw), "target": null, "wait": 1.0 + _rng.randf() * 3.0, "wander": float(n.wander),
			"lines": n.lines, "speed": 0.0, "face": NAN, "hidden": false}
		npcs.append(e)
		if n.name == "Prof. Oak":
			oak = e
			e.hidden = true; a.visible = false
	uses = d.use
	road = d.road
	tall = d.tallGrass
	lab_door = Vector2(d.labDoor[0], d.labDoor[1])
	var layer := CanvasLayer.new()
	layer.layer = 2
	add_child(layer)
	dialog = DialogBox.new()
	layer.add_child(dialog)
	btn_ui = _TouchButtons.new()
	btn_ui.cast = self
	layer.add_child(btn_ui)
	dialog.banner("Pallet Town", "A quiet seaside village")
	_air_y = game.pos.y
	clock = GameClock.new()
	add_child(clock)
	life = TownLife.new()
	add_child(life)
	life.setup(game, self, clock)

# the actions worker settings define in project.godot; added here only when missing
func _actions() -> void:
	var keys := {"use": [KEY_E, KEY_ENTER, KEY_X], "jump": [KEY_SPACE], "run": [KEY_SHIFT], "back": [KEY_ESCAPE, KEY_Z, KEY_BACKSPACE]}
	var pads := {"use": JOY_BUTTON_A, "jump": JOY_BUTTON_X, "back": JOY_BUTTON_B}
	for a in keys:
		if InputMap.has_action(a): continue
		InputMap.add_action(a)
		for kc in keys[a]:
			var ev := InputEventKey.new(); ev.physical_keycode = kc
			InputMap.action_add_event(a, ev)
		if pads.has(a):
			var jb := InputEventJoypadButton.new(); jb.button_index = pads[a]
			InputMap.action_add_event(a, jb)

func busy() -> bool:
	return dialog.open or script_phase >= 0 or bool(game.get("trans_busy"))

# ---------- inside a building (main.gd enter_space / leave_space) ----------
# The villagers outside are hidden and left alone; the interior's own people
# (its blueprint's actors) and things to look at take their place.
var indoors := false
var _out := {}           # the outdoor npcs and uses while inside
func enter_space(it) -> void:
	indoors = true
	_out = {"npcs": npcs, "uses": uses}
	for n in npcs: n.actor.visible = false
	life.away = true
	if not oak.is_empty():
		oak.hidden = true   # he went in ahead of you
	var inside: Array = []
	for a in it.data.meta.actors:
		var actor := CastActor.make(String(a.look))
		add_child(actor)
		var e := {"actor": actor, "name": a.name, "home": Vector2(a.x, a.z), "pos": Vector3(a.x, float(a.y), a.z), "yaw": float(a.rot),
			"target": null, "wait": 1e9, "wander": 0.0, "lines": a.lines, "speed": 0.0, "face": NAN, "hidden": false,
			"level": int(a.level), "ylock": float(a.y), "rot0": float(a.rot)}
		inside.append(e)
	npcs = inside
	uses = it.data.meta.uses
	dialog.banner(String(it.data.meta.name), "Pallet Town")

# put the player on the ground at once (after a door: no fall from the old height)
func land(y: float) -> void:
	_air_y = y; vy = 0.0; ground = true

func leave_space() -> void:
	for n in npcs: n.actor.queue_free()
	npcs = _out.npcs
	uses = _out.uses
	indoors = false
	life.away = false
	dialog.banner("Pallet Town", "A quiet seaside village")
	area = "town"

func run_held() -> bool:
	return Input.is_action_pressed("run")

func _pressed(a: String) -> bool:
	var p := Input.is_action_just_pressed(a)
	if a == "use" and _btn_a: p = true
	if a == "jump" and _btn_jump: p = true
	return p

# ---------- the closest thing to talk to or read ----------
func nearby() -> Dictionary:
	var best := {}
	var bd := 1e9
	var me: Vector3 = game.pos
	var fx := sin(game.yaw)
	var fz := cos(game.yaw)
	var lv: int = game.world.level if indoors else 0
	for u in uses:
		if u.has("level") and int(u.level) != lv: continue
		var dx: float = u.x - me.x
		var dz: float = u.z - me.z
		var dd := sqrt(dx * dx + dz * dz)
		if dd < float(u.r) + 0.6 and dd < bd:
			var ay: float = float(u.y) if u.has("y") else game.world.height_at(u.x, u.z) + 1.9
			best = {"label": u.label, "lines": u.lines, "at": Vector3(u.x, ay, u.z), "u": u}; bd = dd
	for n in npcs:
		if n.hidden: continue
		if n.has("level") and int(n.level) != lv: continue
		var p: Vector3 = n.pos
		var dx := p.x - me.x
		var dz := p.z - me.z
		var dd := sqrt(dx * dx + dz * dz)
		if dd < 2.2 and (dx * fx + dz * fz) / maxf(dd, 1e-4) > 0.2 and dd < bd:
			best = {"label": "Talk", "lines": n.lines, "npc": n, "at": p + Vector3(0, 2.0, 0)}; bd = dd
	var t := life.nearest_talk(me, fx, fz, minf(2.2, bd)) if not indoors else {}
	if not t.is_empty():
		best = {"label": "Talk", "person": t, "at": t.pos + Vector3(0, 1.5 if t.age == "kid" else 2.0, 0)}
		bd = Vector2(t.pos.x - me.x, t.pos.z - me.z).length()
	# the townspeople's Pokémon (companions.gd)
	var c := life.companions.nearest_talk(me, fx, fz, minf(2.2, bd)) if not indoors else {}
	if not c.is_empty():
		best = {"label": "Talk", "pet": c, "at": life.companions.talk_at(c)}
	return best

# ---------- the frame ----------
func update(dt: float) -> void:
	ready_t += dt
	if _test != "": _test_step(dt)
	var use := _pressed("use")
	var jmp := _pressed("jump")
	var back := _pressed("back")
	_btn_a = false; _btn_jump = false
	if dialog.open:
		if use or jmp or back: dialog.next()
		use = false; jmp = false
	elif script_phase < 0:
		if jmp and ground:
			vy = 5.2; ground = false
		if use:
			var n := nearby()
			# the lab's door opens: inside you go (main.gd enter_space)
			if not indoors and n.has("u") and String(n.u.label) == "Door" and Vector2(n.u.x, n.u.z).distance_to(lab_door) < 1.5:
				game.enter_space("oak_lab", "from_town")
				n = {}
			if not n.is_empty():
				var me: Vector3 = game.pos
				game.speed = 0.0
				if n.has("person"):
					var pp: Dictionary = n.person
					face = atan2(pp.pos.x - me.x, pp.pos.z - me.z)
					dialog.say(life.begin_talk(pp), func(): life.end_talk(pp))
				elif n.has("pet"):
					var pc: Dictionary = n.pet
					face = atan2(pc.pos.x - me.x, pc.pos.z - me.z)
					dialog.say(life.companions.begin_talk(pc), func(): life.companions.end_talk(pc))
				else:
					if n.has("npc"):
						var c: Dictionary = n.npc
						c.target = null; c.wait = 3.0; c.speed = 0.0
						c.face = atan2(me.x - c.pos.x, me.z - c.pos.z)
						face = atan2(c.pos.x - me.x, c.pos.z - me.z)
					else:
						face = atan2(n.at.x - me.x, n.at.z - me.z)
					dialog.say(n.lines)
	# turn smoothly to face whoever (or whatever) you're talking to
	if dialog.open and not is_nan(face):
		game.yaw += wrapf(face - game.yaw, -PI, PI) * (1.0 - exp(-dt * 10.0))
	if not dialog.open: face = NAN
	if script_phase >= 0: _oak_scene(dt)
	# gravity (pos.y was set to the ground by main; keep the height while in the air)
	var g: float = game.world.height_at(game.pos.x, game.pos.z)
	vy -= 16.0 * dt
	_air_y += vy * dt
	if _air_y <= g:
		_air_y = g; vy = 0.0; ground = true
	if ground and _air_y - g < 0.3: _air_y = g
	game.pos.y = _air_y
	player.position = game.pos
	player.rotation.y = game.yaw
	# the head turns toward where the camera looks, within a comfortable range
	var rel := wrapf(game.cam_yaw + PI - game.yaw, -PI, PI)
	player.look_yaw = clampf(rel, -1.0, 1.0) if absf(rel) < 2.2 and not dialog.open else 0.0
	player.animate(dt, absf(game.speed), not ground)
	_villagers(dt)
	life.update(dt)   # the town's day goes on while you're inside, hidden (life.set_hidden)
	if indoors:
		var n3 := nearby() if not dialog.open else {}
		var cam3: Camera3D = game.cam
		dialog.prompt = {"pos": cam3.unproject_position(n3.at), "label": n3.label} if not n3.is_empty() and not cam3.is_position_behind(n3.at) else {}
		return
	# areas and events
	var me2: Vector3 = game.pos
	var in_grass := false
	for b in tall:
		if me2.x > b[0] and me2.x < b[2] and me2.z > b[1] and me2.z < b[3]: in_grass = true
	var now := "route1" if me2.z < -60.0 else "town"
	if now != area:
		area = now
		if now == "route1": dialog.banner("Route 1", "Pallet Town - Viridian City")
		else: dialog.banner("Pallet Town", "A quiet seaside village")
	if in_grass and script_phase < 0 and not dialog.open and ready_t > 1.0: _oak_start()
	# the prompt over whatever is in reach
	var n2 := nearby() if not dialog.open and script_phase < 0 else {}
	var cam: Camera3D = game.cam
	if not n2.is_empty() and not cam.is_position_behind(n2.at):
		dialog.prompt = {"pos": cam.unproject_position(n2.at), "label": n2.label}
	else:
		dialog.prompt = {}

var _frame := 0
func _villagers(dt: float) -> void:
	_frame += 1
	var cam: Camera3D = game.cam
	var planes := cam.get_frustum()
	for n in npcs:
		if n.hidden: continue
		var a: CastActor = n.actor
		if dialog.open or (n == oak and script_phase < 0):
			if dialog.open: n.speed = 0.0
			if not is_nan(n.face): n.yaw += wrapf(n.face - n.yaw, -PI, PI) * (1.0 - exp(-dt * 8.0))
		else:
			n.face = NAN
		if n != oak and n.wander > 0.0 and not dialog.open:
			if n.target == null:
				n.wait -= dt; n.speed *= exp(-dt * 8.0)
				if n.wait <= 0.0:
					var ang := _rng.randf() * TAU
					var r := _rng.randf() * float(n.wander)
					n.target = n.home + Vector2(cos(ang), sin(ang)) * r
			else:
				var tgt: Vector2 = n.target
				var dx: float = tgt.x - n.pos.x
				var dz: float = tgt.y - n.pos.z
				var dd := sqrt(dx * dx + dz * dz)
				if dd < 0.3:
					n.target = null; n.wait = 2.0 + _rng.randf() * 4.0
				else:
					n.speed = 1.6
					n.yaw += wrapf(atan2(dx, dz) - n.yaw, -PI, PI) * (1.0 - exp(-dt * 6.0))
					var want: Vector3 = Vector3(sin(n.yaw), 0, cos(n.yaw)) * float(n.speed) * dt
					var np: Vector3 = game.world.step(n.pos, want.x, want.z)
					var got := Vector2(np.x - n.pos.x, np.z - n.pos.z).length()
					n.pos = np
					if got < want.length() * 0.5: n.target = null
		n.pos.y = float(n.ylock) if n.has("ylock") else game.world.height_at(n.pos.x, n.pos.z)
		# indoors people turn back to what they were doing after a talk
		if n.has("rot0") and not dialog.open and is_nan(n.face): n.yaw += wrapf(float(n.rot0) - n.yaw, -PI, PI) * (1.0 - exp(-dt * 2.0))
		a.position = n.pos
		a.rotation.y = n.yaw
		# well outside the view (with room for their shadow): not drawn, not animated
		var c: Vector3 = n.pos + Vector3(0, 1, 0)
		var seen := true
		for pl in planes:
			if pl.distance_to(c) > 2.5: seen = false; break
		if a.visible != seen: a.visible = seen
		if seen:
			# far off: animated every other frame
			n.acc = float(n.get("acc", 0.0)) + dt
			var d2 := cam.global_position.distance_squared_to(c)
			var far: bool = d2 > 625.0
			# their cloth and hair: full near, at half rate further off, hanging still when far
			a.cloth_far = far
			a.cloth_rate = 60.0 if d2 < 144.0 else 30.0
			if not far or _frame % 2 == 0:
				a.animate(n.acc, n.speed, false); n.acc = 0.0

# ---------- Prof. Oak's scene ----------
func _oak_start() -> void:
	var me: Vector3 = game.pos
	oak.hidden = false; oak.actor.visible = true
	oak.pos = Vector3(me.x + 1.5, 0, me.z + 9.0)
	oak.pos.y = game.world.height_at(oak.pos.x, oak.pos.z)
	oak.face = NAN
	script_phase = 0
	game.speed = 0.0

func _oak_scene(dt: float) -> void:
	var me: Vector3 = game.pos
	if script_phase == 0:
		game.speed = 0.0
		var dx: float = me.x - oak.pos.x
		var dz: float = me.z + 1.6 - oak.pos.z
		var dd := sqrt(dx * dx + dz * dz)
		if dd > 0.15:
			var v := minf(dd, dt * 5.5)
			oak.pos.x += dx / dd * v; oak.pos.z += dz / dd * v
			oak.yaw = atan2(dx, dz); oak.speed = 5.5
		else:
			oak.speed = 0.0; script_phase = 1
			game.yaw = atan2(oak.pos.x - me.x, oak.pos.z - me.z)
			oak.face = atan2(me.x - oak.pos.x, me.z - oak.pos.z)
			dialog.say(["OAK: Hey! Wait! Don't go out!", "It's unsafe! Wild POKéMON live in tall grass!",
				"You need your own POKéMON for your protection.", "I know! Come see me at my lab, by the sea. Follow me!"], func(): script_phase = 2)
	elif script_phase == 1:
		game.speed = 0.0
	elif script_phase == 2:
		# both head back south along Route 1 toward town
		if walk_path.is_empty():
			var bi := 0
			var bd := 1e9
			for i in road.size():
				var d2: float = pow(road[i][0] - me.x, 2) + pow(road[i][1] - me.z, 2)
				if d2 < bd: bd = d2; bi = i
			walk_path = road.slice(bi + 1, bi + 16)
			if walk_path.is_empty(): walk_path = [[me.x, me.z]]
		var tgt: Array = walk_path[0]
		var moved := false
		for who in [[oak, -0.9], [null, 0.9]]:
			var p: Vector3 = oak.pos if who[0] != null else game.pos
			var dx: float = tgt[0] + who[1] - p.x
			var dz: float = tgt[1] - p.z
			var dd := sqrt(dx * dx + dz * dz)
			if dd > 0.2:
				var v := minf(dd, dt * 4.5)
				p.x += dx / dd * v; p.z += dz / dd * v
				moved = true
				var yw := atan2(dx, dz)
				if who[0] != null:
					oak.pos = p; oak.yaw = yw; oak.speed = 4.5
				else:
					game.pos = p; game.yaw = yw; game.speed = 4.5
			elif who[0] != null: oak.speed = 0.0
			else: game.speed = 0.0
		if Vector2(tgt[0] + 0.9 - game.pos.x, tgt[1] - game.pos.z).length() < 0.5 or not moved: walk_path.pop_front()
		oak.pos.y = game.world.height_at(oak.pos.x, oak.pos.z)
		if walk_path.is_empty():
			script_phase = -1
			game.speed = 0.0; oak.speed = 0.0
			oak.pos = Vector3(lab_door.x, game.world.height_at(lab_door.x, lab_door.y), lab_door.y)
			oak.yaw = -PI / 2.0
			oak.face = NAN
			oak.lines = ["OAK: Here we are, my lab! Come on in.", "I'll be waiting at my computer."]
			dialog.banner("Prof. Oak's Lab", "Up the stairs on the hill by the sea")

# ---------- render checks: -- --cast-test=front|walk|run|jump|talk|oak ----------
var _test := ""
var _test_t := 0.0
func _test_init() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--cast-test="): _test = a.substr(12)

func _test_step(dt: float) -> void:
	_test_t += dt
	var t := _test_t
	game.cam_idle = 0.0
	match _test:
		"front":
			game.cam_yaw = game.yaw + 0.3; game.cam_dist = 3.2; game.cam_pitch = 0.12
		"far":
			game.cam_yaw = game.yaw + 0.8; game.cam_dist = 9.0; game.cam_pitch = 0.4
		"walk", "run":
			game.stick_vec = Vector2(0, -(0.95 if _test == "run" else 0.6)) if t > 0.3 else Vector2.ZERO
			game.cam_yaw = game.yaw + PI / 2.0; game.cam_dist = 4.0; game.cam_pitch = 0.1
		"jump":
			game.cam_yaw = game.yaw + PI / 2.0; game.cam_dist = 4.0; game.cam_pitch = 0.1
			if fmod(t, 1.2) < dt: _btn_jump = true
		"talk":
			if t < dt * 1.5:
				var g: Dictionary = {}
				for p in life.people:
					if p.state == "act": g = p; break
				if g.is_empty(): return
				game.pos = g.pos + Vector3(0, 0, 1.6); game.yaw = PI
			game.cam_yaw = game.yaw + PI / 2.0 + 0.5; game.cam_dist = 4.5; game.cam_pitch = 0.2
			if absf(t - 0.5) < dt * 0.5: _btn_a = true
		"sign":
			if t < dt * 1.5:
				for u in uses:
					if u.label == "Read":
						var a := Vector3(u.x, 0, u.z)
						game.pos = a + Vector3(0, 0, 1.0); game.pos.y = game.world.height_at(game.pos.x, game.pos.z)
						_air_y = game.pos.y; game.yaw = PI
						break
			game.cam_yaw = game.yaw + PI + 0.6; game.cam_dist = 5.0; game.cam_pitch = 0.25
			if absf(t - 1.2) < dt * 0.5: _btn_a = true
		"oak":
			if t < dt * 1.5:
				game.pos = Vector3(0, 0, -59.0); game.pos.y = game.world.height_at(0, -59.0); game.yaw = PI
				_air_y = game.pos.y
			game.stick_vec = Vector2(0, -0.5) if script_phase < 0 and t < 1.0 else Vector2.ZERO
			if dialog.open and fmod(t, 0.6) < dt: _btn_a = true
			game.cam_dist = 6.0

# ---------- touch buttons: A and Jump ----------
func _input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed:
			var b: String = btn_ui.hit(e.position)
			if b != "":
				_touch_btn[e.index] = b
				if b == "use": _btn_a = true
				else: _btn_jump = true
				btn_ui.down[b] = true
				btn_ui.queue_redraw()
				get_viewport().set_input_as_handled()
		elif _touch_btn.has(e.index):
			btn_ui.down[_touch_btn[e.index]] = false
			btn_ui.queue_redraw()
			_touch_btn.erase(e.index)
			get_viewport().set_input_as_handled()
	elif e is InputEventScreenDrag and _touch_btn.has(e.index):
		get_viewport().set_input_as_handled()

class _TouchButtons extends Control:
	var cast
	var down := {"use": false, "jump": false}
	var font: FontVariation
	var shown := false
	func _ready() -> void:
		set_anchors_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		font = FontVariation.new(); font.base_font = load("res://fonts/PixelifySans.woff2"); font.variation_opentype = {"wght": 700}
		_update()
		Input.joy_connection_changed.connect(func(_d, _c): _update())
		get_viewport().size_changed.connect(queue_redraw)
	# on a touch screen, shown while no game controller is connected (it comes back
	# when the controller goes); --touch forces it on (desktop tests)
	func _update() -> void:
		var touch := DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")
		shown = OS.get_cmdline_user_args().has("--touch") or (touch and Input.get_connected_joypads().is_empty())
		visible = shown
		if not shown:
			for k in down: down[k] = false
	# placed by the screen's size (under a CanvasLayer the full-rect anchors leave this
	# control 0 x 0, which put the buttons off screen), inside the iPhone's safe area
	func centres() -> Dictionary:
		var s := get_viewport_rect().size
		var safe := DisplayServer.get_display_safe_area()
		var win := DisplayServer.window_get_size()
		if safe.size.x > 0 and win.x > 0:
			var k := s.x / float(win.x)
			s -= Vector2(maxf(0.0, win.x - safe.end.x), maxf(0.0, win.y - safe.end.y)) * k
		return {"use": Vector2(s.x - 12 - 10 - 32, s.y - 86 - 10 - 32), "jump": Vector2(s.x - 86 - 10 - 32, s.y - 30 - 10 - 32)}
	func hit(p: Vector2) -> String:
		if not shown: return ""
		var c := centres()
		for k in c:
			if p.distance_to(c[k]) < 40.0: return k
		return ""
	func _draw() -> void:
		var c := centres()
		for k in c:
			var col := Color(0.91, 0.27, 0.235, 0.8) if k == "use" else Color(0.137, 0.157, 0.31, 0.6)
			if down[k]: col = col.lightened(0.25)
			draw_circle(c[k], 32.0, col, true, -1.0, true)
			draw_circle(c[k], 31.0, Color(1, 1, 1, 0.7), false, 2.0, true)
			var label := "A" if k == "use" else "Jump"
			var fs := 22 if k == "use" else 13
			var sz := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
			draw_string(font, c[k] + Vector2(-sz.x / 2, sz.y * 0.32), label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.WHITE)
