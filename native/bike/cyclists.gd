class_name Cyclists
extends Node3D
# The townspeople who ride bicycles (life.gd: Farmer Ben to the fields, Ada on her
# bread round, Timmy on his small bike), part of their day like everything else:
# a long enough leg of a walk (tunables/bike.json npc: min_leg), mostly on the
# lanes and the square (road_share of it on the walk grid's cheap ground), with
# their bike near where they start (fetch): they walk to it, get on (the same
# rider and swing-over as Ash: bike/rider.gd), ride the path at their own easy
# speed (3.5..5 m/s, never as fast as Ash), and get off a few metres before where
# they are going (park_before), leaving the bike on its kickstand by the lane, a
# porch or a gate; the rest they walk. Someone in the way: they slow; Ash in the
# way: a ring of the bell first. Bikes go home with their owners overnight
# (put back by the gate when nobody is looking).
#
# Cost: off screen or far (life.gd's LOD) a ride is a point moving along the path,
# the bike drawn only where it is seen (visibility ranges: the fine parts to 32 m),
# the rider's pose (pedal and hand IK) only when the person is animated, which life.gd
# does at half rate past 25 m.
#
# Hooks in life.gd: setup, plan(p) when a path arrives, move(p, dt, full) instead of
# the walk while a ride is on, place(p) after the actor is placed, resync(), the
# parked bikes for steering round (obstacles()).

const T := preload("res://tunables.gd")

var life: Node
var bikes := {}           # person id -> {model, rider, at, yaw, lean, steer, wf, wr, crank, kick, look, home}
var MIN_LEG := 26.0
var SHARE := 0.78
var FETCH := 14.0
var PARK := 4.0
var BELL_D := 9.0
var SLOW := 1.8
var speeds := {}
var stats := {"rides": 0, "bells": 0}
var _rng := RandomNumberGenerator.new()

func setup(l: Node) -> void:
	life = l
	name = "Cyclists"
	_rng.randomize()
	var cfg := T.dict("bike", "npc", {})
	MIN_LEG = float(cfg.get("min_leg", 26.0))
	SHARE = float(cfg.get("road_share", 0.78))
	FETCH = float(cfg.get("fetch", 14.0))
	PARK = float(cfg.get("park_before", 4.0))
	BELL_D = float(cfg.get("bell_dist", 9.0))
	SLOW = float(cfg.get("slow_speed", 1.8))
	speeds = cfg.get("speed", {}) if cfg.get("speed") is Dictionary else {}
	var riders: Dictionary = cfg.get("riders", {"ben": "ben", "ada": "ada", "timmy": "timmy"}) if cfg.get("riders") is Dictionary else {}
	for id in riders:
		if not life.by_id.has(id): continue
		var p: Dictionary = life.by_id[id]
		var m := BikeModel.new()
		m.name = "Bike_" + id
		add_child(m)
		m.build(BikeModel.look(String(riders[id])), float(cfg.get("detail", 0.6)))
		for mi in m.meshes:
			if not mi.has_meta("no_ink"): mi.visibility_range_end = 90.0
		var e := {"model": m, "rider": null, "at": Vector3.ZERO, "yaw": 0.0, "lean": -0.11, "steer": 0.3, "wf": 0.0, "wr": 0.0,
			"crank": _rng.randf() * TAU, "kick": 1.0, "look": 0.0, "bell_t": 9.0, "home": _home_spot(String(p.home)), "v": 0.0, "om": 0.0}
		if p.actor:
			e.rider = BikeRider.new(p.actor, m)
			e.rider.fit_bike()
		bikes[id] = e
		_park_home(e)

# by the lane outside their gate, along it, with room all round (so it rides off clear)
func _home_spot(h: String) -> Vector3:
	if not life.houses.has(h): return Vector3(-2.0, 0.0, 2.0)
	var hs: Dictionary = life.houses[h]
	var g: Vector3 = hs.gate
	var ln: Vector3 = hs.lane
	var n: Vector2 = hs.normal
	var along := Vector2(n.y, -n.x)
	for base in [Vector2(ln.x, ln.y), Vector2(g.x, g.y) + n * 1.2]:
		for k: float in [1.8, -1.8, 2.6, -2.6, 3.4, -3.4]:
			var p: Vector2 = base + along * k
			var ok := true
			for o in [Vector2.ZERO, along * 0.7, -along * 0.7, n * 0.6, -n * 0.6, along * 0.7 + n * 0.5, -along * 0.7 + n * 0.5]:
				if not life.walkable(p + o): ok = false; break
			for other in bikes.values():
				if Vector2(other.home.x, other.home.z).distance_to(p) < 1.4: ok = false   # (two riders in one house: two spots)
			if ok: return Vector3(p.x, atan2(along.x, along.y), p.y)   # (y holds the yaw)
	return Vector3(g.x + n.x * 1.5, atan2(along.x, along.y), g.y + n.y * 1.5)

