class_name BattleDefeat
extends Node3D
# Knocked down on Route 1 with no Pokémon of his own (battle.gd, outcome
# ash_down, quest flag has_starter unset): the defeat event.
#   Ash lies crumpled in the clearing the battle opened. Officer Jenny (from her
#   post at the Viridian gate: life.gd's "jenny", taken over for the scene with
#   the state "scene") and Nurse Joy come running, kneel down beside him and,
#   once he says he doesn't feel so good, tell him what it means to walk into
#   the tall grass alone, with no Pokémon and no experience. Then the screen goes
#   dark: they carry him home to his mom (Ash's house, his own bed to rest in).
#   He comes to with the "Scraped & Dirty" condition (life/conditions.json:
#   dirt and scratches on him, a limp, slower and short of breath; rest or
#   Nurse Joy cures it), his stamina only a little back, and the quest flag route1_mauled.
#
# Nurse Joy's own model is the ASSETS worker's (res://cast/joy.glb as the cast
# look "joy"); until it lands she is a stand-in: another look with her pink
# hair (JOY_STANDIN). spawn_joy(at) is where she comes from.
#
#   BattleDefeat.applies(game)                 the event's conditions
#   BattleDefeat.aftermath(quests, conditions, body, mauled)   what it leaves (tests call it)
#   BattleDefeat.joy_heals(conditions, body)   Nurse Joy patches him up (the Pokémon Center, later)
#   BattleDefeat.on_route1_mauled(game)        >>> THE HOOK for the game's real start <<<

const JOY_STANDIN := "rose"
const HOME := "ketchum_house"        # where they carry him (interiors/ketchum_house.json)
const HOME_SPAWN := "from_town"

var battle: Battle
var game: Node3D
var cast: Node
var jenny := {}                      # life.gd's person (or {actor} for a stand-in)
var jenny_actor: CastActor
var joy: CastActor
var _own_jenny := false
var _speaker := ""

static func applies(g: Node) -> bool:
	if g == null: return false
	var c = g.get("cast")
	if c == null or c.life == null: return false
	if bool(g.get("indoors")): return false
	var on_route1: bool = String(c.area) == "route1" or (g.pos.z < -66.0 and g.pos.z > -420.0)
	return on_route1 and not c.life.quests.flag("has_starter")

# what a knock-down leaves him with (the event, or picking himself up elsewhere)
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
	battle.ui.speak("Ugh… I don't feel so good…", battle._bone("Head", 0.9) + Vector3(0, 0.3, 0), 2.4)
	await _wait(2.6)
	# a shout from the path: they've seen him
	_take_jenny()
	var from_dir := (-fwd + side * 0.35).normalized()
	var j_from := ash + from_dir * 13.0
	var y_from := ash + (from_dir + side * 0.25).normalized() * 15.0
	_put(jenny_actor, j_from, atan2(-from_dir.x, -from_dir.z))
	joy = spawn_joy(y_from)
	battle.ui.speak("ASH!! Hang on, we're coming!", j_from + Vector3(0, 2.0, 0), 2.0)
	Sfx.play("step_grass_run", j_from, {"vol": 0.0})
	# the camera low behind Ash, the two of them running in through the grass
	battle._shot = {"pos": ash - from_dir * 2.6 + side * 1.2 + Vector3(0, 1.1, 0), "look": ash + from_dir * 6.0 + Vector3(0, 0.9, 0), "fov": 46.0, "rate": 3.0, "name": "_fixed"}
	var j_to := ash + side * 0.85 + fwd * 0.25
	var y_to := ash - side * 0.85 + fwd * 0.35
	var t := 0.0
	var dur := 2.4
	var jp := j_from
	var yp := y_from
	while t < dur:
		var dt := get_process_delta_time()
		t += dt
		var u := clampf(t / dur, 0.0, 1.0)
		var e := u if u < 0.8 else 0.8 + (u - 0.8) * (1.0 - (u - 0.8) / 0.4)
		var nj := j_from.lerp(j_to, clampf(e / 0.92, 0.0, 1.0))
		var ny := y_from.lerp(y_to, clampf(e / 0.92 - 0.04, 0.0, 1.0))
		var vj := nj.distance_to(jp) / maxf(dt, 1e-4)
		var vy := ny.distance_to(yp) / maxf(dt, 1e-4)
		_put(jenny_actor, nj, atan2(nj.x - jp.x, nj.z - jp.z) if vj > 0.2 else jenny_actor.rotation.y, vj)
		_put(joy, ny, atan2(ny.x - yp.x, ny.z - yp.z) if vy > 0.2 else joy.rotation.y, vy)
		jp = nj; yp = ny
		if int(t * 3.0) != int((t - dt) * 3.0): Sfx.play("step_grass_run", nj, {"vol": -6.0})
		await get_tree().process_frame
	# down beside him
	_put(jenny_actor, j_to, atan2(ash.x - j_to.x, ash.z - j_to.z), 0.0)
	_put(joy, y_to, atan2(ash.x - y_to.x, ash.z - y_to.z), 0.0)
	jenny_actor.idles.force("b_kneel", 1e6)
	joy.idles.force("b_kneel", 1e6)
	Sfx.play("cloth_rustle", ash, {"vol": -4.0})
	await _wait(1.2)
	battle._shot = {"pos": ash + fwd * 2.3 + side * 0.4 + Vector3(0, 1.25, 0), "look": ash + Vector3(0, 0.55, 0), "fov": 48.0, "rate": 2.0, "name": "_fixed"}
	# the talk
	await _say([
		"JENNY: Ash! Ash, can you hear me? Don't try to get up.",
		"JOY: Easy now. Let me have a look at you…",
		"ASH: Officer Jenny…? Nurse Joy…? I don't feel so good… Everything's really sore…",
		"JOY: Scratches all over, and you're covered in dirt. That Pidgey's Gust whips the grass up sharp as razors.",
		"JENNY: What were you thinking, walking into the tall grass all by yourself? That's where wild Pokémon live!",
		"JOY: Even a little Pidgey will fight hard to protect its home. And you didn't have a Pokémon of your own to stand with you.",
		"JENNY: Trainers only go in there with a partner Pokémon, and once they know how to read a wild one. Promise me you won't go in alone again.",
		"ASH: I… I promise.",
		"JOY: Good. Nothing's broken, but you need rest. Let's get you home to your mom.",
	])
	# dark: carried home
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
	if player_idles(): cast.player.idles.release()
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
		cast.dialog.say(["MOM: Oh, Ash… Officer Jenny and Nurse Joy carried you all the way home.",
			"MOM: You get some rest, sweetie. And no more tall grass without a Pokémon, OK?"])

