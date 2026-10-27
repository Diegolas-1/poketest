class_name UITheme
extends RefCounted
# The game's UI design system: tokens (colour, type, spacing, shape, motion)
# and the drawing helpers every screen shares. A fusion of a Pokémon feel
# (Poké Ball red / white / ink, Pokémon yellow, sky blue, round friendly
# icons) and an Overwatch-style HUD (slanted parallelogram plates, accent
# bars, chamfered corners, layered translucent dark plates, big condensed
# italic uppercase type, controller glyphs, snappy eased motion).
# See ui/README.md. Everything here is static: UITheme.RED, UITheme.font("display"),
# UITheme.plate(canvas_item, rect, ...).

# ---------- colour ----------
const RED := Color("ee3b33")         # Poké Ball red: primary accent, "use"
const RED_DEEP := Color("b4211f")
const WHITE := Color("f7f8fb")       # crisp panel white
const PAPER := Color("e7ebf2")       # the panel's lower gradient stop
const INK := Color("141a2e")         # text on light, the ball's black band
const INK_SOFT := Color(0.078, 0.102, 0.18, 0.62)
const PLATE := Color(0.047, 0.063, 0.11, 0.78)     # dark translucent plate
const PLATE_HI := Color(0.11, 0.14, 0.22, 0.86)    # a hovered / raised plate
const PLATE_LINE := Color(1, 1, 1, 0.14)           # thin line on a dark plate
const YELLOW := Color("ffcb05")      # Pokémon yellow: focus, new, highlight
const SKY := Color("3fb6f5")         # info, water
const BLUE := Color("2f6fd6")        # Pokémon logo blue
const GREEN := Color("3fcf72")       # done, good
const ORANGE := Color("ff9a1f")      # warning, fatigue
const PURPLE := Color("9d6cf0")      # rumors, mystery
const TEXT := Color("f4f6fa")        # text on dark
const TEXT_DIM := Color(0.957, 0.965, 0.98, 0.62)
const SHADOW := Color(0.02, 0.03, 0.07, 0.42)
const DIM := Color(0.02, 0.03, 0.08, 0.55)         # the scrim under a modal

# a speaker's or a kind's accent
const KIND := {"start": RED, "complete": GREEN, "step": SKY, "progress": SKY, "item": ORANGE,
	"rumor": PURPLE, "info": SKY, "warn": ORANGE, "update": YELLOW}

# ---------- type (sizes in viewport units: 720 high, 1 unit ~ 0.55 pt on an iPhone) ----------
const SIZE := {"hero": 76, "display": 56, "title": 40, "h2": 30, "h3": 24, "body": 22, "label": 20, "small": 17, "micro": 14}
# roles: display = big italic headings; heading = bold italic; label = upright
# bold condensed (uppercase, tracked); body = semi condensed for sentences;
# number = tabular figures; pixel = Pixelify Sans (Pokémon flavour)
const FONT_FILES := {
	"display": "res://fonts/BarlowCondensed-ExtraBoldItalic.ttf",
	"heading": "res://fonts/BarlowCondensed-BoldItalic.ttf",
	"label": "res://fonts/BarlowCondensed-Bold.ttf",
	"label_semi": "res://fonts/BarlowCondensed-SemiBold.ttf",
	"body": "res://fonts/BarlowSemiCondensed-Medium.ttf",
	"body_bold": "res://fonts/BarlowSemiCondensed-SemiBold.ttf",
	"number": "res://fonts/BarlowCondensed-Bold.ttf",
	"pixel": "res://fonts/PixelifySans.woff2",
}
const TRACKING := {"display": 1, "heading": 1, "label": 1, "label_semi": 1, "number": 0}

# ---------- shape ----------
const SKEW := 0.2           # parallelograms lean right: x offset = height * SKEW (~11 degrees)
const CUT := 14.0           # chamfered corner
const BAR := 6.0            # accent bar thickness
const LINE := 1.5           # thin lines
const GAP := 8.0            # spacing scale: GAP * n
const PAD := 16.0
const RADIUS := 6.0         # the little rounding kept for friendliness (icons, chips)
const TOUCH_PT := 44.0      # minimum touch target, points

# ---------- motion ----------
const FAST := 0.12
const BASE := 0.22
const SLOW := 0.38
const POP := 0.18           # scale pop on press / appear

static func ease_out(t: float) -> float:          # cubic
	t = clampf(t, 0.0, 1.0)
	return 1.0 - pow(1.0 - t, 3.0)

static func ease_out_expo(t: float) -> float:
	t = clampf(t, 0.0, 1.0)
	return 1.0 if t >= 1.0 else 1.0 - pow(2.0, -10.0 * t)

static func ease_back(t: float, s := 1.70158) -> float:   # overshoots then settles
	t = clampf(t, 0.0, 1.0) - 1.0
	return t * t * ((s + 1.0) * t + s) + 1.0

