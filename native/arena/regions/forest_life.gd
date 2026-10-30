extends Node
# The forest region's life (arena/regions/forest.gd's "life"): its ecosystem and
# the mechanics it shows off, on top of wild.gd's tracking.
#   the trees    a source of their own (wild/wild_arena_trees.gd) on the grove's
#                search trees: a limb for a cocoon (Kakuna, Metapod: an odd shape
#                on a silk thread under the crown, swaying, now and then a twitch
#                and a leaf), a perch up high (Pidgey, Spearow), a low limb to
#                crawl along (Caterpie). Ash still or crouched near a tree with
#                something in it looks up at it; then by the trunk A shakes it, from
#                further off A throws a pebble up into the crown
#   a shake      a cocoon may drop (the battle starts as it lands; it may cling
#                on: shake again), a caterpie falls (the same), perched birds burst
#                out and flee (wild.gd's own flight and tracking); rarely a shaken
#                Kakuna's tree rouses the hive
#   a pebble     a cocoon hardens (loosened: the next shake brings it down), a
#                caterpie drops into the undergrowth and hides there, birds flee
#   the hive     a Beedrill hive on a big tree's limb, Beedrill patrolling round it,
#                the buzz rising as Ash nears: walking up upright (or running near,
#                or shaking its tree) agitates it; full, it is provoked
#   provoked     an ambush system's swarm if the arena has one (arena "ambush":
#                swarm({...})), else the warning event here: the buzz swells,
#                "BEEDRILL ARE COMING!", the patrol comes after him; out of reach
#                they give up, caught, one attacks (a wild battle); the provoked
#                signal either way
#   the nest     a Pidgey nest in a fork with chicks (and eggs), the parent on its
#                rim: it watches and cries as Ash nears; too close upright (or a
#                shake, a pebble), it dives at him: the battle; then home again
#   ambience     the forest's bed and birds, the hive's buzz, cries from the canopy
#                where something is hiding near him (the sound alerts)
# Entering the forest with no hunt on starts its own (the region's default).
#
#   life.sources()            {"tree": WildArenaTrees}
#   life.shake(tree)  life.throw_pebble(tree, e)  life.provoke(why)
#   life.log                  what happened (tests read it)

signal provoked(why: String, at: Vector3)

const SHAKE_D := 1.7           # from the trunk's bark: A shakes it
const LOOK_D := 4.5            # past the crown's rim he may still look up into it
const PEBBLE_D := 11.0         # and throw a pebble this far from the trunk
const LOOK_STILL := 0.45       # still or crouched this long: he looks up
const SWARM_ODDS := 0.16       # a shaken Kakuna's tree rouses the hive
const PEBBLE_SWARM := 0.06
const DROP_ODDS := 0.62        # a shaken cocoon lets go (plus how loosened it is)
const UP := Vector3.UP

var arena
var region
var game: Node3D
var wild: Wild
var def := {}
var src: WildArenaTrees
var hud: Control
var rng := RandomNumberGenerator.new()
var t := 0.0
var log: Array = []
var test_odds := -1.0          # (tests: the swarm's odds forced; -1 = the real ones)
var auto_hunt := true          # entering starts the forest's hunt if none is on
var inside := false
var hive := {}
var nest := {}
var swarm := {}
var look := {}                 # {tree, e}: what he is looking up at
var prompt := {}               # {kind: shake | pebble, at, tree, e}
var _still := 0.0
var _pitch_set := false
var _shakes: Array = []        # {tree, t}
var _pebbles: Array = []       # {node, from, to, t, dur, tree, e}
var _falls: Array = []         # {e, v, t, then}
var _threads := {}             # e's instance id -> MeshInstance3D
var _cry_t := 2.0
var _told := {}
var _auto_done := false
var _sw: Dictionary = {}       # the encounter a swarm / the nest's parent has in battle

func setup_(a, r) -> void:
	arena = a
	region = r
	game = a.game
	wild = game.cast.wild
	def = r.def
	rng.randomize()
	src = WildArenaTrees.new()
	src.rect = ArenaRegions.rect(def)
	src.region_id = String(def.id)
	src.life = self
	src.wild = wild
	if not wild.sources.has(src): wild.sources.append(src)
	_limbs()
	_hive()
	_nest()
	hud = Hud.new()
	hud.life = self
	arena.layer.add_child(hud)

func _exit_tree() -> void:
	if wild and wild.sources.has(src): wild.sources.erase(src)
	Sfx.bed("forest", "amb_forest", 0.0)
	Sfx.bed("forest_birds", "amb_birds_day", 0.0)
	Sfx.bed("hive", "hive_buzz", 0.0)

func sources() -> Dictionary: return {"tree": src}

func _note(what: String) -> void:
	log.append(what)
	print("forest: " + what)

static func _h(a: Vector3, b: Vector3) -> float: return Vector2(a.x - b.x, a.z - b.z).length()

func _snd(id: String, alt: String, at = null, o := {}) -> void:
	Sfx.play(id if Sfx.has(id) else alt, at, o)

# ---------- the search trees' limbs and slots ----------
func _to_trail(l: Vector2) -> Vector2:
	var d: ArenaData = arena.data
	var g := Vector2(d.dirt_sd(l.x + 0.5, l.y) - d.dirt_sd(l.x - 0.5, l.y), d.dirt_sd(l.x, l.y + 0.5) - d.dirt_sd(l.x, l.y - 0.5))
	return (-g).normalized() if g.length() > 1e-3 else Vector2(1, 0)

