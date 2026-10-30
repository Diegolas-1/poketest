#!/usr/bin/env python3
# Step 2 of the Kanto 151 move-design pipeline (energy v2). Reads source.json (extract.py),
# the hand layers (catalog.py: move overrides and new moves; tcg_sigs.py: card attacks,
# skills, rarity, AI, focus, anime moves; tcg_table.py: the SV151 card data) and writes
#   native/life/kanto151.json          the 151 species
#   native/life/moves_kanto.json       every move they use
#   native/life/kanto151_balance.json  the one global set of numbers
#   python3 -I gen.py <source.json> <native/life dir>
# Every number a battle needs is written into the data; the formulas that produced the move
# numbers are written into the balance file too, so a tuner can change the balance and
# regenerate, or tune a move by hand.
import json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from catalog import MOVES as HAND
from tcg_sigs import SIGS, SKILLS, RARITY_OVERRIDE, AI, FOCUS, ANIME, DODGE, GROUND_POUND, NOTES, GAME_ABILITIES
from tcg_table import TCG

SRC_PATH, OUT_DIR = sys.argv[1], sys.argv[2]
SRC = json.load(open(SRC_PATH))
# the engine's own data: battle_config.json (focus defaults, slots, the counter table,
# matchups) and pokemon.json (the type chart); read, never written
CFG = json.load(open(os.path.join(OUT_DIR, "battle_config.json")))
# the numbers tuned for this dataset (dataset_overrides.kanto) over the plain ones, as the engine sees them
def _merge_cfg(into, frm):
    for k, v in frm.items():
        if isinstance(v, dict) and isinstance(into.get(k), dict): _merge_cfg(into[k], v)
        else: into[k] = v
_merge_cfg(CFG, CFG.get("dataset_overrides", {}).get("kanto", {}))
PK = json.load(open(os.path.join(OUT_DIR, "pokemon.json")))

# ======================================================================== the balance
RARITIES = ["common", "uncommon", "rare", "very_rare", "legendary"]
TYPE_MAP = {"normal": "colorless", "flying": "colorless", "fire": "fire", "water": "water", "ice": "water",
            "grass": "grass", "bug": "grass", "electric": "electric", "psychic": "psychic", "ghost": "psychic",
            "fairy": "psychic", "fighting": "fighting", "rock": "fighting", "ground": "fighting",
            "poison": "dark", "dark": "dark", "steel": "steel", "dragon": "dragon"}
TCG_IDS = {"Grass": "grass", "Fire": "fire", "Water": "water", "Lightning": "electric", "Psychic": "psychic",
           "Fighting": "fighting", "Darkness": "dark", "Metal": "steel", "Dragon": "dragon", "Colorless": "colorless"}
ENERGY_NAMES = {"colorless": "Colorless", "grass": "Grass", "fire": "Fire", "water": "Water", "electric": "Lightning",
                "psychic": "Psychic", "fighting": "Fighting", "dark": "Darkness", "steel": "Metal", "dragon": "Dragon"}
POOLS = list(ENERGY_NAMES)

def rk(r): return RARITIES.index(r)

B = {
    "rarities": RARITIES,
    "power_per_chip": {
        "opener":   {"common": 38, "uncommon": 40, "rare": 42.5, "very_rare": 45, "legendary": 48},
        "mid":      {"common": 39, "uncommon": 41, "rare": 43.5, "very_rare": 46, "legendary": 49},
        "finisher": {"common": 38, "uncommon": 40, "rare": 42.5, "very_rare": 45, "legendary": 48},
    },
    "finisher_base": {"common": 20, "uncommon": 25, "rare": 30, "very_rare": 35, "legendary": 40},
    "chip_scaling": {"1": 1.0, "2": 1.0, "3": 1.03},
    "game_power_ref": {"1": 40, "2": 70, "3": 100, "finisher": 130},
    "game_power_blend": 0.3, "game_power_clamp": [0.85, 1.15],
    "accuracy_k": 0.008,
    "priority_mult": {"-1": 1.05, "0": 1.0, "1": 0.85, "2": 0.75, "3": 0.65},
    "two_phase_mult": 1.3,
    "hits_state_mult": 0.97,
    "role_power_mult": {"offense": 1.0, "two_phase": 1.0, "disruption": 0.75, "reaction": 0.8, "utility": 0.8},
    "round_power_to": 5, "round_finisher_ppc_to": 1,
    "tolerance": {"pct": 0.1, "abs": 5},
    "shared_power_mult": CFG.get("rarity", {}).get("shared_power_mult", {"common": 1.0, "uncommon": 1.04, "rare": 1.08, "very_rare": 1.12, "legendary": 1.16}),
    "off_pool": CFG.get("costs", {}).get("off_pool", {"enabled": True, "extra": 1, "finisher_extra": 1}),
    "disrupt_per_chip": {"common": 10, "uncommon": 11, "rare": 12, "very_rare": 13, "legendary": 15},
    "disrupt_damaging_mult": 0.5,
    "reaction": {"lock": "the move's chips stay locked until the foe's next attack or the next turn",
                 "return_mult": {"common": 1.5, "uncommon": 1.6, "rare": 1.75, "very_rare": 1.9, "legendary": 2.0},
                 "bide_mult": 2.0, "guard_reduce": 0.4, "default_chance": 100},
    "combo_power_pct": {"common": 15, "uncommon": 20, "rare": 30, "very_rare": 40, "legendary": 50},
    "focus": {
        "default": {"gain": 10, "start": 0, "chip_every": 20, "max_chips": 5, "resist": 0.0},
        "by_energy": {"psychic": {"gain": 12, "resist": 0.25}, "electric": {"gain": 11}, "fire": {"gain": 11},
                      "fighting": {"resist": 0.15}, "dark": {"resist": 0.1}, "dragon": {"gain": 11, "resist": 0.2},
                      "grass": {"gain": 9, "resist": 0.1}, "water": {}, "steel": {"resist": 0.25}, "colorless": {}},
        "rarity_gain_bonus": {"common": 0, "uncommon": 0, "rare": 1, "very_rare": 2, "legendary": 3},
        "stage_gain_bonus": {"0": 0, "1": 0, "2": 0},
        "rarity_resist_bonus": {"common": 0.0, "uncommon": 0.05, "rare": 0.1, "very_rare": 0.15, "legendary": 0.2},
        "resist_cap": 0.6,
        "focus_up_amount": 15, "focus_down_self_amount": 30, "focus_drain_amount": 10,
        "locked_in": {"at": 100, "power_mult": 1.15, "accuracy_bonus": 10, "disrupt_immune": True,
                      "doc": "At 100% focus a Pokémon is Locked In: its moves hit harder and truer, and disruption can't lower its focus until it spends a finisher."},
    },
    "weakness_mult": 2.0,
    "resistance_reduce": {"20": 0.15, "30": 0.25},
    "equip_slots": {"1": 1, "3": 2, "8": 3, "14": 4, "21": 5, "29": 6, "38": 7, "48": 8, "60": 9, "75": 10},
    "learn_levels": {"opener": 3, "mid": 12, "finisher": 24, "other": 8, "added_two_phase": 10, "added_reaction": 5},
    "stats": {"spread": 0.5, "shape": 0.6, "evolution_floor": 0.08, "rarity_bonus": {"common": 0.0, "uncommon": 0.03, "rare": 0.06, "very_rare": 0.09, "legendary": 0.12},
              "group_bonus": {"basic": 0.0, "middle": 0.0, "final": 0.0, "single": 0.0}},
    "type_map": TYPE_MAP, "tcg_energy_ids": TCG_IDS, "energy_names": ENERGY_NAMES,
}

