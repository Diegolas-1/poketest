extends Node
# Dev only: footprints (footprints.gd) in the game, for renders.
#   godot --path native res://dev/footprint_shot.tscn -- --case=beach|path|arena|fade|track [--frames=DIR --every=n] [--quit-at=s]
#   beach   Ash walks along the beach with Pikachu, Pidgey, Ponyta, Ekans, Psyduck
#           and Grimer beside him (paw, bird, hoof, slither, webbed, slime); then a
#           look down the trails
#   path    Ash on a dirt path (Route 1's, north of town), the game camera
#   arena   into the Battle Arena: down the path and across the clay, a Growlithe
#           running the field
#   fade    a trail on the sand, its time run fast: fresh, fading, gone
#   track   a wild Growlithe (track_tag) runs off over the sand; Ash crouches by
#           its fresh prints (darker, the glint) next to Ash's own
var A := {}
var main: Node
var frame := 0
var t := 0.0
var lbl: Label
var mons: Array = []      # [creature, from, dir, speed, start]
var goal := Vector3.ZERO
var walk := false
var walk_v := 0.8         # the stick's tilt
var hold_cam := {}        # {from, at} once the camera is held
var case_ := "beach"
var _did := {}

const BEACH := Vector3(6.0, 0.0, 98.5)

func _ready() -> void:
	process_priority = -10   # (the stick set before main.gd reads it)
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	case_ = String(A.get("case", "beach"))
	main = load("res://main.tscn").instantiate()
	add_child(main)
	var cl := CanvasLayer.new(); cl.layer = 50; add_child(cl)
	lbl = Label.new(); cl.add_child(lbl); lbl.position = Vector2(150, 64)
	lbl.add_theme_font_size_override("font_size", 24)
	lbl.add_theme_color_override("font_color", Color.WHITE)
	lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	lbl.add_theme_constant_override("outline_size", 6)
	var cam_late := Node.new()
	cam_late.set_script(_late_script())
	cam_late.set("shot", self)
	add_child(cam_late)

func _late_script() -> GDScript:
	var s := GDScript.new()
	s.source_code = "extends Node\nvar shot\nfunc _ready() -> void: process_priority = 100\nfunc _process(_dt: float) -> void: shot.late()\n"
	s.reload()
	return s

func _once(k: String) -> bool:
	if _did.has(k): return false
	_did[k] = true
	return true

func _ground(x: float, z: float) -> Vector3: return Vector3(x, main.world.height_at(x, z), z)

func _place(p: Vector3, yaw: float) -> void:
	main.pos = _ground(p.x, p.z)
	main.yaw = yaw
	main.speed = 0.0
	main.cam_yaw = yaw + PI
	main.cam_ty = main.pos.y
	main.cam_target = main.pos + Vector3(0, 1.45, 0)
	main.cam_floor = main.pos.y
	main.cast.land(main.pos.y)

func _mon(sp: String, from: Vector3, dir: Vector3, v: float, start: float, tag := "") -> Creature:
	var c := Creature.make(sp)
	main.add_child(c)
	c.track_tag = tag
	c.position = _ground(from.x, from.z)
	c.rotation.y = atan2(dir.x, dir.z)
	mons.append([c, from, dir.normalized(), v, start])
	return c

func _process(dt: float) -> void:
	frame += 1
	t += dt
	if A.has("frames") and frame % maxi(1, int(A.get("every", "1"))) == 0: _grab.call_deferred("%s/f%05d.png" % [A.frames, frame])
	if A.has("quit-at") and t >= float(A["quit-at"]) and _once("quit"): get_tree().quit()
	if frame == 3:
		main.cast.clock.real = false; main.cast.clock.ff = 0.0; main.cast.clock.set_time(float(A.get("hour", "10.5")))
	if frame < 6: return
	match case_:
		"beach": _beach()
		"path": _path()
		"arena": _arena()
		"fade": _fade(dt)
		"track": _track()
		"kinds": _kinds()
	_drive()
	for m in mons:
		var c: Creature = m[0]
		if t > float(m[4]): m[1] += m[2] * float(m[3]) * dt
		var p: Vector3 = m[1]
		c.position = _ground(p.x, p.z)
		c.animate(dt, float(m[3]) if t > float(m[4]) else 0.0)

