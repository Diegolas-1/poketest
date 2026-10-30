class_name TVLink
extends Node
# The game's link to a TV: a true second screen (screens.gd puts the world and
# the HUD on it; the phone shows the menu). Three backends, one code path:
#   native  the iPhone app's PalletTV singleton (tools/native/tv_plugin: AirPlay or a
#           USB-C / HDMI adapter; the TV's scene gets a CAMetalLayer and every TV
#           refresh copies the game's frame into it, all on the GPU)
#   fake    a desktop stand-in for development: `-- --fake-tv=1920x1080` opens a
#           second window as the "TV" (fake_connect / fake_disconnect from tests)
#   none    no TV possible (a desktop run without the flag)
#
#   status                {supported, connected, name, width, height, hz, route, insets}
#   signal changed        connected / disconnected / renamed
#   bind(vp)              the SubViewport whose picture the TV shows (screens.gd)
#   set_active(on)        the TV shows the game (on) or black (off)
#   pick_route(ci, rect)  the system AirPlay picker over rect (viewport units of ci)

signal changed

var backend := "none"
var status := {"supported": false, "connected": false, "name": "", "width": 0, "height": 0, "hz": 60, "route": "none", "insets": Rect2()}
var native: Object = null
var vp: SubViewport = null
var active := false

var _poll_t := 0.0
var _gen := -1
var _tex := 0
var _queue := 0
var _fake_size := Vector2i.ZERO   # the TV's size from --fake-tv (0 = no fake TV)
var _fake_win: Window = null

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_priority = 1000   # after the game has moved its camera (the frame's last step)
	if Engine.has_singleton("PalletTV"):
		native = Engine.get_singleton("PalletTV")
		backend = "native"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--fake-tv"):
			backend = "fake"
			native = null
			var v := a.get_slice("=", 1) if a.contains("=") else "1920x1080"
			_fake_size = Vector2i(int(v.get_slice("x", 0)), int(v.get_slice("x", 1)))
			if _fake_size.x < 64 or _fake_size.y < 64: _fake_size = Vector2i(1920, 1080)
	status.supported = backend != "none"
	RenderingServer.frame_post_draw.connect(_drawn)
	if backend == "native": _poll()
	elif backend == "fake" and not OS.get_cmdline_user_args().has("--fake-tv-later"):
		fake_connect.call_deferred(_fake_size)

func connected() -> bool:
	return bool(status.connected)

func bind(v: SubViewport) -> void:
	vp = v
	_tex = 0

func set_active(on: bool) -> void:
	active = on
	if native: native.set_active(on)
	if _fake_win: _fake_win.get_child(0).visible = on

func _process(dt: float) -> void:
	if backend == "native":
		_poll_t -= dt
		if _poll_t <= 0.0:
			_poll_t = 0.25
			_poll()
		# the texture behind the viewport changes when it is resized: hand the new one over
		if active and vp:
			var rid := vp.get_texture().get_rid()
			var tex := RenderingServer.texture_get_native_handle(rid) if rid.is_valid() else 0
			if tex != _tex:
				_tex = tex
				if _queue == 0:
					var rd := RenderingServer.get_rendering_device()
					if rd: _queue = rd.get_driver_resource(RenderingDevice.DRIVER_RESOURCE_COMMAND_QUEUE, RID(), 0)
				native.set_source(tex, _queue)

func _drawn() -> void:
	if active and native and _tex != 0: native.frame_drawn()

func _poll() -> void:
	var s: Dictionary = native.get_status()
	var was := bool(status.connected)
	var name_was := String(status.name)
	status = {"supported": bool(s.get("supported", true)), "connected": bool(s.get("connected", false)),
		"name": String(s.get("name", "")), "width": int(s.get("width", 0)), "height": int(s.get("height", 0)),
		"hz": int(s.get("hz", 60)), "route": String(s.get("route", "")), "insets": s.get("insets", Rect2())}
	var gen := int(s.get("generation", 0))
	if bool(status.connected) and (int(status.width) <= 0 or int(status.height) <= 0):
		status.connected = false   # (its mode is not known yet: wait for it)
	if gen != _gen or was != bool(status.connected) or name_was != String(status.name):
		_gen = gen
		if not bool(status.connected): _tex = 0
		changed.emit()

# what the Connect to TV button does: the system picker on the phone; the fake
# TV switches on and off on a desktop
func pick_route(ci: CanvasItem, r: Rect2) -> void:
	if backend == "native":
		var k := UITheme.units_per_pt(ci)
		var pr := Rect2(r.position / k, r.size / k)
		# (the viewport's units to the screen's points: the canvas is stretched to the window)
		native.show_route_picker(pr)
	elif backend == "fake":
		if connected(): fake_disconnect()
		else: fake_connect(_fake_size if _fake_size != Vector2i.ZERO else Vector2i(1920, 1080))

# a short line for the settings: "Connected to Living Room · 1920 × 1080 · 60 Hz"
func describe() -> String:
	if not bool(status.supported): return "Not available in this build"
	if not connected(): return "Not connected"
	return "Connected to %s · %d × %d · %d Hz" % [display_name(), status.width, status.height, status.hz]

func display_name() -> String:
	var n := String(status.name)
	return n if n != "" else "TV"

# ---------- the desktop stand-in ----------
func fake_connect(size: Vector2i, name := "Fake TV") -> void:
	if backend != "fake" or _fake_win: return
	if size == Vector2i.ZERO: size = Vector2i(1920, 1080)
	_fake_size = size
	var w := Window.new()
	w.title = "Pallet Town · TV (%d × %d)" % [size.x, size.y]
	# a window that fits the desktop, the TV's shape
	var fit := minf(1.0, minf(1280.0 / size.x, 800.0 / size.y))
	w.size = Vector2i(roundi(size.x * fit), roundi(size.y * fit))
	w.position = Vector2i(40, 40)
	w.unresizable = false
	w.transient = false
	w.visible = false
	w.force_native = true   # (its own window, never drawn inside the phone's)
	w.unfocusable = true    # (the controller and keys stay with the game's window, as with a real TV)
	w.close_requested.connect(fake_disconnect)
	var tr := TextureRect.new()
	tr.set_anchors_preset(Control.PRESET_FULL_RECT)
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	tr.visible = active
	w.add_child(tr)
	var bg := ColorRect.new()
	bg.color = Color.BLACK
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.show_behind_parent = true
	tr.add_child(bg)
	get_tree().root.add_child(w)
	w.visible = true
	_fake_win = w
	status = {"supported": true, "connected": true, "name": name, "width": size.x, "height": size.y, "hz": 60, "route": "fake", "insets": Rect2()}
	_gen += 1
	changed.emit()
	_fake_texture.call_deferred()

func _fake_texture() -> void:
	if _fake_win and vp: (_fake_win.get_child(0) as TextureRect).texture = vp.get_texture()

func fake_disconnect() -> void:
	if not _fake_win: return
	_fake_win.queue_free()
	_fake_win = null
	status = {"supported": true, "connected": false, "name": "", "width": 0, "height": 0, "hz": 60, "route": "none", "insets": Rect2()}
	_gen += 1
	changed.emit()

func fake_window() -> Window:
	return _fake_win
