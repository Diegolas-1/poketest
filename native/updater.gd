extends Node
# Updater (/root/Updater, added by boot.gd): checks the patch server in the
# background and downloads a new patch set for the next launch.
#
# Server: https://pallet-patches.jdohertybiochem.workers.dev (Cloudflare Worker
# + R2, workers/pallet-patches/; published by tools/native/publish_patch.mjs).
#   GET /manifest.json?ch=<channel>  -> {v, channel, date, git, built_at, engine,
#       proj, format, notes, packs: [{name, file, sha256, size, src}]} (packs in
#       load order: base, plants, r_<region>..., cast, interiors, audio, code)
#   GET /packs/<file>                -> the pack (Range supported)
#
# Only the packs whose src id differs from the app's own (res://patch_base.json)
# are downloaded, in Range chunks appended to packs/<file>.part (so a download
# cut off by a closed app or lost signal resumes), checked against sha256 and
# then renamed into place. The set is stored as "next" in boot.gd's state and
# used from the next launch. No network: the check times out after 3 s and the
# game keeps what it has.
#
# For other scripts: status (text), signal status_changed(text), check(manual),
# version_text().
#
# Test overrides (desktop): env PALLET_PATCH_URL, PALLET_PATCH_CH.

signal status_changed(text: String)

const URL := "https://pallet-patches.jdohertybiochem.workers.dev"
const CHANNEL := "stable"
const DIR := "user://patches/"
const CHUNK := 4 * 1024 * 1024
const MANIFEST_TIMEOUT := 3.0
const RECHECK := 1800.0

var status := ""
var busy := false
var ready_v := -1          # a downloaded set waiting for a restart
var boot: Node
var url := URL
var channel := CHANNEL
var _req: HTTPRequest
var _toaster: UIToaster   # ui/ui_toast.gd

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	boot = get_node_or_null("/root/Boot")
	if OS.get_environment("PALLET_PATCH_URL") != "": url = OS.get_environment("PALLET_PATCH_URL").trim_suffix("/")
	if OS.get_environment("PALLET_PATCH_CH") != "": channel = OS.get_environment("PALLET_PATCH_CH")
	_req = HTTPRequest.new()
	_req.use_threads = true
	add_child(_req)
	_build_toast()
	if boot and not boot.load_error.is_empty():
		_set_status("The last update failed to load; back to the previous version")
	elif boot and not boot.state.get("next", {}).is_empty():
		ready_v = int(boot.state.next.v)
	else:
		_set_status("")
	if boot: _cleanup(true)   # packs left behind by a rollback
	var s := get_node_or_null("/root/Settings")
	var auto := s == null or int(s.get_value("auto_update")) == 1
	if s:   # switched on in the menu: check now
		s.changed.connect(func(k, v):
			if k != "auto_update": return
			if int(v) == 1 and not auto and not busy: check(false)
			auto = int(v) == 1)
	await get_tree().create_timer(2.0).timeout
	if auto: check(false)
	# a long session looks again now and then (and resumes a paused download)
	while true:
		await get_tree().create_timer(RECHECK).timeout
		if auto and ready_v < 0: check(false)

# "v12 · a1b2c3d" (the patch in use) or "app a1b2c3d" (the app's own files)
func version_text() -> String:
	if boot == null or boot.base.is_empty(): return "dev build"
	var a: Dictionary = boot.applied
	if a.is_empty(): return "app %s" % str(boot.base.get("build", "?")).left(7)
	return "v%d · %s" % [int(a.v), str(a.get("git", "")).left(7)]

func check(manual: bool) -> void:
	if busy or boot == null or boot.base.is_empty(): return
	busy = true
	_set_status("Checking for updates…")
	var res := await _get_manifest()
	var m = res[1]
	if res[0] != "":
		_set_status("Offline: playing %s" % version_text() if res[0] == "offline" else res[0])
	else:
		await _consider(m, manual)
	busy = false