static func ease_in(t: float) -> float:
	t = clampf(t, 0.0, 1.0)
	return t * t * t

# 0 -> 1 -> 0 over an in / hold / out envelope (toasts, banners)
static func envelope(t: float, t_in: float, hold: float, t_out: float) -> float:
	if t < t_in: return clampf(t / t_in, 0.0, 1.0)
	if t < t_in + hold: return 1.0
	return clampf(1.0 - (t - t_in - hold) / t_out, 0.0, 1.0)

# ---------- fonts (cached) ----------
static var _fonts := {}

static func font(role: String) -> Font:
	if _fonts.has(role): return _fonts[role]
	var path: String = FONT_FILES.get(role, FONT_FILES.body)
	var base: Font = load(path) if ResourceLoader.exists(path) else ThemeDB.fallback_font
	var fv := FontVariation.new()
	fv.base_font = base
	if role == "pixel": fv.variation_opentype = {"wght": 700}
	if role == "number": fv.opentype_features = {"tnum": 1}
	fv.spacing_glyph = int(TRACKING.get(role, 0))
	_fonts[role] = fv
	return fv

static func fs(name: String) -> int: return int(SIZE.get(name, 22))

# ---------- device / screen ----------
# the safe area in viewport units (override: a Rect2 to pretend one, for shots)
static func safe_rect(ci: CanvasItem, override := Rect2()) -> Rect2:
	var vs := ci.get_viewport_rect().size if ci != null and ci.is_inside_tree() else Vector2(1280, 720)
	var full := Rect2(Vector2.ZERO, vs)
	if override.size != Vector2.ZERO: return override
	if not OS.has_feature("mobile"): return full
	var sa := DisplayServer.get_display_safe_area()
	var ws := DisplayServer.window_get_size()
	if sa.size.x <= 0 or ws.x <= 0: return full
	var k := vs / Vector2(ws)
	return Rect2(Vector2(sa.position) * k, Vector2(sa.size) * k).intersection(full)

# viewport units per point (1.0 on a desktop window; ~1.83 on an iPhone in landscape)
static func units_per_pt(ci: CanvasItem) -> float:
	if not OS.has_feature("mobile") or ci == null or not ci.is_inside_tree(): return 1.0
	var ws := DisplayServer.window_get_size()
	var sc := DisplayServer.screen_get_scale()
	if ws.y <= 0 or sc <= 0.0: return 1.0
	return ci.get_viewport_rect().size.y / (ws.y / sc)

# the minimum touch target in viewport units (44 pt, never under 56 units)
static func touch_min(ci: CanvasItem) -> float:
	return maxf(56.0, TOUCH_PT * units_per_pt(ci))

# a hit rect grown to the minimum touch target around its centre
static func touch_rect(ci: CanvasItem, r: Rect2) -> Rect2:
	var m := touch_min(ci)
	var s := Vector2(maxf(r.size.x, m), maxf(r.size.y, m))
	return Rect2(r.get_center() - s * 0.5, s)

# ---------- shapes ----------
# a parallelogram over r (its top edge shifted right by r.size.y * skew)
static func para_points(r: Rect2, skew := SKEW) -> PackedVector2Array:
	var o := r.size.y * skew * 0.5
	return PackedVector2Array([Vector2(r.position.x + o, r.position.y), Vector2(r.end.x + o, r.position.y),
		Vector2(r.end.x - o, r.end.y), Vector2(r.position.x - o, r.end.y)])

# a rectangle with its top-right and bottom-left corners cut (cut > 0) and leaning (skew)
static func chamfer_points(r: Rect2, cut := CUT, skew := 0.0, cut_tl := 0.0, cut_br := 0.0) -> PackedVector2Array:
	var o := r.size.y * skew * 0.5
	var x0 := r.position.x
	var x1 := r.end.x
	var y0 := r.position.y
	var y1 := r.end.y
	var pts := PackedVector2Array()
	if cut_tl > 0.0:
		pts.append(Vector2(x0 + o + cut_tl * (1.0 - skew), y0 + 0.0));
	else: pts.append(Vector2(x0 + o, y0))
	if cut > 0.0:
		pts.append(Vector2(x1 + o - cut, y0)); pts.append(Vector2(x1 + o - cut * skew, y0 + cut))
	else: pts.append(Vector2(x1 + o, y0))
	if cut_br > 0.0:
		pts.append(Vector2(x1 - o, y1 - cut_br)); pts.append(Vector2(x1 - o - cut_br, y1))
	else: pts.append(Vector2(x1 - o, y1))
	if cut > 0.0:
		pts.append(Vector2(x0 - o + cut, y1)); pts.append(Vector2(x0 - o + cut * skew, y1 - cut))
	else: pts.append(Vector2(x0 - o, y1))
	if cut_tl > 0.0: pts.append(Vector2(x0 + o - cut_tl * skew, y0 + cut_tl))
	return pts

