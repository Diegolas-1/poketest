class_name Meal
extends Node
# Eating: the menu (food_menu.gd) at a place (life/food.json: home, the inn, the
# tea house), then the meal itself. Made by cast.gd.
#
#   1. begin(place, use, host) opens the menu (the hour picks breakfast, lunch or
#      supper; Ash's fullness and what each dish would make it).
#   2. Ordered: what the host says (Mom, Hana), the price on Ash's tab there.
#   3. A seat: the one he used (an interior's usable {label "Eat", food_place,
#      seat [x, y, z, yaw], seat_h, table_top [x, y, z]}), else the nearest free
#      one of that place (its usables, or the inn's terrace tables outdoors,
#      places.json pallet_house.tables), else he eats standing where he is.
#   4. He walks to the chair, sits (the idles' seat solver, the seat lifted to the
#      chair's height), the dish is set on the table, and he eats: a fork, a
#      spoon, chopsticks or his fingers bring bites up from the plate (a morsel of
#      it on the tip), a cup goes up for sips; a munch and a chew each bite, the
#      food going bite by bite (Dish.set_eaten) and his tummy filling (hunger.gd).
#      Then a satisfied lean back and a pat of the tummy, and he gets up. The
#      dish's extra (sugar rush, warming, refreshing) at the end, and the host's
#      line ("Clean plate!").
#   Standing: the plate in his left hand, the same bites.
#
#   busy()   phase   (render checks: begin_now(place, item_id, use))

const T := preload("res://tunables.gd")
const STAND_BACK := 0.4         # his feet this far in front of the chair's seat (m)
const SEAT_H := 0.45            # a chair's seat when its usable doesn't say
const TABLE_H := 0.74           # a table's top over the floor when it doesn't say
const TERRACE_TABLE_H := 0.8    # Pallet House's terrace tables (outdoors: places.json has no heights)

var game: Node3D
var cast: Node
var menu: FoodMenu
var phase := ""                 # "" | menu | talk | walk | eat | done
var place := ""
var item_id := ""
var item := {}
var use := {}
var host := {}                  # the life.gd person who serves (or {})
var seat := {}                  # {pos: Vector3 (the seat's middle), yaw, h, table: Vector3, stand: Vector3}
var dish: Dish
var utensil: Node3D
var morsel: MeshInstance3D
var _ground_was: Callable
var _t := 0.0
var _bites := 4
var _bite := 0
var _events: Array = []
var _ev_i := 0
var _carry := false
var _kcal_left := 0.0
var _cam := {}
var _end_t := 0.0
var _walk_t := 0.0
var _pending_lines: Array = []

func setup(g: Node3D, c: Node, layer_parent: Node) -> void:
	game = g; cast = c
	menu = FoodMenu.new()
	layer_parent.add_child(menu)
	menu.ordered.connect(_on_ordered)
	menu.closed.connect(func(): if phase == "menu": phase = "")

func busy() -> bool:
	return phase != "" and phase != "menu"

# ---------- 1. the menu ----------
func begin(pid: String, u: Dictionary = {}, who: Dictionary = {}) -> void:
	if not FoodData.has_place(pid) or busy(): return
	place = pid; use = u; host = who
	phase = "menu"
	game.speed = 0.0
	menu.open(pid, _hour(), Hunger.I.fullness if Hunger.I else 50.0)

func _hour() -> float:
	var clk = cast.get("clock")
	return fmod(float(clk.minutes) / 60.0, 24.0) if clk != null else 12.0

# ---------- 2. ordered ----------
func _on_ordered(pid: String, id: String, price: int) -> void:
	item_id = id
	item = FoodData.item(id)
	if String(FoodData.place(pid).get("pay", "free")) == "tab": FoodData.charge(pid, price)
	var meal := FoodData.meal_at(_hour())
	var lines := FoodData.line(pid, "order", meal, String(item.get("name", "")))
	_say(lines)
	phase = "talk"

func _say(lines: Array) -> void:
	if lines.is_empty() or cast.dialog == null: return
	var P := FoodData.place(place)
	var spk := String(P.get("host", ""))
	var out := []
	for i in lines.size(): out.append((spk + ": " if i == 0 and spk != "" else "") + String(lines[i]))
	cast.dialog.voice = String(P.get("voice", "mid"))
	cast.dialog.voice_pitch = 1.0
	cast.dialog.say(out)

