class_name CreatureSerpent
extends CreatureRig
# Ekans and Arbok. Rig: Waist at the middle, Spine1 .. Spine8 (Arbok: .. Spine9, Neck)
# up to the Head (LowerJaw / UpperJaw; Arbok's Jaw and Tongue1 - 3), and Hips -
# Tail1 .. Tail13 down to the tip; the rip stands it straight up, belly to +z.
# The whole body is laid along a curve, built from the head down a joint at a time
# (so every bone keeps its length): the front raised (the neck's rise, a cobra's S
# when it stands tall), the rest on the ground, either coiled (a spiral round its
# middle, standing still) or stretched out behind and slithering (a wave down its
# length that travels back as it goes, fixed to the ground: no slip). Arbok's hood
# (the bones of the hood, scaled out) flares when it threatens.
#
# Moods (besides CreatureRig's look, startle, hide, sleep / wake, hurt, flinch, faint,
# flee, taunt, angry): taste (the tongue / jaw flicks), coil (wound tight), rise (up
# tall, swaying), hood (Arbok: the hood spread, a hiss), and the battle acts tackle,
# wrap (lunges and wraps round the target act_reach ahead, squeezes), poison_sting
# (a strike: fx("sting") at the mouth), bite (fx("bite")), acid (spat: fx("acid")),
# leer / glare (the stare, fx("glare")).
# Points: "mouth", "head", "tail" (the tip), "hood".

var chain := PackedInt32Array()   # head first, down to the last tail bone
var seg := PackedFloat32Array()   # each joint's distance from the head along the rest body
var total := 1.0
var radius := 0.06
var travel := 0.0
var move_w := 0.0
var coil_w := 1.0
var rise_s := Vector2.ZERO
var lunge_s := Vector2.ZERO
var hood_s := Vector2.ZERO
var coil_s := Vector2.ZERO
var sway_s := Vector2.ZERO
var tongue_t := 0.0
var hood := PackedInt32Array()
var TONGUE := PackedInt32Array()
var _J: Array[Vector3] = []       # this frame's joints (skeleton space)
var _Y := PackedFloat32Array()    # the heading of the body at each joint (its side axis: never lost when upright)

func _rig_ready() -> void:
	durs.merge({"taste": 1.4, "coil": 2.0, "rise": 2.4, "hood": 1.8, "wrap": 2.6, "poison_sting": 1.1, "bite": 1.0,
		"acid": 1.2, "glare": 1.4, "tackle": 1.1}, true)
	radius = float(I.get("radius", 0.06))
	var up := PackedInt32Array()
	var i := HEAD
	while i >= 0 and i != W:
		up.append(i)
		i = parent[i]
	chain = up
	var tl := _chain("Tail1")
	for k in tl: chain.append(k)
	seg.resize(chain.size())
	var s := 0.0
	for k in chain.size():
		if k > 0: s += rest_at(chain[k]).distance_to(rest_at(chain[k - 1]))
		seg[k] = s
	var e := _kids(chain[chain.size() - 1])
	total = s + (rest_at(e[0]).distance_to(rest_at(chain[chain.size() - 1])) if not e.is_empty() else 0.0)
	for hn in I.get("hood", []):
		if b(hn) >= 0: hood.append(b(hn))
	for tn in ["Tongue1", "Tongue2", "Tongue3"]:
		if b(tn) >= 0: TONGUE.append(b(tn))
	_J.resize(chain.size() + 1)
	_Y.resize(chain.size() + 1)
	tails.clear()
	legs.clear()

func point(n: String) -> Vector3:
	match n:
		"tail": return to_world(_J[_J.size() - 1])
		"hood": return to_world(G[hood[0]].origin) if not hood.is_empty() else point("head")
		"mouth":
			var h := G[HEAD]
			return to_world(h.origin + h.basis.z.normalized() * radius * 2.2 + h.basis.y.normalized() * radius * 0.6)
	return super.point(n)

func contacts() -> Array: return []

# ---------- the frame ----------
func _frame(P: Dictionary, dt: float, v: float) -> void:
	var k := skel.global_transform.basis.get_scale().x
	travel += v * dt / maxf(0.01, k)
	move_w = damp(move_w, sm(0.03, 0.25, v), 4.0, dt)
	coil_w = damp(coil_w, clampf((1.0 - move_w) * (1.0 - P.get("flat", 0.0)) + float(P.get("coil", 0.0)), 0.0, 1.4), 3.0, dt)
	rise_s = spring(rise_s, float(P.get("rise", 1.0)), 9.0, dt, 0.7)
	lunge_s = spring(lunge_s, float(P.get("lunge", 0.0)), 26.0, dt, 0.8)
	hood_s = spring(hood_s, float(P.get("hood", 0.0)), 14.0, dt, 0.6)
	sway_s = spring(sway_s, float(P.get("sway", 0.0)), 6.0, dt, 0.8)
	_lay(P, dt, v)
	_place(P, dt)
	_face(P, dt)