static func _offset(pts: PackedVector2Array, d: Vector2) -> PackedVector2Array:
	var out := pts.duplicate()
	for i in out.size(): out[i] += d
	return out

static func fill(ci: CanvasItem, pts: PackedVector2Array, col: Color) -> void:
	if col.a <= 0.001: return
	ci.draw_colored_polygon(pts, col)

# a vertical gradient fill (top colour -> bottom colour)
static func fill_v(ci: CanvasItem, pts: PackedVector2Array, top: Color, bottom: Color) -> void:
	if top.a <= 0.001 and bottom.a <= 0.001: return
	var y0 := INF
	var y1 := -INF
	for p in pts:
		y0 = minf(y0, p.y); y1 = maxf(y1, p.y)
	var cols := PackedColorArray()
	cols.resize(pts.size())
	for i in pts.size(): cols[i] = top.lerp(bottom, (pts[i].y - y0) / maxf(1.0, y1 - y0))
	ci.draw_polygon(pts, cols)

static func outline(ci: CanvasItem, pts: PackedVector2Array, col: Color, w := LINE) -> void:
	if col.a <= 0.001: return
	var loop := pts.duplicate()
	loop.append(pts[0])
	ci.draw_polyline(loop, col, w, true)

# the soft shadow under a shape: two offset, fading copies
static func shadow(ci: CanvasItem, pts: PackedVector2Array, a := 1.0, d := Vector2(0, 5)) -> void:
	fill(ci, _offset(pts, d * 1.6), Color(SHADOW, SHADOW.a * 0.35 * a))
	fill(ci, _offset(pts, d), Color(SHADOW, SHADOW.a * 0.6 * a))

# a dark translucent plate (the HUD's base): shadow, body, a thin top highlight
static func plate(ci: CanvasItem, r: Rect2, a := 1.0, skew := SKEW, col := PLATE, cut := 0.0) -> PackedVector2Array:
	var pts := chamfer_points(r, cut, skew) if cut > 0.0 else para_points(r, skew)
	shadow(ci, pts, a * 0.6, Vector2(0, 3))
	fill_v(ci, pts, Color(col.lightened(0.06), col.a * a), Color(col, col.a * a))
	var o := r.size.y * skew * 0.5
	ci.draw_line(Vector2(r.position.x + o + 1, r.position.y + 0.75), Vector2(r.end.x + o - (cut if cut > 0.0 else 0.0) - 1, r.position.y + 0.75), Color(1, 1, 1, 0.22 * a), 1.5)
	return pts

# a crisp light panel: shadow, white-to-paper body, an accent bar down its left
static func panel(ci: CanvasItem, r: Rect2, accent := RED, a := 1.0, skew := 0.0, cut := CUT, bar := BAR) -> PackedVector2Array:
	var pts := chamfer_points(r, cut, skew)
	shadow(ci, pts, a, Vector2(0, 6))
	fill_v(ci, pts, Color(WHITE, a), Color(PAPER, a))
	if bar > 0.0: accent_bar(ci, r, accent, a, skew, bar)
	return pts

# the accent bar on a panel's left edge (leaning with it)
static func accent_bar(ci: CanvasItem, r: Rect2, col: Color, a := 1.0, skew := 0.0, w := BAR) -> void:
	var o := r.size.y * skew * 0.5
	fill(ci, PackedVector2Array([Vector2(r.position.x + o, r.position.y), Vector2(r.position.x + o + w, r.position.y),
		Vector2(r.position.x - o + w, r.end.y), Vector2(r.position.x - o, r.end.y)]), Color(col, col.a * a))

# a parallelogram stripe (a bar, a tab, a selection)
static func para(ci: CanvasItem, r: Rect2, col: Color, skew := SKEW) -> PackedVector2Array:
	var pts := para_points(r, skew)
	fill(ci, pts, col)
	return pts

# ›› chevrons (n of them, pointing right, or left with dir = -1)
static func chevrons(ci: CanvasItem, at: Vector2, h: float, col: Color, n := 2, dir := 1.0, step := 0.0, w := 0.0) -> void:
	if step <= 0.0: step = h * 0.42
	if w <= 0.0: w = h * 0.22
	for i in n:
		var x := at.x + i * step * dir
		var c := Color(col, col.a * (1.0 - i * 0.28))
		var d := h * 0.38 * dir
		ci.draw_colored_polygon(PackedVector2Array([Vector2(x, at.y - h * 0.5), Vector2(x + w * dir, at.y - h * 0.5),
			Vector2(x + w * dir + d, at.y), Vector2(x + w * dir, at.y + h * 0.5), Vector2(x, at.y + h * 0.5), Vector2(x + d, at.y)]), c)

