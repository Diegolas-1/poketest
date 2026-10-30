extends Node3D
# Pallet Town, native. The world (ground, paths, town, water, grass map, walk
# grid, colliders) is baked from the web build by tools/native/bake.mjs into
# res://world/ and drawn here with the same cel look. Red is a placeholder
# until the character port.

const TOON := preload("res://shaders/toon.gdshader")
const TOON_DS := preload("res://shaders/toon_ds.gdshader")
const TERRAIN := preload("res://shaders/terrain.gdshader")
const EARTH := preload("res://shaders/earth.gdshader")   # earth faces: banks, ledges (web props/earth.js)
const GrassLip := preload("res://grass_lip.gd")
var earth_tex: Texture2D   # the earth atlas (world/base/earth.webp)
var lips: Node3D          # the fluffy grass lips over banks, walls and ledges (grass_lip.gd)
const SEA := preload("res://shaders/sea.gdshader")
const FRESH := preload("res://shaders/fresh.gdshader")
const FRESH_FALL := preload("res://shaders/fresh_fall.gdshader")
var falls: Array = []   # the falling water's meshes (sfx_world.gd: where the falls roar)
const SKY := preload("res://shaders/sky.gdshader")
const Grass := preload("res://grass.gd")
const Scenery := preload("res://scenery.gd")

const T := preload("res://tunables.gd")   # values the world editor can change (res://tunables/*.json)
var SUN_DIR := T.vec3("render", "sun_dir", Vector3(-0.55, 0.75, 0.45))
var FOG := T.col("render", "fog", Color("c4e2f0"))

var world = WorldData.new()   # or an InteriorData while inside (same calls)
var grass: Node3D
var cast: Cast
var cam: Camera3D
var pos := Vector3.ZERO
var yaw := 0.0
var speed := 0.0
var cam_yaw := 0.35
var cam_pitch := T.num("camera", "pitch", 0.32)
var cam_dist := T.num("camera", "dist", 7.5)
var cam_idle := 0.0
var cam_ty := 0.0
var cam_floor := 0.0
var cam_target := Vector3.ZERO
var cam_recenter := 0.0
var hud: Label
var stick_id := -1
var stick_origin := Vector2.ZERO
var stick_vec := Vector2.ZERO
var look_id := -1
var look_last := Vector2.ZERO
var stick_ui: Control
var knob_ui: Control
var fps_acc := 0.0
var fps_n := 0
var fps_worst := 0.0
var mats := {}
var scenery: Node3D
var route1: Node3D
var town_root: Node
var water_root: Node
var terrain_root: Node
var terrain_mat: ShaderMaterial
# spaces: the outdoor world, or an interior shown on its own (interior.gd)
var outdoor_world: WorldData
var outdoor_ink: Array = []
var we: WorldEnvironment
var sun: DirectionalLight3D
var indoors := false
var interior: Interior
var space_door := {}     # the door of the interior you are in (cast.gd doors, doors.json): where you come out; {} = Oak's lab
var trans := {}          # a door fade in progress: {t, mid (Callable at full black), done}
var trans_busy := false  # true while a fade has the controls
var fader: ColorRect
var music: Node          # music.gd
var sfx: Sfx             # sfx.gd: the sound effects library and players
var sfx_world: Node      # sfx_world.gd: the town's footsteps, ambience, doors
var footprints: Node3D   # footprints.gd: the prints left on soft ground
var island: CanvasLayer  # island.gd
var cam_boom := 7.5      # indoors: the camera's distance, shortened at once by walls, lengthened slowly
var cam_shake := 0.0     # a knock (the bike into a wall): eases out
var cam_ease := 0.0      # 1 just after a conversation: the camera glides back to its boom (eases to 0)
var cam_clear := 99.0    # outdoors while hunting (wild.gd camera_care): how far back the camera can sit before a prop hides him

func _ready() -> void:
	world.load_all()
	_environment()
	_terrain()
	_town()
	_water()
	scenery = Scenery.new()   # plants, mountains, clouds, instanced town parts, sea split (scenery.gd)
	add_child(scenery)
	scenery.setup(self, town_root, water_root, terrain_mat)
	route1 = preload("res://route1.gd").new()   # Route 1's sails, swing, butterflies, birds, steam (route1.gd)
	scenery.add_child(route1)
	route1.setup(self, town_root)
	# ---- ink (worker 2): vector lines on the town; see ink.gd ----
	for f in WorldRegions.files("ink.bin"): outdoor_ink.append_array(Ink.add_world_lines(self, f))
	Ink.outline_town(self, WorldRegions.ink_meshes())
	outdoor_world = world
	grass = Grass.new()
	add_child(grass)
	grass.build(world, int(Settings.get_value("grass")), float(Settings.get_value("grass_size")), SUN_DIR.normalized())
	lips = GrassLip.new()
	lips.name = "GrassLips"
	add_child(lips)
	lips.build(SUN_DIR.normalized())
	_player()
	_hud()
	_settings_hook()
	music = preload("res://music.gd").new()   # background music (music.gd)
	music.name = "Music"
	add_child(music)
	music.setup(self)
	sfx = preload("res://sfx.gd").new()
	add_child(sfx)
	sfx.setup()
	sfx_world = preload("res://sfx_world.gd").new()
	sfx_world.name = "SfxWorld"
	add_child(sfx_world)
	sfx_world.setup(self)
	footprints = preload("res://footprints.gd").new()   # prints in sand, dirt, mud and clay (footprints.gd)
	add_child(footprints)
	footprints.setup(self)
	island = preload("res://island.gd").new()   # the Dynamic Island's compass, menu and satellites (island.gd)
	island.name = "Island"
	island.main = self
	add_child(island)

