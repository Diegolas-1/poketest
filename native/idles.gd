class_name IdleActions
extends RefCounted
# Idle actions (web/world/idles.js): now and then, while someone stands still, a
# small piece of acting on top of the idle clip: a hand on the hip, a scratch of
# the head, the cap put right, hands behind the head looking at the sky, a hand
# shading the eyes, a stretch, a yawn, a Poké Ball taken from the belt and tossed
# (Ash only), a crouch and sitting down (Ash only; the feet stay planted with a
# two-bone IK on each leg), a foot twisted in the dirt, the shoulders rolled.
# Arms reach with a two-bone IK for points on the body; the scalars and the
# targets go through monotone cubics. Moving or jumping lets go at once.
#
# Works in the skeleton's space (CastActor.gxf); metre offsets are divided by
# the model's scale. update(dt, wI) runs early in the idle layer (it steers the
# look-around target), post(dt) after every other layer.

var A: CastActor
var npc := false
var ball: Node3D
var P := {"act": null, "wait": 0.0, "idle": 0.0, "last": "", "busy": false, "eyes": false}
var names: Array = []
var rng := RandomNumberGenerator.new()
var stance := ""            # a STANCES key held while idle ("" none)
var _sw := 0.0              # its weight now
var _swi := 0.0             # the idle weight it follows

static func _cl(x: float, a: float, b: float) -> float: return minf(b, maxf(a, x))
static func _sm(a: float, b: float, x: float) -> float:
	var u := _cl((x - a) / (b - a), 0.0, 1.0)
	return u * u * (3.0 - 2.0 * u)
static func _ease(u: float) -> float: return _sm(0.0, 1.0, u)

# monotone cubic Hermite through (ts[i], vs[i]); flat at the ends
static func mono(ts: Array, vs: Array, t: float) -> float:
	var n := ts.size()
	if t <= ts[0]: return vs[0]
	if t >= ts[n - 1]: return vs[n - 1]
	var i := 0
	while t >= ts[i + 1]: i += 1
	var h: float = ts[i + 1] - ts[i]
	var u: float = (t - ts[i]) / h
	var u2 := u * u
	var u3 := u2 * u
	return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * _tan(ts, vs, i) + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * _tan(ts, vs, i + 1)

static func _tan(ts: Array, vs: Array, k: int) -> float:
	if k <= 0 or k >= ts.size() - 1: return 0.0
	var s0: float = (vs[k] - vs[k - 1]) / (ts[k] - ts[k - 1])
	var s1: float = (vs[k + 1] - vs[k]) / (ts[k + 1] - ts[k])
	return 0.0 if s0 * s1 <= 0.0 else (2.0 * s0 * s1) / (s0 + s1)

# a scalar track: keys [[t, {name: value}], ...], a missing name is 0
static func scalars(keys: Array, t: float) -> Dictionary:
	var ts := []
	var nm := {}
	for k in keys:
		ts.append(k[0])
		for n in k[1]: nm[n] = true
	var out := {}
	for n in nm:
		var vs := []
		for k in keys: vs.append(float(k[1].get(n, 0.0)))
		out[n] = mono(ts, vs, t)
	return out

# the same, with the track prepared once and kept in the action's definition
static func _sc(d: Dictionary, key: String, t: float) -> Dictionary:
	var pk := "_" + key
	if not d.has(pk):
		var keys: Array = d[key]
		var ts := []
		var nm := {}
		for k in keys:
			ts.append(float(k[0]))
			for n in k[1]: nm[n] = true
		var ch := []
		for n in nm:
			var vs := []
			for k in keys: vs.append(float(k[1].get(n, 0.0)))
			ch.append([n, vs])
		d[pk] = [ts, ch]
	var pr: Array = d[pk]
	var out := {}
	for c in pr[1]: out[c[0]] = mono(pr[0], c[1], t)
	return out

# ---------- the actions (times in seconds, positions in metres) ----------
static func H(x, y, z): return ["Hips", x, y, z]
static func HD(x, y, z): return ["Head", x, y, z]
static func CH(x, y, z): return ["Spine3", x, y, z]
static func GR(x, y, z): return ["root", x, y, z]
static func KN(s, x, y, z): return [s + "Leg", x, y, z]

