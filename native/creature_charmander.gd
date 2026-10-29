class_name CreatureCharmander
extends CreatureRig
# Charmander, Charmeleon and Charizard, up on their hind legs. Rig: Waist - Hips -
# L/RThigh - Leg - Foot - Toe, Tail1 .. Tail6 / 7 and the flame on its tip (TailA01 ..
# A03 / A04: the mesh "flame", drawn as fire by shaders/creature_flame.gdshader);
# Spine1 - Spine2 - Neck(1 - 3) - Head (Jaw, Charizard's Tongue), L/RShoulder - Arm -
# ForeArm - Hand - Fingers; Charizard's wings L/RFeeler1 .. 6 off Spine1.
# The tail flame is its life, as in the anime: it flickers always, burns up bigger
# when it is excited or angry (and blazes when it attacks with fire), sinks low and
# dim when it is hurt, asleep or worn out, and is a small ember when it faints.
#   c.flame      0 out .. 1 its normal burn .. 2 a blaze (the flame now); flame_mood
#                (default 1) the owner's own scale on it (low HP: less)
# Charizard flies (as Fearow: flying / fly_height, takeoff / fly / glide / land), the
# wings beating (signal wing_beat), the body leaning into the air, the legs tucked.
# Moods (besides CreatureRig's): ember, flamethrower (a stream from the mouth:
# fx("flame") each puff), fire_spin, flame_burst / fire_blast / inferno (fx("blast")),
# heat_wave (Charizard: the wings beat hot air: fx("heat_wave")), dragon_rage /
# dragon_breath (fx("dragon")), smokescreen (fx("smoke")), scratch_attack, slash,
# fury_swipes, metal_claw (the claws: fx("slash")), fire_fang (a bite in flames),
# flare_blitz (wreathed in fire, a charge), rage, scary_face, leer, growl, tail_whip,
# wing_attack, fly, seismic_toss (Charizard).
# Points: "flame" (the tail flame's heart), "mouth", "head", "hand_l", "hand_r", "wing_l", "wing_r".

signal wing_beat(power: float)

var FLAME := PackedInt32Array()   # the flame bones on the tail tip
var flame := 1.0
var flame_mood := 1.0
var flame_s := Vector2(1.0, 0.0)
var wings := []                   # Charizard: per side {chain, sg, open}
var flying := false
var fly_height := 2.0
var glide := false
var fly_w := 0.0
var flap := 0.0
var beat_phase := 0.0
var _act_h0 := 0.0

func _rig_ready() -> void:
	durs.merge({"flamethrower": 2.2, "fire_spin": 2.2, "flame_burst": 1.6, "fire_blast": 2.0, "inferno": 2.2,
		"heat_wave": 2.2, "dragon_rage": 1.8, "dragon_breath": 1.6, "smokescreen": 1.4, "slash": 1.0, "fury_swipes": 1.8,
		"metal_claw": 1.1, "fire_fang": 1.1, "flare_blitz": 1.8, "rage": 1.8, "scary_face": 1.4, "wing_attack": 1.4,
		"takeoff": 1.6, "land": 1.6, "seismic_toss": 2.6, "dragon_claw": 1.2}, true)
	for nm in ["TailA01", "TailA02", "TailA03", "TailA04"]:
		if b(nm) >= 0: FLAME.append(b(nm))
	# the flame bones are not tail: the tail's chain stops at them
	if not tails.is_empty() and not FLAME.is_empty():
		var ch: PackedInt32Array = tails[0].chain
		var keep := PackedInt32Array()
		for k in ch:
			if not FLAME.has(k): keep.append(k)
		tails[0].chain = keep
	for s in [["L", 1.0], ["R", -1.0]]:
		if b(s[0] + "Feeler1") >= 0:
			wings.append({"chain": _chain(s[0] + "Feeler1"), "sg": s[1], "open": Vector2.ZERO})

