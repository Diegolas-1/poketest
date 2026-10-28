extends Control
# Dev only: the energy system's look (design/energy_system.md).
#   xvfb-run godot --path native --rendering-driver opengl3 --resolution 1280x590 \
#     --write-movie /tmp/e/f.png --fixed-fps 15 --quit-after 120 res://dev/energy_shot.tscn -- --page=battle
# pages:
#   gallery   every energy symbol, big, named; then small sizes, dimmed and flat
#   states    EnergyBar frozen in its states: locked slots, charging, popping,
#             full, a preview it can pay, one it can't (ghosts), chips in flight;
#             and the move list's rows: ready, selected, short, locked
#   zoom      ten symbols big (--b: the second ten), to check the drawing
#   battle    a fake battle (dev/energy_fake_battle.gd) with EnergyHook plugged
#             in: the wild Pidgey's bar gains its chips each turn and spends them
#             on its plan (they fly at Ash); an ally Pikachu's bar and move list
#             (the preview follows the selection; a pick sends chips at the foe)
# --device=touch|pad|keys   the glyphs

var page := "battle"
var t := 0.0
var fake: Node
var hook: EnergyHook
var ml: EnergyMoveList
var _events: Array = []
var _bars: Array = []

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(UIInput.new())
	if Settings.menu: Settings.menu.cog.visible = false
	if Settings.overlay: Settings.overlay.visible = false
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--page="): page = a.substr(7)
		elif a.begins_with("--device="): UIInput.force(a.substr(9))
	match page:
		"states": _states.call_deferred()
		"battle": _battle.call_deferred()
	queue_redraw()

func _process(dt: float) -> void:
	t += dt
	while not _events.is_empty() and t >= _events[0][0]:
		var ev: Array = _events.pop_front()
		ev[1].call()
	queue_redraw()

func at(sec: float, f: Callable) -> void:
	_events.append([sec, f])
	_events.sort_custom(func(a, b): return a[0] < b[0])

# ---------- the background ----------
func _draw() -> void:
	var vs := size
	if page == "battle":
		# a battle floor seen from high up: grass, a cleared ring, worn earth
		draw_rect(Rect2(Vector2.ZERO, vs), Color("4d7a3e"))
		for i in 18:
			var rr := 900.0 - i * 42.0
			draw_circle(Vector2(vs.x * 0.52, vs.y * 0.58), rr, Color("6d9a4f").lerp(Color("a99464"), clampf((i - 8) / 9.0, 0.0, 1.0)) * Color(1, 1, 1, 0.22), true, -1.0, true)
		var rng := RandomNumberGenerator.new()
		rng.seed = 4
		for i in 220:
			var p := Vector2(rng.randf() * vs.x, rng.randf() * vs.y)
			if p.distance_to(Vector2(vs.x * 0.52, vs.y * 0.58)) < 300.0: continue
			draw_line(p, p + Vector2(rng.randf_range(-3, 3), -rng.randf_range(8, 18)), Color("2f5a2a", 0.6), 2.0, true)
		_figures(vs)
		_fake_plates(vs)
	else:
		draw_polygon(PackedVector2Array([Vector2.ZERO, Vector2(vs.x, 0), vs, Vector2(0, vs.y)]),
			PackedColorArray([Color("23304f"), Color("2f4a72"), Color("1d2a3c"), Color("141c2c")]))
		for i in 14:
			var x := i * 140.0 - 200.0
			draw_colored_polygon(PackedVector2Array([Vector2(x, vs.y), Vector2(x + 60, vs.y), Vector2(x + 260, 0), Vector2(x + 200, 0)]), Color(1, 1, 1, 0.025))
		if page == "gallery": _gallery(vs)
		elif page == "zoom":
			var zk: Array = EnergyIcon.KINDS
			for i in 10:
				var kk: String = zk[(i + (8 if OS.get_cmdline_user_args().has("--b") else 0)) % zk.size()]
				EnergyIcon.draw_icon(self, kk, Vector2(130 + (i % 5) * 255, 180 + (i / 5) * 300), 110.0)
		elif page == "states": _state_labels()

func _h(at_: Vector2, s: String, size_ := 20) -> void:
	UITheme.text(self, at_, s.to_upper(), "heading", size_, UITheme.TEXT, 0, -1.0, 5, Color(0, 0, 0, 0.45))

