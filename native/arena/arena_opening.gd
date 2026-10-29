extends Node3D
# The formal opening of a trainer battle in the Battle Arena (arena_stage.gd plays
# it every time a staged trainer battle starts): an official battle between
# licensed trainers begins like a fencing match.
#   1  both trainers face each other at the centre line; the referee announces the
#      battle (a wide two-shot, the title card, letterbox bars)
#   2  they bow to each other (DuelActs duel_bow: a proper bow from the waist; a
#      close profile two-shot)
#   3  they turn their backs and walk ten paces each, counted on screen like a
#      duel ("1 ... 10", a tick and the footsteps; a low shot on the walk away, then
#      a low wide one)
#   4  they turn round and take their stances: Ash his ready stance, a Poké Ball in
#      hand; the opponent by its AI (over-the-shoulder shots both ways)
#   5  the coin: the referee offers Ash the call; he calls heads or tails BEFORE the
#      flip (two big buttons; pad left / right + A; keys H / T); the 3D coin spins up
#      out of the referee's hand, lands on the clay, rattles and settles (a close-up
#      that follows it, then over it): the winner sends out first and moves first
#   6  both throw their first Poké Balls (the winner first): the arc, the release
#      flash, the Pokémon there; the battle stage takes over (signal done)
# Skippable at any point (the SKIP button, B, Esc): straight to the end state.
#
#   var o := ArenaOpening.new(); arena.add_child(o)
#   o.play(arena, {"opp": ScenePerson, "foe_name", "ash_lead", "foe_lead", "ai",
#                  "call": "heads"|"tails" (scripted), "coin": "heads"|"tails" (forced)})
#   await o.done  -> {"first": "a"|"b", "call", "coin", "partner": Node3D, "foe": Node3D}

signal done(r: Dictionary)

const PACE := 0.69        # m a pace (ten: the trainers' boxes)
const PACE_T := 0.62      # s a pace
const MEET := 0.72        # each one's distance from the centre line at the bow
const MON_Z := 2.4        # the Pokémon's spots from the centre line

var arena
var game: Node3D
var cast
var ash: CastActor
var opp: ScenePerson
var ref: ScenePerson
var fx: BattleFx
var ui: Control
var o := {}
var result := {}
var skipping := false
var finished := false
# Ash, puppeted (cast.gd places him from game.pos / yaw / speed)
var ash_pos := Vector3.ZERO
var ash_yaw := PI
var ash_speed := 0.0
# the camera
var cam_pos := Vector3.ZERO
var cam_look := Vector3.ZERO
var cam_fov := 40.0
var _shot := {}
var coin: Node3D
var partner: Node3D
var foe: Node3D
var _mons := []           # [node, yaw, grow t]
var _call := ""
var _t := 0.0

func play(a, opts: Dictionary) -> void:
	arena = a
	game = a.game
	cast = game.cast
	ash = cast.player
	opp = opts.opp
	ref = a.referee
	o = opts
	DuelActs.register()
	fx = BattleFx.new()
	fx.name = "Fx"
	add_child(fx)
	fx.setup(game.cam, func(x: float, z: float) -> float: return game.world.height_at(x, z))
	ui = preload("res://arena/arena_opening_ui.gd").new()
	arena.layer.add_child(ui)
	ui.skip.connect(_skip)
	ui.called.connect(func(c: String): _call = c)
	ui.names = [String(o.get("ash_name", "Ash")), String(o.get("foe_name", "Trainer"))]
	ui.sub = String(o.get("sub", ""))
	Battle.active = true   # (the controls and the world's other systems wait)
	if cast.dialog: cast.dialog.prompt = {}; cast.dialog._ban_t = 99.0   # (no area banner over the title card)
	_hide_hud(true)
	_run()

# ---------- the frame ----------
func _process(dt: float) -> void:
	if finished: return
	# skipping cuts every wait short and stops the run: the end state from here
	if skipping and not _ending:
		_ending = true
		_finish.call_deferred()
	_t += dt
	fx.update(dt)
	# Ash where the scene puts him, looking ahead
	ash_pos.y = game.world.height_at(ash_pos.x, ash_pos.z)
	game.pos = ash_pos
	game.yaw = ash_yaw
	game.speed = ash_speed
	game.cam_yaw = ash_yaw + PI
	for m in _mons:
		var n: Node3D = m[0]
		if not is_instance_valid(n): continue
		m[2] += dt
		var k := UITheme.ease_back(clampf(float(m[2]) / 0.42, 0.0, 1.0), 1.7)
		n.scale = Vector3.ONE * maxf(k, 0.001)
		if n.has_method("animate"): n.animate(dt, 0.0)
	_camera(dt)