func _beach() -> void:
	if _once("setup"):
		_place(BEACH, PI * 0.5)
		var row := [["pikachu", 1.0, 1.5], ["pidgey", 1.9, 1.0], ["ponyta", 3.0, 1.6], ["ekans", 4.1, 1.1], ["psyduck", 5.0, 1.0], ["grimer", 6.2, 0.7]]
		for r in row: _mon(String(r[0]), BEACH + Vector3(-1.0, 0, float(r[1])), Vector3(1, 0, 0), float(r[2]), 0.6)
		goal = BEACH + Vector3(16, 0, 0)
		walk = true; walk_v = 0.55
	var fp: Footprints = Footprints.I
	lbl.text = "Footprints: the beach  t %.1f s  prints %d" % [t, fp.live() if fp else -1]
	if t > 9.0: walk = false
	if t > 9.5 and _once("hold"):
		hold_cam = {"from": BEACH + Vector3(14.0, 4.5, -3.5), "at": BEACH + Vector3(6.0, 0.0, 3.0)}
	if t > 15.0 and _once("hold2"):
		hold_cam = {"from": BEACH + Vector3(8.0, 2.4, -1.8), "at": BEACH + Vector3(5.0, 0.0, 2.5)}

# side by side, labelled, seen from above: one lane each
func _kinds() -> void:
	if _once("setup"):
		_place(BEACH + Vector3(-3.0, 0, -3.0), PI * 0.5)
		var row := [["pikachu", "paw", 1.4], ["pidgey", "bird", 0.9], ["ponyta", "hoof", 1.6], ["ekans", "slither", 1.1],
			["psyduck", "webbed", 1.0], ["grimer", "slime", 0.7], ["charizard", "claw", 1.0], ["clefairy", "stub", 0.9]]
		for i in row.size():
			var r: Array = row[i]
			var z := -1.2 + i * 1.25
			_mon(String(r[0]), BEACH + Vector3(-1.0, 0, z), Vector3(1, 0, 0), float(r[2]), 0.3)
			var l := Label3D.new()
			l.text = "%s: %s" % [String(r[0]).capitalize(), r[1]]
			l.font_size = 48; l.outline_size = 12; l.pixel_size = 0.0075
			l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			l.position = _ground(BEACH.x - 2.4, BEACH.z + z) + Vector3(0, 0.25, 0)
			main.add_child(l)
		hold_cam = {"from": BEACH + Vector3(2.5, 10.5, -1.6), "at": BEACH + Vector3(2.5, 0.0, 2.6)}
	if t > 7.0 and _once("close"):
		hold_cam = {"from": BEACH + Vector3(-3.2, 2.3, 3.3), "at": BEACH + Vector3(1.5, 0.0, 3.3)}
	lbl.text = "Footprints by body: Pokémon side by side  t %.1f s" % t

func _path() -> void:
	if _once("setup"):
		_place(Vector3(-3.0, 0, -12.0), PI)
		goal = Vector3(-3.0, 0, -80.0)
		walk = true; walk_v = 0.8
	lbl.text = "Footprints: Ash on a dirt path  t %.1f s  prints %d" % [t, Footprints.I.live()]
	if t > 9.0: walk = false
	if t > 9.5 and _once("hold"):
		var p: Vector3 = main.pos
		hold_cam = {"from": p + Vector3(1.6, 2.4, -2.2), "at": p + Vector3(0, 0, 3.5)}

func _arena() -> void:
	if frame == 8 and _once("enter"): BattleArena.enter(main, true)
	var ar: BattleArena = BattleArena.I
	if ar == null or frame < 14: return
	var C := ArenaData.C
	if _once("setup"):
		goal = Vector3(C.x + 1.5, 0, C.y - 4.0)
		walk = true; walk_v = 0.8
		_mon("growlithe", Vector3(C.x - 5.0, 0, C.y - 7.0), Vector3(1, 0, 0.5), 2.4, 3.0)
		_mon("rhyhorn", Vector3(C.x + 4.5, 0, C.y + 6.0), Vector3(-0.4, 0, -1), 1.0, 2.0)
	lbl.text = "Footprints: the arena's clay  t %.1f s  prints %d" % [t, Footprints.I.live()]
	if t > 13.0: walk = false
	if t > 13.5 and _once("hold"):
		hold_cam = {"from": Vector3(C.x + 4.5, 4.0, C.y + 1.0), "at": Vector3(C.x, 0.0, C.y - 4.0)}