# the joints along the body: angles of the body's line, from the head down
func _lay(P: Dictionary, _dt: float, v: float) -> void:
	var rise_len := total * float(I.get("rise_len", 0.3)) * clampf(0.55 + 0.45 * rise_s.x, 0.3, 1.6)
	var tall := float(I.get("rise_angle", 1.25)) * clampf(rise_s.x, 0.0, 1.5) * (1.0 - 0.75 * clampf(lunge_s.x / maxf(0.1, act_reach), 0.0, 1.0))
	var wave_k := TAU / (total * float(I.get("wave_len", 0.45)))
	var wave_a := float(I.get("wave_amp", 0.55)) * move_w
	var R0 := total * float(I.get("coil_r", 0.11)) * lerpf(1.0, 0.75, clampf(coil_w - 1.0, 0.0, 0.4) * 2.5)
	var ccw := 1.0
	var pos := Vector3.ZERO
	var yaw := 0.0
	var coil_y := 0.0
	var n := chain.size()
	var s := 0.0
	var dirs: Array[Vector3] = []
	var ys: Array[float] = []
	for k in n + 1:
		var L := (seg[k] - seg[k - 1]) if (k > 0 and k < n) else (total - seg[n - 1] if k == n else 0.0)
		if k == 0: continue
		var sm0 := (seg[k - 1] + (L * 0.5))
		# pitch: down the raised part from steep (at the head) to flat (on the ground)
		var u := clampf(sm0 / rise_len, 0.0, 1.0)
		# (the neck straight up under the head, then curving back down to lie flat)
		var ph := tall * (1.0 - sm(0.12, 1.0, u))
		# the head held forward over the neck: the top few joints lean back a little
		ph -= 0.35 * (1.0 - sm(0.0, 0.12, u)) * clampf(rise_s.x, 0.0, 1.0)
		# yaw: slithering, a wave travelling back (in the body's frame, fixed on the ground)
		var env := sm(rise_len * 0.4, rise_len * 1.2, sm0) * (1.0 - 0.4 * sm(total * 0.7, total, sm0))
		var yw := wave_a * env * sin(wave_k * (sm0 + travel))
		# coiled: the ground part winding round, tighter inward
		var cs := maxf(0.0, sm0 - rise_len * 0.9)
		var rr := maxf(R0 * 0.35, R0 - cs * radius * 0.9 / (TAU * R0) * 2.0 * float(I.get("coil_shrink", 1.0)))
		var cyaw := ccw * cs / rr
		# a coil stacked up (Ekans): the loops climb, so going down the body they descend
		var cw := clampf(coil_w, 0.0, 1.0)
		if cs > 0.0: ph += float(I.get("coil_stack", 0.0)) * cw * (1.0 - sm(total * 0.82, total * 0.9, sm0))
		# the tail's tip turned up off the ground (its rattle)
		ph -= float(I.get("tip_up", 0.0)) * sm(total * (1.0 - float(I.get("tip_len", 0.12))), total, sm0) * (0.5 + 0.5 * cw)
		var yc := lerpf(yw, cyaw, clampf(coil_w, 0.0, 1.0))
		yc += float(sway_s.x) * (1.0 - u) * sin(t * 1.6) * 0.5
		yaw = yc
		# down the body is backward (-z) under this heading
		var back := Vector3(-sin(yaw), 0, -cos(yaw))
		var d := back * cos(ph) + Vector3.DOWN * sin(ph)
		dirs.append(d * L)
		_Y[k - 1] = yaw
	# the head's height: whatever the raised part climbs, plus the body's radius
	var h := radius
	for d in dirs: h += maxf(0.0, -d.y)
	h += float(P.get("y", 0.0))
	_J[0] = Vector3(0, h, 0)
	for k in dirs.size():
		var nj: Vector3 = _J[k] + dirs[k]
		nj.y = maxf(radius * 0.9, nj.y)
		_J[k + 1] = nj
	# where it sits: stretched out, the neck's base under the origin (the head ahead);
	# coiled, the coil round the origin
	var c := Vector3.ZERO
	var cnt := 0
	for k in range(n / 3, n + 1):
		c += _J[k]; cnt += 1
	c /= cnt
	var base: Vector3 = _J[mini(n, int(n * 0.3))]
	var shift := Vector3(-lerpf(base.x, c.x, clampf(coil_w, 0, 1)), 0, -lerpf(base.z, c.z, clampf(coil_w, 0, 1)) + float(lunge_s.x) * 0.8)
	shift.z += float(P.get("fwd", 0.0))
	for k in _J.size(): _J[k] += shift

