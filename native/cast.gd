class_name Cast
extends Node3D
# The people and the gameplay around them (web/world/main.js): Ash (the
# player's model, CastActor "ash"), the townspeople living their days (life.gd
# on the game clock, clock.gd), talking (A / "use": the player and the person
# stop and turn to face each other; the lines come from Quests.talk), signs and
# other things to read (town.use, baked to cast.json), the
# jump, the area banners, the hop down Route 1's ledges, and Prof. Oak's walk
# back to his lab (no longer started by the tall grass: Route 1 is open).
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
var conditions: Conditions   # Ash's conditions (conditions.gd): wet, fatigued
var body: AshBody            # his body: wading, wetness, stamina (body.gd)
var cond_ui: ConditionsUI    # their badges and the stamina bar (conditions_ui.gd)
var hunger: Hunger           # how full he is (hunger.gd)
var meal: Meal               # eating: the menu, the walk to a seat, the meal itself (meal.gd)
var bike: AshBike            # his bicycle (bike/bike.gd)
var convo: Conversation      # the conversation mode (conversation.gd)
var wild: Wild               # wild Pokémon in the tall grass, and the tutorial (wild/wild.gd)
var companions: AshCompanions   # his own Pokémon out walking with him (wild/ash_companions.gd)
var party_menu: PartyMenu       # the POKéMON menu: send one out, call it back (wild/party_menu.gd)
var _held := false              # an ambush's battle has the world waiting (Battle.world_paused)
# crouching (B on a pad, Ctrl on a keyboard, the touch CROUCH button: a toggle):
# slow (main.gd crouch_speed), quiet steps (sfx_world.gd), the camera lower; not on the bike
var crouching := false
var _last_frame := -1
var uses: Array = []
var road: Array = []
var tall: Array = []
var lab_door := Vector2.ZERO
var doors: Array = []    # the town's doors into interiors (res://interiors/doors.json): {id, name, house, refuse, at, r, exit, spawn}
var script_phase := -1   # Oak's scene: -1 none, 0 runs to you, 1 talking, 2 walking to the lab
var walk_path: Array = []
var vy := 0.0
var ground := true
var face := NAN
var area := "town"
var ready_t := 0.0
var _air_y := 0.0
var _on_ledge := false
var _rng := RandomNumberGenerator.new()
# touch buttons (A, Jump)
var btn_ui: Control
var _btn_a := false
var _btn_jump := false
var _btn_bell := false
var _btn_crouch := false
var _touch_btn := {}     # touch index -> "use" | "jump" | "bell"

func setup(g: Node3D) -> void:
	game = g
	_rng.randomize()
	_actions()
	_test_init()
	var d := CastActor.data()
	player = CastActor.make("ash")
	add_child(player)
	# the ground under him (sitting, and his cloth): the world's, or the interior's when inside
	player.ground = func(x: float, z: float) -> float: return game.world.ash_ground(x, z)
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
	_route_npcs(d)   # Route 1's people (web route1.js: the tea keeper, the POKé MART clerk)
	uses = d.use
	_load_doors()
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
	# before the town: its talk (Quests) asks the conditions what people notice
	conditions = Conditions.new()
	add_child(conditions)
	conditions.setup(clock)
	body = AshBody.new()
	add_child(body)
	body.setup(game, self, player, conditions)
	hunger = Hunger.new()
	add_child(hunger)
	hunger.setup(conditions, body)
	cond_ui = ConditionsUI.new()
	cond_ui.conditions = conditions
	cond_ui.body = body
	add_child(cond_ui)
	bike = AshBike.new()
	add_child(bike)
	bike.setup(game, self)
	life = TownLife.new()
	add_child(life)
	life.interiors = self   # (has_room / enter / exit: the townspeople inside the interior you are in)
	life.setup(game, self, clock)
	# talking: the conversation mode (conversation.gd), its panel over the text box's layer
	convo = Conversation.new()
	convo.name = "Conversation"
	add_child(convo)
	convo.setup(life.quests, clock)
	convo.attach(game, self, layer)
	# eating: the menus and the meals (meal.gd, food_menu.gd)
	meal = Meal.new()
	meal.name = "Meal"
	add_child(meal)
	meal.setup(game, self, self)
	# wild Pokémon: hiding in the tall grass, the hunt, and its tutorial (wild/wild.gd)
	wild = Wild.new()
	wild.name = "Wild"
	add_child(wild)
	wild.setup(game, self, layer)
	# his Pokémon out with him, and the POKéMON menu (wild/ash_companions.gd, wild/party_menu.gd)
	companions = AshCompanions.new()
	add_child(companions)
	companions.setup(game, self)
	party_menu = PartyMenu.new()
	party_menu.cast = self
	party_menu.game = game
	layer.add_child(party_menu)

# the actions worker settings define in project.godot; added here only when missing
func _actions() -> void:
	var keys := {"use": [KEY_E, KEY_ENTER, KEY_X], "jump": [KEY_SPACE], "run": [KEY_SHIFT], "back": [KEY_ESCAPE, KEY_Z, KEY_BACKSPACE], "bike_bell": [KEY_B], "crouch": [KEY_CTRL]}
	var pads := {"use": JOY_BUTTON_A, "jump": JOY_BUTTON_X, "back": JOY_BUTTON_B, "crouch": JOY_BUTTON_B}   # (settings.gd: B follows the face-button layout)
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
	return dialog.open or script_phase >= 0 or bool(game.get("trans_busy")) or (convo != null and convo.busy()) or (meal != null and meal.busy()) or (wild != null and wild.busy()) or (companions != null and companions.busy()) or Battle.active