# (render checks) straight to eating an item, no menu
func begin_now(pid: String, id: String, u: Dictionary = {}) -> void:
	place = pid; use = u; host = {}
	item_id = id; item = FoodData.item(id)
	phase = "talk"

# ---------- 3. a seat ----------
func _find_seat() -> Dictionary:
	var me: Vector3 = game.pos
	var best := {}
	var bd := 1e9
	var cands := []
	if use.has("seat"): cands.append(use)
	for u in cast.uses:
		if u is Dictionary and u.has("seat") and String(u.get("food_place", "")) == place and u != use: cands.append(u)
	for u in cands:
		var s := _seat_of(u)
		if s.is_empty(): continue
		var d := Vector2(s.stand.x - me.x, s.stand.z - me.z).length()
		if u == use: d = -1.0
		if d < bd: bd = d; best = s
	# outdoors at the inn: the terrace's tables (places.json)
	if best.is_empty() and place == "inn" and not cast.indoors:
		var ph: Dictionary = cast.life.places.get("pallet_house", {}) if cast.life != null else {}
		for tb in ph.get("tables", []):
			for ch in tb.get("chairs", []):
				var gy: float = game.world.height_at(float(ch[0]), float(ch[1]))
				var tt: Array = tb.table
				# the plate on his side of the table (its parasol's pole is in the middle)
				var tc := Vector2(float(tt[0]), float(tt[1]))
				var pp := tc + (Vector2(float(ch[0]), float(ch[1])) - tc).normalized() * 0.24
				var s2 := _seat_of({"seat": [float(ch[0]), gy + SEAT_H, float(ch[1]), float(ch[2])], "seat_h": SEAT_H,
					"table_top": [pp.x, game.world.height_at(tc.x, tc.y) + TERRACE_TABLE_H, pp.y]})
				var d2 := Vector2(s2.stand.x - me.x, s2.stand.z - me.z).length()
				if d2 < bd: bd = d2; best = s2
	if bd > 14.0: return {}
	return best

# {pos, yaw, h, table, stand} from a usable's seat fields (tolerant of missing ones)
func _seat_of(u: Dictionary) -> Dictionary:
	var s = u.get("seat")
	if not s is Array or s.size() < 3: return {}
	var yaw := float(s[3]) if s.size() > 3 else 0.0
	var h := float(u.get("seat_h", SEAT_H))
	var p := Vector3(float(s[0]), float(s[1]), float(s[2]))
	var fwd := Vector3(sin(yaw), 0, cos(yaw))
	var floor_y := p.y - h
	var tb := p + fwd * 0.55 + Vector3(0, TABLE_H - h, 0)
	var tt = u.get("table_top")
	if tt is Array and tt.size() >= 3: tb = Vector3(float(tt[0]), float(tt[1]), float(tt[2]))
	var stand := Vector3(p.x, floor_y, p.z) + fwd * STAND_BACK
	return {"pos": p, "yaw": yaw, "h": h, "table": tb, "stand": stand, "floor": floor_y}

# ---------- 4. the meal ----------
func _process(dt: float) -> void:
	if phase == "" or phase == "menu": return
	_t += dt
	match phase:
		"talk":
			if not cast.dialog.open: _start_meal()
		"walk": _walk(dt)
		"eat": _eat(dt)
		"done":
			if not cast.dialog.open:
				_cleanup()
				phase = ""

func _start_meal() -> void:
	seat = _find_seat()
	_bites = clampi(roundi(float(item.get("minutes", 10)) / 10.0 * T.num("hunger", "eat_bites_per_10", T.dict("hunger", "eat", {}).get("bites_per_10", 2.0))),
		int(T.dict("hunger", "eat", {}).get("bites_min", 3)), int(T.dict("hunger", "eat", {}).get("bites_max", 7)))
	_kcal_left = float(item.get("kcal", 0))
	_bite = 0
	_walk_t = 0.0
	if Hunger.I: Hunger.I.paused = true
	phase = "walk" if not seat.is_empty() else "eat"
	if phase == "eat": _sit_down()