func _park_home(e: Dictionary) -> void:
	var h: Vector3 = e.home
	e.at = Vector3(h.x, life.world.height_at(h.x, h.z), h.z)
	e.yaw = h.y
	e.kick = 1.0
	e.lean = -0.11
	e.v = 0.0
	_pose(e, 0.0)

func _pose(e: Dictionary, _dt: float) -> void:
	var m: BikeModel = e.model
	var W = life.world
	var f := Vector3(sin(e.yaw), 0, cos(e.yaw))
	var hf: float = W.height_at(e.at.x + f.x * m.WB * 0.5, e.at.z + f.z * m.WB * 0.5)
	var hb: float = W.height_at(e.at.x - f.x * m.WB * 0.5, e.at.z - f.z * m.WB * 0.5)
	var pt := atan2(hf - hb, m.WB)
	m.global_transform = Transform3D(Basis(Vector3.UP, e.yaw) * Basis(Vector3.RIGHT, -pt) * Basis(Vector3.BACK, e.lean), e.at)
	var pl := BikeRider.foot_pitch(e.crank, 1.0)
	var pr := BikeRider.foot_pitch(e.crank, -1.0)
	if e.rider: e.rider.set_pitch(pl, pr)
	m.pose(e.steer, e.wf, e.wr, e.crank, e.kick, pl, pr)

# ---------- a path arrived (life.gd _got_path): ride it? ----------
func plan(p: Dictionary) -> void:
	if not bikes.has(p.id): return
	var e: Dictionary = bikes[p.id]
	var c = p.get("cyc")
	if c is Dictionary and c.phase in ["ride", "mount"]:
		# already on it: ride the new path from here
		c.phase = "ride"
		return
	if c is Dictionary and c.phase == "dismount": _finish_dismount(p, e)
	p.erase("cyc")
	var path: PackedVector2Array = p.path
	if path.size() < 2 or p.get("enter_house", "") == "x": return
	var here := Vector2(p.pos.x, p.pos.z)
	var at2 := Vector2(e.at.x, e.at.z)
	if at2.distance_to(here) > FETCH: return
	# long enough, and mostly on the lanes
	var total := 0.0
	var road := 0.0
	var prev := here
	for q in path:
		var d := prev.distance_to(q)
		total += d
		var n := maxi(1, int(d / 1.0))
		for k in n:
			var s := prev.lerp(q, (k + 0.5) / n)
			if life._wat(s) <= life.W_YARD + 0.01: road += d / n
		prev = q
	if total < MIN_LEG or road < total * SHARE: return
	# the bike's left side, where they get on
	var side: Vector3 = Transform3D(Basis(Vector3.UP, e.yaw), e.at) * Vector3(0.48, 0, -0.12)
	if not life.walkable(Vector2(side.x, side.z)) or not life._clear(here, Vector2(side.x, side.z), 99.0):
		if at2.distance_to(here) > 1.5: return
	var np := PackedVector2Array([Vector2(side.x, side.z)])
	np.append_array(path)
	p.path = np
	p.pi = 0
	p.cyc = {"phase": "to_bike", "t": 0.0, "slow": false}
	stats.rides += 1

# ---------- the frame (life.gd _move while a ride is on: true = handled) ----------
func move(p: Dictionary, dt: float, full: bool) -> bool:
	var c = p.get("cyc")
	if not (c is Dictionary): return false
	var e: Dictionary = bikes[p.id]
	match c.phase:
		"to_bike":
			var side: Vector3 = Transform3D(Basis(Vector3.UP, e.yaw), e.at) * Vector3(0.48, 0, -0.12)
			var to := Vector2(side.x - p.pos.x, side.z - p.pos.z)
			if p.pi >= 1 or to.length() < 0.9:
				# at the bike: the last steps to its left side, face its way, then on
				if to.length() > 0.04 and full:
					p.v = 1.0
					life._turn(p, atan2(to.x, to.y), dt, 10.0)
					var st := to.normalized() * minf(to.length(), 1.1 * dt)
					p.pos.x += st.x; p.pos.z += st.y
					p.pos.y = life.world.height_at(p.pos.x, p.pos.z)
					return true
				p.v = 0.0
				life._turn(p, e.yaw, dt, 14.0)
				if full and absf(wrapf(e.yaw - p.yaw, -PI, PI)) > 0.15: return true
				p.yaw = e.yaw
				if p.pi < 1: p.pi = 1
				c.phase = "mount"
				c.t = 0.0
				if e.rider and p.actor: p.actor.rider = e.rider; e.rider.on = 1.0; e.rider.mounting = true; e.rider.mount = 0.0
				if not full: c.t = 1.0
				return true
			return false
		"mount":
			c.t += dt
			p.v = 0.0
			p.pos = Vector3(e.at.x, p.pos.y, e.at.z)
			p.yaw = e.yaw
			if c.t >= 0.62:
				c.phase = "ride"
				e.kick = 0.0
			return true
		"ride": return _ride(p, c, e, dt, full)
		"dismount":
			c.t += dt
			p.v = 0.0
			if c.t >= 0.66 or not full:
				_finish_dismount(p, e)
			return true
	return false

