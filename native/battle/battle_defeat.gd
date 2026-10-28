class_name BattleDefeat
extends Node3D
# Worn out on Route 1 with no Pokémon of his own (battle.gd, outcome ash_down,
# quest flag has_starter unset): the defeat event.
#   Ash lies curled up on his side in the clearing the battle opened, too
#   exhausted and sore to get up. Officer Jenny (from her post at the Viridian
#   gate) and Nurse Joy come running, kneel beside him and, once he says he
#   doesn't feel so good, tell him what it means to walk into the tall grass
#   alone, with no Pokémon and no experience. Then the screen goes dark: they
#   take him home to his mom (Ash's house: his own bed to rest in).
#   He comes to with the "Scraped & Dirty" condition (life/conditions.json:
#   dirt and scratches on him, a limp, slower and short of breath; rest or
#   Nurse Joy cures it), his stamina only a little back, and the quest flag
#   route1_mauled. Never near-death: scrapes, soreness and a big scare.
#
# Both rescuers are ScenePersons (joy/scene_person.gd: run_to, kneel_by, say,
# emote). Jenny is the town's own: life.gd's "jenny" is taken over for the scene
# (state "scene", her life actor kept hidden so only one Jenny shows) and put back
# at her post afterwards.
#
#   BattleDefeat.applies(game)                 the event's conditions
#   BattleDefeat.aftermath(quests, conditions, body, mauled)   what it leaves (tests call it)
#   BattleDefeat.joy_heals(conditions, body)   Nurse Joy patches him up (the Pokémon Center, later)
#   BattleDefeat.on_route1_mauled(game)        >>> THE HOOK for the game's real start <<<

const HOME := "ketchum_house"        # where they take him (interiors/ketchum_house.json)
const HOME_SPAWN := "from_town"

var battle: Battle
var game: Node3D
var cast: Node
var jenny_p := {}                    # life.gd's person, while the scene has her
var jenny: ScenePerson
var joy: ScenePerson
var _speaker := ""

static func applies(g: Node) -> bool:
	if g == null: return false
	var c = g.get("cast")
	if c == null or c.life == null: return false
	if bool(g.get("indoors")): return false
	var on_route1: bool = String(c.area) == "route1" or (g.pos.z < -66.0 and g.pos.z > -420.0)
	return on_route1 and not c.life.quests.flag("has_starter")

# what being worn down leaves him with (the event, or picking himself up elsewhere)
static func aftermath(quests: Node, cond: Conditions, body: AshBody, mauled := true) -> void:
	if cond: cond.apply("scraped", 1.0 if mauled else 0.7)
	if body: body.set_stamina(0.3 if mauled else 0.12)
	if quests and mauled:
		quests.set_flag("route1_mauled")

static func joy_heals(cond: Conditions, body: AshBody) -> void:
	if cond: cond.remove("scraped")
	if body: body.set_stamina(1.0)

# ======================================================================
# >>> GAME START HOOK <<<
# Called once the defeat on Route 1 is over and Ash is home in bed (flag
# route1_mauled set). This is where the game's real opening will hang: the
# next morning Prof. Oak hears what happened (Jenny tells him), calls Ash to
# the lab and gives him his first Pokémon and a Pokédex (set has_starter), and
# the road to Viridian City opens (Jenny's gate). For now: only the flag, and
# a word from Mom.
# TODO(game start): start the starter quest here (quests.gd start_quest), and
# have Oak's lab and the Viridian gate react to route1_mauled.
# ======================================================================
static func on_route1_mauled(g: Node) -> void:
	var c = g.get("cast") if g else null
	if c and c.life: c.life.quests.set_flag("route1_mauled")

