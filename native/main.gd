extends Node3D
# Pallet Town, native. The world (ground, paths, town, water, grass map, walk
# grid, colliders) is baked from the web build by tools/native/bake.mjs into
# res://world/ and drawn here with the same cel look. Red is a placeholder
# until the character port.

const TOON := preload("res://shaders/toon.gdshader")
const TERRAIN := preload("res://shaders/terrain.gdshader")
const SEA := preload("res://shaders/sea.gdshader")
const FRESH := preload("res://shaders/fresh.gdshader")
const SKY := preload("res://shaders/sky.gdshader")
const Grass := preload("res://grass.gd")

const SUN_DIR := Vector3(-0.55, 0.75, 0.45)
const FOG := Color("c4e2f0")

var world := WorldData.new()
var grass: Node3D
var player: Node3D
var cam: Camera3D
var pos := Vector3.ZERO
var yaw := 0.0
var speed := 0.0
var cam_yaw := 0.35
var cam_pitch := 0.32
var cam_dist := 7.5
var cam_idle := 0.0
var cam_ty := 0.0
var cam_floor := 0.0
var cam_target := Vector3.ZERO
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

func _ready() -> void:
	world.load_all()
	_environment()
	_terrain()
	_town()
	_water()
	grass = Grass.new()
	add_child(grass)
	grass.build(world, 150000, 64.0, SUN_DIR.normalized())
	_player()
	_hud()

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
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 70.0
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.0
	add_child(sun)
	sun.look_at_from_position(SUN_DIR.normalized() * 50.0, Vector3.ZERO)

# ---------- the baked world ----------
func _scene(f: String) -> Node:
	var s: PackedScene = load("res://world/" + f)
	var n := s.instantiate()
	add_child(n)
	return n

func _meshes(n: Node, out: Array) -> Array:
	if n is MeshInstance3D: out.append(n)
	for c in n.get_children(): _meshes(c, out)
	return out

func _terrain() -> void:
	var root := _scene("terrain.glb")
	var m := ShaderMaterial.new()
	m.shader = TERRAIN
	m.set_shader_parameter("grass_tex", load("res://world/grass.png"))
	m.set_shader_parameter("dirt_tex", load("res://world/dirt.webp"))
	m.set_shader_parameter("path_map", world.path_tex)
	var pm: Dictionary = world.meta.pathmap
	m.set_shader_parameter("pm_origin", Vector2(pm.x0, pm.z0))
	m.set_shader_parameter("pm_size", Vector2(pm.w, pm.d))
	m.set_shader_parameter("sun_dir", SUN_DIR.normalized())
	for mi in _meshes(root, []):
		mi.material_override = m

# the town's materials become cel materials with the same colour and texture
func toon_for(src: Material) -> ShaderMaterial:
	if mats.has(src): return mats[src]
	var m := ShaderMaterial.new()
	m.shader = TOON
	var nm := String(src.resource_name) if src else ""
	if src is BaseMaterial3D:
		m.set_shader_parameter("albedo", src.albedo_color)
		if src.albedo_texture:
			m.set_shader_parameter("albedo_tex", src.albedo_texture)
			m.set_shader_parameter("use_tex", true)
		if src.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED:
			m.set_shader_parameter("alpha_scissor", maxf(0.5, src.alpha_scissor_threshold) if src.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR else 0.5)
		if src.cull_mode == BaseMaterial3D.CULL_DISABLED: m.render_priority = 0
	m.set_shader_parameter("use_vc", nm.contains("_vc"))
	if nm.contains("_decal"): m.set_shader_parameter("lift", 0.004)
	mats[src] = m
	return m

func _town() -> void:
	var root := _scene("town.glb")
	for mi in _meshes(root, []):
		var mesh: Mesh = mi.mesh
		for s in mesh.get_surface_count():
			mi.set_surface_override_material(s, toon_for(mesh.surface_get_material(s)))

func _water() -> void:
	var root := _scene("water.glb")
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
			var f := ShaderMaterial.new()
			f.shader = FRESH
			f.set_shader_parameter("flow", 1.0 if nm.begins_with("fresh1") else 0.0)
			mi.material_override = f
		else:
			mi.material_override = sea
		mi.extra_cull_margin = 4.0

# ---------- Red (placeholder until the character port) ----------
func _player() -> void:
	player = Node3D.new()
	var parts := [
		[CapsuleMesh, {"radius": 0.3, "height": 1.2}, Vector3(0, 0.7, 0), Color("2f5fb8")],
		[SphereMesh, {"radius": 0.25, "height": 0.5}, Vector3(0, 1.55, 0), Color("f2d2b6")],
		[CylinderMesh, {"top_radius": 0.23, "bottom_radius": 0.27, "height": 0.16}, Vector3(0, 1.74, 0.03), Color("e8463c")],
	]
	for p in parts:
		var mi := MeshInstance3D.new()
		var mesh: PrimitiveMesh = p[0].new()
		for k in p[1]: mesh.set(k, p[1][k])
		mi.mesh = mesh
		var m := ShaderMaterial.new()
		m.shader = TOON
		m.set_shader_parameter("albedo", p[3])
		mi.material_override = m
		mi.position = p[2]
		player.add_child(mi)
	var sp: Array = world.meta.spawn
	pos = Vector3(sp[0], sp[1], sp[2])
	yaw = world.meta.yaw
	pos.y = world.height_at(pos.x, pos.z)
	add_child(player)
	cam = Camera3D.new()
	cam.fov = 52.0
	cam.near = 0.25
	cam.far = 2000.0
	add_child(cam)
	cam_ty = pos.y
	cam_target = pos + Vector3(0, 1.45, 0)
	cam_floor = pos.y

