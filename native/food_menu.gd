class_name FoodMenu
extends CanvasLayer
# The menu at a place to eat (life/food.json: home, the inn, the tea house), in
# the UI design system's look (ui/README.md): a crisp white panel over the
# scrim, the place's name and how Ash pays (Mom's cooking is free; the inn and
# the tea house put it on his tab), category tabs, a list of dish cards (a
# picture of the dish, its name, a tasty line, kcal, how much fuller it makes
# him, the price, how long it takes, any extra: sugar rush, warming, refreshing),
# and on the right the selected dish turning on its plate over a gauge of how
# full he is now and how full he'll be after it, with what that level does.
# Pauses the game while open.
#
# Input: touch / mouse (tap a tab; tap a card to pick it, tap it again or ORDER
# to order; drag or wheel to scroll), pad (up / down the dishes, left / right
# or L / R the tabs, A order, B close) and keys (arrows / WASD, E or Enter, Esc).
#
#   m.open(place, hour, fullness)   signal ordered(place, item_id, price)   signal closed
#   m.select(i) / m.set_tab(i)      (render checks)   safe_override: Rect2

signal ordered(place: String, item_id: String, price: int)
signal closed

const CARD_H := 128.0
const CARD_GAP := 12.0
const LEVEL_COL := {"starving": Color("e8463c"), "hungry": Color("ff9a1f"), "peckish": Color("ffcb05"), "satisfied": Color("8fd0f5"), "full": Color("3fcf72"), "stuffed": Color("b77be0")}
const EFFECT := {"sugar_rush": ["SUGAR RUSH", Color("ff6fa8"), "bolt"], "warm": ["WARMING", Color("ff9a1f"), "sun"], "refresh": ["REFRESHING", Color("3fb6f5"), "drop"]}

var safe_override := Rect2()
var place := ""
var hour := 12.0
var fullness := 50.0
var M := {}               # FoodData.menu
var tab := 0
var sel := 0
var is_open := false
var was_paused := false

var root: Control
var dim: ColorRect
var frame: Control
var tabs: UITabs
var close_btn: UIButton
var order_btn: UIButton
var _hero := {}           # FoodStage.stage of the selected dish
var _hero_id := ""
var _scroll := 0.0
var _scroll_to := 0.0
var _drag := {}           # touch / mouse drag on the list
var _t := 0.0
var _sel_t := 1.0
var _photo_host: Node
var _accent := UITheme.RED

func _ready() -> void:
	layer = 92
	process_mode = Node.PROCESS_MODE_ALWAYS
	root = Control.new()
	root.theme = UITheme.theme()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.visible = false
	add_child(root)
	dim = UITheme.scrim()
	dim.gui_input.connect(func(e: InputEvent):
		if (e is InputEventMouseButton or e is InputEventScreenTouch) and e.pressed and not _in_frame(e.position): close())
	root.add_child(dim)
	frame = Control.new()
	frame.mouse_filter = Control.MOUSE_FILTER_PASS
	frame.draw.connect(_draw_frame)
	frame.gui_input.connect(_frame_input)
	root.add_child(frame)
	tabs = UITabs.new()
	tabs.light = true
	tabs.show_ends = false
	tabs.font_size = 19
	tabs.tab_changed.connect(func(i): _set_tab(i, false))
	frame.add_child(tabs)
	close_btn = UIButton.new()
	close_btn.variant = "light"
	close_btn.icon_id = "close"
	close_btn.glyph = "back"
	close_btn.focus_mode = Control.FOCUS_NONE
	close_btn.pressed.connect(close)
	frame.add_child(close_btn)
	order_btn = UIButton.new()
	order_btn.variant = "primary"
	order_btn.icon_id = "bowl"
	order_btn.text = "Order"
	order_btn.glyph = "use"
	order_btn.font_size = 24
	order_btn.focus_mode = Control.FOCUS_NONE
	order_btn.pressed.connect(order)
	frame.add_child(order_btn)
	_photo_host = Node.new()
	_photo_host.name = "Photos"
	add_child(_photo_host)

