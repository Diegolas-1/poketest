class_name DialogBox
extends Control
# The text box, the prompt over whatever is in reach, and the area banner,
# in the UI design system's look (ui/ui_theme.gd, ui/README.md):
#   box     UIDialogPanel.draw_box: a crisp white panel with the speaker's
#           nameplate ("OAK: Hey!" puts OAK on the plate; later lines of the
#           same say() keep the speaker), the line typed out at 55 letters a
#           second, the advance mark (A glyph + a bobbing chevron) when done.
#           Slides up into place and drops away on close.
#   prompt  a skewed dark chip with the device's button glyph and the label,
#           a pointer down at the thing; pops in when it changes
#   banner  the area's name, big italic uppercase on a red slash with
#           chevrons, the subtitle on a dark plate; wipes in, holds, slides out
#
#   say(lines, on_done)   next()   open   prompt = {pos, label} or {}   banner(title, sub)
#   voice = "text" | "low" | "mid" | "high" | "kid" | "critter", voice_pitch: the
#   typing blips (sfx ui_blip_<voice>), set by the caller before say()

const BAN_LEN := 4.2

var lines: Array = []
var i := 0
var shown := 0.0
var on_done: Callable
var prompt := {}            # {pos: Vector2, label: String}
var safe_bottom := 10.0
var t := 0.0
var _ban_title := ""
var _ban_sub := ""
var _ban_t := 99.0
var _was_busy := true
var voice := "text"
var voice_pitch := 1.0
var _blip_at := -1           # the last group of three letters that blipped
var _open_t := 0.0           # since the box opened (slide in)
var _close_t := 9.0          # since it closed (drop away)
var _last := ["", "", 0]     # what was last shown: speaker, text, letters (for the close)
var _speaker := ""
var _prompt_key := ""
var _prompt_t := 9.0

var open: bool:
	get: return not lines.is_empty()

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if UIInput.I: UIInput.I.device_changed.connect(func(_d): queue_redraw())

func say(l: Array, done: Callable = Callable()) -> void:
	if lines.is_empty(): _open_t = 0.0
	lines = l; i = 0; shown = 0.0; on_done = done; _blip_at = -1
	_speaker = ""
	Sfx.ui("ui_dialog_open")
	queue_redraw()

# A press: finish the line, or go to the next one, or close
func next() -> void:
	if lines.is_empty(): return
	var line: String = lines[i]
	if shown < line.length():
		shown = line.length(); return
	i += 1; shown = 0.0; _blip_at = -1
	Sfx.ui("ui_dialog_advance" if i < lines.size() else "ui_dialog_close")
	if i >= lines.size():
		lines = []
		_close_t = 0.0
		var f := on_done
		on_done = Callable()
		if f.is_valid(): f.call()

func banner(title: String, sub: String) -> void:
	_ban_title = title; _ban_sub = sub; _ban_t = 0.0
	Sfx.ui("ui_banner")

func _process(dt: float) -> void:
	t += dt
	if size != get_viewport_rect().size: size = get_viewport_rect().size
	var animating := _ban_t < BAN_LEN + 0.1 or _open_t < UITheme.SLOW or _close_t < UITheme.BASE or _prompt_t < UITheme.SLOW
	var busy := open or not prompt.is_empty() or animating or _was_busy
	_was_busy = open or not prompt.is_empty() or animating
	if busy: queue_redraw()
	_open_t += dt
	_close_t += dt
	_prompt_t += dt
	if open:
		var line: String = lines[i]
		shown = minf(float(line.length()), shown + dt * 55.0)
		# a blip every third letter typed (not on a space), in the speaker's voice
		var k := int(shown) - 1
		if k >= 0 and floori(k / 3.0) != _blip_at and k < line.length() - 1:
			_blip_at = floori(k / 3.0)
			if line[k] != " " and Sfx.I != null and Sfx.I.ui_on: Sfx.play("ui_blip_" + voice, null, {"pitch": voice_pitch})
	_ban_t += dt
	# the prompt pops in when it changes (another thing, another label)
	var pk := "" if prompt.is_empty() else String(prompt.label)
	if pk != _prompt_key:
		_prompt_key = pk
		if pk != "": _prompt_t = 0.0

func _draw() -> void:
	if not prompt.is_empty() and not open: _draw_prompt()
	if _ban_t < BAN_LEN: _draw_banner()
	_draw_box()

func _draw_prompt() -> void:
	var k := clampf(_prompt_t / UITheme.POP, 0.0, 1.0)
	var s := lerpf(0.7, 1.0, UITheme.ease_back(k, 2.4))
	var a := clampf(_prompt_t / UITheme.FAST, 0.0, 1.0)
	var p: Vector2 = prompt.pos
	UITheme.prompt(self, p + Vector2(0, (1.0 - k) * 8.0), String(prompt.label), "use", a, s)

