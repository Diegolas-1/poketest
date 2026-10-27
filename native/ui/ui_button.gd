class_name UIButton
extends BaseButton
# A skewed, icon-first button with sharp hover / press / focus states and a
# scale pop on press. At least 44 pt tall for touch (custom_minimum_size).
#   text, icon_id (a UITheme.icon id, "" = none), glyph (an action whose button
#   glyph is shown at the right on pad / keys, e.g. "use", "back"; "" = none)
#   variant "primary" (red), "secondary" (dark plate), "light" (on a white panel),
#   "ghost" (outline only), "yellow"
#   badge: true = a red dot (something new)
# signals: BaseButton's (pressed, toggled...). Redraws only on change or while animating.

@export var text := "":
	set(v): text = v; update_minimum_size(); queue_redraw()
@export var icon_id := "":
	set(v): icon_id = v; update_minimum_size(); queue_redraw()
@export var glyph := "":
	set(v): glyph = v; update_minimum_size(); queue_redraw()
@export_enum("primary", "secondary", "light", "ghost", "yellow") var variant := "secondary":
	set(v): variant = v; queue_redraw()
@export var font_size := 22:
	set(v): font_size = v; update_minimum_size(); queue_redraw()
@export var badge := false:
	set(v): badge = v; queue_redraw()
@export var skew := UITheme.SKEW

var _hover := 0.0
var _press := 0.0
var _pop := 1.0
var _over := false

func _ready() -> void:
	focus_mode = Control.FOCUS_ALL
	mouse_entered.connect(func(): _over = true; _kick())
	mouse_exited.connect(func(): _over = false; _kick())
	focus_entered.connect(_kick)
	focus_exited.connect(_kick)
	button_down.connect(func(): _pop = 0.0; _kick())
	button_up.connect(_kick)
	toggled.connect(func(_on): _kick())
	if UIInput.I: UIInput.I.device_changed.connect(func(_d): update_minimum_size(); queue_redraw())
	set_process(false)

func _kick() -> void:
	set_process(true)
	queue_redraw()

func _get_minimum_size() -> Vector2:
	var w := 32.0
	if icon_id != "": w += 30.0
	if text != "": w += UITheme.text_w(text.to_upper(), "label", font_size) + (10.0 if icon_id != "" else 0.0)
	if glyph != "" and UIInput.device != "touch": w += 40.0
	return Vector2(maxf(w, 56.0), 56.0)

func _process(dt: float) -> void:
	var hv := 1.0 if (_over or has_focus()) and not disabled else 0.0
	var pr := 1.0 if (button_pressed and not toggle_mode) or (is_hovered() and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and not disabled) else 0.0
	if get_draw_mode() == DRAW_PRESSED or get_draw_mode() == DRAW_HOVER_PRESSED: pr = 1.0
	_hover = move_toward(_hover, hv, dt / UITheme.FAST)
	_press = move_toward(_press, pr, dt / (UITheme.FAST * 0.5))
	_pop = minf(1.0, _pop + dt / UITheme.POP)
	queue_redraw()
	if _hover == hv and _press == pr and _pop >= 1.0: set_process(false)

func _draw() -> void:
	var on := toggle_mode and button_pressed
	var s := 1.0 - _press * 0.04 + (UITheme.ease_back(_pop, 3.0) - 1.0) * 0.06 if _pop < 1.0 else 1.0 - _press * 0.04
	var c := size * 0.5
	draw_set_transform(c * (1.0 - s), 0.0, Vector2(s, s))
	var r := Rect2(Vector2.ZERO, size)
	var a := 0.45 if disabled else 1.0
	var base: Color
	var fg: Color
	match variant:
		"primary": base = UITheme.RED; fg = Color.WHITE
		"light": base = Color(UITheme.INK, 0.07); fg = UITheme.INK
		"ghost": base = Color(0, 0, 0, 0); fg = UITheme.TEXT
		"yellow": base = UITheme.YELLOW; fg = UITheme.INK
		_: base = UITheme.PLATE_HI; fg = UITheme.TEXT
	if on:
		base = UITheme.WHITE if variant != "light" else UITheme.INK
		fg = UITheme.INK if variant != "light" else UITheme.WHITE
	base = base.lightened(0.1 * _hover).darkened(0.15 * _press)
	var pts := UITheme.para_points(r, skew)
	if base.a > 0.0:
		if variant != "light" and variant != "ghost": UITheme.shadow(self, pts, a * 0.7, Vector2(0, 3))
		UITheme.fill_v(self, pts, Color(base.lightened(0.05), base.a * a), Color(base, base.a * a))
	if variant == "ghost" or variant == "secondary": UITheme.outline(self, pts, Color(1, 1, 1, (0.16 + 0.3 * _hover) * a), 1.0)
	if on: UITheme.accent_bar(self, r, UITheme.RED, a, skew, 6.0)
	# focus / hover: a yellow edge and underline
	if _hover > 0.01:
		UITheme.outline(self, UITheme.para_points(r.grow(3.0), skew), Color(UITheme.YELLOW, _hover * a), 2.5)
	var x := 18.0
	if icon_id != "":
		UITheme.icon(self, icon_id, Vector2(x + 13.0, c.y), 12.0, Color(fg, a))
		x += 36.0
	if text != "":
		var tx := text.to_upper()
		if icon_id == "" and (glyph == "" or UIInput.device == "touch"):
			UITheme.text_mid(self, Vector2(c.x, c.y), tx, "label", font_size, Color(fg, a), 1)
		else:
			UITheme.text_mid(self, Vector2(x, c.y), tx, "label", font_size, Color(fg, a))
	if glyph != "" and UIInput.device != "touch":
		UITheme.glyph(self, Vector2(size.x - 28.0, c.y), glyph, 26.0, a)
	if badge:
		var bp := Vector2(size.x - 6.0, 6.0)
		draw_circle(bp, 8.0, Color.WHITE, true, -1.0, true)
		draw_circle(bp, 6.0, UITheme.RED, true, -1.0, true)
	draw_set_transform(Vector2.ZERO)
