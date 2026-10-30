class_name CatchShow
extends Node
# A Poké Ball thrown on the battle's stage (battle.gd), the same in both modes:
# Ash takes a ball off his belt (it swells in his hand), winds up and throws it
# (catch_throw, the duel throw's arm with the reach to the belt first); it arcs
# over, bounces off the Pokémon and hangs there, the lid springs open and the
# Pokémon turns to red light and is drawn in; the lid snaps shut and the ball
# drops, bounces and settles; then it wobbles 0 to 3 times, each with its rattle.
#   a catch     the click, stars off the ball, the GOTCHA! banner
#   a break-out the ball bursts open in a flash and the Pokémon is back, angry
#   blocked     (a trainer's Pokémon) the ball is knocked away before it lands
#
#   var cs := CatchShow.new(); battle.add_child(cs)
#   await cs.play(ball_id, ev)     ev: PkmnBattle.throw_ball's event, or the same
#                                  keys (caught, wobbles; t "ball_blocked")
# battle.record_catch(ev) stores a catch (party or PC); its line shows under the banner.

const RELEASE := 1.12          # catch_throw: the ball leaves his hand (s)
const BIG := 2.0               # the ball in flight and on the ground: this much bigger (it reads from the battle's camera)
const R := 0.075

var battle: Battle
var ball: Node3D
var ball_id := "poke_ball"
var _roll := 0.0               # the wobble's tilt about the line Ash to the ball
var _spin := Basis()
var _rest := Vector3.ZERO

static var _done := false

# the throw, added to idles.gd's actions at run time (forced only)
static func register() -> void:
	if _done: return
	_done = true
	var D := IdleActions._defs()
	var BELT := {"at": DuelActs.H(-0.17, -0.03, 0.1), "pole": [-1, -0.3, -0.5], "wf": 0.1, "cu": 0.6}
	var HOLD := {"at": DuelActs.CH(-0.2, -0.17, 0.33), "pole": [-1, -0.7, -0.35], "wt": 0.25, "wf": -0.15, "cu": 0.85}
	var GUARD := {"at": DuelActs.CH(0.17, -0.3, 0.16), "pole": [1, -0.7, -0.3], "wt": 0.3, "cu": 1.0}
	var BACK := {"at": DuelActs.HD(-0.26, 0.14, -0.22), "pole": [-1, -0.3, -0.7], "wt": 0.4, "cu": 0.85}
	var BACK2 := {"at": DuelActs.HD(-0.28, 0.17, -0.26), "pole": [-1, -0.3, -0.7], "wt": 0.45, "cu": 0.85}
	var OUT := {"at": DuelActs.CH(-0.08, 0.05, 0.64), "pole": [-1, -0.5, -0.2], "wf": 0.25, "wt": 0.1, "cu": 0.15}
	var DOWN := {"at": DuelActs.CH(0.05, -0.5, 0.36), "pole": [-1, -0.6, 0.0], "wf": 0.3, "cu": 0.1}
	var Rl := RELEASE
	D["catch_throw"] = {"dur": 2.1, "talk": true, "player": true,
		"armR": [[0, null], [0.3, BELT], [0.58, HOLD], [0.84, BACK], [1.0, BACK2], [Rl, OUT], [1.36, DOWN], [2.1, null]],
		"armL": [[0, null], [0.6, GUARD], [0.86, {"at": DuelActs.CH(0.3, 0.05, 0.3), "pole": [1, -0.4, -0.3], "cu": 0.4}],
			[Rl, {"at": DuelActs.CH(0.26, -0.3, 0.05), "pole": [1, -0.5, -0.4], "cu": 0.5}], [2.1, null]],
		"body": [[0, {}], [0.3, {"tw": -0.08, "hp": 0.08}], [0.58, {"lean": 0.08, "tw": 0.04}], [0.86, {"lean": -0.12, "tw": 0.42, "hp": -0.1}],
			[1.0, {"lean": -0.13, "tw": 0.5, "hp": -0.09}], [Rl + 0.04, {"lean": 0.34, "tw": -0.38, "hp": 0.04}], [1.45, {"lean": 0.24, "tw": -0.22}], [2.1, {}]],
		"gaze": [[0, {"y": 0, "p": 0}], [0.28, {"y": -0.25, "p": 0.38}], [0.6, {"y": 0, "p": 0.05}], [2.1, {"y": 0, "p": 0}]]}