# ---------- gallery ----------
func _gallery(vs: Vector2) -> void:
	_h(Vector2(40, 46), "Energy types", 30)
	UITheme.text(self, Vector2(250, 44), "ORIGINAL VECTOR SYMBOLS · A COLOURED DISC, A WHITE GLYPH · DRAWN WITH draw_*", "label", 14, UITheme.TEXT_DIM)
	var kinds := EnergyIcon.KINDS
	var cols := 9
	var cell := Vector2(136, 140)
	var o := Vector2((vs.x - cols * cell.x) * 0.5, 74)
	for i in kinds.size():
		var c := o + Vector2((i % cols) * cell.x + cell.x * 0.5, (i / cols) * cell.y + 52)
		EnergyIcon.draw_icon(self, kinds[i], c, 42.0)
		UITheme.text(self, c + Vector2(0, 66), BattleEnergy.energy_name(kinds[i]).to_upper(), "label", 17, UITheme.TEXT, 1)
	# sizes, dim, flat
	var y := o.y + cell.y * 2 + 30
	_h(Vector2(40, y), "Any size", 18)
	var x := 40.0
	for r in [6.0, 9.0, 12.0, 16.0, 22.0, 30.0]:
		x += r + 6.0
		for kd in ["fire", "water", "grass", "electric"]:
			EnergyIcon.draw_icon(self, kd, Vector2(x, y + 50), r)
			x += r * 2.0 + 5.0
		x += 14.0
	_h(Vector2(40, y + 92), "Spent (dim) · flat · glyph only", 18)
	x = 70.0
	for kd in ["psychic", "fighting", "colorless", "dark", "steel", "dragon"]:
		EnergyIcon.draw_icon(self, kd, Vector2(x, y + 130), 22.0, 1.0, {"dim": 0.85})
		EnergyIcon.draw_icon(self, kd, Vector2(x + 52, y + 130), 22.0, 1.0, {"flat": true})
		EnergyIcon.draw_icon(self, kd, Vector2(x + 104, y + 130), 22.0, 1.0, {"glyph_only": true, "col": EnergyIcon.color(kd).lightened(0.2)})
		x += 196.0

# ---------- states ----------
var _labels: Array = []

func _state_labels() -> void:
	for l in _labels: _h(l[0], l[1], 16)

func _bar(at_: Vector2, e: BattleEnergy, label: String, side := "foe") -> EnergyBar:
	var b := EnergyBar.new()
	b.side = side
	b.sounds = false
	add_child(b)
	b.bind(e)
	b.position = at_
	b.size = Vector2(EnergyBar.width_for(b.slots_shown()), EnergyBar.H)
	_labels.append([at_ + Vector2(0, -16), label])
	_bars.append(b)
	return b

func _freeze(b: EnergyBar) -> void:
	b.set_process(false)
	b.queue_redraw()

