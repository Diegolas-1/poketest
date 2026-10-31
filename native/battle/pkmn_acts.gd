class_name PkmnActs
extends RefCounted
# Ash's acting as a trainer in a Pokémon battle (mode "pkmn", battle_pkmn.gd), added to
# idles.gd's actions and stances at run time like arena/duel_acts.gd: forced only,
# never picked at random (the battle holds the random idles off: idles.hold).
#   stance pk_ready     the trainer's ready stance: feet set wide, weight forward, the
#                       right fist up by his chest, the left hand loose and low
#   stance pk_worried   his Pokémon low on HP: both fists together under his chin, leaning in
#   pk_command          a move called: a wind-up, then the right arm thrust out at the foe,
#                       a call ("Go!"), held a beat, back to the stance
#   pk_wince            his Pokémon takes a big hit: a flinch back, the eyes screwed shut
#   pk_cheer            a KO or a super-effective hit: two fist pumps, head up
#   pk_worry            his Pokémon faints: both hands to his cap, bent forward (held, long)
#   pk_call             a switch or a recall: the arm swept out, open hand, a shout
# Each starts from and goes back to the stance (the arm keys start and end at null:
# the idle layer blends from the stance in and back out).

static func H(x, y, z): return ["Hips", x, y, z]
static func HD(x, y, z): return ["Head", x, y, z]
static func CH(x, y, z): return ["Spine3", x, y, z]

static var _done := false

