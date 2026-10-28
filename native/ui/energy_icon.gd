class_name EnergyIcon
extends Control
# The energy-type symbols (the energy system: battle/energy.gd), flat, in the
# spirit of the Trading Card Game's energy cards: a coloured disc with a white
# glyph. Original drawings, not card art, kept as clean inline SVG (GLYPHS,
# in a [-1, 1] glyph box) and rasterised with Image.load_svg_from_string, cached
# per kind, variant and pixel size, so they're crisp at any size: the Grass leaf,
# the Fire flame, the Water drop, the Lightning bolt, the Psychic eye, the
# Fighting fist, the Colorless star, the Darkness crescent, the Metal nut, the
# Dragon head, the Fairy butterfly, the Ice flake, Poison bubbles, Ground peaks,
# the Flying wing, the Bug beetle, the Rock boulder, the Ghost; plus "any" (a
# Locked In wild chip, a sparkle) and "hidden" (a face-down chip: a set trap).
#
#   EnergyIcon.draw_icon(ci, "fire", centre, radius, alpha)   # in any _draw
#   EnergyIcon.color(kind) / EnergyIcon.KINDS
#   EnergyIcon.texture(kind, px, variant)                     # the cached texture
#   var i := EnergyIcon.new(); i.kind = "water"               # a Control (sized; the disc fills it)
#
# opts (a Dictionary, optional): dim (0..1: greys it toward a spent look),
# flat (true: no rim, no shadow), glyph_only (just the glyph, tinted col).

const KINDS := ["colorless", "grass", "fire", "water", "electric", "psychic", "fighting", "dark", "steel",
	"dragon", "fairy", "ice", "poison", "ground", "flying", "bug", "rock", "ghost"]

const COLORS := {
	"colorless": Color("a3a8b3"), "grass": Color("39a84b"), "fire": Color("e5432c"), "water": Color("2b84de"),
	"electric": Color("f2b91a"), "psychic": Color("8a4cc9"), "fighting": Color("b5622c"), "dark": Color("36323f"),
	"steel": Color("7d8c9e"), "dragon": Color("c2920f"), "fairy": Color("e37cbd"), "ice": Color("4fc3da"),
	"poison": Color("ad3c9c"), "ground": Color("d4aa62"), "flying": Color("7b9fe6"), "bug": Color("8bb128"),
	"rock": Color("8d785a"), "ghost": Color("564a99"), "any": Color("e9b93a"), "hidden": Color("27324f"),
}

# the disc's radius in the 100-unit SVG box (the rest is the drop shadow); the glyph box is DISC * GLYPH_K
const DISC := 45.0
const GLYPH_K := 0.62
const SIZES := [12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384]

