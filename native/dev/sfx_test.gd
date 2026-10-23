extends Node
# Dev only: the sound effects library and sfx.gd / sfx_world.gd, headless.
#   godot --headless --path native res://dev/sfx_test.tscn
# Checks every catalog entry (each file loads as Ogg Vorbis, has a length,
# loops are long enough and loop once played as a bed), every id the game
# asks for exists, the engine (variants, voice limits, beds fading in and
# out), and the footstep surface at known spots: the grass field, the square,
# the beach, a porch deck and the pier, the stone stairs, the tall grass on
# Route 1, Oak's lab floor, its stairs and the mezzanine.

class FakeCast extends Node:
	var tall: Array = []

class FakeInterior extends Node:
	var data: InteriorData

class FakeGame extends Node3D:
	var world: WorldData
	var outdoor_world: WorldData
	var indoors := false
	var interior: FakeInterior = null
	var cast := FakeCast.new()

# ids the game code plays (sfx_world.gd, dialog.gd, the menus, life.gd, companions)
const USED := ["ui_confirm", "ui_cancel", "ui_cursor", "ui_menu_open", "ui_menu_close", "ui_tab", "ui_toggle_on", "ui_toggle_off",
	"ui_slider_tick", "ui_error", "ui_notify", "ui_item_get", "ui_save", "ui_banner", "ui_dialog_open", "ui_dialog_advance", "ui_dialog_close",
	"ui_blip_low", "ui_blip_mid", "ui_blip_high", "ui_blip_kid", "ui_blip_text", "ui_blip_critter",
	"bush_rustle", "cloth_rustle", "tag_tap", "door_slide_open", "door_slide_close", "door_wood_open", "door_wood_close", "door_knock", "door_locked",
	"mailbox", "sign_knock", "well_plop", "boat_creak", "seagull", "pc_boot", "pc_beep", "tank_glug", "book_shelf", "page_turn", "ball_click",
	"glass_clink", "switch", "globe_spin", "drawer", "room_tone", "machine_hum", "tank_bubbles", "vent_loop", "light_buzz", "clock_loop", "pc_hum",
	"amb_wind_light", "amb_wind_strong", "amb_sea_waves", "amb_shore_lap", "amb_stream", "amb_pond", "amb_crickets", "windmill_creak",
	"dock_bell", "bird_call", "frog", "owl", "dog_distant", "wind_chimes", "chicken", "patter_small", "patter_heavy", "peck", "creature_hop",
	"wing_flap_large", "creature_honk", "critter_chirp"]
const SURFACES := ["grass", "dirt", "sand", "wood", "stone", "tile", "metal", "water", "tallgrass"]

var fails := 0
var checks := 0

func _check(ok: bool, what: String) -> void:
	checks += 1
	if not ok:
		fails += 1
		print("FAIL ", what)

