class_name EnergyHook
extends Node
# Plugs the energy system (battle/energy.gd) into a battle (battle/battle.gd),
# without the battle depending on it: every call into the battle is guarded
# (has_method / "in" / get_node_or_null), so it works with the real battle, a
# fake one (dev/energy_fake_battle.gd) or none at all.
#
# On the battle's side (design/energy_system.md, "Wiring"):
#   # when the HUD is up (after the intro):
#   EnergyHook.attach(self, {"species": species, "level": R.level(), "temper": opts.temper})
#   # the wild one's choice, one function returning the moves for its turn:
#   func _wild_pick(state: Dictionary) -> Array:
#       var h := get_node_or_null("EnergyHook")
#       if h and h.has_method("wild_pick"): return h.wild_pick(state)
#       return [R.decide()]
#   # as each picked move plays (the chips fly from the bar to `to`, a screen point):
#   var h := get_node_or_null("EnergyHook"); if h: h.on_move(move_id, to)
#   # at the end:
#   if h: h.detach()
#
# wild_pick(state) begins the wild one's turn (state.turn, when given, is the
# battle's turn number: the bar catches up to it) and returns its plan as the
# battle's own move dicts, in order:
#   [{kind: "move", move: id, first: bool (priority), cost: [...], name, anim, power, accuracy, effects}]
# An empty list: it has nothing it can pay for (it gathers itself).
# The battle still decides fleeing and disengaging by its moods before asking.
#
# The bars: the foe's goes in the battle's anchor for it: battle.energy_anchor("foe")
# -> Rect2, or battle.energy_anchors["foe"], or the same on battle.ui; else under
# the foe's plate (top right). It goes on battle.layer (a CanvasLayer) or
# battle.ui, else on a layer of its own. It slides in and out with battle.ui.hud_on.

const FALLBACK_H := 50.0

var battle: Node
var foe: BattleEnergy
var ally: BattleEnergy
var bar: EnergyBar
var ally_bar: EnergyBar
var temper := "flighty"
var style := ""                  # forced plan style ("" = from the temper)
var uses := {}                   # move -> times planned this battle (status moves lose value)
var jitter := 0.1
var supported: Array = []        # the moves the battle can play ([] = any)
var rng := RandomNumberGenerator.new()
var _layer: CanvasLayer
var _opts := {}
var _detaching := false

# ---------- attaching ----------
static func attach(b: Node, o := {}) -> EnergyHook:
	var h := EnergyHook.new()
	h.name = "EnergyHook"
	h.battle = b
	h._opts = o
	h._setup()
	if b != null and is_instance_valid(b):
		var old := b.get_node_or_null("EnergyHook")
		if old: old.name = "EnergyHookOld"; old.queue_free()
		b.add_child(h)
	return h

static func temper_style(t: String) -> String:
	match t:
		"aggressive": return "aggressive"
		"timid": return "evasive"
		_: return "strategic"      # flighty, curious: a bit of everything

func _get_b(key: String, def = null):
	if battle == null or not is_instance_valid(battle): return def
	var v = battle.get(key) if key in battle else null
	return def if v == null else v

func _setup() -> void:
	var o := _opts
	var bo: Dictionary = _get_b("opts", {}) if _get_b("opts", {}) is Dictionary else {}
	var sp := String(o.get("species", _get_b("species", bo.get("species", "pidgey"))))
	if BattleEnergy.species_data(sp).is_empty(): sp = "pidgey"
	var lv := int(o.get("level", 0))
	if lv <= 0:
		var R = _get_b("R")
		if R is Object and R.has_method("level"): lv = int(R.level())
	if lv <= 0:
		var wl: Array = BattleEnergy.species_data(sp).get("wild_levels", [3, 3])
		lv = int(wl[0]) if not wl.is_empty() else 3
	temper = String(o.get("temper", bo.get("temper", "flighty")))
	style = String(o.get("style", ""))
	jitter = float(o.get("jitter", 0.1))
	if o.has("seed"): rng.seed = int(o.seed)
	else: rng.randomize()
	foe = BattleEnergy.make(sp, lv, o.get("known", null))
	# the moves the battle can stage
	if o.get("moves", null) is Array: supported = o.moves.duplicate()
	elif battle and battle.has_method("energy_moves"): supported = battle.energy_moves()
	else:
		var R2 = _get_b("R")
		if R2 is Object and "S" in R2 and R2.S is Dictionary and R2.S.get("moves", null) is Dictionary:
			supported = R2.S.moves.keys()

func _ready() -> void:
	var host := _hud_parent()
	bar = _make_bar("foe", foe, host)

func _hud_parent() -> Node:
	var l = _get_b("layer")
	if l is CanvasLayer: return l
	var u = _get_b("ui")
	if u is Control: return u
	_layer = CanvasLayer.new()
	_layer.layer = 12
	_layer.name = "EnergyLayer"
	add_child(_layer)
	return _layer

func _make_bar(side: String, e: BattleEnergy, host: Node) -> EnergyBar:
	var b := EnergyBar.new()
	b.name = "EnergyBar_" + side
	b.side = side
	b.align_right = side == "foe"
	b.title = BattleEnergy.species_data(e.species).get("name", e.species)
	host.add_child(b)
	b.bind(e)
	b.fit(anchor(side))
	b.k = 0.0
	b.show_bar(_hud_on())
	return b

