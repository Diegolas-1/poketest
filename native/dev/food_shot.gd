extends Node3D
# Dev only: the dishes (food/dishes.gd) on a stand-in table, for render checks.
#   godot --path native res://dev/food_shot.tscn -- [--dish=pancakes|all] [--eaten=0.5]
#       [--view=three|close|top|low] [--spin]
# --dish=all lays every dish out in a grid (four to a row).
# --menu=home|inn|tea_house [--hour=8] [--full=40] [--tab=0] [--sel=0] [--device=touch|pad|keys]: the menu over it
var dish := "all"
var eaten := 0.0
var view := "three"
var spin := false
var cam: Camera3D
var root: Node3D
var t := 0.0
var menu := ""            # --menu=home|inn|tea_house: the menu over it
var hour := 8.0
var full := 40.0
var mtab := 0
var msel := 0
var device := ""
var fm: FoodMenu
var frame := 0

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--dish="): dish = a.substr(7)
		elif a.begins_with("--eaten="): eaten = float(a.substr(8))
		elif a.begins_with("--view="): view = a.substr(7)
		elif a == "--spin": spin = true
		elif a.begins_with("--menu="): menu = a.substr(7)
		elif a.begins_with("--hour="): hour = float(a.substr(7))
		elif a.begins_with("--full="): full = float(a.substr(7))
		elif a.begins_with("--tab="): mtab = int(a.substr(6))
		elif a.begins_with("--sel="): msel = int(a.substr(6))
		elif a.begins_with("--device="): device = a.substr(9)
	FoodStage.lights(self)
	# the table top
	var tb := MeshInstance3D.new()
	var bm := BoxMesh.new(); bm.size = Vector3(3, 0.04, 3); tb.mesh = bm
	tb.material_override = FoodKit.mat(Color("c79a6a"), {"gloss": 0.2})
	tb.position.y = -0.02
	add_child(tb)
	root = Node3D.new()
	add_child(root)
	var list: Array = Dishes.ids() if dish == "all" else [dish]
	for i in list.size():
		var d := Dishes.build(String(list[i]))
		d.set_eaten(eaten)
		root.add_child(d)
		if list.size() > 1: d.position = Vector3((i % 4) * 0.42 - 0.63, 0, int(i / 4) * 0.42 - 0.63)
	cam = Camera3D.new()
	add_child(cam)
	cam.fov = 30.0 if list.size() == 1 else 40.0
	if menu != "":
		if device != "": UIInput.force(device)
		fm = FoodMenu.new()
		add_child(fm)

func _process(dt: float) -> void:
	t += dt
	frame += 1
	if fm and frame == 2:
		fm.open(menu, hour, full)
		if mtab > 0: fm.set_tab(mtab)
		if msel > 0: fm.select(msel)
	if spin: root.rotation.y = t * 0.6
	var many := root.get_child_count() > 1
	var c := Vector3(0, 0.03, 0)
	var off := Vector3(0, 0.32, 0.5)
	match view:
		"close": off = Vector3(0.0, 0.2, 0.34)
		"top": off = Vector3(0.0, 0.6, 0.12)
		"low": off = Vector3(0.0, 0.08, 0.45)
	if many: off = Vector3(0, 1.6, 1.7); c = Vector3(0, 0, 0.05)
	cam.look_at_from_position(c + off, c)
