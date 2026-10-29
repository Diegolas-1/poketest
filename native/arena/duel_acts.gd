class_name DuelActs
extends RefCounted
# The formal trainer battle's acting (arena/arena_opening.gd), added to idles.gd's
# actions and stances at run time (IdleActions._defs(), IdleActions._stances()):
# forced only, never picked at random.
#   duel_bow        a proper bow from the waist: heels together, arms straight down
#                   the sides, the eyes lowered, held, then up (Ash and the opponent)
#   duel_ready      Ash's ready stance: the Poké Ball out of his belt into his right
#                   hand, held forward at chest height, the left arm in a guard (held)
#   duel_throw      the throw: the arm drawn back behind the head, the step in, the
#                   overhand release, the follow-through (Ash's ball leaves his hand
#                   at RELEASE s; the opening flies its own ball from there)
#   duel_throw_npc  the same throw for someone without the ball prop
#   stances "duel_<ai>" for the opponent, by its AI personality: cautious (arms
#   folded, weight back), aggressive (fists up, leaning in), balanced (a hand on the
#   hip, the other ready), tricky (a hand to the chin, head cocked)

const RELEASE := 0.62

static func H(x, y, z): return ["Hips", x, y, z]
static func HD(x, y, z): return ["Head", x, y, z]
static func CH(x, y, z): return ["Spine3", x, y, z]

static var _done := false