static var ACTIONS := {}
static func _defs() -> Dictionary:
	if not ACTIONS.is_empty(): return ACTIONS
	var HIP := {"at": H(-0.205, 0.11, -0.03), "pole": [-1, 0.4, -0.5], "wf": 0.5, "wd": -0.6, "cu": -0.25}
	var NAPE := func(sg): return {"at": HD(sg * 0.075, 0.1, -0.12), "pole": [sg, 0.45, 0.3], "wf": 0.2, "wd": 0.3, "cu": -0.1}
	var SIDE := func(sg): return {"at": CH(sg * 0.23, -0.04, 0.07), "pole": [sg, -0.6, -0.3], "cu": 0.1}
	var ONKNEE := func(s, sg): return {"at": KN(s, sg * -0.02, 0.06, 0.1), "pole": [sg * 0.6, -0.6, -0.5], "wf": 0.4, "cu": 0}
	var BR := func(x, y, z, wf, cu): return {"at": CH(x, y, z), "pole": [-0.6, -1, -0.3], "wt": 2.0, "wf": wf, "cu": cu}
	var SCR := {"at": HD(0.07, 0.11, -0.08), "pole": [1, 0.3, 0.4], "wf": 0.4, "cu": 0.1}
	var CAP1 := {"at": HD(-0.05, 0.15, 0.21), "pole": [-0.7, -1, 0.1], "wf": 0.3, "wt": 0.3, "cu": 0.4}
	var SHD := {"at": HD(-0.08, 0.14, 0.15), "pole": [-1, -0.1, 0.3], "wf": -0.1, "wd": 0.2, "wt": -0.6, "cu": -0.35}
	var STL := {"at": CH(0.03, 0.02, 0.44), "pole": [1, -0.4, 0], "wt": 1.4, "wf": -0.4, "cu": 0.3}
	var STR := {"at": CH(-0.03, 0.02, 0.44), "pole": [-1, -0.4, 0], "wt": 1.4, "wf": -0.4, "cu": 0.3}
	var BELT := {"at": H(-0.15, 0.085, 0.085), "pole": [-1, -0.3, -0.7], "wd": -0.2, "cu": 0.3}
	var BELT0 := {"at": H(-0.15, 0.09, 0.08), "pole": [-1, -0.3, -0.7], "wd": -0.2, "cu": 0.1}
	var SAL := {"at": HD(-0.155, 0.085, 0.075), "pole": [-1, -0.1, 0.35], "wf": 0.25, "wd": -0.1, "wt": 1.2, "cu": -0.1}
	var CR := {"dy": -0.45, "dz": -0.1, "wp": 0.3, "lean": 0.25, "ko": 0.4, "heel": 0.45, "hp": -0.2}
	var CR2 := {"dy": -0.5, "dz": -0.09, "wp": 0.45, "lean": 0.4, "ko": 0.42, "heel": 0.6, "side": -0.1, "tw": -0.1, "hp": -0.18}
	var SIT := {"dy": -0.63, "dz": -0.54, "wp": 0, "lean": 0.1, "ko": 0.35, "seat": 1, "gap": 0}
	ACTIONS = {
		"hip": {"dur": 9.0, "len": [7, 11], "stretch": [2, 7], "w": 1.2,
			"armR": [[0, null], [0.9, HIP], [7.6, HIP], [8.6, null]],
			"body": [[0, {}], [1, {"side": 0.025, "sh": 0.02}], [7.4, {"side": 0.025, "sh": 0.02}], [9, {}]]},
		"scratch": {"dur": 4.2, "w": 1.0, "fx": "scratch",
			"armL": [[0, null], [0.4, {"at": CH(0.21, 0.0, 0.08), "pole": [1, -0.6, -0.2], "cu": 0.15}], [0.85, SCR], [3.0, SCR],
				[3.55, {"at": CH(0.23, -0.06, 0.06), "pole": [1, -0.6, -0.3], "cu": 0.1}], [4.2, null]],
			"body": [[0, {}], [0.8, {"hr": 0.08, "hp": 0.06}], [3.0, {"hr": 0.06, "hp": 0.08}], [4.2, {}]],
			"gaze": [[0, {"y": 0, "p": 0}], [0.6, {"y": 0.15, "p": 0.25}], [3.4, {"y": 0.1, "p": 0.2}], [4.2, {"y": 0, "p": 0}]]},
		"cap": {"dur": 3.4, "w": 1.0,
			"armR": [[0, null], [0.7, {"at": HD(-0.05, 0.17, 0.2), "pole": [-0.7, -1, 0.1], "wf": 0.3, "wt": 0.3, "cu": 0.3}], [1.1, CAP1],
				[1.9, {"at": HD(-0.04, 0.155, 0.21), "pole": [-0.7, -1, 0.1], "wf": 0.3, "wt": 0.3, "cu": 0.4}], [2.45, {"at": CH(-0.2, -0.08, 0.12), "pole": [-1, -0.6, -0.3], "cu": 0.15}], [3.1, null]],
			"body": [[0, {}], [0.7, {"hp": 0.1}], [1.2, {"hp": 0.16, "hr": -0.03}], [1.9, {"hp": 0.12}], [3.4, {}]]},
		"sky": {"dur": 10.0, "len": [8, 13], "stretch": [2.5, 7.5], "w": 0.9,
			"armL": [[0, null], [0.5, SIDE.call(1)], [1.2, NAPE.call(1)], [8.5, NAPE.call(1)], [9.1, SIDE.call(1)], [9.8, null]],
			"armR": [[0, null], [0.6, SIDE.call(-1)], [1.35, NAPE.call(-1)], [8.4, NAPE.call(-1)], [9.0, SIDE.call(-1)], [9.7, null]],
			"body": [[0, {}], [1.2, {"lean": -0.06, "sh": 0.03}], [5, {"lean": -0.08, "sh": 0.04}], [8.4, {"lean": -0.06, "sh": 0.03}], [10, {}]],
			"gaze": [[0, {"y": 0, "p": 0}], [1.3, {"y": 0.1, "p": -0.55}], [4.5, {"y": -0.2, "p": -0.6}], [7.5, {"y": 0.15, "p": -0.5}], [9.4, {"y": 0, "p": -0.05}], [10, {"y": 0, "p": 0}]]},
		"shade": {"dur": 6.5, "w": 0.9,
			"armR": [[0, null], [0.8, SHD], [5.3, SHD], [5.85, SIDE.call(-1)], [6.5, null]],
			"body": [[0, {}], [1, {"tw": -0.05}], [3.2, {"tw": 0.08}], [5.2, {"tw": -0.04}], [6.5, {}]],
			"gaze": [[0, {"y": 0, "p": 0}], [0.9, {"y": -0.45, "p": -0.1}], [2.0, {"y": -0.4, "p": -0.12}], [3.6, {"y": 0.45, "p": -0.1}], [4.6, {"y": 0.4, "p": -0.12}], [5.6, {"y": 0, "p": -0.05}], [6.5, {"y": 0, "p": 0}]]},
		"stretch": {"dur": 6.4, "w": 0.9,
			"armL": [[0, null], [0.8, {"at": CH(0.05, 0.0, 0.3), "pole": [0.6, -1, 0], "wt": 1.2, "cu": 0.2}], [1.4, {"at": CH(0.03, 0.02, 0.43), "pole": [1, -0.4, 0], "wt": 1.4, "wf": -0.4, "cu": 0.3}], [2.4, STL], [3.2, null]],
			"armR": [[0, null], [0.8, {"at": CH(-0.05, 0.0, 0.3), "pole": [-0.6, -1, 0], "wt": 1.2, "cu": 0.2}], [1.4, {"at": CH(-0.03, 0.02, 0.43), "pole": [-1, -0.4, 0], "wt": 1.4, "wf": -0.4, "cu": 0.3}], [2.4, STR], [3.2, null]],
			"body": [[0, {}], [1.4, {"lean": 0.06, "sh": 0.05}], [2.4, {"lean": 0.07, "sh": 0.05}], [3.2, {"sh": -0.02}], [3.9, {"hr": 0.34, "hp": 0.06, "hy": 0.05}], [4.5, {"hr": 0.35, "hp": 0.06, "hy": 0.05}],
				[5.2, {"hr": -0.32, "hp": 0.06, "hy": -0.05}], [5.7, {"hr": -0.33, "hp": 0.05, "hy": -0.05}], [6.4, {}]],
			"gaze": [[0, {"y": 0, "p": 0}], [1.4, {"y": 0, "p": 0.05}], [3.2, {"y": 0, "p": 0}], [6.4, {"y": 0, "p": 0}]]},
		"yawn": {"dur": 6.4, "w": 1.0,
			"armL": [[0, null], [0.95, {"at": CH(0.24, 0.02, 0.06), "pole": [1, -0.8, -0.3], "wf": 0.2, "cu": 0.3}], [1.45, {"at": HD(0.2, 0.2, 0.0), "pole": [1, -0.3, -0.3], "wf": 0, "cu": 0.3}], [1.9, {"at": HD(0.1, 0.4, -0.02), "pole": [1, 0, -0.3], "wf": -0.3, "cu": 0.35}],
				[3.1, {"at": HD(0.11, 0.41, -0.03), "pole": [1, 0, -0.3], "wf": -0.3, "cu": 0.35}], [3.9, {"at": CH(0.4, 0.02, 0.02), "pole": [0.3, -0.3, -1], "wf": 0, "cu": 0.1}],
				[4.5, {"at": CH(0.3, -0.25, 0.02), "pole": [1, -0.3, -0.6], "cu": 0}], [5.2, null]],
			"armR": [[0, null], [1.05, {"at": CH(-0.24, 0.02, 0.06), "pole": [-1, -0.8, -0.3], "wf": 0.2, "cu": 0.3}], [1.55, {"at": HD(-0.2, 0.2, 0.0), "pole": [-1, -0.3, -0.3], "wf": 0, "cu": 0.3}], [2.0, {"at": HD(-0.1, 0.4, -0.02), "pole": [-1, 0, -0.3], "wf": -0.3, "cu": 0.35}],
				[3.1, {"at": HD(-0.11, 0.41, -0.03), "pole": [-1, 0, -0.3], "wf": -0.3, "cu": 0.35}], [3.95, {"at": CH(-0.4, 0.02, 0.02), "pole": [-0.3, -0.3, -1], "wf": 0, "cu": 0.1}],
				[4.6, {"at": CH(-0.3, -0.25, 0.02), "pole": [-1, -0.3, -0.6], "cu": 0}], [5.3, null]],
			"body": [[0, {}], [0.9, {"sh": 0.05, "hp": -0.06, "jaw": 0.12, "lean": -0.02}], [2.1, {"lean": -0.12, "sh": 0.08, "hp": -0.26, "jaw": 0.48, "eye": 1}],
				[3.0, {"lean": -0.14, "sh": 0.08, "hp": -0.28, "jaw": 0.5, "eye": 1, "side": 0.035}], [3.7, {"lean": -0.05, "sh": 0.02, "hp": -0.1, "jaw": 0.08, "eye": 1}],
				[4.4, {"sh": -0.04, "hp": 0.05}], [5.2, {"sh": -0.02, "hp": 0.03, "hr": 0.04}], [6.4, {}]],
			"gaze": [[0, {"y": 0, "p": 0}], [6.4, {"y": 0, "p": 0}]]},
		"ball": {"dur": 9.6, "w": 1.1, "ball": true,
			"armR": [[0, null], [0.9, BELT0], [1.25, BELT],
				[2.2, BR.call(-0.07, -0.12, 0.29, 0.2, 0.15)], [3.7, BR.call(-0.06, -0.11, 0.29, 0.25, 0.15)],
				[3.95, BR.call(-0.06, -0.15, 0.29, 0.2, 0.25)], [4.1, BR.call(-0.06, -0.08, 0.3, 0.1, 0.1)],
				[4.4, BR.call(-0.06, -0.12, 0.3, 0.2, 0.2)], [4.55, BR.call(-0.06, -0.15, 0.3, 0.2, 0.15)],
				[4.9, BR.call(-0.06, -0.12, 0.3, 0.2, 0.15)],
				[5.45, BR.call(-0.06, -0.15, 0.29, 0.2, 0.25)], [5.6, BR.call(-0.06, -0.08, 0.3, 0.1, 0.1)],
				[5.9, BR.call(-0.06, -0.12, 0.3, 0.2, 0.2)], [6.05, BR.call(-0.06, -0.15, 0.3, 0.2, 0.15)],
				[6.5, BR.call(-0.07, -0.12, 0.29, 0.2, 0.15)],
				[7.8, BELT], [8.15, BELT0], [9.2, null]],
			"body": [[0, {}], [1.0, {"hp": 0.1, "tw": -0.06}], [2.2, {"hp": 0.05, "lean": 0.04}], [7, {"hp": 0.05, "lean": 0.04}], [8.0, {"hp": 0.1, "tw": -0.05}], [9.6, {}]],
			"gaze": [[0, {"y": 0, "p": 0}], [0.7, {"y": -0.3, "p": 0.4}], [1.4, {"y": -0.25, "p": 0.35}], [2.3, {"y": -0.08, "p": 0.45}], [3.8, {"y": -0.08, "p": 0.42}],
				[4.25, {"y": -0.08, "p": 0.1}], [4.55, {"y": -0.08, "p": 0.42}], [5.75, {"y": -0.08, "p": 0.1}], [6.05, {"y": -0.08, "p": 0.42}], [7.2, {"y": -0.08, "p": 0.42}],
				[7.9, {"y": -0.25, "p": 0.3}], [8.6, {"y": -0.1, "p": 0.05}], [9.6, {"y": 0, "p": 0}]],
			"prop": {"show": 1.15, "grow": [1.85, 2.1], "toss": [[4.08, 4.52], [5.58, 6.02]], "shrink": [7.3, 7.7], "hide": 8.1}},
		"crouch": {"dur": 8.0, "len": [6.5, 10], "stretch": [2, 6], "w": 0.8, "legs": true, "need": 15, "player": true,
			"body": [[0, {}], [0.4, {"dy": -0.02, "lean": 0.05, "hp": 0.1}], [1.6, {"dy": -0.44, "dz": -0.1, "wp": 0.3, "lean": 0.25, "ko": 0.4, "heel": 0.45, "hp": -0.2}],
				[2.0, CR], [3.0, CR2], [4.4, CR2], [5.4, CR], [6.2, {"dy": -0.44, "dz": -0.1, "wp": 0.3, "lean": 0.25, "ko": 0.4, "heel": 0.45, "hp": -0.2}],
				[7.2, {"dy": -0.04, "lean": 0.04}], [8, {}]],
			"armL": [[0, null], [1.6, ONKNEE.call("L", 1)], [6.2, ONKNEE.call("L", 1)], [7.2, null]],
			"armR": [[0, null], [1.6, ONKNEE.call("R", -1)], [2.6, ONKNEE.call("R", -1)], [3.4, {"at": GR(-0.21, 0.08, 0.3), "pole": [-0.6, 0, -1], "wf": -0.3, "cu": -0.1}],
				[4.4, {"at": GR(-0.22, 0.08, 0.31), "pole": [-0.6, 0, -1], "wf": -0.3, "cu": 0.05}], [5.2, ONKNEE.call("R", -1)], [6.2, ONKNEE.call("R", -1)], [7.2, null]],
			"gaze": [[0, {"y": 0, "p": 0}], [1.2, {"y": -0.1, "p": 0.1}], [3.6, {"y": -0.2, "p": 0.15}], [5, {"y": 0.2, "p": 0.0}], [6.4, {"y": 0, "p": 0.0}], [7.4, {"y": 0, "p": 0}], [8, {"y": 0, "p": 0}]]},
		"sit": {"dur": 16.0, "len": [10, 25], "stretch": [4, 12], "w": 1.2, "legs": true, "kup": 1.0, "need": 40, "player": true,
			"body": [[0, {}], [0.5, {"dy": -0.03, "lean": 0.06, "hp": 0.08}], [1.6, {"dy": -0.45, "dz": -0.12, "wp": 0.3, "lean": 0.25, "ko": 0.4, "heel": 0.4, "hp": 0.1, "gap": 0.2}],
				[2.4, {"dy": -0.58, "dz": -0.42, "wp": 0.1, "lean": 0.15, "ko": 0.36, "heel": 0.05, "hp": 0.02, "seat": 0.45, "gap": 0.05}], [3.4, SIT],
				[12, SIT], [12.8, {"dy": -0.63, "dz": -0.52, "wp": 0.25, "lean": 0.3, "ko": 0.37, "seat": 1, "gap": 0}],
				[13.5, {"dy": -0.56, "dz": -0.36, "wp": 0.32, "lean": 0.32, "ko": 0.39, "heel": 0.1, "seat": 0.4, "gap": 0.05}],
				[14.2, {"dy": -0.45, "dz": -0.12, "wp": 0.3, "lean": 0.25, "ko": 0.4, "heel": 0.35, "gap": 0.2}], [15.2, {"dy": -0.03, "lean": 0.05}], [16, {}]],
			"armL": [[0, null], [1.6, ONKNEE.call("L", 1)], [12.2, ONKNEE.call("L", 1)], [13.4, {"at": KN("L", 0, 0.02, 0.06), "pole": [0.6, -0.4, -0.6], "wf": 0.6, "cu": -0.1}], [14.2, ONKNEE.call("L", 1)], [15.4, null]],
			"armR": [[0, null], [1.6, ONKNEE.call("R", -1)], [12.2, ONKNEE.call("R", -1)], [13.4, {"at": KN("R", 0, 0.02, 0.06), "pole": [-0.6, -0.4, -0.6], "wf": 0.6, "cu": -0.1}], [14.2, ONKNEE.call("R", -1)], [15.4, null]],
			"gaze": [[0, {"y": 0, "p": 0}], [1.2, {"y": 0, "p": 0.35}], [3, {"y": 0, "p": 0.1, "f": 0}], [3.6, {"f": 1}], [11.6, {"f": 1}], [12, {"y": 0, "p": 0.15}], [14.5, {"y": 0, "p": 0.1}], [16, {"y": 0, "p": 0}]]},
		"twist": {"dur": 2.8, "w": 0.6, "mirror": true, "fx": "twist",
			"gaze": [[0, {"y": 0, "p": 0}], [0.5, {"y": 0.15, "p": 0.4}], [2.4, {"y": 0.15, "p": 0.4}], [2.8, {"y": 0, "p": 0}]]},
		"shoulders": {"dur": 1.8, "w": 0.6, "fx": "shoulders"},
		# talking gestures (conversation.gd forces them; never picked at random): an open
		# hand out in front of the chest while making a point, and a little shrug
		"explain": {"dur": 2.4, "talk": true,
			"armR": [[0, null], [0.45, {"at": CH(-0.13, -0.14, 0.27), "pole": [-1, -0.6, -0.3], "wt": 1.1, "wf": -0.2, "cu": 0.05}],
				[1.1, {"at": CH(-0.15, -0.1, 0.31), "pole": [-1, -0.6, -0.3], "wt": 1.2, "wf": -0.25, "cu": 0.0}],
				[1.7, {"at": CH(-0.14, -0.13, 0.28), "pole": [-1, -0.6, -0.3], "wt": 1.1, "wf": -0.2, "cu": 0.05}], [2.4, null]],
			"body": [[0, {}], [0.5, {"hp": 0.05, "tw": -0.04}], [1.1, {"hp": -0.03, "tw": -0.06}], [1.8, {"hp": 0.03}], [2.4, {}]]},
		"shrug": {"dur": 1.6, "talk": true, "fx": "shoulders",
			"body": [[0, {}], [0.4, {"hr": 0.06, "hp": -0.03}], [1.0, {"hr": 0.05}], [1.6, {}]]},
		# a salute (forced: someone on duty greeting Ash, people.json "greet_act"): the
		# right hand up smartly to the cap's brim at the temple, held, then back down
		"salute": {"dur": 2.7, "talk": true,
			"armR": [[0, null], [0.28, {"at": CH(-0.2, 0.12, 0.16), "pole": [-1, -0.25, 0.1], "wf": 0.1, "wt": 0.3, "cu": -0.05}], [0.5, SAL], [1.95, SAL],
				[2.25, {"at": CH(-0.2, 0.1, 0.15), "pole": [-1, -0.3, 0.1], "wf": 0.1, "wt": 0.3, "cu": 0.0}], [2.7, null]],
			"body": [[0, {}], [0.45, {"lean": -0.05, "hp": -0.05, "sh": -0.01}], [1.95, {"lean": -0.05, "hp": -0.04, "sh": -0.01}], [2.7, {}]],
			"gaze": [[0, {"y": 0, "p": 0}], [2.7, {"y": 0, "p": 0}]]},
		# hungry (hunger.gd forces it with a tummy growl): a hand to his tummy, a little
		# rub, a glance down at it, a sigh
		"tummy": {"dur": 3.0, "talk": true, "player": true,
			"armR": [[0, null], [0.45, TUM], [0.85, TUM2], [1.25, TUM], [1.65, TUM2], [2.05, TUM], [2.55, null]],
			"armL": [[0, null], [0.6, TUML], [2.2, TUML], [2.7, null]],
			"body": [[0, {}], [0.5, {"lean": 0.12, "hp": 0.3, "sh": 0.01}], [2.0, {"lean": 0.14, "hp": 0.28, "sh": 0.015}], [2.5, {"lean": 0.04, "hp": 0.05}], [3.0, {}]],
			"gaze": [[0, {"y": 0, "p": 0}], [0.5, {"y": 0, "p": 0.45}], [2.0, {"y": 0, "p": 0.4}], [3.0, {"y": 0, "p": 0}]]},
	}
	return ACTIONS

