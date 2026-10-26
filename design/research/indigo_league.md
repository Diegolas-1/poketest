# Research: the original anime, EP001 to the end of the Indigo League, plus the first-gen films

This is reference material for the design docs (`../ash_arc.md`, `../conditions_and_mechanics.md`). It is meant to be factual. Episode codes follow Bulbapedia's numbering (EP001 = the Japanese first episode). Anything I could not confirm is marked **[uncertain]**. Bulbapedia's per-episode "Major events" and "Plot" sections are the main source (see the sources list at the end).

**Togepi rule.** Togepi is the game's secret Pokémon, hinted at by the letter on Oak's desk (`native/interiors/oak_lab.json`, `desk_back`: *"Dear Professor Elm, about the egg..."*). Below, every place the show's Egg or Togepi appears is tagged **[SECRET: Togepi]** so the game can rework or skip it. None of these beats goes into the main arc as written.

---

## 0. Scope: what counts as "first gen"

| Work | Year (JP) | Counts? | Why |
|---|---|---|---|
| **EP001–EP080** (Indigo League, up to the end of the Indigo Plateau Conference) | 1997–99 | **Yes, the core** | Kanto, the 8 badges, the League. |
| **EP081 *Pallet Party Panic*** | 1999 | **Yes** | Still in the English "Indigo League" season; it ties off Pidgeot and the Spearow from EP001 and sends Ash to the Orange Islands. |
| EP082–EP083 (*A Scare in the Air*, *Poké Ball Peril*) | 1999 | Pointer only | English season is "Orange Islands". Brock stays with Professor Ivy; the GS Ball. |
| **M01 *Mewtwo Strikes Back*** + short **PK01 *Pikachu's Vacation*** | 1998 | **Yes** | Kanto, first-gen cast. Released in Japan between EP054 and EP055, but **set after EP065** (Mewtwo escaping Team Rocket HQ). The order is off because of the EP038 hiatus. |
| M01 Japanese prologue *The Origin of Mewtwo* (Dr. Fuji's daughter Amber/Ai) and the radio drama *The Birth of Mewtwo* | 1998 | Yes, as background | Fills in Mewtwo's origin. Not in the original English cinema release. **[uncertain: which home releases include it]** |
| **M02 *The Power of One* (Revelation Lugia)** + short **PK04 *Pikachu's Rescue Adventure*** | 1999 | **Yes, with caveats** | Kanto's legendary birds, Delia and Oak, Orange Islands setting. Set **after EP105** (Charizard obeys Ash). Lugia, and in PK04 Marill and Elekid, are second-gen Pokémon shown early. |
| *Pikachu's Winter Vacation* (PK02 *Christmas Night*, PK03 *Kanga Games*) | 1998–99 | Optional | Kanto-era Pokémon-only shorts. Small, cosy "snow day" material. |
| *Mewtwo Returns* (TV special) | 2000 | **Epilogue only** | Set in **Johto** (Mt. Quena). It does finish M01's story (where the clones live, Mewtwo learning to accept itself), so the game can borrow ideas from it, but it is not on the Kanto timeline. |
| *The Legend of Thunder!* | 2001 | **No** | A Johto/Crystal tie-in about Raikou with a different cast (Jimmy, Marina, Vincent). Ash is not in it. |
| M03 onwards (*Spell of the Unown* and later) | 2000+ | No | Johto. |

Broadcast notes. **EP035 *The Legend of Dratini*** (Safari Zone; Kaiser threatens Ash with a revolver) and **EP038 *Electric Soldier Porygon*** (the "Pokémon Shock" flashing-lights incident) were never aired in the US. EP018 *Beauty and the Beach* aired late in the US (June 2000). Of these, only EP035 matters to the story: it is where Ash catches **30 Tauros**, which the dub later mentions in EP065.

---

## 1. Ash at the start (EP001)

- He has just turned **10**, which means he can get a Trainer license. He is up late watching a battle on TV and saying out loud that he will be a Pokémon Master. **Delia** sends him to bed.
- He **oversleeps**: in his sleep he throws his Voltorb alarm clock at the wall like a Poké Ball and smashes it. He runs to Oak's lab **in his pajamas**. Gary has already left in a convertible with a cheer squad. Squirtle, Bulbasaur and Charmander are all gone. Oak gives him the leftover Pokémon, **Pikachu**, which shocks him, will not go in its ball, and has to be led on a leash with rubber gloves.
- Delia gets **weepy**, then reads out everything she has packed for him (the dub has the famous "clean underwear" list), and calls Pikachu "weird".
- On **Route 1** Ash tries to catch a Pidgey and fails. Then he **throws a rock at a Spearow**, the flock chases him, and Pikachu is badly hurt. In the rain Ash **shields Pikachu with his own body** and shouts at the flock. Pikachu jumps over him and drives them off with a big Thunder Shock. This is where they become friends. He also **wrecks Misty's bike** (he "borrowed" it). He sees **Ho-Oh** in the rainbow.
- The game's existing writing (`native/life/dialogue.json`) already fits this: the town teases Ash for **oversleeping** (Kai, Ada, Tom, Timmy, Lily), **borrowing Kai's rod**, eating Bram's honey rolls, and chasing Pokémon. Everyone says he has "a spark". Mae's line *"Your mother's frightened, dear. That's what love does. Go gently with her. And go, when it's time"* is close to the show's spirit.

**What EP001 teaches him:** wanting something isn't the same as being ready for it (he oversleeps); a partner isn't a tool (Pikachu); doing something for someone else (shielding Pikachu) is what earns trust; and actions have consequences (the Spearow come back in EP081).

---

## 2. Arc by arc

Per arc: **what happens**, **Pokémon in and out**, **rivals and antagonists**, **caring adults and mentors**, **Ash's struggles**, **what he learns**.

### 2.1 Route 1 → Viridian City (EP001–EP002)
- **What happens:** Ash carries the wounded Pikachu into Viridian City. Officer Jenny drives him to the Pokémon Center on her motorbike. Nurse Joy treats Pikachu, and **Ash calls his mother and Oak on the videophone** from the Center. Team Rocket (Jessie, James, Meowth) make their first attack. Misty says she will follow Ash until he **pays for her bike**.
- **Pokémon:** Pikachu (EP001).
- **Antagonists:** Team Rocket (first appearance); the Spearow flock.
- **Caring adults:** Officer Jenny, Nurse Joy, Oak and Delia on the phone.
- **Struggles:** his partner is hurt and it's his fault; panic; he's broke and owes Misty for a bike.
- **Lessons:** caring for Pikachu comes before winning; ask the adults for help.
- In the Japanese EP002 call, Ash's father is mentioned as "a Trainer still on his journey" (see 4.1).

### 2.2 Viridian Forest (EP003–EP004)
- **What happens:** Ash **catches Caterpie** (his first catch), which **evolves to Metapod**. He catches **Pidgeotto**. He fails to catch a Weedle. He meets **Samurai**, a boy who duels every Pallet Town Trainer. Their two Metapod use Harden on each other for hours. A **Beedrill swarm** carries off Ash's Metapod; Ash runs in under the swarm to get it back, and **Metapod evolves into Butterfree** while shielding him.
- **Pokémon:** + Caterpie → Metapod → Butterfree, + Pidgeotto.
- **Rivals:** Samurai (a friendly rival); Misty (bickering, scared of bugs).
- **Struggles:** being mocked for his "weak" bug; getting lost in the forest; danger from the swarm.
- **Lessons:** a "weak" Pokémon is worth loving; be patient (the Harden standoff).
- **Game hook:** Lily's Caterpie **Nibbles** and her *Butterfree Question* quest already echo this arc.

### 2.3 Pewter City: Brock and the Boulder Badge (EP005)
- **What happens:** Flint, a rock seller who is secretly Brock's father, mocks Ash's chances. Ash **loses his first Gym battle**: Onix's Bind is crushing Pikachu and **Ash forfeits** because he can't stand to watch. Flint takes him home for tea and shows him **Brock, in a pink apron, raising nine younger siblings**; their father left to be a Trainer and their mother walked out. Flint helps "supercharge" Pikachu at a hydro dam. In the rematch Pikachu's Thunderbolt sets off the sprinklers and Onix weakens. Brock's siblings beg Ash to stop, and **Ash ends the battle himself**. Brock follows him out and **gives him the Boulder Badge** anyway, then leaves the Gym to Flint and joins the journey.
- **Pokémon:** none.
- **Rivals:** Brock (a Gym Leader, then a friend).
- **Caring adults:** **Flint**, who comforts Ash with tea after the loss.
- **Struggles:** first loss, hurt pride, a badge he feels he didn't earn ("out of pity", Misty keeps saying in EP013 and EP014).
- **Lessons:** stopping to protect your partner is strength; everyone has a hidden story.
- **Mirror for this game:** Brock is a child who had to parent his siblings because a parent left to chase the Trainer life. That quietly echoes **Delia** (see `../ash_arc.md`). Through Brock, Ash first sees what caring for others costs.

### 2.4 Mt. Moon (EP006)
- **What happens:** Seymour the scientist; the Moon Stone; the Clefairy; Zubat. Brock catches Zubat.
- **Lesson:** protecting wild places (the Pokémon in the cave are disturbed by the strong lights).

### 2.5 Cerulean City: the Cascade Badge (EP007)
- **What happens:** Misty's three older sisters (the "Sensational Sisters") are worn out from **three other Pallet Town Trainers (Gary among them)** and offer to just give Ash the badge. Misty, the youngest, called "the runt", insists on a real battle. **Pikachu refuses to fight Misty because she's a friend.** Team Rocket interrupt, and her sisters give Ash the badge for protecting the Gym.
- **Lessons:** you can get a badge without "winning". Misty also has a family that underrates her.

### 2.6 The road to Vermilion (EP008–EP013)
- **EP008 A.J.**: a Trainer with an unofficial Gym and a 98–0 record who trains his Pokémon hard with a whip. His Sandshrew trusts him. *Lesson: hard training can come with real trust.*
- **EP009 Pokémon Tech**: snobbish rich kids; Giselle; "two badges is nothing". Pikachu **beats Giselle's Cubone without using electricity**. *Lesson: street smarts versus book smarts; don't let a label shrink you.*
- **EP010 Bulbasaur and the Hidden Village**: Melanie looks after hurt and abandoned Pokémon. The group is **lost without a compass** and Brock falls off a broken rope bridge. Bulbasaur protects the village. Ash wins Bulbasaur's respect in a fair battle; **Melanie lets Bulbasaur go with him**. *Lesson: earn a Pokémon's trust; caregivers have to let go.*
- **EP011 Charmander, the Stray Pokémon**: **Damian**, an antagonist kid, left his Charmander on a rock, promising to come back, and had no intention of doing so. Ash, Misty and Brock run back **in the pouring rain**, beat off Spearow, **wrap Charmander in their raincoats**, and Nurse Joy saves it. Charmander chooses Ash.
  *Lessons: anger at cruelty; loyalty; rain plus a flame tail makes literal stakes (the game's Wet condition fits here).*
- **EP012 Squirtle Squad**: abandoned Squirtle play pranks (pitfalls) and tie the group up. **Pikachu is hurt** and Ash **begs the Squirtle to let him fetch medicine** (a Super Potion), promising to come back. He keeps the promise. Squirtle joins after Ash saves the gang.
  *Lessons: keeping a promise makes someone trust you; someone who lashes out has usually been hurt first.*
- **EP013 Mystery at the Lighthouse**: Misty taunts Ash that his Pokémon "just followed him", so he runs off to catch something on his own. He gets **Krabby**, which is **sent to Oak because he already has six**. Gary has 45 species. Ash meets Bill, and a lonely Dragonite. They arrive **after nightfall, exhausted** from the walk.
  *Lessons: catching something isn't the same as bonding with it; there are rules (the six-Pokémon limit).*
- **Pokémon:** + Bulbasaur, + Charmander, + Squirtle, + Krabby (stored at Oak's).

### 2.7 Vermilion City: Lt. Surge (EP014)
- **What happens:** they arrive **after two weeks on the road, and Ash and Pikachu are very hungry**. The Center is full of Pokémon badly hurt by Surge's Raichu, and Pikachu is too scared to battle. Surge calls them "baby". **They lose.** Nurse Joy offers a **Thunder Stone**. Ash decides that evolving Pikachu just to win would make him no better than Surge, and **lets Pikachu choose**. Pikachu bats the stone away. They win the rematch with speed (Agility).
- **Antagonist:** Lt. Surge, an adult bully.
- **Caring adults:** Nurse Joy. Brock steers Ash with good advice.
- **Struggles:** hunger, fear, humiliation, then a real loss.
- **Lessons:** respect your partner's choices; you don't have to change who you are to win.

### 2.8 The St. Anne, the shipwreck and the island (EP015–EP017)
- **EP015**: Ash **trades Butterfree for a Raticate**, regrets it straight away, and asks to **trade back**. The ship capsizes in a storm.
- **EP016**: they wake up trapped in the upside-down wreck; Ash imagines himself drowning. Ash's group and Team Rocket call a **truce**. Adrift on a raft, **everyone wakes up starving**. They look at Magikarp as food (Meowth breaks his fangs on it); then a school of Gyarados scatters them.
- **EP017**: Ash's Pokémon are **separated from him** and have to cope on their own. Bulbasaur is too scared to ask a Venusaur for help and pretends to be an orphan. Mechanical "giant Pokémon" at an unfinished theme park.
- **Lessons:** owning a mistake (the trade); survival; trusting your team when you can't direct them.
- **Struggles:** hunger, exposure, losing his team for a while.

### 2.9 Porta Vista, Maiden's Peak and Delia's first visit (EP018–EP020)
- **EP018 *Beauty and the Beach***: Ash **crashes Moe's speedboat** and the three **work at Moe's restaurant to pay off the damage**. Ash talks Moe out of giving up his dream. **Delia and Oak show up with the "Pallet Town Volunteer Patrol"** on a seaside trip. Gary snubs Ash as "an amateur". At the end Delia holds a trophy that reads *"First Place in Our Hearts: Ash Ketchum."*
  Delia has a life of her own here: she travels with friends and enjoys the beach. That is useful for her subplot.
- **EP019**: Misty catches Horsea. Nastina is a greedy adult developer; Tentacruel takes revenge.
- **EP020 Maiden's Peak**: a ghost story and a summer festival. Brock is lovesick.
- **Lessons:** paying for what you break by working; encouraging adults; the people back home cheer even when you don't win.

### 2.10 Bye Bye Butterfree (EP021)
- Butterfree falls for a pink Butterfree, gets rejected, then wins her by rescuing the flock from Team Rocket. **Ash releases Butterfree** and remembers everything back to catching Caterpie.
- **Lesson: letting go out of love.** Ash's first real loss of a companion. It's the most important early emotional beat.

### 2.11 Saffron and Lavender: Sabrina and Haunter (EP022–EP024)
- **EP022**: the group is **lost** and arguing. Ash **nearly falls off a cliff** and Bulbasaur's vines save him. Sabrina is a frightening psychic whose doll-sized "little girl" side wants playmates. Kadabra turns Pikachu's Thunder back on him and **Ash loses; he and his friends have to run away** from the doll game.
- **EP023 Tower of Terror**: fog and fear in Lavender Town. A chandelier knocks Ash and Pikachu out and Haunter pulls their spirits out of their bodies (played for comedy and wonder; they come back). He befriends **Haunter**.
- **EP024**: Haunter disappears before the rematch and **Ash forfeits again**. **Misty and Brock are turned into dolls.** Haunter makes Sabrina laugh and Ash gets the **Marsh Badge**, but he is **"still doubtful that he deserved it"**. Haunter stays with Sabrina.
- **Struggles:** fear, helplessness, a badge earned in a strange way.
- **Lessons:** laughter heals people; you can't force a strategy.

### 2.12 Celadon and Primeape (EP025–EP029)
- **EP025**: **On a public phone Oak tells him Gary and the other two Pallet Trainers have five badges each**, and that Ash should catch more Pokémon. **Ash is left despondent.** A Mankey steals rice balls and **pounds Ash's face**, then evolves into Primeape. Ash catches it.
- **EP026 *Pokémon Scent-sation!***: Ash **insults perfume** in Erika's shop, gets **thrown out and banned** from the Gym, and sneaks in **dressed as a girl, "Ashley"** (Team Rocket's disguise idea). Team Rocket set a fire and Ash runs in to **rescue Erika's Gloom**; she gives him the **Rainbow Badge** as thanks.
  *Lessons: an insult costs you; make amends; bravery counts for more than winning.*
- **EP027 Hypno's Naptime**: missing children. *Ash "is reminded of his own mother"* and **takes on the case himself**. One of the few explicit "Ash thinks of Delia" beats in the season.
- **EP028**: Suzie gives Brock a Vulpix.
- **EP029 *The Punchy Pokémon***: the P1 Grand Prix. Primeape starts to **obey** after Ash cheers it on, and they win. Ash **leaves Primeape with Anthony**, a fighting coach, to train.
  *Lessons: his temper mirrored in Primeape; sometimes the best place for a Pokémon is with someone else.*
- **Pokémon:** + Primeape (EP025), − Primeape (EP029).

### 2.13 Gringey City to Fuchsia (EP030–EP034)
- **EP030**: Pikachu gets **faint and sparking** in a polluted city. Ash catches **Muk** and **sends it to Oak because it smells**.
- **EP031–EP032**: Diglett; the group is **lost** in the forest on the way to Fuchsia. Koga's ninja Gym, the **Soul Badge**.
- **EP033**: the Big P Ranch race (Lara Laramie, Ponyta).
- **EP034 *The Kangaskhan Kid***: Ranger Jenny **arrests Ash for "poaching"** in a preserve; he didn't know the rules. Tommy, a boy raised by Kangaskhan, has a mother who has to accept who her son has become.
  *Lesson: a parent learning to let a child be himself, a quiet echo of Delia's arc.*
- **Pokémon:** + Muk (stored).

### 2.14 Safari Zone, Bike Gang, Ditto, Porygon (EP035–EP038)
- **EP035 (unaired in US)**: Kaiser, the Safari Zone warden; Ash catches **30 Tauros**, sent to Oak. The Dratini legend.
- **EP036**: Ash and Misty **deliver medicine across the bridge for Nurse Joy** (an errand, and a hint that Ash is becoming dependable).
- **EP037**: Duplica and Ditto, who **dresses as Ash**.
- **EP038 (unaired in US)**: inside the PC transport system. *The game shouldn't touch its visuals (the flashing-light incident).*
- **Pokémon:** + 30 Tauros (stored).

### 2.15 Pikachu's Goodbye (EP039)
- Ash **slams into a tree swinging on a vine** (a typical Ash bruise). They find a wild **Pikachu colony**. At supper **Ash loses his appetite**, stays up by the fire, and decides Pikachu would be happier with its own kind. He **tells Pikachu to stay and runs off**. Pikachu chooses Ash anyway, and **Ash cries**.
- **Lesson:** loving someone means wanting what's best for them, even if that costs you. And being chosen back.
- **Game hook:** this is the model for the "Pikachu's mood and trust" mechanic (see `../conditions_and_mechanics.md`).

### 2.16 Toward Cinnabar (EP040–EP057)
- **EP040**: the Eevee brothers; a boy chooses not to evolve his Eevee.
- **EP041 *Wake Up Snorlax!***: a town with **no food** because the river is dammed. Thorns **scratch Misty**. The group goes **hungry**, then there's a feast. *(A hunger beat.)*
- **EP042 Dark City**: rival Gyms; kids throw stones at Pikachu. Pikachu **loves ketchup**.
- **EP043**: Charmander **evolves to Charmeleon**.
- **EP044 *The Problem with Paras***: **the bag of Potions and Antidotes is empty**, so they have to restock (an inventory beat). Charmeleon **disobeys** and **blasts Ash in the face**. Meowth runs a **fever** (Cassandra nurses him). *(Disobedience starts; sickness.)*
- **EP045**: Jigglypuff's song puts everyone to sleep. From then on **Jigglypuff draws on sleepers' faces in marker** whenever they nod off (a running gag).
- **EP046 *Attack of the Prehistoric Pokémon***: the Grampa Canyon fossil rush. **Gary** reappears. Charmeleon refuses to help and **evolves into Charizard** to settle a grudge with **Aerodactyl, which is carrying Ash off**; Charizard was never trying to rescue him. Ash falls next to an Egg. **[SECRET: Togepi]** The Egg is found here, and Brock carries it.
- **EP047 *A Chansey Operation***: something gets **stuck in Pikachu's throat**; no Pokémon Center for miles, so they go to a **human hospital** (Dr. Proctor).
- **EP048**: James's past (a rich family, his fiancée Jessebelle).
- **EP049**: Farfetch'd; Keith, a cheating kid.
- **EP050 *Who Gets to Keep Togepi?*** **[SECRET: Togepi]** Ash **gets a letter from Oak at the Center, calls him on the videophone**, and **upgrades his Pokédex**. The Egg hatches; Togepi imprints on Misty. *The letter, videophone and Pokédex beats can stay; the hatching cannot.*
- **EP051**: Bulbasaur **refuses to return** to its ball and **refuses to evolve**. A Hiker: *"Ash must be a bad Trainer if his own Pokémon does not listen."*
- **EP052**: the Princess Festival; Misty makes **Ash and Brock carry her shopping** (comedy encumbrance).
- **EP053**: Kids Day at a preschool.
- **EP054**: Officer Jenny's Growlithe; **Pikachu won't attack a man holding a gun**.
- **EP055–EP057**: Todd Snap, the photographer (travels with them for a while). **EP056 *The Ultimate Test***: Ash takes the **Pokémon League admissions exam** and **comes near the bottom** ("one of the lowest" scores). Todd photographs the score. *(A failure in public; embarrassment.)* EP057: Butch and Cassidy.
- **Pokémon:** Charmander → Charmeleon (EP043) → Charizard (EP046), which now disobeys.

### 2.17 Cinnabar Island: Blaine (EP058–EP060)
- **EP058 *Riddle Me This***: Gary is on the ferry. The Gym has moved; the way in is by riddles; Blaine is in disguise. *(The game's lore.json already seeds Blaine's riddles and the quiz doors.)*
- **EP059 *Volcanic Panic***: Pikachu is burned and hangs over the lava, and **Ash forfeits** to protect him. Blaine **lets them stay and heal Pikachu in the hot springs**. Ash **refuses to leave without the badge**. When Team Rocket make the volcano blow, **Charizard helps of his own accord**. Ash wins the rematch with Charizard and gets the **Volcano Badge**. **[SECRET: Togepi]** Misty saves Togepi from the lava.
- **EP060**: the Squirtle-shell island (Wartortle, Blastoise).
- **Caring adults:** Blaine, tough and fair (the hot springs).
- **Lessons:** forfeiting is still the right call; persistence; trust can come from shared work.

### 2.18 Cerulean again, and Viridian: the Earth Badge (EP061–EP063)
- **EP061**: Misty leaves Starmie and Horsea at home.
- **EP063 *The Battle of the Badge***: Gary has **10 badges** to Ash's 7. **"Disappointed and depressed that Gary will always get further and further ahead of him, Ash crouches down in a corner."** Gary loses to Giovanni's armored Mewtwo. Team Rocket stand in as Gym Leaders. Ash wins the **Earth Badge**. **[SECRET: Togepi]** Team Rocket give Togepi to Giovanni as a gift and he turns it down.
- **Lesson:** stop measuring yourself against Gary.

### 2.19 Home again in Pallet Town (EP064–EP073)
- **EP064 *It's Mr. Mime Time***: in the show, **Delia gets Mr. Mime ("Mimey") at this point**, from a circus run by Stella, who trains her Pokémon too harshly. Ash leaves Delia a voice message before arriving. Team Rocket kidnap Ash while he's dressed as a Mr. Mime (comedy). Delia asks Mr. Mime to help Ash in exchange for a big dessert. **Charizard won't obey.**
  **Game note:** in this game Mr. Mime has been with Delia **since Ash was a baby** (`dialogue.json`, `mime_life.gd`), which is a deliberate change. The show's circus is a mime joke here ("He mimed a circus. I didn't ask again.").
- **EP065 *Showdown at the Po-ké Corral***: Mimey wakes Ash by vacuuming his face. Mewtwo destroys Team Rocket HQ. Oak says **the other two Pallet Trainers didn't make it**, that Ash and Gary are Pallet's top two, and that the League is **in two months**. Gary has **200+ Pokémon** but has *seen* fewer species than Ash (60 against 100+). Ash's shelf at the lab is mostly the Tauros's 30 Safari Balls.
- **EP066 *The Evolution Solution***: **Delia goes on a beach holiday to Seafoam Island with some of Pallet's locals and tells Ash he has to stay home and train.** *(This is the key canon support for "Delia's new chapter".)* Ash goes anyway on an errand for Oak.
- **EP067 *The Pi-Kahuna***: training on Seafoam roads; **Ash runs into traffic, blinded by truck exhaust**; Pikachu surfs.
- **EP068 *Make Room for Gloom***: **Delia asks Ash to help in the garden**; he **dodges the chore**, claiming "serious training". She sends him for **300–400 lb of fertiliser** from the Xanadu Nursery, "his old childhood stomping ground".
- **EP069–EP070**: Pokémon in Love (a film shoot); the Hollywood premiere. Delia goes too ("she saw a brief glimpse of Pikachu's tail"). Meowth's backstory.
- **EP071 *To Master the Onixpected!***: three weeks to the League and **Ash has fallen behind on training**. **Delia tells them where Bruno's secret training ground is.** Ash **tells his mother not to make dinner** and rushes off.
- **EP072**: Pokémopolis (giant Gengar and Alakazam).
- **EP073 *Bad to the Bone***: **Oak and Delia see Ash off** to the League. Otoshi, whose badges were stolen while he was **hungry from training** (he fell into a pit trap reaching for fruit). Ash **risks being late to help him**: *"Stealing from one person is like stealing from everyone."*

### 2.20 The Indigo Plateau Conference (EP074–EP080)
- **EP074 *All Fired Up!***: the Moltres torch. Officer Jenny stops Ash. Charles Goodshow lets him **carry the torch in honour of his spirit**. Team Rocket snatch it; Goodshow keeps a backup flame. *(The adult who sees potential.)*
- **EP075**: Krabby **evolves into Kingler** and wins the Water Field match alone.
- **EP076**: Ash sneaks off for an all-you-can-eat buffet and **Misty calls him selfish** (Brock is the one caring for Ash's Pokémon).
- **EP077 *The Fourth Round Rumble***: **Gary loses** in the round of 32. Hearing **all of Pallet Town is cheering for him makes Ash more nervous.** Muk wins the match.
- **EP078 *A Friend in Deed***: **Delia and Oak arrive**. Delia **cooks Ash's favourite meal herself in a restaurant kitchen** while the cooks look on, baffled. Ritchie has a Pikachu (Sparky) and they camp together under the stars.
- **EP079 *Friend and Foe Alike***: Team Rocket kidnap Ash before his match and **Pidgeotto tows the balloon to the stadium and is exhausted**. Squirtle and Pikachu fall. **Charizard lies down for a nap** halfway through the battle, **Ash begs** him to fight, and **Ash loses in the Top 16**.
- **EP080 *Friends to the End***: **Ash curls up in bed and won't come out**, which worries **Misty, Brock, Delia and Oak**. Misty offers food, then suggests a walk. Oak agrees with Misty that **training Charizard better might have taken him further**, which starts another argument. Ritchie loses too and tells him **"losing is good for Trainers"**, and **Ash realizes how immature he was**. They promise each other to become Masters no matter what.
- **Lessons:** nerves under expectation; trust you never earned costs you when it matters; losing well; friends who are also rivals.

### 2.21 Pallet Party Panic (EP081), then the Orange Islands pointer
- Pallet throws a party for Ash's Top 16. **Team Rocket's extremely spicy food** makes everyone breathe fire (a gag). **Arbok's Poison Sting downs Pidgeotto**; Oak treats it and **Ash feels responsible**. Charizard rescues Pikachu, for the food, and **torches Ash**. In Viridian Forest the **Spearow Ash hit with a rock in EP001 returns as a Fearow** leading a flock. **Pidgeotto evolves into Pidgeot** to protect the Pidgey, and **Ash releases Pidgeot** to guard them. Oak sends Ash to Professor Ivy for the GS Ball.
- **Lesson:** the past comes back, so take responsibility. Letting go a second time.
- **Pointer:** EP082–EP083: the blimp; Valencia Island; **Brock stays with Professor Ivy** (friends move on); the GS Ball. The Orange League follows, with Tracey and Lapras, and **Charizard finally obeys in EP105 *Charizard Chills***, after Ash nurses him through an Ice Beam freeze. **That is where the Charizard trust arc pays off**, outside this season.

---

## 3. The films and specials

### 3.1 *Mewtwo Strikes Back* (M01, 1998) + *Pikachu's Vacation* (PK01)
- **Setting:** after EP065 (see section 0).
- **What happens:** Dr. Fuji clones Mew from a fossilised eyelash, funded by Giovanni. Mewtwo destroys the lab. Giovanni uses it as the armored Viridian Gym Leader (Gary loses to it); it breaks free. A Dragonite brings invitations; a **storm** cancels the ferry; the old piermaster **Miranda** tells a legend about **Pokémon tears bringing the dead back to life**. Ash and friends cross on Squirtle and Staryu. On New Island, Mewtwo, using a mind-controlled Nurse Joy, **clones and captures everyone's Pokémon** (Charizard, Venusaur, Blastoise clones). **Ash throws himself in front of the Mewtwo Balls to protect Pikachu.** Clones and originals fight. Pikachu won't fight his own clone and takes the slaps. **Ash steps between Mew's and Mewtwo's attacks and is turned to stone.** **Pikachu tries to shock him back to life.** All the Pokémon cry, and the tears revive him. Mewtwo understands, **erases everyone's memories**, and leaves with the clones.
- **Ash's struggle/lesson:** the biggest act of self-sacrifice in the first gen; "the circumstances of one's birth don't matter; what you do with your life is what counts" (the dub's closing theme). Pikachu's grief over Ash is the strongest scene of their bond.
- **[SECRET: Togepi]** Misty hides Togepi in her backpack.
- **Pikachu's Vacation:** a Pokémon-only short at a Pokémon theme park; minding a baby. **[SECRET: Togepi]** The "baby" is Togepi; the game can rework it with any small Pokémon.
- **Prologue (*The Origin of Mewtwo*):** Mewtwo's childhood friend is Amber/Ai, the clone of Dr. Fuji's late daughter. Background on loss and grief.

### 3.2 *The Power of One* (M02, 1999) + *Pikachu's Rescue Adventure* (PK04)
- **Setting:** Orange Islands, after EP105. Tracey travels with them; Charizard obeys.
- **What happens:** Lawrence III, a collector, captures Moltres, Zapdos and Articuno, and the world's weather goes wrong. **In Pallet Town, Oak, Delia and Mimey watch Pokémon migrating.** On Shamouti Island, Melody names Ash the **"Chosen One"**, who has to collect the three spheres. **Delia, Oak, Professor Ivy and a news crew fly out by helicopter and crash-land.** Team Rocket help, on purpose for once. Lugia carries Ash; he nearly drowns. Delia arrives after the crisis is over.
  The exact wording of Delia's lines at the reunion varies between versions and I could not confirm it **[uncertain]**. What is certain: **Delia flew into a storm to reach her son**, and arrived after he had already done the dangerous thing on his own.
- **Lesson:** Ash's courage becomes something the world depends on. For the Delia subplot this is the "my son, not the Chosen One" moment (the game can write its own line).
- **PK04:** the Pokémon get lost after Togepi **[SECRET: Togepi]**, meet Elekid and an Exeggutor forest. Gen-2 Pokémon (Marill, Elekid). Low priority.

### 3.3 *Pikachu's Winter Vacation* (PK02/PK03)
- Snow-day shorts (Christmas; playing with a Kangaskhan). Pokémon only. Useful for a winter tone: snowball gags, "Pikasnow". **[SECRET: Togepi]** in PK03.

### 3.4 *Mewtwo Returns* (2000, epilogue only)
- Set in Johto. Mewtwo and the clones hide on Mt. Quena; Giovanni hunts them; Ash doesn't remember M01. Theme: Mewtwo accepting that it belongs in the world.

### 3.5 Excluded
- *The Legend of Thunder!* (2001): Johto/Crystal, Raikou, a different main cast.

---

## 4. The cast that matters to the game

### 4.1 Delia Ketchum (most important for the subplot)
- Canon appearances in this range: EP001 (send-off, the packing list), EP002 (phone call), EP018 (Porta Vista with the Volunteer Patrol), EP064–EP073 (home), EP066 (**her own Seafoam holiday; tells Ash to stay and train**), EP068 (garden chore), EP070 (Hollywood), EP071 (knows where Bruno trains), EP073 (sees him off), EP078 (**cooks his favourite at the League**), EP080 (**worried by his bed sulk**), EP081 (party), M02 (flies to Shamouti).
- **Takeshi Shudō's novelization** (*Pocket Monsters: The Animation*), via Bulbapedia's Delia page: Delia is **29**; she runs **Pallet House**, Pallet's only restaurant, **inherited from her mother**; **"when she was younger, she dreamed of becoming both a model and a Pokémon Trainer, but abandoned those dreams to run the restaurant after Ash was born."** Ash's father "married her fast and then left just as fast" to be a Trainer. It's implied he and Ash's grandfather never came back because they achieved nothing in that goal. **[novel only, not the TV series]**
- This matches the game, which already has Delia running **PALLET HOUSE** (her grandmother opened it; "rooms upstairs, kitchen downstairs") and aged 29. It is direct canon support for the user's framing: a young single mother whose own dreams were put aside, with no bitterness.
- Brock says (per Bulbapedia) that she would make a great Trainer because of her **perseverance**.
- Recommendation: the game should **leave Ash's father unspoken**, or at most a single faded photo. The user's framing is about Delia herself, not about blame. See `../ash_arc.md`.

### 4.2 Mentors and caring adults (as far as EP081)
| Who | Where | What they do for Ash |
|---|---|---|
| Professor Oak | Pallet; phone calls | Gives him Pikachu; phone pep talks; plain-spoken feedback (EP025 and EP080); fixes up Pidgeotto (EP081); the Pokédex upgrade (EP050) |
| Delia | Pallet, Porta Vista, Indigo | Packs for him, calls, cooks, worries, lets go, lives her own life |
| Nurse Joy (all of them) | every Center | Heals his Pokémon, hands over Oak's letters, scolds him when it's deserved (EP011), offers the Thunder Stone |
| Officer Jenny | Viridian and others | Rescues and drives him (EP002); stops him (EP074); Ranger Jenny arrests him (EP034) |
| Flint | Pewter | Tea and perspective after his first loss |
| Melanie | Hidden Village | Caregiving and letting go |
| Bill | Cerulean Cape | A wise eccentric |
| Moe | Porta Vista | Lets him work off a debt; a dreamer Ash encourages |
| Sabrina's father | Saffron | Gentle, overlooked |
| Erika | Celadon | Forgives an insult |
| Anthony | P1 Grand Prix | Takes Primeape |
| Blaine | Cinnabar | Tough love; the hot springs |
| Bruno | Mt. Hideaway | Discipline |
| Charles Goodshow | Indigo | Sees his spirit |
| Mr. Mime | Pallet | Chores, comedy, family |
| Brock (a teenager) | everywhere | Cooks, advises, keeps the peace: the "older brother" |
| Misty (a peer) | everywhere | Harsh honesty, a sisterly rival |

### 4.3 Antagonists and rivals
- **Gary Oak**: rival; a mocking "amateur" (EP018); ahead on badges (EP025, EP063); humbled at the League (EP077); leaves on a new journey (EP081). Not a villain.
- **Team Rocket**: comic villains. Truces (EP016), occasional sympathy (EP014, they root for Pikachu), traps (pits, nets, fake events, spicy food). Real villainy sits with **Giovanni**.
- **Antagonist kids:** Damian (abandons Charmander), Giselle and the Pokémon Tech students (snobs), Keith (EP049), Samurai (a rival, not a villain), Otoshi (badge wager, then sympathetic).
- **Antagonist adults:** Lt. Surge (bully), Sabrina (frightening), Nastina and Brutella (greed), Stella (harsh trainer), the Magikarp salesman (con man), Giovanni (real villain).
- **Friend-rivals:** Ritchie (EP078–EP080), Samurai, A.J.

---

## 5. Ash's struggles, catalogued (as material for conditions and mechanics)

| Struggle | Episodes | Possible game condition / mechanic |
|---|---|---|
| Oversleeping, pajamas | EP001 | Sleepy, Bedhead/Pajamas |
| Hit by Pikachu's shock (constantly) | EP001+, EP016 (on purpose, "to think") | Zapped |
| Torched by Charmander/Charizard | EP044 (Charmeleon), EP081 (Charizard) | Sooty |
| Rain-soaked, sheltering Pikachu | EP001, EP011 | Wet (being built) → Chilly → Sniffles |
| Partner badly hurt, carrying him to a Center | EP001–EP002, EP012, EP014, EP047, EP059 | Pikachu hurt: carry him, hurry |
| Hungry, starving | EP014, EP016, EP041, EP073 (Otoshi) | Hungry |
| Lost, wrong way, no compass | EP010, EP011, EP022, EP031, EP032 | Lost |
| Nightfall, exhausted | EP013 | Fatigue (being built) |
| Falls, bruises, near-falls | EP010 (bridge), EP022 (cliff), EP039 (tree) | Scraped / Sore ankle / Dazed |
| Bug stings, poison | EP004 (Beedrill), EP081 (Arbok hits Pidgeotto) | Stung |
| Stun Spore, Sleep Powder, Stun Stem | EP007, EP010, EP068 | Tingly / Drowsy |
| Smells (Muk, Koffing smog, Gloom) | EP030, EP026 | Smelly |
| Jigglypuff's marker doodles | EP045 onward (a running gag) | Doodled |
| Public embarrassment | EP026 (perfume, "Ashley"), EP056 (exam score), EP018 (Gary's "amateur") | Flustered |
| Despondent, crouched in a corner, curled in bed | EP025, EP063, EP080 | Downcast |
| Nerves under expectation | EP077 | Jitters |
| Fear (ghosts, Sabrina) | EP022–EP024 | Spooked |
| Homesickness and missing Mom | EP027 (reminded of his mother), the calls home | Homesick |
| Pokémon disobedience | EP001 (Pikachu), EP025–EP029 (Primeape), EP044–EP081 (Charmeleon/Charizard), EP051 (Bulbasaur) | Trust bonds |
| Letting go | EP021 (Butterfree), EP029 (Primeape), EP039 (nearly Pikachu), EP081 (Pidgeot) | Farewell scenes; the journal |
| Debts and work | EP001 (Misty's bike), EP018 (Moe's boat) | Money and IOUs |
| Carrying too much | EP052 (Misty's shopping), EP068 (300–400 lb of fertiliser) | Encumbered |
| Supplies run out | EP044 (Potions and Antidotes) | Inventory / restocking |
| Calls and letters home | EP002, EP025 (Oak), EP050 (letter, videophone), EP064 (voice message) | Videophone and letters |
| Badges "out of pity" | EP005, EP007, EP024 | Growth: earned vs given |
| Choosing to forfeit to protect a Pokémon | EP005, EP059 | Growth: Heart |
| Spicy food | EP081 | Spicy (a gag) |
| Disguises | EP026 (Ashley), EP064 (Mr. Mime costume) | Disguised (a gag) |
| Hat stolen (Mankey) | EP025 (Mankey swipes his hat) | Capless |

---

## 6. Recurring motifs worth reusing
- **"Blasting off again"**: Team Rocket's gags are slapstick. Nobody really gets hurt.
- **Brock's cooking** brings the group together: rice balls (EP055), a whole tea table out of his backpack (EP009).
- **The videophone at the Pokémon Center** is how Ash reaches Oak and Delia.
- **Oak's honest phone verdicts** ("catch more Pokémon", "you should have trained Charizard").
- **The other two Pallet Trainers** quietly fail (EP065). It shows that "potential" alone isn't enough, and gives the game room for two named kids who come home.
- **Spearow → Fearow** (EP001 → EP081): an early action paid back at the end. The game can plant this from day one on Route 1.

---

## 7. Coverage and gaps
- **Covered in detail:** EP001–EP081 (Major events for every episode; Plot read for about 45 key episodes), M01, M02, PK01, PK04, PK02/PK03 summaries, *Mewtwo Returns* and *Legend of Thunder* (for scope), Delia's character page (the novel details).
- **Gaps / [uncertain]:**
  - The exact dub and Japanese wording of Delia's lines in M02 and of the EP001 packing list. I quote neither; the game should write its own.
  - Exact home releases of the M01 prologue.
  - Smaller middle episodes (EP040, EP042, EP048, EP049, EP053, EP057, EP060–EP062, EP069–EP072) were read only from their opening paragraphs and Major events.
  - Ash's father: one Japanese EP002 mention plus the novel. Treat as non-canon to the game unless the user wants it.
  - Whether the dub's EP001 makes Ash's age explicit (his license at 10 is explicit in the plot summary).

---

## Sources
- Bulbapedia episode pages, read through the MediaWiki API (`action=parse&prop=wikitext`): EP001–EP083, e.g. https://bulbapedia.bulbagarden.net/wiki/EP001 , https://bulbapedia.bulbagarden.net/wiki/EP005 , https://bulbapedia.bulbagarden.net/wiki/EP021 , https://bulbapedia.bulbagarden.net/wiki/EP039 , https://bulbapedia.bulbagarden.net/wiki/EP046 , https://bulbapedia.bulbagarden.net/wiki/EP050 , https://bulbapedia.bulbagarden.net/wiki/EP066 , https://bulbapedia.bulbagarden.net/wiki/EP079 , https://bulbapedia.bulbagarden.net/wiki/EP080 , https://bulbapedia.bulbagarden.net/wiki/EP081
- Films and specials: https://bulbapedia.bulbagarden.net/wiki/M01 , https://bulbapedia.bulbagarden.net/wiki/M02 , https://bulbapedia.bulbagarden.net/wiki/PK01 , https://bulbapedia.bulbagarden.net/wiki/Pikachu%27s_Rescue_Adventure , https://bulbapedia.bulbagarden.net/wiki/Pikachu%27s_Winter_Vacation , https://bulbapedia.bulbagarden.net/wiki/Mewtwo_Returns , https://bulbapedia.bulbagarden.net/wiki/The_Legend_of_Thunder!
- Characters: https://bulbapedia.bulbagarden.net/wiki/Delia_Ketchum (the Shudō novel details: age 29, Pallet House, deferred dreams), https://bulbapedia.bulbagarden.net/wiki/Ash_Ketchum , https://bulbapedia.bulbagarden.net/wiki/Ash%27s_Pikachu , https://bulbapedia.bulbagarden.net/wiki/Ash%27s_Charizard , https://bulbapedia.bulbagarden.net/wiki/Ash%27s_Butterfree , https://bulbapedia.bulbagarden.net/wiki/Ash%27s_Pidgeot , https://bulbapedia.bulbagarden.net/wiki/Ash%27s_Primeape , https://bulbapedia.bulbagarden.net/wiki/Ash%27s_Kingler , https://bulbapedia.bulbagarden.net/wiki/Ash%27s_Muk
- In-repo: `native/life/people.json`, `native/life/dialogue.json`, `native/life/lore.json`, `native/life/quests.json`, `native/life/companions.json`, `native/mime_life.gd`, `native/creature_mrmime.gd`, `native/interiors/oak_lab.json` (the desk letter).
