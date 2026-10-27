class_name UIToaster
extends Control
# Toasts: a queue of short notices that slide in (skewed, with a quick
# sheen), hold, and slide out, one at a time. An accent block with the
# kind's icon on the left, a small uppercase head in the accent colour, the
# text big and bold. Draws only while one is showing.
#   push(kind, head, text, icon := "", hold := HOLD)   kind: a UITheme.KIND key (or any; accent = RED)
#   clear()
#   anchor: "top" (centred under the top of the safe area) | "center" (a third down, smaller)
#   paused: true holds the queue (e.g. while a menu is open)
#   safe_override: a Rect2 to pretend a safe area; side_room: keep this much free at each side
#   T_IN, HOLD, T_OUT: the timing

const T_IN := 0.26
const HOLD := 2.6
const T_OUT := 0.3
const ICONS := {"start": "bang", "complete": "check", "step": "chevron", "progress": "chevron", "item": "bag", "rumor": "chat",
	"info": "bang", "warn": "warn", "update": "update"}

var queue: Array = []        # [{kind, head, text, icon}]
var anchor := "top"
var paused := false
var safe_override := Rect2()
var side_room := 0.0
var _t := 0.0
var _max := 5

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_process(false)

func push(kind: String, head: String, text: String, icon := "", hold := HOLD) -> void:
	queue.append({"kind": kind, "head": head, "text": text, "icon": icon, "hold": hold})
	if queue.size() > _max: queue.pop_front()
	set_process(true)

func clear() -> void:
	queue.clear(); _t = 0.0; queue_redraw()

func showing() -> bool: return not queue.is_empty()

func _process(dt: float) -> void:
	if size != get_viewport_rect().size: size = get_viewport_rect().size
	if queue.is_empty():
		set_process(false); queue_redraw(); return
	if paused: return
	_t += dt
	if _t > T_IN + float(queue[0].get("hold", HOLD)) + T_OUT:
		queue.pop_front(); _t = 0.0
	queue_redraw()

func _draw() -> void:
	if queue.is_empty() or paused: return
	var q: Dictionary = queue[0]
	draw_toast(self, q, _t, UITheme.safe_rect(self, safe_override), anchor, side_room)

static func draw_toast(ci: CanvasItem, q: Dictionary, t: float, sr: Rect2, where := "top", side := 0.0) -> void:
	var kind := String(q.kind)
	var accent: Color = UITheme.KIND.get(kind, UITheme.RED)
	var hold := float(q.get("hold", HOLD))
	var a := UITheme.envelope(t, T_IN, hold, T_OUT)
	var e_in := UITheme.ease_back(clampf(t / T_IN, 0.0, 1.0), 1.4)
	var e_out := UITheme.ease_in(clampf((t - T_IN - hold) / T_OUT, 0.0, 1.0))
	var small := where == "center"
	var head := String(q.head).to_upper()
	var text := String(q.text)
	var hs := 15
	var ts := 26 if not small else 23
	var hw := UITheme.text_w(head, "label", hs)
	var tw := UITheme.text_w(text, "heading", ts)
	var icon_w := 66.0 if not small else 52.0
	var w := minf(maxf(hw + 20.0, tw) + icon_w + 44.0, sr.size.x - 32.0 - side * 2.0)
	var h := 74.0 if not small else 60.0
	var x := sr.position.x + (sr.size.x - w) * 0.5 + (1.0 - e_in) * -60.0 + e_out * 60.0
	var y := sr.position.y + 16.0 if not small else sr.position.y + sr.size.y * 0.24
	var r := Rect2(x, y, w, h)
	# the plate with its accent block
	var pts := UITheme.plate(ci, r, a)
	UITheme.outline(ci, pts, Color(1, 1, 1, 0.12 * a), 1.0)
	var ib := Rect2(x - 4.0, y, icon_w, h)
	var ipts := UITheme.para_points(ib)
	UITheme.fill_v(ci, ipts, Color(accent.lightened(0.1), a), Color(accent.darkened(0.08), a))
	var ic := String(q.get("icon", ""))
	if ic == "": ic = ICONS.get(kind, "bang")
	var icc := Vector2(ib.get_center().x, ib.get_center().y)
	var dark_icon := accent == UITheme.YELLOW
	if ic == "chevron": UITheme.chevrons(ci, icc - Vector2(7, 0), 26.0, Color(UITheme.INK if dark_icon else Color.WHITE, a), 2)
	else: UITheme.icon(ci, ic, icc, 15.0 if not small else 12.0, Color(UITheme.INK if dark_icon else Color.WHITE, a))
	# the sheen: a bright skewed stripe sweeping across once
	var sh := clampf((t - T_IN * 0.6) / 0.5, 0.0, 1.0)
	if sh > 0.0 and sh < 1.0:
		var sx := lerpf(r.position.x, r.end.x, sh)
		UITheme.para(ci, Rect2(sx, r.position.y, 26.0, h), Color(1, 1, 1, 0.16 * a), 0.8)
	var tx := ib.end.x + 16.0
	UITheme.text(ci, Vector2(tx, y + (25.0 if not small else 21.0)), head, "label", hs, Color(accent.lightened(0.25), a))
	UITheme.text(ci, Vector2(tx, y + h - (17.0 if not small else 14.0)), text, "heading", ts, Color(UITheme.TEXT, a), 0, r.end.x - tx - 18.0)
	# the accent foot
	UITheme.para(ci, Rect2(ib.end.x - 3.0, r.end.y - 3.0, r.end.x - ib.end.x, 3.0), Color(accent, a * 0.85))
