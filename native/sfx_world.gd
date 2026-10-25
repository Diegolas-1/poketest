extends Node
# The town's sounds (created by main.gd after sfx.gd; sfx.gd plays them):
#   footsteps   the player's (2D) and the townspeople's (3D, quieter) on the
#               surface under them (surface_at: grass, dirt, sand, stone,
#               wood, water, tall grass outdoors; tile and metal inside), one
#               per foot down (CastActor.steps); a run uses the harder set;
#               jumps and landings per surface; plants brushed through rustle
#   ambience    by place and time of day: wind (stronger up on the lab's hill),
#               the sea (a bed at the nearest point of the sea, shore lapping
#               close to it), the stream and the pond (a bed at the nearest
#               fresh water), birds scattered by day, gulls by the coast,
#               crickets, frogs and an owl at night, a dog now and then, wind
#               chimes on the porches, the farm's hens, the lab's windmill,
#               the pier bell at six and at six; inside, each machine, tank,
#               vent, panel light and clock of the space hums or ticks where
#               it stands
#   doors       the lab's sliding door (enter / leave), the houses' doors as
#               people go in and out (life.gd door_sound)
#   things      what you look at or read (on_use: computers, tanks, shelves,
#               boards, mailboxes, signs, the well, doors you knock at)
#   creatures   the companions' footfalls, chirps and honks, hops and pecks
#
# main.gd: sfx_world.setup(game) once; update(dt) every frame (cheap: the
# ambience is looked at ten times a second; footsteps only count steps).

const POND := Vector2(-50.0, 40.0)
const STAIRS := Rect2(19.1, 14.0, 27.7, 4.0)    # the stone staircase up to the lab (x, z, w, d)
const WINDMILL := Vector3(72.0, 33.0, 13.0)     # on the lab's tower
const PIER_BELL := Vector3(-4.0, 1.5, 66.0)
const FARM_YARD := Vector2(-64.0, 27.0)
const CHIME_PORCHES := ["mae", "lily"]
# interior floors: the default material, per level (stairs follow the level they rise to)
const INTERIOR_FLOORS := {"oak_lab": {"default": "tile", "levels": {1: "metal"}, "stair": "metal"}}
# interior props that make a sound where they stand: type -> [bed id, amount]
const PROP_BEDS := {
	"machinery_block": ["machine_hum", 0.8], "cylinder_machine": ["machine_hum", 0.55],
	"green_tank_machine": ["tank_bubbles", 0.6], "specimen_tank": ["tank_bubbles", 1.0],
	"wall_vent": ["vent_loop", 0.7], "panel_light": ["light_buzz", 0.35],
	"wall_clock": ["clock_loop", 0.7], "computer_console": ["pc_hum", 0.6],
	"desk_computer": ["pc_hum", 0.4], "capsule_machine": ["machine_hum", 0.3],
}
# looking at things: interior prop type or a word in the text -> sound
const USE_TYPE := {
	"computer_console": "pc_boot", "desk_computer": "pc_beep", "specimen_tank": "tank_glug", "green_tank_machine": "tank_glug",
	"bookshelf": "book_shelf", "notice_board": "page_turn", "drafting_table": "page_turn", "sofa": "cloth_rustle",
	"capsule_machine": "ball_click", "round_table_holder": "ball_click", "lab_counter": "glass_clink", "green_table": "glass_clink",
	"machinery_block": "switch", "cylinder_machine": "pc_beep", "globe": "globe_spin", "desk": "drawer",
}

var game: Node
var t := 0.0
var _amb_acc := 0.0
var _rng := RandomNumberGenerator.new()
# surfaces
var pm: Image
var pm_box := Rect2()
var tall: Array = []
# the nearest water: a 2 m grid holding the nearest sea / fresh point
const WG := 2.0
var w_x0 := 0.0; var w_z0 := 0.0; var w_nx := 0; var w_nz := 0
var near_sea := PackedVector2Array()
var near_fresh := PackedVector2Array()
# plants to brush through: 4 m buckets of [x, z, r]
var plants := {}
# the player
var _p_steps := 0
var _p_ground := true
var _p_vy := 0.0
var _rustle_t := 0.0
# timers for scattered sounds
var _next := {"bird": 2.0, "gull": 6.0, "frog": 3.0, "owl": 30.0, "dog": 40.0, "chime": 8.0, "hen": 5.0}
var _space := ""
var _last_hour := -1

