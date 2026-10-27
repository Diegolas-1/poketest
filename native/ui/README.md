# UI design system (native)

A Pokémon feel with an Overwatch-style HUD. You get Poké Ball red, white and ink, plus
Pokémon yellow and sky blue. Icons stay round and friendly. On top of that sit slanted
parallelogram plates, accent bars, chamfered corners and layered translucent dark plates.
Type is big, condensed, italic and uppercase. Buttons show controller glyphs, and motion
is snappy and eased. Use these pieces for any new UI so every screen stays consistent.
Every piece appears on the gallery page:

    godot --path native --resolution 1280x800 res://dev/ui_gallery.tscn -- --page=components|dialog|tokens [--device=touch|pad|keys] [--shot=out.png]

## Tokens (`ui_theme.gd`, `class_name UITheme`, all static)

| | |
|---|---|
| Colour | `RED` (primary, "use"), `RED_DEEP`, `WHITE` / `PAPER` (light panel gradient), `INK` (text on light), `INK_SOFT`, `PLATE` / `PLATE_HI` (dark translucent plates), `PLATE_LINE`, `YELLOW` (focus, new, changed), `SKY`, `BLUE`, `GREEN`, `ORANGE`, `PURPLE`, `TEXT` / `TEXT_DIM` (on dark), `SHADOW`, `DIM` (modal scrim). `KIND[kind]` maps toast kinds to accents. `speaker_color(name)` gives a steady colour per speaker. |
| Type | `font(role)`: `display` (Barlow Condensed ExtraBold Italic: headings, banner, nameplates), `heading` (Bold Italic), `label` (Bold, upright: buttons, chips, tabs, always UPPERCASE), `label_semi`, `body` / `body_bold` (Barlow Semi Condensed: sentences), `number` (tabular figures: clock, FPS), `pixel` (Pixelify Sans: Pokémon flavour only). Sizes in `SIZE` / `fs(name)`: hero 76, display 56, title 40, h2 30, h3 24, body 22, label 20, small 17, micro 14 (viewport units; the viewport is 720 high, so 1 unit is about 0.55 pt on an iPhone in landscape). |
| Shape | `SKEW` 0.2 (parallelograms lean right, about 11°), `CUT` 14 (chamfer), `BAR` 6 (accent bar), `LINE` 1.5, spacing `GAP` 8 / `PAD` 16, `RADIUS` 6 (kept for icons and chips only). |
| Touch | `TOUCH_PT` 44. `touch_min(ci)` is 44 pt in viewport units (never under 56). `touch_rect(ci, r)` grows a hit rect to it. `units_per_pt(ci)`. `safe_rect(ci, override)` is the iPhone safe area in viewport units. |
| Motion | `FAST` 0.12 s (hover, select), `BASE` 0.22 s (slide in / out), `SLOW` 0.38 s, `POP` 0.18 s (scale pop). Easings: `ease_out` (cubic), `ease_out_expo`, `ease_back` (overshoot), `ease_in`, `envelope(t, in, hold, out)`. |

## Drawing helpers (any `CanvasItem` in its `_draw`)

* `plate(ci, r, a, skew, col, cut)` draws a dark plate with a shadow and a top highlight.
* `panel(ci, r, accent, a, skew, cut, bar)` draws a white panel with an accent bar and a cut corner.
* `para`, `para_points`, `chamfer_points`, `fill`, `fill_v` (gradient), `outline`, `shadow`, `accent_bar`, `glow`.
* `chevrons(ci, at, h, col, n, dir)`, `chevron_down`, `chevron_up`.
* `text(ci, at, s, role, size, col, align, max_w, outline_px)`, `text_mid` (centred on y), `text_w`, `wrap`.
* `chip(ci, at, "NEW", col)` draws a small skewed label. `bar(ci, r, f, col, a, segments)` draws a skewed or segmented bar.
* `glyph(ci, c, action, h)` draws the button for an action on the current device: a disc on a pad (A, B, X, +, -), a keycap on the keyboard (E, ESC, SPACE…) or a shoulder pill (L / R). `glyph_label(action)` gives the button's name. Actions are `use`, `back`, `jump`, `menu`, `quests`, `run`, `recenter`, `tab_l`, `tab_r`.
* `prompt(ci, p, label, action, a, s)` draws the "[A] TALK" chip with a pointer down at p.
* `icon(ci, id, c, r, col)` draws one of `cog`, `log`, `ball`, `close`, `bolt`, `jump`, `bell`, `bang`, `check`, `star`, `bag`, `map`, `bike`, `clock`, `update`, `warn`, `chat`, `drop`, `sweat`, `heart`, `sun` or `snow`.
* `theme()` is a Godot `Theme` for node-built screens (body font, scroll bars). `style_button(b, variant)` styles a plain `Button`, and `sb(...)` makes a skewable `StyleBoxFlat`. `label(text, role, size, col)` makes a `Label`.

`UIWidgets` (`ui_widgets.gd`) has the shared HUD pieces as static draws:

