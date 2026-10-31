class_name DayNight
extends Node
# The day and night (main.gd makes one): the sun's arc by the hour and the
# season (calendar.gd), dawn, the day, golden hour, dusk and a moonlit night,
# the moon by its phase and the stars. Nothing is re-baked: the light reaches
# every shader through a few global uniforms (shaders/daynight.gdshaderinc,
# registered in project.godot and again in settings.gd _init for an app built
# before them), set five times a second; the sun's node turns with them (its
# shadows follow the sun, then the moon). The night's lights, lamps, windows
# and fireflies, are night_fx.gd's.
#
# The midday look is today's fixed one exactly: between about 8:00 and 17:00 (the
# sun above 22 degrees) every tint is white, and at 13:00 on the first day
# (1 April) the sun stands where the fixed sun stood (render.json sun_dir).
# Settings "daynight" off: the fixed midday look all day (as before).
#
# Indoors the room keeps its own key light; the globals give it a warmer lamp lit
# tint at night, the window views the hour's colour and the sunlight patches
# fade (interior.gd). The Battle Arena is outdoors at Oak's: it follows the clock
# too (a battle at night looks like night), sharing this node and the town's sun.
# Weather: weather_hook (a Callable(state: Dictionary) -> void, null now) may
# change a sample before it is applied (clouds over, rain light), later.
#
#   DayNight.sample(hour, doy, moon_phase) -> state   (pure: tests, renders)
#   DayNight.sun_dir_at(hour, doy)   DayNight.light_dir_at(...)   force_update()

const T := preload("res://tunables.gd")
# the globals and their defaults: the fixed midday look (project.godot has the same)
const GLOBALS := [
	["dn_sun", Vector4(1, 1, 1, 0)], ["dn_amb", Vector4(1, 1, 1, 0)],
	["dn_dir", Vector4(-0.532, 0.726, 0.435, 0)], ["dn_sun_pos", Vector4(-0.532, 0.726, 0.435, 0)],
	["dn_moon", Vector4(0, 1, 0, 0.5)],
	["dn_sky_top", Vector4(0.07, 0.3, 0.82, 0)], ["dn_sky_mid", Vector4(0.28, 0.6, 0.95, 1)], ["dn_sky_hor", Vector4(0.8, 0.92, 0.96, 0)],
	["dn_fog", Vector4(0.769, 0.886, 0.941, 0)], ["dn_glow", Vector4(0, 0, 0, 0)], ["dn_view", Vector4(1, 1, 1, 0)]]
const RATE := 0.2             # seconds between updates
const SWEEP := deg_to_rad(105.0)   # the sun's azimuth from noon to its rising (and setting)
const REF_DOY := 90           # 1 April: the day the fixed sun is matched
const REF_HOUR := 13.0
const LIGHT_MIN_E := 14.0     # the shadow light never lower than this (degrees: longer shadows draw many more casters)

