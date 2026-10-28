class_name AshBody
extends Node3D
# Ash's body: the water round his legs, how wet he is, his stamina. Made by
# cast.gd (setup) with the conditions (conditions.gd) and its HUD (conditions_ui.gd);
# main.gd asks it how fast he may go and cast.gd updates it after placing him.
#
# Wading: in shallow water (WorldData.can_wade: the streams, Route 1's creeks, the
# pond's edge, the shore's shallow strip) his feet stand on WorldData.ash_ground,
# so the surface hides his feet and shins (deeper mid-stream). His top speed
# drops with the depth (running more than walking) and running costs more
# stamina. Spray at his feet, a burst at each step, rings spreading on the
# surface and a wake behind him (water_fx.gd); the water footsteps are
# sfx_world.gd's (the surface under him is water).
#
# Wet (the "wet" condition): a wet line, a height on his body (m above his feet).
# In the water it jumps to just above the surface and creeps up the longer he
# stays and the faster he splashes through (running mid-stream soaks him to the
# hair in under twenty seconds); out of it the line comes down as he dries, top
# down, the condition's strength (line / his height) running out over a game hour
# for a full soak (conditions.json). The actor shader darkens and deepens the
# colours below the line (wet_y), on every material of his (the jacket, the
# jeans, the hair; the skin a little; the eyes not). Drops fall off him (more when
# soaked) and his shoes squelch while he walks.
#
# Stamina 0..1: running drains it (faster in water, and wet), walking or standing
# refills it after a moment. Down in the lowest tenth he is fatigued (the
# "fatigue" condition): no running, a little slower, hunched and panting
# (CastActor.tired), until the bar is full again. Above that, a short stop to get
# some back and he runs on. Values: res://tunables/body.json. How full he is
# (hunger.gd) nudges it: the conditions' stamina_regen, stamina_max (the bar's
# size) and run_speed.

const T := preload("res://tunables.gd")

var game: Node            # main.gd
var cast: Node            # cast.gd
var actor: CastActor
var cond: Conditions
var fx: WaterFx
var height := 1.6         # his height (m), from the model
var stamina := 1.0
var running := false      # main.gd: he means to run this frame
var ride_rate := NAN      # on his bike (bike/bike.gd, each frame): stamina a second, + drains, - refills
var depth := 0.0          # how far his feet are under the water (m; 0 out of it)
var surface := NAN        # the water's surface under him
var in_water := false
var wet_line := 0.0       # m above his feet
var _mats: Array = []     # [ShaderMaterial, wet_k]
var _wet_y_set := NAN
var _steps := 0
var _was_in := false
var _ring_t := 0.0
var _drip_acc := 0.0
var _spray_acc := 0.0
var _drip_snd := 3.0
var _run_t := 0.0         # how long since he last ran (s)
var _save_t := 0.0
var rng := RandomNumberGenerator.new()
# in a battle (battle/battle.gd) his stamina is what the wild Pokémon wears down
# (no HP: an exhausted, sore kid is what "down" means): it neither drains with
# running nor refills while Battle.active; the battle sets it (set_stamina)
# scraped and dirty (the "scraped" condition): the dirt and scratches on him
# (actor shader "dirt"), a limp, and resting (standing still, sitting) heals it
# faster than time alone
var REST_HEAL := T.num("body", "scraped_rest_heal", 1.0 / 300.0)   # strength a real second standing still
var SIT_HEAL := T.num("body", "scraped_sit_heal", 1.0 / 90.0)      # sitting down
var _dirt_set := -1.0

# tunables (body.json)
var RUN_DRAIN := T.num("body", "run_drain", 0.026)         # stamina a second running on land (a full bar: ~38 s)
var WATER_DRAIN := T.num("body", "water_drain", 2.0)       # running in water costs (1 + this * depth fraction) times as much
var REGEN_WALK := T.num("body", "regen_walk", 0.085)
var REGEN_STAND := T.num("body", "regen_stand", 0.16)
var REGEN_WATER := T.num("body", "regen_water", 0.6)       # refill in water: this times as fast
var REGEN_DELAY := T.num("body", "regen_delay", 0.7)       # s after running before the bar refills
var FATIGUE_AT := T.num("body", "fatigue_at", 0.1)
var RUN_WATER_MIN := T.num("body", "run_water_min", 0.45)  # top running speed mid-stream (times the run speed)
var WALK_WATER_MIN := T.num("body", "walk_water_min", 0.68)
var DEEP := T.num("body", "deep", 0.48)                    # the depth (m at his feet) counted as fully deep
var WICK := T.num("body", "wet_wick", 0.08)                # the wet line starts this far above the water
var WET_CREEP := T.num("body", "wet_creep", 0.012)         # m/s the line creeps up standing in the water
var WET_SPLASH := T.num("body", "wet_splash", 0.06)        # m/s more running flat out
var WET_DEEP := T.num("body", "wet_deep", 0.03)            # m/s more mid-stream
var DRIPS := T.num("body", "drips", 14.0)                  # drops a second soaked through