# effect tags: every tag a move or skill carries, with its power weight (on damaging moves)
# and the numbers the engine reads. The simulator reads chances from here or from the
# move's effect_chance.
EFFECTS = {
    # status conditions on the foe
    "para": (0.9, "Paralysis: may lose its turn; speed down.", {"skip_chance": 25}),
    "burn": (0.92, "Burn: damage each turn; physical power down.", {"dot_pct": 6, "atk_mult": 0.5}),
    "freeze": (0.9, "Freeze: can't act until it thaws.", {"thaw_chance": 20}),
    "poison": (0.93, "Poison: damage each turn.", {"dot_pct": 12}),
    "bad_poison": (0.88, "Bad poison: damage that grows each turn.", {"dot_pct_start": 6, "dot_pct_step": 6}),
    "sleep": (0.85, "Sleep: can't act for 1 to 3 turns.", {"turns": [1, 3]}),
    "confuse": (0.93, "Confusion: may hit itself for 2 to 5 turns.", {"self_hit_chance": 33, "turns": [2, 5]}),
    "infatuate": (0.93, "Infatuation: often can't attack.", {"skip_chance": 50}),
    "trap": (0.93, "Trapped: can't flee or disengage; bound moves deal damage each turn.", {"turns": [4, 5], "dot_pct": 6}),
    "leech": (0.9, "Leech Seed: drains HP each turn.", {"dot_pct": 12}),
    "nightmare": (0.9, "Nightmare: a sleeping foe loses HP each turn.", {"dot_pct": 25}),
    "perish": (1.0, "Perish Song: both faint in 3 turns unless they leave.", {"turns": 3}),
    "drowsy": (1.0, "Drowsy: falls asleep at the end of the next turn.", {}),
    "disable": (1.0, "Disables the foe's last move.", {"turns": [1, 4]}),
    "disable_lite": (1.0, "Saps the foe: its last move costs a chip more next turn.", {}),
    "seal": (0.9, "Seals the foe: it can't use attack moves next turn (taunt, torment, embargo and the like).", {"turns": 1}),
    "taunt": (1.0, "Taunt: the foe can only attack for 3 turns.", {"turns": 3}),
    "encore": (1.0, "Encore: the foe repeats its last move.", {"turns": 3}),
    "flinch": (0.94, "Flinch: if it moves first, the foe loses its next action.", {}),
    "tri_status": (0.9, "One in five each: burn, freeze or paralysis.", {}),
    # stat stages (foe)
    **{"%s_down" % s: (0.95, "Lowers the foe's %s one stage." % n, {"stages": -1}) for s, n in
       [("atk", "attack"), ("def", "defense"), ("spatk", "special attack"), ("spdef", "special defense"),
        ("speed", "speed"), ("acc", "accuracy"), ("evasion", "evasion")]},
    **{"%s_down_big" % s: (0.92, "Sharply lowers the foe's %s (two stages)." % n, {"stages": -2}) for s, n in
       [("atk", "attack"), ("def", "defense"), ("spatk", "special attack"), ("spdef", "special defense"),
        ("speed", "speed"), ("acc", "accuracy"), ("evasion", "evasion")]},
    # stat stages (self)
    **{"%s_up" % s: (0.92, "Raises its own %s one stage." % n, {"stages": 1}) for s, n in
       [("atk", "attack"), ("def", "defense"), ("spatk", "special attack"), ("spdef", "special defense"),
        ("speed", "speed"), ("acc", "accuracy"), ("evasion", "evasion"), ("crit", "critical-hit rate")]},
    **{"%s_up_big" % s: (0.88, "Sharply raises its own %s (two stages)." % n, {"stages": 2}) for s, n in
       [("atk", "attack"), ("def", "defense"), ("spatk", "special attack"), ("spdef", "special defense"),
        ("speed", "speed"), ("acc", "accuracy"), ("evasion", "evasion")]},
    **{"%s_down_self" % s: (1.12, "Lowers its own %s after the attack." % n, {"stages": -1}) for s, n in
       [("atk", "attack"), ("def", "defense"), ("spatk", "special attack"), ("spdef", "special defense"),
        ("speed", "speed")]},
    **{"foe_%s_up" % s: (1.0, "Raises the foe's %s (a gamble)." % n, {"stages": 2}) for s, n in
       [("atk", "attack"), ("spatk", "special attack"), ("def", "defense"), ("spdef", "special defense")]},
    "atk_max": (1.0, "Maxes its attack at the cost of half its HP.", {"hp_cost_pct": 50}),
    "all_up_chance": (0.9, "May raise all its stats one stage.", {}),
    "random_stat_up_big": (1.0, "Sharply raises a random stat.", {}),
    "pass_boosts": (1.0, "Keeps its stat changes for the next Pokémon (or the next battle phase).", {}),
    "copy_boosts": (1.0, "Copies the foe's stat changes.", {}),
    "swap_stats": (1.0, "Swaps stats or stat changes with the foe.", {}),
    "average_stats": (1.0, "Averages its stats with the foe's.", {}),
    "swap_defenses": (1.0, "Swaps defense and special defense for 5 turns.", {}),
    "average_hp": (1.0, "Averages its HP with the foe's.", {}),
    # damage shape
    "high_crit": (0.94, "High critical-hit rate.", {"crit_chance": 12.5}),
    "multi_hit": (1.0, "Hits several times; power is the total for the usual number of hits.", {"hits": [2, 5]}),
    "drain": (0.85, "Heals by half the damage dealt.", {"drain_pct": 50}),
    "recoil": (1.15, "Takes a share of the damage dealt.", {"recoil_pct": 33}),
    "crash": (1.12, "Hurts itself if it misses.", {"crash_pct": 50}),
    "recharge": (1.25, "Must rest next turn: its chips don't refresh.", {}),
    "self_faint": (1.6, "Faints itself.", {}),
    "confuse_self": (1.12, "Leaves itself confused.", {}),
    "sleep_self": (1.0, "Puts itself to sleep too.", {}),
    "focus_down_self": (1.15, "Its focus drops after.", {}),
    "never_miss": (0.9, "Never misses (a Dodge still works).", {}),
    "ignores_dodge": (0.95, "Hits through Dodge.", {}),
    "ignores_resistance": (0.95, "Resistance doesn't reduce it.", {}),
    "breaks_protect": (0.9, "Breaks Protect and Detect.", {}),
    "breaks_barrier": (0.95, "Shatters Reflect and Light Screen.", {}),
    "grounds": (0.95, "Knocks a flyer out of the sky and ends Fly or Bounce.", {}),
    "first_turn": (1.25, "Only on its first action of the battle.", {}),
    "sleep_only": (1.3, "Only works on (or while) a sleeping Pokémon.", {}),
    "self_confused_only": (1.4, "Only works while it is confused.", {}),
    "needs_others": (1.15, "Only after it has used every other equipped move.", {}),
    "needs_stockpile": (1.2, "Needs Stockpile first; scales with it.", {}),
    "low_hp_boost": (0.8, "Stronger the lower its HP (up to double).", {"max_mult": 2.0}),
    "power_grows": (0.85, "Grows stronger with each use in a row (up to double).", {"step_pct": 25, "max_mult": 2.0}),
    "random_power": (1.0, "Power varies at random (half to one and a half).", {"min_mult": 0.5, "max_mult": 1.5}),
    "speed_scaling": (1.0, "Power scales with the speed difference.", {}),
    "weight_scaling": (1.0, "Power scales with weight.", {}),
    "friendship_scaling": (1.0, "Power scales with friendship.", {}),
    "bonus_vs_damaged": (0.9, "Much stronger against a damaged foe.", {"bonus_pct": 50}),
    "bonus_vs_healthy": (0.9, "Stronger the healthier the foe.", {}),
    "bonus_vs_boosted": (0.95, "Stronger against a foe with raised stats.", {}),
    "bonus_vs_type": (0.9, "Stronger against one energy type (bonus_type).", {"bonus_pct": 75}),
    "bonus_vs_rarer": (0.9, "Stronger against a rarer foe.", {"bonus_pct": 50}),
    "bonus_if_matched": (0.85, "Far stronger when its chip count matches the foe's.", {"bonus_pct": 100}),
    "bonus_per_foe_chip": (0.88, "Stronger for every chip the foe holds.", {"bonus_pct_per_chip": 15}),
    "bonus_per_own_pool": (0.9, "Stronger for every chip it holds in its own type's pool.", {"bonus_pct_per_chip": 12}),
    "coin_bonus": (0.85, "On a coin flip, much more damage.", {"chance": 50, "bonus_pct": 100}),
    "delayed_damage": (0.9, "Extra damage at the end of the foe's next turn.", {"extra_pct": 30}),
    "hits_fleeing": (1.0, "Double power on a foe that tries to flee or disengage.", {}),
    "rage": (0.95, "Attack rises each time it is hit while raging.", {}),
    "coins": (0.97, "Scatters coins (money after the battle).", {}),
    "trip": (1.0, "Heavier foes take more.", {}),
    "sound": (1.0, "A sound move.", {}), "wind": (1.0, "A wind move (whirls up leaves and grass).", {}),
    "pivot": (0.92, "Hits, then it may disengage or swap out.", {}),
    "clear_field": (0.95, "Clears traps, seeds and hazards on its side.", {}),
    "item_play": (1.0, "A held-item trick (held items are a later hook; until then it is just a hit).", {}),
    # energy v2 tags
    "focus_up": (0.9, "Raises its own focus (balance focus.focus_up_amount).", {}),
    "focus_drain": (0.9, "Lowers the foe's focus (balance focus.focus_drain_amount), on top of any disrupt.", {}),
    "chip_gain": (0.9, "Gains a chip now, into its primary pool.", {"chips": 1}),
    "chip_gain_any": (1.0, "Gains a chip now, into any pool it picks.", {"chips": 1}),
    "chip_drain": (0.88, "The foe loses one unspent chip.", {"chips": 1}),
    "chip_gift": (1.0, "Gives the foe a chip (a trick for combos that need the foe's chips).", {"chips": 1}),
    "foe_cost_up": (0.9, "The foe's moves cost a chip more next turn.", {}),
    "swap_focus": (1.0, "Swaps focus meters with the foe.", {}),
    "set_weakness": (1.0, "Sets the foe's weakness to an energy type of the user's choice.", {}),
    "cleanse_foe": (0.92, "Removes the foe's stat boosts.", {}),
    "copy_move": (1.0, "Uses the foe's last move (or one of its moves).", {}),
    "random_move": (1.0, "Uses a random move.", {}), "random_own": (1.0, "Uses one of its own moves at random.", {}),
    "copy_skill": (1.0, "Copies the foe's skill.", {}),
    "transform": (1.0, "Becomes a copy of the foe: moves, pools and stats.", {}),
    "retype": (1.0, "Changes its own type.", {}), "retype_resist": (1.0, "Changes to a type that resists the foe's last move.", {}),
    "retype_foe": (1.0, "Changes the foe's type.", {}),
    "heal": (1.0, "Restores half its max HP.", {"heal_pct": 50}),
    "heal_delayed": (1.0, "Restores half its max HP at the end of the next turn.", {"heal_pct": 50}),
    "heal_over_time": (1.0, "Restores a little HP every turn.", {"heal_pct": 6}),
    "heal_next": (1.0, "Fully heals the next Pokémon to come in.", {}),
    "trap_self": (1.0, "It can't flee or disengage.", {}),
    "rest": (1.0, "Sleeps two turns and heals fully.", {"turns": 2}),
    "cure_status": (1.0, "Cures its status conditions.", {}),
    "substitute": (1.0, "A decoy with a quarter of its HP takes the hits.", {"hp_cost_pct": 25}),
    "def_up_big_temp": (1.0, "", {}),
    "barrier_phys": (1.0, "Halves physical damage for 5 turns.", {"turns": 5, "mult": 0.5}),
    "barrier_spec": (1.0, "Halves special damage for 5 turns.", {"turns": 5, "mult": 0.5}),
    "barrier_both": (1.0, "Halves all damage for 5 turns.", {"turns": 5, "mult": 0.5}),
    "mist": (1.0, "Its stats can't be lowered for 5 turns.", {"turns": 5}),
    "status_shield": (1.0, "No status conditions for 5 turns.", {"turns": 5}),
    "no_crit": (1.0, "No critical hits against it for 5 turns.", {"turns": 5}),
    "cleanse": (1.0, "Wipes every stat change on both sides.", {}),
    "foresight": (1.0, "Normal and Fighting moves can hit Ghosts; evasion is ignored.", {}),
    "cancels_dodge": (1.0, "Mind Reader / Lock-On: the foe's next Dodge (or evasion) fails.", {}),
    "levitate": (1.0, "Immune to Ground moves for 5 turns.", {"turns": 5}),
    "crit_next": (1.0, "Its next move is a sure critical hit.", {}),
    "power_up_next": (1.0, "Its next move does half again more.", {"mult": 1.5}),
    "pass_status": (1.0, "Passes its status condition to the foe.", {}),
    "stockpile": (1.0, "Stores power for Spit Up and Swallow (up to 3).", {"max": 3}),
    "hazard": (1.0, "Lays a hazard that hurts the foe when it comes back in.", {}),
    "weather_sun": (1.0, "Sun for 5 turns: Fire up, Water down; Solar Beam skips its commit.", {"turns": 5}),
    "weather_rain": (1.0, "Rain for 5 turns: Water up, Fire down; Thunder never misses.", {"turns": 5}),
    "weather_sand": (1.0, "Sandstorm for 5 turns.", {"turns": 5}),
    "weather_snow": (1.0, "Snow or hail for 5 turns; Blizzard never misses.", {"turns": 5}),
    "terrain_electric": (1.0, "Electric terrain: Lightning moves up, no sleep.", {"turns": 5}),
    "terrain_grassy": (1.0, "Grassy terrain: heals a little each turn, Grass moves up.", {"turns": 5}),
    "terrain_misty": (1.0, "Misty terrain: no status conditions, Dragon moves down.", {"turns": 5}),
    "terrain_psychic": (1.0, "Psychic terrain: no priority moves, Psychic moves up.", {"turns": 5}),
    "gravity": (1.0, "Grounds everything for 5 turns: Fly and Bounce can't be used.", {"turns": 5}),
    "trick_room": (1.0, "For 5 turns the slower one acts first.", {"turns": 5}),
    "weaken_type": (1.0, "Halves one type's damage (Mud Sport: Lightning; Water Sport: Fire).", {"turns": 5}),
    "none": (1.0, "Nothing happens.", {}),
    "force_out": (0.95, "Drives the foe off: a wild one flees or disengages; Roar and Whirlwind also pull it out of a two-phase move.", {}),
    "ohko": (1.0, "A one-hit knockout if it lands (it fails on a higher-level foe); accuracy rises 1 per level above the foe.", {}),
    "disrupt": (1.0, "Disruption: lowers the foe's focus by the move's disrupt (battle_config disruption.moves), less its disrupt_resist.", {}),
    "fixed_40": (1.0, "Always 40 damage.", {"damage": 40}),
    # skills from the main-series abilities
    "pinch_power": (1.0, "Skill: its own-type moves x1.5 below a third of its HP.", {"hp_pct": 33, "mult": 1.5}),
    "weather_speed": (1.0, "Skill: speed x2 in its weather.", {"mult": 2.0}),
    "weather_power": (1.0, "Skill: special power x1.5 in the sun, losing a little HP each turn.", {"mult": 1.5, "hp_pct": 12}),
    "weather_heal": (1.0, "Skill: heals in the rain.", {"heal_pct": 6}),
    "weather_cure": (1.0, "Skill: rain cures its status conditions.", {}),
    "contact_status": (1.0, "Skill: a physical hit on it may give the attacker a status condition.", {"chance": 30}),
    "absorb_type": (1.0, "Skill: one energy type's moves heal or power it instead of hurting.", {"heal_pct": 25}),
    "rival_power": (1.0, "Skill: stronger against its own species line.", {"mult": 1.25}),
    "sheer_force": (1.0, "Skill: moves with side effects drop them for power.", {"mult": 1.3}),
    "start_sun": (1.0, "Skill: brings the sun as the battle opens.", {"turns": 5}),
    "intimidate": (1.0, "Skill: as the battle opens, the foe's attack and focus drop.", {"stages": -1, "focus": 10}),
    "justified": (1.0, "Skill: a Darkness hit raises its attack.", {}),
    "disrupt_guard": (1.0, "Skill: disruption and flinching rattle it less.", {"disrupt_resist": 0.25}),
    "indirect_immune": (1.0, "Skill: only direct attacks hurt it.", {}),
    "status_power": (1.0, "Skill: attack x1.5 with a status condition.", {"mult": 1.5}),
    "no_guard": (1.0, "Skill: every move hits, its own and the foe's.", {}),
    "recoil_immune": (1.0, "Skill: no recoil damage.", {}),
    "sturdy": (1.0, "Skill: survives one knockout blow from full HP with 1 HP.", {}),
    "evasion_aura": (1.0, "Skill: harder to hit in its weather.", {"acc": -20}),
    "crit_immune": (1.0, "Skill: no critical hits against it.", {}),
    "status_immune_one": (1.0, "Skill: immune to one status condition.", {}),
    "recoil_power": (1.0, "Skill: recoil moves x1.2.", {"mult": 1.2}),
    "acc_guard": (1.0, "Skill: its accuracy can't be lowered.", {}),
    "punch_power": (1.0, "Skill: punching moves x1.2.", {"mult": 1.2}),
    "cure_status_out": (1.0, "Skill: its status conditions heal after the battle or when it disengages.", {}),
    "effect_chance_up": (1.0, "Skill: side effect chances doubled.", {"mult": 2.0}),
    "sleep_short": (1.0, "Skill: sleeps half as long.", {}),
    "foresight_skill": (1.0, "Skill: its Normal and Fighting moves always hit Ghosts.", {}),
    "last_mover_power": (1.0, "Skill: x1.3 when it acts after the foe.", {"mult": 1.3}),
    "sound_immune": (1.0, "Skill: immune to sound moves.", {}),
    "weakness_reduce": (1.0, "Skill: its weakness does a quarter less.", {"mult": 0.75}),
    "weak_move_power": (1.0, "Skill: openers x1.5.", {"mult": 1.5}),
    "ko_boost": (1.0, "Skill: attack up after it knocks a foe out.", {}),
    "stab_up": (1.0, "Skill: its own-type bonus is x2 instead of x1.5.", {"stab": 2.0}),
    "status_speed": (1.0, "Skill: speed x1.5 with a status condition.", {"mult": 1.5}),
    "download": (1.0, "Skill: raises attack or special attack to beat the foe's weaker defense.", {}),
    "weak_armor": (1.0, "Skill: a physical hit lowers its defense and raises its speed.", {}),
    "pressure": (1.0, "Skill: the foe gains less focus each turn.", {"gain": -2}),
    "thick_fat": (1.0, "Skill: Fire and Ice moves do half.", {"mult": 0.5}),
    "shed_skin": (1.0, "Skill: a third of the time it sheds a status condition each turn.", {"chance": 33}),
    "marvel_scale": (1.0, "Skill: defense x1.5 with a status condition.", {"mult": 1.5}),
    "multiscale": (1.0, "Skill: half damage while at full HP.", {"mult": 0.5}),
    # skills
    "heal_per_turn": (1.0, "Skill: heals a little every turn.", {"heal_pct": 6}),
    "damage_reduce": (1.0, "Skill: takes less damage from every attack.", {"reduce_pct": 15}),
    "effect_immune": (1.0, "Skill: immune to the side effects of attacks.", {}),
    "focus_start": (1.0, "Skill: starts the battle with extra focus.", {"amount": 20}),
    "focus_gain_up": (1.0, "Skill: gains focus faster.", {"amount": 3}),
    "chip_on_faint": (1.0, "Skill: when a teammate faints it keeps one of its chips.", {}),
    "acc_down_aura": (1.0, "Skill: foes are a little less accurate.", {"acc": -10}),
    "partner_cost_discount": (1.0, "Skill: with its partner on the team, typed costs drop by one.", {}),
    "hp_up": (1.0, "Skill: more HP.", {"hp_pct": 20}),
    "reveal_plan": (1.0, "Skill: sees the foe's planned moves each turn.", {}),
    "chip_on_evolve": (1.0, "Skill: gains chips when it evolves mid-battle.", {"chips": 2}),
    "endure_chance": (1.0, "Skill: may survive a knockout with 1 HP.", {"chance": 50}),
    "sleep_on_evolve": (1.0, "Skill: the foe falls asleep when it evolves.", {}),
    "partner_power": (1.0, "Skill: its partner's attacks hit harder.", {"bonus_pct": 20}),
    "counter_on_hit": (1.0, "Skill: when hit, deals a little damage back.", {"damage_pct": 10}),
    "faint_blast": (1.0, "Skill: on fainting, may damage the foe heavily.", {"chance": 50, "damage_pct": 30}),
    "luck_up": (1.0, "Skill: coin flips go its way more often.", {"chance": 60}),
    "start_damage": (1.0, "Skill: chips the foe as the battle opens.", {"damage_pct": 8}),
    "protect_if_matched": (1.0, "Skill: no damage from attacks when its chips match the foe's.", {}),
    "transform_start": (1.0, "Skill: may transform for free on its first turn.", {}),
    "weakness_bonus": (1.0, "Skill: the foe's weakness counts double again.", {"mult": 4.0}),
    "heal_from_food": (1.0, "Skill: food heals it more.", {}),
    "free_retreat": (1.0, "Skill: it can always disengage.", {}),
    "speed_aura": (1.0, "Skill: rarely caught by the foe's first strike.", {}),
}

