class_name BattleUI
extends Control
# The battle's screen, in the UI kit's look (ui/README.md: dark skewed plates,
# red and yellow accents, big italic condensed type, snappy eases):
#   intro     a white flash, ink bands sweeping across (red and yellow leading
#             edges) with streaks racing over them, the species slammed in on a
#             red slash, the bands sweeping on off the far side
#   plates    Ash's (bottom left: his STAMINA, the same bar the world shows: in
#             a battle it is what wears down, he has no HP; his aim when sand
#             got in his eyes) and the wild one's (top right: its HP bar, its
#             mood chip, its aim)
#   slots     energy_slot("foe") / energy_slot("ally"): the anchor rects kept
#             free for the energy bars (battle/energy.gd's widget: the foe's
#             above its name plate, an ally Pokémon's above Ash's later)
#   menu      Ash's choices (RUN, HIDE, THROW SOMETHING > a rock / sand), stacked
#             skewed buttons with an icon, a line of
#             what it does and the pad's glyph on the selected one; touch, pad
#             (up / down, A) and keys (arrows, E / Enter, 1-4)
#   callouts  "PIDGEY USED GUST!" and Ash's own on a skewed plate up top
#   pops      damage numbers and effect words over whoever they're about
#   overlays  anime speed lines, sand in his eyes, the red edge of a hit, the
#             low-HP pulse, a black fade with a caption (the defeat)
#   bubble    what Ash shouts or says (a speech bubble over his head)
# battle.gd owns it (a CanvasLayer above the world's HUD) and feeds it each frame.

signal picked(id: String)

# the prologue's menu (Ash with no Pokémon: battle_rules.gd's mode "prologue"):
# three choices, THROW SOMETHING opening a second list
const ITEMS := [
	{"id": "run", "label": "RUN", "desc": "Try to get away. It may cut you off", "icon": "jump", "col": Color("3fb6f5")},
	{"id": "hide", "label": "HIDE", "desc": "Duck down in the grass and keep still", "icon": "drop", "col": Color("3fcf72")},
	{"id": "throw", "label": "THROW SOMETHING", "desc": "A rock, or a handful of sand", "icon": "bolt", "col": Color("ee3b33"), "sub": "throw"},
]
const SUBS := {
	"throw": [
		{"id": "rock", "label": "A ROCK", "desc": "A little damage, and it gets angry", "icon": "bolt", "col": Color("ee3b33")},
		{"id": "sand", "label": "A HANDFUL OF SAND", "desc": "Right in its eyes: it may miss, or give up", "icon": "sweat", "col": Color("e0a84a")},
		{"id": "", "label": "BACK", "desc": "", "icon": "close", "col": Color("8a94a6")},
	],
}
const MOOD := {"calm": ["CALM", Color("3fcf72")], "wary": ["WARY", Color("ffcb05")], "angry": ["ANGRY", Color("ee3b33")], "scared": ["SCARED", Color("9d6cf0")]}

var cam: Camera3D
var t := 0.0
# intro
var intro_t := -1.0
var intro_name := "PIDGEY"
var intro_sub := ""
var banner_t := -1.0
# plates
var hud_k := 0.0
var hud_on := false
var ash_sta := 100.0        # his stamina, in points (battle_rules.gd)
var ash_max := 100.0
var ash_show := 100.0      # the bar's white "damage" part drains after the hit
var ash_acc := 0
var foe_name := "PIDGEY"
var foe_lv := 3
var foe_hp := 16.0
var foe_max := 16.0
var foe_show := 16.0
var foe_acc := 0
var mood := "calm"
var mood_t := 9.0
# the menu
var menu_on := false
var items: Array = ITEMS     # the list showing (ITEMS, or one of SUBS)
var sub := ""                # which of SUBS is open ("" = the top list)
var menu_k := 0.0
var sel := 0
var _rects: Array = []     # touch rects, one per item
var _press_t := -1.0
var _press_i := -1
# callouts and pops
var callout := {}          # {who, text, col, t}
var pops: Array = []       # {text, at (Vector3 world or Vector2 screen), col, t, size, kind}
# overlays
var speed_k := 0.0
var speed_focus := Vector2(-1, -1)
var sand_k := 0.0
var red_k := 0.0
var fade_k := 0.0
var caption := ""
var outcome_t := -1.0
var outcome_text := ""
var outcome_sub := ""
var outcome_col := UITheme.RED
var bubble := {}           # {text, at (Vector3), t, dur}
var shake := Vector2.ZERO
var _rng := RandomNumberGenerator.new()
var _lines: Array = []
var _lines_t := 0.0

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rng.randomize()