func setup(g: Node, c: Node, a: CastActor, conditions: Conditions) -> void:
	name = "AshBody"
	game = g; cast = c; actor = a; cond = conditions
	rng.randomize()
	fx = WaterFx.new()
	add_child(fx)
	# his height: the top of his meshes over his feet
	var top := 0.0
	for mi in a.meshes:
		var bb: AABB = mi.get_aabb()
		var xf: Transform3D = a.global_transform.affine_inverse() * mi.global_transform if mi.is_inside_tree() else Transform3D.IDENTITY
		top = maxf(top, (xf * bb).end.y)
	if top > 0.8 and top < 3.0: height = top
	# how much each material shows the wet: cloth and hair fully, the skin a little, the eyes not
	for m in a.mat_src:
		var src: String = a.mat_src[m]
		var k := 1.0
		if src.ends_with("|eyes"): k = 0.0
		elif src.begins_with("face"): k = 0.15
		elif src.contains("logo"): k = 0.8
		_mats.append([m, k])
		m.set_shader_parameter("wet_k", k)
	stamina = clampf(float(cond.body.get("stamina", 1.0)), 0.0, 1.0)
	wet_line = cond.strength("wet") * height
	_apply_wet_look()
	_apply_dirt()

# ---------- what main.gd asks ----------
func depth_frac() -> float: return clampf(depth / DEEP, 0.0, 1.0)

func can_run() -> bool: return not cond.flag("no_run")

func speed_mult(run: bool) -> float:
	var f := depth_frac()
	var m := lerpf(1.0, RUN_WATER_MIN if run else WALK_WATER_MIN, f)
	return m * cond.mult("speed") * (cond.mult("run_speed") if run else 1.0)   # (run_speed: well fed, stuffed)

# ---------- the frame (cast.gd, after placing him) ----------
func update(dt: float) -> void:
	var p: Vector3 = game.pos
	var W = game.world
	surface = W.water_surface(p.x, p.z) if not game.indoors else NAN
	depth = maxf(0.0, surface - p.y) if not is_nan(surface) else 0.0
	in_water = depth > 0.02
	var spd: float = absf(game.speed)
	_stamina(dt, spd)
	_wet(dt, spd)
	_fx(dt, spd, p)
	# no sitting down in the stream or while worn out
	if (in_water or cond.has("fatigue")) and actor.idles: actor.idles.P.wait = maxf(actor.idles.P.wait, 3.0)
	actor.tired += ((1.0 if cond.has("fatigue") else 0.0) - actor.tired) * (1.0 - exp(-dt * 3.0))
	_was_in = in_water
	_scraped(dt, spd)

# ---------- the battle's hold on the bar ----------
func set_stamina(v: float) -> void:
	stamina = clampf(v, 0.0, 1.0)
	cond.body["stamina"] = snappedf(stamina, 0.001)

# ---------- scraped and dirty ----------
func _scraped(dt: float, spd: float) -> void:
	var s := cond.strength("scraped")
	if s > 0.0 and not Battle.active:
		var sitting: bool = actor.idles != null and actor.idles.acting() == "sit"
		var heal := SIT_HEAL if sitting else (REST_HEAL if spd < 0.3 else 0.0)
		if heal > 0.0:
			s = maxf(0.0, s - heal * dt)
			if s <= 0.001: cond.remove("scraped")
			else: cond.apply("scraped", s)
	actor.limp += (s - actor.limp) * (1.0 - exp(-dt * 2.0))
	_apply_dirt()

func _apply_dirt() -> void:
	var s := cond.strength("scraped")
	if absf(s - _dirt_set) < 0.01: return
	_dirt_set = s
	for e in _mats: e[0].set_shader_parameter("dirt", s)

