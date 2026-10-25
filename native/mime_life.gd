class_name MimeLife
extends RefCounted
# Mr. Mime's days at PALLET HOUSE (companions.gd runs one for the companion
# with "home": "pallet_house"; the creature is creature_mrmime.gd). He lives
# there: he never follows Delia down to town. What he does is a job: walk to
# a spot (the last steps straight onto it, past the walk grid's margins round
# the tables and the bench), then do a task there for a while (the creature's
# task: sweep, wipe, tray / serve, water, wall, sit, rest) facing the way the
# job says.
#
#   Delia at work (her schedule's place is pallet_house and she's on the
#   hill): he works beside her. She opens up: he sweeps the porch. She serves:
#   he carries trays out to the tables, wipes them, sweeps the terrace near
#   her, and now and then they hang out: he comes to her side and listens
#   while she talks (companions.json owner_chat), then mimes his answer. She
#   gardens: he waters the bed next to her. Her break: he sits by her on the
#   bench. She's in the kitchen (cook): he serves and tidies on his own. He
#   waves her in each morning and waves her off home at night.
#   Delia away (town, home, the night): his own schedule (companions.json
#   "schedule": sleep in his basket by the door (nook), sweep the porch and
#   the terrace, water the garden and grandma's roses, tidy the tables, mime
#   practice by the cliff fence, the bench at sunset).
# Each job is picked deterministically from the day and time when the game
# jumps (resync puts him straight at it, already working).

const JOBS0 := {
	# task, how long (s), how close to its spot he stands, the table height
	"sweep": {"task": "sweep", "dur": [12.0, 22.0], "carry": "broom"},
	"tidy": {"task": "wipe", "dur": [7.0, 12.0], "th": 0.78},
	"tray": {"task": "serve", "dur": [2.8, 2.8], "carry": "tray", "th": 0.78},
	"water": {"task": "water", "dur": [7.0, 11.0], "carry": "can"},
	"practice": {"task": "wall", "dur": [14.0, 24.0]},
	"bench": {"task": "sit", "dur": [30.0, 60.0], "th": 0.5},
	"sleep": {"task": "rest", "dur": [120.0, 240.0], "th": 0.27},
	"hang": {"task": "listen", "dur": [9.0, 9.0]},
	"wait": {"task": "", "dur": [4.0, 8.0]},
}

# job lengths and the rest from the world editor (res://tunables/creatures.json "mrmime_jobs": <job> {dur [min, max] s, th})
var JOBS := _jobs()
static func _jobs() -> Dictionary:
	var j := JOBS0.duplicate(true)
	var o = preload("res://tunables.gd").file("creatures").get("mrmime_jobs")
	if o is Dictionary:
		for k in o: if j.has(k) and o[k] is Dictionary: for f in o[k]: j[k][f] = o[k][f]
	return j
var co
var life
var c: Dictionary
var ph: Dictionary
var mid := Vector2.ZERO
var rng := RandomNumberGenerator.new()
var job := {}
var with_delia := false
var plan := []                 # [minute, job, spot]
var chat_cd := 25.0
var greeted := -1              # the day he waved her in
var mood_cd := 20.0
var _pending_mood := {}        # {mood, t}
var off_grid := false          # standing on a work spot inside the walk grid's margins (or stepping off it)

func _init(owner_co, comp: Dictionary) -> void:
	co = owner_co
	life = owner_co.life
	c = comp
	rng.randomize()
	ph = life.places.get("pallet_house", {})
	if ph.has("middle"): mid = Vector2(ph.middle[0], ph.middle[1])
	for b in c.data.get("schedule", []):
		var hm := String(b[0]).split(":")
		plan.append([float(hm[0]) * 60.0 + float(hm[1]), String(b[1]), String(b[2])])
	c.task = ""; c.carry = ""; c.th = 0.72

func ok() -> bool:
	return not ph.is_empty()

# ---------- where things are ----------
func _spots(name: String) -> Array:
	match name:
		"nook": return [ph.raw.get("nook", ph.nook)] if ph.has("nook") else []
		"tables": return ph.get("table_at", [])
	var v = ph.get(name, [])
	return v if v is Array else [v]

static func _xz(v: Vector3) -> Vector2: return Vector2(v.x, v.z)
static func _p2(v: Vector3) -> Vector2: return Vector2(v.x, v.y)

