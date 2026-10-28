class_name EnergyIcon
extends Control
# The energy-type symbols (the energy system: battle/energy.gd), in the spirit
# of the Trading Card Game's energy cards: a flat coloured disc with a white
# glyph, all vector (drawn here with draw_*, so crisp at any size). Original
# drawings, not card art: the Grass leaf, the Fire flame, the Water drop, the
# Lightning bolt, the Psychic eye, the Fighting fist, the Colorless star, the
# Darkness crescent, the Metal nut, the Dragon fangs, the Fairy butterfly, the
# Ice flake, Poison bubbles, Ground peaks, the Flying wing, the Bug beetle,
# the Rock boulder, the Ghost.
#
#   EnergyIcon.draw_icon(ci, "fire", centre, radius, alpha)   # in any _draw
#   EnergyIcon.color(kind) / EnergyIcon.KINDS
#   var i := EnergyIcon.new(); i.kind = "water"               # a Control (sized; the disc fills it)
#
# opts (a Dictionary, optional): dim (0..1: greys it toward a spent look),
# flat (true: no rim, no shadow), glyph_only (just the white glyph, in col).

const KINDS := ["colorless", "grass", "fire", "water", "electric", "psychic", "fighting", "dark", "steel",
	"dragon", "fairy", "ice", "poison", "ground", "flying", "bug", "rock", "ghost"]

const COLORS := {
	"colorless": Color("a3a8b3"), "grass": Color("39a84b"), "fire": Color("e5432c"), "water": Color("2b84de"),
	"electric": Color("f2b91a"), "psychic": Color("8a4cc9"), "fighting": Color("b5622c"), "dark": Color("36323f"),
	"steel": Color("7d8c9e"), "dragon": Color("c2920f"), "fairy": Color("e37cbd"), "ice": Color("4fc3da"),
	"poison": Color("ad3c9c"), "ground": Color("d4aa62"), "flying": Color("7b9fe6"), "bug": Color("8bb128"),
	"rock": Color("8d785a"), "ghost": Color("564a99"),
}

@export var kind := "colorless":
	set(v): kind = v; queue_redraw()
@export var dim := 0.0:
	set(v): dim = v; queue_redraw()

func _draw() -> void:
	var r := minf(size.x, size.y) * 0.5
	draw_icon(self, kind, size * 0.5, r * 0.94, 1.0, {"dim": dim})

static func color(k: String) -> Color:
	return COLORS.get(k, COLORS.colorless)

# ---------- drawing ----------
static func draw_icon(ci: CanvasItem, k: String, c: Vector2, r: float, a := 1.0, opts := {}) -> void:
	var base := color(k)
	var d := float(opts.get("dim", 0.0))
	if d > 0.0:
		var grey := base.get_luminance()
		base = base.lerp(Color(grey, grey, grey).darkened(0.35), d)
	var glyph := Color(1, 1, 1, a * (1.0 - d * 0.45))
	if opts.get("glyph_only", false):
		_glyph(ci, k, c, r * 0.62, opts.get("col", glyph), base)
		return
	if not opts.get("flat", false):
		ci.draw_circle(c + Vector2(0, r * 0.07), r * 1.02, Color(0, 0, 0, 0.3 * a), true, -1.0, true)
	# the disc: a darker rim, the face, a faint inner ring
	ci.draw_circle(c, r, Color(base.darkened(0.22), a), true, -1.0, true)
	ci.draw_circle(c, r * 0.9, Color(base, a), true, -1.0, true)
	if not opts.get("flat", false):
		# a soft lift on the top half: a lighter crescent
		ci.draw_arc(c, r * 0.8, PI * 1.12, PI * 1.88, 18, Color(1, 1, 1, 0.16 * a), r * 0.12, true)
		ci.draw_arc(c, r * 0.9, 0.0, TAU, 40, Color(1, 1, 1, 0.22 * a), maxf(1.0, r * 0.045), true)
	var face := Color(base, a)
	# a soft drop under the glyph, then the glyph
	if r >= 9.0: _glyph(ci, k, c + Vector2(0, r * 0.045), r * 0.62, Color(base.darkened(0.45), 0.35 * a), face)
	_glyph(ci, k, c, r * 0.62, glyph, face)

# a filled polygon with an anti-aliased edge (draw_colored_polygon has none)
static func _poly(ci: CanvasItem, pts: PackedVector2Array, col: Color) -> void:
	if pts.size() < 3 or col.a <= 0.001: return
	ci.draw_colored_polygon(pts, col)
	var loop := pts.duplicate()
	loop.append(pts[0])
	ci.draw_polyline(loop, col, 1.0, true)

