# Ash's arc: raising Pokémon, raising himself

> *"Not only is Ash raising Pokémon, he's also raising himself through his experiences on the road."* (the user's vision)

This document sets out the story spine for the RPG: who Ash is when he leaves Pallet Town, how each chapter of the road changes him, who helps him and who pushes against him, and the **Delia subplot**: a warm, young single mother whose own chapter starts the day her son walks up Route 1.

Companion docs: research in `research/indigo_league.md`; conditions and systems in `conditions_and_mechanics.md` and `conditions.json`.

Contents
1. [Tone rules](#1-tone-rules)
2. [Ash at the start](#2-ash-at-the-start)
3. [The growth system ("Ash's Heart")](#3-the-growth-system-ashs-heart)
4. [Chapters: Pallet to the Indigo Plateau](#4-chapters)
5. [Delia's chapter](#5-delias-chapter)
6. [How Pallet Town sees Ash](#6-how-pallet-town-sees-ash)
7. [Caring adults and antagonists](#7-caring-adults-and-antagonists)
8. [The journal](#8-the-journal)
9. [The Togepi secret](#9-the-togepi-secret)
10. [Flags and data for implementers](#10-flags-and-data-for-implementers)

---

## 1. Tone rules

1. **Setbacks are chapters, not punishments.** Ash gets hurt, lost, soaked, embarrassed and beaten, and every one of those starts a scene. Nothing in the arc is a "game over". The game remembers **how he handled it**, not that it happened.
2. **Funny sits next to hurt.** The show cuts from Pikachu in a hospital to Team Rocket's balloon popping. Soot, zaps and marker doodles are the comic relief that make the earnest scenes land.
3. **Adults who care show it in different ways:** Delia frets, Mae tells a parable, Ben says "Mm", Nurse Joy scolds, Oak tells it straight. None of them takes the problem away from him; they help him carry it.
4. **Antagonists sting, but they don't crush.** Gary mocks, Surge bullies, Damian abandons, Team Rocket prank. Real cruelty (Damian, Giovanni) is aimed at Pokémon and is clearly marked as wrong.
5. **Delia is never resented, and never resents.** Her deferred dreams are an undertone, never a guilt trip. Every hint is warm, and at least half of them are funny. When Ash leaves, it frees her. It isn't a loss for her.
6. **Ash is ten.** His journal spells some things wrong, he sulks and he brags. His growth shows in small changes: he says "thanks" to Nurse Joy without being prompted, he checks on Pikachu first, he calls home without being reminded.

---

## 2. Ash at the start

The game's townspeople have already written his childhood (`native/life/dialogue.json`). Read together, their lines show a **boy raised by a village**:

| Person | What they remember | What it shows |
|---|---|---|
| Delia | throwing practice with her tomatoes; chasing Rattata until dark; talking to the Pidgey | his heart and energy; worry for her |
| Granny Mae | his first blanket; asleep in her rocking chair "snoring like a Snorlax" | a grandmother he chose |
| Marina | lost at the beach at six, asleep under a boat hugging three Krabby | the town looked for him together |
| Gus | logged him drifting in Kai's boat; waved the lantern for an hour | quietly watched over |
| Kai | "borrowed" his rod; hooked a Tentacool | antics; forgiven |
| Bram | ate a tray of honey rolls and blamed a Rattata | antics; forgiven, loudly |
| Ben | flattened his wheat chasing a Nidoran: "Mm. It grew back." | patience with him |
| Old Tom | "precious few had what you've got. That stubborn shine." | potential |
| Rose | "some seeds want to blow far from the tree" | permission to leave |
| Timmy, Lily | hero worship; rivalry | kids who look up to him |

**Why he's a free spirit.** Delia had him at **19** and ran Pallet House (her grandmother's inn and restaurant) on her own, so Ash grew up loose in a town full of kind adults. He's sociable, reckless and always outdoors, and Pokémon trust him. He has never had to look after anything (except, in a way, his mother, though he doesn't know that yet). His flaws come from the same place as his charm:

- **Impulsive:** he acts first (Kai's rod, the Spearow rock).
- **Proud:** he can't stand losing, especially to Gary.
- **Careless with things and time:** he oversleeps, loses stuff, doesn't do his chores.
- **Doesn't ask for help:** he's used to help just showing up (the town found him under the boat).

**What he already has:** empathy for creatures, stubbornness, cheerfulness, and the town's belief in him.

The arc turns those flaws into **responsibility, humility, patience and openness** without losing the spark.

---

## 3. The growth system ("Ash's Heart")

### 3.1 The idea
A quiet, mostly invisible system that records **how Ash meets each setback**. It is not a morality meter, and there's no "bad Ash". Every thread grows only from setbacks Ash actually goes through; avoiding trouble grows nothing. **You grow by getting soaked, not by staying dry.**

### 3.2 Six threads
| Thread | From → to | Grows when Ash... | Show anchor |
|---|---|---|---|
| **Heart** (empathy for Pokémon) | "my Pokémon" → "my partner" | puts a Pokémon's wellbeing before a win: forfeits, rests them, carries Pikachu, lets a Pokémon choose | EP005, EP014, EP059 |
| **Humility** | pride → learning | loses and asks why; thanks the winner; admits a mistake; takes advice | EP005, EP056, EP080 |
| **Responsibility** | careless → dependable | keeps promises; pays a debt; does a chore; comes back when he said he would | EP012, EP018, EP036 |
| **Patience** | rush → wait | rests when tired; waits for a Pokémon to trust him; chooses not to evolve or force things | EP004, EP010, EP014 |
| **Courage** | bravado → bravery | stands in front of danger for someone else; goes on while scared | EP001, EP026, M01 |
| **Openness** (asking for help, accepting care) | "I can do it myself" → "can you help me?" | asks an adult or friend for help; accepts care (soup, a bandage, a call home); says how he feels | EP002, EP080 |

Each thread has 5 **stages** (0–4). Points come from setback **responses** (below). Thresholds rise: 2, 5, 9, 14.

### 3.3 Setbacks and responses
A **setback** is an event: losing a battle, a Pokémon disobeying, getting lost, being hurt, being embarrassed in public, a Pokémon leaving. Each one offers **responses**, usually as things Ash does rather than menu choices:

| Response | How the player does it | Typically grows |
|---|---|---|
| **Rest** | sleeps, sits on a bench, heals at a Center before pushing on | Patience, Heart |
| **Push on** | keeps going while hurt, tired or wet | Courage (+1, only once per setback; pushing on again and again grows nothing and raises the cost through conditions) |
| **Ask for help** | talks to a caring adult or friend while the condition is active, or uses "Ask" on them | Openness |
| **Make it right** | apologises, pays back, returns the item, goes back for someone | Responsibility, Humility |
| **Try another way** | changes Pokémon or strategy after a loss, trains, asks for advice | Humility, Patience |
| **Let go** | lets a Pokémon choose, releases, says goodbye well | Heart |
| **Call home** | videophone or letter after a setback | Openness |

The **conditions** (`conditions.json`) are the visible side of setbacks: being Downcast after a loss, Flustered after a public slip, Sniffles after staying wet. **How a condition ends** is the response. Sniffles cured by resting with soup at a Center counts as Rest (+Patience) and accepting care (+Openness). Toughing it out until it fades counts as Push on (+Courage once). Either way the condition ends. The difference shows only in what Ash learns and what people say.

### 3.4 What growth unlocks (never gates the main story)
- **Dialogue:** every person gets `after` lines keyed to `heart_<thread>_<stage>` flags (the existing `after[flag]` pools in `quests.gd` already support this). Example: Ben at Humility 2: *"Heard you lost one. Heard you shook the fella's hand. Mm. Good."*
- **Pokémon trust:** Heart and Patience speed up trust (see the trust bonds in `conditions_and_mechanics.md`), and Charizard's obedience needs Heart 3 + Patience 2 (the Orange Islands payoff, or the end of the League in this game).
- **The journal** changes tone: Stage 0 entries are all exclamation marks; Stage 3 entries notice other people.
- **Small mechanics:** Openness 2 adds an "Ask" option on caring adults (directions when Lost, a remedy when Stung). Responsibility 2 lets him carry Mom's first-aid kit without Delia nagging. Courage 3 shortens how long Spooked lasts.
- **Ash's sayings:** a short line over his head when a condition starts, which matures by stage. Hungry at stage 0: *"I'm STARVING!"* At Patience 3: *"Snack first. Then the gym."*

### 3.5 Data (proposal: `native/life/growth.json`)
```json
{
  "threads": {
    "heart": {"name": "Heart", "stages": [0, 2, 5, 9, 14]},
    "humility": {"name": "Humility", "stages": [0, 2, 5, 9, 14]},
    "responsibility": {"name": "Responsibility", "stages": [0, 2, 5, 9, 14]},
    "patience": {"name": "Patience", "stages": [0, 2, 5, 9, 14]},
    "courage": {"name": "Courage", "stages": [0, 2, 5, 9, 14]},
    "openness": {"name": "Openness", "stages": [0, 2, 5, 9, 14]}
  },
  "setbacks": {
    "lost_battle": {"responses": {"try_another_way": {"humility": 1, "patience": 1}, "ask_for_help": {"openness": 1, "humility": 1}, "call_home": {"openness": 1}, "rest": {"heart": 1}}},
    "pokemon_hurt": {"responses": {"rest": {"heart": 2}, "ask_for_help": {"openness": 1}, "push_on": {"courage": 1}}},
    "forfeit_to_protect": {"responses": {"_auto": {"heart": 2, "humility": 1}}},
    "public_embarrassment": {"responses": {"make_it_right": {"humility": 2}, "laugh_it_off": {"courage": 1}}},
    "broke_something": {"responses": {"make_it_right": {"responsibility": 2}}},
    "disobeyed": {"responses": {"rest": {"patience": 1}, "try_another_way": {"patience": 1, "heart": 1}}},
    "farewell": {"responses": {"let_go": {"heart": 3}}},
    "condition_cured_with_care": {"responses": {"_auto": {"openness": 1}}}
  }
}
```
Saved state: `{"heart": 3, "humility": 1, ...}` plus `seen_setbacks: {id: count}` so a repeated setback has diminishing returns (the second time he gets lost teaches less than the first, unless he responds differently).

---

## 4. Chapters

Each chapter lists the **theme**, the **show anchor**, **what happens in the game**, the **setbacks and conditions** used, the **caring adult**, the **antagonist**, the **main growth thread**, **what's going on at home** (see §5), and one **scene** with dialogue in the established voices.

### Prologue: Pallet Town ("The boy the whole town raised")
- **Theme:** belonging and wanting more. Ash is loved and restless.
- **Show anchor:** EP001.
- **In game (what exists, plus additions):** the 12 townspeople, the rumours about Cinnabar, the errand quests. Add **Mom's Garden** (q_delia, written out in §5.4). On **departure morning**: Ash **oversleeps** (the alarm clock gag; the Sleepy condition) and runs to the lab **in his pajamas** (the Pajamas condition, so everyone comments). Pikachu, a leash, rubber gloves. Delia's **packing list** turns into the **Backpack** tutorial: she has overpacked, so you're Encumbered until you decide what to leave behind (§4 in the mechanics doc).
- **Setbacks:** overslept, last pick, Pikachu won't go in the ball.
- **Growth:** Responsibility 0 → 1 if he goes back and thanks Oak properly after changing out of his pajamas.
- **At home:** Delia waves him off. That night, her first evening alone (an optional epilogue vignette, shown as a postcard-style still on the next save load).
- **Scene: the send-off at the lab gate.**
  > **DELIA:** Ash! Your... you're in your pajamas.
  > **DELIA:** Never mind. I packed clothes. I packed EVERYTHING. Clean socks, a sweater, rubber gloves...
  > **DELIA:** ...and the gloves are for the POKéMON, apparently. Oh, honey. It's very yellow.
  > **MAE:** Let the boy go, Delia. You can't hold a river in a teacup.
  > **TIMMY:** ASH! The fan club is HERE! All three of us!
  > **OAK:** Off you go, Ash. And Ash, the world is bigger than a lab gate. Be patient with it.

### Chapter 1: Route 1 and Viridian City ("The first time it's your fault")
- **Theme:** responsibility. His impulse hurts his partner.
- **Show anchor:** EP001–EP002.
- **In game:** catching a Pidgey goes wrong; the **Spearow rock** is a real choice (throw it or don't). If he throws it, the Spearow flock chases him in the rain, Pikachu is **hurt**, Ash ends up **Wet** and **Scraped**, and he has to **carry Pikachu** (the Carrying Pikachu condition: no running speed bonus, can't throw) to Viridian. Officer Jenny gives him a lift on the last stretch. **The Spearow remember** (flag `spearow_grudge`; it pays off in the last chapter as the show's Fearow).
- If he **doesn't** throw the rock, the flock still comes (a storm spooks them), and he still shields Pikachu. The grudge is softer: the flag is `spearow_wary`, and the Fearow later can be won over instead of fought.
- **Setbacks:** Pokémon hurt; a broken bike (Misty's, an IOU, see Money in the mechanics doc).
- **Caring adults:** Officer Jenny, Nurse Joy. **Antagonist:** Team Rocket (first appearance).
- **Growth:** Courage (shields Pikachu), Openness (first call home).
- **First call home (videophone)**:
  > **DELIA:** Ash! You're on the TV! I mean the phone. The phone TV!
  > **DELIA:** Is that a bandage? On your knee? Ash Ketchum, what happened?
  > *(Choice: "It's nothing!" / "Pikachu got hurt. It was my fault.")*
  > *(If honest)* **DELIA:** Oh, sweetie. ...Is he going to be all right?
  > **DELIA:** Then you sit with him. That's what I'd do. That's what I did, with you, every time.
  > **DELIA:** ...Mr. Mime says hello. He's miming you. It's very accurate. He's eating.
  *(Honest = Openness +1 and the flag `told_mom_truth_1`. Later calls reference it.)*

### Chapter 2: Viridian Forest ("A weak bug is still yours")
- **Theme:** patience; loving the underdog.
- **Show anchor:** EP003–EP004.
- **In game:** Caterpie (Lily's Nibbles has been the tutorial for it, and her quest *The Butterfree Question* pays off when Ash writes to her). **Weedle and Beedrill stings** (the Stung condition). **Lost** in the trees at dusk. Samurai, the forest rival.
- **Setbacks:** stung, lost, mocked.
- **Growth:** Patience (the Harden standoff is a little minigame: you win by **doing nothing**, holding still).
- **Letter to Lily (journal → mail):** *"Lily — my Caterpie turned into a Metapod!!! It mostly sits. I sit with it. Tell Nibbles it is not boring it is THINKING. — Ash. P.S. Butterfree soon. Probly."*

### Chapter 3: Pewter City ("A badge you didn't earn")
- **Theme:** humility; seeing another kid's burden.
- **Show anchor:** EP005.
- **In game:** the first Gym loss. The **forfeit button** is offered when a Pokémon is at critical HP and being held (Bind), and forfeiting is rewarded (Heart +2). Afterwards Ash is **Downcast**. **Flint's tea** (a caring adult) cures it and leads to the scene at Brock's house: Brock in an apron, cooking for nine siblings. The rematch, the sprinklers, the siblings begging; the badge given anyway.
- **Delia mirror (subtle):** Flint, looking at Brock: *"Kids who raise kids. They grow up quick, and they don't complain."* Ash's journal that night: *"Brock has 9 brothers and sisters and he cooks for ALL of them. Mom only had me. I wonder if I was a lot."* (The first crack where Ash glimpses Delia's side. He doesn't dwell on it.)
- **Growth:** Heart, Humility. A **Rest** response after the loss (sleeping at the Center before the rematch) adds Patience.
- **Caring adult:** Flint. **Antagonist:** Ash's own pride.

### Chapter 4: Mt. Moon and Cerulean City ("Given, not won")
- **Theme:** worth, and other people's families.
- **Show anchor:** EP006–EP007.
- **In game:** cave darkness (the Spooked condition at low light), Zubat, the Clefairy. Cerulean: Misty's sisters offer the badge for nothing. **Accepting it** is allowed, but the badge is flagged `badge_cascade_given` and people mention it ("got it for free, did you?" — Marina, gruffly, at home). **Refusing** and battling Misty sets `badge_cascade_earned`. Either way, Pikachu won't battle a friend.
- **Growth:** Humility (refusing), or later through a "make it right" rematch.

### Chapter 5: The road to Vermilion ("Who cares for the left-behind")
- **Theme:** abandonment and loyalty; anger at cruelty.
- **Show anchor:** EP008–EP013.
- **In game, a run of small chapters:**
  - **Hidden Village (Melanie):** look after hurt Pokémon (feed, rest, carry), and Bulbasaur joins **only if Ash helps more than he battles**. Melanie: *"You don't catch a Pokémon here. You get chosen."*
  - **Charmander in the rain:** Damian, an antagonist boy, at the Center. Rain is the **Wet** condition. Ash can **give Charmander his jacket** (Ash then gets **Chilly**, then Sniffles; Heart +2), and running through the storm drains Stamina fast. Nurse Joy saves it. The next morning, Charmander chooses Ash.
  - **Squirtle Squad:** a pit trap (Dusty condition, which blocks entry to the Center's clean ward). Pikachu is hurt; Ash **promises** to come back with medicine and **must keep the promise within a game-time limit** (Responsibility +2; if he's late, the Squad waits at the cliff and is disappointed, and he has to win them back).
  - **Bill's lighthouse:** night, **exhausted** (Fatigue), the Dragonite. Gus's lighthouse at home echoes this one. Ash writes Gus a letter.
- **Caring adults:** Melanie, Nurse Joy, Officer Jenny. **Antagonists:** Damian, the Squirtle Squad (who become friends).
- **At home:** Delia starts swimming at dawn with Marina (§5).

### Chapter 6: Vermilion City ("Stay who you are")
- **Theme:** courage and self-acceptance; respecting a partner's choice.
- **Show anchor:** EP014.
- **In game:** arriving after two weeks, **Hungry** and Pikachu **Grumpy**. The ward full of hurt Pokémon. A Surge loss; the **Thunder Stone choice**. The player can't use the stone on Pikachu directly; "Use" opens the scene where Ash *asks* Pikachu, and Pikachu bats it away. (A Pikachu that's still at low trust ignores the question and goes to sleep, and the scene waits until trust is higher.)
- **Growth:** Heart +3 (letting him choose), Courage.
- **Call home:** Delia has seen Surge on TV. *"That man called you BABY? On television? Ash, I am going to write a letter."* (She does. Lt. Surge's reply is a later comic letter: *"Ma'am. Kid's got guts. —Surge."*)

### Chapter 7: The St. Anne and the shipwreck ("The trade you regret")
- **Theme:** owning a mistake; survival.
- **Show anchor:** EP015–EP017.
- **In game:** a gentleman offers a trade. If Ash trades Butterfree, he gets **Homesick-for-a-Pokémon** (a variant of Downcast) until he asks to trade back (Responsibility +2). Storm, capsize, upside-down corridors. On the raft: **Hungry** and **Wet**, and a **truce** with Team Rocket. On the island Ash is **separated from his Pokémon**: you play Pikachu, Bulbasaur, Charmander and Squirtle on their own (a companion chapter).
- **Growth:** Responsibility, Patience (trusting his team).

### Chapter 8: Porta Vista ("Mom's on the beach?!")
- **Theme:** seeing Mom as a person for the first time.
- **Show anchor:** EP018–EP020.
- **In game:** Ash crashes Moe's boat and **works off the debt** at Moe's restaurant (a cooking and serving minigame; Ash has watched Delia do this his whole life and is surprisingly good at it). **Delia shows up with Oak and the Pallet Town Volunteer Patrol on a seaside trip**, in a sunhat, laughing with Rose and Ada. Gary sneers "amateur".
- **Key scene: Mom's day off**
  > **ASH:** Mom?! What are you DOING here?
  > **DELIA:** The Volunteer Patrol does a beach clean every summer, sweetie. I signed up.
  > **DELIA:** I've never been to Porta Vista. Can you believe that? Twenty-nine years old.
  > **ROSE:** She swam out to the buoy this morning. Tell him, Delia.
  > **DELIA:** I did not SWIM. I... strongly paddled.
  > **ASH:** ...You can't swim.
  > **DELIA:** I couldn't swim. Marina's been teaching me. Dawns, while the terrace is quiet.
  > *(Ash's journal, that night:)* "Mom was SO happy today. Not like at home happy. Different. Like Timmy on market day."
- **The trophy:** if Ash enters the costume contest and loses to Gary, Delia gives him a trophy anyway, "First Place in Our Hearts", which goes on a shelf in his room at home (a visible keepsake).
- **Growth:** Responsibility (the debt), Openness (if he tells Mom about the trade regret).

### Chapter 9: Bye Bye Butterfree ("Letting go")
- **Theme:** letting go.
- **Show anchor:** EP021.
- **In game:** the Butterfree migration on the cliff at sunset. The release isn't forced. The player decides, but Butterfree's mood keeps drifting toward the flock, and keeping him has a gentle cost (Butterfree turns **Wistful**). Releasing triggers a farewell scene with a flashback built from the player's own moments with Caterpie (the game records 3 "memory snapshots" per Pokémon: the first catch, first evolution, a big win).
- **Growth:** Heart +3, plus the journal entry "Farewell".
- **Ripple at home:** Lily's quest gets an epilogue. A letter from Ash lets her decide that when Nibbles becomes a Butterfree, she'll let him choose too.

### Chapter 10: Saffron and Lavender ("Scared")
- **Theme:** fear, and that it's all right to be afraid.
- **Show anchor:** EP022–EP024.
- **In game:** lost on the way, a near fall from the cliff (Scraped, Dazed). Sabrina's doll house; **running away is the right answer the first time**. Lavender fog: **Spooked** (shorter with Courage). Haunter, and a badge won by making Sabrina laugh. Ash is **unsure he deserved it** (the Doubting condition, cured by a talk with Brock or a call home).
- **Growth:** Courage, Openness.

### Chapter 11: Celadon ("Say sorry")
- **Theme:** prejudice and apology.
- **Show anchor:** EP025–EP026.
- **In game:** at a public phone, **Oak reports Gary's five badges**, and Ash goes **Downcast**. A Mankey steals his **cap** (the Capless condition: Delia's "Wear your cap!" bark pays off as Sunburned risk). In Celadon, Ash's careless insult about perfume ("perfume turns guys into zombies") gets him **thrown out**. To get back in: the **"Ashley" disguise** (the Disguised condition, so townsfolk don't recognise him; played for laughs). Then the fire, the rescue of Gloom (Sooty, Courage +2). The badge comes as **thanks**, and a proper **apology** to Erika (Humility +2) unlocks her extra line: *"Most boys never come back to say it."*
- **Growth:** Humility, Courage.

### Chapter 12: Primeape and Fuchsia ("Temper")
- **Theme:** temper, and placing a Pokémon where it fits.
- **Show anchor:** EP025, EP029–EP034.
- **In game:** Primeape is Ash's temper in a Pokémon. Its obedience rises only when Ash **doesn't** react to provocation: the game tracks how often he battles while **Fuming**. The P1 Grand Prix, then the choice to **leave Primeape with Anthony** (Heart +2). Ranger Jenny arrests him at the preserve (Flustered; Responsibility +1 if he apologises). Koga's Gym.
- **At home:** Delia and Rose start the **Saturday Supper Club** on the terrace (§5).

### Chapter 13: Pikachu's Goodbye ("If you love someone")
- **Theme:** the deepest bond beat before the League.
- **Show anchor:** EP039.
- **In game:** the Pikachu colony. If **Pikachu trust is at its maximum**, the scene plays as in the show: Ash, **Off His Food** (a Hungry variant: he won't eat), decides to leave Pikachu and runs, and Pikachu chooses him. If trust is lower, Pikachu stays with the colony **for one night** and comes back at dawn, and trust jumps to the next tier either way. **Ash cries**, and it's allowed. Every caring adult's lines afterwards reference it softly (Mae: *"I hear you nearly lost your shadow, dearie. Shadows come back at sunrise."*).

### Chapter 14: Charmeleon to Charizard ("Pride meets pride")
- **Theme:** respect you have to earn; humility.
- **Show anchor:** EP043–EP046, EP079.
- **In game:** after evolving, Charmeleon **disobeys** (trust resets toward "Proud"). It blasts Ash (Sooty is a recurring gag from here). As Charizard it naps in battle. You earn its trust **slowly and outside battle**: flying lessons where you fall a lot, warming it after rain, sharing food. This arc deliberately **won't finish before the League** unless Heart is 3+ and Patience 2+ (the show's EP079 loss; see Chapter 18).
- **Togepi note:** the show's Egg is found here (EP046). In the game, **nothing is found**. See §9.

### Chapter 15: The admissions exam ("Failing a test")
- **Show anchor:** EP056.
- **In game:** an optional Pokémon League admissions exam; the questions are real Pokédex trivia. A low score goes **on a public board** and makes Ash Flustered. **Retaking** it after studying (the journal and Pokédex) is the response (Humility, Patience). A quieter beat: **Delia tells him over the phone that she failed her driving test twice**.
  > **DELIA:** Twice! The examiner made a noise like a Psyduck. I passed the third time.
  > **DELIA:** And now look at me. I drive to Viridian for flour like a professional.

### Chapter 16: Cinnabar ("Forfeit, then finish")
- **Theme:** forfeiting is still the right call; persistence.
- **Show anchor:** EP058–EP059. The game has already seeded **Blaine's riddles** and the **quiz doors** in `lore.json`.
- **In game:** riddles to find the Gym. Pikachu is burned over the lava, Ash forfeits (Heart +2), and Blaine lets Pikachu use the **hot springs** (they cure Pikachu's Burned and Ash's Sniffles and Sore Ankle; "hot springs" is a cure in `conditions.json`). Team Rocket set off the volcano, and **Charizard helps with the dam of his own accord**. Charizard's trust moves up one tier however the rest of the arc has gone.
- **Mom's tie-in:** Granny Mae's honeymoon story about the Cinnabar springs (`lore.json`). Ash sends Mae a postcard. At home, Mae shows it to Delia, which plants Delia's own Cinnabar trip (§5, stage 7).

### Chapter 17: Viridian Gym ("Stop counting")
- **Show anchor:** EP063.
- **In game:** Gary has 10 badges. Ash **crouches in a corner** (Downcast, strongest level). The cure isn't a win. It's a scene: Brock sits down next to him, or Delia calls if Openness is 2+. Then the Earth Badge.
  > **BROCK:** You know what my dad said when I asked how many badges he had?
  > **BROCK:** He said he never counted. He said he counted dinners. Then he left, and I counted them for him.
  > **BROCK:** ...Count what matters, Ash.

### Chapter 18: Home before the League ("You're leaving ME?")
- **Theme:** Mom has a life now; Ash notices.
- **Show anchor:** EP064–EP073. **EP066 in particular: Delia goes on a Seafoam holiday with Pallet's locals and tells Ash to stay home and train.**
- **In game:** Ash comes home to a Pallet that **changed without him** (§5.3): Delia's swimsuit on the line, a supper club sign, Mr. Mime drilling a chorus of Oddish. Then the reversal:
  > **DELIA:** Oh! Ash! You're home! Wonderful. There's stew in the pot.
  > **DELIA:** We leave for Seafoam at nine. Rose, Ada, Marina and me. Mr. Mime is minding the terrace.
  > **ASH:** We? Leave? You're... going on a trip? Without me?
  > **DELIA:** You have a League to train for, mister. I'll send a postcard.
  > **DELIA:** ...Is that what it feels like? When I wave you off? Hm. It's a very funny feeling, isn't it.
  - Then the **garden chore** (EP068): Ash can dodge it ("serious training!") or do it. Doing it gives Responsibility +1, and Delia's line: *"Thank you, honey. You've got your grandmother's hands for soil."* Dodging sends him on the show's comic errand: **haul 300–400 lb of fertiliser home** from the Xanadu Nursery, extremely Encumbered, Pikachu riding on top.
  - **Bruno:** Delia knows where he trains (EP071) because a customer at Pallet House told her. *"Pallet House hears everything, sweetie. Everyone talks over soup."*
- **Growth:** Openness, Responsibility. This is also where Ash starts asking his mother about *her*. Choosing "How was Seafoam?" before "Where's my stuff?" sets `asked_mom_about_her_day`.

### Chapter 19: The Indigo Plateau ("Losing well")
- **Show anchor:** EP074–EP080.
- **In game:**
  - **The torch:** Ash carries the Moltres flame on a run. Stamina and Wet are the threats (**rain puts the flame out**: the Wet condition matters here).
  - **Jitters** before matches, worse when he hears "all of Pallet is watching" (the town TV broadcast; Ada is running a watch party at Pallet House).
  - **Gary loses** (round of 32). Ash can **go and find him**: the game's first chance to **comfort a rival** (Heart +1, Humility +1). Gary: *"Don't. ...Just don't lose to anyone dumb, Ketchum."*
  - **Delia cooks his favourite in the restaurant kitchen** (EP078), with Mr. Mime miming the confused chefs.
  - **Ritchie:** a friend and rival, camping under the stars.
  - **The loss:** Charizard naps unless trust is high. The match is lost either way (the show's emotional spine), unless the player has reached Heart 4 + Patience 3. Then Charizard fights and Ash **still loses to Ritchie, narrowly**. The lesson isn't "you weren't good enough". It's that losing is part of the road.
  - **The bed sulk (EP080):** Ash is **Downcast at full strength** and won't leave bed. The player can't move him at first. The scene is about **who comes**. Misty brings food (refused). Oak tells the truth about Charizard (it stings). **Then Delia comes in, alone, and sits on the end of the bed.** This is the climax of both arcs; the full scene is in §5.5.
  - Then Ritchie by the lake: *"Losing is good for Trainers."* Ash realises. Downcast lifts and turns into **Fired Up**.

### Chapter 20: Pallet Party Panic ("The past comes back")
- **Show anchor:** EP081.
- **In game:** a party at the lab with the whole town, and Team Rocket's **Spicy** food stall. Arbok poisons Pidgeotto, and Ash feels **Guilty**. Then the payoff of the first chapter: **the Spearow from Route 1 returns as a Fearow** leading a flock against the Pidgey. With `spearow_grudge`, it's a fight. With `spearow_wary`, Ash can **apologise** (a long-delayed Make It Right: Responsibility +3, the biggest single award in the game). Pidgeotto evolves, and the **release of Pidgeot** to protect the flock (Heart +3).
- **Closing:** Delia waves him off to the Orange Islands from the **pier**, not the lab gate, because she's about to board Kai's boat for Cinnabar herself (§5, stage 7).

---

## 5. Delia's chapter

### 5.1 Principles
- **No animosity, either way.** She doesn't regret Ash. Ash isn't to blame. The town never pities her; they admire her.
- **Shown, not told.** Ash learns her story in pieces, from other people, objects and one late conversation.
- **Her chapter is her own.** It isn't caring for someone else instead. The sea that scared her (*"I'd rather keep my feet on the grass"*), the trips she never took, the dream she put away. Mr. Mime is her partner in all of it, the Pokémon she has quietly "trained" for ten years.
- **She grows too.** Ash learns to ask for help; Delia learns to stop asking permission.
- **Ash's father stays offstage.** At most there's one faded photo face-down in a drawer, which Delia doesn't explain and Ash doesn't ask about. The novel's backstory (he left to be a Trainer; see the research doc) is never stated. It's there only as subtext for why she worries.

### 5.2 Stages (driven by badges or game days away; whichever comes first)
| Stage | Trigger | What's happening for her | How Ash learns it |
|---|---|---|---|
| 0. **Before** | start | Runs Pallet House; worries; proud. An old Trainer's handbook in the hall closet. | Quest *The Handbook in the Drawer* (§5.4) |
| 1. **The quiet house** | leaves Pallet | *"The house is so quiet I can hear the clock. I'd forgotten it ticked."* Rearranges his room "just dusting". | First call; Ada's gossip |
| 2. **Swimming at dawn** | badge 1–2 | Marina teaches her to swim before the terrace opens. | Marina's letter; Gus's log ("06:10, Mrs. Ketchum, to the second buoy"); a call where her hair is wet |
| 3. **Saturday Supper Club** | badge 3–4 | She and Rose start a Saturday night supper and music evening on the terrace, with Kai's radio and Bram's bread. | **TV at a Pokémon Center**: the regional news covers the "Pallet House Supper Club" (Ash's jaw drops) |
| 4. **The Volunteer Patrol** | Porta Vista chapter | She travels for the first time: Porta Vista with Oak and the Patrol. | Meets him in person (Chapter 8) |
| 5. **The cookbook** | badge 5–6 | She's writing down Grandma's recipes, and her own, for a *Pallet House Cookbook*. Ada claims a Celadon publisher is "very interested" (half true). | A package containing a **test recipe** for Ash and Brock; Brock's reaction |
| 6. **Seafoam and the handbook** | home before the League | The holiday with friends (EP066). Afterwards she takes the old handbook back out, and she and Mr. Mime enter the **Viridian Fair Pokémon Pairs Performance** "just for fun". | Ash sees it at home or on TV at the League (§5.3) |
| 7. **Across the water** | after the League | She books the **Cinnabar hot springs** (Mae's honeymoon story) and crosses the sea on Kai's boat. Ash waves *her* off from the pier. | The final scene of the Kanto arc |

### 5.3 How it shows up
1. **Calls (videophone at Centers).** Her side changes by stage: background noise (the terrace, the radio), wet hair, flour on her cheek, Mr. Mime miming in the background, and later an empty kitchen behind her because she's calling from Rose's.
2. **Letters and care packages.** (Packages are a mechanic: food, socks, a remedy, a little money. See the mechanics doc.) The letters get less anxious and more about her: an early letter is three paragraphs about socks; a later one is three paragraphs about the swim, then one line about socks.
3. **What townspeople say** (new `after[...]` pools keyed to `delia_stage_N` flags):
   - **Rose:** *"We were girls together, your mother and me. She had a scrapbook of every place she'd go. Porta Vista was page one."*
   - **Mae:** *"Your mother was nineteen with a baby on her hip and a kitchen on her back. Never once let you see her tired."*
   - **Marina:** *"Your mum swam to the second buoy today. Swore the whole way. Good form, though."*
   - **Ada:** *"Did you hear? Delia's in the NEWS! The supper club! Or was it the cookbook? Both! Probably!"*
   - **Bram:** *"Your mum bought a loaf for the supper club and asked me to sing! ME! HO HO! I said yes."*
   - **Gus:** *"Logged, 06:10: Mrs. Ketchum, to the second buoy and back. Wind light. Spirits high."*
   - **Old Tom:** *"Your mother asked me how to read the sea. First time in thirty years anyone's asked. I talked for two hours, lad."*
   - **Kai:** *"Your mom asked how the boat radio works! I gave her the LONG version! Technology is incredible!"*
   - **Ben:** *"Your ma's stopped looking up the road every evening. Mm. Looks at the sea now."*
   - **Timmy:** *"Your MOM can SWIM now! Like a GYARADOS! ...A nice one."*
   - **Lily:** *"Your mum taught me to make the Pecha tart. She says I'm her apprentice. I'm also going to be a Pokémon Master. I can do both."*
4. **Things that change at home.** Pallet itself shows it when Ash comes back: a swimsuit on the washing line at the red house; a chalkboard by the terrace (**SATURDAY SUPPER CLUB — ALL WELCOME**); a second chair on the bench where Delia takes her break (for Rose); her old handbook on the kitchen table instead of in the closet; Mr. Mime practising a two-person bow.
5. **TV at Pokémon Centers.** A "Kanto Today" segment. A cheap, effective way to show Pallet changing from far away.
6. **Delia's activity schedule** (people.json). New blocks unlock by stage: `["06:00", "swim", "beach"]` (stage 2), a Saturday `supper_club` at `pallet_house.terrace` (stage 3), `["14:15", "write", "pallet_house.bench"]` (stage 5, the cookbook), `["15:00", "practice", "pallet_house.garden"]` with Mr. Mime (stage 6). These are new activities for `life.gd`; existing ones are reused where possible (`walk` to `beach` can stand in for `swim` at first).

### 5.4 Her quests back home
These are for times Ash is in Pallet: the prologue and Chapter 18.

**Q: Mom's Garden** (fills the disabled `q_delia` hook)
- *Offer:* *"Ash, sweetie, would you help me with Grandma's roses? They're sulking and I need a second pair of hands. A pair that isn't miming."*
- *Steps:* 1) fetch a trowel from Ben ("Mm. Bring it back."); 2) ask Rose what roses want ("Patience and coffee grounds, dear. Same as your mother."); 3) dig with Delia at `pallet_house.roses` (an activity window, `garden`).
- *The reveal while you dig:*
  > **DELIA:** Grandma planted these the year she opened. I was going to plant my own, somewhere far away.
  > **DELIA:** Oh, I had plans, Ash. Big ones. A map on my wall with pins in it.
  > **ASH:** What happened?
  > **DELIA:** You did. Best detour I ever took. Now hold this one straight.
- *Reward:* the flag `mom_garden_done` and a **Rose cutting** item (it goes in his backpack; he can plant it anywhere on the road, and Delia asks in calls where he planted it).

**Q: The Handbook in the Drawer** (the prologue, after Mom's Garden)
- Looking in the hall closet for his old cap, Ash finds a **Trainer's handbook**, dog-eared, with *D.K., age 17* inside the cover, notes in the margins, and a pressed flower from Porta Vista's postcard rack.
- Asking Delia: she laughs. *"Oh, that old thing! Every kid in Kanto had one."* (A pause.) *"I underlined the good parts. You can have it, if you like."*
- Asking Mae: *"She was going to go, dearie. Same as you. Then you came along, and she did a braver thing. She stayed."*
- **The choice:** take the handbook (Ash reads her margin notes on the road: little tips that appear as journal footnotes, e.g. *"Sleep powder: hold breath!! — D."*), or **leave it** for her. Leaving it sets `handbook_left`, which lets her stage 6 come sooner: *"I found my old handbook on the table. Did you put it there? ...Hmm."*

**Q: Swimming at Dawn** (Chapter 18, optional)
- Delia asks Ash to come watch her swim to the buoy, *"so someone can say I did it."* Ash on the beach at dawn (the Sleepy condition, it's early!). Marina coaches. If Ash cheers (a "cheer" button), Delia gets the **Fired Up** badge (an NPC condition), a nice mirror of Ash's own.

**Q: The Supper Club Needs a Song** (Chapter 18, optional)
- Collect a song from three townspeople for Saturday (Tom's sea shanty, Bram's bread song, Gus's "lighthouse hum"). It ends in a terrace party where Delia and Mr. Mime do their **Pairs Performance** for the first time. Ash's reaction choice: cheer, or embarrassed ("MOM!"). Both are fine; each gets a different warm line.

### 5.5 The climax scene: the end of the bed (Chapter 19)
Ash is Downcast at full strength after losing to Ritchie. Misty and Oak have come and gone. The door opens.

> *(Delia sits on the end of the bed. She doesn't touch the lump under the blanket.)*
> **DELIA:** I'm not going to tell you to get up.
> **DELIA:** I'm just going to sit here. Mr. Mime is outside the door, miming a door.
> *(Pause.)*
> **DELIA:** Did I ever tell you I wanted to be a Trainer? Before you.
> **ASH:** ...You had a handbook.
> **DELIA:** I had a handbook! I had a route planned. Viridian, Pewter, the whole thing.
> **DELIA:** And then, at nineteen, I had a baby, and a restaurant, and no time to be nineteen.
> **ASH:** ...Are you sad you didn't go?
> **DELIA:** Sometimes. A little. Like a sunburn. It fades. Then you see a beach.
> **DELIA:** Here's the thing, honey. I didn't lose. I just took a different road. And I learned to swim at twenty-nine.
> **DELIA:** You're ten. You lost one battle. You have SO many roads.
> *(The blanket moves.)*
> **ASH:** ...Mom? Can I have some stew?
> **DELIA:** There's my boy. I brought it. It's on the floor. Mr. Mime's guarding it.

Afterwards: Downcast drops by two levels; Openness +2; flags `mom_told_her_story` and `ash_sees_mom`. From here on, Ash's journal calls her "Mom" in a new way. He writes about her.

### 5.6 The last stage: across the water
At the end of the Kanto arc Ash heads for the Orange Islands. The send-off is reversed: Delia is the one with a suitcase on the pier, about to ride Kai's boat to the Cinnabar springs.
> **DELIA:** Clean socks?
> **ASH:** Clean socks. You?
> **DELIA:** Clean socks. And a swimsuit. And Mae's map of the springs. She drew the good bench.
> **DELIA:** I'll leave the hall light on. ...But I might not be home, sweetie. Check the pier first.
> *(Gus's log, the last line of the act:)* "Logged: two departures from Pallet, same morning. Both cheerful."

---

## 6. How Pallet Town sees Ash

The town already believes in him (the "spark", "stubborn shine" and "something special" lines). The journey tests and grows that belief, and the town **hears about it**.

### 6.1 "Ada's Telephone" (news from the road)
- Every setback and success Ash reports on a call, or that turns up on the Center TV, becomes **town news** carried by Ada's round, slightly wrong. Implementation: a flag is set when Ash reports (`news_<event>`), and Ada's gossip pool picks a garbled version; other townspeople repeat it with their own reaction and sometimes correct her.
  - Ash lost to Brock → Ada: *"He lost to a ROCK! A whole mountain, they say!"* → Ben: *"Lost to Brock. Pewter leader. Mm. Gave him the badge after. That says something."*
  - Shipwreck → Ada: *"The ship SANK and he rode a Gyarados home!"* → Marina: *"He rode a Squirtle. Still. Tough kid."*
- **Honest calls** (telling Mom the hard parts) produce **kind** town news; hiding them leaves the town guessing. Openness quietly shapes how home talks about him.

### 6.2 Visible markers
- **Timmy's fan club card** (it exists) gets a new crayon sticker per badge. Timmy bark: *"BADGE FOUR! I drew it! It's a rainbow! It's a bit brown."*
- **Ada's sign** (she promises in her `ash` lines: *"We'll put up a sign. 'Home of Ash Ketchum'. I'll paint it myself!"*) goes up after badge 4, misspelled ("Home of Ash Ketchup"), and gets fixed after the League.
- **Gus's logbook** (*"I'll log it, when it happens. Not 'if'. When."*): an interactable book at the lighthouse with an entry per badge or event, in his voice. *"Logged: Cerulean. Ketchum boy, second badge. Weather fair. Pride, moderate."*
- **Old Tom's spyglass:** after Cinnabar he claims he saw Ash's Charizard "from here, lad. Honest. Mostly honest."

### 6.3 Homecoming lines by growth
When Ash comes home, people react to **who he's become**, not just what he's won (keyed to `heart_*` flags):
- **Humility 2+, Mae:** *"You say 'I lost' like it's weather now, dearie. That's how grown-ups say it."*
- **Responsibility 2+, Kai:** *"You brought my rod back. Polished! Kiddo, who ARE you?"* (if the rod debt was settled by letter)
- **Openness 2+, Rose:** *"Your mother says you call every week. Every week, Ash. That's a whole garden of letters."*
- **Heart 3+, Ben:** *"Saw how your beasts look at you. Mm. That's the badge that matters."*
- **Low everything:** still warm. Bram: *"Still fire in the belly! Some ovens take longer to heat. HO HO!"*

---

## 7. Caring adults and antagonists

### 7.1 The "concern ladder" (how adults react to Ash's conditions)
Each person has a **care style** (used by the condition dialogue in `conditions.json`):
| Style | People | Wet example |
|---|---|---|
| **Fusser** | Delia, Ada, Nurse Joy | *"Ash! You're dripping! Towel. Now. Sit."* |
| **Gruff helper** | Marina, Ben, Officer Jenny | *"Soaked. Mm. Stand by the stove."* |
| **Wise teaser** | Mae, Tom, Rose | *"Rain's just the sky's way of washing a boy, dearie."* |
| **Comic** | Bram, Kai, Timmy | *"HO HO! A drowned Rattata! Bread fixes everything!"* |
| **Quiet** | Gus, Mr. Mime | *(Mr. Mime mimes wringing out an invisible towel, then hands him a real one.)* |
| **Peer** | Lily, Misty, Brock | *"Ew, you're dripping on Nibbles!"* |

### 7.2 Antagonists in the game
| Antagonist | Type | What they test | Design rule |
|---|---|---|---|
| Gary | rival kid | pride; comparing himself | Always one step ahead until the League; give him **one vulnerable moment** (the round-32 loss) |
| Team Rocket | comic adults | resourcefulness | Their pranks cause gag conditions (Sticky, Sooty, Netted, Dusty, Spicy); they **never cause real injuries** |
| Damian | cruel kid | anger at cruelty | Real moral stakes, aimed at a Pokémon |
| Lt. Surge | bully adult | courage | Calls him "baby"; later shows respect |
| Giselle / Pokémon Tech | snob kids | self-worth | Beaten by street smarts |
| Samurai, A.J., Ritchie | friendly rivals | sportsmanship | Each one shakes his hand |
| Giovanni | villain | — | Offstage in Kanto; only through Mewtwo and Team Rocket |
| **Two Pallet kids who left with Gary** | quiet foil | potential isn't enough | New in the game: two named Pallet kids who started that same Monday and **come home early** (EP065: "did not succeed"). Ash meets one of them at the Viridian Center, discouraged. If Ash cheers him up (a Heart beat), that kid ends up working at Pallet House's supper club, so Delia's chapter and Ash's arc cross. |

---

## 8. The journal

- **What:** Ash's own notebook. It opens from the quest menu. It auto-writes an entry after major beats and at night when camping or sleeping at a Center ("Write tonight?" is optional and earns nothing; it's just for reading).
- **Voice:** ten-year-old. Capitals for excitement, a little misspelled, drawings described in brackets. It changes with growth stage (§3.4).
- **Reflections:** after a setback the entry ends with an **open question** (*"Why did Pikachu do that?"*). It gets answered in a later entry once the response happens. This is the visible record of growth.
- **Sample entries:**
  - *Day 1.* "I was LATE. In PAJAMAS. Gary got a CAR. I got Pikachu who HATES me. [drawing of a lightning bolt hitting a stick man] But then the Spearow came and I don't know why I did it I just stood in front of him. He stopped hating me after. I think. Mom cried on the phone. I said I'm FINE. I'm a bit not fine. My knee."
  - *Pewter.* "Lost to Brock. Forfeit means you give up. I didn't give up I just couldn't let Onix squash him. Is that giving up? Flint said no. I think Flint is right but I'm still mad."
  - *Porta Vista.* "Mom was SO happy today. Not like at home happy. Different. Like Timmy on market day. She can swim now?? Since WHEN."
  - *After Butterfree.* "He went with the pink one. I said good luck. I didn't say it loud enough I think. Good luck Butterfree. GOOD LUCK."
  - *Indigo, the night after.* "Mom wanted to be a Trainer. She had a handbook. She said she took a different road and learned to swim at 29. I'm ten. I have SO many roads. That's what she said. I'm going to write it on my hat. (Not really. Mom would kill me.)"

---

## 9. The Togepi secret

- **The show** (keep out of the main arc): the Egg is found at Grampa Canyon (EP046), Brock carries it, it hatches in EP050 and imprints on Misty, it's hidden in Misty's backpack in M01, nearly falls into lava in EP059, and Team Rocket give it to Giovanni in EP063.
- **The game's hint:** Oak's desk letter, *"Dear Professor Elm, about the egg..."*
- **Suggestion (for later, not specified here):** treat it as Ash's **first time caring for something helpless**. The ultimate test of Responsibility and Patience: carrying it raises Encumbered, Pikachu gets jealous, Delia's advice matters ("Keep it warm, talk to it, don't drop it. I'm sorry, that's all I knew either"). It would fit after the Delia climax: Ash becomes, briefly and comically, the parent. Its **reveal** should stay a secret, and none of the arc above depends on it.

---

## 10. Flags and data for implementers

| Flag | Set by | Used by |
|---|---|---|
| `spearow_grudge` / `spearow_wary` | Route 1 rock choice | Chapter 20 Fearow |
| `told_mom_truth_N` | honest answer on call N | Delia's lines; Ada's Telephone |
| `badge_cascade_given` / `_earned` | Cerulean choice | Marina's line; Humility |
| `mom_garden_done` | q_delia | Delia stage 0; the rose cutting |
| `handbook_taken` / `handbook_left` | the handbook quest | journal footnotes / Delia stage 6 timing |
| `delia_stage_0..7` | badges or days | townspeople `after` pools; Delia's schedule; calls |
| `asked_mom_about_her_day` | Chapter 18 choice | Delia's lines, warmer |
| `mom_told_her_story`, `ash_sees_mom` | §5.5 | journal tone; final scene |
| `heart_<thread>_<stage>` | growth system | everyone's `after` pools |
| `news_<event>` | calls and TV | Ada's Telephone |
| `fan_card_badges_N` | badges | Timmy |
| `sign_up`, `sign_fixed` | badge 4 / League | Ada's sign |

New activities for `people.json` / `life.gd`: `swim`, `write`, `practice`, `supper_club` (or alias them to existing ones: `walk`, `break`, `garden`, `serve`).

New dialogue pools: `after[delia_stage_N]` for all 12 townspeople; a `cond` pool (see `conditions_and_mechanics.md` §2.4).
