# The species layer of the Kanto 151 design, read by gen.py: TCG signature moves, TCG
# abilities as skills, anime moves, and the per-species choices (rarity, AI, focus).
#
# SIGS: card attacks from Scarlet & Violet 151 (and a few classic cards) whose names are not
# game moves, turned into energy v2 moves. Card mechanics are read in energy terms:
#   attach or search for energy -> chip_gain; draw cards or search the deck -> focus_up;
#   discard the foe's energy -> chip_drain; discard your own energy -> focus_down_self;
#   "can't retreat" -> trap; "prevent all damage" on a coin -> a reaction with chance 50;
#   "takes N less damage" -> a guard reaction; coin-flip damage (x) -> multi_hit;
#   bench damage is dropped (battles here are one on one).
# sig(dex, id, name, role, chips, cat, eff, desc, **kw)
#   role: O offense, U utility, D disruption, R reaction; chips: 1..3 or "F<n>" (a finisher)
#   kw: mtype (default: the owner's first type), typed (typed chips; default 1, finishers use
#   the owner's primary pool), cost (an explicit list), react, chance, combo, anim, acc, pri,
#   card (the card it comes from, when not the SV151 card)

SIGS = []

def sig(dex, id, name, role, chips, cat, eff, desc, **kw):
    SIGS.append(dict(dex=dex, id=id, name=name, role=role, chips=chips, cat=cat, eff=eff, desc=desc, **kw))

P, S, X = "physical", "special", "status"

sig(3, "dangerous_toxwhip", "Dangerous Toxwhip", "O", "F3", P, "poison confuse", "A venomous lash that poisons and confuses.", anim="vine")
sig(4, "blazing_destruction", "Blazing Destruction", "U", 1, X, "clear_field", "Burns the battlefield clean of traps and weather.", anim="burst")
sig(4, "steady_firebreathing", "Steady Firebreathing", "O", 1, S, "", "A steady, practiced stream of fire.", anim="flame")
sig(5, "combustion", "Combustion", "O", 1, S, "", "A sudden burst of flame.", anim="burst")
sig(6, "brave_wing", "Brave Wing", "O", 2, P, "low_hp_boost", "Beats its wings harder the more it is hurt.", mtype="flying", anim="wing")
sig(6, "explosive_vortex", "Explosive Vortex", "O", "F3", S, "focus_down_self", "A vortex of fire that burns up its own focus.", anim="fire_ring")
sig(8, "free_diving", "Free Diving", "U", 1, X, "chip_gain", "Dives to gather itself: gains a Water chip now.", anim="dive")
sig(8, "spinning_attack", "Spinning Attack", "O", 2, P, "", "Spins in its shell into the foe.", anim="spin")
sig(9, "twin_cannons", "Twin Cannons", "O", "F2", S, "multi_hit", "Both cannons fire, one blast for every chip.", anim="spray")
sig(10, "leaf_munch", "Leaf Munch", "O", "F1", P, "bonus_vs_type", "Munches hungrily; more damage to a Grass foe.", bonus_type="grass", anim="bite")
sig(11, "defensive_posture", "Defensive Posture", "R", 2, X, "", "Hardens up; on a coin flip it takes no damage at all.", react="protect", chance=50, mtype="normal", anim="shell")
sig(12, "bye_bye_flight", "Bye-Bye Flight", "D", 2, X, "force_out", "Carries the foe off on the wind and flutters away.", mtype="flying", anim="wind")
sig(13, "ram", "Ram", "O", 1, P, "", "A head-on ram.", mtype="normal", anim="tackle")
sig(14, "zzzt", "Zzzt", "O", 2, S, "", "A buzzing jolt from inside the cocoon.", anim="spark")
sig(15, "nadir_needle", "Nadir Needle", "O", 2, P, "para poison", "A low dive with a needle that can paralyse and poison.", anim="needle")
sig(15, "pierce", "Pierce", "O", "F2", P, "", "Drills in with both stingers.", anim="needle")
sig(16, "call_for_family", "Call for Family", "U", 1, X, "focus_up", "Calls to its flock, steadying its focus.", mtype="normal", anim="sound")
sig(17, "flap", "Flap", "O", 1, P, "wind", "Beats its wings in the foe's face.", mtype="flying", anim="wing")
sig(19, "gnaw_the_wound", "Gnaw the Wound", "O", 2, P, "bonus_vs_damaged", "Gnaws at a wound; more damage to a hurt foe.", anim="bite")
sig(20, "second_bite", "Second Bite", "O", 2, P, "bonus_vs_damaged", "Bites the same wound again, harder.", anim="bite")
sig(21, "speed_dive", "Speed Dive", "O", 1, P, "", "A fast diving peck.", pri=1, mtype="flying", anim="dive_strike")
sig(22, "beak_catch", "Beak Catch", "U", 1, X, "chip_gain", "Snatches up what it needs: gains a chip now.", mtype="flying", anim="peck")
sig(23, "bind_down", "Bind Down", "O", 2, P, "trap", "Pins the foe down so it can't get away.", anim="wrap")
sig(24, "menacing_fangs", "Menacing Fangs", "O", "F3", P, "chip_drain", "Fangs bared so menacingly the foe drops a chip.", anim="bite")
sig(25, "pika_punch", "Pika Punch", "O", 2, P, "", "A sparking little punch.", anim="punch")
sig(25, "thunder_jolt", "Thunder Jolt", "O", 2, S, "recoil", "A big jolt; on a bad coin flip it shocks itself too.", chance=50, card="Base Set Pikachu", anim="bolt")
sig(28, "rumble", "Rumble", "O", 1, P, "trap", "Shakes the ground so the foe can't flee.", anim="quake")
sig(28, "spike_rend", "Spike Rend", "O", "F2", P, "bonus_vs_damaged", "Rends with its spikes; brutal on a wounded foe.", anim="slash")
sig(29, "poison_horn", "Poison Horn", "O", 2, P, "poison", "A toxic horn jab that always poisons.", anim="horn")
sig(30, "fetch_family", "Fetch Family", "U", 1, X, "focus_up", "Calls its family close: focus up.", mtype="normal", anim="sound")
sig(30, "sharp_fang", "Sharp Fang", "O", 2, P, "", "Sinks in its sharp fangs.", anim="bite")
sig(31, "queen_press", "Queen Press", "O", 2, P, "def_up", "A crushing press; it braces for the counterblow.", anim="slam")
sig(31, "lunge_out", "Lunge Out", "O", "F3", P, "", "A full-weight lunge.", anim="tackle")
sig(33, "superpowered_horns", "Superpowered Horns", "O", 3, P, "", "Horns charged with raw power.", typed=2, anim="horn")
sig(34, "venomous_impact", "Venomous Impact", "O", "F3", P, "poison", "A poisonous body blow with everything behind it.", anim="slam")
sig(35, "moon_viewing_invitation", "Moon-Viewing Invitation", "U", 1, X, "focus_up", "Dances under the moon: focus up.", anim="moon")
sig(35, "smack", "Smack", "O", 2, P, "", "A cheerful smack.", mtype="normal", anim="slap")
sig(36, "more_moon", "More Moon", "O", "F3", S, "", "Moonlight focused into a finishing blow.", anim="moon")
sig(37, "super_singe", "Super Singe", "O", 2, S, "burn", "Scorching flames; a coin flip says if they burn.", chance=50, anim="flame")
sig(38, "mirrored_flames", "Mirrored Flames", "O", 2, S, "bonus_if_matched", "Flames that mirror the foe; far stronger when their chips match.", anim="flame")
sig(39, "lead", "Lead", "U", 1, X, "focus_up", "Takes the lead with a song in its heart: focus up.", mtype="normal", anim="sound")
sig(39, "stompy_stomp", "Stompy Stomp", "O", 2, P, "multi_hit", "Two stomps, each on a coin flip.", mtype="normal", anim="stomp")
sig(40, "friend_tackle", "Friend Tackle", "O", 3, P, "", "A tackle full of friendship; stronger right after a support move.", mtype="normal",
    combo={"after_role": "utility", "effect": "power"}, anim="tackle")
