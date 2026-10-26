# Conditions and player mechanics

In the show Ash is forever soaked, singed, zapped, starving, lost, limping, embarrassed or homesick. Those obstacles are what make his journey feel like a journey. This document turns them into **data-driven conditions** that sit alongside the ones another worker is building now (**Wet** and **Stamina/Fatigue**, in `native/conditions.gd` + `native/life/conditions.json`), plus the **player mechanics** that give the conditions something to push against: the backpack, meals, sleep, camping, money, letters and calls, the journal, Pokémon trust, reputation and weather.

- Data: **`conditions.json`** (41 conditions, a proposed schema, and a glossary of triggers, effects and cures).
- Story context: `ash_arc.md` (the growth system, chapters, Delia). Research: `research/indigo_league.md`.

Contents
1. [Design rules](#1-design-rules)
2. [Fitting the existing code](#2-fitting-the-existing-code)
3. [The catalogue](#3-the-catalogue)
4. [How conditions interact](#4-how-conditions-interact)
5. [Player mechanics](#5-player-mechanics)
6. [What to build next, and why](#6-what-to-build-next-and-why)
7. [Open questions](#7-open-questions)

---

## 1. Design rules
1. **Every condition starts a scene.** A condition is an excuse for the world to react: a line, an animation, a helper. Stat changes are kept small (mostly 0.8–1.0) so a condition **colours** play and never blocks it. The one exception is the scripted "can't move" beats (Netted, Stuck, Curled Up), which always have a way out.
2. **Two tones.** Each condition is either *concern* (hurt, sick, lost, sad: adults come to help) or *playful* (mud, soot, zaps, doodles: adults laugh, kindly). The `tone` field drives which pool of lines a person uses.
3. **The cure is the point.** Conditions are cured by **people, food, rest, washing and home**, which are the RPG's warm loops. How a condition is cured feeds the growth system (`ash_arc.md` §3): resting adds Patience, asking for help adds Openness.
4. **Show first.** Every entry cites the episodes it comes from (`show`).
5. **No nagging.** A person remarks on a given condition **once per instance** (and their greet prefix only on first sight), then goes back to normal talk.

---

## 2. Fitting the existing code

### 2.1 What exists
- `native/quests.gd`: ambient talk is a weighted choice of pools: `activity` (3.0), `place` (2.0), `period` (2.0), `ash` (1.6), `town` (1.2), `about` (0.9), `after[flag]` (2.5), and fresh rumours (2.4) or ones already told (0.6). A greeting from `greet[period]` comes first on the first talk of the day. State is saved in `user://quests.save` (`flags`, `items`, `met`, `talks`...).
- `native/main.gd`: the player moves at `T.num("player", "run_speed", 8.5)` / `walk_speed` (4.5), tunables from `native/tunables`.
- `native/life.gd` / `people.json`: activities and places per person by the clock. `companions.json`: Nibbles, Doduo, Mr. Mime (with `mimes` and moods).
- **Being built now:** `native/conditions.gd` + `native/life/conditions.json`: Wet (blocks entering some places; people comment), Stamina/Fatigue, condition badges.

### 2.2 The schema (proposal; see `conditions.json` for every field)
The core keys match what the first worker is building: **id, name, icon, description, strength/stacking, duration, effects (speed and stamina multipliers, blocks entry), dialogue prefix keys, saved state**. On top of those:

| Key | Purpose |
|---|---|
| `names[]` | a name per level ("Peckish / Hungry / Starving"); the badge shows it |
| `kind` | body, mess, mood, load, world or companion (for HUD grouping and for "wash cures all mess") |
| `tone` | concern, playful, proud or gentle: which kind of reaction pool to use |
| `strength` | `{max, start, stack}`, where stack is one of `add`, `max`, `refresh`, `replace`, `none` |
| `duration` | `{decay, minutes_per_level, grow_minutes, linger_minutes}`, where decay is one of `time`, `cure_only`, `rest`, `leave_area`, `while_source` |
| `triggers[]` | data events (`minutes_since_meal`, `in_area`, `hit_by`, `fall`, `event`...) |
| `effects[]` | **one object per level**: `walk`, `run`, `stamina_max`, `stamina_drain`, `stamina_regen`, `throw`, `catch`, `obedience`, `can_run`, `can_jump`, `blocks_entry`, `hud`, `idle`, `control`... |
| `visual` | `anim`, `fx`, `sfx`, `tint` (outfit or decal swaps) |
| `cures[]` | `{by: eat/drink/sleep/rest/wash/change/pokemon_center/person/item/place/time/event/talk, levels, growth}` |
| `interactions` | `worsens`, `eases`, `cancels`, `becomes`, `blocked_by` |
| `dialogue` | `{prefix, weight, react, greet, lines{person: [...], _any: [...]}}` |
| `build` | `{priority 1–5, phase, needs}` |
| `show[]` | anime episodes |

**If the first worker's file differs:** keep their key names and map these onto them (e.g. their `speed_mult` = this file's `walk`/`run`; their `blocks` = `blocks_entry`). Everything else is additive, so unknown keys should be ignored.

### 2.3 Engine contract (what `conditions.gd` needs for this catalogue)
```
add(id, level := -1, source := "")   # apply the stack rule; level -1 = strength.start
remove(id, levels := 99, by := "")   # 'by' = the cure kind -> growth hook
has(id) / level(id) / active() -> Array[{id, level, minutes_left}]
mult(key) -> float                   # product of all active levels' effects[key] (default 1.0)
allows(key) -> bool                  # AND of can_run / can_jump
blocked(place_id, tags) -> {id, line} # first active blocks_entry hit, with the person-at-door line
event(name, data := {})              # triggers by event (fall, hit_by, lost_battle...)
tick(game_minutes)                   # timers, grow_minutes, condition_for / condition_with checks
```
- **Aggregation:** multipliers **multiply** across conditions, with clamps (walk ≥ 0.35 and run ≥ 0.4 unless an effect sets exactly 0.0, which is a scripted freeze). Booleans are AND. `blocks_entry` is a union. `obedience` and `pikachu_mood` add up.
- **The player hookup** in `main.gd`: `want = (run_speed * C.mult("run") if run and C.allows("can_run") else walk_speed * C.mult("walk"))`.
- **Stamina** (the first worker's system): multiply max, drain and regen by `C.mult("stamina_max" / "stamina_drain" / "stamina_regen")`.

### 2.4 Dialogue integration (`quests.gd`)
Add a **condition pool** to `_ambient()`:
1. **Greet prefix:** if a condition with `dialogue.greet = true` is active and this person hasn't remarked on this instance yet, put their `cond[prefix]` line **before** the normal greet. Example: *"Stop! Right there! Not one muddy foot on my clean floor."* then *"Good morning, sleepyhead!..."*
2. **Pool:** otherwise add `[dialogue.weight, P.cond[prefix] or fallback.cond[prefix], "cond"]` for the **single most important** active condition (highest weight). Concern conditions beat playful ones.
3. **Where the lines live:** the samples are in `conditions.json` → `dialogue.lines`, for the designers. In the game they belong in `native/life/dialogue.json` as `people[id].cond[prefix]` and `fallback.cond[prefix]`, next to the other pools, so one file holds each person's voice.
4. **One remark per instance:** store `st.cond_told[person] = "<id>:<instance_no>"`.
5. **Care styles** (`glossary.care_styles`): `fusser` (Delia, Ada, Nurse Joy), `gruff` (Marina, Ben, Officer Jenny), `wise` (Mae, Tom, Rose), `comic` (Bram, Kai, Timmy), `quiet` (Gus, Mr. Mime), `peer` (Lily, and later Misty, Brock and Gary). When a person has no line for a condition, borrow from someone with the same style, then `_any`.
6. **Mr. Mime** answers in mimes (`companions.json` `mimes`). Condition mimes live in `mrmime` lines in parentheses.
7. **People not in Pallet yet** (`joy`, `jenny`, `brock`, `misty`, `oak`, `gary`, `flint`) appear in `lines` so the voice is written down early. Code should ignore ids it doesn't know.

### 2.5 Saved state
`conditions.gd` saves `{id: {level, minutes_left, instance, src}}` for conditions with `save: true`, plus the meal and sleep clocks (`last_meal_min`, `last_sleep_min`) and `days_away`. Short gags (Dazed, Spicy, Tingly, Zapped) aren't saved. Reloading a game in which Ash is still Muddy should mean he's still muddy.

### 2.6 HUD badges
One row of round badges (the first worker's badges). Level shown as 1–3 pips, plus the level name and the `description` (Ash's own words) on tap. **Doodled** shows "???" until Ash sees his reflection. Mood conditions take the **left** end; body and mess conditions the right.

---

## 3. The catalogue

The full data is in `conditions.json`. This section is the readable version. **Reacts** = how people respond; **Cure**; **Dur** = how long it lasts.

### 3.1 Body
| Condition | Trigger | Looks like | Effect | Reacts | Cure | Dur | Show |
|---|---|---|---|---|---|---|---|
| **Hungry** (Peckish / Hungry / Starving) | 5 / 9 / 15 game hours since a meal | a hand on his tummy, growl lines, a stomach-growl sfx | stamina regen 0.9 → 0.5, max down at 2+, slower run at 3, Pokémon a little less obedient | concern; Delia, Bram, Ada, Kai and Brock **give food** | any food lowers it by 1; a **meal** clears it | until he eats | EP014, EP016, EP041 |
| **Thirsty** | 1.5h in midday sun, or after Fatigue | wiping his brow | stamina regen down | concern (*"Have you had any water today?"* is already Delia's line) | taps, fountains, the canteen, juicy berries | until he drinks | EP041 |
| **Sleepy** (Yawny / Sleepy / Dead on His Feet) | 16 / 20 / 24 game hours awake; after 23:30 | yawns, a zzz bubble, nodding off | throw and run down; at 3, **falls asleep where he sits** (a time skip, people tease him, Jigglypuff doodles) | playful; the town's oversleeping jokes come back | sleep 6h (bed) or 2h (a nap: level 1) | until he sleeps | EP001, EP045 |
| **Chilly** (Chilly / Shivering) | Wet at night, Wet for 90 min, a cave, or giving his jacket away | hugging himself, breath puffs, teeth chattering | stamina regen down, slower at 2 | concern; Mae: *"Where's the scarf I knitted you?"* | a warm place, a campfire, soup, **Mae's scarf** | 60 min/level; becomes Sniffles | EP001, EP011 |
| **Sniffles** (Sniffles / Head Cold / Feverish) | Chilly for 2h, or Wet + Fatigue | sneezes (sneeze fx, red nose); blurred at 3 | stamina max down to 0.6; sneezes scare wild Pokémon off | concern, at full strength: Delia's bed rest, Nurse Joy keeps him overnight | **rest/sleep only**; soup, Mom's package, a Center, the **Cinnabar springs** | 6h of rest per level | EP011, EP044 |
| **Sunburned** (Pink / Sunburned) | 2.5h of midday sun (twice as fast without his cap) | pink skin, "ow" at the shoulders | a small stamina cost with a pack on | playful; Rose's aloe | aloe, time | 8h/level | EP018 |
| **Scraped Knee** (Scraped / Bandaged) | tripping while running on rough ground, a 1.2m fall, a Spearow chase | rubbing his knee, a plaster | slight run penalty until treated | gentle; Delia: *"more plasters than birthdays"* | the first-aid kit or any caring adult → Bandaged (cosmetic); a Center | 12h | EP001, EP010, EP039 |
| **Sore Ankle** (Twinge / Sore / Twisted) | falls of 2.5m+ / 4m+ | a limp | no jumping; at 3 **no running**, walk 0.75 | concern; Ben: *"Lean on the gate. Doduo'll wait."* | rest, sleep, a Center, the springs; a walking stick helps | rest only | EP010, EP022 |
| **Dazed** (Seeing Pidgey) | bonks: trees, **Mr. Mime's invisible wall**, Team Rocket pits | Pidgey orbiting his head | wobbly controls, bad throws | playful | 8 min | short | EP039, EP064 |
| **Stung** (Stung / Poisoned) | Weedle or Beedrill Poison Sting | purple bubbles, a swollen hand | throw accuracy down, stamina regen down | concern; Lily defends Weedle | an antidote, a **Pecha berry**, Rose or Mae's poultice, a Center | 3h; level 2 needs a cure | EP004, EP081 |
| **Tingly** | Stun Spore, Stun Stem, Lick | stiff walk, yellow sparkles | slow; at 2 no run or jump | playful | time, Paralyze Heal, Cheri | 20 min | EP007, EP068 |
| **Drowsy** | Sleep Powder, Hypnosis, Sing | nodding off | no run, bad throws; asleep if also Sleepy 2 | playful | time, Awakening, Chesto, **Pikachu's wake-up zap** | 15 min | EP010, EP027, EP045 |
| **Stuffed** | two meals within an hour; an all-you-can-eat buffet | patting his belly | slower run; afternoon food coma (Sleepy +1) | playful; Bram is delighted | time | 90 min | EP041, EP076 |
| **Spicy Mouth** | Team Rocket's hot-sauce stall | steam out of his ears | runs about frantically (run 1.15, drain 1.3) | playful; Bram: *"MILK, lad!"* | a drink, milk, a Water Gun (→ Wet) | 6 min | EP081 |
| **Seasick** (Queasy / Seasick) | rough boat rides (Kai's boat, ferries) | green cheeks | drifting controls | playful; Tom: *"Eyes on the horizon, lad!"* | land; Tom or Kai's advice halves it | while aboard | EP015–016 |

### 3.2 Mess (washes off, often keeps him out of places)
| Condition | Trigger | Looks like | Effect | Reacts | Cure | Show |
|---|---|---|---|---|---|---|
| **Muddy** (Splattered / Muddy / Mud Monster) | mud areas (the pond edge, Ben's yard, puddles after rain), falls, a Doduo splash | mud decals, brown drips, squelchy steps | **2+: blocks clean places and food places** (Delia's floor, Bram's bakery); 3: shops too, and Grimer and Diglett take an interest | playful; Delia: *"Not one muddy foot on my clean floor."* | wash; the **pond or sea → Wet**; Squirtle's Water Gun → Wet | EP012, EP017 |
| **Dusty** | Team Rocket pit traps, caves | grey dust, puffs on each step | blocks clean places | playful; **Mr. Mime beats it off with his broom** | wash, change, time | EP005, EP073 |
| **Sooty** (Singed / Sooty / Crispy) | his **own** Charmander's Ember or Charizard's Flamethrower, campfire flare-ups, rescues from fires | a soot face, smoke wisping from his cap, coughing | blocks clean places (and food at 3); **cancels Wet and Chilly** | playful; Bram: *"You look like my oven door!"* | wash (→ Wet) | EP044, EP064, EP081 |
| **Zapped** (Staticky / Zapped / Fried) | Pikachu's Thunder Shock: hugging a grumpy Pikachu, low trust, or **asking for it** ("shock me so I can think!") | the skeleton flash, frizzy hair, twitching | a short freeze then a stagger; **Wet doubles it**; cures Drowsy | playful; Timmy: *"I SAW YOUR BONES!"* | time | EP001, EP016 |
| **Sticky** (Sticky / Stuck) | String Shot (**Nibbles**!), Team Rocket's glue, honey | strands of web | slow; at 2, stuck until he struggles free; **honey brings wild Pokémon to lick him** | playful; Lily: *"NIBBLES! We do NOT String Shot our friends!"* | wash, time, Rose's scissors, Ember (→ Sooty) | EP003 |
| **Smelly** (Whiffy / Smelly / Stink Cloud) | Smog, a Muk hug, Gloom, an hour at the fish stall | green stink lines, a buzzing fly | blocks food places; **wild Pokémon flee**, worse catch rate | playful; Marina: *"Downwind, lad."* | wash, Rose's soap, a change of clothes | EP026, EP030 |
| **Doodled** | **falling asleep near Jigglypuff**; in Pallet, Timmy's prank on a nap under the pond tree | random marker doodles on his face | none, except that **Ash doesn't know**: the badge says "???" until a mirror or puddle reflection | playful; everyone tries not to laugh | wash | EP045+ (a running gag) |
| **In Pajamas** | leaving home before changing (forced on the departure morning) | pajamas, bedhead | blocks formal places (the lab's study, Gym lobbies) | playful; **everyone** comments | change clothes | EP001 |

### 3.3 Mood (dialogue first, numbers second; feeds growth)
| Condition | Trigger | Effect | Cure (and growth) | Show |
|---|---|---|---|---|
| **Flustered** (Red-Faced / Flustered / Mortified) | a slip in front of 2+ people, Gary's taunts, a low exam score, being kicked out | a cap-pull animation, an "act cool" talk option, small throw penalty; at 3 he avoids crowds | time; Mae, Rose, Delia or Brock; **laugh it off** (+Courage) or **own it** (+Humility) | EP018, EP026, EP056 |
| **Downcast** (Gloomy / Downcast / Curled Up) | a lost battle (1), a lost Gym (2), Gary ahead (2), the League loss (3) | a slumped walk, Pikachu's mood drops; **3 = the bed scene** (`ash_arc.md` §5.5) | **a person** (+Openness), a call home, a meal, a win; the Ritchie talk → Fired Up | EP005, EP025, EP063, EP080 |
| **Fuming** (Grumpy / Fuming) | Gary, insults, Team Rocket getting away | runs faster but drains more, rash, Primeape copies him | rest, Ben's "count the fence posts", **count to ten** (+Patience) | EP018, EP025, EP029 |
| **Jitters** | before a Gym; "all of Pallet is watching" | throw down, can't fall asleep easily | a call home, Delia, Brock, a pep talk with Pikachu | EP077 |
| **Spooked** (Uneasy / Spooked) | dark at night, fog, ghosts, the Cinnabar mansion | jumpy; **Pikachu clings to his cap** (bonding); runs faster | light, company, a lantern, whistling; **Gus's beam** | EP020–023 |
| **Homesick** | 4+ days away in the evenings, smelling stew, being ill away from home, seeing another kid with their mom | looks at the sky; the journal prompt; the videophone pulses | **call home** (+Openness, then Fired Up), Mom's package, a letter, Brock's cooking | EP002, EP027 |
| **Fired Up** (Pumped / Fired Up / Unstoppable) | encouragement (the townspeople's existing `ash` lines), badges, Mom's letters, breakfast at home, the fan club card | stamina regen up to 1.3, run and throw up, obedience up | time | EP001, EP014 |
| **Proud of Himself** | helping quests, kept promises | a bouncy walk, people notice | time | EP036, EP073 |
| **Feeling Bad** | his choice hurt a Pokémon, he broke something, broke a promise, or took something without asking (Kai's rod) | an "apologise" option and a "Make it right" log entry | apologise (+Humility, +Responsibility); make amends | EP015, EP081 |
| **Doubting** | badges given rather than won | that badge looks dimmed | a talk, a rematch, helping the Gym | EP005, EP007, EP024 |

### 3.4 Load, world and companion
| Condition | Trigger | Effect | Cure | Show |
|---|---|---|---|---|
| **Heavy Pack** (Heavy / Overloaded / Can Barely Move) | backpack weight ≥ 80% / 100% / 130% of capacity | run 0.92 → 0.6, stamina drain 1.15 → 1.7, no jumping at 2+ | drop items, **mail them home to Mom**, PC storage, eat food | EP001, EP052, EP068 |
| **Carrying Pikachu** | Pikachu hurt, or picking him up | can't throw or use items; the route is marked to help | set him down; a Center; the lab | EP001–002, EP012 |
| **Lost** (Turned Around / Lost) | off-route at night, fog, deep forest | compass hidden, then the map hidden | **find a landmark (Gus's lighthouse beam, the river, Oak's roof)**, ask someone (+Openness), Pidgeotto scouts, a compass, dawn | EP010, EP011, EP022 |
| **Capless** | Mankey steals his cap, a gust on the pier, a fall | sunburn twice as fast; everyone notices | get it back; **Delia's spare in the front pocket** | EP025 |
| **In Disguise** | the "Ashley" outfit, the Mr. Mime suit | people use their "stranger" lines; lifts bans; Pikachu always knows him | change; unmasked → Flustered | EP026, EP064 |
| **Netted** | a Team Rocket net; Marina's drying nets on the pier | frozen, a struggle prompt | struggle free, **Pikachu chews through**, Marina | EP021, EP039 |
| **Pikachu Hurt** (companion) | the Spearow chase, a bad loss, swallowing something | starts Carrying Pikachu; all talk turns to concern | a Center, the lab, a Super Potion; carrying him the whole way earns trust +1 | EP001, EP002, EP047 |
| **Pikachu Sulking** (companion) | forcing him into the ball, ignoring his hunger, battling him tired, hugging too hard | walks behind, refuses commands 50%, a hug gets you Zapped | **ketchup**, an apple, time, an apology (+Heart) | EP001, EP014, EP042 |

### 3.5 Conditions on townspeople (cosmetic)
The same badges on NPCs, with no stats, for Delia's chapter and small slices of life: Delia **Wet** after her dawn swim, then **Fired Up** after reaching the buoy; Bram **Sooty** after a burnt tray; Gus with **Sniffles** after a storm night; Tom **Sleepy** on his porch. See `npc_conditions` in the JSON.

---

## 4. How conditions interact

```
            wet ──(night / 90 min)──► chilly ──(2 h)──► sniffles ──► (rest only)
             ▲                         ▲                    │
  wash (pond/sea)                   gave jacket             └─ cancels fired_up
             │
 muddy / dusty / sooty / smelly / sticky ──► [wash] ──► wet
 sooty ──cancels──► wet, chilly          zapped × wet = level 3
 hungry + fatigue: drains 20% faster     encumbered + sore_ankle: drain ×1.2
 sleepy 3 + sitting ──► nap (time skip) ──► (near Jigglypuff / Timmy) doodled
 drowsy + sleepy 2 ──► asleep where he stands
 lost + spooked (+1 at night)            capless ──► sunburned ×2
 lost battle ──► downcast ──(friend / call / meal)──► normal
                    └─(encouragement / Ritchie)──► fired_up
 jitters ──(win)──► fired_up   ──(loss)──► downcast
 homesick ──(call home)──► fired_up 1
 fuming ──(win)──► fired_up
 guilty ──(apologise / make it right)──► proud
```
The classic show combination is **Wet + Lost + night + Carrying Pikachu**: EP001 and EP011 as one scene template. If all four happen together the music changes, the nearest Center's light is shown on the HUD, and a caring adult shows up (Officer Jenny's motorbike).

---

## 5. Player mechanics

### 5.1 Backpack and weight
- **Capacity** 10 kg (it grows with the bag: Mom's starter pack, then the bigger Trainer's pack bought in Viridian). Each item gets a `weight` field in `quests.json` items (proposal): Poké Ball 0.1, Potion 0.2, berry 0.05, a loaf of bread 0.5, the sleeping bag 1.5, the pan 1.2, Mom's "just in case" sweater 0.8 (×4).
- **The departure tutorial:** Delia's packing list (EP001) **overloads** the pack (Heavy Pack 2). The player unpacks at home and each item left behind gets a Delia line: *"Leave the iron, sweetie. Keep the socks."* The iron is a joke: it weighs 3 kg.
- **Mail it home:** Pokémon Centers can mail items to Pallet. Ada's round brings them to the red house, and they turn up in Ash's room when he comes home (with notes from Delia: *"Four rocks? You sent me four rocks? They're on the windowsill. They look lovely."*).
- Story beats: Misty's shopping (EP052), the 300–400 lb of fertiliser (EP068) as a scripted Heavy Pack 3 haul, Pikachu riding on top.

### 5.2 Food, meals and cooking
- **Meals** clear Hungry and give small buffs ("Well Fed": the Fired Up 1 regen). Sources: **Pallet House** (Delia serves; the menu changes by day: seafood stew, Pecha tart, Friday fish), Bram's bread, Ada's honey rolls, Center canteens, and **camp cooking with Brock**.
- **Camp cooking** (after Pewter): a simple pick-two-ingredients minigame at a campfire. Brock has `recipes` (`rice_balls`, `stew`, `berry_pancakes`). Each recipe gives buffs and a Pokémon reaction (Pikachu: **ketchup** on everything).
- **Food items** have `food: true`, `fills` (1–3 Hungry levels), `weight`, and optional `tags` (`juicy`, `warm`, `very_spicy`).
- **Pokémon get hungry too:** party Pokémon have a simple "fed today" flag. Feeding them at camp raises trust (5.8) and stops Pikachu Sulking.

### 5.3 Sleep
- **Where:** Ash's bed at the red house; **Pallet House's upstairs rooms** (already in the lore: "rooms upstairs") for a night as a "guest", where Delia charges him one hug; Pokémon Centers (free, Nurse Joy); inns; **camping** in a sleeping bag; naps on benches, rocking chairs and boats.
- **How:** sleeping skips the clock (it already has `skip(hours)`), resets `minutes_awake`, and heals Sleepy and part of Sniffles. **Oversleeping:** with no alarm clock (Ash broke it, as in EP001), sleeping after midnight wakes him at 10:00 or later, and the town comments. Buying a new alarm clock is a small Responsibility beat.
- **Sleep quality:** a bed is 1.0, a Center 1.0, a sleeping bag 0.8 (×0.6 if Wet), a nap 0.3. Jitters halves it.

### 5.4 Camping
- From Route 2 onward. Pick a flat spot and set up camp (tent, fire). Then **cook**, **sit with your Pokémon** (all party Pokémon out around the fire: the trust tick), **write the journal**, **look at the stars** (an optional talk with whoever's travelling with him). Ritchie's camp scene (EP078) is the model.
- Risks: rain puts the fire out (Wet, Chilly), and wild Pokémon steal food (Mankey, Rattata: the Pokédex line about Rattata stealing food from travellers, EP001).

### 5.5 Money, allowance and debts
- **Allowance:** Delia sends a little money with each package. Ash earns **prize money** from Trainer battles, and odd jobs (Moe's restaurant, EP018).
- **Debts (IOUs):** a visible list. **Misty's bike** (EP001–EP002; she follows him until he pays: a joke that runs through the whole game, settled at the League). **Kai's fishing rod** (Pallet, from day one: "I'm not angry. Just... next time, ask"). **Moe's boat**. Paying one off is a Make It Right (+Responsibility).
- **Sending money home:** Delia's existing joke (*"Some trainers send a little prize money home to their mothers, I hear. Ha! I'm joking. Mostly."*) becomes an option. Sending some sets a flag. She saves it in a jar labelled **"ASH'S"** and gives it back to him after the League. (It isn't about the money.)

### 5.6 Letters, calls and packages
- **Videophone** at every Pokémon Center: call Mom, Oak or (later) friends. Mom's calls follow the Delia stages (`ash_arc.md` §5.2). Missing calls for 3+ days is fine: she never guilt-trips, but her next letter says *"Mr. Mime keeps miming a telephone at me. I think he misses you. I think it's him."*
- **Letters:** delivered at Center counters (Nurse Joy hands them over, as in EP050). Ash can **write back** to anyone in Pallet. Writing to townspeople unlocks their `after[letter_from_ash]` lines.
- **Mom's care packages:** they arrive every few badges or after a hard chapter (Delia "just knows": she watches the regional news). Contents rotate: food (stew in a jar, cookies), **clean socks**, a remedy (honey-lemon), a little money, and something personal (a pressed rose from Grandma's garden; later a test recipe from her cookbook). Opening one cures Homesick 2 and gives Fired Up 1.
- **Ada's Telephone:** what Ash reports becomes town gossip, slightly garbled (`ash_arc.md` §6.1).

### 5.7 The journal
Ash's own notebook. Entries are written automatically after major beats and at night; reflections end with open questions that later entries answer. The voice changes with growth. Full spec and samples in `ash_arc.md` §8. The journal also lists **active debts**, **promises** and **"Make it right"** items, so it doubles as a soft quest log.

### 5.8 Pokémon trust bonds (disobedience until earned)
- Each Pokémon has **trust** (0–100) and a **temperament** (`proud`, `shy`, `wild`, `loyal`, `lazy`), plus a **mood** that changes through the day (happy, hungry, sleepy, grumpy).
- **Trust grows from care, not from battling:** feeding it at camp (+2), resting it when tired (+2), carrying it when hurt (+5), sitting with it at the fire (+1 per night), protecting it (+10: the EP001 shield moment), **listening** (letting it decide: the Thunder Stone, +10), apologising after a mistake (+3). It **drops from neglect:** battling it tired (−3), forcing it into the ball (Pikachu −5), ignoring hunger (−2), long stays in the PC box (slow drift).
- **Obedience** = trust minus a temperament threshold minus the badge-level gap. Below it, the Pokémon **disobeys in character**: Pikachu won't go into the ball and turns his back, Charmeleon or Charizard naps, blasts Ash (Sooty) or picks its own target, Primeape fights wildly, Bulbasaur refuses to return (EP051). Fired Up adds a little obedience; Fuming and Downcast take some away.
- **Pikachu specifically:** starts at trust 10 (EP001: he won't go in the ball), walks on his own, a leash and rubber gloves at first. Thresholds: **25** (rides on Ash's shoulder), **50** (sleeps next to Ash), **75** (hugs without a zap), **100** (the EP039 "Pikachu chooses you" scene). The **Zapped** and **Pikachu Sulking** conditions are the visible moments.
- **Charizard:** a proud temperament with a **story gate**: its trust can't pass 60 before Cinnabar, and obedience needs Heart 3 + Patience 2 (`ash_arc.md` §3.4). The show's EP079 loss is the default.

### 5.9 Reputation and kindness ("Word around town")
- **Per town, not a single number:** each place keeps a small `rep` (0–5) built from **kind acts** (quests, returned items, helping a Pokémon) and lowered by **careless ones** (trampled flowerbeds, unpaid debts, entering clean places while Muddy and being thrown out twice).
- High rep means people greet him by name, shopkeepers slip him a free snack (cures Hungry 1), Nurse Joy remembers him ("Ash! Back again?"), and, in Pallet, adults offer help unprompted.
- Pallet starts at 4: the town already loves him (`dialogue.json`). Pallet rep rises mostly through **letters and calls** while he's away (Ada's Telephone).

### 5.10 Weather
- Kinds: **clear, hot, rain, storm, fog, wind**, chosen per day by `clock.gd` and announced in town (Ben's bad knee: *"Rain by noon. Knee says."*; Kai's weather radio; Gus's log). A rumour-style "forecast" line goes into the morning greet pools.
- **Effects:** rain gives Wet (built), puddles give Muddy, fog gives Lost and Spooked, a hot midday gives Thirsty and Sunburned, wind takes his cap (Capless), a storm cancels boats and adds Seasick.
- **Show beats as weather:** the EP001 storm on Route 1 (the Spearow chase), the EP011 Charmander rain, the M01 storm, the M02 weather chaos.

### 5.11 The Pokémon Center loop
- Nurse Joy heals the party **and checks Ash**: Scraped → Bandaged, Stung cured, Sniffles 3 → "you're staying the night". She also hands over **letters and packages**, and the **videophone** is beside the counter. In Pallet, **Oak's lab** stands in for a Center (heals Pokémon, and Oak tells it straight).

### 5.12 "Ask for help"
- When a concern condition is active and Ash talks to a caring adult, an **"Ask"** option appears: *"Can you help me?"* Their style decides the help: Delia fixes it, Ben gives one word of advice, Mae tells a parable plus a remedy, Kai offers a gadget, Gus points at the beam. Asking cures one level (or gives the item), and **+Openness**. It's the mechanic that makes "independence → asking for help" something the player does.

---

## 6. What to build next, and why

The order is chosen to **reuse the Wet/Stamina plumbing**, to fit **Pallet and Route 1 as they are now**, and to pay off **lines the townspeople already say**.

| # | Build | Why now | Touches |
|---|---|---|---|
| **1** | **Muddy** | It's the same system as Wet: blocks entry, people comment, washes off. The pond edge, Ben's farmyard and the puddles after rain are already in the world, and the first worker named it ("muddy, blocks entry like wet"). The cheapest new condition. | `conditions.json` (+1 entry), area tags in `places.json`, `dialogue.json` `cond.muddy` |
| **2** | **Hungry + meals** | Stamina already exists. Delia's lines already ask *"Have you eaten today?"*; **Pallet House is a restaurant**; Bram and Ada sell bread and rolls (`fresh_bread` and `honey_roll` are already items). This turns the town's food into gameplay. | `conditions.gd` clock, `quests.json` items get `food`/`fills`, a "Buy/Eat" talk option on Delia `serve`, Bram `work:bakery`, Ada `work:stall` |
| **3** | **Sleepy + beds and oversleeping** | `clock.gd` has `skip(hours)`. **Five townspeople already joke about Ash oversleeping** (Kai, Ada, Tom, Timmy, Lily), and Mae's rocking chair and Kai's boat are canon nap spots. It sets up the departure morning (EP001). | `conditions.gd`, a bed interactable at the red house, nap spots |
| **4** | **Chilly → Sniffles** | It gives Wet consequences beyond the doorway, and **Mae's scarf** (*"be sure to thank her for the scarf"*) becomes an item. It's the first "care at home" loop: Delia's bed rest and honey-lemon. | `conditions.json`, a `mae_scarf` item, Delia `cond.sniffles` |
| **5** | **Scraped Knee + Sore Ankle** | Route 1 has ledges and the new bridges (a recent commit). Falls are a classic Ash obstacle, the limp is a strong animation, and the first-aid kit begins the backpack. | the character controller (fall height), a limp blend, a `first_aid_kit` item |
| **6** | **Flustered + Fired Up + the `cond` dialogue pool** | Mostly writing, plus one `quests.gd` change. The town's existing **encouragement lines** (the "spark" ones) become Fired Up triggers. It starts the growth system cheaply. | `quests.gd` `_ambient` (§2.4), `growth.json` stub |
| **7** | **Sticky (via Nibbles)** | It brings the existing **Caterpie companion** into play (String Shot) and works as a Pallet gag with Lily's *Butterfree Question*. | `companions.json` act, Lily's lines |
| **8** | **In Pajamas + the departure morning** | The EP001 gag, and the most "show" moment available in Pallet. Needs an outfit swap. | `cloth.gd` / the player model |
| **9** | **Pikachu: trust, Zapped, Sulking, Carrying, Hurt** | The heart of the show. It needs the Pikachu companion (`companions.gd` already handles followers like Nibbles and Doduo), so it belongs with the departure. | `companions.gd`, a new `pikachu.json` |
| **10** | **Heavy Pack + weights** | The overloaded pack from Delia is the departure tutorial. Needs item weights and the backpack UI. | `quests.json` items, UI |
| later | Lost, Spooked, Weather; Stung (Weedle on Route 2); Sooty (Charmander); camping and cooking; the videophone and letters; the journal; reputation | Each one arrives with its chapter (Viridian Forest, Route 2, Pewter...). | |

**The first ticket for the condition-system worker** (once Wet and Fatigue land): add `muddy` and `hungry` to `native/life/conditions.json` using the schema here; add the `cond` pool to `quests.gd`; add `cond.muddy` and `cond.hungry` to `dialogue.json` for all 12 townspeople (the lines are in `conditions.json`).

---

## 7. Open questions
- **The first worker's exact keys** (`conditions.json`): map them onto this schema (§2.2) when they land.
- **Battles:** Downcast, Jitters and Doubting, and the trust and obedience numbers, assume Pokémon battles exist. Until then, failed catches and chases stand in.
- **Time scale:** the durations assume game minutes. If the clock runs fast (1 game day = a short real session), halve the hunger and sleep thresholds.
- **People who don't exist yet** (Joy, Jenny, Brock, Misty, Oak, Gary, Flint) appear in `lines` so their voices are on record. Ignore them until they're added.
- **Pikachu at home:** does Ash get Pikachu on the departure morning (as in the show), or is there a Pallet-era Pikachu? Every Pikachu condition assumes the show's timing.
