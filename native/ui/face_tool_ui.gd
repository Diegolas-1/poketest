class_name FaceToolUI
extends Control
# Placing Ash V2's face, on the phone: a live picture of his head (a viewport of its own,
# drag it to turn him) and sliders for the eyes' and the mouth's x, y and size (head radii
# from the head's centre, +y up, +x his left; actor.gd set_face). A change shows at once
# on the picture and on him in the world (every actor of the look). Save keeps it in
# user://face.json, which actor.gd lays over the look's placement (cast.json, the tunables)
# on this device from then on; Copy puts it on the clipboard as the tunables' JSON
# (res://tunables/cast.json, looks.ash2.face) for the repo and everyone's phone; Reset
# drops the device's and shows the look's own again. Opened from Settings > World >
# "Place Ash's face"; dev/face_tool.tscn hosts it on the desktop.
signal closed

const LOOK := "ash2"
const KEYS := ["eyes", "mouth"]
const RANGE := {"x": [-0.6, 0.6], "y": [-1.2, 0.8], "scale": [0.4, 1.8]}
const PATH := "user://face.json"

var place := {}
var preview: CastActor
var cam: Camera3D
var yaw := 0.0
var dist := 0.85
var sliders := {}
var status: Label

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	process_mode = Node.PROCESS_MODE_ALWAYS
	theme = UITheme.theme()
	var bg := ColorRect.new(); bg.color = Color(0.08, 0.09, 0.11, 0.97); bg.set_anchors_preset(Control.PRESET_FULL_RECT); add_child(bg)
	var m := MarginContainer.new(); m.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]: m.add_theme_constant_override("margin_" + side, 16)
	add_child(m)
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 16); m.add_child(h)
	h.add_child(_preview())
	h.add_child(_controls())
	_load()
	_apply()

# ---------- the picture: his head in a world of its own ----------
func _preview() -> Control:
	var box := SubViewportContainer.new()
	box.stretch = true
	box.custom_minimum_size = Vector2(520, 0)
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.size_flags_stretch_ratio = 1.2
	var vp := SubViewport.new()
	vp.own_world_3d = true
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.msaa_3d = Viewport.MSAA_2X
	box.add_child(vp)
	var env := Environment.new(); env.background_mode = Environment.BG_COLOR; env.background_color = Color(0.62, 0.74, 0.86)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(0.7, 0.72, 0.8); env.ambient_light_energy = 0.6
	var we := WorldEnvironment.new(); we.environment = env; vp.add_child(we)
	var sun := DirectionalLight3D.new(); vp.add_child(sun); sun.look_at_from_position(Vector3(-0.55, 0.75, 0.45) * 10, Vector3.ZERO)
	preview = CastActor.make(LOOK); vp.add_child(preview)
	preview.ground = func(_x: float, _z: float) -> float: return 0.0
	preview.animate(1.0 / 60.0, 0.0, false)   # the idle's first frame
	cam = Camera3D.new(); vp.add_child(cam); cam.fov = 30; cam.current = true
	_aim()
	box.gui_input.connect(func(e: InputEvent):
		if e is InputEventScreenDrag: yaw += e.relative.x * 0.01; _aim()
		elif e is InputEventMouseMotion and e.button_mask & MOUSE_BUTTON_MASK_LEFT: yaw += e.relative.x * 0.01; _aim()
		elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_WHEEL_UP: dist = maxf(0.4, dist - 0.05); _aim()
		elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_WHEEL_DOWN: dist = minf(2.0, dist + 0.05); _aim())
	return box

func _aim() -> void:
	var head: Vector3 = preview.skel.to_global(preview.skel.get_bone_global_pose(preview.bones["Head"]).origin) + Vector3(0, 0.12, 0)
	cam.position = head + Vector3(sin(yaw), 0.05, cos(yaw)) * dist
	cam.look_at(head)