# a single chevron arrow pointing down (prompts, the "more" mark)
static func chevron_down(ci: CanvasItem, c: Vector2, w: float, col: Color, th := 0.0) -> void:
	if th <= 0.0: th = w * 0.32
	ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-w * 0.5, -w * 0.25), c + Vector2(-w * 0.5 + th, -w * 0.25),
		c + Vector2(0, w * 0.25 - th * 0.2), c + Vector2(w * 0.5 - th, -w * 0.25), c + Vector2(w * 0.5, -w * 0.25), c + Vector2(0, w * 0.32 + th * 0.35)]), col)

# a glow: stacked translucent copies of a disc
static func glow(ci: CanvasItem, c: Vector2, r: float, col: Color, a := 1.0) -> void:
	for k in 4:
		var f := 1.0 + k * 0.22
		ci.draw_circle(c, r * f, Color(col, col.a * a * 0.16 / (1.0 + k)), true, -1.0, true)

# ---------- text ----------
static func text_w(s: String, role: String, size: int) -> float:
	return font(role).get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x

# draws s with its baseline at y; align: 0 left of x, 1 centred on x, 2 right of x
static func text(ci: CanvasItem, at: Vector2, s: String, role: String, size: int, col: Color, align := 0, max_w := -1.0, outline_px := 0, outline_col := SHADOW) -> float:
	var f := font(role)
	var w := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, max_w, size).x
	var x := at.x - (w * 0.5 if align == 1 else (w if align == 2 else 0.0))
	if outline_px > 0: ci.draw_string_outline(f, Vector2(x, at.y), s, HORIZONTAL_ALIGNMENT_LEFT, max_w, size, outline_px, outline_col)
	ci.draw_string(f, Vector2(x, at.y), s, HORIZONTAL_ALIGNMENT_LEFT, max_w, size, col)
	return w

# a text centred vertically on y (cap height ~ 0.7 of the size)
static func text_mid(ci: CanvasItem, at: Vector2, s: String, role: String, size: int, col: Color, align := 0, outline_px := 0, outline_col := SHADOW) -> float:
	return text(ci, Vector2(at.x, at.y + size * 0.35), s, role, size, col, align, -1.0, outline_px, outline_col)

