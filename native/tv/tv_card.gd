extends CanvasLayer
# What the TV shows over the game (made by screens.gd, inside the game's viewport,
# so it is laid out on the TV's own 16:9 canvas and safe margin):
#   - for a few seconds after the TV connects, a banner: "On the TV", the phone has
#     the menu, Start pauses
#   - while the game is paused from the phone or with Start: the pause screen
#   - with Settings tv_debug on: the pacing overlay (top left): the game's frame time,
#     frames shown, repeated and dropped per second, the TV link's measured rate
# Nothing is drawn while the game is on the phone.

var screens: Node
var draw_c: Control
var dim: ColorRect
var _banner_t := 99.0
var _pause_a := 0.0
var _dbg_t := -1.0

const BANNER := 4.5

func _ready() -> void:
	layer = 110
	process_mode = Node.PROCESS_MODE_ALWAYS
	dim = UITheme.scrim()
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dim.modulate.a = 0.0
	dim.visible = false
	add_child(dim)
	draw_c = Control.new()
	draw_c.set_anchors_preset(Control.PRESET_FULL_RECT)
	draw_c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	draw_c.draw.connect(_draw_card)
	add_child(draw_c)

func connected() -> void:
	_banner_t = 0.0
	draw_c.queue_redraw()

func disconnected() -> void:
	_banner_t = 99.0
	_pause_a = 0.0
	dim.visible = false
	draw_c.queue_redraw()

func queue_redraw() -> void:
	draw_c.queue_redraw()

func _process(dt: float) -> void:
	var on_tv: bool = screens != null and screens.tv_on
	var want := 1.0 if on_tv and screens.tv_paused else 0.0
	var was := _pause_a
	_pause_a = move_toward(_pause_a, want, dt / UITheme.BASE)
	dim.visible = _pause_a > 0.001
	dim.modulate.a = UITheme.ease_out(_pause_a)
	if _banner_t < BANNER + 0.5 or _pause_a != was:
		_banner_t += dt
		draw_c.queue_redraw()
	if on_tv and int(Settings.get_value("tv_debug")) == 1:
		_dbg_t -= dt
		if _dbg_t <= 0.0:
			_dbg_t = 0.25
			draw_c.queue_redraw()
	elif _dbg_t > -1.0:
		_dbg_t = -1.0
		draw_c.queue_redraw()

