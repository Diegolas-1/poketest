extends Node
# Dev only: music.gd's logic, headless. A stand-in game walks through the
# cases (the town by day and its two songs taking turns, into Oak's lab, a
# dialog, every part of the day, Route 1, Ash's house, the tea house, another
# building, a talk with Officer Jenny, a battle in town and on Route 1, music off
# and on, volume) and checks the track, the crossfade and the levels. Also checks
# that each track loads and loops on import.
#   godot --headless --path native res://dev/music_test.tscn

class FakeClock extends Node:
	var h := 12.0
	func hour() -> float: return h

class FakeDialog extends Node:
	var open := false

class FakeConvo extends Node:
	var active := false
	var who := ""

class FakeCast extends Node:
	var clock := FakeClock.new()
	var dialog := FakeDialog.new()
	var convo := FakeConvo.new()
	var area := "town"

class FakeGame extends Node3D:
	var indoors := false
	var interior: Node = null
	var cast := FakeCast.new()

var g: FakeGame
var m: Node
var fails := 0

func _ready() -> void:
	var M = preload("res://music.gd")
	for id in M.TRACKS0:
		var s = load(M.TRACKS0[id])
		_check(s is AudioStreamOggVorbis, "%s loads" % id)
		if s is AudioStreamOggVorbis:
			_check(s.loop, "%s loops" % id)
			print("  %s: %.1f s, loop from %.2f s" % [id, s.get_length(), s.loop_offset])
	g = FakeGame.new()
	add_child(g)
	m = M.new()
	add_child(m)
	m.setup(g)
	await _run(0.3)
	_check(m.track == "day", "outdoors at noon: day (got %s)" % m.track)
	await _run(2.0)
	_check(_db(m.cur) > -3.0, "day faded in (%.1f dB)" % _db(m.cur))
	# the town's two songs take turns: near the end of a pass, the other one
	m.played = m._stream("day").get_length() - 1.0
	await _run(0.1)
	_check(m.track == "pallet_alt_day", "after a pass of the theme: Kites over Pallet (got %s)" % m.track)
	await _run(3.0)
	_check(_db(m.cur) < -1.0 and _db(1 - int(m.cur)) > -9.0, "  a slow handover (in %.1f, out %.1f)" % [_db(m.cur), _db(1 - int(m.cur))])
	await _run(3.5)
	m.played = m._stream("pallet_alt_day").get_length() - 1.0
	await _run(0.1)
	_check(m.track == "day", "and back to the theme (got %s)" % m.track)
	await _run(6.5)
	# into the lab
	var it := Node.new(); it.name = "Interior_oak_lab"; g.add_child(it)
	g.interior = it; g.indoors = true
	await _run(0.1)
	_check(m.track == "lab", "inside Oak's lab: lab (got %s)" % m.track)
	await _run(0.75)
	var other := 1 - int(m.cur)
	_check(_db(m.cur) > -20.0 and _db(m.cur) < -0.5 and _db(other) < -2.0, "mid crossfade (in %.1f, out %.1f)" % [_db(m.cur), _db(other)])
	await _run(1.0)
	_check(not m.players[other].playing, "the town song stopped after the crossfade")
	# a dialog ducks it
	g.cast.dialog.open = true
	await _run(0.6)
	_check(_db(m.cur) < -4.0, "dialog ducks (%.1f dB)" % _db(m.cur))
	g.cast.dialog.open = false
	await _run(0.6)
	_check(_db(m.cur) > -1.0, "back up after the dialog (%.1f dB)" % _db(m.cur))
	g.indoors = false; g.interior = null; it.queue_free()
	await _run(2.0)
	# every part of the day in town (each pair starts with the town theme)
	for step in [[19.5, "evening"], [22.0, "night"], [5.5, "dawn"], [8.0, "morning"], [15.0, "day"]]:
		g.cast.clock.h = step[0]
		await _run(0.1)
		_check(m.track == step[1], "%.1f h: %s (got %s)" % [step[0], step[1], m.track])
		await _run(3.0)
		_check(_db(m.cur) > -6.0 and _db(1 - int(m.cur)) < -2.0, "  slow crossfade under way (in %.1f, out %.1f)" % [_db(m.cur), _db(1 - int(m.cur))])
		await _run(3.5)
		_check(not m.players[1 - int(m.cur)].playing, "  and done")
	# Route 1
	g.cast.area = "route1"
	for step in [[10.0, "route1_day"], [19.0, "route1_evening"], [23.0, "route1_night"]]:
		g.cast.clock.h = step[0]
		await _run(0.1)
		_check(m.track == step[1], "Route 1 at %.1f h: %s (got %s)" % [step[0], step[1], m.track])
		await _run(6.5)
	g.cast.area = "viridian_gate"
	await _run(0.2)
	_check(m.track == "route1_night", "at the gate: still Route 1 (got %s)" % m.track)
	# Officer Jenny
	g.cast.convo.active = true; g.cast.convo.who = "jenny"
	await _run(0.1)
	_check(m.track == "jenny", "talking to Officer Jenny: jenny (got %s)" % m.track)
	await _run(2.0)
	g.cast.convo.active = false; g.cast.convo.who = ""
	await _run(0.1)
	_check(m.track == "route1_night", "after the talk: Route 1 again (got %s)" % m.track)
	await _run(2.0)
	# a battle on Route 1, then one in town
	var b := Battle.new()
	Battle.current = b
	await _run(0.1)
	_check(m.track == "battle_route1", "a battle on Route 1: battle_route1 (got %s)" % m.track)
	await _run(0.5)
	_check(_db(m.cur) > -1.5, "  in at once (%.1f dB)" % _db(m.cur))
	g.cast.area = "town"
	await _run(0.3)
	_check(m.track == "battle_route1", "  it stays the Route 1 battle where it began (got %s)" % m.track)
	Battle.current = null
	await _run(2.0)
	Battle.current = b
	await _run(0.2)
	_check(m.track == "battle_pallet", "a battle in town: battle_pallet (got %s)" % m.track)
	Battle.current = null
	b.free()
	g.cast.clock.h = 10.0
	await _run(2.0)
	# rooms with their own songs
	for room in [["ketchum_house", "home"], ["pallet_house", "home"], ["tea_house", "tea_house"]]:
		var r := Node.new(); r.name = "Interior_" + room[0]; g.add_child(r)
		g.interior = r; g.indoors = true
		await _run(1.0)
		_check(m.track == room[1], "inside %s: %s (got %s)" % [room[0], room[1], m.track])
		_check(m.lp.cutoff_hz > 15000.0, "  not muffled (%.0f Hz)" % m.lp.cutoff_hz)
		g.indoors = false; g.interior = null; r.queue_free()
		await _run(2.0)
	# another building: the town's music through the walls
	var house := Node.new(); house.name = "Interior_red_house"; g.add_child(house)
	g.interior = house; g.indoors = true
	await _run(6.0)
	_check(m.track == "morning" or m.track == "pallet_alt_morning", "another building keeps the town's song (got %s)" % m.track)
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
	_check((m.track == "morning" or m.track == "pallet_alt_morning") and m.players[m.cur].playing, "music on plays again")
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