# someone is being talked to (the text box or a conversation): people stand still
func talking() -> bool:
	return dialog.open or (convo != null and convo.active)

# ---------- the doors (res://interiors/doors.json, tools/native/bake_interior.mjs) ----------
# Every interior baked with a door on its blueprint's place: pressing A there
# goes in (main.gd enter_space). The outdoor stubs at that door (the shut
# door's 'Door' or 'Look') give way to it.
func _load_doors() -> void:
	var path := "res://interiors/doors.json"
	if not FileAccess.file_exists(path): return
	var j = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not j is Dictionary: return
	for dd in j.get("doors", []):
		if not FileAccess.file_exists("res://interiors/%s.json" % dd.id): continue
		var at := Vector2(dd.at[0], dd.at[1])
		uses = uses.filter(func(u): return not (String(u.label) in ["Door", "Look"] and Vector2(float(u.x), float(u.z)).distance_to(at) < 1.6))
		uses.append({"x": at.x, "z": at.y, "r": float(dd.r), "label": "Door", "lines": [], "door": dd})
		doors.append(dd)

func door_of(id: String) -> Dictionary:
	for dd in doors:
		if String(dd.id) == id: return dd
	return {}

# A at a door: the lab's (cast.json labDoor) or one of doors.json's
func _is_door(n: Dictionary) -> bool:
	if indoors or not n.has("u") or String(n.u.label) != "Door": return false
	return n.u.has("door") or Vector2(n.u.x, n.u.z).distance_to(lab_door) < 1.5

# ---------- inside a building (main.gd enter_space / leave_space) ----------
# The villagers outside are hidden and left alone; the interior's own people
# (its blueprint's actors) and things to look at take their place, and the
# townspeople whose schedule has them in this house (its blueprint's
# residents: life.gd's interiors hook, has_room / enter / exit) stand at their
# spots for what they are doing (cooking at the stove, behind the counter).
var indoors := false
var _out := {}           # the outdoor npcs and uses while inside
var _space: Interior = null
func enter_space(it) -> void:
	indoors = true
	body.clear_fx()
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
	_space = it
	for p in life.people:
		if p.state == "inside" and String(p.inside) == _house(): _resident_in(p)
	dialog.banner(String(it.data.meta.name), "Route 1" if String(it.data.id) == "tea_house" else "Pallet Town")

# the town house this interior is (its blueprint's residents.house), or ""
func _house() -> String:
	if _space == null: return ""
	var r = _space.data.meta.get("residents")
	return String(r.get("house", "")) if r is Dictionary else ""

# life.gd's interiors hook: a house has a room when an interior is baked for it
func has_room(h: String) -> bool:
	for dd in doors:
		if String(dd.house) == h: return true
	return false

func enter(p: Dictionary, h: String) -> void:
	if indoors and h == _house(): _resident_in(p)

func exit(p: Dictionary, h: String) -> void:
	if indoors and h == _house(): _resident_out(p)

# a townsperson in the interior you are in: an actor at the spot for what they
# are doing (residents.people.<id>.<activity>, else '_', else residents.default;
# activities in residents.hide, sleep, are upstairs, out of sight). Talking to
# them is the person's own conversation (a stand-in dict for the talk, so the
# life sim's record of them stays inside)
func _resident_in(p: Dictionary) -> void:
	_resident_out(p)
	var R = _space.data.meta.get("residents")
	if not R is Dictionary: return
	if String(p.act) in R.get("hide", []): return
	var mine: Dictionary = R.get("people", {}).get(String(p.id), {})
	var at = mine.get(String(p.act), mine.get("_", R.get("default", null)))
	if at == null: return
	var y: float = _space.data.height_at_level(float(at[0]), float(at[1]), 0)
	var a := CastActor.make(String(p.look))
	add_child(a)
	var yw := deg_to_rad(float(at[2])) if at.size() > 2 else 0.0
	var e := {"actor": a, "name": p.name, "home": Vector2(at[0], at[1]), "pos": Vector3(at[0], y, at[1]), "yaw": yw, "rot0": yw,
		"target": null, "wait": 1e9, "wander": 0.0, "lines": [], "speed": 0.0, "face": NAN, "hidden": false,
		"level": 0, "ylock": y, "person": p, "act": String(p.act)}
	npcs.append(e)
	_space.data.colliders[0].append([0, float(at[0]), float(at[1]), 0.32])

func _resident_out(p: Dictionary) -> void:
	for n in npcs.duplicate():
		if n.get("person") == p:
			# (in the middle of a talk with them: they go when it ends)
			if convo.active and convo.partner.get("d", {}).get("indoor_of") == p:
				n.leave = true; continue
			n.actor.queue_free()
			npcs.erase(n)
			var cs: Array = _space.data.colliders[0]
			for c in cs.duplicate():
				if c[0] == 0 and is_equal_approx(float(c[1]), n.pos.x) and is_equal_approx(float(c[2]), n.pos.z): cs.erase(c)

# the stand-in a conversation with someone indoors talks to: the person's
# record (their id, schedule, words) with the indoor actor and position
func _talk_proxy(n: Dictionary) -> Dictionary:
	var p: Dictionary = n.person
	var q := p.duplicate()
	q.indoor_of = p
	q.actor = n.actor
	q.pos = n.pos
	q.yaw = n.yaw
	q.state = "inside"
	return q