func point(n: String) -> Vector3:
	match n:
		"flame":
			if not FLAME.is_empty(): return to_world(G[FLAME[mini(1, FLAME.size() - 1)]].origin)
		"wing_l", "wing_r":
			for w in wings:
				if (w.sg > 0.0) == (n == "wing_l"):
					var ch: PackedInt32Array = w.chain
					return to_world(G[ch[ch.size() - 1]].origin)
	return super.point(n)

func mood(what: String) -> void:
	if wings.is_empty() or not what in ["fly", "glide", "land"]:
		super.mood(what)
		return
	match what:
		"fly", "glide":
			glide = what == "glide"
			if not flying: super.mood("takeoff")
		"land":
			if flying or height > 0.01: super.mood("land")

func _act_start(what: String) -> void:
	_act_h0 = height
	if what == "takeoff" or (what == "flee" and not wings.is_empty()): flying = true

func _end_act() -> void:
	if act == "land": flying = false
	super._end_act()

func _reset_now() -> void:
	super._reset_now()
	height = fly_height if flying else 0.0
	_hv = Vector2(height, 0.0)
	fly_w = 1.0 if flying else 0.0

# ---------- the flame's heat this frame ----------
func _base_species(P: Dictionary, dt: float, v: float) -> void:
	P.merge({"flame": 1.0, "open": 0.0, "el": 0.0, "sw": 0.0, "flapw": 0.0, "spin": 0.0}, true)
	P.flame += 0.25 * battle_w + 0.15 * run_w - 0.35 * sleep_w - 0.25 * hide_w
	if emote == "happy": P.flame += 0.2
	if emote == "angry": P.flame += 0.5
	if emote == "sad": P.flame -= 0.35
	if fainted: P.flame = lerpf(float(P.flame), 0.25, faint_w)
	if not wings.is_empty():
		P.open = 0.15 * battle_w
		if flying or fly_w > 0.001:
			if act == "": fly_w = damp(fly_w, 1.0 if flying else 0.0, 3.0, dt)
			P.air = fly_w
			P.legs = "tuck"
			var cruise := sm(0.3, 3.0, v)
			P.pitch += fly_w * lerpf(0.25, 0.9, cruise)
			P.lean -= fly_w * 0.15
			P.tp -= fly_w * 0.2
			P.open = maxf(float(P.open), fly_w)
			if glide and act == "": P.el = 0.1 + sin(t * 1.3) * 0.05
			else: P.flapw = fly_w
	_height(P, dt)

func _height(P: Dictionary, dt: float) -> void:
	if wings.is_empty(): return
	var want := fly_height if flying else 0.0
	match act:
		"takeoff":
			var e := sm(0.25, act_dur, act_t)
			_hv = Vector2(lerpf(_act_h0, fly_height, e * e * (3.0 - 2.0 * e)) + 0.2 * sz * sm(0.22, 0.4, act_t) * (1.0 - e), 0.0)
		"land":
			var e := sm(0.0, 1.0, act_t)
			_hv = Vector2(_act_h0 * (1.0 - e) * (1.0 - e * 0.3) if act_t < 1.0 else 0.0, 0.0)
		"seismic_toss":
			var up := bump(act_t, 0.4, 2.3)
			_hv = Vector2(_act_h0 + fly_height * 1.3 * up, 0.0)
		_:
			_hv = spring(_hv, want, 2.5, dt, 1.0)
	height = maxf(0.0, _hv.x)
	if height > 0.03: P.air = 1.0; P.legs = "tuck"