# the light by the sun's height (degrees), morning and evening: tints of lit and
# shaded surfaces (linear: the cel shaders tone map them, so a night at a tenth of
# the light still reads on screen as about a third), the sky's three bands, its
# sun glow. Above the last key: midday.
const W := Color(1, 1, 1)
const KEYS_AM := [
	{"e": -14.0, "sun": Color(0.115, 0.15, 0.30), "amb": Color(0.065, 0.08, 0.17), "top": Color(0.012, 0.02, 0.065), "mid": Color(0.03, 0.05, 0.14), "hor": Color(0.07, 0.10, 0.21), "glow": 0.0},
	{"e": -6.0, "sun": Color(0.20, 0.17, 0.30), "amb": Color(0.12, 0.11, 0.21), "top": Color(0.05, 0.08, 0.22), "mid": Color(0.17, 0.17, 0.36), "hor": Color(0.50, 0.36, 0.50), "glow": 0.5},
	{"e": 0.0, "sun": Color(0.90, 0.55, 0.50), "amb": Color(0.48, 0.38, 0.56), "top": Color(0.16, 0.24, 0.52), "mid": Color(0.62, 0.52, 0.72), "hor": Color(1.0, 0.70, 0.58), "glow": 1.6},
	{"e": 7.0, "sun": Color(1.08, 0.88, 0.74), "amb": Color(0.76, 0.74, 0.92), "top": Color(0.10, 0.30, 0.74), "mid": Color(0.40, 0.60, 0.90), "hor": Color(0.96, 0.86, 0.76), "glow": 1.3},
	{"e": 14.0, "sun": Color(1.04, 0.99, 0.93), "amb": Color(0.93, 0.94, 1.0), "top": Color(0.08, 0.30, 0.80), "mid": Color(0.31, 0.60, 0.94), "hor": Color(0.86, 0.90, 0.92), "glow": 1.1},
	{"e": 22.0, "sun": W, "amb": W, "top": Color(0.07, 0.30, 0.82), "mid": Color(0.28, 0.60, 0.95), "hor": Color(0.80, 0.92, 0.96), "glow": 1.0},
]
const KEYS_PM := [
	{"e": -14.0, "sun": Color(0.115, 0.15, 0.30), "amb": Color(0.065, 0.08, 0.17), "top": Color(0.012, 0.02, 0.065), "mid": Color(0.03, 0.05, 0.14), "hor": Color(0.07, 0.10, 0.21), "glow": 0.0},
	{"e": -6.0, "sun": Color(0.22, 0.16, 0.30), "amb": Color(0.12, 0.10, 0.21), "top": Color(0.05, 0.07, 0.21), "mid": Color(0.18, 0.15, 0.34), "hor": Color(0.52, 0.30, 0.42), "glow": 0.5},
	{"e": 0.0, "sun": Color(0.85, 0.45, 0.27), "amb": Color(0.42, 0.30, 0.50), "top": Color(0.14, 0.19, 0.46), "mid": Color(0.58, 0.40, 0.60), "hor": Color(1.0, 0.54, 0.30), "glow": 1.8},
	{"e": 7.0, "sun": Color(1.12, 0.82, 0.55), "amb": Color(0.72, 0.66, 0.86), "top": Color(0.10, 0.28, 0.70), "mid": Color(0.40, 0.56, 0.84), "hor": Color(1.0, 0.82, 0.58), "glow": 1.4},
	{"e": 14.0, "sun": Color(1.06, 0.97, 0.86), "amb": Color(0.90, 0.90, 0.98), "top": Color(0.08, 0.30, 0.79), "mid": Color(0.31, 0.60, 0.93), "hor": Color(0.88, 0.90, 0.90), "glow": 1.15},
	{"e": 22.0, "sun": W, "amb": W, "top": Color(0.07, 0.30, 0.82), "mid": Color(0.28, 0.60, 0.95), "hor": Color(0.80, 0.92, 0.96), "glow": 1.0},
]
const FOG0 := Color("c4e2f0")
# a season's slight palette: warmer summer, cooler winter (spring as is). No snow
# or autumn leaves yet: the clock's season_changed is where they would hook in.
const SEASON_TINT := {"spring": Color(1, 1, 1), "summer": Color(1.025, 1.0, 0.965), "autumn": Color(1.02, 0.995, 0.97), "winter": Color(0.97, 0.99, 1.03)}

static var SUN0 := T.vec3("render", "sun_dir", Vector3(-0.55, 0.75, 0.45)).normalized()
static var _cal_k := -1.0     # the arc's height scale (calibrated on the first use)
static var _az_noon := 0.0

var main: Node3D
var clock: GameClock
var sun: DirectionalLight3D
var env: Environment
var fx: Node3D                # night_fx.gd
var enabled := true
var state := {}               # the last sample applied
var weather_hook = null       # Callable(state) -> void: a later weather system's say
var _acc := 0.0
var _indoors := false

func setup(m: Node3D) -> void:
	main = m
	clock = m.cast.clock if m.cast else null
	sun = m.sun
	env = m.we.environment
	name = "DayNight"
	process_priority = 5
	fx = preload("res://night_fx.gd").new()
	fx.name = "NightFX"
	m.add_child(fx)
	fx.setup(m)
	if clock: clock.jumped.connect(func(_m): force_update())
	Settings.changed.connect(_on_setting)
	enabled = int(Settings.get_value("daynight")) == 1
	force_update()

func _on_setting(key: String, v) -> void:
	if key == "daynight":
		enabled = int(v) == 1
		force_update()

func force_update() -> void:
	_acc = RATE
	_update()

func _process(dt: float) -> void:
	_acc += dt
	if _acc >= RATE: _update()

