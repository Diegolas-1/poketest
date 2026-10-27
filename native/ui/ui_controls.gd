class_name UIControls
extends RefCounted
# Control-node wrappers of the drawn widgets, for screens built from nodes and
# for the gallery. Each one redraws only when a property changes.
#   UIControls.Badge      icon_id, text, accent, value (-1 = no bar), open
#   UIControls.Progress   value 0..1, accent, segments, label, icon_id (an animated fill)
#   UIControls.Prompt     label, action (the glyph's action), pops in when shown
#   UIControls.Card       title, body, footer, accent (wraps the body to its width)

class Badge extends Control:
	var icon_id := "bolt":
		set(v): icon_id = v; _changed()
	var text := "":
		set(v): text = v; _changed()
	var accent := UITheme.SKY:
		set(v): accent = v; _changed()
	var value := -1.0:
		set(v): value = v; queue_redraw()
	var open := false:
		set(v): open = v; queue_redraw()
	func _changed() -> void:
		custom_minimum_size = Vector2(UIWidgets.badge_width(text), 44.0)
		queue_redraw()
	func _draw() -> void:
		UIWidgets.badge(self, Vector2.ZERO, icon_id, text, accent, value, open)

class Progress extends Control:
	var value := 0.0:
		set(v): value = clampf(v, 0.0, 1.0); set_process(true)
	var accent := UITheme.GREEN:
		set(v): accent = v; queue_redraw()
	var segments := 10
	var label := ""
	var icon_id := "bolt"
	var _shown := 0.0
	func _ready() -> void:
		custom_minimum_size = Vector2(220, 20)
	func _process(dt: float) -> void:
		_shown = move_toward(_shown, value, dt / UITheme.SLOW)
		queue_redraw()
		if _shown == value: set_process(false)
	func _draw() -> void:
		UIWidgets.meter(self, Vector2(0, 3), size.x - 36.0 - (90.0 if label != "" else 0.0), _shown, accent, icon_id, label)

class Prompt extends Control:
	var label := "Talk":
		set(v): label = v; _t = 0.0; set_process(true)
	var action := "use"
	var _t := 0.0
	func _ready() -> void:
		custom_minimum_size = Vector2(200, 70)
		if UIInput.I: UIInput.I.device_changed.connect(func(_d): queue_redraw())
	func _process(dt: float) -> void:
		_t += dt
		queue_redraw()
		if _t > UITheme.POP: set_process(false)
	func _draw() -> void:
		var k := UITheme.ease_back(_t / UITheme.POP, 2.2)
		UITheme.prompt(self, Vector2(size.x * 0.5, size.y - 4.0), label, action, clampf(_t / UITheme.FAST, 0.0, 1.0), lerpf(0.6, 1.0, k))

class Card extends Control:
	var title := "":
		set(v): title = v; _changed()
	var body := "":
		set(v): body = v; _changed()
	var footer := "":
		set(v): footer = v; _changed()
	var accent := UITheme.SKY:
		set(v): accent = v; queue_redraw()
	var _rows := PackedStringArray()
	func _ready() -> void:
		resized.connect(_changed)
	func _changed() -> void:
		_rows = UITheme.wrap(body, "body", 19, maxf(60.0, size.x - 44.0))
		custom_minimum_size.y = UIWidgets.card_height(_rows.size(), footer != "")
		queue_redraw()
	func _draw() -> void:
		UIWidgets.card(self, Rect2(Vector2.ZERO, Vector2(size.x, UIWidgets.card_height(_rows.size(), footer != ""))), title, _rows, footer, accent, 34.0)