# the hand on the tummy (the front of the belly, over the jacket), and a little to the side
const TUM := {"at": ["Hips", -0.02, 0.13, 0.16], "pole": [-1, -0.5, -0.3], "wf": 0.1, "cu": 0.15}
const TUM2 := {"at": ["Hips", 0.03, 0.15, 0.165], "pole": [-1, -0.5, -0.3], "wf": 0.15, "cu": 0.15}
const TUML := {"at": ["Hips", 0.06, 0.09, 0.15], "pole": [1, -0.5, -0.3], "wf": -0.1, "cu": 0.1}

# ---------- stances: a way of standing held while idle (people.json "stance") ----------
# Arms held with the same IK as the actions (targets on the body, metres), body bends
# (lean, the legs drawn in); faded in while standing, out for walking and for any
# action that moves an arm (the arms go back to the stance when it ends).
static var STANCES := {}
static func _stances() -> Dictionary:
	if not STANCES.is_empty(): return STANCES
	STANCES = {
		# hands folded in front, the right over the left, arms relaxed down: at ease on duty
		"hands_front": {
			"armR": {"at": H(-0.006, -0.14, 0.19), "pole": [-1, 0.0, 0.25], "wf": -0.2, "wd": 0.3, "wt": 0.5, "cu": 0.35},
			"armL": {"at": H(0.022, -0.16, 0.178), "pole": [1, 0.0, 0.25], "wf": -0.2, "wd": 0.3, "wt": 0.5, "cu": 0.45},
			"body": {"lean": -0.03, "legs_in": 0.035, "hp": -0.02}},
	}
	return STANCES