# a spot to stand at for a job at `name` near `near` (or anywhere): [stand point, face]
func _place_for(kind: String, name: String, near = null) -> Array:
	if kind in ["tidy", "tray"]:
		var ts: Array = _spots("tables")
		if ts.is_empty(): return [mid, 0.0]
		var t: Vector3 = _nearest(ts, near) if near != null else ts[rng.randi() % ts.size()]
		var tc := _p2(t)
		# the serving side (toward the house), a little round to one side or the other
		var d := (mid - tc).normalized().rotated(rng.randf_range(-0.7, 0.7))
		return [tc + d * (0.78 if kind == "tidy" else 0.74), atan2(-d.x, -d.y)]
	if kind == "bench":
		var b: Array = _spots("bench")
		if b.is_empty(): return [mid, 0.0]
		var bv: Vector3 = b[0]
		var face: float = bv.z
		var side := Vector2(cos(face), -sin(face))   # along the bench
		var off := -0.42 if near != null else rng.randf_range(-0.4, 0.4)
		return [_p2(bv) + side * off + Vector2(sin(face), cos(face)) * 0.1, face]
	if kind == "sleep":
		var nk: Array = _spots("nook")
		if nk.is_empty(): return [mid, 0.0]
		var nv: Vector3 = nk[0]
		return [_p2(nv), nv.z if not is_nan(nv.z) else 0.0]
	var list: Array = _spots(name)
	if list.is_empty(): list = _spots("terrace")
	if list.is_empty(): return [mid, 0.0]
	var s: Vector3 = _nearest(list, near) if near != null else list[rng.randi() % list.size()]
	var at := _p2(s)
	var face := s.z if not is_nan(s.z) else rng.randf() * TAU
	match kind:
		"sweep":
			at = life.snap(at + Vector2.from_angle(rng.randf() * TAU) * rng.randf_range(0.5, 2.0))
			face = rng.randf() * TAU
		"water":
			# beside the bed, facing into it
			at = life.snap(at)
		"practice":
			at = life.snap(at)
	if near != null and kind in ["sweep", "water"]:
		var nn: Vector2 = near
		var off := (at - nn)
		if off.length() < 1.2: at = life.snap(nn + (off.normalized() if off.length() > 0.1 else Vector2(1, 0)) * 1.4)
	return [at, face]

func _nearest(list: Array, near) -> Vector3:
	var best: Vector3 = list[0]
	var bd := INF
	for s in list:
		var d := _p2(s).distance_to(near)
		if d < bd: bd = d; best = s
	return best

# ---------- Delia ----------
func _delia_here() -> bool:
	var o: Dictionary = c.owner
	if not String(o.place).begins_with("pallet_house"): return false
	if o.state == "inside": return o.inside == "pallet_house"
	return _xz(o.pos).distance_to(mid) < 26.0

# ---------- jobs ----------
# the job table: companions.json "jobs" (tunable) over the defaults here
func _job_def(kind: String) -> Dictionary:
	var d: Dictionary = c.data.get("jobs", {})
	if d.has(kind): return d[kind]
	return JOBS.get(kind, JOBS.wait)

func _start(kind: String, where: String, near = null, extra := {}) -> void:
	var J: Dictionary = _job_def(kind)
	var pf := _place_for(kind, where, near)
	job = {"kind": kind, "at": pf[0], "face": pf[1], "phase": "go", "t": 0.0, "dur": rng.randf_range(J.dur[0], J.dur[1]),
		"task": J.task, "carry": J.get("carry", ""), "th": float(J.get("th", 0.72)), "drift": Vector2.ZERO}
	job.merge(extra, true)
	if kind == "sweep": job.drift = Vector2.from_angle(rng.randf() * TAU) * 0.18
	c.task = ""
	c.carry = job.carry
	c.sleep = false

func _alone_job() -> Array:
	var m := float(life.clock.minute_of_day())
	var blk: Array = plan[0] if not plan.is_empty() else [0.0, "sweep", "terrace"]
	for b in plan:
		if b[0] <= m: blk = b
	return [blk[1], blk[2]]

func _with_job() -> void:
	var o: Dictionary = c.owner
	var op := _xz(o.pos)
	match String(o.act):
		"open": _start("sweep", "porch", op)
		"garden": _start("water", String(o.place).get_slice(".", 1), op)
		"break": _start("bench", "bench", op)
		"serve", "cook":
			var x := rng.randf()
			var inside: bool = o.state == "inside"
			if not inside and chat_cd <= 0.0 and x < 0.3: _start("hang", "", op, {"at": _beside(op), "face": 0.0}); return
			x = rng.randf()
			if x < 0.4: _start("tray", "tables", null)
			elif x < 0.75: _start("tidy", "tables", null)
			else: _start("sweep", "terrace", op if not inside else null)
		_:
			_start("wait", "porch", null)

