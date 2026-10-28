class_name Sfx
extends Node
# Sound effects (created by main.gd, like music.gd; no autoload): the library
# in res://audio/sfx/ (catalog.json + <category>/<name>_<n>.ogg, built by
# tools/sfx/build.py) played through pooled players, and ambience beds that
# fade in and out. Generic: nothing here knows about Pallet Town; the town's
# use of it (footsteps by surface, ambience by place, doors, creatures) is
# sfx_world.gd.
#
#   Sfx.play(id)                     a one-shot, 2D (UI, the player's own steps)
#   Sfx.play(id, pos)                a one-shot at a point in the world (3D)
#   Sfx.play(id, pos, {"vol": -6.0, "pitch": 1.1})   dB offset, pitch multiplier
#   Sfx.ui(id)                       a menu sound (off with the "UI sounds" setting)
#   Sfx.bed(key, id, amount, pos)    a looping bed under `key`: amount 0..1 is
#                                    faded to (0 stops it once faded out); pos =
#                                    null for a 2D bed, a Vector3 for a 3D one
#                                    (call again to move it)
#   Sfx.stop_beds(fade)              every bed fades out (a change of space)
#   Sfx.set_space(indoor)            the reverb and the outdoor beds' muffle
#   Sfx.has(id), Sfx.length(id)
#
# Each catalog entry: files (variants, picked at random, never the same one
# twice in a row), vol (dB), pitch [lo, hi] (random), vjit (dB of random
# volume), mode "2d" | "3d", dist (3D max distance, m), unit (3D unit size),
# loop, voices (most at once of this id; the oldest is cut), bus (SFX | UI |
# Ambience), gap (s: a repeat sooner than this is skipped).
# Buses made at run time (no bus layout file): SFX, UI and Ambience into
# Master. SFX carries a light reverb (more indoors); Ambience a low-pass that
# closes indoors. Settings: sfx_vol, amb_vol, ui_sfx. Everything pauses with
# the app in the background.
# Cheap at 120 fps: fixed pools (2D and 3D), voices counted by scanning the
# pool, streams loaded on a background thread at start.

const CATALOG := "res://audio/sfx/catalog.json"
const N2D := 14
const N3D := 28
const NO_OPTS := {}

static var I: Sfx = null

var defs := {}                 # id -> Dictionary (catalog entry + runtime fields)
var streams := {}              # path -> AudioStream
var p2: Array[AudioStreamPlayer] = []
var p3: Array[AudioStreamPlayer3D] = []
var id2: Array[String] = []    # the id each pooled player holds
var id3: Array[String] = []
var t2 := PackedFloat64Array() # when each started (for stealing the oldest)
var t3 := PackedFloat64Array()
var beds := {}                 # key -> {p, id, amp, target, rate, d3}
var bus := {}                  # name -> index
var reverb: AudioEffectReverb
var amb_lp: AudioEffectLowPassFilter
var indoor := false
var _muffle := 0.0
var _clock := 0.0
var rng := RandomNumberGenerator.new()
var ui_on := true
var stats := {"played": 0, "stolen": 0, "skipped": 0}

static func play(id: String, pos = null, opts: Dictionary = NO_OPTS) -> Node:
	return I._play(id, pos, opts) if I != null else null

static func ui(id: String) -> void:
	if I != null and I.ui_on: I._play(id, null, NO_OPTS)

static func bed(key: String, id: String, amount: float, pos = null, fade := 1.5) -> void:
	if I != null: I._bed(key, id, amount, pos, fade)

# the pitch of a running bed (the bike's whir follows its speed)
static func bed_pitch(key: String, pitch: float) -> void:
	if I and I.beds.has(key): I.beds[key].p.pitch_scale = maxf(pitch, 0.05)

static func stop_beds(fade := 0.6) -> void:
	if I == null: return
	for k in I.beds: I.beds[k].target = 0.0; I.beds[k].rate = 1.0 / maxf(fade, 0.01)

static func set_space(indoors: bool) -> void:
	if I != null: I.indoor = indoors

static func has(id: String) -> bool:
	return I != null and I.defs.has(id)

static func length(id: String) -> float:
	if I == null or not I.defs.has(id): return 0.0
	var s := I._stream(I.defs[id].files[0])
	return s.get_length() if s else 0.0

func setup() -> void:
	I = self
	name = "Sfx"
	process_mode = Node.PROCESS_MODE_ALWAYS   # the menu's sounds play while the game is paused
	rng.randomize()
	_buses()
	_load_catalog()
	for i in N2D:
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		p2.append(p); id2.append(""); t2.append(-1.0)
	for i in N3D:
		var q := AudioStreamPlayer3D.new()
		q.bus = "SFX"
		q.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		q.panning_strength = 0.7
		q.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_DISABLED
		q.attenuation_filter_cutoff_hz = 6000.0
		q.attenuation_filter_db = -12.0
		add_child(q)
		p3.append(q); id3.append(""); t3.append(-1.0)
	for k in ["sfx_vol", "amb_vol", "ui_sfx"]: _on_setting(k, Settings.get_value(k))
	Settings.changed.connect(_on_setting)

