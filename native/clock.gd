class_name GameClock
extends Node
# The town's clock. Game time by default: one game day = 120 real minutes
# (Settings "day_len"; 5 real minutes a game hour), starting at 08:00 on day 1
# (a Friday, so Saturday's market and Sunday's rest come round soon); or the
# device's own clock and date (Settings "clock" = "real"). Debug: T = +1 h, Shift+T = +6 h,
# F4 = fast-forward (x30) on / off. A small readout sits at the top right
# (Settings "clock_hud"); a tap on it opens the calendar (calendar_ui.gd).
# The date and time are saved (user://clock.save) and come back in the next
# game (the real game only: not in dev scenes and tests, nor with --clock=).
#
#   hour() -> float 0..24    minute_of_day() -> int    day() -> int (1 = the first morning)
#   time_text() -> "7:30 AM" period() -> "dawn" | "morning" | "midday" | "afternoon" | "evening" | "night"
#   weekday() -> "mon".."sun"   day_text() -> "Fri"   is_market_day()  is_rest_day()
#   skip(hours)              signal hour_changed(h: int)   signal day_changed(d: int)
#   signal jumped(minutes)   (a skip or a switch of mode: the town re-sorts itself)
#   ff                       fast-forward factor (game time and the town's sim run that much faster)
#   rate()                   game minutes per real second, ff included
# The calendar (calendar.gd; day 1 = Friday 1 April, year 1):
#   year() month() date() season() date_text() -> "Fri 1 Apr"   moon_phase() 0 new .. 0.5 full
#   sun_hours() -> Vector2(sunrise, sunset)   is_event_day(id)   events_today() -> [{id, name, kind}]
#   signal calendar_changed(d) (a new date, a skip or a load)   signal season_changed(s)
#   signal event_day(events) (the morning of an event day, the ones with a toast: cast.gd's banner)
#   open_calendar()   blocks_touch(pos)

signal hour_changed(h: int)
signal day_changed(d: int)
signal jumped(minutes: float)
signal calendar_changed(d: int)
signal season_changed(s: String)
signal event_day(events: Array)

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
var hud: Control           # the clock readout (_Readout: a small dark plate, top right)
var _hud_acc := 1.0
var cal_ui: CanvasLayer    # the calendar screen (calendar_ui.gd), made when first opened
var _cal_day := -999999    # the day _cal holds
var _cal := {}             # GameCalendar.from_day(day())
var _season := ""
var _announced := -1       # the day whose events were announced
var save_path := "user://clock.save"
var persist := false       # save and restore (the real game only: screens.tscn)
var _save_acc := 0.0

func _init() -> void:
	minutes = 1440.0 + START_MIN

func _ready() -> void:
	name = "GameClock"
	process_priority = -10   # before the scene's _process, so the town sees this frame's time
	var layer := CanvasLayer.new()
	layer.layer = 3
	add_child(layer)
	hud = _Readout.new()
	hud.tapped.connect(open_calendar)
	layer.add_child(hud)
	persist = Screens.I != null   # the real game (a test or a shot runs main.tscn itself)
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--clock="):   # --clock=HH:MM[,day]
			var p := a.substr(8).split(",")
			var hm := p[0].split(":")
			var d := int(p[1]) if p.size() > 1 else 1
			minutes = d * 1440.0 + float(hm[0]) * 60.0 + (float(hm[1]) if hm.size() > 1 else 0.0)
			persist = false
		elif a.begins_with("--clock-ff="): ff = float(a.substr(11))
	if persist: load_state()
	Settings.changed.connect(_on_setting)
	_on_setting("clock", Settings.get_value("clock"))
	_on_setting("clock_hud", Settings.get_value("clock_hud"))
	_last_hour = int(hour()); _last_day = day()
	_season = season()
	# an event day already under way when the game starts: its banner after the town's own
	get_tree().create_timer(6.0).timeout.connect(_announce)

func _notification(what: int) -> void:
	if what in [NOTIFICATION_WM_CLOSE_REQUEST, NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_EXIT_TREE]:
		if persist: save_state()