func _beside(op: Vector2) -> Vector2:
	var me := _xz(c.pos)
	var d := (me - op)
	if d.length() < 0.2: d = Vector2(1, 0)
	return life.snap(op + d.normalized() * 1.0)

func resync() -> void:
	job = {}
	_pending_mood = {}
	with_delia = _delia_here()
	_next()
	# straight onto the job, already at it
	if not job.is_empty():
		var at: Vector2 = job.at
		c.pos = Vector3(at.x, life.world.height_at(at.x, at.y), at.y)
		c.yaw = job.face
		job.phase = "do"
		c.task = job.task; c.th = job.th
		c.sleep = job.kind == "sleep"
		c.carry = ""

func _next() -> void:
	if with_delia: _with_job()
	else:
		var j := _alone_job()
		_start(j[0], j[1])

func tick(dt: float, full: bool) -> void:
	if not ok(): return
	var o: Dictionary = c.owner
	chat_cd -= dt
	mood_cd -= dt
	var here := _delia_here()
	if here != with_delia:
		with_delia = here
		if here: _arrived()
		else: _left()
		_next()
	if job.is_empty(): _next()
	# a mood queued for later (his answer while she talks)
	if not _pending_mood.is_empty():
		_pending_mood.t = float(_pending_mood.t) - dt
		if _pending_mood.t <= 0.0:
			if c.creature and c.seen: c.creature.mood(_pending_mood.mood)
			_pending_mood = {}
	match job.phase:
		"go":
			var at: Vector2 = job.at
			if job.kind == "hang": at = _beside(_xz(o.pos)); job.at = at
			var me := _xz(c.pos)
			var d := me.distance_to(at)
			off_grid = d < 1.6
			if d >= 1.6 and not life.walkable(me):
				# off a work spot first: straight back onto the walk grid
				off_grid = true
				var out: Vector2 = life.snap(me)
				var st0: Vector2 = (out - me).normalized() * minf(out.distance_to(me) + 0.02, 0.9 * dt)
				c.v = 0.8
				c.pos = Vector3(c.pos.x + st0.x, life.world.height_at(c.pos.x + st0.x, c.pos.z + st0.y), c.pos.z + st0.y)
				c.yaw = wrapf(c.yaw + wrapf(atan2(st0.x, st0.y) - c.yaw, -PI, PI) * (1.0 - exp(-dt * 6.0)), -PI, PI)
			elif d < 1.6:
				# the last steps straight onto the spot (the grid keeps clear of tables and benches)
				c.v = Companions.damp(c.v, minf(0.9, 0.3 + d), 5.0, dt)
				if d > 0.04:
					var st := (at - me) / d * minf(d, c.v * dt)
					c.pos = Vector3(c.pos.x + st.x, life.world.height_at(c.pos.x + st.x, c.pos.z + st.y), c.pos.z + st.y)
					c.yaw = wrapf(c.yaw + wrapf(atan2(st.x, st.y) - c.yaw, -PI, PI) * (1.0 - exp(-dt * 6.0)), -PI, PI)
				if d < 0.08 or job.t > 6.0:
					job.phase = "do"; job.t = 0.0
					c.task = job.task; c.th = job.th
					c.sleep = false
				job.t = float(job.t) + dt
			else:
				co._go(c, at, c.data.hurry if d > 12.0 else c.data.speed, dt, full)
				job.t = 0.0
		"do":
			off_grid = true
			c.v = Companions.damp(c.v, 0.0, 6.0, dt)
			var face: float = job.face
			if job.kind == "hang": face = atan2(o.pos.x - c.pos.x, o.pos.z - c.pos.z)
			c.yaw = wrapf(c.yaw + wrapf(face - c.yaw, -PI, PI) * (1.0 - exp(-dt * 3.0)), -PI, PI)
			c.face = face
			job.t = float(job.t) + dt
			_doing(dt)
			if float(job.t) > float(job.dur) or _stale():
				_finish()