static func register() -> void:
	if _done: return
	_done = true
	var D := IdleActions._defs()
	var SIDE_R := {"at": H(-0.21, -0.24, 0.05), "pole": [-1, 0.2, -0.4], "wf": 0.0, "wt": 0.0, "cu": 0.35}
	var SIDE_L := {"at": H(0.21, -0.24, 0.05), "pole": [1, 0.2, -0.4], "wf": 0.0, "wt": 0.0, "cu": 0.35}
	var BOWED := {"lean": 0.78, "hp": 0.42, "legs_in": 0.03}
	D["duel_bow"] = {"dur": 2.3, "talk": true,
		"body": [[0, {}], [0.25, {"lean": 0.05, "hp": 0.05}], [0.75, BOWED], [1.45, BOWED], [2.05, {"lean": -0.02}], [2.3, {}]],
		"armR": [[0, null], [0.3, SIDE_R], [1.9, SIDE_R], [2.3, null]],
		"armL": [[0, null], [0.3, SIDE_L], [1.9, SIDE_L], [2.3, null]],
		"gaze": [[0, {"y": 0, "p": 0}], [0.7, {"y": 0, "p": 0.25}], [1.5, {"y": 0, "p": 0.25}], [2.3, {"y": 0, "p": 0}]]}
	var BELT := {"at": H(-0.17, -0.03, 0.1), "pole": [-1, -0.3, -0.5], "wf": 0.1, "cu": 0.6}
	var HOLD := {"at": CH(-0.2, -0.17, 0.33), "pole": [-1, -0.7, -0.35], "wt": 0.25, "wf": -0.15, "cu": 0.85}
	var HOLD2 := {"at": CH(-0.19, -0.15, 0.34), "pole": [-1, -0.7, -0.35], "wt": 0.25, "wf": -0.15, "cu": 0.85}
	var GUARD := {"at": CH(0.17, -0.3, 0.16), "pole": [1, -0.7, -0.3], "wt": 0.3, "cu": 1.0}
	var L := 60.0
	D["duel_ready"] = {"dur": L, "talk": true, "player": true, "ball": true,
		"armR": [[0, null], [0.35, BELT], [0.75, HOLD], [L * 0.5, HOLD2], [L - 0.5, HOLD], [L, null]],
		"armL": [[0, null], [0.5, GUARD], [L - 0.5, GUARD], [L, null]],
		"body": [[0, {}], [0.4, {"tw": -0.06, "hp": 0.06}], [0.9, {"lean": 0.14, "tw": 0.05, "hp": -0.04}], [L - 0.5, {"lean": 0.14, "tw": 0.05, "hp": -0.04}], [L, {}]],
		"prop": {"show": 0.4, "grow": [0.5, 0.8], "toss": [], "shrink": [L + 1.0, L + 2.0], "hide": L + 3.0}}
	var BACK := {"at": HD(-0.26, 0.14, -0.22), "pole": [-1, -0.3, -0.7], "wt": 0.4, "cu": 0.85}
	var OUT := {"at": CH(-0.08, 0.02, 0.62), "pole": [-1, -0.5, -0.2], "wf": 0.2, "wt": 0.1, "cu": 0.15}
	var DOWN := {"at": CH(0.05, -0.5, 0.36), "pole": [-1, -0.6, 0.0], "wf": 0.3, "cu": 0.1}
	var throw := {"dur": 1.5, "talk": true,
		"armR": [[0, HOLD], [0.3, BACK], [0.48, BACK], [RELEASE, OUT], [0.85, DOWN], [1.5, null]],
		"armL": [[0, GUARD], [0.3, {"at": CH(0.3, 0.05, 0.3), "pole": [1, -0.4, -0.3], "cu": 0.4}], [RELEASE, {"at": CH(0.26, -0.3, 0.05), "pole": [1, -0.5, -0.4], "cu": 0.5}], [1.5, null]],
		"body": [[0, {"lean": 0.14}], [0.3, {"lean": -0.12, "tw": 0.42, "hp": -0.1}], [0.48, {"lean": -0.1, "tw": 0.46, "hp": -0.08}], [RELEASE + 0.04, {"lean": 0.32, "tw": -0.36, "hp": 0.04}],
			[0.95, {"lean": 0.22, "tw": -0.2}], [1.5, {}]]}
	var tp: Dictionary = throw.duplicate(true)
	tp["player"] = true
	tp["ball"] = true
	tp["prop"] = {"show": -1.0, "grow": [-1.0, -0.5], "toss": [], "shrink": [9.0, 9.5], "hide": RELEASE}
	D["duel_throw"] = tp
	D["duel_throw_npc"] = throw
	# a little celebration and a slump for the end
	D["duel_win"] = D.get("fist", {})
	var S := IdleActions._stances()
	S["duel_cautious"] = {
		"armR": {"at": CH(0.07, -0.22, 0.2), "pole": [-1, -0.8, -0.2], "wt": 0.3, "cu": 0.6},
		"armL": {"at": CH(-0.07, -0.25, 0.19), "pole": [1, -0.8, -0.2], "wt": 0.3, "cu": 0.6},
		"body": {"lean": -0.05, "legs_in": 0.0, "hp": 0.04}}
	S["duel_aggressive"] = {
		"armR": {"at": CH(-0.17, -0.2, 0.18), "pole": [-1, -0.7, -0.3], "wt": 0.3, "cu": 1.0},
		"armL": {"at": CH(0.16, -0.17, 0.22), "pole": [1, -0.7, -0.3], "wt": 0.3, "cu": 1.0},
		"body": {"lean": 0.2, "legs_in": -0.08, "hp": -0.08}}
	S["duel_balanced"] = {
		"armR": {"at": CH(-0.22, -0.3, 0.26), "pole": [-1, -0.6, -0.3], "wt": 0.2, "cu": 0.7},
		"armL": {"at": H(0.19, 0.06, 0.03), "pole": [1, 0.4, -0.6], "wf": 0.5, "wt": 0.3, "cu": 0.3},
		"body": {"lean": 0.08, "legs_in": -0.04, "hp": -0.02}}
	S["duel_tricky"] = {
		"armR": {"at": HD(-0.04, -0.01, 0.13), "pole": [-1, -1, 0.1], "wf": 0.3, "wt": 0.4, "cu": 0.5},
		"armL": {"at": CH(-0.06, -0.17, 0.2), "pole": [1, -0.8, -0.2], "cu": 0.3},
		"body": {"lean": 0.0, "legs_in": 0.02, "hp": -0.06}}
	S["duel_ash"] = IdleActions.battle_stance()