func _place(P: Dictionary, dt: float) -> void:
	var n := chain.size()
	# the Waist is the root, where Spine1 and the tail's Hips meet
	var s1 := chain.find(b("Spine1"))
	var wpos: Vector3 = _J[s1]
	set_local_pos(W, rest_g[parent[W]].affine_inverse() * wpos)
	set_global(W, rest_g[W].basis)
	var hf := clampf(hood_s.x, -0.2, 1.3)
	for k in n:
		var bi := chain[k]
		if bi == HEAD: continue
		var is_tail := skel.get_bone_name(bi).begins_with("Tail")
		var head_ward: Vector3 = _J[k - 1] - _J[k + 1]
		var yw := (_Y[k - 1] + _Y[k]) * 0.5
		var lat := Vector3(cos(yw), 0, -sin(yw))
		var belly := lat.cross(head_ward.normalized()).normalized()
		if is_tail:
			aim(bi, _J[k + 1] - _J[k], belly, Vector3.DOWN, Vector3(0, 0, 1))
		else:
			aim(bi, _J[k - 1] - _J[k], belly, Vector3.UP, Vector3(0, 0, 1))
		# the tail's root hangs off the Hips (at the waist): the Hips turned to reach it
		if is_tail and parent[bi] == HIPS and HIPS >= 0:
			aim(HIPS, _J[k] - wpos, belly, rest_dir(HIPS, bi), Vector3(0, 0, 1))
	# hood: the hood's bone widened sideways (and a little deeper), its scale undone at the head
	if not hood.is_empty():
		var wide := Vector3(1.0 + 0.6 * hf, 1.0, 1.0 + 0.12 * hf)
		skel.set_bone_pose_scale(hood[0], _axes_scale(hood[0], wide))
		skel.set_bone_pose_scale(HEAD, _axes_scale(HEAD, Vector3.ONE / wide))
	# the head: looks where it wants, level, whatever the neck does
	_look(P, dt)
	var Bh := Basis(Vector3.UP, hy.x) * Basis(Vector3.RIGHT, -hp.x) * Basis(Vector3(0, 0, 1), ht.x)
	set_global(HEAD, Bh * rest_g[HEAD].basis)
	set_local_pos(HEAD, rest_l[HEAD].origin)
	jaw_s = spring(jaw_s, float(P.jaw), 30.0, dt, 0.7)
	if JAW >= 0: turn_rest(JAW, Vector3.RIGHT, float(I.get("jaw_rest", 0.0)) + clampf(jaw_s.x, -0.1, 1.2) * float(I.get("jaw_open", 0.6)))
	if not TONGUE.is_empty():
		var tg := float(P.get("tongue", 0.0))
		for ti in TONGUE.size():
			turn_rest(TONGUE[ti], Vector3.RIGHT, -0.3 * tg + sin(t * 30.0 + ti) * 0.25 * tg)
			if tg > 0.01: set_local_pos(TONGUE[ti], rest_l[TONGUE[ti]].origin * (1.0 + 0.6 * tg))

# a scale given along the skeleton's axes (x side, y up, z ahead) as the bone's own
func _axes_scale(bi: int, v: Vector3) -> Vector3:
	var inv := rest_g[bi].basis.orthonormalized().inverse()
	var out := Vector3.ONE
	for a in 3:
		var ax := inv * Vector3(1 if a == 0 else 0, 1 if a == 1 else 0, 1 if a == 2 else 0)
		var k := 0
		if absf(ax.y) > absf(ax[k]): k = 1
		if absf(ax.z) > absf(ax[k]): k = 2
		out[k] = v[a]
	return out

