class_name UIWidgets
extends RefCounted
# Small drawn pieces the HUD shares, each as a static draw call (any
# CanvasItem's _draw) so immediate-mode screens and the Control components
# below use the very same look:
#   badge(ci, at, icon, text, accent, f := -1.0, open := false, a := 1.0) -> Rect2
#       a HUD badge: an icon disc on a skewed dark plate, an uppercase name,
#       a thin bar for f (time left, 0..1; -1 none); open = the selected look
#   card(ci, r, title, body_rows, footer, accent, pointer_x := NAN, a := 1.0)
#       a tooltip card: white panel, accent bar, a pointer up at pointer_x
#   card_height(rows) -> float
#   meter(ci, at, w, f, col, icon, label := "", a := 1.0)
#       a segmented skewed meter with an icon disc (the stamina bar)
#   icon_disc(ci, c, r, col, icon, a := 1.0)

static func icon_disc(ci: CanvasItem, c: Vector2, r: float, col: Color, ic: String, a := 1.0, tex: Texture2D = null) -> void:
	ci.draw_circle(c + Vector2(0, 1.5), r + 1.5, Color(0, 0, 0, 0.35 * a), true, -1.0, true)
	ci.draw_circle(c, r, Color(col, a), true, -1.0, true)
	ci.draw_arc(c, r - 1.0, 0.0, TAU, 28, Color(1, 1, 1, 0.55 * a), 1.5, true)
	if tex: ci.draw_texture_rect(tex, Rect2(c - Vector2(r, r) * 0.72, Vector2(r, r) * 1.44), false, Color(1, 1, 1, a))
	elif ic != "": UITheme.icon(ci, ic, c, r * 0.72, Color(1, 1, 1, a))

static func badge_width(text: String) -> float:
	return 58.0 + UITheme.text_w(text.to_upper(), "label", 19)

static func badge(ci: CanvasItem, at: Vector2, ic: String, text: String, accent: Color, f := -1.0, open := false, a := 1.0, tex: Texture2D = null, h := 44.0) -> Rect2:
	var s := text.to_upper()
	var w := badge_width(text)
	var r := Rect2(at, Vector2(w, h))
	var pts := UITheme.plate(ci, r, a, UITheme.SKEW, UITheme.PLATE_HI if open else UITheme.PLATE)
	UITheme.outline(ci, pts, Color(accent, a) if open else Color(1, 1, 1, 0.14 * a), 2.0 if open else 1.0)
	UITheme.accent_bar(ci, r, accent, a, UITheme.SKEW, 4.0)
	icon_disc(ci, at + Vector2(25.0, h * 0.5), 14.0, accent, ic, a, tex)
	var ty := h * 0.5 - (3.0 if f >= 0.0 else 0.0)
	UITheme.text_mid(ci, at + Vector2(46.0, ty), s, "label", 19, Color(UITheme.TEXT, a))
	if f >= 0.0:
		var bw := UITheme.text_w(s, "label", 19)
		UITheme.bar(ci, Rect2(at.x + 46.0, at.y + h - 11.0, bw, 4.0), f, accent, a, 0, Color(1, 1, 1, 0.16))
	return r

static func card_height(rows: int, footer := true) -> float:
	return 62.0 + rows * 23.0 + (24.0 if footer else 0.0)

static func card(ci: CanvasItem, r: Rect2, title: String, rows: PackedStringArray, footer: String, accent: Color, pointer_x := NAN, a := 1.0) -> void:
	UITheme.panel(ci, r, accent, a, 0.0, UITheme.CUT, UITheme.BAR)
	if not is_nan(pointer_x):
		var py := r.position.y
		ci.draw_colored_polygon(PackedVector2Array([Vector2(pointer_x - 9, py + 1), Vector2(pointer_x + 9, py + 1), Vector2(pointer_x, py - 9)]), Color(UITheme.WHITE, a))
	UITheme.text(ci, r.position + Vector2(22, 34), title.to_upper(), "heading", 26, Color(accent.darkened(0.25), a))
	for i in rows.size():
		UITheme.text(ci, r.position + Vector2(22, 62 + i * 23), rows[i], "body", 19, Color(UITheme.INK, a))
	if footer != "":
		var fy := r.end.y - 16.0
		UITheme.icon(ci, "clock", Vector2(r.position.x + 30.0, fy - 6.0), 7.5, Color(UITheme.INK_SOFT, a))
		UITheme.text(ci, Vector2(r.position.x + 44.0, fy), footer.to_upper(), "label", 15, Color(UITheme.INK_SOFT, a))