func _states() -> void:
	var x0 := 40.0
	var y := 46.0
	var dy := 96.0
	# 1: turn 0, nothing yet: empty and locked sockets
	var e1 := BattleEnergy.make("pidgey", 9)
	_freeze(_bar(Vector2(x0, y), e1, "Pidgey Lv 9 · before turn 1 (3 slots, 2 locked)"))
	# 2: charging and popping (frozen mid-gain)
	var e2 := BattleEnergy.make("pikachu", 16)
	var b2 := _bar(Vector2(x0, y + dy), e2, "Pikachu · turn 3 gain: charging, popping, settled", "ally")
	e2.begin_turn(); e2.begin_turn(); e2.begin_turn()
	b2.vis[0].t = b2.vis[0].delay + 0.9
	b2.vis[1].t = b2.vis[1].delay + EnergyBar.CHARGE_T + 0.07
	b2.vis[2].t = b2.vis[2].delay + EnergyBar.CHARGE_T * 0.55
	b2.t = 0.3
	_freeze(b2)
	# 3: full bar
	var e3 := BattleEnergy.make("bulbasaur", 30)
	var b3 := _bar(Vector2(x0, y + dy * 2), e3, "Bulbasaur Lv 30 · full: 6 of 6", "ally")
	for i in 6: e3.begin_turn()
	for v in b3.vis: v.t = 9.0
	_freeze(b3)
	# 4: preview, payable (Razor Leaf)
	var e4 := BattleEnergy.make("bulbasaur", 30)
	var b4 := _bar(Vector2(x0, y + dy * 3), e4, "Preview: Razor Leaf (2 Grass) lights its chips", "ally")
	for i in 4: e4.begin_turn()
	for v in b4.vis: v.t = 9.0
	b4.preview_cost(BattleEnergy.cost_of("razor_leaf"))
	b4.t = 0.2
	_freeze(b4)
	# 5: preview, short (Thunderbolt with 2 chips)
	var e5 := BattleEnergy.make("pikachu", 16)
	var b5 := _bar(Vector2(x0, y + dy * 4), e5, "Preview: Thunderbolt, 1 short (red ghost)", "ally")
	e5.begin_turn(); e5.begin_turn()
	for v in b5.vis: v.t = 9.0
	b5.preview_cost(BattleEnergy.cost_of("thunderbolt"))
	b5.t = 0.2
	_freeze(b5)
	# 6: spending: chips in flight (to the right, up)
	var e6 := BattleEnergy.make("charmander", 22)
	var b6 := _bar(Vector2(x0, y + dy * 5), e6, "Spending Flamethrower: the chips fly out", "foe")
	for i in 5: e6.begin_turn()
	for v in b6.vis: v.t = 9.0
	b6.fly_target = Vector2(700, 380)
	e6.use_move("flamethrower")
	for i in b6.flying.size(): b6.flying[i].t = b6.flying[i].delay + 0.18 + i * 0.05
	_freeze(b6)
	# the move list
	var e7 := BattleEnergy.make("pikachu", 12)
	e7.known.append("thunderbolt")    # (known early, say by a TM: the bar's too small yet, so they show locked)
	e7.known.append("thunder")
	e7.begin_turn(); e7.begin_turn()
	ml = EnergyMoveList.new()
	ml.position = Vector2(790, 24)
	ml.size = Vector2(460, 672)
	ml.show_end = true
	add_child(ml)
	ml.bind(e7, e7.known)
	ml.select(3)

# ---------- battle ----------
const ASH_AT := Vector2(330, 420)
const FOE_AT := Vector2(640, 260)

func _figures(vs: Vector2) -> void:
	# stand-ins for Ash and the Pidgey on the floor
	draw_circle(ASH_AT + Vector2(0, 40), 34, Color(0, 0, 0, 0.25), true, -1.0, true)
	draw_colored_polygon(UITheme.rounded_points(Rect2(ASH_AT + Vector2(-18, -50), Vector2(36, 90)), 16), Color("2c5fa8"))
	draw_circle(ASH_AT + Vector2(0, -66), 20, Color("f0c7a0"), true, -1.0, true)
	draw_colored_polygon(UITheme.rounded_points(Rect2(ASH_AT + Vector2(-24, -92), Vector2(48, 22)), 9), Color("d8342c"))
	var bob := sin(t * 5.0) * 4.0
	draw_circle(FOE_AT + Vector2(0, 34), 30, Color(0, 0, 0, 0.25), true, -1.0, true)
	draw_circle(FOE_AT + Vector2(0, bob), 30, Color("b5875a"), true, -1.0, true)
	draw_circle(FOE_AT + Vector2(-20, -30 + bob), 18, Color("b5875a"), true, -1.0, true)
	draw_circle(FOE_AT + Vector2(6, 6 + bob), 18, Color("f1dfbd"), true, -1.0, true)
	draw_colored_polygon(PackedVector2Array([FOE_AT + Vector2(-38, -34 + bob), FOE_AT + Vector2(-50, -30 + bob), FOE_AT + Vector2(-38, -26 + bob)]), Color("e8a443"))
	draw_circle(FOE_AT + Vector2(-26, -34 + bob), 3, Color.BLACK, true, -1.0, true)