func _walk(dt: float) -> void:
	_walk_t += dt
	var to: Vector3 = seat.stand
	var d := Vector2(to.x - game.pos.x, to.z - game.pos.z)
	if d.length() > 0.06 and _walk_t < 6.0:
		var sp := minf(2.4, d.length() * 4.0)
		var step := d.normalized() * minf(d.length(), sp * dt)
		game.pos.x += step.x; game.pos.z += step.y
		game.yaw += wrapf(atan2(d.x, d.y) - game.yaw, -PI, PI) * (1.0 - exp(-dt * 10.0))
		game.speed = sp
		return
	# there: turn to the table, then sit
	game.speed = 0.0
	game.pos.x = to.x; game.pos.z = to.z
	var face: float = float(seat.yaw)
	game.yaw += wrapf(face - game.yaw, -PI, PI) * (1.0 - exp(-dt * 12.0))
	if absf(wrapf(face - game.yaw, -PI, PI)) < 0.05:
		game.yaw = face
		phase = "eat"
		_sit_down()

func _sit_down() -> void:
	var A: CastActor = cast.player
	var seated := not seat.is_empty()
	# the dish: on the table in front of him, or in his left hand
	dish = Dishes.build(String(item.get("model", item_id)))
	game.add_child(dish)
	if seated:
		dish.global_position = seat.table
		dish.rotation.y = float(seat.yaw) + PI   # its front (+z) toward him
		# the chair's seat under his hips (the seat solver sits on the ground)
		_ground_was = A.ground
		var sp: Vector3 = seat.pos
		var gw := _ground_was
		A.ground = func(x: float, z: float) -> float:
			if Vector2(x - sp.x, z - sp.z).length() < 0.3: return sp.y
			return float(gw.call(x, z)) if gw.is_valid() else sp.y - SEAT_H
	else:
		dish.scale = Vector3.ONE * (0.8 if dish.held == null else 1.0)
	# the utensil in his right hand (cups and fingers need none)
	var ut := String(item.get("utensil", dish.utensil))
	if ut in ["fork", "spoon", "chopsticks"]:
		utensil = Dishes.utensil_mesh(ut)
		game.add_child(utensil)
		for mi in utensil.find_children("*", "MeshInstance3D", true, false): Ink.outline_mesh(mi)   # (it reads against his jacket)
		for n in [dish.get_node_or_null("fork"), dish.get_node_or_null("spoon"), dish.get_node_or_null("chopsticks")]:
			if n and String(n.name) == ut: n.visible = false
	if ut != "cup":
		morsel = FoodKit.node(FoodKit.blob(0.011, Vector3(1.0, 0.7, 1.0), 0.25, dish.morsel, 3, 10, 6), FoodKit.mat(Color.WHITE, {"gloss": 0.5}))
		morsel.visible = false
		game.add_child(morsel)
	var def := build_action(ut, _bites, _plate_local(), seated, float(seat.get("h", SEAT_H)), _cup_local())
	_events = def.events
	_ev_i = 0
	IdleActions._defs()["meal"] = def
	A.idles.force("meal")
	_end_t = float(def.dur)
	_t = 0.0
	# a camera from the front and side, a little closer (held there in _eat)
	_cam = {"dist": game.get("cam_dist"), "pitch": game.get("cam_pitch")}

# the plate (and a cup) in his own frame
func _plate_local() -> Vector3:
	if seat.is_empty(): return Vector3(0.05, 1.0, 0.32)
	return cast.player.to_local(seat.table + Vector3(0, 0.03, 0))

func _cup_local() -> Vector3:
	if dish == null or dish.held == null or seat.is_empty(): return _plate_local()
	return cast.player.to_local(dish.held.global_position + Vector3(0, 0.05, 0))

func _eat(dt: float) -> void:
	var A: CastActor = cast.player
	game.speed = 0.0
	if game.get("cam_dist") != null:
		var k := 1.0 - exp(-dt * 2.5)
		game.cam_yaw = lerp_angle(float(game.cam_yaw), game.yaw + 0.75, k)
		game.cam_dist = lerpf(float(game.cam_dist), 2.7, k)
		game.cam_pitch = lerpf(float(game.cam_pitch), 0.12, k)
		game.cam_idle = 0.0
	var act = A.idles.P.act
	var lt: float = act.lt if act != null and String(act.name) == "meal" else _end_t + 1.0
	if act == null or String(act.name) != "meal":
		lt = _end_t + 1.0
	# the timeline's events (bites, sips)
	while _ev_i < _events.size() and lt >= float(_events[_ev_i][0]):
		_event(String(_events[_ev_i][1]))
		_ev_i += 1
	_place_props(A, lt)
	if lt >= _end_t - 0.05:
		_finish()