# ---------- set up ----------
func _init(actor: CastActor, is_npc: bool, with_ball: bool) -> void:
	A = actor
	npc = is_npc
	rng.randomize()
	P.wait = rng.randf_range(8, 15)
	var D := _defs()
	for n in D:
		if D[n].get("ball", false) and not with_ball: continue
		if npc and D[n].get("player", false): continue
		if D[n].get("talk", false): continue
		names.append(n)
	if with_ball: _make_ball()

func _make_ball() -> void:
	ball = Node3D.new()
	var r := 0.034
	var mat := func(c: String) -> ShaderMaterial:
		var m := ShaderMaterial.new(); m.shader = CastActor.SHADER
		m.set_shader_parameter("albedo", Color(c)); return m
	var top := MeshInstance3D.new(); var s1 := SphereMesh.new(); s1.radius = r; s1.height = r; s1.is_hemisphere = true; s1.radial_segments = 20; s1.rings = 6
	top.mesh = s1; top.material_override = mat.call("e8352e"); ball.add_child(top)
	var bot := MeshInstance3D.new(); bot.mesh = s1; bot.material_override = mat.call("f4f2ee"); bot.rotation.x = PI; ball.add_child(bot)
	var band := MeshInstance3D.new(); var cy := CylinderMesh.new(); cy.top_radius = r * 1.01; cy.bottom_radius = r * 1.01; cy.height = r * 0.16; cy.radial_segments = 20
	band.mesh = cy; band.material_override = mat.call("2f2b36"); ball.add_child(band)
	var btn := MeshInstance3D.new(); var cb := CylinderMesh.new(); cb.top_radius = r * 0.34; cb.bottom_radius = r * 0.34; cb.height = r * 0.2; cb.radial_segments = 16
	btn.mesh = cb; btn.material_override = mat.call("2f2b36"); btn.rotation.x = PI / 2; btn.position.z = r * 0.95; ball.add_child(btn)
	var b2 := MeshInstance3D.new(); var cb2 := CylinderMesh.new(); cb2.top_radius = r * 0.22; cb2.bottom_radius = r * 0.22; cb2.height = r * 0.24; cb2.radial_segments = 16
	b2.mesh = cb2; b2.material_override = mat.call("f4f2ee"); b2.rotation.x = PI / 2; b2.position.z = r * 1.0; ball.add_child(b2)
	ball.visible = false
	A.add_child(ball)

var busy: bool:
	get: return P.busy
var eyes: bool:
	get: return P.eyes

func _start(n: String) -> void:
	var d: Dictionary = ACTIONS[n]
	var ln: float = rng.randf_range(d.len[0], d.len[1]) if d.has("len") else d.dur
	P.act = {"name": n, "def": d, "t": 0.0, "len": ln, "env": 1.0, "ab": -1.0, "feet": null, "lt": 0.0,
		"wob": {"L": 0.0, "R": 0.0}, "side": "R" if d.get("mirror", false) and rng.randf() < 0.5 else "L", "rel": null}
	P.last = n; P.busy = true

# start an action now (render checks)
func force(n: String, ln := 0.0) -> void:
	if P.act: _end()
	_start(n)
	if ln > 0.0: P.act.len = ln