# ---------- the sliders and buttons ----------
func _controls() -> Control:
	var sc := ScrollContainer.new()
	sc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var box := VBoxContainer.new(); box.add_theme_constant_override("separation", 6)
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(box)
	box.add_child(UITheme.label("PLACE ASH'S FACE", "label", 24, UITheme.TEXT))
	var hint := UITheme.label("The V2 model's eyes and mouth: where they sit on his head and how big, in head radii. Drag the picture to turn him.", "body", 16, UITheme.TEXT_DIM)
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(hint)
	for k in KEYS:
		box.add_child(UITheme.label(k.capitalize(), "label", 20, UITheme.YELLOW))
		for f in ["x", "y", "scale"]:
			var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 10); box.add_child(row)
			var l := UITheme.label({"x": "across", "y": "up / down", "scale": "size"}[f], "body", 18, UITheme.TEXT)
			l.custom_minimum_size.x = 120; row.add_child(l)
			var s := HSlider.new()
			s.min_value = RANGE[f][0]; s.max_value = RANGE[f][1]; s.step = 0.005
			s.custom_minimum_size = Vector2(240, 44)
			s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			s.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			s.value_changed.connect(func(v: float): place[k][f] = v; _apply(k + "." + f))
			row.add_child(s)
			var vl := UITheme.label("", "label_semi", 18, UITheme.TEXT); vl.custom_minimum_size.x = 72; vl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			row.add_child(vl)
			sliders[k + "." + f] = [s, vl]
	var btns := HFlowContainer.new(); btns.add_theme_constant_override("h_separation", 10); btns.add_theme_constant_override("v_separation", 10); box.add_child(btns)
	for b in [["Save on this phone", "primary", save], ["Copy for the game", "secondary", copy_json], ["Reset", "secondary", reset], ["Close", "secondary", func(): closed.emit()]]:
		var ub := UIButton.new(); ub.text = b[0]; ub.variant = b[1]; ub.font_size = 18; ub.custom_minimum_size = Vector2(0, 50)
		ub.pressed.connect(func(): Sfx.ui("ui_confirm"); b[2].call())
		btns.add_child(ub)
	status = UITheme.label("", "body", 16, UITheme.TEXT_DIM); status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(status)
	return sc

# ---------- the values ----------
# the look's own placement (cast.json with the tunables over it), the device's over that
func _load() -> void:
	var look: Dictionary = CastActor.data().looks.get(LOOK, {})
	var dev := CastActor.face_dev()
	for k in KEYS:
		var p: Dictionary = dev.get(k, look.get("face", {}).get(k, {}))
		place[k] = {"x": float(p.get("x", 0.0)), "y": float(p.get("y", 0.0)), "scale": float(p.get("scale", 1.0))}
	status.text = "Saved on this phone." if not dev.is_empty() else "The game's own placement."

func set_place(key: String, x: float, y: float, scale: float) -> void:
	place[key] = {"x": x, "y": y, "scale": scale}
	_apply()

func _apply(changed := "") -> void:
	for k in KEYS:
		var p: Dictionary = place[k]
		preview.set_face(k, p.x, p.y, p.scale)
		for n in get_tree().get_nodes_in_group("characters"):   # him in the world too
			if n is CastActor and n.look == LOOK and n != preview: n.set_face(k, p.x, p.y, p.scale)
		for f in ["x", "y", "scale"]:
			var sl: HSlider = sliders[k + "." + f][0]
			if k + "." + f != changed: sl.set_value_no_signal(p[f])
			sliders[k + "." + f][1].text = "%.3f" % p[f]

func _face() -> Dictionary:
	var face := {}
	for k in KEYS: face[k] = {"x": snappedf(place[k].x, 0.001), "y": snappedf(place[k].y, 0.001), "scale": snappedf(place[k].scale, 0.001)}
	return face

# kept on this device, over the look's placement from now on (actor.gd face_dev)
func save() -> void:
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f == null:
		status.text = "Could not write " + PATH
		return
	f.store_string(JSON.stringify(_face()) + "\n"); f.close()
	CastActor.face_dev_changed()
	status.text = "Saved on this phone: eyes %s, mouth %s. Copy puts it on the clipboard for the game's files." % [_fmt(place.eyes), _fmt(place.mouth)]

# the tunables' JSON (res://tunables/cast.json: looks.ash2.face) on the clipboard
func copy_json() -> void:
	DisplayServer.clipboard_set(JSON.stringify({"looks": {LOOK: {"face": _face()}}}, " "))
	status.text = "Copied: paste into native/tunables/cast.json (looks.ash2.face) to make it everyone's."

# back to the look's own placement; the device's forgotten
func reset() -> void:
	if FileAccess.file_exists(PATH): DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))
	CastActor.face_dev_changed()
	_load()
	_apply()
	status.text = "Back to the game's own placement."

func _fmt(p: Dictionary) -> String: return "(%.3f, %.3f, x%.2f)" % [p.x, p.y, p.scale]