func _stamina(dt: float, spd: float) -> void:
	if Battle.active: return   # (battle.gd has the bar: no running drain, no refill)
	var was := stamina
	var run_now: bool = running and spd > 1.0 and cast.ground
	if not is_nan(ride_rate):
		# riding: the bike says what it costs (pedalling a little, climbing more, coasting refills)
		if ride_rate > 0.0:
			_run_t = 0.0
			stamina -= dt * ride_rate * cond.mult("stamina_drain") / maxf(0.5, cond.mult("stamina_max"))
		else:
			_run_t += dt
			if _run_t > REGEN_DELAY: stamina -= dt * ride_rate * cond.mult("stamina_regen")
	elif run_now:
		_run_t = 0.0
		# (stamina_max: the bar's size, a bigger one lasting longer: well fed; a smaller one starving)
		stamina -= dt * RUN_DRAIN * (1.0 + WATER_DRAIN * depth_frac()) * cond.mult("stamina_drain") / maxf(0.5, cond.mult("stamina_max"))
	else:
		_run_t += dt
		if _run_t > REGEN_DELAY:
			var r := REGEN_STAND if spd < 0.3 else REGEN_WALK
			if in_water: r *= REGEN_WATER
			stamina += dt * r * cond.mult("stamina_regen")
	stamina = clampf(stamina, 0.0, 1.0)
	if stamina <= FATIGUE_AT and not cond.has("fatigue"): cond.apply("fatigue", 1.0)
	elif stamina >= 1.0 and cond.has("fatigue"): cond.remove("fatigue")
	if absf(stamina - was) > 0.0:
		_save_t += dt
		if _save_t > 2.0 or stamina >= 1.0 or stamina <= FATIGUE_AT:
			_save_t = 0.0
			cond.body["stamina"] = snappedf(stamina, 0.001)

func _wet(dt: float, spd: float) -> void:
	var s := cond.strength("wet")
	if in_water:
		var line := maxf(s * height, depth + WICK)
		var cap := height * 1.02
		if line < cap:
			var run_k := clampf(spd / 8.5, 0.0, 1.0) if spd > 1.0 else 0.0
			line = minf(cap, line + dt * (WET_CREEP + WET_SPLASH * run_k * (0.4 + depth_frac()) + WET_DEEP * depth_frac()))
		cond.apply("wet", line / height)
		cond.hold("wet")
		s = cond.strength("wet")
	wet_line = s * height
	_apply_wet_look()

func _apply_wet_look() -> void:
	var y := actor.global_position.y + wet_line if wet_line > 0.01 else -10000.0
	if not is_nan(_wet_y_set) and absf(y - _wet_y_set) < 0.002: return
	_wet_y_set = y
	for e in _mats: e[0].set_shader_parameter("wet_y", y)

func _fx(dt: float, spd: float, p: Vector3) -> void:
	var a := actor
	var steps_changed := a.steps != _steps
	_steps = a.steps
	var dir := Vector3(sin(game.yaw), 0, cos(game.yaw))
	if in_water and actor.visible and is_nan(ride_rate):   # (on his bike: bike/bike_water.gd splashes)
		var at := Vector3(p.x, surface + 0.01, p.z)
		# into the water at a pace: a splash
		if not _was_in and spd > 2.0:
			fx.spray(at, 14, spd, dir)
			Sfx.play("land_water", null, {"vol": -6.0})
		if spd > 0.4:
			_spray_acc += dt * (10.0 + 40.0 * spd / 8.5)
			var n := int(_spray_acc)
			_spray_acc -= n
			fx.spray(at, n + (int(6 + 8 * spd / 8.5) if steps_changed else 0), spd, dir)
		_ring_t -= dt
		if _ring_t <= 0.0:
			_ring_t = 0.24 if spd > 0.4 else rng.randf_range(0.9, 1.6)
			fx.ring(at - dir * minf(0.4, spd * 0.06), 0.9 + spd * 0.12 + depth * 1.2)
	elif steps_changed and cast.ground and spd > 0.3 and wet_line > 0.02 and is_nan(ride_rate):
		# out of the water: wet shoes squelch (louder the wetter, until they dry last of all)
		var w := clampf(wet_line / (height * 0.5), 0.0, 1.0)
		Sfx.play("step_water", null, {"vol": -19.0 + 8.0 * w, "pitch": 1.35})
	# drops off his clothes
	var s := wet_line / height
	if s > 0.03 and actor.visible:
		_drip_acc += dt * DRIPS * (s * s * 0.8 + s * 0.2) * (1.0 + minf(spd, 6.0) * 0.08)
		var top := minf(wet_line, height * 0.92)
		var floor_y: float = surface if in_water else p.y
		while _drip_acc >= 1.0:
			_drip_acc -= 1.0
			var a2 := rng.randf() * TAU
			var h := rng.randf_range(minf(0.25, top), top)
			var r := 0.13 if h < 0.85 else 0.2   # the legs, then the jacket's hem and sleeves
			var from := p + Vector3(cos(a2) * r, h, sin(a2) * r)
			fx.drop(from, Vector3(dir.x * spd * 0.9, -0.3, dir.z * spd * 0.9), floor_y, rng.randf_range(0.02, 0.032), 1.5)
		# soaked and standing still: a drip now and then you can hear
		_drip_snd -= dt
		if _drip_snd <= 0.0:
			_drip_snd = rng.randf_range(1.5, 3.5)
			if s > 0.45 and spd < 0.3 and not in_water: Sfx.play("water_drip", null, {"vol": -16.0})
	fx.update(dt)

# a door between: the effects stop where he was
func clear_fx() -> void:
	if fx: fx.clear()
