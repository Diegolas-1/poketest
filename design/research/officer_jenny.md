# Research: Officer Jenny

Reference for the game's Officer Jenny, who keeps the closed Viridian City gate at the top of Route 1 (`native/life/people.json` `jenny`). It sits alongside [`indigo_league.md`](indigo_league.md) and uses the same conventions: episode codes follow Bulbapedia's numbering, and anything I could not confirm is marked **[uncertain]**.

## Who she is

- **A family, not a person.** Every town in Kanto has its own Officer Jenny, and they all look the same: teal or green hair, the same face, the same uniform. In the show they are relatives (cousins and sisters), and it is a running joke that only they can tell each other apart. The Nurse Joys are the same kind of family. Both are proud of it. A Jenny will happily tell you which town each cousin serves.
- **The name.** In Japanese she is ジュンサー (*Junsā*), from 巡査 *junsa*, "police constable". "Officer Jenny" is the English dub's name for every one of them.
- **The job.** She is the town's police officer: patrols, Pokémon thieves, lost children, closed roads and the rules. She is usually the first adult a travelling Trainer meets when they reach a new town, and often the one who points them to the Pokémon Center.
- **Her partner.** The Kanto Jennys work with **Growlithe**, a loyal Fire-type police dog with a tracking nose (Growlithe appears with Officer Jenny in **EP054**, see `indigo_league.md` §2.16). Other Jennys use other Pokémon. **[uncertain: which episode first shows a Kanto Jenny's Growlithe]**
- **Her motorbike.** She rides a police motorbike and drives it fast. Viridian's Jenny gives Ash and the badly hurt Pikachu a high-speed lift through the city to the Pokémon Center. **[uncertain: whether Ash rides pillion or in a sidecar in that scene]**

## Viridian City's Jenny

- **When we meet her.** At the very start of the journey. **EP001 *Pokémon – I Choose You!*** ends with Ash, Pikachu half-conscious in his arms after the Spearow attack, running on toward Viridian City. Officer Jenny meets him at the city's edge in the next episode, **EP002 *Pokémon Emergency!*** **[uncertain: the brief asked for EP001. As far as I can tell she first appears in EP002, the direct continuation.]**
- **What she does there.** She stops a muddy, panicking ten-year-old and checks who he is (his Pokédex works as his Trainer ID). Then she takes him straight to the Pokémon Center. She warns the town that **Pokémon thieves** have been reported in the area. They turn out to be Team Rocket (Jessie, James and Meowth), who attack the Center that night.
- **Why she matters to Ash.** She is one of the first "caring adults" outside Pallet (`indigo_league.md` §2.1). She is strict and businesslike, but she drops everything the moment a Pokémon is hurt.

## Personality (what the game's writing follows)

| Trait | How it shows | In the game |
|---|---|---|
| **Earnest and dutiful** | She takes the job seriously. Rules are rules, and the public's safety comes first. | She stays at her post all day and keeps the night watch under the gate lamps. "Not past this gate. Not today." |
| **Brisk but kind** | She talks in short, efficient sentences, then shows a soft side, especially about Pokémon. | She sends Ash home at night ("That's an order. A friendly one.") and asks after Pikachu's future partner before he has one. |
| **A little stern with kids** | She checks IDs, writes things down and doesn't let children wander into danger. | She takes down "Ash Ketchum, Pallet Town" in her notebook and warns him about climbing the gate. |
| **Proud of her family** | She knows every cousin by town and is a little offended by "you all look the same". | Her cousins photo (`jenny_cousins`): she can't always tell them apart either. |
| **Comically over-serious** | She salutes, cites rules and treats small things as police matters. | "Climbing a closed gate is a violation of City Ordinance 47-B. I'd have to write you a ticket. In triplicate." |

Running gags to keep **off-screen** for now: Brock falling for every Jenny (he isn't in Pallet yet), and Team Rocket's disguises.

## The earthquake, Cinnabar and the closed road (how she fits the town's lore)

The town already has the night tremor and Cinnabar's volcano (`native/life/lore.json` `volcano_rumble`, `volcano_smoke`; `quests.json` `q_rumbles`). Jenny's account is the official version and has to agree with it:

- **The time.** Gus logged it at **1:05 in the morning, eleven seconds long**. The Viridian police station logged the same. In Pallet it was only a shiver: rattled teacups, a ship's bell ringing, a washing machine Delia blamed.
- **The cause.** Tom blames "the old mountain on Cinnabar" and Gus saw a red glow in the south. Jenny says the volcano observatory agrees: it came from deep under Cinnabar's volcano. The mountain is *restless, not angry*, so she doesn't contradict the town's calm.
- **Why the gate is shut.** Just beyond the gate, the road into Viridian runs through an old cutting. The shaking brought part of the slope down: rocks across the road, a crack in the road surface, and a family of very confused Geodude that came down with the rocks. Crews are clearing it, the surveyors check the slope every morning, and Jenny's officers are checking Route 1's bridges and ledges for damage. This matches the signs that are already in the world: the gate's "ROAD WORKS AHEAD", the notice board's "closed for repairs" and the bus stop's "service suspended while the road is under repair".
- **When it reopens.** "When the slope is declared safe. Not a minute before." The game can open the gate later as a story beat (Ash's departure, `ash_arc.md`).

## Look (the model, `web/world/cast2.js` `jenny`)

Following the reference images (full body, hands folded; and the salute): teal spiky hair flaring out at the sides and back under a tall navy police cap with a red band, a black peak and a gold winged badge; a blue short-sleeved uniform jacket with a light-blue front panel narrowing to the belt, a red pointed collar, red cuffs and breast-pocket flaps; a black strap across her body from the right shoulder to a black pouch on her left hip; a black belt with a gold buckle; a navy pencil skirt with darker side panels; white gloves; black low court shoes; brown eyes. Every garment is real geometry over the body (`garments.js`), not paint. Her stance is "hands folded in front" (`idles.gd` `STANCES.hands_front`), and she salutes (`ACTIONS.salute`) when Ash comes up or starts talking.

## Sources

- Bulbapedia: *Officer Jenny* (the character and her family), *EP001* and *EP002* (plot sections), *Growlithe (anime)*.
- The game's own research: `indigo_league.md` §2.1 (Route 1 → Viridian), §2.16, §2.20 and the caring-adults table.