func _update() -> void:
	_acc = 0.0
	if clock == null or not is_instance_valid(clock): return
	var indoors: bool = main.indoors
	if not enabled:
		if not state.is_empty() or indoors != _indoors: _apply_off()
		_indoors = indoors
		state = {}
		return
	var s := sample(clock.hour(), clock.day_of_year(), clock.moon_phase(), clock.season())
	if weather_hook is Callable and (weather_hook as Callable).is_valid(): weather_hook.call(s)
	state = s
	_indoors = indoors
	_apply(s, indoors)

# ---------- the sun and the moon ----------
static func _calibrate() -> void:
	if _cal_k > 0.0: return
	var h := GameCalendar.sun_hours(REF_DOY)
	var th := PI * (REF_HOUR - h.x) / (h.y - h.x)
	var e0 := asin(clampf(SUN0.y, -1.0, 1.0))
	_cal_k = rad_to_deg(e0) / (GameCalendar.sun_peak(REF_DOY) * sin(th))
	# the azimuth at REF_HOUR is the fixed sun's: az(th) = noon + SWEEP * (1 - 2 th / PI)
	_az_noon = atan2(SUN0.x, SUN0.z) - SWEEP * (1.0 - 2.0 * th / PI)

# 0 at sunrise, PI at sunset, on round through the night to 2 PI
static func _arc(hour: float, doy: int) -> float:
	var h := GameCalendar.sun_hours(doy)
	var hh := fposmod(hour, 24.0)
	if hh >= h.x and hh <= h.y: return PI * (hh - h.x) / (h.y - h.x)
	var since := fposmod(hh - h.y, 24.0)
	return PI + PI * since / (24.0 - (h.y - h.x))

# th: _arc's angle; nk: night length / day length, so the sun sinks below the
# horizon as fast as it set (no jump in the light's pace at sunset or sunrise)
static func _dir(th: float, peak: float, nk := 1.0) -> Vector3:
	_calibrate()
	var e := deg_to_rad(peak * _cal_k * sin(th) * (nk if th > PI else 1.0))
	var az: float
	if th <= PI: az = _az_noon + SWEEP * (1.0 - 2.0 * th / PI)
	else: az = _az_noon - SWEEP - (TAU - 2.0 * SWEEP) * (th - PI) / PI
	return Vector3(sin(az) * cos(e), sin(e), cos(az) * cos(e))

static func _nk(doy: int) -> float:
	var h := GameCalendar.sun_hours(doy)
	return (24.0 - (h.y - h.x)) / (h.y - h.x)

static func sun_dir_at(hour: float, doy: int) -> Vector3:
	return _dir(_arc(hour, doy), GameCalendar.sun_peak(doy), _nk(doy))

# the moon keeps the sun's path, behind it by its phase (full: up at midnight)
static func moon_dir_at(hour: float, doy: int, phase: float) -> Vector3:
	return _dir(_arc(hour - phase * 24.0, doy), GameCalendar.sun_peak(doy) * 0.95, _nk(doy))

static func _elev(v: Vector3) -> float: return rad_to_deg(asin(clampf(v.y, -1.0, 1.0)))

static func _lift(v: Vector3, min_e: float) -> Vector3:
	var e := deg_to_rad(maxf(_elev(v), min_e))
	var hz := Vector2(v.x, v.z)
	if hz.length() < 1e-4: hz = Vector2(SUN0.x, SUN0.z)
	hz = hz.normalized() * cos(e)
	return Vector3(hz.x, sin(e), hz.y)

# the direction the shadows come from: the sun by day (never lower than
# LIGHT_MIN_E), the moon by night (or, the moon down, a high sky light), blended
# through twilight while the light is dim
static func light_dir_at(sun_d: Vector3, moon_d: Vector3) -> Vector3:
	var se := _elev(sun_d)
	var sky := _lift(Vector3(SUN0.x, 0.0, SUN0.z), 58.0)
	var night := _lift(moon_d, 30.0).lerp(sky, 1.0 - smoothstep(4.0, 18.0, _elev(moon_d))).normalized()
	var w := smoothstep(-10.0, 4.0, se)
	var v := night.lerp(_lift(sun_d, LIGHT_MIN_E), w)
	v.y += 0.6 * w * (1.0 - w)   # through the top, never through the ground
	return v.normalized()

# ---------- a sample ----------
static func _keys(list: Array, e: float) -> Dictionary:
	if e <= list[0].e: return list[0]
	for i in range(1, list.size()):
		if e <= list[i].e:
			var a: Dictionary = list[i - 1]
			var b: Dictionary = list[i]
			var t := smoothstep(0.0, 1.0, (e - a.e) / (b.e - a.e))
			var o := {}
			for k in a: o[k] = lerpf(a[k], b[k], t) if k == "e" or k == "glow" else (a[k] as Color).lerp(b[k], t)
			return o
	return list[list.size() - 1]