# ---------- sky, sun, haze ----------
func _environment() -> void:
	var env := Environment.new()
	var sky := Sky.new()
	var sm := ShaderMaterial.new()
	sm.shader = SKY
	sm.set_shader_parameter("sun_dir", SUN_DIR.normalized())
	sky.sky_material = sm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR   # ACES is applied by the cel shaders (aces.gdshaderinc)
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = FOG
	env.fog_light_energy = 1.0
	env.fog_depth_begin = 90.0
	env.fog_depth_end = 430.0
	env.fog_depth_curve = 1.0
	env.fog_sky_affect = 0.0
	we = WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 70.0
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.0
	# blend the two shadow cascades over their seam: things standing at the seam
	# (a few metres from the camera) no longer switch shadow detail as it moves
	sun.directional_shadow_blend_splits = true
	add_child(sun)
	sun.look_at_from_position(SUN_DIR.normalized() * 50.0, Vector3.ZERO)

# ---------- the baked world ----------
func _scene(path: String, parent: Node = self) -> Node:
	var s: PackedScene = load(path)
	var n := s.instantiate()
	parent.add_child(n)
	return n

# one root for a glb that every region may have (world_regions.gd), each
# region's copy under it
func _region_scenes(file: String, root_name: String) -> Node3D:
	var root := Node3D.new()
	root.name = root_name
	add_child(root)
	for p in WorldRegions.files(file):
		var n := _scene(p, root)
		n.name = p.get_base_dir().get_file()
	return root

func _meshes(n: Node, out: Array) -> Array:
	if n is MeshInstance3D: out.append(n)
	for c in n.get_children(): _meshes(c, out)
	return out

func _terrain() -> void:
	var root := _region_scenes("terrain.glb", "terrain")
	terrain_root = root
	var m := ShaderMaterial.new()
	m.shader = TERRAIN
	m.set_shader_parameter("grass_tex", load(WorldRegions.BASE + "grass.png"))
	m.set_shader_parameter("dirt_tex", load(WorldRegions.BASE + "dirt.webp"))
	if earth_tex == null: earth_tex = load(WorldRegions.BASE + "earth.webp")
	m.set_shader_parameter("earth_tex", earth_tex)
	m.set_shader_parameter("path_map", world.path_tex)
	var pm: Dictionary = world.meta.pathmap
	m.set_shader_parameter("pm_origin", Vector2(pm.x0, pm.z0))
	m.set_shader_parameter("pm_size", Vector2(pm.w, pm.d))
	m.set_shader_parameter("sun_dir", SUN_DIR.normalized())
	terrain_mat = m
	for mi in _meshes(root, []):
		mi.material_override = m

# the town's materials become cel materials with the same colour and texture
# (one per look: the regions' glbs each have their own copy of a material)
func toon_for(src: Material) -> ShaderMaterial:
	if mats.has(src): return mats[src]
	var key := _look_of(src)
	if mats.has(key):
		mats[src] = mats[key]
		return mats[key]
	var m := ShaderMaterial.new()
	m.shader = TOON
	var nm := String(src.resource_name) if src else ""
	# earth faces: painted soils from the earth atlas (shaders/earth.gdshader)
	if nm.begins_with("earth"):
		m.shader = EARTH
		if earth_tex == null: earth_tex = load(WorldRegions.BASE + "earth.webp")
		m.set_shader_parameter("earth_tex", earth_tex)
		mats[src] = m
		mats[key] = m
		return m
	if src is BaseMaterial3D:
		m.set_shader_parameter("albedo", src.albedo_color)
		if src.albedo_texture:
			m.set_shader_parameter("albedo_tex", src.albedo_texture)
			m.set_shader_parameter("use_tex", true)
		if src.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED:
			m.set_shader_parameter("alpha_scissor", maxf(0.5, src.alpha_scissor_threshold) if src.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR else 0.5)
		if src.cull_mode == BaseMaterial3D.CULL_DISABLED: m.shader = TOON_DS   # double sided on the web too
	m.set_shader_parameter("use_vc", nm.contains("_vc"))
	if nm.contains("_decal"): m.set_shader_parameter("lift", 0.004)
	mats[src] = m
	mats[key] = m
	return m

func _look_of(src: Material) -> String:
	if not src is BaseMaterial3D: return "?" + str(src.get_instance_id() if src else 0)
	var b: BaseMaterial3D = src
	var tex := b.albedo_texture.resource_path if b.albedo_texture else ""
	if b.albedo_texture and tex == "": tex = str(b.albedo_texture.get_instance_id())
	return "%s|%s|%s|%d|%f|%d" % [b.resource_name, b.albedo_color.to_html(), tex, b.transparency, b.alpha_scissor_threshold, b.cull_mode]