static func wrap(s: String, role: String, size: int, w: float) -> PackedStringArray:
	var f := font(role)
	var rows := PackedStringArray()
	var row := ""
	for word in s.split(" "):
		var tt := word if row == "" else row + " " + word
		if f.get_string_size(tt, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x > w and row != "":
			rows.append(row); row = word
		else: row = tt
	if row != "": rows.append(row)
	return rows

# ---------- chips, badges, bars ----------
# a small skewed label chip (e.g. "NEW QUEST"); returns its width
static func chip(ci: CanvasItem, at: Vector2, s: String, col: Color, text_col := Color.WHITE, size := 14, h := 22.0, a := 1.0) -> float:
	var w := text_w(s, "label", size) + 18.0
	para(ci, Rect2(at, Vector2(w, h)), Color(col, col.a * a))
	text_mid(ci, at + Vector2(9.0, h * 0.5), s, "label", size, Color(text_col, text_col.a * a))
	return w

# a skewed segmented bar: f in 0..1; segments 0 = solid
static func bar(ci: CanvasItem, r: Rect2, f: float, col: Color, a := 1.0, segments := 0, back := Color(1, 1, 1, 0.14)) -> void:
	para(ci, r, Color(back, back.a * a))
	f = clampf(f, 0.0, 1.0)
	if segments <= 0:
		if f > 0.0: para(ci, Rect2(r.position, Vector2(r.size.x * f, r.size.y)), Color(col, col.a * a))
		return
	var gap := 3.0
	var sw := (r.size.x - gap * (segments - 1)) / segments
	for i in segments:
		var k := clampf(f * segments - i, 0.0, 1.0)
		if k <= 0.0: break
		para(ci, Rect2(r.position.x + i * (sw + gap), r.position.y, sw * k, r.size.y), Color(col, col.a * a))

# ---------- controller glyphs ----------
# what a game action is called on the current device (UIInput.device)
static func glyph_label(action: String, device := "") -> String:
	if device == "": device = UIInput.device
	if device == "keys":
		return {"use": "E", "back": "ESC", "jump": "SPACE", "menu": "M", "quests": "J", "run": "SHIFT",
			"tab_l": "Q", "tab_r": "E", "recenter": "C", "up": "W", "down": "S"}.get(action, action.to_upper())
	return {"use": "A", "back": "B", "jump": "X", "menu": "+", "quests": "-", "run": "R",
		"tab_l": "L", "tab_r": "R", "recenter": "L", "up": "", "down": ""}.get(action, action.to_upper())

# a button glyph centred on c, h high: a disc for face buttons, a keycap on
# the keyboard, a shoulder pill for L / R. Returns its width.
static func glyph(ci: CanvasItem, c: Vector2, action: String, h := 28.0, a := 1.0, device := "") -> float:
	if device == "": device = UIInput.device
	var s := glyph_label(action, device)
	if device == "keys":
		var size := int(h * 0.5)
		var w := maxf(h, text_w(s, "label", size) + h * 0.55)
		var r := Rect2(c.x - w * 0.5, c.y - h * 0.5, w, h)
		_rounded(ci, Rect2(r.position + Vector2(0, 2.5), r.size), Color(0.55, 0.58, 0.66, a))
		_rounded(ci, r, Color(WHITE, a))
		text_mid(ci, Vector2(c.x, c.y - 0.5), s, "label", size, Color(INK, a), 1)
		return w
	if action in ["tab_l", "tab_r", "run", "recenter"] and device == "pad":
		var w2 := h * 1.5
		var r2 := Rect2(c.x - w2 * 0.5, c.y - h * 0.4, w2, h * 0.8)
		_rounded(ci, r2, Color(WHITE, a), h * 0.3)
		text_mid(ci, c, s, "label", int(h * 0.5), Color(INK, a), 1)
		return w2
	var disc := RED if action == "use" and device == "touch" else WHITE
	var ink := Color.WHITE if disc == RED else INK
	ci.draw_circle(c + Vector2(0, 1.5), h * 0.5, Color(0, 0, 0, 0.3 * a), true, -1.0, true)
	ci.draw_circle(c, h * 0.5, Color(disc, a), true, -1.0, true)
	if s != "": text_mid(ci, Vector2(c.x, c.y - 0.5), s, "label", int(h * 0.62), Color(ink, a), 1)
	return h

static func _rounded(ci: CanvasItem, r: Rect2, col: Color, rad := 5.0) -> void:
	ci.draw_colored_polygon(rounded_points(r, rad), col)

static func rounded_points(r: Rect2, rad: float, steps := 4) -> PackedVector2Array:
	rad = minf(rad, minf(r.size.x, r.size.y) * 0.5)
	var pts := PackedVector2Array()
	var cs := [Vector2(r.end.x - rad, r.position.y + rad), Vector2(r.end.x - rad, r.end.y - rad), Vector2(r.position.x + rad, r.end.y - rad), Vector2(r.position.x + rad, r.position.y + rad)]
	for k in 4:
		for i in steps + 1:
			var ang := -PI / 2.0 + (k + float(i) / steps) * PI / 2.0
			pts.append(cs[k] + Vector2(cos(ang), sin(ang)) * rad)
	return pts

# a prompt chip: [glyph] LABEL on a dark skewed plate, with a pointer under it
# toward p (the thing to use). a = alpha, s = scale (pop in). Returns its rect.
static func prompt(ci: CanvasItem, p: Vector2, label: String, action := "use", a := 1.0, s := 1.0) -> Rect2:
	var size := int(20 * s)
	var h := 40.0 * s
	var tw := text_w(label.to_upper(), "label", size)
	var gw := h * 0.7
	var w := gw + tw + 34.0 * s
	var r := Rect2(p.x - w * 0.5, p.y - h - 14.0 * s, w, h)
	var pts := plate(ci, r, a, SKEW, PLATE)
	outline(ci, pts, Color(1, 1, 1, 0.18 * a), 1.0)
	# the accent foot and the pointer
	para(ci, Rect2(r.position.x, r.end.y - 3.0 * s, r.size.x, 3.0 * s), Color(YELLOW, a))
	ci.draw_colored_polygon(PackedVector2Array([Vector2(p.x - 7 * s, r.end.y), Vector2(p.x + 7 * s, r.end.y), Vector2(p.x, r.end.y + 9 * s)]), Color(YELLOW, a))
	glyph(ci, Vector2(r.position.x + 12.0 * s + gw * 0.5, r.get_center().y - 1.0), action, gw, a)
	text_mid(ci, Vector2(r.position.x + 22.0 * s + gw, r.get_center().y - 1.0), label.to_upper(), "label", size, Color(TEXT, a))
	return r

# ---------- icons (round and friendly) ----------
# draws icon id centred on c, about r in radius, in col
static func icon(ci: CanvasItem, id: String, c: Vector2, r: float, col := Color.WHITE) -> void:
	var k := r / 14.0
	match id:
		"cog":
			for i in 8:
				var t := i * TAU / 8.0
				var d := Vector2(cos(t), sin(t))
				var n := Vector2(-d.y, d.x)
				ci.draw_colored_polygon(PackedVector2Array([c + (d * 8 + n * 4.2) * k, c + (d * 14 + n * 3.0) * k, c + (d * 14 - n * 3.0) * k, c + (d * 8 - n * 4.2) * k]), col)
			ci.draw_circle(c, 10.0 * k, col, true, -1.0, true)
			ci.draw_circle(c, 4.2 * k, Color(INK, col.a), true, -1.0, true)
		"log":
			# a quest scroll: a page with lines and a red bookmark
			var pr := Rect2(c + Vector2(-10, -13) * k, Vector2(20, 26) * k)
			ci.draw_colored_polygon(chamfer_points(pr, 6.0 * k), col)
			for i in 3:
				var y := pr.position.y + (8.0 + i * 5.5) * k
				ci.draw_line(Vector2(pr.position.x + 4.5 * k, y), Vector2(pr.end.x - (4.5 if i < 2 else 9.0) * k, y), Color(INK, col.a * 0.8), 2.0 * k)
			ci.draw_colored_polygon(PackedVector2Array([pr.position + Vector2(3, 0) * k, pr.position + Vector2(8, 0) * k, pr.position + Vector2(8, 6) * k, pr.position + Vector2(5.5, 4.2) * k, pr.position + Vector2(3, 6) * k]), Color(RED, col.a))
		"ball":
			ci.draw_circle(c, 13.0 * k, Color(INK, col.a), true, -1.0, true)
			var g := asin(1.6 / 11.0)
			var top := PackedVector2Array()
			for i in 17: top.append(c + Vector2(cos(PI + g + (PI - 2.0 * g) * i / 16.0), sin(PI + g + (PI - 2.0 * g) * i / 16.0)) * 11.0 * k)
			ci.draw_colored_polygon(top, Color(RED, col.a))
			var bot := PackedVector2Array()
			for i in 17: bot.append(c + Vector2(cos(g + (PI - 2.0 * g) * i / 16.0), sin(g + (PI - 2.0 * g) * i / 16.0)) * 11.0 * k)
			ci.draw_colored_polygon(bot, Color(WHITE, col.a))
			ci.draw_circle(c, 4.6 * k, Color(INK, col.a), true, -1.0, true)
			ci.draw_circle(c, 2.8 * k, Color(WHITE, col.a), true, -1.0, true)
		"close":
			ci.draw_line(c + Vector2(-7, -7) * k, c + Vector2(7, 7) * k, col, 3.2 * k, true)
			ci.draw_line(c + Vector2(7, -7) * k, c + Vector2(-7, 7) * k, col, 3.2 * k, true)
		"bolt":
			ci.draw_colored_polygon(PackedVector2Array([c + Vector2(2.5, -12) * k, c + Vector2(-6, 1.5) * k, c + Vector2(-0.5, 1.5) * k, c + Vector2(-2.5, 12) * k, c + Vector2(6, -2.5) * k, c + Vector2(0.5, -2.5) * k]), col)
		"jump":
			chevron_up(ci, c + Vector2(0, -3) * k, 20.0 * k, col)
			chevron_up(ci, c + Vector2(0, 6) * k, 20.0 * k, Color(col, col.a * 0.55))
		"bell":
			var dome := PackedVector2Array()
			for i in 13:
				var t := PI + PI * i / 12.0
				dome.append(c + Vector2(cos(t) * 10.0, 3.0 + sin(t) * 11.0) * k)
			ci.draw_colored_polygon(dome, col)
			ci.draw_line(c + Vector2(-12, 4) * k, c + Vector2(12, 4) * k, col, 3.0 * k, true)
			ci.draw_circle(c + Vector2(0, -9) * k, 2.4 * k, col, true, -1.0, true)
			ci.draw_line(c + Vector2(6, 8) * k, c + Vector2(11, 12) * k, col, 3.0 * k, true)
		"bang":
			ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-3.2, -12) * k, c + Vector2(3.2, -12) * k, c + Vector2(1.8, 4) * k, c + Vector2(-1.8, 4) * k]), col)
			ci.draw_circle(c + Vector2(0, 9) * k, 2.8 * k, col, true, -1.0, true)
		"check":
			ci.draw_polyline(PackedVector2Array([c + Vector2(-8, 0) * k, c + Vector2(-2.5, 6) * k, c + Vector2(9, -7) * k]), col, 3.4 * k, true)
		"star":
			var st := PackedVector2Array()
			for i in 10:
				var t := -PI / 2.0 + i * PI / 5.0
				st.append(c + Vector2(cos(t), sin(t)) * (12.0 if i % 2 == 0 else 5.2) * k)
			ci.draw_colored_polygon(st, col)
		"bag":
			ci.draw_colored_polygon(rounded_points(Rect2(c + Vector2(-11, -5) * k, Vector2(22, 17) * k), 4.0 * k), col)
			ci.draw_arc(c + Vector2(0, -5) * k, 5.5 * k, PI, TAU, 10, col, 2.8 * k, true)
		"map":
			ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-12, -8) * k, c + Vector2(-4, -11) * k, c + Vector2(4, -8) * k, c + Vector2(12, -11) * k,
				c + Vector2(12, 8) * k, c + Vector2(4, 11) * k, c + Vector2(-4, 8) * k, c + Vector2(-12, 11) * k]), col)
			ci.draw_circle(c + Vector2(3, -1) * k, 3.4 * k, Color(RED, col.a), true, -1.0, true)
		"bike":
			ci.draw_arc(c + Vector2(-7.5, 4) * k, 6.5 * k, 0.0, TAU, 18, col, 2.4 * k, true)
			ci.draw_arc(c + Vector2(7.5, 4) * k, 6.5 * k, 0.0, TAU, 18, col, 2.4 * k, true)
			ci.draw_polyline(PackedVector2Array([c + Vector2(-7.5, 4) * k, c + Vector2(-2, -4) * k, c + Vector2(5.5, -4) * k, c + Vector2(7.5, 4) * k]), col, 2.4 * k, true)
			ci.draw_line(c + Vector2(-2, -4) * k, c + Vector2(0, 4) * k, col, 2.4 * k, true)
			ci.draw_line(c + Vector2(4.5, -8) * k, c + Vector2(8.5, -8) * k, col, 2.4 * k, true)
			ci.draw_line(c + Vector2(-5, -7) * k, c + Vector2(0, -7) * k, col, 2.8 * k, true)
		"clock":
			ci.draw_arc(c, 11.0 * k, 0.0, TAU, 24, col, 2.6 * k, true)
			ci.draw_line(c, c + Vector2(0, -7) * k, col, 2.6 * k, true)
			ci.draw_line(c, c + Vector2(5, 2) * k, col, 2.6 * k, true)
		"update":
			ci.draw_arc(c, 10.0 * k, -PI * 0.15, PI * 1.45, 20, col, 3.0 * k, true)
			var tip := c + Vector2(cos(-PI * 0.15), sin(-PI * 0.15)) * 10.0 * k
			ci.draw_colored_polygon(PackedVector2Array([tip + Vector2(-5, -5) * k, tip + Vector2(5, -2) * k, tip + Vector2(0, 5) * k]), col)
		"warn":
			ci.draw_colored_polygon(PackedVector2Array([c + Vector2(0, -12) * k, c + Vector2(12, 10) * k, c + Vector2(-12, 10) * k]), col)
			ci.draw_line(c + Vector2(0, -4) * k, c + Vector2(0, 3) * k, Color(INK, col.a), 3.0 * k)
			ci.draw_circle(c + Vector2(0, 6.8) * k, 1.7 * k, Color(INK, col.a), true, -1.0, true)
		"chat":
			ci.draw_colored_polygon(rounded_points(Rect2(c + Vector2(-12, -10) * k, Vector2(24, 16) * k), 5.0 * k), col)
			ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-6, 5) * k, c + Vector2(1, 5) * k, c + Vector2(-7, 11) * k]), col)
		"drop":
			drop(ci, c + Vector2(0, 2.5) * k, 7.5 * k, col)
			ci.draw_circle(c + Vector2(-2.6, 4.0) * k, 1.9 * k, Color(1, 1, 1, col.a * 0.55), true, -1.0, true)
		"sweat":
			# a tired face's two shut eyes and a sweat drop
			ci.draw_line(c + Vector2(-9, -1) * k, c + Vector2(-3, 1) * k, col, 2.6 * k, true)
			ci.draw_line(c + Vector2(1, 1) * k, c + Vector2(7, -1) * k, col, 2.6 * k, true)
			ci.draw_arc(c + Vector2(-1, 8) * k, 3.6 * k, PI, TAU, 8, col, 2.6 * k, true)
			drop(ci, c + Vector2(10, -5) * k, 4.2 * k, col)
		"heart":
			ci.draw_circle(c + Vector2(-4.5, -2.5) * k, 5.2 * k, col, true, -1.0, true)
			ci.draw_circle(c + Vector2(4.5, -2.5) * k, 5.2 * k, col, true, -1.0, true)
			ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-9.5, -0.5) * k, c + Vector2(9.5, -0.5) * k, c + Vector2(0, 10) * k]), col)
		"sun":
			ci.draw_circle(c, 6.0 * k, col, true, -1.0, true)
			for i in 8:
				var t2 := i * TAU / 8.0
				ci.draw_line(c + Vector2(cos(t2), sin(t2)) * 9.0 * k, c + Vector2(cos(t2), sin(t2)) * 13.0 * k, col, 2.4 * k, true)
		"snow":
			for i in 3:
				var t3 := i * PI / 3.0
				ci.draw_line(c - Vector2(cos(t3), sin(t3)) * 11.0 * k, c + Vector2(cos(t3), sin(t3)) * 11.0 * k, col, 2.4 * k, true)
		_:
			ci.draw_circle(c, 5.0 * k, col, true, -1.0, true)

