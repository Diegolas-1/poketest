# Energy: TCG chips, persistent focus

The battle mechanic for every Pokémon. It borrows the energy cards of the Pokémon Trading Card Game and adds persistent focus. Battles should feel like the show: fluid and tactical, with Pokémon using many moves, not four. Ash has no energy: in the prologue his fatigue bar is his health, and the hook only ever gives the wild side a bar.

**Code**
- `native/battle/energy.gd` (`BattleEnergy`): focus, pools, locks, slots, learning, items, between-battle life, the wild planner. Headless.
- `native/battle/pkmn_battle.gd` (`PkmnBattle`): the Pokémon-vs-Pokémon rules engine. Its header documents the hosting calls.
- `native/battle/pkmn_ai.gd` (`PkmnAI`): wild and trainer opponents.
- `native/battle/energy_hook.gd` (`EnergyHook`): the plug into the prologue battle (battle.gd).
- `native/battle/battle_config.gd` (`BattleConfig`): reads the one config file.
- UI: `native/ui/energy_icon.gd`, `energy_bar.gd`, `energy_move_list.gd`, `pkmn_hud.gd`.

**Data**
- `native/life/battle_config.json`: every tunable number.
- `native/life/pokemon.json`: species, type chart.
- `native/life/moves.json`: moves.
- Both data files define their schema in a `_schema` key.

**Dev**
- Tests: `dev/energy_test.tscn` and `dev/pkmn_battle_test.tscn`.
- Playable: `dev/pkmn_battle.tscn` (`--fight=wild|trainer`, `--auto`, `--state=...`, `--safe=L,T,R,B`, `--show-safe`, `--shot=path`).
- Old look: `dev/energy_shot.tscn`.

## The terms (separate fields in `BattleEnergy`)

| Term | Field | What it is |
|---|---|---|
| Focus | `focus` | 0 to 100, persistent per Pokémon. The engine that makes chips. |
| Chips | in `pools` | The spendable units. `chips = min(floor(focus / step), chip_cap)`, so the bar and the count always agree. |
| Pools | `pools` | `{kind: {ready, spent}}`: one per energy type the Pokémon has (Normal folds into Colorless), plus Colorless, the default. At most four. |
| Locked chips | `locks` | Chips set aside by a reaction move until it triggers or expires. They count against the total. |
| Energy slots | `slots`, `equipped` | Level-gated: how many moves can be equipped (usable). Distinct from chips. |

## Focus

- **Gain.** Each undisturbed turn focus rises by the species' gain (default +10). A chip comes at each threshold (default every 20%).
  - Step, cap and gain are per type and per species (`focus.by_type`, `focus.species`). Psychic types gain faster and resist disruption. Snorlax starts at 0, gains +5 and holds 8 chips.
- **Disruption** lowers focus by a step (default 15; per move in `disruption.moves`), never a full reset. The next turn gains nothing.
  - The disruption moves are Leer, Growl, Screech, Hypnosis, Confusion, Roar, Whirlwind and Mean Look. Flinch and confusion also disrupt.
  - A chip over the new threshold is lost. Pending chips go first, then spent ones, then ready Colorless, then ready typed, then locks.
- **Sleep:** no gain while asleep.
- **Locked In** at 100%. `locked_in.mode` picks the buff: `acc_crit` (+10 accuracy, +1 crit stage), `wild_chip` (one extra chip that counts as any type), or `both`. Any disrupting hit removes it.
- **Perks** (`perks`) raise the start, the gain, the cap or the disruption resistance. Examples: Focus Band, Calm Bell, Zen Charm.

## The turn

1. **Start.** Spent chips come back. Focus gains. New chips go to a pool.
   - One typed pool, or only Colorless: the rule decides (fill the typed pool to `typed_pool_cap`, then Colorless). Zero taps.
   - Two or more typed pools (Bulbasaur): the player makes one choice for the turn's new chips by tapping a tray. No choice puts them in the default pool (Colorless).
   - The AI sends each chip to where its moves' typed costs need it.