func _in_frame(p: Vector2) -> bool:
	return Rect2(frame.position, frame.size).has_point(p)

func safe_rect() -> Rect2:
	return UITheme.safe_rect(root, safe_override)

# ---------- open / close ----------
func open(pid: String, h: float, full: float) -> void:
	place = pid; hour = h; fullness = full
	M = FoodData.menu(pid, h)
	var P: Dictionary = M.place
	_accent = Color(String(P.get("accent", "#ee3b33")))
	var names := []
	for c in M.cats: names.append(String(c.name))
	tabs.tabs = names
	tabs.selected = 0
	tab = 0
	# open on the first tab with something to eat now
	for i in M.cats.size():
		if _items(i).any(func(x): return x.ok): tab = i; break
	tabs.selected = tab
	sel = 0
	_scroll = 0.0; _scroll_to = 0.0
	if not is_open:
		was_paused = get_tree().paused
		get_tree().paused = true
	is_open = true
	root.visible = true
	Sfx.ui("ui_menu_open")
	_layout()
	_pick_first()
	_animate_in()

func close() -> void:
	if not is_open: return
	is_open = false
	root.visible = false
	Sfx.ui("ui_menu_close")
	get_tree().paused = was_paused
	_free_hero()
	closed.emit()

func order() -> void:
	var e := _cur()
	if e.is_empty() or not e.ok:
		Sfx.ui("ui_error"); return
	Sfx.ui("ui_confirm")
	var id := String(e.id)
	var pr := int(e.price)
	close()
	ordered.emit(place, id, pr)

func _animate_in() -> void:
	var to := frame.position
	frame.position = to + Vector2(0, 40)
	frame.modulate.a = 0.0
	dim.modulate.a = 0.0
	var tw := frame.create_tween().set_parallel(true)
	tw.tween_property(frame, "position", to, UITheme.BASE).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(frame, "modulate:a", 1.0, UITheme.FAST)
	tw.tween_property(dim, "modulate:a", 1.0, UITheme.BASE)

# ---------- the selection ----------
func _items(i := -1) -> Array:
	if M.is_empty() or M.cats.is_empty(): return []
	return M.cats[clampi(tab if i < 0 else i, 0, M.cats.size() - 1)].items

func _cur() -> Dictionary:
	var it := _items()
	return it[sel] if sel >= 0 and sel < it.size() else {}

func _pick_first() -> void:
	sel = 0
	var it := _items()
	for i in it.size():
		if it[i].ok: sel = i; break
	_on_sel()

func select(i: int) -> void:
	var it := _items()
	if it.is_empty(): return
	i = clampi(i, 0, it.size() - 1)
	if i != sel: Sfx.ui("ui_cursor")
	sel = i
	_on_sel()

func set_tab(i: int) -> void:
	tabs.set_selected(i, false)
	_set_tab(i, true)

func _set_tab(i: int, _from_code: bool) -> void:
	if M.is_empty(): return
	i = clampi(i, 0, M.cats.size() - 1)
	tab = i
	tabs.selected = i
	tabs._kick()
	_scroll = 0.0; _scroll_to = 0.0
	_pick_first()

func _on_sel() -> void:
	_sel_t = 0.0
	var e := _cur()
	var mid := String(e.it.get("model", e.id)) if not e.is_empty() else ""
	if mid != _hero_id:
		_free_hero()
		if mid != "":
			_hero = FoodStage.stage(_photo_host, mid, Vector2i(560, 380), true, Vector3(0, 0.55, 0.85))
			_hero_id = mid
	order_btn.disabled = e.is_empty() or not e.ok
	order_btn.text = "Order" if e.is_empty() or e.ok else _when_text(e)
	# keep the selected card in view
	var lr := _list_rect()
	var top := sel * (CARD_H + CARD_GAP)
	if top < _scroll_to: _scroll_to = top
	elif top + CARD_H > _scroll_to + lr.size.y: _scroll_to = top + CARD_H - lr.size.y
	_scroll_to = clampf(_scroll_to, 0.0, _max_scroll())
	frame.queue_redraw()

