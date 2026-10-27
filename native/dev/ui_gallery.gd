extends Control
# Dev only: every UI component and state on one screen (ui/README.md).
#   godot --path native --resolution 1280x800 res://dev/ui_gallery.tscn -- [--page=components|dialog|tokens] [--device=touch|pad|keys] [--shot=<png>]
# Arrow keys / pad switch pages in a live run; --shot saves the page after a
# second (all animations settled) and quits.

var page := "components"
var shot := ""
var _t := 0.0
var _saved := false
var _built := ""
var dialog: UIDialogPanel
var toaster: UIToaster

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	theme = UITheme.theme()
	add_child(UIInput.new())
	if Settings.menu: Settings.menu.cog.visible = false
	if Settings.overlay: Settings.overlay.visible = false
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--page="): page = a.substr(7)
		elif a.begins_with("--shot="): shot = a.substr(7)
		elif a.begins_with("--device="): UIInput.force(a.substr(9))
	_build()

func _input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo and e.keycode in [KEY_PAGEDOWN, KEY_F2]:
		var pages := ["components", "dialog", "tokens"]
		page = pages[(pages.find(page) + 1) % pages.size()]
		_build()

func _build() -> void:
	for c in get_children():
		if not c is UIInput: c.queue_free()
	_built = page
	_t = 0.0
	queue_redraw()
	match page:
		"dialog": _dialog_page()
		"tokens": pass
		_: _components_page()

# ---------- background: a town-ish dusk gradient, so plates read as over a game ----------
func _draw() -> void:
	var vs := size
	draw_polygon(PackedVector2Array([Vector2.ZERO, Vector2(vs.x, 0), vs, Vector2(0, vs.y)]),
		PackedColorArray([Color("5aa4d8"), Color("8cc6e8"), Color("6c9a5a"), Color("4f7f4a")]))
	for i in 14:
		var x := i * 140.0 - 200.0
		draw_colored_polygon(PackedVector2Array([Vector2(x, vs.y), Vector2(x + 60, vs.y), Vector2(x + 260, 0), Vector2(x + 200, 0)]), Color(1, 1, 1, 0.035))
	if page == "tokens": _tokens()
	elif page == "components": _drawn_components()

func _h(at: Vector2, s: String) -> void:
	UITheme.text(self, at, s.to_upper(), "heading", 20, UITheme.TEXT, 0, -1.0, 5, Color(0, 0, 0, 0.45))

# the pieces drawn straight onto a canvas (HUD style)
func _drawn_components() -> void:
	var y0 := 452.0
	_h(Vector2(24, y0), "Badges · meter · card")
	UIWidgets.badge(self, Vector2(24, y0 + 14), "drop", "Wet", UITheme.SKY, 0.6)
	UIWidgets.badge(self, Vector2(150, y0 + 14), "sweat", "Fatigue", UITheme.ORANGE, 0.3, true)
	UIWidgets.badge(self, Vector2(310, y0 + 14), "star", "Lucky", UITheme.YELLOW)
	UIWidgets.meter(self, Vector2(24, y0 + 74), 200.0, 0.62, UITheme.GREEN, "bolt")
	UIWidgets.meter(self, Vector2(24, y0 + 104), 200.0, 0.08, UITheme.RED, "bolt", "Out of breath", 1.0, 0.1)
	var rows := UITheme.wrap("Soaked to the knees. Running costs more stamina until he dries off.", "body", 19, 300.0)
	UIWidgets.card(self, Rect2(24, y0 + 150, 340, UIWidgets.card_height(rows.size())), "Wet", rows, "About 40 min left", UITheme.SKY, 48.0)
	# prompts on each device
	_h(Vector2(420, y0), "Prompts · glyphs")
	var x := 470.0
	for d in ["touch", "pad", "keys"]:
		var keep := UIInput.device
		UIInput.device = d
		UITheme.prompt(self, Vector2(x + 30, y0 + 86), "Talk" if d != "keys" else "Read", "use")
		UIInput.device = keep
		x += 150.0
	x = 430.0
	for d in ["pad", "keys"]:
		for act in ["use", "back", "jump", "menu", "tab_l", "tab_r"]:
			var w := UITheme.glyph(self, Vector2(x + 14, y0 + 116 + (0 if d == "pad" else 40)), act, 28.0, 1.0, d)
			x += w + 10.0
		x = 430.0
	# toast (static frame, mid-hold)
	_h(Vector2(420, y0 + 204), "Toasts")
	UIToaster.draw_toast(self, {"kind": "start", "head": "New quest", "text": "The Butterfree Question"}, 1.0, Rect2(420, y0 + 200, 440, 120), "top")
	UIToaster.draw_toast(self, {"kind": "rumor", "head": "Rumor heard", "text": "Cinnabar's riddles"}, 1.0, Rect2(860, y0 + 200, 400, 120), "top")
	# HUD readouts
	_h(Vector2(900, y0), "HUD readouts")
	var cr := Rect2(900, y0 + 16, 150, 40)
	UITheme.plate(self, cr)
	UITheme.icon(self, "clock", Vector2(cr.position.x + 24, cr.get_center().y), 9.0, UITheme.YELLOW)
	UITheme.text_mid(self, Vector2(cr.position.x + 42, cr.get_center().y), "DAY 3  07:45", "number", 21, UITheme.TEXT)
	var fr := Rect2(1066, y0 + 16, 150, 40)
	UITheme.plate(self, fr)
	UITheme.text_mid(self, Vector2(fr.position.x + 16, fr.get_center().y), "60", "number", 24, UITheme.GREEN)
	UITheme.text_mid(self, Vector2(fr.position.x + 44, fr.get_center().y), "FPS · 16.6 MS", "label", 16, UITheme.TEXT_DIM)
	UITheme.chevrons(self, Vector2(906, y0 + 92), 26.0, UITheme.RED, 3)
	UITheme.chevrons(self, Vector2(990, y0 + 92), 26.0, UITheme.YELLOW, 3, -1.0)
	UITheme.chip(self, Vector2(1010, y0 + 80), "NEW", UITheme.RED)
	UITheme.chip(self, Vector2(1070, y0 + 80), "QUEST", UITheme.YELLOW, UITheme.INK)
	UITheme.chip(self, Vector2(1146, y0 + 80), "INFO", UITheme.SKY)
	for i in 6:
		UIWidgets.icon_disc(self, Vector2(918 + i * 50, y0 + 136), 18.0, [UITheme.RED, UITheme.SKY, UITheme.YELLOW, UITheme.GREEN, UITheme.PURPLE, UITheme.ORANGE][i], ["ball", "log", "star", "check", "chat", "bike"][i])