func _camera(dt: float) -> void:
	if not _shot.is_empty():
		var s: Dictionary = _shot.f.call() if _shot.has("f") else _shot
		var r: float = _shot.rate
		var k := 1.0 - exp(-dt * r) if r > 0.0 else 1.0
		cam_pos = cam_pos.lerp(s.pos, k)
		cam_look = cam_look.lerp(s.look, k)
		cam_fov = lerpf(cam_fov, float(s.fov), k)
	var gy: float = game.world.height_at(cam_pos.x, cam_pos.z) + 0.18
	var p := cam_pos
	if p.y < gy: p.y = gy
	game.cam.global_position = p
	if not p.is_equal_approx(cam_look): game.cam.look_at(cam_look, Vector3.UP)
	game.cam.fov = cam_fov

# a shot: fixed {pos, look, fov} or live (f: a Callable giving one), eased at rate (0: a cut)
func shot(s: Dictionary, rate := 0.0) -> void:
	_shot = s.duplicate()
	_shot.rate = rate
	if rate <= 0.0:
		var x: Dictionary = s.f.call() if s.has("f") else s
		cam_pos = x.pos; cam_look = x.look; cam_fov = float(x.fov)

func w(x: float, z: float, y := 0.0) -> Vector3:
	var p: Vector3 = arena.w(x, z)
	p.y += y
	return p

# ---------- the scene ----------
func _wait(s: float) -> void:
	if skipping: return
	var t := 0.0
	while t < s and not skipping:
		t += get_process_delta_time()
		await get_tree().process_frame