func _limbs() -> void:
	var b := PropMesh.new()
	var o: Vector3 = region.search[0].at if not region.search.is_empty() else region.w(0, 0)
	for ti in region.search.size():
		var tr: Dictionary = region.search[ti]
		var base: Vector3 = tr.at
		var tw := _to_trail(tr.local)
		var ta := atan2(tw.y, tw.x)
		var trunk := float(tr.trunk)
		var cy0 := float(tr.cy0)
		var cr := float(tr.cr)
		var slots := []
		var mk := func(kind: String, a: float, y: float, L: float) -> Dictionary:
			var dir := Vector3(cos(a), 0, sin(a))
			var from := base + UP * y + dir * trunk * 0.5
			var to := base + dir * L + UP * (y - 0.2)
			ForestProps.limb(b, from - o, to - o, 0.1 + 0.02 * L, true, ti * 3 + slots.size())
			return {"kind": kind, "tree": src.trees.size(), "from": from, "to": to, "e": null, "dir": dir}
		var hs: Dictionary = mk.call("hang", ta + 0.55, clampf(cy0 + 0.35, 3.1, 5.6), clampf(cr * 0.62, 1.7, 2.7))
		hs.attach = (hs.from as Vector3).lerp(hs.to, 0.8) - UP * 0.06
		hs.len = rng.randf_range(0.45, 0.85)
		hs.at = (hs.attach as Vector3) - UP * float(hs.len)
		slots.append(hs)
		var ps: Dictionary = mk.call("perch", ta - 0.75, clampf(cy0 + 0.7, 3.8, 6.6), clampf(cr * 0.78, 2.0, 3.3))
		ps.at = (ps.from as Vector3).lerp(ps.to, 0.84) + UP * 0.06
		slots.append(ps)
		var cs: Dictionary = mk.call("crawl", ta + 2.3, clampf(cy0 - 0.5, 2.5, 3.9), 2.6)
		cs.a = (cs.from as Vector3).lerp(cs.to, 0.3) + UP * 0.07
		cs.b = (cs.from as Vector3).lerp(cs.to, 0.86) + UP * 0.05
		cs.at = (cs.a as Vector3).lerp(cs.b, 0.5)
		slots.append(cs)
		src.trees.append({"at": base, "cr": cr, "cy0": cy0, "h": float(tr.h), "trunk": trunk, "slots": slots, "region": tr})
	if not b.S.is_empty():
		PropScatter.single(region, b.mesh(ForestProps.mats()), o, {"shadow": true, "range": 90.0}).name = "Limbs"

# ---------- the hive ----------
func _hive() -> void:
	var tr: Dictionary = region.tree_at("hive")
	if tr.is_empty() or not def.has("hive"): return
	var H: Dictionary = def.hive
	var base: Vector3 = tr.at
	# out over the spur's end (the brave way in), at its height
	var tw := _to_trail(tr.local)
	var dir := Vector3(tw.x, 0, tw.y)
	var y := float(H.get("h", 5.2))
	var from := base + UP * y + dir * float(tr.trunk) * 0.5
	var to := base + dir * 2.6 + UP * (y - 0.1)
	var b := PropMesh.new()
	ForestProps.limb(b, from - base, to - base, 0.16, true, 7)
	PropScatter.single(region, b.mesh(ForestProps.mats()), base, {"shadow": true, "range": 90.0}).name = "HiveLimb"
	var at := from.lerp(to, 0.78) + UP * 0.02
	var node := PropScatter.single(region, ForestProps.hive(), at, {"shadow": true, "range": 110.0, "ink": true})
	node.name = "Hive"
	var bees := []
	for k in int(H.get("patrol", 3)):
		var c := Wild.make_creature("beedrill")
		region.add_child(c)
		c.position = at
		bees.append({"node": c, "ph": TAU * k / 3.0, "r": rng.randf_range(1.7, 2.6), "w": rng.randf_range(0.8, 1.3) * (1.0 if k % 2 == 0 else -1.0), "y": rng.randf_range(-1.4, -0.2), "pos": at})
	hive = {"tree": tr, "at": at, "node": node, "bees": bees, "k": 0.0, "cool": 0.0, "warn": float(H.get("warn", 13.0)), "provoke": float(H.get("provoke", 7.5)), "base": base}

# ---------- the nest ----------
func _nest() -> void:
	var tr: Dictionary = region.tree_at("nest")
	if tr.is_empty() or not def.has("nest"): return
	var N: Dictionary = def.nest
	var base: Vector3 = tr.at
	var tw := _to_trail(tr.local)
	var dir := Vector3(tw.x, 0, tw.y)
	var y := float(N.get("h", 3.4))
	var at := base + dir * (float(tr.trunk) + 0.45) + UP * y
	# a fork to sit in: two limbs splaying from the trunk under it
	var b := PropMesh.new()
	var side := dir.cross(UP).normalized()
	for s in [-1.0, 1.0]:
		var f := base + UP * (y - 0.45) + dir * float(tr.trunk) * 0.4
		ForestProps.limb(b, f - base, (at + side * s * 0.55 + dir * 0.7 + UP * 0.25) - base, 0.12, s > 0.0, 11 + int(s))
	PropScatter.single(region, b.mesh(ForestProps.mats()), base, {"shadow": true, "range": 90.0}).name = "NestLimbs"
	var node := PropScatter.single(region, ForestProps.nest(int(N.get("eggs", 2))), at, {"shadow": true, "range": 90.0, "ink": true})
	node.name = "Nest"
	var chicks := []
	for k in int(N.get("chicks", 2)):
		var c := Wild.make_creature("pidgey")
		region.add_child(c)
		c.scale = Vector3.ONE * 0.45
		var a := TAU * k / 2.0 + 2.2
		c.position = at + Vector3(cos(a) * 0.13, 0.12, sin(a) * 0.13)
		c.rotation.y = atan2(dir.x, dir.z) + rng.randf_range(-0.6, 0.6)
		chicks.append(c)
	var gid := String(N.get("guard", "pidgeotto"))
	var par := Wild.make_creature(gid)
	region.add_child(par)
	var rim := at - dir * 0.3 + UP * 0.16
	par.position = rim
	par.rotation.y = atan2(dir.x, dir.z)
	nest = {"tree": tr, "at": at, "rim": rim, "dir": dir, "node": node, "chicks": chicks, "parent": par, "species": gid, "state": "calm", "t": 0.0,
		"cool": 0.0, "warn": float(N.get("warn", 8.0)), "disturb": float(N.get("disturb", 4.2)), "cry": 1.0, "cheep": 0.6, "base": base}

# ---------- what wild.gd asks ----------
# A by a trunk (a shake) or under a crown he is looking up into (a pebble)
func use_pressed() -> bool:
	if not inside or Battle.active or wild.battle_on or prompt.is_empty() or not swarm.is_empty() and String(swarm.get("phase", "")) != "home": return false
	if String(prompt.kind) == "shake": shake(prompt.tree)
	else: throw_pebble(prompt.tree, prompt.get("e", {}))
	return true

# a startle up a tree: a cocoon hardens where it hangs, a caterpie lets go and drops
# into the undergrowth, a bird flees (wild.gd's flight)
func startled(e: Dictionary, _d: float) -> bool:
	if not bool(e.get("aloft", false)): return false
	match String(e.get("role", "")):
		"hang":
			# (a twitch now and then while he is close, not one a frame)
			if t - float(e.get("st_t", -9.0)) > 2.5:
				e.st_t = t
				_twitch(e, 1.0)
			e.alert = 0.3
			e.loosened = float(e.get("loosened", 0.0)) + 0.1
			return true
		"crawl":
			_drop(e, "hide")
			return true
	src.release(e)
	e.react = "flee"
	return false

