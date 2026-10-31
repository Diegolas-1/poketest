extends Node
# Background music (created by main.gd). What plays where:
#
#   Pallet Town, outdoors   the town theme for this part of the day, alternating
#                           with a second song of its own (each plays one full
#                           pass, then they crossfade): TOWN_ALT
#     dawn     pallet_ost_dawn.ogg     <> pallet_alt_morning.ogg  "Tide Pools at Sunrise"
#     morning  pallet_ost_morning.ogg  <> pallet_alt_morning.ogg
#     day      pallet_ost_day.ogg      <> pallet_alt_day.ogg      "Kites over Pallet"
#     evening  pallet_ost_evening.ogg  <> pallet_alt_evening.ogg  "Lanterns on the Pier"
#     night    pallet_ost_night.ogg    <> pallet_alt_night.ogg    "Lighthouse Lullaby"
#   Route 1 (and the Viridian gate), by part of the day: ROUTE_TRACK
#     route1_day.ogg "The Road to Viridian" (dawn to 6 PM), route1_evening.ogg
#     "Golden Fields", route1_night.ogg "Fireflies in the Tall Grass"
#   indoors: ROOM_TRACK  oak_lab.ogg "Curious Minds" (Oak's lab), home.ogg "Mom's
#     Kitchen" (Ash's house and the Pallet house), tea_house.ogg "Steeped in
#     Stillness" (Route 1's tea house); any other building: the outdoor music,
#     muffled as if through the walls
#   talking to Officer Jenny: TALK_TRACK  jenny.ogg "On Official Duty"
#   a battle (Battle.current), by where it is: BATTLE_TRACK  battle_pallet.ogg
#     "Seaside Showdown" (Pallet Town, Oak's arena), battle_route1.ogg "Tall Grass
#     Ambush" (Route 1)
#   riding the bike: bike_track (music.json), when it names one
#
# The town theme (pallet_ost_*) is built by tools/music/ost.py from the
# recording in tools/music/sources/; the other songs are scores in
# tools/music/songs/<id>.py; the orchestral town themes (tools/music/build.py:
# "Hometown by the Sea" and "Evening Tide") are kept as town_orch / night_orch:
# play(id) takes them, but nothing asks for them now. Each file loops on import
# (an intro plays once, then the loop body).
#
# Two players crossfade (1.5 s through a door, 6 s when the part of the day
# changes or a town song hands over to its partner, 0.35 s into a battle). The
# music bus "Music" is made at run time (no project setting) and carries a
# low-pass that closes when the outdoor music plays inside a building with no
# song of its own. The music dips a little while a dialog box is open and pauses
# while the app is in the background. A track whose file is missing is skipped
# (the town theme plays instead).
# Settings: "music" (on / off), "music_vol" (0..1).
# Orchestral samples: VSCO 2 Community Edition, Versilian Studios (Sam Gossner,
# Simon Dalzell), free for any use; GM instruments: GeneralUser GS (S. Christian
# Collins); scores and mix: tools/music/.