# tags whose weight is scaled by the move's effect_chance (the status and stat side effects)
CHANCE_TAGS = sorted({"para", "burn", "freeze", "poison", "bad_poison", "sleep", "confuse", "infatuate", "flinch", "tri_status", "trap",
                      "all_up_chance", "chip_drain", "focus_drain", "recoil", "coin_bonus"}
                     | {t for t in EFFECTS if "_down" in t and not t.endswith("_self")}
                     | {t for t in EFFECTS if t.endswith("_up") or t.endswith("_up_big")})
B["chance_scaled_tags"] = CHANCE_TAGS

# the tuning layer (tune.py writes it from the battle simulator's reports): balance
# overrides (deep-merged into B), per-move power factors (power_mods.tune) and
# per-species focus deltas (added to focus_profile). Every change is logged there.
TUNE_PATH = os.path.join(HERE, "tuning.json")
TUNE = json.load(open(TUNE_PATH)) if os.path.exists(TUNE_PATH) else {}
def _deep(into, frm):
    for k, v in frm.items():
        if isinstance(v, dict) and isinstance(into.get(k), dict): _deep(into[k], v)
        else: into[k] = v
_deep(B, TUNE.get("balance", {}))
UNKNOWN_TAGS = set()
def tag_weight(t):
    if t not in EFFECTS:
        UNKNOWN_TAGS.add(t); return 1.0
    return EFFECTS[t][0]

# ======================================================================== helpers
def mid(api): return api.replace("-", "_")

def clean(s):
    s = (s or "").replace("—", ", ").replace("–", "-").replace("’", "'").replace("‘", "'")
    s = s.replace("“", '"').replace("”", '"').replace(" ", " ").replace("­", "")
    return " ".join(s.split())

def first_sentence(t, cap=110):
    t = clean(t)
    m = re.match(r"(.+?[.!?])(\s|$)", t)
    s = m.group(1) if m else t
    if len(s) > cap:
        s = s[:cap].rsplit(" ", 1)[0].rstrip(",;:") + "."
    return s

def r5(x, to=5): return int(max(to, round(x / to) * to))

ANIM_RULES = [
    ("punch|hammer arm|mega punch|comet", "punch"), ("kick", "kick"), ("fang|bite|crunch|jaw|gnaw|munch", "bite"),
    ("claw|slash|cut|scissor|blade|edge|sword|leaf blade|razor shell|night slash", "slash"),
    ("horn|drill|megahorn", "horn"), ("tail|whip", "tail"), ("peck|beak", "peck"), ("wing|feather|brave bird", "wing"),
    ("hurricane|tornado|twister", "twister"), ("gust|wind|tailwind|defog|air ", "wind"),
    ("quake|magnitude|bulldoze|stomping|fissure|earth", "quake"), ("dig", "burrow"),
    ("rock|stone|boulder|smack down|ancient", "rock"), ("bone", "bone"), ("sand|mud", "sand"),
    ("powder|spore|cotton", "powder"), ("sing|song|voice|growl|roar|screech|noise|sound|buzz|howl|chatter|uproar|echoed|round|perish|snarl", "sound"),
    ("petal", "petals"), ("leaf|razor leaf|magical leaf|trailblaze", "leaf"), ("vine|power whip|grass knot", "vine"), ("seed|bullet seed", "seed"),
    ("needle|sting|missile|spike|pin|toxic spikes", "needle"), ("bubble", "bubble"),
    ("surf|wave|whirlpool|tide|muddy water", "wave"), ("water|hydro|aqua|scald|brine|splash|liquidation|soak|chilling", "spray"),
    ("flame|fire|ember|blaze|heat|inferno|burn|lava|overheat|sunny|will-o", "flame"),
    ("thunder|volt|spark|shock|electro|zap|discharge|charge|nuzzle|wild charge|rising", "spark"),
    ("ice|frost|snow|blizzard|hail|freeze|icicle|aurora|haze|mist|sheer cold|chill", "ice"),
    ("psych|confus|zen|dream|future|psy|extrasensory|teleport|kinesis|calm mind|stored power|expanding|synchronoise|miracle", "psywave"),
    ("shadow|hex|night|curse|phantom|ghost|spite|grudge|destiny|ominous|astonish|lick|poltergeist", "shadow"),
    ("sludge|acid|poison|gunk|toxic|smog|venom|corrosive|belch|clear smog", "sludge"),
    ("dragon|draco|outrage|scale", "dragon"), ("moon|fairy|dazzling|charm|disarming|sweet|play rough|draining kiss|misty|alluring", "glow"),
    ("kiss", "kiss"), ("beam|ray|cannon|flash|gleam|pulse|signal", "beam"), ("ball|bomb|orb|sphere|blast", "orb"),
    ("slam|press|body|crash|heavy|steamroller", "slam"), ("roll|spin|gyro|rapid", "roll"),
    ("protect|detect|guard|shield|endure", "shield"), ("reflect|screen|barrier|veil|safeguard", "barrier"),
    ("recover|rest|roost|synthesis|moonlight|wish|heal|aromatherapy|refresh|soft-boiled|life dew|swallow|aqua ring|ingrain|strength sap", "heal"),
    ("dance|swords", "dance"), ("glare|leer|look|face|stare|foresight|odor|lock-on|mind reader|taunt|torment", "gaze"),
    ("wrap|bind|constrict|clamp|squeeze|infestation", "wrap"), ("tackle|take down|double-edge|headbutt|ram|charge|rush|giga impact|struggle", "tackle"),
    ("quick|extreme speed|agility|feint|fake|sucker|pursuit|u-turn|volt switch|flip turn|aqua jet|first impression|upper hand", "dash"),
]

def anim_for(name, mtype, cat):
    n = " " + name.lower() + " "
    for pat, a in ANIM_RULES:
        for p in pat.split("|"):
            if p in n:
                return a
    if cat == "status":
        return "glow"
    return "tackle" if cat == "physical" else "beam"

STAT_SHORT = {"attack": "atk", "defense": "def", "special-attack": "spatk", "special-defense": "spdef",
              "speed": "speed", "accuracy": "acc", "evasion": "evasion"}
AIL = {"paralysis": "para", "burn": "burn", "freeze": "freeze", "poison": "poison", "sleep": "sleep",
       "confusion": "confuse", "trap": "trap", "infatuation": "infatuate", "leech-seed": "leech",
       "nightmare": "nightmare", "perish-song": "perish", "yawn": "drowsy", "disable": "disable",
       "embargo": "seal", "torment": "seal", "silence": "seal", "heal-block": "seal", "ingrain": "heal_over_time",
       "no-type-immunity": "foresight"}