func _free_hero() -> void:
	if not _hero.is_empty() and is_instance_valid(_hero.vp): _hero.vp.queue_free()
	_hero = {}; _hero_id = ""

func _when_text(e: Dictionary) -> String:
	var w: Array = e.when
	return " / ".join(w.map(func(x): return FoodData.meal_name(String(x)))) + " only"

# ---------- layout ----------
var _last_size := Vector2.ZERO
func _layout() -> void:
	var vs := root.get_viewport_rect().size
	_last_size = vs
	var sr := safe_rect()
	var w := minf(1180.0, sr.size.x - 24.0)
	var h := minf(660.0, sr.size.y - 20.0)
	frame.position = Vector2(sr.position.x + (sr.size.x - w) * 0.5, sr.position.y + (sr.size.y - h) * 0.5)
	frame.size = Vector2(w, h)
	var lw := _left_w()
	tabs.position = Vector2(30, 108)
	tabs.size = Vector2(lw - 30, 46)
	close_btn.size = Vector2(110 if UIInput.device != "touch" else 64, 52)
	close_btn.position = Vector2(w - 26 - close_btn.size.x, 20)
	var rx := lw + 26.0
	order_btn.position = Vector2(rx + 6.0, h - 26.0 - 60.0)
	order_btn.size = Vector2(w - rx - 34.0, 60.0)
	frame.queue_redraw()

func _left_w() -> float: return frame.size.x * 0.58

func _list_rect() -> Rect2:
	return Rect2(30.0, 168.0, _left_w() - 30.0, frame.size.y - 168.0 - 22.0)

func _max_scroll() -> float:
	var n := _items().size()
	return maxf(0.0, n * (CARD_H + CARD_GAP) - CARD_GAP - _list_rect().size.y)

func _card_rect(i: int) -> Rect2:
	var lr := _list_rect()
	return Rect2(lr.position.x, lr.position.y + i * (CARD_H + CARD_GAP) - _scroll, lr.size.x - 10.0, CARD_H)

# ---------- input ----------
func _input(e: InputEvent) -> void:
	if not is_open: return
	if e.is_action_pressed("back") or e.is_action_pressed("ui_cancel"):
		close(); get_viewport().set_input_as_handled(); return
	var lr := 0
	if e is InputEventJoypadButton and e.pressed and e.button_index in [JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER]:
		lr = 1 if e.button_index == JOY_BUTTON_RIGHT_SHOULDER else -1
	elif e.is_action_pressed("ui_left") or e.is_action_pressed("move_left"): lr = -1
	elif e.is_action_pressed("ui_right") or e.is_action_pressed("move_right"): lr = 1
	if lr != 0:
		if M.cats.size() > 1:
			tabs.set_selected((tab + lr + M.cats.size()) % M.cats.size(), false)
			_set_tab(tabs.selected, true)
		get_viewport().set_input_as_handled(); return
	if e.is_action_pressed("ui_up") or e.is_action_pressed("move_up"):
		select(sel - 1); get_viewport().set_input_as_handled(); return
	if e.is_action_pressed("ui_down") or e.is_action_pressed("move_down"):
		select(sel + 1); get_viewport().set_input_as_handled(); return
	if (e is InputEventKey or e is InputEventJoypadButton) and (e.is_action_pressed("use") or e.is_action_pressed("ui_accept")):
		order(); get_viewport().set_input_as_handled(); return
	if e is InputEventKey and e.pressed and not e.echo and e.keycode >= KEY_1 and e.keycode <= KEY_9:
		var i: int = e.keycode - KEY_1
		if i < _items().size():
			if i == sel: order()
			else: select(i)
		get_viewport().set_input_as_handled()

