extends Control
# The Battle Arena's HUD button (arena/arena.gd): STAGE A BATTLE, a slanted plate
# at the top middle of the screen with the pad's / keyboard's shortcut glyph,
# and the referee's "Stage a battle" prompt over his head when Ash is by him.

signal pressed

var ref_prompt := false
var ref_at := Vector2.ZERO
var t := 0.0
var _down := 0.0

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func rect() -> Rect2:
	var S := UITheme.safe_rect(self)
	var wd := 300.0
	return Rect2(S.position.x + (S.size.x - wd) * 0.5, S.position.y + 14.0, wd, 50.0)

func _process(dt: float) -> void:
	t += dt
	_down = maxf(0.0, _down - dt * 4.0)
	queue_redraw()

func _input(e: InputEvent) -> void:
	if not visible: return
	var pos := Vector2.INF
	if e is InputEventScreenTouch and e.pressed: pos = e.position
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: pos = e.position
	if pos == Vector2.INF: return
	var lp: Vector2 = get_global_transform_with_canvas().affine_inverse() * pos
	if UITheme.touch_rect(self, rect()).has_point(lp):
		_down = 1.0
		Sfx.ui("ui_confirm")
		pressed.emit()
		get_viewport().set_input_as_handled()

func _draw() -> void:
	var r := rect()
	var s := 1.0 - 0.04 * _down
	r = Rect2(r.get_center() - r.size * 0.5 * s, r.size * s)
	UITheme.shadow(self, UITheme.para_points(r), 1.0, Vector2(0, 4))
	UITheme.fill_v(self, UITheme.para_points(r), UITheme.WHITE, UITheme.PAPER)
	UITheme.accent_bar(self, r, UITheme.RED, 1.0, UITheme.SKEW, 7.0)
	UIWidgetsBall.ball(self, Vector2(r.position.x + 36.0, r.get_center().y), 13.0)
	UITheme.text_mid(self, Vector2(r.position.x + 60.0, r.get_center().y), "STAGE A BATTLE", "display", 28, UITheme.INK)
	if UIInput.device != "touch":
		UITheme.text_mid(self, Vector2(r.end.x - 22.0, r.get_center().y), "TAB" if UIInput.device == "keys" else "L3", "label", 15, UITheme.INK_SOFT, 2)
	if ref_prompt:
		UITheme.prompt(self, ref_at, "STAGE A BATTLE", "use", 1.0, 1.0)

# a tiny Poké Ball for the HUD
class UIWidgetsBall:
	static func ball(ci: CanvasItem, c: Vector2, r: float) -> void:
		PkmnHud.draw_ball(ci, c, r, "ok", false)