func _get_manifest() -> Array:
	_req.download_file = ""
	_req.timeout = MANIFEST_TIMEOUT
	var err := _req.request("%s/manifest.json?ch=%s" % [url, channel.uri_encode()], ["Cache-Control: no-cache"])
	if err != OK: return ["offline", null]
	var r: Array = await _req.request_completed
	if r[0] != HTTPRequest.RESULT_SUCCESS: return ["offline", null]
	if r[1] == 404: return ["No updates published yet", null]
	if r[1] != 200: return ["Update server error (%d)" % r[1], null]
	var m = JSON.parse_string((r[3] as PackedByteArray).get_string_from_utf8())
	if not m is Dictionary or not m.get("packs") is Array or not m.has("v"): return ["Bad update manifest", null]
	return ["", m]

func _consider(m: Dictionary, manual: bool) -> void:
	var base: Dictionary = boot.base
	var state: Dictionary = boot.state
	var v := int(m.v)
	# older than this app (e.g. the last manifest before this app's format, or
	# a rollback to one): the app's own files are newer
	if float(m.get("built_at", 0)) < float(base.get("built_at", 0)):
		_set_status("Up to date (%s)" % version_text())
		return
	var fmt := int(boot.get("FORMAT")) if boot.get("FORMAT") != null else 1
	# a manifest for the apps before this one's format (made with older tools):
	# not for this app, and a reinstall would not help
	if int(m.get("format", 1)) < fmt:
		_set_status("Up to date (%s)" % version_text())
		return
	if str(m.get("engine")) != str(base.get("engine")) or str(m.get("proj")) != str(base.get("proj")) or int(m.get("format", 1)) != fmt:
		_set_status("Version %d needs a new install of the app" % v)
		if manual or state.get("told_install") != base.get("build"):
			state.told_install = base.get("build")
			boot.save_state()
			toast("A new version of the app is out: install it again from SideStore")
		return
	if state.get("bad", []).has(float(v)) or state.get("bad", []).has(v):
		_set_status("Version %d was rolled back on this phone" % v)
		return
	if not state.get("next", {}).is_empty() and int(state.next.v) == v:
		ready_v = v
		_set_status("Update v%d ready: restart to apply" % v)
		if manual: toast("Update ready: restart the game to apply")
		return
	var cur: Dictionary = boot.applied
	var need: Array = []
	for p in m.packs:
		if str(p.get("src")) != str(base.get("src", {}).get(p.get("name"), "-")): need.append(p)
	if (not cur.is_empty() and int(cur.v) == v) or (cur.is_empty() and need.is_empty()):
		_set_status("Up to date (%s)" % version_text())
		return
	var total := 0
	var fetch := []   # the packs not already here (others may come from an earlier set)
	for p in need:
		if _len(DIR + "packs/" + str(p.file)) != int(p.size):
			total += int(p.size)
			fetch.append(label(str(p.name)))
	state.dl = {"v": v, "packs": need}   # kept by _cleanup while it downloads
	boot.save_state()
	for i in need.size():
		var p: Dictionary = need[i]
		var ok := await _fetch(p, "%d of %d (%s)" % [i + 1, need.size(), label(str(p.name))])
		if not ok: return
	state.next = {"v": v, "format": int(m.get("format", 1)), "base": base.build, "built_at": m.get("built_at", 0), "git": m.get("git", ""),
		"date": m.get("date", ""), "notes": m.get("notes", []), "packs": need}
	state.erase("dl")
	boot.save_state()
	_cleanup()
	ready_v = v
	_set_status("Update v%d ready (%s downloaded%s): restart to apply" % [v, _mb(total), (": " + ", ".join(fetch)) if fetch else ""])
	toast("Update ready: restart the game to apply")

