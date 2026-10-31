extends Node
# Dev test for the calendar (calendar.gd), the clock's calendar and saving
# (clock.gd), the day length's migration (settings.gd) and the day and night's
# sun and light (daynight.gd). Headless:
#   godot --headless --path native res://dev/calendar_test.tscn
# exits 0 when green. Checks: month lengths and leap years, every date against
# the real calendar (year 1 = 2005: weekdays too, so day 1 is a Friday), the
# seasons' boundaries and season_changed, the moon's phases, events by date,
# the clock's save round trip, day_len migration, the sun's place by hour and
# season, and the light's blend (no jumps from one minute to the next, midday
# exactly the fixed look).

var checks := 0
var fails := 0

func ok(cond: bool, msg: String) -> void:
	checks += 1
	if not cond:
		fails += 1
		printerr("FAIL: " + msg)

func _ready() -> void:
	_dates()
	_seasons()
	_moon()
	_events()
	_clock()
	_migration()
	_sun()
	_blend()
	_globals()
	print("calendar_test: %d checks, %d failures" % [checks, fails])
	print("CALENDAR TEST " + ("GREEN" if fails == 0 else "RED"))
	get_tree().quit(1 if fails > 0 else 0)

# ---------- dates ----------
func _dates() -> void:
	var C := GameCalendar
	ok(C.month_len(1, 2) == 28 and C.month_len(4, 2) == 29 and C.month_len(3, 2) == 28, "February: 28, 29 in year 4 (2008)")
	ok(not C.is_leap(96) and C.is_leap(396), "century rule (2100 no, 2400 yes)")
	for m in range(1, 13): ok(C.month_len(1, m) == [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1], "month %d length" % m)
	var d1 := C.from_day(1)
	ok(d1.year == 1 and d1.month == 4 and d1.date == 1, "day 1 is 1 April, year 1: %s" % d1)
	ok(C.from_day(31).month == 5 and C.from_day(31).date == 1, "day 31 is 1 May")
	ok(C.from_day(0).month == 3 and C.from_day(0).date == 31, "day 0 is 31 March")
	# every day for twelve years against the real calendar (2005 on): date and weekday
	var bad := 0
	var wk := ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
	var u0 := Time.get_unix_time_from_datetime_dict({"year": 2005, "month": 4, "day": 1, "hour": 12})
	for day in range(-100, 4400):
		var c := C.from_day(day)
		var real := Time.get_datetime_dict_from_unix_time(int(u0 + (day - 1) * 86400))
		var game_wd: String = GameClock.WEEK[((day - 1 + GameClock.FIRST_WEEKDAY) % 7 + 7) % 7]
		if int(c.year) + 2004 != int(real.year) or int(c.month) != int(real.month) or int(c.date) != int(real.day) or game_wd != wk[int(real.weekday)]:
			if bad < 3: printerr("  day %d: game %s %s, real %s" % [day, c, game_wd, real])
			bad += 1
		if C.to_day(int(c.year), int(c.month), int(c.date)) != day: bad += 1
	ok(bad == 0, "every date and weekday matches the real 2005.. calendar, and to_day inverts from_day (%d bad)" % bad)
	ok(GameClock.WEEK[GameClock.FIRST_WEEKDAY] == "fri", "day 1 is a Friday")

# ---------- seasons ----------
func _seasons() -> void:
	var C := GameCalendar
	for t in [[3, 1, "spring"], [5, 31, "spring"], [6, 1, "summer"], [8, 31, "summer"], [9, 1, "autumn"], [11, 30, "autumn"], [12, 1, "winter"], [2, 28, "winter"], [1, 15, "winter"]]:
		ok(C.season_of(t[0]) == t[2], "%d/%d is %s" % [t[1], t[0], t[2]])
	var c := GameClock.new()
	add_child(c)
	var got := []
	c.season_changed.connect(func(s): got.append(s))
	c.set_time(23.5, C.to_day(1, 5, 31))
	got.clear()
	c.advance(60.0 / c.rate() * 1.0)   # an hour of game time: into 1 June
	ok(c.month() == 6 and c.date() == 1, "advanced into 1 June: %s" % c.date_text())
	ok(got == ["summer"], "season_changed(summer) at the turn of June: %s" % [got])
	c.queue_free()

