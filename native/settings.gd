extends Node
# Settings (autoload "Settings"): graphics presets with stepped overrides,
# display and controller options, saved in user://settings.cfg and applied
# live. Port of web/world/settings.js and the presets in web/world/main.js.
#
# For other scripts:
#   Settings.get_value(key)          current value of a setting
#   Settings.set_value(key, value)   change one (saved, applied, signalled)
#   signal changed(key, value)       after any change (also once per key at start
#                                    through apply_all, so a listener can read
#                                    everything in its _ready instead)
#   Settings.render_scale()          the 3D render scale in use (setting x auto)
#   Settings.blocks_touch(pos)       true when a touch at pos belongs to the menu
#
# Keys (see ROWS for the steps): scale, upscale, auto_res, fps_cap, aa,
# outlines, outline_q, shadow, shadow_dist, shadow_soft, grass, grass_size,
# lod (view distance), trees, plants, fog (haze distance), exposure, fps, perf,
# face, cam_speed, invert_y, deadzone, clock ("game" | "real"), day_len (real
# minutes per game day), daynight (the day and night's light, daynight.gd; off =
# the fixed midday look), clock_hud, town_debug (clock.gd, life.gd), bike_assist / bike_goal / bike_cruise
# (the road assist, its routing to the compass's goal, double-tap cruise: bike/assist.gd), auto_update
# (updater.gd), music, music_vol (music.gd), sfx_vol, amb_vol, ui_sfx (sfx.gd), wild_peek
# ("hidden" | "peek": a wild Pokémon in the tall grass shows only by the grass, or peeks out; wild/wild.gd).
#
# Viewport-wide things (render scale, upscaler, anti-aliasing, frame cap,
# shadow atlas size and filter, outlines through the Ink autoload) are applied
# here; scene things (sun distance, haze, grass, view distance, trees) by the
# scenes that own them, listening to `changed`.

signal changed(key: String, value)

const PATH := "user://settings.cfg"
var path := PATH   # (a test points it elsewhere)

# graphics presets; "high" is the default, tuned for an iPhone 17 at 120 Hz
const PRESETS0 := {
	"battery": {"scale": 0.6, "upscale": "auto", "auto_res": 1, "fps_cap": 60, "aa": "msaa2", "outlines": 1, "outline_q": 1.0,
		"shadow": 1024, "shadow_dist": 45, "shadow_soft": 0, "grass": 60000, "grass_size": 40, "lod": 0.7, "trees": 0.6, "plants": 0.5, "fog": 1.0, "exposure": 1.0},
	"low": {"scale": 0.5, "upscale": "auto", "auto_res": 1, "fps_cap": 120, "aa": "off", "outlines": 1, "outline_q": 1.0,
		"shadow": 1024, "shadow_dist": 45, "shadow_soft": 0, "grass": 60000, "grass_size": 40, "lod": 0.7, "trees": 0.6, "plants": 0.5, "fog": 1.0, "exposure": 1.0},
	"medium": {"scale": 0.67, "upscale": "auto", "auto_res": 1, "fps_cap": 120, "aa": "msaa2", "outlines": 1, "outline_q": 1.0,
		"shadow": 2048, "shadow_dist": 50, "shadow_soft": 2, "grass": 110000, "grass_size": 50, "lod": 0.85, "trees": 0.85, "plants": 0.8, "fog": 1.0, "exposure": 1.0},
	"high": {"scale": 0.75, "upscale": "auto", "auto_res": 1, "fps_cap": 120, "aa": "msaa2", "outlines": 1, "outline_q": 1.0,
		"shadow": 2048, "shadow_dist": 60, "shadow_soft": 2, "grass": 150000, "grass_size": 64, "lod": 1.0, "trees": 1.0, "plants": 1.0, "fog": 1.0, "exposure": 1.0},
	"ultra": {"scale": 1.0, "upscale": "auto", "auto_res": 1, "fps_cap": 120, "aa": "msaa4", "outlines": 1, "outline_q": 1.5,
		"shadow": 4096, "shadow_dist": 80, "shadow_soft": 3, "grass": 220000, "grass_size": 76, "lod": 1.35, "trees": 1.25, "plants": 1.25, "fog": 1.0, "exposure": 1.0},
}
const PRESET_NAMES := ["battery", "low", "medium", "high", "ultra"]
const PRESET_LABEL := {"battery": "Battery", "low": "Low", "medium": "Medium", "high": "High", "ultra": "Ultra"}
# the world editor's tunables (res://tunables/settings.json) over these
const T := preload("res://tunables.gd")
var PRESETS := _presets()
var DEFAULT_PRESET := T.text("settings", "default_preset", "high")
static func _presets() -> Dictionary:
	var p := PRESETS0.duplicate(true)
	var o := T.dict("settings", "presets", {})
	for k in o: if p.has(k) and o[k] is Dictionary: for r in o[k]: p[k][r] = o[k][r]
	return p