var _tap_frame := -1
func _frame_input(e: InputEvent) -> void:
	var lr := _list_rect()
	if e is InputEventMouseButton and e.pressed and e.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
		_scroll_to = clampf(_scroll_to + (60.0 if e.button_index == MOUSE_BUTTON_WHEEL_DOWN else -60.0), 0.0, _max_scroll())
		frame.accept_event(); return
	var down: bool = (e is InputEventScreenTouch or (e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT))
	if down and e.pressed:
		if lr.has_point(e.position): _drag = {"y0": e.position.y, "s0": _scroll_to, "moved": false}
		return
	if (e is InputEventScreenDrag or (e is InputEventMouseMotion and not _drag.is_empty() and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT))) and not _drag.is_empty():
		var dy: float = e.position.y - float(_drag.y0)
		if absf(dy) > 8.0: _drag.moved = true
		if _drag.moved:
			_scroll_to = clampf(float(_drag.s0) - dy, 0.0, _max_scroll()); _scroll = _scroll_to
			frame.queue_redraw()
		return
	if down and not e.pressed:
		var was_drag: bool = not _drag.is_empty() and _drag.moved
		_drag = {}
		if was_drag: return
		if Engine.get_process_frames() == _tap_frame: return
		_tap_frame = Engine.get_process_frames()
		if not lr.has_point(e.position): return
		for i in _items().size():
			if _card_rect(i).has_point(e.position):
				if i == sel: order()
				else: select(i)
				frame.accept_event()
				return

func _process(dt: float) -> void:
	if not is_open: return
	_t += dt
	_sel_t += dt
	if root.get_viewport_rect().size != _last_size: _layout()
	_scroll = lerpf(_scroll, _scroll_to, 1.0 - exp(-dt * 16.0))
	if not _hero.is_empty() and is_instance_valid(_hero.dish):
		_hero.dish.rotation.y = sin(_t * 0.5) * 0.5
	frame.queue_redraw()

# ---------- drawing ----------
func _draw_frame() -> void:
	if M.is_empty(): return
	var w := frame.size.x
	var h := frame.size.y
	var P: Dictionary = M.place
	UITheme.panel(frame, Rect2(0, 0, w, h), _accent, 1.0, 0.0, 26.0, 8.0)
	# the header: the place, how he pays, the meal of the day
	var title := String(P.get("name", "Menu")).to_upper()
	var tw := UITheme.text(frame, Vector2(30, 62), title, "display", 46, UITheme.INK)
	UITheme.chevrons(frame, Vector2(30.0 + tw + 20.0, 46.0), 22.0, _accent, 3)
	var sub := "%s  ·  %s  ·  served by %s" % [String(P.get("sub", "")), FoodData.meal_name(String(M.meal)), String(P.get("host", "")).capitalize()]
	UITheme.text(frame, Vector2(32, 92), sub, "body_bold", 18, UITheme.INK_SOFT)
	var pay := String(P.get("pay", "free"))
	var cx := 30.0 + tw + 92.0
	if pay == "free":
		UITheme.chip(frame, Vector2(cx, 30), "ON THE HOUSE", UITheme.GREEN.darkened(0.15), Color.WHITE, 15, 24.0)
	else:
		var tab_v := FoodData.tab(place)
		var cw := UITheme.chip(frame, Vector2(cx, 30), "ON YOUR TAB", UITheme.INK, Color.WHITE, 15, 24.0)
		UITheme.chip(frame, Vector2(cx + cw + 6.0, 30), "%s%d" % [FoodData.currency(), tab_v], UITheme.YELLOW, UITheme.INK, 15, 24.0)
	frame.draw_line(Vector2(30, 162), Vector2(_left_w(), 162), Color(UITheme.INK, 0.1), 1.5)
	_draw_list()
	_draw_side()