sig(42, "skill_dive", "Skill Dive", "O", 1, P, "ignores_resistance", "Picks its spot and dives; ignores resistance.", mtype="flying", anim="dive_strike")
sig(44, "drool", "Drool", "O", 2, S, "", "Drips sticky, smelly nectar on the foe.", anim="sludge")
sig(46, "stampede", "Stampede", "O", 1, P, "", "A scuttling charge.", anim="tackle")
sig(46, "spore_ball", "Spore Ball", "O", 2, S, "sleep", "A puff of spores that puts the foe to sleep.", anim="powder")
sig(47, "spread_filaments", "Spread Filaments", "U", 1, X, "focus_up", "Spreads mushroom threads to draw strength.", chance=50, anim="powder")
sig(47, "claw_slash", "Claw Slash", "O", 2, P, "", "Slashes with its claws.", mtype="normal", anim="slash")
sig(48, "gnaw", "Gnaw", "O", 1, P, "", "Gnaws with tiny jaws.", anim="bite")
sig(48, "beam", "Beam", "O", 2, S, "", "A beam from its big eyes.", anim="beam")
sig(49, "perplexing_powder", "Perplexing Powder", "O", 1, S, "confuse", "A powder that leaves the foe confused.", anim="powder")
sig(49, "speed_wing", "Speed Wing", "O", 3, P, "", "A blindingly fast wing strike.", anim="wing")
sig(50, "headbutt_bounce", "Headbutt Bounce", "O", 1, P, "", "Pops up and headbutts.", anim="headbutt")
sig(52, "come_here_right_meow", "Come Here Right Meow", "D", 1, X, "trap", "A sly call that draws the foe in; it can't get away.", chance=50, mtype="normal", anim="sound")
sig(52, "dig_claws", "Dig Claws", "O", 2, P, "", "Digs its claws in.", mtype="normal", anim="scratch")
sig(54, "overthink", "Overthink", "D", 1, X, "acc_down", "Overthinks until the foe's luck turns bad.", mtype="psychic", anim="psywave")
sig(55, "aquatic_rescue", "Aquatic Rescue", "U", 1, X, "heal", "Dives to safety and recovers a little.", anim="dive")
sig(55, "super_splash", "Super Splash", "O", 3, S, "", "A huge splash of water.", typed=2, anim="splash")
sig(57, "rant_and_rave", "Rant and Rave", "O", 1, P, "confuse_self", "Rages so hard it confuses itself.", anim="rampage")
sig(57, "raging_smash", "Raging Smash", "O", "F2", P, "self_confused_only", "A smash only a confused rage can throw.",
    combo={"after": ["rant_and_rave", "thrash", "outrage"], "effect": "enables"}, anim="punch")
sig(58, "vaporize", "Vaporize", "O", 1, S, "chip_drain", "Steams away one of the foe's chips.", anim="flame")
sig(59, "torrid_torrent", "Torrid Torrent", "O", 1, S, "chip_gain", "A torrent of heat that stokes its own fire.", anim="flame")
sig(59, "dynamite_fang", "Dynamite Fang", "O", "F3", P, "focus_down_self", "Fangs that explode on contact.", anim="bite")
sig(61, "wave_splash", "Wave Splash", "O", 1, S, "", "Splashes a wave at the foe.", anim="splash")
sig(61, "frog_hop", "Frog Hop", "O", 2, P, "coin_bonus", "A hop that hits much harder on a coin flip.", anim="bounce")
sig(62, "heroic_punch", "Heroic Punch", "O", "F2", P, "coin_bonus", "A heroic punch; on a coin flip, devastating.", mtype="fighting", anim="punch")
sig(63, "psyshot", "Psyshot", "O", 1, S, "", "A shot of psychic power.", anim="psywave")
sig(64, "teleportation_attack", "Teleportation Attack", "O", 1, S, "evasion_up", "Strikes, then teleports out of reach.", anim="teleport")
sig(65, "mind_jack", "Mind Jack", "O", 2, S, "bonus_per_foe_chip", "Hijacks the foe's mind; stronger for every chip it holds.", anim="psywave")
sig(65, "dimensional_hand", "Dimensional Hand", "O", 2, S, "", "A hand that reaches through space, wherever the foe hides.", hits="underground airborne underwater", anim="psywave")
sig(66, "mountain_mashing", "Mountain Mashing", "D", 1, X, "", "Mashes the mountainside, breaking the foe's focus.", anim="quake")
sig(66, "punch", "Punch", "O", 2, P, "", "A solid punch.", anim="punch")
sig(67, "mountain_ramming", "Mountain Ramming", "O", 2, P, "focus_drain", "Rams like a landslide; the foe's focus crumbles.", anim="tackle")
sig(68, "mountain_chopping", "Mountain Chopping", "O", 3, P, "focus_drain", "Chops that split the mountain and the foe's focus.", anim="chop")
sig(70, "spray_fluid", "Spray Fluid", "O", 2, S, "", "Sprays a sticky fluid.", anim="spray")
sig(71, "slow_acting_acid", "Slow-Acting Acid", "O", 2, S, "delayed_damage", "Acid that keeps eating in after the turn ends.", anim="sludge")
sig(72, "tingle", "Tingle", "O", 1, S, "", "A tingling sting.", anim="needle")
sig(72, "watering", "Watering", "O", 2, S, "", "A shower of water.", anim="spray")
sig(73, "poisonous_whip", "Poisonous Whip", "O", 2, P, "poison", "A tentacle whip that always poisons.", mtype="poison", anim="vine")
sig(73, "tentacular_panic", "Tentacular Panic", "O", "F2", P, "multi_hit confuse", "Tentacles everywhere; a hit for every chip, and confusion.", anim="wrap")
sig(74, "stiffen", "Stiffen", "R", 1, X, "", "Stiffens: the next hit does much less.", react="guard", mtype="rock", anim="shell")
sig(74, "knuckle_punch", "Knuckle Punch", "O", 2, P, "", "Punches with rocky knuckles.", anim="punch")
sig(75, "rock_cannon", "Rock Cannon", "O", 1, P, "multi_hit", "Fires rocks until a coin comes up tails.", anim="rock")
sig(75, "heavy_impact", "Heavy Impact", "O", 3, P, "", "Drops its whole rocky weight.", anim="slam")
sig(76, "dynamic_roll", "Dynamic Roll", "O", 1, P, "", "Rolls in; its next attack hits far harder.",
    combo={"before": "any_offense", "effect": "power"}, anim="roll")