func _components_page() -> void:
	# panels
	var p1 := UIPanel.new()
	p1.style = "light"; p1.title = "Light panel"; p1.position = Vector2(24, 24); p1.size = Vector2(300, 190)
	p1.add_child(UITheme.label("Crisp white, accent bar, cut corner. Menus, cards, the quest log.", "body", 19, UITheme.INK))
	(p1.get_child(0) as Label).autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(p1)
	var p2 := UIPanel.new()
	p2.style = "dark"; p2.title = "Dark plate"; p2.accent = UITheme.YELLOW; p2.position = Vector2(340, 24); p2.size = Vector2(300, 190)
	p2.add_child(UITheme.label("Layered translucent dark. The HUD's base, settings, overlays.", "body", 19, UITheme.TEXT))
	(p2.get_child(0) as Label).autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(p2)
	# buttons
	var bx := 670.0
	var by := 30.0
	for v in [["primary", "Confirm", "", "use"], ["secondary", "Back", "", "back"], ["light", "Read", "log", ""], ["ghost", "Skip", "", ""], ["yellow", "New!", "star", ""]]:
		var b := UIButton.new()
		b.variant = v[0]; b.text = v[1]; b.icon_id = v[2]; b.glyph = v[3]
		b.position = Vector2(bx, by); b.size = Vector2(190, 56)
		add_child(b)
		by += 66.0
	var states := [["Hover", "secondary"], ["Pressed", "secondary"], ["Toggled", "secondary"], ["Disabled", "primary"]]
	by = 30.0
	for i in states.size():
		var b := UIButton.new()
		b.variant = states[i][1]; b.text = states[i][0]
		b.position = Vector2(880, by); b.size = Vector2(170, 56)
		if i == 0: b._hover = 1.0
		elif i == 1: b._press = 1.0
		elif i == 2: b.toggle_mode = true; b.button_pressed = true
		else: b.disabled = true
		add_child(b)
		by += 66.0
	# icon buttons
	var ib := [["cog", false, false], ["log", true, false], ["log", false, true], ["cog", false, true]]
	for i in ib.size():
		var b := UIIconButton.new()
		b.icon_id = ib[i][0]; b.badge = ib[i][1]; b.pill = ib[i][2]
		b.position = Vector2(1080 + (i % 2) * 84, 30 + (i / 2) * 84); b.size = Vector2(64, 64)
		add_child(b)
	var big := UIIconButton.new()
	big.icon_id = "ball"; big.position = Vector2(1080, 200); big.size = Vector2(148, 64)
	add_child(big)
	# tabs
	var t1 := UITabs.new()
	t1.tabs = ["Display", "World", "Controls", "Audio"]; t1.selected = 1
	t1.position = Vector2(24, 236); t1.size = Vector2(620, 52)
	add_child(t1)
	var t2 := UITabs.new()
	t2.tabs = ["Active", "Done", "Rumors"]; t2.light = true; t2.counts = [3, 2, -1]
	var lp := UIPanel.new()
	lp.style = "light"; lp.cut = 10.0; lp.bar = 0.0; lp.padding = Vector4(14, 12, 14, 12)
	lp.position = Vector2(24, 304); lp.size = Vector2(620, 76)
	lp.add_child(t2)
	add_child(lp)
	var pr := UIControls.Progress.new()
	pr.position = Vector2(670, 380); pr.size = Vector2(380, 24); pr.value = 0.72; pr.label = "72 %"
	add_child(pr)
	var pp := UIControls.Prompt.new()
	pp.position = Vector2(1060, 300); pp.size = Vector2(200, 80); pp.label = "Door"
	add_child(pp)