func setup(g: Node) -> void:
	game = g
	_rng.randomize()
	var W: WorldData = g.outdoor_world if g.outdoor_world else g.world
	var img: Image = W.path_tex.get_image()
	if img.has_mipmaps(): img.clear_mipmaps()
	pm = img
	var p: Dictionary = W.meta.pathmap
	pm_box = Rect2(float(p.x0), float(p.z0), float(p.w), float(p.d))
	tall = g.cast.tall if g.cast else []
	_water_grid(W)
	_plants()

# ---------- surfaces ----------

# the path map: R = signed distance to the dirt (< 0 on it); G, B, A shade it
func _pm_at(x: float, z: float) -> Color:
	var u := (x - pm_box.position.x) / pm_box.size.x
	var v := (z - pm_box.position.y) / pm_box.size.y
	if u < 0.0 or v < 0.0 or u >= 1.0 or v >= 1.0: return Color(1, 0, 0, 0)
	return pm.get_pixel(int(u * pm.get_width()), int(v * pm.get_height()))

func in_tall_grass(x: float, z: float) -> bool:
	for b in tall:
		if x > b[0] and x < b[2] and z > b[1] and z < b[3]: return true
	return false

# what the ground is made of here: grass, dirt, sand, stone, wood, water,
# tallgrass outdoors; tile, metal (and wood) inside
func surface_at(p: Vector3) -> String:
	if game.indoors and game.interior:
		var D: InteriorData = game.interior.data
		var fl: Dictionary = INTERIOR_FLOORS.get(D.id, {})
		var f := D.flag(p.x, p.z)
		if (f & InteriorData.STAIR) and fl.has("stair"): return fl.stair
		var lv: Dictionary = fl.get("levels", {})
		if lv.has(D.level): return lv[D.level]
		return fl.get("default", "tile")
	var W: WorldData = game.world
	var fw := W.flag(p.x, p.z)
	if fw != 255 and (fw & 4): return "wood"            # decks, bridges, the pier
	var h := W.height_at(p.x, p.z)
	if h < W.sea_y + 0.06: return "water"               # the waterline
	if fw != 255 and (fw & 1): return "water"
	if STAIRS.has_point(Vector2(p.x, p.z)): return "stone"
	if fw != 255 and (fw & WorldData.SAND): return "sand"   # the beaches (their paths too; baked flag 16)
	if _pm_at(p.x, p.z).r * 8.0 - 4.0 < 0.0: return "dirt"           # roads, the square, the plaza
	if in_tall_grass(p.x, p.z): return "tallgrass"
	return "grass"

# ---------- water: nearest sea / fresh point on a 2 m grid ----------
func _water_grid(W: WorldData) -> void:
	w_x0 = W.gx0; w_z0 = W.gz0
	w_nx = int(W.gnx * W.gres / WG); w_nz = int(W.gnz * W.gres / WG)
	var n := w_nx * w_nz
	near_sea.resize(n); near_fresh.resize(n)
	var ds := PackedFloat32Array(); ds.resize(n)
	var df := PackedFloat32Array(); df.resize(n)
	var far := Vector2(1e6, 1e6)
	for j in w_nz:
		for i in w_nx:
			var k := j * w_nx + i
			var x := w_x0 + (i + 0.5) * WG
			var z := w_z0 + (j + 0.5) * WG
			var f := W.flag(x, z)
			near_sea[k] = far; near_fresh[k] = far; ds[k] = 1e12; df[k] = 1e12
			if f == 255 or not (f & 1) or (f & 4): continue
			if f & WorldData.SEA:
				near_sea[k] = Vector2(x, z); ds[k] = 0.0
			else:
				near_fresh[k] = Vector2(x, z); df[k] = 0.0
	_chamfer(near_sea, ds)
	_chamfer(near_fresh, df)