2. **Queue moves** while the chips last. Paying is TCG matching: typed costs are matched first, and Colorless costs are paid by any chip. Spent chips dim until the next turn. Cheap moves chain, big moves take most of the chips.
3. **Resolve.** Actions interleave by Speed: one action each in turn, the faster side first, the higher priority head first. This is one swappable function, `PkmnBattle.order_fn` (default `speed_interleave`).
4. **End.** Status ticks. Locks past their expiry release.

**No four-move cap.** Moves are learned by level, TM or tutor (`teach`) and never forgotten. Slots limit what is equipped. Known moves outside the slots show locked in the move list ("LOCKED · SLOTS FULL 5/5 · NEXT SLOT LV 18"), sorted to the bottom.

## Move roles and tiers

Every move has a `role` and a `tier`.

**Roles**
- **Offense:** damage now. Big moves pay a little more per chip.
- **Reaction** (Dodge, Detect, Protect, Counter, Mirror Coat): the chip is locked and triggers on the opponent's next move.
  - Dodge evades anything.
  - Detect blocks the next attack. Protect blocks every attack for the turn.
  - Counter returns a physical hit doubled. Mirror Coat returns a special hit doubled. The wrong category wastes the chip.
  - An untriggered lock releases at the end of the following turn (`locks.expiry_turns`).
  - The opponent sees it face down, in a trap tray of its own, with a "TRAP SET" tag. The owner sees "DODGE SET".
- **Two-phase** (Dig, Fly, Bounce, Dive, Solar Beam, Skull Bash): pay on turn one to commit, then strike free on turn two. They give more per chip.
  - Underground, airborne or underwater, the user is untargetable except by the counter table. Solar Beam and Skull Bash only charge, so the user can still be hit.
  - A dodge locked before going under or up is wasted.
- **Disruption** and **Utility** (status, stats, Mind Reader, Foresight...).

**Tiers**
- `opener`: about 1 chip.
- `mid`: 2 to 3 chips, 4 for the heaviest.
- `finisher`: costs every unlocked chip. Its cost is `{"all": true, "min": N, "type": kind | "any"}` and its power is `power + power_per_chip × chips` (`finisher` in the config).
  - Examples: Volt Tackle, Flare Blitz, Frenzy Plant, Hydro Cannon, Brave Bird, Giga Impact, Fissure Slam.
  - In the move list it shows ALL plus its minimum.

## The counter table (`counters.rows`, data, not code)

| Move | Interaction |
|---|---|
| Earthquake, Magnitude | Hit a digger for ×2. |
| Ground Pound | Hits a digger for ×2, with a 30% chance to pull it out (no strike). Ground, physical, 2 chips. |
| Thunder, Sky Uppercut | Hit a flyer. |
| Gust, Twister | Hit a flyer for ×2. |
| Surf, Whirlpool | Hit a diver for ×2. |
| Swift | Reaches every semi-invulnerable state and ignores dodges and evasion. |
| Feint | Breaks Protect and Detect. |
| Roar, Whirlwind | Force the target out of any two-phase move, and disrupt its focus. |
| Mind Reader, Lock-On (1 chip) | Cancel the target's dodge for the user's next attack (`cancel_dodge`). |
| Foresight | Removes evasion boosts and lets Normal and Fighting moves hit Ghosts. |

Adding a row changes the battle with no code. A test checks this.

## Type matchups

The type chart is in `pokemon.json type_chart`. A species whose data names `weakness` and `resistance` (energy kinds, from the Kanto 151 dataset) uses TCG matchups instead (`matchups` in the config):
- weakness ×2
- resistance ×0.6, plus an optional flat `resistance_sub`

The chart's immunities still hold. `mode` is `auto`, `chart` or `tcg`.

## Between battles (game time only)

Focus is saved per Pokémon (`to_dict` / `from_dict`: focus, chips per pool, Locked In, equipped).

- **Decay** follows GameClock minutes, never real time (`elapse(minutes)`):
  - Alert Pokémon keep their focus for 60 minutes, then lose 4 an hour.
  - Relaxed ones lose 12 an hour and, after a rest, start at 10 at most.
  - Locked In fades after 15 minutes.