func _look(P: Dictionary, dt: float) -> void:
	_look_t -= dt
	if _look_t <= 0.0:
		_look_t = rng.randf_range(0.8, 2.6)
		var watch := not is_nan(look_at_pos.x) and rng.randf() < (0.9 if battle else 0.5)
		if watch:
			var hp3 := to_world(G[HEAD].origin)
			var to := look_at_pos - hp3
			var yy := wrapf(atan2(to.x, to.z) - global_rotation.y, -PI, PI)
			_hg = Vector3(clampf(yy, -1.2, 1.2), clampf(atan2(to.y, Vector2(to.x, to.z).length()), -0.6, 0.5), 0.0)
		else:
			_hg = Vector3(rng.randf_range(-0.7, 0.7), rng.randf_range(-0.25, 0.15), rng.randf_range(-0.2, 0.2))
	var gy: float = _hg.x if is_nan(float(P.hy)) else float(P.hy)
	var gp: float = _hg.y if is_nan(float(P.hp)) else float(P.hp)
	var gt: float = _hg.z if is_nan(float(P.ht)) else float(P.ht)
	# a snake's head glides: smooth, slow turns, with the neck's sway
	gy += sway_s.x * sin(t * 1.6) * 0.3
	var om: float = 7.0 * float(P.hk)
	hy = spring(hy, gy, om, dt, 0.85)
	hp = spring(hp, gp, om, dt, 0.85)
	ht = spring(ht, gt, om, dt, 0.8)

# ---------- moods ----------
func _base(dt: float, v: float) -> Dictionary:
	var P := {"rise": float(I.get("rise_base", 1.0)), "lunge": 0.0, "hood": float(I.get("hood_base", 0.0)), "coil": 0.0, "sway": 0.25, "y": 0.0, "fwd": 0.0, "flat": 0.0,
		"hy": NAN, "hp": NAN, "ht": NAN, "hk": 1.0, "jaw": 0.0, "tongue": 0.0, "eye": "", "mouth": ""}
	P.rise += sin(t * 1.3) * 0.04
	# the tongue: a flick now and then, tasting the air
	tongue_t -= dt
	if tongue_t < -0.5: tongue_t = rng.randf_range(1.5, 4.0)
	if tongue_t < 0.0: P.tongue = bump(-tongue_t, 0.0, 0.5)
	var bw := battle_w
	P.rise += 0.25 * bw
	P.hood += 0.6 * bw * float(I.get("hood_battle", 1.0))
	P.sway += 0.6 * bw
	P.eye = "angry" if bw > 0.5 else ""
	if v > 0.05: P.rise -= 0.35 * move_w
	if hide_w > 0.01:
		P.rise -= 0.85 * hide_w
		P.flat = hide_w * 0.0
		P.eye = "half" if hide_w > 0.5 else P.eye
	if sleep_w > 0.01:
		P.rise -= 0.9 * sleep_w
		P.coil += 0.3 * sleep_w
		P.sway = 0.0
		P.eye = "closed" if sleep_w > 0.4 else "half"
		P.hp = -0.3 * sleep_w
		P.tongue = 0.0
	if faint_w > 0.01:
		P.rise -= 1.0 * faint_w
		P.eye = "closed"
		P.ht = 1.2 * faint_w
		P.sway = 0.0
	return P

