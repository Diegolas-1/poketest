class_name BikeAssist
extends RefCounted
# The road assist (bike/bike.gd): like the horse in Kingdom Come: Deliverance
# keeping to the road, Ash's bike follows the lane he is on while the player only
# gives it pace (the stick held forward, or cruising). Numbers in
# res://tunables/bike.json "assist"; the graph in res://bike/paths.json
# (tools/native/bake_paths.mjs: every road, lane and trail centre line, split at
# its junctions, with its half width and surface).
#
# Engaging: on a path (within its width), heading along it (within engage_ang of
# its direction), the stick held forward along it (within engage_ang too) at more
# than a walk. While engaged the bike steers itself by pure pursuit toward a point
# on the centre line ahead (lookahead la_min + la_k x speed), never tighter than
# its own turn radius allows, and slows for bends (curvature ahead: a sideways
# pull of lat_acc, braking at brake). Steering the stick away from straight ahead
# (more than override, relative to the camera) hands the steering back at once;
# centring it again on a path re-engages. Off the path's edge (half width +
# edge_margin) it lets go.
#
# Junctions: the branch is picked before the fork (signal_t seconds of riding
# ahead, at least signal_min m): a nudge of the stick (between nudge and
# override off centre) picks the branch that way; else, with the setting
# "Follow the road to my goal" on and a goal on the compass, the branch on the
# shortest way there (graph distances, Floyd-Warshall at load); else the
# straightest. The island's compass points down the chosen branch while one is
# pending (hint()).
#
#   update(...)   once a frame while riding: returns true while steering
#   om_target     the turn rate it wants (rad/s, + = left, as bike.gd's om)
#   v_limit       the most speed the bends ahead allow
#   hint()        a world point down the chosen branch near a fork, else null

const T := preload("res://tunables.gd")

# the graph
var nodes := PackedVector2Array()
var E: Array = []          # {a, b, w, s, p: PackedVector2Array, cum: PackedFloat32Array, len}
var adj: Array = []        # node -> [[edge, dir]] (dir +1: leaving along the edge from a)
var D: Array = []          # node x node shortest distances (PackedFloat32Array rows)
var walk_pts := PackedVector2Array()   # walk-only crossings (the stepping stones)
var _bk := {}              # Vector2i(8 m cell) -> [[edge, seg]]
const CELL := 8.0

# tunables
var LA_MIN := 2.4
var LA_K := 0.42
var ENGAGE := 0.8          # rad
var OVERRIDE := 0.42       # rad of stick off straight ahead (camera relative)
var NUDGE := 0.1
var EDGE := 0.6
var LAT := 3.6
var BRAKE := 4.5
var SIGNAL_T := 2.2
var SIGNAL_MIN := 12.0
var MIN_V := 0.8
var GAIN := 1.0

# state
var active := false
var e := -1                # the edge it follows
var dir := 1               # +1 toward its b end
var s := 0.0               # arc length from a
var lat := 0.0             # distance from the centre line (m)
var half := 1.4
var surface := "dirt"
var om_target := 0.0
var v_limit := 1e9
var aim := Vector2.ZERO    # the pursuit point
var why := ""              # the last fork's choice: stick | goal | straight | only
var goal := Vector3.INF    # the compass goal (bike.gd sets it), INF none
var goal_on := true
var choice := []           # [node, edge, dir] picked for the fork ahead, else []
var _choice_stick := false
var dead_end := false
var _seg := 0
var stats := {"us": 0.0, "us_max": 0.0}

func _init() -> void:
	var c := T.dict("bike", "assist", {})
	LA_MIN = float(c.get("lookahead_min", LA_MIN))
	LA_K = float(c.get("lookahead_k", LA_K))
	ENGAGE = float(c.get("engage_ang", ENGAGE))
	OVERRIDE = float(c.get("override", OVERRIDE))
	NUDGE = float(c.get("nudge", NUDGE))
	EDGE = float(c.get("edge_margin", EDGE))
	LAT = float(c.get("lat_acc", LAT))
	BRAKE = float(c.get("brake", BRAKE))
	SIGNAL_T = float(c.get("signal_t", SIGNAL_T))
	SIGNAL_MIN = float(c.get("signal_min", SIGNAL_MIN))
	MIN_V = float(c.get("min_speed", MIN_V))
	GAIN = float(c.get("gain", GAIN))
	_load()