func _town() -> void:
	# town.glb's pictures (town_N.png) loaded one by one first, from here: left
	# to the scene's own load, the engine loaded its ~100 external textures on
	# the worker pool, which ran out of threads and stalled for good on a
	# 4-core machine (6 on the phone); cached now, the scene finds them ready
	var glbs := WorldRegions.files("town.glb")
	for g in glbs:
		for d in ResourceLoader.get_dependencies(g):
			var p := String(d).get_slice("::", 2) if String(d).contains("::") else String(d)
			if p.ends_with(".png") or p.ends_with(".webp") or p.ends_with(".jpg"): load(p)
	var root := _region_scenes("town.glb", "town")
	town_root = root
	for mi in _meshes(root, []):
		var mesh: Mesh = mi.mesh
		for s in mesh.get_surface_count():
			mi.set_surface_override_material(s, toon_for(mesh.surface_get_material(s)))

func _water() -> void:
	var root := _scene(WorldRegions.BASE + "water.glb")
	water_root = root
	world.build_surface(root)   # the fresh water's surface, for wading (world_data.gd)
	var sea := ShaderMaterial.new()
	sea.shader = SEA
	sea.set_shader_parameter("seabed", world.seabed_tex)
	var sb: Dictionary = world.meta.seabed
	sea.set_shader_parameter("bed_box", Vector4(sb.x0, sb.z0, sb.n, sb.n))
	sea.set_shader_parameter("sea_y", world.sea_y)
	for mi in _meshes(root, []):
		var nm := String(mi.name)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if nm.begins_with("fresh"):
			# fresh0 still (the pond, pools), fresh1 flowing (streams), fresh2-4
			# falling water, its foam and its mist (shaders/fresh_fall.gdshader)
			var kind := int(nm.substr(5, 1))
			var f := ShaderMaterial.new()
			if kind >= 2:
				f.shader = FRESH_FALL
				f.set_shader_parameter("mode", float(kind))
				f.render_priority = kind   # (foam over the pool, mist over the sheet)
				falls.append(mi)
			else:
				f.shader = FRESH
				f.set_shader_parameter("flow", 1.0 if kind == 1 else 0.0)
			mi.material_override = f
		else:
			mi.material_override = sea
		mi.extra_cull_margin = 4.0

# ---------- the people (cast.gd: Ash, the villagers, talking, Oak) ----------
func _player() -> void:
	var sp: Array = world.meta.spawn
	pos = Vector3(sp[0], sp[1], sp[2])
	yaw = world.meta.yaw
	pos.y = world.height_at(pos.x, pos.z)
	cam = Camera3D.new()
	cam.fov = 52.0
	cam.near = 0.25
	cam.far = 2000.0
	add_child(cam)
	cast = Cast.new()
	add_child(cast)
	cast.setup(self)
	cam_ty = pos.y
	cam_target = pos + Vector3(0, 1.45, 0)
	cam_floor = pos.y

# ---------- controls: left half = move stick, right half = camera ----------
func _input(e: InputEvent) -> void:
	var half := get_viewport().get_visible_rect().size.x * 0.5
	if e is InputEventScreenTouch:
		if e.pressed and island and island.blocks(e.position): return   # the Dynamic Island's menu and its tap zone
		if e.pressed and Settings.blocks_touch(e.position): return   # the settings cog
		if e.pressed and cast and cast.life and cast.life.quests.blocks_touch(e.position): return   # the quest log button
		if e.pressed and cast and cast.cond_ui and cast.cond_ui.blocks(e.position): return   # the condition badges
		if e.pressed:
			if e.position.x < half and stick_id == -1:
				stick_id = e.index; stick_origin = e.position; stick_vec = Vector2.ZERO
				stick_ui.visible = true; stick_ui.position = e.position - stick_ui.size * 0.5
				knob_ui.position = stick_ui.size * 0.5 - knob_ui.size * 0.5
			elif look_id == -1:
				look_id = e.index; look_last = e.position
		else:
			if e.index == stick_id:
				stick_id = -1; stick_vec = Vector2.ZERO; stick_ui.visible = false
			elif e.index == look_id:
				look_id = -1
	elif e is InputEventScreenDrag:
		if e.index == stick_id:
			var d: Vector2 = e.position - stick_origin
			stick_vec = d.limit_length(60.0) / 60.0
			knob_ui.position = stick_ui.size * 0.5 + stick_vec * 40.0 - knob_ui.size * 0.5
		elif e.index == look_id:
			var d2: Vector2 = e.position - look_last
			look_last = e.position
			cam_yaw -= d2.x * 0.006
			cam_pitch = clampf(cam_pitch + d2.y * 0.004, -0.15, 1.2)
			cam_idle = 0.0