func intro(name_: String, sub: String) -> void:
	intro_t = 0.0
	intro_name = name_
	intro_sub = sub

func show_hud(on: bool) -> void: hud_on = on

func open_menu() -> void:
	menu_on = true
	_press_t = -1.0
	_open_sub("")

func _open_sub(id: String) -> void:
	sub = id
	items = SUBS.get(id, ITEMS)
	sel = 0
	menu_k = minf(menu_k, 0.35) if menu_on and id != "" else menu_k   # (the new list slides in)

# B / Esc: out of a second list
func back() -> void:
	if not menu_on or sub == "": return
	Sfx.ui("ui_cursor")
	_open_sub("")

func close_menu() -> void: menu_on = false

func say(who: String, text: String, col := UITheme.RED) -> void:
	callout = {"who": who, "text": text, "col": col, "t": 0.0}

func pop(text: String, at, col := Color.WHITE, size := 64, kind := "dmg") -> void:
	pops.append({"text": text, "at": at, "col": col, "t": 0.0, "size": size, "kind": kind})

func speak(text: String, at: Vector3, dur := 1.8) -> void:
	bubble = {"text": text, "at": at, "t": 0.0, "dur": dur}

func show_outcome(text: String, sub: String, col: Color) -> void:
	outcome_t = 0.0; outcome_text = text; outcome_sub = sub; outcome_col = col

func set_mood(m: String) -> void:
	if m != mood: mood_t = 0.0
	mood = m

# ---------- input (battle.gd calls these from its own polling) ----------
func move(d: int) -> void:
	if not menu_on: return
	sel = wrapi(sel + d, 0, items.size())
	Sfx.ui("ui_cursor")

func confirm() -> void:
	if not menu_on or menu_k < 0.6: return
	_pick(sel)

func _pick(i: int) -> void:
	sel = i
	_press_t = 0.0
	_press_i = i
	Sfx.ui("ui_confirm")
	var it: Dictionary = items[i]
	if it.has("sub"):
		_open_sub(String(it.sub))
		return
	if String(it.id) == "":
		_open_sub("")
		menu_k = minf(menu_k, 0.35)
		return
	menu_on = false
	picked.emit(String(it.id))

func _input(e: InputEvent) -> void:
	if not menu_on or menu_k < 0.6: return
	var p := Vector2(-1, -1)
	if e is InputEventScreenTouch and e.pressed: p = e.position
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: p = e.position
	if p.x < 0.0: return
	var xf := get_global_transform_with_canvas().affine_inverse()
	var lp := xf * p
	for i in _rects.size():
		if (_rects[i] as Rect2).has_point(lp):
			_pick(i)
			get_viewport().set_input_as_handled()
			return

func blocks(p: Vector2) -> bool:
	if not menu_on: return false
	for r in _rects: if (r as Rect2).has_point(p): return true
	return false