func player_idles() -> bool: return cast != null and cast.player != null and cast.player.idles != null

# Officer Jenny: the town's own (life.gd), taken over for the scene; a fresh one if she isn't there
func _take_jenny() -> void:
	var life = cast.life if cast else null
	if life and life.by_id.has("jenny"):
		jenny = life.by_id["jenny"]
		if jenny.state == "inside": life.person_exited.emit("jenny", jenny.inside); jenny.inside = ""
		jenny.state = "scene"
		jenny.v = 0.0
		jenny_actor = jenny.actor
	if jenny_actor == null:
		jenny_actor = CastActor.make("jenny")
		jenny_actor.ground = func(x: float, z: float) -> float: return game.world.height_at(x, z)
		add_child(jenny_actor)
		_own_jenny = true
	jenny_actor.visible = true

# Nurse Joy at a point (world): her own look once it exists, else the stand-in with pink hair
func spawn_joy(at: Vector3) -> CastActor:
	var look := "joy" if CastActor.data().looks.has("joy") and ResourceLoader.exists("res://cast/joy.glb") else JOY_STANDIN
	var a := CastActor.make(look)
	a.name = "NurseJoy"
	a.ground = func(x: float, z: float) -> float: return game.world.height_at(x, z)
	add_child(a)
	if look != "joy":
		# TODO(joy): the stand-in's hair, Joy's pink, until her model lands
		for m in a.mat_src:
			var src: String = String(a.mat_src[m]).to_lower()
			if src.contains("hair"): (m as ShaderMaterial).set_shader_parameter("albedo", Color("f2879f"))
	_put(a, at, 0.0)
	return a

func _put(a: CastActor, p: Vector3, yaw: float, v := 0.0) -> void:
	if a == null: return
	p.y = game.world.height_at(p.x, p.z)
	if not jenny.is_empty() and a == jenny_actor:
		jenny.pos = p; jenny.yaw = yaw; jenny.v = v
		return   # (life.gd places and animates her from these)
	a.position = p
	a.rotation.y = yaw
	a.set_meta("v", v)

func _process(dt: float) -> void:
	if joy and is_instance_valid(joy): joy.animate(dt, float(joy.get_meta("v", 0.0)), false)
	if _own_jenny and jenny_actor and is_instance_valid(jenny_actor): jenny_actor.animate(dt, float(jenny_actor.get_meta("v", 0.0)), false)
	# whoever speaks moves their mouth while the line types out
	var d = cast.dialog if cast else null
	var talking := false
	if d != null and d.open: talking = d.shown < String(d.lines[d.i]).length()
	var flap := (0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.03)) if talking else 0.0
	if jenny_actor and is_instance_valid(jenny_actor): jenny_actor.mouth = flap if _speaker == "JENNY" else 0.0
	if joy and is_instance_valid(joy): joy.mouth = flap if _speaker == "JOY" else 0.0
	if cast and cast.player: cast.player.mouth = flap if _speaker == "ASH" else 0.0

# the lines one by one through the text box, the voice and the speaker for each
func _say(lines: Array) -> void:
	for ln in lines:
		var s := String(ln)
		_speaker = s.get_slice(":", 0)
		cast.dialog.voice = "mid" if _speaker == "ASH" else "high"
		cast.dialog.voice_pitch = 1.08 if _speaker == "ASH" else (1.0 if _speaker == "JENNY" else 1.12)
		var fin := [false]
		cast.dialog.say([s], func(): fin[0] = true)
		while not fin[0]:
			await get_tree().process_frame
			if not cast.dialog.open: break
	_speaker = ""

# give Jenny back to the town (straight to her post) and send Joy on her way
func _release() -> void:
	var life = cast.life if cast else null
	if not jenny.is_empty() and life:
		jenny_actor.idles.release()
		jenny.state = "act"
		jenny.blk = -1
		life._jumped = true
		life._check(jenny)
		life._jumped = false
		life._place_now(jenny)
	elif _own_jenny and jenny_actor:
		jenny_actor.queue_free()
	if joy and is_instance_valid(joy): joy.queue_free()
	joy = null

func _wait(secs: float) -> void:
	await get_tree().create_timer(secs).timeout
