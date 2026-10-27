class_name GameClock
extends Node
# The town's clock. Game time by default: one game day = 48 real minutes
# (Settings "day_len"; 2 real minutes a game hour), starting at 08:00 on day 1
# (a Friday, so Saturday's market and Sunday's rest come round soon); or the
# device's own clock (Settings "clock" = "real"). Debug: T = +1 h, Shift+T = +6 h,
# F4 = fast-forward (x30) on / off. A small readout sits at the top right
# (Settings "clock_hud").
#
#   hour() -> float 0..24    minute_of_day() -> int    day() -> int (1 = the first morning)
#   time_text() -> "7:30 AM" period() -> "dawn" | "morning" | "midday" | "afternoon" | "evening" | "night"
#   weekday() -> "mon".."sun"   day_text() -> "Fri"   is_market_day()  is_rest_day()
#   skip(hours)              signal hour_changed(h: int)   signal day_changed(d: int)
#   signal jumped(minutes)   (a skip or a switch of mode: the town re-sorts itself)
#   ff                       fast-forward factor (game time and the town's sim run that much faster)
#   rate()                   game minutes per real second, ff included

signal hour_changed(h: int)
signal day_changed(d: int)
signal jumped(minutes: float)

var START_MIN := preload("res://tunables.gd").num("clock", "start_hour", 8.0) * 60.0   # (world editor tunables)
const WEEK := ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
const WEEK_LABEL := {"mon": "Mon", "tue": "Tue", "wed": "Wed", "thu": "Thu", "fri": "Fri", "sat": "Sat", "sun": "Sun"}
static var FIRST_WEEKDAY := int(preload("res://tunables.gd").num("clock", "first_weekday", 4))     # day 1 is a Friday (world editor tunables)

var minutes := START_MIN     # game minutes since 00:00 of day 0 (day 1 starts at 1440)
var ff := 1.0
var paused := false
var real := false
var _last_hour := -1
var _last_day := -1
var _real_day0 := 0
var hud: Control           # the clock readout (_Readout: a small dark plate, top right)
var _hud_acc := 1.0

func _init() -> void:
	minutes = 1440.0 + START_MIN

func _ready() -> void:
	name = "GameClock"
	process_priority = -10   # before the scene's _process, so the town sees this frame's time
	_real_day0 = int(Time.get_unix_time_from_system() / 86400.0)
	var layer := CanvasLayer.new()
	layer.layer = 3
	add_child(layer)
	hud = _Readout.new()
	layer.add_child(hud)
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--clock="):   # --clock=HH:MM[,day]
			var p := a.substr(8).split(",")
			var hm := p[0].split(":")
			var d := int(p[1]) if p.size() > 1 else 1
			minutes = d * 1440.0 + float(hm[0]) * 60.0 + (float(hm[1]) if hm.size() > 1 else 0.0)
		elif a.begins_with("--clock-ff="): ff = float(a.substr(11))
	Settings.changed.connect(_on_setting)
	_on_setting("clock", Settings.get_value("clock"))
	_on_setting("clock_hud", Settings.get_value("clock_hud"))
	_last_hour = int(hour()); _last_day = day()

func _on_setting(key: String, v) -> void:
	match key:
		"clock":
			var was := real
			real = v == "real"
			if real != was:
				var before := minutes
				if real: _sync_real()
				jumped.emit(minutes - before)
		"clock_hud":
			if hud: hud.visible = int(v) == 1

func _sync_real() -> void:
	var t := Time.get_datetime_dict_from_system()
	var d := int(Time.get_unix_time_from_system() / 86400.0) - _real_day0 + 1
	minutes = d * 1440.0 + t.hour * 60.0 + t.minute + t.second / 60.0

# game minutes per real second
func rate() -> float:
	if real: return ff / 60.0
	return 1440.0 / (float(Settings.get_value("day_len")) * 60.0) * ff

func advance(dt: float) -> void:
	if paused: return
	if real and ff == 1.0: _sync_real()
	else: minutes += dt * rate()
	_tick()