# status moves without a clean meta reading: (role, chips, tags[, reaction kind])
UNIQUE = {
    "acupressure": ("utility", 1, "random_stat_up_big"), "after_you": ("utility", 1, "speed_up"),
    "ally_switch": ("reaction", 1, "", "dodge"), "aqua_ring": ("utility", 1, "heal_over_time"),
    "aromatherapy": ("utility", 1, "cure_status"), "heal_bell": ("utility", 1, "cure_status"), "refresh": ("utility", 1, "cure_status"),
    "assist": ("utility", 1, "random_move"), "copycat": ("utility", 1, "copy_move"), "me_first": ("utility", 1, "copy_move"),
    "baton_pass": ("utility", 1, "pass_boosts"), "bestow": ("utility", 1, "chip_gift"),
    "block": ("disruption", 1, "trap"), "camouflage": ("utility", 1, "retype"), "conversion_2": ("utility", 1, "retype_resist"),
    "reflect_type": ("utility", 1, "retype"), "soak": ("disruption", 1, "retype_foe"),
    "curse": ("utility", 1, "atk_up def_up speed_down_self"), "defog": ("disruption", 1, "evasion_down clear_field"),
    "corrosive_gas": ("disruption", 1, "chip_drain"), "embargo": ("disruption", 1, "seal"), "magic_room": ("disruption", 1, "seal"),
    "entrainment": ("disruption", 1, "seal"), "gastro_acid": ("disruption", 1, "seal"), "simple_beam": ("disruption", 1, "seal"),
    "worry_seed": ("disruption", 1, "seal"), "role_play": ("utility", 1, "copy_skill"), "skill_swap": ("utility", 1, "copy_skill"),
    "follow_me": ("disruption", 1, "taunt"), "rage_powder": ("disruption", 1, "taunt"), "spotlight": ("disruption", 1, "taunt"),
    "guard_split": ("utility", 2, "average_stats"), "power_split": ("utility", 2, "average_stats"),
    "guard_swap": ("utility", 1, "swap_stats"), "power_swap": ("utility", 1, "swap_stats"), "speed_swap": ("utility", 1, "swap_stats"),
    "power_trick": ("utility", 1, "swap_stats"), "psych_up": ("utility", 1, "copy_boosts"),
    "healing_wish": ("utility", 2, "self_faint heal_next"), "memento": ("disruption", 2, "self_faint atk_down_big spatk_down_big"),
    "helping_hand": ("utility", 1, "power_up_next"), "imprison": ("disruption", 1, "seal"), "laser_focus": ("utility", 1, "crit_next"),
    "magnet_rise": ("utility", 1, "levitate"), "nature_power": ("utility", 1, "random_move"),
    "pain_split": ("utility", 2, "average_hp"), "psycho_shift": ("disruption", 1, "pass_status"), "quash": ("disruption", 1, "speed_down_big"),
    "snatch": ("reaction", 1, "", "steal_status"), "stockpile": ("utility", 1, "def_up spdef_up stockpile"),
    "swallow": ("utility", 1, "heal needs_stockpile"), "strength_sap": ("utility", 2, "heal atk_down"),
    "taunt": ("disruption", 1, "taunt"), "torment": ("disruption", 1, "seal"), "trick": ("disruption", 1, "swap_focus"),
    "switcheroo": ("disruption", 1, "swap_focus"), "recycle": ("utility", 1, "chip_gain"), "wish": ("utility", 2, "heal_delayed"),
    "shell_smash": ("utility", 2, "atk_up_big spatk_up_big speed_up_big def_down_self spdef_down_self"),
    "odor_sleuth": ("utility", 1, "foresight"), "miracle_eye": ("utility", 1, "foresight"),
    "perish_song": ("disruption", 2, "perish"), "nightmare": ("disruption", 1, "nightmare"),
    "electric_terrain": ("utility", 1, "terrain_electric"), "grassy_terrain": ("utility", 1, "terrain_grassy"),
    "misty_terrain": ("utility", 1, "terrain_misty"), "psychic_terrain": ("utility", 1, "terrain_psychic"),
    "gravity": ("utility", 1, "gravity"), "hail": ("utility", 1, "weather_snow"), "snowscape": ("utility", 1, "weather_snow"),
    "sandstorm": ("utility", 1, "weather_sand"), "trick_room": ("utility", 2, "trick_room"), "wonder_room": ("utility", 1, "swap_defenses"),
    "mud_sport": ("utility", 1, "weaken_type"), "water_sport": ("utility", 1, "weaken_type"), "aurora_veil": ("utility", 2, "barrier_both"),
    "lucky_chant": ("utility", 1, "no_crit"), "safeguard": ("utility", 2, "status_shield"), "spikes": ("utility", 1, "hazard"),
    "stealth_rock": ("utility", 2, "hazard"), "toxic_spikes": ("utility", 1, "hazard poison"), "tailwind": ("utility", 1, "speed_up_big"),
    "dragon_cheer": ("utility", 1, "crit_up"), "swagger": ("disruption", 1, "confuse foe_atk_up"), "flatter": ("disruption", 1, "confuse foe_spatk_up"),
    "sweet_scent": ("disruption", 1, "evasion_down_big"), "teeter_dance": ("disruption", 2, "confuse"),
    "grass_whistle": ("disruption", 2, "sleep"), "venom_drench": ("disruption", 1, "atk_down spatk_down speed_down"),
    "tickle": ("disruption", 1, "atk_down def_down"), "play_nice": ("disruption", 1, "atk_down"), "confide": ("disruption", 1, "spatk_down"),
    "telekinesis": ("disruption", 1, "acc_up"),
}
# damaging moves the meta can't size: (chips, tags, fixed)
VARPOWER = {
    "beat_up": (2, "multi_hit", None), "endeavor": (2, "", "match_hp"), "final_gambit": ("F1", "self_faint", "user_hp"),
    "fling": (1, "item_play", None), "frustration": (2, "friendship_scaling", None), "return": (2, "friendship_scaling", None),
    "grass_knot": (2, "weight_scaling", None), "heat_crash": (3, "weight_scaling", None), "heavy_slam": (3, "weight_scaling", None),
    "gyro_ball": (2, "speed_scaling", None), "natural_gift": (2, "item_play", None), "present": (1, "random_power", None),
    "punishment": (2, "bonus_vs_boosted", None), "spit_up": ("F1", "needs_stockpile", None), "trump_card": ("F1", "power_grows", None),
    "wring_out": ("F2", "bonus_vs_healthy", None), "hard_press": (2, "bonus_vs_healthy", None),
}
# newer moves with missing meta in the source: the obvious reading
NEWMETA = {
    "axe_kick": ("F2", "crash confuse"), "wave_crash": ("F2", "recoil"), "raging_fury": ("F2", "confuse_self"),
    "raging_bull": (3, "breaks_barrier"), "supercell_slam": (3, "crash"), "temper_flare": (2, "power_grows"),
    "rage_fist": (1, "rage"), "pounce": (1, "speed_down"), "trailblaze": (1, "speed_up"), "ice_spinner": (2, "clear_field"),
    "chilling_water": (1, "atk_down"), "tera_blast": (2, ""), "psychic_noise": (2, "seal"), "upper_hand": (1, "flinch"),
    "alluring_voice": (2, "confuse"),
}
FORCE_TYPED0 = {"dark", "steel"}   # Kanto has no Dark or Steel attackers to speak of: these cost Colorless

# ======================================================================== the moves
HAND_BY = {h["id"]: h for h in HAND}
moves = {}

def chips_from_power(gp, hits, pri, eff):
    p = (gp or 60) * hits
    if "recharge" in eff:
        return "F3"
    if pri >= 1 and p <= 50:
        return 1
    if p <= 50: return 1
    if p <= 85: return 2
    if p <= 115: return 3
    return "F2" if p <= 130 else "F3"

def auto_move(api_id, a):
    i = mid(api_id)
    cls = a["class"]
    mtype = a["type"] if a["type"] in TYPE_MAP else "normal"
    acc = a["accuracy"]
    eff, hits_states, react, two, fixed = [], [], None, None, None
    role = "offense" if cls != "status" else "utility"
    chance = None
    short = clean(a["short"]).lower()
    ail = a["ailment"]
    if ail in AIL and AIL[ail] not in eff:
        eff.append(AIL[ail])
        if a["ailment_chance"]:
            chance = a["ailment_chance"]
    if ail == "poison" and "badly" in short:
        eff[-1] = "bad_poison"
    if a["flinch_chance"]:
        eff.append("flinch"); chance = chance or a["flinch_chance"]
    if a["drain"] and a["drain"] > 0: eff.append("drain")
    if a["drain"] and a["drain"] < 0: eff.append("recoil")
    if a["healing"] and a["healing"] > 0: eff.append("heal")
    if a["crit_rate"]: eff.append("high_crit")
    hits = 1
    if a["min_hits"]:
        eff.append("multi_hit")
        hits = 3 if a["max_hits"] and a["max_hits"] >= 5 else (a["max_hits"] or 2)
    for st, ch in a["stat_changes"]:
        s = STAT_SHORT.get(st)
        if not s: continue
        big = "_big" if abs(ch) >= 2 else ""
        if cls == "status":
            if a["target"] in ("user", "users-field", "user-and-allies", "user-or-ally", "all-allies"):
                t = "%s_up%s" % (s, big) if ch > 0 else "%s_down_self" % s
            else:
                t = "%s_down%s" % (s, big) if ch < 0 else "foe_%s_up" % s
        else:
            if a["category"] == "damage-raise" or (a["category"] in (None, "damage") and ch < 0 and a["stat_chance"] == 0):
                t = "%s_up" % s if ch > 0 else "%s_down_self" % s
            else:
                t = "%s_down%s" % (s, big) if ch < 0 else "%s_up" % s
        if t in ("acc_down_self", "evasion_down_self"): t = t.replace("_self", "")
        if t not in EFFECTS: t = t.replace("_big", "")
        if t not in eff: eff.append(t)
        if a["stat_chance"]: chance = chance or a["stat_chance"]
    if "recharge" in short or "foregoes its next turn" in short: eff.append("recharge")
    if "user faints" in short: eff.append("self_faint")
    if acc is None and cls != "status": eff.append("never_miss"); acc = 100
    if acc is None: acc = 100
    if "first move after the user enters" in short: eff.append("first_turn")
    if "user switches out" in short or "switch out" in short and cls != "status": eff.append("pivot")
    if "sound" in a["text"].lower() and cls != "status" and "sound" not in eff and ("voice" in api_id or "noise" in api_id or "buzz" in api_id): eff.append("sound")
    chips = 1
    if cls != "status":
        gp = a["power"]
        if i in VARPOWER:
            chips, extra, fixed = VARPOWER[i]
            eff += [t for t in extra.split() if t not in eff]
        elif i in NEWMETA:
            chips, extra = NEWMETA[i]
            eff += [t for t in extra.split() if t not in eff]
        elif a["category"] == "ohko":
            chips = "F4"; eff.append("ohko") if "ohko" not in eff else None
        else:
            chips = chips_from_power(gp, hits, a["priority"], eff)
    else:
        if i in UNIQUE:
            u = UNIQUE[i]
            role, chips = u[0], u[1]
            eff = [t for t in u[2].split()]
            if len(u) > 3: react = u[3]
        else:
            foe = a["target"] not in ("user", "users-field", "user-and-allies", "user-or-ally", "all-allies", "entire-field")
            if foe and (any(t in eff for t in ("sleep", "confuse", "infatuate", "trap", "perish", "drowsy", "seal", "disable"))
                        or any(t.endswith("_down") or t.endswith("_down_big") for t in eff)):
                role = "disruption"
            chips = 2 if ("sleep" in eff or ("heal" in eff and a["healing"] >= 50)) else 1
            ups = sum(abs(c) for _, c in a["stat_changes"] if c > 0) if not foe else 0
            if ups >= 3: chips = 2
    return dict(id=i, name=clean(a["name"]), mtype=mtype, cat=cls, role=role, chips=chips, acc=acc, pri=a["priority"],
                eff=" ".join(dict.fromkeys(eff)), chance=chance, fixed=fixed, react=react, two=two, hits=" ".join(hits_states),
                anim=anim_for(a["name"], mtype, cls), desc=first_sentence(a["text"] or a["short"]), src="game", gen=a["gen"],
                game={"power": a["power"], "accuracy": a["accuracy"], "pp": a["pp"], "hits": hits}, api=api_id)

for api_id, a in SRC["moves"].items():
    if api_id in ("struggle",):
        pass
    moves[mid(api_id)] = auto_move(api_id, a)

# hand overrides and new moves
for h in HAND:
    base = moves.get(h["id"], {"id": h["id"], "src": "new", "game": None, "gen": h.get("gen", 1), "chance": None,
                               "fixed": None, "react": None, "two": None, "hits": "", "acc": 100, "pri": 0, "eff": ""})
    for k, v in h.items():
        if k in ("id",): continue
        base[k] = v
    if "src" not in h and base.get("src") is None: base["src"] = "game"
    if base["id"] not in moves and "src" not in h: base["src"] = "game"
    moves[h["id"]] = base

# ======================================================================== species
SP_RAW = SRC["species"]
def sid(api): return api.replace("-", "_")
species_order = [sid(s["api"]) for s in SP_RAW]
by_id = {sid(s["api"]): s for s in SP_RAW}
dex_of = {sid(s["api"]): s["dex"] for s in SP_RAW}
id_of_dex = {v: k for k, v in dex_of.items()}

def card_rarity(r):
    return {"Common": "common", "Uncommon": "uncommon", "Rare": "rare", "Double Rare": "rare"}.get(r, "common")

rarity = {}
for s in species_order:
    t = TCG[dex_of[s]]
    rarity[s] = RARITY_OVERRIDE.get(s, card_rarity(t[2]))

parent = {}
for s in species_order:
    e = by_id[s]["evolution"]
    if e and e["from"] in by_id:
        parent[s] = e["from"]
children = {}
for c, p in parent.items(): children.setdefault(p, []).append(c)

def line_root(s):
    while s in parent: s = parent[s]
    return s

def line_of(s):
    r = line_root(s); out = [r]; i = 0
    while i < len(out):
        out += sorted(children.get(out[i], []), key=lambda x: dex_of[x]); i += 1
    return out

def stage_level(s):
    if s not in parent: return 1
    e = by_id[s]["evolution"]
    if e.get("level"): return int(e["level"])
    # stone, trade and friendship evolutions: a level band for the stage
    return {1: 20, 2: 36}[stage_of(s)]

def stage_of(s):
    n = 0
    while s in parent: s = parent[s]; n += 1
    return n

def pools_for(s):
    t = TCG[dex_of[s]]
    prim = TCG_IDS[t[1]]
    out = [prim]
    for ty in by_id[s]["types"]:
        e = TYPE_MAP[ty]
        if e not in out: out.append(e)
    # Colorless, the default pool, comes last; unless the card itself is Colorless, then it leads
    if prim != "colorless":
        if "colorless" in out: out.remove("colorless")
        out.append("colorless")
    return out

# ======================================================================== signature moves (TCG)
def sig_to_move(sg):
    owner = id_of_dex[sg["dex"]]
    role = {"O": "offense", "U": "utility", "D": "disruption", "R": "reaction"}[sg["role"]]
    mtype = sg.get("mtype") or by_id[owner]["types"][0]
    m = dict(id=sg["id"], name=sg["name"], mtype=mtype, cat=sg["cat"], role=role, chips=sg["chips"],
             acc=sg.get("acc", 100), pri=sg.get("pri", 0), eff=sg["eff"], chance=sg.get("chance"), fixed=None,
             react=sg.get("react"), two=None, hits=sg.get("hits", ""), anim=sg.get("anim") or anim_for(sg["name"], mtype, sg["cat"]),
             desc=sg["desc"], src="tcg", gen=None, game=None, owner=owner, card=sg.get("card", TCG[sg["dex"]][0] + " (Scarlet & Violet 151)"),
             combo=sg.get("combo"), bonus_type=sg.get("bonus_type"), typed=sg.get("typed"), cost_override=sg.get("cost"),
             energy_override=pools_for(owner)[0])
    return m

for sg in SIGS:
    moves[sg["id"]] = sig_to_move(sg)

# ======================================================================== learnsets
def norm_name(n):
    return re.sub(r"[^a-z0-9]+", "_", n.lower().replace("'", "")).strip("_")