# ---------- the frame ----------
func tick(dt: float) -> void:
	t += dt
	if intro_t >= 0.0:
		intro_t += dt
		if intro_t > 3.2: intro_t = -1.0
	hud_k = move_toward(hud_k, 1.0 if hud_on else 0.0, dt / UITheme.SLOW)
	menu_k = move_toward(menu_k, 1.0 if menu_on else 0.0, dt / UITheme.BASE)
	if _press_t >= 0.0: _press_t += dt
	# the bars: the HP drops at once, the white part drains after a beat
	ash_show = move_toward(ash_show, ash_sta, dt * ash_max * (0.6 if ash_show - ash_sta < ash_max * 0.5 else 1.0)) if ash_show > ash_sta else ash_sta
	foe_show = move_toward(foe_show, foe_hp, dt * foe_max * 0.6) if foe_show > foe_hp else foe_hp
	mood_t += dt
	if not callout.is_empty():
		callout.t += dt
		if callout.t > 1.9: callout = {}
	for p in pops.duplicate():
		p.t += dt
		if p.t > 1.2: pops.erase(p)
	if not bubble.is_empty():
		bubble.t += dt
		if bubble.t > bubble.dur: bubble = {}
	if outcome_t >= 0.0:
		outcome_t += dt
		if outcome_t > 2.6: outcome_t = -1.0
	red_k = maxf(0.0, red_k - dt * 2.2)
	_lines_t -= dt
	if _lines_t <= 0.0:
		_lines_t = 0.05
		_lines.clear()
		for i in 56: _lines.append([_rng.randf() * TAU, _rng.randf_range(0.5, 0.85), _rng.randf_range(2.0, 7.0)])
	queue_redraw()

func _screen(at) -> Vector2:
	if at is Vector2: return at
	if cam == null or cam.is_position_behind(at): return Vector2(-1000, -1000)
	return cam.unproject_position(at)

func _draw() -> void:
	var vs := get_viewport_rect().size
	var safe := UITheme.safe_rect(self)
	draw_set_transform(shake)
	if speed_k > 0.01: _speed_lines(vs)
	if sand_k > 0.01: _sand(vs)
	if red_k > 0.01: _vignette(vs, UITheme.RED, red_k * 0.55)
	if hud_k > 0.01 and ash_sta / maxf(1.0, ash_max) < 0.3:   # (worn out: the edge pulses)
		_vignette(vs, UITheme.RED_DEEP, (0.18 + 0.12 * sin(t * 6.0)) * hud_k)
	_pops()
	if not bubble.is_empty(): _bubble(vs)
	if hud_k > 0.01:
		_ash_plate(safe)
		_foe_plate(safe)
	if menu_k > 0.01: _menu(safe)
	if not callout.is_empty(): _callout(vs, safe)
	if outcome_t >= 0.0: _outcome(vs)
	draw_set_transform(Vector2.ZERO)
	if intro_t >= 0.0: _intro(vs)
	if fade_k > 0.001:
		draw_rect(Rect2(Vector2.ZERO, vs), Color(UITheme.INK, fade_k))
		if caption != "" and fade_k > 0.5:
			var a := clampf((fade_k - 0.5) * 2.0, 0.0, 1.0)
			UITheme.text(self, Vector2(vs.x * 0.5, vs.y * 0.5 + 12), caption, "heading", 40, Color(UITheme.TEXT, a), 1)
			UITheme.para(self, Rect2(vs.x * 0.5 - 60, vs.y * 0.5 + 30, 120, 5), Color(UITheme.RED, a))