func _run() -> void:
	# places: Ash's end is +z (the gate's side), the opponent's -z
	ash_pos = w(0.0, MEET)
	ash_yaw = PI
	opp.place(w(0.0, -MEET), 0.0)
	opp.look_at_node(ash)
	opp.actor.idles.stance = ""
	ref.look_at_point(w(0.0, 0.0, 1.3))
	ref.face(w(0.0, 0.0))
	if ash.idles: ash.idles.stance = ""; ash.idles.release()
	# 1. the announcement: a wide two-shot from the side, the title card
	shot({"pos": w(11.0, 1.2, 2.3), "look": w(0.0, 0.0, 1.05), "fov": 30.0})
	shot({"pos": w(8.6, 0.6, 1.8), "look": w(0.0, 0.0, 1.05), "fov": 30.0}, 0.5)
	ui.bars(true)
	ui.title_card(true)
	Sfx.ui("ui_banner")
	await _wait(0.6)
	if skipping: return
	_ref_say("This will be an official battle between %s of Pallet Town and %s!" % [String(o.get("ash_name", "Ash")), String(o.get("foe_name", "the challenger"))])
	await _wait(2.6)
	if skipping: return
	ui.title_card(false)
	# 2. the bow
	_ref_say("Trainers, bow to each other.")
	shot({"pos": w(3.4, 0.25, 1.15), "look": w(0.0, 0.0, 1.0), "fov": 30.0})
	shot({"pos": w(3.0, 0.2, 1.1), "look": w(0.0, 0.0, 0.95), "fov": 27.0}, 0.6)
	await _wait(0.7)
	if skipping: return
	if ash.idles: ash.idles.force("duel_bow")
	await _wait(0.12)
	if skipping: return
	opp.actor.idles.force("duel_bow")
	Sfx.play("cloth_rustle", ash_pos, {"vol": -6.0})
	await _wait(2.3)
	if skipping: return
	# 3. backs turned, ten paces
	_ref_say("Ten paces!")
	opp.look_at_node(null)
	await _wait(0.5)
	if skipping: return
	_turn_both(0.0, PI, 0.55)
	await _wait(0.6)
	if skipping: return
	# a low shot on the walk away: from the ground at the centre line, after Ash
	shot({"f": func() -> Dictionary: return {"pos": w(0.75, -0.9, 0.3), "look": ash_pos + Vector3(0, 0.75, 0), "fov": 46.0}})
	for i in 10:
		if i == 5:
			# the second half wide and low from the side: the two far apart now
			shot({"pos": w(6.1, 0.6, 0.55), "look": w(0.0, 0.0, 0.95), "fov": 62.0})
			shot({"pos": w(5.8, 0.4, 0.6), "look": w(0.0, 0.0, 0.95), "fov": 66.0}, 0.4)
		ui.count(i + 1)
		Sfx.play("ui_blip_high", null, {"pitch": 0.8 + i * 0.035, "vol": -4.0})
		await _pace(i)
		if skipping: return
	ash_speed = 0.0
	# 4. about face, the stances: over the shoulder on the turn
	var ash_end := w(0.0, MEET + PACE * 10.0)
	var opp_end := w(0.0, -(MEET + PACE * 10.0))
	shot({"pos": ash_end + Vector3(0.62, 1.62, 1.35), "look": opp_end + Vector3(0, 1.05, 0), "fov": 26.0})
	await _wait(0.35)
	if skipping: return
	_turn_both(PI, 0.0, 0.5)
	Sfx.play("scuff", ash_pos, {"vol": -2.0})
	opp.look_at_node(ash)
	await _wait(0.55)
	if skipping: return
	if ash.idles: ash.idles.force("duel_ready", 60.0)
	opp.actor.idles.stance = "duel_" + String(o.get("ai", "balanced"))
	Sfx.play("cloth_rustle", ash_pos, {"vol": -4.0})
	await _wait(1.3)
	if skipping: return
	# the reverse: over the opponent's shoulder at Ash, ball in hand
	shot({"pos": opp_end + Vector3(-0.62, 1.65, -1.35), "look": ash_end + Vector3(0, 1.05, 0), "fov": 26.0})
	await _wait(1.5)
	if skipping: return
	# 5. the coin
	var rp: Vector3 = ref.global_position
	ref.face(w(0.0, 2.0))
	shot({"pos": rp + Vector3(2.6, 1.55, 1.7), "look": rp + Vector3(0.3, 1.35, 0.0), "fov": 32.0})
	shot({"pos": rp + Vector3(2.3, 1.5, 1.5), "look": rp + Vector3(0.3, 1.4, 0.0), "fov": 30.0}, 0.5)
	_ref_say("The coin decides who goes first. %s, call it!" % String(o.get("ash_name", "Ash")))
	ref.emote("point")
	coin = _make_coin()
	add_child(coin)
	coin.visible = false
	await _wait(0.9)
	if skipping: return
	_call = ""
	if not skipping:
		ui.ask_call(String(o.get("call", "")))
		while _call == "" and not skipping:
			await get_tree().process_frame
	if _call == "": _call = "heads"
	ui.ask_call_done(_call)
	Sfx.ui("ui_confirm")
	_ref_say("%s calls %s!" % [String(o.get("ash_name", "Ash")), _call.to_upper()])
	await _wait(0.9)
	if skipping: return
	var face := String(o.get("coin", ""))
	if not face in ["heads", "tails"]: face = "heads" if randf() < 0.5 else "tails"
	await _flip(face)
	if skipping: return
	var first := "a" if face == _call else "b"
	result = {"first": first, "call": _call, "coin": face}
	ui.coin_result(face, String(o.get("ash_name", "Ash")) if first == "a" else String(o.get("foe_name", "Trainer")))
	Sfx.ui("ui_item_get")
	await _wait(2.0)
	if skipping: return
	coin.visible = false
	ui.coin_result_off()
	# 6. the throws: the winner first
	_ref_say("Battle... begin!")
	for s in ([first, "b" if first == "a" else "a"]):
		await _throw(String(s))
		if skipping: return
		await _wait(0.35)
		if skipping: return
	ui.bars(false)
	await _wait(0.4)
	if skipping: return
	_finish()

func _ref_say(text: String) -> void:
	ref.say(text)
	ui.caption("REFEREE", text)

func _turn_both(ash_to: float, opp_to: float, secs: float) -> void:
	var a0 := ash_yaw
	var tw := create_tween()
	tw.tween_method(func(u: float): ash_yaw = lerp_angle(a0, ash_to, u), 0.0, 1.0, secs).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	opp.face(opp.global_position + Vector3(sin(opp_to), 0, cos(opp_to)))