func _act_species(P: Dictionary, dt: float, u: float, d: float) -> bool:
	var env := sm(0.0, 0.15, u) * sm(d, d - 0.3, u)
	match act:
		"ember", "flamethrower", "fire_spin", "dragon_breath", "smokescreen":
			# a breath in (reared back, the flame flaring), then the fire from the mouth
			var load := bump(u, 0.0, 0.5)
			var blow := sm(0.4, 0.52, u) * sm(d, d - 0.3, u)
			P.lean += -0.25 * load + 0.25 * blow
			P.hp = 0.35 * load - 0.15 * blow
			P.hfwd += 0.12 * sz * blow
			P.jaw = 1.0 * blow
			P.mouth = "wide"
			P.eye = "angry"
			P.flame += 0.6 * load + 0.9 * blow * (0.0 if act == "smokescreen" else 1.0)
			P.tp += 0.3 * load
			for i in 2: P.arm_up[i] += 0.6 * load; P.elbow[i] += 0.8 * env
			if act == "fire_spin":
				P.hy = sin(u * TAU * 1.2) * 0.5 * blow
			var what: String = {"ember": "ember", "flamethrower": "flame", "fire_spin": "fire_spin", "dragon_breath": "dragon", "smokescreen": "smoke"}[act]
			var nb := 3 if act == "ember" else 8
			for k in nb:
				if _ev("f%d" % k, 0.5 + k * (d - 0.8) / nb): fx.emit(what, point("mouth"))
			if _ev("hit", 0.65): impact.emit(act)
		"flame_burst", "fire_blast", "inferno", "dragon_rage":
			var load := sm(0.0, 0.6, u) * (1.0 - sm(0.75, 0.85, u))
			var rel := sm(0.75, 0.85, u) * sm(d, d - 0.4, u)
			P.lean += -0.35 * load + 0.3 * rel
			P.hp = 0.5 * load - 0.2 * rel
			P.jaw = 0.3 * load + 1.1 * rel
			P.mouth = "wide"
			P.eye = "squeeze" if load > 0.3 else "angry"
			P.flame += 1.2 * (load + rel)
			P.y += sin(u * 60.0) * 0.006 * sz * load
			for i in 2: P.arm_up[i] += 0.9 * load + 0.4 * rel; P.arm_out[i] += 0.6 * load
			if _ev("c", 0.3): fx.emit("charge", point("mouth"))
			if _ev("hit", 0.85):
				impact.emit(act)
				fx.emit("dragon" if act == "dragon_rage" else "blast", point("mouth"))
		"heat_wave", "wing_attack":
			# the wings swept forward (heat wave: beat, hot air), or a swoop wings-first
			var k := sm(0.0, 0.2, u) * sm(d, d - 0.3, u)
			P.open = maxf(float(P.open), k)
			if act == "heat_wave":
				var beat := fposmod(u * 1.6, 1.0)
				P.el = 0.9 - 1.6 * sm(0.4, 0.75, beat)
				P.sw = -0.5 * sm(0.4, 0.75, beat)
				P.flame += 0.8 * k
				P.jaw = 0.4 * k
				for n in 3:
					if _ev("w%d" % n, 0.35 + n / 1.6): fx.emit("heat_wave", point("chest")); wing_beat.emit(1.0)
			else:
				var go := sm(0.2, 0.55, u) * (1.0 - sm(0.8, d - 0.1, u))
				P.fwd += act_reach * go
				P.y += 0.4 * sz * bump(u, 0.1, 0.6)
				P.air = 1.0 if go > 0.1 else P.air
				P.legs = "tuck"
				P.lean += 0.4 * go
				P.sw = -0.6 * bump(u, 0.45, 0.8) + 0.5 * bump(u, 0.15, 0.45)
				P.el = 0.6 * bump(u, 0.15, 0.45) - 0.4 * bump(u, 0.45, 0.8)
				if _ev("hit", 0.6):
					impact.emit(act)
					fx.emit("slash", point("wing_l"))
			P.eye = "angry"
		"slash", "fury_swipes", "metal_claw", "dragon_claw":
			var n := 3 if act == "fury_swipes" else 1
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.2, u)
			P.fwd += 0.35 * act_reach * k
			P.lean += 0.25 * k
			P.eye = "angry"
			P.mouth = "frown"
			P.flame += 0.4 * k
			for m in n:
				var at := 0.45 if n == 1 else 0.35 + m * 0.4
				var wind := bump(u, at - 0.28, at)
				var hit := bump(u, at - 0.04, at + 0.2)
				var j := m % 2
				P.arm_up[j] += 2.3 * wind + 0.3 * hit
				P.arm_out[j] += 0.8 * wind
				P.arm_in[j] += 1.3 * hit
				P.twist += (0.45 * wind - 0.55 * hit) * (1.0 if j == 0 else -1.0)
				if _ev("h%d" % m, at):
					impact.emit(act)
					fx.emit("metal" if act == "metal_claw" else "slash", point("hand_l" if j == 0 else "hand_r"))
		"fire_fang":
			var c0 := 0.35 * d
			var c1 := 0.5 * d
			var load := sm(0.0, c0, u) * (1.0 - sm(c0, c1, u))
			var lunge := sm(c0, c1, u) * (1.0 - sm(c1 + 0.12, d - 0.05, u))
			P.lean += -0.2 * load + 0.4 * lunge
			P.fwd += act_reach * 0.8 * lunge
			P.jaw = 1.1 * sm(0.0, c0, u) * (1.0 - sm(c1 - 0.03, c1 + 0.02, u))
			P.mouth = "wide"
			P.eye = "angry"
			P.flame += 0.8 * (load + lunge)
			if _ev("f", c0): fx.emit("ember", point("mouth"))
			if _ev("hit", c1):
				impact.emit(act)
				fx.emit("bite", point("mouth"))
		"flare_blitz":
			# wreathed in flame, a charge into the target
			var k := sm(0.0, 0.4, u) * sm(d, d - 0.3, u)
			P.flame += 1.5 * k
			_strike(P, dt, u, d, 0.8, true)
			if _ev("w", 0.2): fx.emit("flare", point("chest"))
		"rage", "scary_face":
			var k := sm(0.0, 0.15, u) * sm(d, d - 0.25, u)
			P.crouch += 0.3 * k
			P.lean += 0.25 * k
			P.hp = -0.25 * k
			P.jaw = 0.4 * k
			P.mouth = "wide"
			P.eye = "angry"
			P.flame += 0.9 * k
			P.y += sin(u * 50.0) * 0.006 * sz * k
			for i in 2: P.arm_up[i] += 0.9 * k; P.arm_out[i] += 0.5 * k; P.elbow[i] += 0.8 * k
			if _ev("g", 0.3): fx.emit("glare", point("head"))
		"takeoff", "flee":
			if wings.is_empty(): return false
			var cr := bump(u, 0.0, 0.3)
			P.crouch += 0.8 * cr
			fly_w = sm(0.2, 0.8, u)
			P.air = sm(0.22, 0.28, u)
			P.legs = "tuck"
			P.open = maxf(float(P.open), sm(0.0, 0.2, u))
			P.flapw = sm(0.08, 0.25, u) * 1.2
			P.flame += 0.3
		"land":
			if wings.is_empty(): return false
			fly_w = 1.0 - sm(0.8, 1.0, u)
			P.air = 1.0 - sm(0.95, 1.0, u)
			P.legs = "plant" if u > 0.7 else "tuck"
			P.open = 1.0 - sm(1.0, 1.4, u)
			P.flapw = 1.0 - sm(0.9, 1.1, u)
			P.lean -= 0.3 * bump(u, 0.3, 1.1)
			P.crouch += 0.6 * bump(u, 0.95, 1.4)
			if _ev("touch", 1.0): footfalls += 1
		"seismic_toss":
			if wings.is_empty(): return false
			# a grab, up into the sky spinning, the throw down
			var k := sm(0.0, 0.3, u) * sm(d, d - 0.4, u)
			P.fwd += act_reach * 0.8 * sm(0.0, 0.3, u) * (1.0 - sm(2.2, d, u))
			P.open = k
			P.flapw = k
			P.air = 1.0 if u > 0.35 and u < 2.35 else 0.0
			P.legs = "tuck"
			P.spin = TAU * 2.0 * sm(0.8, 1.8, u)
			for i in 2: P.arm_up[i] += 1.2 * k; P.arm_in[i] += 0.9 * k
			P.eye = "angry"
			if _ev("g", 0.3): impact.emit("grab")
			if _ev("hit", 2.2):
				impact.emit(act)
				fx.emit("quake", global_position + global_transform.basis.z * act_reach)
		_:
			return false
	return true