const TRACKS0 := {
	"dawn": "res://audio/music/pallet_ost_dawn.ogg",
	"morning": "res://audio/music/pallet_ost_morning.ogg",
	"day": "res://audio/music/pallet_ost_day.ogg",
	"evening": "res://audio/music/pallet_ost_evening.ogg",
	"night": "res://audio/music/pallet_ost_night.ogg",
	"lab": "res://audio/music/oak_lab.ogg",
	"town_orch": "res://audio/music/pallet_town.ogg",
	"night_orch": "res://audio/music/pallet_town_night.ogg",
	"pallet_alt_morning": "res://audio/music/pallet_alt_morning.ogg",
	"pallet_alt_day": "res://audio/music/pallet_alt_day.ogg",
	"pallet_alt_evening": "res://audio/music/pallet_alt_evening.ogg",
	"pallet_alt_night": "res://audio/music/pallet_alt_night.ogg",
	"route1_day": "res://audio/music/route1_day.ogg",
	"route1_evening": "res://audio/music/route1_evening.ogg",
	"route1_night": "res://audio/music/route1_night.ogg",
	"home": "res://audio/music/home.ogg",
	"tea_house": "res://audio/music/tea_house.ogg",
	"jenny": "res://audio/music/jenny.ogg",
	"battle_pallet": "res://audio/music/battle_pallet.ogg",
	"battle_route1": "res://audio/music/battle_route1.ogg",
}
# the town's version for each part of the day (clock.gd periods)
const PERIOD_TRACK0 := {"dawn": "dawn", "morning": "morning", "midday": "day", "afternoon": "day", "evening": "evening", "night": "night"}
# the town's second song for each part of the day (alternates with PERIOD_TRACK's)
const TOWN_ALT0 := {"dawn": "pallet_alt_morning", "morning": "pallet_alt_morning", "midday": "pallet_alt_day",
	"afternoon": "pallet_alt_day", "evening": "pallet_alt_evening", "night": "pallet_alt_night"}
const ROUTE_TRACK0 := {"dawn": "route1_day", "morning": "route1_day", "midday": "route1_day", "afternoon": "route1_day",
	"evening": "route1_evening", "night": "route1_night"}
# interiors by id (main.gd names them Interior_<id>)
const ROOM_TRACK0 := {"oak_lab": "lab", "ketchum_house": "home", "pallet_house": "home", "tea_house": "tea_house"}
# who Ash is talking to (Conversation.who)
const TALK_TRACK0 := {"jenny": "jenny"}
# a battle, by cast.area where it happens ("arena" = Oak's training arena)
const BATTLE_TRACK0 := {"town": "battle_pallet", "arena": "battle_pallet", "route1": "battle_route1", "viridian_gate": "battle_route1"}
const TRACK_DB0 := {"lab": -0.5, "night_orch": -1.5}   # the other songs are levelled in the files
# the world editor's tunables (res://tunables/music.json) over these
const T := preload("res://tunables.gd")
var TRACKS := T.dict("music", "tracks", TRACKS0)
var PERIOD_TRACK := T.dict("music", "period_track", PERIOD_TRACK0)
var TOWN_ALT := T.dict("music", "town_alt", TOWN_ALT0)
var ROUTE_TRACK := T.dict("music", "route_track", ROUTE_TRACK0)
var ROOM_TRACK := T.dict("music", "room_track", ROOM_TRACK0)
var TALK_TRACK := T.dict("music", "talk_track", TALK_TRACK0)
var BATTLE_TRACK := T.dict("music", "battle_track", BATTLE_TRACK0)
var TRACK_DB := T.dict("music", "track_db", TRACK_DB0)
# riding Ash's bike: a track of its own when music.json names one (bike_track: a
# res:// path, empty = the town's music goes on)
var BIKE_TRACK := T.text("music", "bike_track", "")
var DOOR_FADE := T.num("music", "door_fade", 1.5)
var DAY_FADE := T.num("music", "day_fade", 6.0)
var DUCK_DB := T.num("music", "duck_db", -4.5)
var BATTLE_FADE := T.num("music", "battle_fade", 0.35)
const BUS := "Music"

var game: Node                 # main.gd
var players: Array[AudioStreamPlayer] = []
var cur := -1                  # index of the player that is fading in / playing
var track := ""
var fades := [{}, {}]          # per player: {from, to, t, len, stop} (amplitudes 0..1)
var ptrack := ["", ""]         # the track each player holds
var streams := {}
var duck := 0.0                # 0..1, eased
var muffle := 0.0              # 0..1, eased (low-pass for "through the walls")
var lp: AudioEffectLowPassFilter
var bus_idx := -1
var enabled := true
var vol := 0.7
var played := 0.0              # seconds the current track has played (for the town's handovers)
var turn := {}                 # town pair ("a|b") -> which of the two is on (0 / 1), kept between visits
var slot := ""                 # what the moment wants: "pair:a|b", or a track id
var _battle_area := ""         # where the battle on now started