func _fade(dt: float) -> void:
	if _once("setup"):
		_place(BEACH, PI * 0.5)
		goal = BEACH + Vector3(7, 0, 0)
		walk = true; walk_v = 0.55
		_mon("pikachu", BEACH + Vector3(-0.5, 0, 1.2), Vector3(1, 0, 0), 1.3, 0.3)
	var fp: Footprints = Footprints.I
	if main.pos.distance_to(goal) < 0.5 or t > 6.0: walk = false
	if t > 4.6: mons[0][3] = 0.0
	if t > 6.5:
		if _once("hold"): hold_cam = {"from": BEACH + Vector3(9.0, 2.6, -2.6), "at": BEACH + Vector3(3.0, 0, 0.6)}
		if fp: fp.advance(dt * 10.0)   # (eleven times as fast: a minute and a half in about eight seconds)
	if fp: lbl.text = "Footprints fading  (prints showing %d)  the first ones %.0f s old" % [fp.live(), fp.t - 0.5]

func _track() -> void:
	if _once("setup"):
		_place(BEACH + Vector3(0, 0, 0), PI * 0.5)
		_mon("growlithe", BEACH + Vector3(1.0, 0, 1.8), Vector3(1, 0, 0.12), 3.0, 0.5, "wild:growlithe")
		_mon("growlithe", BEACH + Vector3(1.0, 0, 3.6), Vector3(1, 0, 0.12), 3.0, 0.5)   # (a tame one beside it: plain prints)
		goal = BEACH + Vector3(3.2, 0, 0.9)
		walk = true; walk_v = 0.5
	lbl.text = "Tracking: a wild Growlithe's fresh prints (near) and a tame one's  t %.1f s%s" % [t, "  (crouched: the glint)" if main.cast.crouching else ""]
	if main.pos.distance_to(goal) < 0.4: walk = false
	if t > 3.5 and _once("crouch"): main.cast.set_crouch(true)
	if t > 4.0 and _once("hold"):
		hold_cam = {"from": BEACH + Vector3(1.2, 2.1, -1.4), "at": BEACH + Vector3(6.5, 0.0, 2.4)}
	if t > 6.0 and _once("print"):
		var tr := Footprints.trail_near(main.pos, 12.0)
		for o in tr: print("track: %s %d prints, newest at %s, fresh %s" % [o, tr[o].size(), str(tr[o][0].pos), tr[o][0].fresh])

# Ash: the stick pushed toward the goal (main.gd moves him relative to the camera)
func _drive() -> void:
	if not walk:
		main.stick_vec = Vector2.ZERO
		return
	var d := Vector2(goal.x - main.pos.x, goal.z - main.pos.z)
	if d.length() < 0.3:
		main.stick_vec = Vector2.ZERO
		return
	d = d.normalized()
	if case_ == "path": d = _steer(d)
	var cy: float = main.cam_yaw
	var f := Vector2(-sin(cy), -cos(cy))
	var r := Vector2(cos(cy), -sin(cy))
	main.stick_vec = Vector2(d.dot(r), -d.dot(f)) * walk_v

# keep to the dirt: of the headings near the goal's, the nearest one with dirt ahead
func _steer(d: Vector2) -> Vector2:
	var fp: Footprints = Footprints.I
	var me: Vector3 = main.pos
	var cur := Vector2(sin(main.yaw), cos(main.yaw))
	var best := d
	var best_s := -1e9
	for k in range(-6, 7):
		var a := atan2(cur.x, cur.y) + k * 0.15
		var h := Vector2(sin(a), cos(a))
		var s := h.dot(d) * 0.6 + h.dot(cur)
		for dd in [1.2, 2.4, 3.6]:
			var q := Vector3(me.x + h.x * dd, me.y, me.z + h.y * dd)
			if fp.ground_at(q) == "": s -= 2.0
		if s > best_s: best_s = s; best = h
	return best

# after main.gd: a held camera
func late() -> void:
	if hold_cam.is_empty(): return
	main.cam.look_at_from_position(hold_cam.from, hold_cam.at)

func _grab(path: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(path)
