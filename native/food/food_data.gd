class_name FoodData
extends RefCounted
# The menus (res://life/food.json): what each place serves at an hour, its
# prices and Ash's tab there (saved with the conditions' body state).
#
#   FoodData.meal_at(hour) -> "breakfast" | "lunch" | "supper"
#   FoodData.menu(place, hour) -> {place, meal, cats: [{id, name, items: [{id, it, price, ok, when}]}]}
#   FoodData.item(id) -> Dictionary     FoodData.place(id) -> Dictionary
#   FoodData.tab(place) -> int          FoodData.charge(place, price)
#   FoodData.line(place, kind, meal, item_name) -> Array of lines ("order" | "done")

const PATH := "res://life/food.json"
static var _d := {}

static func data() -> Dictionary:
	if _d.is_empty() and FileAccess.file_exists(PATH):
		var v = JSON.parse_string(FileAccess.get_file_as_string(PATH))
		if v is Dictionary: _d = v
	return _d

static func item(id: String) -> Dictionary:
	var it = data().get("items", {}).get(id)
	return it if it is Dictionary else {}

static func place(id: String) -> Dictionary:
	var p = data().get("places", {}).get(id)
	return p if p is Dictionary else {}

static func has_place(id: String) -> bool: return not place(id).is_empty()

static func currency() -> String: return String(data().get("currency", "₽"))

static func meal_at(hour: float) -> String:
	var h := fmod(hour, 24.0)
	var M: Dictionary = data().get("meals", {"breakfast": [5.0, 10.5], "lunch": [10.5, 15.5], "supper": [15.5, 29.0]})
	for k in ["breakfast", "lunch", "supper"]:
		var span: Array = M.get(k, [0, 0])
		var a := float(span[0]); var b := float(span[1])
		if (h >= a and h < b) or (h + 24.0 >= a and h + 24.0 < b): return k
	return "supper"

static func meal_name(m: String) -> String:
	return {"breakfast": "Breakfast", "lunch": "Lunch", "supper": "Supper"}.get(m, m.capitalize())

static func menu(pid: String, hour: float) -> Dictionary:
	var P := place(pid)
	var meal := meal_at(hour)
	var cats := []
	for c in P.get("categories", []):
		var items := []
		for e in c.get("items", []):
			var it := item(String(e.id))
			if it.is_empty(): continue
			var when: Array = e.get("when", [])
			items.append({"id": String(e.id), "it": it, "price": int(e.get("price", 0)), "when": when, "ok": when.is_empty() or when.has(meal)})
		# what's served now first, then the rest of the day's (shown, not orderable)
		var now := items.filter(func(x): return x.ok)
		var later := items.filter(func(x): return not x.ok)
		if not items.is_empty(): cats.append({"id": String(c.get("id", "")), "name": String(c.get("name", "")), "items": now + later})
	return {"place": P, "id": pid, "meal": meal, "cats": cats}

# ---------- the tab ----------
static func _body() -> Dictionary:
	return Conditions.I.body if Conditions.I != null else {}

static func tab(pid: String) -> int:
	var t = _body().get("tab", {})
	return int(t.get(pid, 0)) if t is Dictionary else 0

static func charge(pid: String, price: int) -> void:
	if price <= 0 or Conditions.I == null: return
	var b := _body()
	var t = b.get("tab", {})
	if not t is Dictionary: t = {}
	t[pid] = int(t.get(pid, 0)) + price
	b["tab"] = t

# what the host says: lines.<kind>.<meal> (or _any; done: one of several sets)
static func line(pid: String, kind: String, meal: String, item_name := "", treat := false) -> Array:
	var L: Dictionary = place(pid).get("lines", {}).get(kind, {})
	var pool = L.get("treat" if treat and L.has("treat") else meal, L.get("_any", []))
	if not pool is Array or pool.is_empty(): return []
	var pick = pool[randi() % pool.size()]
	var out := []
	for s in (pick if pick is Array else [pick]): out.append(String(s).replace("{item}", item_name.to_lower()))
	return out