# ---------- the scene ----------
func run(b: Battle) -> void:
	battle = b
	game = b.game
	cast = b.cast
	var ash: Vector3 = b.ash_pos
	var fwd: Vector3 = b.fwd
	var side: Vector3 = b.side
	await _wait(1.0)
	battle.shot("down", 1.5)
	battle.ui.speak("Ugh… I don't feel so good…", battle._bone("Head", 0.5) + Vector3(0, 0.45, 0), 2.4)
	await _wait(2.6)
	# a shout from the path: they've seen him
	var from_dir := (-fwd + side * 0.35).normalized()
	var j_from := ash + from_dir * 13.0
	var y_from := ash + (from_dir + side * 0.3).normalized() * 15.0
	_take_jenny()
	jenny = _person("jenny", j_from, atan2(-from_dir.x, -from_dir.z))
	joy = _person("joy", y_from, atan2(-from_dir.x, -from_dir.z))
	battle.ui.speak("ASH!! Hang on, we're coming!", j_from + Vector3(0, 2.0, 0), 2.0)
	Sfx.play("step_grass_run", j_from, {"vol": 0.0})
	# the camera low behind him, the two of them running in through the grass
	battle._shot = {"pos": ash - from_dir * 2.6 + side * 1.2 + Vector3(0, 1.1, 0), "look": ash + from_dir * 6.0 + Vector3(0, 0.9, 0), "fov": 46.0, "rate": 3.0, "name": "_fixed"}
	var chest := battle._bone("Spine3", 0.3)
	# he lies on his left side facing the way he faced it: Jenny kneels at his back,
	# Joy comes round his legs to kneel in front of him, where she can see his face
	jenny.kneel_by(chest - fwd * 0.05, 4.4)
	await _wait(0.35)
	_joy_round(chest)
	var t := 0.0
	var steps := 0.0
	while t < 8.0 and (jenny.state != "kneel" or joy.state != "kneel"):
		t += get_process_delta_time()
		steps += get_process_delta_time()
		if steps > 0.3 and jenny.speed > 1.0:
			steps = 0.0
			Sfx.play("step_grass_run", jenny.global_position, {"vol": -6.0})
		await get_tree().process_frame
	Sfx.play("cloth_rustle", ash, {"vol": -4.0})
	jenny.look_at_point(chest); joy.look_at_point(battle._bone("Head", 0.3))
	await _wait(0.5)
	# the two-shot from his head's end: Jenny on one side of him, Joy on the other
	battle._shot = {"pos": chest - side * 2.4 + fwd * 0.35 + Vector3(0, 1.25, 0), "look": chest + Vector3(0, 0.35, 0), "fov": 46.0, "rate": 2.0, "name": "_fixed"}
	# the talk
	await _say([
		"JENNY{worry}: Ash! Ash, can you hear me? Don't try to get up.",
		"JOY{reach}: Easy now. Let me have a look at you…",
		"ASH: Officer Jenny…? Nurse Joy…? I don't feel so good… Everything's really sore…",
		"JOY{worry}: Scratches all over, and you're covered in dirt. That Pidgey's Gust whips the grass up sharp as razors.",
		"JENNY{explain}: What were you thinking, walking into the tall grass all by yourself? That's where wild Pokémon live!",
		"JOY{explain}: Even a little Pidgey will fight hard to protect its home. And you didn't have a Pokémon of your own to stand with you.",
		"JENNY{explain}: Trainers only go in there with a partner Pokémon, and once they know how to read a wild one. Promise me you won't go in alone again.",
		"ASH: I… I promise.",
		"JOY{nod}: Good. Nothing's broken, you're just worn out and banged up. Let's get you home to your mom.",
	])
	# they help him up between them: Jenny gets up first, Joy too, hands clasped
	jenny.stand_up()
	await _wait(0.5)
	joy.stand_up()
	await _wait(0.8)
	joy.clasp(true)
	# dark: taken home
	var ui := battle.ui
	ui.caption = "Later, at home…"
	var f := 0.0
	while f < 1.0:
		f = minf(1.0, f + get_process_delta_time() / 0.9)
		ui.fade_k = f
		await get_tree().process_frame
	aftermath(cast.life.quests if cast and cast.life else null, cast.conditions if cast else null, cast.body if cast else null, true)
	on_route1_mauled(game)
	_release()
	battle.lie_down(0.0, true)
	if cast and cast.player and cast.player.idles: cast.player.idles.release()
	battle.arena_k = 0.0
	RenderingServer.global_shader_parameter_set("battle_arena", Vector4(0, 0, 0, 0))
	battle.puppet = false
	battle.cam_on = false
	await _wait(1.2)
	if game.has_method("enter_space") and ResourceLoader.exists("res://interiors/%s.json" % HOME):
		game.enter_space(HOME, HOME_SPAWN, true)
	await _wait(0.6)
	while f > 0.0:
		f = maxf(0.0, f - get_process_delta_time() / 0.8)
		ui.fade_k = f
		await get_tree().process_frame
	if cast and cast.dialog:
		cast.dialog.voice = "high"
		cast.dialog.say(["MOM: Oh, Ash… Officer Jenny and Nurse Joy brought you all the way home.",
			"MOM: You get some rest, sweetie. And no more tall grass without a Pokémon, OK?"])

