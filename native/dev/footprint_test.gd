extends Node
# Dev only: footprints.gd, headless.
#   godot --headless --path native res://dev/footprint_test.tscn
# Checks prints are laid on soft ground only (the square's dirt, the beach, mud
# by the pond, none on the grass, the pier, the stone stairs, indoors), the
# print kind of a sample of species and that all 151 have one, the pool's cap,
# the fade (and mud's longer life), trail_near by owner, the stride counter
# (alternating feet, none in the air, none across a jump in place), the hooks
# in CastActor and Creature, and the setting.

class FakeCast extends Node:
	var tall: Array = []
	var crouching := false

class FakeGame extends Node3D:
	var world: WorldData
	var outdoor_world: WorldData
	var indoors := false
	var interior: Node = null
	var cast := FakeCast.new()
	var sfx_world: Node
	var pos := Vector3.ZERO

var fails := 0
var checks := 0

func _check(ok: bool, what: String) -> void:
	checks += 1
	if not ok:
		fails += 1
		print("FAIL ", what)

func _ready() -> void:
	var g := FakeGame.new()
	var W := WorldData.new()
	W.load_all()
	g.world = W; g.outdoor_world = W
	var cd: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://cast/cast.json"))
	g.cast.tall = cd.tallGrass
	add_child(g)
	var sw = preload("res://sfx_world.gd").new()
	add_child(sw)
	sw.setup(g)
	g.sfx_world = sw
	var fp: Footprints = preload("res://footprints.gd").new()
	add_child(fp)
	fp.setup(g)
	fp.on = true
	_check(Footprints.I == fp, "Footprints.I is up")
	var at := func(x: float, z: float) -> Vector3: return Vector3(x, W.height_at(x, z), z)

	# ---- soft ground only ----
	_check(fp.ground_at(at.call(0, 0)) == "dirt", "the town square: dirt (got '%s')" % fp.ground_at(at.call(0, 0)))
	# over the town and Route 1 (every 2 m): a print where the ground is soft, none elsewhere;
	# the first few spots of each surface sfx_world.gd hears
	var seen := {}
	var mud := Vector3.INF
	var wrong := []
	for j in range(-110, 100, 2):
		for i in range(-100, 100, 2):
			var q: Vector3 = at.call(float(i), float(j))
			var s: String = sw.surface_at(q)
			var gr := fp.ground_at(q)
			if gr == "mud" and mud == Vector3.INF: mud = q
			var key := gr if gr == "mud" else s
			if int(seen.get(key, 0)) >= 6: continue
			seen[key] = int(seen.get(key, 0)) + 1
			var soft := s in ["sand", "dirt"]
			var n0 := fp.used
			var laid := Footprints.step(q, 0.0, "sneaker", 1, 0.27, "t")
			if laid != soft or (gr != "") != soft or fp.used != n0 + (1 if soft else 0): wrong.append("%s at %s (%s)" % [s, str(q), gr])
	_check(wrong.is_empty(), "prints on sand, dirt and mud only (%s)" % str(wrong))
	for s in ["sand", "dirt", "grass", "water", "mud"]: _check(seen.has(s), "some %s found to try (%s)" % [s, str(seen)])
	_check(mud != Vector3.INF, "some mud by the fresh water")
	g.indoors = true
	_check(fp.ground_at(at.call(0, 0)) == "" and not Footprints.step(at.call(0, 0), 0.0, "paw", 1, 0.1), "indoors: none")
	g.indoors = false
	_check(not Footprints.step(at.call(0, 0), 0.0, "nope", 1, 0.1), "an unknown kind: none")
	print("ground: mud at %s, tried %s" % [str(mud), str(seen)])
	# from here on all of it soft (the paths are narrow), the mud where it was found
	fp.surface_fn = func(p: Vector3) -> String: return "mud" if p.distance_to(mud) < 0.5 else "dirt"

	# ---- the kind per species ----
	var sample := {"pikachu": "paw", "rattata": "paw", "growlithe": "paw", "pidgey": "bird", "doduo": "bird", "spearow": "bird",
		"ponyta": "hoof", "tauros": "hoof", "charizard": "claw", "rhyhorn": "claw", "snorlax": "claw", "psyduck": "webbed",
		"ekans": "slither", "onix": "slither", "dratini": "slither", "caterpie": "slither", "grimer": "slime", "muk": "slime",
		"gastly": "none", "koffing": "none", "magnemite": "none", "nidoran_f": "paw", "mr_mime": "foot", "machop": "foot"}
	for sp in sample:
		var k: Dictionary = Footprints.kind_of(sp)
		_check(String(k.get("kind")) == sample[sp], "%s leaves %s (got %s)" % [sp, sample[sp], k.get("kind")])
	var k151: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://life/kanto151.json")).species
	var bad := []
	for sp in k151:
		var k: Dictionary = Footprints.kind_of(sp)
		var kind := String(k.get("kind", ""))
		if kind == "none": continue
		if not kind in Footprints.KINDS or float(k.get("foot", 0)) <= 0.0 or float(k.get("step", 0)) <= 0.0: bad.append(sp)
	_check(bad.is_empty() and Footprints.data().species.size() == 151, "all 151 have a print (%d, bad %s)" % [Footprints.data().species.size(), bad])
	_check(float(Footprints.kind_of("snorlax").foot) > float(Footprints.kind_of("pikachu").foot) * 4.0, "prints scale with the body (Snorlax's over Pikachu's)")
	_check(Footprints.emitter_for("gastly") == null and Footprints.emitter_for("pikachu") != null, "no stride counter for a levitating one")
	_check(String(Footprints.shoe("ash")[0]) == "sneaker" and String(Footprints.shoe("oak")[0]) == "boot" and float(Footprints.shoe("kid")[1]) < float(Footprints.shoe("ash")[1]), "people's shoes")

	# ---- the pool's cap ----
	fp.clear()
	var sq: Vector3 = at.call(0, 0)
	for i in fp.POOL + 150:
		Footprints.step(sq + Vector3(fmod(i * 0.37, 6.0) - 3.0, 0, fmod(i * 0.23, 4.0) - 2.0), 0.0, "paw", 1, 0.1, "flood")
	_check(fp.used == fp.POOL and fp.mm.visible_instance_count == fp.POOL and fp.mm.instance_count == fp.POOL, "the pool stays %d (used %d)" % [fp.POOL, fp.used])
	_check(fp.live() == fp.POOL, "all slots live after a flood (%d)" % fp.live())

	# ---- fading ----
	fp.clear()
	Footprints.step(sq, 0.0, "sneaker", 1, 0.27, "fade")
	Footprints.step(mud, 0.0, "sneaker", 1, 0.27, "fade_mud")
	_check(is_equal_approx(fp.fade_of(0), 1.0), "new: full (%.2f)" % fp.fade_of(0))
	fp.advance(fp.LIFE * 0.2)
	_check(fp.fade_of(0) > 0.99, "a fifth of its life: still full (%.2f)" % fp.fade_of(0))
	fp.advance(fp.LIFE * 0.45)
	var mid := fp.fade_of(0)
	_check(mid > 0.1 and mid < 0.9, "two thirds: fading (%.2f)" % mid)
	fp.advance(fp.LIFE * 0.4)
	_check(fp.fade_of(0) == 0.0 and fp.fade_of(1) > 0.9, "past its life: gone on dirt (%.2f), still there in mud (%.2f)" % [fp.fade_of(0), fp.fade_of(1)])
	_check(Footprints.trail_near(sq, 2.0).is_empty(), "a gone one is not in trail_near")
	fp.advance(fp.LIFE * fp.MUD_LIFE)
	_check(fp.live() == 0, "the mud's gone too in the end")
	var cd2: Color = fp.mm.get_instance_custom_data(0)
	_check(cd2.b == 0.0, "an expired slot is switched off for the shader")

	# ---- trail_near ----
	fp.clear()
	for i in 6:
		Footprints.step(sq + Vector3(i * 0.5, 0, 0), PI * 0.5, "paw", 1 if i % 2 == 0 else -1, 0.1, "wild:pikachu", true)
		fp.advance(0.5)
	for i in 3:
		Footprints.step(sq + Vector3(0, 0, i * 0.6), 0.0, "sneaker", 1, 0.27, "ash")
		fp.advance(0.5)
	Footprints.step(sq + Vector3(30, 0, 0), 0.0, "sneaker", 1, 0.27, "far")
	var tr := Footprints.trail_near(sq, 4.0)
	_check(tr.has("wild:pikachu") and tr.has("ash") and not tr.has("far"), "trail_near: by owner, within r (%s)" % str(tr.keys()))
	if tr.has("wild:pikachu"):
		var a: Array = tr["wild:pikachu"]
		_check(a.size() == 6 and a[0].age < a[5].age and a[0].fresh and String(a[0].kind) == "paw", "trail_near: newest first, fresh, its kind")
		_check(a[0].pos.x > a[5].pos.x, "following the newest leads where it went")
	_check(Footprints.trail_near(sq + Vector3(2.5, 0, 0), 0.3).keys() == ["wild:pikachu"], "a small r: only the nearest")

	# ---- the stride counter ----
	fp.clear()
	var e := Footprints.emitter("paw", 0.1, 0.5, 0.05, "e")
	for i in 201: e.move(sq + Vector3(0, 0, i * 0.05), 0.0)
	var es: Array = Footprints.trail_near(sq, 20.0).get("e", [])
	_check(es.size() >= 19 and es.size() <= 21, "10 m at a 0.5 m stride: about 20 prints (%d)" % es.size())
	if es.size() > 2:
		_check(signf(es[0].pos.x - sq.x) != signf(es[1].pos.x - sq.x), "the feet alternate")
	fp.clear()
	for i in 100: e.move(sq + Vector3(0, 0, i * 0.05), 0.0, true)
	_check(fp.used == 0, "none in the air")
	e.move(sq, 0.0); e.move(sq + Vector3(10, 0, 0), 0.0)
	_check(fp.used == 0, "none across a jump in place")
	var tl := Footprints.emitter("slither", 0.16, 0.58, 0.0, "snake")
	for i in 60: tl.move(sq + Vector3(i * 0.05, 0, 0), PI * 0.5)
	_check(fp.used == 5, "a slither trail: one segment a stride (%d)" % fp.used)

	# ---- the hooks ----
	fp.clear()
	var c := Creature.make("pikachu")
	add_child(c)
	for i in 120:
		c.position = sq + Vector3(0, 0, i * 0.02)
		c.rotation.y = 0.0
		c.animate(1.0 / 60.0, 1.2)
	var cr := Footprints.trail_near(sq, 10.0)
	var ck := "pkmn:%d" % c.get_instance_id()
	_check(cr.has(ck) and cr[ck].size() >= 12 and not cr[ck][0].fresh, "Creature: Pikachu walking 2.4 m on dirt leaves paw prints (%d)" % (cr[ck].size() if cr.has(ck) else 0))
	c.track_tag = "wild:pikachu:1"
	for i in 60:
		c.position = sq + Vector3(0, 0, 2.4 + i * 0.02)
		c.animate(1.0 / 60.0, 1.2)
	var cw: Array = Footprints.trail_near(sq, 10.0).get("wild:pikachu:1", [])
	_check(cw.size() >= 5 and cw[0].fresh, "a wild one's (track_tag): fresh (%d)" % cw.size())
	c.queue_free()
	var gas := Creature.make("gastly") if ResourceLoader.exists("res://creatures/gastly.glb") else null
	if gas:
		add_child(gas)
		fp.clear()
		for i in 120:
			gas.position = sq + Vector3(0, 0, i * 0.02); gas.animate(1.0 / 60.0, 1.2)
		_check(fp.used == 0, "Gastly leaves none")
		gas.queue_free()
	fp.clear()
	var a := CastActor.make("ash")
	add_child(a)
	a.ground = func(_x: float, _z: float) -> float: return sq.y
	var steps0 := a.steps
	for i in 180:
		a.position = sq + Vector3(0, 0, -3.0 + i * 4.5 / 60.0)
		a.animate(1.0 / 60.0, 4.5, false)
	var ap: Array = Footprints.trail_near(sq, 20.0).get("person:%d" % a.get_instance_id(), [])
	var nst := a.steps - steps0
	_check(nst > 6 and ap.size() >= nst - 2, "CastActor: a print a step (%d steps, %d prints)" % [nst, ap.size()])
	if ap.size() > 4:
		var dz := absf(ap[0].pos.z - ap[2].pos.z)
		_check(dz > 1.0 and dz < 2.4, "a stride between two prints of a foot (%.2f m)" % dz)
		_check(String(ap[0].kind) == "sneaker", "Ash's sneakers")
	# a slow walk at 15 fps: still a print for each foot, left and right of his line
	fp.clear()
	var z0 := 0.0
	for i in 150:
		z0 += 2.5 / 15.0
		a.position = sq + Vector3(0, 0, -6.0 + z0)
		a.animate(1.0 / 15.0, 2.5, false)
	var sl: Array = Footprints.trail_near(sq, 30.0).get("person:%d" % a.get_instance_id(), [])
	var lefts := sl.filter(func(p): return p.pos.x > sq.x).size()
	var rights := sl.size() - lefts
	var gaps := []
	for k in range(1, mini(8, sl.size())): gaps.append(snappedf(absf(sl[k - 1].pos.z - sl[k].pos.z), 0.01))
	_check(sl.size() > 10 and absi(lefts - rights) <= 2, "slow walk: both feet (%d left, %d right, gaps %s)" % [lefts, rights, str(gaps)])
	# ---- the setting ----
	fp._on_setting("footprints", 0)
	_check(not Footprints.step(sq, 0.0, "paw", 1, 0.1) and fp.used == 0, "off: none, and the old ones gone")
	fp._on_setting("footprints", 1)
	_check(Footprints.step(sq, 0.0, "paw", 1, 0.1), "on again")
	a.queue_free()
	print("footprint test: %d checks, %d failed" % [checks, fails])
	get_tree().quit(1 if fails > 0 else 0)
