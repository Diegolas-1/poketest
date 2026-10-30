extends Node
# Ambushes in the Battle Arena (the staging menu's AMBUSH page, arena/arena_menu.gd):
# a few thickets by the paths (ambush cover: bushes clumped together, the arena's own
# bush meshes, recorded as hides of kind "thicket"), and a staged ambush to try the
# whole of it by hand (wild/ambush.gd): the species and how many (a swarm of up to 4),
# their level, the cover, and Ash alone or with one or two of his party (TRAINER's)
# already out walking with him (wild/ash_companions.gd). START AMBUSH puts him on the
# path a way short of the cover with the ambusher(s) set in it; he walks on (or
# crouches and creeps) and it plays out. RANDOM AMBUSHES lets them happen here as on
# Route 1 (Ambush.on_arena).
#
#   amb.start(cfg, party)   amb.cfg(setup) -> setup.ambush (made with the defaults)

const THICKETS := [[2.9, 31.0], [-12.6, 26.6], [12.8, 20.6]]   # (local x, z: by the paths)
const START_BACK := 13.0     # Ash starts this far short of the cover, on its path
const COVERS := ["thicket", "bush", "tall_grass"]
const COMPS := ["0", "1", "2"]

var arena
var game: Node3D
var spots: Array = []        # the thickets: {at, kind, r}
var cfg_last := {}

func setup_(a) -> void:
	arena = a
	game = a.game
	_thickets()

static func defaults() -> Dictionary:
	return {"species": "beedrill", "n": 1, "level": 9, "cover": "thicket", "comps": "1", "random": false}

func cfg(setup: Dictionary) -> Dictionary:
	if not setup.has("ambush") or not setup.ambush is Dictionary: setup["ambush"] = defaults()
	for k in defaults(): if not setup.ambush.has(k): setup.ambush[k] = defaults()[k]
	return setup.ambush

func amb() -> Ambush: return game.cast.wild.ambush

# ---------- the thickets ----------
func _thickets() -> void:
	var sets: Dictionary = arena._veg_sets()
	var bushes: Array = sets.bush.filter(func(s): return s.h > 0.9 and s.h < 2.8 and s.w > 1.2 and s.w < 3.8)
	if bushes.is_empty(): bushes = sets.bush
	var rng := RandomNumberGenerator.new()
	rng.seed = 251
	var place := {}
	for t in THICKETS:
		var c: Vector3 = arena.w(float(t[0]), float(t[1]))
		# three or four bushes in a clump, the biggest in the middle
		var n := 3 + rng.randi() % 2
		var rr := 0.0
		for k in n:
			if bushes.is_empty(): break
			var s: Dictionary = bushes[rng.randi() % bushes.size()]
			var a := TAU * k / n + rng.randf_range(-0.4, 0.4)
			var d := 0.0 if k == 0 else rng.randf_range(0.9, 1.4)
			var sc := rng.randf_range(1.05, 1.3) if k == 0 else rng.randf_range(0.75, 1.0)
			var p := c + Vector3(cos(a), 0, sin(a)) * d
			p.y = arena.data.height_at(p.x, p.z) - 0.05
			var key := String(s.name)
			if not place.has(key): place[key] = {"set": s, "xf": []}
			place[key].xf.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU) * Basis.from_scale(s.scale * sc), p))
			rr = maxf(rr, d + float(s.w) * sc * 0.5)
		var lc := Vector2(float(t[0]), float(t[1]))
		arena.data.add_circle(lc.x, lc.y, maxf(0.8, rr * 0.65))
		var h := {"at": Vector3(c.x, 0, c.z), "kind": "thicket", "r": rr}
		arena.hides.append(h)
		spots.append(h)
	arena.data.set("_bk", {})   # (the colliders' buckets again, with the thickets in)
	for key in place:
		var s: Dictionary = place[key].set
		var xs: Array = place[key].xf
		var cc := Vector3.ZERO
		for xf in xs: cc += xf.origin
		cc /= xs.size()
		for part in s.parts:
			var mat: ShaderMaterial = (part.mat as ShaderMaterial).duplicate()
			mat.set_shader_parameter("fade", Vector2(150.0, 160.0))
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = part.mesh
			mm.instance_count = xs.size()
			for j in xs.size(): mm.set_instance_transform(j, Transform3D(xs[j].basis, xs[j].origin - cc))
			var mi := MultiMeshInstance3D.new()
			mi.name = "Thicket"
			mi.multimesh = mm
			mi.material_override = mat
			mi.position = cc
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			arena.add_child(mi)

