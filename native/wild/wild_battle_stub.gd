extends Node
# A stand-in for the battle (native/battle/, class Battle) while it is not in the
# build: the same call, Battle.start(game, opts), prints what it was asked and a
# second later finishes with {"outcome": "ran"}. wild.gd looks for the real class
# first (wild.gd _battle_script) and talks to either the same way.
#   var b = Stub.start(game, {"species": "pidgey", "creature": node, "at": Vector3, "temper": ..., "state": ..., "where": "tall_grass", "first_strike": "ash" | "wild"})
#   b.finished.connect(func(result): ...)     result: {"outcome": "fled" | "disengaged" | "ash_won" | "ash_down" | "ran"}

signal finished(result: Dictionary)

static var active := false
static var outcome := "ran"     # (dev: what the stand-in reports; --wild-outcome=fled ...)
static var extra := {}          # (dev: more of the result, e.g. {"pkmn_outcome": "won"})
static var last := {}           # (dev: the opts it was last started with)
var opts := {}
var _t := 0.0

static func start(game: Node, o: Dictionary) -> Node:
	var b = load("res://wild/wild_battle_stub.gd").new()
	b.name = "BattleStub"
	b.opts = o
	last = o
	game.add_child(b)
	active = true
	print("wild: Battle.start (stand-in) ", {"species": o.get("species"), "temper": o.get("temper"), "state": o.get("state"), "where": o.get("where"), "first_strike": o.get("first_strike")})
	return b

func _process(dt: float) -> void:
	_t += dt
	if _t >= 1.0:
		active = false
		var r := {"outcome": outcome}
		r.merge(extra)
		print("wild: battle (stand-in) finished ", r)
		finished.emit(r)
		queue_free()
		set_process(false)