# settings that are not part of a preset
const EXTRA0 := {"fps": 1, "perf": 0, "face": "nintendo", "cam_speed": 1.0, "invert_y": 0, "deadzone": 0.15,
	"clock": "game", "day_len": 120, "daynight": 1, "clock_hud": 1, "town_debug": 0, "auto_update": 1,
	"music": 1, "music_vol": 0.7, "sfx_vol": 0.8, "amb_vol": 0.7, "ui_sfx": 1,
	"bike_assist": 1, "bike_goal": 1, "bike_cruise": 1,
	"wild_peek": "hidden", "footprints": 1,
	"tv_margin": 3, "tv_fps": 60, "tv_res": 1080, "tv_debug": 0, "tv_preview": 1,
	"ink_px": 1.1, "tv_ink_px": 2.0, "tv_aa": "msaa4", "tv_scale": 1.0,
	"island": 1, "island_side": "left", "island_outline": 0, "island_dx": 0, "island_dy": 0, "island_w": 37, "island_h": 126}
var EXTRA := T.dict("settings", "extra", EXTRA0)

# rows of the menu, by tab: key, label, values, hint (format in fmt())
const ROWS := {
	"Display": [
		["preset", "Preset", PRESET_NAMES, "sets every graphics row"],
		["scale", "Resolution", [0.5, 0.6, 0.67, 0.75, 0.85, 1.0], "3D render scale (on the phone; the TV tab has TV sharpness)"],
		["upscale", "Upscaling", ["auto", "bilinear", "fsr", "metalfx"], "how the 3D image is scaled up"],
		["auto_res", "Auto resolution", [0, 1], "lower scale while frames run late"],
		["fps_cap", "Frame rate cap", [30, 60, 120, 0], "120 = ProMotion"],
		["aa", "Anti-aliasing", ["off", "fxaa", "msaa2", "msaa4"], ""],
		["exposure", "Brightness", [0.8, 0.9, 1.0, 1.1, 1.2, 1.3], ""],
		["fps", "FPS counter", [0, 1], ""],
		["perf", "Performance overlay", [0, 1], "frame times, draw calls"],
		["island", "Dynamic Island HUD", [0, 1], "compass round the island, tap beside it for the menu"],
		["island_side", "Island side", ["left", "right"], "which edge the island is on, the phone turned"],
		["island_outline", "Show island outline", [0, 1], "a red outline where the game thinks the island is"],
		["island_dx", "Island: move across", [-24, -23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], "points, + = toward the middle of the screen"],
		["island_dy", "Island: move along", [-40, -38, -36, -34, -32, -30, -28, -26, -24, -22, -20, -18, -16, -14, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40], "points, + = down"],
		["island_w", "Island: width", [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48], "points"],
		["island_h", "Island: height", [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128, 130, 132, 134, 136, 138, 140, 142, 144, 146, 148, 150], "points"],
	],
	"World": [
		["outlines", "Outlines", [0, 1], ""],
		["outline_q", "Outline quality", [0.5, 0.75, 1.0, 1.25, 1.5, 2.0], ""],
		["ink_px", "Outline weight", [0.8, 1.1, 1.4, 1.7, 2.0, 2.4], "how bold the ink lines are on the phone (the TV has its own)"],
		["shadow", "Shadow detail", [0, 1024, 2048, 4096], ""],
		["shadow_dist", "Shadow distance", [30, 45, 60, 80, 100], ""],
		["shadow_soft", "Shadow edges", [0, 1, 2, 3], ""],
		["grass", "Grass density", [0, 20000, 40000, 60000, 90000, 120000, 150000, 180000, 220000, 260000], ""],
		["grass_size", "Grass distance", [30, 40, 50, 64, 76, 90, 110, 130, 160, 200, 250, 300], "how far the grass reaches"],
		["lod", "View distance", [0.5, 0.7, 0.85, 1.0, 1.2, 1.35, 1.6, 2.0], ""],
		["trees", "Trees", [0.3, 0.45, 0.6, 0.8, 1.0, 1.25, 1.5], ""],
		["plants", "Bushes and flowers", [0.25, 0.5, 0.75, 1.0, 1.25, 1.5], ""],
		["fog", "Haze distance", [0.6, 0.8, 1.0, 1.25, 1.5, 2.0], ""],
		["wild_peek", "Pokémon in the grass", ["hidden", "peek"], "a wild Pokémon hiding in tall grass: only the grass gives it away, or it peeks out"],
		["footprints", "Footprints", [0, 1], "tracks left in sand, dirt and mud; follow a fleeing Pokémon's"],
	],
	"Controls": [
		["face", "Face buttons", ["nintendo", "xbox"], "Switch / GameCube pads: A right"],
		["cam_speed", "Camera speed", [0.5, 0.75, 1.0, 1.25, 1.5, 2.0], "stick and arrow keys"],
		["invert_y", "Invert camera up/down", [0, 1], ""],
		["deadzone", "Stick deadzone", [0.05, 0.1, 0.15, 0.2, 0.25, 0.3], "raise if the camera drifts"],
		["bike_assist", "Road assist", [0, 1], "on a road or trail, hold forward and the bike follows it"],
		["bike_goal", "Follow the road to my goal", [0, 1], "at a fork the assist takes the way toward the compass's goal"],
		["bike_cruise", "Bike cruise", [0, 1], "double tap forward to ride on without holding; brake or pull back stops"],
	],
	"Time": [
		["clock", "Time of day", ["game", "real"], "Real time follows the phone's clock"],
		["day_len", "Length of a day", [48, 72, 96, 120, 180, 240, 360], "real minutes per game day"],
		["daynight", "Day/night cycle", [0, 1], "the sun moves, dusk, night and dawn; off keeps the midday look"],
		["clock_hud", "Clock on screen", [0, 1], ""],
		["town_debug", "Town debug overlay", [0, 1], "who is doing what (also F3)"],
	],
	"Audio": [
		["music", "Music", [0, 1], "the town theme for each time of day, and the lab theme"],
		["music_vol", "Music volume", [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], ""],
		["sfx_vol", "Sound effects", [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], "footsteps, doors, creatures, menus"],
		["amb_vol", "Ambience", [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], "wind, sea, stream, birds and crickets"],
		["ui_sfx", "Menu sounds", [0, 1], "clicks, text blips and chimes"],
	],
	# the TV (screens.gd, tv/): the settings menu's TV tab shows Connect to TV above these
	"TV": [
		["tv_margin", "TV safe margin", [0, 2, 3, 5, 7], "keeps the HUD clear of the TV's edges (% of each side)"],
		["tv_res", "TV picture", [720, 1080], "1080p is sharpest; 720p streams more easily over AirPlay"],
		["tv_fps", "Frame rate on the TV", [30, 60], "one game frame per TV refresh at 60; every second one at 30"],
		["tv_ink_px", "Outline weight on the TV", [1.1, 1.4, 1.7, 2.0, 2.4, 2.8], "bolder lines read cleanly from the sofa and through AirPlay's video"],
		["tv_aa", "Anti-aliasing on the TV", ["same", "off", "fxaa", "msaa2", "msaa4"], "Same = the Display tab's"],
		["tv_scale", "TV sharpness", [0.75, 0.85, 1.0, 1.25, 1.5, 2.0], "over 100% supersamples: smoother edges and lines, more GPU (auto resolution never goes under 100% on the TV)"],
		["tv_preview", "Live picture on the phone", [0, 1], "the TV's picture in the phone's menu (off saves a little work)"],
		["tv_debug", "TV pacing overlay", [0, 1], "frame time, frames shown, repeated and dropped, the link's rate"],
	],
	"Updates": [
		["auto_update", "Auto-update", [0, 1], "download new versions in the background"],
	],
}