# ---------- the intro ----------
func _intro(vs: Vector2) -> void:
	var it := intro_t
	# the flash
	if it < 0.22:
		draw_rect(Rect2(Vector2.ZERO, vs), Color(1, 1, 1, 1.0 - it / 0.22))
	var lean := vs.y * 0.45
	var span := vs.x + lean * 2.0
	# the bands in (0.06 .. 0.42) and out (1.5 .. 1.9): ink with red and yellow leading edges, right to left
	var cover := UITheme.ease_out_expo(clampf((it - 0.06) / 0.36, 0.0, 1.0))
	var uncover := UITheme.ease_in(clampf((it - 1.5) / 0.4, 0.0, 1.0))
	if uncover < 1.0 and cover > 0.0:
		var lead := vs.x + lean - cover * span          # the leading edge's x at the top
		var trail := vs.x + lean - uncover * span        # the trailing edge's x at the top
		var ink := PackedVector2Array([Vector2(lead, 0), Vector2(trail + lean * 3.0, 0), Vector2(trail + lean * 2.0, vs.y), Vector2(lead - lean, vs.y)])
		if uncover > 0.0: ink = PackedVector2Array([Vector2(lead, 0), Vector2(trail, 0), Vector2(trail - lean, vs.y), Vector2(lead - lean, vs.y)])
		draw_colored_polygon(ink, UITheme.INK)
		# streaks racing across the ink
		var rr := RandomNumberGenerator.new(); rr.seed = 7
		for i in 26:
			var y := rr.randf() * vs.y
			var x := fmod(rr.randf() * vs.x * 2.0 - it * rr.randf_range(1800, 3200), vs.x * 1.6) + vs.x * 0.2
			var ln := rr.randf_range(80, 260)
			draw_line(Vector2(x, y), Vector2(x + ln, y - ln * 0.12), Color(1, 1, 1, 0.08 + 0.1 * rr.randf()), rr.randf_range(1.5, 4.0), true)
		if uncover <= 0.0:
			draw_colored_polygon(PackedVector2Array([Vector2(lead - 26, 0), Vector2(lead, 0), Vector2(lead - lean, vs.y), Vector2(lead - lean - 26, vs.y)]), UITheme.RED)
			draw_colored_polygon(PackedVector2Array([Vector2(lead - 40, 0), Vector2(lead - 33, 0), Vector2(lead - lean - 33, vs.y), Vector2(lead - lean - 40, vs.y)]), UITheme.YELLOW)
		else:
			draw_colored_polygon(PackedVector2Array([Vector2(trail, 0), Vector2(trail + 26, 0), Vector2(trail - lean + 26, vs.y), Vector2(trail - lean, vs.y)]), UITheme.RED)
			draw_colored_polygon(PackedVector2Array([Vector2(trail + 33, 0), Vector2(trail + 40, 0), Vector2(trail - lean + 40, vs.y), Vector2(trail - lean + 33, vs.y)]), UITheme.YELLOW)
	# the name slammed in (0.42 ..), held over the ink, then up out of the way with the reveal
	if it > 0.38 and it < 3.2:
		var k_in := UITheme.ease_back(clampf((it - 0.38) / 0.24, 0.0, 1.0), 2.2)
		var k_out := UITheme.ease_in(clampf((it - 2.7) / 0.4, 0.0, 1.0))
		var cy := lerpf(vs.y * 0.46, vs.y * 0.22, UITheme.ease_out(clampf((it - 1.5) / 0.5, 0.0, 1.0)))
		var a := 1.0 - k_out
		var title := "WILD " + intro_name + "!"
		var fs := 92
		var tw := UITheme.text_w(title, "display", fs)
		var w := tw + 140.0
		var x0 := vs.x * 0.5 - w * 0.5 + (1.0 - k_in) * vs.x * 0.6 - k_out * vs.x * 0.4
		var slash := Rect2(x0, cy - 56, w, 104)
		UITheme.shadow(self, UITheme.para_points(slash, UITheme.SKEW), a, Vector2(0, 8))
		UITheme.para(self, slash, Color(UITheme.RED, a))
		UITheme.para(self, Rect2(slash.position + Vector2(10, slash.size.y - 10), Vector2(w - 20, 6)), Color(UITheme.RED_DEEP, a))
		UITheme.chevrons(self, Vector2(x0 - 40, cy - 4), 40.0, Color(UITheme.YELLOW, a), 3, 1.0)
		UITheme.chevrons(self, Vector2(x0 + w + 40, cy - 4), 40.0, Color(UITheme.YELLOW, a), 3, -1.0)
		UITheme.text(self, Vector2(x0 + w * 0.5 + 4, cy + 32 + 4), title, "display", fs, Color(0, 0, 0, 0.25 * a), 1)
		UITheme.text(self, Vector2(x0 + w * 0.5, cy + 32), title, "display", fs, Color(UITheme.WHITE, a), 1)
		if intro_sub != "":
			var sw := UITheme.text_w(intro_sub, "label", 22) + 40.0
			var sub := Rect2(vs.x * 0.5 - sw * 0.5 - (1.0 - k_in) * vs.x * 0.3, cy + 58, sw, 36)
			UITheme.plate(self, sub, a)
			UITheme.text_mid(self, Vector2(sub.get_center().x, sub.get_center().y), intro_sub, "label", 22, Color(UITheme.TEXT, a), 1)