func _load() -> void:
	var p := "res://bike/paths.json"
	if not FileAccess.file_exists(p): return
	var j = JSON.parse_string(FileAccess.get_file_as_string(p))
	if not j is Dictionary: return
	for n in j.get("nodes", []): nodes.append(Vector2(n[0], n[1]))
	adj.resize(nodes.size())
	for i in nodes.size(): adj[i] = []
	for ed in j.get("edges", []):
		var pts := PackedVector2Array()
		for q in ed.p: pts.append(Vector2(q[0], q[1]))
		if pts.size() < 2: continue
		var cum := PackedFloat32Array([0.0])
		for i in range(1, pts.size()): cum.append(cum[i - 1] + pts[i].distance_to(pts[i - 1]))
		var k := E.size()
		E.append({"a": int(ed.a), "b": int(ed.b), "w": float(ed.w), "s": String(ed.get("s", "dirt")), "p": pts, "cum": cum, "len": cum[cum.size() - 1]})
		adj[int(ed.a)].append([k, 1])
		adj[int(ed.b)].append([k, -1])
		for i in pts.size() - 1:
			var m := (pts[i] + pts[i + 1]) * 0.5
			var c0 := Vector2i(floori(m.x / CELL), floori(m.y / CELL))
			if not _bk.has(c0): _bk[c0] = []
			_bk[c0].append([k, i])
	for q in j.get("walk", []): walk_pts.append(Vector2(q[0], q[1]))
	# all-pairs distances (a few dozen nodes)
	var n := nodes.size()
	for i in n:
		var row := PackedFloat32Array()
		row.resize(n)
		row.fill(1e9)
		row[i] = 0.0
		D.append(row)
	for ed in E:
		var a: int = ed.a; var b: int = ed.b
		D[a][b] = minf(D[a][b], ed.len); D[b][a] = D[a][b]
	for k in n:
		var dk: PackedFloat32Array = D[k]
		for i in n:
			var dik: float = D[i][k]
			if dik >= 1e9: continue
			var di: PackedFloat32Array = D[i]
			for jj in n:
				var v: float = dik + dk[jj]
				if v < di[jj]: di[jj] = v
			D[i] = di

func ok() -> bool: return not E.is_empty()

# ---------- geometry ----------
# the point at arc length t on edge k
func at(k: int, t: float) -> Vector2:
	var ed: Dictionary = E[k]
	var cum: PackedFloat32Array = ed.cum
	var pts: PackedVector2Array = ed.p
	t = clampf(t, 0.0, ed.len)
	var i := cum.bsearch(t) - 1
	i = clampi(i, 0, pts.size() - 2)
	var sl := cum[i + 1] - cum[i]
	return pts[i].lerp(pts[i + 1], (t - cum[i]) / sl if sl > 1e-6 else 0.0)

# the nearest point of edge k's segments [i0, i1] to p: [dist, arc length, segment]
func _proj(k: int, p: Vector2, i0: int, i1: int) -> Array:
	var ed: Dictionary = E[k]
	var pts: PackedVector2Array = ed.p
	var cum: PackedFloat32Array = ed.cum
	var best := [1e9, 0.0, 0, 0]
	for i in range(maxi(0, i0), mini(pts.size() - 1, i1)):
		var a := pts[i]; var ab := pts[i + 1] - a
		var l2 := ab.length_squared()
		var u := clampf((p - a).dot(ab) / l2, 0.0, 1.0) if l2 > 1e-9 else 0.0
		var d := p.distance_to(a + ab * u)
		if d < best[0]: best = [d, cum[i] + u * (cum[i + 1] - cum[i]), i, i]
	return best

