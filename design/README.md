# Design: Ash's journey (conditions, character arc, research)

The design proposals for turning Pallet Town and Route 1 into the start of a journey where **Ash raises his Pokémon and raises himself**, loosely following the original anime (EP001–EP081 and the first-gen films). Nothing here changes game code. These are specs for the people building `native/`.

| File | What it is |
|---|---|
| [`research/indigo_league.md`](research/indigo_league.md) | The show, arc by arc: what happens, Pokémon gained and lost, rivals, caring adults, Ash's struggles and what they teach him. The films (M01, M02 and shorts), a scope ruling on what counts as "first gen", the Togepi beats marked **[SECRET]**, and sources. |
| [`ash_arc.md`](ash_arc.md) | The character arc: tone rules, Ash at the start, the **growth system** (six threads that grow from how he handles setbacks), 20 chapters from Pallet to the Pallet Party, **Delia's chapter** (stages, quests, the climax scene), how Pallet sees him, caring adults versus antagonists, the journal, flags. |
| [`conditions_and_mechanics.md`](conditions_and_mechanics.md) | How conditions fit the existing code (`quests.gd` pools, `main.gd` speeds, the Wet/Stamina system being built), the readable catalogue, the interaction map, player mechanics (backpack, food, sleep, camping, money and IOUs, letters, calls and packages, journal, trust, reputation, weather, the Center loop, Ask for help), and **what to build next**. |
| [`conditions.json`](conditions.json) | 41 conditions in a proposed data schema (glossary included), with sample lines in each townsperson's voice. |

## Top recommendations
1. **Build Muddy next.** It's the same plumbing as Wet (blocks entry, washes off), the world already has mud (the pond, Ben's farmyard, puddles after rain), and it's the cheapest win.
2. **Then Hungry + meals and Sleepy + beds.** Pallet House is a restaurant, Bram and Ada already sell food, Delia already asks *"Have you eaten today?"*, and five townspeople already joke that Ash oversleeps. These give the townspeople's lines something to do in play.
3. **Add a `cond` dialogue pool to `quests.gd`** (one greet prefix per condition instance, then a weighted pool). After that, every condition is mostly writing.
4. **Make cures warm loops:** people, food, rest, washing and home. How a condition ends feeds the **growth system**, so "asking for help" and "resting" become things the player does, not just themes.
5. **Write Delia's first quest, *Mom's Garden*** (the disabled `q_delia` hook), then *The Handbook in the Drawer*. Canon support from Takeshi Shudō's novel: Delia is 29, inherited Pallet House, and put aside dreams of being a model and a Trainer when Ash was born. Her chapter after he leaves (learning to swim, the supper club, the Seafoam trip from EP066, crossing to the Cinnabar springs) shows through calls, letters, townspeople's gossip and visible changes at home.
6. **Plant the Spearow on Route 1 now.** Throwing the rock (EP001) sets a flag that pays off at the end of the Kanto arc, when that Spearow is a Fearow (EP081). The game's first lesson that actions come back.
7. **Pikachu trust is the companion system to build after conditions.** Care builds trust, not battles. Zapped, Sulking, Carrying and Hurt are the visible moments.

## Ground rules
- **Togepi stays secret.** It's hinted at by Oak's desk letter (*"Dear Professor Elm, about the egg..."*). The show's Egg and Togepi beats are marked [SECRET] in the research and kept out of the arc.
- **Delia is never resented and never resents.** Her chapter is her own: no guilt, lots of humour.
- **Mr. Mime has been family since Ash was a baby** (the game's choice, which differs from EP064). The design keeps that.