learn = {}   # sid -> {"rows": {move: (level, src flags)}, "tm": set, "tutor": set, "egg": set}
for s in species_order:
    raw = by_id[s]["learn"]
    rows, tm, tutor, egg = {}, set(), set(), set()
    st_lv = stage_level(s)
    for api_id, r in raw.items():
        m = mid(api_id)
        if m not in moves: continue
        if r.get("level") is not None:
            lv = int(r["level"])
            if lv <= 0: lv = st_lv          # an evolution move
            rows[m] = {"level": max(1, min(100, lv)), "src": "game"}
        elif r.get("tm"): tm.add(m)
        elif r.get("tutor"): tutor.add(m)
        elif r.get("egg"): egg.add(m)
    learn[s] = {"rows": rows, "tm": tm, "tutor": tutor, "egg": egg}

def tier_of(chips):
    if isinstance(chips, str): return "finisher"
    return "opener" if chips == 1 else "mid"

def add_row(s, m, src, flag=None):
    L = learn[s]
    if m in L["rows"]:
        if flag: L["rows"][m][flag] = True
        return
    if m in L["tm"] or m in L["tutor"] or m in L["egg"]:
        # learnable another way: also flag it on a level row for the anime / TCG
        for k in ("tm", "tutor", "egg"): L[k].discard(m)
    mv = moves[m]
    t = tier_of(mv["chips"])
    key = t if mv["role"] in ("offense", "two_phase") else "other"
    lv = stage_level(s) + B["learn_levels"][key]
    row = {"level": max(1, min(100, lv)), "src": src}
    if flag: row[flag] = True
    L["rows"][m] = row

for s in species_order:
    d = dex_of[s]
    for a in TCG[d][5]:
        if a.endswith("*"): continue
        n = norm_name(a)
        if n in moves:
            add_row(s, n, "tcg" if moves[n]["src"] == "tcg" else "game", "tcg")
    for m in ANIME.get(s, "").split():
        if m not in moves:
            raise SystemExit("anime move %s for %s is not a move" % (m, s))
        add_row(s, m, "anime", "anime")
    for sg in SIGS:
        if sg["dex"] == d: add_row(s, sg["id"], "tcg", "tcg")
    if s in DODGE: add_row(s, "dodge", "anime")
    if s in GROUND_POUND: add_row(s, "ground_pound", "new")

# every Pokémon can Struggle; the very basic ones get a few design fallbacks so each has all three tiers
FALLBACK = {"opener": "tackle", "mid": "headbutt", "finisher": "struggle"}

# ======================================================================== added level-up moves
# two-phase and reaction moves the user asked for (src "added", each with a _note): only where
# they fit the species and the anime. Levels: balance learn_levels added_two_phase /
# added_reaction after the stage's first level.
FLYERS = ["charizard", "pidgey", "pidgeotto", "pidgeot", "spearow", "fearow", "zubat", "golbat", "farfetchd",
          "aerodactyl", "articuno", "zapdos", "moltres", "dragonite"]
ADDED_MOVES = [
    ("dig", lambda s: "ground" in by_id[s]["types"], "a ground type: it digs"),
    ("fly", lambda s: s in FLYERS, "it flies (wings that carry it)"),
    ("solar_beam", lambda s: "grass" in by_id[s]["types"], "a grass type: it gathers sunlight"),
    ("dive", lambda s: s in ["squirtle", "wartortle", "blastoise", "psyduck", "golduck", "poliwag", "poliwhirl", "poliwrath",
                             "tentacool", "tentacruel", "seel", "dewgong", "horsea", "seadra", "goldeen", "seaking",
                             "lapras", "vaporeon", "gyarados"], "a swimmer: it dives"),
    ("bounce", lambda s: s == "magikarp", "Magikarp's famous flop, as in the games (Bounce)"),
    ("skull_bash", lambda s: s in ["squirtle", "wartortle", "blastoise", "rhyhorn", "rhydon"], "a hard head or shell to ram with (Squirtle's line, as in the games and the anime; Rhyhorn's line)"),
    ("sky_attack", lambda s: s in ["pidgeot", "fearow", "dodrio", "farfetchd", "aerodactyl", "articuno", "zapdos", "moltres"], "a great bird: it dives from the sky"),
    ("razor_wind", lambda s: s in ["farfetchd", "scyther", "butterfree"], "blades or wings that whip up a cutting wind"),
    ("counter", lambda s: "fighting" in by_id[s]["types"], "a fighter: it answers a blow"),
    ("detect", lambda s: s in ["mankey", "primeape", "poliwrath", "hitmonlee", "hitmonchan"], "a quick fighter: it reads the blow coming"),
    ("mirror_coat", lambda s: "psychic" in by_id[s]["types"], "a psychic type: it turns a beam back"),
    ("dodge", lambda s: by_id[s]["stats"]["speed"] >= 90 or s in ["pikachu", "rattata", "abra", "zubat", "ponyta", "voltorb", "eevee"],
     "quick or evasive (base speed 90 or more, or nimble in the anime)"),
    ("protect", lambda s: by_id[s]["stats"]["defense"] >= 110 or s in ["shellder", "metapod", "kakuna", "omanyte", "kabuto", "kabutops"],
     "a hard shell or hide to hide behind"),
]
for s in species_order:
    L = learn[s]
    for m, test, note in ADDED_MOVES:
        if m not in moves or not test(s) or m in L["rows"]: continue
        for k in ("tm", "tutor", "egg"): L[k].discard(m)
        key = "added_two_phase" if moves[m]["role"] == "two_phase" else "added_reaction"
        L["rows"][m] = {"level": max(1, min(100, stage_level(s) + int(B["learn_levels"].get(key, 8)))), "src": "added", "_note": note}

# evolutions inherit everything from the previous stage
for s in sorted(species_order, key=lambda x: (stage_of(x), dex_of[x])):
    if s in parent:
        P, C = learn[parent[s]], learn[s]
        for m, row in P["rows"].items():
            if m not in C["rows"]:
                r = dict(row); r["inherited"] = True
                for k in ("tm", "tutor", "egg"): C[k].discard(m)
                C["rows"][m] = r
            elif row["level"] < C["rows"][m]["level"]:
                C["rows"][m]["level"] = row["level"]
        for k in ("tm", "tutor", "egg"):
            for m in P[k]:
                if m not in C["rows"] and not any(m in C[o] for o in ("tm", "tutor", "egg")):
                    C[k].add(m)

# the signature mechanics early enough to be played (balance learn_levels finisher_by, two_phase_by):
# a species whose first level-up finisher (or two-phase move) comes more than N levels after its
# stage's first level learns that move at that level instead (its evolutions keep the earlier level)
for s in sorted(species_order, key=lambda x: (stage_of(x), dex_of[x])):
    rows_ = learn[s]["rows"]
    if s in parent:
        for m, row in learn[parent[s]]["rows"].items():
            if m in rows_ and row["level"] < rows_[m]["level"]: rows_[m]["level"] = row["level"]
    for kind, test in (("finisher_by", lambda mm: isinstance(mm["chips"], str) and mm["role"] != "two_phase"), ("two_phase_by", lambda mm: mm["role"] == "two_phase")):
        n = B["learn_levels"].get(kind)
        if n is None: continue
        # its own type's first (a Water type's Hydro Pump before a Double-Edge), else the first
        own = lambda m: moves[m].get("mtype") in by_id[s]["types"]
        cand = sorted((not own(m), r["level"], m) for m, r in rows_.items() if test(moves[m]))
        if not cand: continue
        _, lv0, m0 = cand[0]
        if any(r["level"] <= stage_level(s) + int(n) and test(moves[m]) and (own(m) or not own(m0)) for m, r in rows_.items()): continue
        cap = stage_level(s) + int(n)
        if lv0 > cap:
            rows_[m0]["level"] = cap
            rows_[m0]["moved_from"] = lv0

# ======================================================================== signature detection
learners = {}
for s in species_order:
    L = learn[s]
    for m in list(L["rows"]) + list(L["tm"]) + list(L["tutor"]) + list(L["egg"]):
        learners.setdefault(m, set()).add(line_root(s))

UNIVERSAL = {"struggle", "tackle", "headbutt", "dodge"}
for i, m in moves.items():
    if m.get("src") == "tcg":
        m["signature"] = True
        m["rarity"] = rarity[m["owner"]]
    elif i not in UNIVERSAL and len(learners.get(i, ())) == 1 and m.get("src") in ("game",):
        root = next(iter(learners[i]))
        m["signature"] = True
        m["owner"] = root
        m["rarity"] = m.get("rarity") or rarity[root]
    else:
        m["signature"] = False
        m["owner"] = None
        m["rarity"] = m.get("rarity") if m.get("rarity") in RARITIES and m.get("src") != "new" else "common"

# ======================================================================== numbers
def is_finisher(m): return isinstance(m["chips"], str)

def nchips(m): return int(m["chips"][1:]) if is_finisher(m) else int(m["chips"])

def power_mods(m):
    """the multiplier on the tier's base numbers, from the move's own data (written out as power_mods)"""
    mods = {}
    acc = m["acc"] if m["acc"] else 100
    mods["accuracy"] = round(1 + (100 - acc) * B["accuracy_k"], 4) if acc < 100 else 1.0
    mods["priority"] = B["priority_mult"].get(str(max(-1, min(3, m["pri"]))), 1.0)
    e = 1.0
    ch = m.get("chance")
    for t in m["eff"].split():
        w = tag_weight(t)
        if ch and t in CHANCE_TAGS:
            w = 1 - (1 - w) * ch / 100.0     # a side effect that rarely happens costs little power
        e *= w
    mods["effects"] = round(e, 4)
    mods["two_phase"] = B["two_phase_mult"] if m.get("two") else 1.0
    # the unreachable states the counter table lets it hit
    nst = len({r["vs"] for r in ALL_ROWS if r["move"] == m["id"] and r.get("hits") and r["vs"] in UNREACHABLE})
    mods["hits_states"] = round(B["hits_state_mult"] ** nst, 4)
    mods["role"] = B["role_power_mult"][m["role"]] if m["role"] != "offense" else 1.0
    g = m.get("game") or {}
    gp = g.get("power")
    if gp and "multi_hit" not in m["eff"].split():
        ref = B["game_power_ref"]["finisher" if is_finisher(m) else str(min(3, nchips(m)))]
        f = (gp * (g.get("hits") or 1) / ref) ** B["game_power_blend"]
        lo, hi = B["game_power_clamp"]
        mods["game_power"] = round(max(lo, min(hi, f)), 4)
    else:
        mods["game_power"] = 1.0
    mods["tune"] = float(TUNE.get("moves", {}).get(m["id"], {}).get("power", 1.0))
    tot = 1.0
    for v in mods.values(): tot *= v
    return mods, tot

def deals_damage(m):
    # fixed-damage and one-hit-knockout moves also carry a power: the engine's fallback
    # until it reads fixed_damage (and the planner's sense of the move's worth)
    return m["cat"] != "status" and m["role"] not in ("reaction",)

# the engine's tag names (battle/pkmn_battle.gd _effect) where the design's names differ
TAG_RENAME = {"drain": "absorb", "leech": "drain", "foresight": "identify", "cancels_dodge": "sure_hit",
              "breaks_protect": "break_protect", "def_down_big": "def_down2"}
def rn(t): return TAG_RENAME.get(t, t)

# the reaction kinds in the engine's lock terms: {trigger: any | attack | physical | special, effect: evade | block | counter, scope}
REACT = {"dodge": ("any", "evade", "next"), "protect": ("attack", "block", "turn"), "protect_priority": ("attack", "block", "next"),
         "counter_physical": ("physical", "counter", "next"), "counter_special": ("special", "counter", "next"),
         "counter_any": ("attack", "counter", "next"), "bide": ("attack", "counter", "next"), "endure": ("attack", "endure", "next"),
         "guard": ("attack", "guard", "next"), "destiny": ("attack", "destiny", "next"), "bounce_status": ("any", "bounce", "next"),
         "steal_status": ("any", "steal", "next")}
REACT_PRIORITY = {"protect": 4, "protect_priority": 4}
UNREACHABLE = ("underground", "airborne", "underwater")   # only Dig, Fly, Dive and Bounce (and Sky Drop's airborne turn is charging here)

# the counter table: battle_config counters.rows, plus the design's extra rows (written to the balance file;
# Kanto151Data.install() appends them to the engine's table)
CFG_ROWS = CFG.get("counters", {}).get("rows", [])
EXTRA_ROWS = [
    {"move": "smack_down", "vs": "airborne", "hits": True, "mult": 1.5, "pull_out": 1.0},
    {"move": "dimensional_hand", "vs": "underground", "hits": True, "mult": 1.0},
    {"move": "dimensional_hand", "vs": "airborne", "hits": True, "mult": 1.0},
    {"move": "dimensional_hand", "vs": "underwater", "hits": True, "mult": 1.0},
    {"move": "multishot_lightning", "vs": "airborne", "hits": True, "mult": 1.0},
    {"move": "hurricane", "vs": "airborne", "hits": True, "mult": 1.0},
    {"move": "feint", "vs": "charging", "hits": True},
]
ALL_ROWS = CFG_ROWS + [r for r in EXTRA_ROWS if not any(c.get("move") == r["move"] and c.get("vs") == r["vs"] for c in CFG_ROWS)]
def rows_hitting(state):
    return sorted({r["move"] for r in ALL_ROWS if r.get("vs") == state and r.get("hits")})