# two passes passing each cell's nearest point on to its neighbours
func _chamfer(pts: PackedVector2Array, d: PackedFloat32Array) -> void:
	var offs := [Vector2i(-1, 0), Vector2i(0, -1), Vector2i(-1, -1), Vector2i(1, -1)]
	for pass_i in 2:
		var js := range(w_nz) if pass_i == 0 else range(w_nz - 1, -1, -1)
		var is_ := range(w_nx) if pass_i == 0 else range(w_nx - 1, -1, -1)
		var sgn := 1 if pass_i == 0 else -1
		for j in js:
			for i in is_:
				var k: int = j * w_nx + i
				var c := Vector2(w_x0 + (i + 0.5) * WG, w_z0 + (j + 0.5) * WG)
				for o in offs:
					var ii: int = i + o.x * sgn
					var jj: int = j + o.y * sgn
					if ii < 0 or jj < 0 or ii >= w_nx or jj >= w_nz: continue
					var q := pts[jj * w_nx + ii]
					if q.x > 1e5: continue
					var dd := c.distance_squared_to(q)
					if dd < d[k]: d[k] = dd; pts[k] = q

func nearest_water(p: Vector3, sea: bool) -> Vector2:
	var i := int((p.x - w_x0) / WG); var j := int((p.z - w_z0) / WG)
	if i < 0 or j < 0 or i >= w_nx or j >= w_nz: return Vector2(1e6, 1e6)
	return (near_sea if sea else near_fresh)[j * w_nx + i]

# ---------- plants (bushes, ferns, flowers) from the baked plant list ----------
func _plants() -> void:
	var path := "res://world/veg.json"
	if not FileAccess.file_exists(path): return
	var meta: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(path))
	var f := FileAccess.open("res://world/veg.bin", FileAccess.READ)
	if f == null: return
	for s in meta.sets:
		var m: Dictionary = meta.mats[int(s.parts[0].mat)]
		if m.kind == "rock" or m.kind == "stone": continue
		var r := float(s.radius)
		if r > 2.5 and s.impostor != null: continue    # trees: you walk round them
		if r < 0.3: continue
		f.seek(int(s.ip[0]))
		var ip := f.get_buffer(int(s.ip[1]) * 4).to_float32_array()
		for i in int(s.n):
			var x := ip[i * 5]; var z := ip[i * 5 + 2]
			var rr := r * ip[i * 5 + 4] * 0.75
			var key := Vector2i(floori(x / 4.0), floori(z / 4.0))
			if not plants.has(key): plants[key] = PackedFloat32Array()
			var a: PackedFloat32Array = plants[key]
			a.append(x); a.append(z); a.append(rr)
			plants[key] = a

func in_plant(p: Vector3) -> bool:
	var key := Vector2i(floori(p.x / 4.0), floori(p.z / 4.0))
	for dj in [-1, 0, 1]:
		for di in [-1, 0, 1]:
			var a = plants.get(key + Vector2i(di, dj))
			if a == null: continue
			for k in range(0, a.size(), 3):
				var dx: float = p.x - a[k]; var dz: float = p.z - a[k + 1]
				if dx * dx + dz * dz < a[k + 2] * a[k + 2]: return true
	return false

# ---------- the frame ----------
func update(dt: float) -> void:
	t += dt
	if game.cast == null: return
	if _door_close > 0.0 and t >= _door_close:
		_door_close = -1.0
		Sfx.play("door_slide_close", null, {"vol": -4.0})
	_player(dt)
	_people()
	_amb_acc += dt
	if _amb_acc >= 0.1:
		_ambience(_amb_acc)
		_amb_acc = 0.0

