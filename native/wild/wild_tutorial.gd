class_name WildTutorial
extends RefCounted
# The hunt's tutorial (wild.gd runs it): the first time Ash comes near tall
# grass, Prof. Oak calls him on his Pokégear (the dialog panel, ui_dialog_panel.gd)
# and, if he wants it, walks him through a hunt with a Pidgey set in the grass
# for him. Each step is a card (wild_hud.gd) that moves on when he has done it:
#   watch    the grass twitching: something hides there
#   crouch   crouch (B / Ctrl / the CROUCH button): slow, low and quiet
#   sneak    creep up; when the grass goes still it is listening: freeze
#   engage   in reach: mash A to pounce
#   track    (if it fled) follow the feathers and the compass to its new spot,
#            then sneak in again
# then the battle, and Oak's last words: a startled Pokémon may flee, attack or
# just be curious, and a fled one can be tracked. Skipped with the opening
# choice, by holding B (Ctrl) while a card shows, or by tapping SKIP. Done once
# (WildBrain.set_tutorial_done, and the quest flag wild_tutorial_done).

const STEPS := ["watch", "crouch", "sneak", "engage"]
const SKIP_HOLD := 1.5

var W                      # wild.gd
var state := "off"         # off, intro, watch, crouch, sneak, engage, track, battle, outro, done
var done := false
var e: Dictionary = {}     # its Pidgey
var st := 0.0              # time in the state
var dp: UIDialogPanel
var _lines: Array = []
var _then: Callable
var _choices: Array = []
var _skip_hold := 0.0
var _crouched_t := 0.0
var _seen_burst := false
var forced := false        # dev: run it even when done
var plan = null            # where its Pidgey settles (picked as Oak calls), Vector3 or null

func setup(w) -> void:
	W = w
	done = W.brain.tutorial_done()
	dp = UIDialogPanel.new()
	dp.input_enabled = false
	W.hud.get_parent().add_child(dp)
	dp.visible = false
	dp.typed.connect(_blip)
	dp.advanced.connect(_next_line)
	dp.choice_picked.connect(_picked)

func _blip(i: int) -> void:
	if i % 3 == 0: Sfx.play("ui_blip_low", null, {"vol": -8.0, "pitch": 0.95})

func running() -> bool: return state != "off" and state != "done"
func busy() -> bool: return state in ["intro", "outro"] and dp.visible

func _go(s: String) -> void:
	state = s; st = 0.0
	if s in STEPS or s == "track": Sfx.ui("ui_notify")
	_card()

# the controls while Oak talks: A on, B (and A) through the choice
func input(a: bool, _b: bool) -> void:
	if not dp.visible: return
	if a: dp.press()

func update(dt: float) -> void:
	if done and not forced: return
	st += dt
	var me: Vector3 = W.game.pos
	var cast = W.cast
	if dp.visible and dp.choices.count() > 0:
		if Input.is_action_just_pressed("move_up") or Input.is_action_just_pressed("ui_up"): dp.choices.move(-1)
		if Input.is_action_just_pressed("move_down") or Input.is_action_just_pressed("ui_down"): dp.choices.move(1)
	# hold B / Ctrl to skip while a card shows
	if state in STEPS or state == "track":
		if Input.is_action_pressed("crouch"): _skip_hold += dt
		else: _skip_hold = maxf(0.0, _skip_hold - dt * 2.0)
		if not W.hud.card.is_empty(): W.hud.card["skip_fill"] = _skip_hold / SKIP_HOLD
		if _skip_hold >= SKIP_HOLD: skip(); return
	match state:
		"off":
			if W.game.indoors or (cast.bike and cast.bike.riding()) or cast.dialog.open or cast.convo.busy() or W.battle_on: return
			if BattleArena.I != null or W.hunt != null: return   # (never in the Battle Arena: its hunt is a test bed)
			var src: WildSource = W.sources[0]
			if src.region(me) == "" or src.distance(me) > 5.0: return
			_start()
		"watch":
			if e.is_empty() or not W.encs.has(e): _lost(); return
			# the camera comes round so the twitching grass is in view
			if st < 1.6:
				var at: Vector3 = (e.node as Node3D).position
				var want := atan2(me.x - at.x, me.z - at.z)
				W.game.cam_yaw += wrapf(want - float(W.game.cam_yaw), -PI, PI) * (1.0 - exp(-dt * 2.5))
				W.game.cam_idle = 0.0
			if float(e.burst) > 0.0: _seen_burst = true
			if (_seen_burst and st > 3.0) or st > 6.5: _go("crouch")
		"crouch":
			if e.is_empty() or not W.encs.has(e): _lost(); return
			_crouched_t = _crouched_t + dt if cast.crouching else 0.0
			if _crouched_t > 0.5: _go("sneak")
			_fled_check()
		"sneak":
			if e.is_empty() or not W.encs.has(e): _lost(); return
			if _d() <= float(W.brain.t("engage_d", 2.0)) and String(e.state) == "hidden": _go("engage")
			_fled_check()
		"engage":
			if e.is_empty() or not W.encs.has(e): _lost(); return
			if String(e.state) == "hidden" and _d() > float(W.brain.t("engage_d", 2.0)) + 1.0: _go("sneak")
			_fled_check()
		"track":
			if e.is_empty() or not W.encs.has(e): _lost(); return
			if String(e.state) == "hidden" and _d() < 9.0:
				W.hud.card = {}
				_go("sneak")
				W.hud.card.text = "There it is, hiding again. It's warier now: stay low and come in slowly."
	_card_keep()