# ---------- the plates ----------
func _hp_col(f: float) -> Color:
	if f > 0.5: return UITheme.GREEN
	if f > 0.22: return UITheme.YELLOW
	return UITheme.RED

func _sta_col(f: float) -> Color:
	if f > 0.5: return UITheme.YELLOW
	if f > 0.22: return UITheme.ORANGE
	return UITheme.RED

func _ash_rect(safe: Rect2) -> Rect2:
	return Rect2(safe.position.x + 22, safe.end.y - 124, 400, 98)

func _foe_rect(safe: Rect2) -> Rect2:
	return Rect2(safe.end.x - 422, safe.position.y + 104, 400, 92)

# where the energy bars go (battle/energy.gd's widget draws there; nothing here yet):
# "foe" just under the wild one's plate (above it is the world HUD's clock), "ally"
# just above Ash's (a Pokémon of his, later)
func energy_slot(who: String) -> Rect2:
	var safe := UITheme.safe_rect(self)
	if who == "foe":
		var f := _foe_rect(safe)
		return Rect2(f.position.x + 18, f.end.y + 6, f.size.x - 18, 48)
	var r := _ash_rect(safe)
	return Rect2(r.position.x, r.position.y - 54, r.size.x, 48)

func _ash_plate(safe: Rect2) -> void:
	var k := UITheme.ease_out_expo(hud_k)
	var r := _ash_rect(safe)
	r.position.x -= (1.0 - k) * 460.0
	UITheme.plate(self, r, k, UITheme.SKEW, UITheme.PLATE, UITheme.CUT)
	UITheme.para(self, Rect2(r.position + Vector2(18, -5), Vector2(120, 6)), Color(UITheme.RED, k))
	UITheme.text(self, r.position + Vector2(30, 40), "ASH", "display", 38, Color(UITheme.TEXT, k))
	UITheme.chip(self, r.position + Vector2(108, 16), "NO POKéMON", Color(UITheme.WHITE, 0.16), Color(UITheme.TEXT_DIM, 1.0), 13, 22.0, k)
	if ash_acc < 0:
		UITheme.chip(self, r.position + Vector2(232, 16), "AIM %d" % ash_acc, UITheme.ORANGE, Color.WHITE, 13, 22.0, k)
	var f := ash_sta / maxf(1.0, ash_max)
	var fs := ash_show / maxf(1.0, ash_max)
	# the stamina bar: the world's meter (sweat icon), drained white part first
	UIWidgets.icon_disc(self, r.position + Vector2(44, 65), 15.0, _sta_col(f), "sweat", k)
	var bar := Rect2(r.position + Vector2(68, 56), Vector2(236, 18))
	UITheme.bar(self, bar, fs, Color(1, 1, 1, 0.85), k, 10)
	var pulse := 1.0 if f > 0.3 else 0.72 + 0.28 * sin(t * 8.0)
	UITheme.bar(self, bar, f, Color(_sta_col(f) * pulse, 1.0), k, 10, Color(0, 0, 0, 0))
	UITheme.text(self, Vector2(bar.position.x + 2, bar.position.y - 4), "STAMINA", "label", 13, Color(UITheme.TEXT_DIM, k))
	UITheme.text(self, Vector2(bar.end.x + 12, bar.position.y + 17), "%d%%" % ceili(f * 100.0), "number", 24, Color(UITheme.TEXT, k))
	if f <= 0.3:
		UITheme.chip(self, r.position + Vector2(r.size.x - 128, 16), "EXHAUSTED" if f < 0.12 else "WORN OUT", UITheme.RED, Color.WHITE, 13, 22.0, k)