# ---------- controls: left half = move stick, right half = camera ----------
func _input(e: InputEvent) -> void:
	var half := get_viewport().get_visible_rect().size.x * 0.5
	if e is InputEventScreenTouch:
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
	dt = minf(dt, 0.05)
	var kx := float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A))
	var ky := float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W))
	var lx := float(Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_LEFT))
	var ly := float(Input.is_physical_key_pressed(KEY_UP)) - float(Input.is_physical_key_pressed(KEY_DOWN))
	if lx != 0.0 or ly != 0.0:
		cam_yaw -= lx * dt * 2.4; cam_pitch = clampf(cam_pitch + ly * dt * 1.6, -0.15, 1.2); cam_idle = 0.0
	elif look_id == -1:
		cam_idle += dt
	var mv := Vector2(kx, ky) + stick_vec
	var run := Input.is_physical_key_pressed(KEY_SHIFT) or stick_vec.length() > 0.85
	# move relative to the camera (as in Legends: Arceus)
	var f := Vector2(-sin(cam_yaw), -cos(cam_yaw))
	var r := Vector2(cos(cam_yaw), -sin(cam_yaw))
	var dir := r * mv.x - f * mv.y
	var m := minf(1.0, dir.length())
	var want := (8.5 if run else 4.5) * m if m > 0.05 else 0.0
	speed += (want - speed) * (1.0 - exp(-dt * 10.0))
	if m > 0.05:
		var ty := atan2(dir.x, dir.y)
		yaw += wrapf(ty - yaw, -PI, PI) * (1.0 - exp(-dt * 12.0))
	if speed > 0.05:
		pos = world.step(pos, sin(yaw) * speed * dt, cos(yaw) * speed * dt)
	pos.y = world.height_at(pos.x, pos.z)
	player.position = pos
	player.rotation.y = yaw
	player.get_child(0).position.y = 0.7 + absf(sin(Time.get_ticks_msec() * 0.012)) * 0.05 * minf(1.0, speed / 4.0)
	grass.update(pos)
	_camera(dt)
	fps_acc += dt; fps_n += 1; fps_worst = maxf(fps_worst, dt)
	if fps_acc >= 0.5:
		hud.text = "%d fps · %d ms" % [roundi(fps_n / fps_acc), roundi(fps_worst * 1000.0)]
		fps_acc = 0.0; fps_n = 0; fps_worst = 0.0

# the camera (web main.js updateCamera): swings in behind while you walk and
# leave it alone; its height follows slowly so stairs read as a ramp
func _camera(dt: float) -> void:
	if cam_idle > 1.0 and speed > 0.5:
		var behind := wrapf(yaw + PI - cam_yaw, -PI, PI)
		cam_yaw += behind * (1.0 - exp(-dt * 0.9 * minf(1.0, speed / 6.0)))
	var dy := pos.y - cam_ty
	cam_ty += dy * (1.0 - exp(-dt * (8.0 if absf(dy) > 1.5 else 3.5)))
	var k := 1.0 - exp(-dt * 10.0)
	cam_target.x += (pos.x - cam_target.x) * k
	cam_target.z += (pos.z - cam_target.z) * k
	cam_target.y = cam_ty + 1.45
	var cp := cos(cam_pitch)
	var want := cam_target + Vector3(sin(cam_yaw) * cp, sin(cam_pitch), cos(cam_yaw) * cp) * cam_dist
	var fl := maxf(world.height_at(want.x, want.z) + 0.4, world.sea_y + 0.4)
	cam_floor += (fl - cam_floor) * (1.0 - exp(-dt * (9.0 if fl > cam_floor else 3.0)))
	want.y = maxf(want.y, cam_floor)
	if cam.position == Vector3.ZERO: cam.position = want
	cam.position = cam.position.lerp(want, 1.0 - exp(-dt * 14.0))
	cam.look_at(cam_target)

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
	stick_ui = Panel.new()
	stick_ui.size = Vector2(120, 120)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(1, 1, 1, 0.18)
	sb.set_corner_radius_all(60)
	sb.border_color = Color(1, 1, 1, 0.5)
	sb.set_border_width_all(2)
	stick_ui.add_theme_stylebox_override("panel", sb)
	stick_ui.visible = false
	stick_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(stick_ui)
	knob_ui = Panel.new()
	knob_ui.size = Vector2(52, 52)
	var kb := StyleBoxFlat.new()
	kb.bg_color = Color(1, 1, 1, 0.7)
	kb.set_corner_radius_all(26)
	knob_ui.add_theme_stylebox_override("panel", kb)
	knob_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stick_ui.add_child(knob_ui)