const GLYPHS := {
	"colorless": '<path d="M0 -0.92 L0.247 -0.28 L0.932 -0.243 L0.399 0.19 L0.576 0.853 L0 0.48 L-0.576 0.853 L-0.399 0.19 L-0.932 -0.243 L-0.247 -0.28 Z" fill="%G%"/>',
	"grass": '<path d="M-0.58 0.62 C-0.95 -0.15 -0.1 -0.9 0.72 -0.78 C0.78 0.05 0.2 0.78 -0.58 0.62 Z" fill="%G%"/><line x1="-0.52" y1="0.56" x2="-0.86" y2="0.92" stroke="%G%" stroke-width="0.13" stroke-linecap="round"/><line x1="-0.42" y1="0.45" x2="0.56" y2="-0.62" stroke="%F%" stroke-width="0.1" stroke-linecap="round"/><line x1="-0.126" y1="0.129" x2="0.159" y2="0.157" stroke="%F%" stroke-width="0.07" stroke-linecap="round"/><line x1="-0.126" y1="0.129" x2="-0.179" y2="-0.152" stroke="%F%" stroke-width="0.07" stroke-linecap="round"/><line x1="0.09" y1="-0.106" x2="0.335" y2="-0.082" stroke="%F%" stroke-width="0.07" stroke-linecap="round"/><line x1="0.09" y1="-0.106" x2="0.044" y2="-0.349" stroke="%F%" stroke-width="0.07" stroke-linecap="round"/><line x1="0.305" y1="-0.342" x2="0.511" y2="-0.322" stroke="%F%" stroke-width="0.07" stroke-linecap="round"/><line x1="0.305" y1="-0.342" x2="0.267" y2="-0.545" stroke="%F%" stroke-width="0.07" stroke-linecap="round"/>',
	"fire": '<path d="M0 0.9 C0.44 0.9 0.72 0.56 0.66 0.16 C0.62 -0.1 0.58 -0.28 0.54 -0.46 C0.42 -0.3 0.34 -0.2 0.26 -0.12 C0.32 -0.45 0.22 -0.78 0 -0.98 C-0.06 -0.66 -0.22 -0.48 -0.22 -0.3 C-0.32 -0.38 -0.44 -0.48 -0.5 -0.6 C-0.7 -0.3 -0.74 0 -0.66 0.24 C-0.6 0.62 -0.38 0.9 0 0.9 Z" fill="%G%"/><path d="M0 0.72 C0.3 0.72 0.38 0.42 0.24 0.2 C0.14 0.06 0.06 -0.06 0.04 -0.2 C-0.12 -0.02 -0.32 0.2 -0.3 0.42 C-0.28 0.64 -0.14 0.72 0 0.72 Z" fill="%F%"/>',
	"water": '<path d="M0 -0.887 L0.338 -0.26 L0.44 -0.176 L0.523 -0.073 L0.582 0.045 L0.614 0.174 L0.618 0.306 L0.594 0.436 L0.544 0.558 L0.468 0.667 L0.371 0.757 L0.257 0.824 L0.132 0.866 L0 0.88 L-0.132 0.866 L-0.257 0.824 L-0.371 0.757 L-0.468 0.667 L-0.544 0.558 L-0.594 0.436 L-0.618 0.306 L-0.614 0.174 L-0.582 0.045 L-0.523 -0.073 L-0.44 -0.176 L-0.338 -0.26 Z" fill="%G%"/><path d="M-0.096 0.632 A0.384 0.384 0 0 1 -0.38 0.32" fill="none" stroke="%F%" stroke-width="0.1" stroke-linecap="round"/>',
	"electric": '<path d="M0.26 -0.98 L-0.5 0.12 L-0.06 0.12 L-0.3 0.98 L0.52 -0.2 L0.06 -0.2 L0.34 -0.98 Z" fill="%G%"/>',
	"psychic": '<path d="M-0.95 0 C-0.5 -0.7 0.5 -0.7 0.95 0 C0.5 0.7 -0.5 0.7 -0.95 0 Z" fill="%G%"/><circle cx="0" cy="0" r="0.36" fill="%F%"/><circle cx="0" cy="0" r="0.16" fill="%G%"/><circle cx="0.16" cy="-0.16" r="0.08" fill="%G%"/>',
	"fighting": '<rect x="-0.645" y="-0.6" width="0.3" height="0.8" rx="0.142" fill="%G%"/><rect x="-0.315" y="-0.66" width="0.3" height="0.8" rx="0.142" fill="%G%"/><rect x="0.015" y="-0.66" width="0.3" height="0.8" rx="0.142" fill="%G%"/><rect x="0.345" y="-0.6" width="0.3" height="0.8" rx="0.142" fill="%G%"/><rect x="-0.66" y="-0.12" width="1.32" height="0.86" rx="0.24" fill="%G%"/><line x1="-0.33" y1="-0.5" x2="-0.33" y2="-0.12" stroke="%F%" stroke-width="0.07" stroke-linecap="round"/><line x1="0" y1="-0.5" x2="0" y2="-0.12" stroke="%F%" stroke-width="0.07" stroke-linecap="round"/><line x1="0.33" y1="-0.5" x2="0.33" y2="-0.12" stroke="%F%" stroke-width="0.07" stroke-linecap="round"/><rect x="-0.87" y="-0.13" width="1.22" height="0.48" rx="0.22" fill="%F%"/><rect x="-0.8" y="-0.06" width="1.08" height="0.34" rx="0.16" fill="%G%"/><line x1="-0.5" y1="0.56" x2="0.5" y2="0.56" stroke="%F%" stroke-width="0.07" stroke-linecap="round"/>',
	"dark": '<circle cx="-0.06" cy="0.04" r="0.84" fill="%G%"/><circle cx="0.3" cy="-0.24" r="0.7" fill="%F%"/><path d="M0.42 -0.38 L0.477 -0.117 L0.74 -0.06 L0.477 -0.003 L0.42 0.26 L0.363 -0.003 L0.1 -0.06 L0.363 -0.117 Z" fill="%G%"/>',
	"steel": '<path d="M0.92 0 L0.46 0.797 L-0.46 0.797 L-0.92 0 L-0.46 -0.797 L0.46 -0.797 Z" fill="%G%"/><circle cx="0" cy="0" r="0.38" fill="%F%"/><path d="M0.74 0 L0.37 0.641 L-0.37 0.641 L-0.74 0 L-0.37 -0.641 L0.37 -0.641 L0.74 0" fill="none" stroke="%F%" stroke-width="0.06" stroke-linecap="round" stroke-linejoin="round"/>',
	"dragon": '<path d="M-0.96 -0.02 C-0.7 -0.2 -0.42 -0.22 -0.16 -0.36 C0.1 -0.62 0.42 -0.9 0.86 -0.98 C0.56 -0.74 0.42 -0.5 0.4 -0.34 C0.62 -0.26 0.74 -0.08 0.72 0.16 C0.8 0.44 0.86 0.7 0.8 0.94 L0.18 0.94 C0.2 0.66 0.12 0.5 -0.06 0.4 C-0.3 0.34 -0.5 0.36 -0.7 0.3 L-0.5 0.17 L-0.86 0.17 Z" fill="%G%"/><path d="M-0.36 -0.06 L-0.12 -0.17 L-0.02 -0.08 L-0.24 0 Z" fill="%F%"/><circle cx="-0.8" cy="-0.04" r="0.045" fill="%F%"/><line x1="0.06" y1="0.1" x2="0.4" y2="0.02" stroke="%F%" stroke-width="0.06" stroke-linecap="round"/><line x1="0.18" y1="0.3" x2="0.48" y2="0.24" stroke="%F%" stroke-width="0.06" stroke-linecap="round"/>',
	"fairy": '<ellipse cx="0" cy="0" rx="0.42" ry="0.5" fill="%G%" transform="translate(-0.44 -0.26) rotate(-31.513)"/><ellipse cx="0" cy="0" rx="0.27" ry="0.34" fill="%G%" transform="translate(-0.32 0.44) rotate(25.783)"/><line x1="-0.03" y1="-0.56" x2="-0.26" y2="-0.94" stroke="%G%" stroke-width="0.07" stroke-linecap="round"/><circle cx="-0.27" cy="-0.95" r="0.07" fill="%G%"/><ellipse cx="0" cy="0" rx="0.42" ry="0.5" fill="%G%" transform="translate(0.44 -0.26) rotate(31.513)"/><ellipse cx="0" cy="0" rx="0.27" ry="0.34" fill="%G%" transform="translate(0.32 0.44) rotate(-25.783)"/><line x1="0.03" y1="-0.56" x2="0.26" y2="-0.94" stroke="%G%" stroke-width="0.07" stroke-linecap="round"/><circle cx="0.27" cy="-0.95" r="0.07" fill="%G%"/><line x1="0" y1="-0.66" x2="0" y2="0.8" stroke="%F%" stroke-width="0.22" stroke-linecap="round"/><ellipse cx="0" cy="0" rx="0.065" ry="0.62" fill="%G%" transform="translate(0 0.06) rotate(0)"/>',
	"ice": '<line x1="0" y1="0" x2="0" y2="-0.94" stroke="%G%" stroke-width="0.14" stroke-linecap="round"/><line x1="0" y1="-0.56" x2="0.212" y2="-0.772" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><line x1="0" y1="-0.56" x2="-0.212" y2="-0.772" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><line x1="0" y1="0" x2="0.814" y2="-0.47" stroke="%G%" stroke-width="0.14" stroke-linecap="round"/><line x1="0.485" y1="-0.28" x2="0.775" y2="-0.202" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><line x1="0.485" y1="-0.28" x2="0.563" y2="-0.57" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><line x1="0" y1="0" x2="0.814" y2="0.47" stroke="%G%" stroke-width="0.14" stroke-linecap="round"/><line x1="0.485" y1="0.28" x2="0.563" y2="0.57" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><line x1="0.485" y1="0.28" x2="0.775" y2="0.202" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><line x1="0" y1="0" x2="0" y2="0.94" stroke="%G%" stroke-width="0.14" stroke-linecap="round"/><line x1="0" y1="0.56" x2="-0.212" y2="0.772" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><line x1="0" y1="0.56" x2="0.212" y2="0.772" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><line x1="0" y1="0" x2="-0.814" y2="0.47" stroke="%G%" stroke-width="0.14" stroke-linecap="round"/><line x1="-0.485" y1="0.28" x2="-0.775" y2="0.202" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><line x1="-0.485" y1="0.28" x2="-0.563" y2="0.57" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><line x1="0" y1="0" x2="-0.814" y2="-0.47" stroke="%G%" stroke-width="0.14" stroke-linecap="round"/><line x1="-0.485" y1="-0.28" x2="-0.563" y2="-0.57" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><line x1="-0.485" y1="-0.28" x2="-0.775" y2="-0.202" stroke="%G%" stroke-width="0.11" stroke-linecap="round"/><circle cx="0" cy="0" r="0.16" fill="%G%"/>',
	"poison": '<circle cx="-0.12" cy="0.3" r="0.56" fill="%G%"/><circle cx="0.44" cy="-0.4" r="0.27" fill="%G%"/><circle cx="-0.2" cy="-0.66" r="0.16" fill="%G%"/><path d="M-0.476 0.244 A0.36 0.36 0 0 1 -0.21 -0.049" fill="none" stroke="%F%" stroke-width="0.1" stroke-linecap="round"/><circle cx="0.36" cy="-0.48" r="0.07" fill="%F%"/>',
	"ground": '<path d="M-0.96 0.5 L-0.22 -0.72 L0.42 0.5 Z" fill="%G%"/><path d="M0.02 0.5 L0.52 -0.24 L0.96 0.5 Z" fill="%G%"/><path d="M-0.52 -0.2 L-0.38 -0.06 L-0.24 -0.22 L-0.1 -0.06 L0.04 -0.22" fill="none" stroke="%F%" stroke-width="0.08" stroke-linecap="round" stroke-linejoin="round"/><path d="M-0.96 0.62 L0.96 0.62 L0.9 0.8 L-0.9 0.8 Z" fill="%G%"/>',
	"flying": '<path d="M-0.9 0.45 C-0.72 -0.3 0.1 -0.78 0.98 -0.74 C0.98 -0.27 0.707 -0.077 0.36 -0.3 C0.773 0.155 0.667 0.305 0.12 0.04 C0.495 0.537 0.372 0.669 -0.16 0.34 C0.185 0.853 0.035 0.967 -0.5 0.6 C-0.66 0.7 -0.92 0.66 -0.9 0.45 Z" fill="%G%"/><path d="M-0.56 0.3 L-0.24 0.02 L0.14 -0.2 L0.5 -0.36" fill="none" stroke="%F%" stroke-width="0.07" stroke-linecap="round" stroke-linejoin="round"/>',
	"bug": '<ellipse cx="0" cy="0" rx="0.5" ry="0.64" fill="%G%" transform="translate(0 0.2) rotate(0)"/><circle cx="0" cy="-0.56" r="0.26" fill="%G%"/><line x1="0" y1="-0.32" x2="0" y2="0.86" stroke="%F%" stroke-width="0.08" stroke-linecap="round"/><line x1="-0.5" y1="-0.24" x2="0.5" y2="-0.24" stroke="%F%" stroke-width="0.07" stroke-linecap="round"/><path d="M-0.1 -0.76 L-0.26 -0.96 L-0.42 -0.94" fill="none" stroke="%G%" stroke-width="0.07" stroke-linecap="round" stroke-linejoin="round"/><line x1="-0.46" y1="-0.02" x2="-0.78" y2="-0.12" stroke="%G%" stroke-width="0.09" stroke-linecap="round"/><line x1="-0.46" y1="0.3" x2="-0.78" y2="0.3" stroke="%G%" stroke-width="0.09" stroke-linecap="round"/><line x1="-0.46" y1="0.62" x2="-0.78" y2="0.72" stroke="%G%" stroke-width="0.09" stroke-linecap="round"/><path d="M0.1 -0.76 L0.26 -0.96 L0.42 -0.94" fill="none" stroke="%G%" stroke-width="0.07" stroke-linecap="round" stroke-linejoin="round"/><line x1="0.46" y1="-0.02" x2="0.78" y2="-0.12" stroke="%G%" stroke-width="0.09" stroke-linecap="round"/><line x1="0.46" y1="0.3" x2="0.78" y2="0.3" stroke="%G%" stroke-width="0.09" stroke-linecap="round"/><line x1="0.46" y1="0.62" x2="0.78" y2="0.72" stroke="%G%" stroke-width="0.09" stroke-linecap="round"/>',
	"rock": '<path d="M-0.84 0.44 L-0.66 -0.32 L-0.14 -0.78 L0.48 -0.62 L0.88 -0.06 L0.72 0.6 L-0.18 0.78 Z" fill="%G%"/><path d="M-0.14 -0.78 L0.02 -0.1 L0.88 -0.06" fill="none" stroke="%F%" stroke-width="0.08" stroke-linecap="round" stroke-linejoin="round"/><path d="M-0.66 -0.32 L0.02 -0.1 L-0.18 0.78" fill="none" stroke="%F%" stroke-width="0.08" stroke-linecap="round" stroke-linejoin="round"/>',
	"ghost": '<path d="M-0.66 -0.18 L-0.643 -0.327 L-0.595 -0.466 L-0.516 -0.592 L-0.412 -0.696 L-0.286 -0.775 L-0.147 -0.823 L0 -0.84 L0.147 -0.823 L0.286 -0.775 L0.412 -0.696 L0.516 -0.592 L0.595 -0.466 L0.643 -0.327 L0.66 -0.18 L0.66 0.62 L0.44 0.88 L0.22 0.6 L0 0.88 L-0.22 0.6 L-0.44 0.88 L-0.66 0.62 Z" fill="%G%"/><ellipse cx="0" cy="0" rx="0.12" ry="0.19" fill="%F%" transform="translate(-0.24 -0.2) rotate(0)"/><ellipse cx="0" cy="0" rx="0.12" ry="0.19" fill="%F%" transform="translate(0.24 -0.2) rotate(0)"/><ellipse cx="0" cy="0" rx="0.1" ry="0.08" fill="%F%" transform="translate(0 0.2) rotate(0)"/>',
	"any": '<path d="M0 -0.98 L0.115 -0.277 L0.438 -0.438 L0.277 -0.115 L0.98 0 L0.277 0.115 L0.438 0.438 L0.115 0.277 L0 0.98 L-0.115 0.277 L-0.438 0.438 L-0.277 0.115 L-0.98 0 L-0.277 -0.115 L-0.438 -0.438 L-0.115 -0.277 Z" fill="%G%"/><circle cx="0" cy="0" r="0.16" fill="%F%"/>',
	"hidden": '<path d="M0 -0.92 L0.62 0 L0 0.92 L-0.62 0 Z" fill="%G%"/><path d="M0 -0.6 L0.4 0 L0 0.6 L-0.4 0 Z" fill="%F%"/><circle cx="0" cy="0" r="0.17" fill="%G%"/>',
}

