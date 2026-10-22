extends Node
# Boot (the FIRST autoload): applies over-the-air patches before anything else
# of the game loads. Godot creates autoloads one by one, so the packs loaded in
# _init() here replace the files the next autoloads (Settings, Ink), the main
# scene and every script read. The download side is updater.gd (/root/Updater),
# which this adds once the game has started; it comes from the patched files,
# so it can itself be patched. This file and project.godot cannot: a change to
# either needs a new .ipa (their hash is the "proj" id, and patches with
# another one are refused).
#
# Files in user://patches/:
#   state.json  {cur, prev, next, bad, trial} where a set is
#               {v, base, built_at, git, packs: [{name, file, sha256, size, src}]}
#               (only the packs that differ from the app's own files)
#   packs/      verified packs; *.part = downloads in progress
#   booting     written before a set is used, removed once the main scene has
#               run for GOOD_AFTER seconds: still there at the next launch =
#               that launch failed
# res://patch_base.json (written by the iOS build, read before any pack loads):
#   {build, built_at, engine, proj, src: {pack: id}} of the app itself.
#
# A new set ("next", downloaded by the updater) becomes "cur" at the next
# launch; the old one is kept as "prev". If the game fails to reach the main
# scene twice in a row on a new set, it goes back to "prev" and the version is
# marked bad so it is not downloaded again.

const DIR := "user://patches/"
const STATE := DIR + "state.json"
const FLAG := DIR + "booting"
const GOOD_AFTER := 8.0
const MAX_FAILS := 2

var base := {}          # res://patch_base.json ({} when run from the editor)
var state := {}
var applied := {}       # the set loaded this launch ({} = the app's own files)
var load_error := ""
var _good_t := -1.0

func _init() -> void:
	base = read_json("res://patch_base.json")
	if base.is_empty():
		return   # a dev run from the project folder: no patches
	DirAccess.make_dir_recursive_absolute(DIR + "packs")
	state = read_json(STATE)
	for k in ["cur", "prev", "next", "trial"]:
		if not state.get(k) is Dictionary: state[k] = {}
	if not state.get("bad") is Array: state.bad = []
	var failed := FileAccess.file_exists(FLAG)
	# a set made for another app build (a new .ipa was installed) is dropped
	for k in ["cur", "prev", "next"]:
		if not state[k].is_empty() and not fits(state[k]): state[k] = {}
	# the downloaded set takes over now
	if not state.next.is_empty() and has_files(state.next):
		if not state.cur.is_empty(): state.prev = state.cur
		state.cur = state.next
		state.trial = {"v": state.cur.v, "fails": 0}
		failed = false
	state.next = {}
	# the last launch never reached the game on a new set
	if failed and not state.cur.is_empty() and state.trial.get("v") == state.cur.v:
		state.trial.fails = int(state.trial.get("fails", 0)) + 1
		print("[patch] launch %d of v%d failed" % [state.trial.fails, state.cur.v])
		if state.trial.fails >= MAX_FAILS: rollback("it failed to start %d times" % MAX_FAILS)
	if not state.cur.is_empty() and not has_files(state.cur):
		rollback("its files are missing")
	if not state.cur.is_empty():
		for p in state.cur.packs:
			if not ProjectSettings.load_resource_pack(DIR + "packs/" + str(p.file), true):
				load_error = "could not load " + str(p.file)
				break
		if load_error == "":
			applied = state.cur
			print("[patch] running v%d (%s)" % [applied.v, ", ".join(applied.packs.map(func(p): return p.name))])
		else:
			# some packs may be in already: let this launch count as failed, so
			# the next one starts from prev
			push_error("[patch] " + load_error)
			state.bad.append(state.cur.v)
			state.cur = state.prev; state.prev = {}; state.trial = {}
	if not applied.is_empty():
		var f := FileAccess.open(FLAG, FileAccess.WRITE)
		if f: f.store_string(str(applied.v))
	else:
		DirAccess.remove_absolute(FLAG)
	save_state()

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	# the updater comes from the (patched) game files; a dev run has none
	if base.is_empty(): return
	if ResourceLoader.exists("res://updater.gd"):
		var u: Node = load("res://updater.gd").new()
		u.name = "Updater"
		get_tree().root.add_child.call_deferred(u)

# the set has run long enough in the main scene: it is good
func _process(dt: float) -> void:
	if base.is_empty() or get_tree().current_scene == null: return
	if _good_t < 0.0: _good_t = 0.0
	_good_t += dt
	if _good_t < GOOD_AFTER: return
	set_process(false)
	DirAccess.remove_absolute(FLAG)
	if not state.get("trial", {}).is_empty():
		state.trial = {}
		save_state()

func rollback(why: String) -> void:
	push_warning("[patch] going back from v%d: %s" % [int(state.cur.get("v", -1)), why])
	if not state.bad.has(state.cur.v): state.bad.append(state.cur.v)
	state.cur = state.prev
	state.prev = {}
	state.trial = {}

# a set made for this app build (same engine, project and base build)
func fits(s: Dictionary) -> bool:
	return s.get("base") == base.get("build") and s.get("packs") is Array and s.has("v")

func has_files(s: Dictionary) -> bool:
	if not s.get("packs") is Array: return false
	for p in s.packs:
		var path := DIR + "packs/" + str(p.get("file", ""))
		if not FileAccess.file_exists(path): return false
		var f := FileAccess.open(path, FileAccess.READ)
		if f == null or f.get_length() != int(p.get("size", -1)): return false
	return true

func save_state() -> void:
	var f := FileAccess.open(STATE + ".tmp", FileAccess.WRITE)
	if f == null: return
	f.store_string(JSON.stringify(state, " "))
	f.close()
	DirAccess.rename_absolute(STATE + ".tmp", STATE)

static func read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path): return {}
	var d = JSON.parse_string(FileAccess.get_file_as_string(path))
	return d if d is Dictionary else {}