func _end() -> void:
	if P.act and P.act.def.has("gaze"): A.L.look = rng.randf_range(0.5, 1.5)
	P.act = null; P.busy = false; P.eyes = false; P.wait = rng.randf_range(12, 30)
	A.holder.position.x = 0.0; A.holder.position.z = 0.0
	if ball: ball.visible = false

func _choose() -> String:
	var ok := []
	var s := 0.0
	for n in names:
		if n != P.last and P.idle >= float(ACTIONS[n].get("need", 0)):
			ok.append(n); s += float(ACTIONS[n].get("w", 1.0))
	var x := rng.randf() * s
	for n in ok:
		x -= float(ACTIONS[n].get("w", 1.0))
		if x <= 0.0: return n
	return ok[0]

# the action's own clock: the stretch span takes up a longer run
func _local(a: Dictionary) -> float:
	var d: Dictionary = a.def
	if not d.has("stretch") or a.len == d.dur: return a.t
	var st: Array = d.stretch
	var k: float = (st[1] - st[0] + a.len - d.dur) / (st[1] - st[0])
	if a.t <= st[0]: return a.t
	if a.t <= st[0] + (st[1] - st[0]) * k: return st[0] + (a.t - st[0]) / k
	return a.t - (a.len - d.dur)

# only these of the random actions (people.json "idles": someone on duty doesn't
# put their hands behind their head and gaze at the sky)
func limit(allowed: Array) -> void:
	names = names.filter(func(n): return allowed.has(n))

func update(dt: float, wI: float) -> void:
	# the stance: in while standing, out while an arm is busy with an action
	var arms_busy: bool = P.act != null and (P.act.def.has("armL") or P.act.def.has("armR"))
	var want := wI if stance != "" and not arms_busy else 0.0
	_sw += (want - _sw) * (1.0 - exp(-dt * (5.0 if want < _sw else 3.0)))
	_swi = wI
	if wI > 0.9: P.idle += dt
	elif wI < 0.5: P.idle = 0.0
	var a = P.act
	if a == null:
		if wI > 0.9:
			P.wait -= dt
			if P.wait < 0.0: _start(_choose())
		elif wI < 0.5: P.wait = maxf(P.wait, rng.randf_range(8, 15))
		return
	if a.ab < 0.0 and wI < 0.6: a.ab = 0.0
	if a.ab >= 0.0:
		a.ab += dt / (0.5 if a.def.get("legs", false) else 0.35)
		a.env = 1.0 - _ease(a.ab)
		if a.ab >= 1.0: _end(); return
	else:
		a.t += dt
		if a.t >= a.len: _end(); return
	var t := _local(a)
	if a.def.has("gaze"):
		var gz := _sc(a.def, "gaze", t)
		if not (gz.get("f", 0.0) > 0.5):
			A.L.ty = gz.get("y", 0.0) * a.env * (-1.0 if a.side == "R" else 1.0)
			A.L.tp = gz.get("p", 0.0) * a.env
			A.L.look = maxf(A.L.look, 0.5)
	a.lt = t

# ---------- posing (skeleton space) ----------
func _bi(n: String) -> int: return A.bones.get(n, -1)

# a point on a bone: offset in metres in the bone's rest axes, turned with the bone
func point(spec: Array) -> Vector3:
	if spec[0] == "root": return (Vector3(spec[1], spec[2], spec[3]) - A.holder.position) / A.k
	var bi := _bi(spec[0])
	var x := A.gxf(bi)
	var rq := x.basis.get_rotation_quaternion() * A.rest_w[bi]
	return x.origin + rq * Vector3(spec[1], spec[2], spec[3]) / A.k

func _ik(n1: String, n2: String, n3: String, T: Vector3, pole: Vector3, hinge: Array, w: float) -> void:
	var b1 := _bi(n1); var b2 := _bi(n2); var b3 := _bi(n3)
	if b1 < 0 or b2 < 0 or b3 < 0 or w < 1e-4: return
	var s1: Quaternion = A.q[b1]
	var s2: Quaternion = A.q[b2]
	var p1 := A.gxf(b1).origin
	var a := p1.distance_to(A.gxf(b2).origin)
	var c := A.gxf(b2).origin.distance_to(A.gxf(b3).origin)
	var d := clampf(T.distance_to(p1), absf(a - c) + 1e-4, (a + c) * 0.9995)
	var bend := acos(clampf((d * d - a * a - c * c) / (2.0 * a * c), -1.0, 1.0))
	A.pose(n2, [[hinge[0], hinge[1], hinge[2], hinge[3] * bend]])
	# the limb is not quite straight at rest (a knee a few degrees bent): one Newton
	# step on the reach, so the end lands on the target instead of a little short
	var d0 := A.gxf(b3).origin.distance_to(p1)
	var sb := sin(bend)
	if sb > 0.05 and absf(d0 - d) > 1e-6:
		bend = clampf(bend + (d0 - d) * d0 / (a * c * sb), 0.0, PI - 0.01)
		A.pose(n2, [[hinge[0], hinge[1], hinge[2], hinge[3] * bend]])
	var v3 := (A.gxf(b3).origin - p1).normalized()
	var dir := (T - p1).normalized()
	var q1 := Quaternion(v3, dir)
	var kk := q1 * (A.gxf(b2).origin - p1)
	kk -= dir * kk.dot(dir)
	var pp := pole - dir * pole.dot(dir)
	if kk.length_squared() > 1e-10 and pp.length_squared() > 1e-8:
		kk = kk.normalized(); pp = pp.normalized()
		var ang := atan2(kk.cross(pp).dot(dir), kk.dot(pp))
		q1 = Quaternion(dir, ang) * q1
	var pw := A.gxf(A.skel.get_bone_parent(b1)).basis.get_rotation_quaternion()
	var w1 := q1 * A.gxf(b1).basis.get_rotation_quaternion()
	A.q[b1] = s1.slerp((pw.inverse() * w1).normalized(), w)
	A.q[b2] = s2.slerp(A.q[b2], w)

# set a bone's orientation (in the root frame), blended by w
func _orient(n: String, qr: Quaternion, w: float) -> void:
	var bi := _bi(n)
	if bi < 0: return
	var pw := A.gxf(A.skel.get_bone_parent(bi)).basis.get_rotation_quaternion()
	A.q[bi] = A.q[bi].slerp((pw.inverse() * qr).normalized(), w)

