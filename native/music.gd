extends Node
# Background music (created by main.gd).
#
# The town's soundtrack is one song in five versions, one per part of the day
# (GameClock.period_of), built by tools/music/ost.py from the recording in
# tools/music/sources/ into res://audio/music/pallet_ost_*.ogg. Each file
# loops on import (an intro plays once, then the loop body):
#
#   dawn     pallet_ost_dawn.ogg      5-7 AM     92 bpm, piano and pads waking up
#   morning  pallet_ost_morning.ogg   7-11 AM    light percussion, bright
#   day      pallet_ost_day.ogg       11 AM-6 PM the full song, long form
#   evening  pallet_ost_evening.ogg   6-9 PM     100 bpm, soft drums, warm
#   night    pallet_ost_night.ogg     9 PM-5 AM  82 bpm, no drums, dark and roomy
#   lab      oak_lab.ogg              "Curious Minds", inside Professor Oak's lab
#
# The orchestral town themes (tools/music/build.py: "Hometown by the Sea" and
# "Evening Tide") are kept as town_orch / night_orch: play(id) takes them, but
# the town no longer asks for them.
#
# Two players crossfade (1.5 s through a door, 6 s when the part of the day
# changes). The music bus "Music" is made at run time (no project setting) and
# carries a low-pass that closes when the town theme plays inside a building
# other than the lab, as if heard through the walls. The music dips a little
# while a dialog box is open and pauses while the app is in the background.
# Settings: "music" (on / off), "music_vol" (0..1).
# Orchestral samples: VSCO 2 Community Edition, Versilian Studios (Sam Gossner,
# Simon Dalzell), free for any use; scores and mix: tools/music/.

const TRACKS0 := {
	"dawn": "res://audio/music/pallet_ost_dawn.ogg",
	"morning": "res://audio/music/pallet_ost_morning.ogg",
	"day": "res://audio/music/pallet_ost_day.ogg",
	"evening": "res://audio/music/pallet_ost_evening.ogg",
	"night": "res://audio/music/pallet_ost_night.ogg",
	"lab": "res://audio/music/oak_lab.ogg",
	"town_orch": "res://audio/music/pallet_town.ogg",
	"night_orch": "res://audio/music/pallet_town_night.ogg",
}
# the town's version for each part of the day (clock.gd periods)
const PERIOD_TRACK0 := {"dawn": "dawn", "morning": "morning", "midday": "day", "afternoon": "day", "evening": "evening", "night": "night"}
const TRACK_DB0 := {"lab": -0.5, "night_orch": -1.5}   # the town versions are levelled in the files
# the world editor's tunables (res://tunables/music.json) over these
const T := preload("res://tunables.gd")
var TRACKS := T.dict("music", "tracks", TRACKS0)
var PERIOD_TRACK := T.dict("music", "period_track", PERIOD_TRACK0)
var TRACK_DB := T.dict("music", "track_db", TRACK_DB0)
var DOOR_FADE := T.num("music", "door_fade", 1.5)
var DAY_FADE := T.num("music", "day_fade", 6.0)
var DUCK_DB := T.num("music", "duck_db", -4.5)
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

func setup(g: Node) -> void:
	game = g
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

# the track this moment wants: the lab inside Oak's lab; outdoors (and in
# other buildings) the town's version for this part of the day
func _wanted() -> String:
	if game == null: return "day"
	var inside: bool = bool(game.get("indoors"))
	var it = game.get("interior")
	if inside and it != null and String(it.name).contains("oak_lab"): return "lab"
	var h := 12.0
	var c = game.get("cast")
	if c != null and c.get("clock") != null: h = c.clock.hour()
	return PERIOD_TRACK[GameClock.period_of(h)]

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
	_amps[cur] = 0.0
	fades[cur] = {"from": 0.0, "to": 1.0, "t": 0.0, "len": fade, "stop": false}
	if old >= 0 and players[old].playing:
		fades[old] = {"from": _amps[old], "to": 0.0, "t": 0.0, "len": fade, "stop": true}
	track = id

var _amps := [0.0, 0.0]

func _process(dt: float) -> void:
	if game == null: return
	if enabled:
		var w := _wanted()
		if w != track:
			# the day turning comes in slowly; doors are quick
			var slow := PERIOD_TRACK.values().has(w) and PERIOD_TRACK.values().has(track)
			play(w, DAY_FADE if slow else DOOR_FADE)
	# ducking under dialog, muffling inside other buildings
	var c = game.get("cast")
	var talking := c != null and c.get("dialog") != null and bool(c.dialog.open)
	duck = move_toward(duck, 1.0 if talking else 0.0, dt / 0.35)
	var inside_other := bool(game.get("indoors")) and track != "lab"
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