func _draw_card() -> void:
	if screens == null or not screens.tv_on: return
	var S := UITheme.safe_rect(draw_c)
	if int(Settings.get_value("tv_debug")) == 1: _draw_debug(S)
	# the banner: slides in from the left, holds, slides back
	if _banner_t < BANNER + 0.5:
		var k := UITheme.envelope(_banner_t, 0.35, BANNER - 0.8, 0.45)
		if k > 0.001:
			var w := 560.0
			var h := 92.0
			# (at the bottom, in the middle: the HUD's corners have the badges and the clock)
			var r := Rect2(S.get_center().x - w * 0.5, S.end.y - h - 26.0 + (1.0 - UITheme.ease_out_expo(k)) * 60.0, w, h)
			var pts := UITheme.plate(draw_c, r, k, UITheme.SKEW, UITheme.PLATE, UITheme.CUT)
			UITheme.outline(draw_c, pts, Color(1, 1, 1, 0.16 * k), 1.0)
			UITheme.accent_bar(draw_c, r, Color(UITheme.YELLOW, k), 1.0, UITheme.SKEW, UITheme.BAR)
			UIWidgets.icon_disc(draw_c, Vector2(r.position.x + 58.0, r.get_center().y), 28.0, UITheme.SKY, "", k)
			UITheme.icon(draw_c, "tv", Vector2(r.position.x + 58.0, r.get_center().y), 15.0, Color(1, 1, 1, k))
			UITheme.text(draw_c, Vector2(r.position.x + 104.0, r.position.y + 42.0), "NOW PLAYING ON THE TV", "display", 30, Color(UITheme.TEXT, k))
			var y := r.position.y + 72.0
			var line := "The menu is on your phone  ·  "
			UITheme.text(draw_c, Vector2(r.position.x + 106.0, y), line, "body", 19, Color(UITheme.TEXT_DIM, k))
			var x := r.position.x + 106.0 + UITheme.text_w(line, "body", 19)
			var gw := UITheme.glyph(draw_c, Vector2(x + 14.0, y - 6.0), "menu", 26.0, k, "pad")
			UITheme.text(draw_c, Vector2(x + 8.0 + gw, y), "pauses", "body", 19, Color(UITheme.TEXT_DIM, k))
	# the pause screen
	if _pause_a > 0.001:
		var a := UITheme.ease_out(_pause_a)
		var c := S.get_center()
		var pr := Rect2(c.x - 330.0, c.y - 110.0 + (1.0 - a) * 24.0, 660.0, 220.0)
		var pts2 := UITheme.plate(draw_c, pr, a, UITheme.SKEW, UITheme.PLATE_HI, UITheme.CUT)
		UITheme.outline(draw_c, pts2, Color(1, 1, 1, 0.18 * a), 1.0)
		UITheme.accent_bar(draw_c, pr, Color(UITheme.RED, a), 1.0, UITheme.SKEW, UITheme.BAR)
		UIDialogPanel._ball_mark(draw_c, Vector2(pr.end.x - 70.0, pr.get_center().y), 150.0, Color(1, 1, 1, 0.04 * a))
		UITheme.icon(draw_c, "pause", Vector2(pr.position.x + 92.0, pr.position.y + 84.0), 26.0, Color(UITheme.YELLOW, a))
		UITheme.text(draw_c, Vector2(pr.position.x + 140.0, pr.position.y + 108.0), "PAUSED", "display", UITheme.fs("hero"), Color(UITheme.TEXT, a))
		var pw := UITheme.text_w("PAUSED", "display", UITheme.fs("hero"))
		UITheme.chevrons(draw_c, Vector2(pr.position.x + 160.0 + pw, pr.position.y + 72.0), 34.0, Color(UITheme.RED, a), 3)
		var y2 := pr.position.y + 170.0
		var gw2 := UITheme.glyph(draw_c, Vector2(pr.position.x + 108.0, y2 - 7.0), "menu", 30.0, a, "pad")
		UITheme.text(draw_c, Vector2(pr.position.x + 116.0 + gw2 * 0.5 + 10.0, y2), "RESUME", "label", 22, Color(UITheme.TEXT, a))
		var x2 := pr.position.x + 116.0 + gw2 * 0.5 + 10.0 + UITheme.text_w("RESUME", "label", 22) + 34.0
		UITheme.icon(draw_c, "phone", Vector2(x2 + 10.0, y2 - 7.0), 11.0, Color(UITheme.TEXT_DIM, a))
		UITheme.text(draw_c, Vector2(x2 + 26.0, y2), "Menu on your phone", "body", 20, Color(UITheme.TEXT_DIM, a))

# the pacing overlay: numbers the player can read off the TV and tell us
func _draw_debug(S: Rect2) -> void:
	var st: Dictionary = screens.tv.stats()
	var lines := [
		"TV %d×%d  %s  link %.1f Hz" % [st.width, st.height, String(st.route).to_upper(), st.link_hz],
		"game frame %.1f ms  (engine %d fps)" % [st.game_ms, Engine.get_frames_per_second()],
		"shown %.0f/s  repeated %.0f/s  dropped %.0f/s  late %.0f/s" % [st.presented, st.repeated, st.skipped, st.late],
		"%s  %s  render %d×%d" % ["paced by the TV" if st.paced else "unpaced", st.backend, screens.game.size.x, screens.game.size.y],
	]
	var r := Rect2(Vector2(S.get_center().x - 245.0, S.position.y), Vector2(490, 18 + lines.size() * 24))
	draw_c.draw_rect(r, Color(0, 0, 0, 0.62))
	var bad: bool = float(st.repeated) > 1.5 or float(st.skipped) > 0.5
	draw_c.draw_rect(Rect2(r.position, Vector2(4, r.size.y)), UITheme.RED if bad else UITheme.GREEN)
	for i in lines.size():
		UITheme.text(draw_c, r.position + Vector2(14, 26 + i * 24), lines[i], "number", 18, UITheme.TEXT)
