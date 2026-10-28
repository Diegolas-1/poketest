extends Node
# Dev only: the smallest stand-in for battle/battle.gd that EnergyHook plugs
# into (dev/energy_test.gd, dev/energy_shot.gd), with the three hooks the real
# battle is to have: _wild_pick(state) -> Array, energy_anchor(side) -> Rect2,
# and a HUD layer. Its foe plate is drawn by the shot (it has no 3D).

var species := "pidgey"
var opts := {"species": "pidgey", "temper": "flighty"}
var layer: CanvasLayer
var ui: Control
var turn := 0
var played: Array = []

class FakeUI extends Control:
	var hud_on := true

func _init() -> void:
	layer = CanvasLayer.new()
	layer.layer = 5
	add_child(layer)
	ui = FakeUI.new()
	ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(ui)

# the HUD's anchors for the energy bars (the foe's right under its plate)
func energy_anchor(side: String) -> Rect2:
	var safe := UITheme.safe_rect(ui) if ui.is_inside_tree() else Rect2(0, 0, 1280, 720)
	if side == "foe": return Rect2(safe.end.x - 452.0, safe.position.y + 182.0, 430.0, 52.0)
	return Rect2(safe.position.x + 22.0, safe.end.y - 232.0, 430.0, 52.0)

# the one function the wild side's choice goes through
func _wild_pick(state: Dictionary) -> Array:
	var h := get_node_or_null("EnergyHook")
	if h and h.has_method("wild_pick"): return h.wild_pick(state)
	return [{"kind": "move", "move": "tackle", "first": false}]

# plays a turn: picks, then each move in order (the chips fly to `to`)
func foe_turn(to := Vector2(-1, -1)) -> Array:
	turn += 1
	var plan := _wild_pick({"turn": turn, "temper": String(opts.temper)})
	var h := get_node_or_null("EnergyHook")
	for p in plan:
		played.append(p.move)
		if h: h.on_move(p.move, to)
	return plan