# ---------- the moon ----------
func _moon() -> void:
	var C := GameCalendar
	ok(C.moon_phase(C.NEW_MOON_DAY) < 0.001, "new moon on day 8")
	ok(absf(C.moon_phase(C.NEW_MOON_DAY + C.SYNODIC * 0.5) - 0.5) < 0.001, "full a half month later")
	ok(C.moon_phase(C.NEW_MOON_DAY + C.SYNODIC * 3.0) < 0.001 or C.moon_phase(C.NEW_MOON_DAY + C.SYNODIC * 3.0) > 0.999, "the cycle repeats")
	ok(C.moon_name(0.5) == "Full moon" and C.moon_name(0.0) == "New moon" and C.moon_name(0.25) == "First quarter", "phase names")
	var jump := 0.0
	for i in 3000:
		var a := C.moon_phase(i * 0.1)
		var b := C.moon_phase(i * 0.1 + 0.1)
		var dd := fposmod(b - a, 1.0)
		jump = maxf(jump, dd)
	ok(jump < 0.004, "the phase moves smoothly (%f a tenth of a day)" % jump)

# ---------- events ----------
func _events() -> void:
	var C := GameCalendar
	ok(not C.events().is_empty(), "life/calendar.json loads")
	var ids := func(y, m, d): return C.events_on(y, m, d, GameClock.WEEK[((C.to_day(y, m, d) - 1 + GameClock.FIRST_WEEKDAY) % 7 + 7) % 7]).map(func(e): return e.id)
	ok(ids.call(1, 4, 9).has("spring_festival") and ids.call(1, 4, 10).has("spring_festival") and not ids.call(1, 4, 11).has("spring_festival"), "the spring festival: 9 and 10 April")
	ok(ids.call(1, 4, 2).has("market_day"), "2 April (a Saturday) is market day")
	ok(not ids.call(1, 4, 3).has("market_day"), "Sunday is not")
	ok(ids.call(2, 1, 1).has("new_year") and ids.call(2, 1, 3).has("new_year") and not ids.call(2, 1, 4).has("new_year"), "New Year: 1 to 3 January")
	ok(ids.call(1, 12, 25).has("winter_lights") and not ids.call(1, 12, 26).has("winter_lights"), "Winter Lights: 20 to 25 December")
	ok(ids.call(1, 8, 28).has("ash_birthday") and ids.call(1, 11, 16).has("gary_birthday"), "birthdays")
	ok(ids.call(1, 9, 1).has("league_start") and ids.call(1, 8, 15).has("summer_fireworks") and ids.call(1, 10, 16).has("harvest_fair"), "the league, the fireworks, the fair")
	for e in C.events():
		ok(e.has("id") and e.has("name") and (e.has("weekly") or (e.has("month") and e.has("date"))), "event %s is well formed" % e.get("id", "?"))
	var c := GameClock.new()
	add_child(c)
	var heard := []
	c.event_day.connect(func(evs): heard.append(evs))
	c.set_time(9.0, C.to_day(1, 4, 9))   # (the hour's turn announces it)
	ok(c.is_event_day("spring_festival") and not c.is_event_day("new_year"), "clock.is_event_day")
	ok(heard.size() == 1 and heard[0][0].id == "spring_festival", "the morning announcement: %s" % [heard])
	c._announce()
	ok(heard.size() == 1, "announced once a day")
	ok(c.date_text() == "Sat 9 Apr", "date_text: %s" % c.date_text())
	c.queue_free()