func _body(P: Dictionary, dt: float) -> void:
	super._body(P, dt)
	var sp := float(P.get("spin", 0.0))
	if absf(sp) > 0.001:
		var B: Basis = _tg[W]
		set_global(W, Basis(Vector3.UP, sp) * B)
		_Tw = Transform3D(Basis(Vector3.UP, sp) * B, _Tw.origin)

func _after(P: Dictionary, dt: float) -> void:
	# the flame: its size (the flame bones scaled) and heat (the shader), always flickering
	flame = clampf(float(P.flame) * flame_mood, 0.0, 2.2)
	if act == "hurt" or act == "flinch": flame *= 0.6
	flame_s = spring(flame_s, flame, 9.0, dt, 0.6)
	var f := flame_s.x
	var fl := 1.0 + 0.08 * sin(t * 17.0) + 0.05 * sin(t * 29.0 + 1.0)
	if not FLAME.is_empty():
		skel.set_bone_pose_scale(FLAME[0], Vector3(0.55 + 0.45 * f, 0.4 + 0.6 * f * fl, 0.55 + 0.45 * f))
		for k in range(1, FLAME.size()): turn_rest(FLAME[k], Vector3.RIGHT, sin(t * 11.0 + k) * 0.08 + tail_p.y * 0.01)
	for m in flames:
		m.set_shader_parameter("power", f * fl)
		m.set_shader_parameter("flicker", 0.6 + 0.4 * f)
	_wings(P, dt)

