extends Node3D
# Dev: place Ash V2's face. The eyes' and the mouth's decals slide and size on his head,
# live, in the game's light; Save writes the placement to res://tunables/cast.json
# (looks.ash2.face.eyes / .mouth {x, y, scale}, head radii from the head's centre, +y up,
# +x his left), which actor.gd applies over cast.json for every actor made from then on.
#   godot --path native res://dev/face_tool.tscn
#   keys: 1 / 2 pick the eyes or the mouth, arrows nudge it (shift: finer), + / - size it,
#         Q / E turn him, W / S closer / further, P play / pause the idle, R reset to the file, Enter save
#   headless check: -- --set=eyes:x,y,scale --set=mouth:x,y,scale [--save] [--shot=/tmp/a.png]
const T := preload("res://tunables.gd")
const KEYS := ["eyes", "mouth"]
const DEFAULT := {"eyes": {"x": 0.0, "y": 0.0, "scale": 1.0}, "mouth": {"x": 0.0, "y": -0.17, "scale": 1.0}}
var a: CastActor
var cam: Camera3D
var place := {}
var picked := "eyes"
var yaw := 0.0
var dist := 0.85
var paused := true     # the idle's first frame (P plays it)
var sliders := {}
var status: Label
var A := {}
var frame := 0

func _ready() -> void:
	for x in OS.get_cmdline_user_args():
		var kv := x.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	var env := Environment.new(); env.background_mode = Environment.BG_COLOR; env.background_color = Color(0.62, 0.74, 0.86)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(0.7, 0.72, 0.8); env.ambient_light_energy = 0.6
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun := DirectionalLight3D.new(); add_child(sun); sun.look_at_from_position(Vector3(-0.55, 0.75, 0.45) * 10, Vector3.ZERO)
	sun.shadow_enabled = true
	var fl := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(6, 6); fl.mesh = pm; add_child(fl)
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(0.55, 0.7, 0.45); fl.material_override = fm
	a = CastActor.make("ash2"); add_child(a)
	a.ground = func(_x: float, _z: float) -> float: return 0.0
	cam = Camera3D.new(); add_child(cam); cam.fov = 30
	# the placement as the actor has it (cast.json with the tunables over it)
	var look: Dictionary = CastActor.data().looks.ash2
	for k in KEYS:
		var p: Dictionary = look.get("face", {}).get(k, DEFAULT[k])
		place[k] = {"x": float(p.get("x", 0.0)), "y": float(p.get("y", 0.0)), "scale": float(p.get("scale", 1.0))}
	_ui()
	for s in OS.get_cmdline_user_args():
		if s.begins_with("--set="):
			var kv := s.substr(6).split(":")
			var v := kv[1].split(",")
			place[kv[0]] = {"x": float(v[0]), "y": float(v[1]), "scale": float(v[2])}
	_apply()
	if A.has("save"): _save()

func _ui() -> void:
	var cl := CanvasLayer.new(); add_child(cl)
	var panel := PanelContainer.new(); cl.add_child(panel)
	panel.position = Vector2(16, 16)
	var box := VBoxContainer.new(); panel.add_child(box)
	var title := Label.new(); title.text = "Ash V2 face   1 eyes  2 mouth   arrows move  + - size   Enter save   R reset"; box.add_child(title)
	for k in KEYS:
		var h := Label.new(); h.text = k.capitalize(); box.add_child(h)
		for f in ["x", "y", "scale"]:
			var row := HBoxContainer.new(); box.add_child(row)
			var l := Label.new(); l.text = "  " + f; l.custom_minimum_size.x = 70; row.add_child(l)
			var s := HSlider.new(); s.custom_minimum_size.x = 260
			if f == "scale": s.min_value = 0.4; s.max_value = 1.8
			elif f == "x": s.min_value = -0.6; s.max_value = 0.6
			else: s.min_value = -1.2; s.max_value = 0.8
			s.step = 0.005
			s.value_changed.connect(func(v: float): place[k][f] = v; picked = k; _apply())
			row.add_child(s)
			var vl := Label.new(); vl.custom_minimum_size.x = 60; row.add_child(vl)
			sliders[k + "." + f] = [s, vl]
	var btns := HBoxContainer.new(); box.add_child(btns)
	var save := Button.new(); save.text = "Save to tunables/cast.json"; save.pressed.connect(_save); btns.add_child(save)
	var reset := Button.new(); reset.text = "Reset"; reset.pressed.connect(_reset); btns.add_child(reset)
	status = Label.new(); box.add_child(status)