# ---------- the area banner ----------
func _draw_banner() -> void:
	var W := size.x
	var bt := _ban_t
	var t_in := 0.45
	var t_out := 0.5
	var a := UITheme.envelope(bt, 0.25, BAN_LEN - 0.25 - t_out, t_out)
	var e_in := UITheme.ease_out_expo(bt / t_in)
	var e_out := UITheme.ease_in(clampf((bt - (BAN_LEN - t_out)) / t_out, 0.0, 1.0))
	var sr := UITheme.safe_rect(self)
	var cx := sr.get_center().x
	var ty := sr.position.y + sr.size.y * 0.17 + 56.0
	var title := _ban_title.to_upper()
	var tsz := UITheme.fs("display") + 8
	var tw := UITheme.text_w(title, "display", tsz)
	var slide := (1.0 - e_in) * -70.0 + e_out * 90.0
	# the red slash behind the title: wipes in from the left
	var bw := (tw + 120.0) * e_in
	var bar := Rect2(cx - (tw + 120.0) * 0.5 + e_out * 60.0, ty - tsz * 0.42, bw, tsz * 0.62)
	UITheme.para(self, Rect2(bar.position + Vector2(6, 6), bar.size), Color(0, 0, 0, 0.25 * a), 0.9)
	UITheme.fill_v(self, UITheme.para_points(bar, 0.9), Color(UITheme.RED, 0.95 * a), Color(UITheme.RED_DEEP, 0.95 * a))
	# the title: italic, white, a dark edge
	UITheme.text(self, Vector2(cx + slide, ty), title, "display", tsz, Color(UITheme.WHITE, a), 1, -1.0, 8, Color(UITheme.INK, 0.55 * a))
	# chevrons either side
	var ch := 30.0
	UITheme.chevrons(self, Vector2(cx - tw * 0.5 - 84.0 + slide, ty - tsz * 0.12), ch, Color(UITheme.YELLOW, a), 3, -1.0)
	UITheme.chevrons(self, Vector2(cx + tw * 0.5 + 84.0 + slide, ty - tsz * 0.12), ch, Color(UITheme.YELLOW, a), 3, 1.0)
	# the subtitle on a dark plate, a beat later
	if _ban_sub != "":
		var sub := _ban_sub.to_upper()
		var ssz := 22
		var sw := UITheme.text_w(sub, "label", ssz) + 70.0
		var k2 := UITheme.ease_out(clampf((bt - 0.15) / 0.35, 0.0, 1.0))
		var sp := Rect2(cx - sw * 0.5 - (1.0 - k2) * 30.0 + e_out * 50.0, ty + 18.0, sw, 38.0)
		var a2 := a * k2
		UITheme.plate(self, sp, a2)
		UITheme.icon(self, "ball", Vector2(sp.position.x + 24.0, sp.get_center().y), 10.0, Color(1, 1, 1, a2))
		UITheme.text_mid(self, Vector2(sp.position.x + 44.0, sp.get_center().y), sub, "label", ssz, Color(UITheme.TEXT, a2))

# ---------- the box ----------
func _draw_box() -> void:
	var r := UIDialogPanel.default_rect(self)
	r.position.y -= maxf(0.0, safe_bottom - 10.0)
	if open:
		var line: String = lines[i]
		var sp := UIDialogPanel.split_speaker(line)
		if sp[0] != "": _speaker = sp[0]
		elif i == 0 or line.begins_with("("): _speaker = ""
		var pre := line.length() - String(sp[1]).length()
		var n := maxi(0, int(shown) - pre)
		_last = [_speaker, sp[1], n]
		var k := clampf(_open_t / UITheme.BASE, 0.0, 1.0)
		var e := UITheme.ease_back(k, 1.3)
		r.position.y += (1.0 - e) * 46.0
		UIDialogPanel.draw_box(self, r, _speaker, "", Color(0, 0, 0, 0), sp[1], n, shown >= line.length(), t, UITheme.ease_out(k), 1.0 - e)
	elif _close_t < UITheme.BASE and String(_last[1]) != "":
		var k2 := clampf(_close_t / (UITheme.BASE * 0.8), 0.0, 1.0)
		r.position.y += UITheme.ease_in(k2) * 40.0
		UIDialogPanel.draw_box(self, r, _last[0], "", Color(0, 0, 0, 0), _last[1], _last[2], false, t, 1.0 - k2, 0.0)