# the nearest edge to p within r: [edge, dist, arc length] or []
func nearest(p: Vector2, r := 6.0) -> Array:
	var best := []
	var bd := r
	var c := Vector2i(floori(p.x / CELL), floori(p.y / CELL))
	var seen := {}
	var rc := maxi(1, ceili(r / CELL))
	for dj in range(-rc, rc + 1):
		for di in range(-rc, rc + 1):
			for es in _bk.get(c + Vector2i(di, dj), []):
				var k: int = es[0]; var i: int = es[1]
				var key := k * 100000 + i
				if seen.has(key): continue
				seen[key] = true
				var q := _proj(k, p, i, i + 1)
				if q[0] < bd: bd = q[0]; best = [k, q[0], q[1]]
	return best

# the unit direction of edge k at arc length t, going dir
func tangent(k: int, t: float, d: int) -> Vector2:
	var a := at(k, t - 0.8)
	var b := at(k, t + 0.8)
	return ((b - a) * d).normalized()

# a walk-only crossing (the stepping stones) within r of p
func walk_only(p: Vector2, r := 1.0) -> bool:
	for q in walk_pts:
		if q.distance_squared_to(p) < r * r: return true
	return false

# ---------- forks ----------
func _end_node(k: int, d: int) -> int: return E[k].b if d > 0 else E[k].a

# the way out of node n along (k, d): a direction from the node a few metres in
func _out_dir(n: int, k: int, d: int) -> Vector2:
	var t: float = 0.0 if d > 0 else E[k].len
	var q := at(k, t + 5.0 * d)
	return (q - nodes[n]).normalized()

# the branches at node n arriving along (k, d), not turning back
func branches(n: int, k: int, d: int) -> Array:
	var tin := tangent(k, E[k].len if d > 0 else 0.0, d)
	var out := []
	for o in adj[n]:
		if o[0] == k: continue
		var od := _out_dir(n, o[0], o[1])
		if tin.dot(od) < -0.55: continue    # (back the way he came)
		out.append(o)
	return out

# the goal's distance from node n through the graph
func _goal_cost(n: int, ge: Array) -> float:
	var ed: Dictionary = E[ge[0]]
	return minf(D[n][ed.a] + ge[2], D[n][ed.b] + ed.len - ge[2])

# pick at node n (arriving on (k, d)); stick_yaw: the nudged way (INF none)
func pick(n: int, k: int, d: int, nudge_dir: Vector2) -> Array:
	var br := branches(n, k, d)
	if br.is_empty(): return []
	if br.size() == 1: why = "only"; return br[0]
	var tin := tangent(k, E[k].len if d > 0 else 0.0, d)
	if nudge_dir != Vector2.ZERO:
		var best := []; var bd := -9.0
		for o in br:
			var dt := _out_dir(n, o[0], o[1]).dot(nudge_dir)
			if dt > bd: bd = dt; best = o
		why = "stick"
		return best
	if goal_on and goal != Vector3.INF:
		var g2 := Vector2(goal.x, goal.z)
		var ge := _nearest_any(g2)
		if not ge.is_empty():
			var best2 := []; var bc := 1e18
			for o in br:
				var c: float
				if o[0] == ge[0]:
					c = ge[2] if o[1] > 0 else E[o[0]].len - ge[2]
				else:
					c = E[o[0]].len + _goal_cost(_end_node(o[0], o[1]), ge)
				if c < bc: bc = c; best2 = o
			# (no way there but back: fall through to the straightest)
			var here := _goal_cost(n, ge)
			if bc < 1e8 and bc <= here + 1.0:
				why = "goal"
				return best2
	var best3 := []; var bs := -9.0
	for o in br:
		var dt2 := _out_dir(n, o[0], o[1]).dot(tin)
		if dt2 > bs: bs = dt2; best3 = o
	why = "straight"
	return best3

var _gcache := [Vector2.INF, []]
func _nearest_any(p: Vector2) -> Array:
	if _gcache[0].distance_to(p) < 6.0: return _gcache[1]
	var best := []
	for r in [8.0, 24.0, 64.0]:
		best = nearest(p, r)
		if not best.is_empty(): break
	_gcache = [p, best]
	return best