# Charizard's wings: open 0 folded back along its sides .. 1 spread; el raised (+), sw
# swept back (+); beating when P.flapw
func _wings(P: Dictionary, dt: float) -> void:
	if wings.is_empty(): return
	var el := float(P.el)
	var sw := float(P.sw)
	var flw := float(P.flapw)
	if flw > 0.001:
		var f0 := flap
		flap += lerpf(2.2, 2.8, flw) * dt
		var ph := fposmod(flap, 1.0)
		beat_phase = ph
		if floor(flap - 0.3) > floor(f0 - 0.3): wing_beat.emit(0.7)
		var down := sm(0.0, 0.45, ph) * (1.0 - sm(0.45, 1.0, ph))
		el = lerpf(el, lerpf(0.9, -0.7, sm(0.0, 0.45, ph)) if ph < 0.45 else lerpf(-0.7, 0.9, sm(0.45, 1.0, ph)), flw)
		sw = lerpf(sw, 0.25 * sin(ph * TAU), flw)
	var fo: Dictionary = I.get("wing_fold", {})
	for w in wings:
		w.open = spring(w.open, float(P.open), 14.0, dt, 0.8)
		var o := clampf((w.open as Vector2).x, 0.0, 1.0)
		var f := 1.0 - o
		var sg: float = w.sg
		var ch: PackedInt32Array = w.chain
		# folded: the arm swung back and down, the fingers drawn in
		var e := el * o + float(fo.get("el", -0.5)) * f
		var s := sw * o + float(fo.get("sw", 0.6)) * f
		turn_rest(ch[0], Vector3(0, 0, 1), -sg * e * 0.6)
		turn_rest(ch[0], Vector3.UP, sg * s)
		if ch.size() > 1: turn_rest(ch[1], Vector3(0, 0, 1), -sg * e * 0.4)
		if ch.size() > 3: turn_rest(ch[3], Vector3.UP, sg * float(fo.get("hand", 0.8)) * f)
		for k in range(4, ch.size()): turn_rest(ch[k], Vector3(0, 0, 1), sg * float(fo.get("tip", 0.4)) * f)
