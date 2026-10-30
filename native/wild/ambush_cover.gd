extends RefCounted
# Where an ambusher can lie in wait (ambush.gd): cover of any kind, by place. Each
# answers spots(me, r, yaw, dmin, dmax, rng) -> [{at: Vector3, kind, r}] with kind
# "bush" | "thicket" | "tall_grass" (tree tops later: kind "tree", at up in it).
#   Town    Route 1: the plants' bushes (sfx_world.gd's buckets: the big ones are
#           thickets) and its tall grass (wild_tall_grass.gd)
#   Arena   the Battle Arena: its bushes and the AMBUSH page's thickets (arena.gd
#           hides, arena_ambush.gd) and its tall grass (wild_arena_grass.gd)

const THICKET_R := 1.3          # a bush this wide (radius, m) counts as a thicket

class Town extends RefCounted:
	var amb
	func _init(a) -> void: amb = a
	func spots(me: Vector3, r: float, yaw: float, dmin: float, dmax: float, rng: RandomNumberGenerator) -> Array:
		var out := []
		if BattleArena.I != null: return out
		var sw = amb.game.get("sfx_world")
		if sw != null and sw.get("plants") != null:
			var key := Vector2i(floori(me.x / 4.0), floori(me.z / 4.0))
			var n := ceili(r / 4.0)
			for dj in range(-n, n + 1):
				for di in range(-n, n + 1):
					var a = sw.plants.get(key + Vector2i(di, dj))
					if a == null: continue
					for k in range(0, (a as PackedFloat32Array).size(), 3):
						var br: float = a[k + 2]
						if br < 0.5: continue
						var at := Vector3(a[k], 0, a[k + 1])
						if Vector2(at.x - me.x, at.z - me.z).length() > r: continue
						out.append({"at": at, "kind": "thicket" if br >= THICKET_R else "bush", "r": br})
		var tg = amb.wild.sources[0] if not amb.wild.sources.is_empty() else null
		if tg != null:
			var p = tg.pick_spot(me, yaw, dmin, dmax, rng)
			if p != null: out.append({"at": p, "kind": "tall_grass", "r": 0.0})
		return out

class Arena extends RefCounted:
	var amb
	func _init(a) -> void: amb = a
	func spots(me: Vector3, r: float, yaw: float, dmin: float, dmax: float, rng: RandomNumberGenerator) -> Array:
		var out := []
		var ar = BattleArena.I
		if ar == null: return out
		for h in ar.hides:
			if String(h.kind) == "tree": continue
			var at: Vector3 = h.at
			if Vector2(at.x - me.x, at.z - me.z).length() > r: continue
			out.append({"at": Vector3(at.x, 0, at.z), "kind": String(h.kind), "r": float(h.r)})
		var src = amb.wild.arena_src
		if src != null:
			var p = src.pick_spot(me, yaw, dmin, dmax, rng)
			if p != null: out.append({"at": p, "kind": "tall_grass", "r": 0.0})
		return out
