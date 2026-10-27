class_name UIPanel
extends Container
# A panel that holds other controls (fitted inside its padding):
#   style "light"  crisp white with an accent bar and a chamfered corner (menus, cards)
#         "dark"   a layered translucent dark plate (HUD, overlays)
#         "accent" a solid accent plate (headers, call-outs)
#   accent, skew (0 = upright; UITheme.SKEW leans it), cut (chamfer), bar (accent bar width)
#   title: an optional header strip (big italic uppercase) with chevrons
# Redraws only when its size or a property changes.

@export_enum("light", "dark", "accent") var style := "light":
	set(v): style = v; queue_redraw()
@export var accent := UITheme.RED:
	set(v): accent = v; queue_redraw()
@export var skew := 0.0:
	set(v): skew = v; queue_redraw()
@export var cut := UITheme.CUT:
	set(v): cut = v; queue_redraw()
@export var bar := UITheme.BAR:
	set(v): bar = v; queue_redraw()
@export var title := "":
	set(v): title = v; queue_sort(); queue_redraw()
@export var padding := Vector4(24, 18, 24, 18):
	set(v): padding = v; queue_sort()

const TITLE_H := 54.0

func _notification(what: int) -> void:
	if what == NOTIFICATION_SORT_CHILDREN:
		var top := padding.y + (TITLE_H if title != "" else 0.0)
		var r := Rect2(padding.x, top, size.x - padding.x - padding.z, size.y - top - padding.w)
		for c in get_children():
			if c is Control and c.visible and not c.top_level: fit_child_in_rect(c, r)
	elif what == NOTIFICATION_RESIZED:
		queue_redraw()

func _get_minimum_size() -> Vector2:
	var m := Vector2.ZERO
	for c in get_children():
		if c is Control and c.visible: m = m.max(c.get_combined_minimum_size())
	return m + Vector2(padding.x + padding.z, padding.y + padding.w + (TITLE_H if title != "" else 0.0))

func _draw() -> void:
	var r := Rect2(Vector2.ZERO, size)
	match style:
		"dark":
			var pts := UITheme.plate(self, r, 1.0, skew, UITheme.PLATE, cut)
			UITheme.outline(self, pts, UITheme.PLATE_LINE, 1.0)
			if bar > 0.0: UITheme.accent_bar(self, r, accent, 1.0, skew, bar)
		"accent":
			var pts2 := UITheme.chamfer_points(r, cut, skew)
			UITheme.shadow(self, pts2)
			UITheme.fill_v(self, pts2, accent.lightened(0.08), accent.darkened(0.08))
		_:
			UITheme.panel(self, r, accent, 1.0, skew, cut, bar)
	if title != "":
		var dark := style != "light"
		var col := UITheme.TEXT if dark else UITheme.INK
		UITheme.text_mid(self, Vector2(padding.x + 4.0, padding.y + TITLE_H * 0.42), title.to_upper(), "display", UITheme.fs("title"), col)
		var tw := UITheme.text_w(title.to_upper(), "display", UITheme.fs("title"))
		UITheme.chevrons(self, Vector2(padding.x + tw + 22.0, padding.y + TITLE_H * 0.42), 20.0, accent, 3)
		draw_line(Vector2(padding.x, padding.y + TITLE_H - 6.0), Vector2(size.x - padding.z, padding.y + TITLE_H - 6.0), Color(col, 0.14), 1.5)