# ---------- a staged one ----------
func start(c: Dictionary, party: Array) -> void:
	cfg_last = c.duplicate(true)
	var A := amb()
	A.clear()
	A.on_arena = bool(c.get("random", false))
	var cover := _cover(String(c.get("cover", "thicket")))
	var at: Vector3 = cover.at
	# Ash on the way to it: START_BACK short of it, from the side the paths come from (south)
	var from := at + Vector3(0.0, 0, START_BACK)
	if String(cover.kind) == "tall_grass": from = at + Vector3(-START_BACK * 0.7, 0, START_BACK * 0.7)
	from = arena.data.collide(Vector3(from.x, 0, from.z), 0.4)
	from.y = arena.data.height_at(from.x, from.z)
	var yaw := atan2(at.x - from.x, at.z - from.z)
	# (past the cover: he walks by it, a little to one side)
	var n := clampi(int(c.get("n", 1)), 1, 4)
	var comps := clampi(int(String(c.get("comps", "1"))), 0, 2)
	var mid := func():
		game.pos = from
		game.yaw = yaw
		game.speed = 0.0
		game.cam_yaw = yaw + PI
		game.cam_ty = from.y
		game.cam_target = from + Vector3(0, 1.45, 0)
		game.cast.land(from.y)
		var cm: AshCompanions = game.cast.companions
		for k in range(cm.out.size() - 1, -1, -1): cm.recall(k, true)
		for i in mini(comps, party.size()): cm.send_out(i, true, from - Vector3(sin(yaw), 0, cos(yaw)) * (1.4 + i * 0.6) + Vector3(cos(yaw), 0, -sin(yaw)) * (0.8 if i == 0 else -0.8))
		A.cooldown = 0.0
		A.force = {"species": String(c.get("species", "beedrill")), "n": n, "cover": cover, "level": int(c.get("level", 9)), "temper": "aggressive"}
	game._fade(mid, false)
	await get_tree().process_frame
	while game.trans_busy: await get_tree().process_frame
	var nm := ArenaSetups.species_name(String(c.get("species", "beedrill")))
	A.wild.toaster.push("start", "AMBUSH!" if n == 1 else "A SWARM!", "%s lying in wait in the %s ahead. Walk on by... or crouch (B) and creep up to spot %s first." % [("A " + nm) if n == 1 else "%d %s" % [n, nm], Ambush._kind_text(String(cover.kind)), "it" if n == 1 else "them"], "bang", 4.0)
	print("arena ambush: %d %s in a %s, Ash %s" % [n, c.get("species"), cover.kind, "alone" if comps == 0 else "with %d out" % comps])

# the cover for a staged one: the thicket by the gate's path, the nearest bush to it, or tall grass
func _cover(kind: String) -> Dictionary:
	if kind == "tall_grass":
		var src: WildArenaGrass = game.cast.wild.arena_src
		var t: Array = ArenaData.TALL[4]
		var p = src.random_spot(RandomNumberGenerator.new(), 4)
		if p == null: p = arena.w(float(t[0]), float(t[1]))
		return {"at": Vector3(p.x, 0, p.z), "kind": "tall_grass", "r": 0.0}
	if kind == "bush":
		var best := {}
		var bd := INF
		var ref: Vector3 = spots[0].at if not spots.is_empty() else arena.w(0, 30)
		for h in arena.hides:
			if String(h.kind) != "bush": continue
			var d := Vector2(h.at.x - ref.x, h.at.z - ref.z).length()
			if d < bd: bd = d; best = h
		if not best.is_empty(): return {"at": Vector3(best.at.x, 0, best.at.z), "kind": "bush", "r": float(best.r)}
	return spots[0] if not spots.is_empty() else {"at": arena.w(2.9, 31.0), "kind": "thicket", "r": 1.6}