func _draw_list() -> void:
	var lr := _list_rect()
	var items := _items()
	# cards (clipped to the list by skipping those outside, fading at the edges)
	for i in items.size():
		var r := _card_rect(i)
		if r.end.y < lr.position.y - 4.0 or r.position.y > lr.end.y + 4.0: continue
		var a := 1.0
		if r.position.y < lr.position.y: a = clampf(1.0 - (lr.position.y - r.position.y) / 70.0, 0.0, 1.0)
		if r.end.y > lr.end.y: a = clampf(1.0 - (r.end.y - lr.end.y) / 70.0, 0.0, 1.0)
		_card(r, items[i], i == sel, a)
	# a scroll hint
	if _max_scroll() > 1.0:
		var f := _scroll / _max_scroll()
		var tr := Rect2(lr.end.x - 3.0, lr.position.y, 4.0, lr.size.y)
		frame.draw_rect(tr, Color(UITheme.INK, 0.08))
		var th := maxf(30.0, tr.size.y * lr.size.y / (lr.size.y + _max_scroll()))
		frame.draw_rect(Rect2(tr.position.x, tr.position.y + (tr.size.y - th) * f, 4.0, th), Color(_accent, 0.7))

func _card(r: Rect2, e: Dictionary, on: bool, a: float) -> void:
	var it: Dictionary = e.it
	var ok: bool = e.ok
	var ka := a * (1.0 if ok else 0.55)
	var pop := UITheme.ease_back(clampf(_sel_t / UITheme.BASE, 0.0, 1.0)) if on else 1.0
	var rr := r
	if on: rr = r.grow(2.0 * pop)
	var pts := UITheme.chamfer_points(rr, 14.0)
	if on:
		UITheme.shadow(frame, pts, a, Vector2(0, 5))
		UITheme.fill_v(frame, pts, Color(UITheme.WHITE, a), Color(UITheme.PAPER, a))
		UITheme.outline(frame, pts, Color(_accent, a), 2.5)
		frame.draw_rect(Rect2(rr.position.x, rr.position.y + 10.0, 6.0, rr.size.y - 20.0), Color(_accent, a))
	else:
		UITheme.fill(frame, pts, Color(UITheme.INK, 0.045 * a))
	# the dish's picture on a soft round plate
	var pc := Vector2(r.position.x + 70.0, r.get_center().y)
	frame.draw_circle(pc + Vector2(0, 3), 54.0, Color(UITheme.INK, 0.06 * a), true, -1.0, true)
	frame.draw_circle(pc, 54.0, Color(_accent.lightened(0.8), 0.9 * ka), true, -1.0, true)
	var tex := FoodStage.photo(_photo_host, String(it.get("model", e.id)), 224)
	if tex: frame.draw_texture_rect(tex, Rect2(pc - Vector2(62, 62), Vector2(124, 124)), false, Color(1, 1, 1, ka))
	var x := r.position.x + 140.0
	var tw := r.end.x - x - 16.0
	# the name, the price at the right
	var price := _price_text(e)
	var pw := UITheme.text_w(price, "heading", 24)
	UITheme.text(frame, Vector2(x, r.position.y + 34.0), String(it.name).to_upper(), "heading", 24, Color(UITheme.INK, ka), 0, tw - pw - 12.0)
	UITheme.text(frame, Vector2(r.end.x - 16.0, r.position.y + 34.0), price, "heading", 24, Color(_accent.darkened(0.2) if int(e.price) > 0 else UITheme.GREEN.darkened(0.25), ka), 2)
	var rows := UITheme.wrap(String(it.desc), "body", 17, tw)
	for k in mini(2, rows.size()):
		var row: String = rows[k]
		if k == 1 and rows.size() > 2: row = row.trim_suffix(".") + "…"
		UITheme.text(frame, Vector2(x, r.position.y + 58.0 + k * 20.0), row, "body", 17, Color(UITheme.INK_SOFT, UITheme.INK_SOFT.a * ka))
	# the chips: kcal, how much fuller, minutes, the extra
	var cy := r.end.y - 32.0
	var cx := x
	cx += UITheme.chip(frame, Vector2(cx, cy), "%d KCAL" % int(it.kcal), UITheme.INK, Color.WHITE, 14, 22.0, ka) + 6.0
	cx += UITheme.chip(frame, Vector2(cx, cy), "+%d%% FULL" % roundi(Hunger.pct(float(it.kcal))), UITheme.GREEN.darkened(0.2), Color.WHITE, 14, 22.0, ka) + 6.0
	cx += UITheme.chip(frame, Vector2(cx, cy), "%d MIN" % int(it.get("minutes", 10)), Color(UITheme.INK, 0.35), Color.WHITE, 14, 22.0, ka) + 6.0
	var ef := String(it.get("effect", ""))
	if EFFECT.has(ef) and cx < r.end.x - 110.0:
		cx += UITheme.chip(frame, Vector2(cx, cy), EFFECT[ef][0], EFFECT[ef][1], Color.WHITE, 14, 22.0, ka) + 6.0
	if not ok:
		UITheme.chip(frame, Vector2(r.end.x - 16.0 - UITheme.text_w(_when_text(e).to_upper(), "label", 14) - 18.0, cy), _when_text(e).to_upper(), UITheme.YELLOW, UITheme.INK, 14, 22.0, a)
	# the number key / the pad's A on the selected one
	if on and UIInput.device == "pad" and ok:
		UITheme.glyph(frame, Vector2(r.position.x + 20.0, r.position.y + 20.0), "use", 26.0, a)