var preset := DEFAULT_PRESET
var o := {}          # overrides of the preset
var extra := {}      # non-preset settings
var auto_scale := 1.0
var menu: Node
var overlay: Node
var _cfg := ConfigFile.new()

# auto resolution (web main.js autoResTick)
var _ar := {"acc": 0.0, "n": 0, "gpu": 0.0, "good": 0, "need": 4, "hold": 0.0, "up_at": -100.0, "t": 0.0,
	"was": -1.0, "was_gpu": 0.0, "quiet": 0.0}

func _init() -> void:
	# shader globals added after an app was built (its project.godot lacks them):
	# made here, before any shader that reads them compiles, so a patch works on it
	var gl := [["battle_arena", RenderingServer.GLOBAL_VAR_TYPE_VEC4, Vector4.ZERO], ["battle_arena_v", RenderingServer.GLOBAL_VAR_TYPE_FLOAT, 0.0]]
	# the day and night's (daynight.gd, shaders/daynight.gdshaderinc): the midday look
	for d in DayNight.GLOBALS: gl.append([d[0], RenderingServer.GLOBAL_VAR_TYPE_VEC4, d[1]])
	for g in gl:
		if not ProjectSettings.has_setting("shader_globals/" + g[0]): RenderingServer.global_shader_parameter_add(g[0], g[1], g[2])

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_load()
	RenderingServer.viewport_set_measure_render_time(viewport().get_viewport_rid(), true)
	_setup_input()
	add_child(UIInput.new())   # which input was used last, for the button glyphs (ui/ui_input.gd)
	overlay = preload("res://perf_overlay.gd").new()
	add_child(overlay)
	menu = preload("res://settings_menu.gd").new()
	add_child(menu)
	apply_all.call_deferred()

