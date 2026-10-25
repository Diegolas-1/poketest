# Tunables: numbers and tables the world editor (web/world/editor.html, Game
# settings) can change without touching code. Each system reads its values
# from res://tunables/<file>.json; a missing file or key gives the default
# written at the read site, so the code's defaults stay the reference.
#   const T := preload("res://tunables.gd")
#   T.num("player", "walk_speed", 4.5)   T.vec3(...)   T.col(...)   T.dict(...)
extends RefCounted

static var _c := {}

static func file(f: String) -> Dictionary:
	if _c.has(f): return _c[f]
	var d := {}
	var p := "res://tunables/%s.json" % f
	if FileAccess.file_exists(p):
		var j = JSON.parse_string(FileAccess.get_file_as_string(p))
		if j is Dictionary: d = j
		else: push_warning("tunables: %s is not a JSON object" % p)
	_c[f] = d
	return d

static func num(f: String, k: String, def: float) -> float:
	var v = file(f).get(k)
	return float(v) if v is float or v is int else def

static func vec3(f: String, k: String, def: Vector3) -> Vector3:
	var v = file(f).get(k)
	return Vector3(v[0], v[1], v[2]) if v is Array and v.size() == 3 else def

static func col(f: String, k: String, def: Color) -> Color:
	var v = file(f).get(k)
	return Color(v) if v is String and Color.html_is_valid(v) else def

static func text(f: String, k: String, def: String) -> String:
	var v = file(f).get(k)
	return v if v is String else def

# a table: the default with the file's entries over it (one level deep)
static func dict(f: String, k: String, def: Dictionary) -> Dictionary:
	var v = file(f).get(k)
	if not v is Dictionary: return def
	var out := def.duplicate(true)
	for key in v: out[key] = v[key]
	return out

# a number in a section: { "doduo": { "walk_duty": 0.62 } }
static func num2(f: String, sec: String, k: String, def: float) -> float:
	var s = file(f).get(sec)
	if not s is Dictionary: return def
	var v = s.get(k)
	return float(v) if v is float or v is int else def

# a table in a section, the default with the file's entries over it
static func dict2(f: String, sec: String, k: String, def: Dictionary) -> Dictionary:
	var s = file(f).get(sec)
	if not s is Dictionary or not s.get(k) is Dictionary: return def
	var out := def.duplicate(true)
	for key in s[k]: out[key] = s[k][key]
	return out
