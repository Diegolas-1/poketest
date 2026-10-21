extends Node3D
# Native test scene: a sunny cel-shaded meadow with a few cottages and trees,
# a placeholder Red to walk around, a dense grass field and an FPS readout.
# It proves the iPhone build pipeline and shows what the hardware can carry
# before the real port.

const TOON := preload("res://toon.gdshader")
const GRASS := preload("res://grass.gdshader")

var player: Node3D
var cam: Camera3D
var yaw := 0.0            # Red's facing
var cam_yaw := 0.35
var cam_pitch := 0.32
var cam_dist := 7.5
var speed := 0.0
var cam_idle := 0.0
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

func _ready() -> void:
	_environment()
	_ground()
	_town()
	_grass(160000, 70.0)
	_player()
	_hud()

# ---------- world ----------
func toon(color: Color) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = TOON
	m.set_shader_parameter("albedo", color)
	return m

func _environment() -> void:
	var env := Environment.new()
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color("4f9fe0")
	sm.sky_horizon_color = Color("cfe9f5")
	sm.ground_horizon_color = Color("cfe9f5")
	sm.ground_bottom_color = Color("9cc6a0")
	sm.sun_angle_max = 20.0
	sky.sky_material = sm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("7f9fc4")
	env.ambient_light_energy = 0.35
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.fog_enabled = true
	env.fog_light_color = Color("cfe6f2")
	env.fog_density = 0.004
	env.fog_sky_affect = 0.0
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_color = Color("fff0d4")
	sun.light_energy = 1.0
	sun.rotation_degrees = Vector3(-48, -35, 0)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 80.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	add_child(sun)

func height_at(x: float, z: float) -> float:
	return sin(x * 0.045) * 1.6 + cos(z * 0.038) * 1.3 + sin((x + z) * 0.11) * 0.25

func _ground() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := 160
	var size := 240.0
	for j in n + 1:
		for i in n + 1:
			var x := (i / float(n) - 0.5) * size
			var z := (j / float(n) - 0.5) * size
			st.set_uv(Vector2(i, j) / n)
			st.add_vertex(Vector3(x, height_at(x, z), z))
	for j in n:
		for i in n:
			var a := j * (n + 1) + i
			st.add_index(a); st.add_index(a + 1); st.add_index(a + n + 1)
			st.add_index(a + 1); st.add_index(a + n + 2); st.add_index(a + n + 1)
	st.generate_normals()
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = toon(Color("6cbf4e"))
	add_child(mi)

func _box(pos: Vector3, size: Vector3, color: Color, rot := 0.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = toon(color)
	mi.position = pos
	mi.rotation.y = rot
	add_child(mi)
	return mi

func _cottage(x: float, z: float, rot: float, roof: Color) -> void:
	var y := height_at(x, z)
	_box(Vector3(x, y + 1.6, z), Vector3(6, 3.2, 5), Color("eef3fa"), rot)
	var r := MeshInstance3D.new()
	var pm := PrismMesh.new()
	pm.size = Vector3(6.8, 2.4, 5.6)
	r.mesh = pm
	r.material_override = toon(roof)
	r.position = Vector3(x, y + 4.4, z)
	r.rotation.y = rot
	add_child(r)

func _tree(x: float, z: float, s: float) -> void:
	var y := height_at(x, z)
	var trunk := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.25 * s; cm.bottom_radius = 0.38 * s; cm.height = 3.2 * s
	trunk.mesh = cm
	trunk.material_override = toon(Color("8a5a3a"))
	trunk.position = Vector3(x, y + 1.6 * s, z)
	add_child(trunk)
	for k in 4:
		var b := MeshInstance3D.new()
		var sp := SphereMesh.new()
		sp.radius = (1.5 - k * 0.15) * s; sp.height = sp.radius * 2.0
		b.mesh = sp
		b.material_override = toon(Color("3f8a45").lightened(k * 0.06))
		var a := k * 2.1
		b.position = Vector3(x + cos(a) * 0.7 * s * float(k > 0), y + (3.4 + k * 0.45) * s, z + sin(a) * 0.7 * s * float(k > 0))
		add_child(b)

func _town() -> void:
	_cottage(-12, -8, 0.2, Color("e8463c"))
	_cottage(10, -14, -0.3, Color("3d6fa8"))
	_cottage(18, 10, 0.6, Color("e8463c"))
	_cottage(-20, 14, -0.1, Color("6a9f3a"))
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for i in 90:
		var a := rng.randf() * TAU
		var d := 26.0 + rng.randf() * 80.0
		_tree(cos(a) * d, sin(a) * d, 0.8 + rng.randf() * 0.7)

func _grass(count: int, radius: float) -> void:
	# one blade: a pointed strip in 4 segments, UV.y = height along the blade
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var segs := 4
	for i in segs + 1:
		var t := i / float(segs)
		var w := 0.05 * (1.0 - t)
		st.set_uv(Vector2(0, t)); st.add_vertex(Vector3(-w, t * 0.6, t * t * 0.12))
		st.set_uv(Vector2(1, t)); st.add_vertex(Vector3(w, t * 0.6, t * t * 0.12))
	for i in segs:
		var q := i * 2
		st.add_index(q); st.add_index(q + 1); st.add_index(q + 2)
		st.add_index(q + 1); st.add_index(q + 3); st.add_index(q + 2)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = st.commit()
	mm.instance_count = count
	var rng := RandomNumberGenerator.new()
	rng.seed = 3
	for i in count:
		var r := sqrt(rng.randf()) * radius
		var a := rng.randf() * TAU
		var x := cos(a) * r
		var z := sin(a) * r
		var s := 0.7 + rng.randf() * 0.8
		var b := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(s, s, s))
		mm.set_instance_transform(i, Transform3D(b, Vector3(x, height_at(x, z), z)))
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	var m := ShaderMaterial.new()
	m.shader = GRASS
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)