func _d() -> float:
	return W._d2(W.game.pos, (e.node as Node3D).position)

func _fled_check() -> void:
	if String(e.state) in ["fleeing", "flying"]: _go("track")

func _lost() -> void:
	# it got away for good (or never came): Oak sums up anyway
	_outro()

# ---------- the start: Oak on the Pokégear ----------
func _start() -> void:
	print("wild: tutorial starts")
	state = "intro"
	W.clear()
	W.game.speed = 0.0
	W.cast.set_crouch(false)
	# where its Pidgey will be (the camera frames it while Oak talks): a few metres in,
	# ahead of him if it can be
	var src: WildSource = W.sources[0]
	var me: Vector3 = W.game.pos
	plan = src.pick_spot(me, float(W.game.yaw), 5.5, 8.5, W._rng)
	if plan == null: plan = src.pick_spot(me, float(W.game.yaw), 3.5, 12.0, W._rng)
	Sfx.play("pc_beep", null, {"vol": -4.0})
	dp.set_speaker("Prof. Oak", "on the Pokégear")
	_say(["OAK: Ash! It's Professor Oak, on your Pokégear. Hold on before you go wading into that tall grass!",
		"OAK: Wild Pokémon hide in tall grass. Without a Pokémon of your own, you'll have to be clever about it.",
		"OAK: Shall I walk you through it?"], _choose, ["Sure, show me!", {"text": "I know how already.", "tag": "Skip"}])

func _choose() -> void: pass

func _say(lines: Array, then: Callable = Callable(), choices: Array = []) -> void:
	_lines = lines.duplicate()
	_then = then
	_choices = choices
	dp.visible = true
	dp.clear_choices()
	dp.show_line(String(_lines.pop_front()))

func _next_line() -> void:
	if not _lines.is_empty():
		dp.show_line(String(_lines.pop_front()))
		if _lines.is_empty() and not _choices.is_empty(): dp.show_choices(_choices)
		return
	if not _choices.is_empty() and dp.choices.count() == 0:
		dp.show_choices(_choices); return
	_close_dialog()
	if _then.is_valid(): _then.call()

func _picked(i: int, _c) -> void:
	_choices = []
	dp.clear_choices()
	if i == 0:
		_say(["OAK: Splendid! Look there, that patch of grass. Keep your eyes on it..."], _begin)
	else:
		_say(["OAK: Very well! Do be careful, Ash. Even a Pidgey can hurt."], _finish)

func _close_dialog() -> void:
	dp.slide_out()
	dp.visible = false

func _begin() -> void:
	# its Pidgey, where the camera has been looking
	var src: WildSource = W.sources[0]
	var spot = plan
	if spot == null: _finish(); return
	e = W.spawn("pidgey", src, spot, "flighty", true)
	e.burst_t = 0.9
	_seen_burst = false
	_go("watch")

# ---------- the battle ----------
func on_battle_start(en: Dictionary) -> void:
	if not running() or en != e: return
	state = "battle"; st = 0.0
	W.hud.card = {}

func on_battle_end(en: Dictionary, outcome: String) -> void:
	if state != "battle" or en != e: return
	print("wild: tutorial battle ended: ", outcome)
	_outro()

func _outro() -> void:
	state = "outro"
	W.hud.card = {}
	if e.has("tutorial"): e.tutorial = false
	dp.set_speaker("Prof. Oak", "on the Pokégear")
	_say(["OAK: Well done, Ash! Now remember: a startled Pokémon might flee, attack you, or just be curious and refuse to battle.",
		"OAK: If one flies off, you can track it. Follow the feathers, the rustling grass and your compass to where it hides next.",
		"OAK: And do be careful. Without a Pokémon of your own, even a Pidgey is a real danger!"], _finish)

func _finish() -> void:
	_close_dialog()
	W.hud.card = {}
	state = "done"
	done = true
	forced = false
	if e.has("tutorial"): e.tutorial = false
	W.brain.set_tutorial_done(true)
	var q = W.cast.life.quests if W.cast.life else null
	if q and q.has_method("set_flag"): q.set_flag("wild_tutorial_done")
	W.toaster.push("complete", "TUTORIAL DONE", "Wild Pokémon hide in tall grass. Happy hunting!", "check", 2.6)
	print("wild: tutorial done")

func skip() -> void:
	if not running(): return
	print("wild: tutorial skipped")
	_finish()

# ---------- the card ----------
func _card() -> void:
	var c := {"head": "TRAINER TIP", "n": 4}
	match state:
		"watch": c.merge({"step": 1, "text": "See the grass twitching? A wild Pokémon is hiding in there. Watch it for a moment."})
		"crouch": c.merge({"step": 2, "text": "It can hear and see you. Crouch to sneak: you're slow, low and much quieter.", "action": "crouch", "action_label": "Crouch", "touch_label": "Tap CROUCH"})
		"sneak": c.merge({"step": 3, "text": "Sneak up on it. If the grass goes still, it's listening: freeze until it twitches again."})
		"engage": c.merge({"step": 4, "text": "Close enough! Mash A to pounce on it before it notices you.", "action": "use", "action_label": "Mash to pounce"})
		"track": c.merge({"head": "IT GOT AWAY", "text": "Don't give up! Follow the feathers and your compass to where it landed. It will hide again."})
		_: c = {}
	W.hud.card = c

func _card_keep() -> void:
	if (state in STEPS or state == "track") and W.hud.card.is_empty(): _card()