# Joy's way round: past his feet to his front, then down beside him
func _joy_round(chest: Vector3) -> void:
	var fwd: Vector3 = battle.fwd
	var side: Vector3 = battle.side
	for wp in [chest + side * 1.4 - fwd * 0.2, chest + side * 0.9 + fwd * 1.2, chest + fwd * 0.75]:
		if joy == null or not is_instance_valid(joy): return
		var p: Vector3 = wp
		p.y = game.world.height_at(p.x, p.z)
		joy.run_to(p, 3.6)
		var t := 0.0
		while t < 4.0 and joy.global_position.distance_to(p) > 0.25:
			t += get_process_delta_time()
			await get_tree().process_frame
	if joy and is_instance_valid(joy): joy.kneel_by(chest + fwd * 0.05, 2.0)

func _person(look: String, at: Vector3, yaw: float) -> ScenePerson:
	var p := ScenePerson.make(look)
	add_child(p)
	p.ground = func(x: float, z: float) -> float: return game.world.height_at(x, z)
	p.place(at, yaw)
	return p

# Officer Jenny is the town's: her life actor steps out of the town's day for the
# scene (kept hidden while the scene's Jenny is on, so there's only one)
func _take_jenny() -> void:
	var life = cast.life if cast else null
	if life == null or not life.by_id.has("jenny"): return
	jenny_p = life.by_id["jenny"]
	if jenny_p.state != "inside":
		jenny_p.state = "scene"
		jenny_p.v = 0.0

func _process(_dt: float) -> void:
	if not jenny_p.is_empty() and jenny_p.get("actor") and is_instance_valid(jenny_p.actor): jenny_p.actor.visible = false
	# whoever speaks moves their mouth while the line types out
	var d = cast.dialog if cast else null
	var talking := false
	if d != null and d.open: talking = d.shown < String(d.lines[d.i]).length()
	var flap := (0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.03)) if talking else 0.0
	if jenny and is_instance_valid(jenny): jenny.actor.mouth = flap if _speaker == "JENNY" else 0.0
	if joy and is_instance_valid(joy): joy.actor.mouth = flap if _speaker == "JOY" else 0.0
	if cast and cast.player: cast.player.mouth = flap if _speaker == "ASH" else 0.0

# the lines one by one through the text box, the voice, the speaker and a gesture for each
func _say(lines: Array) -> void:
	for ln in lines:
		var s := String(ln)
		# "WHO{gesture}: text" (the gesture: ScenePerson.emote's explain, worry, nod, reach)
		var who := s.get_slice(":", 0)
		var gesture := ""
		if "{" in who:
			gesture = who.get_slice("{", 1).trim_suffix("}")
			who = who.get_slice("{", 0)
		_speaker = who
		var text := s.substr(s.find(":") + 1).strip_edges()
		s = who + ": " + text
		var sp: ScenePerson = jenny if who == "JENNY" else (joy if who == "JOY" else null)
		cast.dialog.voice = "mid" if _speaker == "ASH" else "high"
		cast.dialog.voice_pitch = 1.08 if _speaker == "ASH" else (1.0 if _speaker == "JENNY" else 1.12)
		if _speaker == "JENNY" and jenny: jenny.say(text)
		elif _speaker == "JOY" and joy: joy.say(text)
		if sp and gesture != "": sp.emote(gesture)   # (after say: its own guess from the words gives way)
		var fin := [false]
		cast.dialog.say([s], func(): fin[0] = true)
		while not fin[0]:
			await get_tree().process_frame
			if not cast.dialog.open: break
	_speaker = ""

# Jenny back to the town (straight to her post), the scene's people gone
func _release() -> void:
	var life = cast.life if cast else null
	if not jenny_p.is_empty() and life and jenny_p.state == "scene":
		jenny_p.state = "act"
		jenny_p.blk = -1
		life._jumped = true
		life._check(jenny_p)
		life._jumped = false
		life._place_now(jenny_p)
	jenny_p = {}
	for p in [jenny, joy]:
		if p and is_instance_valid(p): p.queue_free()
	jenny = null; joy = null

func _wait(secs: float) -> void:
	await get_tree().create_timer(secs).timeout
