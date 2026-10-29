class_name WildHud
extends Control
# The hunt's HUD, in the UI kit's look (ui/ui_theme.gd):
#   prompt   over a hiding Pokémon in reach: a dark skewed plate with three A
#            glyphs, "POUNCE!", and a segmented meter that fills with each press
#            (further off, dimmed: GET CLOSER); over a fleeing one in reach a
#            yellow "GRAB IT!" plate with the time left running down
#   card     the tutorial's step (wild_tutorial.gd): a light panel at the left,
#            TRAINER TIP n / N, the step's text, the button to press, and the
#            skip hint (hold B, or tap SKIP)
# wild.gd sets prompt = {at: Vector3, kind: "mash" | "grab", fill, near, left, pop}.

var wild
var prompt := {}
var card := {}
var _card_t := 0.0
var _card_key := ""
var _skip_r := Rect2()
var _t := 0.0

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _process(dt: float) -> void:
	_t += dt
	var k := String(card.get("text", ""))
	if k != _card_key: _card_key = k; _card_t = 0.0
	_card_t += dt
	if not prompt.is_empty() or not card.is_empty(): queue_redraw()

func _input(e: InputEvent) -> void:
	var tap: bool = (e is InputEventScreenTouch and e.pressed) or (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT)
	if tap and not card.is_empty() and _skip_r.has_point(e.position) and wild and wild.tut:
		wild.tut.skip()
		get_viewport().set_input_as_handled()

func _draw() -> void:
	var sr := UITheme.safe_rect(self)
	if not prompt.is_empty() and wild and wild.game and wild.game.cam:
		var cam: Camera3D = wild.game.cam
		var at: Vector3 = prompt.at
		if not cam.is_position_behind(at): _draw_prompt(cam.unproject_position(at))
	if not card.is_empty(): _draw_card(sr)

func _draw_prompt(p: Vector2) -> void:
	var grab: bool = String(prompt.kind) == "grab"
	var near: bool = bool(prompt.get("near", true))
	var pop := float(prompt.get("pop", 0.0))
	var s := 1.0 + 0.12 * pop + (0.04 * sin(_t * 18.0) if grab else 0.0)
	var a := 1.0 if near else 0.55
	var h := 44.0 * s
	var label := "GRAB IT!" if grab else ("POUNCE!" if near else "GET CLOSER")
	var n := 2 if grab else 3
	var gw := h * 0.66
	var tw := UITheme.text_w(label, "label", int(21 * s))
	var w := 18.0 * s + n * (gw + 4.0 * s) + tw + 18.0 * s
	var r := Rect2(p.x - w * 0.5, p.y - h - 30.0 * s, w, h)
	var col := UITheme.YELLOW if grab else UITheme.PLATE
	var pts := UITheme.plate(self, r, a, UITheme.SKEW, col)
	UITheme.outline(self, pts, Color(1, 1, 1, 0.2 * a), 1.0)
	UITheme.para(self, Rect2(r.position.x, r.end.y - 3.0 * s, r.size.x, 3.0 * s), Color(UITheme.RED if grab else UITheme.YELLOW, a))
	draw_colored_polygon(PackedVector2Array([Vector2(p.x - 7 * s, r.end.y), Vector2(p.x + 7 * s, r.end.y), Vector2(p.x, r.end.y + 9 * s)]), Color(UITheme.RED if grab else UITheme.YELLOW, a))
	var x := r.position.x + 14.0 * s
	for i in n:
		# the glyphs bounce in turn, quicker as the meter fills
		var bob := -absf(sin(_t * (9.0 + 6.0 * float(prompt.fill)) - i * 0.9)) * 4.0 * s if near else 0.0
		UITheme.glyph(self, Vector2(x + gw * 0.5, r.get_center().y + bob), "use", gw, a)
		x += gw + 4.0 * s
	UITheme.text_mid(self, Vector2(x + 6.0 * s, r.get_center().y), label, "label", int(21 * s), Color(UITheme.INK if grab else UITheme.TEXT, a))
	# the meter under it (4 segments: 3 or 4 quick presses fill it), the grab's time left above
	var mr := Rect2(r.position.x + 8.0, r.end.y + 14.0 * s, r.size.x - 16.0, 9.0 * s)
	UITheme.plate(self, mr.grow(3.0), 0.8 * a)
	UITheme.bar(self, mr, float(prompt.fill), UITheme.YELLOW if not grab else UITheme.RED, a, 4 if not grab else 2)
	if grab and prompt.has("left"):
		UITheme.bar(self, Rect2(r.position.x + 6.0, r.position.y - 9.0, (r.size.x - 12.0), 5.0), float(prompt.left), UITheme.WHITE, 0.9)

func _draw_card(sr: Rect2) -> void:
	var k := UITheme.ease_back(clampf(_card_t / UITheme.BASE, 0.0, 1.0))
	var a := clampf(_card_t / UITheme.FAST, 0.0, 1.0)
	var w := 400.0
	var x := sr.position.x + 22.0 - (1.0 - k) * 60.0
	var y := sr.position.y + sr.size.y * 0.24
	var rows := UITheme.wrap(String(card.text), "body", 21, w - 40.0)
	var h := 54.0 + rows.size() * 27.0 + (44.0 if card.get("action", "") != "" else 6.0) + 30.0
	var r := Rect2(x, y, w, h)
	UITheme.panel(self, r, UITheme.SKY, a)
	# head: TRAINER TIP, the step count, the speaker
	var cw := UITheme.chip(self, r.position + Vector2(16, 12), String(card.get("head", "TRAINER TIP")), UITheme.RED, Color.WHITE, 14, 22.0, a)
	if card.has("n"):
		UITheme.text_mid(self, r.position + Vector2(16 + cw + 10, 23), "%d / %d" % [int(card.step), int(card.n)], "label", 15, Color(UITheme.INK_SOFT, a))
	var yy := r.position.y + 62.0
	for row in rows:
		UITheme.text(self, Vector2(r.position.x + 18.0, yy), row, "body", 21, Color(UITheme.INK, a))
		yy += 27.0
	var act := String(card.get("action", ""))
	if act != "":
		var gw := UITheme.glyph(self, Vector2(r.position.x + 34.0, yy + 10.0), act, 30.0, a)
		var lbl := String(card.get("action_label", ""))
		if UIInput.device == "touch" and card.has("touch_label"): lbl = String(card.touch_label)
		UITheme.text_mid(self, Vector2(r.position.x + 34.0 + gw * 0.5 + 12.0, yy + 10.0), lbl.to_upper(), "label", 18, Color(UITheme.INK, a))
		yy += 44.0
	# skip: hold B (a ring fills), or tap the chip
	var sf := float(card.get("skip_fill", 0.0))
	var stext := "SKIP TUTORIAL" if UIInput.device == "touch" else "HOLD TO SKIP"
	var sw := UITheme.text_w(stext, "label", 14) + 18.0
	var sx := r.end.x - sw - 18.0 - (0.0 if UIInput.device == "touch" else 30.0)
	_skip_r = Rect2(sx - 34.0, yy - 8.0, sw + 70.0, 36.0)
	if UIInput.device != "touch":
		UITheme.glyph(self, Vector2(sx - 16.0, yy + 9.0), "crouch", 22.0, a)
		if sf > 0.0: draw_arc(Vector2(sx - 16.0, yy + 9.0), 15.0, -PI / 2.0, -PI / 2.0 + TAU * sf, 24, Color(UITheme.RED, a), 3.0, true)
	UITheme.chip(self, Vector2(sx, yy - 2.0), stext, UITheme.INK_SOFT, Color.WHITE, 14, 22.0, a * 0.85)
