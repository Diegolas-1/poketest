class_name BikeModel
extends Node3D
# A bicycle, built in code from a look (res://bike/looks.json: a style preset and
# any field over it) so every part can be customised later without a new model:
# frame colours, accent, decals, basket, rack, bell, grips, tyres, mudguards,
# saddle, size. Drawn with the people's cel look (shaders/bike.gdshader) and
# outlined by the ink hull like a character (group "characters", .meshes).
#
# Parts (bike-local metres: +Z forward, +Y up, +X the rider's left; the origin on
# the ground midway between the tyres' contact points, so a lean is a roll about Z):
#   frame       lugged tubes (head, top, down, seat tube; chain and seat stays; a
#               step-through has a low loop instead of the top tube), bottom
#               bracket shell, two-tone panels, pinstripes, decals, rear mudguard,
#               chain guard, rear rack, rear brake, the chain (its links move by
#               the shader as the cranks turn) and the rear lamp / reflector
#   seat        seatpost, sprung saddle with rails, springs and rivets: moves up
#               the seat tube to fit the rider (fit())
#   steer       turns about the head tube's axis: fork, headset, quill stem,
#               swept bars, grips, brake levers and cables, bell, front brake,
#               basket, lamp, front mudguard, and the front wheel
#   wheel_f/_r  rim, tyre (tread + sidewall), hub, 28 laced spokes, valve, spoke reflector
#   cog         the rear sprocket (turns with the chain, not the wheel: freewheel)
#   crank       chainring and crank arms; pedal_l / pedal_r keep level with the foot
#   kick        the kickstand (0 up .. 1 down)
#
#   var b := BikeModel.new(); add_child(b); b.build(BikeModel.look("ash"))
#   b.pose(steer, wheel_f, wheel_r, crank, kick, pitch_l, pitch_r)
#   b.saddle() / b.grip(+1|-1) / b.pedal(+1|-1)   points for the rider (bike-local)

const SHADER := preload("res://shaders/bike.gdshader")
const LOOKS := "res://bike/looks.json"
static var _looks := {}
static var _mats := {}       # look hash -> {key: ShaderMaterial}
static var _tex := {}        # sticker id + colour -> ImageTexture

var L: Dictionary            # the resolved look
var s := 1.0                 # size
var meshes: Array[MeshInstance3D] = []   # (ink.gd: characters)
var mats := {}
var steer: Node3D
var seat: Node3D
var wheel_f: Node3D
var wheel_r: Node3D
var cog: Node3D
var crank: Node3D
var pedal_l: Node3D
var pedal_r: Node3D
var kick: Node3D
var chain_mat: ShaderMaterial
var lamp_mat: ShaderMaterial
var tris := 0
# geometry (bike-local)
var R := 0.335        # tyre's outer radius
var WB := 1.06
var RA := Vector3.ZERO
var FA := Vector3.ZERO
var BB := Vector3.ZERO
var ST := Vector3.ZERO      # the seat tube's top
var SDIR := Vector3.ZERO    # the seat tube's direction (up)
var HB := Vector3.ZERO      # the head tube's bottom (the steering pivot)
var HT := Vector3.ZERO
var U := Vector3.ZERO       # the steering axis (up)
var BC := Vector3.ZERO      # the bar clamp
var CRANK := 0.17
var post := 0.12            # seatpost out of the seat tube (m), fit() changes it
var post0 := 0.12
var GRIP := [Vector3.ZERO, Vector3.ZERO]   # grip centres (steer frame, left, right)
var KICK0 := Vector3.ZERO
var KICK_UP := Vector3.ZERO
var KICK_DN := Vector3.ZERO
var ring_r := 0.1
var cog_r := 0.042
var teeth := [38, 16]
var chain_len := 1.0
var steer_a := 0.0
var _kick := -1.0

# ---------- looks ----------
static func looks_file() -> Dictionary:
	if _looks.is_empty():
		var j = JSON.parse_string(FileAccess.get_file_as_string(LOOKS)) if FileAccess.file_exists(LOOKS) else null
		_looks = j if j is Dictionary else {"styles": {}, "looks": {}}
		# the world editor's tunables (res://tunables/bike.json "looks") over the file
		var o = preload("res://tunables.gd").file("bike").get("looks")
		if o is Dictionary:
			for k in o: if o[k] is Dictionary: _looks.looks[k] = o[k]
	return _looks

# a look by name (or a look dictionary: a saved, customised one), resolved over its style
static func look(id) -> Dictionary:
	var f := looks_file()
	var l: Dictionary = (id if id is Dictionary else f.looks.get(String(id), f.looks.get("ash", {}))).duplicate(true)
	var st: Dictionary = f.styles.get(String(l.get("style", "roadster")), f.styles.get("roadster", {}))
	var out := st.duplicate(true)
	for k in l: out[k] = l[k]
	if not out.has("frame"): out.frame = "#d83a31"
	return out

# ---------- materials ----------
static func _col(v, d := "#808080") -> Color:
	return Color(v) if v is String and Color.html_is_valid(v) else Color(d)

func _mat(key: String, col: Color, opt := {}) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = SHADER
	m.set_shader_parameter("albedo", col)
	for k in opt: m.set_shader_parameter(k, opt[k])
	mats[key] = m
	return m

func _materials() -> void:
	var metal := String(L.get("metal", "chrome"))
	var mc: Color = {"chrome": Color("cfd5dd"), "black": Color("2f3136"), "gold": Color("d8b25a")}.get(metal, Color("cfd5dd"))
	var chrome := 0.0 if metal == "black" else 1.0
	var fr := _col(L.frame, "#d83a31")
	_mat("frame", fr, {"gloss": 0.55})
	_mat("frame2", _col(L.get("frame2"), "#f4efe4"), {"gloss": 0.5})
	_mat("accent", _col(L.get("accent"), "#f4efe4"), {"gloss": 0.4})
	var gc = L.get("guard_col", "")
	_mat("guard", _col(gc if String(gc) != "" else L.get("frame2"), "#f4efe4"), {"gloss": 0.5})
	_mat("metal", mc, {"gloss": 0.9, "chrome": chrome})
	_mat("steel", Color("b9c0c9"), {"gloss": 0.6, "chrome": 0.7})   # spokes, the cog
	_mat("dark", Color("34363c"), {"gloss": 0.35})
	chain_mat = _mat("chain", Color("8c929a"), {"pattern": 1, "col2": Color("2a2c31"), "gloss": 0.4})
	_mat("tyre", _col(L.get("tyre"), "#2b2a30"), {"pattern": 3, "deep": Vector3(0.62, 0.64, 0.78), "shade": Vector3(0.78, 0.8, 0.92)})
	_mat("wall", _col(L.get("wall"), "#e8dcbc"))
	_mat("grip", _col(L.get("grips"), "#f4efe4"))
	_mat("saddle", _col(L.get("saddle"), "#6b3f27"), {"gloss": 0.35})
	var bk := String(L.get("basket", "wicker"))
	_mat("basket", _col(L.get("basket_col"), "#c8955a"), {"pattern": 2 if bk == "wicker" else 0, "gloss": 0.0 if bk == "wicker" else 0.6})
	_mat("rubber", Color("2a2a2e"))
	_mat("cable", Color("26272b"), {"gloss": 0.3})
	_mat("amber", Color("f29a2e"), {"gloss": 0.8, "glow": 0.25})
	_mat("red", Color("d8283a"), {"gloss": 0.8, "glow": 0.25})
	_mat("white_ref", Color("f2f4f8"), {"gloss": 0.8, "glow": 0.1})
	lamp_mat = _mat("lens", Color("fff6d6"), {"pattern": 4, "col2": Color("e9e2c9"), "glow": 0.35, "gloss": 1.0})
	_mat("bell", _col(L.get("bell_col"), "#d9dde4"), {"gloss": 1.0, "chrome": 0.8})
	_mat("leather_dk", _col(L.get("saddle"), "#6b3f27").darkened(0.35))
	var st := String(L.get("sticker", "none"))
	if st != "none":
		var m := _mat("sticker", Color.WHITE, {"use_tex": true, "alpha_scissor": 0.5, "lift": 0.0008, "gloss": 0.4})
		m.set_shader_parameter("albedo_tex", _sticker(st, _col(L.get("sticker_col"), "#ffffff"), fr))