func _exit_tree() -> void:
	if I == self: I = null

# ---------- buses ----------
func _mk_bus(n: String) -> int:
	var i := AudioServer.get_bus_index(n)
	if i == -1:
		AudioServer.add_bus()
		i = AudioServer.bus_count - 1
		AudioServer.set_bus_name(i, n)
		AudioServer.set_bus_send(i, "Master")
	return i

func _buses() -> void:
	for n in ["SFX", "UI", "Ambience"]: bus[n] = _mk_bus(n)
	if AudioServer.get_bus_effect_count(bus.SFX) == 0:
		reverb = AudioEffectReverb.new()
		reverb.room_size = 0.35; reverb.damping = 0.6; reverb.spread = 0.8
		reverb.dry = 1.0; reverb.wet = 0.04; reverb.hipass = 0.15
		AudioServer.add_bus_effect(bus.SFX, reverb)
	else: reverb = AudioServer.get_bus_effect(bus.SFX, 0) as AudioEffectReverb
	if AudioServer.get_bus_effect_count(bus.Ambience) == 0:
		amb_lp = AudioEffectLowPassFilter.new()
		amb_lp.cutoff_hz = 20000.0
		AudioServer.add_bus_effect(bus.Ambience, amb_lp)
	else: amb_lp = AudioServer.get_bus_effect(bus.Ambience, 0) as AudioEffectLowPassFilter

func _on_setting(key: String, v) -> void:
	match key:
		"sfx_vol": _bus_vol("SFX", float(v)); _bus_vol("UI", float(v))
		"amb_vol": _bus_vol("Ambience", float(v))
		"ui_sfx": ui_on = int(v) == 1

func _bus_vol(n: String, v: float) -> void:
	var i: int = bus[n]
	AudioServer.set_bus_mute(i, v <= 0.001)
	AudioServer.set_bus_volume_db(i, linear_to_db(pow(clampf(v, 0.0, 1.0), 1.7)) if v > 0.001 else -80.0)

# ---------- the catalog ----------
func _load_catalog() -> void:
	if not FileAccess.file_exists(CATALOG):
		push_warning("sfx: no catalog"); return
	var d = JSON.parse_string(FileAccess.get_file_as_string(CATALOG))
	if typeof(d) != TYPE_DICTIONARY: return
	# the world editor's changes (res://tunables/sfx.json sounds.<id>: vol, pitch, vjit, dist, voices, gap...)
	var ov = preload("res://tunables.gd").file("sfx").get("sounds", {})
	for e in d.sounds:
		if ov is Dictionary and ov.get(e.id) is Dictionary: for k in ov[e.id]: e[k] = ov[e.id][k]
		var files: Array[String] = []
		for f in e.files: files.append("res://audio/sfx/" + String(f))
		var p: Array = e.get("pitch", [1.0, 1.0])
		defs[String(e.id)] = {
			"files": files, "vol": float(e.get("vol", 0.0)), "pitch": Vector2(float(p[0]), float(p[1])),
			"vjit": float(e.get("vjit", 1.0)), "d3": String(e.get("mode", "2d")) == "3d", "dist": float(e.get("dist", 30.0)),
			"unit": float(e.get("unit", 3.0)), "loop": bool(e.get("loop", false)), "voices": int(e.get("voices", 4)),
			"bus": String(e.get("bus", "SFX")), "gap": float(e.get("gap", 0.0)), "last": -1, "at": -100.0,
		}
		for f in files: ResourceLoader.load_threaded_request(f, "AudioStream")

func _stream(path: String) -> AudioStream:
	if streams.has(path): return streams[path]
	var s: AudioStream = null
	if ResourceLoader.load_threaded_get_status(path) != ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
		s = ResourceLoader.load_threaded_get(path)
	if s == null and ResourceLoader.exists(path): s = load(path)
	streams[path] = s
	return s

func _pick(d: Dictionary) -> AudioStream:
	var n: int = d.files.size()
	var k := 0
	if n > 1:
		k = rng.randi() % (n - 1)
		if k >= int(d.last): k += 1   # never the one just played
	d.last = k
	var s := _stream(d.files[k])
	if s is AudioStreamOggVorbis and s.loop != bool(d.loop): s.loop = d.loop
	return s

