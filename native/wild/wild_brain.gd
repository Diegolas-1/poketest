class_name WildBrain
extends RefCounted
# The hunt's rules, apart from the world (wild.gd uses them; dev/wild_test.gd
# checks them headless): which species lives where and when, how fast one
# settles into cover near Ash (the spawn hazard: still or crouch-walking in or
# near tall grass lures them, walking hardly, running never), how loud and how
# visible Ash is (speed, crouch, distance, which way it faces), how its
# alertness builds and fades, which temperament an individual has and what a
# startle makes it do (flee, attack, be curious), and where a fled one goes
# to hide (a safe zone: tall grass, a bush, a tree). Also the tutorial's done
# flag on disk. All numbers come from res://life/wild.json.

const PATH := "res://life/wild.json"

var D: Dictionary = {}      # the whole file
var T: Dictionary = {}      # its "tracking" tuning
var save_path := "user://wild.save"
var rng := RandomNumberGenerator.new()

func _init(path := PATH) -> void:
	rng.randomize()
	var j = JSON.parse_string(FileAccess.get_file_as_string(path)) if FileAccess.file_exists(path) else null
	D = j if j is Dictionary else {"species": {}, "tracking": {}}
	T = D.get("tracking", {})

func sp(id: String) -> Dictionary: return D.species.get(id, {})
func t(key: String, d = 0.0): return T.get(key, d)
func tv(key: String, sub: String, d := 0.0) -> float: return float(T.get(key, {}).get(sub, d))
func tv_arr(key: String, sub: String, d: Array) -> Array: return T.get(key, {}).get(sub, d)

static func sm(a: float, b: float, x: float) -> float:
	var u := clampf((x - a) / (b - a), 0.0, 1.0)
	return u * u * (3.0 - 2.0 * u)

# ---------- where and when ----------
# the species an encounter source (e.g. "tall_grass") has in a region at an hour: [[id, rate]]
func species_for(source: String, region: String, hour: float) -> Array:
	var out := []
	for id in D.species:
		var s: Dictionary = D.species[id]
		var src = s.get("sources", {}).get(source)
		if not src is Dictionary: continue
		if not (src.get("regions", []) as Array).has(region): continue
		var h: Array = s.get("hours", [0.0, 24.0])
		var ok := hour >= float(h[0]) and hour <= float(h[1]) if float(h[0]) <= float(h[1]) else (hour >= float(h[0]) or hour <= float(h[1]))
		if ok: out.append([id, float(src.get("rate", 1.0))])
	return out

func pick_species(list: Array) -> String:
	return _weighted(list.map(func(e): return [e[0], e[1]]))

# ---------- settling into cover near Ash ----------
# how much a place counts as cover: 1 inside (or within cover_near of) tall grass, to 0 at cover_far
func cover(d_to_grass: float) -> float:
	return 1.0 - sm(float(t("cover_near", 1.0)), float(t("cover_far", 7.0)), d_to_grass)

# how much Ash's way of moving lures one in (0..1)
func lure(speed: float, crouched: bool, riding: bool) -> float:
	if riding: return tv("lure", "bike", 0.0)
	if speed < 0.2: return tv("lure", "still", 1.0)
	if crouched: return tv("lure", "crouch", 0.75)
	if speed > 5.5: return tv("lure", "run", 0.0)
	return tv("lure", "walk", 0.12)

# spawns a second (a Poisson rate): on average spawn_still_s of standing still in the grass
func hazard(cov: float, lu: float, rate := 1.0) -> float:
	return cov * lu * rate / maxf(0.1, float(t("spawn_still_s", 9.0)))

func spawn_roll(dt: float, cov: float, lu: float, rate := 1.0) -> bool:
	return rng.randf() < 1.0 - exp(-hazard(cov, lu, rate) * dt)

# ---------- noise, sight, alertness ----------
func noise(speed: float, crouched: bool, riding: bool) -> float:
	var N: Dictionary = T.get("noise", {})
	if riding: return float(N.get("bike", 1.6)) * minf(1.0, absf(speed) / 4.0) + 0.3
	if speed < 0.2: return 0.0
	if crouched: return float(N.get("crouch", 0.22)) * speed / 1.4
	if speed > 5.5: return float(N.get("run", 2.4))
	return float(N.get("walk0", 0.35)) + (float(N.get("walk1", 1.0)) - float(N.get("walk0", 0.35))) * minf(1.0, speed / 4.5)

func hear(d: float) -> float:
	var h := float(t("hear_d", 3.0))
	return 1.0 / (1.0 + (d / h) * (d / h))

