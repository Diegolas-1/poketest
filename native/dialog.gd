class_name DialogBox
extends Control
# The text box (web/world/dialog.js + web/hd/textbox.js): a cream panel with
# the classic double border and a Poké Ball on each corner, Pixelify Sans
# typed out at 55 letters a second, a bouncing red arrow when a line is done;
# the "A" prompt over whatever is in reach; and the area banner.
#
#   say(lines, on_done)   next()   open   prompt = {pos, label} or {}   banner(title, sub)
#   voice = "text" | "low" | "mid" | "high" | "kid" | "critter", voice_pitch: the
#   typing blips (sfx ui_blip_<voice>), set by the caller before say()

const INK := Color("23284f")
const RED := Color("e8463c")
const BALL := [
	"....KKKK....",
	"..KKRRRRKK..",
	".KRhhRRRRrK.",
	".KRhRRRRRrK.",
	"KRRRRKKRRRrK",
	"KKKKKWWKKKKK",
	"KKKKKWWKKKKK",
	"KWWWWKKWWWwK",
	".KWWWWWWWwK.",
	".KWWWWWWwwK.",
	"..KKwwwwKK..",
	"....KKKK....",
]
const PAL := {"K": Color("1b1d33"), "R": Color("e8463c"), "r": Color("a32a2c"), "h": Color("ffb1a4"), "W": Color.WHITE, "w": Color("c9cbdc")}

var lines: Array = []
var i := 0
var shown := 0.0
var on_done: Callable
var prompt := {}            # {pos: Vector2, label: String}
var safe_bottom := 10.0
var t := 0.0
var font: FontVariation
var font_bold: FontVariation
var _ban_title := ""
var _ban_sub := ""
var _ban_t := 99.0
var _ball_tex: ImageTexture
var _was_busy := true
var voice := "text"
var voice_pitch := 1.0
var _blip_at := -1           # the last group of three letters that blipped