# ---------- the anchors ----------
func anchor(side: String) -> Rect2:
	for src in [battle, _get_b("ui")]:
		if src == null or not is_instance_valid(src): continue
		if src.has_method("energy_anchor"):
			var r = src.energy_anchor(side)
			if r is Rect2 and r.size != Vector2.ZERO: return r
		if "energy_anchors" in src and src.energy_anchors is Dictionary and src.energy_anchors.get(side, null) is Rect2:
			return src.energy_anchors[side]
	var ci: CanvasItem = bar if bar else null
	var safe := UITheme.safe_rect(ci) if ci and ci.is_inside_tree() else Rect2(0, 0, 1280, 720)
	if side == "foe": return Rect2(safe.end.x - 422.0, safe.position.y + 186.0, 400.0, FALLBACK_H)
	return Rect2(safe.position.x + 22.0, safe.end.y - 190.0, 400.0, FALLBACK_H)

func _hud_on() -> bool:
	var u = _get_b("ui")
	if u is Object and "hud_on" in u: return bool(u.hud_on)
	return true

func _process(_dt: float) -> void:
	if _detaching: return
	var on := _hud_on()
	for pair in [[bar, "foe"], [ally_bar, "ally"]]:
		var b: EnergyBar = pair[0]
		if b == null or not is_instance_valid(b): continue
		var r := anchor(pair[1])
		if not r.position.is_equal_approx(b.position) or not r.size.is_equal_approx(b.size): b.fit(r)
		b.show_bar(on)

# ---------- the wild one's turn ----------
func plan_style() -> String:
	return style if style != "" else temper_style(temper)

func usable_moves() -> Array:
	if supported.is_empty(): return foe.known.duplicate()
	return foe.known.filter(func(id): return id in supported)

# begins its turn (catching up to state.turn when given) and returns its plan
func wild_pick(state := {}) -> Array:
	if foe == null: return []
	var want := int(state.get("turn", foe.turn + 1))
	if want > foe.turn:
		while foe.turn < want: foe.begin_turn()
	var st := String(state.get("style", ""))
	if st == "": st = temper_style(String(state.get("temper", temper))) if style == "" else style
	var plan := foe.plan_turn(usable_moves(), st, {"uses": uses, "rng": rng, "jitter": jitter})
	var out := []
	for id in plan:
		uses[id] = int(uses.get(id, 0)) + 1
		var m := BattleEnergy.move(id)
		out.append({"kind": "move", "move": id, "first": int(m.get("priority", 0)) > 0, "cost": BattleEnergy.cost_of(id),
			"name": String(m.get("name", id)).to_upper(), "anim": String(m.get("anim", id)), "power": int(m.get("power", 0)),
			"accuracy": int(m.get("accuracy", 100)), "effects": m.get("effects", []).duplicate()})
	return out

# a move is played: its chips fly from the bar to `to` (a screen point; default:
# Ash on screen when the battle has a camera, else up and away). False if it can't pay.
func on_move(move_id: String, to = null, side := "foe") -> bool:
	var e := foe if side == "foe" else ally
	var b := bar if side == "foe" else ally_bar
	if e == null: return false
	var cost := BattleEnergy.cost_of(move_id)
	if cost.is_empty() or not e.can_pay(cost): return false
	if b and is_instance_valid(b): b.fly_target = to if to is Vector2 else _default_target(side)
	return not e.pay(cost, move_id).is_empty()

func _default_target(side: String) -> Vector2:
	var cam = _get_b("cam")
	var at = _get_b("ash_pos" if side == "foe" else "foe_pos")
	if cam is Camera3D and at is Vector3 and cam.is_inside_tree() and not cam.is_position_behind(at + Vector3(0, 1.0, 0)):
		return cam.unproject_position(at + Vector3(0, 1.0, 0))
	return Vector2(-1, -1)

# an item used in battle (pokemon.json energy_items): chips restored
func use_item(item_id: String, side := "foe") -> int:
	var e := foe if side == "foe" else ally
	return e.use_item(item_id) if e else 0

# ---------- an ally Pokémon (later: Ash's own) ----------
func add_ally(sp: String, lv: int, known = null) -> BattleEnergy:
	ally = BattleEnergy.make(sp, lv, known)
	var host := bar.get_parent() if bar else _hud_parent()
	ally_bar = _make_bar("ally", ally, host)
	return ally

# a move list for the ally, wired to its bar's preview
func make_move_list() -> EnergyMoveList:
	if ally == null: return null
	var ml := EnergyMoveList.new()
	ml.bar_preview = ally_bar
	ml.bind(ally, ally.known)
	return ml

# ---------- the end ----------
func detach() -> void:
	_detaching = true
	for b in [bar, ally_bar]:
		if b and is_instance_valid(b): b.show_bar(false)
	var tw := create_tween() if is_inside_tree() else null
	if tw:
		tw.tween_interval(UITheme.BASE + 0.1)
		tw.tween_callback(_free_all)
	else: _free_all()

func _free_all() -> void:
	for b in [bar, ally_bar]:
		if b and is_instance_valid(b): b.queue_free()
	queue_free()
