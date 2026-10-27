class_name UIIconButton
extends BaseButton
# A HUD icon button: a UITheme.icon on a dark skewed plate (or a black pill
# when it hugs the Dynamic Island: pill = true), with a hover / focus edge,
# a press pop and an optional red "new" dot. Its touch area is never under
# 44 pt (hit_rect()), even when it is drawn smaller.
#   icon_id ("cog", "log", "ball", "close", ...), badge, pill, glyph (the action's
#   glyph drawn small at its corner on pad / keys, "" = none)

@export var icon_id := "cog":
	set(v): icon_id = v; queue_redraw()
@export var badge := false:
	set(v): badge = v; queue_redraw()
@export var pill := false:
	set(v): pill = v; queue_redraw()
@export var glyph := "":
	set(v): glyph = v; queue_redraw()

var _press := 0.0
var _pop := 1.0
var _over := false

func _ready() -> void:
	focus_mode = Control.FOCUS_NONE
	mouse_entered.connect(func(): _over = true; _kick())
	mouse_exited.connect(func(): _over = false; _kick())
	button_down.connect(func(): _press = 1.0; _kick())
	button_up.connect(func(): _pop = 0.0; _kick())
	if UIInput.I: UIInput.I.device_changed.connect(func(_d): queue_redraw())
	set_process(false)

func _kick() -> void:
	set_process(true); queue_redraw()

func hit_rect() -> Rect2:
	return UITheme.touch_rect(self, Rect2(position, size))

func _process(dt: float) -> void:
	_press = move_toward(_press, 1.0 if is_pressed() and get_draw_mode() == DRAW_PRESSED else 0.0, dt / UITheme.FAST)
	_pop = minf(1.0, _pop + dt / UITheme.POP)
	queue_redraw()
	if _press <= 0.0 and _pop >= 1.0: set_process(false)

func _draw() -> void:
	var c := size * 0.5
	var s := 1.0 - _press * 0.08
	if _pop < 1.0: s *= 1.0 + sin(_pop * PI) * 0.08
	draw_set_transform(c * (1.0 - s), 0.0, Vector2(s, s))
	var r := Rect2(Vector2.ZERO, size)
	if pill:
		draw_colored_polygon(UITheme.rounded_points(r, minf(size.x, size.y) * 0.5, 8), Color.BLACK)
	else:
		var pts := UITheme.plate(self, r, 1.0, UITheme.SKEW, UITheme.PLATE if not _over else UITheme.PLATE_HI)
		UITheme.outline(self, pts, Color(1, 1, 1, 0.16 if not _over else 0.5), 1.0)
		UITheme.para(self, Rect2(r.position.x, r.end.y - 3.0, r.size.x, 3.0), Color(UITheme.RED, 0.9))
	UITheme.icon(self, icon_id, c, minf(size.x, size.y) * 0.3, Color(UITheme.TEXT, 0.96))
	if badge:
		var bp := Vector2(size.x - 7.0, 7.0)
		UITheme.glow(self, bp, 9.0, UITheme.RED)
		draw_circle(bp, 8.0, Color.WHITE, true, -1.0, true)
		draw_circle(bp, 6.0, UITheme.RED, true, -1.0, true)
	if glyph != "" and UIInput.device != "touch":
		UITheme.glyph(self, Vector2(size.x - 4.0, size.y - 4.0), glyph, 20.0)
	draw_set_transform(Vector2.ZERO)