func _player(_dt: float) -> void:
	var c = game.cast
	var a: CastActor = c.player
	var pos: Vector3 = game.pos
	var sp: float = absf(game.speed)
	# a jump and its landing
	if c.ground != _p_ground:
		var s := surface_at(pos)
		if not c.ground:
			Sfx.play("jump_" + _jl(s), null, {"vol": -2.0})
		else:
			var hard := clampf(-_p_vy / 9.0, 0.3, 1.0)
			Sfx.play("land_" + _jl(s), null, {"vol": linear_to_db(hard) - 1.0})
			_p_steps = a.steps
		_p_ground = c.ground
	_p_vy = c.vy
	# a step: one sound per foot down
	if a.steps != _p_steps:
		_p_steps = a.steps
		if c.ground and sp > 0.3:
			var s2 := surface_at(pos)
			var run := sp > 6.0
			var id := "step_" + s2 + ("_run" if run else "")
			Sfx.play(id, null, {"vol": -3.0 + (1.5 if run else 0.0) - (3.0 if sp < 2.5 else 0.0)})
			# brushing through a bush, a fern or flowers (the tall grass steps rustle already)
			if s2 != "tallgrass" and not game.indoors and _rustle_t <= t and in_plant(pos):
				Sfx.play("bush_rustle", null, {"vol": -4.0 if run else -7.0})
				_rustle_t = t + 0.25
			elif run and _rng.randf() < 0.12:
				Sfx.play("cloth_rustle", null, {"vol": -14.0})

# the jump / land sets cover the main surfaces
func _jl(s: String) -> String:
	match s:
		"tallgrass": return "grass"
	return s

# the townspeople and Prof. Oak: 3D steps, quieter, near the camera only
func _people() -> void:
	var cam: Camera3D = game.cam
	var cp := cam.global_position
	if not game.indoors:
		var life = game.cast.life
		for p in life.people:
			var a = p.actor
			if a == null or not a.visible or p.state == "inside": continue
			_npc_step(p, a, cp, float(p.v))
		var comp = life.companions
		if comp:
			for c in comp.pets: _pet(c, cp)
	for n in game.cast.npcs:
		if n.hidden: continue
		_npc_step(n, n.actor, cp, float(n.speed))

func _npc_step(p: Dictionary, a: CastActor, cp: Vector3, v: float) -> void:
	var last: int = p.get("sfx_steps", -1)
	if last == a.steps: return
	p["sfx_steps"] = a.steps
	if last < 0 or v < 0.3: return
	var at: Vector3 = p.pos
	if at.distance_squared_to(cp) > 22.0 * 22.0: return
	var s := surface_at(at)
	Sfx.play("step_" + s + ("_run" if v > 2.6 else ""), at, {"vol": -9.0, "dist": 22.0, "unit": 2.0})

# the companions: footfalls, calls, hops and pecks (counters on the creature)
func _pet(c: Dictionary, cp: Vector3) -> void:
	var cr = c.creature
	if cr == null or not cr.visible: return
	var at: Vector3 = c.pos
	if at.distance_squared_to(cp) > 30.0 * 30.0: return
	var big: bool = c.species == "doduo"
	if int(c.get("sfx_steps", -1)) != cr.footfalls:
		var first: bool = not c.has("sfx_steps")
		c["sfx_steps"] = cr.footfalls
		if not first and float(c.v) > 0.05:
			Sfx.play("patter_heavy" if big else "patter_small", at, {"vol": -6.0 if big else -13.0, "dist": 18.0})
	if int(c.get("sfx_pecks", -1)) != cr.pecks:
		var first2: bool = not c.has("sfx_pecks")
		c["sfx_pecks"] = cr.pecks
		if not first2: Sfx.play("peck", at, {"vol": -8.0})
	if int(c.get("sfx_hops", -1)) != cr.hops:
		var first3: bool = not c.has("sfx_hops")
		c["sfx_hops"] = cr.hops
		if not first3:
			Sfx.play("creature_hop", at, {"vol": -6.0})
			if big: Sfx.play("wing_flap_large", at, {"vol": -8.0})

# a companion speaks (companions.gd, its speech bubble)
func pet_call(c: Dictionary) -> void:
	if game.indoors: return
	var big: bool = c.species == "doduo"
	Sfx.play("creature_honk" if big else "critter_chirp", c.pos + Vector3(0, 1.2 if big else 0.4, 0), {"vol": -3.0})

# ---------- doors and spaces ----------
var _door_close := -1.0
func door_lab(_entering: bool) -> void:
	Sfx.play("door_slide_open", null, {"vol": -2.0})
	_door_close = t + 0.75   # it slides shut behind you as the screen comes back