func _ride(p: Dictionary, c: Dictionary, e: Dictionary, dt: float, full: bool) -> bool:
	var path: PackedVector2Array = p.path
	var here := Vector2(e.at.x, e.at.z)
	# what is left of the path
	var left := 0.0
	var prev := here
	for i in range(p.pi, path.size()):
		left += prev.distance_to(path[i]); prev = path[i]
	if left <= PARK or p.pi >= path.size():
		_start_dismount(p, c, e)
		return true
	var vmax: float = float(speeds.get(p.id, 4.2))
	# a corner ahead: ease off for it
	var tgt := path[p.pi]
	if here.distance_to(tgt) < (2.2 if full else 0.6):
		p.pi += 1
		if p.pi >= path.size():
			_start_dismount(p, c, e)
			return true
		tgt = path[p.pi]
	var f := Vector2(sin(e.yaw), cos(e.yaw))
	# nearly there: keep to the side of the way, so the bike is parked off the walk line
	if left < PARK + 3.5:
		var seg := (tgt - here).normalized()
		var right := Vector2(-seg.y, seg.x)   # (the rider's right)
		var off := tgt + right * 0.9
		if life.walkable(off): tgt = off
	var to := (tgt - here).normalized()
	var turn := wrapf(atan2(to.x, to.y) - e.yaw, -PI, PI)
	vmax *= clampf(1.15 - absf(turn) * 0.6, 0.4, 1.0)
	vmax = minf(vmax, 0.8 + left * 0.9)
	# people ahead: slow; Ash ahead: the bell, and slow right down
	var me := Vector2(life.game.pos.x, life.game.pos.z) if life.game != null else Vector2(1e9, 1e9)
	var dm := me - here
	if full and dm.length() < BELL_D and dm.dot(f) > 0.0 and absf(dm.cross(f)) < 2.2:
		vmax = minf(vmax, SLOW if dm.length() > 3.0 else 0.6)
		if e.bell_t > 3.5:
			e.bell_t = 0.0
			stats.bells += 1
			Sfx.play("bike_bell", e.model.global_transform * e.model.grip(1.0), {"vol": 2.0})
	for o in life.people:
		if o == p or o.state == "inside": continue
		var d2: Vector2 = Vector2(o.pos.x, o.pos.z) - here
		if d2.length() < 5.0 and d2.dot(f) > 0.0 and absf(d2.cross(f)) < 1.3: vmax = minf(vmax, maxf(0.0, d2.length() - 1.4) * 1.2)
	e.bell_t += dt
	if not full:
		# far off: along the path at the riding speed
		var step := vmax * dt
		while step > 0.0 and p.pi < path.size():
			var seg := path[p.pi] - here
			var sl := seg.length()
			if sl <= step:
				here = path[p.pi]; step -= sl; p.pi += 1
			else:
				here += seg / sl * step; step = 0.0
			if sl > 1e-3: e.yaw = atan2(seg.x, seg.y)
		e.v = vmax
		e.at = Vector3(here.x, life.world.height_at(here.x, here.y), here.y)
		e.lean = 0.0; e.steer = 0.0
	else:
		# far off the way on, nearly stopped: walk the bike round first (no turning on the spot)
		if e.v < 0.8 and absf(turn) > 0.6:
			e.yaw = wrapf(e.yaw + signf(turn) * 1.5 * dt, -PI, PI)
			vmax = minf(vmax, 0.3)
		e.v += (vmax - e.v) * (1.0 - exp(-dt * (1.6 if vmax > e.v else 4.0)))
		var rmin: float = 1.6 + 0.05 * e.v * e.v
		var omx: float = e.v / rmin if e.v > 0.2 else 0.0
		var om_t := clampf(turn * 2.4, -omx, omx)
		e.om += (om_t - e.om) * (1.0 - exp(-dt * 6.0))
		e.yaw = wrapf(e.yaw + e.om * dt, -PI, PI)
		var mv: Vector3 = Vector3(sin(e.yaw), 0, cos(e.yaw)) * float(e.v) * dt
		var np: Vector3 = life.world.step(e.at, mv.x, mv.z)
		if Vector2(np.x - e.at.x, np.z - e.at.z).length() < mv.length() * 0.3 and mv.length() > 1e-4:
			# something in the way: stop and walk the bike round toward the way on; still stuck: off, and walk
			c.blk = float(c.get("blk", 0.0)) + dt
			e.v = 0.0
			e.yaw = wrapf(e.yaw + clampf(turn, -1.0, 1.0) * dt * 1.6, -PI, PI)
			if c.blk > 1.6: _start_dismount(p, c, e)
			p.pos = Vector3(e.at.x, e.at.y, e.at.z)
			p.yaw = e.yaw
			p.v = 0.0
			p.prog_t = 0.0
			return true
		c.blk = 0.0
		np.y = life.world.height_at(np.x, np.z)
		e.at = np
		var lt := -clampf(atan(e.v * e.om / 9.8) * 0.85, -0.45, 0.45)
		if e.v < 0.4: lt = -0.1
		e.lean += (lt - e.lean) * (1.0 - exp(-dt * 6.0))
		e.steer += (clampf(atan(e.model.WB * e.om / maxf(e.v, 1.2)), -0.5, 0.5) - e.steer) * (1.0 - exp(-dt * 8.0))
	# wheels and cranks
	var wv: float = e.v / e.model.R
	e.wf += wv * dt
	e.wr += wv * dt
	var ratio := float(e.model.teeth[0]) / float(e.model.teeth[1])
	if e.v > 0.3 and e.v < vmax + 0.3: e.crank += wv / ratio * dt
	p.pos = Vector3(e.at.x, e.at.y, e.at.z)
	p.yaw = e.yaw
	p.v = e.v
	# progress (life.gd's stuck watch)
	p.prog_t = 0.0
	return true