func play(id: String, ev: Dictionary) -> void:
	battle = get_parent() as Battle
	ball_id = id
	register()
	var blocked := String(ev.get("t", "")) == "ball_blocked"
	var caught := bool(ev.get("caught", false))
	var n := clampi(int(ev.get("wobbles", 0)), 0, 3)
	var ui: BattleUI = battle.ui
	var fwd := battle.fwd
	var side := battle.side
	var up := Vector3.UP
	var nm := String(ev.get("name", battle.foe_name())).to_upper()
	var h := _foe_h()
	ui.say("ASH", "GO, %s!" % CatchRules.ball_name(id).to_upper(), UITheme.RED)
	# ---- the throw: over his right shoulder, the Pokémon ahead ----
	var a0 := battle.ash_pos
	var f0 := battle.foe_pos
	_cam(a0 - fwd * 2.1 - side * 1.5 + up * 1.55, a0.lerp(f0, 0.6) + up * 0.7, 48.0, 0.0)
	_cam(a0 - fwd * 1.7 - side * 1.9 + up * 1.35, a0.lerp(f0, 0.55) + up * 0.75, 46.0, 1.2)
	ball = PkmnBall.make(R, id)
	battle.add_child(ball)
	ball.visible = false
	battle._act("catch_throw")
	Sfx.play("cloth_rustle", a0, {"vol": -8.0})
	var t := 0.0
	var clicked := false
	while t < RELEASE:
		t += get_process_delta_time()
		if t > 0.3:
			# off the belt, small; a press of the button and it swells to full size
			ball.visible = true
			var g := clampf((t - 0.42) / 0.14, 0.0, 1.0)
			var sc := lerpf(0.45, 1.0, UITheme.ease_back(g, 2.2))
			ball.global_transform = Transform3D(_hand_basis().scaled(Vector3.ONE * sc), _hand())
			if t > 0.42 and not clicked:
				clicked = true
				Sfx.play("catch_click", ball.global_position, {"vol": -10.0, "pitch": 1.5})
		await get_tree().process_frame
	# ---- the arc ----
	Sfx.play("throw", a0, {"vol": 0.0})
	Sfx.play("whoosh", a0, {"vol": -6.0, "pitch": 1.4})
	var from := ball.global_position
	var hit := f0 + up * h * 0.55 - fwd * 0.1
	var dist := from.distance_to(hit)
	var fly := clampf(dist / 8.5, 0.42, 0.8)
	var apex := clampf(dist * 0.22, 0.6, 1.8)
	var mid := from.lerp(hit, 0.5)
	_cam(mid - side * 5.6 - fwd * 0.9 + up * 1.8, mid + up * 0.55, 46.0, 3.0)
	t = 0.0
	var spin_ax := side
	var b0 := ball.global_transform.basis.orthonormalized()
	var stop := 0.72 if blocked else 1.0
	while t < fly * stop:
		var dt := get_process_delta_time()
		t += dt
		var u := clampf(t / fly, 0.0, 1.0)
		var p := from.lerp(hit, u) + up * apex * 4.0 * u * (1.0 - u)
		b0 = Basis(spin_ax, -dt * 19.0) * b0
		ball.global_transform = Transform3D(b0.scaled(Vector3.ONE * lerpf(1.0, BIG, UITheme.ease_out(minf(u * 1.6, 1.0)))), p)
		if randf() < 0.8: battle.fx.spawn("streak", p, (hit - from) / fly, {"life": 0.14, "size": 0.0, "len": 0.035, "w": 0.04, "col": Color(1, 1, 1, 0.45), "drag": 4.0})
		await get_tree().process_frame
	if blocked:
		await _blocked(b0)
		return
	# ---- the hit: off the Pokémon and up, hanging there ----
	battle.fx.spawn("star", hit, Vector3.ZERO, {"life": 0.16, "size": 0.5, "size_end": 0.9, "col": Color(1, 1, 0.9, 1.0)})
	battle.fx.spawn("ring", hit, Vector3.ZERO, {"life": 0.22, "size": 0.2, "size_end": 0.9, "col": Color(1, 1, 1, 0.8)})
	Sfx.play("hit_soft", hit, {"vol": -4.0, "pitch": 1.5})
	battle._mood("flinch")
	battle.shake = maxf(battle.shake, 0.15)
	var hover := f0 - fwd * 0.7 + up * (h * 0.75 + 0.5)
	hover.y = maxf(hover.y, battle._gy(hover) + 0.9)
	var face := _face_basis(f0 + up * h * 0.5 - hover)
	# (a cut in close at the hit, then a slow push)
	var look := (f0 + up * h * 0.4).lerp(hover, 0.5)
	look.y = hover.y - 0.2
	_cam(look - fwd * 1.0 - side * 2.9 + up * 0.25, look, 44.0, 0.0)
	_cam(look - fwd * 0.8 - side * 2.4 + up * 0.2, look, 42.0, 0.6)
	var bh := ball.global_transform.basis.orthonormalized()
	var p0 := ball.global_position
	t = 0.0
	while t < 0.34:
		t += get_process_delta_time()
		var u := clampf(t / 0.34, 0.0, 1.0)
		var e := UITheme.ease_out(u)
		var p := p0.lerp(hover, e) + up * 0.35 * sin(u * PI)
		ball.global_transform = Transform3D(bh.slerp(face, e).scaled(Vector3.ONE * BIG), p)
		await get_tree().process_frame
	# ---- the lid springs open; red light draws it in ----
	Sfx.play("whoosh", hover, {"vol": -4.0, "pitch": 1.8})
	var mouth := hover + (face * Vector3(0, 0, 1)) * R * BIG * 0.6 + up * R * BIG * 0.4
	battle.fx.spawn("star", mouth, Vector3.ZERO, {"life": 0.25, "size": 0.6, "size_end": 1.2, "col": Color(1.0, 0.85, 0.8, 1.0)})
	t = 0.0
	while t < 0.16:
		t += get_process_delta_time()
		PkmnBall.set_open(ball, UITheme.ease_back(clampf(t / 0.16, 0.0, 1.0), 2.0))
		await get_tree().process_frame
	PkmnBall.set_open(ball, 1.0)
	var foe := battle.foe
	t = 0.0
	var acc := 0.0
	var draw_t := 0.95
	var red := Color(1.0, 0.22, 0.18)
	battle.fx.flash(foe, red, 0.3, 0.95)
	Sfx.play("gust_vortex", hover, {"vol": -12.0, "pitch": 2.2})
	while t < draw_t:
		var dt := get_process_delta_time()
		t += dt
		acc += dt
		var u := clampf(t / draw_t, 0.0, 1.0)
		var e := u * u * (3.0 - 2.0 * u)
		var k := clampf((u - 0.15) / 0.85, 0.0, 1.0)
		battle.foe_appear = 1.0 - UITheme.ease_in(k)
		battle.catch_off = (mouth - f0 - up * h * 0.3 * (1.0 - k)) * pow(u, 1.6)
		if acc > 0.06:
			acc = 0.0
			battle.fx.flash(foe, red, 0.12, 0.95)
		# the red light streams out of it into the ball
		var body := f0 + battle.catch_off + up * h * 0.5 * battle.foe_appear
		for i in 4:
			var q := body + Vector3(randf_range(-0.5, 0.5), randf_range(-0.4, 0.45), randf_range(-0.5, 0.5)) * h * maxf(battle.foe_appear, 0.2)
			var v := (mouth - q) / 0.2
			battle.fx.spawn("streak", q, v, {"life": 0.2, "size": 0.0, "len": 0.05, "w": 0.11, "col": Color(1.0, 0.28, 0.22, 0.95), "drag": 0.0})
		if randf() < 0.6: battle.fx.spawn("soft", body, (mouth - body) * 1.2, {"life": 0.3, "size": 0.5 * h, "size_end": 0.05, "col": Color(1.0, 0.25, 0.2, 0.45), "drag": 0.0})
		battle.fx.spawn("star", mouth, Vector3.ZERO, {"life": 0.08, "size": 0.35 + 0.45 * e, "size_end": 0.2, "col": Color(1.0, 0.35, 0.3, 0.9)})
		await get_tree().process_frame
	battle.foe_appear = 0.0
	# ---- shut, and down it drops ----
	t = 0.0
	while t < 0.1:
		t += get_process_delta_time()
		PkmnBall.set_open(ball, 1.0 - clampf(t / 0.1, 0.0, 1.0))
		await get_tree().process_frame
	PkmnBall.set_open(ball, 0.0)
	Sfx.play("catch_click", hover, {"vol": -2.0})
	battle.fx.spawn("ring", hover, Vector3.ZERO, {"life": 0.25, "size": 0.15, "size_end": 0.7, "col": Color(1.0, 0.5, 0.45, 0.8)})
	await _wait(0.12)
	var land := f0 - fwd * 0.75
	land.y = battle._gy(land) + R * BIG
	var rest := _face_basis(-fwd)              # (its button to Ash: the camera reads the wobbles)
	_rest = land
	_cam(land - fwd * 1.55 - side * 1.05 + up * 0.62, land + up * 0.08, 36.0, 2.6)
	await _drop(hover, land, face, rest)
	_spin = rest
	# ---- the wobbles ----
	await _wait(0.5)
	for i in n:
		await _wobble(i)
		await _wait(0.42 if i < n - 1 else 0.3)
	if caught:
		await _caught(nm, ev)
	else:
		await _break_out(nm, n)
	battle.catch_off = Vector3.ZERO