- **Rests** (`rest(kind)`): rest stop ×0.6, camp night ×0.25, home night ×0.1.
- **Pokémon Center** (`center()`): keeps 40%. Healing costs warmth.
- **Fainting:** zero.
- **Gym warm-up** (`after_battle({kind: "gym_trainer", won})`): it keeps its end focus, plus 10, up to 80, with no decay inside the gym.
  - The leader's Pokémon start at 30.
  - Two or three trainers, which cost HP and items, give about 2 extra chips on the leader's turn 1. A test checks this.
- **Wild ones** start by how they were found (`focus.wild_start`): hidden 20, startled 30, attacking 40, fleeing 10.

## Items (`items`, the energy restore category)

| Item | Effect | Price |
|---|---|---|
| Energy Shard | 1 Colorless chip | ₽1,500 |
| Focus Crystal | 2 chips of its own type | ₽4,000 |
| Focus Tonic | +30 focus | ₽2,500 |
| Full Charge | Straight to 100 | ₽12,000 |

Chip items raise focus to match, so the bar agrees. All the numbers are placeholders.

## AI (`ai` in the config)

- **Wild ones** use the simple planner (`plan_turn` by the species' style: aggressive, strategic or evasive). It searches every ordered set of moves the chips pay for and scores damage, status, variety, the chips left unspent, and so on. It sets a reaction only now and then.
- **Trainers** have personalities: cautious, aggressive, balanced, tricky. Each sets a reaction rate, a counter rate, a two-phase rate and role weights.
  - A foe out of reach gets the moves that reach it (or a reaction for its strike), never a blind attack.
  - A face-down trap gets Swift, Feint or Mind Reader.
  - A known physical strike coming gets Counter.

## The look

- **Symbols (`EnergyIcon`):** flat TCG-style discs with a white glyph, kept as inline SVG strings. They're rasterised with `Image.load_svg_from_string` and cached per kind, variant and size bucket.
  - All 18 kinds, plus `any` (the wild chip) and `hidden` (face down).
  - The variants are disc, flat, glyph and a spent grey.
  - `draw_icon(ci, kind, centre, radius, alpha, opts)` is unchanged.
- **Panel (`EnergyBar`):** a slim FOCUS bar with a tick at each chip threshold and the percentage (gold and pulsing when Locked In). Under it, one tray per pool, its glyph at the head.
  - Ready chips are in full colour. Spent chips are grey and smaller.
  - Own locked chips show dim with a small lock and a purple ring. The opponent's locked chips go face down in a separate trap tray.
  - A two-phase commitment shows as a tag (DIG: UNDERGROUND).
  - During a pool pick the trays pulse with "+" slots under a "NEW CHIP: TAP A POOL" tag.
  - Disruption shakes the bar, flashes the lost part red, and fades the lost chips. Spent chips fly out to the target.
- **HUD (`PkmnHud`, iPhone landscape, inside `UITheme.safe_rect`):**
  - The player's nameplate is bottom left: HP bar and numbers, status, UNDERGROUND and LOCKED IN badges.
  - The opponent's nameplate and panel are top right.
  - The player's panel is bottom right. Above it sits the menu (FIGHT, POKéMON, ITEMS, FLEE) or the move list with its costs and role tags, plus a THIS TURN strip. Moves that can't reach a hidden foe say so in orange; the ones that can say so in green.

## Wiring

**The prologue (BATTLE owns battle.gd).** The API is unchanged:
- `EnergyHook.attach(battle, {species, level, temper})` (optional `state`)
- `wild_pick(state)` returns `[{kind, move, first, cost, name, anim, power, accuracy, effects}]`
- `on_move(move_id, screen_pos[, side])`
- `detach()`
- The battle offers `energy_anchor(side)` and `energy_moves()`.

The wild side runs the new rules. Optional extras: `disrupt(side, amount)` (Ash startles it), `set_asleep`, `end_turn`, `use_item`.

**A Pokémon battle.** See the header of `pkmn_battle.gd`:

```gdscript
var B := PkmnBattle.new({"a": {...}, "b": {...}, "kind": "wild"})
B.start()
B.begin_turn()
# the player's pick, if needed:
B.pick_pool("a", kind)
B.queue("a", id)   # repeat while the chips last
B.ai_queue("b")
B.begin_resolve()
while B.resolving():
	animate(B.step())
# until B.over, then:
B.finish()
```

The engine returns events. The host animates them; the rules never touch the presentation.