func _process(dt: float) -> void:
	advance(dt)
	_hud_acc += dt
	if hud and hud.visible and _hud_acc > 0.5:
		_hud_acc = 0.0
		hud.set_text(day_text(), time_text(), ff > 1.0)

func _tick() -> void:
	var h := int(hour())
	var d := day()
	if d != _last_day:
		_last_day = d
		day_changed.emit(d)
	if h != _last_hour:
		_last_hour = h
		hour_changed.emit(h)

func skip(hours: float) -> void:
	minutes += hours * 60.0
	if real: ff = 1.0   # leaves real time for game time from here (until the setting is set again)
	real = false
	_tick()
	jumped.emit(hours * 60.0)

func set_time(h: float, d := -1) -> void:
	var before := minutes
	minutes = (day() if d < 0 else d) * 1440.0 + h * 60.0
	_tick()
	jumped.emit(minutes - before)

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo:
		if e.physical_keycode == KEY_T:
			skip(6.0 if e.shift_pressed else 1.0)
			get_viewport().set_input_as_handled()
		elif e.physical_keycode == KEY_F4:
			ff = 1.0 if ff > 1.0 else 30.0
			get_viewport().set_input_as_handled()

# ---------- reading it ----------
func hour() -> float: return fmod(minutes, 1440.0) / 60.0
func minute_of_day() -> int: return int(fmod(minutes, 1440.0))
func day() -> int: return int(minutes / 1440.0)
func weekday() -> String: return WEEK[(day() - 1 + FIRST_WEEKDAY) % 7]
func day_text() -> String: return WEEK_LABEL[weekday()]
func is_market_day() -> bool: return weekday() == "sat"
func is_rest_day() -> bool: return weekday() == "sun"

func time_text() -> String:
	var m := minute_of_day()
	var h := m / 60
	var mm := m % 60
	var h12 := h % 12
	if h12 == 0: h12 = 12
	return "%d:%02d %s" % [h12, mm, "AM" if h < 12 else "PM"]

static func period_of(h: float) -> String:
	if h < 5.0 or h >= 21.0: return "night"
	if h < 7.0: return "dawn"
	if h < 11.0: return "morning"
	if h < 14.0: return "midday"
	if h < 18.0: return "afternoon"
	return "evening"

func period() -> String: return period_of(hour())


# the clock on screen: a clock icon, the day dim, the time bright, on a dark
# skewed plate left of the quest log button (quest_ui.gd), in the safe area;
# redrawn only when the text changes
class _Readout extends Control:
	var day := ""
	var time := ""
	var fast := false
	var _raw := ""
	var right_gap := 76.0   # room for the quest log button at its right (0 when the island holds it)
	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		get_viewport().size_changed.connect(_place)
	func set_text(d: String, t: String, f: bool) -> void:
		var raw := d + "|" + t + str(f)
		if raw == _raw: return
		_raw = raw
		day = d.to_upper(); time = t.to_upper(); fast = f
		_place()
		queue_redraw()
	func _place() -> void:
		var w := 58.0 + UITheme.text_w(day, "label", 16) + UITheme.text_w(time, "number", 21) + (34.0 if fast else 0.0)
		var sr := UITheme.safe_rect(self)
		size = Vector2(w, 38)
		position = Vector2(sr.end.x - 20.0 - right_gap - w, sr.position.y + 25.0)
	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		UITheme.plate(self, r, 0.92)
		UITheme.icon(self, "clock", Vector2(22, r.get_center().y), 8.5, UITheme.YELLOW)
		var x := 38.0
		x += UITheme.text_mid(self, Vector2(x, r.get_center().y), day, "label", 16, UITheme.TEXT_DIM) + 8.0
		x += UITheme.text_mid(self, Vector2(x, r.get_center().y), time, "number", 21, UITheme.TEXT)
		if fast: UITheme.chevrons(self, Vector2(x + 10.0, r.get_center().y), 16.0, UITheme.YELLOW, 2)
