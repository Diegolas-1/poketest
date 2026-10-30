extends RefCounted
# The staging menu's REGIONS page (arena/arena_menu.gd draws it through here): a
# card for the hub and one for each region (ArenaRegions): its name and blurb,
# who lives there, and its buttons:
#   GO THERE     the wipe to it (arena.go_region)
#   STAGE HUNT   its own hunt (its def's species, count and levels; Ash alone or
#                with TRAINER's party, as WILD's switch says), staged where it is
#   AMBUSH       its ambush, when the arena has an ambush system (arena "ambush":
#                stage_region(id)); dimmed until then

static func draw(m, body: Rect2) -> void:
	var cards := [{"id": "", "name": "Training Ground", "blurb": "The clay field, the meadow and its tall grass: the hub, every region's gate off it.", "species": []}]
	for d in ArenaRegions.all():
		var S: Dictionary = d.get("sources", {})
		var sp := []
		for k in S: for id in S[k]: if not sp.has(id): sp.append(id)
		cards.append({"id": String(d.id), "name": String(d.name), "blurb": String(d.get("blurb", "")), "species": sp})
	var here: String = m.arena.region_now() if m.arena else ""
	var gap := 18.0
	var n := cards.size()
	var cw := minf(560.0, (body.size.x - gap * (n - 1)) / n)
	var ch := body.size.y - 10.0
	var k: float = m.k
	for i in n:
		var c: Dictionary = cards[i]
		var id: String = c.id
		var r := Rect2(body.position.x + i * (cw + gap), body.position.y, cw, ch)
		UITheme.fill(m, UITheme.para_points(r, UITheme.SKEW * 0.15), Color(UITheme.INK, 0.06 * k))
		UITheme.accent_bar(m, r, Color(UITheme.GREEN if id != "" else UITheme.RED, k), k, 0.0, 6.0)
		var x := r.position.x + 24.0
		var y := r.position.y + 50.0
		UITheme.text(m, Vector2(x, y), String(c.name).to_upper(), "display", 36, Color(UITheme.INK, k))
		if id == here: UITheme.chip(m, Vector2(r.end.x - 110.0, r.position.y + 18.0), "YOU'RE HERE", UITheme.GREEN, Color.WHITE, 13, 22.0, k)
		y += 18.0
		for row in UITheme.wrap(String(c.blurb), "body", 18, cw - 48.0):
			y += 24.0
			UITheme.text(m, Vector2(x, y), row, "body", 18, Color(UITheme.INK_SOFT, k))
		if not (c.species as Array).is_empty():
			y += 30.0
			m._label(Vector2(x, y), "WHO LIVES HERE")
			y += 10.0
			var cx := x
			for sid in c.species:
				var nm := ArenaSetups.species_name(String(sid)).to_upper()
				var w := UITheme.text_w(nm, "label", 13) + 22.0
				if cx + w > r.end.x - 20.0: cx = x; y += 28.0
				UITheme.chip(m, Vector2(cx, y), nm, UITheme.SKY, Color.WHITE, 13, 22.0, k)
				cx += w + 6.0
		var by := r.end.y - 64.0
		var bw := (cw - 48.0 - 16.0) / 3.0 if id != "" else cw - 48.0
		m._button("rgo:" + id, Rect2(x, by, bw, 50.0), "GO THERE", func(): _go(m, id), UITheme.SKY, false, false)
		if id == "": continue
		m._button("rhunt:" + id, Rect2(x + bw + 8.0, by, bw, 50.0), "STAGE HUNT", func(): _hunt(m, id), UITheme.GREEN, true)
		var amb = _ambush(m)
		m._button("ramb:" + id, Rect2(x + 2.0 * (bw + 8.0), by, bw, 50.0), "AMBUSH", func(): _amb(m, id), UITheme.ORANGE, false, false, "" if amb else "SOON")

static func _go(m, id: String) -> void:
	Sfx.ui("ui_confirm")
	m.close()
	m.arena.go_region(id)

static func _hunt(m, id: String) -> void:
	var d := ArenaRegions.get_def(id)
	var H: Dictionary = d.get("hunt", {})
	var s: Dictionary = m.setup
	if s.wild.with_party and (s.ash as Array).is_empty():
		m.toast("Ash's party is empty: add one on TRAINER", UITheme.RED); Sfx.ui("ui_error"); return
	var h := ArenaSetups.default_hunt()
	h.species = (H.get("species", h.species) as Array).duplicate()
	h.count = int(H.get("count", 8))
	h.lv = (H.get("lv", [3, 8]) as Array).duplicate()
	h.temper = String(H.get("temper", "species"))
	h.region = id
	Sfx.ui("ui_confirm")
	m.close()
	var a = m.arena
	if a.hunt.on: a.hunt.stop(false)
	var party: Array = (s.ash as Array).duplicate(true)
	var wp := bool(s.wild.with_party)
	a.go_region(id, func(): a.hunt.start(h, party, wp))

static func _ambush(m):
	var a = m.arena
	var amb = a.get("ambush") if a else null
	if amb == null and a: amb = a.get_node_or_null("Ambush")
	return amb if amb != null and amb.has_method("stage_region") else null

static func _amb(m, id: String) -> void:
	var amb = _ambush(m)
	if amb == null:
		m.toast("No ambush system in this build yet", UITheme.ORANGE); Sfx.ui("ui_error"); return
	Sfx.ui("ui_confirm")
	m.close()
	m.arena.go_region(id, func(): amb.stage_region(id))
