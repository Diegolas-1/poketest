extends Node
# Dev only: a scripted camera move for flicker checks (frame-to-frame diffs).
#   godot --path native res://dev/flicker.tscn -- --pos=x,z --from=px,py,pz --to=px,py,pz --look=tx,ty,tz[,tx2,ty2,tz2]
#     [--frames=60] [--nowind] [--noshadow] [--noink]
# The player stands at --pos; the camera moves from --from to --to over --frames
# (from frame 20 on), looking at --look (or from the first to the second look point).
var main: Node
var a := {}
var frame := 0

func _v(k: String) -> PackedFloat64Array:
	return PackedFloat64Array(Array(String(a[k]).split(",")).map(func(x): return float(x)))

func _ready() -> void:
	process_priority = 100
	for s in OS.get_cmdline_user_args():
		var kv := s.trim_prefix("--").split("=", true, 1)
		a[kv[0]] = kv[1] if kv.size() > 1 else ""
	if a.has("noink"): Ink.set_enabled(false)
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _walk(n: Node) -> void:
	for c in n.get_children():
		if c is GeometryInstance3D:
			for m in [c.material_override, c.material_overlay]:
				if m is ShaderMaterial:
					m.set_shader_parameter("wind", 0.0)
					m.set_shader_parameter("leaf_wind", 0.0)
		_walk(c)

func _process(_dt: float) -> void:
	frame += 1
	if frame == 3:
		if a.has("nowind"): _walk(main)
		if a.has("noshadow"): main.sun.shadow_enabled = false
	if a.has("pos"):
		var p := _v("pos")
		main.pos = Vector3(p[0], main.world.height_at(p[0], p[1]), p[1])
		main.speed = 0.0
	var n := int(a.get("frames", "60"))
	var k := clampf(float(frame - 20) / float(n), 0.0, 1.0)
	var cp: Vector3; var lp: Vector3
	if a.has("spin"):   # --spin=x,y,z,yaw0,pitch,dyaw: turn in place, dyaw per frame (from frame 20)
		var o := _v("spin")
		var yaw := o[3] + o[5] * float(maxi(frame - 20, 0))
		main.cam.global_transform = Transform3D(Basis.from_euler(Vector3(o[4], yaw, 0.0)), Vector3(o[0], o[1], o[2]))
		if main.scenery: main.scenery.update(main.cam.global_position)
		return
	if a.has("orbit"):   # --orbit=cx,cy,cz,radius,height,angle0,angle1 (radians)
		var o := _v("orbit")
		lp = Vector3(o[0], o[1] + main.world.height_at(o[0], o[2]), o[2])
		var ang := lerpf(o[5], o[6], k)
		cp = lp + Vector3(sin(ang) * o[3], o[4], cos(ang) * o[3])
	else:
		var f := _v("from"); var t := _v("to"); var l := _v("look")
		cp = Vector3(f[0], f[1], f[2]).lerp(Vector3(t[0], t[1], t[2]), k)
		lp = Vector3(l[0], l[1], l[2])
		if l.size() >= 6: lp = lp.lerp(Vector3(l[3], l[4], l[5]), k)
	main.cam.look_at_from_position(cp, lp)
	if main.scenery: main.scenery.update(cp)
