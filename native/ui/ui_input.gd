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

# ---------- menu navigation ----------
# One step per press for every menu and list: the d-pad, the arrow keys and the
# stick each move the cursor once, a held direction repeats only after DELAY,
# then at RATE steps a second (never the stick's flood of motion events, nor the
# keyboard's own echo). One per menu:
#   var nav := UIInput.Nav.new()
#   func _unhandled_input(e): var d := nav.event(e)      # Vector2i: a fresh press (else ZERO)
#   func _process(dt): var d := nav.tick(dt)             # Vector2i: a held repeat (else ZERO)
# nav.swallow(e): true for a direction event the menu should mark handled (a
# repeat or a stick wobble it ignored). nav.reset() when the menu opens.
const NAV_DELAY := 0.35
const NAV_RATE := 8.0
const STICK_ON := 0.55          # the stick counts as pressed past this...
const STICK_OFF := 0.35         # ...and released under this (no chatter at the edge)
const NAV_ACTIONS := {"ui_up": Vector2i.UP, "move_up": Vector2i.UP, "ui_down": Vector2i.DOWN, "move_down": Vector2i.DOWN,
	"ui_left": Vector2i.LEFT, "move_left": Vector2i.LEFT, "ui_right": Vector2i.RIGHT, "move_right": Vector2i.RIGHT}

class Nav extends RefCounted:
	var held := Vector2i.ZERO     # the direction last pressed, while it stays held
	var held_t := 0.0
	var steps := 0                # repeats since the press
	var _stick := Vector2i.ZERO   # the stick's edge state
	var _last_ev: InputEvent
	var _last := Vector2i.ZERO
	var poll := true              # tick reads Input (tests can turn it off and feed held_dir)
	var held_dir := Vector2i.ZERO

	func reset() -> void:
		held = Vector2i.ZERO; held_t = 0.0; steps = 0

	# the step a fresh press makes (ZERO for echoes, releases and stick wobble)
	func event(e: InputEvent) -> Vector2i:
		if e == _last_ev: return _last
		_last_ev = e
		_last = _event(e)
		if _last != Vector2i.ZERO:
			held = _last; held_t = 0.0; steps = 0
		return _last

	func _event(e: InputEvent) -> Vector2i:
		if e is InputEventJoypadMotion:
			if e.axis != JOY_AXIS_LEFT_X and e.axis != JOY_AXIS_LEFT_Y: return Vector2i.ZERO
			var v: float = e.axis_value
			var was := _stick
			if e.axis == JOY_AXIS_LEFT_X:
				if absf(v) >= UIInput.STICK_ON: _stick.x = 1 if v > 0.0 else -1
				elif absf(v) < UIInput.STICK_OFF: _stick.x = 0
			else:
				if absf(v) >= UIInput.STICK_ON: _stick.y = 1 if v > 0.0 else -1
				elif absf(v) < UIInput.STICK_OFF: _stick.y = 0
			if _stick == was: return Vector2i.ZERO
			if e.axis == JOY_AXIS_LEFT_X and _stick.x != 0 and _stick.x != was.x: return Vector2i(_stick.x, 0)
			if e.axis == JOY_AXIS_LEFT_Y and _stick.y != 0 and _stick.y != was.y: return Vector2i(0, _stick.y)
			return Vector2i.ZERO
		if e is InputEventKey and (e.echo or not e.pressed): return Vector2i.ZERO
		if e is InputEventJoypadButton and not e.pressed: return Vector2i.ZERO
		if e is InputEventMouse or e is InputEventScreenTouch or e is InputEventScreenDrag: return Vector2i.ZERO
		for a in UIInput.NAV_ACTIONS:
			if InputMap.has_action(a) and e.is_action_pressed(a): return UIInput.NAV_ACTIONS[a]
		return Vector2i.ZERO

	# a direction event the menu didn't step on (an echo, a stick wobble): swallow it
	func swallow(e: InputEvent) -> bool:
		if e is InputEventJoypadMotion: return e.axis == JOY_AXIS_LEFT_X or e.axis == JOY_AXIS_LEFT_Y
		if e is InputEventKey and e.echo:
			for a in UIInput.NAV_ACTIONS:
				if InputMap.has_action(a) and e.is_action(a): return true
		return false

	# the direction held now (any of the nav actions, the stick past STICK_OFF)
	func _held_now() -> Vector2i:
		if not poll: return held_dir
		var d := Vector2i.ZERO
		for a in UIInput.NAV_ACTIONS:
			if InputMap.has_action(a) and Input.get_action_strength(a) >= UIInput.STICK_OFF:
				d = UIInput.NAV_ACTIONS[a]
				if d == held: return d
		return d

	# a repeat while the press is held: after NAV_DELAY, NAV_RATE a second
	func tick(dt: float) -> Vector2i:
		if held == Vector2i.ZERO: return Vector2i.ZERO
		if _held_now() != held:
			reset()
			return Vector2i.ZERO
		held_t += dt
		if held_t < UIInput.NAV_DELAY: return Vector2i.ZERO
		var want := 1 + int((held_t - UIInput.NAV_DELAY) * UIInput.NAV_RATE)
		if want > steps:
			steps = want     # (one at a time: a long frame drops the backlog, never a burst)
			return held
		return Vector2i.ZERO

# a tap or click: its position (viewport), else Vector2.INF
static func tap_pos(e: InputEvent) -> Vector2:
	if e is InputEventScreenTouch and e.pressed: return e.position
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: return e.position
	return Vector2.INF