func _process(dt: float) -> void:
	# a long frame (a hitch, a busy moment on the phone) is caught up in real time down to
	# 10 fps; below that the game slows rather than jumping (it was 20 fps, so a phone
	# running at 15 fps had the whole town walking at three quarters of its pace)
	dt = minf(dt, 0.1)
	# keyboard and gamepad through the InputMap actions (project.godot)
	var cs: float = Settings.get_value("cam_speed")
	var look := Input.get_vector("cam_left", "cam_right", "cam_down", "cam_up")
	if Settings.get_value("invert_y") == 1: look.y = -look.y
	if look != Vector2.ZERO:
		look *= look.length()   # gentle near the centre, full speed at the edge
		cam_yaw -= look.x * dt * T.num("camera", "look_yaw_speed", 3.6) * cs; cam_pitch = clampf(cam_pitch + look.y * dt * T.num("camera", "look_pitch_speed", 2.0) * cs, T.num("camera", "pitch_min", -0.15), T.num("camera", "pitch_max", 1.2)); cam_idle = 0.0; cam_recenter = 0.0
	elif look_id == -1:
		cam_idle += dt
	if Input.is_action_just_pressed("recenter"): cam_recenter = T.num("camera", "recenter_time", 0.35)
	var pad := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var mv := (pad + stick_vec).limit_length(1.0)
	var rs := T.num("player", "run_stick", 0.85)
	# crouched, the stick pushed right out is the full creep, not a run: only the run button stands him up (cast.gd)
	var run := Input.is_action_pressed("run") or (not cast.crouching and (stick_vec.length() > rs or pad.length() > rs))
	run = run and cast.body.can_run()   # worn out: walking only (body.gd, the fatigue condition)
	var crouched: bool = cast.crouching and not run
	if cast.busy() or trans_busy: mv = Vector2.ZERO
	# move relative to the camera (as in Legends: Arceus)
	var f := Vector2(-sin(cam_yaw), -cos(cam_yaw))
	var r := Vector2(cos(cam_yaw), -sin(cam_yaw))
	var dir := r * mv.x - f * mv.y
	var m := minf(1.0, dir.length())
	if cast.bike and cast.bike.controls():
		# on his bike (bike/bike.gd): the stick's tilt pedals, its way steers; right out = sprint
		cast.bike.control(dt, dir, m, mv.length() >= 0.95)
		cast.body.running = false
	else:
		var want := (T.num("player", "run_speed", 8.5) if run else T.num("player", "walk_speed", 4.5)) * m if m > 0.05 else 0.0
		if crouched: want = T.num("player", "crouch_speed", 1.4) * minf(1.0, m / rs) if m > 0.05 else 0.0   # crouch-walking: slow and quiet
		want *= cast.body.speed_mult(run)   # slower in the water (deeper, slower), and by his conditions
		cast.body.running = run and m > 0.05 and not cast.busy() and not trans_busy
		if not cast.busy() and not trans_busy: speed += (want - speed) * (1.0 - exp(-dt * T.num("player", "accel", 10.0)))
		if m > 0.05:
			var ty := atan2(dir.x, dir.y)
			yaw += wrapf(ty - yaw, -PI, PI) * (1.0 - exp(-dt * T.num("player", "turn", 12.0)))
		if speed > 0.05 and not cast.busy() and not trans_busy:
			pos = world.step(pos, sin(yaw) * speed * dt, cos(yaw) * speed * dt, true)   # (Ash wades: world_data.gd can_wade)
			if cast.bike and not indoors:
				pos = cast.bike.push_out(pos)   # (round his parked bike, and the townspeople's)
				if cast.life and cast.life.cyclists: pos = cast.life.cyclists.push_out(pos)
	cast.update(dt)
	if sfx_world: sfx_world.update(dt)
	_trans_step(dt)
	if indoors and trans.is_empty() and speed > 0.3:
		var po: Dictionary = interior.data.portal_at(pos)
		if not po.is_empty(): leave_space()
	if grass_dirty and not indoors: _rebuild_grass()
	if grass and not grass.tiles.is_empty():
		grass.set_walkers(_walkers(), dt, cam.global_position, pos)
		grass.update(pos)
	Ink.set_focus(pos)   # ink thins with distance from Red (ink.gd)
	cam_ease = maxf(0.0, cam_ease - dt * 0.8)
	if cast.convo and cast.convo.cam_on: cast.convo.camera(dt)   # a conversation frames its own shots
	elif indoors: _camera_in(dt)
	else: _camera(dt)
	if not indoors: scenery.update(cam.global_position)
	if not indoors and lips: lips.update(cam.global_position)
	if not indoors and route1: route1.update(dt)
	fps_acc += dt; fps_n += 1; fps_worst = maxf(fps_worst, dt)
	if fps_acc >= 0.5:
		hud.text = "%d fps · %d ms" % [roundi(fps_n / fps_acc), roundi(fps_worst * 1000.0)]
		fps_acc = 0.0; fps_n = 0; fps_worst = 0.0