sig(76, "rock_blaster", "Rock Blaster", "O", "F3", P, "ignores_resistance", "A blast of rock nothing can resist.", anim="rock")
sig(77, "collect", "Collect", "U", 1, X, "focus_up", "Gathers itself: focus up.", mtype="normal", anim="focus")
sig(77, "flop", "Flop", "O", 2, P, "", "Flops onto the foe.", anim="slam")
sig(78, "singe", "Singe", "U", 1, X, "burn", "Hot breath that always burns.", anim="flame")
sig(78, "mach_turn", "Mach Turn", "O", 3, P, "speed_up", "A blazing turn at full gallop.", anim="dash")
sig(79, "sea_bathing", "Sea Bathing", "U", 1, X, "heal cure_status", "A soak in the sea: heals and cures its conditions.", mtype="water", anim="splash")
sig(80, "big_yawn", "Big Yawn", "D", 2, X, "sleep sleep_self", "A yawn so big both of them nod off.", anim="yawn")
sig(80, "laid_back_tackle", "Laid-Back Tackle", "O", "F2", P, "", "A lazy, unstoppable tackle.", anim="tackle")
sig(81, "tiny_charge", "Tiny Charge", "O", 1, S, "", "A tiny spark.", anim="spark")
sig(81, "big_explosion", "Big Explosion", "O", 2, S, "recoil", "Blows up a little, hurting itself too.", anim="explode")
sig(82, "junk_magnet", "Junk Magnet", "U", 1, X, "chip_gain", "Pulls in scrap metal: gains a chip now.", anim="orb")
sig(82, "head_bolt", "Head Bolt", "O", 3, P, "", "Charges with an electrified head.", anim="headbutt")
sig(83, "package_deal", "Package Deal", "U", 1, X, "focus_up", "Gets everything it needs at once: focus up.", anim="focus")
sig(83, "leek_clobber", "Leek Clobber", "O", 1, P, "", "Clobbers the foe with its leek.", anim="slash")
sig(84, "reckless_charge", "Reckless Charge", "O", 1, P, "recoil", "A reckless charge that hurts it a little too.", anim="dash")
sig(85, "ballistic_beak", "Ballistic Beak", "O", "F1", P, "low_hp_boost", "Three beaks, harder the more it is hurt.", anim="peck")
sig(86, "chilly", "Chilly", "O", 1, S, "", "A chilly breath.", mtype="ice", anim="snow")
sig(87, "dual_splash", "Dual Splash", "O", 2, S, "", "Two splashes at once.", anim="splash")
sig(88, "gummy_press", "Gummy Press", "O", 1, P, "trap", "A gummy squish that sticks the foe in place.", anim="melt")
sig(89, "sticky_jail", "Sticky Jail", "O", 1, P, "foe_cost_up", "Sludge that makes every foe move cost a chip more next turn.", anim="melt")
sig(90, "shell_press", "Shell Press", "O", 2, P, "def_up", "Presses with its shell; braces as it does.", anim="shell")
sig(91, "protect_charge", "Protect Charge", "O", 2, P, "def_up_big", "Charges behind its shell; braced hard for the reply.", anim="shell")
sig(92, "suffocating_gas", "Suffocating Gas", "O", 1, S, "", "A choking cloud of gas.", mtype="ghost", anim="smoke")
sig(93, "mumble", "Mumble", "O", 2, S, "", "Mumbles a curse.", mtype="ghost", anim="shadow")
sig(94, "hollow_dive", "Hollow Dive", "O", 3, S, "", "Dives through the foe from the shadows.", mtype="ghost", anim="shadow")
sig(95, "thumpalanche", "Thumpalanche", "O", 2, P, "multi_hit", "Rocks thump down in a pile.", anim="rock")
sig(97, "super_psy_bolt", "Super Psy Bolt", "O", 3, S, "", "A bolt of pure psychic power.", anim="psywave")
sig(98, "salt_water", "Salt Water", "U", 1, X, "chip_gain", "A splash of sea water: on a coin flip, gains a chip.", chance=50, anim="splash")
sig(100, "tumbling_attack", "Tumbling Attack", "O", 1, P, "coin_bonus", "Tumbles in; harder on a coin flip.", anim="roll")
sig(101, "bang_boom_chain", "Bang Boom Chain", "O", "F1", S, "power_grows", "Explosion after explosion, one for every chip.", anim="explode")
sig(102, "ball_roll", "Ball Roll", "O", 2, P, "multi_hit", "Rolls over the foe again and again.", anim="roll")
sig(103, "hammer_in", "Hammer In", "O", 3, P, "", "Hammers the foe with its heads.", anim="headbutt")
sig(104, "hit_twice", "Hit Twice", "O", 1, P, "multi_hit", "Two bone whacks, each on a coin flip.", anim="bone")
sig(105, "bone_throw", "Bone Throw", "O", 1, P, "", "Throws its bone.", anim="bone")
sig(105, "boundless_power", "Boundless Power", "O", 2, P, "recharge", "A blow of boundless power; then it must rest.", anim="bone")
sig(106, "twister_kick", "Twister Kick", "O", 1, P, "evasion_up", "Spins and kicks, then springs away.", anim="kick")
sig(107, "excited_punch", "Excited Punch", "O", 2, P, "power_grows", "Gets more excited every time it lands.", anim="punch")
sig(108, "tongue_tied", "Tongue-Tied", "O", 3, P, "seal", "Ties up the foe so it can't attack next turn.", anim="tongue")
sig(109, "suspicious_gas", "Suspicious Gas", "O", 2, S, "confuse", "A strange gas that confuses.", anim="smoke")
sig(110, "spinning_fumes", "Spinning Fumes", "O", 2, S, "", "Spins out a cloud of fumes.", anim="smoke")
sig(111, "push_down", "Push Down", "O", 2, P, "force_out", "Shoves the foe right out of the fight.", anim="tackle")
sig(111, "boulder_crush", "Boulder Crush", "O", 3, P, "", "Crushes like a falling boulder.", anim="rock")
sig(112, "wrack_down", "Wrack Down", "O", 2, P, "", "Slams the foe down.", anim="slam")
sig(112, "charismatic_drill", "Charismatic Drill", "O", "F3", P, "", "A drilling horn with star presence.", anim="horn")
sig(113, "gentle_slap", "Gentle Slap", "O", 3, P, "", "A surprisingly heavy, gentle slap.", mtype="normal", anim="slap")
sig(114, "tactful_tangling", "Tactful Tangling", "O", 1, P, "trap", "Vines tangle the foe up.", anim="vine")
sig(115, "triple_draw", "Triple Draw", "U", 1, X, "focus_up", "Gathers itself three times over: focus up.", anim="focus")
sig(115, "incessant_punching", "Incessant Punching", "O", "F3", P, "multi_hit", "Mother and baby punch, a hit for every chip.", anim="punch")
sig(116, "rain_splash", "Rain Splash", "O", 1, S, "", "Splashes water like rain.", anim="splash")
sig(116, "sharp_fin", "Sharp Fin", "O", 3, P, "", "Slices with a sharp fin.", anim="slash")
sig(117, "blinding_ink", "Blinding Ink", "O", 3, S, "acc_down_big", "Ink in the eyes: the foe's next attacks often miss.", anim="spray")
sig(118, "triple_strike", "Triple Strike", "O", 1, P, "multi_hit", "Three horn jabs, each on a coin flip.", anim="horn")
sig(118, "sprinkle_water", "Sprinkle Water", "O", 2, S, "", "Sprinkles water hard.", anim="spray")
sig(119, "swim_freely", "Swim Freely", "R", 1, X, "", "Swims free; on a coin flip it slips past the next attack.", react="dodge", chance=50, anim="dive")
sig(119, "aqua_horn", "Aqua Horn", "O", 3, P, "bonus_per_own_pool", "A horn charged by every Water chip it holds.", anim="horn")
sig(121, "speed_attack", "Speed Attack", "O", 2, P, "", "Spins in at blinding speed.", anim="spin")
sig(122, "psypower", "Psypower", "O", 1, S, "never_miss", "Places psychic damage wherever it likes.", anim="psywave")
sig(123, "helpful_slash", "Helpful Slash", "O", 1, P, "chip_gain", "A slash that leaves it charged up.", anim="slash")
sig(123, "slicing_blade", "Slicing Blade", "O", 3, P, "", "Slices with its scythes.", anim="slash")
sig(124, "heart_stopping_kiss", "Heart-Stopping Kiss", "O", 3, S, "ohko sleep_only", "A kiss that knocks out a sleeping foe.",
    combo={"after": ["lovely_kiss", "sing", "hypnosis", "sleep_powder", "spore", "yawn"], "effect": "enables"}, mtype="psychic", typed=1, anim="kiss")