func _start_dismount(p: Dictionary, c: Dictionary, e: Dictionary) -> void:
	c.phase = "dismount"
	c.t = 0.0
	e.v = 0.0
	if e.rider: e.rider.mounting = false

func _finish_dismount(p: Dictionary, e: Dictionary) -> void:
	e.kick = 1.0
	e.lean = -0.11
	e.v = 0.0
	if e.rider:
		e.rider.on = 0.0
		e.rider.kick_foot = 0.0
		if p.actor and p.actor.rider == e.rider: p.actor.rider = null
		if p.actor and p.actor.cloth: p.actor.cloth.obstacles = []
	# he steps off on the left; the bike stays, nudged off the walk line
	var side: Vector3 = Transform3D(Basis(Vector3.UP, e.yaw), e.at) * Vector3(0.48, 0, -0.12)
	p.pos = Vector3(side.x, life.world.height_at(side.x, side.z), side.z)
	p.erase("cyc")
	p.best_d = INF
	p.prog_t = 0.0
	_pose(e, 0.0)

# ---------- placing (life.gd _show, after the actor is placed; before it animates) ----------
func place(p: Dictionary, dt: float) -> void:
	var c = p.get("cyc")
	if not bikes.has(p.id) or not (c is Dictionary) or not (c.phase in ["mount", "ride", "dismount"]): return
	var e: Dictionary = bikes[p.id]
	var r: BikeRider = e.rider
	if r == null: return
	var m := 1.0
	if c.phase == "mount":
		m = clampf(c.t / 0.62, 0.0, 1.0)
		var up := clampf(m / 0.35, 0.0, 1.0)
		e.lean = lerpf(-0.11, 0.0, up)
		e.steer = lerpf(0.3, 0.0, up)
		e.kick = 1.0 - clampf((m - 0.3) / 0.25, 0.0, 1.0)
		r.kick_foot = 0.0
	elif c.phase == "dismount":
		m = 1.0 - clampf(c.t / 0.66, 0.0, 1.0)
		e.kick = clampf((0.32 - m) / 0.2, 0.0, 1.0)
		r.kick_foot = sin(clampf((0.45 - m) / 0.35, 0.0, 1.0) * PI)
		e.lean = lerpf(e.lean, -0.11, clampf((0.2 - m) / 0.2, 0.0, 1.0))
	elif not (p.state in ["walk", "wait_path", "talk"]):
		# the day moved on under them (they arrived, or went in): off at once
		_finish_dismount(p, e)
		return
	elif p.state != "walk":
		# stopped on the bike (a word with Ash, a new path coming): a foot down
		e.v = 0.0
		e.lean += (-0.1 - e.lean) * (1.0 - exp(-dt * 4.0))
	r.mount = m
	_pose(e, dt)
	var a: CastActor = p.actor
	var me := m * m * (3.0 - 2.0 * m)
	var bx: Transform3D = e.model.global_transform
	var ax := Transform3D(Basis(Vector3.UP, e.yaw) * Basis(Vector3.BACK, e.lean * me), e.at)
	a.global_transform = ax
	r.rel = ax.affine_inverse() * bx
	r.speed = e.v
	r.lean_fwd = 0.03 + 0.06 * clampf(e.v / 5.0, 0.0, 1.0)
	r.foot_down = 1.0 if (c.phase == "ride" and e.v < 0.35) else 0.0
	r.look = clampf(e.om * 0.3, -0.5, 0.5)
	r.bell = clampf(1.0 - e.bell_t / 0.3, 0.0, 1.0) if e.bell_t < 0.3 else 0.0

