class_name ConversationUI
extends Control
# The conversation panel (conversation.gd): a thin adapter over the UI kit's
# UIDialogPanel (ui/ui_dialog_panel.gd: nameplate, typewriter line, advance
# mark, the UIChoiceList of what Ash can say), plus what the mode adds around
# it: a soft vignette and thin letterbox bars while a conversation is on, the
# speaker's voice blips, and a small note when one of Ash's growth threads moves.
#
#   show_line(speaker, text, colour)    typewriter; typing() / finish()
#   show_choices(list)                  [{label, tone, dim, kind}] -> signal picked(i)
#   hide_panel()
#   move(d) / confirm() / sel           (conversation.gd routes A, B, up / down)
#   signal advance                      a tap on the panel (next line)
#   cine = 0..1                         the vignette and bars (eased by the owner)
#   note(text)                          a fading note over the panel
#   voice, voice_pitch                  the typing blips (sfx ui_blip_<voice>)
#   static rows(text) / label_fits(text) the layout check (conversation_test.gd)

signal picked(i: int)
signal advance

const ROWS := 3
const TEXT_W := 830.0       # the panel's text width at 1280 x 720 (UIDialogPanel default box less its margins)
const TEXT_MIN := 22        # a line may shrink to this before it no longer fits (UIDialogPanel goes to 20)
const LABEL_W := 330.0      # a choice's text room (UIChoiceList row less its number and tone chip)
const TONES := {
	"eager": "EAGER", "kind": "KIND", "cheeky": "CHEEKY", "curious": "ASK",
	"quiet": "QUIET", "firm": "FIRM", "bye": "",
}

var dp: UIDialogPanel
var choices: Array = []
var cine := 0.0
var voice := "mid"
var voice_pitch := 1.0
var _note := ""
var _note_t := 99.0
var _on := false
var _vig: GradientTexture2D

var sel: int:
	get: return dp.choices.selected if dp else 0
	set(v):
		if dp == null or dp.choices.count() == 0: return
		var n := 0
		while dp.choices.selected != v and n < dp.choices.count():
			dp.choices.move(1 if v > dp.choices.selected else -1); n += 1

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	dp = UIDialogPanel.new()
	dp.input_enabled = false    # conversation.gd routes the buttons; taps come through _input below
	add_child(dp)
	dp.visible = false
	dp.choice_picked.connect(func(i, _c): _picked(i))
	dp.typed.connect(_blip)
	var g := Gradient.new()
	g.set_color(0, Color(0, 0, 0, 0)); g.set_color(1, Color(0.01, 0.01, 0.04, 0.5))
	g.set_offset(0, 0.55)
	_vig = GradientTexture2D.new()
	_vig.gradient = g
	_vig.fill = GradientTexture2D.FILL_RADIAL
	_vig.fill_from = Vector2(0.5, 0.5); _vig.fill_to = Vector2(1.05, 0.5)
	_vig.width = 128; _vig.height = 128

# ---------- the interface ----------
func show_line(who: String, t: String, c: Color) -> void:
	choices = []; _on = true
	dp.clear_choices()
	dp.set_speaker(who, "", c)
	dp.show_line(t, who if who != "" else " ")
	if who == "": dp.set_speaker("", "", c)

func show_choices(list: Array) -> void:
	choices = list; _on = true
	dp.skip()
	var items := []
	for c in list:
		var tag := ""
		match String(c.get("kind", "")):
			"rumor": tag = "RUMOUR"
			"clue": tag = "QUEST"
			"bye": tag = ""
			"topic", "doing": tag = "ASKED" if c.get("dim", false) else ""
			_: tag = String(TONES.get(String(c.get("tone", "")), ""))
		items.append({"text": String(c.get("label", "")), "tag": tag})
	dp.show_choices(items)
	# start on the first one not read yet
	for i in list.size():
		if not list[i].get("dim", false): dp.choices.selected = i; break

func hide_panel() -> void:
	_on = false; choices = []
	dp.clear_choices()
	dp.slide_out()

func typing() -> bool: return _on and choices.is_empty() and dp.is_typing()
func finish() -> void: dp.skip()
func choosing() -> bool: return not choices.is_empty()

func move(d: int) -> void:
	if not choices.is_empty(): dp.choices.move(d)

func confirm() -> void:
	if not choices.is_empty(): dp.choices.pick(dp.choices.selected)

func _picked(i: int) -> void:
	if choices.is_empty(): return
	choices = []
	dp.clear_choices()
	picked.emit(i)

func note(t: String) -> void:
	_note = t; _note_t = 0.0

func _blip(k: int) -> void:
	var line := dp.line
	if k % 3 != 0 or k >= line.length() - 1 or line[k] == " ": return
	if Sfx.I != null and Sfx.I.ui_on: Sfx.play("ui_blip_" + voice, null, {"pitch": voice_pitch})

# ---------- layout (also for the test) ----------
# rows a line takes in the panel at the smallest size it is allowed to shrink to
static func rows(t: String) -> int:
	if t == "": return 0
	return UITheme.wrap(t, "body", TEXT_MIN, TEXT_W).size()

static func label_fits(t: String) -> bool:
	return UITheme.text_w(t, "body_bold", 22) <= LABEL_W

# ---------- input: taps, clicks, number keys ----------
func _input(e: InputEvent) -> void:
	if not _on or not visible: return
	var tap: bool = (e is InputEventScreenTouch and e.pressed) or (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT)
	if not choices.is_empty():
		if (tap or (e is InputEventKey and e.pressed) or e is InputEventMouseMotion) and not (e is InputEventKey and not (e.keycode >= KEY_1 and e.keycode <= KEY_9)):
			if dp.choices.handle(e): get_viewport().set_input_as_handled()
		return
	if tap and dp.box_rect().grow(20).has_point(e.position):
		get_viewport().set_input_as_handled()
		advance.emit()

# ---------- the frame ----------
func _process(dt: float) -> void:
	_note_t += dt
	if size != get_viewport_rect().size: size = get_viewport_rect().size
	# above the letterbox bar
	var r := UIDialogPanel.default_rect(self)
	r.position.y -= size.y * 0.035 * cine
	dp.anchor_rect = r
	if cine > 0.001 or _note_t < 3.0: queue_redraw()

func _draw() -> void:
	var W := size.x
	var H := size.y
	if cine > 0.001:
		draw_texture_rect(_vig, Rect2(-W * 0.1, -H * 0.15, W * 1.2, H * 1.3), false, Color(1, 1, 1, cine))
		var bar := H * 0.04 * cine
		draw_rect(Rect2(0, 0, W, bar), Color(0, 0, 0, 0.92 * cine))
		draw_rect(Rect2(0, H - bar, W, bar), Color(0, 0, 0, 0.92 * cine))
	if _note_t < 3.0:
		var a := minf(1.0, _note_t * 3.0) * minf(1.0, (3.0 - _note_t) * 1.5)
		var y := dp.box_rect().position.y - 44.0 if _on else H - 80.0
		UITheme.text(self, Vector2(W * 0.5, y), _note.to_upper(), "label", 18, Color(UITheme.YELLOW, a * 0.95), 1, -1.0, 3)