out_moves = {}
for i in sorted(moves):
    m = moves[i]
    if m["role"] == "offense" and m.get("two"): m["role"] = "two_phase"
    if m.get("react"): m["role"] = "reaction"
    if m.get("two") == "vanished": m["two"] = "charging"
    if i == "sky_drop": m["two"] = "charging"
    energy = m.get("energy_override") or TYPE_MAP[m["mtype"]]
    if m.get("src") == "tcg":
        energy = TYPE_MAP.get(m["mtype"], energy) if m.get("mtype") and TYPE_MAP.get(m["mtype"]) in pools_for(m["owner"]) else pools_for(m["owner"])[0]
    tier = tier_of(m["chips"])
    n = nchips(m)
    typed = m.get("typed")
    if typed is None:
        if m["role"] in ("offense", "two_phase") or (m["role"] == "disruption" and m["cat"] != "status"):
            typed = 0 if energy == "colorless" else (1 if n <= 2 else 2)
        else:
            typed = 0
    if m["mtype"] in FORCE_TYPED0 and m.get("src") != "tcg": typed = 0
    if is_finisher(m):
        ftype = energy if (typed or m.get("typed") is None) and energy != "colorless" and not (m["mtype"] in FORCE_TYPED0) else "colorless"
        if m.get("typed") == 0: ftype = "colorless"
        cost = {"all": True, "min": n, "type": ftype}
    elif m.get("cost_override"):
        cost = list(m["cost_override"])
        n = len(cost)
    else:
        typed = min(typed, n)
        cost = [energy] * typed + ["colorless"] * (n - typed)
    rar = m["rarity"]
    mods, tot = power_mods(m)
    power, ppc = 0, None
    if deals_damage(m):
        if tier == "finisher":
            power = r5(B["finisher_base"][rar] * tot)
            ppc = max(1, int(round(B["power_per_chip"]["finisher"][rar] * tot)))
        else:
            power = r5(n * B["power_per_chip"][tier][rar] * B["chip_scaling"][str(min(3, n))] * tot)
    elif tier == "finisher":
        ppc = 0
    disrupt = 0
    if m["role"] == "disruption":
        disrupt = int(round(n * B["disrupt_per_chip"][rar] * (B["disrupt_damaging_mult"] if power > 0 else 1.0)))
    effs0 = [t for t in m["eff"].split() if t]
    for t in effs0:
        if t not in EFFECTS:
            UNKNOWN_TAGS.add(t)
    effs = [rn(t) for t in effs0]
    if m["role"] == "disruption" and "disrupt" not in effs: effs.append("disrupt")
    if m.get("fixed") == 40 and "fixed_40" not in effs: effs.append("fixed_40")
    acc = int(m["acc"] or 100)
    if "never_miss" in effs0: acc = 0             # the engine: 0 = never misses
    pri = max(-1, min(3, int(m["pri"])))
    two = None
    if m.get("two"):
        st = m["two"]
        two = {"semi": st, "state": st, "invulnerable": st in UNREACHABLE,
               "on_commit": [rn(t) for t in effs0 if t in ("def_up", "spatk_up")],
               "hit_by": [], "forced_out_by": ["roar", "whirlwind"]}
    counters = None
    hs = sorted({r["vs"] for r in ALL_ROWS if r["move"] == i and r.get("hits") and r["vs"] in UNREACHABLE + ("charging",)})
    if hs or any(t in effs for t in ("break_protect", "sure_hit", "identify", "grounds")) or i in ("roar", "whirlwind", "swift"):
        counters = {"hits_states": [h for h in hs if h != "charging"], "ignores_dodge": any(r["move"] == i and r["vs"] == "dodge" for r in ALL_ROWS),
                    "cancels_dodge": i in CFG.get("counters", {}).get("cancel_dodge", []) or "sure_hit" in effs,
                    "breaks_protect": "break_protect" in effs or any(r["move"] == i and r["vs"] == "protect" and r.get("breaks") for r in ALL_ROWS),
                    "foresight": i in CFG.get("counters", {}).get("identify", []) or "identify" in effs,
                    "forces_out_two_phase": any(r["move"] == i and r.get("force_out") for r in ALL_ROWS)}
    reaction = None
    if m["role"] == "reaction":
        kind = m.get("react") or "protect"
        trig, effect, scope = REACT[kind]
        reaction = {"trigger": trig, "effect": effect, "scope": scope, "kind": kind, "lock": n,
                    "chance": (m.get("chance") or B["reaction"]["default_chance"]) / 100.0}
        if effect == "counter":
            reaction["mult"] = B["reaction"]["bide_mult"] if kind == "bide" else B["reaction"]["return_mult"][rar]
        if kind == "guard": reaction["reduce"] = B["reaction"]["guard_reduce"]
        pri = REACT_PRIORITY.get(kind, 3)
    combo = m.get("combo")
    if combo:
        combo = dict(combo)
        if combo.get("effect") == "power": combo["power_pct"] = B["combo_power_pct"][rar]
    chance = m.get("chance")
    rec = {
        "name": m["name"], "type": m["mtype"], "energy": energy, "category": m["cat"], "role": m["role"], "tier": tier,
        "rarity": rar, "signature": m["signature"], "owner": m.get("owner"),
        "cost": cost, "power": power,
    }
    if tier == "finisher": rec["power_per_chip"] = ppc or 0
    rec.update({
        "fixed_damage": "ohko" if "ohko" in effs else m.get("fixed"), "accuracy": acc, "priority": pri,
        "effects": effs, "chance": round(chance / 100.0, 2) if (chance and m["role"] != "reaction") else None, "disrupt": disrupt,
        "two_phase": two, "counters": counters, "reaction": reaction, "combo": combo,
        "power_mods": mods, "anim": m.get("anim") or "tackle", "desc": clean(m.get("desc") or ""),
        "source": m.get("src") or "game", "gen": m.get("gen"),
    })
    if m.get("bonus_type"): rec["bonus_type"] = m["bonus_type"]
    if m.get("card"): rec["card"] = m["card"]
    if m.get("game"): rec["game"] = {k: v for k, v in m["game"].items()}
    out_moves[i] = rec

if UNKNOWN_TAGS:
    raise SystemExit("unknown effect tags: %s" % sorted(UNKNOWN_TAGS))

# two-phase answers: what hits each state (the counter table)
for i, r in out_moves.items():
    if r["two_phase"]:
        st = r["two_phase"]["semi"]
        r["two_phase"]["hit_by"] = rows_hitting(st) if st in UNREACHABLE else sorted(set(rows_hitting(st)) - {"roar", "whirlwind"})
        r["two_phase"]["hit_by"] = [x for x in r["two_phase"]["hit_by"] if x in out_moves and x not in ("roar", "whirlwind")]

# only the moves the 151 use (plus the designed ones)
used = set()
for s in species_order:
    L = learn[s]
    used |= set(L["rows"]) | L["tm"] | L["tutor"] | L["egg"]

# ======================================================================== species records
def ai_for(s):
    if s in AI: return AI[s]
    st = by_id[s]["stats"]
    off = max(st["attack"], st["special-attack"])
    if st["speed"] >= off + 10 and st["speed"] >= 80: return "evasive"
    if off >= 95: return "aggressive"
    return "strategic"

FC = CFG.get("focus", {})
def focus_for(s):
    """the engine's focus params (battle_config focus: defaults, by_type, species), then the design's
    overrides, then the rarity bonus; written to the species and pushed to the engine by install()"""
    f = {"gain": float(FC.get("gain", 10)), "step": float(FC.get("step", 20)), "chip_cap": int(FC.get("chip_cap", 5)),
         "start": float(FC.get("start", 20)), "disrupt_resist": 0.0}
    for t in by_id[s]["types"]:
        for k, v in FC.get("by_type", {}).get(t, {}).items():
            if k in f: f[k] = v
    own = FC.get("species", {}).get(s)
    if own:
        for k, v in own.items():
            if k in f: f[k] = v
    else:
        o = FOCUS.get(s, {})
        ren = {"chip_every": "step", "max_chips": "chip_cap", "resist": "disrupt_resist"}
        for k, v in o.items():
            f[ren.get(k, k)] = v
    r = rarity[s]
    f["gain"] = float(f["gain"]) + B["focus"]["rarity_gain_bonus"][r] + float(B["focus"].get("stage_gain_bonus", {}).get(str(stage_of(s)), 0))
    f["disrupt_resist"] = round(min(B["focus"]["resist_cap"], float(f["disrupt_resist"]) + B["focus"]["rarity_resist_bonus"][r]), 2)
    t = TUNE.get("species", {}).get(s, {})
    f["gain"] = round(max(4.0, min(20.0, float(f["gain"]) + float(t.get("gain", 0.0)))), 2)
    f["start"] = max(0.0, min(60.0, float(f["start"]) + float(t.get("start", 0.0))))
    f["disrupt_resist"] = round(max(0.0, min(B["focus"]["resist_cap"], f["disrupt_resist"] + float(t.get("disrupt_resist", 0.0)))), 2)
    return {"gain": f["gain"], "step": float(f["step"]), "chip_cap": int(f["chip_cap"]), "start": float(f["start"]), "disrupt_resist": f["disrupt_resist"]}

def evo_record(s):
    e = by_id[s]["evolution"]
    rec = {"line": line_of(s), "stage": stage_of(s), "from": parent.get(s), "into": sorted(children.get(s, []), key=lambda x: dex_of[x]),
           "method": None, "level": None, "item": None}
    if s in parent and e:
        trig = e.get("trigger")
        rec["method"] = {"level-up": "level", "use-item": "stone", "trade": "trade"}.get(trig, trig)
        if trig == "level-up" and e.get("happiness"): rec["method"] = "friendship"
        rec["level"] = e.get("level") or stage_level(s)
        rec["item"] = e.get("item").replace("-", "_") if e.get("item") else None
    return rec

def engine_pools(s):
    # the engine's pools: its types' energy kinds (type_map), typed first, Colorless last, at most three typed
    out = []
    for t in by_id[s]["types"]:
        k = TYPE_MAP[t]
        if k != "colorless" and k not in out: out.append(k)
    return out[:3] + ["colorless"]

def cost_payable(cost, pools):
    if isinstance(cost, dict):
        return cost["type"] in pools
    return all(k in pools for k in cost)

def wild_levels(s):
    r = rk(rarity[s])
    if rarity[s] == "legendary": return [50, 70]
    lo = stage_level(s) if s in parent else 2 + 3 * r
    hi = lo + 6 + 2 * r
    return [min(lo, 95), min(hi, 100)]

def ability_skills(s):
    r = rarity[s]
    if rk(r) < rk("rare"): return []
    abl = [(a.replace("-", "_"), hid) for a, hid in by_id[s].get("abilities", [])]
    if r == "rare": abl = [a for a in abl if not a[1]][:1]
    elif r == "very_rare": abl = [a for a in abl if not a[1]]
    return [a for a, _ in abl if a in GAME_ABILITIES]

def ability_id(a):
    return a + "_ability" if a in SKILLS else a

# battle stats: the games' base stats pulled toward their group's mean total (a TCG-like
# flattening, so a common's typing and moves matter more than its stat line), then the
# rarity bonus and any per-species tuning. Groups: basic (first stage of a line), middle,
# final (last stage of a line), single (no evolutions).
def stat_group(s):
    if s in parent: return "final" if not children.get(s) else "middle"
    return "basic" if children.get(s) else "single"

def bst(s):
    st = by_id[s]["stats"]
    return sum(st[k] for k in ("hp", "attack", "defense", "special-attack", "special-defense", "speed"))

GROUP_MEAN = {}
for g in ("basic", "middle", "final", "single"):
    xs = [bst(x) for x in species_order if stat_group(x) == g and rarity[x] in ("common", "uncommon", "rare")]
    GROUP_MEAN[g] = sum(xs) / max(1, len(xs))
B["stats"]["group_mean_total"] = {g: round(v, 1) for g, v in GROUP_MEAN.items()}

def battle_base(s):
    st = by_id[s]["stats"]
    raw = [st["hp"], st["attack"], st["defense"], st["special-attack"], st["special-defense"], st["speed"]]
    T = float(sum(raw))
    G = GROUP_MEAN[stat_group(s)]
    k = float(B["stats"]["spread"])
    want = (G + (T - G) * k) * (1.0 + float(B["stats"]["rarity_bonus"][rarity[s]])) * (1.0 + float(B["stats"].get("group_bonus", {}).get(stat_group(s), 0.0)))
    want *= 1.0 + float(TUNE.get("species", {}).get(s, {}).get("stats", 0.0))
    # an evolution is always a step up: at least evolution_floor more than the stage before
    if s in parent:
        want = max(want, sum(battle_base(parent[s])) * (1.0 + float(B["stats"].get("evolution_floor", 0.08))))
    # the shape: each stat pulled toward the species' own average (shape 1 = the games' shape),
    # so a glass cannon or a wall (Chansey's Defense 5) is less extreme
    sh = float(B["stats"].get("shape", 1.0))
    avg = T / 6.0
    shaped = [avg + (x - avg) * sh for x in raw]
    return [max(5, int(round(x * want / T))) for x in shaped]