static func register() -> void:
	if _done: return
	_done = true
	var D := IdleActions._defs()
	var FIST_R := {"at": CH(-0.19, -0.2, 0.2), "pole": [-1, -0.7, -0.3], "wt": 0.3, "cu": 1.0}
	var LOW_L := {"at": CH(0.22, -0.4, 0.1), "pole": [1, -0.6, -0.4], "wt": 0.2, "cu": 0.55}
	# the command: wind up, thrust, hold, back
	var WIND := {"at": CH(-0.2, -0.16, 0.12), "pole": [-1, -0.6, -0.5], "wt": 0.3, "cu": 1.0}
	var THRUST := {"at": CH(-0.1, 0.04, 0.6), "pole": [-1, -0.45, -0.25], "wf": 0.05, "wt": 0.1, "cu": 0.3}
	var THRUST2 := {"at": CH(-0.1, 0.02, 0.58), "pole": [-1, -0.45, -0.25], "wf": 0.05, "wt": 0.1, "cu": 0.35}
	D["pk_command"] = {"dur": 1.3, "talk": true, "player": true, "over_stance": true,
		"armR": [[0, null], [0.2, WIND], [0.38, THRUST], [0.9, THRUST2], [1.3, null]],
		"armL": [[0, null], [0.3, {"at": CH(0.24, -0.36, 0.0), "pole": [1, -0.6, -0.4], "wt": 0.2, "cu": 0.9}], [1.0, {"at": CH(0.24, -0.37, 0.02), "pole": [1, -0.6, -0.4], "wt": 0.2, "cu": 0.85}], [1.3, null]],
		"body": [[0, {}], [0.2, {"lean": 0.06, "tw": 0.14, "hp": 0.02}], [0.38, {"lean": 0.26, "tw": -0.2, "hp": -0.08, "jaw": 0.55}],
			[0.6, {"lean": 0.24, "tw": -0.16, "hp": -0.06, "jaw": 0.25}], [0.9, {"lean": 0.2, "tw": -0.12, "hp": -0.04}], [1.3, {}]]}
	var GUARD_R := {"at": CH(-0.1, -0.1, 0.2), "pole": [-1, -0.75, -0.2], "wt": 0.4, "cu": 0.95}
	var GUARD_L := {"at": CH(0.1, -0.12, 0.2), "pole": [1, -0.75, -0.2], "wt": 0.4, "cu": 0.95}
	D["pk_wince"] = {"dur": 1.0, "talk": true, "player": true, "over_stance": true,
		"armR": [[0, null], [0.12, GUARD_R], [0.55, GUARD_R], [1.0, null]],
		"armL": [[0, null], [0.14, GUARD_L], [0.55, GUARD_L], [1.0, null]],
		"body": [[0, {}], [0.1, {"lean": -0.14, "hp": 0.14, "sh": 0.08, "side": 0.03, "eye": 1, "tw": 0.1}], [0.5, {"lean": -0.06, "hp": 0.08, "sh": 0.05, "eye": 1, "tw": 0.06}], [1.0, {}]]}
	var UPF := {"at": CH(-0.24, 0.3, 0.14), "pole": [-1, -0.5, -0.5], "wt": 0.2, "cu": 1.0}
	var DOWNF := {"at": CH(-0.21, -0.06, 0.2), "pole": [-1, -0.7, -0.3], "wt": 0.3, "cu": 1.0}
	D["pk_cheer"] = {"dur": 1.5, "talk": true, "player": true, "over_stance": true,
		"armR": [[0, null], [0.2, DOWNF], [0.42, UPF], [0.62, DOWNF], [0.84, UPF], [1.05, DOWNF], [1.5, null]],
		"armL": [[0, null], [0.3, {"at": CH(0.2, -0.3, 0.12), "pole": [1, -0.7, -0.3], "wt": 0.2, "cu": 1.0}], [1.15, {"at": CH(0.2, -0.3, 0.12), "pole": [1, -0.7, -0.3], "wt": 0.2, "cu": 1.0}], [1.5, null]],
		"body": [[0, {}], [0.42, {"lean": 0.04, "hp": -0.16, "jaw": 0.6, "tw": -0.06}], [0.62, {"lean": 0.12, "hp": -0.04, "jaw": 0.3}],
			[0.84, {"lean": 0.04, "hp": -0.16, "jaw": 0.6, "tw": -0.06}], [1.05, {"lean": 0.12, "hp": -0.02, "jaw": 0.2}], [1.5, {}]]}
	var CAP_R := {"at": HD(-0.13, 0.1, 0.03), "pole": [-1, 0.1, -0.5], "wt": 0.5, "wf": -0.2, "cu": 0.35}
	var CAP_L := {"at": HD(0.13, 0.1, 0.03), "pole": [1, 0.1, -0.5], "wt": 0.5, "wf": -0.2, "cu": 0.35}
	D["pk_worry"] = {"dur": 3.2, "talk": true, "player": true, "over_stance": true,
		"armR": [[0, null], [0.35, CAP_R], [2.6, CAP_R], [3.2, null]],
		"armL": [[0, null], [0.38, CAP_L], [2.6, CAP_L], [3.2, null]],
		"body": [[0, {}], [0.3, {"lean": 0.12, "hp": -0.12, "jaw": 0.5, "sh": 0.06}], [1.0, {"lean": 0.3, "hp": 0.22, "jaw": 0.2, "sh": 0.04}],
			[2.6, {"lean": 0.28, "hp": 0.2, "jaw": 0.1, "hr": 0.05}], [3.2, {}]]}
	var SWEEP := {"at": CH(-0.16, 0.18, 0.56), "pole": [-1, -0.3, -0.3], "wf": -0.25, "wt": 0.0, "cu": 0.05}
	D["pk_call"] = {"dur": 1.4, "talk": true, "player": true, "over_stance": true,
		"armR": [[0, null], [0.22, {"at": CH(-0.24, -0.08, 0.16), "pole": [-1, -0.6, -0.4], "wt": 0.3, "cu": 0.9}], [0.45, SWEEP], [1.0, SWEEP], [1.4, null]],
		"armL": [[0, null], [0.4, LOW_L], [1.1, LOW_L], [1.4, null]],
		"body": [[0, {}], [0.22, {"tw": 0.12, "lean": 0.04}], [0.45, {"lean": 0.22, "tw": -0.22, "hp": -0.12, "jaw": 0.7}], [1.0, {"lean": 0.16, "tw": -0.14, "jaw": 0.35}], [1.4, {}]]}
	var S := IdleActions._stances()
	S["pk_ready"] = {"armR": FIST_R, "armL": LOW_L, "body": {"lean": 0.12, "legs_in": -0.08, "hp": -0.04, "tw": 0.05}}
	S["pk_worried"] = {
		"armR": {"at": CH(-0.04, -0.12, 0.22), "pole": [-1, -0.8, -0.2], "wt": 0.4, "cu": 0.9},
		"armL": {"at": CH(0.04, -0.13, 0.21), "pole": [1, -0.8, -0.2], "wt": 0.4, "cu": 0.9},
		"body": {"lean": 0.2, "legs_in": -0.04, "hp": 0.06}}