# ---------- the rest ----------
# where the bikes are (Ash's bike brakes for them too)
func positions() -> Array:
	var out := []
	for id in bikes:
		var p: Dictionary = life.by_id[id]
		var c = p.get("cyc")
		if c is Dictionary and c.phase == "ride": out.append(bikes[id].at)
	return out

# the parked bikes, for walkers to steer round: [Vector2 centre, radius]
func obstacles() -> Array:
	var out := []
	for id in bikes:
		var p: Dictionary = life.by_id[id]
		var c = p.get("cyc")
		if c is Dictionary and c.phase != "to_bike": continue
		var e: Dictionary = bikes[id]
		out.append([Vector2(e.at.x, e.at.z), 0.75, id])
	return out

# a point pushed out of the parked bikes (Ash walking round them)
func push_out(q: Vector3, r := 0.32) -> Vector3:
	for ob in obstacles():
		var c: Vector2 = ob[0]
		var d := Vector2(q.x, q.z) - c
		var m: float = 0.55 + r
		if d.length() < m and d.length() > 1e-4:
			var n := c + d.normalized() * m
			q = Vector3(n.x, q.y, n.y)
	return q

# a parked bike right there (Ash's bike's front wheel)
func blocks(q: Vector3) -> bool:
	for ob in obstacles():
		if Vector2(q.x, q.z).distance_to(ob[0]) < 0.5: return true
	return false

func riding(p: Dictionary) -> bool:
	var c = p.get("cyc")
	return c is Dictionary and c.phase in ["mount", "ride", "dismount"]

# time skipped (life.gd resync): everyone off their bikes, the bikes home
func resync() -> void:
	for id in bikes:
		var p: Dictionary = life.by_id[id]
		var e: Dictionary = bikes[id]
		if p.get("cyc") is Dictionary:
			# (the schedule has placed them already: just off the bike, where they are)
			if e.rider:
				e.rider.on = 0.0
				if p.actor and p.actor.rider == e.rider: p.actor.rider = null
				if p.actor and p.actor.cloth: p.actor.cloth.obstacles = []
			p.erase("cyc")
		_park_home(e)

# overnight (or out of sight a long way from home while they are in): back by the gate
func update(dt: float, cam_pos: Vector3) -> void:
	for id in bikes:
		var p: Dictionary = life.by_id[id]
		var e: Dictionary = bikes[id]
		if p.get("cyc") is Dictionary: continue
		var h: Vector3 = e.home
		if p.state == "inside" and p.inside == p.home and Vector2(e.at.x - h.x, e.at.z - h.z).length() > 3.0 \
				and cam_pos.distance_to(e.at) > 40.0 and cam_pos.distance_to(Vector3(h.x, e.at.y, h.z)) > 40.0:
			_park_home(e)
		var c := cam_pos.distance_to(e.at)
		e.model.visible = c < 95.0

# dev: start someone's ride now (dev/bike_test.gd)
func debug_start(id: String) -> void:
	var p: Dictionary = life.by_id.get(id, {})
	if p.is_empty(): return
	var e: Dictionary = bikes[id]
	if p.state == "inside": life._leave(p)
	p.pos = Vector3(e.at.x + 1.0, e.at.y, e.at.z + 1.0)
	var to: Vector2 = life.snap(Vector2(-3, -2) if Vector2(e.at.x, e.at.z).distance_to(Vector2(-3, -2)) > 30.0 else Vector2(-40, 30))
	p.goal = {"kind": "spot", "spots": [Vector3(to.x, to.y, NAN)], "key": "debug", "door": false}
	p.target = Vector3(to.x, to.y, NAN)
	life._walk(p, to, "act")