func _foe_plate(safe: Rect2) -> void:
	var k := UITheme.ease_out_expo(hud_k)
	var r := _foe_rect(safe)
	r.position.x += (1.0 - k) * 460.0
	UITheme.plate(self, r, k, UITheme.SKEW, UITheme.PLATE, UITheme.CUT)
	UITheme.para(self, Rect2(r.position + Vector2(r.size.x - 150, -5), Vector2(120, 6)), Color(UITheme.YELLOW, k))
	UITheme.text(self, r.position + Vector2(28, 38), foe_name, "display", 34, Color(UITheme.TEXT, k))
	var nw := UITheme.text_w(foe_name, "display", 34)
	UITheme.text(self, r.position + Vector2(36 + nw, 38), "Lv.%d" % foe_lv, "heading", 20, Color(UITheme.TEXT_DIM, k))
	var m: Array = MOOD.get(mood, MOOD.calm)
	var pop_k := 1.0 + 0.25 * maxf(0.0, 1.0 - mood_t / 0.25)
	UITheme.chip(self, r.position + Vector2(r.size.x - 118, 14), m[0], m[1], UITheme.INK if mood in ["calm", "wary"] else Color.WHITE, int(14 * pop_k), 22.0 * pop_k, k)
	if foe_acc < 0:
		UITheme.chip(self, r.position + Vector2(r.size.x - 210, 14), "AIM %d" % foe_acc, UITheme.ORANGE, Color.WHITE, 13, 22.0, k)
	var f := foe_hp / maxf(1.0, foe_max)
	var bar := Rect2(r.position + Vector2(56, 54), Vector2(300, 16))
	UITheme.text_mid(self, bar.position + Vector2(-30, 8), "HP", "label", 17, Color(UITheme.YELLOW, k))
	UITheme.bar(self, bar, foe_show / maxf(1.0, foe_max), Color(1, 1, 1, 0.85), k, 8)
	UITheme.bar(self, bar, f, _hp_col(f), k, 8, Color(0, 0, 0, 0))

# ---------- the menu ----------
func _menu(safe: Rect2) -> void:
	var k := UITheme.ease_out_expo(menu_k)
	var bh := 66.0
	var gap := 10.0
	var bw := 372.0
	var n := items.size()
	var top := safe.end.y - 22 - n * bh - (n - 1) * gap
	_rects.clear()
	var dev: String = UIInput.device if UIInput.I else "touch"
	# the header
	var hx := safe.end.x - bw - 30 + (1.0 - k) * 300.0
	UITheme.text(self, Vector2(hx + 8, top - 14), "THROW WHAT?" if sub == "throw" else "WHAT WILL ASH DO?", "heading", 22, Color(UITheme.TEXT, k), 0, -1.0, 4, Color(0, 0, 0, 0.45 * k))
	for i in n:
		var it: Dictionary = items[i]
		var on := i == sel and dev != "touch"
		var stag := clampf(k * 1.3 - i * 0.1, 0.0, 1.0)
		var sk := UITheme.ease_back(stag)
		var x := safe.end.x - bw - 22 - (18.0 if on else 0.0) + (1.0 - sk) * 420.0 - i * bh * UITheme.SKEW * 0.5
		var r := Rect2(x, top + i * (bh + gap), bw, bh)
		_rects.append(UITheme.touch_rect(self, r))
		var pressed := _press_i == i and _press_t >= 0.0 and _press_t < 0.2
		var sc := 1.0 - (0.06 * sin(clampf(_press_t / 0.2, 0.0, 1.0) * PI) if pressed else 0.0)
		var rr := Rect2(r.get_center() - r.size * 0.5 * sc, r.size * sc)
		var a := stag
		UITheme.plate(self, rr, a, UITheme.SKEW, UITheme.PLATE_HI if on else UITheme.PLATE, UITheme.CUT * 0.7)
		var col: Color = it.col
		UITheme.para(self, Rect2(rr.position, Vector2(UITheme.BAR + (4.0 if on else 0.0), rr.size.y)), Color(col, a))
		if on:
			UITheme.outline(self, UITheme.para_points(rr, UITheme.SKEW), Color(UITheme.YELLOW, a), 2.5)
		UIWidgets.icon_disc(self, rr.position + Vector2(44, rr.size.y * 0.5), 20.0, col, String(it.icon), a)
		var fs := 28
		while fs > 20 and UITheme.text_w(String(it.label), "display", fs) > rr.size.x - 128.0: fs -= 1
		UITheme.text(self, rr.position + Vector2(78, 31), String(it.label), "display", fs, Color(UITheme.TEXT, a))
		UITheme.text(self, rr.position + Vector2(80, 53), String(it.desc), "body", 16, Color(UITheme.TEXT_DIM, a))
		if on:
			UITheme.glyph(self, rr.position + Vector2(rr.size.x - 34, rr.size.y * 0.5), "use", 30.0, a)
		elif dev == "keys":
			UITheme.text_mid(self, rr.position + Vector2(rr.size.x - 30, rr.size.y * 0.5), str(i + 1), "label", 18, Color(UITheme.TEXT_DIM, a), 1)