# ---------- values ----------
func get_value(key: String):
	if key == "preset": return preset
	if extra.has(key) or EXTRA.has(key): return extra.get(key, EXTRA.get(key))
	if o.has(key): return o[key]
	return preset_value(preset, key)

# a preset's value; the render scales are tuned for the phone's 2622 x 1206
# screen, so a desktop window (about half as many pixels) renders at 4/3 of it
func preset_value(p: String, key: String):
	var v = PRESETS[p].get(key)
	if key == "scale" and not OS.has_feature("mobile"):
		return [0.5, 0.6, 0.67, 0.75, 0.85, 1.0].reduce(func(a, b): return b if absf(b - v * 4.0 / 3.0) < absf(a - v * 4.0 / 3.0) else a)
	return v

func set_value(key: String, v) -> void:
	if key == "preset":
		set_preset(v)
		return
	if EXTRA.has(key): extra[key] = v
	elif preset_value(preset, key) == v: o.erase(key)
	else: o[key] = v
	_save()
	_apply(key, v)
	changed.emit(key, v)

func is_changed(key: String) -> bool:
	return o.has(key)

func set_preset(name: String) -> void:
	if not PRESETS.has(name): return
	preset = name
	o = {}
	_save()
	changed.emit("preset", name)
	for k in PRESETS[preset]:
		_apply(k, get_value(k))
		changed.emit(k, get_value(k))

