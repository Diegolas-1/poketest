class_name Dish
extends Node3D
# One served dish (food/dishes.gd builds them): the plate or bowl and the food on
# it, its origin at the bottom of the plate, its front (+z) toward whoever eats.
# Eating it (meal.gd) runs `eaten` from 0 to 1 and the food goes bite by bite:
#   parts    pieces that shrink to nothing over their own stretch of the meal
#            (the berries first, then the top pancake...)
#   levels   surfaces that sink (soup, tea, cocoa), narrowing with the bowl
#   held     what goes up to his mouth in the hand (a cup, an onigiri, a skewer);
#            null: a fork / spoon / chopsticks bring bites up (utensil)
#   morsel   the colour of a bite on the fork / spoon / chopsticks

var id := ""
var utensil := "fork"        # fork | spoon | chopsticks | cup | hand
var morsel := Color("f0d9a8")
var held: Node3D = null
var held_home := Transform3D()   # where it rests on the table (the dish's frame)
var held_grip := Transform3D()   # how the hand holds it (the hand's frame)
var parts: Array = []        # [node, from, to, scale]
var levels: Array = []       # [node, y_full, y_empty, from, to, scale_empty]
var hot := false
var eaten := 0.0

func part(n: Node3D, from: float, to: float) -> Node3D:
	parts.append([n, from, to, n.scale])
	return n

func level(n: Node3D, y_full: float, y_empty: float, from := 0.0, to := 1.0, s_empty := 0.8) -> Node3D:
	levels.append([n, y_full, y_empty, from, to, s_empty])
	return n

func set_held(n: Node3D, grip := Transform3D()) -> void:
	held = n
	held_home = n.transform
	held_grip = grip

func set_eaten(f: float) -> void:
	eaten = clampf(f, 0.0, 1.0)
	for p in parts:
		var n: Node3D = p[0]
		var k := clampf((eaten - float(p[1])) / maxf(1e-4, float(p[2]) - float(p[1])), 0.0, 1.0)
		n.visible = k < 0.999
		# a bite at a time: it shrinks in steps, not smoothly
		var kk := floorf(k * 4.0 + 0.5) / 4.0 if k < 0.999 else 1.0
		n.scale = (p[3] as Vector3) * lerpf(1.0, 0.3, kk)
	for L in levels:
		var n2: Node3D = L[0]
		var k2 := clampf((eaten - float(L[3])) / maxf(1e-4, float(L[4]) - float(L[3])), 0.0, 1.0)
		n2.position.y = lerpf(float(L[1]), float(L[2]), k2)
		var s := lerpf(1.0, float(L[5]), k2)
		n2.scale = Vector3(s, 1.0, s)
		n2.visible = k2 < 0.995
	var st := get_node_or_null("steam")
	if st: st.visible = eaten < 0.9
