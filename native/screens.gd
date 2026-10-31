class_name Screens
extends Node
# The main scene (screens.tscn): where the game's picture goes.
#
# The game (main.tscn: the world, the HUD, the Dynamic Island) always renders into
# one SubViewport, "Game". On the phone alone it is the phone's size and its
# picture fills the phone (a TextureRect, pixel for pixel), with every input passed
# in, so the game sees exactly what it saw as the main scene.
#
# With a TV (tv/tv_link.gd: AirPlay or a USB-C / HDMI adapter on the phone, a second
# window on a desktop with -- --fake-tv=1920x1080) the same SubViewport is resized
# to the TV's shape and its picture goes to the TV instead: the world, the camera's
# aspect and field of view (the bike's widening too) and the whole HUD laid out for
# the TV's 16:9 inside its safe margin (UITheme.safe_rect reads the "tv_safe" meta).
# Nothing in the game is moved or rebuilt, so connecting and disconnecting mid-game
# loses nothing. The phone then shows the companion (tv/companion.gd: the start
# menu, a live preview, Pause), keeps the Dynamic Island's compass (island.gd moves
# to the phone), stays awake, and the controller keeps playing on the TV (pad and
# keyboard input go to the game; touches stay on the phone). Start pauses and
# resumes the game on the TV. The game is capped at the TV's refresh (60 Hz on
# most TVs; Settings tv_fps); without a TV the phone runs at its own 120 Hz.
#
#   Screens.I            the instance (null when a test runs main.tscn directly)
#   Screens.on_tv()      true while the game is on a TV
#   game                 the SubViewport; main: the game's Main node
#   tv                   the TVLink
#   pause_tv(on)         pause / resume the game from the phone (or Start)
#   signal tv_changed(on)

signal tv_changed(on: bool)

const TVCard := preload("res://tv/tv_card.gd")
const Companion := preload("res://tv/companion.gd")

static var I: Screens = null

var game: SubViewport
var main: Node
var view: TextureRect
var tv: TVLink
var companion: CanvasLayer
var card: CanvasLayer
var tv_on := false
var tv_paused := false   # paused from the phone or with Start (not by a menu of the game's)
var _was_paused := false
var _keep_on := false
var _size_key := ""

static func on_tv() -> bool:
	return I != null and I.tv_on

func _enter_tree() -> void:
	I = self

func _exit_tree() -> void:
	if I == self: I = null

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var root: Window = get_tree().root
	# the phone's own viewport draws only 2D: the game's picture and the phone's UI
	root.disable_3d = true
	root.audio_listener_enable_3d = false
	game = SubViewport.new()
	game.name = "Game"
	game.process_mode = Node.PROCESS_MODE_PAUSABLE   # (as the main scene was: pauses with the tree)
	game.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	game.handle_input_locally = true
	game.audio_listener_enable_3d = true
	game.audio_listener_enable_2d = true
	game.size_2d_override_stretch = true
	# what the main window had from the project settings
	game.positional_shadow_atlas_size = root.positional_shadow_atlas_size
	game.positional_shadow_atlas_16_bits = root.positional_shadow_atlas_16_bits
	game.use_occlusion_culling = root.use_occlusion_culling
	game.mesh_lod_threshold = root.mesh_lod_threshold
	game.canvas_item_default_texture_filter = root.canvas_item_default_texture_filter
	game.canvas_item_default_texture_repeat = root.canvas_item_default_texture_repeat
	game.use_debanding = root.use_debanding
	game.snap_2d_transforms_to_pixel = root.snap_2d_transforms_to_pixel
	game.snap_2d_vertices_to_pixel = root.snap_2d_vertices_to_pixel
	add_child(game)
	# the game's picture on the phone
	view = TextureRect.new()
	view.name = "GameView"
	view.set_anchors_preset(Control.PRESET_FULL_RECT)
	view.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	view.stretch_mode = TextureRect.STRETCH_SCALE
	view.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST   # (1:1 with the screen's pixels)
	view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	view.texture = game.get_texture()
	add_child(view)
	_fit()
	root.size_changed.connect(_fit)
	Settings.use_viewport(game)
	tv = TVLink.new()
	tv.name = "TVLink"
	add_child(tv)
	tv.bind(game)
	tv.changed.connect(_on_tv_changed)
	main = load("res://main.tscn").instantiate()
	game.add_child(main)
	card = TVCard.new()
	card.screens = self
	game.add_child(card)
	companion = Companion.new()
	companion.screens = self
	add_child(companion)
	Settings.changed.connect(func(k, _v):
		if k in ["tv_margin", "tv_res"] and tv_on:
			_size_key = ""
			_fit()
			if k == "tv_res": _tv_mode())
	if tv.connected(): _on_tv_changed.call_deferred()

