class_name UIInput
extends Node
# Which kind of input the player used last, so prompts and hints show the
# right glyphs: "touch" (the on-screen buttons), "pad" (a game controller)
# or "keys" (keyboard / mouse). Made by settings.gd (one per game); the
# gallery makes its own. Components read UIInput.device and, to redraw when
# it changes, connect to UIInput.I.device_changed (or compare UIInput.serial).

signal device_changed(device: String)

static var I: UIInput
static var device := "touch"
static var serial := 0

func _enter_tree() -> void:
	I = self
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not (DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")): device = "keys"
	if not Input.get_connected_joypads().is_empty(): device = "pad"
	if OS.get_cmdline_user_args().has("--touch"): device = "touch"
	Input.joy_connection_changed.connect(func(_d, on):
		if on: _use("pad")
		elif Input.get_connected_joypads().is_empty(): _use("touch" if OS.has_feature("mobile") else "keys"))

func _exit_tree() -> void:
	if I == self: I = null

func _input(e: InputEvent) -> void:
	if e is InputEventScreenTouch or e is InputEventScreenDrag:
		_use("touch")
	elif e is InputEventJoypadButton:
		_use("pad")
	elif e is InputEventJoypadMotion and absf(e.axis_value) > 0.5:
		_use("pad")
	elif e is InputEventKey and e.pressed:
		_use("keys")
	elif e is InputEventMouseButton and e.pressed and not OS.has_feature("mobile"):
		_use("keys")

func _use(d: String) -> void:
	if d == device: return
	device = d
	serial += 1
	device_changed.emit(d)

# for tests and shots: pretend a device
static func force(d: String) -> void:
	if d == device: return
	device = d
	serial += 1
	if I: I.device_changed.emit(d)