# indoors, now and then: residents follow what their day has them doing (a new
# activity moves them to its spot; out of the house, they go)
var _res_t := 0.0
func _residents_tick(dt: float) -> void:
	_res_t += dt
	if _res_t < 1.0 or _space == null or talking(): return
	_res_t = 0.0
	var h := _house()
	for n in npcs.duplicate():
		if not n.has("person"): continue
		var p: Dictionary = n.person
		if n.get("leave", false) or p.state != "inside" or String(p.inside) != h: _resident_out(p)
		elif String(p.act) != String(n.act): _resident_in(p)
	if h != "":
		for p in life.people:
			if p.state == "inside" and String(p.inside) == h and not npcs.any(func(n): return n.get("person") == p): _resident_in(p)

# put the player on the ground at once (after a door: no fall from the old height)
func land(y: float) -> void:
	_air_y = y; vy = 0.0; ground = true

func leave_space() -> void:
	body.clear_fx()
	_space = null
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
	if a == "bike_bell" and _btn_bell: p = true
	if a == "crouch" and _btn_crouch: p = true
	return p

# crouch on / off (B, Ctrl, the touch button): not on the bike, nor indoors
func set_crouch(on: bool) -> void:
	if on and (bike == null or bike.riding() or indoors): on = false
	if on == crouching: return
	crouching = on
	Sfx.play("cloth_rustle", null, {"vol": -14.0 if on else -17.0, "pitch": 1.1 if on else 1.0})
	if btn_ui: btn_ui.queue_redraw()

# a pad's X / Y (the jump action's buttons) is down: on the bike they ring the bell
static func _pad_xy() -> bool:
	for d in Input.get_connected_joypads():
		if Input.is_joy_button_pressed(d, JOY_BUTTON_X) or Input.is_joy_button_pressed(d, JOY_BUTTON_Y): return true
	return false

# a pad's west face button (Y on a Nintendo pad): on the bike, the wheelie
static func _pad_west() -> bool:
	for d in Input.get_connected_joypads():
		if Input.is_joy_button_pressed(d, JOY_BUTTON_X): return true
	return false

# a pad's R / ZR (the run action's): on the bike, the hop
static func _pad_r() -> bool:
	for d in Input.get_connected_joypads():
		if Input.is_joy_button_pressed(d, JOY_BUTTON_RIGHT_SHOULDER) or Input.get_joy_axis(d, JOY_AXIS_TRIGGER_RIGHT) > 0.5: return true
	return false

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
		best = {"label": "Talk", "pet": c, "at": life.companions.talk_at(c)}; bd = Vector2(c.pos.x - me.x, c.pos.z - me.z).length()
	# his bike, parked
	if bike and not indoors:
		var bp: Dictionary = bike.near_prompt(me)
		if not bp.is_empty() and (best.is_empty() or float(bp.d) < bd * 0.8): best = bp
		elif bike.can_ride() and absf(bike.v) < 0.5 and best.is_empty():
			best = {"label": "Get off", "at": me + Vector3(0, 2.1, 0)}
	return best

# the text box's typing blips for whoever speaks (dialog.gd voice): the
# townspeople by age (and the women's voices higher), Oak low, the Pokémon
# a little chirp, signs and things a plain tick
const HIGH_VOICES := ["delia", "rose", "ada", "marina", "mae"]
func _voice(n: Dictionary) -> void:
	var v := "text"
	var pitch := 1.0
	if n.has("person"):
		var pp: Dictionary = n.person
		match String(pp.age):
			"kid": v = "kid"; pitch = 1.08 if String(pp.id) == "lily" else 0.95
			"elder": v = "low" if not HIGH_VOICES.has(String(pp.id)) else "high"; pitch = 0.9
			_: v = "high" if HIGH_VOICES.has(String(pp.id)) or String(pp.data.get("voice", "")) == "high" else "mid"
	elif n.has("pet"): v = "critter"
	elif n.has("npc"): v = "low"
	dialog.voice = v
	dialog.voice_pitch = pitch