# ---------- one-shots ----------
func _play(id: String, pos, opts: Dictionary) -> Node:
	var d: Dictionary = defs.get(id, {})
	if d.is_empty():
		push_warning("sfx: no sound " + id); return null
	if d.gap > 0.0 and _clock - float(d.at) < d.gap:
		stats.skipped += 1; return null
	var s := _pick(d)
	if s == null: return null
	d.at = _clock
	var vol: float = d.vol + rng.randf_range(-d.vjit, d.vjit) * 0.5 + float(opts.get("vol", 0.0))
	var pit: float = rng.randf_range(d.pitch.x, d.pitch.y) * float(opts.get("pitch", 1.0))
	var b: String = opts.get("bus", d.bus)
	stats.played += 1
	if pos is Vector3 and d.d3:
		var i := _slot(p3, id3, t3, id, d.voices)
		var q := p3[i]
		q.stream = s; q.bus = b
		q.global_position = pos
		q.max_distance = float(opts.get("dist", d.dist))
		q.unit_size = float(opts.get("unit", d.unit))
		q.volume_db = vol; q.pitch_scale = pit
		q.play()
		id3[i] = id; t3[i] = _clock
		return q
	var j := _slot(p2, id2, t2, id, d.voices)
	var p := p2[j]
	p.stream = s; p.bus = b
	p.volume_db = vol; p.pitch_scale = pit
	p.play()
	id2[j] = id; t2[j] = _clock
	return p

# a player for this sound: a free one, else the oldest of this id once it
# has its most voices, else the oldest of all
func _slot(pool: Array, ids: Array[String], ts: PackedFloat64Array, id: String, voices: int) -> int:
	var same := 0
	var old_same := -1
	var free := -1
	var oldest := 0
	for i in pool.size():
		var busy: bool = pool[i].playing
		if not busy:
			if free == -1: free = i
			continue
		if ids[i] == id:
			same += 1
			if old_same == -1 or ts[i] < ts[old_same]: old_same = i
		if ts[i] < ts[oldest] or not pool[oldest].playing: oldest = i
	if same >= voices and old_same >= 0:
		stats.stolen += 1; return old_same
	if free >= 0: return free
	stats.stolen += 1
	return oldest

# ---------- beds (loops that fade) ----------
func _bed(key: String, id: String, amount: float, pos, fade: float) -> void:
	var b: Dictionary = beds.get(key, {})
	if b.is_empty():
		if amount <= 0.001 or not defs.has(id): return
		var d: Dictionary = defs[id]
		var p: Node
		if pos is Vector3:
			var q := AudioStreamPlayer3D.new()
			q.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
			q.max_distance = d.dist; q.unit_size = d.unit
			q.panning_strength = 0.6
			q.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_DISABLED
			p = q
		else:
			p = AudioStreamPlayer.new()
		p.bus = d.bus
		add_child(p)
		var s := _pick(d)
		if s is AudioStreamOggVorbis: s.loop = true
		p.stream = s
		p.volume_db = -80.0
		b = {"p": p, "id": id, "amp": 0.0, "target": 0.0, "rate": 1.0, "vol": d.vol, "d3": pos is Vector3}
		beds[key] = b
		# start somewhere inside the loop, so two beds of one file never line up
		p.play(rng.randf() * maxf(0.0, s.get_length() - 0.1) if s else 0.0)
	b.target = clampf(amount, 0.0, 1.0)
	b.rate = 1.0 / maxf(fade, 0.01)
	if pos is Vector3 and b.d3: (b.p as Node3D).global_position = pos

func _process(dt: float) -> void:
	_clock += dt
	# the space: a roomier reverb and muffled outdoor beds inside
	_muffle = move_toward(_muffle, 1.0 if indoor else 0.0, dt / 0.5)
	if reverb:
		reverb.wet = lerpf(0.04, 0.16, _muffle)
		reverb.room_size = lerpf(0.3, 0.5, _muffle)
	if amb_lp: amb_lp.cutoff_hz = lerpf(20000.0, 1200.0, pow(_muffle, 0.5))
	var gone := ""
	for k in beds:
		var b: Dictionary = beds[k]
		b.amp = move_toward(b.amp, b.target, dt * b.rate)
		var p = b.p
		p.volume_db = linear_to_db(maxf(b.amp, 0.0001)) + b.vol
		if b.amp <= 0.0 and b.target <= 0.0: gone = k
	if gone != "":   # one a frame is plenty
		beds[gone].p.queue_free()
		beds.erase(gone)

func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT:
			_pause_all(true)
		NOTIFICATION_APPLICATION_RESUMED, NOTIFICATION_APPLICATION_FOCUS_IN:
			_pause_all(false)

func _pause_all(on: bool) -> void:
	for p in p2: p.stream_paused = on
	for q in p3: q.stream_paused = on
	for k in beds: beds[k].p.stream_paused = on