func post(_dt: float) -> void:
	if _sw > 0.002: _stance(_sw)
	var a = P.act
	if a == null: return
	var t: float = a.lt
	var env: float = a.env
	var d: Dictionary = a.def
	# feet where they stand (root frame), before anything moves them
	if d.get("legs", false) and a.feet == null:
		var feet := []
		for s in ["L", "R"]:
			var root := func(p: Vector3) -> Vector3: return A.holder.position + p * A.k
			var ank: Vector3 = root.call(A.gxf(_bi(s + "Foot")).origin)
			var tp: Vector3 = root.call(A.gxf(_bi(s + "Toe")).origin)
			var knee: Vector3 = root.call(A.gxf(_bi(s + "Leg")).origin)
			var hip: Vector3 = root.call(A.gxf(_bi(s + "Thigh")).origin)
			var axis := (ank - hip).normalized()
			var pole := knee - hip
			pole -= axis * pole.dot(axis)
			if pole.length_squared() < 1e-8: pole = Vector3(0, 0, 1)
			feet.append({"ank": ank, "toe": tp, "pole": pole.normalized(), "q": A.gxf(_bi(s + "Foot")).basis.get_rotation_quaternion(), "g": _ground_local(tp)})
		# the soles as they stand: never lower than that (a little above the ground, as the clip has them)
		for i in 2:
			var S := _sole_sample("L" if i == 0 else "R")
			if not S.is_empty(): feet[i].g = minf(feet[i].g, float(_seat_low(S)[0]))
		a.feet = feet
	var Bo: Dictionary = _sc(d, "body", t) if d.has("body") else {}
	var k := env
	if d.get("legs", false):
		A.holder.position.x = Bo.get("dx", 0.0) * k; A.holder.position.z = Bo.get("dz", 0.0) * k; A.holder.position.y += Bo.get("dy", 0.0) * k
	var b := A.bend
	var v: float
	v = Bo.get("wp", 0.0)
	if v: b.call("Waist", 1, 0, 0, v * k)
	v = Bo.get("lean", 0.0)
	if v: b.call("Spine1", 1, 0, 0, v * 0.3 * k); b.call("Spine2", 1, 0, 0, v * 0.35 * k); b.call("Spine3", 1, 0, 0, v * 0.35 * k)
	v = Bo.get("side", 0.0)
	if v: b.call("Spine1", 0, 0, 1, v * 0.4 * k); b.call("Spine2", 0, 0, 1, v * 0.3 * k); b.call("Spine3", 0, 0, 1, v * 0.3 * k)
	v = Bo.get("tw", 0.0)
	if v: b.call("Spine1", 0, 1, 0, v * 0.3 * k); b.call("Spine2", 0, 1, 0, v * 0.35 * k); b.call("Spine3", 0, 1, 0, v * 0.35 * k)
	v = Bo.get("sh", 0.0)
	if v: b.call("LShoulder", 0, 0, 1, v * k); b.call("RShoulder", 0, 0, 1, -v * k)
	v = Bo.get("hp", 0.0)
	if v: b.call("Neck", 1, 0, 0, v * 0.4 * k); b.call("Head", 1, 0, 0, v * 0.6 * k)
	v = Bo.get("hy", 0.0)
	if v: b.call("Neck", 0, 1, 0, v * 0.4 * k); b.call("Head", 0, 1, 0, v * 0.6 * k)
	v = Bo.get("hr", 0.0)
	if v: b.call("Neck", 0, 0, 1, v * 0.4 * k); b.call("Head", 0, 0, 1, v * 0.6 * k)
	v = Bo.get("jaw", 0.0)
	var jb := _bi("FJlipL")
	if v and jb >= 0: A.q[jb] = A.q[jb] * Quaternion(Vector3.UP, v * k)   # its own axis opens the mouth
	P.eyes = Bo.get("eye", 0.0) * k > 0.5
	a.wob.L = 0.0; a.wob.R = 0.0
	if d.has("fx"): _fx(d.fx, a, t, env)
	if d.get("legs", false): _legs(a, Bo, env)
	for s in ["L", "R"]:
		if d.has("arm" + s): _arm(a, s, t, env)
	if d.has("prop") and ball: _ball(a, t, env)

func _fx(id: String, a: Dictionary, t: float, env0: float) -> void:
	var b := A.bend
	match id:
		"scratch":
			if t > 0.8 and t < 3.0: a.wob.L = sin((t - 0.8) * 15.0) * 0.012 * _sm(0.8, 1.1, t) * (1.0 - _sm(2.6, 3.0, t))
		"twist":
			var u := t / 2.8
			var env := _sm(0.0, 0.15, u) * (1.0 - _sm(0.85, 1.0, u)) * env0
			var s: String = a.side
			b.call(s + "Thigh", 1, 0, 0, -0.1 * env); b.call(s + "Leg", 1, 0, 0, 0.35 * env); b.call(s + "Foot", 1, 0, 0, 0.45 * env)
			b.call(s + "Thigh", 0, 1, 0, sin(t * 3.6) * 0.26 * env)
			b.call("Spine1", 0, 0, 1, (-0.03 if s == "L" else 0.03) * env)
		"shoulders":
			var u := t / 1.8
			var env := _sm(0.0, 0.15, u) * (1.0 - _sm(0.85, 1.0, u)) * env0
			var up := sin(minf(1.0, u * 1.4) * PI) * env0
			b.call("LShoulder", 0, 0, 1, 0.14 * up); b.call("RShoulder", 0, 0, 1, -0.14 * up); b.call("Spine3", 1, 0, 0, -0.06 * up)
			b.call("Head", 0, 0, 1, sin(u * PI * 2.0) * 0.12 * env)

# the stance held (before any action, which then blends from it)
func _stance(w: float) -> void:
	var S: Dictionary = _stances().get(stance, {})
	if S.is_empty(): return
	var Bo: Dictionary = S.get("body", {})
	var b := A.bend
	var v: float = Bo.get("lean", 0.0)
	if v: b.call("Spine1", 1, 0, 0, v * 0.3 * w); b.call("Spine2", 1, 0, 0, v * 0.35 * w); b.call("Spine3", 1, 0, 0, v * 0.35 * w)
	v = Bo.get("hp", 0.0)
	if v: b.call("Neck", 1, 0, 0, v * 0.4 * w); b.call("Head", 1, 0, 0, v * 0.6 * w)
	v = Bo.get("legs_in", 0.0)
	if v:
		for s in [["L", 1.0], ["R", -1.0]]:
			b.call(s[0] + "Thigh", 0, 0, 1, -s[1] * v * w); b.call(s[0] + "Foot", 0, 0, 1, s[1] * v * w)
	for s in ["L", "R"]:
		if S.has("arm" + s):
			_arm({"def": {"arm" + s: [[0.0, S["arm" + s]], [1.0, S["arm" + s]]]}, "wob": {"L": 0.0, "R": 0.0}}, s, 0.5, w)

# ---------- arms ----------
func _arm(a: Dictionary, s: String, t: float, env: float) -> void:
	var keys: Array = a.def["arm" + s]
	var sg := 1.0 if s == "L" else -1.0
	var n := keys.size()
	var i := 0
	while i < n - 2 and t >= keys[i + 1][0]: i += 1
	var k0: Array = keys[i]
	var k1: Array = keys[i + 1]
	var w := 1.0
	var run := []
	if t <= keys[0][0]:
		if keys[0][1] == null: return
		run = [0, 0]
	elif t >= keys[n - 1][0]:
		if keys[n - 1][1] == null: return
		run = [n - 1, n - 1]
	elif k0[1] == null and k1[1] == null: return
	elif k0[1] == null:
		w = _ease((t - k0[0]) / (k1[0] - k0[0])); run = [i + 1, i + 1]
	elif k1[1] == null:
		w = 1.0 - _ease((t - k0[0]) / (k1[0] - k0[0])); run = [i, i]
	else:
		var lo := i
		var hi := i + 1
		while lo > 0 and keys[lo - 1][1] != null: lo -= 1
		while hi < n - 1 and keys[hi + 1][1] != null: hi += 1
		run = [lo, hi]
	w *= env
	if w < 1e-4: return
	var ks := keys.slice(run[0], run[1] + 1)
	var ts := []
	var px := []; var py := []; var pz := []
	var p0 := []; var p1 := []; var p2 := []
	for x in ks:
		ts.append(x[0])
		var p := point(x[1].at)
		px.append(p.x); py.append(p.y); pz.append(p.z)
		var po: Array = x[1].get("pole", [sg, -0.3, -0.3])
		p0.append(float(po[0])); p1.append(float(po[1])); p2.append(float(po[2]))
	var T := Vector3(mono(ts, px, t), mono(ts, py, t), mono(ts, pz, t))
	var PL := Vector3(mono(ts, p0, t), mono(ts, p1, t), mono(ts, p2, t)).normalized()
	var tg := {}
	for f in ["wf", "wd", "wt", "cu"]:
		var vs := []
		for x in ks: vs.append(float(x[1].get(f, 0.0)))
		tg[f] = mono(ts, vs, t)
	if a.wob[s]: T += Vector3(0, a.wob[s] / A.k, 0)
	_ik(s + "ArmA", s + "ForeArm", s + "Hand", T, PL, [0, 1, 0, -sg], w)
	var h := _bi(s + "Hand")
	if h >= 0:
		var sv: Quaternion = A.q[h]
		A.pose(s + "Hand", [[1, 0, 0, sg * tg.wt], [0, 0, 1, -sg * tg.wf], [0, 1, 0, -sg * tg.wd]])
		A.q[h] = sv.slerp(A.q[h], w)
	if tg.cu:
		for f in ["B", "C", "D"]:
			for j in range(1, 4): A.bend("%sFinger%s%d" % [s, f, j], 0, 0, 1, -sg * tg.cu * w)