func _event(e: String) -> void:
	match e:
		"scoop":
			if morsel: morsel.visible = true
		"bite":
			_bite += 1
			if morsel: morsel.visible = false
			var hp: Vector3 = cast.player.global_position + Vector3(0, 1.1, 0)
			Sfx.play("glass_clink" if String(item.get("utensil", "")) == "cup" else "munch", hp, {"vol": -10.0 if String(item.get("utensil", "")) == "cup" else -6.0, "pitch": 1.25 if String(item.get("utensil", "")) == "cup" else 1.0})
			if dish: dish.set_eaten(float(_bite) / _bites)
			# his tummy fills a bite at a time
			var k := float(item.get("kcal", 0)) / _bites
			_kcal_left -= k
			if Hunger.I: Hunger.I.eat(k)
		"chew":
			Sfx.play("munch", cast.player.global_position + Vector3(0, 1.1, 0), {"vol": -14.0, "pitch": 1.15})
		"grab": _carry = true
		"release": _carry = false
		"pat":
			Sfx.play("cloth_rustle", cast.player.global_position + Vector3(0, 0.9, 0), {"vol": -12.0})

# the utensil and the morsel in his right hand, a cup carried up to his mouth,
# the plate in his left hand when standing
func _place_props(A: CastActor, lt: float) -> void:
	var rh := _bone_xf(A, "RHand")
	var lh := _bone_xf(A, "LHand")
	var yawb := Basis(Vector3.UP, game.yaw)
	if utensil:
		utensil.visible = lt > 2.0 or seat.is_empty()
		# held in the fist: across the palm, out past the index finger, tipped toward
		# where the fingers point (the knuckles from the bones: index B, little D)
		var kb := _bone_xf(A, "RFingerB1").origin
		var kd := _bone_xf(A, "RFingerD1").origin
		var side := (kb - kd).normalized()
		var fwd := ((kb + kd) * 0.5 - rh.origin).normalized()
		var tip_dir := (side * 0.9 + fwd * 0.6).normalized()
		var x := fwd.cross(tip_dir).normalized()
		if x.length_squared() < 0.01: x = yawb * Vector3.RIGHT
		var bs := Basis(x, tip_dir.cross(x).normalized(), tip_dir)
		var grip := (kb + kd) * 0.5 - fwd * 0.012
		utensil.global_transform = Transform3D(bs.scaled(Vector3.ONE * 1.3), grip + tip_dir * 0.015)
	if morsel:
		var tip: Vector3 = utensil.global_transform * Vector3(0, 0.008, 0.066) if utensil else (_bone_xf(A, "RFingerB2").origin + _bone_xf(A, "RFingerD2").origin) * 0.5
		morsel.global_position = tip
	if dish and dish.held and not seat.is_empty():
		if _carry:
			var c := rh.origin + rh.basis.y.normalized() * 0.03 + yawb * Vector3(0.0, -0.05, 0.03)
			var tilt := Basis(yawb * Vector3.RIGHT, -0.55 * _sip_w(lt))
			dish.held.global_transform = Transform3D(tilt * yawb, c)
		else:
			dish.held.transform = dish.held.transform.interpolate_with(dish.held_home, 0.35)
	if seat.is_empty() and dish:
		# standing: the plate in his left hand, level, his way
		var hold := lh.origin + yawb * Vector3(-0.04, -0.03, 0.06)
		if dish.held != null and String(item.get("utensil", "")) == "cup":
			hold = rh.origin + rh.basis.y.normalized() * 0.03 + yawb * Vector3(0.0, -0.06, 0.03)
			dish.global_transform = Transform3D(Basis(yawb * Vector3.RIGHT, -0.5 * _sip_w(lt)) * yawb.rotated(Vector3.UP, PI), hold)
		else:
			dish.global_transform = Transform3D(yawb.rotated(Vector3.UP, PI).scaled(dish.scale), hold)

# how far a cup is tipped up to his lips (from the timeline)
func _sip_w(lt: float) -> float:
	var w := 0.0
	for e in _events:
		if String(e[1]) == "bite": w = maxf(w, 1.0 - clampf(absf(lt - float(e[0])) / 0.45, 0.0, 1.0))
	return w