# a teardrop: the tip 1.8 r above the middle of its round bottom
static func drop(ci: CanvasItem, c: Vector2, r: float, col: Color) -> void:
	var pts := PackedVector2Array([c + Vector2(0, -r * 1.8)])
	for i in 13:
		var f := deg_to_rad(56.3 + (360.0 - 112.6) * float(i) / 12.0)
		pts.append(c + Vector2(sin(f), -cos(f)) * r)
	ci.draw_colored_polygon(pts, col)

static func chevron_up(ci: CanvasItem, c: Vector2, w: float, col: Color) -> void:
	var th := w * 0.3
	ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-w * 0.5, w * 0.22), c + Vector2(0, -w * 0.28), c + Vector2(w * 0.5, w * 0.22),
		c + Vector2(w * 0.5 - th, w * 0.22), c + Vector2(0, -w * 0.28 + th * 1.05), c + Vector2(-w * 0.5 + th, w * 0.22)]), col)

# a speaker's colour, steady for a name
static func speaker_color(name: String) -> Color:
	var pal := [RED, SKY, YELLOW, GREEN, ORANGE, PURPLE, BLUE]
	if name == "": return RED
	return pal[absi(name.to_upper().hash()) % pal.size()]

# ---------- Godot Theme for Control-based screens (settings, quest log) ----------
static var _theme: Theme