# ---------- callouts, pops, the bubble, the outcome ----------
func _callout(vs: Vector2, safe: Rect2) -> void:
	var ct: float = callout.t
	var k_in := UITheme.ease_back(clampf(ct / 0.22, 0.0, 1.0), 1.8)
	var k_out := UITheme.ease_in(clampf((ct - 1.55) / 0.3, 0.0, 1.0))
	var a := 1.0 - k_out
	var who: String = callout.who
	var txt: String = callout.text
	var fs := 52
	var tw := UITheme.text_w(txt, "display", fs)
	var ww := UITheme.text_w(who, "heading", 22)
	var w := tw + ww + 90.0
	var cy := safe.position.y + 196.0
	var x := vs.x * 0.5 - w * 0.5 + (1.0 - k_in) * 380.0 - k_out * 300.0
	var r := Rect2(x, cy - 34, w, 70)
	UITheme.shadow(self, UITheme.para_points(r, UITheme.SKEW), a, Vector2(0, 6))
	UITheme.para(self, r, Color(UITheme.INK, 0.92 * a))
	UITheme.para(self, Rect2(r.position, Vector2(w, 6)), Color(callout.col, a))
	UITheme.para(self, Rect2(r.position + Vector2(14, 14), Vector2(ww + 20, 26)), Color(callout.col, a))
	UITheme.text_mid(self, r.position + Vector2(24, 27), who, "heading", 22, Color(UITheme.INK if callout.col == UITheme.YELLOW else UITheme.WHITE, a))
	UITheme.text(self, r.position + Vector2(ww + 58, 54), txt, "display", fs, Color(UITheme.WHITE, a))

func _pops() -> void:
	for p in pops:
		var s := _screen(p.at)
		if s.x < -500.0: continue
		var u: float = p.t
		var k := UITheme.ease_back(clampf(u / 0.16, 0.0, 1.0), 2.6)
		var a := 1.0 - clampf((u - 0.8) / 0.4, 0.0, 1.0)
		var sz := int(p.size * (0.5 + 0.5 * k) * (1.0 + 0.4 * maxf(0.0, 1.0 - u / 0.1)))
		var y := s.y - 30.0 - u * 50.0
		var col: Color = p.col
		if p.kind == "dmg":
			UITheme.text(self, Vector2(s.x + 4, y + 5), p.text, "display", sz, Color(0, 0, 0, 0.45 * a), 1)
			UITheme.text(self, Vector2(s.x, y), p.text, "display", sz, Color(col, a), 1, -1.0, 8, Color(UITheme.INK, 0.9 * a))
		else:
			var w := UITheme.text_w(p.text, "label", p.size) + 24.0
			var r := Rect2(s.x - w * 0.5, y - p.size - 6, w, p.size + 16)
			UITheme.para(self, r, Color(UITheme.INK, 0.85 * a))
			UITheme.para(self, Rect2(r.position, Vector2(UITheme.BAR, r.size.y)), Color(col, a))
			UITheme.text_mid(self, r.get_center(), p.text, "label", p.size, Color(col.lightened(0.3), a), 1)