# a speech bubble over someone's head: tip = the point under it (their head on
# screen); rows already wrapped (UITheme.wrap with "body_bold"); near = full
# white, else a fainter one; screen_w keeps it on screen. Returns its rect.
static func bubble(ci: CanvasItem, tip: Vector2, rows: PackedStringArray, fsz: int, near: bool, screen_w: float, a := 1.0) -> Rect2:
	var tw := 0.0
	for r in rows: tw = maxf(tw, UITheme.text_w(r, "body_bold", fsz))
	var lh := fsz + 4.0
	var bw := tw + 26.0
	var bh := rows.size() * lh + 14.0
	var bx := clampf(tip.x - bw * 0.5, 4.0, screen_w - bw - 4.0)
	var by := tip.y - bh - 14.0
	var r := Rect2(bx, by, bw, bh)
	var fa := (0.97 if near else 0.72) * a
	var pts := UITheme.rounded_points(r, 9.0, 3)
	UITheme.fill(ci, UITheme._offset(pts, Vector2(0, 3)), Color(0, 0, 0, 0.22 * a))
	var tx := clampf(tip.x, bx + 14.0, bx + bw - 14.0)
	var tail := PackedVector2Array([Vector2(tx - 8, r.end.y - 1), Vector2(tx + 6, r.end.y - 1), Vector2(tx - 3, r.end.y + 11)])
	UITheme.fill(ci, pts, Color(UITheme.WHITE, fa))
	UITheme.fill(ci, tail, Color(UITheme.WHITE, fa))
	UITheme.outline(ci, pts, Color(UITheme.INK, (0.85 if near else 0.4) * a), 2.0 if near else 1.25)
	ci.draw_line(Vector2(tx - 8, r.end.y), Vector2(tx - 3, r.end.y + 11), Color(UITheme.INK, (0.85 if near else 0.4) * a), 2.0 if near else 1.25, true)
	ci.draw_line(Vector2(tx + 6, r.end.y), Vector2(tx - 3, r.end.y + 11), Color(UITheme.INK, (0.85 if near else 0.4) * a), 2.0 if near else 1.25, true)
	ci.draw_line(Vector2(tx - 6, r.end.y - 0.5), Vector2(tx + 4, r.end.y - 0.5), Color(UITheme.WHITE, fa), 3.0)
	# a little red tick at the top left: the Poké Ball accent
	UITheme.para(ci, Rect2(bx + 10.0, by - 2.0, 22.0, 4.0), Color(UITheme.RED, a * (1.0 if near else 0.6)))
	for k in rows.size():
		UITheme.text(ci, Vector2(bx + 13.0, by + 7.0 + fsz * 0.92 + k * lh), rows[k], "body_bold", fsz, Color(UITheme.INK, a))
	return r

# the "!" over someone with something to ask: a yellow skewed plate, ink "!", a glow;
# s = its height; bob in pixels
static func quest_mark(ci: CanvasItem, at: Vector2, s: float, bob := 0.0, a := 1.0) -> void:
	var c := at + Vector2(0, -s * 0.5 + bob)
	UITheme.glow(ci, c, s * 0.55, UITheme.YELLOW, a)
	var r := Rect2(c - Vector2(s * 0.34, s * 0.5), Vector2(s * 0.68, s))
	var pts := UITheme.para_points(r, 0.25)
	UITheme.fill(ci, UITheme._offset(pts, Vector2(0, 3)), Color(0, 0, 0, 0.3 * a))
	UITheme.fill(ci, pts, Color(UITheme.YELLOW, a))
	UITheme.outline(ci, pts, Color(UITheme.INK, a), 2.0)
	UITheme.icon(ci, "bang", c, s * 0.36, Color(UITheme.INK, a))

static func meter(ci: CanvasItem, at: Vector2, w: float, f: float, col: Color, ic: String, label := "", a := 1.0, mark := -1.0) -> Rect2:
	var h := 14.0
	var c := at + Vector2(14.0, h * 0.5)
	icon_disc(ci, c, 14.0, col, ic, a)
	var r := Rect2(at + Vector2(36.0, 0.0), Vector2(w, h))
	UITheme.para(ci, r.grow(3.0), Color(UITheme.PLATE, UITheme.PLATE.a * a))
	UITheme.bar(ci, r, f, col, a, 10, Color(1, 1, 1, 0.12))
	if mark >= 0.0:
		var mx := r.position.x + r.size.x * mark
		ci.draw_line(Vector2(mx + 2.0, r.position.y - 4.0), Vector2(mx - 2.0, r.end.y + 4.0), Color(UITheme.WHITE, 0.85 * a), 2.0)
	if label != "":
		UITheme.text_mid(ci, Vector2(r.end.x + 14.0, r.get_center().y), label.to_upper(), "label", 18, Color(UITheme.TEXT, a), 0, 5, Color(0, 0, 0, 0.5 * a))
	return r