static func sb(col: Color, skew := 0.0, border := 0.0, bcol := Color.TRANSPARENT, margin := Vector4(14, 8, 14, 8)) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = col
	s.skew = Vector2(skew, 0)
	s.anti_aliasing = true
	s.anti_aliasing_size = 0.8
	if border > 0.0:
		s.border_color = bcol
		s.set_border_width_all(int(border))
	s.content_margin_left = margin.x; s.content_margin_top = margin.y
	s.content_margin_right = margin.z; s.content_margin_bottom = margin.w
	return s

# a button's look: variant "primary" (red), "secondary" (dark plate), "light" (on white panels)
static func style_button(b: Button, variant := "secondary", size := 20, skew := SKEW) -> void:
	var base: Color = {"primary": RED, "secondary": PLATE_HI, "light": Color(INK, 0.06), "yellow": YELLOW}.get(variant, PLATE_HI)
	var fg: Color = INK if variant in ["light", "yellow"] else TEXT
	var n := sb(base, skew)
	var h := sb(base.lightened(0.12) if variant != "light" else Color(INK, 0.12), skew)
	var p := sb(base.darkened(0.18) if variant != "light" else Color(INK, 0.2), skew)
	var f := sb(Color(0, 0, 0, 0), skew, 3.0, YELLOW)
	f.draw_center = false
	f.expand_margin_left = 3; f.expand_margin_right = 3; f.expand_margin_top = 3; f.expand_margin_bottom = 3
	var d := sb(Color(base, base.a * 0.4), skew)
	b.add_theme_stylebox_override("normal", n)
	b.add_theme_stylebox_override("hover", h)
	b.add_theme_stylebox_override("pressed", p)
	b.add_theme_stylebox_override("hover_pressed", p)
	b.add_theme_stylebox_override("focus", f)
	b.add_theme_stylebox_override("disabled", d)
	b.add_theme_font_override("font", font("label"))
	b.add_theme_font_size_override("font_size", size)
	for k in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		b.add_theme_color_override(k, fg)
	b.add_theme_color_override("font_disabled_color", Color(fg, 0.4))