# a pace each: Ash and the opponent step away from the centre at the same time
func _pace(i: int) -> void:
	var a0 := ash_pos
	var a1 := w(0.0, MEET + PACE * (i + 1))
	var o1 := w(0.0, -(MEET + PACE * (i + 1)))
	opp.walk_to(o1, PACE / PACE_T * 1.15, 0.0)
	var t := 0.0
	var stepped := false
	while t < PACE_T:
		if skipping: return
		t += get_process_delta_time()
		var u := clampf(t / PACE_T, 0.0, 1.0)
		ash_pos = a0.lerp(a1, u)
		ash_speed = PACE / PACE_T
		if u > 0.45 and not stepped:
			stepped = true
			Sfx.play("step_dirt", ash_pos, {"vol": 2.0})
			Sfx.play("step_dirt", opp.global_position, {"vol": 0.0, "pitch": 0.95})
			fx.dust(ash_pos + Vector3(0, 0.05, 0), 2, Color("cdb68a"), 0.25, 0.1, 0.22)
			fx.dust(opp.global_position + Vector3(0, 0.05, 0), 2, Color("cdb68a"), 0.25, 0.1, 0.22)
		await get_tree().process_frame

# ---------- the coin ----------
func _coin_tex(heads: bool) -> ImageTexture:
	var n := 128
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	var gold := Color("e8b93a")
	var gold_d := Color("b8862a")
	var star := PackedVector2Array()
	for k in 10:
		var a := -PI / 2.0 + TAU * k / 10.0
		star.append(Vector2(cos(a), sin(a)) * (0.52 if k % 2 == 0 else 0.22))
	for j in n:
		for i in n:
			var p := Vector2((i + 0.5) / n * 2.0 - 1.0, (j + 0.5) / n * 2.0 - 1.0)
			var r := p.length()
			var c := gold.lerp(gold_d, clampf((r - 0.8) * 5.0, 0.0, 1.0))
			if r > 0.86 and r < 0.92: c = gold_d
			if heads:
				# a Poké Ball: red top, white bottom, the band and the button
				if r < 0.6:
					c = Color("e2392f") if p.y < 0.0 else Color("f6f1e6")
					if absf(p.y) < 0.07: c = Color("2a2430")
					if r < 0.2: c = Color("2a2430")
					if r < 0.12: c = Color("f6f1e6")
					if r > 0.54: c = Color("2a2430")
			else:
				if Geometry2D.is_point_in_polygon(p, star): c = Color("fff1b0")
				elif r < 0.62 and r > 0.56: c = gold_d
			img.set_pixel(i, j, c)
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)

func _disc(r: float, y: float, up: bool) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := 32
	for k in n:
		var a0 := TAU * k / n; var a1 := TAU * (k + 1) / n
		var pts := [Vector2.ZERO, Vector2(cos(a0), sin(a0)), Vector2(cos(a1), sin(a1))]
		if not up: pts = [pts[0], pts[2], pts[1]]
		for q in pts:
			st.set_normal(Vector3(0, 1 if up else -1, 0))
			st.set_uv(Vector2(0.5 + q.x * 0.5, 0.5 + q.y * 0.5 * (1.0 if up else -1.0)))
			st.add_vertex(Vector3(q.x * r, y, q.y * r))
	return st.commit()

func _make_coin() -> Node3D:
	var c := Node3D.new()
	c.name = "Coin"
	c.top_level = true
	var r := 0.085
	var th := 0.012
	for up in [true, false]:
		var m := StandardMaterial3D.new()
		m.albedo_texture = _coin_tex(up)
		m.resource_name = "coin_%s" % ("heads" if up else "tails")
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
		var mi := MeshInstance3D.new()
		mi.mesh = _disc(r, th * 0.5 if up else -th * 0.5, up)
		mi.material_override = game.toon_for(m)
		c.add_child(mi)
	var rim := MeshInstance3D.new()
	var cy := CylinderMesh.new(); cy.top_radius = r; cy.bottom_radius = r; cy.height = th; cy.cap_top = false; cy.cap_bottom = false; cy.radial_segments = 32
	rim.mesh = cy
	var rm := StandardMaterial3D.new(); rm.albedo_color = Color("a97a24"); rm.resource_name = "coin_rim"
	rim.material_override = game.toon_for(rm)
	c.add_child(rim)
	return c

