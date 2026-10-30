class_name WildArenaTrees
extends WildSource
# A grove's trees as an encounter source (the Battle Arena's forest region:
# arena/regions/forest_life.gd makes one and adds it to wild.gd's sources). Each
# search tree has a few slots on its limbs:
#   hang     a cocoon on its thread under the crown (Kakuna, Metapod: species that
#            keep still, creatures/species.json mode "still")
#   perch    a bird up on a limb's tip (the ones that fly: Pidgey, Spearow)
#   crawl    along a low limb (the rest: Caterpie)
# A hunt asks it for a spot (random_spot: a free slot of the species' kind, away
# from Ash) and hands back the one that settled there (settle: it is aloft, wild.gd
# shows it and keeps the pounce off it). Region "forest" only while Ash is in the
# arena and a hunt is on. Its life takes A first (a shake by a trunk, a pebble up
# into a crown: use_pressed) and the startles of the ones up there (startled).
#   tree: {at (world, the trunk's foot), cr (crown radius), cy0 (the crown's
#          underside), h, trunk, slots: [{kind, at (world), from, to (the limb), len, e}]}

var on := false
var region_id := "forest"
var rect := Rect2()            # the region's (local)
var trees: Array = []
var life                       # the region's life (forest_life.gd)
var wild: Wild                 # (a slot's one still out there: wild.encs has it)
var _pending: Array = []       # slots handed out, not yet settled

func _init() -> void:
	id = "tree"
	tells = "tree"

func active() -> bool: return on and BattleArena.I != null

func region(p: Vector3) -> String:
	return region_id if active() and rect.has_point(WildArenaGrass.local(p)) else ""

static func role_of(species: String) -> String:
	var ci := Creature.species_info(String(WildBrain.MODEL_ID.get(species, species)))
	if String(ci.get("mode", "")) == "still": return "hang"
	return "perch" if WildBrain.flies(species) else "crawl"

static func _h(a: Vector3, b: Vector3) -> float: return Vector2(a.x - b.x, a.z - b.z).length()

func distance(p: Vector3) -> float:
	var best := INF
	for t in trees: best = minf(best, maxf(0.0, _h(p, t.at) - float(t.cr)))
	return best

func patch_of(p: Vector3) -> int:
	var bi := -1
	var bd := INF
	for i in trees.size():
		var d := _h(p, trees[i].at)
		if d < float(trees[i].cr) and d < bd: bd = d; bi = i
	return bi

# the trees with a free slot of this kind: one at random, away from Ash and the rest
func random_spot(r: RandomNumberGenerator, taken: Array, ash: Vector3, away: float, species := "") -> Variant:
	var kind: String = role_of(species) if species != "" else ["hang", "perch", "crawl"][r.randi() % 3]
	var free := []
	for t in trees:
		for s in t.slots:
			if String(s.kind) != kind or held(s) or _pending.has(s): continue
			if _h(s.at, ash) < away: continue
			if taken.any(func(q): return _h(q, s.at) < 2.0): continue
			free.append(s)
	if free.is_empty(): return null
	var s: Dictionary = free[r.randi() % free.size()]
	_pending.append(s)
	return s.at

# a slot taken (by one still out there; a hunt's end leaves the old ones behind)
func held(s: Dictionary) -> bool:
	var e = s.e
	if e == null: return false
	if wild == null or wild.encs.has(e): return true
	s.e = null
	return false

# the one wild.gd just made at that spot: up on its slot
func settle(e: Dictionary, p: Vector3) -> void:
	var best = null
	var bd := INF
	for s in _pending:
		var d: float = (s.at as Vector3).distance_to(p)
		if d < bd: bd = d; best = s
	if best == null:
		for t in trees:
			for s in t.slots:
				if not held(s) and (s.at as Vector3).distance_to(p) < bd: bd = (s.at as Vector3).distance_to(p); best = s
	if best == null: return
	_pending.erase(best)
	best.e = e
	e.slot = best
	e.tree = int(best.tree)
	e.patch = int(best.tree)
	e.aloft = true
	e.kind = "tree"
	e.role = String(best.kind)
	if life and life.has_method("on_settled"): life.on_settled(e)

# the slot it held is free again (it dropped, flew, or is gone)
func release(e: Dictionary) -> void:
	var s = e.get("slot")
	if s is Dictionary and s.get("e") == e: s.e = null
	e.erase("slot")
	e.aloft = false

func safe_spots(from: Vector3, r: float) -> Array:
	var out := []
	if not active(): return out
	var me := patch_of(from)
	for i in trees.size():
		if i == me: continue
		var t: Dictionary = trees[i]
		if _h(t.at, from) <= r: out.append({"at": Vector3(t.at.x, 0.0, t.at.z), "kind": "tree", "r": float(t.cy0) + 1.0})
	return out

func use_pressed(_wild) -> bool:
	return life != null and BattleArena.I != null and life.use_pressed()

func startled(e: Dictionary, d: float) -> bool:
	return life != null and life.startled(e, d)
