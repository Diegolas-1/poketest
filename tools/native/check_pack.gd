extends SceneTree
# Checks exported packs the way the phone sees them (no source tree: only
# what is inside the packs), so a world that loads from the project folder but
# not from an export can never ship again. Run headless against the packs:
#
#   godot --headless --main-pack <first.pck> --script <abs path>/check_pack.gd -- --packs a.pck,b.pck
#
# (the main pack, e.g. the .ipa's PalletTown.pck or base.pck, then any more
# packs loaded over it in order, as boot.gd does). It checks, through the
# game's own loaders (WorldRegions):
# - every region in world.json has its region.json, and every region that
#   carries a town.glb / terrain.glb is found by WorldRegions.files() (the v28
#   bug: FileAccess cannot see imported files in a pack);
# - each of those scenes loads and has meshes; every dependency loads;
# - every imported resource under res://world/ (and cast/, interiors/) loads;
# - no texture is in a desktop-only GPU format (S3TC / RGTC / BPTC: iPhones
#   cannot use them).
# Exits 1 on any failure (prints what), 0 when all is well.

const DESKTOP_ONLY := [Image.FORMAT_DXT1, Image.FORMAT_DXT3, Image.FORMAT_DXT5,
	Image.FORMAT_RGTC_R, Image.FORMAT_RGTC_RG, Image.FORMAT_BPTC_RGBA,
	Image.FORMAT_BPTC_RGBF, Image.FORMAT_BPTC_RGBFU]

var errors: Array[String] = []
var checked_tex := {}
var n_res := 0

func fail(m: String) -> void:
	errors.append(m)
	printerr("check_pack: " + m)

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--packs" and i + 1 < args.size():
			for p in args[i + 1].split(",", false):
				if not ProjectSettings.load_resource_pack(p, true): fail("could not load pack " + p)
	_check_world()
	for d in ["res://world/", "res://cast/", "res://interiors/"]: _walk(d)
	print("check_pack: %d resources, %d textures checked, %d problems" % [n_res, checked_tex.size(), errors.size()])
	quit(1 if errors.size() > 0 else 0)

func _check_world() -> void:
	var WR = load("res://world_regions.gd")
	if WR == null: fail("res://world_regions.gd does not load"); return
	var meta: Dictionary = WR.meta()
	var ids: Array = meta.get("regions", [])
	if ids.is_empty(): fail("world.json lists no regions"); return
	var regions: Array = WR.regions()
	if regions.size() != ids.size(): fail("%d of %d regions found" % [regions.size(), ids.size()])
	for name in ["town.glb", "terrain.glb"]:
		var want := []
		for id in ids:
			var p := "res://world/r/%s/%s" % [id, name]
			if FileAccess.file_exists(p + ".import"): want.append(p)
		var got: PackedStringArray = WR.files(name)
		if want.is_empty(): fail("no region has " + name)
		if got.size() != want.size(): fail("WorldRegions.files(%s) finds %d of %d" % [name, got.size(), want.size()])
		for p in got: _check_scene(p)
	for p in [WR.BASE + "grass.png", WR.BASE + "dirt.webp", WR.BASE + "earth.webp", WR.BASE + "clouds.png", WR.BASE + "water.glb"]:
		if load(p) == null: fail("does not load: " + p)
	if WR.files("ink.bin").is_empty(): fail("no region has ink.bin")
	var vb: Array = WR.veg(false)
	if (vb[0] as Dictionary).get("sets", []).is_empty(): fail("no plants (veg) in the regions")

func _check_scene(p: String) -> void:
	var s = load(p)
	if not s is PackedScene: fail("does not load as a scene: " + p); return
	var n: Node = s.instantiate()
	var meshes := n.find_children("*", "MeshInstance3D", true, false)
	if n is MeshInstance3D: meshes.append(n)
	if meshes.is_empty(): fail("no meshes in " + p)
	n.free()

# every imported resource (its .import remap) in a folder of the packs
func _walk(dir: String) -> void:
	if not DirAccess.dir_exists_absolute(dir): return
	for f in DirAccess.get_files_at(dir):
		if not f.ends_with(".import"): continue
		var p := dir + f.trim_suffix(".import")
		n_res += 1
		var r = ResourceLoader.load(p)
		if r == null: fail("does not load: " + p); continue
		for d in ResourceLoader.get_dependencies(p):
			var dp := String(d).get_slice("::", 2) if String(d).contains("::") else String(d)
			if dp != "" and not ResourceLoader.exists(dp): fail("%s needs %s, which is not in the packs" % [p, dp])
		if r is CompressedTexture2D: _check_tex(p)
	for d in DirAccess.get_directories_at(dir): _walk(dir + d + "/")

# the imported texture's GPU format, from its .ctex header (GST2)
func _check_tex(p: String) -> void:
	if checked_tex.has(p): return
	checked_tex[p] = true
	var cf := ConfigFile.new()
	if cf.load(p + ".import") != OK: fail("unreadable " + p + ".import"); return
	var dest: String = cf.get_value("remap", "path", "")
	if dest == "":
		# a texture imported per platform: path.<fmt>; the export keeps the phone's
		for k in cf.get_section_keys("remap"):
			if k.begins_with("path."):
				dest = cf.get_value("remap", k)
				if FileAccess.file_exists(dest): break
	var f := FileAccess.open(dest, FileAccess.READ)
	if f == null: fail("%s: its picture %s is not in the packs" % [p, dest]); return
	if f.get_buffer(4).get_string_from_ascii() != "GST2": fail("%s: not a GST2 texture" % p); return
	f.seek(4 + 4 * 4 + 4 + 4 * 3)   # version, w, h, flags, mip limit, 3 reserved
	f.get_32()   # data format (image, png, webp, basis)
	f.get_16(); f.get_16(); f.get_32()   # w, h, mipmaps
	var fmt := f.get_32()
	if fmt in DESKTOP_ONLY:
		fail("%s is in a desktop-only GPU format (%d): import ETC2/ASTC for the phone" % [p, fmt])