# the camera (web main.js updateCamera): swings in behind while you walk and
# leave it alone; its height follows slowly so stairs read as a ramp
func _camera(dt: float) -> void:
	# on the bike: further back and a little lower with speed, swinging in behind sooner
	var bk = cast.bike if cast and cast.bike and cast.bike.riding() else null
	# crouched: the camera comes down with him and a little closer
	var cw: float = cast.player.crouch_w if cast and cast.player else 0.0
	var dist: float = cam_dist + (bk.cam_pull() if bk else 0.0) - T.num("camera", "crouch_pull", 1.1) * cw
	var pitch_eff: float = cam_pitch - (bk.cam_drop() if bk else 0.0)
	if cam_recenter > 0.0:   # L / ZL / C: swing in behind the player
		cam_recenter -= dt
		cam_yaw += wrapf(yaw + PI - cam_yaw, -PI, PI) * (1.0 - exp(-dt * 12.0))
	elif _wild_frame(dt): pass   # (the hunt's tutorial: him and the twitching spot both in view)
	elif cam_idle > (0.5 if bk else T.num("camera", "follow_idle", 1.0)) and speed > 0.5:
		var behind := wrapf(yaw + PI - cam_yaw, -PI, PI)
		var swing := behind * (1.0 - exp(-dt * T.num("camera", "follow_rate", 0.9) * (bk.CAM_FOLLOW if bk else 1.0) * minf(1.0, speed / 6.0)))
		if bk: swing = clampf(swing, -bk.CAM_SWING * dt, bk.CAM_SWING * dt)   # (a tight turn: no whip)
		cam_yaw += swing
	var dy := pos.y - cam_ty
	cam_ty += dy * (1.0 - exp(-dt * (T.num("camera", "height_follow_fast", 8.0) if absf(dy) > 1.5 else T.num("camera", "height_follow", 3.5))))
	var k := 1.0 - exp(-dt * (bk.CAM_LAG if bk else T.num("camera", "target_follow", 10.0)))
	cam_target.x += (pos.x - cam_target.x) * k
	cam_target.z += (pos.z - cam_target.z) * k
	cam_target.y = cam_ty + T.num("camera", "eye_height", 1.45) - T.num("camera", "crouch_drop", 0.5) * cw
	var cp := cos(pitch_eff)
	var want := cam_target + Vector3(sin(cam_yaw) * cp, sin(pitch_eff), cos(cam_yaw) * cp) * dist
	# hunting wild Pokémon (wild.gd camera_care): a sign, a tree or a wall between the
	# camera and him pulls it in along the line to him at once, and lets it back slowly
	if cast and cast.wild and cast.wild.camera_care():
		var off := want - cam_target
		var ln := off.length()
		var free := _cam_free(cam_target, off / maxf(ln, 1e-3), ln)
		cam_clear = minf(cam_clear, ln)
		cam_clear += (free - cam_clear) * (1.0 - exp(-dt * (14.0 if free < cam_clear else 1.5)))
		if cam_clear < ln: want = cam_target + off / maxf(ln, 1e-3) * maxf(cam_clear, 1.2)
	else:
		cam_clear = 99.0
	var gc := T.num("camera", "ground_clear", 0.4)
	var fl := maxf(world.height_at(want.x, want.z) + gc, world.sea_y + gc)
	cam_floor += (fl - cam_floor) * (1.0 - exp(-dt * (T.num("camera", "floor_up", 9.0) if fl > cam_floor else T.num("camera", "floor_down", 3.0))))
	want.y = maxf(want.y, cam_floor)
	if cam.position == Vector3.ZERO: cam.position = want
	cam.position = cam.position.lerp(want, 1.0 - exp(-dt * lerpf(T.num("camera", "smooth", 14.0), 2.2, cam_ease)))
	cam.look_at(cam_target)
	# (on the bike the view widens a little with speed; indoors may have left another)
	var fov_want: float = T.num("camera", "fov", 52.0) + (bk.cam_fov() if bk else 0.0)
	cam.fov += (fov_want - cam.fov) * (1.0 - exp(-dt * 3.0))
	if cam_shake > 0.001:
		cam_shake = move_toward(cam_shake, 0.0, dt * 0.8)
		cam.rotate_object_local(Vector3.RIGHT, sin(Time.get_ticks_msec() * 0.06) * cam_shake * 0.05)

# how far from `look` along dir (up to len) the camera can go before a prop (a sign, a
# post, a trunk, a wall: the world's colliders, below 4 m up) is in the way
func _cam_free(look: Vector3, dir: Vector3, len: float) -> float:
	var n := 12
	for i in range(1, n + 1):
		var t := len * i / n
		var p := look + dir * t
		var g: float = world.height_at(p.x, p.z)
		if p.y - g > 4.0: continue
		var q: Vector3 = world.collide(p, 0.25)
		if Vector2(q.x - p.x, q.z - p.z).length() > 0.01: return maxf(0.0, t - len / n)
	return len

# the hunt's tutorial frames a spot (wild.gd camera_hint): while the player leaves the
# camera alone, it swings round behind him to look past his shoulder at it
func _wild_frame(dt: float) -> bool:
	if cast == null or cast.wild == null or cam_idle < 0.8: return false
	var h: Dictionary = cast.wild.camera_hint()
	if h.is_empty(): return false
	var at: Vector3 = h.at
	if Vector2(at.x - pos.x, at.z - pos.z).length() < 1.0: return false
	# over whichever shoulder has the clearer view (a sign or a post beside the shot
	# pushes it round to the other side; it keeps its side unless the other is much clearer)
	var base := atan2(pos.x - at.x, pos.z - at.z)
	var sd := absf(float(h.get("side", 0.3)))
	var bad := [0.0, 0.0]
	for k in 2:
		var y := base + (sd if k == 0 else -sd)
		var cp := cos(cam_pitch)
		var off := Vector3(sin(y) * cp, sin(cam_pitch), cos(y) * cp) * cam_dist
		var lat := Vector3(cos(y), 0, -sin(y))
		for l in [0.0, 1.2, -1.2]:
			var tip: Vector3 = cam_target + off + lat * l
			var dv := tip - cam_target
			bad[k] += dv.length() - _cam_free(cam_target, dv.normalized(), dv.length())
	if (_frame_side > 0.0 and bad[0] > bad[1] + 1.0) or (_frame_side < 0.0 and bad[1] > bad[0] + 1.0): _frame_side = -_frame_side
	var want := base + sd * _frame_side
	cam_yaw += wrapf(want - cam_yaw, -PI, PI) * (1.0 - exp(-dt * 2.2))
	return true
var _frame_side := 1.0