# one settled on a slot (src.settle): placed up there
func on_settled(e: Dictionary) -> void:
	var s: Dictionary = e.slot
	var node: Node3D = e.node
	match String(s.kind):
		"hang":
			var ci := Creature.species_info(String(e.species))
			e.hang_h = float(ci.get("height", 0.6))
			e.sw = rng.randf() * TAU
			e.tw_t = rng.randf_range(3.0, 8.0)
			node.position = (s.attach as Vector3) - UP * (float(s.len) + float(e.hang_h))
			node.rotation.y = rng.randf() * TAU
			var th := MeshInstance3D.new()
			var cm := CylinderMesh.new()
			cm.top_radius = 0.007; cm.bottom_radius = 0.007; cm.height = 1.0; cm.radial_segments = 4; cm.rings = 1
			th.mesh = cm
			th.material_override = PropMats.silk()
			th.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			region.add_child(th)
			_threads[e.node.get_instance_id()] = th
		"perch":
			node.position = s.at
			node.rotation.y = atan2((s.dir as Vector3).x, (s.dir as Vector3).z)
		"crawl":
			e.cu = rng.randf()
			e.cdir = 1.0
			e.cpause = 0.0
			node.position = (s.a as Vector3).lerp(s.b, float(e.cu))
	e.last_pos = node.position

# ---------- the frame ----------
func _process(dt: float) -> void:
	t += dt
	if arena == null or arena.gone: return
	var me: Vector3 = game.pos
	var near_forest := ArenaRegions.rect_sd(src.rect, me.x - ArenaData.C.x, me.z - ArenaData.C.y) < 40.0
	_ambience(dt)
	if not near_forest:
		_clear_look()
		prompt = {}
		return
	_aloft(dt)
	_falls_step(dt)
	_shakes_step(dt)
	_pebbles_step(dt)
	_hive_step(dt, me)
	_nest_step(dt, me)
	_swarm_step(dt, me)
	if Battle.active or wild.battle_on or game.trans_busy or not inside:
		_clear_look()
		prompt = {}
		return
	_search(dt, me)
	_cries(dt, me)

# the ones up the trees: cocoons sway on their threads (and twitch), caterpillars crawl
func _aloft(dt: float) -> void:
	for id in _threads.keys():
		if not is_instance_id_valid(id):
			(_threads[id] as Node).queue_free()
			_threads.erase(id)
	for e in wild.encs:
		var node: Node3D = e.node
		if not is_instance_valid(node): continue
		var th = _threads.get(node.get_instance_id())
		if not bool(e.get("aloft", false)) or String(e.state) != "hidden":
			if th and String(e.state) != "dropping": _cut_thread(e)
			continue
		var s: Dictionary = e.get("slot", {})
		match String(e.get("role", "")):
			"hang":
				e.sw = float(e.sw) + dt
				var tw := 0.0
				e.tw_t = float(e.tw_t) - dt
				if float(e.tw_t) <= 0.0:
					_twitch(e, 0.6)
				if float(e.get("twk", 0.0)) > 0.0:
					e.twk = float(e.twk) - dt
					tw = sin(float(e.twk) * 40.0) * 0.22 * float(e.twk) / 0.4 * float(e.get("tw_amp", 1.0))
				var ax := 0.07 * sin(float(e.sw) * 0.9) + tw
				var az := 0.05 * sin(float(e.sw) * 0.7 + 1.3) + tw * 0.6
				var L := float(s.len) + float(e.hang_h)
				var B := Basis(Vector3.RIGHT, ax) * Basis(Vector3.BACK, az)
				var attach: Vector3 = s.attach
				node.position = attach + B * Vector3(0, -L, 0)
				node.rotation.x = ax
				node.rotation.z = az
				if th:
					var top: Vector3 = attach + B * Vector3(0, -float(s.len), 0)
					var mid := (attach + top) * 0.5
					(th as MeshInstance3D).global_transform = Transform3D(Basis(Vector3.RIGHT, ax) * Basis(Vector3.BACK, az) * Basis.from_scale(Vector3(1, float(s.len), 1)), mid)
			"crawl":
				if float(e.get("cpause", 0.0)) > 0.0:
					e.cpause = float(e.cpause) - dt
				else:
					var L2 := maxf(0.1, ((s.b as Vector3) - (s.a as Vector3)).length())
					e.cu = float(e.cu) + float(e.cdir) * dt * 0.13 / L2
					if float(e.cu) > 1.0 or float(e.cu) < 0.0:
						e.cu = clampf(float(e.cu), 0.0, 1.0); e.cdir = -float(e.cdir); e.cpause = rng.randf_range(0.8, 2.2)
					elif rng.randf() < dt * 0.15: e.cpause = rng.randf_range(0.6, 1.8)
				var p: Vector3 = (s.a as Vector3).lerp(s.b, float(e.cu))
				var dv := ((s.b as Vector3) - (s.a as Vector3)) * float(e.cdir)
				node.position = p
				node.rotation.y = lerp_angle(node.rotation.y, atan2(dv.x, dv.z), 1.0 - exp(-dt * 4.0))

func _twitch(e: Dictionary, amp: float) -> void:
	e.twk = 0.4
	e.tw_amp = amp
	e.tw_t = rng.randf_range(5.0, 11.0)
	var node: Node3D = e.node
	_snd("cocoon_tick", "peck", node.position, {"vol": -16.0 + amp * 6.0, "dist": 18.0})
	if rng.randf() < 0.8: wild._feather(node.position + UP * (float(e.get("hang_h", 0.6)) + 0.3), true)
	_note("twitch %s" % e.species)

func _cut_thread(e: Dictionary) -> void:
	var node = e.node
	if node == null or not is_instance_valid(node): return
	var th = _threads.get(node.get_instance_id())
	if th:
		(th as Node).queue_free()
		_threads.erase(node.get_instance_id())

# ---------- looking up, the prompt ----------
func _clear_look() -> void:
	look = {}
	_still = 0.0
	if _pitch_set and game.cast.player:
		game.cast.player.look_pitch = 0.0
		_pitch_set = false

func _tree_has(tr: Dictionary) -> Array:
	var out := []
	for s in tr.slots:
		var e = s.e
		if e is Dictionary and wild.encs.has(e) and String(e.state) == "hidden" and bool(e.get("aloft", false)): out.append(e)
	return out