* `badge(...)` and `badge_width` draw a condition badge.
* `card(...)` and `card_height` draw a tooltip card with a pointer.
* `meter(...)` draws the segmented meter with an icon disc (stamina).
* `icon_disc` draws an icon on a disc.
* `bubble(ci, tip, rows, size, near, screen_w)` draws a speech bubble.
* `quest_mark(ci, at, s, bob)` draws the yellow "!".

`UIInput` (`ui_input.gd`) tracks the last device used (`UIInput.device`: `touch`, `pad` or `keys`). Its signal `UIInput.I.device_changed` fires on a change, and `UIInput.force(d)` sets the device for shots. `settings.gd` creates the one instance.

## Components (nodes)

| Class | What | API |
|---|---|---|
| `UIPanel` (Container) | light, dark or accent panel that fits its children inside `padding`, with an optional title strip | `style`, `accent`, `skew`, `cut`, `bar`, `title`, `padding` |
| `UIButton` (BaseButton) | skewed button with an icon first, then text, then a glyph; hover / focus edge, press pop | `text`, `icon_id`, `glyph` (action), `variant` (primary, secondary, light, ghost, yellow), `font_size`, `badge`; BaseButton signals |
| `UIIconButton` (BaseButton) | HUD icon button, or a black pill beside the Dynamic Island | `icon_id`, `badge`, `pill`, `glyph`, `hit_rect()` (at least 44 pt) |
| `UITabs` | skewed tabs; the selection slides; L / R glyphs at the ends on pad or keys | `tabs`, `counts`, `selected`, `light`, `set_selected(i)`, `step(d)`, signal `tab_changed(i)` |
| `UIToaster` | queue of toasts that slide in with a sheen, hold, then slide out | `push(kind, head, text, icon, hold)`, `clear()`, `anchor` ("top" / "center"), `paused`; static `draw_toast(ci, q, t, safe_rect)` for screens that keep their own queue |
| `UIControls.Badge` / `.Progress` / `.Prompt` / `.Card` | node versions of the drawn widgets | see `ui_controls.gd` |
| `UIDialogPanel` | dialog: speaker nameplate, typewriter line, advance mark, choices; slides in and out | below |
| `UIChoiceList` | list of choices (what Ash can say) | below |

### UIDialogPanel and UIChoiceList (for the conversation mode)

```gdscript
var dp := UIDialogPanel.new(); add_child(dp)          # in a CanvasLayer
dp.set_speaker("Prof. Oak", "Professor")              # colour: a third arg, or from the name
dp.show_line("Ah, Ash! There you are.")               # slides in, types at chars_per_sec (55)
dp.typed.connect(func(i): Sfx.play("ui_blip_low"))    # every letter typed (voice blips)
dp.line_finished.connect(...)                         # typing reached the end
dp.advanced.connect(next_line)                        # A / Enter / tap after the line is done
dp.show_choices(["Sure!", {"text": "What's inside?", "tag": "Ask"}, {"text": "Battle!", "disabled": true}])
dp.choice_picked.connect(func(i, choice): ...)        # 1-9 keys, up/down + A, tap, mouse
dp.choice_hovered.connect(func(i): ...)
dp.slide_out(); dp.closed.connect(...)
```

* `press()` is the advance button: it finishes the line, then picks the selected choice or emits `advanced`.
* `skip()` and `is_typing()` work as named. `"OAK: Hello"` sets the speaker from an uppercase tag.
* `input_enabled = false` lets the parent route input and call `press()` itself.
* `anchor_rect` places the panel (by default it sits at the bottom centre of the safe area), and `safe_override` sets the safe area.
* The static `UIDialogPanel.draw_box(ci, rect, speaker, role, colour, text, shown_chars, done, t)` draws the same box anywhere. `DialogBox` (dialog.gd) uses it, so the world's text box and a conversation look the same.
* A line keeps to 3 rows: the text shrinks from 30 to 20 when it needs to. `quests.gd fit_lines` still splits lines by the old, wider Pixelify metric, so every line fits.

`UIChoiceList` works on its own too: `set_choices(list)`, `selected`, `move(d)`, `pick(i)` and `handle(event) -> bool`, with signals `picked(i, choice)` and `hovered(i)`.

## Rules of thumb

* Use dark plates over the 3D world (HUD) and light panels for reading (dialog, quest log, cards).
* Make labels, tabs and headings UPPERCASE condensed, and sentences sentence-case body.
* Give every touch target at least 44 pt (`touch_rect`), and keep everything inside `safe_rect`.
* Redraw only on change or while animating: cache wrapped text, never allocate per frame when idle.
* Animate with the tokens: slide 40–70 px with `ease_back` / `ease_out_expo` in `BASE`, fade in `FAST`, pop in `POP`.
* Fonts live in `native/fonts/`: Barlow (OFL, `OFL-Barlow.txt`) and Pixelify Sans (OFL, `OFL.txt`).