func setup(g: Node) -> void:
	game = g
	if BIKE_TRACK != "": TRACKS["bike"] = BIKE_TRACK
	process_mode = Node.PROCESS_MODE_ALWAYS
	bus_idx = AudioServer.get_bus_index(BUS)
	if bus_idx == -1:
		AudioServer.add_bus()
		bus_idx = AudioServer.bus_count - 1
		AudioServer.set_bus_name(bus_idx, BUS)
		AudioServer.set_bus_send(bus_idx, "Master")
		lp = AudioEffectLowPassFilter.new()
		lp.cutoff_hz = 20000.0
		AudioServer.add_bus_effect(bus_idx, lp)
	else:
		lp = AudioServer.get_bus_effect(bus_idx, 0) as AudioEffectLowPassFilter
	for i in 2:
		var p := AudioStreamPlayer.new()
		p.bus = BUS
		p.volume_db = -80.0
		add_child(p)
		players.append(p)
	enabled = int(Settings.get_value("music")) == 1
	vol = float(Settings.get_value("music_vol"))
	Settings.changed.connect(_on_setting)
	_apply_bus()

func _on_setting(key: String, v) -> void:
	match key:
		"music":
			enabled = int(v) == 1
			if not enabled:
				for p in players: p.stop()
				track = ""
				cur = -1
		"music_vol":
			vol = float(v)
	_apply_bus()

func _stream(id: String) -> AudioStream:
	if not streams.has(id):
		var s = load(TRACKS[id]) if ResourceLoader.exists(TRACKS[id]) else null
		if s is AudioStreamOggVorbis: s.loop = true   # (also set on import, with the loop offset)
		streams[id] = s
	return streams[id]

func _has(id: String) -> bool:
	return id != "" and TRACKS.has(id) and _stream(id) != null

# the track this moment wants (see the table at the top)
func _wanted() -> String:
	if game == null: return "day"
	var c = game.get("cast")
	var area := String(c.get("area")) if c != null and c.get("area") != null else "town"
	if BattleArena.I != null: area = "arena"
	# a battle
	var b = Battle.current
	if b != null:
		if _battle_area == "": _battle_area = area
		var bt := String(BATTLE_TRACK.get(_battle_area, ""))
		if _has(bt): return bt
	else:
		_battle_area = ""
	# a talk with someone who has a theme
	if c != null and c.get("convo") != null and c.convo.active:
		var tt := String(TALK_TRACK.get(c.convo.who, ""))
		if _has(tt): return tt
	# a room with its own song
	var inside: bool = bool(game.get("indoors"))
	var it = game.get("interior")
	if inside and it != null:
		var id := String(it.name).trim_prefix("Interior_")
		for k in ROOM_TRACK:
			if id.contains(k) and _has(String(ROOM_TRACK[k])): return String(ROOM_TRACK[k])
	if not inside and TRACKS.has("bike") and c != null and c.get("bike") != null and c.bike.riding() and _stream("bike") != null: return "bike"
	var h := 12.0
	if c != null and c.get("clock") != null: h = c.clock.hour()
	var per := GameClock.period_of(h)
	if area == "route1" or area == "viridian_gate":
		var rt := String(ROUTE_TRACK.get(per, ""))
		if _has(rt): return rt
	# the town: its theme and the second song, taking turns
	var main := String(PERIOD_TRACK[per])
	var alt := String(TOWN_ALT.get(per, ""))
	if not _has(alt): return main
	var key := main + "|" + alt
	if track != main and track != alt and not turn.has(key): turn[key] = 0
	return alt if int(turn.get(key, 0)) % 2 == 1 else main