func _bubble(vs: Vector2) -> void:
	var s := _screen(bubble.at)
	if s.x < -500.0: return
	var k := UITheme.ease_back(clampf(bubble.t / 0.18, 0.0, 1.0))
	var a := k * (1.0 - clampf((bubble.t - bubble.dur + 0.25) / 0.25, 0.0, 1.0))
	var rows := UITheme.wrap(String(bubble.text), "body_bold", 24, 340.0)
	UIWidgets.bubble(self, s, rows, 24, true, vs.x, a)

func _outcome(vs: Vector2) -> void:
	var ot := outcome_t
	var k_in := UITheme.ease_back(clampf(ot / 0.25, 0.0, 1.0), 2.0)
	var k_out := UITheme.ease_in(clampf((ot - 2.2) / 0.35, 0.0, 1.0))
	var a := 1.0 - k_out
	var fs := 74
	var tw := UITheme.text_w(outcome_text, "display", fs)
	var w := tw + 120.0
	var cy := vs.y * 0.4
	var x := vs.x * 0.5 - w * 0.5 - (1.0 - k_in) * vs.x * 0.5 + k_out * vs.x * 0.5
	var r := Rect2(x, cy - 50, w, 92)
	UITheme.shadow(self, UITheme.para_points(r, UITheme.SKEW), a, Vector2(0, 8))
	UITheme.para(self, r, Color(outcome_col, a))
	UITheme.text(self, Vector2(r.get_center().x, cy + 26), outcome_text, "display", fs, Color(UITheme.WHITE if outcome_col != UITheme.YELLOW else UITheme.INK, a), 1)
	if outcome_sub != "":
		var sw := UITheme.text_w(outcome_sub, "label", 22) + 40.0
		var sub := Rect2(vs.x * 0.5 - sw * 0.5 + (1.0 - k_in) * vs.x * 0.3, cy + 50, sw, 36)
		UITheme.plate(self, sub, a)
		UITheme.text_mid(self, sub.get_center(), outcome_sub, "label", 22, Color(UITheme.TEXT, a), 1)

# ---------- overlays ----------
func _speed_lines(vs: Vector2) -> void:
	var c := speed_focus if speed_focus.x >= 0.0 else vs * 0.5
	var R := vs.length() * 0.6
	for L in _lines:
		var d := Vector2.from_angle(float(L[0]))
		var p0: Vector2 = c + d * R * float(L[1])
		var p1: Vector2 = c + d * R * 1.1
		var n: Vector2 = Vector2(-d.y, d.x) * float(L[2])
		draw_colored_polygon(PackedVector2Array([p0, p1 + n, p1 - n]), Color(1, 1, 1, 0.55 * speed_k))

func _sand(vs: Vector2) -> void:
	_vignette(vs, Color("c9a86a"), 0.5 * sand_k)
	var rr := RandomNumberGenerator.new()
	rr.seed = int(t * 20.0)
	for i in int(90 * sand_k):
		var p := Vector2(rr.randf() * vs.x, rr.randf() * vs.y)
		var edge := minf(minf(p.x, vs.x - p.x) / vs.x, minf(p.y, vs.y - p.y) / vs.y)
		if edge > 0.22 and rr.randf() < 0.7: continue
		draw_circle(p, rr.randf_range(1.5, 4.5), Color(0.86, 0.74, 0.5, 0.7 * sand_k))

func _vignette(vs: Vector2, col: Color, a: float) -> void:
	var w := vs.x * 0.16
	var h := vs.y * 0.2
	var o := Color(col, a)
	var i := Color(col, 0.0)
	var cols := PackedColorArray([o, o, i, i])
	draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(vs.x, 0), Vector2(vs.x - w, h), Vector2(w, h)]), cols)
	draw_polygon(PackedVector2Array([Vector2(vs.x, vs.y), Vector2(0, vs.y), Vector2(w, vs.y - h), Vector2(vs.x - w, vs.y - h)]), cols)
	draw_polygon(PackedVector2Array([Vector2(0, vs.y), Vector2(0, 0), Vector2(w, h), Vector2(w, vs.y - h)]), cols)
	draw_polygon(PackedVector2Array([Vector2(vs.x, 0), Vector2(vs.x, vs.y), Vector2(vs.x - w, vs.y - h), Vector2(vs.x - w, h)]), cols)