# one pack: Range chunks into <file>.part, sha256, rename
func _fetch(p: Dictionary, what: String) -> bool:
	var file := str(p.file)
	var size := int(p.size)
	var final := DIR + "packs/" + file
	if not file.is_valid_filename() or not file.ends_with(".pck"):
		_set_status("Bad pack name in the manifest"); return false
	if FileAccess.file_exists(final) and _len(final) == size: return true
	var part := final + ".part"
	var chunk := DIR + "chunk.tmp"
	var have := _len(part)
	if have > size: DirAccess.remove_absolute(part); have = 0
	_req.timeout = 60.0
	while have < size:
		_set_status("Downloading update %s: %s of %s" % [what, _mb(have), _mb(size)])
		_req.download_file = chunk
		var end := mini(have + CHUNK, size) - 1
		var err := _req.request("%s/packs/%s" % [url, file], ["Range: bytes=%d-%d" % [have, end]])
		var r: Array = [err, 0]
		if err == OK: r = await _req.request_completed
		_req.download_file = ""
		if r[0] != HTTPRequest.RESULT_SUCCESS or (r[1] != 206 and r[1] != 200):
			_set_status("Download paused (no connection): it will go on later")
			return false
		var bytes := FileAccess.get_file_as_bytes(chunk)
		DirAccess.remove_absolute(chunk)
		if r[1] == 200:   # the whole file (the server ignored the range)
			have = 0
			DirAccess.remove_absolute(part)
		var f := FileAccess.open(part, FileAccess.READ_WRITE) if FileAccess.file_exists(part) else FileAccess.open(part, FileAccess.WRITE)
		if f == null: _set_status("Cannot write the update (storage full?)"); return false
		f.seek_end()
		f.store_buffer(bytes)
		f.close()
		var now := _len(part)
		if now <= have: _set_status("Download stalled"); return false
		have = now
	_set_status("Checking update %s…" % what)
	if await _sha256(part) != str(p.sha256):
		DirAccess.remove_absolute(part)
		_set_status("Update download was damaged: it will start again later")
		return false
	DirAccess.rename_absolute(part, final)
	return true

# hashed a few MB per frame so the game keeps running
func _sha256(path: String) -> String:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null: return ""
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	var n := 0
	while f.get_position() < f.get_length():
		ctx.update(f.get_buffer(1024 * 1024))
		n += 1
		if n % 6 == 0: await get_tree().process_frame
	return ctx.finish().hex_encode()

# remove packs no set uses any more (and, after a download, stale .part files;
# at start they stay, so an interrupted download resumes)
func _cleanup(keep_parts := false) -> void:
	var keep := {}
	for k in ["cur", "prev", "next", "dl"]:
		var s = boot.state.get(k, {})
		if s is Dictionary:
			for p in s.get("packs", []): keep[str(p.file)] = true
	if boot.state.is_empty(): return
	for f in DirAccess.get_files_at(DIR + "packs"):
		if keep_parts and f.ends_with(".part"): continue
		if not keep.has(f.trim_suffix(".part")): DirAccess.remove_absolute(DIR + "packs/" + f)

# a pack's name for people: "r_route1_north" -> "route1 north"
static func label(name: String) -> String:
	return name.trim_prefix("r_").replace("_", " ")

func _len(path: String) -> int:
	if not FileAccess.file_exists(path): return 0
	var f := FileAccess.open(path, FileAccess.READ)
	return f.get_length() if f else 0

func _mb(b: int) -> String:
	return "%.1f MB" % (b / 1048576.0)

func _set_status(t: String) -> void:
	if t == "" and boot and not boot.applied.is_empty(): t = "Running %s" % version_text()
	status = t
	if t != "": print("[patch] ", t)
	status_changed.emit(t)

# ---------- toast ----------
func toast(t: String) -> void:
	_toaster.clear()
	_toaster.push("update", "Update", t, "", 6.4)

func _build_toast() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 95
	add_child(layer)
	_toaster = UIToaster.new()
	_toaster.anchor = "center"
	layer.add_child(_toaster)