# ---------- the frame ----------
func update(dt: float) -> void:
	ready_t += dt
	if _test != "": _test_step(dt)
	var use := _pressed("use")
	var jmp := _pressed("jump")
	var back := _pressed("back")
	var bell := _pressed("bike_bell")
	var rjust := Input.is_action_just_pressed("run")
	# (the first frame after a pause, a menu closed with B: that press is not a crouch)
	var fresh := Engine.get_process_frames() - _last_frame <= 2
	_last_frame = Engine.get_process_frames()
	var crj := _pressed("crouch") and fresh
	_btn_a = false; _btn_jump = false; _btn_bell = false; _btn_crouch = false
	if convo.active:
		# the conversation has the controls: A / Jump next (or pick), B the goodbye, up / down choose
		if back: convo.back()
		elif use or jmp: convo.press()
		if Input.is_action_just_pressed("move_up") or Input.is_action_just_pressed("ui_up"): convo.ui.move(-1)
		if Input.is_action_just_pressed("move_down") or Input.is_action_just_pressed("ui_down"): convo.ui.move(1)
		use = false; jmp = false
	elif dialog.open:
		if use or jmp or back: dialog.next()
		use = false; jmp = false
	elif Battle.active: pass   # (a battle has the controls: battle/battle.gd)
	elif wild.busy():
		# an ambush's standoff: A the POKéMON menu, Jump / B / Run the run; else the tutorial's
		if wild.ambush and wild.ambush.busy(): wild.ambush.input(use, jmp or back or rjust)
		else: wild.input(use or jmp, back)
		use = false; jmp = false
	elif script_phase < 0 and not convo.busy() and not meal.busy():
		# crouch: B / Ctrl toggles it; a jump or a run stands him up
		if crj and not bike.riding(): set_crouch(not crouching)
		if crouching and (jmp or (run_held() and absf(game.speed) > 1.0) or bike.riding()): set_crouch(false)
		# A near a wild Pokémon: the pounce (wild.gd), before anything else in reach
		if use and wild.use_pressed(): use = false
		if use and BattleArena.I and BattleArena.I.use_pressed(): use = false   # (the referee: the staging menu)
		if bike.riding():
			# on the bike: the jump hops (a pad's north face button rings the bell, its west
			# one is the wheelie, held (bike.gd), its R hops)
			if jmp and _pad_west(): pass
			elif jmp and _pad_xy(): bell = true
			elif jmp or (rjust and _pad_r()): bike.hop()
			if bell: bike.ring()
		elif jmp and ground:
			vy = 5.2 * sqrt(conditions.mult("jump")); ground = false   # (jump: a little higher well fed; the height goes as vy squared)
		if use:
			var n := nearby()
			if bike.riding():
				# A on the bike: a door parks it outside; someone or something to talk to
				# or read, stopped: that; else off (braking to a stop first)
				var talk_ok: bool = absf(bike.v) < 1.0 and (n.has("person") or n.has("pet") or n.has("npc") or (n.has("u") and String(n.u.label) != "Door"))
				if _is_door(n):
					bike.park_now()
				elif not talk_ok:
					bike.request_dismount()
					n = {}
			elif n.has("bike"):
				bike.start_mount()
				n = {}
			# a door opens: inside you go (main.gd enter_space)
			if _is_door(n):
				# dripping wet: the one at the door won't have him in (conditions.json entry)
				var dd: Dictionary = n.u.get("door", {})
				var no := conditions.entry_refusal(String(dd.get("refuse", "oak_lab")))
				if no.is_empty():
					if dd.is_empty(): game.enter_space("oak_lab", "from_town")
					else: game.enter_space(String(dd.id), String(dd.spawn))
				else:
					game.speed = 0.0
					face = atan2(n.at.x - game.pos.x, n.at.z - game.pos.z)
					dialog.voice = String(no.voice); dialog.voice_pitch = 1.0
					Sfx.play("door_knock", null, {"vol": -6.0})
					dialog.say(no.lines)
				n = {}
			if not n.is_empty():
				var me: Vector3 = game.pos
				game.speed = 0.0
				_voice(n)
				# people and Pokémon: the conversation mode
				if n.has("person"):
					convo.begin_person(n.person, life)
				elif n.has("pet"):
					convo.begin_pet(n.pet, life.companions)
				elif n.has("npc") and n.npc.has("person"):
					# someone indoors: their own conversation
					var c2: Dictionary = n.npc
					c2.face = atan2(me.x - c2.pos.x, me.z - c2.pos.z)
					convo.begin_person(_talk_proxy(c2), life)
				elif n.has("npc"):
					var c: Dictionary = n.npc
					c.target = null; c.wait = 3.0; c.speed = 0.0
					c.face = atan2(me.x - c.pos.x, me.z - c.pos.z)
					convo.begin_npc(c)
				elif n.has("u") and String(n.u.get("food_place", "")) != "" and FoodData.has_place(String(n.u.food_place)):
					# a place to eat (an interior's "Eat" seat or "Order" counter): the menu
					face = atan2(n.at.x - me.x, n.at.z - me.z)
					meal.begin(String(n.u.food_place), n.u)
				else:
					# signs and things to read: the plain text box
					face = atan2(n.at.x - me.x, n.at.z - me.z)
					var sw = game.get("sfx_world")
					if sw and n.has("u"): sw.on_use(n.u)
					dialog.say(n.lines)
	# turn smoothly to face whatever you're reading
	if dialog.open and not is_nan(face):
		game.yaw += wrapf(face - game.yaw, -PI, PI) * (1.0 - exp(-dt * 10.0))
	if not dialog.open: face = NAN
	if script_phase >= 0: _oak_scene(dt)
	convo.update(dt)   # placing the two, their faces, the schedule's interruptions
	# "Could I get something to eat?": the menu once the talk is over
	# "Can I use the training arena?": off to the Battle Arena once the talk is over (arena/arena.gd)
	if convo.arena_request and not convo.busy() and not dialog.open:
		convo.arena_request = false
		BattleArena.enter(game)
	if convo.food_request != "" and not convo.busy() and not dialog.open:
		var fr := convo.food_request
		convo.food_request = ""
		meal.begin(fr)
	# gravity (pos.y was set to the ground by main; keep the height while in the air)
	var g: float = game.world.ash_ground(game.pos.x, game.pos.z)   # in the water: the raised bed (world_data.gd)
	vy -= 16.0 * dt
	_air_y += vy * dt
	if _air_y <= g:
		_air_y = g; vy = 0.0; ground = true
	if ground and _air_y - g < 0.3: _air_y = g
	game.pos.y = _air_y
	if bike.places_player():
		bike.place(dt)   # Ash in the bike's frame (its lean), the bike posed
		player.look_yaw = NAN
	else:
		player.position = game.pos
		player.rotation.y = game.yaw
		player.crouch = 1.0 if crouching else 0.0
		# the head turns toward where the camera looks, within a comfortable range
		var rel := wrapf(game.cam_yaw + PI - game.yaw, -PI, PI)
		if not convo.active:   # (in a conversation he looks at whoever he's talking to)
			player.look_yaw = clampf(rel, -1.0, 1.0) if absf(rel) < 2.2 and not dialog.open else 0.0
	# in the air: jumping, or walked off a drop (ground stays set then, but he falls)
	player.animate(dt, absf(game.speed), (not ground or _air_y - g > 0.3) and not bike.riding())
	body.update(dt)
	wild.update(dt)
	if companions: companions.update(dt)
	# an ambush's battle: the world outside waits (the clock, the townspeople, Route 1's people)
	var held := Battle.world_paused()
	if held != _held:
		_held = held
		clock.paused = held
	if not held:
		_villagers(dt)
		life.update(dt)   # the town's day goes on while you're inside, hidden (life.set_hidden)
	if indoors:
		_residents_tick(dt)
		var n3 := nearby() if not dialog.open and not convo.busy() and not meal.busy() else {}
		var cam3: Camera3D = game.cam
		dialog.prompt = {"pos": cam3.unproject_position(n3.at), "label": n3.label} if not n3.is_empty() and not cam3.is_position_behind(n3.at) else {}
		return
	# areas and events
	var me2: Vector3 = game.pos
	var in_grass := false
	for b in tall:
		if me2.x > b[0] and me2.x < b[2] and me2.z > b[1] and me2.z < b[3]: in_grass = true
	var now := "town"
	if me2.z < -66.0: now = "route1"
	if me2.z < -420.0: now = "viridian_gate"
	if now != area:
		var was := area
		area = now
		if now == "route1" and was != "viridian_gate": dialog.banner("Route 1", "Pallet Town - Viridian City")
		elif now == "viridian_gate": dialog.banner("Viridian City ahead", "The road beyond the gate is closed for now")
		elif now == "town": dialog.banner("Pallet Town", "A quiet seaside village")
	# (Prof. Oak no longer stops you at the tall grass: Route 1 is open. His
	# scene is still here for the cast test, --cast-test=oak)
	var _grass := in_grass
	# hopping down a ledge on Route 1: a little jump as you go over its edge
	var fl: int = game.world.flag(me2.x, me2.z)
	if fl != 255 and (fl & 32) and ground and not _on_ledge and not bike.riding():
		vy = 3.2; ground = false
	_on_ledge = fl != 255 and (fl & 32) != 0
	# the prompt over whatever is in reach
	var n2 := nearby() if not dialog.open and script_phase < 0 and not convo.busy() and not meal.busy() and not Battle.active else {}
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
		if talking() or (n == oak and script_phase < 0):
			if talking(): n.speed = 0.0
			if not is_nan(n.face): n.yaw += wrapf(n.face - n.yaw, -PI, PI) * (1.0 - exp(-dt * 8.0))
		else:
			n.face = NAN
		if n != oak and n.wander > 0.0 and not talking():
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
		if n.has("rot0") and not talking() and is_nan(n.face): n.yaw += wrapf(float(n.rot0) - n.yaw, -PI, PI) * (1.0 - exp(-dt * 2.0))
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
			# a cutscene in the conversation mode (conversations.json oak_tall_grass)
			convo.on_done = func(): script_phase = 2
			convo.begin_npc(oak, {"tree": "oak_tall_grass", "cutscene": true, "lines": []})
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
			if absf(t - 0.5) < dt * 0.6 and script_phase < 0: _oak_start()
			game.stick_vec = Vector2.ZERO
			if talking() and fmod(t, 0.6) < dt: _btn_a = true
			game.cam_dist = 6.0
		"convo":
			_convo_test(dt, t)
		"meal":
			_meal_test(dt, t)