# ---------- sizes ----------
# the 2D canvas the way the project stretches the window: 1280 x 720 at the least,
# wider (or taller) to the screen's shape
static func canvas_for(px: Vector2) -> Vector2:
	var base := Vector2(ProjectSettings.get_setting("display/window/size/viewport_width", 1280), ProjectSettings.get_setting("display/window/size/viewport_height", 720))
	var a := px.x / maxf(1.0, px.y)
	if a >= base.x / base.y: return Vector2(roundf(base.y * a), base.y)
	return Vector2(base.x, roundf(base.x / a))

# the TV's picture size: its own pixels, but never past tv_lines() (a 4K TV gets a
# 1080p frame scaled up on the GPU; the 3D render scale and upscaler apply on top)
static func tv_render_size(px: Vector2i, lines := 1080) -> Vector2i:
	var s := minf(1.0, float(lines) / maxf(1.0, float(px.y)))
	return Vector2i(maxi(64, roundi(px.x * s)), maxi(64, roundi(px.y * s)))

func _fit() -> void:
	var root: Window = get_tree().root
	var key: String
	if tv_on:
		var px := Vector2i(int(tv.status.width), int(tv.status.height))
		var rs := tv_render_size(px, tv_lines())
		var c := canvas_for(Vector2(px))
		key = "tv|%s|%s|%s" % [rs, c, Settings.get_value("tv_margin")]
		if key == _size_key: return
		_size_key = key
		game.size = rs
		game.size_2d_override = Vector2i(c)
		game.set_meta("tv", true)
		game.set_meta("tv_safe", tv_safe_rect(c))
	else:
		var px2 := root.size
		var vis := root.get_visible_rect().size
		key = "phone|%s|%s" % [px2, vis]
		if key == _size_key: return
		_size_key = key
		game.size = px2
		game.size_2d_override = Vector2i(vis.round())
		if game.has_meta("tv"): game.remove_meta("tv")
		if game.has_meta("tv_safe"): game.remove_meta("tv_safe")

# The TV picture's height (Settings tv_res). AirPlay re-encodes the whole external
# screen as video over Wi-Fi: at 1080p, full-screen motion with grass and fine ink
# lines is hard on the encoder and the picture stutters. "auto" = 720p on AirPlay
# (the TV's mode too, so less is encoded and sent), 1080p on a cable.
func tv_lines() -> int:
	var v = Settings.get_value("tv_res")
	if str(v) == "auto": return 720 if String(tv.status.route) == "airplay" else 1080
	return int(v)

func _tv_mode() -> void:
	# the mode asked of the TV: on AirPlay (or when picked), no taller than the picture
	var v = Settings.get_value("tv_res")
	var airplay := String(tv.status.route) == "airplay"
	tv.set_mode_height(tv_lines() if airplay or str(v) != "auto" else 0)