static func _mix(a: Dictionary, b: Dictionary, t: float) -> Dictionary:
	var o := {}
	for k in a: o[k] = lerpf(a[k], b[k], t) if k == "e" or k == "glow" else (a[k] as Color).lerp(b[k], t)
	return o

static func sample(hour: float, doy: int, phase: float, season := "") -> Dictionary:
	var sd := sun_dir_at(hour, doy)
	var md := moon_dir_at(hour, doy, phase)
	var e := _elev(sd)
	var hh := fposmod(hour, 24.0)
	# morning keys until noon, evening keys from the afternoon (both midday, or both
	# night, where they meet)
	var pm := smoothstep(11.0, 14.0, hh) * (1.0 - smoothstep(22.0, 23.5, hh))
	if hh < 11.0: pm = 0.0
	var k := _mix(_keys(KEYS_AM, e), _keys(KEYS_PM, e), pm)
	var night := 1.0 - smoothstep(-10.0, 1.0, e)
	# the moon: brighter nights at full moon (0.5), darker at new
	var full := 0.5 - 0.5 * cos(phase * TAU)
	var moon_up := smoothstep(-2.0, 12.0, _elev(md))
	var mk := lerpf(0.85, 1.2, full * moon_up)
	var sun_c: Color = k.sun
	var amb_c: Color = k.amb
	sun_c = sun_c.lerp(sun_c * mk, night)
	amb_c = amb_c.lerp(amb_c * mk, night)
	var st: Color = SEASON_TINT.get(season, Color(1, 1, 1))
	sun_c *= st; amb_c *= st
	var midday := e >= 22.0 and season in ["", "spring"]
	# lamps on in the dusk (sun under 3 degrees), off after dawn
	var lamps := 1.0 - smoothstep(-2.0, 5.0, e)
	# windows: most lit in the evening, fewer as the town goes to bed, a few early risers
	var win := 0.0
	if hh >= 12.0: win = lerpf(0.8, 0.35, smoothstep(21.5, 23.5, hh))
	else: win = lerpf(0.35, 0.12, smoothstep(0.0, 2.0, hh)) if hh < 4.5 else lerpf(0.12, 0.4, smoothstep(4.5, 6.0, hh))
	win *= 1.0 - smoothstep(-2.0, 5.0, e)
	# fireflies: warm nights (late spring to early autumn), the evening most
	var ff_season := {"spring": 0.6, "summer": 1.0, "autumn": 0.45, "winter": 0.0}.get(season, 0.6) as float
	var ff := ff_season * (1.0 - smoothstep(-8.0, -1.0, e)) * (1.0 - smoothstep(1.0, 3.5, hh) * (1.0 - smoothstep(20.0, 21.0, hh)))
	var unlit := amb_c.lerp(sun_c, 0.65)
	var fog := relight(FOG0, unlit).lerp(k.hor, clampf(1.0 - e / 22.0, 0.0, 1.0) * 0.45)
	if e >= 22.0: fog = relight(FOG0, unlit)
	return {"hour": hour, "doy": doy, "phase": phase, "sun_dir": sd, "moon_dir": md, "light_dir": light_dir_at(sd, md), "elev": e,
		"sun": sun_c, "amb": amb_c, "top": k.top, "mid": k.mid, "hor": k.hor, "glow": k.glow, "fog": fog, "night": night,
		"stars": (1.0 - smoothstep(-12.0, -3.0, e)) * lerpf(1.0, 0.7, full * moon_up), "lamps": lamps, "windows": win,
		"fireflies": ff, "midday": midday, "unlit": unlit, "pm": pm}

# ---------- three's ACES (aces.gdshaderinc), for the haze and the tests ----------
static func _rrt(v: float) -> float:
	return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081)
static func aces(c: Color) -> Color:
	var v := Vector3(c.r, c.g, c.b) / 0.6
	var a := Vector3(0.59719 * v.x + 0.35458 * v.y + 0.04823 * v.z, 0.07600 * v.x + 0.90834 * v.y + 0.01566 * v.z, 0.02840 * v.x + 0.13383 * v.y + 0.83777 * v.z)
	a = Vector3(_rrt(a.x), _rrt(a.y), _rrt(a.z))
	var o := Vector3(1.60475 * a.x - 0.53108 * a.y - 0.07367 * a.z, -0.10208 * a.x + 1.10813 * a.y - 0.00605 * a.z, -0.00327 * a.x - 0.07276 * a.y + 1.07602 * a.z)
	return Color(clampf(o.x, 0.0, 1.0), clampf(o.y, 0.0, 1.0), clampf(o.z, 0.0, 1.0))
