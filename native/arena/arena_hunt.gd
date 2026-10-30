extends Node
# A hunt in the Battle Arena (the staging menu's HUNT page, arena/arena_menu.gd):
# the species picked there hide at random through the arena's tall grass, and Ash
# walks out and hunts them with the real tracking (wild/wild.gd: crouch on B, the
# grass's twitches, alertness and the startle, the A-mash pounce, a fled one
# tracked by the compass, then the battle). The field:
#   populate()      N spread over the patches (the roomiest patch first, no two
#                   within MIN_GAP, none by Ash), the species dealt out evenly,
#                   each with a level from the range and a temperament (random, the
#                   species' own odds, or one for all); wild.gd's lure spawning is
#                   off while a hunt is on (wild.hunt)
#   battle_opts(e)  the battle's level, and Ash alone (the prologue's rules) or with
#                   his party (mode "pkmn", as arena_stage.gd's wild battle)
#   on_result       a toast per outcome; beaten by his party, it is out of the field
#   on_removed      one less in the grass (with refill on, another settles in a while)
# The counter under the STAGE A BATTLE button: "3 LEFT IN THE GRASS".
#
#   hunt.start(setup.hunt, ash_party, with_party)   hunt.stop()   hunt.on

const MIN_GAP := 3.2           # no two closer (m)
const CLEAR_ASH := 9.0         # none this near Ash as it starts (m)
const REFILL_S := 25.0         # (refill on) one more settles this long after one goes
const REFILL_AWAY := 15.0      # and that far from him

var arena
var game: Node3D
var wild: Wild
var on := false
var cfg := {}                  # setup.hunt, plus with_party and party
var n_out := 0                 # beaten or gone this hunt
var _refill: Array = []        # seconds left for each one waiting to settle
var _rng := RandomNumberGenerator.new()
var hud: Control

func setup_(a) -> void:
	arena = a
	game = a.game
	wild = game.cast.wild
	_rng.randomize()
	hud = Counter.new()
	hud.hunt = self
	a.layer.add_child(hud)

func src() -> WildArenaGrass: return wild.arena_src

# ---------- on / off ----------
func start(h: Dictionary, party: Array, with_party: bool) -> void:
	cfg = h.duplicate(true)
	cfg["party"] = party.duplicate(true)
	cfg["with_party"] = with_party and not party.is_empty()
	on = true
	wild.hunt = self
	src().on = true
	populate()
	var n := left()
	wild.toaster.push("start", "THE HUNT IS ON!", "%d Pokémon are hiding in the tall grass. Crouch (B) and creep up on the twitching grass." % n, "ball", 3.6)
	print("hunt: on, %d in the grass (%s, Lv%d-%d, %s, %s)" % [n, ", ".join(cfg.species), int(cfg.lv[0]), int(cfg.lv[1]), String(cfg.temper), "with his party" if cfg.with_party else "alone"])

func stop(say := true) -> void:
	if not on: return
	on = false
	wild.hunt = null
	src().on = false
	_clear()
	_refill = []
	if say: wild.toaster.push("info", "HUNT OVER", "The grass is quiet again.", "check", 2.2)
	print("hunt: off")

func _clear() -> void:
	# (the hunt's own: no one-less counted for these)
	var h = wild.hunt
	wild.hunt = null
	for e in wild.encs.duplicate():
		if bool(e.get("hunt", false)): wild._remove(e)
	wild.hunt = h

# how many are still out there (not beaten, not leaving)
func left() -> int:
	var n := 0
	for e in wild.encs:
		if bool(e.get("hunt", false)) and not String(e.state) in ["out", "leaving"] and not bool(e.get("gone", false)): n += 1
	return n

func total() -> int: return int(cfg.get("count", 0))

# ---------- the field ----------
func populate() -> void:
	_clear()
	n_out = 0
	_refill = []
	var sp: Array = cfg.get("species", [])
	if sp.is_empty(): return
	var n := int(cfg.get("count", 6))
	# the species dealt out evenly: each round all of them, in a shuffled order
	var order := []
	while order.size() < n:
		var r := sp.duplicate()
		for i in range(r.size() - 1, 0, -1):
			var j := _rng.randi_range(0, i)
			var x = r[i]; r[i] = r[j]; r[j] = x
		order.append_array(r)
	var taken: Array = []
	for i in n:
		var p = _spot(taken, game.pos, CLEAR_ASH)
		if p == null: break
		taken.append(p)
		_settle(String(order[i]), p)

# a spot: the patch with the most room left (its area over how many it has),
# then anywhere hidden in it, MIN_GAP from the rest and away from Ash
func _spot(taken: Array, ash: Vector3, away: float) -> Variant:
	var per := {}
	for p in taken:
		var i: int = src().patch_of(p)
		per[i] = int(per.get(i, 0)) + 1
	for k in 50:
		var tot := 0.0
		var w := []
		for i in ArenaData.TALL.size():
			var c := int(per.get(i, 0))
			w.append(WildArenaGrass.area(i) / pow(1.0 + c, 2.0))
			tot += w[i]
		var x := _rng.randf() * tot
		var pick := 0
		for i in w.size():
			x -= w[i]
			if x <= 0.0: pick = i; break
		var p = src().random_spot(_rng, pick)
		if p == null: continue
		if Wild._d2(p, ash) < away: continue
		if taken.any(func(q): return Wild._d2(q, p) < MIN_GAP): continue
		return p
	return null