sig(125, "electro_combo", "Electro Combo", "O", 1, S, "", "Sparks fly; a big combo after any Fire move.", combo={"after_type": "fire", "effect": "power"}, anim="spark")
sig(125, "light_punch", "Light Punch", "O", 2, P, "", "A light electric punch.", anim="punch")
sig(126, "live_coal", "Live Coal", "O", 1, S, "", "Spits a live coal.", anim="flame")
sig(126, "flare_combo", "Flare Combo", "O", 3, S, "", "A blazing combo, far stronger after any Lightning move.", combo={"after_type": "electric", "effect": "power"}, anim="burst")
sig(127, "reckless_throw", "Reckless Throw", "O", 3, P, "low_hp_boost", "A desperate throw; stronger when it is behind.", anim="throw")
sig(128, "gather_the_crew", "Gather the Crew", "U", 1, X, "focus_up", "Bellows for the herd: focus up.", mtype="normal", anim="roar")
sig(129, "splashy_splash", "Splashy Splash", "U", 1, X, "focus_up", "Splashes until a coin comes up tails, steadying itself.", chance=50, anim="splash")
sig(131, "hop_on_my_back", "Hop on My Back", "U", 1, X, "focus_up", "Offers a ride across the water: focus up.", anim="splash")
sig(131, "aqua_edge", "Aqua Edge", "O", 3, P, "", "A cutting edge of water.", anim="slash")
sig(132, "splup", "Splup", "O", 1, S, "", "Splats the foe with goo.", anim="melt")
sig(133, "colorful_friends", "Colorful Friends", "U", 1, X, "chip_gain_any", "Calls on friends of every type: a chip for any pool.", anim="sound")
sig(133, "skip", "Skip", "O", 1, P, "", "Skips in and bumps the foe.", anim="dash")
sig(134, "spiral_drain", "Spiral Drain", "O", 1, S, "drain", "A spiral of water that heals it.", anim="whirlpool")
sig(134, "fighting_whirlpool", "Fighting Whirlpool", "O", 3, S, "bonus_vs_rarer", "A fighting whirlpool; harder against a rarer foe.", anim="whirlpool")
sig(135, "linear_attack", "Linear Attack", "O", 1, S, "never_miss", "A straight-line bolt that never misses.", anim="bolt")
sig(135, "fighting_lightning", "Fighting Lightning", "O", 3, S, "bonus_vs_rarer", "Fighting lightning; harder against a rarer foe.", anim="bolt")
sig(136, "destructive_flame", "Destructive Flame", "O", 1, S, "chip_drain", "Flames that may burn away a foe chip.", chance=50, anim="flame")
sig(136, "fighting_blaze", "Fighting Blaze", "O", 3, S, "bonus_vs_rarer", "A fighting blaze; harder against a rarer foe.", anim="burst")
sig(137, "conversion_4", "Conversion 4", "D", 1, X, "set_weakness", "Rewrites the foe's weakness to a type of its choosing.", anim="glitch")
sig(138, "tentacular_return", "Tentacular Return", "O", 2, P, "chip_drain", "Tentacles pluck away one of the foe's chips.", anim="wrap")
sig(139, "aqua_split", "Aqua Split", "O", 2, S, "", "Water split into stinging jets.", anim="spray")
sig(140, "double_scratch", "Double Scratch", "O", 2, P, "multi_hit", "Two scratches, each on a coin flip.", anim="scratch")
sig(141, "draining_blade", "Draining Blade", "O", 3, P, "drain", "Scythes that drain the foe.", anim="slash")
sig(142, "glide", "Glide", "O", 1, P, "", "Glides in and strikes.", mtype="flying", anim="wing")
sig(142, "devolution_ray", "Devolution Ray", "O", 2, S, "cleanse_foe", "An ancient ray that strips the foe's boosts.", anim="beam")
sig(143, "thudding_press", "Thudding Press", "O", 3, P, "recoil", "Lands with a thud that shakes them both.", anim="slam")
sig(145, "multishot_lightning", "Multishot Lightning", "O", "F3", S, "", "Lightning strikes again and again.", hits="airborne", anim="bolt_sky")
sig(145, "thunderstorm", "Thunderstorm", "O", "F2", S, "multi_hit recoil", "Calls a storm; bolts strike for every chip.", card="Fossil Zapdos", anim="bolt_sky")
sig(146, "blazing_flight", "Blazing Flight", "O", "F3", S, "focus_down_self", "Flies through the foe in a blaze.", mtype="fire", anim="fly")
sig(146, "wildfire", "Wildfire", "O", "F1", S, "chip_drain", "A wildfire that burns away the foe's chips.", card="Fossil Moltres", anim="fire_ring")
sig(146, "dive_bomb", "Dive Bomb", "O", 3, S, "", "Dives in a ball of flame; it may miss.", acc=75, card="Fossil Moltres", anim="dive_strike")
sig(144, "ice_wing", "Freezing Wing", "O", 2, S, "freeze wind", "A frozen beat of its great wings.", card="design, after Articuno's cards", mtype="ice", anim="wing")
sig(147, "beat", "Beat", "O", 1, P, "", "Beats the foe with its tail.", anim="tail")
sig(147, "draconic_whip", "Draconic Whip", "O", 2, P, "", "A whip of its dragon tail, crackling with water and lightning.", anim="tail")
sig(148, "aqua_slash", "Aqua Slash", "O", 2, P, "recharge", "A slash of water and lightning; then it must rest.", anim="slash")
sig(149, "jet_cruise", "Jet Cruise", "U", 1, X, "speed_up focus_up", "Cruises up to speed: speed and focus up.", mtype="flying", anim="fly")
sig(150, "reflective_barrier", "Reflective Barrier", "R", 2, S, "", "A barrier that turns the next attack's damage back.", react="counter_any", anim="barrier")
sig(150, "psyslash", "Psyslash", "O", "F3", P, "focus_down_self", "A psychic blade that spends its focus.", anim="slash")
sig(151, "genome_hacking", "Genome Hacking", "U", 3, X, "copy_move", "Reads the foe's genes and uses one of its moves.", anim="glitch")
sig(151, "restart", "Restart", "U", 1, X, "focus_up chip_gain", "Starts afresh: focus up and a chip now.", anim="glow", card="Mew ex ability")