# ---------- eating: --cast-test=meal -- --meal=home:pancakes [--meal-hour=7.5] [--meal-full=30]
# [--meal-menu] (open the menu first) [--meal-stand] (no seat: standing) [--meal-terrace] (at Pallet
# House's terrace tables) [--meal-in=ketchum_house|pallet_house|tea_house --meal-seat=i] (inside,
# at its i-th "Eat" seat of the place; --meal-order: from its "Order" counter, the menu first).
# Otherwise a stand-in table and chair (the interiors' "Eat" usable contract) go down in front
# of him unless --meal-terrace or --meal-stand.
var _mt := {}
func _meal_test(_dt: float, t: float) -> void:
	if _mt.is_empty():
		_mt = {"place": "home", "item": "pancakes", "hour": 7.5, "full": 30.0, "menu": false, "stand": false, "terrace": false, "phase": 0, "in": "", "seat": 0, "order": false}
		for a in OS.get_cmdline_user_args():
			if a.begins_with("--meal="):
				var kv := a.substr(7).split(":")
				_mt.place = kv[0]
				if kv.size() > 1: _mt.item = kv[1]
			elif a.begins_with("--meal-hour="): _mt.hour = float(a.substr(12))
			elif a.begins_with("--meal-full="): _mt.full = float(a.substr(12))
			elif a == "--meal-menu": _mt.menu = true
			elif a == "--meal-stand": _mt.stand = true
			elif a == "--meal-terrace": _mt.terrace = true
			elif a.begins_with("--meal-in="): _mt["in"] = a.substr(10)
			elif a.begins_with("--meal-seat="): _mt.seat = int(a.substr(12))
			elif a == "--meal-order": _mt.order = true; _mt.menu = true
		clock.real = false; clock.ff = 1.0
		clock.set_time(float(_mt.hour))
		hunger.set_fullness(float(_mt.full))
	if clock.real: clock.real = false; clock.set_time(float(_mt.hour))
	if int(_mt.phase) == 0 and String(_mt["in"]) != "" and t > 0.2:
		_mt.phase = -1
		game.enter_space(String(_mt["in"]), "", true)
	if int(_mt.phase) == -1 and indoors and t > 0.8:
		# inside: stand a step from the seat (or the counter) and go from there
		var eats := uses.filter(func(x): return String(x.get("food_place", "")) == String(_mt.place) and String(x.get("label", "")) == ("Order" if _mt.order else "Eat"))
		if eats.is_empty():
			print("meal-test: no %s use for %s in %s" % ["Order" if _mt.order else "Eat", _mt.place, _mt["in"]]); _mt.phase = 2; return
		var u2: Dictionary = eats[mini(int(_mt.seat), eats.size() - 1)]
		var yw := float(u2.seat[3]) if u2.has("seat") else 0.0
		var at := Vector3(float(u2.x), 0, float(u2.z)) - Vector3(sin(yw), 0, cos(yw)) * 1.2 + Vector3(cos(yw), 0, -sin(yw)) * 0.6
		game.pos = Vector3(at.x, game.world.height_at(at.x, at.z), at.z)
		game.yaw = atan2(float(u2.x) - at.x, float(u2.z) - at.z)
		_air_y = game.pos.y
		_mt.phase = 1
		print("meal-test: in %s at %s, %s" % [_mt["in"], str(game.pos), u2.get("id", "")])
		if _mt.menu: _meal_test_menu(u2)
		else: meal.begin_now(String(_mt.place), String(_mt.item), u2)
	if int(_mt.phase) == 0 and t > 0.4:
		_mt.phase = 1
		var u := {}
		if _mt.terrace:
			var tb: Array = life.places.get("pallet_house", {}).get("tables", [])[0].table
			game.pos = Vector3(tb[0] + 2.2, 0, tb[1] + 0.5); game.pos.y = game.world.height_at(game.pos.x, game.pos.z)
		elif not _mt.stand:
			var fwd := Vector3(sin(game.yaw), 0, cos(game.yaw))
			var at: Vector3 = game.pos + fwd * 2.2
			at.y = game.world.height_at(at.x, at.z)
			u = Meal.standin(self, at, game.yaw + PI * 0.5, String(_mt.place))
			uses.append(u)
		_air_y = game.pos.y
		if _mt.menu: _meal_test_menu(u)
		else: meal.begin_now(String(_mt.place), String(_mt.item), u)
	# the host's lines go by on their own
	if dialog.open and fmod(t, 1.6) < 0.07: _btn_a = true