# ---------- Red (placeholder) ----------
func _player() -> void:
	player = Node3D.new()
	var body := MeshInstance3D.new()
	var cap := CapsuleMesh.new()
	cap.radius = 0.32; cap.height = 1.3
	body.mesh = cap
	body.material_override = toon(Color("2f5fb8"))
	body.position.y = 0.75
	player.add_child(body)
	var head := MeshInstance3D.new()
	var hs := SphereMesh.new()
	hs.radius = 0.26; hs.height = 0.52
	head.mesh = hs
	head.material_override = toon(Color("f2d2b6"))
	head.position.y = 1.62
	player.add_child(head)
	var hat := MeshInstance3D.new()
	var hm := CylinderMesh.new()
	hm.top_radius = 0.24; hm.bottom_radius = 0.28; hm.height = 0.16
	hat.mesh = hm
	hat.material_override = toon(Color("e8463c"))
	hat.position = Vector3(0, 1.82, 0.04)
	player.add_child(hat)
	player.position = Vector3(0, height_at(0, 0), 0)
	add_child(player)
	cam = Camera3D.new()
	cam.fov = 52.0
	cam.near = 0.25
	cam.far = 600.0
	add_child(cam)

# ---------- controls: left half = move stick, right half = camera ----------
func _input(e: InputEvent) -> void:
	var half := get_viewport().get_visible_rect().size.x * 0.5
	if e is InputEventScreenTouch:
		if e.pressed:
			if e.position.x < half and stick_id == -1:
				stick_id = e.index; stick_origin = e.position; stick_vec = Vector2.ZERO
				stick_ui.visible = true; stick_ui.position = e.position - stick_ui.size * 0.5
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
	# keyboard (desktop testing): WASD move, arrows camera, Shift run
	var kx := float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A))
	var ky := float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W))
	var lx := float(Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_LEFT))
	var ly := float(Input.is_physical_key_pressed(KEY_UP)) - float(Input.is_physical_key_pressed(KEY_DOWN))
	if lx != 0.0 or ly != 0.0:
		cam_yaw -= lx * dt * 2.4; cam_pitch = clampf(cam_pitch + ly * dt * 1.6, -0.15, 1.2); cam_idle = 0.0
	else:
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
	player.position.x += sin(yaw) * speed * dt
	player.position.z += cos(yaw) * speed * dt
	player.position.y = height_at(player.position.x, player.position.z)
	player.rotation.y = yaw
	# a little bob while moving
	player.get_child(0).position.y = 0.75 + abs(sin(Time.get_ticks_msec() * 0.012)) * 0.06 * minf(1.0, speed / 4.0)
	# camera swings in behind while you walk and leave it alone
	if cam_idle > 1.0 and speed > 0.5:
		var behind := wrapf(yaw + PI - cam_yaw, -PI, PI)
		cam_yaw += behind * (1.0 - exp(-dt * 0.9 * minf(1.0, speed / 6.0)))
	var target := player.position + Vector3(0, 1.45, 0)
	var cp := cos(cam_pitch)
	var want_pos := target + Vector3(sin(cam_yaw) * cp, sin(cam_pitch), cos(cam_yaw) * cp) * cam_dist
	want_pos.y = maxf(want_pos.y, height_at(want_pos.x, want_pos.z) + 0.4)
	cam.position = cam.position.lerp(want_pos, 1.0 - exp(-dt * 14.0)) if cam.position != Vector3.ZERO else want_pos
	cam.look_at(target)
	# FPS: average and the slowest frame over half a second
	fps_acc += dt; fps_n += 1; fps_worst = maxf(fps_worst, dt)
	if fps_acc >= 0.5:
		hud.text = "%d fps · %d ms · %s" % [roundi(fps_n / fps_acc), roundi(fps_worst * 1000.0), RenderingServer.get_video_adapter_name()]
		fps_acc = 0.0; fps_n = 0; fps_worst = 0.0

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
	knob_ui.position = stick_ui.size * 0.5 - knob_ui.size * 0.5
	knob_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stick_ui.add_child(knob_ui)