func _search(dt: float, me: Vector3) -> void:
	var still: bool = absf(float(game.speed)) < 0.3 or game.cast.crouching
	_still = _still + dt if still else 0.0
	# the nearest search tree with something up it, in reach of a look
	var best = null
	var bd := INF
	for tr in src.trees:
		var d := _h(me, tr.at)
		if d > float(tr.cr) + LOOK_D or d >= bd: continue
		if _tree_has(tr).is_empty(): continue
		best = tr; bd = d
	if best != null and _still >= LOOK_STILL:
		var es := _tree_has(best)
		# the one nearest where he faces
		var fwd := Vector3(sin(game.yaw), 0, cos(game.yaw))
		es.sort_custom(func(a, b): return fwd.dot(((a.node as Node3D).position - me).normalized()) > fwd.dot(((b.node as Node3D).position - me).normalized()))
		var e: Dictionary = es[0]
		if look.get("e") != e:
			look = {"tree": best, "e": e, "t": 0.0}
			_snd("spot_ping", "critter_chirp", (e.node as Node3D).position, {"vol": -10.0, "pitch": 1.5, "dist": 30.0})
			_note("look %s" % e.species)
			if not _told.has("look"):
				_told.look = true
				wild.toaster.push("info", "SOMETHING'S UP THERE", "Shake the tree from its trunk (A), or throw a pebble up into it (A from further off).", "check", 3.4)
		look.t = float(look.t) + dt
		# he looks up at it (his head; standing still he turns to it)
		var np: Vector3 = (e.node as Node3D).position
		var pitch := atan2(np.y + 0.3 - (me.y + 1.5), maxf(0.5, _h(me, np)))
		game.cast.player.look_pitch = clampf(pitch, 0.0, 0.85)
		_pitch_set = true
		if absf(float(game.speed)) < 0.1:
			var want := atan2(np.x - me.x, np.z - me.z)
			game.yaw += wrapf(want - game.yaw, -PI, PI) * (1.0 - exp(-dt * 3.0))
	elif best == null or _still <= 0.0:
		if not look.is_empty() and (best == null or _h(me, (look.tree as Dictionary).at) > float(look.tree.cr) + LOOK_D): _clear_look()
		elif _pitch_set and _still <= 0.0:
			game.cast.player.look_pitch = 0.0
			_pitch_set = false
	# the prompt: by a trunk, a shake; under a crown he is looking into, a pebble
	prompt = {}
	var all: Array = src.trees.duplicate()
	for k in ["hive", "nest"]:
		var tr2: Dictionary = region.tree_at(k)
		if not tr2.is_empty(): all.append({"at": tr2.at, "trunk": tr2.trunk, "cr": tr2.cr, "named": k, "slots": []})
	var nt = null
	var nd := INF
	for tr in all:
		var d := _h(me, tr.at) - float(tr.trunk)
		if d < SHAKE_D and d < nd: nd = d; nt = tr
	if nt != null:
		prompt = {"kind": "shake", "tree": nt, "at": (nt.at as Vector3) + UP * 1.6}
	elif not look.is_empty() and _h(me, look.tree.at) < PEBBLE_D + float(look.tree.trunk):
		prompt = {"kind": "pebble", "tree": look.tree, "e": look.e, "at": (look.e.node as Node3D).position + UP * 0.9}

# ---------- a shake ----------
func shake(tr: Dictionary) -> void:
	_shakes.append({"tree": tr, "t": 0.0})
	var at: Vector3 = tr.at
	_snd("tree_creak", "bush_rustle", at + UP * 2.0, {"vol": -4.0})
	Sfx.play("bush_rustle", at + UP * 4.0, {"vol": 0.0, "dist": 30.0})
	Sfx.play("bush_rustle", at + UP * 5.0, {"vol": -3.0, "dist": 30.0, "pitch": 0.8})
	for i in 12:
		var a := rng.randf() * TAU
		wild._feather(at + Vector3(cos(a), 0, sin(a)) * rng.randf_range(0.5, float(tr.get("cr", 3.0)) * 0.8) + UP * rng.randf_range(3.0, 6.0), true)
	if game.cast.player: game.yaw = atan2(at.x - game.pos.x, at.z - game.pos.z)
	_note("shake")
	var named := String(tr.get("named", ""))
	if named == "hive":
		provoke("shook the hive's tree")
		return
	if named == "nest":
		_nest_disturb("shake")
		return
	var es := _tree_has(tr)
	if es.is_empty():
		wild.toaster.push("info", "ONLY LEAVES", "Nothing fell out of that one.", "chat", 1.6)
		return
	var roused := false
	for e in es:
		match String(e.role):
			"hang":
				var odds := test_odds if test_odds >= 0.0 else SWARM_ODDS
				if String(e.species) == "kakuna" and not roused and rng.randf() < odds:
					roused = true
					_twitch(e, 1.0)
					provoke("a Kakuna's tree shaken")
				elif rng.randf() < DROP_ODDS + float(e.get("loosened", 0.0)) or float(e.get("loosened", 0.0)) >= 0.7:
					_drop(e, "battle")
				else:
					_twitch(e, 1.2)
					e.loosened = float(e.get("loosened", 0.0)) + 0.3
					wild.toaster.push("info", "IT'S CLINGING ON!", "The %s held on tight. Shake it again." % wild._name(e), "sweat", 2.2)
					_note("cling %s" % e.species)
			"crawl":
				_drop(e, "battle")
			_:
				_flush(e)

func _flush(e: Dictionary) -> void:
	src.release(e)
	e.react = "flee"
	e.alert = 1.0
	_note("flush %s" % e.species)

# off its thread or its limb: it falls; a cocoon or a caterpillar shaken down lands
# dazed and the battle starts ("battle"); one pebbled down hides where it lands ("hide")
func _drop(e: Dictionary, then: String) -> void:
	src.release(e)
	_cut_thread(e)
	e.state = "dropping"
	e.shown = true
	(e.node as Node3D).visible = true
	_falls.append({"e": e, "v": 0.0, "t": 0.0, "then": then, "spin": rng.randf_range(-3.0, 3.0)})
	_snd("silk_snap", "peck", (e.node as Node3D).position, {"vol": -6.0})
	_note("drop %s" % e.species)