func _apply() -> void:
	for k in KEYS:
		var p: Dictionary = place[k]
		a.set_face(k, p.x, p.y, p.scale)
		for f in ["x", "y", "scale"]:
			var sl: HSlider = sliders[k + "." + f][0]
			sl.set_value_no_signal(p[f])
			sliders[k + "." + f][1].text = "%.3f" % p[f]
	status.text = "picked: %s    eyes %s    mouth %s" % [picked, _fmt(place.eyes), _fmt(place.mouth)]

func _fmt(p: Dictionary) -> String: return "(%.3f, %.3f, x%.2f)" % [p.x, p.y, p.scale]

func _reset() -> void:
	var look: Dictionary = CastActor.data().looks.ash2
	for k in KEYS:
		var p: Dictionary = look.get("face", {}).get(k, DEFAULT[k])
		place[k] = {"x": float(p.get("x", 0.0)), "y": float(p.get("y", 0.0)), "scale": float(p.get("scale", 1.0))}
	_apply()

# the placement into res://tunables/cast.json (looks.ash2.face), the rest of the file kept
func _save() -> void:
	var path := "res://tunables/cast.json"
	var d := {}
	if FileAccess.file_exists(path):
		var j = JSON.parse_string(FileAccess.get_file_as_string(path))
		if j is Dictionary: d = j
	if not d.get("looks") is Dictionary: d.looks = {}
	if not d.looks.get("ash2") is Dictionary: d.looks.ash2 = {}
	var face := {}
	for k in KEYS: face[k] = {"x": snappedf(place[k].x, 0.001), "y": snappedf(place[k].y, 0.001), "scale": snappedf(place[k].scale, 0.001)}
	d.looks.ash2.face = face
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		status.text = "could not write " + path
		return
	f.store_string(JSON.stringify(d, " ") + "\n")
	f.close()
	status.text = "saved " + path + "   eyes " + _fmt(place.eyes) + "   mouth " + _fmt(place.mouth)
	print("face_tool: saved ", path, " ", JSON.stringify(face))

func _unhandled_input(e: InputEvent) -> void:
	var ke := e as InputEventKey
	if ke == null or not ke.pressed: return
	var k: int = ke.keycode
	var step: float = 0.005 if ke.shift_pressed else 0.02
	var p: Dictionary = place[picked]
	match k:
		KEY_1: picked = "eyes"
		KEY_2: picked = "mouth"
		KEY_LEFT: p.x -= step
		KEY_RIGHT: p.x += step
		KEY_UP: p.y += step
		KEY_DOWN: p.y -= step
		KEY_EQUAL, KEY_PLUS, KEY_KP_ADD: p.scale += step
		KEY_MINUS, KEY_KP_SUBTRACT: p.scale -= step
		KEY_Q: yaw -= 0.15
		KEY_E: yaw += 0.15
		KEY_W: dist = maxf(0.3, dist - 0.05)
		KEY_S: dist = minf(3.0, dist + 0.05)
		KEY_P: paused = not paused
		KEY_R: _reset()
		KEY_ENTER, KEY_KP_ENTER: _save()
		_: return
	_apply()

func _process(dt: float) -> void:
	frame += 1
	if not paused or frame == 1: a.animate(dt, 0.0, false)
	var head: Vector3 = a.skel.to_global(a.skel.get_bone_global_pose(a.bones["Head"]).origin) + Vector3(0, 0.12, 0)
	cam.position = head + Vector3(sin(yaw), 0.05, cos(yaw)) * dist
	cam.look_at(head)
	if A.has("shot") and frame == 40:
		get_viewport().get_texture().get_image().save_png(String(A.shot))
		print("face_tool: shot ", A.shot)
		get_tree().quit()