func _doing(dt: float) -> void:
	var o: Dictionary = c.owner
	match job.kind:
		"sweep":
			# sweeping along: a slow drift, turning back off anything in the way
			var dr: Vector2 = job.drift
			var nxt := _xz(c.pos) + dr * dt
			if life.walkable(nxt) and nxt.distance_to(job.at) < 2.5:
				c.pos = Vector3(nxt.x, life.world.height_at(nxt.x, nxt.y), nxt.y)
				c.v = dr.length()
				job.face = atan2(dr.x, dr.y) + 0.5
			else:
				job.drift = -dr.rotated(rng.randf_range(-0.6, 0.6))
		"sleep":
			c.sleep = true
		"hang":
			if not job.get("said", false) and job.t > 0.8:
				job.said = true
				var lines: Array = c.data.get("owner_chat", [])
				if not lines.is_empty() and o.state in ["act", "chat"] and o.bubble.is_empty():
					var e: Array = lines[rng.randi() % lines.size()]
					life.say(o, String(e[0]), 4.5)
					o.face = atan2(c.pos.x - o.pos.x, c.pos.z - o.pos.z)
					_pending_mood = {"mood": String(e[1]), "t": 4.0}
				chat_cd = rng.randf_range(60.0, 140.0)
		"bench":
			# sitting with her at her break, now and then a word
			if with_delia and chat_cd <= 0.0 and o.state == "act" and o.bubble.is_empty():
				chat_cd = rng.randf_range(35.0, 70.0)
				var lines2: Array = c.data.get("owner_chat", [])
				if not lines2.is_empty():
					var e2: Array = lines2[rng.randi() % lines2.size()]
					life.say(o, String(e2[0]), 4.5)
					_pending_mood = {"mood": String(e2[1]), "t": 4.0}
		"practice":
			if mood_cd <= 0.0 and job.t > 5.0:
				mood_cd = rng.randf_range(12.0, 25.0)
				if c.creature and c.seen: c.creature.mood(["box", "rope", "bow", "polish"][rng.randi() % 4])
		"tray":
			pass
	if with_delia and job.kind in ["tidy", "tray", "sweep"] and mood_cd <= 0.0 and rng.randf() < 0.004:
		# a word from her across the terrace
		mood_cd = rng.randf_range(25.0, 50.0)
		if o.state == "act" and o.bubble.is_empty() and _xz(o.pos).distance_to(_xz(c.pos)) < 9.0:
			var ob: Array = c.data.get("owner_barks", [])
			if not ob.is_empty(): life.say(o, String(ob[rng.randi() % ob.size()]), 2.4)

# the job no longer fits (Delia's moved on, his schedule's block changed)
func _stale() -> bool:
	if job.kind == "hang": return _xz(c.owner.pos).distance_to(_xz(c.pos)) > 3.0
	if job.kind == "bench" and with_delia: return c.owner.act != "break"
	if not with_delia and job.kind in ["sleep", "bench"]:
		var j := _alone_job()
		return j[0] != job.kind
	return false

func _finish() -> void:
	var was: String = job.kind
	c.task = ""
	c.sleep = false
	job = {}
	if was == "tray" and c.creature and c.seen and rng.randf() < 0.3: c.creature.mood("bow")
	_next()

func _arrived() -> void:
	var o: Dictionary = c.owner
	var d: int = life.clock.day()
	if greeted != d:
		greeted = d
		var hi: Array = c.data.get("hello", [])
		if not hi.is_empty(): life.say(o, String(hi[rng.randi() % hi.size()]), 3.0)
	c.sleep = false
	if c.creature and c.seen: c.creature.mood("wave" if rng.randf() < 0.6 else "bow")

func _left() -> void:
	var o: Dictionary = c.owner
	if String(o.act) == "home" or String(o.act) == "supper":
		var bye: Array = c.data.get("goodbye", [])
		if not bye.is_empty() and o.state != "inside": life.say(o, String(bye[rng.randi() % bye.size()]), 3.0)
	if c.creature and c.seen: c.creature.mood("wave")

# ---------- the player ----------
func talk_lines() -> Array:
	var e: Dictionary = c.data
	if c.sleep:
		var a: Array = e.talk.get("asleep", [])
		return co._as_lines(co._pick_any(a))
	var mm: Array = e.get("mimes", [])
	if mm.is_empty(): return ["..."]
	var pick: Array = mm[rng.randi() % mm.size()]
	if c.creature: c.creature.mood(String(pick[0]))
	return [String(pick[1])]