# the menu opens (the game pauses), the dish asked for is picked and ordered a moment later
func _meal_test_menu(u: Dictionary) -> void:
	meal.begin(String(_mt.place), u)
	var m: FoodMenu = meal.menu
	for ti in m.M.cats.size():
		for ii in m.M.cats[ti].items.size():
			if String(m.M.cats[ti].items[ii].id) == String(_mt.item):
				m.set_tab(ti); m.select(ii)
	get_tree().create_timer(1.6, true).timeout.connect(func(): if m.is_open: m.order())

# ---------- conversation filmstrips: --cast-test=convo -- --convo-who=delia|oak|ada...
# --convo-hour=7.6 --convo-picks=0,2,1 (choices in order; then the goodbye)
# --convo-tree=<id> (force that tree) --convo-reset (fresh quests / conversations)
# --convo-bike (ride up on the bike). Ash walks up, presses A, lines advance on their own.
var _ct := {}
func _convo_test(dt: float, t: float) -> void:
	if _ct.is_empty():
		_ct = {"who": "delia", "hour": 7.6, "picks": [], "tree": "", "phase": 0, "wait": 0.0, "pi": 0, "bike": false}
		for a in OS.get_cmdline_user_args():
			if a.begins_with("--convo-who="): _ct.who = a.substr(12)
			elif a.begins_with("--convo-hour="): _ct.hour = float(a.substr(13))
			elif a.begins_with("--convo-picks="): _ct.picks = Array(a.substr(14).split(",")).map(func(x): return int(x))
			elif a.begins_with("--convo-tree="): _ct.tree = a.substr(13)
			elif a == "--convo-reset": life.quests.reset(); convo.reset()
			elif a == "--convo-bike": _ct.bike = true
		clock.real = false; clock.ff = 1.0
		clock.set_time(float(_ct.hour))
		if _ct.who == "oak": game.enter_space("oak_lab", "from_town", true)
	var ph: int = _ct.phase
	if clock.real:   # (the real-time clock setting would put the time back)
		clock.real = false; clock.set_time(float(_ct.hour))
	if ph == 0 and t > 0.5:
		# stand a few metres in front of them, facing them
		var target := {}
		if _ct.who == "oak":
			for n in npcs:
				if n.name == "Prof. Oak": target = n
		else:
			var p = life.by_id.get(_ct.who)
			if p and not (p.state in ["inside", "door_in", "door_out"]): target = p
		if target.is_empty(): return
		_ct.target = target
		# a spot a few metres off, in front of them if possible, with a clear walk in
		var ty: float = target.yaw
		var from: Vector3 = target.pos
		var dist := 3.0 if _ct.who == "oak" else 4.0
		for k in 16:
			var ang := ty + (k / 2) * 0.4 * (1 if k % 2 == 0 else -1)
			var c: Vector3 = target.pos + Vector3(sin(ang), 0, cos(ang)) * dist
			var p := c
			var clear := true
			for s in 40:
				var dd := Vector2(target.pos.x - p.x, target.pos.z - p.z)
				if dd.length() < 1.5: break
				var np: Vector3 = game.world.step(p, dd.normalized().x * 0.1, dd.normalized().y * 0.1)
				if Vector2(np.x - p.x, np.z - p.z).length() < 0.07: clear = false; break
				p = np
			if clear and absf(game.world.height_at(c.x, c.z) - target.pos.y) < 1.0:
				from = c; break
		from.y = game.world.height_at(from.x, from.z)
		game.pos = from; _air_y = from.y
		game.yaw = atan2(target.pos.x - from.x, target.pos.z - from.z)
		game.cam_yaw = game.yaw + PI + 0.35; game.cam_pitch = 0.28
		if indoors: game.cam_boom = 3.0
		convo.force_tree = String(_ct.tree)
		_ct.phase = 1; _ct.t0 = t
		print("convo-test: at %s, %s is %s at %s" % [str(game.pos), _ct.who, String(target.get("state", "npc")), str(target.pos)])
	elif ph == 1:
		# walk up to them, then A
		var tg: Dictionary = _ct.target
		var d := Vector2(tg.pos.x - game.pos.x, tg.pos.z - game.pos.z).length()
		# the stick that walks him straight at them (main.gd moves relative to the camera)
		var cy: float = game.cam_yaw
		var f := Vector2(-sin(cy), -cos(cy))
		var r := Vector2(cos(cy), -sin(cy))
		var dir := Vector2(tg.pos.x - game.pos.x, tg.pos.z - game.pos.z).normalized()
		game.stick_vec = Vector2(dir.dot(r), -dir.dot(f)) * 0.55 if d > 1.7 and t - float(_ct.t0) < 3.0 else Vector2.ZERO
		if d <= 1.7 or t - float(_ct.t0) > 3.0:
			game.stick_vec = Vector2.ZERO
			_ct.phase = 2; _ct.t1 = t
	elif ph == 2:
		if t - float(_ct.t1) > 0.4 and not convo.active:
			_ct.phase = 3; _ct.wait = 0.0
			# (A would pick whoever is nearest: Mr. Mime stands by Delia)
			if _ct.who == "oak" or not life.by_id.has(_ct.who): convo.begin_npc(_ct.target)
			else: convo.begin_person(_ct.target, life)
			print("convo-test: A at %.1fs, %s %s, %.2f m" % [t, str(game.pos), str(_ct.target.pos), Vector2(_ct.target.pos.x - game.pos.x, _ct.target.pos.z - game.pos.z).length()])
	elif ph == 3:
		if not convo.active: return
		_ct.wait += dt
		if convo.ui.choosing():
			# the choices up for a moment, the cursor moves to the pick, then A
			var picks: Array = _ct.picks
			var k: int = picks[_ct.pi] if _ct.pi < picks.size() else convo.ui.choices.size() - 1
			k = clampi(k, 0, convo.ui.choices.size() - 1)
			if _ct.wait > 1.2 and convo.ui.sel != k: convo.ui.sel = k
			if _ct.wait > 2.2:
				_ct.pi += 1
				convo.ui.confirm()
				_ct.wait = 0.0
		elif not convo.ui.typing():
			_ct.wait = 0.0
			if _ct.get("done_t", -1.0) < 0.0: _ct.done_t = t
			if t - float(_ct.done_t) > 0.6:
				_btn_a = true; _ct.done_t = -1.0
		else:
			_ct.done_t = -1.0