# SKILLS: card abilities as passive skills (the engine applies their tags; numbers are in the balance file)
SKILLS = {
    "tranquil_flower": (3, "Tranquil Flower", "heal_per_turn", "Its flower heals it a little every turn."),
    "solid_shell": (9, "Solid Shell", "damage_reduce", "Takes less damage from every attack."),
    "cocoon_cover": (14, "Cocoon Cover", "effect_immune", "Its cocoon blocks every effect of attacks (not the damage)."),
    "evolutionary_advantage": (21, "Evolutionary Advantage", "focus_start", "Starts the battle a little more focused."),
    "electrical_grounding": (26, "Electrical Grounding", "chip_on_faint", "When a teammate faints, it keeps a Lightning chip."),
    "sand_screen": (27, "Sand Screen", "acc_down_aura", "Sand swirls around it: foes are a little less accurate."),
    "enthusiastic_king": (34, "Enthusiastic King", "partner_cost_discount", "With Nidoqueen beside it, its moves cost a typed chip less."),
    "expanding_body": (40, "Expanding Body", "hp_up", "Puffs up: more HP."),
    "revealing_echo": (41, "Revealing Echo", "reveal_plan", "Its echoes reveal the foe's planned moves."),
    "semi_blooming_energy": (44, "Semi-Blooming Energy", "chip_on_evolve", "When it evolves, it gains a Grass chip."),
    "fully_blooming_energy": (45, "Fully Blooming Energy", "chip_on_evolve", "When it evolves, it gains Grass chips."),
    "rocket_call": (53, "Rocket Call", "focus_start", "Team Rocket's favourite: starts focused."),
    "guts": (68, "Guts", "endure_chance", "May hang on at 1 HP from a knockout blow."),
    "spirit_return": (93, "Spirit Return", "focus_start", "Returns from the beyond already focused."),
    "here_for_hypnosis": (97, "Here for Hypnosis", "sleep_on_evolve", "When it evolves, the foe falls asleep."),
    "cheering_bone": (104, "Cheering Bone", "partner_power", "Cheers on Marowak: its attacks hit harder."),
    "counterattack": (107, "Counterattack", "counter_on_hit", "When hit, it hits right back a little."),
    "lets_have_a_blast": (110, "Let's Have a Blast", "faint_blast", "When knocked out, it may blow up the foe."),
    "lucky_bonus": (113, "Lucky Bonus", "luck_up", "Coin flips go its way a little more often."),
    "untamed_one": (130, "Untamed One", "focus_gain_up", "Its rage builds focus faster."),
    "mysterious_comet": (121, "Mysterious Comet", "start_damage", "A comet strikes the foe as the battle opens."),
    "mimic_barrier": (122, "Mimic Barrier", "protect_if_matched", "When its chips match the foe's, attacks can't hurt it."),
    "transformative_start": (132, "Transformative Start", "transform_start", "Can transform on its first turn for free."),
    "ancient_way": (141, "Ancient Way", "weakness_bonus", "Exploits weakness even harder."),
    "voraciousness": (143, "Voraciousness", "heal_from_food", "Leftovers and food heal it more."),
    "ice_float": (144, "Ice Float", "free_retreat", "Floats on the cold air: can always disengage."),
    "voltaic_float": (145, "Voltaic Float", "free_retreat", "Floats on the charged air: can always disengage."),
    "flare_float": (146, "Flare Float", "free_retreat", "Floats on the hot air: can always disengage."),
    "jet_cruise_skill": (149, "Jet Cruise", "speed_aura", "Flies so fast it rarely gets caught."),
    "restart_skill": (151, "Restart", "focus_start", "Restarts: begins every battle focused."),
}

# rarity: the card rarity sets the base (Common, Uncommon, Rare; Double Rare ex cards count as rare);
# these in-world overrides blend in where a species is found (starters and fossils are rare, etc.)
RARITY_OVERRIDE = {
    "bulbasaur": "rare", "ivysaur": "rare", "venusaur": "rare", "charmander": "rare", "charmeleon": "rare",
    "charizard": "rare", "squirtle": "rare", "wartortle": "rare", "blastoise": "rare",
    "pikachu": "uncommon", "beedrill": "uncommon", "arbok": "uncommon", "wigglytuff": "uncommon",
    "nidoqueen": "rare", "dodrio": "uncommon", "electrode": "uncommon", "weezing": "uncommon",
    "arcanine": "rare", "scyther": "rare", "porygon": "rare", "hitmonlee": "rare", "hitmonchan": "rare",
    "lickitung": "uncommon", "farfetchd": "uncommon", "electabuzz": "uncommon", "magmar": "uncommon",
    "eevee": "rare", "omanyte": "rare", "omastar": "rare", "kabuto": "rare", "kabutops": "rare", "aerodactyl": "rare",
    "dratini": "very_rare", "dragonair": "very_rare", "dragonite": "very_rare", "lapras": "very_rare", "snorlax": "very_rare",
    "articuno": "legendary", "zapdos": "legendary", "moltres": "legendary", "mewtwo": "legendary", "mew": "legendary",
    "chansey": "rare", "kangaskhan": "rare", "tauros": "uncommon", "ditto": "rare", "jynx": "rare", "mr_mime": "rare",
}

# AI style (aggressive | strategic | evasive), where the stat-based default doesn't fit
AI = {
    "pidgey": "strategic", "pikachu": "aggressive", "squirtle": "strategic", "charmander": "aggressive",
    "bulbasaur": "strategic", "jigglypuff": "strategic", "meowth": "evasive", "abra": "evasive",
    "gastly": "evasive", "haunter": "evasive", "gengar": "strategic", "mr_mime": "strategic", "ditto": "strategic",
    "snorlax": "aggressive", "lapras": "strategic", "gyarados": "aggressive", "magikarp": "evasive",
    "mewtwo": "aggressive", "mew": "evasive", "primeape": "aggressive", "mankey": "aggressive", "tauros": "aggressive",
    "slowpoke": "strategic", "slowbro": "strategic", "psyduck": "strategic", "metapod": "strategic", "kakuna": "strategic",
    "chansey": "strategic", "scyther": "aggressive", "hitmonlee": "aggressive", "hitmonchan": "strategic",
    "butterfree": "strategic", "venomoth": "strategic", "dragonite": "strategic", "farfetchd": "strategic",
    "rattata": "evasive", "spearow": "aggressive", "ekans": "strategic", "arbok": "strategic", "zubat": "evasive",
}