species_out = {}
for s in species_order:
    d = dex_of[s]
    t = TCG[d]
    L = learn[s]
    pools = engine_pools(s)
    rows = sorted(({"level": r["level"], "move": m, **{k: v for k, v in r.items() if k not in ("level",)}} for m, r in L["rows"].items()),
                  key=lambda x: (x["level"], x["move"]))
    allm = [r["move"] for r in rows] + sorted(L["tm"]) + sorted(L["tutor"]) + sorted(L["egg"])
    tiers = {"opener": [], "mid": [], "finisher": []}
    for m in allm:
        tiers[out_moves[m]["tier"]].append(m)
    def has_inpool(tier):
        return any(cost_payable(out_moves[m]["cost"], pools) and out_moves[m]["power"] > 0 for m in tiers[tier]
                   if out_moves[m]["role"] in ("offense", "two_phase", "disruption"))
    for tier, fb in FALLBACK.items():
        if not has_inpool(tier):
            add_row(s, fb, "design")
            r = L["rows"][fb]
            rows.append({"level": r["level"], "move": fb, "src": "design"})
            # its evolutions (always later in the Pokédex) inherit the design move too
            stack = list(children.get(s, []))
            while stack:
                c = stack.pop()
                stack += children.get(c, [])
                if fb not in learn[c]["rows"]:
                    learn[c]["rows"][fb] = {"level": r["level"], "src": "design", "inherited": True}
                    for k in ("tm", "tutor", "egg"): learn[c][k].discard(fb)
            for k in ("tm", "tutor", "egg"):
                if fb in L[k]: L[k].discard(fb)
            if fb not in tiers[tier]: tiers[tier].append(fb)
            used.add(fb)
            allm = [x for x in allm if x != fb] + [fb]
    rows.sort(key=lambda x: (x["level"], x["move"]))
    st = by_id[s]["stats"]
    sigs = sorted({m for m in allm if out_moves[m]["signature"]})
    skills = sorted([k for k, v in SKILLS.items() if v[0] == d] + [ability_id(a) for a in ability_skills(s)])
    rec = {
        "dex": d, "name": by_id[s]["name"], "types": by_id[s]["types"], "energy": pools, "rarity": rarity[s],
        "weight_kg": round(float(by_id[s].get("weight", 0)) / 10.0, 1), "height_m": round(float(by_id[s].get("height", 0)) / 10.0, 1),
        "weakness": [TCG_IDS[t[3]]] if t[3] else [], "resistance": [TCG_IDS[t[4][0]]] if t[4] else [],
        "base": battle_base(s),
        "base_game": [st["hp"], st["attack"], st["defense"], st["special-attack"], st["special-defense"], st["speed"]],
        "catch_rate": CATCH_RATE.get(s, 45),
        "stat_group": stat_group(s),
        "wild_levels": wild_levels(s),
        "learnset": rows,
        "tm": sorted(L["tm"] | L["tutor"]), "tutor": sorted(L["tutor"]), "egg": sorted(L["egg"]),
        "ai": ai_for(s),
        "focus_profile": focus_for(s),
        "tcg": {"card": t[0], "type": TCG_IDS[t[1]], "rarity": t[2], "set": "Scarlet & Violet 151 (sv3pt5)",
                "weakness": "x2" if t[3] else None, "resistance": t[4][1] if t[4] else None,
                "attacks": [a for a in t[5] if not a.endswith("*")], "abilities": [a[:-1] for a in t[5] if a.endswith("*")]},
        "evolution": evo_record(s),
        "start": sorted({r["move"] for r in rows if r["level"] <= 1}),
        "openers": tiers["opener"], "mids": tiers["mid"], "finishers": tiers["finisher"],
        "signature": sigs, "skills": skills,
        "off_pool": sorted(m for m in allm if not cost_payable(out_moves[m]["cost"], pools)),
    }
    if not rec["start"]:
        rec["start"] = [rows[0]["move"]]
    if s in NOTES: rec["_notes"] = NOTES[s]
    species_out[s] = rec

# ======================================================================== matchups (from the species data)
mat = {a: {d: {"weak": 0, "resist": 0, "of": 0} for d in POOLS} for a in POOLS}
for s, r in species_out.items():
    dprim = r["tcg"]["type"]
    for a in POOLS: mat[a][dprim]["of"] += 1
    for w in r["weakness"]: mat[w][dprim]["weak"] += 1
    for w in r["resistance"]: mat[w][dprim]["resist"] += 1
summary = {}
for a in POOLS:
    row = {}
    for d in POOLS:
        c = mat[a][d]
        if c["of"] == 0: continue
        if c["weak"] * 2 >= c["of"]: row[d] = "x2"
        elif c["resist"] * 2 >= c["of"]: row[d] = "resisted"
        elif c["weak"]: row[d] = "x2 (%d of %d)" % (c["weak"], c["of"])
        elif c["resist"]: row[d] = "resisted (%d of %d)" % (c["resist"], c["of"])
    summary[a] = row

# ======================================================================== write
used |= {"dodge", "ground_pound", "struggle"}
# keys without a value are left out (the engine reads m.get(key, default))
moves_final = {i: {k: v for k, v in out_moves[i].items() if v is not None} for i in sorted(used)}
skills_final = {k: {"name": v[1], "owner": id_of_dex[v[0]], "effects": v[2].split(), "desc": v[3], "source": "tcg"} for k, v in SKILLS.items()}
for s in species_order:
    for a in ability_skills(s):
        k = ability_id(a)
        if k in skills_final:
            skills_final[k]["owners"] = sorted(set(skills_final[k].get("owners", [skills_final[k]["owner"]])) | {s}, key=lambda x: dex_of[x])
            continue
        tag, line = GAME_ABILITIES[a]
        skills_final[k] = {"name": line.split(":")[0], "owner": s, "owners": [s], "effects": [tag], "desc": line.split(": ", 1)[1], "source": "game"}
for k, v in skills_final.items():
    v.setdefault("owners", [v["owner"]])

MOVE_SCHEMA = {
    "_file": "A move catalog in the moves.json schema ({\"moves\": {id: move}}), merged over moves.json by id (Kanto151Data.install()). Built by tools/native/kanto151/gen.py from the main-series game data (every move each Kanto species can learn in any game), the Scarlet & Violet 151 TCG attacks and the Indigo League anime; its numbers come from kanto151_balance.json. Engine keys first, then the design's extra keys.",
    "name": "string, shown UPPERCASE", "type": "the move's Pokemon type (main series); its energy kind is kanto151.json type_energy (balance type_map)",
    "energy": "extra: the energy kind its typed chips draw on (type_energy of type), for display and tests",
    "category": "physical | special | status", "role": "offense | reaction | two_phase | disruption | utility",
    "tier": "opener (1 chip) | mid (2 to 3 chips) | finisher (all chips)",
    "cost": "an Array of energy kinds (a typed chip pays its own kind or a Colorless cost; colorless is paid by any chip), or a finisher {all: true, min: N, type: kind | colorless}",
    "power": "the damage power; a finisher's base power", "power_per_chip": "finisher only: power added per chip spent",
    "accuracy": "0 to 100; 0 = never misses", "priority": "higher acts first (reactions 3 to 4, Quick Attack 1, Roar -1)",
    "effects": "tags (the engine's names where it has them: acc_down atk_down def_down def_down2 speed_down def_up evasion_up speed_up para burn sleep poison confuse drain (Leech Seed) flinch high_crit recoil trap force_out fixed_40 wind clear_field disrupt sure_hit identify break_protect); every tag is defined with its numbers in kanto151_balance.json effects",
    "chance": "0 to 1: a damaging move's side-effect chance (null: battle_config damage.status_effect_chance)",
    "reaction": "reaction only: {trigger: any | attack | physical | special, effect: evade | block | counter (engine) | endure | guard | destiny | bounce | steal (design, for the engine to add), scope: next | turn, mult (counter), kind (the design's name), lock (chips), chance (0 to 1), reduce (guard)}",
    "two_phase": "two_phase only: {semi: underground | airborne | underwater | charging, on_commit: [tags], invulnerable (only Dig, Fly, Dive and Bounce), hit_by (the counter table's moves that reach that state), forced_out_by}",
    "anim": "a shared animation / VFX family", "desc": "one short line for the move list",
    "rarity": "extra: the tuning class of its numbers (shared moves are common; a signature move carries its owner's rarity)",
    "signature": "extra: true when only one evolution line can use it (a TCG attack, or a game move only that line learns)", "owner": "extra: the line's first species for a signature move",
    "fixed_damage": "extra: null, a number, level, half_hp, match_hp, user_hp or ohko (power is the engine's fallback until it reads this)",
    "disrupt": "extra: focus points the foe loses (disruption moves); install() writes these into battle_config disruption.moves",
    "counters": "extra: what the counter table (battle_config counters.rows plus balance counter_rows_extra) says about this move: hits_states, ignores_dodge, cancels_dodge, breaks_protect, foresight, forces_out_two_phase",
    "combo": "extra: {after: [move ids] | after_type | after_role | before, effect: power | enables | skip_commit | never_miss, power_pct}",
    "power_mods": "extra: the multipliers the generator applied to the tier's numbers (accuracy, priority, effects, two_phase, hits_states, role, game_power); the test recomputes power from these and the balance file",
    "source": "extra: game | tcg | anime | new", "gen": "extra: the game generation it debuts in",
    "game": "extra: the main-series numbers it was converted from (power, accuracy, pp, hits)", "card": "extra: TCG moves, the card", "bonus_type": "extra: bonus_vs_type moves, the energy kind",
}
SKILL_SCHEMA = {"_doc": "Passive skills: TCG abilities (source tcg) and main-series abilities for the rarer species (source game). owner (the first), owners, effects (tags in the balance file), desc."}

# the catch rates of Red and Blue (pret/pokered data/pokemon/base_stats)
CATCH_RATE = {
    "bulbasaur": 45, "ivysaur": 45, "venusaur": 45, "charmander": 45, "charmeleon": 45, "charizard": 45, "squirtle": 45, "wartortle": 45,
    "blastoise": 45, "caterpie": 255, "metapod": 120, "butterfree": 45, "weedle": 255, "kakuna": 120, "beedrill": 45, "pidgey": 255,
    "pidgeotto": 120, "pidgeot": 45, "rattata": 255, "raticate": 90, "spearow": 255, "fearow": 90, "ekans": 255, "arbok": 90,
    "pikachu": 190, "raichu": 75, "sandshrew": 255, "sandslash": 90, "nidoran_f": 235, "nidorina": 120, "nidoqueen": 45, "nidoran_m": 235,
    "nidorino": 120, "nidoking": 45, "clefairy": 150, "clefable": 25, "vulpix": 190, "ninetales": 75, "jigglypuff": 170, "wigglytuff": 50,
    "zubat": 255, "golbat": 90, "oddish": 255, "gloom": 120, "vileplume": 45, "paras": 190, "parasect": 75, "venonat": 190,
    "venomoth": 75, "diglett": 255, "dugtrio": 50, "meowth": 255, "persian": 90, "psyduck": 190, "golduck": 75, "mankey": 190,
    "primeape": 75, "growlithe": 190, "arcanine": 75, "poliwag": 255, "poliwhirl": 120, "poliwrath": 45, "abra": 200, "kadabra": 100,
    "alakazam": 50, "machop": 180, "machoke": 90, "machamp": 45, "bellsprout": 255, "weepinbell": 120, "victreebel": 45, "tentacool": 190,
    "tentacruel": 60, "geodude": 255, "graveler": 120, "golem": 45, "ponyta": 190, "rapidash": 60, "slowpoke": 190, "slowbro": 75,
    "magnemite": 190, "magneton": 60, "farfetchd": 45, "doduo": 190, "dodrio": 45, "seel": 190, "dewgong": 75, "grimer": 190,
    "muk": 75, "shellder": 190, "cloyster": 60, "gastly": 190, "haunter": 90, "gengar": 45, "onix": 45, "drowzee": 190,
    "hypno": 75, "krabby": 225, "kingler": 60, "voltorb": 190, "electrode": 60, "exeggcute": 90, "exeggutor": 45, "cubone": 190,
    "marowak": 75, "hitmonlee": 45, "hitmonchan": 45, "lickitung": 45, "koffing": 190, "weezing": 60, "rhyhorn": 120, "rhydon": 60,
    "chansey": 30, "tangela": 45, "kangaskhan": 45, "horsea": 225, "seadra": 75, "goldeen": 225, "seaking": 60, "staryu": 225,
    "starmie": 60, "mr_mime": 45, "scyther": 45, "jynx": 45, "electabuzz": 45, "magmar": 45, "pinsir": 45, "tauros": 45,
    "magikarp": 255, "gyarados": 45, "lapras": 45, "ditto": 35, "eevee": 45, "vaporeon": 45, "jolteon": 45, "flareon": 45,
    "porygon": 45, "omanyte": 45, "omastar": 45, "kabuto": 45, "kabutops": 45, "aerodactyl": 45, "snorlax": 25, "articuno": 3,
    "zapdos": 3, "moltres": 3, "dratini": 45, "dragonair": 45, "dragonite": 45, "mewtwo": 3, "mew": 45,
}