func _hand(a: CastActor, bone := "RHand") -> Vector3:
	var bi: int = a.bones.get(bone, -1)
	if bi < 0: return a.global_position + Vector3(0, 1.2, 0)
	return a.skel.global_transform * a.skel.get_bone_global_pose(bi).origin

# the flip: up out of the referee's hand spinning end over end, down onto the
# clay, a bounce, the rattle as it settles, the face up
func _flip(face: String) -> void:
	var p0 := _hand(ref.actor) + Vector3(0.08, 0.05, 0)
	var land := w(-6.0, 0.4, 0.006)
	coin.visible = true
	coin.global_position = p0
	ref.emote("fist")
	Sfx.play("catch_click", p0, {"vol": 2.0, "pitch": 1.4})
	Sfx.play("whoosh", p0, {"vol": -6.0, "pitch": 1.8})
	var T := 1.25
	var H := 2.3
	var spins := 7.0
	var end_a := 0.0 if face == "heads" else PI
	var yaw := randf() * TAU
	# the close-up: the camera rides along a little below and beside the coin
	var cp := Vector3.ZERO
	var follow := func() -> Dictionary:
		var q: Vector3 = coin.global_position
		return {"pos": q + Vector3(0.95, 0.05, 0.75), "look": q, "fov": 36.0}
	shot({"f": follow}, 7.0)
	var t := 0.0
	while t < T:
		if skipping: break
		t += get_process_delta_time()
		var u := clampf(t / T, 0.0, 1.0)
		var p := p0.lerp(land, u) + Vector3(0, 4.0 * H * u * (1.0 - u), 0)
		var a := end_a - TAU * spins * (1.0 - u)
		coin.global_transform = Transform3D(Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, a), p)
		if int(t * 30.0) % 6 == 0: fx.spawn("star", p, Vector3.ZERO, {"life": 0.12, "size": 0.09, "size_end": 0.02, "col": Color(1.0, 0.9, 0.5, 0.9)})
		await get_tree().process_frame
	# down: over it as it settles
	shot({"pos": land + Vector3(0.42, 0.62, 0.38), "look": land, "fov": 36.0}, 5.0)
	Sfx.play("catch_click", land, {"vol": 4.0})
	fx.dust(land, 3, Color("cdb68a"), 0.15, 0.15, 0.16)
	t = 0.0
	var spin := 0.0
	var wob_sfx := 0.0
	while t < 1.5:
		if skipping: break
		var dt := get_process_delta_time()
		t += dt
		var hop := 0.05 * maxf(0.0, sin(clampf(t / 0.22, 0.0, 1.0) * PI))
		var tilt := 0.42 * exp(-t * 3.2) * (1.0 if t > 0.18 else t / 0.18)
		spin += dt * (9.0 + 26.0 * (1.0 - exp(-t * 3.2)))
		coin.global_transform = Transform3D(Basis(Vector3.UP, yaw + spin) * Basis(Vector3.RIGHT, tilt) * Basis(Vector3.RIGHT, end_a), land + Vector3(0, hop + sin(tilt) * 0.085, 0))
		wob_sfx -= dt
		if wob_sfx <= 0.0 and tilt > 0.04:
			wob_sfx = 0.09 + t * 0.05
			Sfx.play("catch_click", land, {"vol": -6.0 + tilt * 8.0, "pitch": 1.6 + t * 0.3})
		await get_tree().process_frame
	coin.global_transform = Transform3D(Basis(Vector3.UP, yaw + spin) * Basis(Vector3.RIGHT, end_a), land)
	shot({"pos": land + Vector3(0.12, 0.55, 0.16), "look": land, "fov": 34.0}, 3.0)