static var _cache := {}

@export var kind := "colorless":
	set(v): kind = v; queue_redraw()
@export var dim := 0.0:
	set(v): dim = v; queue_redraw()

func _draw() -> void:
	var r := minf(size.x, size.y) * 0.5
	draw_icon(self, kind, size * 0.5, r * 0.94, 1.0, {"dim": dim})

static func color(k: String) -> Color:
	return COLORS.get(k, COLORS.colorless)

# ---------- the SVG ----------
static func _hex(c: Color) -> String:
	return "#" + c.to_html(false)

static func _glyph_svg(k: String, g: String, f: String) -> String:
	var gl := String(GLYPHS.get(k, '<circle cx="0" cy="0" r="0.4" fill="%G%"/>'))
	return gl.replace("%G%", g).replace("%F%", f)

# variant: disc (rim, lift, shadow), flat (the disc only), glyph (the glyph alone, white,
# its cuts faintly dark so a tint shows them)
static func svg(k: String, variant := "disc", grey := false) -> String:
	var base := color(k)
	if grey:
		var lum := base.get_luminance()
		base = Color(lum, lum, lum).darkened(0.35)
	var gk := DISC * GLYPH_K
	var s := '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">'
	if variant == "glyph":
		var gl := String(GLYPHS.get(k, '<circle cx="0" cy="0" r="0.4" fill="%G%"/>'))
		gl = gl.replace('fill="%F%"', 'fill="#000000" fill-opacity="0.35"').replace('stroke="%F%"', 'stroke="#000000" stroke-opacity="0.35"')
		s += '<g transform="translate(50 50) scale(%s)">' % gk + gl.replace("%G%", "#ffffff") + "</g>"
		return s + "</svg>"
	if variant == "disc":
		s += '<circle cx="50" cy="%s" r="%s" fill="#000000" fill-opacity="0.3"/>' % [50.0 + DISC * 0.07, DISC * 1.02]
	s += '<circle cx="50" cy="50" r="%s" fill="%s"/>' % [DISC, _hex(base.darkened(0.22))]
	s += '<circle cx="50" cy="50" r="%s" fill="%s"/>' % [DISC * 0.9, _hex(base)]
	if variant == "disc":
		var r8 := DISC * 0.8
		var a0 := PI * 1.12
		var a1 := PI * 1.88
		s += '<path d="M%s %s A%s %s 0 0 1 %s %s" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="%s"/>' % [
			50.0 + cos(a0) * r8, 50.0 + sin(a0) * r8, r8, r8, 50.0 + cos(a1) * r8, 50.0 + sin(a1) * r8, DISC * 0.12]
		s += '<circle cx="50" cy="50" r="%s" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="%s"/>' % [DISC * 0.9, DISC * 0.045]
		s += '<g transform="translate(50 %s) scale(%s)" opacity="0.35">' % [50.0 + DISC * 0.045, gk]
		s += _glyph_svg(k, _hex(base.darkened(0.45)), _hex(base)) + "</g>"
	s += '<g transform="translate(50 50) scale(%s)"%s>' % [gk, ' opacity="0.55"' if grey else ""]
	s += _glyph_svg(k, "#ffffff", _hex(base)) + "</g>"
	return s + "</svg>"