# the next edge after (k, d) at its end: the fork's choice, or the straightest
var _straight := {}
func _next(k: int, d: int) -> Array:
	var n := _end_node(k, d)
	if not choice.is_empty() and choice[0] == n: return [choice[1], choice[2]]
	var key := k * 2 + (1 if d > 0 else 0)
	if _straight.has(key): return _straight[key]
	_straight[key] = _straight_of(n, k, d)
	return _straight[key]

func _straight_of(n: int, k: int, d: int) -> Array:
	var br := branches(n, k, d)
	if br.is_empty(): return []
	if br.size() == 1: return br[0]
	var tin := tangent(k, E[k].len if d > 0 else 0.0, d)
	var best := []; var bs := -9.0
	for o in br:
		var dt := _out_dir(n, o[0], o[1]).dot(tin)
		if dt > bs: bs = dt; best = o
	return best

# the point L metres ahead along the route (into the chosen branch)
func ahead(L: float) -> Vector2:
	var k := e; var d := dir; var t := s
	for _i in 4:
		var left: float = (E[k].len - t) if d > 0 else t
		if L <= left: return at(k, t + L * d)
		L -= left
		var nx := _next(k, d)
		if nx.is_empty(): return at(k, E[k].len if d > 0 else 0.0)
		k = nx[0]; d = nx[1]
		t = 0.0 if d > 0 else E[k].len
	return at(k, t)

# metres to the end of the current edge
func to_end() -> float: return (E[e].len - s) if dir > 0 else s

# ---------- once a frame ----------
# p, yaw: the bike; v speed; stick: the stick's world direction (unit, ZERO when
# released); stick_rel: its angle off straight ahead relative to the camera; m its
# tilt; cruising: riding on without the stick
func update(dt: float, p3: Vector3, yaw: float, v: float, stick: Vector2, stick_rel: float, m: float, cruising: bool) -> bool:
	var t0 := Time.get_ticks_usec()
	_update(dt, Vector2(p3.x, p3.z), yaw, v, stick, stick_rel, m, cruising)
	var us := float(Time.get_ticks_usec() - t0)
	stats.us = us
	stats.us_max = maxf(stats.us_max * 0.995, us)
	return active