static func _bez(out: PackedVector2Array, p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, n := 10, skip_first := true) -> void:
	for i in range(1 if skip_first else 0, n + 1):
		var t := float(i) / n
		var u := 1.0 - t
		out.append(p0 * u * u * u + p1 * 3.0 * u * u * t + p2 * 3.0 * u * t * t + p3 * t * t * t)

static func _ellipse(c: Vector2, rx: float, ry: float, rot := 0.0, n := 28) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var cs := cos(rot)
	var sn := sin(rot)
	for i in n:
		var t := TAU * i / n
		var v := Vector2(cos(t) * rx, sin(t) * ry)
		pts.append(c + Vector2(v.x * cs - v.y * sn, v.x * sn + v.y * cs))
	return pts

# the glyph in a box of half-size g around c: col its colour, face the disc's
# (for the cuts that read as lines through the glyph)
static func _glyph(ci: CanvasItem, k: String, c: Vector2, g: float, col: Color, face: Color) -> void:
	var P := func(x: float, y: float) -> Vector2: return c + Vector2(x, y) * g
	var w := func(x: float) -> float: return maxf(1.0, x * g)
	match k:
		"colorless":
			var st := PackedVector2Array()
			for i in 10:
				var t := -PI / 2.0 + i * PI / 5.0
				st.append(c + Vector2(cos(t), sin(t)) * (0.98 if i % 2 == 0 else 0.42) * g + Vector2(0, 0.06 * g))
			_poly(ci, st, col)
		"grass":
			var leaf := PackedVector2Array([P.call(-0.58, 0.62)])
			_bez(leaf, P.call(-0.58, 0.62), P.call(-0.95, -0.15), P.call(-0.1, -0.9), P.call(0.72, -0.78), 12)
			_bez(leaf, P.call(0.72, -0.78), P.call(0.78, 0.05), P.call(0.2, 0.78), P.call(-0.58, 0.62), 12)
			_poly(ci, leaf, col)
			# the stem, the midrib and the veins
			ci.draw_line(P.call(-0.52, 0.56), P.call(-0.86, 0.92), col, w.call(0.13), true)
			var mb: Vector2 = P.call(-0.42, 0.45)
			var mt: Vector2 = P.call(0.56, -0.62)
			ci.draw_line(mb, mt, face, w.call(0.1), true)
			var md := (mt - mb).normalized()
			var mn := Vector2(-md.y, md.x)
			for f in [0.3, 0.52, 0.74]:
				var mp := mb.lerp(mt, float(f))
				var ln: float = (0.34 - float(f) * 0.18) * g
				ci.draw_line(mp, mp + (md * 0.75 + mn).normalized() * ln, face, w.call(0.07), true)
				ci.draw_line(mp, mp + (md * 0.75 - mn).normalized() * ln, face, w.call(0.07), true)
		"fire":
			var f := PackedVector2Array([P.call(0.0, 0.9)])
			_bez(f, P.call(0.0, 0.9), P.call(0.44, 0.9), P.call(0.72, 0.56), P.call(0.66, 0.16))
			_bez(f, P.call(0.66, 0.16), P.call(0.62, -0.1), P.call(0.58, -0.28), P.call(0.54, -0.46))
			_bez(f, P.call(0.54, -0.46), P.call(0.42, -0.3), P.call(0.34, -0.2), P.call(0.26, -0.12))
			_bez(f, P.call(0.26, -0.12), P.call(0.32, -0.45), P.call(0.22, -0.78), P.call(0.0, -0.98))
			_bez(f, P.call(0.0, -0.98), P.call(-0.06, -0.66), P.call(-0.22, -0.48), P.call(-0.22, -0.3))
			_bez(f, P.call(-0.22, -0.3), P.call(-0.32, -0.38), P.call(-0.44, -0.48), P.call(-0.5, -0.6))
			_bez(f, P.call(-0.5, -0.6), P.call(-0.7, -0.3), P.call(-0.74, 0.0), P.call(-0.66, 0.24))
			_bez(f, P.call(-0.66, 0.24), P.call(-0.6, 0.62), P.call(-0.38, 0.9), P.call(0.0, 0.9))
			_poly(ci, f, col)
			# the hot heart: a small flame cut out of the bottom
			var h := PackedVector2Array([P.call(0.0, 0.72)])
			_bez(h, P.call(0.0, 0.72), P.call(0.3, 0.72), P.call(0.38, 0.42), P.call(0.24, 0.2))
			_bez(h, P.call(0.24, 0.2), P.call(0.14, 0.06), P.call(0.06, -0.06), P.call(0.04, -0.2))
			_bez(h, P.call(0.04, -0.2), P.call(-0.12, -0.02), P.call(-0.32, 0.2), P.call(-0.3, 0.42))
			_bez(h, P.call(-0.3, 0.42), P.call(-0.28, 0.64), P.call(-0.14, 0.72), P.call(0.0, 0.72))
			_poly(ci, h, face)
		"water":
			var dc: Vector2 = P.call(0.0, 0.26)
			var rr := 0.62 * g
			var dp := PackedVector2Array([dc + Vector2(0, -rr * 1.85)])
			for i in 25:
				var t := deg_to_rad(33.0 + (360.0 - 66.0) * float(i) / 24.0)
				dp.append(dc + Vector2(sin(t), -cos(t)) * rr)
			_poly(ci, dp, col)
			ci.draw_arc(dc, rr * 0.62, PI * 0.58, PI * 0.95, 10, face, w.call(0.1), true)
		"electric":
			_poly(ci, PackedVector2Array([P.call(0.26, -0.98), P.call(-0.5, 0.12), P.call(-0.06, 0.12), P.call(-0.3, 0.98),
				P.call(0.52, -0.2), P.call(0.06, -0.2), P.call(0.34, -0.98)]), col)
		"psychic":
			var eye := PackedVector2Array([P.call(-0.95, 0.0)])
			_bez(eye, P.call(-0.95, 0.0), P.call(-0.5, -0.7), P.call(0.5, -0.7), P.call(0.95, 0.0), 14)
			_bez(eye, P.call(0.95, 0.0), P.call(0.5, 0.7), P.call(-0.5, 0.7), P.call(-0.95, 0.0), 14)
			_poly(ci, eye, col)
			ci.draw_circle(c, 0.36 * g, face, true, -1.0, true)
			ci.draw_circle(c, 0.16 * g, col, true, -1.0, true)
			ci.draw_circle(P.call(0.16, -0.16), 0.08 * g, col, true, -1.0, true)
		"fighting":
			# a clenched fist, knuckles up: four fingers, the palm, the thumb across
			for i in 4:
				var x0 := -0.66 + i * 0.33
				var fr := Rect2(P.call(x0 + 0.015, -0.66 + (0.06 if i == 0 or i == 3 else 0.0)), Vector2(0.3, 0.8) * g)
				_poly(ci, UITheme.rounded_points(fr, 0.142 * g, 5), col)
			_poly(ci, UITheme.rounded_points(Rect2(P.call(-0.66, -0.12), Vector2(1.32, 0.86) * g), 0.24 * g, 5), col)
			for i in 3:
				var x := -0.33 + i * 0.33
				ci.draw_line(P.call(x, -0.5), P.call(x, -0.12), face, w.call(0.07), true)
			var th := Rect2(P.call(-0.8, -0.06), Vector2(1.08, 0.34) * g)
			_poly(ci, UITheme.rounded_points(th.grow(0.07 * g), 0.22 * g, 5), face)
			_poly(ci, UITheme.rounded_points(th, 0.16 * g, 5), col)
			ci.draw_line(P.call(-0.5, 0.56), P.call(0.5, 0.56), face, w.call(0.07), true)
		"dark":
			ci.draw_circle(P.call(-0.06, 0.04), 0.84 * g, col, true, -1.0, true)
			ci.draw_circle(P.call(0.3, -0.24), 0.7 * g, face, true, -1.0, true)
			# a sharp little star in the hollow
			var s4 := PackedVector2Array()
			for i in 8:
				var t := -PI / 2.0 + i * PI / 4.0
				s4.append(P.call(0.42, -0.06) + Vector2(cos(t), sin(t)) * (0.32 if i % 2 == 0 else 0.08) * g)
			_poly(ci, s4, col)
		"steel":
			var hx := PackedVector2Array()
			for i in 6:
				var t := i * TAU / 6.0
				hx.append(c + Vector2(cos(t), sin(t)) * 0.92 * g)
			_poly(ci, hx, col)
			ci.draw_circle(c, 0.38 * g, face, true, -1.0, true)
			var hx2 := PackedVector2Array()
			for i in 6:
				hx2.append(c + Vector2(cos(i * TAU / 6.0), sin(i * TAU / 6.0)) * 0.74 * g)
			hx2.append(hx2[0])
			ci.draw_polyline(hx2, face, w.call(0.06), true)
		"dragon":
			# a dragon's head in profile, facing left: a swept-back horn, a slit eye
			var dh := PackedVector2Array([P.call(-0.96, -0.02)])
			_bez(dh, P.call(-0.96, -0.02), P.call(-0.7, -0.2), P.call(-0.42, -0.22), P.call(-0.16, -0.36), 6)
			_bez(dh, P.call(-0.16, -0.36), P.call(0.1, -0.62), P.call(0.42, -0.9), P.call(0.86, -0.98), 10)
			_bez(dh, P.call(0.86, -0.98), P.call(0.56, -0.74), P.call(0.42, -0.5), P.call(0.4, -0.34), 8)
			_bez(dh, P.call(0.4, -0.34), P.call(0.62, -0.26), P.call(0.74, -0.08), P.call(0.72, 0.16), 6)
			_bez(dh, P.call(0.72, 0.16), P.call(0.8, 0.44), P.call(0.86, 0.7), P.call(0.8, 0.94), 6)
			dh.append(P.call(0.18, 0.94))
			_bez(dh, P.call(0.18, 0.94), P.call(0.2, 0.66), P.call(0.12, 0.5), P.call(-0.06, 0.4), 6)
			_bez(dh, P.call(-0.06, 0.4), P.call(-0.3, 0.34), P.call(-0.5, 0.36), P.call(-0.7, 0.3), 6)
			dh.append(P.call(-0.5, 0.17))
			dh.append(P.call(-0.86, 0.17))
			_poly(ci, dh, col)
			_poly(ci, PackedVector2Array([P.call(-0.36, -0.06), P.call(-0.12, -0.17), P.call(-0.02, -0.08), P.call(-0.24, 0.0)]), face)
			ci.draw_circle(P.call(-0.8, -0.04), 0.045 * g, face, true, -1.0, true)
			ci.draw_line(P.call(0.06, 0.1), P.call(0.4, 0.02), face, w.call(0.06), true)
			ci.draw_line(P.call(0.18, 0.3), P.call(0.48, 0.24), face, w.call(0.06), true)
		"fairy":
			for sx in [-1.0, 1.0]:
				_poly(ci, _ellipse(P.call(0.44 * sx, -0.26), 0.42 * g, 0.5 * g, 0.55 * sx), col)
				_poly(ci, _ellipse(P.call(0.32 * sx, 0.44), 0.27 * g, 0.34 * g, -0.45 * sx), col)
				ci.draw_line(P.call(0.03 * sx, -0.56), P.call(0.26 * sx, -0.94), col, w.call(0.07), true)
				ci.draw_circle(P.call(0.27 * sx, -0.95), 0.07 * g, col, true, -1.0, true)
			ci.draw_line(P.call(0.0, -0.66), P.call(0.0, 0.8), face, w.call(0.22), true)
			_poly(ci, _ellipse(P.call(0.0, 0.06), 0.065 * g, 0.62 * g), col)
		"ice":
			for i in 6:
				var t := -PI / 2.0 + i * TAU / 6.0
				var d := Vector2(cos(t), sin(t))
				var nn := Vector2(-d.y, d.x)
				ci.draw_line(c, c + d * 0.94 * g, col, w.call(0.14), true)
				var b := c + d * 0.56 * g
				ci.draw_line(b, b + (d * 0.7 + nn * 0.7).normalized() * 0.3 * g, col, w.call(0.11), true)
				ci.draw_line(b, b + (d * 0.7 - nn * 0.7).normalized() * 0.3 * g, col, w.call(0.11), true)
			ci.draw_circle(c, 0.16 * g, col, true, -1.0, true)
		"poison":
			ci.draw_circle(P.call(-0.12, 0.3), 0.56 * g, col, true, -1.0, true)
			ci.draw_circle(P.call(0.44, -0.4), 0.27 * g, col, true, -1.0, true)
			ci.draw_circle(P.call(-0.2, -0.66), 0.16 * g, col, true, -1.0, true)
			ci.draw_arc(P.call(-0.12, 0.3), 0.36 * g, PI * 1.05, PI * 1.42, 8, face, w.call(0.1), true)
			ci.draw_circle(P.call(0.36, -0.48), 0.07 * g, face, true, -1.0, true)
		"ground":
			_poly(ci, PackedVector2Array([P.call(-0.96, 0.5), P.call(-0.22, -0.72), P.call(0.42, 0.5)]), col)
			_poly(ci, PackedVector2Array([P.call(0.02, 0.5), P.call(0.52, -0.24), P.call(0.96, 0.5)]), col)
			ci.draw_polyline(PackedVector2Array([P.call(-0.52, -0.2), P.call(-0.38, -0.06), P.call(-0.24, -0.22), P.call(-0.1, -0.06), P.call(0.04, -0.22)]), face, w.call(0.08), true)
			_poly(ci, PackedVector2Array([P.call(-0.96, 0.62), P.call(0.96, 0.62), P.call(0.9, 0.8), P.call(-0.9, 0.8)]), col)
		"flying":
			# a wing: the leading edge sweeping up to the tip, four rounded
			# feathers along the trailing edge, a line of coverts across
			var sh: Vector2 = P.call(-0.9, 0.45)
			var tp: Vector2 = P.call(0.98, -0.74)
			var wg := PackedVector2Array([sh])
			_bez(wg, sh, P.call(-0.72, -0.3), P.call(0.1, -0.78), tp, 14)
			var prev := tp
			for lobe in [[0.8, -0.26, 0.36, -0.3], [0.6, 0.14, 0.12, 0.04], [0.32, 0.5, -0.16, 0.34], [0.0, 0.8, -0.5, 0.6]]:
				var F: Vector2 = P.call(lobe[0], lobe[1])
				var N: Vector2 = P.call(lobe[2], lobe[3])
				var Fp := (F - (prev + N) / 8.0) * 4.0 / 3.0
				var dd := prev - N
				_bez(wg, prev, Fp + dd * 0.22, Fp - dd * 0.22, N, 8)
				prev = N
			_bez(wg, prev, P.call(-0.66, 0.7), P.call(-0.92, 0.66), sh, 5)
			wg.remove_at(wg.size() - 1)
			_poly(ci, wg, col)
			ci.draw_polyline(PackedVector2Array([P.call(-0.56, 0.3), P.call(-0.24, 0.02), P.call(0.14, -0.2), P.call(0.5, -0.36)]), face, w.call(0.07), true)
		"bug":
			_poly(ci, _ellipse(P.call(0.0, 0.2), 0.5 * g, 0.64 * g), col)
			ci.draw_circle(P.call(0.0, -0.56), 0.26 * g, col, true, -1.0, true)
			ci.draw_line(P.call(0.0, -0.32), P.call(0.0, 0.86), face, w.call(0.08), true)
			ci.draw_line(P.call(-0.5, -0.24), P.call(0.5, -0.24), face, w.call(0.07), true)
			for sx in [-1.0, 1.0]:
				ci.draw_polyline(PackedVector2Array([P.call(0.1 * sx, -0.76), P.call(0.26 * sx, -0.96), P.call(0.42 * sx, -0.94)]), col, w.call(0.07), true)
				for i in 3:
					var y := -0.02 + i * 0.32
					ci.draw_line(P.call(0.46 * sx, y), P.call(0.78 * sx, y + 0.1 * (i - 1)), col, w.call(0.09), true)
		"rock":
			var rk := PackedVector2Array([P.call(-0.84, 0.44), P.call(-0.66, -0.32), P.call(-0.14, -0.78), P.call(0.48, -0.62),
				P.call(0.88, -0.06), P.call(0.72, 0.6), P.call(-0.18, 0.78)])
			_poly(ci, rk, col)
			ci.draw_polyline(PackedVector2Array([P.call(-0.14, -0.78), P.call(0.02, -0.1), P.call(0.88, -0.06)]), face, w.call(0.08), true)
			ci.draw_polyline(PackedVector2Array([P.call(-0.66, -0.32), P.call(0.02, -0.1), P.call(-0.18, 0.78)]), face, w.call(0.08), true)
		"ghost":
			var gh := PackedVector2Array()
			for i in 15:
				var t := PI + PI * i / 14.0
				gh.append(P.call(0.0, -0.18) + Vector2(cos(t), sin(t)) * 0.66 * g)
			gh.append(P.call(0.66, 0.62))
			for p in [[0.44, 0.88], [0.22, 0.6], [0.0, 0.88], [-0.22, 0.6], [-0.44, 0.88], [-0.66, 0.62]]:
				gh.append(P.call(p[0], p[1]))
			_poly(ci, gh, col)
			for sx in [-1.0, 1.0]:
				_poly(ci, _ellipse(P.call(0.24 * sx, -0.2), 0.12 * g, 0.19 * g, 0.0, 16), face)
			_poly(ci, _ellipse(P.call(0.0, 0.2), 0.1 * g, 0.08 * g, 0.0, 12), face)
		_:
			ci.draw_circle(c, 0.4 * g, col, true, -1.0, true)