func _outdoor(id: String) -> bool:
	return PERIOD_TRACK.values().has(id) or TOWN_ALT.values().has(id) or ROUTE_TRACK.values().has(id)

# the town's two songs take turns: one full pass of the file, then the other
func _turn_over() -> bool:
	if track == "" or cur < 0: return false
	var s = _stream(track)
	if s == null: return false
	for key in turn:
		var pair: PackedStringArray = String(key).split("|")
		if pair.has(track) and played >= s.get_length() - DAY_FADE:
			turn[key] = 1 - pair.find(track)
			return true
	return false

func play(id: String, fade := DOOR_FADE) -> void:
	if id == track or not enabled: return
	var s := _stream(id)
	if s == null: return
	var old := cur
	cur = 1 - cur if cur >= 0 else 0
	var p := players[cur]
	p.stream = s
	ptrack[cur] = id
	p.play(0.0)
	played = 0.0
	_amps[cur] = 0.0
	fades[cur] = {"from": 0.0, "to": 1.0, "t": 0.0, "len": fade, "stop": false}
	if old >= 0 and players[old].playing:
		fades[old] = {"from": _amps[old], "to": 0.0, "t": 0.0, "len": fade, "stop": true}
	track = id

var _amps := [0.0, 0.0]

func _process(dt: float) -> void:
	if game == null: return
	if enabled:
		if cur >= 0 and players[cur].playing and not players[cur].stream_paused: played += dt
		var handover := _turn_over()
		var w := _wanted()
		if w != track:
			# into a battle at once; the day turning and the town's handovers slowly;
			# doors are quick
			var fade := DOOR_FADE
			if Battle.current != null and BATTLE_TRACK.values().has(w): fade = BATTLE_FADE
			elif handover or (_outdoor(w) and _outdoor(track)): fade = DAY_FADE
			play(w, fade)
	# ducking under dialog, muffling inside other buildings
	var c = game.get("cast")
	var talking := c != null and c.get("dialog") != null and bool(c.dialog.open)
	duck = move_toward(duck, 1.0 if talking else 0.0, dt / 0.35)
	var inside_other := bool(game.get("indoors")) and not ROOM_TRACK.values().has(track) and not TALK_TRACK.values().has(track) and not BATTLE_TRACK.values().has(track)
	muffle = move_toward(muffle, 1.0 if inside_other else 0.0, dt / 0.6)
	if lp: lp.cutoff_hz = lerpf(20000.0, 900.0, pow(muffle, 0.5))
	for i in players.size():
		var f: Dictionary = fades[i]
		if not f.is_empty():
			f.t += dt
			var k := clampf(f.t / maxf(f.len, 0.01), 0.0, 1.0)
			# equal power: in on a sine, out on a cosine (-3 dB each mid way)
			if f.to > f.from: _amps[i] = f.from + (f.to - f.from) * sin(k * PI * 0.5)
			else: _amps[i] = f.to + (f.from - f.to) * cos(k * PI * 0.5)
			if k >= 1.0:
				if f.stop: players[i].stop(); _amps[i] = 0.0
				fades[i] = {}
		var base: float = TRACK_DB.get(ptrack[i], 0.0)
		players[i].volume_db = linear_to_db(maxf(_amps[i], 0.0001)) + base + DUCK_DB * duck - 6.0 * muffle

func _apply_bus() -> void:
	if bus_idx < 0: return
	var v := clampf(vol, 0.0, 1.0)
	AudioServer.set_bus_mute(bus_idx, not enabled or v <= 0.001)
	# a gentle curve: 0.7 is about -6 dB, 0.3 about -21 dB
	AudioServer.set_bus_volume_db(bus_idx, linear_to_db(pow(v, 1.7)) if v > 0.001 else -80.0)

func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT:
			for p in players: p.stream_paused = true
		NOTIFICATION_APPLICATION_RESUMED, NOTIFICATION_APPLICATION_FOCUS_IN:
			for p in players: p.stream_paused = false