# a sticker's picture, drawn in code (64 x 64, alpha cut out)
static func _sticker(id: String, c: Color, frame: Color) -> ImageTexture:
	var key := "%s/%s/%s" % [id, c.to_html(), frame.to_html()]
	if _tex.has(key): return _tex[key]
	var N := 64
	var img := Image.create(N, N, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var ink := Color("1d1c24")
	for y in N:
		for x in N:
			var p := Vector2(x + 0.5, y + 0.5) / N * 2.0 - Vector2.ONE
			var col := Color(0, 0, 0, 0)
			match id:
				"pokeball":
					var d := p.length()
					if d < 0.92:
						col = Color("e83a30") if p.y < 0.0 else Color("f8f6f0")
						if absf(p.y) < 0.12 or d > 0.8: col = ink
						if d < 0.32: col = ink
						if d < 0.2: col = Color("f8f6f0")
						if p.y < -0.3 and p.x < -0.15 and Vector2(p.x + 0.38, p.y + 0.45).length() < 0.14: col = Color(1, 1, 1)
				"star":
					var a := atan2(p.y, p.x) + PI / 2.0
					var r := p.length()
					var k := fmod(a + TAU * 10.0, TAU / 5.0) / (TAU / 5.0)
					var lim := lerpf(0.9, 0.38, absf(k - 0.5) * 2.0)
					lim = 0.38 + (0.9 - 0.38) * pow(1.0 - absf(k - 0.5) * 2.0, 1.6)
					if r < lim + 0.07: col = ink
					if r < lim: col = c
				"bolt":
					# a lightning bolt across the tube
					var q := Vector2(p.x, p.y)
					var inb := _in_poly(q, [Vector2(-0.95, -0.25), Vector2(0.1, -0.25), Vector2(-0.05, -0.75), Vector2(0.95, 0.2), Vector2(-0.1, 0.2), Vector2(0.05, 0.75)])
					if inb: col = c
					elif _near_poly(q, [Vector2(-0.95, -0.25), Vector2(0.1, -0.25), Vector2(-0.05, -0.75), Vector2(0.95, 0.2), Vector2(-0.1, 0.2), Vector2(0.05, 0.75)], 0.07): col = ink
				"leaf":
					var lq := Vector2(p.x * 1.0, p.y * 1.7)
					var dl := Vector2(lq.x + 0.15, lq.y).length() + Vector2(lq.x - 0.15, lq.y).length()
					if absf(p.y) < 0.55 and Vector2(absf(p.x), absf(p.y) * 1.9).length() < 0.9:
						col = ink
						if Vector2(absf(p.x), absf(p.y) * 1.9).length() < 0.8: col = c
						if absf(p.y) < 0.045 and absf(p.x) < 0.75: col = ink
					var _u := dl
			img.set_pixel(x, y, col)
	img.generate_mipmaps()
	var t := ImageTexture.create_from_image(img)
	_tex[key] = t
	return t

static func _in_poly(p: Vector2, poly: Array) -> bool:
	var inside := false
	var n := poly.size()
	for i in n:
		var a: Vector2 = poly[i]; var b: Vector2 = poly[(i + 1) % n]
		if (a.y > p.y) != (b.y > p.y) and p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x: inside = not inside
	return inside

static func _near_poly(p: Vector2, poly: Array, w: float) -> bool:
	var n := poly.size()
	for i in n:
		var a: Vector2 = poly[i]; var b: Vector2 = poly[(i + 1) % n]
		var u := clampf((p - a).dot(b - a) / (b - a).length_squared(), 0.0, 1.0)
		if p.distance_to(a.lerp(b, u)) < w: return true
	return false

# ---------- build ----------
func build(look_d: Dictionary) -> void:
	L = look_d
	s = float(L.get("size", 1.0))
	for c in get_children(): c.queue_free()
	meshes.clear()
	_materials()
	_geometry()
	var parts := {}
	for k in ["body", "seat", "steer", "wheel_f", "wheel_r", "cog", "crank", "pedal_l", "pedal_r", "kick"]:
		parts[k] = [BikeMesh.new(), BikeMesh.new()]   # [inked, fine (no ink)]
	_frame(parts.body)
	_seat(parts.seat)
	_steer(parts.steer)
	_wheel(parts.wheel_f, true)
	_wheel(parts.wheel_r, false)
	_cog(parts.cog)
	_crank(parts.crank)
	_pedal(parts.pedal_l, 1.0)
	_pedal(parts.pedal_r, -1.0)
	_kickstand(parts.kick)
	# nodes: each part at its pivot, its geometry made relative to it
	steer = _node("steer", HB, self)
	seat = _node("seat", ST + SDIR * (post - post0), self)
	wheel_f = _node("wheel_f", FA - HB, steer)
	wheel_r = _node("wheel_r", RA, self)
	cog = _node("cog", RA, self)
	crank = _node("crank", BB, self)
	pedal_l = _node("pedal_l", Vector3(0, -CRANK, 0), crank)
	pedal_r = _node("pedal_r", Vector3(0, CRANK, 0), crank)
	kick = _node("kick", KICK0, self)
	var at := {"body": self, "seat": seat, "steer": steer, "wheel_f": wheel_f, "wheel_r": wheel_r, "cog": cog, "crank": crank, "pedal_l": pedal_l, "pedal_r": pedal_r, "kick": kick}
	tris = 0
	for k in parts:
		for fine in 2:
			var m: BikeMesh = parts[k][fine]
			if m.empty(): continue
			tris += m.tris()
			var mi := MeshInstance3D.new()
			mi.name = k + ("_fine" if fine else "")
			mi.mesh = m.commit(mats)
			if fine:
				mi.set_meta("no_ink", true)
				mi.visibility_range_end = 32.0 * s
				mi.visibility_range_end_margin = 4.0
				mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if k.begins_with("pedal") else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			mi.extra_cull_margin = 0.3
			(at[k] as Node3D).add_child(mi)
			meshes.append(mi)
	add_to_group("characters")
	pose(0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0)

func _node(n: String, p: Vector3, parent: Node3D) -> Node3D:
	var d := Node3D.new()
	d.name = n
	d.position = p
	parent.add_child(d)
	return d

# the frame's geometry from the size
func _geometry() -> void:
	R = 0.335 * s
	WB = 1.06 * s
	RA = Vector3(0, R, -WB * 0.5)
	FA = Vector3(0, R, WB * 0.5)
	BB = Vector3(0, 0.28 * s, -0.09 * s)
	var sta := deg_to_rad(72.0)
	SDIR = Vector3(0, sin(sta), -cos(sta))
	ST = BB + SDIR * (0.47 * s if String(L.get("frame_kind")) == "diamond" else 0.45 * s)
	var hta := deg_to_rad(69.0)
	U = Vector3(0, sin(hta), -cos(hta))
	var n := Vector3(0, -cos(hta), -sin(hta))     # perpendicular to the axis, back and down
	var P0 := FA + n * 0.05 * s                     # the axis passes the fork's offset behind the axle
	HB = P0 + U * ((0.68 * s - P0.y) / U.y)
	HT = HB + U * 0.16 * s
	BC = HT + U * 0.085 * s + Vector3(0, 0, 0.07 * s)
	CRANK = 0.17 * s
	ring_r = 0.1 * s
	cog_r = 0.042 * s
	post0 = 0.12 * s
	post = post0 + float(L.get("seat_up", 0.0))
	# the kickstand: on the left chainstay behind the bottom bracket
	KICK0 = BB.lerp(RA, 0.2) + Vector3(0.055 * s, -0.01 * s, 0)
	KICK_UP = (RA + Vector3(0.07 * s, -0.04 * s, 0) - KICK0).normalized()
	var tip := Vector3(0.16 * s, 0.0, KICK0.z - 0.06 * s)
	KICK_DN = (tip - KICK0).normalized()
	# the grips (steer frame: relative to HB, steering 0)
	for sd in 2:
		var x := 1.0 if sd == 0 else -1.0
		GRIP[sd] = BC + Vector3(x * 0.275 * s, 0.035 * s, -0.19 * s) - HB

# ---------- the frame ----------
func _frame(P: Array) -> void:
	var m: BikeMesh = P[0]
	var f: BikeMesh = P[1]
	var step := String(L.get("frame_kind")) == "step"
	var rt := 0.0155 * s; var rd := 0.0185 * s; var rs := 0.0155 * s; var rh := 0.02 * s
	var rcs := 0.0095 * s; var rss := 0.0085 * s
	var drop := 0.065 * s
	# head tube (two-tone: the second colour) and its lugs
	m.tube(HB - U * 0.005 * s, HT + U * 0.005 * s, rh, rh, "frame2", 14)
	var TT0 := ST - SDIR * 0.035 * s
	var TT1 := HT - U * 0.03 * s
	var DT1 := HB + U * 0.03 * s
	if not step:
		m.tube(TT0, TT1, rt, rt, "frame", 12)
		# a band of the second colour mid-tube, with pinstripes
		var a := TT0.lerp(TT1, 0.38); var b := TT0.lerp(TT1, 0.62)
		m.tube(a, b, rt * 1.03, rt * 1.03, "frame2", 12)
		for e in [a, b]:
			m.lathe(e, TT1 - TT0, [Vector2(rt * 1.06, -0.002 * s), Vector2(rt * 1.06, 0.002 * s)], "accent", 12)
		m.tube(BB, DT1, rd, rd, "frame", 12)
	else:
		# a step-through: a low swept tube from the head tube down to the bottom bracket, and a twin above it
		var pts: Array = []
		var lo: Array = []
		for i in 9:
			var u := i / 8.0
			var p := (HB + U * 0.115 * s).lerp(BB + SDIR * 0.16 * s, u)
			p.y -= sin(u * PI) * 0.12 * s
			pts.append(p)
			var q := DT1.lerp(BB, u)
			q.y -= sin(u * PI) * 0.05 * s
			lo.append(q)
		m.sweep(pts, rt * 1.05, "frame", 12)
		m.sweep(lo, rd, "frame", 12)
	m.tube(BB, ST + SDIR * 0.02 * s, rs, rs, "frame", 12)
	# the seat tube's panel in the second colour
	m.tube(BB + SDIR * 0.18 * s, BB + SDIR * 0.33 * s, rs * 1.04, rs * 1.04, "frame2", 12)
	for e: float in [0.18, 0.33]:
		m.lathe(BB + SDIR * e * s, SDIR, [Vector2(rs * 1.08, -0.002 * s), Vector2(rs * 1.08, 0.002 * s)], "accent", 12)
	# bottom bracket shell
	m.lathe(BB, Vector3.RIGHT, [Vector2(0.021 * s, -0.036 * s), Vector2(0.024 * s, -0.034 * s), Vector2(0.024 * s, 0.034 * s), Vector2(0.021 * s, 0.036 * s)], "frame", 16)
	# chainstays and seatstays to the dropouts, both sides
	for sd: float in [1.0, -1.0]:
		var d0 := RA + Vector3(sd * drop * 0.9, 0, 0.012 * s)
		var cs: Array = []
		for i in 7:
			var u := i / 6.0
			var p := (BB + Vector3(sd * 0.03 * s, -0.005 * s, -0.02 * s)).lerp(d0, u)
			p.x += sd * sin(u * PI) * 0.012 * s
			cs.append(p)
		m.sweep(cs, [rcs * 1.1, rcs * 1.1, rcs, rcs, rcs * 0.95, rcs * 0.85, rcs * 0.8], "frame", 10)
		var ss: Array = []
		var s0 := ST - SDIR * 0.045 * s + Vector3(sd * 0.012 * s, 0, 0)
		for i in 7:
			var u := i / 6.0
			var p := s0.lerp(d0 + Vector3(0, 0.02 * s, 0), u)
			p.x += sd * sin(u * PI * 0.5) * 0.02 * s
			ss.append(p)
		m.sweep(ss, [rss, rss, rss, rss * 0.95, rss * 0.9, rss * 0.85, rss * 0.8], "frame", 10)
		# the dropout plate round the axle
		m.lathe(RA + Vector3(sd * drop, 0, 0), Vector3.RIGHT, [Vector2(0.004 * s, -0.003 * s), Vector2(0.016 * s, -0.003 * s), Vector2(0.017 * s, 0.0), Vector2(0.016 * s, 0.003 * s), Vector2(0.004 * s, 0.003 * s)], "frame", 14)
		# the axle nut
		m.lathe(RA + Vector3(sd * (drop + 0.006 * s), 0, 0), Vector3.RIGHT * sd, [Vector2(0.0075 * s, 0), Vector2(0.0075 * s, 0.006 * s), Vector2(0.003 * s, 0.009 * s)], "metal", 6)
	# the bridge between the seat stays (holds the rear brake and the mudguard)
	var brz := ST.lerp(RA, 0.42) - SDIR * 0.0
	m.tube(brz + Vector3(0.03 * s, 0, 0), brz - Vector3(0.03 * s, 0, 0), 0.006 * s, 0.006 * s, "frame", 8)
	# lugs: sleeves in the accent colour where the tubes meet, tapering into points
	var lug := func(o: Vector3, d: Vector3, r: float, l: float):
		m.lathe(o, d, [Vector2(r * 1.02, 0.0), Vector2(r * 1.22, 0.004 * s), Vector2(r * 1.22, l * 0.55), Vector2(r * 1.1, l), Vector2(r * 1.02, l * 1.12)], "accent", 14)
	lug.call(HT + U * 0.004 * s, -U, rh, 0.03 * s)
	lug.call(HB - U * 0.004 * s, U, rh, 0.03 * s)
	if not step:
		lug.call(TT1 + (TT0 - TT1).normalized() * 0.012 * s, TT0 - TT1, rt, 0.03 * s)
		lug.call(TT0 + (TT1 - TT0).normalized() * 0.006 * s, TT1 - TT0, rt, 0.026 * s)
		lug.call(DT1 + (BB - DT1).normalized() * 0.012 * s, BB - DT1, rd, 0.034 * s)
	lug.call(ST + SDIR * 0.02 * s, -SDIR, rs, 0.05 * s)
	# the seat clamp's bolt
	m.tube(ST + Vector3(0.022 * s, -0.012 * s, -0.012 * s), ST + Vector3(-0.022 * s, -0.012 * s, -0.012 * s), 0.005 * s, 0.005 * s, "metal", 6)
	# decals: the head badge and the down tube's stickers
	if mats.has("sticker"):
		var fw := Vector3(0, -U.z, U.y).normalized()   # (perpendicular to the axis, forward)
		var hh := (rh * 2.0) / (HT - HB).length()
		m.patch(HB, HT, rh * 1.03, -1.0, 1.0, 0.5 - hh * 0.5, 0.5 + hh * 0.5, "sticker", 8, fw)
		if not step:
			var dl := (DT1 - BB).length()
			var tw := (rd * 1.8) / dl
			for sd: float in [1.0, -1.0]:
				for k in 3:
					var t0 := 0.42 + k * tw * 1.15
					m.patch(BB, DT1, rd * 1.03, -0.9, 0.9, t0, t0 + tw, "sticker", 6, Vector3(sd, 0.25, 0))
	_chain(f)
	if bool(L.get("chainguard", true)): _chainguard(m)
	if bool(L.get("mudguards", true)): _fender(m, f, RA, -112.0, 74.0, false)
	if bool(L.get("rack", true)): _rack(m)
	_rear_brake(m)
	# the rear reflector: on the mudguard's tail, or on the rack
	var tail := _guard_point(RA, -100.0, R + 0.022 * s)
	var back := Vector3(0, 0, -1)
	if bool(L.get("mudguards", true)):
		f.box(Transform3D(Basis.looking_at(back, Vector3.UP), tail + Vector3(0, 0.045 * s, -0.006 * s)), Vector3(0.038 * s, 0.022 * s, 0.008 * s), "red")
	# the kickstand's mount plate
	m.box(Transform3D(Basis(), KICK0), Vector3(0.016 * s, 0.03 * s, 0.05 * s), "metal")

# a point on a mudguard: angle from the top (degrees, + forward) round the axle
func _guard_point(c: Vector3, a_deg: float, r: float) -> Vector3:
	var a := deg_to_rad(a_deg)
	return c + Vector3(0, cos(a), sin(a)) * r

# a mudguard: a curved, shallow C-section strip over the tyre, with stays to the axle
func _fender(m: BikeMesh, f: BikeMesh, c: Vector3, a0: float, a1: float, front: bool) -> void:
	var rr := R + 0.024 * s
	var w := 0.052 * s
	var dp := 0.014 * s
	var th := 0.0028 * s
	var rings: Array = []
	var n := 28
	for i in n + 1:
		var a := deg_to_rad(lerpf(a0, a1, float(i) / n))
		var rad := Vector3(0, cos(a), sin(a))
		var ring := PackedVector3Array()
		# outer face across (left to right), then the inner face back
		var k := 9
		for j in k:
			var v := float(j) / (k - 1)
			var ang := lerpf(-PI * 0.5, PI * 0.5, v)
			ring.append(c + Vector3(-sin(ang) * w * 0.5, 0, 0) + rad * (rr - dp * (1.0 - cos(ang))))
		for j in k:
			var v := float(k - 1 - j) / (k - 1)
			var ang := lerpf(-PI * 0.5, PI * 0.5, v)
			ring.append(c + Vector3(-sin(ang) * (w * 0.5 - th), 0, 0) + rad * (rr - th - dp * (1.0 - cos(ang))))
		rings.append(ring)
	m.loft(rings, "guard", true, true)
	# pinstripes along both edges
	for sd: float in [1.0, -1.0]:
		var line: Array = []
		for i in n + 1:
			var a := deg_to_rad(lerpf(a0 + 6.0, a1 - 6.0, float(i) / n))
			var ang := sd * 0.62
			line.append(c + Vector3(-sin(ang) * w * 0.5, 0, 0) + Vector3(0, cos(a), sin(a)) * (rr - dp * (1.0 - cos(ang)) + 0.0009 * s))
		f.sweep(line, 0.0016 * s, "accent", 4)
	# stays: from the mudguard's edges to the axle, one pair
	var sa := lerpf(a0, a1, 0.18) if not front else lerpf(a0, a1, 0.62)
	for sd: float in [1.0, -1.0]:
		var top := _guard_point(c, sa, rr - dp * 0.4) + Vector3(sd * w * 0.47, 0, 0)
		var bot := c + Vector3(sd * (0.06 * s if not front else 0.052 * s), 0, 0)
		f.tube(top, bot, 0.0028 * s, 0.0028 * s, "metal", 6)

# the chain: a loop round the chainring and the cog, on the drive side (-X)
func _chain(f: BikeMesh) -> void:
	var x := -0.052 * s
	var A := Vector2(BB.z, BB.y)
	var B := Vector2(RA.z, RA.y)
	var r1 := ring_r * 0.97
	var r2 := cog_r * 0.97
	# outer tangents of two circles
	var d := B - A
	var D := d.length()
	var ang := atan2(d.y, d.x)
	var off := asin(clampf((r1 - r2) / D, -1.0, 1.0))
	var pts: Array = []
	var top_a := ang + PI * 0.5 + off      # the normal's angle for the top run
	var bot_a := ang - PI * 0.5 - off
	var t1 := A + Vector2(cos(top_a), sin(top_a)) * r1
	var t2 := B + Vector2(cos(top_a), sin(top_a)) * r2
	var b2 := B + Vector2(cos(bot_a), sin(bot_a)) * r2
	var b1 := A + Vector2(cos(bot_a), sin(bot_a)) * r1
	var push := func(v: Vector2): pts.append(Vector3(x, v.y, v.x))
	# top run, round the cog (the back), bottom run (with a little sag), round the ring (the front)
	for i in 8: push.call(t1.lerp(t2, i / 7.0))
	var a0 := top_a
	var a1 := bot_a
	while a1 > a0: a1 -= TAU
	for i in range(1, 10): push.call(B + Vector2(cos(lerpf(a0, a1, i / 10.0)), sin(lerpf(a0, a1, i / 10.0))) * r2)
	for i in 10:
		var p := b2.lerp(b1, i / 9.0)
		p.y -= sin(i / 9.0 * PI) * 0.008 * s
		push.call(p)
	var c0 := bot_a
	var c1 := top_a
	while c1 > c0: c1 -= TAU
	for i in range(1, 18): push.call(A + Vector2(cos(lerpf(c0, c1, i / 18.0)), sin(lerpf(c0, c1, i / 18.0))) * r1)
	# a flat band: the chain's profile is a thin upright rectangle (two sweeps)
	var length := 0.0
	for i in pts.size(): length += (pts[i] as Vector3).distance_to(pts[(i + 1) % pts.size()])
	chain_len = length
	f.sweep(pts, 0.0042 * s, "chain", 6, 0, true)

# a city bike's chain guard: a plate over the top run and round the front of the ring
func _chainguard(m: BikeMesh) -> void:
	var x0 := -0.03 * s
	var x1 := -0.08 * s
	var A := Vector2(BB.z, BB.y)
	var B := Vector2(RA.z, RA.y)
	var path: Array = []
	var gr := ring_r + 0.022 * s
	# round the ring's front from below the front to its top, then back along the top run
	for i in 9:
		var a := lerpf(-0.35, PI * 0.5, i / 8.0)
		path.append(A + Vector2(cos(a), sin(a)) * gr)
	var top0 := A + Vector2(0, gr)
	var top1 := B + Vector2(0.075 * s, cog_r + 0.02 * s)
	for i in range(1, 10): path.append(top0.lerp(top1, i / 9.0))
	var rings: Array = []
	for i in path.size():
		var p: Vector2 = path[i]
		var ring := PackedVector3Array()
		var th := 0.004 * s
		# a narrow inverted channel: outer wall, top, the inner lip; out and back
		var tang: Vector2 = (path[mini(i + 1, path.size() - 1)] - path[maxi(i - 1, 0)]).normalized()
		var nrm := Vector2(-tang.y, tang.x)   # out from the ring (up along the top run)
		if nrm.dot(p - A) < 0.0 and i < 9: nrm = -nrm
		if i >= 9 and nrm.y < 0.0: nrm = -nrm
		for k in [[x1, 0.0], [x1, 0.012 * s], [x0, 0.012 * s], [x0, 0.006 * s], [x0 + 0.002 * s, 0.006 * s], [x0 + 0.002 * s, 0.012 * s + th], [x1 - th, 0.012 * s + th], [x1 - th, 0.0]]:
			var q: Vector2 = p + nrm * float(k[1])
			ring.append(Vector3(float(k[0]), q.y, q.x))
		rings.append(ring)
	m.loft(rings, "guard", true, true)

# the rear rack: a platform over the rear wheel on legs to the axle, stays to the seat stays
func _rack(m: BikeMesh) -> void:
	var y := R * 2.0 + 0.045 * s
	var z0 := RA.z + 0.2 * s
	var z1 := RA.z - 0.17 * s
	var w := 0.07 * s
	var r := 0.0045 * s
	for sd: float in [1.0, -1.0]:
		var outer: Array = [Vector3(sd * w, y, z0), Vector3(sd * w, y, z1 + 0.02 * s), Vector3(sd * w * 0.7, y, z1)]
		m.sweep(outer, r, "metal", 6)
		# the leg: from the platform's back corner down to the axle, with a bend
		m.sweep([Vector3(sd * w, y, z1 + 0.025 * s), Vector3(sd * (w + 0.002 * s), y - 0.12 * s, RA.z - 0.08 * s), Vector3(sd * 0.07 * s, RA.y + 0.01 * s, RA.z - 0.012 * s)], r, "metal", 6)
		# a stay forward to the seat stay
		var sst := ST.lerp(RA + Vector3(0, 0.02 * s, 0), 0.3) + Vector3(sd * 0.022 * s, 0, 0)
		m.sweep([Vector3(sd * w, y, z0), sst], r * 0.9, "metal", 6)
	m.sweep([Vector3(w * 0.7, y, z1), Vector3(-w * 0.7, y, z1)], r, "metal", 6)
	for i in 4:
		var z := lerpf(z0, z1, (i + 0.5) / 4.0)
		m.tube(Vector3(w, y, z), Vector3(-w, y, z), r * 0.8, r * 0.8, "metal", 6)
	m.tube(Vector3(0, y, z0), Vector3(0, y, z1), r * 0.8, r * 0.8, "metal", 6)

# side-pull calipers: the rear one on the seat stay bridge
func _rear_brake(m: BikeMesh) -> void:
	var at := ST.lerp(RA, 0.42)
	_caliper(m, at, (RA - ST).normalized(), Vector3(0, 0, -1).cross(Vector3.RIGHT))

func _caliper(m: BikeMesh, at: Vector3, down: Vector3, _out: Vector3) -> void:
	for sd: float in [1.0, -1.0]:
		var a := at + Vector3(sd * 0.008 * s, 0, 0)
		var mid := at + down * 0.03 * s + Vector3(sd * 0.03 * s, 0, 0)
		var pad := at + down * 0.052 * s + Vector3(sd * 0.024 * s, 0, 0)
		m.sweep([a, mid, pad], 0.0035 * s, "metal", 6)
		m.box(Transform3D(Basis.looking_at(down.cross(Vector3.RIGHT).normalized() if absf(down.cross(Vector3.RIGHT).length()) > 0.01 else Vector3.FORWARD, Vector3.RIGHT), pad - Vector3(sd * 0.006 * s, 0, 0)), Vector3(0.006 * s, 0.01 * s, 0.03 * s), "rubber")

# ---------- the seat ----------
func _seat(P: Array) -> void:
	var m: BikeMesh = P[0]
	var f: BikeMesh = P[1]
	# (built at the seat tube's top as if the post were at its default; the node moves it)
	var o := ST
	var top := o + SDIR * post0
	m.tube(o - SDIR * 0.08 * s, top, 0.0125 * s, 0.0125 * s, "metal", 10)
	# the clamp and the rails' cradle
	m.lathe(top, SDIR, [Vector2(0.0135 * s, -0.004 * s), Vector2(0.016 * s, 0.0), Vector2(0.016 * s, 0.012 * s), Vector2(0.01 * s, 0.018 * s)], "metal", 10)
	var sad := top + Vector3(0, 0.055 * s, 0.02 * s)
	_saddle_top = sad + Vector3(0, 0.03 * s, -0.01 * s)
	# the saddle: lofted cross-sections from the nose to the back, a rolled leather edge
	var rings: Array = []
	var n := 12
	for i in n + 1:
		var u := float(i) / n               # 0 nose .. 1 back
		var z := lerpf(0.15, -0.115, u) * s
		var w := (0.022 + 0.085 * pow(sin(minf(u * 1.25, 1.0) * PI * 0.5), 2.2)) * s
		if u > 0.85: w *= 1.0 - (u - 0.85) * 0.6
		var h := (0.03 + 0.012 * u) * s
		var drop := (0.006 * sin(u * PI) - 0.004 * u) * s
		var ring := PackedVector3Array()
		var k := 14
		for j in k:
			var a := TAU * j / k
			# a domed top, a flatter, tucked-in underside
			var cx := sin(a)
			var cy := cos(a)
			var y := (cy * h * 0.5 if cy > 0.0 else cy * h * 0.35) + drop
			var x := cx * w * (1.0 if cy > -0.3 else 0.86)
			ring.append(sad + Vector3(x, y, z))
		rings.append(ring)
	m.loft(rings, "saddle", true, true)
	# the rails under it, and the classic springs at the back
	for sd: float in [1.0, -1.0]:
		var r0 := sad + Vector3(sd * 0.012 * s, -0.012 * s, 0.13 * s)
		var r1 := sad + Vector3(sd * 0.03 * s, -0.03 * s, 0.0)
		var r2 := sad + Vector3(sd * 0.05 * s, -0.035 * s, -0.08 * s)
		var r3 := sad + Vector3(sd * 0.06 * s, -0.018 * s, -0.1 * s)
		f.sweep([r0, r1, r2, r3], 0.0032 * s, "metal", 6)
		if String(L.get("style", "")) != "kid":
			f.helix(sad + Vector3(sd * 0.055 * s, -0.075 * s, -0.085 * s), sad + Vector3(sd * 0.055 * s, -0.022 * s, -0.09 * s), 0.011 * s, 0.0022 * s, 4.5, "metal")
			f.tube(sad + Vector3(sd * 0.055 * s, -0.078 * s, -0.085 * s), top + Vector3(sd * 0.012 * s, 0.006 * s, 0.0), 0.003 * s, 0.003 * s, "metal", 6)
		# rivets round the cantle
		for r in 3:
			var u := 0.88 + r * 0.04
			var z := lerpf(0.15, -0.115, u) * s
			f.disc(sad + Vector3(sd * (0.055 + r * 0.012) * s * 0.9, 0.012 * s, z), Vector3(sd * 0.3, 0.6, -0.75).normalized(), 0.0035 * s, "metal", 8)
	# the cantle's plate across the back
	f.sweep([sad + Vector3(0.07 * s, -0.008 * s, -0.11 * s), sad + Vector3(0.0, -0.004 * s, -0.124 * s), sad + Vector3(-0.07 * s, -0.008 * s, -0.11 * s)], 0.004 * s, "leather_dk", 6)
	_shift(m, -ST)
	_shift(f, -ST)

var _saddle_top := Vector3.ZERO

# ---------- steering: fork, bars, basket, lamp, front mudguard ----------
func _steer(P: Array) -> void:
	var m := BikeMesh.new()
	var f := BikeMesh.new()
	var fw := Vector3(0, -U.z, U.y).normalized()     # forward, perpendicular to the axis
	# headset cups at both ends of the head tube; the steerer above
	for e in [[HB, -1.0], [HT, 1.0]]:
		var o: Vector3 = e[0]
		var sg: float = e[1]
		m.lathe(o, U * sg, [Vector2(0.0215 * s, 0.0), Vector2(0.0235 * s, 0.003 * s), Vector2(0.0235 * s, 0.01 * s), Vector2(0.018 * s, 0.013 * s)], "metal", 14)
	# the quill stem: up out of the head tube, then forward to the bar clamp
	var q0 := HT + U * 0.012 * s
	var q1 := HT + U * 0.07 * s
	m.sweep([q0, q1, q1 + U * 0.012 * s + fw * 0.012 * s, BC + Vector3(0, 0.0, -0.012 * s), BC], 0.011 * s, "metal", 10)
	m.lathe(BC, Vector3.RIGHT, [Vector2(0.0145 * s, -0.022 * s), Vector2(0.016 * s, -0.018 * s), Vector2(0.016 * s, 0.018 * s), Vector2(0.0145 * s, 0.022 * s)], "metal", 12)
	# the fork crown and blades, curving forward at the ends to the dropouts
	var crown := HB - U * 0.018 * s
	m.box(Transform3D(Basis(Vector3.RIGHT, -acos(U.y) * signf(-U.z)), crown), Vector3(0.1 * s, 0.022 * s, 0.035 * s), "frame")
	for sd: float in [1.0, -1.0]:
		var pts: Array = []
		var top := crown + Vector3(sd * 0.042 * s, -0.008 * s, 0)
		var lo := FA + Vector3(sd * 0.05 * s, 0, 0)
		for i in 9:
			var u := i / 8.0
			var p := top.lerp(lo - fw * 0.05 * s, u)
			p += fw * 0.05 * s * pow(u, 3.0)
			pts.append(p)
		var rr: Array = []
		for i in 9: rr.append(lerpf(0.0125, 0.0068, i / 8.0) * s)
		m.sweep(pts, rr, "frame", 10)
		m.lathe(FA + Vector3(sd * 0.052 * s, 0, 0), Vector3.RIGHT, [Vector2(0.004 * s, -0.003 * s), Vector2(0.013 * s, -0.003 * s), Vector2(0.014 * s, 0.0), Vector2(0.013 * s, 0.003 * s), Vector2(0.004 * s, 0.003 * s)], "frame", 12)
		m.lathe(FA + Vector3(sd * 0.058 * s, 0, 0), Vector3.RIGHT * sd, [Vector2(0.007 * s, 0), Vector2(0.007 * s, 0.006 * s), Vector2(0.003 * s, 0.009 * s)], "metal", 6)
	# the handlebar: swept back to the grips
	for sd: float in [1.0, -1.0]:
		var g: Vector3 = GRIP[0 if sd > 0 else 1] + HB
		var inner := g + Vector3(-sd * 0.06 * s, 0, 0.022 * s)
		var bar := [BC, BC + Vector3(sd * 0.07 * s, 0.002 * s, 0.006 * s), BC + Vector3(sd * 0.14 * s, 0.012 * s, -0.01 * s),
			BC + Vector3(sd * 0.19 * s, 0.025 * s, -0.06 * s), inner + Vector3(-sd * 0.02 * s, -0.002 * s, 0.03 * s), inner, g + Vector3(sd * 0.065 * s, 0, -0.018 * s)]
		m.sweep(bar, 0.0115 * s, "metal", 10)
		# the grip: a turned shape with a flared end
		var gd: Vector3 = (g + Vector3(sd * 0.065 * s, 0, -0.018 * s) - inner).normalized()
		m.lathe(inner + gd * 0.004 * s, gd, [Vector2(0.013 * s, 0.0), Vector2(0.0165 * s, 0.006 * s), Vector2(0.0155 * s, 0.03 * s), Vector2(0.0165 * s, 0.07 * s),
			Vector2(0.0175 * s, 0.098 * s), Vector2(0.021 * s, 0.108 * s), Vector2(0.018 * s, 0.116 * s), Vector2(0.004 * s, 0.118 * s)], "grip", 14)
		# the brake lever: a clamp, then a blade forward and under the grip
		var cl := inner - gd * 0.012 * s
		m.lathe(cl, gd, [Vector2(0.0135 * s, -0.008 * s), Vector2(0.016 * s, -0.006 * s), Vector2(0.016 * s, 0.006 * s), Vector2(0.0135 * s, 0.008 * s)], "dark", 10)
		var lv := [cl + Vector3(0, -0.004 * s, 0.022 * s), cl + Vector3(0, -0.012 * s, 0.042 * s), cl + gd * 0.03 * s + Vector3(0, -0.02 * s, 0.05 * s), cl + gd * 0.09 * s + Vector3(0, -0.024 * s, 0.046 * s)]
		m.sweep(lv, [0.0045 * s, 0.004 * s, 0.0038 * s, 0.0035 * s], "metal", 8, 2)
		# its cable: out of the lever, a loop in front of the bars, down past the head tube
		var to: Vector3 = (HB - U * 0.03 * s + fw * 0.03 * s) if sd > 0 else (HT - U * 0.06 * s + Vector3(-0.024 * s, 0, 0))
		var cab := [cl + Vector3(0, -0.01 * s, 0.022 * s), cl + Vector3(-sd * 0.03 * s, -0.045 * s, 0.03 * s), BC + Vector3(sd * 0.07 * s, -0.07 * s, -0.035 * s),
			HT + Vector3(sd * 0.03 * s, 0.03 * s, -0.04 * s), HT + Vector3(sd * 0.028 * s, -0.04 * s, -0.01 * s), to]
		f.sweep(cab, 0.0026 * s, "cable", 5)
	# the front brake under the crown
	_caliper(m, crown - U * 0.012 * s + fw * 0.012 * s, -U, fw)
	# the bell, on the left of the bars
	var bell := String(L.get("bell", "dome"))
	if bell != "none":
		var bp: Vector3 = GRIP[0] + HB + Vector3(-0.08 * s, 0.0, 0.025 * s)
		m.lathe(bp, Vector3.RIGHT, [Vector2(0.0135 * s, -0.006 * s), Vector2(0.0155 * s, -0.004 * s), Vector2(0.0155 * s, 0.004 * s), Vector2(0.0135 * s, 0.006 * s)], "dark", 10)
		var bt := bp + Vector3(0, 0.022 * s, 0.006 * s)
		f.tube(bp + Vector3(0, 0.012 * s, 0), bt, 0.003 * s, 0.003 * s, "metal", 6)
		var big := 0.03 * s if bell == "dome" else 0.022 * s
		m.lathe(bt, Vector3.UP, [Vector2(big, 0.0), Vector2(big * 0.98, 0.006 * s), Vector2(big * 0.88, big * 0.55), Vector2(big * 0.62, big * 0.82), Vector2(big * 0.3, big * 0.95), Vector2(0.0, big * 0.98)], "bell", 18)
		m.lathe(bt + Vector3(0, big * 0.98, 0), Vector3.UP, [Vector2(0.004 * s, 0), Vector2(0.004 * s, 0.006 * s), Vector2(0.0, 0.008 * s)], "metal", 8)
		# the thumb lever
		f.sweep([bt + Vector3(-0.004 * s, 0.004 * s, -big * 0.6), bt + Vector3(-0.012 * s, 0.006 * s, -big * 1.25), bt + Vector3(-0.02 * s, 0.012 * s, -big * 1.45)], 0.0035 * s, "metal", 6, 2)
	# the lamp: a bullet lamp on a bracket in front of the crown
	var bk := String(L.get("basket", "wicker"))
	if bool(L.get("lamp", true)):
		var lp := crown + fw * 0.075 * s - U * 0.005 * s
		var mount := crown + fw * 0.012 * s
		if bk != "none":
			lp = Vector3(0, BC.y - 0.035 * s - 0.21 * s + 0.07 * s, BC.z + 0.12 * s + 0.02 * s + 0.125 * s + 0.045 * s)
			mount = lp - Vector3(0, 0, 0.045 * s)
			fw = Vector3(0, 0, 1)
		f.tube(mount, lp - fw * 0.03 * s, 0.004 * s, 0.004 * s, "metal", 6)
		m.lathe(lp - fw * 0.04 * s, fw, [Vector2(0.0, 0.0), Vector2(0.014 * s, 0.004 * s), Vector2(0.024 * s, 0.022 * s), Vector2(0.03 * s, 0.045 * s), Vector2(0.031 * s, 0.056 * s), Vector2(0.028 * s, 0.058 * s)], "metal", 18)
		f.disc(lp + fw * 0.0185 * s, fw, 0.0265 * s, "lens", 20)
	# the basket on the bars, on stays down to the front axle
	fw = Vector3(0, -U.z, U.y).normalized()
	if bk != "none": _basket(m, f, bk == "wicker", fw)
	# the front mudguard (in the fork's frame: built with the wheel straight)
	if bool(L.get("mudguards", true)): _fender(m, f, FA, -128.0, 52.0, true)
	# a white reflector at the front: on the basket's front, or the bars
	var rp := BC + fw * 0.03 * s + Vector3(0, -0.016 * s, 0)
	if bk != "none": rp = Vector3(0, BC.y - 0.035 * s - 0.06 * s, BC.z + 0.14 * s + 0.125 * s + 0.024 * s)
	f.box(Transform3D(Basis.looking_at(Vector3(0, 0, -1) if bk != "none" else -fw, Vector3.UP), rp), Vector3(0.05 * s, 0.024 * s, 0.006 * s), "white_ref")
	# made relative to the steering pivot
	_shift(m, -HB)
	_shift(f, -HB)
	P[0].surf = m.surf
	P[1].surf = f.surf

func _shift(m: BikeMesh, d: Vector3) -> void:
	for k in m.surf:
		var v: PackedVector3Array = m.surf[k].v
		for i in v.size(): v[i] += d
		m.surf[k].v = v

func _basket(m: BikeMesh, f: BikeMesh, wicker: bool, fw: Vector3) -> void:
	var w := 0.34 * s
	var d := 0.25 * s
	var h := 0.21 * s
	var c := BC + fw * 0.12 * s + Vector3(0, -0.035 * s, 0)
	var floor_y := c.y - h
	var zc := c.z + 0.02 * s
	var corner := func(fx: float, fz: float, y: float, flare: float) -> Vector3:
		return Vector3(fx * (w * 0.5 + flare), y, zc + fz * (d * 0.5 + flare))
	# the weave: a loft of rings from the floor up, rounded corners, flaring out
	var ring_at := func(y: float, flare: float, inset: float) -> PackedVector3Array:
		var r := PackedVector3Array()
		var k := 28
		for j in k:
			var a := -TAU * j / k
			var dx := cos(a)
			var dz := sin(a)
			# a superellipse: a rounded rectangle
			var px := signf(dx) * pow(absf(dx), 0.35)
			var pz := signf(dz) * pow(absf(dz), 0.35)
			r.append(Vector3(px * (w * 0.5 + flare - inset), y, zc + pz * (d * 0.5 + flare - inset)))
		return r
	if wicker:
		var rings: Array = []
		for i in 6:
			var u := i / 5.0
			rings.append(ring_at.call(floor_y + u * h, u * 0.018 * s, 0.0))
		# the inside wall, top down
		for i in 6:
			var u := 1.0 - i / 5.0
			rings.append(ring_at.call(floor_y + u * h + (0.0 if i else 0.0), u * 0.018 * s, 0.007 * s))
		m.loft(rings, "basket", true, true)
		# the rim's rolled edge and the base's band
		var rim: Array = []
		for p in ring_at.call(c.y + 0.002 * s, 0.0185 * s, 0.0035 * s): rim.append(p)
		m.sweep(rim, 0.0095 * s, "basket", 8, 0, true)
		var base: Array = []
		for p in ring_at.call(floor_y + 0.006 * s, 0.001 * s, 0.002 * s): base.append(p)
		m.sweep(base, 0.0075 * s, "basket", 8, 0, true)
		# the handles' hoops on the sides
		for sd: float in [1.0, -1.0]:
			var hp: Array = []
			for i in 7:
				var a := PI * i / 6.0
				hp.append(Vector3(sd * (w * 0.5 + 0.024 * s), c.y - 0.04 * s + sin(a) * 0.035 * s, zc + cos(a) * 0.05 * s))
			f.sweep(hp, 0.004 * s, "basket", 6)
	else:
		# a wire basket: rings and uprights
		for i in 4:
			var u := i / 3.0
			var r: Array = []
			for p in ring_at.call(floor_y + u * h, u * 0.012 * s, 0.0): r.append(p)
			(m if i == 3 else f).sweep(r, (0.004 if i == 3 else 0.0025) * s, "basket", 6, 0, true)
		var lo: PackedVector3Array = ring_at.call(floor_y, 0.0, 0.0)
		var hi: PackedVector3Array = ring_at.call(c.y, 0.012 * s, 0.0)
		for j in range(0, lo.size(), 2): f.tube(lo[j], hi[j], 0.0022 * s, 0.0022 * s, "basket", 5)
		var fl: Array = []
		for j in lo.size(): fl.append(lo[j])
		for k2 in 5:
			var x := lerpf(-w * 0.45, w * 0.45, k2 / 4.0)
			f.tube(Vector3(x, floor_y, zc - d * 0.46), Vector3(x, floor_y, zc + d * 0.46), 0.0022 * s, 0.0022 * s, "basket", 5)
	# mounts: a clamp to the bars, two stays to the axle
	m.tube(BC + Vector3(0.05 * s, 0, 0.0), corner.call(0.4, -1.0, c.y - 0.03 * s, 0.0), 0.004 * s, 0.004 * s, "metal", 6)
	m.tube(BC + Vector3(-0.05 * s, 0, 0.0), corner.call(-0.4, -1.0, c.y - 0.03 * s, 0.0), 0.004 * s, 0.004 * s, "metal", 6)
	for sd: float in [1.0, -1.0]:
		f.tube(Vector3(sd * w * 0.32, floor_y, zc + d * 0.1), FA + Vector3(sd * 0.062 * s, 0.004 * s, 0), 0.0035 * s, 0.0035 * s, "metal", 6)

# ---------- wheels ----------
func _wheel(P: Array, front: bool) -> void:
	var m: BikeMesh = P[0]
	var f: BikeMesh = P[1]
	var o := Vector3.ZERO
	var X := Vector3.RIGHT
	var rim_o := R - 0.026 * s       # the rim's outer edge (under the tyre)
	var rim_i := rim_o - 0.02 * s
	var hw := 0.012 * s
	# the rim: a box section with a bead hook, a little groove for the brake track
	m.lathe(o, X, [Vector2(rim_i, -hw * 0.6), Vector2(rim_i + 0.004 * s, -hw), Vector2(rim_o - 0.002 * s, -hw), Vector2(rim_o + 0.0015 * s, -hw * 1.08),
		Vector2(rim_o + 0.0015 * s, hw * 1.08), Vector2(rim_o - 0.002 * s, hw), Vector2(rim_i + 0.004 * s, hw), Vector2(rim_i, hw * 0.6), Vector2(rim_i - 0.0015 * s, 0.0)], "metal", 56)
	# the tyre: the tread round the top of its profile, the sidewalls below
	var tr := 0.0215 * s
	var tc := R - tr
	m.torus(o, X, tc, tr, "tyre", 64, 8, -PI * 0.42, PI * 0.42)
	m.torus(o, X, tc, tr, "wall", 64, 5, PI * 0.42, PI * 0.95)
	m.torus(o, X, tc, tr, "wall", 64, 5, -PI * 0.95, -PI * 0.42)
	# the hub: barrel and flanges
	var hl := 0.05 * s
	m.lathe(o, X, [Vector2(0.006 * s, -hl - 0.012 * s), Vector2(0.009 * s, -hl - 0.01 * s), Vector2(0.01 * s, -hl), Vector2(0.03 * s, -hl + 0.004 * s), Vector2(0.03 * s, -hl + 0.008 * s),
		Vector2(0.016 * s, -hl + 0.014 * s), Vector2(0.0145 * s, 0.0), Vector2(0.016 * s, hl - 0.014 * s), Vector2(0.03 * s, hl - 0.008 * s), Vector2(0.03 * s, hl - 0.004 * s),
		Vector2(0.01 * s, hl), Vector2(0.009 * s, hl + 0.01 * s), Vector2(0.006 * s, hl + 0.012 * s)], "metal", 18)
	# 28 spokes, laced tangentially (each crosses others on its way out)
	var n := 28
	for i in n:
		var side := 1.0 if i % 2 == 0 else -1.0
		var ah := TAU * i / n
		var cross := (0.55 if (i / 2) % 2 == 0 else -0.55)
		var ar := ah + cross
		var hp := o + X * side * (hl - 0.006 * s) + Vector3(0, cos(ah), sin(ah)) * 0.026 * s
		var rp := o + X * side * 0.003 * s + Vector3(0, cos(ar), sin(ar)) * (rim_i + 0.002 * s)
		f.tube(hp, rp, 0.0011 * s, 0.0011 * s, "steel", 4)
		f.tube(rp, rp + (rp - o).normalized() * 0.006 * s, 0.0024 * s, 0.0024 * s, "steel", 5)   # the nipple
	# the valve, through the rim (a cap)
	var va := 0.3
	var vd := Vector3(0, cos(va), sin(va))
	f.tube(o + vd * (rim_i - 0.002 * s), o + vd * (rim_i - 0.022 * s), 0.0032 * s, 0.0028 * s, "metal", 6)
	f.tube(o + vd * (rim_i - 0.022 * s), o + vd * (rim_i - 0.032 * s), 0.0036 * s, 0.0034 * s, "dark", 6)
	# a reflector clipped to two spokes
	var ra := PI * 0.75
	var rpc := o + Vector3(0, cos(ra), sin(ra)) * (rim_i * 0.62)
	f.box(Transform3D(Basis(Vector3.RIGHT, -ra), rpc), Vector3(0.006 * s, 0.022 * s, 0.05 * s), "amber" if front else "white_ref")

func _cog(P: Array) -> void:
	var f: BikeMesh = P[1]
	f.sprocket(Vector3(-0.052 * s, 0, 0), Vector3.RIGHT, 0.018 * s, cog_r + 0.004 * s, teeth[1], 0.004 * s, "steel")
	f.lathe(Vector3(-0.046 * s, 0, 0), Vector3.RIGHT, [Vector2(0.012 * s, -0.004 * s), Vector2(0.02 * s, -0.003 * s), Vector2(0.02 * s, 0.003 * s), Vector2(0.012 * s, 0.004 * s)], "dark", 12)

func _crank(P: Array) -> void:
	var m: BikeMesh = P[0]
	var f: BikeMesh = P[1]
	# the chainring on the drive side, with a five-arm spider
	f.sprocket(Vector3(-0.052 * s, 0, 0), Vector3.RIGHT, ring_r * 0.8, ring_r + 0.004 * s, teeth[0], 0.0035 * s, "metal")
	for i in 5:
		var a := TAU * i / 5.0 + 0.3
		var d := Vector3(0, cos(a), sin(a))
		m.tube(Vector3(-0.05 * s, 0, 0) + d * 0.015 * s, Vector3(-0.052 * s, 0, 0) + d * ring_r * 0.82, 0.0055 * s, 0.0042 * s, "metal", 8)
	# the arms (the right one points up at crank 0, the left one down) and the axle's caps
	for sd: float in [1.0, -1.0]:
		var x := sd * 0.068 * s
		var tip := Vector3(x, CRANK * -sd, 0)
		m.sweep([Vector3(x * 0.82, 0, 0), Vector3(x, CRANK * -sd * 0.15, 0), tip], [0.011 * s, 0.009 * s, 0.0075 * s], "metal", 10, 3)
		m.lathe(Vector3(x * 0.82, 0, 0), Vector3.RIGHT * sd, [Vector2(0.013 * s, -0.004 * s), Vector2(0.014 * s, 0.0), Vector2(0.012 * s, 0.006 * s), Vector2(0.0, 0.008 * s)], "metal", 12)
	m.tube(Vector3(-0.06 * s, 0, 0), Vector3(0.06 * s, 0, 0), 0.008 * s, 0.008 * s, "metal", 8)

func _pedal(P: Array, sd: float) -> void:
	var m: BikeMesh = P[0]
	var f: BikeMesh = P[1]
	var x0 := sd * 0.07 * s
	var x1 := sd * 0.165 * s
	# the spindle, the body's cage and its rubber blocks, the reflectors
	m.tube(Vector3(x0, 0, 0), Vector3(x1, 0, 0), 0.0055 * s, 0.0055 * s, "metal", 8)
	var c := Vector3((x0 + x1) * 0.5 + sd * 0.008 * s, 0, 0)
	for e: float in [-1.0, 1.0]:
		m.sweep([c + Vector3(-sd * 0.045 * s, 0.0, e * 0.03 * s), c + Vector3(sd * 0.045 * s, 0.0, e * 0.03 * s)], 0.004 * s, "metal", 6, 3)
	f.box(Transform3D(Basis(), c + Vector3(0, 0.002 * s, 0)), Vector3(0.085 * s, 0.016 * s, 0.05 * s), "rubber")
	for e: float in [-1.0, 1.0]:
		f.box(Transform3D(Basis(), c + Vector3(0, 0, e * 0.034 * s)), Vector3(0.05 * s, 0.009 * s, 0.006 * s), "amber")

func _kickstand(P: Array) -> void:
	var m: BikeMesh = P[0]
	var f: BikeMesh = P[1]
	# built pointing straight down (-Y) from the pivot; kick_pose turns it
	var len := Vector3(0.16 * s, 0.0, KICK0.z - 0.06 * s).distance_to(KICK0)
	m.lathe(Vector3.ZERO, Vector3.RIGHT, [Vector2(0.012 * s, -0.008 * s), Vector2(0.014 * s, -0.006 * s), Vector2(0.014 * s, 0.006 * s), Vector2(0.012 * s, 0.008 * s)], "metal", 12)
	m.sweep([Vector3(0, -0.006 * s, 0), Vector3(0, -len * 0.5, 0.004 * s), Vector3(0, -len + 0.008 * s, 0)], [0.0075 * s, 0.0068 * s, 0.006 * s], "metal", 8)
	f.box(Transform3D(Basis(), Vector3(0, -len + 0.004 * s, 0.006 * s)), Vector3(0.022 * s, 0.008 * s, 0.03 * s), "rubber")

# ---------- the frame's moving parts ----------
# steer: radians (+ = to the rider's left); wheel angles: radians rolled forward;
# crank: radians (pedalling forward); kick 0 up .. 1 down; pitch_l / _r: the feet's
# pitch on the pedals (radians, + toes up)
func pose(st: float, wf: float, wr: float, cr: float, k: float, pitch_l := 0.0, pitch_r := 0.0) -> void:
	steer_a = st
	steer.transform.basis = Basis(U, st)
	# a wheel rolling forward turns about +X (the top goes forward)
	wheel_f.transform.basis = Basis(Vector3.RIGHT, wf)
	wheel_r.transform.basis = Basis(Vector3.RIGHT, wr)
	crank.transform.basis = Basis(Vector3.RIGHT, cr)
	var ratio := float(teeth[0]) / float(teeth[1])
	cog.transform.basis = Basis(Vector3.RIGHT, cr * ratio)
	# the pedals keep their own pitch: undo the crank's turn
	pedal_l.transform.basis = Basis(Vector3.RIGHT, -cr + pitch_l)
	pedal_r.transform.basis = Basis(Vector3.RIGHT, -cr + pitch_r)
	chain_mat.set_shader_parameter("chain_off", cr * ring_r)
	if k != _kick:
		_kick = k
		var d := KICK_UP.slerp(KICK_DN, clampf(k, 0.0, 1.0)).normalized()
		kick.transform.basis = Basis(Quaternion(Vector3.DOWN, d))

# ---------- points for the rider (bike-local, at this frame's pose) ----------
func saddle() -> Vector3:
	return _saddle_top + SDIR * (post - post0)

# the seatpost out to fit a rider whose sitting bones should be at this height
func fit(saddle_y: float) -> void:
	var d := (saddle_y - _saddle_top.y) / SDIR.y
	post = clampf(post0 + d, 0.05 * s, 0.26 * s)
	seat.position = ST + SDIR * (post - post0)

func grip(sd: float) -> Vector3:
	return HB + Basis(U, steer_a) * (GRIP[0] if sd > 0.0 else GRIP[1])

# the pedal's top centre (the sole rests here)
func pedal(sd: float) -> Vector3:
	var p := (pedal_l if sd > 0.0 else pedal_r)
	return crank.transform * (p.transform * Vector3(sd * 0.125 * s, 0.012 * s, 0.0))

func pedal_axis(sd: float) -> Vector3:
	var p := (pedal_l if sd > 0.0 else pedal_r)
	return crank.transform * (p.transform * Vector3(sd * 0.125 * s, 0, 0))

# the kickstand's tip on the ground side (for the parked lean)
func kick_tip() -> Vector3:
	return KICK0 + KICK_DN * Vector3(0.16 * s, 0.0, KICK0.z - 0.06 * s).distance_to(KICK0)

# radius of the wheel for rolling
func wheel_r_m() -> float:
	return R