# focus personality overrides (on top of the energy-class default; the rarity bonus is added after)
FOCUS = {
    "snorlax": {"gain": 6, "max_chips": 6, "resist": 0.35, "chip_every": 16},
    "slowpoke": {"gain": 7, "resist": 0.4}, "slowbro": {"gain": 7, "resist": 0.45},
    "psyduck": {"gain": 8, "resist": 0.2}, "golduck": {"gain": 12},
    "magikarp": {"gain": 8}, "gyarados": {"gain": 12, "resist": 0.2},
    "metapod": {"gain": 8, "resist": 0.3}, "kakuna": {"gain": 8, "resist": 0.3},
    "abra": {"gain": 14}, "kadabra": {"gain": 14}, "alakazam": {"gain": 15, "resist": 0.35},
    "mewtwo": {"gain": 15, "start": 20, "resist": 0.4}, "mew": {"gain": 14, "start": 10, "resist": 0.35},
    "articuno": {"start": 10, "resist": 0.3}, "zapdos": {"start": 10, "resist": 0.3, "gain": 12}, "moltres": {"start": 10, "resist": 0.3},
    "mankey": {"gain": 12, "resist": 0.0}, "primeape": {"gain": 13, "resist": 0.0},
    "lapras": {"resist": 0.3}, "dragonite": {"resist": 0.3}, "chansey": {"resist": 0.3},
    "tauros": {"gain": 11}, "onix": {"gain": 8, "resist": 0.3}, "geodude": {"gain": 9, "resist": 0.2},
    "machop": {"resist": 0.2}, "hitmonchan": {"resist": 0.25}, "hitmonlee": {"gain": 12},
    "ditto": {"gain": 10, "resist": 0.0}, "porygon": {"gain": 11},
    "jigglypuff": {"gain": 9}, "drowzee": {"gain": 12}, "hypno": {"gain": 13, "resist": 0.3},
    "electrode": {"gain": 13}, "voltorb": {"gain": 12}, "jolteon": {"gain": 13},
}

# Indigo League anime moves: flagged on the learnset row (added if the species can't learn it)
ANIME = {
    "pikachu": "thunder_shock thunderbolt quick_attack agility thunder tackle tail_whip",
    "raichu": "thunderbolt thunder mega_punch mega_kick body_slam seismic_toss",
    "charmander": "ember scratch flamethrower fire_spin tail_whip", "charmeleon": "flamethrower fire_spin rage",
    "charizard": "flamethrower fire_spin fly seismic_toss slash",
    "squirtle": "water_gun bubble tackle withdraw skull_bash hydro_pump", "wartortle": "water_gun bite",
    "bulbasaur": "vine_whip tackle razor_leaf leech_seed solar_beam sleep_powder", "ivysaur": "vine_whip razor_leaf",
    "pidgeotto": "gust quick_attack sand_attack whirlwind wing_attack tackle", "pidgeot": "gust quick_attack wing_attack",
    "butterfree": "tackle stun_spore sleep_powder poison_powder psybeam confusion gust whirlwind",
    "caterpie": "tackle string_shot", "metapod": "harden tackle",
    "krabby": "bubble vice_grip crabhammer", "kingler": "crabhammer bubble vice_grip stomp",
    "muk": "body_slam sludge", "tauros": "horn_attack take_down tackle", "primeape": "karate_chop low_kick",
    "haunter": "lick hypnosis night_shade", "gastly": "lick night_shade confuse_ray", "gengar": "lick hypnosis night_shade",
    "staryu": "water_gun tackle swift", "starmie": "swift water_gun tackle hydro_pump",
    "psyduck": "disable confusion water_gun scratch", "onix": "bind tackle rock_throw screech harden",
    "geodude": "tackle rock_throw defense_curl", "jigglypuff": "sing pound double_slap",
    "meowth": "fury_swipes pay_day bite scratch", "ekans": "poison_sting bite wrap", "arbok": "poison_sting bite wrap glare",
    "koffing": "smokescreen sludge tackle poison_gas", "weezing": "smokescreen sludge tackle self_destruct",
    "lapras": "ice_beam water_gun surf sing body_slam", "snorlax": "rest body_slam headbutt",
    "gyarados": "hyper_beam dragon_rage twister bite", "mewtwo": "psychic shadow_ball barrier recover",
    "mew": "psychic transform", "abra": "teleport", "kadabra": "psybeam psychic reflect recover teleport",
    "alakazam": "psychic recover psybeam", "electabuzz": "thunder_punch thunderbolt",
    "voltorb": "self_destruct explosion tackle", "electrode": "self_destruct explosion",
    "hitmonlee": "high_jump_kick mega_kick rolling_kick double_kick", "hitmonchan": "comet_punch mega_punch thunder_punch fire_punch ice_punch counter",
    "scyther": "slash double_team swords_dance quick_attack cut", "pinsir": "vice_grip seismic_toss",
    "nidorino": "double_kick horn_attack", "vulpix": "ember flamethrower quick_attack",
    "growlithe": "ember flamethrower roar take_down", "rapidash": "stomp take_down agility", "ponyta": "ember stomp",
    "zubat": "supersonic leech_life", "golbat": "supersonic leech_life wing_attack",
    "seel": "headbutt aurora_beam", "dewgong": "headbutt aurora_beam ice_beam",
    "cubone": "bone_club bonemerang headbutt", "marowak": "bone_club bonemerang",
    "mr_mime": "barrier reflect light_screen psybeam double_slap confusion", "jynx": "lovely_kiss double_slap ice_punch",
    "goldeen": "horn_attack fury_attack supersonic waterfall", "seaking": "horn_attack fury_attack waterfall",
    "tentacruel": "wrap supersonic poison_sting hydro_pump constrict", "tentacool": "poison_sting wrap",
    "venonat": "tackle psybeam stun_spore", "oddish": "poison_powder stun_spore absorb", "gloom": "petal_dance stun_spore",
    "bellsprout": "vine_whip", "weepinbell": "razor_leaf sleep_powder vine_whip", "victreebel": "razor_leaf vine_whip",
    "kangaskhan": "mega_punch dizzy_punch comet_punch", "lickitung": "lick wrap supersonic",
    "machoke": "seismic_toss karate_chop low_kick", "machamp": "seismic_toss submission karate_chop",
    "eevee": "tackle quick_attack sand_attack take_down", "vaporeon": "water_gun quick_attack acid_armor",
    "jolteon": "pin_missile thunder_shock quick_attack", "flareon": "ember quick_attack",
    "porygon": "conversion tackle", "aerodactyl": "wing_attack bite supersonic hyper_beam",
    "omanyte": "water_gun", "kabuto": "scratch", "magikarp": "splash tackle", "ditto": "transform",
    "chansey": "pound soft_boiled double_slap", "tangela": "vine_whip bind stun_spore",
    "doduo": "peck fury_attack", "dodrio": "drill_peck fury_attack", "clefairy": "metronome sing double_slap",
    "sandshrew": "sand_attack slash swift", "sandslash": "slash swift dig", "diglett": "dig scratch sand_attack", "dugtrio": "dig magnitude",
    "persian": "fury_swipes slash screech", "raticate": "hyper_fang quick_attack", "rattata": "tackle quick_attack hyper_fang",
    "spearow": "peck fury_attack leer", "fearow": "drill_peck fury_attack", "beedrill": "twineedle fury_attack pin_missile",
    "weedle": "poison_sting", "kakuna": "harden", "horsea": "smokescreen bubble", "seadra": "smokescreen water_gun",
    "grimer": "sludge poison_gas", "shellder": "clamp supersonic", "cloyster": "spike_cannon clamp",
    "drowzee": "hypnosis confusion", "hypno": "hypnosis psychic", "slowpoke": "disable water_gun confusion",
    "slowbro": "water_gun withdraw", "magnemite": "thunder_shock sonic_boom supersonic thunder_wave",
    "magneton": "thunder_shock thunder_wave", "golduck": "confusion fury_swipes water_gun",
    "poliwag": "water_gun bubble hypnosis", "poliwhirl": "double_slap water_gun", "poliwrath": "submission water_gun",
    "mankey": "karate_chop scratch fury_swipes", "rhyhorn": "horn_attack stomp take_down", "rhydon": "horn_drill fury_attack",
    "moltres": "fire_spin sky_attack", "zapdos": "thunder drill_peck", "articuno": "ice_beam blizzard",
    "magmar": "fire_punch flamethrower smokescreen", "dragonite": "hyper_beam thunderbolt", "dratini": "wrap twister",
    "dragonair": "twister dragon_rage", "nidoking": "horn_attack double_kick thrash", "nidoqueen": "body_slam double_kick",
    "exeggutor": "confusion stomp", "exeggcute": "hypnosis", "farfetchd": "cut fury_attack",
    "golem": "rollout rock_throw", "graveler": "rock_throw self_destruct", "parasect": "spore slash", "paras": "stun_spore scratch",
    "venomoth": "psybeam stun_spore", "vileplume": "petal_dance stun_spore", "omastar": "spike_cannon", "kabutops": "slash",
    "ninetales": "flamethrower fire_spin confuse_ray", "arcanine": "flamethrower extreme_speed take_down",
    "clefable": "metronome", "wigglytuff": "sing double_slap", "nidoran_f": "tail_whip scratch", "nidoran_m": "horn_attack",
    "nidorina": "double_kick bite", "pidgey": "gust tackle sand_attack quick_attack",
}