SPECIES_SCHEMA = {
    "_file": "Species data in the pokemon.json schema ({\"species\": {id: species}}, plus energy_types, type_energy, energy_names and type_chart), a drop-in dataset for the engine (Kanto151Data.install()). The Kanto 151, keyed by id, in Pokédex order. Built by tools/native/kanto151/gen.py. Engine keys first, then the design's extra keys.",
    "name": "the shown name", "types": "its Pokemon types; its pools are their energy kinds (type_energy) plus Colorless",
    "energy": "its pools as the engine makes them: typed (in type order) then Colorless", "rarity": "common | uncommon | rare | very_rare | legendary: the card rarity blended with how rare it is in the world",
    "weakness": "energy kinds it is weak to (its SV151 card; battle_config matchups.weakness_mult); [] for the Dragon line (their cards have none)",
    "resistance": "energy kinds it resists (battle_config matchups.resistance_mult / resistance_sub)",
    "base": "[hp, atk, def, spa, spd, spe] battle base stats: base_game pulled toward its stat_group's mean total (balance stats.spread), plus the rarity bonus and its tuning",
    "base_game": "extra: the main-series base stats", "catch_rate": "extra: its catch rate in Red and Blue (3..255; battle/catch_rules.gd)", "stat_group": "extra: basic | middle | final | single (its place in its line)",
    "wild_levels": "[lo, hi]: a placeholder band by stage and rarity",
    "learnset": "[{level, move, src: game | tcg | anime | new | design | added, inherited, anime, tcg, _note (why an added move fits)}] in level order (never forgotten)",
    "tm": "move ids it can be taught (TM, HM or tutor, in any game)", "ai": "aggressive | strategic | evasive",
    "dex": "extra: national Pokédex number", "tutor": "extra: the tm moves that come from a tutor", "egg": "extra: egg moves (a breeding hook; teach() with force)",
    "focus_profile": "extra: its focus params in battle_config focus terms {gain, step, chip_cap, start, disrupt_resist}: the config's defaults, by_type and species entries, the design's overrides, then the rarity bonus; install() writes them into focus.species",
    "tcg": "extra: the card it follows: card, type (its primary energy), rarity, set, weakness, resistance (the card's -20 / -30), attacks, abilities",
    "evolution": "extra: {line, stage, from, into, method: level | stone | trade | friendship, level, item}",
    "start": "extra: moves known at level 1", "openers": "extra: every move it can use costing 1 chip", "mids": "extra: 2 to 3 chips", "finishers": "extra: all chips",
    "signature": "extra: its signature moves", "skills": "extra: its passive skills (moves_kanto.json skills)",
    "off_pool": "extra: moves whose typed cost needs a pool it lacks (balance off_pool: paid in Colorless at a power cut, once the engine supports it)",
    "_notes": "extra: TCG typing notes, eras, uncertainty",
}

NOTES_TOP = [
    "TCG data: the Pokémon TCG API's Scarlet & Violet 151 set (sv3pt5, 2023), which prints every one of the 151 with current types, weakness, resistance and rarity. Older eras differ; see each species' _notes.",
    "Game data: PokeAPI, every move each species can learn in any main-series game (level-up, TM/HM, tutor, egg). Learn levels come from the Kanto-era games first (Yellow, Red/Blue, FireRed/LeafGreen, Let's Go), then the newest game.",
    "The TCG weakness chain is followed: Water beats Fire, Lightning beats Water, Fire beats Grass, Grass beats Fighting, Fighting beats Lightning, Darkness and Colorless, Darkness beats Psychic, Metal beats the Psychic-type fairies.",
]

def write_json(path, top):
    lines = ["{"]
    keys = list(top)
    for ki, k in enumerate(keys):
        v = top[k]
        comma = "," if ki < len(keys) - 1 else ""
        if isinstance(v, dict) and k in ("moves", "species", "skills"):
            lines.append("  %s: {" % json.dumps(k))
            ik = list(v)
            for j, kk in enumerate(ik):
                c2 = "," if j < len(ik) - 1 else ""
                lines.append("    %s: %s%s" % (json.dumps(kk), json.dumps(v[kk], ensure_ascii=False), c2))
            lines.append("  }" + comma)
        else:
            body = json.dumps(v, ensure_ascii=False, indent=2).replace("\n", "\n  ")
            lines.append("  %s: %s%s" % (json.dumps(k), body, comma))
    lines.append("}")
    txt = "\n".join(lines) + "\n"
    for bad in ("—", "–"):
        if bad in txt:
            raise SystemExit("%s: a dash slipped in" % path)
    json.loads(txt)
    with open(path, "w") as f:
        f.write(txt)

BAL_SCHEMA = {
    "_doc": "The one global set of design numbers for the Kanto 151 under energy v2. gen.py writes the move numbers from it; the battle simulator reads it. The engine's own numbers (focus defaults, slots, damage, matchups, the counter table) stay in battle_config.json; this file never repeats them. Change a number here and rerun tools/native/kanto151/gen.py, or tune a single move in moves_kanto.json.",
    "power_per_chip": "power per chip by tier and rarity: a fixed-cost move's power = chips x power_per_chip[tier][rarity] x chip_scaling x the move's power_mods product; a finisher's power (its base) = finisher_base[rarity] x mods and its power_per_chip = power_per_chip.finisher[rarity] x mods",
    "finisher_base": "a finisher's base power by rarity (x mods)", "chip_scaling": "a little more per chip as the cost grows",
    "game_power_ref": "the game power each chip count stands for", "game_power_blend": "how much of the game power's spread inside a chip bracket survives (an exponent), clamped by game_power_clamp",
    "accuracy_k": "power x (1 + (100 - accuracy) x k): less accurate moves hit harder (a never-miss move, accuracy 0, counts as 100)", "priority_mult": "power multiplier by priority (reactions excluded)",
    "two_phase_mult": "two-phase moves are stronger per chip", "hits_state_mult": "per unreachable state a move can hit", "role_power_mult": "damage from non-offense roles",
    "round_power_to": "powers are rounded to this", "tolerance": "how far a move's power may drift from the formula before the test fails (hand tuning room)",
    "shared_power_mult": "a copy of battle_config rarity.shared_power_mult (the engine applies it): a shared (non-signature) move's power x this for the user's rarity (signature moves already carry their rarity)",
    "off_pool": "a copy of battle_config costs.off_pool (the engine's rule): a typed chip of a kind it has no pool for is paid in Colorless plus extra chips",
    "disrupt_per_chip": "focus points a disruption move takes per chip, by rarity (install() writes each move's into battle_config disruption.moves)", "disrupt_damaging_mult": "for damaging disruption moves",
    "reaction": "reaction numbers: return_mult (a counter's mult by rarity), bide_mult, guard_reduce, default_chance (percent)",
    "combo_power_pct": "the extra power a combo gives, by the move's rarity",
    "focus": "the design's focus layer over battle_config focus: rarity_gain_bonus, stage_gain_bonus (by evolution stage), rarity_resist_bonus, resist_cap, and the amounts focus_up / focus_down_self / focus_drain move",
    "learn_levels": "levels after the stage's first level at which designed (TCG, anime) moves are learned, by tier; finisher_by and two_phase_by: a species' first level-up finisher and two-phase move come at most this many levels after its stage's first level (moved earlier, marked moved_from); added_two_phase and added_reaction: the levels of the added moves (src added)",
    "stats": "battle stats: shape (each stat pulled toward the species' own average: 1 = the games' shape), spread (how much of a species' distance from its group's mean total survives: 1 = the games' stats, 0 = all equal), rarity_bonus and group_bonus (shares on top), evolution_floor (an evolved form's total is at least this share above the stage before, whatever the tuning), group_mean_total (written by gen.py)",
    "type_map": "main-series type -> energy kind (also kanto151.json type_energy)", "tcg_energy_ids": "TCG energy name -> kind", "energy_names": "kind -> shown name",
    "effects": "every effect tag (engine names): power_mult (the weight on a damaging move's power), doc, and its numbers",
    "chance_scaled_tags": "for these tags the weight is scaled by the move's chance: w' = 1 - (1 - power_mult) x chance; power_mods.effects is the product of the (scaled) weights",
    "counter_rows_extra": "rows the design added to battle_config counters.rows (now in the config itself): Smack Down, Dimensional Hand, Multishot Lightning, Hurricane; Feint reaches a charging foe",
    "matchups": "attacker energy -> defender card type, counted from the species data: weak (has that Weakness), resist, of (species with that card type)",
    "matchup_summary": "the same, read off: x2 when most of that type are weak to it, resisted when most resist it, else the counts",
    "sim_targets": "what the battle simulator checks the meta against",
}

SIM = {
    "_doc": "Targets for the text battle simulator (many battles on the real energy v2 rules). Rarer is allowed to win; peers must stay close; Ash should feel stronger with every level, evolution and slot.",
    "rarity_step_winrate": {"min": 0.55, "max": 0.68, "doc": "a species one rarity step up, at the same level and stage, wins this share against the step below (a clear, not absurd, step)"},
    "within_tier_winrate": {"min": 0.40, "max": 0.60, "level_band": 5, "applies_to": ["common", "uncommon"],
                            "doc": "within one rarity at a similar level, no common or uncommon's average win rate against its peers leaves this band"},
    "within_tier_spread_max": 0.2, "within_tier_spread_doc": "the spread of the peers' average win rates in a tier, stat group and level band: the 10th to the 90th percentile (the full range is reported too)",
    "starter_triangle": {"min": 0.55, "max": 0.85, "doc": "each starter against the one it is strong against, at the same level and stage"},
    "evolution_step_winrate": {"min": 0.62, "max": 0.8, "doc": "an evolved form against its previous stage at the evolution level"},
    "level_step_winrate": {"per_levels": 10, "min": 0.7, "max": 0.93, "doc": "a species against itself ten levels lower: a clear step up (new moves, a slot, more HP), not quite a wall"},
    "slot_unlock_winrate": {"min": 0.6, "doc": "the same species with one more equip slot (the 'Ash gets stronger' lever)"},
    "legendary_vs_common_max": 0.97,
    "first_mover_max": 0.56, "doc_first_mover": "the side that acts first should not win much more than half",
    "move_pick_share_max": 0.35, "doc_move_pick": "no single move should be more than this share of a species' picks across battles (choice stays real)",
    "dodge_success": {"min": 0.35, "max": 0.65, "doc": "a Dodge against an attack that doesn't ignore it"},
    "battle_turns": {"min": 3, "max": 8, "doc": "a typical battle's length in turns (the mean)"},
    "role_share_min": 0.03, "doc_role_share": "every role (offense, reaction, two-phase, disruption, utility) is at least this share of all actions; role_share sets a role's own min or max",
    "role_share": {"offense": {"max": 0.6}, "reaction": {"min": 0.08, "max": 0.1}, "two_phase": {"min": 0.05}},
    "tier_share_min": 0.08, "doc_tier_share": "every tier (opener, mid, finisher) is at least this share of all actions; tier_share sets a tier's own min",
    "tier_share": {"finisher": {"min": 0.15}},
    "exempt": ["magikarp", "metapod", "kakuna"], "doc_exempt": "weak by design (the joke fish and the cocoons, whose whole point is to evolve): left out of the peer band and spread checks; a design decision for the user",
}

BAL = {"_schema": BAL_SCHEMA, "_notes": NOTES_TOP}
BAL.update(B)
for k in ("weakness_mult", "resistance_reduce", "equip_slots"):
    BAL.pop(k, None)
BAL["focus"] = {k: v for k, v in B["focus"].items() if k not in ("default", "by_energy", "locked_in")}
BAL["chance_scaled_tags"] = sorted({rn(t) for t in CHANCE_TAGS})
BAL["effects"] = {rn(k): {"power_mult": v[0], "doc": v[1], **v[2]} for k, v in sorted(EFFECTS.items()) if v[1]}
BAL["counter_rows_extra"] = EXTRA_ROWS
BAL["matchups"] = mat
BAL["matchup_summary"] = summary
BAL["sim_targets"] = SIM

os.makedirs(OUT_DIR, exist_ok=True)
write_json(os.path.join(OUT_DIR, "moves_kanto.json"), {"_schema": MOVE_SCHEMA, "_skill_schema": SKILL_SCHEMA, "_notes": NOTES_TOP, "moves": moves_final, "skills": skills_final})
write_json(os.path.join(OUT_DIR, "kanto151.json"), {
    "_schema": SPECIES_SCHEMA, "_notes": NOTES_TOP,
    "energy_types": POOLS, "type_energy": TYPE_MAP, "energy_names": ENERGY_NAMES, "type_chart": PK["type_chart"],
    "species": species_out})
write_json(os.path.join(OUT_DIR, "kanto151_balance.json"), BAL)

# a short report
from collections import Counter
rc = Counter(r["rarity"] for r in species_out.values())
print("species", len(species_out), "moves", len(moves_final), "skills", len(skills_final))
print("rarity", dict(rc))
print("avg moves/species %.1f" % (sum(len(r["learnset"]) + len(r["tm"]) + len(r["egg"]) for r in species_out.values()) / 151))
print("roles", dict(Counter(m["role"] for m in moves_final.values())), "tiers", dict(Counter(m["tier"] for m in moves_final.values())))