# how much the Pokémon notices Ash this moment: his noise heard over the distance,
# plus him seen (upright far more than crouched, moving more than still, in front
# of it more than behind; facing = the dot of its look and the way to Ash)
func stim(n: float, d: float, crouched: bool, moving: bool, facing: float, senses := 1.0) -> float:
	var S: Dictionary = T.get("sight", {})
	var sd := float(S.get("d", 2.5))
	var seen := float(S.get("crouch", 0.15) if crouched else S.get("stand", 0.45))
	seen *= (1.0 + (float(S.get("moving", 0.8)) if moving else 0.0)) * (0.5 + 0.5 * clampf(facing, 0.0, 1.0)) / (1.0 + (d / sd) * (d / sd))
	var s := (n * hear(d) + seen) * senses
	if d < float(t("bump_d", 0.9)): s += 1.5
	return s

# alertness one step on: up while it notices more than the quiet threshold, down slowly
# while all is quiet. 1 = startled
func step_alert(a: float, s: float, dt: float, wary := false) -> float:
	var q := float(t("quiet_wary", 0.08) if wary else t("quiet", 0.12))
	if s > q: a += float(t("rise_wary", 2.6) if wary else t("rise", 2.0)) * (s - q) * dt
	else: a -= float(t("decay", 0.12)) * dt
	return clampf(a, 0.0, 1.0)

func senses(id: String, temper: String) -> float:
	var s := sp(id)
	var base := float(s.get("senses", {}).get("hearing", 1.0))
	return base * float(s.get("temper_senses", {}).get(temper, 1.0))

# ---------- temperament and the startle ----------
func pick_temper(id: String) -> String:
	var w: Dictionary = sp(id).get("temper", {"flighty": 1.0})
	return _weighted(w.keys().map(func(k): return [k, float(w[k])]))

# flee | attack | curious, by its temper's weights; cornered (Ash right on it) the
# timid and flighty lash out more often
func pick_reaction(id: String, temper: String, d := 5.0) -> String:
	var w: Dictionary = sp(id).get("react", {}).get(temper, {"flee": 1.0}).duplicate()
	if d < 1.2 and temper in ["timid", "flighty"]: w["attack"] = float(w.get("attack", 0.0)) + 0.15
	return _weighted(w.keys().map(func(k): return [k, float(w[k])]))

func _weighted(list: Array) -> String:
	var tot := 0.0
	for e in list: tot += maxf(0.0, float(e[1]))
	if tot <= 0.0: return String(list[0][0]) if not list.is_empty() else ""
	var r := rng.randf() * tot
	for e in list:
		r -= maxf(0.0, float(e[1]))
		if r <= 0.0: return String(e[0])
	return String(list[-1][0])

# ---------- where a fled one hides ----------
# cands: [{at: Vector3, kind: "tall_grass" | "bush" | "tree"}]; from: where it took
# off; ash: where Ash is. Picks one in the species' flee range (else the nearest
# range that has any), weighted by the kind it likes and by going away from Ash
func pick_safe(id: String, from: Vector3, ash: Vector3, cands: Array) -> Dictionary:
	var F: Dictionary = sp(id).get("flee", {})
	var rg: Array = F.get("range", [30.0, 60.0])
	var pref: Dictionary = F.get("safe", {"tall_grass": 1.0})
	var away := Vector2(from.x - ash.x, from.z - ash.z)
	away = away.normalized() if away.length() > 0.01 else Vector2.ZERO
	for widen in [0.0, 15.0, 40.0]:
		var lo: float = maxf(8.0, float(rg[0]) - widen)
		var hi: float = float(rg[1]) + widen
		var pool := []
		for c in cands:
			var at: Vector3 = c.at
			var dv := Vector2(at.x - from.x, at.z - from.z)
			var d := dv.length()
			if d < lo or d > hi: continue
			var pw := float(pref.get(String(c.kind), 0.0))
			if pw <= 0.0: continue
			var ad := dv.normalized().dot(away) if away != Vector2.ZERO else 0.0
			# away from Ash counts most; straight back past him almost never
			var w := pw * maxf(0.05, 1.0 + 0.9 * ad) * (1.0 - 0.35 * absf(d - (lo + hi) * 0.5) / maxf(1.0, (hi - lo) * 0.5))
			pool.append([c, w])
		if pool.is_empty(): continue
		var tot := 0.0
		for e in pool: tot += float(e[1])
		var r := rng.randf() * tot
		for e in pool:
			r -= float(e[1])
			if r <= 0.0: return e[0]
		return pool[-1][0]
	# nowhere: straight away from Ash
	var dir := Vector3(away.x, 0, away.y) if away != Vector2.ZERO else Vector3.FORWARD
	return {"at": from + dir * float(rg[0]), "kind": "open"}

# ---------- the tutorial, done once ----------
func tutorial_done() -> bool:
	if not FileAccess.file_exists(save_path): return false
	var j = JSON.parse_string(FileAccess.get_file_as_string(save_path))
	return j is Dictionary and bool(j.get("tutorial_done", false))

func set_tutorial_done(on := true) -> void:
	var j := {}
	if FileAccess.file_exists(save_path):
		var v = JSON.parse_string(FileAccess.get_file_as_string(save_path))
		if v is Dictionary: j = v
	j["tutorial_done"] = on
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f: f.store_string(JSON.stringify(j))