# an unshaded colour under a tint, as dn_relight does it
static func relight(c: Color, t: Color) -> Color:
	var a := aces(c)
	var b := aces(Color(c.r * t.r, c.g * t.g, c.b * t.b))
	return Color(c.r * b.r / maxf(a.r, 1e-4), c.g * b.g / maxf(a.g, 1e-4), c.b * b.b / maxf(a.b, 1e-4))

# ---------- applying ----------
static func _v4(c: Color, a: float) -> Vector4: return Vector4(c.r, c.g, c.b, a)
static func _gset(n: String, v: Vector4) -> void: RenderingServer.global_shader_parameter_set(n, v)

func _apply(s: Dictionary, indoors: bool) -> void:
	var night: float = s.night
	var mid: bool = s.midday
	var ld: Vector3 = s.light_dir
	if indoors:
		# the room's own key light; a warmer, lamp lit room at night
		var lamp_sun := Color(1.0, 0.91, 0.8) * 0.93
		var lamp_amb := Color(0.9, 0.82, 0.84) * 0.86
		_gset("dn_sun", _v4(W.lerp(lamp_sun, night), night))
		_gset("dn_amb", _v4(W.lerp(lamp_amb, night), 0.0))
		_gset("dn_dir", Vector4(ld.x, ld.y, ld.z, 0.0))
		_gset("dn_glow", Vector4(s.lamps, s.windows, 0.0, 0.0 if night <= 0.0 else 1.0))
		# the views out: the outdoor hour's colour, a deep blue at night
		var view: Color = (s.unlit as Color).lerp(Color(0.16, 0.2, 0.42), night * 0.6)
		_gset("dn_view", _v4(view if not mid else W, 0.0))
	else:
		_gset("dn_sun", _v4(s.sun, night))
		_gset("dn_amb", _v4(s.amb, night * 0.3))
		_gset("dn_dir", Vector4(ld.x, ld.y, ld.z, 1.0))
		_gset("dn_glow", Vector4(s.lamps, s.windows, s.fireflies, 0.0 if mid else 1.0))
		_gset("dn_view", Vector4(1, 1, 1, 0))
	var sd: Vector3 = s.sun_dir
	var md: Vector3 = s.moon_dir
	_gset("dn_sun_pos", Vector4(sd.x, sd.y, sd.z, 1.0))
	_gset("dn_moon", Vector4(md.x, md.y, md.z, s.phase))
	_gset("dn_sky_top", _v4(s.top, s.stars))
	_gset("dn_sky_mid", _v4(s.mid, maxf(s.glow, 0.001)))
	_gset("dn_sky_hor", _v4(s.hor, 0.0))
	_gset("dn_fog", _v4(s.fog, 0.0))
	if env and not indoors:
		env.fog_light_color = s.fog
	if sun and is_instance_valid(sun) and not indoors:
		var to := ld * 50.0
		if sun.position.distance_to(to) > 0.0005 or state.is_empty():
			sun.look_at_from_position(to, Vector3.ZERO, Vector3.UP if absf(ld.y) < 0.999 else Vector3.FORWARD)
		sun.light_color = s.sun   # (only the few standard materials read it)
		# a low light's shadows reach far and take in many more casters: a shorter
		# shadow distance while it is low keeps dawn and dusk as cheap as midday
		var le := _elev(ld)
		sun.directional_shadow_max_distance = float(Settings.get_value("shadow_dist")) * lerpf(0.6, 1.0, smoothstep(16.0, 40.0, le))
	if fx: fx.apply(s, indoors)

func _apply_off() -> void:
	for g in GLOBALS: _gset(g[0], g[1])
	if env and not main.indoors: env.fog_light_color = main.FOG
	if sun and is_instance_valid(sun):
		sun.look_at_from_position(main.SUN_DIR.normalized() * 50.0, Vector3.ZERO)
		sun.light_color = W
		sun.directional_shadow_max_distance = float(Settings.get_value("shadow_dist"))
	if fx: fx.apply({}, main.indoors)