# ---------- the throws ----------
func _throw(s: String) -> void:
	var sp := String(o.ash_lead if s == "a" else o.foe_lead)
	var to := w(0.7, MON_Z) if s == "a" else w(0.0, -MON_Z)
	var who_pos: Vector3 = ash_pos if s == "a" else opp.global_position
	# from beside the thrower, toward the spot
	var dz := -1.0 if s == "a" else 1.0
	shot({"pos": who_pos + Vector3(2.4, 1.4, -dz * 1.6), "look": who_pos.lerp(to, 0.55) + Vector3(0, 0.9, 0), "fov": 40.0})
	shot({"pos": who_pos + Vector3(2.9, 1.6, dz * 0.4), "look": to + Vector3(0, 0.7, 0), "fov": 44.0}, 1.2)
	if s == "a":
		if ash.idles: ash.idles.force("duel_throw")
		ui.caption("ASH", "%s, I choose you!" % ArenaSetups.species_name(sp))
	else:
		opp.actor.idles.force("duel_throw_npc")
		opp.say("Go, %s!" % ArenaSetups.species_name(sp))
		ui.caption(String(o.get("foe_name", "Trainer")).to_upper(), "Go, %s!" % ArenaSetups.species_name(sp))
	Sfx.play("cloth_rustle", who_pos, {"vol": -4.0})
	await _wait(DuelActs.RELEASE)
	var from := _hand(ash if s == "a" else opp.actor)
	var ball := PkmnBall.make(0.07)
	add_child(ball)
	ball.global_position = from
	Sfx.play("throw", from, {"vol": 0.0})
	var t := 0.0
	var T := 0.72
	while t < T and not skipping:
		t += get_process_delta_time()
		var u := clampf(t / T, 0.0, 1.0)
		ball.global_position = from.lerp(to + Vector3(0, 0.55, 0), u) + Vector3(0, sin(u * PI) * 1.5, 0)
		ball.rotation = Vector3(-u * 14.0 * dz, 0, 0)
		await get_tree().process_frame
	ball.queue_free()
	_release(s, sp, to)
	await _wait(0.9)

func _release(s: String, sp: String, to: Vector3) -> void:
	if (s == "a" and partner) or (s == "b" and foe): return
	PkmnBall.burst(fx, to + Vector3(0, 0.55, 0))
	Sfx.play("whoosh", to, {"vol": 0.0, "pitch": 0.7})
	Sfx.play("sparkle", to, {"vol": -2.0})
	var n: Node3D = Creature.make(sp) if ResourceLoader.exists("res://creatures/%s.glb" % sp) else (PidgeyStandin.new() if sp == "pidgey" else PkmnStandin.make(sp))
	arena.add_child(n)
	n.top_level = true
	n.global_position = to
	n.rotation.y = PI if s == "a" else 0.0
	n.scale = Vector3.ONE * 0.001
	if "auto" in n: n.auto = false
	if "battle" in n: n.battle = true
	_mons.append([n, n.rotation.y, 0.0])
	if s == "a": partner = n
	else: foe = n
	if n.has_method("mood"): n.mood("taunt")

# ---------- skip, the end ----------
func _skip() -> void:
	if skipping or finished: return
	skipping = true
	Sfx.ui("ui_confirm")

func _finish() -> void:
	if finished: return
	if skipping and result.is_empty():
		var face := String(o.get("coin", ""))
		if not face in ["heads", "tails"]: face = "heads" if randf() < 0.5 else "tails"
		var c := _call if _call != "" else "heads"
		result = {"first": "a" if face == c else "b", "call": c, "coin": face}
	# the end state, whatever was skipped
	ash_pos = w(0.0, MEET + PACE * 10.0)
	ash_yaw = PI
	ash_speed = 0.0
	opp.place(w(0.0, -(MEET + PACE * 10.0)), 0.0)
	opp.look_at_node(ash)
	opp.actor.idles.stance = "duel_" + String(o.get("ai", "balanced"))
	if ash.idles and skipping: ash.idles.release()
	_release("a", String(o.ash_lead), w(0.7, MON_Z))
	_release("b", String(o.foe_lead), w(0.0, -MON_Z))
	for m in _mons:
		if is_instance_valid(m[0]): m[0].scale = Vector3.ONE
	_mons.clear()
	game.pos = ash_pos
	game.yaw = ash_yaw
	game.speed = 0.0
	finished = true
	if coin: coin.queue_free()
	ui.queue_free()
	_hide_hud(false)
	Battle.active = false
	result["partner"] = partner
	result["foe"] = foe
	done.emit(result)
	queue_free()

func _hide_hud(on: bool) -> void:
	arena.world_hud(not on)

var _ending := false