func reset_to_preset() -> void:
	set_preset(preset)

# one step up (d = 1) or down (d = -1) through a row's values
func step(key: String, values: Array, d: int) -> void:
	var v = get_value(key)
	var i := values.find(v)
	if i == -1:   # nearest step to the current value
		i = 0
		if typeof(v) in [TYPE_INT, TYPE_FLOAT]:
			for k in values.size():
				if absf(float(values[k]) - float(v)) < absf(float(values[i]) - float(v)): i = k
	var n := values.size()
	if key in ["preset", "face", "upscale", "aa", "tv_aa", "clock", "island_side", "wild_peek", "tv_res"] or values == [0, 1]:
		i = (i + d + n) % n                      # choices wrap round
	else:
		i = clampi(i + d, 0, n - 1)
	for _t in n:   # skip upscalers this device does not have
		if key != "upscale" or (values[i] != "metalfx" or metalfx_ok()) and (values[i] != "fsr" or fsr_ok()): break
		i = (i + d + n) % n
	set_value(key, values[i])

func fmt(key: String, v) -> String:
	match key:
		"preset": return PRESET_LABEL.get(v, str(v))
		"scale", "lod", "trees", "plants", "fog", "exposure", "cam_speed", "music_vol": return "%d%%" % roundi(float(v) * 100.0)
		"sfx_vol", "amb_vol": return "Off" if float(v) <= 0.001 else "%d%%" % roundi(float(v) * 100.0)
		"outline_q": return _num(v) + "x"
		"upscale": return {"auto": "Auto (%s)" % ("MetalFX" if metalfx_ok() else ("FSR 1" if fsr_ok() else "Bilinear")), "bilinear": "Bilinear", "fsr": "FSR 1", "metalfx": "MetalFX"}.get(v, str(v))
		"fps_cap": return "Unlimited" if int(v) == 0 else "%d fps" % v
		"aa", "tv_aa": return {"same": "Same as the phone", "off": "Off", "fxaa": "FXAA", "msaa2": "MSAA 2x", "msaa4": "MSAA 4x"}.get(v, str(v))
		"ink_px", "tv_ink_px": return "%s px" % _num(v)
		"tv_scale": return ("%d%%" % roundi(float(v) * 100.0)) + (" (supersampled)" if float(v) > 1.001 else "")
		"shadow": return "Off" if int(v) == 0 else str(v)
		"shadow_dist": return "%d m" % v
		"shadow_soft": return ["Crisp", "Soft, fast", "Soft", "Softer"][clampi(int(v), 0, 3)]
		"grass": return "Off" if int(v) == 0 else "%dk" % roundi(v / 1000.0)
		"grass_size": return "%d m" % roundi(v / 2.0)
		"face": return "A right (Nintendo)" if v == "nintendo" else "A bottom (Xbox)"
		"deadzone": return "%d%%" % roundi(float(v) * 100.0)
		"clock": return "Real time" if v == "real" else "Game time"
		"day_len": return "%d min" % int(v) if int(v) < 60 else ("%d h" % (int(v) / 60) if int(v) % 60 == 0 else "%d h %d min" % [int(v) / 60, int(v) % 60])
		"island_side": return "Left" if v == "left" else "Right"
		"tv_res": return "Auto" if str(v) == "auto" else "%dp" % int(v)
		"wild_peek": return "Peeking (model visible)" if v == "peek" else "Hidden (grass only)"
		"island_dx", "island_dy", "island_w", "island_h": return "%d pt" % int(v)
	if typeof(v) == TYPE_INT and (v == 0 or v == 1): return "On" if v == 1 else "Off"
	return str(v)

func _num(v) -> String:
	var t := "%.2f" % float(v)
	while t.ends_with("0"): t = t.left(-1)
	return t.trim_suffix(".")

