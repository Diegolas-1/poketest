extends Node
# Dev only: music.gd's logic, headless. A stand-in game walks through the
# cases (outdoors by day, into Oak's lab, a dialog, out again, evening, another
# building, music off and on, volume) and checks the track, the crossfade and
# the levels. Also checks that each track loads and loops on import.
#   godot --headless --path native res://dev/music_test.tscn

class FakeClock extends Node:
	var h := 12.0
	func hour() -> float: return h

class FakeDialog extends Node:
	var open := false

class FakeCast extends Node:
	var clock := FakeClock.new()
	var dialog := FakeDialog.new()

class FakeGame extends Node3D:
	var indoors := false
	var interior: Node = null
	var cast := FakeCast.new()

var g: FakeGame
var m: Node
var fails := 0

func _ready() -> void:
	for id in ["town", "night", "lab"]:
		var s = load(preload("res://music.gd").TRACKS[id])
		_check(s is AudioStreamOggVorbis, "%s loads" % id)
		if s is AudioStreamOggVorbis:
			_check(s.loop, "%s loops" % id)
			print("  %s: %.1f s, loop from %.2f s" % [id, s.get_length(), s.loop_offset])
	g = FakeGame.new()
	add_child(g)
	m = preload("res://music.gd").new()
	add_child(m)
	m.setup(g)
	await _run(0.3)
	_check(m.track == "town", "outdoors by day: town (got %s)" % m.track)
	await _run(2.0)
	_check(_db(m.cur) > -3.0, "town faded in (%.1f dB)" % _db(m.cur))
	# into the lab
	var it := Node.new(); it.name = "Interior_oak_lab"; g.add_child(it)
	g.interior = it; g.indoors = true
	await _run(0.1)
	_check(m.track == "lab", "inside Oak's lab: lab (got %s)" % m.track)
	await _run(0.75)
	var other := 1 - int(m.cur)
	_check(_db(m.cur) > -20.0 and _db(m.cur) < -0.5 and _db(other) < -2.0, "mid crossfade (in %.1f, out %.1f)" % [_db(m.cur), _db(other)])
	await _run(1.0)
	_check(not m.players[other].playing, "the town theme stopped after the crossfade")
	# a dialog ducks it
	g.cast.dialog.open = true
	await _run(0.6)
	_check(_db(m.cur) < -4.0, "dialog ducks (%.1f dB)" % _db(m.cur))
	g.cast.dialog.open = false
	await _run(0.6)
	_check(_db(m.cur) > -1.0, "back up after the dialog (%.1f dB)" % _db(m.cur))
	# out again, then evening
	g.indoors = false; g.interior = null; it.queue_free()
	await _run(2.0)
	_check(m.track == "town", "outside again: town (got %s)" % m.track)
	g.cast.clock.h = 19.5
	await _run(0.1)
	_check(m.track == "night", "evening: night theme (got %s)" % m.track)
	await _run(6.0)
	# another building: the town theme through the walls
	var house := Node.new(); house.name = "Interior_red_house"; g.add_child(house)
	g.cast.clock.h = 10.0
	g.interior = house; g.indoors = true
	await _run(6.0)
	_check(m.track == "town", "another building keeps the town theme (got %s)" % m.track)
	_check(m.lp.cutoff_hz < 2000.0, "and muffles it (%.0f Hz)" % m.lp.cutoff_hz)
	g.indoors = false; g.interior = null
	await _run(1.0)
	_check(m.lp.cutoff_hz > 15000.0, "open again outdoors (%.0f Hz)" % m.lp.cutoff_hz)
	# settings
	var bus: int = AudioServer.get_bus_index("Music")
	Settings.set_value("music_vol", 0.3)
	_check(AudioServer.get_bus_volume_db(bus) < -15.0, "volume 30%% = %.1f dB" % AudioServer.get_bus_volume_db(bus))
	Settings.set_value("music", 0)
	await _run(0.2)
	_check(AudioServer.is_bus_mute(bus) and not m.players[0].playing and not m.players[1].playing, "music off stops it")
	Settings.set_value("music", 1)
	await _run(0.2)
	_check(m.track == "town" and m.players[m.cur].playing, "music on plays again")
	Settings.set_value("music_vol", 0.7)
	print("music_test: %s" % ("OK" if fails == 0 else "%d FAILED" % fails))
	get_tree().quit(1 if fails else 0)

func _db(i: int) -> float:
	return m.players[i].volume_db if i >= 0 else -80.0

func _run(sec: float) -> void:
	var t := 0.0
	while t < sec:
		await get_tree().process_frame
		t += get_process_delta_time()

func _check(ok: bool, what: String) -> void:
	print(("  ok   " if ok else "  FAIL ") + what)
	if not ok: fails += 1