func _falls_step(dt: float) -> void:
	for f in _falls.duplicate():
		var e: Dictionary = f.e
		var node: Node3D = e.node
		if not is_instance_valid(node) or not wild.encs.has(e):
			_falls.erase(f); continue
		f.t = float(f.t) + dt
		var g: float = game.world.height_at(node.position.x, node.position.z)
		if node.position.y > g + 0.01:
			f.v = float(f.v) - 14.0 * dt
			node.position.y = maxf(g, node.position.y + float(f.v) * dt)
			node.rotation.x = lerpf(node.rotation.x, 0.0, 1.0 - exp(-dt * 6.0))
			node.rotation.z = lerpf(node.rotation.z, 0.0, 1.0 - exp(-dt * 6.0))
			node.rotation.y += float(f.spin) * dt
			if node.position.y <= g + 0.01:
				f.landed = float(f.t)
				Sfx.play("thump" if Sfx.has("thump") else "scuff", node.position, {"vol": -4.0})
				for i in 4: wild._feather(node.position + UP * 0.2, true)
				node.call("mood", "hurt")
			continue
		if not f.has("landed"): f.landed = float(f.t)
		if float(f.t) - float(f.landed) < 0.45: continue
		_falls.erase(f)
		node.rotation.x = 0.0; node.rotation.z = 0.0
		e.kind = "grass"
		e.aloft = false
		if String(f.then) == "battle" and not wild.battle_on:
			wild.toaster.push("warn", "%s DROPPED!" % wild._name(e).to_upper(), "It fell right in front of you!", "bang", 1.8)
			_note("battle %s" % e.species)
			wild._start_battle(e, "startled", "ash")
		else:
			e.state = "hidden"
			e.alert = 0.4
			e.wary = true
			e.t = 0.0
			e.pose = ""
			_note("hides %s" % e.species)

func _shakes_step(dt: float) -> void:
	for s in _shakes.duplicate():
		s.t = float(s.t) + dt
		var u := float(s.t) / 1.1
		var tr: Dictionary = s.tree
		var reg: Dictionary = tr.get("region", tr)
		var mm: Array = reg.get("mm", [])
		var a := 0.06 * sin(float(s.t) * 23.0) * (1.0 - clampf(u, 0.0, 1.0)) if u < 1.0 else 0.0
		var ax := Vector3(cos(t), 0, sin(t)).normalized()
		for h in mm:
			var m: MultiMesh = h[0]
			var j: int = h[1]
			if not h.size() > 2: h.append(m.get_instance_transform(j))
			var x0: Transform3D = h[2]
			m.set_instance_transform(j, Transform3D(Basis(ax, a) * x0.basis, x0.origin))
		if u >= 1.0: _shakes.erase(s)

# ---------- a pebble ----------
func throw_pebble(tr: Dictionary, e) -> void:
	var me: Vector3 = game.pos
	var to: Vector3 = (e.node as Node3D).position + UP * 0.25 if e is Dictionary and not e.is_empty() and is_instance_valid(e.node) else (tr.at as Vector3) + UP * (float(tr.get("cy0", 4.0)) + 0.6)
	var fwd := Vector3(to.x - me.x, 0, to.z - me.z).normalized()
	game.yaw = atan2(fwd.x, fwd.z)
	var from := me + UP * 1.35 + fwd * 0.25
	var mi := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.05; sm.height = 0.09; sm.radial_segments = 6; sm.rings = 3
	mi.mesh = sm
	mi.material_override = PropMats.vc()
	region.add_child(mi)
	mi.global_position = from
	_pebbles.append({"node": mi, "from": from, "to": to, "t": 0.0, "dur": 0.25 + from.distance_to(to) / 13.0, "tree": tr, "e": e})
	Sfx.play("whoosh", from, {"vol": -12.0, "pitch": 1.6})
	_note("pebble")

func _pebbles_step(dt: float) -> void:
	for p in _pebbles.duplicate():
		p.t = float(p.t) + dt
		var u := clampf(float(p.t) / float(p.dur), 0.0, 1.0)
		var q: Vector3 = (p.from as Vector3).lerp(p.to, u) + UP * sin(u * PI) * 0.9
		(p.node as Node3D).global_position = q
		if u < 1.0: continue
		_pebbles.erase(p)
		(p.node as Node).queue_free()
		_hit(p.tree, p.e)

func _hit(tr: Dictionary, e) -> void:
	var at: Vector3 = (tr.at as Vector3) + UP * 4.0
	Sfx.play("bush_rustle", at, {"vol": -3.0, "dist": 26.0})
	_snd("pebble_tap", "peck", at, {"vol": -6.0})
	for i in 5: wild._feather(at + Vector3(rng.randf_range(-1, 1), rng.randf_range(-0.5, 1.0), rng.randf_range(-1, 1)), true)
	var named := String(tr.get("named", ""))
	if named == "hive": provoke("a pebble at the hive"); return
	if named == "nest": _nest_disturb("pebble"); return
	if not (e is Dictionary) or e.is_empty() or not wild.encs.has(e) or not bool(e.get("aloft", false)): return
	match String(e.role):
		"hang":
			_twitch(e, 1.3)
			e.loosened = float(e.get("loosened", 0.0)) + 0.35
			(e.node as Node3D).call("mood", "harden")
			_snd("harden_clink", "peck", (e.node as Node3D).position, {"vol": -4.0})
			wild.toaster.push("info", "%s HARDENED!" % wild._name(e).to_upper(), "Now shake the tree from its trunk to bring it down.", "check", 2.6)
			var odds := (test_odds if test_odds >= 0.0 else PEBBLE_SWARM)
			if String(e.species) == "kakuna" and rng.randf() < odds: provoke("a pebble at a Kakuna")
		"crawl":
			_drop(e, "hide")
			wild.toaster.push("info", "%s DROPPED!" % wild._name(e).to_upper(), "It fell into the undergrowth. Creep up on it.", "check", 2.4)
		_:
			_flush(e)

# ---------- the cries from the canopy (and the grass): the sound alerts ----------
func _cries(dt: float, me: Vector3) -> void:
	_cry_t -= dt
	if _cry_t > 0.0: return
	_cry_t = rng.randf_range(2.2, 4.5)
	var near := wild.encs.filter(func(e): return String(e.state) == "hidden" and is_instance_valid(e.node) and _h(me, (e.node as Node3D).position) < 16.0)
	if near.is_empty(): return
	var e: Dictionary = near[rng.randi() % near.size()]
	var at: Vector3 = (e.node as Node3D).position
	match String(e.species):
		"pidgey", "pidgeotto": Sfx.play("bird_call", at, {"vol": -9.0, "pitch": 1.25, "dist": 26.0})
		"spearow": Sfx.play("bird_call", at, {"vol": -7.0, "pitch": 0.85, "dist": 26.0})
		"kakuna", "metapod": _snd("cocoon_tick", "peck", at, {"vol": -12.0, "dist": 18.0})
		"weedle", "caterpie": Sfx.play("critter_chirp", at, {"vol": -12.0, "pitch": 1.5, "dist": 18.0})
		_: Sfx.play("creature_rustle", at, {"vol": -10.0, "dist": 18.0})