static func _bucket(px: float) -> int:
	for s in SIZES:
		if s >= px: return s
	return SIZES.back()

# the cached texture of a kind at about px pixels across (the whole 100-unit box)
static func texture(k: String, px: float, variant := "disc", grey := false) -> Texture2D:
	var b := _bucket(px)
	var key := "%s|%s|%d|%d" % [k, variant, int(grey), b]
	if _cache.has(key): return _cache[key]
	var img := Image.new()
	var err := img.load_svg_from_string(svg(k, variant, grey), b / 100.0)
	var tex: Texture2D = null
	if err == OK and not img.is_empty(): tex = ImageTexture.create_from_image(img)
	_cache[key] = tex
	return tex

static func cache_size() -> int: return _cache.size()

static func _px_scale(ci: CanvasItem) -> float:
	if ci == null or not ci.is_inside_tree(): return 1.0
	var s := ci.get_global_transform_with_canvas().get_scale().x
	var vp := ci.get_viewport()
	if vp: s *= vp.get_final_transform().get_scale().x
	return maxf(0.25, absf(s))

# ---------- drawing ----------
static func draw_icon(ci: CanvasItem, k: String, c: Vector2, r: float, a := 1.0, opts := {}) -> void:
	if r <= 0.0 or a <= 0.001: return
	var variant := "glyph" if opts.get("glyph_only", false) else ("flat" if opts.get("flat", false) else "disc")
	var d := clampf(float(opts.get("dim", 0.0)), 0.0, 1.0)
	var half := r * 50.0 / DISC
	var rect := Rect2(c - Vector2(half, half), Vector2(half, half) * 2.0)
	var px := rect.size.x * _px_scale(ci)
	var mod := Color(1, 1, 1, a)
	if variant == "glyph":
		var col: Color = opts.get("col", Color.WHITE)
		mod = Color(col, a * col.a)
	if d > 0.001:
		var gt := texture(k, px, variant, true)
		if gt: ci.draw_texture_rect(gt, rect, false, mod)
		if d < 0.999:
			var nt := texture(k, px, variant, false)
			if nt: ci.draw_texture_rect(nt, rect, false, Color(mod, mod.a * (1.0 - d)))
		return
	var tex := texture(k, px, variant, false)
	if tex: ci.draw_texture_rect(tex, rect, false, mod)

# the glyph alone in a box of half-size g around c, tinted col (face is ignored: the cuts are see-through)
static func _glyph(ci: CanvasItem, k: String, c: Vector2, g: float, col: Color, _face := Color(0, 0, 0, 0)) -> void:
	draw_icon(ci, k, c, g / GLYPH_K, 1.0, {"glyph_only": true, "col": col})
