class_name BikeAudio
extends Node
# The bicycle's own sounds under Ash (bike.gd sets the fields each frame): made in
# code at start as short seamless loops (no files), then only their volume and
# pitch move, so it costs next to nothing a frame:
#   roll_*   the tyres on the ground: gravel crunch on the paths, a soft swish on
#            grass, a heavy hiss in sand, a smooth hum on stone and wood
#   chain    the chain's whir as he pedals (pitched by the cadence)
#   free     the freewheel's ticking as he coasts (pitched by the wheel)
#   squeal   the brake on a hard stop, with the tyre scrubbing (scrub)
#   wind     the air at speed
#   water    riding in the water: a soft, low swish of the tyres through it (filtered
#            noise with slow swells and a few soft bubbles, nothing hissy), louder with
#            speed and depth; the splashes, sloshes and drips are bike_water.gd's
# plus one-shots from the sound library: the bell, the recorded freewheel now and
# then while coasting, plank thumps on the pier and bridges, the landing's clunk.
# Everything plays on the SFX bus (the Sound effects volume).

const RATE := 22050
const LOOPS := ["roll_dirt", "roll_grass", "roll_sand", "roll_hard", "chain", "free", "squeal", "scrub", "wind", "water"]

var players := {}        # name -> AudioStreamPlayer
var loaded := false
var _task := -1
var _bufs := {}
var _mx := Mutex.new()
# set by bike.gd each frame
var speed := 0.0         # m/s
var surface := "dirt"
var cadence := 0.0       # crank turns a second (0 coasting)
var coasting := false
var skid := 0.0          # 0..1
var wheel_rps := 0.0     # wheel turns a second
var active := false      # riding (else everything fades out)
var flow := 0.0          # 0..1 the steady-riding speed-up (bike.gd): more air, a little higher
var water := 0.0         # 0..1 the water at the tyres (0 dry .. 1 a quarter metre deep)
var _lvl := {}
var _quiet := false

func _ready() -> void:
	name = "BikeAudio"
	for n in LOOPS: _lvl[n] = 0.0
	_task = WorkerThreadPool.add_task(_make_all, false, "bike sounds")

func _exit_tree() -> void:
	if _task >= 0: WorkerThreadPool.wait_for_task_completion(_task); _task = -1

# ---------- the loops, made on a worker thread ----------
func _make_all() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var out := {}
	out.roll_dirt = _noise_loop(rng, 1.6, 380.0, 0.85, 26.0, 1400.0, 0.45)
	out.roll_grass = _noise_loop(rng, 1.6, 300.0, 0.9, 8.0, 1100.0, 0.2)
	out.roll_sand = _noise_loop(rng, 1.6, 260.0, 0.95, 40.0, 900.0, 0.4)
	out.roll_hard = _noise_loop(rng, 1.6, 520.0, 0.8, 3.0, 1600.0, 0.1)
	out.wind = _noise_loop(rng, 3.0, 170.0, 1.0, 0.0, 0.0, 0.0)
	out.scrub = _noise_loop(rng, 1.0, 1400.0, 0.8, 120.0, 3200.0, 0.5)
	out.chain = _chain_loop(rng)
	out.free = _click_loop(rng)
	out.squeal = _squeal_loop()
	out.water = _water_loop(rng)
	_mx.lock()
	_bufs = out
	_mx.unlock()

static func _pcm(f: PackedFloat32Array) -> PackedByteArray:
	var b := PackedByteArray()
	b.resize(f.size() * 2)
	for i in f.size(): b.encode_s16(i * 2, int(clampf(f[i], -1.0, 1.0) * 32000.0))
	return b

# noise through a two-pole low-pass at fc (q: resonance 0..1), with grains: short
# bright bursts (rate a second, bright: their band) at gamt; the ends crossfaded
static func _noise_loop(rng: RandomNumberGenerator, secs: float, fc: float, q: float, grains: float, bright: float, gamt: float) -> PackedFloat32Array:
	var n := int(secs * RATE)
	var fade := int(0.12 * RATE)
	var total := n + fade
	var raw := PackedFloat32Array()
	raw.resize(total)
	var f := 2.0 * sin(PI * fc / RATE)
	var damp := 1.0 - q * 0.75
	var lo := 0.0
	var bp := 0.0
	var g_env := 0.0
	var g_lo := 0.0
	var g_bp := 0.0
	var gf := 2.0 * sin(PI * minf(bright, RATE * 0.2) / RATE)
	var peak := 1e-6
	for i in total:
		var x := rng.randf() * 2.0 - 1.0
		var hp := x - lo - damp * bp
		bp += f * hp
		lo += f * bp
		var s := lo
		if grains > 0.0:
			if rng.randf() < grains / RATE: g_env = rng.randf_range(0.4, 1.0)
			g_env *= 0.9965
			var y := (rng.randf() * 2.0 - 1.0) * g_env
			var ghp := y - g_lo - 0.6 * g_bp
			g_bp += gf * ghp
			g_lo += gf * g_bp
			s += g_bp * gamt
		raw[i] = s
		peak = maxf(peak, absf(s))
	var o := PackedFloat32Array()
	o.resize(n)
	for i in n:
		var v := raw[i]
		if i < fade:
			var k := float(i) / fade
			v = raw[i] * k + raw[n + i] * (1.0 - k)
		o[i] = v / peak * 0.8
	return o