func _settle(id: String, p: Vector3) -> Dictionary:
	var lv: Array = cfg.get("lv", [6, 6])
	var temper: String
	match String(cfg.get("temper", "random")):
		"species": temper = wild.brain.pick_temper(id)
		"fixed": temper = String(cfg.get("fixed", "flighty"))
		_: temper = ArenaSetups.TEMPERS[_rng.randi() % ArenaSetups.TEMPERS.size()]
	var e := wild.spawn(id, src(), p, temper)
	e.hunt = true
	e.level = _rng.randi_range(int(lv[0]), maxi(int(lv[0]), int(lv[1])))
	return e

# ---------- the battle ----------
func battle_opts(e: Dictionary) -> Dictionary:
	var lv := int(e.get("level", 6))
	var o := {"level": lv, "log": true}
	var party: Array = cfg.get("party", [])
	if bool(cfg.get("with_party", false)) and not party.is_empty():
		var pa: Array = party.map(func(m): return ArenaSetups.mon(m))
		o.merge({"mode": "pkmn", "kind": "wild", "partner": pa[0], "party_a": pa, "party_b": [{"species": String(e.species), "level": lv}], "ai": "wild"}, true)
	else:
		o["mode"] = "prologue"
	return o

func on_result(e: Dictionary, out: String) -> void:
	var nm := wild._name(e).to_upper()
	print("hunt: %s: %s" % [e.species, out])
	match out:
		"defeated": wild.toaster.push("complete", nm + " BEATEN!", "Out of the hunt. %s" % _left_text(left() - 1), "check", 2.8)
		"disengaged": wild.toaster.push("info", nm + " LOST INTEREST", "It wandered off, out of the hunt.", "chat", 2.6)
		"ash_down": wild.toaster.push("warn", "ASH IS WORN OUT", "%s slipped away. Catch your breath and keep hunting." % wild._name(e), "sweat", 3.0)
		"ran": wild.toaster.push("info", "GOT AWAY", "%s is still hiding there, on edge." % wild._name(e), "chat", 2.4)
		# (fled: wild.gd's own toast, where it went)

func on_removed(_e: Dictionary) -> void:
	if not on: return
	n_out += 1
	if bool(cfg.get("refill", false)): _refill.append(REFILL_S)
	elif left() == 0:
		wild.toaster.push("complete", "HUNT CLEARED!", "Every one found. RESTART HUNT on the HUNT page to go again.", "star", 3.6)

func _left_text(n: int) -> String:
	return "The grass is empty." if n <= 0 else ("1 left in the grass." if n == 1 else "%d left in the grass." % n)

func _process(dt: float) -> void:
	if not on or Battle.active or wild.battle_on: return
	for i in range(_refill.size() - 1, -1, -1):
		_refill[i] = float(_refill[i]) - dt
		if float(_refill[i]) > 0.0: continue
		_refill.remove_at(i)
		if left() >= total(): continue
		var taken: Array = wild.encs.filter(func(x): return bool(x.get("hunt", false))).map(func(x): return (x.node as Node3D).position)
		var p = _spot(taken, game.pos, REFILL_AWAY)
		if p == null: _refill.append(5.0); continue
		var sp: Array = cfg.species
		var e := _settle(String(sp[_rng.randi() % sp.size()]), p)
		print("hunt: refilled with a %s" % e.species)

# ---------- the counter: "3 LEFT IN THE GRASS", a pip for each of the field ----------
class Counter extends Control:
	var hunt
	var _shown := -1
	var _pop := 0.0
	var _a := 0.0

	func _ready() -> void:
		set_anchors_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(dt: float) -> void:
		var want: bool = hunt.on and not Battle.active and not hunt.game.trans_busy and not (hunt.arena.menu and hunt.arena.menu.is_open())
		_a = clampf(_a + dt * (5.0 if want else -6.0), 0.0, 1.0)
		var n: int = hunt.left() if hunt.on else 0
		if n != _shown:
			if _shown >= 0: _pop = 1.0
			_shown = n
		_pop = maxf(0.0, _pop - dt * 2.5)
		visible = _a > 0.0
		if visible: queue_redraw()

	func _draw() -> void:
		var S := UITheme.safe_rect(self)
		var n := _shown
		var tot := maxi(n, int(hunt.total()))
		var done := n <= 0
		var label := "HUNT CLEARED" if done else ("1 LEFT IN THE GRASS" if n == 1 else "%d LEFT IN THE GRASS" % n)
		var tw := UITheme.text_w(label, "heading", 22)
		var pips := mini(tot, 12)
		var pw := pips * 13.0
		var w := 30.0 + tw + 16.0 + pw + 18.0
		var s := 1.0 + 0.08 * UITheme.ease_out(_pop)
		var r := Rect2(S.position.x + (S.size.x - w * s) * 0.5, S.position.y + 74.0, w * s, 38.0 * s)
		var a := _a
		UITheme.plate(self, r, a)
		UITheme.accent_bar(self, r, Color(UITheme.YELLOW if done else UITheme.GREEN, a), a, UITheme.SKEW, 5.0)
		UITheme.text_mid(self, Vector2(r.position.x + 24.0 * s, r.get_center().y), label, "heading", int(22 * s), Color(UITheme.TEXT, a))
		# the field: a filled pip for each still hiding, a hollow one for each out
		var x := r.position.x + (30.0 + tw + 16.0) * s
		for i in pips:
			var c := Vector2(x + i * 13.0 * s + 5.0, r.get_center().y)
			if i < n: draw_circle(c, 4.6 * s, Color(UITheme.GREEN, a), true, -1.0, true)
			else: draw_arc(c, 4.0 * s, 0.0, TAU, 16, Color(UITheme.TEXT, 0.45 * a), 1.6, true)