func _update(_dt: float, p: Vector2, yaw: float, v: float, stick: Vector2, stick_rel: float, m: float, cruising: bool) -> void:
	om_target = 0.0
	v_limit = 1e9
	if E.is_empty(): active = false; return
	var fw := Vector2(sin(yaw), cos(yaw))
	var held := m > 0.08 and absf(stick_rel) < OVERRIDE
	var want := (held or (cruising and m <= 0.08)) and v > MIN_V
	# where on the graph: follow the current edge, else look round
	var found := false
	if e >= 0:
		var ed: Dictionary = E[e]
		var q := _proj(e, p, _seg - 12, _seg + 13)
		if q[0] > ed.w: q = _proj(e, p, 0, ed.p.size())
		lat = q[0]; s = q[1]; _seg = q[3]
		half = ed.w
		found = lat < half + EDGE
		# past its end: onto the next edge
		if found and to_end() < 0.05:
			var nx := _next(e, dir)
			if not nx.is_empty():
				e = nx[0]; dir = nx[1]
				choice = []
				var q2 := _proj(e, p, 0, E[e].p.size())
				lat = q2[0]; s = q2[1]; half = E[e].w; _seg = q2[3]
			elif active:
				dead_end = true
	if not found or not active:
		var nr := nearest(p, 4.0)
		if nr.is_empty() or nr[1] > E[nr[0]].w + (EDGE if active else 0.0):
			active = false; e = -1; choice = []
			return
		var k: int = nr[0]
		if k != e or not active:
			var tg := tangent(k, nr[2], 1)
			var d := 1 if tg.dot(fw) >= 0.0 else -1
			# (heading along it, and the stick along it too)
			var ang := acos(clampf(absf(tg.dot(fw)), -1.0, 1.0))
			var sang := acos(clampf((tg * d).dot(stick), -1.0, 1.0)) if stick != Vector2.ZERO else (0.0 if cruising else 9.0)
			if not active and (ang > ENGAGE or sang > ENGAGE): e = -1; return
			e = k; dir = d; s = nr[2]; lat = nr[1]; half = E[k].w
			_seg = clampi(E[k].cum.bsearch(s) - 1, 0, E[k].p.size() - 2)
			choice = []
			dead_end = false
	if not want:
		active = false
		return
	# a dead end ahead: let go at its end
	if dead_end and to_end() < 0.5:
		active = false
		return
	active = true
	surface = String(E[e].s)
	# the fork ahead: pick it in time (a nudge can change it until the last moment)
	var n := _end_node(e, dir)
	var sig := maxf(SIGNAL_MIN, v * SIGNAL_T)
	var nudge := Vector2.ZERO
	if m > 0.08 and absf(stick_rel) > NUDGE:
		nudge = fw.rotated(-signf(stick_rel) * 1.2)   # (+stick_rel = left: in (sin, cos) a turn of +yaw is a rotation by -angle)
	if to_end() < sig and adj[n].size() > 1:
		# (picked once; again on a nudge, or when the goal moved and no nudge chose it)
		if choice.is_empty() or choice[0] != n or nudge != Vector2.ZERO or (not _choice_stick and _goal_dirty):
			var pk := pick(n, e, dir, nudge)
			if not pk.is_empty():
				choice = [n, pk[0], pk[1]]
				_choice_stick = why == "stick"
		_goal_dirty = false
	elif choice.size() > 0 and choice[0] != n:
		choice = []
	# pure pursuit toward the point ahead on the centre line
	var la := LA_MIN + LA_K * v
	aim = ahead(la)
	var to := aim - p
	var alpha := wrapf(atan2(to.x, to.y) - yaw, -PI, PI)
	var ld := maxf(to.length(), 0.5)
	om_target = 2.0 * sin(alpha) * v / ld * GAIN
	# the bends ahead: the speed that keeps the sideways pull and the turn radius in
	var reach := v * v / (2.0 * BRAKE) + 4.0
	var prev := ahead(0.0)
	var prevd := Vector2.ZERO
	var dist := 0.0
	var stp := 1.5
	var x := stp
	while x <= reach + stp:
		var q := ahead(x)
		var dd := q - prev
		if dd.length() > 0.2:
			dd = dd.normalized()
			if prevd != Vector2.ZERO:
				var kap := absf(prevd.angle_to(dd)) / stp
				if kap > 1e-3:
					var vc := sqrt(LAT / kap)
					var vm := sqrt(maxf(0.0, (1.0 / kap - _r_min) / _r_k)) if _r_k > 0.0 else vc
					vm = minf(vm, _om_max / kap)
					vc = minf(vc, vm)
					v_limit = minf(v_limit, sqrt(vc * vc + 2.0 * BRAKE * maxf(0.0, dist - 1.5)))
			prevd = dd
		prev = q
		dist = x
		x += stp
	# the path ends ahead: ease to a stop at its end (no riding off into the grass)
	if dead_end or _next(e, dir).is_empty():
		var left := to_end()
		v_limit = minf(v_limit, sqrt(2.0 * BRAKE * maxf(0.0, left - 0.5)) + 0.6)

var _r_min := 1.3
var _r_k := 0.045
var _om_max := 99.0
var _goal_dirty := false
func set_turn(rmin: float, rk: float, om_max := 99.0) -> void:
	_r_min = rmin; _r_k = rk; _om_max = om_max

func set_goal(g: Vector3, on: bool) -> void:
	if (g == Vector3.INF) != (goal == Vector3.INF) or (g != Vector3.INF and g.distance_to(goal) > 3.0) or on != goal_on: _goal_dirty = true
	goal = g
	goal_on = on

# a world point down the chosen branch while a fork is coming up (the island's arrow)
func hint() -> Variant:
	if not active or choice.is_empty() or adj[choice[0]].size() < 3: return null
	var k: int = choice[1]; var d: int = choice[2]
	var q := at(k, (0.0 if d > 0 else E[k].len) + 10.0 * d)
	return Vector3(q.x, 0.0, q.y)