func house_door(at: Vector3, opening: bool) -> void:
	if game.indoors: return
	Sfx.play("door_wood_open" if opening else "door_wood_close", at, {"vol": -4.0, "dist": 28.0})

# ---------- looking at things (cast.gd, when the text opens) ----------
func on_use(u: Dictionary) -> void:
	var id := ""
	var at = null
	if game.indoors and game.interior:
		for pr in game.interior.data.meta.props:
			if String(pr.id) == String(u.get("id", "")):
				id = USE_TYPE.get(String(pr.type), "")
				break
		if String(u.get("label", "")) == "Door": id = "door_locked"
		if String(u.get("label", "")) == "Sit": id = "cloth_rustle"
	else:
		var text := " ".join(PackedStringArray(u.get("lines", []))).to_lower()
		var label := String(u.get("label", ""))
		if text.contains("mailbox"): id = "mailbox"
		elif label == "Door": id = "door_knock"
		elif text.contains("well"): id = "well_plop"
		elif label == "Read": id = "sign_knock"
		elif text.contains("boathouse"): id = "boat_creak"
		elif text.contains("sea"): id = "seagull"
		at = Vector3(float(u.x), game.world.height_at(float(u.x), float(u.z)) + 1.0, float(u.z))
	if id != "": Sfx.play(id, at, {"vol": -2.0})

# ---------- ambience ----------
static func _sm(a: float, b: float, x: float) -> float:
	var k := clampf((x - a) / (b - a), 0.0, 1.0)
	return k * k * (3.0 - 2.0 * k)

func _hour() -> float:
	var c = game.cast
	return c.clock.hour() if c != null and c.clock != null else 12.0