static func theme() -> Theme:
	if _theme != null: return _theme
	var t := Theme.new()
	t.default_font = font("body")
	t.default_font_size = fs("body")
	t.set_color("font_color", "Label", TEXT)
	# scroll bars: a thin yellow-white grabber
	var g := sb(Color(1, 1, 1, 0.35), 0.0, 0.0, Color.TRANSPARENT, Vector4(3, 0, 3, 0))
	var gh := sb(Color(YELLOW, 0.9), 0.0, 0.0, Color.TRANSPARENT, Vector4(3, 0, 3, 0))
	var e := StyleBoxEmpty.new()
	e.content_margin_left = 3; e.content_margin_right = 3
	for st in ["grabber"]: t.set_stylebox(st, "VScrollBar", g)
	for st in ["grabber_highlight", "grabber_pressed"]: t.set_stylebox(st, "VScrollBar", gh)
	t.set_stylebox("scroll", "VScrollBar", e)
	t.set_stylebox("scroll_focus", "VScrollBar", e)
	t.set_stylebox("panel", "ScrollContainer", StyleBoxEmpty.new())
	t.set_stylebox("focus", "ScrollContainer", StyleBoxEmpty.new())
	_theme = t
	return t

# the modal scrim under a menu: a full-rect ColorRect with ui/shaders/ui_scrim.gdshader
static var _scrim_mat: ShaderMaterial
static func scrim() -> ColorRect:
	var r := ColorRect.new()
	r.color = Color.WHITE
	r.set_anchors_preset(Control.PRESET_FULL_RECT)
	if _scrim_mat == null:
		_scrim_mat = ShaderMaterial.new()
		_scrim_mat.shader = load("res://ui/shaders/ui_scrim.gdshader")
	r.material = _scrim_mat
	return r

# a Label in a role
static func label(s: String, role := "body", size := 0, col := TEXT, upper := false) -> Label:
	var l := Label.new()
	l.text = s.to_upper() if upper else s
	l.add_theme_font_override("font", font(role))
	l.add_theme_font_size_override("font_size", size if size > 0 else fs("body"))
	l.add_theme_color_override("font_color", col)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l