# ---------- live apply ----------
func apply_all() -> void:
	for k in PRESETS[preset]: _apply(k, get_value(k)); changed.emit(k, get_value(k))
	for k in EXTRA: _apply(k, get_value(k)); changed.emit(k, get_value(k))

func metalfx_ok() -> bool:
	var rd := RenderingServer.get_rendering_device()
	return rd != null and rd.has_feature(RenderingDevice.SUPPORTS_METALFX_SPATIAL)

# FSR 1 needs the Forward+ renderer (desktop runs); the phone uses Mobile
func fsr_ok() -> bool:
	return RenderingServer.get_current_rendering_method() == "forward_plus"

func on_tv() -> bool:
	return tv_hz > 0

# On a TV: TV sharpness (tv_scale), above 1 = supersampled; auto resolution
# may take the supersampling back but never goes under 1 (pixelated ink on a
# big screen) unless the player picked a lower TV sharpness.
func render_scale() -> float:
	if on_tv():
		var t := float(get_value("tv_scale"))
		var st := t * (auto_scale if int(get_value("auto_res")) == 1 else 1.0)
		return clampf(st, minf(1.0, t), 2.0)
	var s := float(get_value("scale"))
	if int(get_value("auto_res")) == 1: s *= auto_scale
	return clampf(s, 0.25, 1.0)

func _apply_scale() -> void:
	var vp := viewport()
	var s := render_scale()
	var up: String = get_value("upscale")
	if up == "auto": up = "metalfx" if metalfx_ok() else ("fsr" if fsr_ok() else "bilinear")
	if up == "metalfx" and not metalfx_ok(): up = "bilinear"
	if up == "fsr" and not fsr_ok(): up = "bilinear"
	if s >= 0.999:
		vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
	else:
		vp.scaling_3d_mode = {"bilinear": Viewport.SCALING_3D_MODE_BILINEAR, "fsr": Viewport.SCALING_3D_MODE_FSR, "metalfx": Viewport.SCALING_3D_MODE_METALFX_SPATIAL}[up]
	vp.scaling_3d_scale = s
	vp.fsr_sharpness = 0.4

func _apply(key: String, v) -> void:
	var vp := viewport()
	match key:
		"scale", "upscale", "tv_scale": _apply_scale()
		"auto_res":
			if int(v) == 0: auto_scale = 1.0
			_apply_scale()
		"fps_cap", "tv_fps":
			Engine.max_fps = _max_fps()
			_ar.need = 4; _ar.good = 0
		"aa", "tv_aa":
			var a = get_value("aa")
			if on_tv() and str(get_value("tv_aa")) != "same": a = get_value("tv_aa")
			vp.msaa_3d = {"msaa2": Viewport.MSAA_2X, "msaa4": Viewport.MSAA_4X}.get(a, Viewport.MSAA_DISABLED)
			vp.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA if a == "fxaa" else Viewport.SCREEN_SPACE_AA_DISABLED
		"ink_px", "tv_ink_px":
			_ink("set_weight", float(get_value("tv_ink_px" if on_tv() else "ink_px")) / 1.1)
		"shadow":
			if int(v) > 0: RenderingServer.directional_shadow_atlas_set_size(int(v), true)
		"shadow_soft":
			RenderingServer.directional_soft_shadow_filter_set_quality([RenderingServer.SHADOW_QUALITY_HARD, RenderingServer.SHADOW_QUALITY_SOFT_VERY_LOW, RenderingServer.SHADOW_QUALITY_SOFT_LOW, RenderingServer.SHADOW_QUALITY_SOFT_MEDIUM][clampi(int(v), 0, 3)])
		"outlines": _ink("set_enabled", int(v) == 1)
		"outline_q": _ink("set_quality", float(v))
		"face", "deadzone": _setup_input()
		"fps", "perf":
			if overlay: overlay.refresh()