func _dialog_page() -> void:
	dialog = UIDialogPanel.new()
	add_child(dialog)
	dialog.set_speaker("Prof. Oak", "Professor")
	dialog.show_line("Ah, Ash! There you are. Before you head out on Route 1, I have a small favour to ask. Would you take this parcel to Viridian City?")
	dialog.shown = 9999.0
	dialog._in = 1.0; dialog._target = 1.0
	dialog.show_choices([{"text": "Sure, I'll take it!", "tag": "Quest"}, "What's inside?", "Can it wait until tomorrow?", {"text": "Battle me first!", "disabled": true}])
	dialog.choices._appear = 1.0
	dialog.choices._anim[0] = 1.0
	toaster = UIToaster.new()
	add_child(toaster)
	toaster.push("item", "Received", "Oak's Parcel")
	var banner := DialogBox.new()
	add_child(banner)
	banner.banner("Route 1", "Pallet Town - Viridian City")
	banner._ban_t = 1.4
	var pr := Control.new()
	pr.set_anchors_preset(Control.PRESET_FULL_RECT)
	pr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pr.draw.connect(func():
		UITheme.prompt(pr, Vector2(200, 420), "Talk", "use")
		_bubble_demo(pr))
	add_child(pr)

func _bubble_demo(ci: CanvasItem) -> void:
	UIWidgets.bubble(ci, Vector2(200, 300), UITheme.wrap("Lovely morning for a walk, isn't it?", "body_bold", 18, 230.0), 18, true, 1280.0)
	UIWidgets.bubble(ci, Vector2(400, 300), PackedStringArray(["..."]), 18, false, 1280.0)
	UIWidgets.quest_mark(ci, Vector2(480, 300), 34.0, 0.0)

func _tokens() -> void:
	var y := 40.0
	for k in ["hero", "display", "title", "h2", "h3", "body", "label", "small", "micro"]:
		var s: int = UITheme.SIZE[k]
		var role := "display" if k in ["hero", "display", "title"] else ("heading" if k in ["h2", "h3"] else ("body" if k == "body" else "label"))
		var txt: String = ("Pallet Town" if role == "body" else "PALLET TOWN") + "  " + k + " " + str(s)
		UITheme.text(self, Vector2(40, y + s), txt, role, s, UITheme.TEXT, 0, -1.0, 6, Color(0, 0, 0, 0.4))
		y += s + 10.0
	UITheme.text(self, Vector2(40, y + 30), "123 456 7890  ·  Pixelify flavour: Hello there!", "pixel", 24, UITheme.YELLOW, 0, -1.0, 6, Color(0, 0, 0, 0.5))
	var cols := [["RED", UITheme.RED], ["RED_DEEP", UITheme.RED_DEEP], ["WHITE", UITheme.WHITE], ["PAPER", UITheme.PAPER], ["INK", UITheme.INK], ["PLATE", UITheme.PLATE],
		["YELLOW", UITheme.YELLOW], ["SKY", UITheme.SKY], ["BLUE", UITheme.BLUE], ["GREEN", UITheme.GREEN], ["ORANGE", UITheme.ORANGE], ["PURPLE", UITheme.PURPLE]]
	for i in cols.size():
		var r := Rect2(760 + (i % 3) * 165, 40 + (i / 3) * 96, 150, 56)
		UITheme.para(self, r, cols[i][1])
		UITheme.text(self, r.position + Vector2(4, 80), String(cols[i][0]), "label", 16, UITheme.TEXT, 0, -1.0, 4, Color(0, 0, 0, 0.5))
	UITheme.panel(self, Rect2(760, 440, 470, 120), UITheme.RED)
	UITheme.text(self, Vector2(784, 490), "SKEW %.2f · CUT %d · BAR %d" % [UITheme.SKEW, UITheme.CUT, UITheme.BAR], "heading", 26, UITheme.INK)
	UITheme.text(self, Vector2(784, 528), "motion: fast %.2f s · base %.2f s · slow %.2f s · pop %.2f s" % [UITheme.FAST, UITheme.BASE, UITheme.SLOW, UITheme.POP], "body", 18, UITheme.INK_SOFT)

func _process(dt: float) -> void:
	_t += dt
	if shot != "" and not _saved and _t > 1.2:
		_saved = true
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(shot)
		print("shot " + shot)
		get_tree().quit()
