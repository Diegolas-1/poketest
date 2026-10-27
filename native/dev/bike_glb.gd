extends SceneTree
# Dev only: writes a bike look out as a .glb (named nodes for the moving parts:
# steer, wheel_f, wheel_r, cog, crank, pedal_l, pedal_r, kick, seat), for looking at it
# in other tools or the web editor.
#   godot --headless --path native --script res://dev/bike_glb.gd -- --look=ash --out=/path/bike.glb

func _init() -> void:
	var look := "ash"
	var out := "user://bike.glb"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--look="): look = a.substr(7)
		elif a.begins_with("--out="): out = a.substr(6)
	var b := BikeModel.new()
	b.name = "Bike_" + look
	get_root().add_child(b)
	b.build(BikeModel.look(look))
	# plain materials for the file (the cel shader is the game's own)
	for mi in b.meshes:
		for s in mi.mesh.get_surface_count():
			var m := mi.mesh.surface_get_material(s)
			var sm := StandardMaterial3D.new()
			if m is ShaderMaterial: sm.albedo_color = m.get_shader_parameter("albedo")
			mi.mesh.surface_set_material(s, sm)
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	var err := doc.append_from_scene(b, st)
	if err == OK: err = doc.write_to_filesystem(st, out)
	print("bike_glb: %s -> %s (%s), %d triangles" % [look, out, error_string(err), b.tris])
	quit(0 if err == OK else 1)