# ---------- legs: feet kept where they stood ----------
# With the feet planted the body's height is free, and for sitting it is solved
# from the body itself: the lowest point of the seat (the skinned jeans round the
# buttocks and the backs of the thighs, a sample of their vertices) is brought
# onto the ground under it. The body track's "seat" (0..1) blends from its
# scripted height to that contact, "gap" lifts the contact (metres, for the
# touch-down and the push up); the pelvis rolls back ("pelvis tilt") by as much
# as the thighs flex past a natural hip flexion, so it sits on its seat bones.
# The seat never goes through the ground, whatever the track says.
const SEAT_GAP := 0.003      # contact: this much above the ground (m)
const FLEX_MAX := 2.0        # the hip's own flexion; past it the pelvis rolls back
const TILT_MAX := 0.4
const SEAT_BONES := ["Waist", "Hips", "LThigh", "RThigh"]
const LEG_BONES := ["Hips", "LThigh", "LLeg", "LFoot", "LToe", "RThigh", "RLeg", "RFoot", "RToe"]

func _legs(a: Dictionary, Bo: Dictionary, env: float) -> void:
	var sw: float = _cl(Bo.get("seat", 0.0), 0.0, 1.0) * env
	var hb := _bi("Hips")
	# the seat is only looked at when it is anywhere near the ground
	if sw <= 0.0 and (hb < 0 or A.holder.position.y + A.gxf(hb).origin.y * A.k - _ground_local(A.holder.position + A.gxf(hb).origin * A.k) > 0.3):
		_legs_ik(a, Bo, env)
		return
	var S := _seat_sample()
	if S.is_empty():
		_legs_ik(a, Bo, env)
		return
	var saved: Array[Quaternion] = []
	var ids := PackedInt32Array()
	for n in LEG_BONES:
		var bi := _bi(n)
		ids.append(bi); saved.append(A.q[bi] if bi >= 0 else Quaternion.IDENTITY)
	var y_s: float = A.holder.position.y
	var want: float = maxf(0.0, Bo.get("gap", 0.0)) + SEAT_GAP
	# (started from last frame's contact: one or two poses a frame once it is found)
	var tilt: float = a.get("stilt", 0.0) * sw
	var y: float = y_s + (a.get("sdy", 0.0) if sw > 0.0 else 0.0)
	# the ground under the seat as a plane (root frame): heights are taken above it
	_ground_plane(A.holder.position + A.gxf(hb).origin * A.k)
	var r := _seat_pose(a, Bo, env, ids, saved, y, tilt, S)
	var gap: float = r[0]
	if sw > 0.0:
		# the contact height: secant steps (the seat moves with the body, give or take
		# the thighs turning about the planted feet)
		var yp := y
		var gp := gap
		var flex := _flex()
		for it in 4:
			var tl := _cl(flex - FLEX_MAX, 0.0, TILT_MAX)
			if absf(gap - want) < 5e-4 and absf(tl * sw - tilt) < 0.005: break
			tilt = tl * sw
			var ny := y + (want - gap)
			if it > 0 and absf(gap - gp) > 1e-5 and absf(y - yp) > 1e-5:
				ny = y + (want - gap) / clampf((gap - gp) / (y - yp), 0.5, 2.0)
			yp = y; gp = gap; y = ny
			r = _seat_pose(a, Bo, env, ids, saved, y, tilt, S)
			gap = r[0]
			flex = _flex()
		var y_c := y + (want - gap)
		a.sdy = y_c - y_s
		a.stilt = tilt / sw
		var y_f := lerpf(y_s, y_c, sw)
		if absf(y_f - y) > 2e-4:
			r = _seat_pose(a, Bo, env, ids, saved, y_f, tilt, S)
			gap = r[0]
	else:
		a.sdy = 0.0; a.stilt = 0.0
	# never through the ground
	if gap < SEAT_GAP - 1e-4:
		_seat_pose(a, Bo, env, ids, saved, A.holder.position.y + SEAT_GAP - gap, tilt, S)

# the legs posed with the body at height y (root frame) and the pelvis tilted;
# returns [the seat's lowest height above the ground plane, that point (root frame)]
func _seat_pose(a: Dictionary, Bo: Dictionary, env: float, ids: PackedInt32Array, saved: Array[Quaternion], y: float, tilt: float, S: Dictionary) -> Array:
	for j in ids.size():
		if ids[j] >= 0: A.q[ids[j]] = saved[j]
	A.holder.position.y = y
	if tilt > 0.0: A.bend("Hips", 1, 0, 0, -tilt)
	_legs_ik(a, Bo, env)
	return _seat_low(S, _pn, _pc)

# how far the thighs are swung forward from the trunk's down axis (radians, both legs' mean)
func _flex() -> float:
	var wb := _bi("Waist")
	if wb < 0: return 0.0
	var rw := (A.gxf(wb).basis.get_rotation_quaternion() * A.rest_w[wb]).inverse()
	var f := 0.0
	for s in ["L", "R"]:
		var v := rw * (A.gxf(_bi(s + "Leg")).origin - A.gxf(_bi(s + "Thigh")).origin)
		var a := atan2(v.z, -v.y)
		f += (a + TAU if a < -PI * 0.5 else a) * 0.5   # (past straight up, not round to minus)
	return f

# the ground near a point (root frame) as a plane: heights above it are n.p - c
var _pn := Vector3.UP
var _pc := 0.0
func _ground_plane(p: Vector3) -> void:
	_pn = Vector3.UP; _pc = 0.0
	if not A.ground.is_valid() or not A.is_inside_tree(): return
	var d := 0.3
	var sx := (_ground_local(p + Vector3(d, 0, 0)) - _ground_local(p - Vector3(d, 0, 0))) / (2.0 * d)
	var sz := (_ground_local(p + Vector3(0, 0, d)) - _ground_local(p - Vector3(0, 0, d))) / (2.0 * d)
	_pn = Vector3(-sx, 1.0, -sz)
	_pc = _ground_local(p) - sx * p.x - sz * p.z

# the ground's height (root frame) under a point given in the root frame
func _ground_local(p: Vector3) -> float:
	if not A.ground.is_valid() or not A.is_inside_tree(): return 0.0
	var w := A.global_transform * p
	return float(A.ground.call(w.x, w.z)) - A.global_position.y

