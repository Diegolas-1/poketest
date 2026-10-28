extends RefCounted
# Dev test: hunger.gd, the menus and the meal's acting (called by dev/conditions_test.gd
# in its scene version, res://dev/conditions_test.tscn).

# hunger.gd: fullness over game time, the levels, their effects, eating
static func run(root: Node, C: Conditions, clk: Object, check: Callable) -> void:
	var H := Hunger.new()
	root.add_child(H)
	C.body["fullness"] = 80.0
	H.setup(C)
	check.call(absf(H.fullness - 80.0) < 1e-4 and H.level() == "full", "loads its fullness: Full at 80")
	check.call(C.has("well_fed") and not C.has("hungry"), "Full shows Well fed")
	# the maths: 7.5 %/h resting; running 1.8x; 1600 kcal = 100 %
	check.call(absf(Hunger.drain(60.0, "rest") - 7.5) < 1e-4, "an hour resting: 7.5 %")
	check.call(absf(Hunger.drain(60.0, "run") - 13.5) < 1e-4, "an hour running: 13.5 %")
	check.call(Hunger.drain(60.0, "bike") > Hunger.drain(60.0, "walk") and Hunger.drain(60.0, "wade") > Hunger.drain(60.0, "walk"), "biking and wading burn more than walking")
	check.call(absf(Hunger.pct(800.0) - 50.0) < 1e-4, "800 kcal fills 50 %")
	# the levels at their edges
	var want := {100.0: "stuffed", 92.0: "stuffed", 91.9: "full", 70.0: "full", 69.0: "satisfied", 45.0: "satisfied", 44.0: "peckish", 28.0: "peckish", 27.0: "hungry", 12.0: "hungry", 11.9: "starving", 0.0: "starving"}
	for f in want: check.call(Hunger.level_of(f) == want[f], "level at %.1f: %s (want %s)" % [f, Hunger.level_of(f), want[f]])
	# well fed: the small athletics bonus
	check.call(C.mult("stamina_regen") > 1.04 and C.mult("stamina_regen") < 1.11, "well fed: +5..10 %% regen (%.3f)" % C.mult("stamina_regen"))
	check.call(C.mult("stamina_max") > 1.04 and C.mult("stamina_max") < 1.11, "well fed: a bigger bar")
	check.call(C.mult("run_speed") > 1.0 and C.mult("jump") > 1.0, "well fed: a run and jump edge")
	# time passes: four game hours resting, 80 -> 50, Satisfied, no badge
	clk.minutes += 240.0
	C._process(0.016); H._process(0.016)
	check.call(absf(H.fullness - 50.0) < 0.01 and H.level() == "satisfied", "4 h later: 50 %% satisfied (%.2f)" % H.fullness)
	check.call(not C.has("well_fed") and not C.has("hungry") and not C.has("stuffed"), "satisfied: no hunger badge")
	check.call(absf(C.mult("stamina_regen") - 1.0) < 1e-4, "satisfied: no effect")
	# on to Peckish, Hungry, Starving
	clk.minutes += 120.0
	C._process(0.016); H._process(0.016)
	check.call(H.level() == "peckish" and C.has("hungry") and C.label("hungry") == "Peckish", "35 %%: Peckish (%s)" % C.label("hungry"))
	clk.minutes += 120.0
	C._process(0.016); H._process(0.016)
	check.call(H.level() == "hungry" and C.label("hungry") == "Hungry", "20 %: Hungry")
	check.call(C.mult("stamina_regen") < 1.0 and C.mult("stamina_regen") > 0.8, "hungry: a little less regen")
	clk.minutes += 600.0
	C._process(0.016); H._process(0.016)
	check.call(H.fullness == 0.0 and H.level() == "starving" and C.label("hungry") == "Starving", "a long day: Starving, never below 0")
	check.call(absf(C.mult("stamina_regen") - 0.75) < 1e-4, "starving: 0.75x regen at worst (%.3f)" % C.mult("stamina_regen"))
	check.call(C.mult("stamina_max") >= 0.9 and C.mult("stamina_max") < 1.0, "starving: a slightly smaller bar")
	check.call(not C.flag("no_run") and absf(C.mult("speed") - 1.0) < 1e-4 and absf(C.mult("run_speed") - 1.0) < 1e-4, "starving never stops or slows his running")
	check.call(C.remarks_for("delia").size() == 1, "people notice he's starving")
	# eating: 780 kcal curry = 48.75 %, then cocoa
	var got := H.eat(780.0)
	check.call(absf(got - 48.75) < 1e-3 and H.level() == "satisfied" and not C.has("hungry"), "a curry: +48.75 %, satisfied")
	check.call(absf(H.preview(1600.0) - 100.0) < 1e-4, "never past 100 %")
	H.eat(400.0)
	check.call(H.level() == "full" and C.has("well_fed"), "and a bit more: well fed")
	H.eat(600.0)
	check.call(H.level() == "stuffed" and C.has("stuffed") and not C.has("well_fed"), "too much: stuffed, no well fed")
	check.call(C.mult("run_speed") < 1.0 and C.mult("run_speed") > 0.88, "stuffed: a slight run slowdown")
	# it settles: a stuffed boy is full again within the hour or so
	clk.minutes += 75.0
	C._process(0.016); H._process(0.016)
	check.call(H.level() == "full", "stuffed settles to full (%.1f)" % H.fullness)
	# saved with the conditions' body
	check.call(absf(float(C.body.fullness) - H.fullness) < 0.02, "saved in Conditions.body")
	# the menus: by the hour, prices, the tab
	check.call(FoodData.meal_at(7.0) == "breakfast" and FoodData.meal_at(12.0) == "lunch" and FoodData.meal_at(19.0) == "supper" and FoodData.meal_at(2.0) == "supper", "meals by the hour")
	var mh := FoodData.menu("home", 7.5)
	var ok_now := []
	for c in mh.cats:
		for e in c.items:
			if e.ok: ok_now.append(e.id)
	check.call(ok_now.has("pancakes") and not ok_now.has("hamburg"), "home at breakfast: pancakes, no hamburg")
	check.call(not FoodData.menu("inn", 12.0).cats.is_empty() and not FoodData.menu("tea_house", 15.0).cats.is_empty(), "the inn and the tea house have menus")
	for pid in ["home", "inn", "tea_house"]:
		for c in FoodData.place(pid).categories:
			for e in c.items:
				var it := FoodData.item(String(e.id))
				check.call(not it.is_empty() and Dishes.ids().has(String(it.get("model", ""))), "%s: %s has a dish model" % [pid, e.id])
	FoodData.charge("tea_house", 180)
	FoodData.charge("tea_house", 200)
	check.call(FoodData.tab("tea_house") == 380, "the tea house tab")
	# a meal's acting has its bites in order
	var a := Meal.build_action("spoon", 4, Vector3(0, 0.75, 0.3), true)
	var bites: Array = a.events.filter(func(e): return e[1] == "bite")
	check.call(bites.size() == 4 and float(a.dur) > float(bites[3][0]), "the meal action: 4 bites, then the lean back")
	H.queue_free()