# ---------- spaces: going through a door ----------
# Like the games: the screen fades to black, the outdoor world (terrain, town,
# water, plants, grass, ink, villagers, the sun) is hidden and stops updating
# (the grass is freed and rebuilt on the way out), the interior is loaded as
# its own space with its own light and environment, Ash stands at its door,
# and the screen fades back in. Leaving frees the interior.
const FADE := 0.32

func enter_space(id: String, spawn_id := "", instant := false) -> void:
	if trans.is_empty() and sfx_world: sfx_world.door_lab(true)
	_fade(func(): _enter_now(id, spawn_id), instant)

func leave_space(instant := false) -> void:
	if trans.is_empty() and sfx_world: sfx_world.door_lab(false)
	_fade(func(): _leave_now(), instant)

func _fade(mid: Callable, instant: bool) -> void:
	if not trans.is_empty(): return
	if instant:
		mid.call(); return
	trans = {"t": 0.0, "mid": mid, "fired": false}
	trans_busy = true
	speed = 0.0

func _trans_step(dt: float) -> void:
	if trans.is_empty(): return
	trans.t += dt
	var t: float = trans.t
	if t >= FADE and not trans.fired:
		trans.fired = true
		trans.mid.call()
		trans.t = FADE   # the frame the load took does not eat the fade in
		t = FADE
	var a := t / FADE if t < FADE else 1.0 - (t - FADE - 0.08) / FADE
	fader.color.a = clampf(a, 0.0, 1.0)
	wipe_out = t >= FADE
	if t >= FADE * 2.0 + 0.08:
		trans = {}; trans_busy = false; fader.color.a = 0.0
	fader.queue_redraw()

func _outdoor_shown(on: bool) -> void:
	for n in [terrain_root, town_root, water_root, scenery, sun, lips]:
		if n: n.visible = on
	if cast and cast.bike: cast.bike.set_shown(on)   # (it waits outside)
	for n in outdoor_ink:
		if not is_instance_valid(n): continue
		n.visible = on and Ink.is_enabled()
		# out of Ink's list while hidden, so the outlines switch does not show them
		if on and not Ink.line_nodes.has(n): Ink.line_nodes.append(n)
		elif not on: Ink.line_nodes.erase(n)
	scenery.process_mode = Node.PROCESS_MODE_INHERIT if on else Node.PROCESS_MODE_DISABLED

func _enter_now(id: String, spawn_id: String) -> void:
	var it := Interior.new()
	it.name = "Interior_" + id
	add_child(it)
	if not it.build(id):
		it.queue_free(); push_warning("no interior " + id); return
	interior = it
	space_door = cast.door_of(id) if cast else {}
	indoors = true
	_outdoor_shown(false)
	if grass:
		grass.queue_free(); grass = null
	we.environment = it.env
	world = it.data
	var sp: Dictionary = it.data.spawn(spawn_id)
	it.data.level = int(sp.level)
	pos = Vector3(sp.x, float(sp.y), sp.z)
	yaw = float(sp.rot)
	speed = 0.0
	cam_yaw = yaw + PI
	cam_pitch = 0.3
	cam_ty = pos.y
	cam_target = pos + Vector3(0, 1.45, 0)
	cam_boom = 2.0
	cam.near = 0.1
	cam.far = 120.0
	cam.position = Vector3.ZERO
	cast.enter_space(it)
	cast.land(pos.y)

func _leave_now() -> void:
	var lab: Vector2 = cast.lab_door
	cast.leave_space()
	if interior:
		interior.free_ink()
		interior.queue_free(); interior = null
	indoors = false
	cast.player.visible = true
	world = outdoor_world
	we.environment = outdoor_env
	_outdoor_shown(true)
	grass_dirty = true
	_rebuild_grass()
	# outside the lab door, facing away from it (down the courtyard, west);
	# another building's: on its step, facing away from its door
	if space_door.is_empty():
		pos = Vector3(lab.x, world.height_at(lab.x, lab.y), lab.y)
		yaw = -PI / 2.0
	else:
		var ex: Array = space_door.exit
		pos = Vector3(ex[0], world.height_at(ex[0], ex[1]), ex[1])
		yaw = float(ex[2])
		space_door = {}
	speed = 0.0
	# the camera out in front, a little to the side: Ash walking out, the lab behind him
	cam_yaw = yaw + 0.55
	cam_pitch = 0.32
	cam_ty = pos.y
	cam_target = pos + Vector3(0, 1.45, 0)
	cam_floor = pos.y
	cam.near = 0.25
	_on_setting("fog", Settings.get_value("fog"))
	cam.position = Vector3.ZERO
	cast.land(pos.y)

var outdoor_env: Environment
var cam_lift := 0.0

func _cam_dir(p: float) -> Vector3:
	var cp := cos(p)
	return Vector3(sin(cam_yaw) * cp, sin(p), cos(cam_yaw) * cp)

