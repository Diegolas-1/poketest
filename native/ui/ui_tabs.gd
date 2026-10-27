class_name UITabs
extends Control
# A row of skewed tabs: the selected one white with ink text and a red foot,
# the others dark plates; L / R (or Q / E) glyphs at the ends on pad / keys.
# Tap or click a tab; a parent forwards L / R with step(d).
#   tabs: Array of String (labels; a count shown as a chip: set counts[i])
#   selected: int; set_selected(i, emit := true); step(d)
# signal: tab_changed(index)

signal tab_changed(index: int)

var tabs: Array = []:
	set(v): tabs = v; counts.resize(v.size()); _kick()
var counts: Array = []       # optional numbers (-1 / null = none)
var selected := 0
var font_size := 21
var light := false           # on a light panel (selected tab = ink)
var _sel_x := -1.0           # the selection's animated position
var _sel_w := 0.0
var _rects: Array = []
var _hover := -1

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size.y = 52.0
	resized.connect(_kick)
	if UIInput.I: UIInput.I.device_changed.connect(func(_d): _kick())
	set_process(false)
	_kick.call_deferred()

func set_count(i: int, n) -> void:
	if i < counts.size() and counts[i] != n:
		counts[i] = n; _kick()

func set_selected(i: int, emit := true) -> void:
	i = clampi(i, 0, tabs.size() - 1)
	if i == selected: return
	selected = i
	Sfx.ui("ui_tab")
	_kick()
	if emit: tab_changed.emit(i)

func step(d: int) -> void:
	if tabs.is_empty(): return
	set_selected((selected + d + tabs.size()) % tabs.size())

func _kick() -> void:
	_layout()
	set_process(true)
	queue_redraw()

func _ends() -> bool: return UIInput.device != "touch"

func _layout() -> void:
	_rects.clear()
	var pad := 40.0 if _ends() else 0.0
	var avail := size.x - pad * 2.0
	var n := maxi(1, tabs.size())
	var gap := 6.0
	var w := (avail - gap * (n - 1)) / n
	for i in tabs.size():
		_rects.append(Rect2(pad + i * (w + gap), 0.0, w, size.y))

func _gui_input(e: InputEvent) -> void:
	var pos := Vector2.INF
	if e is InputEventScreenTouch and e.pressed: pos = e.position
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: pos = e.position
	elif e is InputEventMouseMotion:
		var h := -1
		for i in _rects.size():
			if (_rects[i] as Rect2).has_point(e.position): h = i
		if h != _hover: _hover = h; queue_redraw()
		return
	if pos == Vector2.INF: return
	for i in _rects.size():
		if (_rects[i] as Rect2).has_point(pos):
			set_selected(i)
			accept_event()
			return

func _process(dt: float) -> void:
	if _rects.is_empty() or selected >= _rects.size():
		set_process(false); return
	var r: Rect2 = _rects[selected]
	if _sel_x < 0.0: _sel_x = r.position.x; _sel_w = r.size.x
	var k := 1.0 - exp(-dt * 22.0)
	_sel_x = lerpf(_sel_x, r.position.x, k)
	_sel_w = lerpf(_sel_w, r.size.x, k)
	if absf(_sel_x - r.position.x) < 0.3 and absf(_sel_w - r.size.x) < 0.3:
		_sel_x = r.position.x; _sel_w = r.size.x
		set_process(false)
	queue_redraw()

var _laid := Vector2.ZERO
func _draw() -> void:
	if _rects.size() != tabs.size() or _laid != size:
		_laid = size
		_layout()
	for i in tabs.size():
		var r: Rect2 = _rects[i]
		if light:
			UITheme.para(self, r, Color(UITheme.INK, 0.1 if i == _hover else 0.06))
		else:
			var pts := UITheme.para_points(r)
			UITheme.fill(self, pts, UITheme.PLATE_HI if i == _hover else Color(1, 1, 1, 0.07))
	# the selection slides between tabs
	if selected < _rects.size():
		if _sel_x < 0.0 or is_nan(_sel_x): _sel_x = (_rects[selected] as Rect2).position.x; _sel_w = (_rects[selected] as Rect2).size.x
		var sr := Rect2(_sel_x if _sel_x >= 0.0 else (_rects[selected] as Rect2).position.x, 0.0, _sel_w if _sel_w > 0.0 else (_rects[selected] as Rect2).size.x, size.y)
		var pts2 := UITheme.para_points(sr)
		UITheme.shadow(self, pts2, 0.8, Vector2(0, 3))
		UITheme.fill_v(self, pts2, UITheme.INK.lightened(0.12) if light else UITheme.WHITE, UITheme.INK if light else UITheme.PAPER)
		UITheme.para(self, Rect2(sr.position.x, sr.end.y - 4.0, sr.size.x, 4.0), UITheme.RED)
	for i in tabs.size():
		var r: Rect2 = _rects[i]
		var on := i == selected
		var fg := (UITheme.WHITE if light else UITheme.INK) if on else (UITheme.INK if light else UITheme.TEXT)
		var s := String(tabs[i]).to_upper()
		var cnt = counts[i] if i < counts.size() else null
		var cs := "" if cnt == null or int(cnt) < 0 else str(cnt)
		var tw := UITheme.text_w(s, "label", font_size)
		var cw := UITheme.text_w(cs, "number", 15) + 14.0 if cs != "" else 0.0
		var x := r.get_center().x - (tw + (cw + 8.0 if cs != "" else 0.0)) * 0.5
		UITheme.text_mid(self, Vector2(x, r.get_center().y - 1.0), s, "label", font_size, fg)
		if cs != "":
			var cr := Rect2(x + tw + 8.0, r.get_center().y - 10.0, cw, 20.0)
			UITheme.para(self, cr, UITheme.RED if on else Color(fg, 0.22))
			UITheme.text_mid(self, Vector2(cr.get_center().x, cr.get_center().y), cs, "number", 15, Color.WHITE, 1)
	if _ends() and tabs.size() > 1:
		UITheme.glyph(self, Vector2(18.0, size.y * 0.5), "tab_l", 26.0)
		UITheme.glyph(self, Vector2(size.x - 18.0, size.y * 0.5), "tab_r", 26.0)