# the ink outlines (worker 2's Ink autoload), once it exists
func _ink(method: String, arg) -> void:
	var ink := get_node_or_null("/root/Ink")
	if ink and ink.has_method(method): ink.call(method, arg)

# ---------- auto resolution ----------
# The viewport the game renders its 3D into: the "Game" SubViewport of screens.gd
# (the phone's picture, or the TV's), else this window (a test running main.tscn).
# The render scale, upscaler, anti-aliasing and the timings go to it.
var target_vp: Viewport = null
var tv_hz := 0   # the TV's refresh while the game is on one (screens.gd), 0 = none
var tv_paced := false   # the TV plugin paces the game's renders: the engine keeps the phone's pace

func viewport() -> Viewport:
	return target_vp if is_instance_valid(target_vp) else get_viewport()

func use_viewport(vp: Viewport) -> void:
	target_vp = vp
	RenderingServer.viewport_set_measure_render_time(viewport().get_viewport_rid(), true)
	for k in ["scale", "aa", "ink_px"]: _apply(k, get_value(k))

# on a TV: the game runs at the TV's pace (tv_fps, never above its refresh);
# back on the phone: the frame cap of the preset (120 = ProMotion)
func set_tv_hz(hz: int, paced := false) -> void:
	tv_hz = hz
	tv_paced = paced and hz > 0
	Engine.max_fps = _max_fps()
	_ar.need = 4; _ar.good = 0
	# the TV's own render scale, anti-aliasing and outline weight (or the phone's again)
	auto_scale = 1.0
	for k in ["scale", "aa", "ink_px"]: _apply(k, get_value(k))

func _max_fps() -> int:
	var cap := int(get_value("fps_cap"))
	# (paced by the TV, tv/tv_link.gd: the world renders per TV refresh, the engine
	# runs at the phone's pace so a refresh is never waited on for a whole frame)
	if tv_hz <= 0: return cap
	# (on a TV the phone only shows the menu: 60 is plenty to catch every TV refresh
	# within a frame, and leaves the GPU to the TV's picture and AirPlay's encoder)
	if tv_paced: return mini(cap, 60) if cap > 0 else 60
	var t := mini(int(get_value("tv_fps")), tv_hz)
	return t if cap <= 0 else mini(cap, t)

func refresh_rate() -> float:
	if tv_hz > 0: return float(tv_hz)
	var hz := DisplayServer.screen_get_refresh_rate()
	return hz if is_finite(hz) and hz >= 20.0 and hz <= 500.0 else 60.0

func target_fps() -> float:
	if tv_hz > 0: return float(mini(int(get_value("tv_fps")), tv_hz))
	var cap := int(get_value("fps_cap"))
	var hz := refresh_rate()
	return float(cap) if cap > 0 and cap < hz + 1.0 else hz

func _process(dt: float) -> void:
	# off in movie captures (--write-movie runs at a fixed, slow clock)
	if int(get_value("auto_res")) != 1 or get_tree().paused or dt > 0.25 or Engine.get_write_movie_path() != "": return
	var now := Time.get_ticks_msec() / 1000.0
	_ar.acc += dt; _ar.n += 1
	_ar.gpu += RenderingServer.viewport_get_measured_render_time_gpu(viewport().get_viewport_rid())
	if _ar.acc < 1.0: return
	var ms: float = _ar.acc / _ar.n * 1000.0
	var gpu: float = _ar.gpu / _ar.n
	var target := 1000.0 / target_fps()
	_ar.acc = 0.0; _ar.n = 0; _ar.gpu = 0.0
	if now < _ar.hold: return
	var sc := auto_scale
	# a step down that did not make the GPU any faster (the frame is held up by
	# its triangles or the CPU, not by its pixels): back up, and leave the scale
	# alone for a while instead of blurring the picture for nothing
	if _ar.was > 0.0:
		var back: bool = gpu > 0.0 and _ar.was_gpu > 0.0 and gpu > _ar.was_gpu * 0.93
		if back:
			sc = _ar.was; _ar.quiet = now + 20.0
		_ar.was = -1.0
		if back:
			auto_scale = sc
			_apply_scale()
			_ar.hold = now + 1.5
			return
	# late frames lower the scale, unless the GPU clearly is not the bottleneck
	if ms > target * 1.12 and (gpu <= 0.0 or gpu > target * 0.6) and now >= _ar.quiet and sc > 0.5:
		_ar.was = sc; _ar.was_gpu = gpu
		sc = maxf(0.5, sc - (0.15 if ms > target * 1.8 else 0.08)); _ar.good = 0
		if now - _ar.up_at < 4.0: _ar.need = mini(30, _ar.need * 2)
	elif ms < target * 1.05 and sc < 1.0:
		_ar.good += 1
		if _ar.good >= _ar.need: sc = minf(1.0, sc + 0.05); _ar.good = 0; _ar.up_at = now
	if sc != auto_scale:
		auto_scale = roundf(sc * 100.0) / 100.0
		_apply_scale()
		_ar.hold = now + 1.5