# ---------- the hive ----------
func _hive_step(dt: float, me: Vector3) -> void:
	if hive.is_empty(): return
	hive.cool = maxf(0.0, float(hive.cool) - dt)
	var at: Vector3 = hive.at
	var d := _h(me, hive.base)
	var bees: Array = hive.bees
	var vis := not Battle.active and d < 70.0
	# the patrol: round the hive, bobbing, turning to watch him when he is near
	if swarm.is_empty() or String(swarm.phase) == "home":
		var k := float(hive.k)
		for b in bees:
			var n: Node3D = b.node
			n.visible = vis
			if not vis: continue
			b.ph = float(b.ph) + dt * float(b.w) * (1.0 + k * 1.5)
			var want := at + Vector3(cos(float(b.ph)) * float(b.r), float(b.y) + 0.25 * sin(t * 2.1 + float(b.r) * 3.0), sin(float(b.ph)) * float(b.r))
			var pos: Vector3 = b.pos
			pos = pos.lerp(want, 1.0 - exp(-dt * (3.0 if not swarm.is_empty() else 8.0)))
			var mv := pos - n.position
			n.position = pos
			b.pos = pos
			if d < 10.0: n.set("look_at_pos", me + UP * 1.3)
			else: n.set("look_at_pos", Vector3(NAN, NAN, NAN))
			if mv.length() > 1e-4: n.rotation.y = lerp_angle(n.rotation.y, atan2(mv.x, mv.z), 1.0 - exp(-dt * 6.0))
			n.call("animate", dt, mv.length() / maxf(dt, 1e-4))
	# the agitation: upright near it, running about, lingering right under it
	if inside and not Battle.active and not wild.battle_on and swarm.is_empty():
		var crouched: bool = game.cast.crouching
		var sp := absf(float(game.speed))
		var gain := 0.0
		if d < float(hive.provoke) and not crouched: gain = 0.9 * (1.0 - d / float(hive.provoke) * 0.5)
		if sp > 5.5 and d < float(hive.warn): gain = maxf(gain, 1.6)
		if d < 2.8: gain = maxf(gain, 0.35 if crouched else 1.2)
		hive.k = clampf(float(hive.k) + (gain if gain > 0.0 else -0.25) * dt, 0.0, 1.0)
		if d < float(hive.warn) and not _told.has("hive"):
			_told.hive = true
			wild.toaster.push("warn", "A BEEDRILL HIVE", "Crouch (B) and keep your distance, or the Beedrill will swarm.", "sweat", 3.4)
		if d > float(hive.warn) + 12.0: _told.erase("hive")
		if float(hive.k) >= 1.0: provoke("came too close")
	# the buzz: rising as he nears (it swells when they are roused)
	var amt := 0.0
	if d < float(hive.warn) + 18.0: amt = clampf(1.0 - (d - 3.0) / (float(hive.warn) + 15.0), 0.0, 1.0)
	if not swarm.is_empty() and String(swarm.phase) != "home": amt = 1.0
	Sfx.bed("hive", "hive_buzz", amt * (0.55 + 0.45 * float(hive.k)), at, 0.8)
	Sfx.bed_pitch("hive", 1.0 + 0.25 * float(hive.k) + (0.25 if not swarm.is_empty() and String(swarm.phase) != "home" else 0.0))

# the hive roused: an ambush system's swarm if the arena has one, else the warning here
func provoke(why: String) -> void:
	if hive.is_empty() or float(hive.cool) > 0.0 or (not swarm.is_empty() and String(swarm.phase) != "home"): return
	_note("provoked: " + why)
	hive.k = 1.0
	provoked.emit(why, hive.at)
	var amb = arena.get("ambush")
	if amb == null: amb = arena.get_node_or_null("Ambush")
	if amb != null and is_instance_valid(amb) and amb.has_method("swarm"):
		hive.cool = 30.0
		amb.swarm({"species": "beedrill", "at": hive.at, "why": why, "region": String(def.id), "count": hive.bees.size(), "level": _lv(10, 14)})
		return
	swarm = {"phase": "buzz", "t": 0.0, "why": why}
	Sfx.bed("hive", "hive_buzz", 1.0, hive.at, 0.3)
	_snd("beedrill_swarm", "encounter", hive.at, {"vol": 0.0, "dist": 60.0})
	game.cam_shake = maxf(float(game.cam_shake), 0.35)
	wild.toaster.push("warn", "BEEDRILL ARE COMING!", "The hive is roused! Run, get well away from it!", "bang", 3.0)

func _swarm_step(dt: float, me: Vector3) -> void:
	if swarm.is_empty() or hive.is_empty(): return
	swarm.t = float(swarm.t) + dt
	var at: Vector3 = hive.at
	var bees: Array = hive.bees
	match String(swarm.phase):
		"buzz":
			# out of the hive, darting about it
			for b in bees:
				var n: Node3D = b.node
				n.visible = true
				var j := Vector3(sin(t * 9.0 + float(b.r) * 5.0), 0.6 * sin(t * 7.0 + float(b.ph)), cos(t * 8.0 + float(b.r) * 3.0)) * 0.6
				n.position = n.position.lerp(at + Vector3(cos(float(b.ph)) * 1.2, -0.6, sin(float(b.ph)) * 1.2) + j, 1.0 - exp(-dt * 6.0))
				n.set("look_at_pos", me + UP * 1.3)
				n.call("animate", dt, 3.0)
			if float(swarm.t) > 1.4: swarm.phase = "chase"; swarm.t = 0.0
		"chase":
			var caught = null
			for i in bees.size():
				var b: Dictionary = bees[i]
				var n: Node3D = b.node
				var off := Vector3(cos(float(b.ph) + t), 0.0, sin(float(b.ph) + t)) * 1.2
				var want := me + UP * 1.4 + off
				var v := (want - n.position)
				var sp := 7.0 + i * 0.6
				var mv := v.normalized() * minf(v.length(), sp * dt)
				n.position += mv
				b.pos = n.position
				n.rotation.y = lerp_angle(n.rotation.y, atan2(mv.x, mv.z), 1.0 - exp(-dt * 8.0))
				n.set("look_at_pos", me + UP * 1.3)
				n.call("animate", dt, sp)
				if caught == null and _h(n.position, me) < 1.5 and absf(n.position.y - me.y - 1.0) < 2.0: caught = b
				if fmod(t + i * 0.3, 0.9) < dt: _snd("beedrill_buzz", "wing_flap_small", n.position, {"vol": -6.0, "dist": 30.0})
			if _h(me, hive.base) > 27.0:
				wild.toaster.push("complete", "THE BEEDRILL GAVE UP", "You got away from the swarm.", "check", 2.6)
				_note("swarm lost him")
				swarm.phase = "home"; swarm.t = 0.0
				hive.cool = 20.0
			elif caught != null and not Battle.active and not wild.battle_on:
				_sting(caught)
			elif float(swarm.t) > 9.0:
				swarm.phase = "home"; swarm.t = 0.0; hive.cool = 15.0
		"battle":
			for b in bees: (b.node as Node3D).visible = false
			if not wild.battle_on and not Battle.active and float(swarm.t) > 0.5:
				_end_sw()
				swarm.phase = "home"; swarm.t = 0.0
				hive.cool = 25.0
				for b in bees: (b.node as Node3D).position = at; b.pos = at
		"home":
			hive.k = maxf(0.0, float(hive.k) - dt * 0.3)
			if float(swarm.t) > 3.0: swarm = {}

