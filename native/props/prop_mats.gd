class_name PropMats
extends RefCounted
# The props library's shared materials (props/*): one of each, made once, so a
# whole palette costs a handful of draw calls. They are the baked plants' own
# shaders (veg.gd: veg_solid for bark and painted wood, veg_leaf for cards) with
# the cel bands copied from the baked trees' materials, so a log or a stump
# sits with the trees as one painting: the same bands, the same distance
# dither, the same slide when a battle's arena opens round the spot.
#
#   PropMats.setup(game)            find the baked trees' materials to copy (once)
#   PropMats.bark("bark_5166...png")    bark (a world/plants texture)
#   PropMats.vc()                   flat painted parts by vertex colour (cut wood, caps, moss)
#   PropMats.leaf(atlas, tint)      leaf cards from an atlas (cut out, both sides lit)
#   PropMats.shaft()                a sun shaft: an additive beam through the canopy
#   PropMats.silk()                 a thread of silk (a cocoon's)
#   PropMats.pool()                 dappled sunlight on the floor (a few soft warm blobs)

const PLANTS := "res://world/plants/"
const ATLAS := "res://props/forest/forest_atlas.png"
const LEAF_GREEN := "res://world/plants/leaf_green_23b9e9a194403acc.png"
const SHAFT := preload("res://props/shaders/sun_shaft.gdshader")
const POOL := preload("res://props/shaders/sun_pool.gdshader")

# the atlas tiles (uv rects): the forest's own, and the baked green leaves'
const T_LITTER := Rect2(0.0, 0.0, 0.5, 0.5)
const T_MOSS := Rect2(0.5, 0.0, 0.5, 0.5)
const T_SHAFT := Rect2(0.0, 0.5, 0.5, 0.5)
const T_TWIGS := Rect2(0.5, 0.5, 0.5, 0.5)
const G_FROND := Rect2(0.5, 0.5, 0.25, 0.25)      # (leaf_green: a long fern frond)
const G_FAN := Rect2(0.75, 0.5, 0.25, 0.25)       # (leaflets fanning from a stem)
const G_CLOVER := Rect2(0.0, 0.75, 0.25, 0.25)
const G_HEARTS := Rect2(0.25, 0.75, 0.25, 0.25)
const G_PUFF := Rect2(0.0, 0.0, 0.25, 0.25)       # (a leafy puff, a bush's)
const G_DARK := Rect2(0.75, 0.0, 0.25, 0.25)      # (tall dark leaves)

static var _ref_bark: ShaderMaterial = null
static var _ref_leaf: ShaderMaterial = null
static var _cache := {}

static func setup(game: Node) -> void:
	if _ref_bark and _ref_leaf: return
	var veg: Node = game.scenery.veg if game and game.get("scenery") and game.scenery else null
	if veg == null: return
	for mi in veg.find_children("*", "MultiMeshInstance3D", true, false):
		var m = (mi as MultiMeshInstance3D).material_override
		if not m is ShaderMaterial: continue
		var sm: ShaderMaterial = m
		if sm.shader == preload("res://veg.gd").SOLID and _ref_bark == null and bool(sm.get_shader_parameter("use_tex")): _ref_bark = sm
		if sm.shader == preload("res://veg.gd").LEAF and _ref_leaf == null and String((sm.get_shader_parameter("albedo_tex") as Texture2D).resource_path if sm.get_shader_parameter("albedo_tex") else "").contains("leaf_green"): _ref_leaf = sm
		if _ref_bark and _ref_leaf: break

static func _solid() -> ShaderMaterial:
	var m: ShaderMaterial
	if _ref_bark: m = _ref_bark.duplicate()
	else:
		m = ShaderMaterial.new()
		m.shader = preload("res://veg.gd").SOLID
		m.set_shader_parameter("bands", Vector3(0.1, 0.3, 0.6))
		m.set_shader_parameter("deep", Vector3(0.4, 0.48, 0.62))
		m.set_shader_parameter("shade", Vector3(0.6, 0.68, 0.82))
		m.set_shader_parameter("lit", Vector3(1.12, 1.1, 1.0))
	m.set_shader_parameter("wind", 0.0)
	m.set_shader_parameter("shrink", 1.0)
	m.set_shader_parameter("fade", Vector2(80.0, 90.0))
	return m

static func bark(tex: String, mossy := true) -> ShaderMaterial:
	var key := "bark|" + tex + str(mossy)
	if _cache.has(key): return _cache[key]
	var m := _solid()
	m.set_shader_parameter("bark_tex", load(PLANTS + tex))
	m.set_shader_parameter("use_tex", true)
	m.set_shader_parameter("use_vc", true)
	m.set_shader_parameter("mossy", mossy)
	m.set_shader_parameter("color", Color.WHITE)
	_cache[key] = m
	return m

static func vc() -> ShaderMaterial:
	if _cache.has("vc"): return _cache.vc
	var m := _solid()
	m.set_shader_parameter("use_tex", false)
	m.set_shader_parameter("use_vc", true)
	m.set_shader_parameter("mossy", false)
	m.set_shader_parameter("color", Color.WHITE)
	m.set_shader_parameter("detail", 0.0)
	_cache.vc = m
	return m

static func leaf(atlas := ATLAS, tint := Color.WHITE, fade := Vector2(60.0, 66.0)) -> ShaderMaterial:
	var key := "leaf|%s|%s|%s" % [atlas, tint.to_html(), str(fade)]
	if _cache.has(key): return _cache[key]
	var m: ShaderMaterial
	if _ref_leaf: m = _ref_leaf.duplicate()
	else:
		m = ShaderMaterial.new()
		m.shader = preload("res://veg.gd").LEAF
		m.set_shader_parameter("bands", Vector3(0.24, 0.44, 0.57))
		m.set_shader_parameter("deep", Vector3(0.13, 0.33, 0.6))
		m.set_shader_parameter("shade", Vector3(0.36, 0.66, 0.9))
		m.set_shader_parameter("lit", Vector3(1.45, 1.3, 0.62))
	m.set_shader_parameter("albedo_tex", load(atlas))
	m.set_shader_parameter("tint", tint)
	m.set_shader_parameter("wind", 0.02)
	m.set_shader_parameter("shrink", 0.4)
	m.set_shader_parameter("fade", fade)
	_cache[key] = m
	return m

static func shaft() -> ShaderMaterial:
	if _cache.has("shaft"): return _cache.shaft
	var m := ShaderMaterial.new()
	m.shader = SHAFT
	m.set_shader_parameter("tex", load(ATLAS))
	m.set_shader_parameter("tile", Vector4(T_SHAFT.position.x, T_SHAFT.position.y, T_SHAFT.size.x, T_SHAFT.size.y))
	m.set_shader_parameter("power", 0.34)
	_cache.shaft = m
	return m

static func pool() -> ShaderMaterial:
	if _cache.has("pool"): return _cache.pool
	var m := ShaderMaterial.new()
	m.shader = POOL
	_cache.pool = m
	return m

static func silk() -> StandardMaterial3D:
	if _cache.has("silk"): return _cache.silk
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(0.97, 0.97, 0.92, 0.85)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	_cache.silk = m
	return m