func _price_text(e: Dictionary) -> String:
	if String(M.place.get("pay", "free")) == "free": return "FREE"
	return "FREE" if int(e.price) <= 0 else "%s%d" % [FoodData.currency(), int(e.price)]

# the right side: the dish turning on its plate, then his tummy now and after it
func _draw_side() -> void:
	var w := frame.size.x
	var h := frame.size.y
	var x0 := _left_w() + 26.0
	var rw := w - x0 - 28.0
	var e := _cur()
	if e.is_empty(): return
	var it: Dictionary = e.it
	# the picture
	var hr := Rect2(x0, 108.0, rw, 236.0)
	var hp := UITheme.chamfer_points(hr, 18.0)
	UITheme.fill_v(frame, hp, _accent.lightened(0.86), _accent.lightened(0.7))
	frame.draw_circle(hr.get_center() + Vector2(0, 26), minf(hr.size.x, hr.size.y) * 0.46, Color(1, 1, 1, 0.55), true, -1.0, true)
	if not _hero.is_empty():
		var tex: Texture2D = _hero.tex
		var ar := 560.0 / 380.0
		var th := hr.size.y + 10.0
		var tw2 := th * ar
		if tw2 > hr.size.x + 20.0: tw2 = hr.size.x + 20.0; th = tw2 / ar
		frame.draw_texture_rect(tex, Rect2(hr.get_center() - Vector2(tw2, th) * 0.5 + Vector2(0, 8), Vector2(tw2, th)), false)
	UITheme.text(frame, Vector2(hr.position.x + 16.0, hr.end.y - 16.0), String(it.name).to_upper(), "display", 28, UITheme.INK, 0, rw - 30.0, 6, Color(1, 1, 1, 0.85))
	var tags: Array = it.get("tags", [])
	var tx := hr.position.x + 14.0
	for tg in tags:
		tx += UITheme.chip(frame, Vector2(tx, hr.position.y + 12.0), String(tg).to_upper(), Color(UITheme.INK, 0.7), Color.WHITE, 13, 20.0) + 5.0
	# the tummy
	var y := hr.end.y + 30.0
	UITheme.text(frame, Vector2(x0, y), "YOUR TUMMY", "label", 17, UITheme.INK_SOFT)
	var after := minf(100.0, fullness + Hunger.pct(float(it.kcal)))
	var lv0 := Hunger.level_of(fullness)
	var lv1 := Hunger.level_of(after)
	var pct_s := "%d%%  →  %d%%" % [roundi(fullness), roundi(after)]
	UITheme.text(frame, Vector2(x0 + rw, y), pct_s, "heading", 22, UITheme.INK, 2)
	var gr := Rect2(x0 + 6.0, y + 20.0, rw - 12.0, 26.0)
	_gauge(gr, fullness, after)
	# now -> after, by level
	var ly := gr.end.y + 30.0
	var c0: Color = LEVEL_COL[lv0]
	var c1: Color = LEVEL_COL[lv1]
	var lx := x0
	lx += UITheme.chip(frame, Vector2(lx, ly - 13.0), Hunger.LABEL[lv0].to_upper(), c0.darkened(0.15), Color.WHITE if lv0 != "peckish" else UITheme.INK, 16, 26.0) + 10.0
	UITheme.chevrons(frame, Vector2(lx + 8.0, ly), 14.0, Color(UITheme.INK, 0.5), 2)
	lx += 30.0
	UITheme.chip(frame, Vector2(lx, ly - 13.0), Hunger.LABEL[lv1].to_upper(), c1.darkened(0.15), Color.WHITE if lv1 != "peckish" else UITheme.INK, 16, 26.0)
	# what it'll do for him
	var note := _level_note(lv1, it)
	var rows := UITheme.wrap(note, "body_bold", 17, rw - 8.0)
	for k in mini(3, rows.size()):
		UITheme.text(frame, Vector2(x0 + 2.0, ly + 36.0 + k * 21.0), rows[k], "body_bold", 17, UITheme.INK if k == 0 else UITheme.INK_SOFT)
	_hints(Vector2(x0 + 4.0, h - 26.0 - 60.0 - 18.0))