# the ball bounces down off the hover point and settles
func _drop(from: Vector3, to: Vector3, b_from: Basis, b_to: Basis) -> void:
	var t := 0.0
	var T := 0.36
	while t < T:
		t += get_process_delta_time()
		var u := clampf(t / T, 0.0, 1.0)
		var p := from.lerp(to, u)
		p.y = lerpf(from.y, to.y, u * u)
		ball.global_transform = Transform3D(b_from.slerp(b_to, UITheme.ease_out(u)).scaled(Vector3.ONE * BIG), p)
		await get_tree().process_frame
	for hop in [[0.2, 0.22], [0.07, 0.13], [0.02, 0.07]]:
		Sfx.play("scuff", to, {"vol": -10.0 + float(hop[0]) * 30.0, "pitch": 1.6})
		battle.fx.dust(to - Vector3(0, R * BIG, 0), 3, Color("cdb68a"), 0.25, 0.2, 0.18)
		t = 0.0
		while t < float(hop[1]):
			t += get_process_delta_time()
			var u := clampf(t / float(hop[1]), 0.0, 1.0)
			ball.global_transform = Transform3D(b_to.scaled(Vector3.ONE * BIG), to + Vector3.UP * float(hop[0]) * 4.0 * u * (1.0 - u))
			await get_tree().process_frame
	ball.global_transform = Transform3D(b_to.scaled(Vector3.ONE * BIG), to)