# ---------- saving ----------
func save_state() -> void:
	if real: return   # the phone's clock needs no saving
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f: f.store_string(JSON.stringify({"v": 1, "minutes": minutes}))

func load_state() -> bool:
	if not FileAccess.file_exists(save_path): return false
	var v: Variant = JSON.parse_string(FileAccess.get_file_as_string(save_path))
	if not v is Dictionary or not (v.get("minutes") is float or v.get("minutes") is int): return false
	minutes = maxf(1440.0, float(v.minutes))
	return true

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
	# the phone's date too: the calendar's (year 1 = 2005) day for today
	var t := Time.get_datetime_dict_from_system()
	var d := GameCalendar.to_day(int(t.year) - GameCalendar.REAL_YEAR0, int(t.month), int(t.day))
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
		hud.set_text(date_text(), time_text(), ff > 1.0)
	if persist:
		_save_acc += dt
		if _save_acc > 30.0:
			_save_acc = 0.0
			save_state()

func _tick() -> void:
	var h := int(hour())
	var d := day()
	if d != _last_day:
		_last_day = d
		day_changed.emit(d)
		calendar_changed.emit(d)
		_season_check()
	if h != _last_hour:
		_last_hour = h
		hour_changed.emit(h)
		if h >= 7 and h < 20: _announce()

func _season_check() -> void:
	var s := season()
	if s != _season:
		_season = s
		season_changed.emit(s)

# the day's events with a banner line, once a day, from 7 in the morning
func _announce() -> void:
	if not is_inside_tree() or _announced == day() or hour() < 7.0 or hour() >= 20.0: return
	_announced = day()
	var ev := events_today().filter(func(e): return String(e.get("toast", "")) != "")
	if not ev.is_empty(): event_day.emit(ev)

func skip(hours: float) -> void:
	minutes += hours * 60.0
	if real: ff = 1.0   # leaves real time for game time from here (until the setting is set again)
	real = false
	_tick()
	jumped.emit(hours * 60.0)
	calendar_changed.emit(day())

func set_time(h: float, d := -1) -> void:
	var before := minutes
	minutes = (day() if d < 0 else d) * 1440.0 + h * 60.0
	_tick()
	jumped.emit(minutes - before)
	calendar_changed.emit(day())

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

# ---------- the calendar (calendar.gd) ----------
func cal() -> Dictionary:
	var d := day()
	if d != _cal_day:
		_cal_day = d
		_cal = GameCalendar.from_day(d)
	return _cal
func year() -> int: return int(cal().year)
func month() -> int: return int(cal().month)
func date() -> int: return int(cal().date)
func day_of_year() -> int: return int(cal().doy)
func season() -> String: return GameCalendar.season_of(month())
func moon_phase() -> float: return GameCalendar.moon_phase(minutes / 1440.0)
func sun_hours() -> Vector2: return GameCalendar.sun_hours(day_of_year())
func date_text() -> String: return "%s %d %s" % [day_text(), date(), GameCalendar.MONTH_SHORT[month() - 1]]
func events_today() -> Array: return GameCalendar.events_on(year(), month(), date(), weekday())
func is_event_day(id: String) -> bool:
	for e in events_today():
		if String(e.get("id", "")) == id: return true
	return false

func open_calendar() -> void:
	if cal_ui == null:
		cal_ui = preload("res://calendar_ui.gd").new()
		cal_ui.clock = self
		add_child(cal_ui)
	cal_ui.open()

func blocks_touch(pos: Vector2) -> bool:
	if cal_ui and cal_ui.is_open(): return true
	return hud != null and hud.visible and Rect2(hud.position, hud.size).grow(8).has_point(pos)

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
	signal tapped
	var day := ""
	var time := ""
	var fast := false
	var _raw := ""
	var right_gap := 76.0   # room for the quest log button at its right (0 when the island holds it)
	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		get_viewport().size_changed.connect(_place)
	func _gui_input(e: InputEvent) -> void:
		if (e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT and e.pressed) or (e is InputEventScreenTouch and e.pressed):
			accept_event()
			tapped.emit()
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