# one catches him: it attacks (a wild battle, its level from the hunt or the menu's setup)
func _sting(b: Dictionary) -> void:
	var n: Node3D = b.node
	var p := n.position
	p.y = game.world.height_at(p.x, p.z)
	_sw = _battle_with("beedrill", p, _lv(10, 14))
	n.visible = false
	swarm.phase = "battle"; swarm.t = 0.0
	wild.toaster.push("warn", "BEEDRILL ATTACKS!", "One of the swarm caught up with you!", "bang", 1.8)
	_note("swarm battle")

func _lv(lo: int, hi: int) -> int: return rng.randi_range(lo, hi)

# a wild encounter made for a battle now (the swarm's, the nest's parent)
func _battle_with(species: String, at: Vector3, lv: int) -> Dictionary:
	var e := wild.spawn(species, src, at, "aggressive")
	e.level = lv
	e.swarm = true
	e.battle = battle_opts(species, lv)
	wild._start_battle(e, "attacking", "wild")
	return e

func _end_sw() -> void:
	if not _sw.is_empty() and wild.encs.has(_sw): wild._remove(_sw)
	_sw = {}

# the battle's options for one of the forest's own: the hunt's party rules if one is on,
# else the staging menu's (WILD: alone or with his party)
func battle_opts(species: String, lv: int) -> Dictionary:
	var h = arena.hunt
	if h and h.on: return h.battle_opts({"species": species, "level": lv})
	var o := {"level": lv, "log": true}
	var s: Dictionary = arena.menu.setup if arena.menu else {}
	var party: Array = s.get("ash", [])
	if bool(s.get("wild", {}).get("with_party", false)) and not party.is_empty():
		var pa: Array = party.map(func(m): return ArenaSetups.mon(m))
		o.merge({"mode": "pkmn", "kind": "wild", "partner": pa[0], "party_a": pa, "party_b": [{"species": species, "level": lv}], "ai": "wild"}, true)
	else:
		o["mode"] = "prologue"
	return o

# ---------- the nest ----------
func _nest_step(dt: float, me: Vector3) -> void:
	if nest.is_empty(): return
	nest.cool = maxf(0.0, float(nest.cool) - dt)
	var par: Node3D = nest.parent
	var d := _h(me, nest.base)
	var vis := not Battle.active and d < 60.0
	for c in nest.chicks:
		(c as Node3D).visible = vis
		if vis: (c as Node3D).call("animate", dt, 0.0)
	match String(nest.state):
		"calm", "watch":
			par.visible = vis
			if vis: par.call("animate", dt, 0.0)
			var watching := inside and d < float(nest.warn) and not Battle.active and not wild.battle_on
			nest.state = "watch" if watching else "calm"
			if watching:
				par.set("look_at_pos", me + UP * 1.3)
				nest.cry = float(nest.cry) - dt
				nest.cheep = float(nest.cheep) - dt
				if float(nest.cry) <= 0.0:
					nest.cry = rng.randf_range(1.6, 2.8)
					Sfx.play("bird_call", par.position, {"vol": -4.0, "pitch": 0.85, "dist": 30.0})
					par.call("mood", "screech" if rng.randf() < 0.5 else "look")
				if float(nest.cheep) <= 0.0:
					nest.cheep = rng.randf_range(0.7, 1.6)
					Sfx.play("critter_chirp", nest.at, {"vol": -10.0, "pitch": 1.8, "dist": 20.0})
				if not _told.has("nest"):
					_told.nest = true
					wild.toaster.push("warn", "A GUARDED NEST", "%s is guarding its chicks. Keep back, or crouch and leave them be." % wild._name({"species": nest.species}), "sweat", 3.2)
				var crouched: bool = game.cast.crouching
				if float(nest.cool) <= 0.0 and ((d < float(nest.disturb) and not crouched) or d < 2.0):
					_nest_disturb("came too close")
			else:
				par.set("look_at_pos", Vector3(NAN, NAN, NAN))
				if d > float(nest.warn) + 10.0: _told.erase("nest")
		"dive":
			nest.t = float(nest.t) + dt
			var u := clampf(float(nest.t) / 1.05, 0.0, 1.0)
			var from: Vector3 = nest.rim
			var to := me + UP * 1.1 + (from - me).normalized() * 0.9
			var p := from.lerp(to, u * u * (3.0 - 2.0 * u)) + UP * sin(u * PI) * 1.4
			var mv := p - par.position
			par.position = p
			if mv.length() > 1e-4: par.rotation.y = atan2(mv.x, mv.z)
			par.call("animate", dt, mv.length() / maxf(dt, 1e-4))
			if fmod(float(nest.t), 0.25) < dt: Sfx.play("wing_flap_large" if Sfx.has("wing_flap_large") else "wing_flap_small", par.position, {"vol": -4.0})
			if u >= 1.0 and not wild.battle_on and not Battle.active:
				var g := par.position
				g.y = game.world.height_at(g.x, g.z)
				par.visible = false
				_sw = _battle_with(String(nest.species), g, _lv(10, 13))
				nest.state = "battle"; nest.t = 0.0
				_note("nest battle")
		"battle":
			par.visible = false
			nest.t = float(nest.t) + dt
			if not wild.battle_on and not Battle.active and float(nest.t) > 0.5:
				_end_sw()
				nest.state = "calm"
				nest.cool = 20.0
				par.position = nest.rim
				par.rotation.y = atan2((nest.dir as Vector3).x, (nest.dir as Vector3).z)
				par.visible = true
				par.call("mood", "land")
				wild.toaster.push("info", "BACK TO ITS NEST", "%s flew home to its chicks." % wild._name({"species": nest.species}), "chat", 2.2)