# a sample of the skinned body, made once per look: the vertices hung only from
# the given bones that pass keep(rest point), thinned to one per cell (model units)
static var _samples := {}
func _sample(key: String, names: Array, keep: Callable, cell: float) -> Dictionary:
	var kk: String = A.look + "/" + key
	if _samples.has(kk): return _samples[kk]
	var S := {}
	var sb := PackedInt32Array()
	for n in names: sb.append(_bi(n))
	var nb := sb.size()
	if not sb.has(-1):
		var binds: Array[Transform3D] = []
		binds.resize(nb)
		var have := []
		have.resize(nb); have.fill(false)
		var pts := PackedVector3Array()
		var wts := PackedFloat32Array()
		var cells := {}
		for mi in A.meshes:
			var sk: Skin = mi.skin
			if sk == null or mi.mesh.get_surface_count() == 0: continue
			var arr := mi.mesh.surface_get_arrays(0)
			var B = arr[Mesh.ARRAY_BONES]
			var Wt = arr[Mesh.ARRAY_WEIGHTS]
			var V = arr[Mesh.ARRAY_VERTEX]
			if B == null or Wt == null or V == null or B.size() != V.size() * 4: continue
			var slot := PackedInt32Array()
			for i in sk.get_bind_count():
				var bi := sk.get_bind_bone(i)
				if bi < 0: bi = A.skel.find_bone(sk.get_bind_name(i))
				var j := sb.find(bi)
				slot.append(j)
				if j >= 0 and not have[j]: binds[j] = sk.get_bind_pose(i); have[j] = true
			for i in V.size():
				var v: Vector3 = V[i]
				if not keep.call(v): continue
				var wv := PackedFloat32Array()
				wv.resize(nb)
				var ok := true
				for j in 4:
					var w: float = Wt[i * 4 + j]
					if w <= 0.0: continue
					var sj := slot[B[i * 4 + j]]
					if sj < 0: ok = false; break
					wv[sj] += w
				if not ok: continue
				var c := Vector3i((v / cell).floor())
				if cells.has(c): continue
				cells[c] = true
				pts.append(v)
				wts.append_array(wv)
		if pts.size() > 0 and not have.has(false):
			S = {"bones": sb, "binds": binds, "v": pts, "w": wts}
	_samples[kk] = S
	return S

# the seat: from mid-thigh up to the waist, the back and underside of the jeans
func _seat_sample() -> Dictionary:
	if _bi("LThigh") < 0 or _bi("LLeg") < 0 or _bi("Waist") < 0: return {}
	var y_lo := (A.skel.get_bone_global_rest(_bi("LThigh")).origin.y + A.skel.get_bone_global_rest(_bi("LLeg")).origin.y) * 0.5
	var y_hi := A.skel.get_bone_global_rest(_bi("Waist")).origin.y + 0.04
	return _sample("seat", SEAT_BONES, func(v: Vector3) -> bool: return v.y >= y_lo and v.y <= y_hi and v.z <= 0.05, 0.02)

# a sole: the bottom of what hangs from the foot and the toes on that side
func _sole_sample(s: String) -> Dictionary:
	var fb := _bi(s + "Foot")
	if fb < 0 or _bi(s + "Toe") < 0: return {}
	var sg := signf(A.skel.get_bone_global_rest(fb).origin.x)
	var y_hi := A.skel.get_bone_global_rest(_bi(s + "Toe")).origin.y * 0.4
	return _sample("sole" + s, [s + "Foot", s + "Toe"], func(v: Vector3) -> bool: return v.y <= y_hi and v.x * sg > 0.0, 0.012)

# a sample's lowest point at the pose being built: [height (root frame; with a plane
# n, c: above it, n.p - c), point (root frame)]
func _seat_low(S: Dictionary, n := Vector3.UP, c := 0.0) -> Array:
	var sb: PackedInt32Array = S.bones
	var nb := sb.size()
	var bd: Array[Transform3D] = S.binds
	var m: Array[Transform3D] = []
	var rx := PackedFloat32Array(); var ry := PackedFloat32Array(); var rz := PackedFloat32Array(); var ro := PackedFloat32Array()
	for j in nb:
		var t := A.gxf(sb[j]) * bd[j]
		m.append(t)
		rx.append(t.basis.x.dot(n)); ry.append(t.basis.y.dot(n)); rz.append(t.basis.z.dot(n)); ro.append(t.origin.dot(n))
	var V: PackedVector3Array = S.v
	var Wt: PackedFloat32Array = S.w
	var lo := INF
	var li := 0
	for i in V.size():
		var v := V[i]
		var y := 0.0
		for j in nb:
			var w := Wt[i * nb + j]
			if w > 0.0: y += w * (rx[j] * v.x + ry[j] * v.y + rz[j] * v.z + ro[j])
		if y < lo: lo = y; li = i
	var p := Vector3.ZERO
	for j in nb:
		var w := Wt[li * nb + j]
		if w > 0.0: p += (m[j] * V[li]) * w
	return [A.holder.position.dot(n) + lo * A.k - c, A.holder.position + p * A.k]

func _legs_ik(a: Dictionary, Bo: Dictionary, env: float) -> void:
	for i in 2:
		var s := "L" if i == 0 else "R"
		var F: Dictionary = a.feet[i]
		var sg := 1.0 if i == 0 else -1.0
		var heel: float = Bo.get("heel" + s, Bo.get("heel", 0.0)) * env
		var qH := Quaternion(Vector3.RIGHT, heel)
		var ank: Vector3 = qH * (F.ank - F.toe) + F.toe
		var T := (ank - A.holder.position) / A.k
		var ko: float = Bo.get("ko", 0.0) * sg
		# (sitting, the knees come up past the hips: the pole leans up too, or it would
		# lie along the thigh-to-ankle line once the hips are down level with the feet)
		var PL: Vector3 = Quaternion(Vector3.UP, ko) * (F.pole + Vector3.UP * float(a.def.get("kup", 0.0))).normalized()
		var tb := _bi(s + "Toe")
		var tq: Quaternion = A.q[tb] if tb >= 0 else Quaternion.IDENTITY
		_ik(s + "Thigh", s + "Leg", s + "Foot", T, PL, [1, 0, 0, 1], env)
		_orient(s + "Foot", qH * F.q, env)
		if heel:
			A.bend(s + "Toe", 1, 0, 0, -heel)
			# the heel turns up about the ball's joint, a little above the sole: the
			# sole round the ball would dip into the ground, so the foot is lifted by that
			var S := _sole_sample(s)
			if not S.is_empty():
				var dip: float = F.g - float(_seat_low(S)[0])
				if dip > 0.0:
					T.y += dip / A.k
					if tb >= 0: A.q[tb] = tq
					_ik(s + "Thigh", s + "Leg", s + "Foot", T, PL, [1, 0, 0, 1], env)
					_orient(s + "Foot", qH * F.q, env)
					A.bend(s + "Toe", 1, 0, 0, -heel)

# ---------- the ball: from the belt, small, grows in the hand, tossed, shrunk, put back ----------
func _ball(a: Dictionary, t: float, env: float) -> void:
	var S: Dictionary = a.def.prop
	ball.visible = t > S.show and t < S.hide and env > 0.02
	if not ball.visible: return
	var sc: float = (0.4 + 0.6 * _sm(S.grow[0], S.grow[1], t) - 0.6 * _sm(S.shrink[0], S.shrink[1], t)) * (1.0 if a.ab < 0.0 else 1.0 - _sm(0.0, 0.4, a.ab))
	var sock := point(["pc_g_ball", 0, -0.03, 0] if _bi("pc_g_ball") >= 0 else ["RHand", -0.06, -0.03, 0])
	var BP := A.holder.position + sock * A.k
	var spin := 0.0
	for tt in S.toss:
		if t <= tt[0] or t >= tt[1] or a.ab >= 0.0: continue
		if a.rel == null or a.rel.t != tt[0]: a.rel = {"t": tt[0], "p": BP}
		var u: float = (t - tt[0]) / (tt[1] - tt[0])
		var q: Vector3 = a.rel.p.lerp(BP, u)
		q.y += 4.0 * 0.2 * u * (1.0 - u)
		BP = q; spin = u * TAU
	var hb := _bi("RHand")
	var hq := A.gxf(hb).basis.get_rotation_quaternion() * A.rest_w[hb] * Quaternion(Vector3.RIGHT, spin)
	ball.transform = Transform3D(Basis(hq).scaled(Vector3.ONE * sc), BP)