# a few more classic cards (Jungle Snorlax's Thick Skinned, the Mew promo's Devolution Beam)
SKILLS["thick_skinned"] = (143, "Thick Skinned", "effect_immune", "Its thick skin shrugs off status conditions.")
sig(151, "devolution_beam", "Devolution Beam", "D", 2, X, "cleanse_foe", "A strange beam that undoes the foe's boosts and rattles its focus.", card="Mew (Black Star Promo)", anim="beam")

# The main-series abilities, as passive skills for the rarer species (gen.py: rare species get
# their first ability, very rare ones every regular ability, legendaries their hidden one too).
# ability id -> (skill tag, line)
GAME_ABILITIES = {
    "overgrow": ("pinch_power", "Overgrow: its Grass moves surge when it is low on HP."),
    "blaze": ("pinch_power", "Blaze: its Fire moves surge when it is low on HP."),
    "torrent": ("pinch_power", "Torrent: its Water moves surge when it is low on HP."),
    "swarm": ("pinch_power", "Swarm: its Bug moves surge when it is low on HP."),
    "chlorophyll": ("weather_speed", "Chlorophyll: faster in the sun."), "swift_swim": ("weather_speed", "Swift Swim: faster in the rain."),
    "solar_power": ("weather_power", "Solar Power: special moves hit harder in the sun, at a cost in HP."),
    "rain_dish": ("weather_heal", "Rain Dish: heals in the rain."), "dry_skin": ("weather_heal", "Dry Skin: heals in the rain, suffers in the sun."),
    "hydration": ("weather_cure", "Hydration: rain washes its conditions away."),
    "static": ("contact_status", "Static: touching it may paralyse."), "poison_point": ("contact_status", "Poison Point: touching it may poison."),
    "effect_spore": ("contact_status", "Effect Spore: touching it may spread powder."), "flame_body": ("contact_status", "Flame Body: touching it may burn."),
    "cursed_body": ("contact_status", "Cursed Body: hitting it may seal the move."),
    "lightning_rod": ("absorb_type", "Lightning Rod: draws Lightning moves in and grows stronger."),
    "flash_fire": ("absorb_type", "Flash Fire: Fire moves power it up instead."), "water_absorb": ("absorb_type", "Water Absorb: Water moves heal it."),
    "volt_absorb": ("absorb_type", "Volt Absorb: Lightning moves heal it."),
    "rivalry": ("rival_power", "Rivalry: fiercer against its own kind."), "sheer_force": ("sheer_force", "Sheer Force: drops side effects for raw power."),
    "drought": ("start_sun", "Drought: the sun blazes when it arrives."), "intimidate": ("intimidate", "Intimidate: the foe's attack and focus drop when it arrives."),
    "justified": ("justified", "Justified: a Darkness hit only angers it."), "synchronize": ("pass_status", "Synchronize: passes a status back to the foe."),
    "inner_focus": ("disrupt_guard", "Inner Focus: hard to rattle; no flinching."), "steadfast": ("disrupt_guard", "Steadfast: flinching only fires it up."),
    "oblivious": ("disrupt_guard", "Oblivious: hardly notices taunts and charms."), "magic_guard": ("indirect_immune", "Magic Guard: only direct hits hurt it."),
    "guts": ("status_power", "Guts: a status condition makes it hit harder."), "no_guard": ("no_guard", "No Guard: every move hits, both ways."),
    "rock_head": ("recoil_immune", "Rock Head: no recoil."), "sturdy": ("sturdy", "Sturdy: survives one knockout blow from full HP."),
    "sand_veil": ("evasion_aura", "Sand Veil: harder to hit in a sandstorm."), "snow_cloak": ("evasion_aura", "Snow Cloak: harder to hit in snow."),
    "battle_armor": ("crit_immune", "Battle Armor: no critical hits against it."), "shell_armor": ("crit_immune", "Shell Armor: no critical hits against it."),
    "limber": ("status_immune_one", "Limber: can't be paralysed."), "immunity": ("status_immune_one", "Immunity: can't be poisoned."),
    "reckless": ("recoil_power", "Reckless: recoil moves hit harder."), "unburden": ("speed_aura", "Unburden: light and quick."),
    "keen_eye": ("acc_guard", "Keen Eye: its accuracy can't be lowered."), "illuminate": ("acc_guard", "Illuminate: its accuracy can't be lowered."),
    "iron_fist": ("punch_power", "Iron Fist: punches hit harder."), "natural_cure": ("cure_status_out", "Natural Cure: its conditions heal when it disengages."),
    "healer": ("cure_status_out", "Healer: shakes off conditions."), "serene_grace": ("effect_chance_up", "Serene Grace: side effects happen twice as often."),
    "early_bird": ("sleep_short", "Early Bird: wakes up quickly."), "scrappy": ("foresight_skill", "Scrappy: Normal and Fighting moves hit Ghosts."),
    "analytic": ("last_mover_power", "Analytic: hits harder when it moves last."), "soundproof": ("sound_immune", "Soundproof: sound moves don't reach it."),
    "filter": ("weakness_reduce", "Filter: takes less from its weakness."), "technician": ("weak_move_power", "Technician: its openers hit harder."),
    "forewarn": ("reveal_plan", "Forewarn: senses the foe's strongest move."), "anticipation": ("reveal_plan", "Anticipation: senses danger coming."),
    "moxie": ("ko_boost", "Moxie: a knockout raises its attack."), "imposter": ("transform_start", "Imposter: transforms the moment it arrives."),
    "run_away": ("free_retreat", "Run Away: always gets away."), "adaptability": ("stab_up", "Adaptability: its own-type moves hit much harder."),
    "quick_feet": ("status_speed", "Quick Feet: faster with a status condition."), "trace": ("copy_skill", "Trace: copies the foe's skill."),
    "download": ("download", "Download: raises the stat that beats the foe's weaker defense."), "weak_armor": ("weak_armor", "Weak Armor: hits shed its armor: defense down, speed up."),
    "pressure": ("pressure", "Pressure: its presence slows the foe's focus."), "unnerve": ("pressure", "Unnerve: the foe is too nervous to focus well."),
    "thick_fat": ("thick_fat", "Thick Fat: Fire and Ice moves do less."), "gluttony": ("heal_from_food", "Gluttony: eats sooner and heals more."),
    "shed_skin": ("shed_skin", "Shed Skin: may shed a condition each turn."), "marvel_scale": ("marvel_scale", "Marvel Scale: tougher with a condition."),
    "multiscale": ("multiscale", "Multiscale: takes half damage at full HP."),
}