# one wobble: it rocks over onto its side and back, rolling a little, a rattle each time
func _wobble(i: int) -> void:
	Sfx.play("catch_wobble", _rest, {"vol": -2.0, "pitch": 1.0 + 0.04 * i})
	var ax := battle.fwd
	var t := 0.0
	var T := 0.62
	var sgn := 1.0 if i % 2 == 0 else -1.0
	while t < T:
		t += get_process_delta_time()
		var u := clampf(t / T, 0.0, 1.0)
		# over (fast), back past upright (slower), and settle
		var a := sin(u * TAU) * (1.0 - u) * 0.62 * sgn
		var roll := Basis(ax, a)
		var off := -battle.side * a * R * BIG * 0.9
		off.y = absf(sin(a)) * R * BIG * 0.12
		ball.global_transform = Transform3D((roll * _spin).scaled(Vector3.ONE * BIG), _rest + off)
		if absf(a) > 0.4 and randf() < 0.3:
			battle.fx.dust(_rest - Vector3(0, R * BIG, 0) + off, 1, Color("cdb68a"), 0.15, 0.1, 0.12)
		await get_tree().process_frame
	ball.global_transform = Transform3D(_spin.scaled(Vector3.ONE * BIG), _rest)

func _caught(nm: String, ev: Dictionary) -> void:
	var ui := battle.ui
	await _wait(0.2)
	Sfx.play("catch_click", _rest, {"vol": 3.0})
	var btn := _rest + (_spin * Vector3(0, 0, 1)) * R * BIG
	battle.fx.spawn("star", btn, Vector3.ZERO, {"life": 0.3, "size": 0.45, "size_end": 0.1, "col": Color(1, 1, 0.85, 1.0)})
	await _wait(0.25)
	# stars off the top of it
	Sfx.play("sparkle", _rest, {"vol": 0.0})
	for k in 3:
		var a := (k - 1) * 0.55
		var d := (Vector3.UP * cos(a) + battle.side * sin(a)).normalized()
		battle.fx.spawn("star", _rest + Vector3.UP * R * BIG, d * 1.6, {"life": 0.9, "size": 0.32, "size_end": 0.18, "col": Color(1.0, 0.86, 0.25, 1.0), "drag": 2.2, "rot": randf() * TAU})
	battle.fx.spawn("ring", _rest, Vector3.ZERO, {"life": 0.45, "size": 0.2, "size_end": 1.4, "col": Color(1.0, 0.9, 0.4, 0.8)})
	var to := battle.record_catch(ev)
	ui.show_outcome(CatchRules.line("banner"), CatchRules.line("banner_sub", {"NAME": nm}), UITheme.YELLOW)
	if battle.pk: battle.say_line(CatchRules.line("caught", {"NAME": nm}), UITheme.YELLOW)
	await _wait(1.2)
	# Ash: a fist in the air
	battle._act("fist")
	battle.shot("ash_front", 0.0)   # (a cut: a glide from the ball would pass through him)
	ui.speak(["All right! I caught a %s!" % nm.capitalize(), "Yes! %s is mine!" % nm.capitalize(), "I did it! I caught %s!" % nm.capitalize()][randi() % 3], battle._bone("Head", 1.6) + Vector3(0, 0.35, 0), 1.8)
	if to != "": battle.say_line(to, UITheme.SKY)
	await _wait(0.9)
	# the ball goes to his belt: a twinkle and it's gone
	var p := ball.global_position
	var t := 0.0
	while t < 0.3:
		t += get_process_delta_time()
		ball.scale = Vector3.ONE * BIG * (1.0 - clampf(t / 0.3, 0.0, 1.0))
		await get_tree().process_frame
	battle.fx.spawn("star", p, Vector3.ZERO, {"life": 0.3, "size": 0.3, "size_end": 0.6, "col": Color(1, 1, 1, 1.0)})
	ball.queue_free()
	await _wait(0.6)