func _act(P: Dictionary, dt: float, u: float, d: float) -> void:
	var env := sm(0.0, 0.15, u) * sm(d, d - 0.25, u)
	match act:
		"look":
			var L := [[0.9, 0.1], [-0.9, 0.0], [0.2, 0.3], [0.0, 0.0]]
			var k := clampi(int(u / 0.45), 0, 3)
			P.hy = L[k][0]; P.hp = L[k][1]
			P.rise += 0.2 * env
			P.tongue = bump(u, 0.6, 1.0)
		"taste":
			P.tongue = maxf(bump(u, 0.1, 0.5), bump(u, 0.6, 1.0))
			P.hp = 0.15 * env
			P.rise += 0.1 * env
			P.jaw = 0.1 * env
		"coil":
			P.coil += 0.4 * env
			P.rise -= 0.3 * env
			P.hp = -0.1 * env
		"rise":
			P.rise += 0.5 * env
			P.sway += 1.2 * env
			P.hood += 0.5 * env
			P.tongue = bump(u, 0.5, 1.0) + bump(u, 1.4, 1.9)
		"hood", "angry", "glare", "leer":
			P.rise += 0.45 * env
			P.hood += 1.0 * env
			P.sway += 0.4 * env
			P.jaw = (0.7 if act == "hood" or act == "angry" else 0.15) * bump(u, 0.2, d - 0.2)
			P.mouth = "wide" if act == "hood" else ""
			P.eye = "angry"
			P.hp = -0.1 * env
			if act in ["glare", "leer"] and _ev("g", 0.35): fx.emit("glare", point("head"))
			if act == "hood" and _ev("h", 0.3): fx.emit("hiss", point("mouth"))
		"startle":
			P.rise += 0.6 * bump(u, 0.0, 0.5)
			P.hood += 0.8 * env
			P.jaw = 0.5 * bump(u, 0.0, 0.4)
			P.eye = "open"
			P.hk = 3.0
			P.hp = 0.3 * env
		"tackle", "poison_sting", "bite":
			_strike_s(P, u, d)
		"acid":
			var k := sm(0.0, 0.3, u)
			var spit := bump(u, 0.4, 0.75)
			P.rise += 0.3 * k * (1.0 - spit) - 0.1 * spit
			P.hp = 0.25 * k - 0.4 * spit
			P.jaw = 0.9 * bump(u, 0.3, 0.8)
			P.lunge = 0.15 * act_reach * spit
			P.hood += 0.8 * env
			P.eye = "angry"
			if _ev("a", 0.5): fx.emit("acid", point("mouth"))
		"wrap":
			# a lunge to the target, the body thrown round it and squeezed, then let go
			var go := sm(0.15, 0.45, u) * (1.0 - sm(d - 0.5, d - 0.1, u))
			P.lunge = act_reach * 0.75 * go
			P.coil += 0.5 * go
			P.rise += -0.3 * go + 0.4 * bump(u, 0.0, 0.2)
			var sq2 := 0.0
			for k in 3: sq2 = maxf(sq2, bump(u, 0.7 + k * 0.45, 1.05 + k * 0.45))
			P.coil += 0.25 * sq2
			P.y = 0.03 * sq2
			P.jaw = 0.3 * sq2
			P.eye = "angry"
			P.hood += 0.6 * go
			if _ev("hit", 0.45): impact.emit(act); fx.emit("hit", point("mouth"))
			for k in 3:
				if _ev("s%d" % k, 0.85 + k * 0.45): fx.emit("squeeze", to_world(G[chain[chain.size() / 2]].origin))
		"hurt":
			var hit := sm(0.0, 0.05, u) * sm(0.8, 0.3, u)
			P.lunge = -0.25 * act_reach * hit
			P.rise -= 0.3 * hit
			P.hp = 0.5 * hit
			P.hy = -0.4 * hit
			P.ht = 0.4 * hit
			P.hk = 3.0
			P.jaw = 0.6 * bump(u, 0.0, 0.5)
			P.eye = "squeeze" if u < 0.45 else "sad"
			P.coil += 0.3 * hit
		"flinch":
			var j := sm(0.0, 0.04, u) * sm(d, 0.2, u)
			P.rise -= 0.4 * j
			P.lunge = -0.1 * act_reach * j
			P.hp = -0.3 * j
			P.hy = 0.5 * j
			P.hk = 3.0
			P.eye = "squeeze" if u < 0.3 else "sad"
		"faint":
			faint_w = sm(0.3, 1.2, u)
			P.eye = "sad" if u < 0.4 else "closed"
			P.hy = 0.3 * sin(u * 6.0) * (1.0 - faint_w)
		"flee":
			P.rise -= 0.6 * env
			P.hood = 0.0
			P.eye = "open"
		"taunt":
			P.rise += 0.4 * env
			P.sway += 1.5 * env
			P.tongue = maxf(bump(u, 0.2, 0.6), bump(u, 0.8, 1.2))
			P.eye = "angry"
			P.mouth = "smile"
			P.hood += 0.5 * env
		"wake":
			P.rise += 0.3 * bump(u, 0.0, d)
			P.jaw = 0.9 * bump(u, 0.1, 0.8)
			P.eye = "closed" if u < 0.6 else "half"
		"hide":
			pass
		_:
			super._act(P, dt, u, d)

# a strike: drawn back and up (the S loaded), then the head shot out at the target
# and back. bite: the jaws wide and snapped; poison_sting: a stab, fx("sting")
func _strike_s(P: Dictionary, u: float, d: float) -> void:
	var load := sm(0.0, 0.3, u) * (1.0 - sm(0.35, 0.42, u))
	var shot := sm(0.35, 0.47, u) * (1.0 - sm(0.6, d - 0.1, u))
	P.rise += 0.5 * load - 0.2 * shot
	P.lunge = -0.12 * act_reach * load + act_reach * shot
	P.hp = 0.2 * load - 0.35 * shot
	P.hood += 0.9 * sm(0.0, 0.2, u) * sm(d, d - 0.2, u)
	P.eye = "angry"
	P.hk = 3.0
	P.jaw = 0.4 * load + (1.0 if act == "bite" else 0.5) * shot * (1.0 - sm(0.47, 0.55, u) * (1.0 if act == "bite" else 0.0))
	P.mouth = "wide"
	if _ev("hit", 0.47):
		impact.emit(act)
		fx.emit({"bite": "bite", "poison_sting": "sting"}.get(act, "hit"), point("mouth"))