func _fake_plates(vs: Vector2) -> void:
	# the foe's plate as battle_ui.gd draws it (top right), Ash's (bottom left)
	var r := Rect2(vs.x - 452, 78, 430, 92)
	UITheme.plate(self, r, 1.0, UITheme.SKEW, UITheme.PLATE, UITheme.CUT)
	UITheme.para(self, Rect2(r.position + Vector2(r.size.x - 150, -5), Vector2(120, 6)), UITheme.YELLOW)
	UITheme.text(self, r.position + Vector2(28, 38), "PIDGEY", "display", 34, UITheme.TEXT)
	UITheme.text(self, r.position + Vector2(36 + UITheme.text_w("PIDGEY", "display", 34), 38), "Lv.3", "heading", 20, UITheme.TEXT_DIM)
	UITheme.chip(self, r.position + Vector2(r.size.x - 118, 14), "WARY", UITheme.YELLOW, UITheme.INK, 14)
	var bar := Rect2(r.position + Vector2(56, 54), Vector2(300, 16))
	UITheme.text_mid(self, bar.position + Vector2(-30, 8), "HP", "label", 17, UITheme.YELLOW)
	UITheme.bar(self, bar, 0.8, UITheme.GREEN, 1.0, 8)
	var r2 := Rect2(22, vs.y - 124, 400, 98)
	UITheme.plate(self, r2, 1.0, UITheme.SKEW, UITheme.PLATE, UITheme.CUT)
	UITheme.para(self, Rect2(r2.position + Vector2(18, -5), Vector2(120, 6)), UITheme.RED)
	UITheme.text(self, r2.position + Vector2(30, 40), "PIKACHU", "display", 38, UITheme.TEXT)
	var b2 := Rect2(r2.position + Vector2(56, 56), Vector2(250, 18))
	UITheme.text_mid(self, b2.position + Vector2(-30, 9), "HP", "label", 17, UITheme.YELLOW)
	UITheme.bar(self, b2, 0.9, UITheme.GREEN, 1.0, 10)
	if not _callout.is_empty() and t - float(_callout.t) < 1.1:
		var ck := UITheme.ease_out_expo((t - float(_callout.t)) / 0.25)
		var cr := Rect2(vs.x * 0.5 - 220 + (1.0 - ck) * 60.0, 22, 440, 46)
		UITheme.plate(self, cr, ck, UITheme.SKEW, UITheme.PLATE_HI, 10)
		UITheme.para(self, Rect2(cr.position, Vector2(8, cr.size.y)), Color(_callout.col, ck), UITheme.SKEW)
		UITheme.text_mid(self, cr.get_center() + Vector2(0, -1), String(_callout.text), "display", 28, Color(UITheme.TEXT, ck), 1)

var _callout := {}

func _call(text: String, col: Color) -> void:
	_callout = {"text": text, "col": col, "t": t}

func _battle() -> void:
	fake = load("res://dev/energy_fake_battle.gd").new()
	fake.opts.temper = "flighty"
	add_child(fake)
	hook = EnergyHook.attach(fake, {"species": "pidgey", "level": 3, "seed": 3, "jitter": 0.0})
	var al := hook.add_ally("pikachu", 16)
	ml = hook.make_move_list()
	ml.size = Vector2(440, 330)
	ml.position = Vector2(size.x - 470, size.y - 350)
	ml.show_end = true
	fake.layer.add_child(ml)
	ml.picked.connect(func(id):
		_call("PIKACHU USED %s!" % String(BattleEnergy.move(id).name).to_upper(), EnergyIcon.color("electric"))
		hook.on_move(id, FOE_AT, "ally"))
	ml.visible = false
	# the timeline: the foe's turns 1-3, then the ally's turn with its menu
	var foe_turn := func(n: int, start: float):
		at(start, func():
			var plan: Array = fake._wild_pick({"turn": n, "temper": "aggressive" if n == 2 else "flighty"})
			for i in plan.size():
				var p: Dictionary = plan[i]
				at(start + 1.25 + i * 0.8, func():
					_call("PIDGEY USED %s!" % String(p.name), EnergyIcon.color("flying"))
					hook.on_move(p.move, ASH_AT + Vector2(0, -40)))
		)
	foe_turn.call(1, 0.4)
	foe_turn.call(2, 3.0)
	foe_turn.call(3, 5.8)
	# the ally: three turns' worth gained, the list opens, the selection walks, a pick
	at(0.4, func(): al.begin_turn())
	at(3.0, func(): al.begin_turn())
	at(5.8, func(): al.begin_turn())
	at(8.6, func(): ml.visible = true; ml.bind(al, al.known); ml.select(0))
	at(9.4, func(): ml.move(1))
	at(10.0, func(): ml.move(1))
	at(10.6, func(): ml.select(6))          # Thunderbolt: 3 chips, it has 3
	at(11.6, func(): ml.pick(6))
	at(12.6, func(): ml.select(1))
	at(13.0, func(): ml.pick(1))            # Growl? no chips left: it shakes