func _ambience(dt: float) -> void:
	var space: String = game.interior.data.id if game.indoors and game.interior else "out"
	if space != _space:
		Sfx.stop_beds(0.4)
		Sfx.set_space(space != "out")
		_space = space
		if space != "out": _interior_beds()
		return
	if space != "out":
		Sfx.bed("in_room", "room_tone", 0.6)
		return
	var pos: Vector3 = game.pos
	var h := _hour()
	var day := _sm(4.8, 6.5, h) * (1.0 - _sm(19.0, 20.5, h))
	var night := 1.0 - _sm(4.5, 5.8, h) * (1.0 - _sm(19.5, 21.0, h))
	var hill := _sm(8.0, 15.0, pos.y)
	# wind: a light breeze everywhere, more of it (and gusts) up on the hill
	Sfx.bed("wind_l", "amb_wind_light", 0.45 + 0.35 * hill)
	Sfx.bed("wind_s", "amb_wind_strong", hill * 0.7, null, 3.0)
	# the sea: a bed at the nearest point of it, and the lapping close by
	var sp := nearest_water(pos, true)
	var ds := Vector2(pos.x, pos.z).distance_to(sp)
	if ds < 160.0: Sfx.bed("sea", "amb_sea_waves", 1.0, Vector3(sp.x, game.world.sea_y + 0.5, sp.y), 2.0)
	else: Sfx.bed("sea", "amb_sea_waves", 0.0)
	Sfx.bed("shore", "amb_shore_lap", (1.0 - _sm(4.0, 18.0, ds)) * 0.8)
	# fresh water: the pond or the stream, wherever is nearest
	var fp := nearest_water(pos, false)
	var df := Vector2(pos.x, pos.z).distance_to(fp)
	var fy: float = game.world.height_at(fp.x, fp.y) + 0.3 if df < 1e5 else 0.0
	var pond := fp.distance_to(POND) < 11.0
	Sfx.bed("stream", "amb_stream", 0.0 if pond or df > 70.0 else 1.0, Vector3(fp.x, fy, fp.y))
	Sfx.bed("pond", "amb_pond", 1.0 if pond and df < 50.0 else 0.0, Vector3(fp.x, fy, fp.y))
	# night: crickets everywhere, frogs by fresh water, an owl now and then
	Sfx.bed("crickets", "amb_crickets", night * (1.0 - 0.5 * _sm(30.0, 5.0, ds)) * 0.9, null, 4.0)
	# the windmill on the lab's tower
	Sfx.bed("mill", "windmill_creak", 1.0 if pos.distance_to(WINDMILL) < 70.0 else 0.0, WINDMILL)
	# the pier bell at six in the morning and six in the evening
	var hr := int(h)
	if hr != _last_hour:
		if _last_hour >= 0 and (hr == 6 or hr == 18): Sfx.play("dock_bell", PIER_BELL, {"dist": 120.0, "unit": 10.0})
		_last_hour = hr
	for k in _next: _next[k] -= dt
	if day > 0.3 and _next.bird <= 0.0:
		_next.bird = _rng.randf_range(1.2, 4.5) / maxf(day, 0.3)
		if ds > 25.0:
			var a := _rng.randf() * TAU
			var r := _rng.randf_range(10.0, 32.0)
			Sfx.play("bird_call", pos + Vector3(cos(a) * r, _rng.randf_range(4.0, 10.0), sin(a) * r), {"vol": -6.0})
	if day > 0.3 and ds < 60.0 and _next.gull <= 0.0:
		_next.gull = _rng.randf_range(5.0, 16.0)
		Sfx.play("seagull", Vector3(sp.x + _rng.randf_range(-25, 25), 12.0, sp.y + _rng.randf_range(0, 25)), {"vol": -4.0, "dist": 90.0})
	if night > 0.5 and df < 35.0 and _next.frog <= 0.0:
		_next.frog = _rng.randf_range(1.5, 5.0)
		Sfx.play("frog", Vector3(fp.x + _rng.randf_range(-6, 6), fy, fp.y + _rng.randf_range(-6, 6)), {"vol": -6.0})
	if night > 0.7 and _next.owl <= 0.0:
		_next.owl = _rng.randf_range(25.0, 70.0)
		var a2 := _rng.randf() * TAU
		Sfx.play("owl", pos + Vector3(cos(a2) * 30.0, 12.0, sin(a2) * 30.0), {"vol": -5.0, "dist": 90.0})
	if day > 0.5 and _next.dog <= 0.0:
		_next.dog = _rng.randf_range(45.0, 110.0)
		var a3 := _rng.randf() * TAU
		Sfx.play("dog_distant", pos + Vector3(cos(a3) * 45.0, 2.0, sin(a3) * 45.0), {"dist": 120.0, "unit": 8.0, "vol": -8.0})
	var life = game.cast.life
	if _next.chime <= 0.0:
		_next.chime = _rng.randf_range(7.0, 20.0)
		for hname in CHIME_PORCHES:
			var hs = life.houses.get(hname)
			if hs == null: continue
			var porch: Vector3 = hs.porch
			var at := Vector3(porch.x, game.world.height_at(porch.x, porch.y) + 2.2, porch.y)
			if at.distance_to(pos) < 25.0 and _rng.randf() < 0.6: Sfx.play("wind_chimes", at, {"vol": -6.0, "dist": 30.0})
	if day > 0.4 and _next.hen <= 0.0:
		_next.hen = _rng.randf_range(3.0, 9.0)
		if Vector2(pos.x, pos.z).distance_to(FARM_YARD) < 40.0:
			Sfx.play("chicken", Vector3(FARM_YARD.x + _rng.randf_range(-6, 6), game.world.height_at(FARM_YARD.x, FARM_YARD.y) + 0.3, FARM_YARD.y + _rng.randf_range(-5, 5)), {"vol": -5.0})

# the space's machines, tanks, vents, lights and clocks
func _interior_beds() -> void:
	var D: InteriorData = game.interior.data
	var n := 0
	for pr in D.meta.props:
		var b: Array = PROP_BEDS.get(String(pr.type), [])
		if b.is_empty(): continue
		var y := float(pr.get("y", 0.0)) + float(D.level_y[int(pr.get("level", 0))]) + 1.0
		Sfx.bed("prop_%d" % n, b[0], b[1], Vector3(float(pr.x), y, float(pr.z)))
		n += 1