# the ball bursts open and it's back, angry
func _break_out(nm: String, n: int) -> void:
	await _wait(0.15)
	var f0 := battle.foe_pos
	var t := 0.0
	while t < 0.08:
		t += get_process_delta_time()
		PkmnBall.set_open(ball, clampf(t / 0.08, 0.0, 1.0))
		await get_tree().process_frame
	PkmnBall.burst(battle.fx, _rest + Vector3.UP * 0.15, Color(1.0, 0.8, 0.75))
	Sfx.play("whoosh", _rest, {"vol": 0.0, "pitch": 0.9})
	Sfx.play("hit_soft", _rest, {"vol": -2.0, "pitch": 0.8})
	battle.shake = maxf(battle.shake, 0.35)
	ball.queue_free()
	battle.catch_off = Vector3.ZERO
	battle.fx.flash(battle.foe, Color.WHITE, 0.35, 1.0)
	# (the close shot pulls back over the burst to show it whole)
	_cam(_rest - battle.fwd * 2.6 - battle.side * 2.2 + Vector3.UP * 1.1, f0.lerp(_rest, 0.4) + Vector3.UP * 0.35, 44.0, 2.5)
	t = 0.0
	while t < 0.38:
		t += get_process_delta_time()
		battle.foe_appear = UITheme.ease_back(clampf(t / 0.38, 0.0, 1.0), 1.8)
		await get_tree().process_frame
	battle.foe_appear = 1.0
	battle._mood("taunt")
	battle._cry(0.85)
	battle.ui.pop(CatchRules.break_line(n, nm).to_upper(), f0 + Vector3(0, 1.2, 0), UITheme.RED, 20, "word")
	if battle.pk: battle.say_line(CatchRules.break_line(n, nm), UITheme.RED)
	battle.fx.dust(f0, 6, Color("cdb68a"), 0.6, 0.3, 0.35)
	await _wait(0.7)
	battle.shot("overview", 2.5)
	await _wait(0.4)