# indoors: closer and a little lower (as Legends: Arceus does inside), framed
# by the camera volume the player stands in, and never through a wall, the
# ceiling or a slab: the boom shortens at once where a volume ends and grows
# back slowly
func _camera_in(dt: float) -> void:
	var D: InteriorData = interior.data
	var cdef: Dictionary = D.meta.camera.get("default", {})
	if cam_recenter > 0.0:
		cam_recenter -= dt
		cam_yaw += wrapf(yaw + PI - cam_yaw, -PI, PI) * (1.0 - exp(-dt * 12.0))
	elif cam_idle > 1.0 and speed > 0.5:
		cam_yaw += wrapf(yaw + PI - cam_yaw, -PI, PI) * (1.0 - exp(-dt * 1.2 * minf(1.0, speed / 4.0)))
	var dy := pos.y - cam_ty
	cam_ty += dy * (1.0 - exp(-dt * (8.0 if absf(dy) > 1.5 else 4.0)))
	var k := 1.0 - exp(-dt * 12.0)
	cam_target.x += (pos.x - cam_target.x) * k
	cam_target.z += (pos.z - cam_target.z) * k
	cam_target.y = cam_ty + float(cdef.get("height", 1.4))
	var v: Dictionary = D.volume_at(cam_target)
	var want_d := float(v.get("dist", cdef.get("dist", 5.0)))
	var want_p := float(v.get("pitch", cdef.get("pitch", 0.3)))
	# the volume's pitch, unless the player is looking around
	if cam_idle > 1.5: cam_pitch += (want_p - cam_pitch) * (1.0 - exp(-dt * 1.5))
	cam_pitch = clampf(cam_pitch, -0.1, 1.1)
	var fov := float(v.get("fov", cdef.get("fov", 56.0)))
	cam.fov += (fov - cam.fov) * (1.0 - exp(-dt * 3.0))
	# cramped (a wall right behind): look down from higher up rather than
	# sit on the player's back; the lift eases in and out
	var lift_want := 0.0
	var free_d := D.boom(cam_target, _cam_dir(cam_pitch), want_d)
	if free_d < want_d * 0.7:
		# the smallest lift (up to a look of about 50 degrees down) that gives the
		# camera three quarters of its distance, else the one giving the most
		var best := free_d
		for i in 6:
			var lp := 0.08 * (i + 1)
			if cam_pitch + lp > 0.7: break
			var fd := D.boom(cam_target, _cam_dir(cam_pitch + lp), want_d)
			if fd > best + 0.25: best = fd; lift_want = lp
			if fd >= want_d * 0.75: break
	cam_lift += (lift_want - cam_lift) * (1.0 - exp(-dt * 3.0))
	var dir := _cam_dir(minf(1.25, cam_pitch + cam_lift))
	free_d = D.boom(cam_target, dir, want_d)
	if free_d < cam_boom: cam_boom = free_d
	else: cam_boom += (free_d - cam_boom) * (1.0 - exp(-dt * 2.5))
	var cwant := cam_target + dir * cam_boom
	cam.position = cwant if cam_ease <= 0.0 else cam.position.lerp(cwant, 1.0 - exp(-dt * lerpf(30.0, 2.5, cam_ease)))
	# pressed right up against the player (a wall at their back): hide them
	# rather than show the inside of their head
	cast.player.visible = cam_boom > 0.75
	# with the camera pushed in close, it looks a little past the player
	var lead := clampf((want_d - cam_boom) * 0.2, 0.0, 0.8)
	cam.look_at(cam_target - Vector3(dir.x, 0.0, dir.z).normalized() * lead)

func _hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(60, 16)
	hud.add_theme_font_size_override("font_size", 22)
	hud.add_theme_color_override("font_color", Color.WHITE)
	hud.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
	hud.add_theme_constant_override("outline_size", 6)
	layer.add_child(hud)
	# the door fade (over everything but the settings)
	var fl := CanvasLayer.new()
	fl.layer = 5
	add_child(fl)
	# the door transition: a skewed ink wipe with a red and yellow leading edge
	# that sweeps across, holds (a Poké Ball in the middle), and sweeps on off
	# the far side; fader.color.a is its progress (the ColorRect itself draws clear)
	fader = ColorRect.new()
	fader.color = Color(0, 0, 0, 0)
	fader.self_modulate = Color(1, 1, 1, 0)
	fader.set_anchors_preset(Control.PRESET_FULL_RECT)
	fader.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fl.add_child(fader)
	var wipe := Control.new()
	wipe.set_anchors_preset(Control.PRESET_FULL_RECT)
	wipe.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wipe.draw.connect(_draw_wipe.bind(wipe))
	fader.draw.connect(wipe.queue_redraw)
	fl.add_child(wipe)
	outdoor_env = we.environment
	# the move stick (shown where the left thumb lands): a dark ring with four
	# chevrons, the knob a white disc with a red rim (ui/ui_theme.gd look)
	stick_ui = Control.new()
	stick_ui.size = Vector2(132, 132)
	stick_ui.visible = false
	stick_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stick_ui.draw.connect(func():
		var c := stick_ui.size * 0.5
		stick_ui.draw_circle(c, 64.0, Color(UITheme.PLATE, 0.42), true, -1.0, true)
		stick_ui.draw_arc(c, 63.0, 0.0, TAU, 48, Color(1, 1, 1, 0.55), 2.0, true)
		stick_ui.draw_arc(c, 44.0, 0.0, TAU, 40, Color(1, 1, 1, 0.12), 1.5, true)
		for k in 4:
			var d := Vector2.UP.rotated(k * PI * 0.5)
			var n := Vector2(-d.y, d.x)
			var tip := c + d * 57.0
			stick_ui.draw_colored_polygon(PackedVector2Array([tip, tip - d * 7.0 + n * 8.0, tip - d * 4.0, tip - d * 7.0 - n * 8.0]), Color(1, 1, 1, 0.75)))
	layer.add_child(stick_ui)
	knob_ui = Control.new()
	knob_ui.size = Vector2(56, 56)
	knob_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	knob_ui.draw.connect(func():
		var c := knob_ui.size * 0.5
		knob_ui.draw_circle(c + Vector2(0, 3), 27.0, Color(0, 0, 0, 0.3), true, -1.0, true)
		knob_ui.draw_circle(c, 27.0, Color(UITheme.RED, 0.95), true, -1.0, true)
		knob_ui.draw_circle(c, 22.0, Color(UITheme.WHITE, 0.95), true, -1.0, true)
		knob_ui.draw_circle(c, 7.0, Color(UITheme.INK, 0.35), false, 2.0, true))
	stick_ui.add_child(knob_ui)