# ---------- the page (arena_menu.gd draws it through its own widgets) ----------
func page(m, body: Rect2) -> void:
	var c := cfg(m.setup)
	var left := Rect2(body.position, Vector2(body.size.x * 0.56, body.size.y))
	m._grid_draw(left, String(c.species), func(id: String): c.species = id; Sfx.ui("ui_cursor"))
	var R := Rect2(left.end.x + 36.0, body.position.y, body.end.x - left.end.x - 36.0, body.size.y)
	var k: float = m.k
	var y := R.position.y
	var sd := BattleEnergy.species_data(String(c.species))
	m._label(Vector2(R.position.x, y + 14.0), "LYING IN WAIT")
	UITheme.text(m, Vector2(R.position.x, y + 54.0), String(sd.get("name", c.species)).to_upper(), "display", 40, Color(UITheme.INK, k))
	var data := amb().sp(String(c.species))
	var note := "An opportunist: it ambushes by its own data." if not data.is_empty() else "Not an ambusher by nature: it borrows the defaults."
	UITheme.text(m, Vector2(R.position.x, y + 78.0), note.to_upper(), "label", 13, Color(UITheme.INK_SOFT, k), 0, R.size.x)
	y += 92.0
	var lw := 112.0
	var cx := R.position.x + lw
	var cw := R.size.x - lw
	var rh := 46.0
	m._label(Vector2(R.position.x, y + 29.0), "HOW MANY")
	m._mini("amb_n", Rect2(cx, y, 170.0, rh), int(c.n), func(v: int): c.n = v, 1, 4)
	UITheme.text_mid(m, Vector2(cx + 186.0, y + rh * 0.5), "SWARM OF %d" % int(c.n) if int(c.n) > 1 else "ON ITS OWN", "label", 15, Color(UITheme.INK_SOFT, k))
	y += rh + 12.0
	m._label(Vector2(R.position.x, y + 29.0), "LEVEL")
	m._mini("amb_lv", Rect2(cx, y, 170.0, rh), int(c.level), func(v: int): c.level = v, 2, 100, "Lv")
	y += rh + 12.0
	m._label(Vector2(R.position.x, y + 29.0), "COVER")
	m._seg("amb_cover", Rect2(cx, y, cw, rh), COVERS, ["THICKET", "BUSH", "TALL GRASS"], String(c.cover), func(v): c.cover = v, UITheme.GREEN)
	y += rh + 12.0
	m._label(Vector2(R.position.x, y + 29.0), "ASH")
	m._seg("amb_comps", Rect2(cx, y, cw, rh), COMPS, ["ALONE", "1 OUT", "2 OUT"], String(c.comps), func(v): c.comps = v, UITheme.SKY)
	y += rh + 12.0
	m._label(Vector2(R.position.x, y + 29.0), "RANDOM")
	m._seg("amb_rnd", Rect2(cx, y, cw, rh), ["off", "on"], ["STAGED ONLY", "AMBUSHES ON"], "on" if bool(c.random) else "off", func(v): c.random = v == "on"; amb().on_arena = c.random, UITheme.ORANGE)
	y += rh + 14.0
	var pn: int = m.setup.ash.size()
	var who := "alone: the prologue's rules if he has no party" if String(c.comps) == "0" else "with %s out (TRAINER's party)" % " and ".join(m.setup.ash.slice(0, int(String(c.comps))).map(func(x): return ArenaSetups.species_name(String(x.species))))
	if pn == 0 and String(c.comps) != "0": who = "but his party is empty: add some on TRAINER"
	UITheme.text(m, Vector2(R.position.x, y + 14.0), "Ash walks up the path %s." % who, "body", 17, Color(UITheme.INK_SOFT, k), 0, R.size.x)