# the HUD's area on the TV: the TV's own overscan insets if it reports any, at
# least the margin from Settings (tv_margin, % of each side)
func tv_safe_rect(c: Vector2) -> Rect2:
	var m := float(Settings.get_value("tv_margin")) / 100.0
	var ins: Rect2 = tv.status.get("insets", Rect2())
	var px := Vector2(maxf(1.0, float(tv.status.width)), maxf(1.0, float(tv.status.height)))
	var k := c / px
	var l := maxf(c.x * m, ins.position.x * k.x)
	var t := maxf(c.y * m, ins.position.y * k.y)
	var r := maxf(c.x * m, ins.size.x * k.x)
	var b := maxf(c.y * m, ins.size.y * k.y)
	return Rect2(l, t, c.x - l - r, c.y - t - b)

# ---------- the TV coming and going ----------
func _on_tv_changed() -> void:
	var want := tv.connected()
	if want == tv_on:
		if want:
			_fit()
			companion.refresh()
		return
	if want: _to_tv()
	else: _to_phone()

func _to_tv() -> void:
	tv_on = true
	_size_key = ""
	_fit()
	view.visible = false
	view.texture = null   # (the phone no longer samples the game's picture)
	_island_to(self)
	_keep_on = DisplayServer.screen_is_kept_on()
	DisplayServer.screen_set_keep_on(true)
	Settings.set_tv_hz(maxi(30, int(tv.status.hz)), tv.paced)
	_tv_mode()
	tv.set_active(true)
	companion.show_companion(true)
	card.connected()
	Sfx.ui("ui_menu_open")
	tv_changed.emit(true)
	print("[tv] on %s: %d x %d, game %s, canvas %s" % [tv.display_name(), tv.status.width, tv.status.height, game.size, game.size_2d_override])

func _to_phone() -> void:
	tv_on = false
	if tv_paused: pause_tv(false)
	tv.set_active(false)
	_size_key = ""
	_fit()
	view.texture = game.get_texture()
	view.visible = true
	_island_to(main)
	DisplayServer.screen_set_keep_on(_keep_on)
	Settings.set_tv_hz(0)
	companion.show_companion(false)
	card.disconnected()
	tv_changed.emit(false)
	print("[tv] back on the phone: game %s" % [game.size])

# the Dynamic Island's HUD belongs to the phone: on a TV it moves out of the game's
# viewport into the phone's, its menu off (the companion is the menu there)
func _island_to(parent: Node) -> void:
	var isl = main.get("island") if main else null
	if isl == null or not is_instance_valid(isl): return
	if isl.has_method("set_tv"): isl.set_tv(parent == self)
	if isl.get_parent() != parent: isl.reparent(parent, false)

func pause_tv(on: bool) -> void:
	if on == tv_paused: return
	tv_paused = on
	if on:
		_was_paused = get_tree().paused
		get_tree().paused = true
		Sfx.ui("ui_menu_open")
	else:
		get_tree().paused = _was_paused
		Sfx.ui("ui_menu_close")
	card.queue_redraw()
	companion.refresh()

# ---------- input ----------
# Everything reaches the game as if it were the main scene (it is drawn the same
# size, so positions need no change). On a TV, touches stay on the phone; the
# controller and the keyboard play the game, and Start pauses.
func _input(e: InputEvent) -> void:
	var pointer := e is InputEventScreenTouch or e is InputEventScreenDrag or e is InputEventMouse or e is InputEventGesture
	if tv_on:
		if pointer: return
		if e.is_action_pressed("menu") and not _menu_open():
			pause_tv(not tv_paused)
			get_viewport().set_input_as_handled()
			return
		if tv_paused and (e.is_action_pressed("back") or e.is_action_pressed("ui_cancel")):
			pause_tv(false)
			get_viewport().set_input_as_handled()
			return
	if game == null or not game.is_inside_tree(): return
	game.push_input(e, true)
	if game.is_input_handled(): get_viewport().set_input_as_handled()

func _menu_open() -> bool:
	return Settings.menu != null and Settings.menu.root != null and Settings.menu.root.visible