var open: bool:
	get: return not lines.is_empty()

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ff: FontFile = load("res://fonts/PixelifySans.woff2")
	font = FontVariation.new(); font.base_font = ff; font.variation_opentype = {"wght": 600}
	font_bold = FontVariation.new(); font_bold.base_font = ff; font_bold.variation_opentype = {"wght": 700}
	var img := Image.create(12, 12, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for y in 12:
		for x in 12:
			var ch: String = BALL[y][x]
			if PAL.has(ch): img.set_pixel(x, y, PAL[ch])
	_ball_tex = ImageTexture.create_from_image(img)

func say(l: Array, done: Callable = Callable()) -> void:
	lines = l; i = 0; shown = 0.0; on_done = done; _blip_at = -1
	Sfx.ui("ui_dialog_open")
	queue_redraw()

# A press: finish the line, or go to the next one, or close
func next() -> void:
	if lines.is_empty(): return
	var line: String = lines[i]
	if shown < line.length():
		shown = line.length(); return
	i += 1; shown = 0.0; _blip_at = -1
	Sfx.ui("ui_dialog_advance" if i < lines.size() else "ui_dialog_close")
	if i >= lines.size():
		lines = []
		var f := on_done
		on_done = Callable()
		if f.is_valid(): f.call()

func banner(title: String, sub: String) -> void:
	_ban_title = title; _ban_sub = sub; _ban_t = 0.0
	Sfx.ui("ui_banner")

func _process(dt: float) -> void:
	t += dt
	if size != get_viewport_rect().size: size = get_viewport_rect().size
	var busy := open or not prompt.is_empty() or _ban_t < 4.3 or _was_busy
	_was_busy = open or not prompt.is_empty() or _ban_t < 4.3
	if busy: queue_redraw()
	if open:
		var line: String = lines[i]
		shown = minf(float(line.length()), shown + dt * 55.0)
		# a blip every third letter typed (not on a space), in the speaker's voice
		var k := int(shown) - 1
		if k >= 0 and floori(k / 3.0) != _blip_at and k < line.length() - 1:
			_blip_at = floori(k / 3.0)
			if line[k] != " " and Sfx.I != null and Sfx.I.ui_on: Sfx.play("ui_blip_" + voice, null, {"pitch": voice_pitch})
	_ban_t += dt

func _wrap(text: String, w: float, size: int) -> Array:
	var rows := []
	var row := ""
	for word in text.split(" "):
		var tt := word if row == "" else row + " " + word
		if font.get_string_size(tt, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x > w and row != "":
			rows.append(row); row = word
		else: row = tt
	if row != "": rows.append(row)
	return rows

var _sbs := {}
func _rr(r: Rect2, rad: float, fill: Color, line := 0.0, lc := Color.BLACK) -> void:
	var key := [int(rad), fill, int(round(line)), lc]
	if _sbs.has(key):
		draw_style_box(_sbs[key], r); return
	var sb := StyleBoxFlat.new()
	_sbs[key] = sb
	sb.bg_color = fill
	sb.set_corner_radius_all(int(rad))
	sb.corner_detail = 6
	sb.anti_aliasing = true
	if line > 0.0:
		sb.border_color = lc
		sb.set_border_width_all(maxi(1, int(round(line))))
		sb.draw_center = fill.a > 0.0
	draw_style_box(sb, r)

func _panel(x: float, y: float, w: float, h: float, u: float) -> void:
	var r := 4.0 * u
	# soft drop shadow
	for k in 3:
		var g := (3 - k) * 1.6 * u
		_rr(Rect2(x - g * 0.5, y + 2.5 * u - g * 0.3, w + g, h + g), r + g, Color(0.04, 0.05, 0.16, 0.08))
	# cream body, lighter at the top
	var pts := PackedVector2Array()
	var cols := PackedColorArray()
	var c0 := Color("fffdf6")
	var c1 := Color("f2e9d6")
	for corner in 4:
		var cc: Vector2 = [Vector2(x + w - r, y + r), Vector2(x + w - r, y + h - r), Vector2(x + r, y + h - r), Vector2(x + r, y + r)][corner]
		for k in 7:
			var ang := -PI / 2.0 + (corner + k / 6.0) * PI / 2.0
			var pp := cc + Vector2(cos(ang), sin(ang)) * r
			pts.append(pp); cols.append(c0.lerp(c1, (pp.y - y) / h))
	draw_polygon(pts, cols)
	# double frame
	_rr(Rect2(x + 2 * u, y + 2 * u, w - 4 * u, h - 4 * u), r - u, Color(0, 0, 0, 0), 1.5 * u, INK)
	_rr(Rect2(x + 4.5 * u, y + 4.5 * u, w - 9 * u, h - 9 * u), r - 2 * u, Color(0, 0, 0, 0), maxf(1.0, 0.75 * u), Color(0.137, 0.157, 0.31, 0.55))
	var bu := u * 0.85
	var o := 6.0 * bu
	for c in [Vector2(x + 2 * u, y + 2 * u), Vector2(x + w - 2 * u, y + 2 * u), Vector2(x + 2 * u, y + h - 2 * u), Vector2(x + w - 2 * u, y + h - 2 * u)]:
		draw_texture_rect(_ball_tex, Rect2(c.x - o, c.y - o, 12 * bu, 12 * bu), false)

func _draw() -> void:
	var W := size.x
	var H := size.y
	# the "A" prompt over something nearby
	if not prompt.is_empty() and not open:
		var p: Vector2 = prompt.pos
		var label: String = prompt.label
		var fs := 15
		var tw := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var bw := tw + 44.0
		var bh := 30.0
		var bx := p.x - bw / 2.0
		var by := p.y - bh - 10.0
		_rr(Rect2(bx, by, bw, bh), 10, Color(1, 0.992, 0.965, 0.94), 2.0, INK)
		draw_circle(Vector2(bx + 16, by + bh / 2), 9.0, RED, true, -1.0, true)
		var aw := font_bold.get_string_size("A", HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
		draw_string(font_bold, Vector2(bx + 16 - aw / 2, by + bh / 2 + 4.5), "A", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color.WHITE)
		draw_string(font, Vector2(bx + 32, by + bh / 2 + 5.5), label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, INK)
	# the area banner: fades in, holds, fades out (4.2 s)
	if _ban_t < 4.2:
		var a := minf(1.0, _ban_t / 1.0) * minf(1.0, (4.2 - _ban_t) / 1.0)
		var cx := W / 2.0
		var ty := H * 0.14 + 52
		var sh := Color(0.08, 0.12, 0.16, 0.45 * a)
		var cream := Color(1, 0.992, 0.965, a)
		var tsz := font.get_string_size(_ban_title, HORIZONTAL_ALIGNMENT_LEFT, -1, 52)
		draw_string(font, Vector2(cx - tsz.x / 2 + 1, ty + 2), _ban_title, HORIZONTAL_ALIGNMENT_LEFT, -1, 52, sh)
		draw_string(font, Vector2(cx - tsz.x / 2, ty), _ban_title, HORIZONTAL_ALIGNMENT_LEFT, -1, 52, cream)
		for k in 34:
			var f := float(k) / 33.0
			var e := clampf(minf(f, 1.0 - f) / 0.15, 0.0, 1.0)
			draw_rect(Rect2(cx - 170 + f * 330, ty + 12, 10.5, 6), Color(1, 0.992, 0.965, 0.9 * a * e))
		var ssz := font.get_string_size(_ban_sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 20)
		draw_string(font, Vector2(cx - ssz.x / 2 + 1, ty + 44 + 2), _ban_sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, sh)
		draw_string(font, Vector2(cx - ssz.x / 2, ty + 44), _ban_sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, cream)
	if not open: return
	var line: String = lines[i]
	var u := minf(W * 0.78 / 160.0, H * 0.3 / 48.0)
	var w := 160.0 * u
	var h := 48.0 * u
	var x := (W - w) / 2.0
	var y := H - h - (6.0 + safe_bottom)
	_panel(x, y, w, h, u)
	var fsz := int(round(9.0 * u))
	var rows := _wrap(line.substr(0, int(shown)), w - 22.0 * u, fsz)
	for r in mini(3, rows.size()):
		draw_string(font, Vector2(x + 11.0 * u, y + 17.0 * u + r * 12.0 * u), rows[r], HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, INK)
	if shown >= line.length():
		var bob := roundf(sin(t * 6.0) * 1.2) * u
		var tx := x + w - 16.0 * u
		var ty2 := y + h - 11.0 * u + bob
		var s := 3.0 * u
		draw_colored_polygon(PackedVector2Array([Vector2(tx, ty2), Vector2(tx + 2 * s, ty2), Vector2(tx + s, ty2 + s)]), RED)