# the chain's whir: a buzz at the links' rate (38 links a crank turn at 1 turn a second,
# pitched up by the cadence), with each pedal stroke's push in its loudness
static func _chain_loop(rng: RandomNumberGenerator) -> PackedFloat32Array:
	var n := RATE   # one second = one crank turn: 38 links, 2 strokes
	var o := PackedFloat32Array()
	o.resize(n)
	var lo := 0.0
	var bp := 0.0
	var f := 2.0 * sin(PI * 520.0 / RATE)
	for i in n:
		var t := float(i) / RATE
		var ph := fmod(t * 38.0, 1.0)
		var tick := exp(-ph * 9.0) * (rng.randf() * 2.0 - 1.0)
		var hp := tick - lo - 0.35 * bp
		bp += f * hp
		lo += f * bp
		var stroke := 0.65 + 0.35 * absf(sin(t * PI * 2.0))
		o[i] = (bp * 0.9 + lo * 0.35 + tick * 0.04) * stroke
	return _norm(o, 0.7)

# the freewheel's pawls: sharp ticks, 60 a second at pitch 1 (pitched by the wheel)
static func _click_loop(rng: RandomNumberGenerator) -> PackedFloat32Array:
	var n := RATE / 2
	var o := PackedFloat32Array()
	o.resize(n)
	var per := float(RATE) / 60.0
	for i in n:
		var ph := fmod(float(i), per)
		var e := exp(-ph / (RATE * 0.0016))
		var ring := sin(ph / RATE * TAU * 3900.0) * 0.8 + sin(ph / RATE * TAU * 6100.0) * 0.4
		o[i] = (ring + (rng.randf() * 2.0 - 1.0) * 0.5) * e
	return _norm(o, 0.75)

# the brake's squeal: two partials with a quick vibrato (whole cycles: seamless)
static func _squeal_loop() -> PackedFloat32Array:
	var n := RATE / 2
	var o := PackedFloat32Array()
	o.resize(n)
	var ph1 := 0.0
	var ph2 := 0.0
	for i in n:
		var t := float(i) / RATE
		var vib := sin(t * TAU * 8.0) * 0.012
		ph1 += TAU * 2300.0 * (1.0 + vib) / RATE
		ph2 += TAU * 4630.0 * (1.0 + vib) / RATE
		o[i] = sin(ph1) * 0.7 + sin(ph2) * 0.25 + sin(ph1 * 0.5) * 0.08
	return _norm(o, 0.6)

# the tyres through water: soft brown-ish noise under 700 Hz, swelling twice a loop like
# the water piling up and falling off the wheel, a few soft low bubbles; the ends
# crossfaded so it never clicks
static func _water_loop(rng: RandomNumberGenerator) -> PackedFloat32Array:
	var n := int(2.4 * RATE)
	var o := PackedFloat32Array()
	o.resize(n)
	var lo := 0.0
	var bp := 0.0
	var f := 2.0 * sin(PI * 520.0 / RATE)
	var lo2 := 0.0
	var f2 := 2.0 * sin(PI * 160.0 / RATE)
	var bub := 0.0
	var bph := 0.0
	var bfr := 300.0
	for i in n:
		var t := float(i) / n
		var x := rng.randf() * 2.0 - 1.0
		var hp := x - lo - 0.55 * bp
		bp += f * hp
		lo += f * bp
		lo2 += f2 * (x - lo2)
		var swell := 0.62 + 0.38 * (0.5 - 0.5 * cos(t * TAU * 2.0)) * (0.8 + 0.2 * sin(t * TAU * 3.0))
		if bub < 0.01 and rng.randf() < 9.0 / RATE:
			bub = rng.randf_range(0.25, 0.6)
			bfr = rng.randf_range(220.0, 420.0)
		bub *= 0.9988
		bph += TAU * bfr * (1.0 + (0.6 - bub) * 0.5) / RATE
		o[i] = (lo * 0.75 + lo2 * 0.9) * swell + sin(bph) * bub * 0.12
	# seamless: fade the start over the end
	var fade := int(0.2 * RATE)
	for i in fade:
		var k := float(i) / fade
		o[i] = o[i] * k + o[n - fade + i] * (1.0 - k)
	o.resize(n - fade)
	return _norm(o, 0.7)