func _ready() -> void:
	var cat: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://audio/sfx/catalog.json"))
	var ids := {}
	var nfiles := 0
	var by_cat := {}
	for e in cat.sounds:
		ids[e.id] = e
		by_cat[e.category] = int(by_cat.get(e.category, 0)) + 1
		for f in e.files:
			nfiles += 1
			var s = load("res://audio/sfx/" + f)
			_check(s is AudioStreamOggVorbis, "%s loads" % f)
			if s is AudioStreamOggVorbis:
				_check(s.get_length() > 0.0, "%s has a length" % f)
				if e.loop: _check(s.get_length() >= 1.9, "%s long enough to loop (%.1f s)" % [f, s.get_length()])
		_check(String(e.mode) in ["2d", "3d"] and String(e.bus) in ["SFX", "UI", "Ambience"], "%s mode and bus" % e.id)
		_check(String(e.get("license", "")).contains("CC0"), "%s licence CC0" % e.id)
	print("catalog: %d sounds, %d files, by category %s, %d sources" % [ids.size(), nfiles, by_cat, cat.sources.size()])
	for id in USED: _check(ids.has(id), "the game's id %s is in the catalog" % id)
	for s in SURFACES:
		_check(ids.has("step_" + s) and ids.has("step_%s_run" % s), "steps for %s" % s)
		if s != "tallgrass": _check(ids.has("jump_" + s) and ids.has("land_" + s), "jump and land for %s" % s)
	# ---- the engine ----
	var sfx: Sfx = preload("res://sfx.gd").new()
	add_child(sfx)
	sfx.setup()
	_check(Sfx.I == sfx and Sfx.has("step_grass"), "engine up")
	_check(AudioServer.get_bus_index("SFX") >= 0 and AudioServer.get_bus_index("UI") >= 0 and AudioServer.get_bus_index("Ambience") >= 0, "buses made")
	# variants never repeat back to back
	var last := -1
	var rep := 0
	for i in 30:
		Sfx.play("step_grass")
		if int(sfx.defs.step_grass.last) == last: rep += 1
		last = int(sfx.defs.step_grass.last)
	_check(rep == 0, "no variant twice in a row (%d repeats)" % rep)
	# the voice limit of one id, and the pools
	for i in 12: Sfx.play("owl", Vector3(5, 2, 5))
	await get_tree().process_frame
	var owls := 0
	for i in sfx.p3.size():
		if sfx.p3[i].playing and sfx.id3[i] == "owl": owls += 1
	_check(owls <= int(ids.owl.voices), "voice limit (%d owls playing, limit %d)" % [owls, ids.owl.voices])
	for i in 60: Sfx.play("bird_call", Vector3(i, 3, 0))
	_check(sfx.p3.size() == Sfx.N3D, "3D pool stays %d" % Sfx.N3D)
	# a bed fades in, holds, fades out and is freed
	Sfx.bed("t", "clock_loop", 1.0, null, 0.2)
	await _wait(0.4)
	_check(sfx.beds.has("t") and float(sfx.beds.t.amp) > 0.99, "bed faded in")
	var bp: AudioStreamPlayer = sfx.beds.t.p
	_check(bp.playing and bp.stream is AudioStreamOggVorbis and bp.stream.loop, "bed plays looped")
	await _wait(2.4)   # past the 2 s loop's end
	_check(bp.playing, "bed still playing after its loop length (pos %.2f)" % bp.get_playback_position())
	Sfx.bed("t", "clock_loop", 0.0, null, 0.2)
	await _wait(0.5)
	_check(not sfx.beds.has("t"), "bed freed after fading out")
	# ---- footstep surfaces ----
	var g := FakeGame.new()
	var W := WorldData.new()
	W.load_all()
	g.world = W; g.outdoor_world = W
	var cd: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://cast/cast.json"))
	g.cast.tall = cd.tallGrass
	add_child(g)
	var sw = preload("res://sfx_world.gd").new()
	add_child(sw)
	var t0 := Time.get_ticks_msec()
	sw.setup(g)
	print("sfx_world setup %d ms (water grid %dx%d, %d plant buckets)" % [Time.get_ticks_msec() - t0, sw.w_nx, sw.w_nz, sw.plants.size()])
	var spots := {
		"grass field": [Vector2(-10, -30), "grass"], "town square": [Vector2(0, 0), "dirt"], "beach": [Vector2(-20, 58), "sand"],
		"beach east": [Vector2(10, 55), "sand"], "porch deck": [Vector2(-26.625, -23.875), "wood"], "pier": [Vector2(-14.375, 70.125), "wood"],
		"stone stairs": [Vector2(30, 16), "stone"], "tall grass": [Vector2(-7, -62), "tallgrass"], "Route 1 path through the tall grass": [Vector2(1, -70), "dirt"], "Route 1 path": [Vector2(-1, -90), "dirt"],
	}
	for k in spots:
		var p: Vector2 = spots[k][0]
		var s: String = sw.surface_at(Vector3(p.x, W.height_at(p.x, p.y), p.y))
		_check(s == spots[k][1], "%s: %s (got %s)" % [k, spots[k][1], s])
	# water: the nearest sea from the square is south, the nearest fresh water a stream or the pond
	var sea: Vector2 = sw.nearest_water(Vector3(0, 0, 0), true)
	_check(sea.y > 45.0 and sea.y < 80.0, "nearest sea from the square at z %.1f" % sea.y)
	var fr: Vector2 = sw.nearest_water(Vector3(-50, 0, 30), false)
	_check(fr.distance_to(Vector2(-50, 40)) < 12.0, "nearest fresh water by the pond %s" % fr)
	_check(sw.plants.size() > 0, "plants to brush through")
	# inside Oak's lab
	var D := InteriorData.new()
	_check(D.load_space("res://interiors/oak_lab.json"), "lab data")
	var it := FakeInterior.new(); it.data = D
	g.interior = it; g.indoors = true
	D.level = 0
	_check(sw.surface_at(Vector3(5, 0, 0)) == "tile", "lab hall floor: tile (got %s)" % sw.surface_at(Vector3(5, 0, 0)))
	_check(sw.surface_at(Vector3(11, 0, -5.3)) == "metal", "lab stairs: metal (got %s)" % sw.surface_at(Vector3(11, 0, -5.3)))
	D.level = 1
	_check(sw.surface_at(Vector3(16, 3.4, 0)) == "metal", "mezzanine grate: metal (got %s)" % sw.surface_at(Vector3(16, 3.4, 0)))
	print("sfx test: %d checks, %d failed" % [checks, fails])
	get_tree().quit(1 if fails > 0 else 0)

func _wait(s: float) -> void:
	var t := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t < int(s * 1000.0): await get_tree().process_frame