static func _bone_xf(A: CastActor, n: String) -> Transform3D:
	var bi: int = A.bones.get(n, -1)
	if bi < 0: return A.global_transform
	return A.skel.global_transform * A.skel.get_bone_global_pose(bi)

func _finish() -> void:
	if phase != "eat": return
	var A: CastActor = cast.player
	if dish: dish.set_eaten(1.0)
	if _kcal_left > 0.5 and Hunger.I: Hunger.I.eat(_kcal_left)
	_kcal_left = 0.0
	if Hunger.I: Hunger.I.paused = false
	# the extra
	var C: Conditions = cast.conditions
	match String(item.get("effect", "")):
		"sugar_rush": C.apply("sugar_rush", 1.0)
		"warm": C.apply("warm", 1.0)
	if item.get("hot", false) and C.has("wet"): C.apply("warm", 1.0)
	if item.has("stamina") and cast.body: cast.body.stamina = minf(1.0, cast.body.stamina + float(item.stamina))
	if _ground_was.is_valid(): A.ground = _ground_was
	_ground_was = Callable()
	if not _cam.is_empty():
		if _cam.dist != null: game.set("cam_dist", _cam.dist)
		if _cam.pitch != null: game.set("cam_pitch", _cam.pitch)
		game.set("cam_yaw", game.yaw + PI)   # (back behind him)
	# what the host says as he finishes
	var meal := FoodData.meal_at(_hour())
	var treat := not String(item_id) in ["pancakes", "breakfast_set", "onigiri", "curry", "hamburg", "cream_stew"]
	_say(FoodData.line(place, "done", meal, String(item.get("name", "")), treat))
	Sfx.ui("ui_item_get")
	phase = "done"

func _cleanup() -> void:
	for n in [dish, utensil, morsel]:
		if n != null and is_instance_valid(n): n.queue_free()
	dish = null; utensil = null; morsel = null
	if Hunger.I: Hunger.I.paused = false

# ---------- a stand-in table and chair (dev: until the interiors have their own) ----------
# put down at `at` (the floor under the chair's seat), the diner facing `yaw`; returns the
# usable an interior would have: {label "Eat", food_place, seat, seat_h, table_top}
static func standin(parent: Node3D, at: Vector3, yaw: float, pid := "home") -> Dictionary:
	var root := Node3D.new()
	root.name = "StandinTable"
	parent.add_child(root)
	root.global_position = at
	root.rotation.y = yaw
	var wood := FoodKit.mat(Color("b07a4a"), {"gloss": 0.35, "gloss_size": 0.97})
	var dark := FoodKit.mat(Color("8a5a34"), {"gloss": 0.2})
	var cloth := FoodKit.mat(Color("f4efe6"), {})
	var box := func(size: Vector3, p: Vector3, m: Material) -> void:
		var mi := MeshInstance3D.new()
		mi.mesh = FoodKit.rbox(size * 0.5, 0.15, Color.WHITE, 16, 8)
		mi.material_override = m
		mi.position = p
		root.add_child(mi)
	# the chair: a seat at SEAT_H, four legs, a back behind
	box.call(Vector3(0.42, 0.045, 0.4), Vector3(0, SEAT_H - 0.022, 0), wood)
	for sx in [-0.18, 0.18]:
		for sz in [-0.17, 0.17]:
			box.call(Vector3(0.04, SEAT_H - 0.04, 0.04), Vector3(sx, (SEAT_H - 0.04) * 0.5, sz), dark)
	box.call(Vector3(0.4, 0.34, 0.035), Vector3(0, SEAT_H + 0.25, -0.19), wood)
	# the table, its top TABLE_H up, with a cloth runner
	var tz := 0.76
	box.call(Vector3(0.9, 0.05, 0.7), Vector3(0, TABLE_H - 0.025, tz), wood)
	box.call(Vector3(0.36, 0.006, 0.66), Vector3(0, TABLE_H + 0.003, tz), cloth)
	for sx in [-0.4, 0.4]:
		for sz in [tz - 0.3, tz + 0.3]:
			box.call(Vector3(0.05, TABLE_H - 0.05, 0.05), Vector3(sx, (TABLE_H - 0.05) * 0.5, sz), dark)
	var fwd := Vector3(sin(yaw), 0, cos(yaw))
	var seat_p := at + Vector3(0, SEAT_H, 0)
	var top := at + fwd * (tz - 0.12) + Vector3(0, TABLE_H + 0.006, 0)
	var u := {"label": "Eat", "food_place": pid, "seat": [seat_p.x, seat_p.y, seat_p.z, yaw], "seat_h": SEAT_H,
		"table_top": [top.x, top.y, top.z], "x": at.x + fwd.x * 0.3, "z": at.z + fwd.z * 0.3, "r": 0.9, "lines": ["A table set for one."]}
	return u