# how to drive it, for the device in use
func _hints(at: Vector2) -> void:
	var col := UITheme.INK_SOFT
	if UIInput.device == "touch":
		UITheme.text(frame, at, "TAP A DISH TO SEE IT  ·  TAP AGAIN TO ORDER", "label", 14, col)
		return
	var x := at.x
	var y := at.y - 5.0
	var pairs := [["tab_l" if UIInput.device == "pad" else "", "CATEGORY"], ["", "DISH"], ["use", "ORDER"], ["back", "BACK"]]
	for i in pairs.size():
		var g := String(pairs[i][0])
		if i == 0 and UIInput.device == "pad":
			x += UITheme.glyph(frame, Vector2(x + 16.0, y), "tab_l", 22.0) + 2.0
			x += UITheme.glyph(frame, Vector2(x + 16.0, y), "tab_r", 22.0) + 6.0
		elif i == 0 or i == 1:
			# (keys: the arrows or WASD; pad: the d-pad or the stick)
			var k := ("a/d" if i == 0 else "w/s") if UIInput.device == "keys" else ("d-pad" if i == 1 else "")
			var gw := UITheme.text_w(k.to_upper(), "label", 11) + 14.0
			x += UITheme.glyph(frame, Vector2(x + gw * 0.5, y), k, 22.0, 1.0, "keys") + 6.0
		else:
			x += UITheme.glyph(frame, Vector2(x + 12.0, y), g, 22.0) + 6.0
		x += UITheme.text(frame, Vector2(x, at.y), String(pairs[i][1]), "label", 14, col) + 16.0