static func _norm(o: PackedFloat32Array, to: float) -> PackedFloat32Array:
	var peak := 1e-6
	for v in o: peak = maxf(peak, absf(v))
	for i in o.size(): o[i] = o[i] / peak * to
	return o

func _build_players() -> void:
	for n in _bufs:
		var w := AudioStreamWAV.new()
		w.format = AudioStreamWAV.FORMAT_16_BITS
		w.mix_rate = RATE
		w.stereo = false
		w.data = _pcm(_bufs[n])
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_begin = 0
		w.loop_end = (_bufs[n] as PackedFloat32Array).size()
		var p := AudioStreamPlayer.new()
		p.stream = w
		p.bus = "SFX" if AudioServer.get_bus_index("SFX") >= 0 else "Master"
		p.volume_db = -80.0
		add_child(p)
		players[n] = p
	_bufs = {}
	loaded = true

# ---------- the frame ----------
func _process(dt: float) -> void:
	if not loaded:
		if _task >= 0 and WorkerThreadPool.is_task_completed(_task):
			WorkerThreadPool.wait_for_task_completion(_task)
			_task = -1
			_build_players()
		return
	if not active and _quiet: return   # (off the bike: nothing to do until he rides again)
	var v := speed if active else 0.0
	var on := clampf(v / 1.2, 0.0, 1.0)
	var vk := clampf(v / 14.0, 0.0, 1.3)   # (cruise is 13.5)
	var surf_map := {"dirt": "roll_dirt", "sand": "roll_sand", "grass": "roll_grass", "tallgrass": "roll_grass", "stone": "roll_hard", "wood": "roll_hard", "water": "water"}
	var roll: String = surf_map.get(surface, "roll_dirt")
	var want := {}
	for n in LOOPS: want[n] = 0.0
	var rv := on * (0.25 + 0.75 * pow(vk, 0.9))
	if skid > 0.0: rv *= 1.0 - skid * 0.6
	if roll != "water": want[roll] = rv * (1.15 if roll == "roll_sand" else 1.0) * (1.0 - water)
	want.water = (on * clampf(v / 7.0, 0.0, 1.0) * (0.35 + 0.65 * water)) if active and water > 0.02 else 0.0
	want.chain = (0.0 if coasting or not active else clampf(cadence / 0.6, 0.0, 1.0)) * 0.35
	want.free = (on * clampf(wheel_rps / 1.0, 0.0, 1.0) * 0.6) if coasting and active and skid < 0.1 else 0.0
	want.squeal = skid * clampf(v / 3.0, 0.0, 1.0)
	want.scrub = skid * clampf(v / 2.0, 0.0, 1.0) * 0.9
	want.wind = minf(1.0, clampf((v - 2.0) / 12.0, 0.0, 1.0) * 0.85 + flow * 0.2) if active else 0.0
	# just the ratchet's soft clicks coasting and a subtle rush of wind; the tyres and chain
	# barely there (any rolling hiss read as a vacuum cleaner)
	var base_db := {"roll_dirt": -42.0, "roll_grass": -44.0, "roll_sand": -40.0, "roll_hard": -45.0, "chain": -40.0, "free": -36.0, "squeal": -20.0, "scrub": -22.0, "wind": -19.0, "water": -27.0}
	_quiet = true
	for n in LOOPS:
		var p: AudioStreamPlayer = players[n]
		var k: float = _lvl[n]
		var w: float = want[n]
		k += (w - k) * (1.0 - exp(-dt * (14.0 if w > k else 6.0)))
		_lvl[n] = k
		if k < 0.003:
			if p.playing: p.stop()
			continue
		_quiet = false
		if not p.playing: p.play(randf() * 0.5)
		p.volume_db = base_db[n] + linear_to_db(k)
		match n:
			"chain": p.pitch_scale = clampf(maxf(cadence, 0.2), 0.3, 3.0)
			"free": p.pitch_scale = clampf(wheel_rps * 24.0 / 60.0, 0.5, 2.5)
			"wind": p.pitch_scale = 0.85 + vk * 0.22 + flow * 0.06
			"water": p.pitch_scale = 0.8 + vk * 0.2 + water * 0.05
			"squeal": p.pitch_scale = 0.96 + v * 0.01
			_: if n.begins_with("roll"): p.pitch_scale = 0.85 + vk * 0.15

func stop_all() -> void:
	active = false
	speed = 0.0