# ---------- the acting: one idle action for the whole meal ----------
# kind: fork | spoon | chopsticks | hand | cup; plate / cup: where they are in his
# own frame (metres, +z ahead, +x his left); seated: on a chair (seat_h high)
# Returns an IdleActions action with its events [[t, "scoop" | "bite" | "chew" | "grab" | "release" | "pat"]].
static func build_action(kind: String, bites: int, plate: Vector3, seated: bool, seat_h := SEAT_H, cup := Vector3.ZERO) -> Dictionary:
	var B := T.num("hunger", "bite_s", float(T.dict("hunger", "eat", {}).get("bite_s", 2.4)))
	var t0 := 2.8 if seated else 0.6
	var body := []
	var arm_r := []
	var arm_l := []
	var ev := []
	var drop := -(0.68 - seat_h) if seated else 0.0
	# the hips back over the chair, the trunk a little forward to the table
	var SITC := {"dy": drop, "dz": -STAND_BACK + 0.04, "wp": 0.1, "lean": 0.16, "ko": 0.22, "seat": 1, "gap": 0, "hp": 0.18}
	var LEAN := SITC.duplicate(); LEAN.lean = 0.3; LEAN.hp = 0.32
	var UPR := SITC.duplicate(); UPR.lean = 0.12; UPR.hp = 0.05
	var ST := {} if not seated else SITC
	if seated:
		body.append([0.0, {}])
		body.append([0.5, {"dy": -0.03, "lean": 0.06, "hp": 0.08}])
		body.append([1.4, {"dy": drop * 0.7, "dz": -0.22, "wp": 0.25, "lean": 0.32, "ko": 0.3, "gap": 0.12, "seat": 0.3}])
		body.append([2.2, SITC])
	else:
		body.append([0.0, {}])
		body.append([0.5, {"lean": 0.08, "hp": 0.2}])
	var M := {"at": ["Head", -0.012, -0.015, 0.1], "pole": [-0.35, -1, -0.1], "wf": 0.15, "wt": 0.5, "cu": 0.3}
	var P_rest: Dictionary
	var P_dip: Dictionary
	if seated:
		var pr := plate + Vector3(-0.07, 0.09, -0.06)
		P_rest = {"at": ["root", pr.x, pr.y, pr.z], "pole": [-1, -0.4, -0.5], "wf": 0.1, "wt": 0.2, "cu": 0.3}
		var pd := (cup if kind == "cup" else plate) + Vector3(-0.01, 0.045 if kind != "cup" else 0.0, -0.02)
		P_dip = {"at": ["root", pd.x, pd.y, pd.z], "pole": [-1, -0.4, -0.5], "wf": 0.25, "wt": 0.3, "cu": 0.3}
		# his left hand rests on the table's edge
		var lp := plate + Vector3(0.16, 0.0, -0.13)
		var LT := {"at": ["root", lp.x, lp.y, lp.z], "pole": [1, -0.4, -0.5], "wf": -0.2, "cu": 0.2}
		arm_l = [[0.0, null], [2.4, LT], [t0 + bites * B + 0.2, LT], [t0 + bites * B + 0.8, null]]
	else:
		P_rest = {"at": ["Spine3", -0.09, -0.2, 0.25], "pole": [-1, -0.5, -0.4], "wf": 0.1, "cu": 0.3}
		P_dip = {"at": ["Spine3", 0.02, -0.21, 0.32], "pole": [-1, -0.5, -0.4], "wf": 0.2, "cu": 0.3}
		if kind == "cup": P_dip = P_rest
		var LH := {"at": ["Spine3", 0.07, -0.23, 0.3], "pole": [1, -0.5, -0.4], "wf": -0.2, "wt": 0.4, "cu": 0.2}
		if kind != "cup": arm_l = [[0.0, null], [0.5, LH], [t0 + bites * B, LH], [t0 + bites * B + 0.5, null]]
	arm_r.append([0.0, null])
	arm_r.append([t0 - 0.2, P_rest])
	for i in bites:
		var tb := t0 + i * B
		arm_r.append([tb + 0.45, P_dip])
		if kind == "cup": ev.append([tb + 0.45, "grab"])
		else: ev.append([tb + 0.55, "scoop"])
		arm_r.append([tb + 0.7, P_dip])
		arm_r.append([tb + 1.15, M])
		arm_r.append([tb + 1.3, M])
		ev.append([tb + 1.2, "bite"])
		if kind == "cup":
			arm_r.append([tb + 1.75, P_dip])
			ev.append([tb + 1.8, "release"])
			arm_r.append([tb + 2.1, P_rest])
		else:
			arm_r.append([tb + 1.8, P_rest])
			ev.append([tb + 1.75, "chew"])
		# leaning in to the plate, upright to the mouth, a chew
		body.append([tb + 0.5, _with(LEAN if seated else {"lean": 0.16, "hp": 0.34}, {})])
		body.append([tb + 1.1, _with(UPR if seated else {"lean": 0.06, "hp": 0.06}, {"jaw": 0.12})])
		body.append([tb + 1.4, _with(UPR if seated else {"lean": 0.06, "hp": 0.06}, {"jaw": 0.02})])
		body.append([tb + 1.6, _with(ST if seated else {"lean": 0.06, "hp": 0.1}, {"jaw": 0.14})])
		body.append([tb + 1.85, _with(ST if seated else {"lean": 0.06, "hp": 0.12}, {"jaw": 0.02})])
		body.append([tb + 2.1, _with(ST if seated else {"lean": 0.07, "hp": 0.14}, {"jaw": 0.1})])
		body.append([tb + B - 0.05, _with(ST if seated else {"lean": 0.08, "hp": 0.16}, {})])
	var te := t0 + bites * B
	# satisfied: a lean back, a look up, three pats on the tummy
	var BACK := _with(SITC if seated else {}, {"lean": -0.12 if seated else -0.08, "hp": -0.2, "sh": 0.01})
	body.append([te + 0.8, BACK])
	body.append([te + 2.6, BACK])
	var PAT := {"at": ["Hips", -0.02, 0.13, 0.16], "pole": [-1, -0.5, -0.3], "wf": 0.1, "cu": 0.1}
	var PAT2 := {"at": ["Hips", -0.02, 0.15, 0.2], "pole": [-1, -0.5, -0.3], "wf": 0.1, "cu": 0.1}
	arm_r.append([te + 0.35, P_rest])
	arm_r.append([te + 1.0, PAT])
	for k in 3:
		arm_r.append([te + 1.25 + k * 0.42, PAT2])
		arm_r.append([te + 1.45 + k * 0.42, PAT])
		ev.append([te + 1.45 + k * 0.42, "pat"])
	arm_r.append([te + 2.8, null])
	var dur := te + 3.0
	if seated:
		# up off the chair
		body.append([te + 3.0, SITC])
		body.append([te + 3.8, {"dy": drop * 0.6, "dz": -0.2, "wp": 0.3, "lean": 0.35, "ko": 0.3, "gap": 0.15, "seat": 0.3}])
		body.append([te + 4.6, {"dy": -0.02, "lean": 0.05}])
		body.append([te + 5.0, {}])
		dur = te + 5.0
	else:
		body.append([te + 3.0, {}])
	var gaze := [[0.0, {"y": 0, "p": 0}], [t0, {"y": 0, "p": 0.35}], [te, {"y": 0, "p": 0.3}], [te + 0.8, {"y": 0, "p": -0.1}], [dur, {"y": 0, "p": 0}]]
	return {"dur": dur, "talk": true, "player": true, "legs": seated, "kup": 0.35, "body": body, "armR": arm_r, "armL": arm_l if not arm_l.is_empty() else [[0.0, null], [dur, null]],
		"gaze": gaze, "events": ev}

static func _with(a: Dictionary, b: Dictionary) -> Dictionary:
	var o := a.duplicate()
	o.merge(b, true)
	return o