# designed additions: Dodge (anime "Dodge it!") for quick, clever and evasive species;
# Ground Pound (new) for the diggers and heavy Ground species
DODGE = set("""pikachu raichu pidgey pidgeotto pidgeot spearow fearow rattata raticate meowth persian abra kadabra
alakazam gastly haunter gengar scyther jolteon zubat golbat butterfree venomoth staryu starmie ponyta rapidash
doduo dodrio farfetchd hitmonlee mr_mime eevee vulpix ninetales aerodactyl mew dratini dragonair zapdos
articuno moltres jynx mankey primeape ekans arbok sandshrew sandslash diglett dugtrio growlithe arcanine""".split())
GROUND_POUND = set("""sandshrew sandslash diglett dugtrio geodude graveler golem onix cubone marowak rhyhorn rhydon
nidoqueen nidoking snorlax machamp""".split())

# where the TCG typing deserves a note (eras differ; the current card, SV151, is used)
NOTES = {
    "clefairy": "Colorless in Base Set, Fairy in XY to Sun & Moon; Psychic since Fairy energy was retired (SV151 Psychic).",
    "clefable": "Colorless in Base Set and Jungle, Fairy in XY to Sun & Moon; Psychic in SV151.",
    "jigglypuff": "Colorless (SV151 and Jungle); its Fairy type gives it a secondary Psychic pool.",
    "wigglytuff": "Colorless (SV151 ex and Jungle); Fairy type gives a secondary Psychic pool.",
    "mr_mime": "Psychic in every era; the Fairy type maps to Psychic too, so no second pool.",
    "ekans": "Poison types were Grass in the original sets and Psychic in Sun & Moon; Darkness since Sword & Shield (SV151).",
    "arbok": "Grass in Fossil, Darkness in SV151.",
    "zubat": "Grass in Fossil (from memory), Darkness in SV151.",
    "golbat": "Grass in Fossil (from memory), Darkness in SV151.",
    "grimer": "Grass in Fossil, Darkness in SV151.", "muk": "Grass in Fossil, Darkness in SV151.",
    "koffing": "Grass in Fossil, Darkness in SV151.", "weezing": "Grass in Fossil, Darkness in SV151.",
    "nidoran_f": "Grass in Jungle and Base Set, Darkness in SV151.", "nidoran_m": "Grass in Base Set, Darkness in SV151.",
    "nidorina": "Grass in Jungle, Darkness in SV151.", "nidorino": "Grass in Base Set, Darkness in SV151.",
    "nidoqueen": "Grass in Jungle, Darkness in SV151; Ground gives a Fighting pool.",
    "nidoking": "Grass in Base Set, Darkness in SV151; Ground gives a Fighting pool.",
    "gastly": "Psychic in every era; its Poison type gives a Darkness pool.",
    "haunter": "Psychic in every era; Poison gives a Darkness pool.", "gengar": "Psychic in every era; Poison gives a Darkness pool.",
    "jynx": "Psychic in Base Set; Water in SV151 (ex). Its Psychic type gives a second pool.",
    "aerodactyl": "Fighting in Fossil (from memory), Colorless in SV151; Rock gives a Fighting pool.",
    "dratini": "Colorless in Base Set, Dragon since Black & White. SV151 Dragon cards have no Weakness; they pay in Water and Lightning, kept as flavour in the Draconic Whip line (its pool is Dragon, as the engine builds pools from types).",
    "dragonair": "Colorless in Base Set, Dragon since Black & White; no Weakness on the SV151 card (it pays in Water and Lightning).",
    "dragonite": "Colorless in Fossil, Dragon since Black & White; no Weakness on the SV151 card (it pays in Water and Lightning).",
    "magnemite": "Lightning in SV151 and most eras; some Sun & Moon era cards are Metal (from memory). Steel gives a Metal pool.",
    "magneton": "Lightning in SV151; some Sun & Moon era cards are Metal (from memory). Steel gives a Metal pool.",
    "onix": "Fighting in every era.", "articuno": "Water in every era.", "moltres": "Fire in every era.", "zapdos": "Lightning in every era.",
    "mewtwo": "Psychic in every era.", "mew": "Psychic in every era.", "kabuto": "Fighting in every era.", "omanyte": "Water in every era.",
    "slowpoke": "Psychic in SV151 and Fossil; Water type gives a Water pool.", "slowbro": "Psychic in SV151 and Fossil; Water type gives a Water pool.",
    "exeggcute": "Grass in every era; Psychic type gives a Psychic pool.",
    "starmie": "Water in every era; Psychic type gives a Psychic pool.",
    "poliwrath": "Water in every era; Fighting type gives a Fighting pool.",
    "tentacool": "Water in every era; Poison type gives a Darkness pool.",
}
