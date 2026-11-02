extends Node
# Dev (desktop): the game's face tool (ui/face_tool_ui.gd, Settings > World > Place Ash's
# face) on its own, full screen. Save writes user://face.json as on the phone; Copy puts
# the tunables' JSON on the clipboard (res://tunables/cast.json, looks.ash2.face).
#   godot --path native res://dev/face_tool.tscn
#   headless check: -- --set=eyes:x,y,scale[,gap] --set=mouth:x,y,scale [--save] [--shot=/tmp/a.png]
var A := {}
var ft: FaceToolUI
var frame := 0

func _ready() -> void:
	for x in OS.get_cmdline_user_args():
		var kv := x.trim_prefix("--").split("=", true, 1)
		A[kv[0]] = kv[1] if kv.size() > 1 else "1"
	var cl := CanvasLayer.new(); add_child(cl)
	ft = FaceToolUI.new(); cl.add_child(ft)
	ft.closed.connect(func(): get_tree().quit())
	for s in OS.get_cmdline_user_args():
		if s.begins_with("--set="):
			var kv := s.substr(6).split(":")
			var v := kv[1].split(",")
			ft.set_place(kv[0], float(v[0]), float(v[1]), float(v[2]), float(v[3]) if v.size() > 3 else 0.0)
	if A.has("save"): ft.save()

func _process(_dt: float) -> void:
	frame += 1
	if A.has("shot") and frame == 40:
		get_viewport().get_texture().get_image().save_png(String(A.shot))
		print("face_tool: shot ", A.shot)
		get_tree().quit()