var wipe_out := false   # the door wipe's second half (it uncovers toward the far side)
func _draw_wipe(w: Control) -> void:
	var k := UITheme.ease_out(fader.color.a) if not wipe_out else UITheme.ease_in(fader.color.a)
	if k <= 0.001: return
	var vs := w.get_viewport_rect().size
	var lean := vs.y * 0.35
	var span := vs.x + lean
	var ink := UITheme.INK
	if not wipe_out:
		# covering from the left: the edge at k * span
		var ex := -lean + k * (span + lean)
		w.draw_colored_polygon(PackedVector2Array([Vector2(-lean, 0), Vector2(ex + lean, 0), Vector2(ex, vs.y), Vector2(-lean, vs.y)]), ink)
		w.draw_colored_polygon(PackedVector2Array([Vector2(ex + lean, 0), Vector2(ex + lean + 22, 0), Vector2(ex + 22, vs.y), Vector2(ex, vs.y)]), UITheme.RED)
		w.draw_colored_polygon(PackedVector2Array([Vector2(ex + lean + 30, 0), Vector2(ex + lean + 36, 0), Vector2(ex + 36, vs.y), Vector2(ex + 30, vs.y)]), UITheme.YELLOW)
	else:
		# uncovering toward the right: the trailing edge at (1 - k) * span
		var sx := -lean + (1.0 - k) * (span + lean)
		w.draw_colored_polygon(PackedVector2Array([Vector2(sx + lean, 0), Vector2(vs.x + lean, 0), Vector2(vs.x + lean, vs.y), Vector2(sx, vs.y)]), ink)
		w.draw_colored_polygon(PackedVector2Array([Vector2(sx + lean - 22, 0), Vector2(sx + lean, 0), Vector2(sx, vs.y), Vector2(sx - 22, vs.y)]), UITheme.RED)
	if fader.color.a > 0.85: UITheme.icon(w, "ball", vs * 0.5, 22.0, Color(1, 1, 1, (fader.color.a - 0.85) / 0.15))

# ---------- settings (settings.gd): the scene's share of the live settings ----------
var grass_dirty := false

func _settings_hook() -> void:
	hud.visible = false   # the FPS counter lives in perf_overlay.gd now
	Settings.changed.connect(_on_setting)
	for k in ["shadow", "shadow_dist", "fog", "lod", "exposure"]: _on_setting(k, Settings.get_value(k))

func _on_setting(key: String, v) -> void:
	var env: Environment = outdoor_env if outdoor_env else we.environment
	match key:
		"shadow":
			if sun: sun.shadow_enabled = int(v) > 0
			if interior: interior.light.shadow_enabled = int(v) > 0
		"shadow_dist": if sun: sun.directional_shadow_max_distance = float(v)
		"fog", "lod":
			var f := float(Settings.get_value("fog"))
			env.fog_depth_begin = 90.0 * f
			env.fog_depth_end = 430.0 * f
			if cam and not indoors: cam.far = maxf(env.fog_depth_end + 50.0, 2000.0 * float(Settings.get_value("lod")))
		"exposure":
			env.tonemap_exposure = float(v)
			if interior: interior.env.tonemap_exposure = float(v)
		"grass", "grass_size": grass_dirty = true   # rebuilt once the menu closes

func _rebuild_grass() -> void:
	grass_dirty = false
	if grass: grass.queue_free()
	grass = Grass.new()
	add_child(grass)
	var n := int(Settings.get_value("grass"))
	if n > 0: grass.build(world, n, float(Settings.get_value("grass_size")), SUN_DIR.normalized())

# who walks through the grass this frame (grass.gd set_walkers): Ash, the
# townspeople out and about, their Pokémon; [id, position, radius]
func _walkers() -> Array:
	var out := [["ash", pos, 0.5 if not cast.crouching else 0.42]]
	# on the bike: its wheels part the grass too
	if cast and cast.bike and cast.bike.riding() and not indoors:
		var f := Vector3(sin(yaw), 0, cos(yaw)) * cast.bike.model.WB * 0.5
		out.append(["bike_f", pos + f, 0.32])
		out.append(["bike_r", pos - f, 0.32])
	if indoors or cast == null or cast.life == null: return out
	for p in cast.life.people:
		if p.state == "inside" or not p.seen or absf(p.pos.x - pos.x) + absf(p.pos.z - pos.z) > 20.0: continue
		out.append([p.id, p.pos, 0.42 if p.age == "kid" else 0.5])
	if cast.life.companions:
		for c in cast.life.companions.pets:
			if c.inside != "" or not c.get("seen", false) or absf(c.pos.x - pos.x) + absf(c.pos.z - pos.z) > 20.0: continue
			out.append(["pet_" + String(c.id), c.pos, float(c.sp.r) + 0.12])
	return out