func _gauge(r: Rect2, now: float, after: float) -> void:
	# the zones under it, the fill now, the gain from this dish pulsing over it
	var L := T_levels()
	var zones := [["starving", 0.0, L.hungry], ["hungry", L.hungry, L.peckish], ["peckish", L.peckish, L.satisfied], ["satisfied", L.satisfied, L.full], ["full", L.full, L.stuffed], ["stuffed", L.stuffed, 100.0]]
	UITheme.para(frame, r.grow(3.0), Color(UITheme.INK, 0.8))
	frame.draw_rect(r, Color(UITheme.WHITE, 0.92))
	for z in zones:
		var zr := Rect2(r.position.x + r.size.x * float(z[1]) / 100.0, r.position.y, r.size.x * (float(z[2]) - float(z[1])) / 100.0, r.size.y)
		frame.draw_rect(zr, Color(LEVEL_COL[z[0]], 0.22))
	var c := LEVEL_COL[Hunger.level_of(now)] as Color
	UITheme.para(frame, Rect2(r.position, Vector2(r.size.x * now / 100.0, r.size.y)), c, 0.0)
	var gx := r.position.x + r.size.x * now / 100.0
	var gw := r.size.x * (after - now) / 100.0
	if gw > 0.5:
		var pulse := 0.78 + 0.22 * sin(_t * 5.0)
		var c1 := LEVEL_COL[Hunger.level_of(after)] as Color
		UITheme.para(frame, Rect2(gx, r.position.y, gw, r.size.y), Color(c1, pulse), 0.0)
		# stripes over the gain
		var sx := gx
		while sx < gx + gw:
			var x1 := minf(sx + 6.0, gx + gw)
			frame.draw_rect(Rect2(sx, r.position.y, x1 - sx, r.size.y), Color(1, 1, 1, 0.3))
			sx += 14.0
	# ticks at the level edges
	for z in zones:
		if float(z[1]) <= 0.0: continue
		var tx := r.position.x + r.size.x * float(z[1]) / 100.0
		frame.draw_line(Vector2(tx, r.position.y - 3.0), Vector2(tx, r.end.y + 3.0), Color(1, 1, 1, 0.65), 1.5)
	# the end of the gain, marked
	var ex := r.position.x + r.size.x * after / 100.0
	frame.draw_colored_polygon(PackedVector2Array([Vector2(ex - 7, r.position.y - 10), Vector2(ex + 7, r.position.y - 10), Vector2(ex, r.position.y - 2)]), UITheme.INK)

static func T_levels() -> Dictionary:
	return preload("res://tunables.gd").dict("hunger", "levels", {"stuffed": 92, "full": 70, "satisfied": 45, "peckish": 28, "hungry": 12})

# a sentence on what being at that level (and the dish's extra) does for him
func _level_note(lv: String, it: Dictionary) -> String:
	var s := ""
	match lv:
		"stuffed": s = "Stuffed! A bit heavy on your feet for a while (%s)." % _fx_text(Conditions.I.def("stuffed").get("effects", {}) if Conditions.I else {})
		"full": s = "Well fed: %s." % _fx_text(Conditions.I.def("well_fed").get("effects", {}) if Conditions.I else {"stamina_regen": 1.08, "stamina_max": 1.08, "run_speed": 1.03, "jump": 1.04})
		"satisfied": s = "Satisfied. Not hungry, not full."
		_: s = "Still %s. Maybe something more?" % Hunger.LABEL[lv].to_lower()
	match String(it.get("effect", "")):
		"sugar_rush": s += " Sweet: a sugar rush, faster stamina for a little while."
		"warm": s += " Warm: dries you off faster."
		"refresh": s += " Refreshing: some stamina back at once."
	return s

static func _fx_text(e: Dictionary) -> String:
	var names := {"stamina_regen": "stamina regen", "stamina_max": "stamina", "run_speed": "run speed", "jump": "jump", "speed": "speed"}
	var out := []
	for k in ["stamina_regen", "stamina_max", "run_speed", "jump", "speed"]:
		if not e.has(k): continue
		var v := roundi((float(e[k]) - 1.0) * 100.0)
		if v == 0: continue
		out.append("%s%d%% %s" % ["+" if v > 0 else "", v, names[k]])
	return ", ".join(out)
