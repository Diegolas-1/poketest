extends Node
# Dev only: the game straight into a battle in Route 1's tall grass.
#   godot --path native res://dev/battle_dev.tscn -- [options]
# Play it (touch, pad or keys), or script it for renders:
#   --at=x,z          where Ash stands (default -13,-95: the first patch of tall grass)
#   --yaw=a           which way he faces (the Pokémon is ahead of him)
#   --temper=flighty|aggressive|curious|timid   --state=hidden|startled|fleeing|attacking
#   --first=ash|wild  who goes first
#   --acts=sand,hide,rock,run   Ash's choices in order (picked by themselves; rock and sand through THROW SOMETHING)
#   --moves=gust,tackle,...     the Pokémon's moves in order, a turn each ("a+b": two in one turn; flee / disengage too)
#   --hit=1|0         every aimed hit lands (1) or misses (0)
#   --run=1|0         Run gets him away (1) or it cuts him off (0)
#   --found=1|0       hiding, it finds him (1) or not (0)
#   --seed=n          the dice
#   --start=f         the frame the battle starts on (default 20)
#   --stamina=f       Ash's stamina at the start (0..1)
#   --hour=h          the clock
#   --frames=DIR      save the whole viewport each frame (--every=n: each n-th), with --fixed-fps 15
#   --auto=s          how long a scripted choice takes on the menu
#   --talk=s          the defeat's lines go on by themselves after s seconds
#   --fresh-conditions (conditions.gd) start clean, leave the save alone
var main: Node
var frame := 0
var at := Vector2(-13.0, -95.0)
var yaw := NAN
var o := {}
var start_f := 20
var sta := -1.0
var hour := 10.5
var talk := 1.6
var _talk_t := 0.0
var battle: Battle
var result := {}
var _beat := ""

func _ready() -> void:
	process_priority = 100
	for a in OS.get_cmdline_user_args():
		var v := a.get_slice("=", 1)
		if a.begins_with("--at="): at = Vector2(float(v.get_slice(",", 0)), float(v.get_slice(",", 1)))
		elif a.begins_with("--yaw="): yaw = float(v)
		elif a.begins_with("--temper="): o.temper = v
		elif a.begins_with("--state="): o.state = v
		elif a.begins_with("--first="): o.first_strike = v
		elif a.begins_with("--acts="): o.script_acts = Array(v.split(","))
		elif a.begins_with("--moves="): o.script_moves = Array(v.split(","))
		elif a.begins_with("--hit="): o.force_hit = int(v)
		elif a.begins_with("--run="): o.force_run = int(v)
		elif a.begins_with("--found="): o.force_found = int(v)
		elif a.begins_with("--seed="): o.seed = int(v)
		elif a.begins_with("--start="): start_f = int(v)
		elif a.begins_with("--stamina="): sta = float(v)
		elif a.begins_with("--hour="): hour = float(v)
		elif a.begins_with("--auto="): o.auto_delay = float(v)
		elif a.begins_with("--talk="): talk = float(v)
	main = load("res://main.tscn").instantiate()
	add_child(main)

func _process(dt: float) -> void:
	frame += 1
	# --frames=DIR [--every=n]: the whole viewport saved every n-th frame (with
	# --fixed-fps 15 and no --write-movie, which crops a wide viewport to 16:9)
	if Array(OS.get_cmdline_user_args()).any(func(a): return String(a).begins_with("--frames=")) and frame % _every() == 0:
		_grab.call_deferred(frame)
	if frame == 3:
		main.cast.clock.real = false; main.cast.clock.ff = 1.0; main.cast.clock.set_time(hour)
	if frame < start_f:
		main.pos = Vector3(at.x, main.world.height_at(at.x, at.y), at.y)
		if not is_nan(yaw): main.yaw = yaw
		main.speed = 0.0
		main.cast.land(main.pos.y)
		main.cam_yaw = main.yaw + PI
		main.cam_ty = main.pos.y
		main.cam_target = main.pos + Vector3(0, 1.45, 0)
	if frame == start_f:
		main.cast.body.set_stamina(sta if sta >= 0.0 else 1.0)
		var d := Vector3(sin(main.yaw), 0, cos(main.yaw))
		o.species = "pidgey"
		o.at = main.pos + d * 4.6
		o.where = "tall_grass"
		battle = Battle.start(main, o)
		battle.finished.connect(func(r: Dictionary):
			result = r
			print("BATTLE finished f%d: " % frame, {"outcome": r.outcome, "stamina": r.stamina, "foe_hp": r.foe_hp, "turns": r.turns}))
	# the beats, for picking render frames (--beats)
	if battle and is_instance_valid(battle) and o.has("script_acts"):
		var sn := String(battle._shot.get("name", ""))
		var cl := String(battle.ui.callout.get("text", "")) if battle.ui else ""
		var key := sn + "|" + cl
		if key != _beat:
			_beat = key
			print("beat f%d shot=%s %s sta=%.0f" % [frame, sn, cl, battle.R.ash_sta if battle.R else -1.0])
	# scripted runs: the text box goes on by itself
	var dlg: DialogBox = main.cast.dialog
	if dlg.open and o.has("script_acts"):
		var line: String = dlg.lines[dlg.i]
		if dlg.shown >= line.length():
			_talk_t += dt
			if _talk_t > talk: _talk_t = 0.0; dlg.next()
		else: _talk_t = 0.0

func _every() -> int:
	for a in OS.get_cmdline_user_args(): if a.begins_with("--every="): return maxi(1, int(a.get_slice("=", 1)))
	return 1

func _grab(f: int) -> void:
	await RenderingServer.frame_post_draw
	var dir := ""
	for a in OS.get_cmdline_user_args(): if a.begins_with("--frames="): dir = a.get_slice("=", 1)
	get_viewport().get_texture().get_image().save_png("%s/f%05d.png" % [dir, f])