# ---------- touch buttons: A and Jump ----------
func _input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed:
			var b: String = btn_ui.hit(e.position)
			if b != "":
				_touch_btn[e.index] = b
				if b == "use": _btn_a = true
				elif b == "bell": _btn_bell = true
				elif b == "crouch": _btn_crouch = true
				elif b == "wheelie": pass   # (held: bike.gd reads down["wheelie"])
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
	var down := {"use": false, "jump": false, "bell": false, "crouch": false, "wheelie": false}
	var _bell_on := false
	var shown := false
	func _ready() -> void:
		set_anchors_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_update()
		Input.joy_connection_changed.connect(func(_d, _c): _update())
		get_viewport().size_changed.connect(queue_redraw)
	# on a touch screen, shown while no game controller is connected (it comes back
	# when the controller goes); --touch forces it on (desktop tests)
	func _update() -> void:
		var touch := DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")
		shown = OS.get_cmdline_user_args().has("--touch") or (touch and Input.get_connected_joypads().is_empty())
		if get_viewport().has_meta("tv"): shown = false   # (the game on a TV: touches stay on the phone, screens.gd)
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
		var c := {"use": Vector2(s.x - 66, s.y - 138), "jump": Vector2(s.x - 150, s.y - 70)}
		# on the bike: a small bell button beside the two
		# and the wheelie (held) above Jump; on foot, outside: the crouch toggle instead
		if cast and cast.bike and cast.bike.riding():
			c["bell"] = Vector2(s.x - 214, s.y - 58)
			c["wheelie"] = Vector2(s.x - 160, s.y - 158)
		elif cast and not cast.indoors: c["crouch"] = Vector2(s.x - 222, s.y - 56)
		return c
	func hit(p: Vector2) -> String:
		if not shown: return ""
		var c := centres()
		for k in c:
			if p.distance_to(c[k]) < (34.0 if k in ["bell", "crouch", "wheelie"] else 42.0): return k
		return ""
	var _tv := false
	func _process(_dt: float) -> void:
		if get_viewport().has_meta("tv") != _tv:
			_tv = not _tv
			_update()
		var on: bool = cast != null and cast.bike != null and cast.bike.riding()
		if on != _bell_on:
			_bell_on = on
			queue_redraw()
	func _draw() -> void:
		# the design system's touch buttons (ui/ui_theme.gd): A is a Poké Ball
		# (red over white, the ink band, "A" on its button); Jump a dark plate
		# disc with a double chevron; the bell a yellow disc
		var c := centres()
		for k in c:
			var bc: Vector2 = c[k]
			var on: bool = down[k]
			var r := (38.0 if k == "use" else (31.0 if k == "jump" else (27.0 if k == "crouch" else (26.0 if k == "wheelie" else 24.0)))) * (0.92 if on else 1.0)
			draw_circle(bc + Vector2(0, 3), r + 1.0, Color(0, 0, 0, 0.28), true, -1.0, true)
			if on: UITheme.glow(self, bc, r + 4.0, UITheme.YELLOW)
			if k == "use":
				var g := asin(4.0 / r)
				var top := PackedVector2Array()
				var bot := PackedVector2Array()
				for i in 21:
					var t := PI + g + (PI - 2.0 * g) * i / 20.0
					top.append(bc + Vector2(cos(t), sin(t)) * r)
					var t2 := g + (PI - 2.0 * g) * i / 20.0
					bot.append(bc + Vector2(cos(t2), sin(t2)) * r)
				draw_circle(bc, r, Color(UITheme.INK, 0.8), true, -1.0, true)
				draw_colored_polygon(top, Color(UITheme.RED, 0.9 if not on else 1.0))
				draw_colored_polygon(bot, Color(UITheme.WHITE, 0.82 if not on else 0.95))
				draw_arc(bc, r, 0.0, TAU, 40, Color(UITheme.INK, 0.85), 2.5, true)
				draw_circle(bc, 14.0, Color(UITheme.INK, 0.9), true, -1.0, true)
				draw_circle(bc, 11.5, Color(UITheme.WHITE, 1.0), true, -1.0, true)
				UITheme.text_mid(self, bc + Vector2(0, -0.5), "A", "label", 17, UITheme.INK, 1)
			elif k == "jump":
				draw_circle(bc, r, Color(UITheme.PLATE, 0.62 if not on else 0.85), true, -1.0, true)
				draw_arc(bc, r - 1.0, 0.0, TAU, 36, Color(1, 1, 1, 0.6 if not on else 0.95), 2.0, true)
				UITheme.icon(self, "jump", bc + Vector2(0, -5), 11.0, Color.WHITE)
				UITheme.text_mid(self, bc + Vector2(0, 13), "HOP" if _bell_on else "JUMP", "label", 12, Color(1, 1, 1, 0.9), 1)
			elif k == "crouch":
				# a dark disc; crouched, a yellow ring and the chevron points back up (STAND)
				var cr: bool = cast.crouching
				draw_circle(bc, r, Color(UITheme.PLATE, 0.62 if not on else 0.85), true, -1.0, true)
				draw_arc(bc, r - 1.0, 0.0, TAU, 36, Color(UITheme.YELLOW, 0.95) if cr else Color(1, 1, 1, 0.6 if not on else 0.95), 3.0 if cr else 2.0, true)
				if cr: UITheme.chevron_up(self, bc + Vector2(0, -6), 14.0, Color.WHITE)
				else: UITheme.chevron_down(self, bc + Vector2(0, -6), 14.0, Color.WHITE)
				UITheme.text_mid(self, bc + Vector2(0, 11), "STAND" if cr else "CROUCH", "label", 10, Color(1, 1, 1, 0.9), 1)
			elif k == "wheelie":
				# a plate disc: a wheel with the front lifted, "WHEELIE" under it
				draw_circle(bc, r, Color(UITheme.PLATE, 0.62 if not on else 0.85), true, -1.0, true)
				draw_arc(bc, r - 1.0, 0.0, TAU, 32, Color(1, 1, 1, 0.6 if not on else 0.95), 2.0, true)
				draw_arc(bc + Vector2(-7, 0), 5.5, 0.0, TAU, 18, Color.WHITE, 2.0, true)
				draw_arc(bc + Vector2(5, -8), 5.5, 0.0, TAU, 18, Color.WHITE, 2.0, true)
				draw_line(bc + Vector2(-7, 0), bc + Vector2(5, -8), Color.WHITE, 2.0, true)
				UITheme.text_mid(self, bc + Vector2(0, 12), "WHEELIE", "label", 9, Color(1, 1, 1, 0.9), 1)
			else:
				draw_circle(bc, r, Color(UITheme.YELLOW, 0.85 if not on else 1.0), true, -1.0, true)
				draw_arc(bc, r - 1.0, 0.0, TAU, 32, Color(UITheme.INK, 0.6), 2.0, true)
				UITheme.icon(self, "bell", bc, 10.0, UITheme.INK)

# Route 1's people (cast.json route1.npcs, from web/world/route1.js): they keep
# their spot (wander 0) and turn back to it after a talk; ylock = a floor
func _route_npcs(d: Dictionary) -> void:
	var r1 = d.get("route1")
	if r1 == null: return
	for n in r1.get("npcs", []):
		var a := CastActor.make(String(n.look))
		add_child(a)
		var x: float = n.x
		var z: float = n.z
		var e := {"actor": a, "name": n.name, "home": Vector2(x, z), "pos": Vector3(x, game.world.height_at(x, z), z),
			"yaw": float(n.yaw), "rot0": float(n.yaw), "target": null, "wait": 1.0, "wander": 0.0,
			"lines": n.lines, "speed": 0.0, "face": NAN, "hidden": false}
		if n.has("ylock"): e.ylock = float(n.ylock)
		npcs.append(e)