# ---------- the clock: saving ----------
func _clock() -> void:
	var c := GameClock.new()
	add_child(c)
	c.save_path = "user://clock_test.save"
	c.set_time(17.25, GameCalendar.to_day(2, 2, 29 if GameCalendar.is_leap(2) else 28))
	var m := c.minutes
	c.save_state()
	var c2 := GameClock.new()
	c2.save_path = c.save_path
	ok(c2.load_state() and absf(c2.minutes - m) < 0.001, "clock save round trip: %f vs %f" % [c2.minutes, m])
	add_child(c2)
	ok(c2.date_text() == c.date_text() and c2.time_text() == "5:15 PM", "the same date and time after loading: %s %s" % [c2.date_text(), c2.time_text()])
	ok(not c.persist, "a test's clock does not save on its own")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(c.save_path))
	c.queue_free(); c2.queue_free()
	ok(absf(1440.0 / (120.0 * 60.0) - GameClock.new().rate()) < 1e-6 or int(Settings.get_value("day_len")) != 120, "the default day: 120 real minutes")

# ---------- settings: day_len migration ----------
func _migration() -> void:
	var path := "user://settings_migrate_test.cfg"
	for t in [[48, 1, 120], [96, 1, 96], [24, 1, 24], [48, 2, 48], [-1, 1, 120]]:
		var cfg := ConfigFile.new()
		cfg.set_value("gfx", "preset", "high")
		cfg.set_value("gfx", "o", {})
		cfg.set_value("more", "v", {} if t[0] < 0 else {"day_len": t[0]})
		if t[1] > 1: cfg.set_value("more", "ver", t[1])
		cfg.save(path)
		var S: Node = preload("res://settings.gd").new()
		S.path = path
		S._load()
		ok(int(S.get_value("day_len")) == t[2], "day_len %d saved by version %d -> %d (got %s)" % [t[0], t[1], t[2], S.get_value("day_len")])
		var back := ConfigFile.new()
		back.load(path)
		ok(int(back.get_value("more", "ver", 1)) == 2, "the file is marked version 2 after loading")
		S.free()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	ok(int(Settings.EXTRA0.day_len) == 120 and int(Settings.EXTRA0.daynight) == 1, "defaults: 120 min a day, the cycle on")

# ---------- the sun ----------
func _sun() -> void:
	var D := DayNight
	var s0 := D.SUN0
	var ref := D.sun_dir_at(D.REF_HOUR, D.REF_DOY)
	ok(ref.dot(s0) > 0.99999, "13:00 on 1 April: the fixed sun (%s vs %s)" % [ref, s0])
	for doy in [90, 172, 265, 355]:
		var h := GameCalendar.sun_hours(doy)
		ok(absf(D.sun_dir_at(h.x, doy).y) < 0.01 and absf(D.sun_dir_at(h.y, doy).y) < 0.01, "doy %d: on the horizon at sunrise and sunset" % doy)
		ok(D.sun_dir_at(0.0, doy).y < -0.3, "doy %d: well down at midnight" % doy)
		ok(D.sun_dir_at(h.x + 1.0, doy).x > 0.0 and D.sun_dir_at(h.y - 1.0, doy).x < 0.0, "doy %d: east (+x) in the morning, west in the evening" % doy)
	var h1 := GameCalendar.sun_hours(172)
	var h2 := GameCalendar.sun_hours(355)
	ok(h1.y - h1.x > 14.0 and h2.y - h2.x < 12.5, "longer days in summer (%.1f h), shorter in winter (%.1f h)" % [h1.y - h1.x, h2.y - h2.x])
	ok(absf(GameCalendar.sun_hours(90).x - 6.0) < 0.2 and absf(GameCalendar.sun_hours(90).y - 19.5) < 0.2, "spring: sunrise about 6, sunset about 19:30")
	var noon := func(doy): var hh := GameCalendar.sun_hours(doy); return D.sun_dir_at((hh.x + hh.y) * 0.5, doy).y
	ok(noon.call(172) > noon.call(90) and noon.call(90) > noon.call(355), "the noon sun higher in summer, lower in winter")
	var low := 1.0
	for i in 24 * 12:
		var hr := i / 12.0
		var sd := D.sun_dir_at(hr, 90)
		var md := D.moon_dir_at(hr, 90, 0.5)
		low = minf(low, D.light_dir_at(sd, md).y)
	ok(low >= sin(deg_to_rad(D.LIGHT_MIN_E)) - 0.02, "the shadow light never comes from low or below (lowest %.3f)" % low)
	# full moon: up at midnight; new moon: down at midnight
	ok(D.moon_dir_at(0.5, 90, 0.5).y > 0.4 and D.moon_dir_at(0.5, 90, 0.0).y < 0.0, "the full moon high at midnight, the new moon down")

# ---------- the light's blend ----------
# the largest change of a colour (or, halved: the lamps, windows, stars, glow
# switching on over twenty minutes or so is a fade, not a pop)
func _diff(a: Dictionary, b: Dictionary) -> float:
	var m := 0.0
	for k in ["sun", "amb", "top", "mid", "hor", "fog"]:
		var ca: Color = a[k]; var cb: Color = b[k]
		m = maxf(m, maxf(absf(ca.r - cb.r), maxf(absf(ca.g - cb.g), absf(ca.b - cb.b))))
	for k in ["glow", "night", "stars", "lamps", "windows", "fireflies"]:
		m = maxf(m, absf(float(a[k]) - float(b[k])) * (0.25 if k == "glow" else 0.5))
	return m

func _blend() -> void:
	var D := DayNight
	for t in [[90, "spring"], [172, "summer"], [265, "autumn"], [355, "winter"]]:
		var worst := 0.0
		var at := 0.0
		var ang := 0.0
		var prev := D.sample(0.0, t[0], 0.3, t[1])
		for i in range(1, 24 * 60 + 1):
			var hr := i / 60.0
			var s := D.sample(hr, t[0], 0.3, t[1])
			var d := _diff(prev, s)
			if d > worst: worst = d; at = hr
			ang = maxf(ang, rad_to_deg((prev.light_dir as Vector3).angle_to(s.light_dir)))
			prev = s
		ok(worst < 0.04, "%s: no colour jumps minute to minute (worst %.4f at %.2f h)" % [t[1], worst, at])
		ok(ang < 3.0, "%s: the light turns smoothly (worst %.2f degrees a minute)" % [t[1], ang])
	# midday in spring: exactly the fixed look
	for hr in [9.0, 11.0, 13.0, 15.0, 16.5]:
		var s := D.sample(hr, 90, 0.3, "spring")
		ok(s.sun == Color(1, 1, 1) and s.amb == Color(1, 1, 1) and s.midday and s.lamps == 0.0 and s.stars == 0.0, "%.1f h in spring: the midday look" % hr)
		ok((s.top as Color).is_equal_approx(Color(0.07, 0.3, 0.82)) and (s.hor as Color).is_equal_approx(Color(0.8, 0.92, 0.96)), "%.1f h: the midday sky" % hr)
		ok((s.fog as Color).is_equal_approx(D.FOG0), "%.1f h: the midday haze" % hr)
	var n := D.sample(23.0, 90, 0.5, "spring")
	ok(n.night > 0.95 and n.lamps > 0.95 and n.stars > 0.5, "23:00: night, lamps lit, stars out")
	var lum := (n.sun as Color).get_luminance()
	ok(lum > 0.15 and lum < 0.5, "the night is dim but readable (lit tint luminance %.2f)" % lum)
	var dusk := D.sample(GameCalendar.sun_hours(90).y, 90, 0.5, "spring")
	ok((dusk.sun as Color).r > (dusk.sun as Color).b + 0.3, "sunset: warm light")
	var dawn := D.sample(GameCalendar.sun_hours(90).x, 90, 0.5, "spring")
	ok((dawn.sun as Color).r > (dawn.sun as Color).g and (dawn.hor as Color).r > 0.9, "dawn: pink-orange")
	ok(D.sample(1.0, 172, 0.5, "summer").fireflies > 0.0 and D.sample(22.0, 355, 0.5, "winter").fireflies == 0.0, "fireflies on summer nights, none in winter")

# the globals' defaults: project.godot's and daynight.gd's are the same
func _globals() -> void:
	for g in DayNight.GLOBALS:
		var key := "shader_globals/" + String(g[0])
		ok(ProjectSettings.has_setting(key), "%s is in project.godot" % g[0])
		if ProjectSettings.has_setting(key):
			var v = ProjectSettings.get_setting(key).get("value")
			ok(v is Vector4 and (v as Vector4).is_equal_approx(g[1]), "%s: the same default (%s, %s)" % [g[0], v, g[1]])