func _nest_disturb(why: String) -> void:
	if nest.is_empty() or String(nest.state) in ["dive", "battle"] or float(nest.cool) > 0.0: return
	if Battle.active or wild.battle_on: return
	_note("nest disturbed: " + why)
	nest.state = "dive"; nest.t = 0.0
	var par: Node3D = nest.parent
	par.call("mood", "takeoff")
	Sfx.play("bird_call", par.position, {"vol": 0.0, "pitch": 0.75})
	wild.toaster.push("warn", "%s ATTACKS!" % wild._name({"species": nest.species}).to_upper(), "It's defending its nest!", "bang", 1.8)

# ---------- the region: entering, the ambience ----------
func on_region(now_in: bool) -> void:
	inside = now_in
	if not now_in: return
	if auto_hunt and not _auto_done and arena.hunt and not arena.hunt.on:
		_auto_done = true
		var H: Dictionary = def.get("hunt", {})
		var s: Dictionary = arena.menu.setup if arena.menu else ArenaSetups.default_setup()
		var h := ArenaSetups.default_hunt()
		h.species = (H.get("species", h.species) as Array).duplicate()
		h.count = int(H.get("count", 8))
		h.lv = (H.get("lv", [3, 8]) as Array).duplicate()
		h.temper = String(H.get("temper", "species"))
		h.region = String(def.id)
		arena.hunt.start(h, (s.get("ash", []) as Array).duplicate(true), bool(s.get("wild", {}).get("with_party", true)))

func _ambience(_dt: float) -> void:
	var me: Vector3 = game.pos
	var sd := ArenaRegions.rect_sd(src.rect, me.x - ArenaData.C.x, me.z - ArenaData.C.y)
	var k := clampf(-sd / 8.0 + 0.6, 0.0, 1.0) if not game.indoors else 0.0
	var A: Dictionary = def.get("ambience", {})
	if Sfx.has(String(A.get("bed", "amb_forest"))): Sfx.bed("forest", String(A.get("bed", "amb_forest")), k * 0.9, null, 2.0)
	Sfx.bed("forest_birds", "amb_birds_day", k * float(A.get("birds", 0.7)), null, 2.5)

# ---------- the HUD: the prompt, the look, the hive's and the nest's warnings ----------
class Hud extends Control:
	var life
	var _t := 0.0

	func _ready() -> void:
		set_anchors_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(dt: float) -> void:
		_t += dt
		queue_redraw()

	func _draw() -> void:
		if life == null or Battle.active or life.game.trans_busy: return
		if life.arena.menu and life.arena.menu.is_open(): return
		var cam: Camera3D = life.game.cam
		if cam == null: return
		# the one he is looking at: a "!" over it
		if not life.look.is_empty() and is_instance_valid(life.look.e.node):
			var at: Vector3 = (life.look.e.node as Node3D).position + Vector3.UP * (float(life.look.e.get("hang_h", 0.5)) + 0.45)
			if not cam.is_position_behind(at):
				var p := cam.unproject_position(at)
				var s := 1.0 + 0.12 * absf(sin(_t * 5.0))
				var r := Rect2(p.x - 15.0 * s, p.y - 40.0 * s, 30.0 * s, 34.0 * s)
				UITheme.plate(self, r, 0.95, UITheme.SKEW, UITheme.YELLOW)
				UITheme.text_mid(self, r.get_center(), "!", "display", int(26 * s), UITheme.INK, 1)
		# the prompt: A, and what it does
		var pr: Dictionary = life.prompt
		if not pr.is_empty() and not cam.is_position_behind(pr.at):
			var p := cam.unproject_position(pr.at)
			var label := "SHAKE THE TREE" if String(pr.kind) == "shake" else "THROW A PEBBLE"
			var h := 42.0
			var gw := h * 0.66
			var tw := UITheme.text_w(label, "label", 20)
			var w := 16.0 + gw + 8.0 + tw + 18.0
			var r := Rect2(p.x - w * 0.5, p.y - h - 24.0, w, h)
			var pts := UITheme.plate(self, r, 1.0, UITheme.SKEW, UITheme.PLATE)
			UITheme.outline(self, pts, Color(1, 1, 1, 0.2), 1.0)
			UITheme.para(self, Rect2(r.position.x, r.end.y - 3.0, r.size.x, 3.0), UITheme.GREEN)
			UITheme.glyph(self, Vector2(r.position.x + 14.0 + gw * 0.5, r.get_center().y), "use", gw, 1.0)
			UITheme.text_mid(self, Vector2(r.position.x + 22.0 + gw, r.get_center().y), label, "label", 20, UITheme.TEXT)
		# the hive's agitation, near it; the swarm
		var S := UITheme.safe_rect(self)
		var hv: Dictionary = life.hive
		if not hv.is_empty():
			var d := Vector2(life.game.pos.x - hv.base.x, life.game.pos.z - hv.base.z).length()
			var roused: bool = not life.swarm.is_empty() and String(life.swarm.phase) != "home"
			if roused or (life.inside and d < float(hv.warn)):
				var k := float(hv.k)
				var label := "BEEDRILL ARE COMING!" if roused else "BEEDRILL HIVE"
				var tw := UITheme.text_w(label, "heading", 22)
				var w := 30.0 + tw + 20.0 + 140.0 + 18.0
				var r := Rect2(S.position.x + (S.size.x - w) * 0.5, S.end.y - 112.0, w, 38.0)
				var pulse := 0.5 + 0.5 * sin(_t * (14.0 if roused else 4.0 + k * 8.0))
				UITheme.plate(self, r, 1.0)
				UITheme.accent_bar(self, r, UITheme.RED.lerp(UITheme.YELLOW, pulse * (1.0 - k)), 1.0, UITheme.SKEW, 5.0)
				UITheme.text_mid(self, Vector2(r.position.x + 24.0, r.get_center().y), label, "heading", 22, UITheme.TEXT)
				var br := Rect2(r.position.x + 30.0 + tw + 20.0, r.get_center().y - 5.0, 140.0, 10.0)
				UITheme.bar(self, br, 1.0 if roused else k, UITheme.RED if k > 0.6 or roused else UITheme.YELLOW, 1.0, 5)
