# Energy: moves paid for like Trading Card Game energy

The battle mechanic for every Pokémon (wild ones now, Ash's own later). It's inspired by the energy cards of the Pokémon Trading Card Game, used like mana. Ash has no energy: his fatigue bar is his battle health (the battle owns that).

Code: `native/battle/energy.gd` (`BattleEnergy`, the rules, headless), `native/battle/energy_hook.gd` (`EnergyHook`, the plug into the battle), `native/ui/energy_icon.gd`, `energy_bar.gd`, `energy_move_list.gd` (the look). Data: `native/life/pokemon.json`, `native/life/moves.json`. Test: `dev/energy_test.tscn`. Look: `dev/energy_shot.tscn`.

## The rules

1. **Each turn a Pokémon focuses a little more.** On turn *n* of a battle it has `min(n, capacity)` energy chips. Turn 1 has 1 chip, turn 2 has 2, and so on until the bar is full. A fight that drags on gets more dangerous.
2. **Energy resets each turn.** Unspent chips don't carry over, so there's nothing to hoard. The choice is how to spend this turn's chips.
3. **Several actions a turn.** A move costs chips. A Pokémon can use as many moves as its chips pay for: one big move, or several cheap ones. Repeats are allowed.
4. **Chips have types, as in the TCG.** Each chip is an energy kind. A typed cost (Fire) is paid only by a chip of that kind. A Colorless cost is paid by any chip. Matching works TCG-style: every typed cost is matched first, and each Colorless cost is then paid from what's left, using real Colorless chips first and then the kind it has most of, so the rarer kinds stay for typed costs.
5. **Which kinds come.** Each species has a focus order: the kinds its chips come in, cycled from the first chip of every turn. It's mostly the Pokémon's own types, plus Colorless. Normal folds into Colorless, as in the TCG. Pidgey's order is Flying, Colorless; Pikachu's is Lightning, Lightning, Colorless; Bulbasaur's is Grass, Grass, Poison, Colorless, Grass. Turn 1 is always the Pokémon's own type. The order is deterministic, so the player can read a foe's bar and plan against it.
6. **No four-move cap.** Moves are learned by level and never forgotten. The real limit is the bar: a move costs at most `capacity` chips. A move can be learned once the level is reached *and* the bar at that level can pay its cost. A known move that is bigger than the bar shows as locked, with the level its slots open. This happens with a TM, or with a Pokémon that knows a move from elsewhere.
7. **Levelling unlocks slots.** New slots come at fixed levels (the table below). Each new slot opens the moves that need it.
8. **Items (the hook only).** Rare, expensive items restore chips during a turn, up to capacity: `restore(n, kind)` and `use_item(id)`. Three are sketched in `pokemon.json energy_items`.

### Why it fits the show

- Pokémon in the anime don't have four moves. Pikachu knows a lot, and Ash calls whichever fits the moment. Here the bar is the limit, not the list.
- Fights build. A fresh Pokémon is limited to quick jabs. A few turns in, it can unload a Thunderbolt or a Gust. That's the anime's rhythm: feints first, then the big move. It's also why even a Pidgey is scary: a kid who stays in the fight lets it build up to its best moves.
- The choice is real every turn: one big hit, or a Sand-Attack and a Quick Attack. The TCG's "attach energy, then attack" becomes "focus, then spend".
- Charge-up moves such as Solar Beam and Skull Bash need no special charge-turn rule. They cost 4 chips, which can't come before turn 4.

## Balance numbers

### Slots by level (`pokemon.json capacity`)

| Level | 1 | 3 | 8 | 14 | 21 | 29 | 38 | 48 | 60 | 75 |
|---|---|---|---|---|---|---|---|---|---|---|
| Slots | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 (max) |

A species can shift this with `capacity_shift` (in slots). None does yet.

- Route 1 Pidgey (Lv 2–5) have 1–2 slots.
- A starter at Lv 5 has 2 slots.
- 4-chip moves arrive in the Lv 25–34 band.

### Power per cost (`moves.json`)

| Cost | 1 chip | 2 chips | 3 chips | 4 chips |
|---|---|---|---|---|
| Power | 35–40 | 70–80 | 115–125 | 170–185 |
| Per chip | ~37 | ~37 | ~40 | ~44 |

- **Big moves pay a little more per chip.** This rewards waiting for a full bar.
- **Cheap moves win on flexibility.** You get more actions, priority (Quick Attack), status effects, and you can finish a weak foe without wasting a big move.
- **Off-type moves cost Colorless only, plus one extra chip.** Examples: Iron Tail is 3 Colorless for 115, Bite is 2 Colorless for 65, Dragon Rage is 2 Colorless.

### Pidgey (Normal / Flying; focus Flying, Colorless; wild Lv 2–5)

| Move | Learned | Cost | Power | Acc | Effects |
|---|---|---|---|---|---|
| Tackle | 1 | Colorless | 35 | 95 | – |
| Sand-Attack | 2 | Colorless | – | 100 | lowers accuracy |
| Gust | 3 | Flying + Colorless | 75 | 100 | wind, hits airborne |
| Quick Attack | 3 | Colorless | 30 | 100 | priority +1 |
| Whirlwind | 9 | Colorless ×2 | – | 100 | blows the foe away (ends a wild fight), priority −1 |
| Wing Attack | 15 | Flying ×2 + Colorless | 120 | 100 | – |

A Lv 3 Pidgey has 2 slots. Turn 1 gives it one chip (a jab or sand). From turn 2 on it either Gusts or makes two cheap moves.

### The starters (5 species, 35 moves in `moves.json`)

- **Pikachu** (focus Lightning, Lightning, Colorless):
  - Lv 1: Thunder Shock (Lightning, 40, may paralyse) and Growl
  - Lv 3: Tail Whip
  - Lv 5: Quick Attack
  - Lv 7: Thunder Wave (Lightning)
  - Lv 10: Double Team (Colorless ×2)
  - Lv 16: Thunderbolt (Lightning ×2 + Colorless, 120)
  - Lv 22: Iron Tail (Colorless ×3, 115, acc 75)
  - Lv 30: Thunder (Lightning ×3 + Colorless, 175, acc 70)
- **Bulbasaur** (focus Grass, Grass, Poison, Colorless, Grass):
  - Lv 1: Tackle and Growl
  - Lv 3: Vine Whip (Grass + Colorless, 70)
  - Lv 7: Leech Seed (Grass)
  - Lv 11: PoisonPowder (Poison) and Sleep Powder (Grass + Colorless)
  - Lv 15: Razor Leaf (Grass ×2, 75)
  - Lv 19: Take Down (Colorless ×3, 115, recoil)
  - Lv 30: Solar Beam (Grass ×3 + Colorless, 180)
- **Charmander** (focus Fire, Fire, Colorless):
  - Lv 1: Scratch and Growl
  - Lv 4: Ember (Fire, 40)
  - Lv 8: Smokescreen
  - Lv 12: Dragon Rage (Colorless ×2, always 40)
  - Lv 17: Slash (Colorless ×2, 70)
  - Lv 22: Flamethrower (Fire ×2 + Colorless, 120)
  - Lv 28: Fire Spin (Fire ×2)
- **Squirtle** (focus Water, Water, Colorless):
  - Lv 1: Tackle and Tail Whip
  - Lv 4: Bubble (Water, 35)
  - Lv 7: Withdraw (Water)
  - Lv 10: Water Gun (Water + Colorless, 70)
  - Lv 13: Bite (Colorless ×2)
  - Lv 16: Rapid Spin
  - Lv 25: Skull Bash (Colorless ×4, 170)
  - Lv 34: Hydro Pump (Water ×3 + Colorless, 185, acc 80)

`dev/energy_test` checks every learnset row: the move exists, its kinds are real, and a full bar at its level pays it.

### The wild one's planner (`plan_turn(known, style, ctx)`)

`plan_turn` searches every ordered set of moves this turn's chips can pay for, with repeats and up to 6 actions, and keeps the best by style. Each move is valued as follows:

- **Damage:** power × accuracy × the style's damage weight.
- **Status:** a value per effect, for example acc_down 30, para 34, sleep 40, poison 28, atk_down / def_down 20. On a damaging move a side effect counts 30 %. Each earlier use this battle halves a status move's value, so the second Sand-Attack is worth half the first.
- **Variety:** the same attack again in one turn is worth ×0.75 (×0.92 for the aggressive style). Each earlier use this battle costs ×0.94, up to 4 uses.
- **Priority:** +6, for the first priority move only.
- **Per action:** the style's bonus. **A chip left unspent:** −20.

| Style | Damage | Status | Per action | Biggest cost | Whirlwind | Temper |
|---|---|---|---|---|---|---|
| aggressive | ×1.0 | ×0.3 | −4 | +12 per chip | off | aggressive |
| strategic | ×0.9 | ×1.3 | +8 | – | ×0.5 | flighty, curious |
| evasive | ×0.55 | ×1.6 | +6 | – | ×5 | timid |

The order to act in:

- Priority moves go first.
- Aggressive: the biggest moves next.
- Strategic and evasive: status moves first, then the cheap attacks.
- Whirlwind (priority −1) goes last.

`ctx.rng` + `ctx.jitter` add a little noise, for variety. The hook uses 0.1.

What a Lv 3 Pidgey does over turns 1–5 (no jitter):

| Style | Turns 1–5 |
|---|---|
| aggressive | Quick Attack · Gust · Gust · Gust · Gust |
| strategic (flighty, curious) | Sand-Attack · Quick Attack + Tackle · Quick Attack + Tackle · Gust · Quick Attack + Tackle |
| evasive (timid) | Sand-Attack · Quick Attack + Sand-Attack · Quick Attack + Tackle · Quick Attack + Tackle · … |

A Lv 9 timid Pidgey plays Whirlwind on turn 2.

### Damage guidance for the battle (BATTLE owns the numbers)

A Pidgey can now make 2 moves a turn, so damage should scale with cost. That way one full turn still costs Ash about one "hit", and he survives 3–4 turns of it.

- **Per chip:** about 13–16 of Ash's 100 HP.
- **Pidgey's moves:**
  - Tackle (1 chip): 12–16
  - Quick Attack (1 chip): 10–14
  - Gust (2 chips): 27–33, as battle.gd has it now
  - Sand-Attack: no damage
- **The suggested formula:** `dmg = wild.json dmg × power / 75`, with Gust as the reference.

Turn 1 being a single chip gives the build-up: the first hit is a nip, then it gets serious.

### Items (the hook)

| Item | Restores | Price |
|---|---|---|
| Energy Shard | 1 Colorless | ₽1,500 |
| Focus Crystal | 2 of its own kinds | ₽4,000 |
| Full Charge | the whole bar | ₽12,000 |

They're meant to be rare: shop prices like this, or found once.

## The look

- **Symbols (`EnergyIcon`):** each kind is a flat coloured disc with a white glyph, drawn in code, in the spirit of the TCG's energy symbols. They're original drawings, not card art:
  - Colorless star, Grass leaf, Fire flame, Water drop, Lightning bolt, Psychic eye, Fighting fist
  - Darkness crescent, Metal nut, Dragon head, Fairy butterfly, Ice flake
  - Poison bubbles, Ground peaks, Flying wing, Bug beetle, Rock boulder, Ghost

  They're crisp at any size from 6 px. Options are `dim` (spent), `flat` and `glyph_only`.
- **The bar (`EnergyBar`):** the UI kit's dark skewed plate. It shows the turn tag, ENERGY with the count ("2/3"), and a row of sockets:
  - **Filled:** a chip.
  - **Empty:** a recess with a faint glyph of the kind due there next.
  - **Locked:** hatched. The first locked socket shows the level that opens it.

  It animates by itself from the engine's signals:
  - **A new turn:** last turn's leftovers fade. Each new chip charges up (a ring converges, sparks are drawn in, a blip) and pops (a white flash, a burst, a sparkle with rising pitch, staggered). A "+n" rises off the count.
  - **Spending:** the chips lift and fly out along an arc to the move's target with a trail and a whoosh, then burst there.
  - **Preview:** the chips a hovered move would use rise and get a pulsing yellow ring, and the rest dim. A move it can't pay shows the missing kinds as red-ringed ghosts in the sockets it would need.
- **The move list (`EnergyMoveList`):** one skewed row per move: type disc, name, what it does, and its cost as icons (typed first, then Colorless, as on the cards). Rows have three states:
  - **ready**
  - **short:** dimmed, with the missing chips ringed red
  - **locked:** a lock and "NEEDS n SLOTS · LV x"

  The selected row turns white and drives the bar's preview. There's an END TURN row. Controls:
  - **Touch:** tap to select and preview, tap again to use.
  - **Pad and keys:** up/down, then A/E/Enter. 1–9 picks a row, and B/Esc ends the turn.
  - **Mouse:** hover to select, click to use.

  The list scrolls when it's long, since there's no cap.

## Wiring (what BATTLE calls)

The hook has no hard dependency on battle.gd. Every call into the battle is guarded, so either side can land first.

```gdscript
# battle.gd, once the HUD is up (after the intro, before the first turn):
EnergyHook.attach(self, {"species": species, "level": R.level(), "temper": String(opts.get("temper", "flighty"))})

# the wild side's choice: one function returning the moves for its turn
func _wild_pick(state: Dictionary) -> Array:
	var h := get_node_or_null("EnergyHook")
	if h and h.has_method("wild_pick"): return h.wild_pick(state)   # [{kind:"move", move, first, cost, name, anim, power, accuracy, effects}, ...]
	return [R.decide()]

# _foe_turn: after the battle's own flee / disengage roll says "attack":
#   var plan := _wild_pick({"turn": R.turn + 1, "temper": opts.temper})
#   for p in plan:                       # in order; p.first = Quick Attack's priority
#       var h := get_node_or_null("EnergyHook")
#       if h: h.on_move(p.move, cam.unproject_position(ash_pos + Vector3(0, 1, 0)))   # chips fly at Ash
#       await <play p.move>               # R.foe_turn(p) per move, as now
#   (an empty plan: nothing it can pay for; it gathers itself)

# when the battle ends:
var h := get_node_or_null("EnergyHook"); if h: h.detach()
```

- **The anchor.** Give the battle (or `battle.ui`) `func energy_anchor(side: String) -> Rect2`, or a `energy_anchors := {"foe": Rect2, "ally": Rect2}` property, in HUD coordinates. The foe's anchor goes right under the foe plate: `Rect2(safe.end.x - 422, safe.position.y + 182, 400, 50)`. Without one, the hook uses that rect. The bar fits the rect's height (58 is scale 1) and right-aligns in it.
- **Where the bar lives.** It goes on `battle.layer` (a CanvasLayer), else on `battle.ui`, else on a layer of its own. It slides in and out with `battle.ui.hud_on`.
- **Which moves.** The hook plans only with moves the battle can stage: `battle.energy_moves() -> Array`, else the keys of `R.S.moves` (wild.json's battle moves), else all known moves. Each move dict carries `cost` from moves.json.
- **The fly target.** `on_move(id, to)` takes a screen point. Without one, it unprojects `battle.ash_pos` with `battle.cam`.
- **Later, an ally Pokémon.** `h.add_ally("pikachu", 16)` adds its bar at the "ally" anchor. `h.make_move_list()` returns a list wired to that bar's preview. On a pick, call `h.on_move(id, foe_screen_pos, "ally")`.
- **Items.** `h.use_item("energy_shard")` (side "foe" or "ally").
- **Dev check.** `dev/energy_fake_battle.gd` is the smallest battle that satisfies all of this. `dev/energy_test` runs the hook against it and against no battle at all.

## Open questions

- **Status effects.** Whether the battle uses Sand-Attack as "accuracy −1 per use" (wild.json) or the moves.json tags. The tags are there to be read.
- **Energy-type folding.** Whether the 18 kinds should fold to the original 7 TCG kinds (plus Darkness, Metal, Dragon) for a "classic" option. The data allows it through `type_energy`.
- **The player's own Pokémon.** The order of play (player first, or speed) and whether the player sees the foe's plan or only its bar. The bar alone already tells a lot: a full Pidgey bar on turn 2 means Gust is coming.