# ---------- controller ----------
# The actions live in project.godot. A Switch Pro style pad (the NYXI GameCube
# pad pairs as one) puts A on the right: iOS reports buttons by position, so
# that is Godot's JOY_BUTTON_B. "nintendo" maps use = right, back = bottom;
# "xbox" the other way round. The menus' ui_accept / ui_cancel follow it.
func _setup_input() -> void:
	var nin: bool = get_value("face") == "nintendo"
	var ok := JOY_BUTTON_B if nin else JOY_BUTTON_A
	var no := JOY_BUTTON_A if nin else JOY_BUTTON_B
	for pair in [["use", ok], ["back", no], ["crouch", no], ["ui_accept", ok], ["ui_cancel", no]]:
		var act: String = pair[0]
		if not InputMap.has_action(act): InputMap.add_action(act)
		for e in InputMap.action_get_events(act):
			if e is InputEventJoypadButton and e.button_index in [JOY_BUTTON_A, JOY_BUTTON_B]: InputMap.action_erase_event(act, e)
		var jb := InputEventJoypadButton.new()
		jb.button_index = pair[1]
		InputMap.action_add_event(act, jb)
	var dz := float(get_value("deadzone"))
	for act in ["move_left", "move_right", "move_up", "move_down", "cam_left", "cam_right", "cam_up", "cam_down"]:
		if InputMap.has_action(act): InputMap.action_set_deadzone(act, dz)

# ---------- menu ----------
func blocks_touch(pos: Vector2) -> bool:
	return menu != null and menu.blocks(pos)

func open_menu() -> void:
	if menu: menu.open()

# ---------- file ----------
func _load() -> void:
	if _cfg.load(path) != OK: return
	var p: String = _cfg.get_value("gfx", "preset", DEFAULT_PRESET)
	preset = p if PRESETS.has(p) else DEFAULT_PRESET
	var ov = _cfg.get_value("gfx", "o", {})
	if ov is Dictionary:
		for k in ov:
			if PRESETS[preset].has(k): o[k] = ov[k]
	var ex = _cfg.get_value("more", "v", {})
	if ex is Dictionary:
		for k in ex:
			if EXTRA.has(k): extra[k] = ex[k]
	migrate()

# settings saved by an older version: version 1 had 48 real minutes a day as the
# default, so a 48 kept from then is the old default (the new one, 120, takes
# over); any other length was chosen and stays
const VERSION := 2
func migrate() -> void:
	var ver := int(_cfg.get_value("more", "ver", 1))
	if ver >= VERSION: return
	if extra.has("day_len") and int(extra.day_len) == 48: extra.erase("day_len")
	_save()

func _save() -> void:
	_cfg.set_value("gfx", "preset", preset)
	_cfg.set_value("gfx", "o", o)
	_cfg.set_value("more", "v", extra)
	_cfg.set_value("more", "ver", VERSION)
	_cfg.save(path)