# a trainer's: knocked away in the air, it tumbles to the ground
func _blocked(b0: Basis) -> void:
	var p := ball.global_position
	battle.fx.spawn("ring", p, Vector3.ZERO, {"life": 0.25, "size": 0.2, "size_end": 1.1, "col": Color(1, 1, 1, 0.9)})
	battle.fx.spawn("star", p, Vector3.ZERO, {"life": 0.16, "size": 0.5, "size_end": 0.8, "col": Color(1, 1, 0.9, 1.0)})
	Sfx.play("hit_soft", p, {"vol": 0.0, "pitch": 1.3})
	battle.shake = 0.25
	var v := -battle.fwd * 2.2 + battle.side * 1.6 + Vector3.UP * 2.6
	var t := 0.0
	var line := CatchRules.line("blocked")
	battle.ui.pop("BLOCKED!", p + Vector3(0, 0.6, 0), UITheme.RED, 22, "word")
	battle.say_line(line, UITheme.RED)
	while t < 1.6:
		var dt := get_process_delta_time()
		t += dt
		v.y -= 9.8 * dt
		p += v * dt
		var gy := battle._gy(p) + R * BIG
		if p.y < gy:
			p.y = gy
			if v.y < -1.0: Sfx.play("scuff", p, {"vol": -8.0, "pitch": 1.5}); battle.fx.dust(p, 2, Color("cdb68a"), 0.2, 0.1, 0.15)
			v.y = -v.y * 0.35
			v.x *= 0.6; v.z *= 0.6
		b0 = Basis(battle.side, dt * 12.0) * b0
		ball.global_transform = Transform3D(b0.scaled(Vector3.ONE * BIG * (1.0 - clampf((t - 1.2) / 0.4, 0.0, 1.0))), p)
		await get_tree().process_frame
	ball.queue_free()
	battle.shot("overview", 3.0)
	await _wait(0.3)

# ---------- helpers ----------
func _hand() -> Vector3:
	var p := battle.player
	if p and p.bones.has("pc_g_ball"): return battle._bone("pc_g_ball")
	return battle._bone("RHand", 1.0) + Vector3(0, -0.03, 0)

func _hand_basis() -> Basis:
	var p := battle.player
	if p == null or not p.bones.has("RHand"): return Basis()
	return (p.skel.global_transform.basis * p.skel.get_bone_global_pose(int(p.bones.RHand)).basis).orthonormalized()

# +z (its button, the lid's opening) along d
func _face_basis(d: Vector3) -> Basis:
	d = d.normalized()
	if d.length() < 0.1: d = -battle.fwd
	var up := Vector3.UP if absf(d.y) < 0.95 else battle.fwd
	return Basis.looking_at(-d, up)

# how tall the Pokémon stands (its meshes' bounds), for where the ball hits and hangs
func _foe_h() -> float:
	var n := battle.foe
	if n == null or not is_instance_valid(n): return 0.6
	var list = n.get("meshes")
	var top := -INF
	if list is Array:
		for mi in list:
			if mi is VisualInstance3D and is_instance_valid(mi):
				var ab: AABB = mi.global_transform * mi.get_aabb()
				top = maxf(top, ab.end.y)
	if top == -INF: return 0.6
	return clampf(top - battle.foe_pos.y, 0.3, 3.0)

func _cam(pos: Vector3, look: Vector3, fov: float, rate: float) -> void:
	var sh := {"pos": pos, "look": look, "fov": fov, "rate": rate, "name": "_fixed"}
	battle._shot = sh
	if rate <= 0.0:
		battle.cam_pos = pos; battle.cam_look = look; battle.cam_fov = fov

func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout
