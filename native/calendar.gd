class_name GameCalendar
extends RefCounted
# The calendar under the town clock (clock.gd day()): a real twelve month year
# with real month lengths and leap years, Kanto's four seasons, the moon's
# phases, the sun's hours by season, and the town's events (life/calendar.json).
# Day 1 is Friday 1 April of year 1 (clock.gd: day 1 is a Friday). The leap years
# follow the real calendar of a year whose 1 April is a Friday too (2005), so
# year 4 is the first leap year and every weekday matches that real calendar.
#
#   GameCalendar.from_day(d) -> {year, month (1..12), date, doy (0 = 1 Jan), leap}
#   GameCalendar.to_day(y, m, d) -> the clock's day number
#   month_len(y, m)   is_leap(y)   season_of(month) -> "spring" | "summer" | "autumn" | "winter"
#   moon_phase(day_f) -> 0 new .. 0.5 full .. 1 (day_f: day with its fraction)
#   moon_name(p)      sun_hours(doy) -> Vector2(sunrise, sunset) in hours
#   sun_peak(doy) -> the sun's height at noon (degrees)
#   events_on(y, m, d, weekday) -> [{id, name, kind, ...}]   event(id)

const MONTHS := ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const MONTH_SHORT := ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const LEN := [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const SEASONS := ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"]
const SEASON_LABEL := {"spring": "Spring", "summer": "Summer", "autumn": "Autumn", "winter": "Winter"}
const REAL_YEAR0 := 2004        # year 1 is 2005 in the real calendar (leap years)
const START_MONTH := 4          # day 1: 1 April, year 1
const START_DATE := 1
const SYNODIC := 29.530588      # days from new moon to new moon
const NEW_MOON_DAY := 8.5       # the first new moon (day 8, 8 April, as in 2005; at noon)
const EVENTS_PATH := "res://life/calendar.json"

static var _events: Array = []
static var _loaded := false

static func is_leap(y: int) -> bool:
	var r := y + REAL_YEAR0
	return (r % 4 == 0 and r % 100 != 0) or r % 400 == 0

static func month_len(y: int, m: int) -> int:
	return 29 if m == 2 and is_leap(y) else LEN[m - 1]

static func year_len(y: int) -> int:
	return 366 if is_leap(y) else 365

# days from 1 January of year y to the given date (0 = 1 Jan)
static func doy_of(y: int, m: int, d: int) -> int:
	var n := d - 1
	for k in range(1, m): n += month_len(y, k)
	return n

# day 1 is 1 April of year 1: the day number of 1 January of year 1 is 1 - doy(1 Apr)
static func _jan1_day(y: int) -> int:
	var day := 1 - doy_of(1, START_MONTH, START_DATE)
	if y >= 1:
		for k in range(1, y): day += year_len(k)
	else:
		for k in range(y, 1): day -= year_len(k)
	return day

static func to_day(y: int, m: int, d: int) -> int:
	return _jan1_day(y) + doy_of(y, m, d)

static func from_day(day: int) -> Dictionary:
	var y := 1
	var j := _jan1_day(1)
	# whole years forward or back (a game runs for years at most: a short loop)
	while day < j:
		y -= 1
		j -= year_len(y)
	while day >= j + year_len(y):
		j += year_len(y)
		y += 1
	var doy := day - j
	var m := 1
	var left := doy
	while left >= month_len(y, m):
		left -= month_len(y, m)
		m += 1
	return {"year": y, "month": m, "date": left + 1, "doy": doy, "leap": is_leap(y)}

static func season_of(m: int) -> String:
	return SEASONS[clampi(m, 1, 12) - 1]

# 0 new .. 0.25 first quarter .. 0.5 full .. 0.75 last quarter .. 1 new
static func moon_phase(day_f: float) -> float:
	return fposmod((day_f - NEW_MOON_DAY) / SYNODIC, 1.0)

static func moon_name(p: float) -> String:
	var k := int(floor(fposmod(p, 1.0) * 8.0 + 0.5)) % 8
	return ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"][k]

# how far into summer the year is: 1 at the summer solstice (21 June), -1 at midwinter
static func summer_k(doy: int) -> float:
	return cos(TAU * (float(doy) - 171.0) / 365.25)

# sunrise and sunset (hours): about 6:00 and 19:30 in spring and autumn, the
# day 1.4 h longer at midsummer and shorter at midwinter
static func sun_hours(doy: int) -> Vector2:
	var s := summer_k(doy)
	return Vector2(6.05 - 0.7 * s, 19.45 + 0.7 * s)

# the noon sun's height (degrees): higher in summer, low in winter; on 1 April
# (doy 90, the first day) it is the fixed sun's own height (daynight.gd)
static func sun_peak(doy: int) -> float:
	return 46.7 + 17.0 * (summer_k(doy) - summer_k(90))

# ---------- events ----------
static func events() -> Array:
	if not _loaded:
		_loaded = true
		_events = []
		if FileAccess.file_exists(EVENTS_PATH):
			var j = JSON.parse_string(FileAccess.get_file_as_string(EVENTS_PATH))
			if j is Dictionary and j.get("events") is Array: _events = j.events
	return _events

static func event(id: String) -> Dictionary:
	for e in events():
		if String(e.get("id", "")) == id: return e
	return {}

# the events on a date: fixed dates (and spans, "days" long, across a month's end
# too) and weekly ones ("weekly": "sat")
static func events_on(y: int, m: int, d: int, weekday: String) -> Array:
	var out := []
	var day := to_day(y, m, d)
	for e in events():
		if e.has("weekly"):
			if String(e.weekly) == weekday: out.append(e)
			continue
		if not e.has("month"): continue
		var n := maxi(1, int(e.get("days", 1)))
		# this year's start, or last year's when a span runs over New Year
		for yy in [y, y - 1]:
			var d0 := to_day(yy, int(e.month), mini(int(e.get("date", 1)), month_len(yy, int(e.month))))
			if day >= d0 and day < d0 + n:
				out.append(e)
				break
	return out
