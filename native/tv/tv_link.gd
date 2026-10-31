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
#   stats()               the TV's pacing, for the debug HUD (Settings tv_debug)
#   set_mode_height(h)    the TV mode to ask for (AirPlay: 720 by default, screens.gd)
#
# Pacing (native, plugin version 2): the game's viewport renders once per TV refresh
# (every refresh at 60 fps on a 60 Hz link, every second one at 30), not at the phone's
# own pace: at each engine frame the TV's refreshes since the last are taken
# (take_ticks) and, when one is due, the viewport renders that frame (UPDATE_ONCE)
# and its picture is presented once, straight after (frame_drawn). The engine itself
# keeps the phone's pace (120 Hz), so a TV refresh is picked up within one phone
# frame and every TV refresh gets exactly one new frame.

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
var paced := false        # the plugin paces the game's renders (take_ticks)
var _due := 0             # TV refreshes waiting
var _pending := false     # a render asked for this frame: present it once drawn
var _last_render := 0     # usec of the last game render
var _game_ms := 0.0       # time between game renders (smoothed)
var _renders := 0
var _stat_t := 0.0
var _fake_rate := 0.0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_priority = 1000   # after the game has moved its camera (the frame's last step)
	if Engine.has_singleton("PalletTV"):
		native = Engine.get_singleton("PalletTV")
		backend = "native"
		paced = native.has_method("take_ticks")
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
	_due = 0
	_pending = false
	if native and paced: native.take_ticks()
	if vp: vp.render_target_update_mode = SubViewport.UPDATE_DISABLED if on and paced else SubViewport.UPDATE_ALWAYS
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
		# one game render per TV refresh (per two at 30 fps on a 60 Hz TV)
		if active and vp and paced:
			_due += int(native.take_ticks())
			var link := float(status.get("link_hz", 0.0))
			if link < 20.0: link = float(maxi(30, int(status.hz)))
			var every := maxi(1, roundi(link / maxf(1.0, float(Settings.get_value("tv_fps")))))
			if _due >= every:
				_due = 0   # (after a hitch: the next frame, never a burst to catch up)
				vp.render_target_update_mode = SubViewport.UPDATE_ONCE
				_pending = true
	_stat_t += dt
	if _stat_t >= 1.0:
		_fake_rate = _renders / _stat_t
		_renders = 0
		_stat_t = 0.0

func _drawn() -> void:
	if not active: return
	var rendered := _pending or not paced
	if rendered:
		var now := Time.get_ticks_usec()
		if _last_render > 0: _game_ms = lerpf(_game_ms, (now - _last_render) / 1000.0, 0.1)
		_last_render = now
		_renders += 1
	if native and _tex != 0 and rendered: native.frame_drawn()
	_pending = false

func _poll() -> void:
	var s: Dictionary = native.get_status()
	var was := bool(status.connected)
	var name_was := String(status.name)
	status = {"supported": bool(s.get("supported", true)), "connected": bool(s.get("connected", false)),
		"name": String(s.get("name", "")), "width": int(s.get("width", 0)), "height": int(s.get("height", 0)),
		"hz": int(s.get("hz", 60)), "route": String(s.get("route", "")), "insets": s.get("insets", Rect2()),
		"audio_airplay": bool(s.get("audio_airplay", false)), "link_hz": float(s.get("link_hz", 0.0)),
		"presented": float(s.get("presented", 0.0)), "repeated": float(s.get("repeated", 0.0)),
		"skipped": float(s.get("skipped", 0.0)), "late": float(s.get("late", 0.0))}
	var gen := int(s.get("generation", 0))
	if bool(status.connected) and (int(status.width) <= 0 or int(status.height) <= 0):
		status.connected = false   # (its mode is not known yet: wait for it)
	var size_key := "%dx%d" % [status.width, status.height]
	if gen != _gen or was != bool(status.connected) or name_was != String(status.name) or size_key != _size_key or bool(status.audio_airplay) != _audio:
		_size_key = size_key
		_audio = bool(status.audio_airplay)
		_gen = gen
		if not bool(status.connected): _tex = 0
		changed.emit()

var _size_key := ""
var _audio := false

# sound on an AirPlay receiver but no screen: the system picker or AirPlay audio,
# not Screen Mirroring (the Settings tab says what to do)
func audio_only() -> bool:
	return not connected() and bool(status.get("audio_airplay", false))

func set_mode_height(h: int) -> void:
	if native and native.has_method("set_mode_height"): native.set_mode_height(h)

# the TV's pacing, for the debug HUD
func stats() -> Dictionary:
	var d := {"game_ms": _game_ms, "renders": _fake_rate, "paced": paced, "backend": backend,
		"link_hz": float(status.get("link_hz", 0.0)), "presented": float(status.get("presented", _fake_rate)),
		"repeated": float(status.get("repeated", 0.0)), "skipped": float(status.get("skipped", 0.0)), "late": float(status.get("late", 0.0)),
		"width": int(status.width), "height": int(status.height), "route": String(status.route), "hz": int(status.hz)}
	if backend != "native":
		d.link_hz = 60.0
		d.presented = _fake_rate
	return d

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
