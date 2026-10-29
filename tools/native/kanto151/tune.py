#!/usr/bin/env python3
# The balance loop for the Kanto 151 (energy v2): regenerate the data (gen.py), play
# the battle simulator (native/dev/battle_sim.tscn), read its report against
# kanto151_balance.json sim_targets, and nudge the data only:
#   - battle length: battle_config damage.scale
#   - commons and uncommons over or under their peers: their battle stats and focus gain (tuning.json species)
#   - rarity steps: battle_config rarity.level_stat (a stat bonus by rarity and its slope by level)
#   - slot steps: battle_config slots.gain_per_slot
#   - the starter triangle: battle_config matchups.weakness_by_level
#   - the role and tier mix: battle_config ai.reaction_value, two_phase_value, finisher_value, status_scale
#   - evolution steps: focus gain by evolution stage (tuning.json balance focus.stage_gain_bonus)
# Every change is logged in tuning.json "log" with the metric that caused it. Re-run it
# after any data change; it starts from the tuning already there.
#   python3 -I tools/native/kanto151/tune.py --godot <binary> --source <source.json> [--rounds 4] [--n 4]
#       [--opponents 14] [--bands 8,20,35] [--final-n 8] [--report native/dev/sim_report.json] [--dry]
import argparse, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
NATIVE = os.path.join(ROOT, "native")
TUNE = os.path.join(HERE, "tuning.json")
CFG = os.path.join(NATIVE, "life", "battle_config.json")
RARITIES = ["common", "uncommon", "rare", "very_rare", "legendary"]

ap = argparse.ArgumentParser()
ap.add_argument("--godot", required=True)
ap.add_argument("--source", required=True)
ap.add_argument("--rounds", type=int, default=4)
ap.add_argument("--n", type=int, default=4)
ap.add_argument("--opponents", type=int, default=14)
ap.add_argument("--bands", default="8,20,35")
ap.add_argument("--final-n", type=int, default=8)
ap.add_argument("--report", default=os.path.join(NATIVE, "dev", "sim_report.json"))
ap.add_argument("--final-only", action="store_true", help="apply, regenerate and write the final report, no tuning rounds")
ap.add_argument("--work", default="/tmp")
ap.add_argument("--dry", action="store_true", help="measure only, change nothing")
ap.add_argument("--apply-only", action="store_true", help="write tuning.json into the config and regenerate, no battles")
ap.add_argument("--label", default=time.strftime("%Y-%m-%d %H:%M"), help="the run label written on every log entry")
A = ap.parse_args()
A.report = os.path.abspath(A.report)
A.work = os.path.abspath(A.work)

def load_tune():
    if os.path.exists(TUNE):
        return json.load(open(TUNE))
    return {"_doc": "The tuning layer tune.py keeps (gen.py reads it): config (battle_config numbers by section.key), balance (deep-merged into the design balance), species (focus deltas), moves (power factors), log (every change and why).",
            "config": {}, "balance": {}, "species": {}, "moves": {}, "log": []}

def save_tune(t):
    with open(TUNE, "w") as f:
        json.dump(t, f, indent=1, ensure_ascii=False)
        f.write("\n")

def _cfg_json():
    return json.load(open(CFG))

def get_config(path):
    """a number as the Kanto dataset sees it: the overlay (dataset_overrides.kanto) over the base"""
    sec, key = path.split(".")
    c = _cfg_json()
    ov = c.get("dataset_overrides", {}).get("kanto", {}).get(sec, {})
    return ov.get(key, c[sec][key])

def write_overlay(over):
    """battle_config.json's dataset_overrides (its last key) rewritten from the tuning config;
    the rest of the hand-formatted file is left as it is"""
    txt = open(CFG).read()
    i = txt.find('"dataset_overrides":')
    if i < 0: raise SystemExit("battle_config.json has no dataset_overrides")
    head = txt[:i].rstrip()
    txt = head + '\n  "dataset_overrides": ' + json.dumps({"kanto": over}) + "\n}\n"
    json.loads(txt)
    open(CFG, "w").write(txt)

def gen():
    r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "gen.py"), A.source, os.path.join(NATIVE, "life")], capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit(r.stdout + r.stderr)

def sim(report, suites, n, extra=()):
    args = [A.godot, "--headless", "--path", NATIVE, "res://dev/battle_sim.tscn", "--", "--suite=" + suites, "--n=%d" % n,
            "--bands=" + A.bands, "--opponents=%d" % A.opponents, "--tiers=common,uncommon,rare", "--report=" + report, "--quiet"] + list(extra)
    t = time.time()
    r = subprocess.run(args, capture_output=True, text=True, timeout=7200)
    print("  sim %s n=%d: %.0fs" % (suites, n, time.time() - t), flush=True)
    return json.load(open(report))

def summary(rep):
    out = {"turns": rep["turns"].get("mean"), "battles": rep["battles"], "missed": rep["checks"]["missed"], "checks": rep["checks"]["total"]}
    su = rep["suites"]
    if "tiers" in su:
        for band, tiers in su["tiers"]["bands"].items():
            for tier, b in tiers.items():
                out["spread %s %s" % (band, tier)] = round(b["spread"], 3)
    if "cross" in su:
        for band, d in su["cross"].items():
            for k, v in d.items(): out["cross %s %s" % (band, k)] = round(v["rate"], 3)
    for k in ("evo", "level", "slots"):
        if k in su: out[k] = round(su[k]["rate"], 3)
    m = rep["moves"]
    out["roles"] = {k: round(v, 3) for k, v in m["role_share"].items()}
    out["tiers_share"] = {k: round(v, 3) for k, v in m["tier_share"].items()}
    out["distinct_real_use"] = m["distinct_real_use"]
    return out

def adjust(rep, tune, rnd):
    T = rep["targets"]
    log = []
    su = rep["suites"]
    # battle length
    mt = rep["turns"].get("mean", 5)
    want_lo, want_hi = 5.5, 7.5
    if mt < want_lo or mt > want_hi:
        cur = float(get_config("damage.scale"))
        new = round(cur * (mt / 5.5) ** 0.8, 3)
        new = max(0.15, min(1.0, new))
        tune["config"]["damage.scale"] = new
        log.append({"change": "damage.scale %s -> %s" % (cur, new), "why": "mean battle %.2f turns (aiming 5.5 to 7.5, inside the 3 to 8 target, so mids and finishers get their turns)" % mt})
    # commons and uncommons against their peers
    ex = set(T.get("exempt", []))
    if "tiers" in su:
        for sp, r in su["tiers"]["species"].items():
            if r["rarity"] not in ("common", "uncommon") or sp in ex or r["games"] < 8: continue
            rate = r["rate"]
            if 0.43 <= rate <= 0.57: continue
            # its battle stats a few percent up or down (and its focus gain a little for a big miss)
            # small steps: battles are close to deterministic, so a big step flips whole matchups
            d = max(-0.05, min(0.05, round((0.5 - rate) * 0.2, 3)))
            ts_ = tune["species"].setdefault(sp, {})
            ts_["stats"] = round(max(-0.45, min(0.6, ts_.get("stats", 0.0) + d)), 3)
            note = "%s battle stats %+.1f%% (now %+.1f%%)" % (sp, d * 100, ts_["stats"] * 100)
            if abs(rate - 0.5) > 0.3:
                g = 1.0 if rate < 0.5 else -1.0
                ts_["gain"] = round(max(-5.0, min(6.0, ts_.get("gain", 0.0) + g)), 1)
                note += ", focus gain %+.0f (now %+.1f)" % (g, ts_["gain"])
            log.append({"change": note, "why": "%.2f against its %s peers" % (rate, r["rarity"])})
    # rarity steps: battle_config rarity.level_stat, a stat bonus by rarity at each sim band's level,
    # so each step lands in the target band at every level (a pair's change carries to the rarer ones).
    # The step size comes from the last measured response (win rate per unit of stat bonus) at that level.
    if "cross" in su:
        lo, hi = T["rarity_step_winrate"]["min"], T["rarity_step_winrate"]["max"]
        mid = (lo + hi) / 2.0
        bands = sorted(int(b) for b in su["cross"])
        ls_ = tune["config"].get("rarity.level_stat") or {}
        if ls_.get("levels") != bands:
            ls_ = {"levels": bands, "bonus": {r: [0.0] * len(bands) for r in RARITIES}, "min": 0.6, "max": 1.6}
        tune["config"]["rarity.level_stat"] = ls_
        fit = tune.setdefault("rarity_fit", {})
        default_sens = {b: 1.5 + 0.2 * b for b in bands}
        for k in ("uncommon>common", "rare>uncommon", "very_rare>rare"):
            upper, lower = k.split(">")
            for bi, band in enumerate(bands):
                v = su["cross"].get(str(band), {}).get(k)
                if v is None: continue
                rate = v["rate"]
                rel = ls_["bonus"][upper][bi] - ls_["bonus"][lower][bi]
                key = "%s@%d" % (k, band)
                prev = fit.get(key)
                sens = default_sens[band]
                if prev and abs(rel - prev["rel"]) > 0.004:
                    m = (rate - prev["rate"]) / (rel - prev["rel"])
                    if 0.5 <= m <= 20: sens = m
                fit[key] = {"rel": round(rel, 4), "rate": round(rate, 3), "sens": round(sens, 2)}
                if lo <= rate <= hi: continue
                db = max(-0.05, min(0.05, round(-0.7 * (rate - mid) / sens, 4)))
                for r in RARITIES[RARITIES.index(upper):]:
                    ls_["bonus"][r][bi] = round(ls_["bonus"][r][bi] + db, 4)
                log.append({"change": "rarity.level_stat %s and up at Lv %d: stats %+.1f%% (now %+.1f%% over %s)" % (upper, band, db * 100, (rel + db) * 100, lower),
                            "why": "%s wins %.2f at Lv %d (target %.2f to %.2f; about %.1f win rate per unit of stats there)" % (k, rate, band, lo, hi, sens)})
    # one more slot: focus a turn for each equipped move past the first four
    if "slots" in su:
        smin = float(T.get("slot_unlock_winrate", {}).get("min", 0.6))
        rate = su["slots"]["rate"]
        cur = float(tune["config"].get("slots.gain_per_slot", get_config("slots.gain_per_slot")))
        new = cur
        if rate < smin: new = min(5.0, cur + (1.5 if cur == 0 else 0.75))
        elif rate > smin + 0.15: new = max(0.0, cur - 0.5)
        if new != cur:
            tune["config"]["slots.gain_per_slot"] = new
            log.append({"change": "slots.gain_per_slot %s -> %s" % (cur, new), "why": "one more slot wins %.2f (target %.2f or more)" % (rate, smin)})
    # the signature mechanics in play: how the planner rates reactions, two-phase moves, finishers and effects
    rs = rep["moves"]["role_share"]
    tsh = rep["moves"]["tier_share"]
    RT = T.get("role_share", {})
    TT = T.get("tier_share", {})
    def nudge(key, up, step, cap_lo, cap_hi, why, mult=False):
        cur = float(tune["config"].get(key, get_config(key)))
        new = (cur * (1 + step) if up else cur / (1 + step)) if mult else (cur + step if up else cur - step)
        new = round(max(cap_lo, min(cap_hi, new)), 3)
        if new != cur:
            tune["config"][key] = new
            log.append({"change": "%s %s -> %s" % (key, cur, new), "why": why})
    rmin = float(RT.get("reaction", {}).get("min", 0.08))
    # a trainer sets a reaction only when its temperament says so (reaction_rate): when one is set it is
    # almost always worth it, so the gate is the lever
    if rs.get("reaction", 0) < rmin: nudge("ai.reaction_rate_scale", True, 0.2, 0.5, 2.0, "reactions are %.3f of actions (want %.2f)" % (rs.get("reaction", 0), rmin), True)
    elif rs.get("reaction", 0) > rmin * 2: nudge("ai.reaction_rate_scale", False, 0.1, 0.5, 2.0, "reactions are %.3f of actions" % rs.get("reaction", 0), True)
    tmin = float(RT.get("two_phase", {}).get("min", 0.05))
    if rs.get("two_phase", 0) < tmin: nudge("ai.two_phase_value", True, 0.1, 0.8, 1.8, "two-phase moves are %.3f of actions (want %.2f)" % (rs.get("two_phase", 0), tmin))
    elif rs.get("two_phase", 0) > tmin * 2: nudge("ai.two_phase_value", False, 0.1, 0.8, 1.8, "two-phase moves are %.3f of actions" % rs.get("two_phase", 0))
    fmin = float(TT.get("finisher", {}).get("min", 0.15))
    if tsh.get("finisher", 0) < fmin: nudge("ai.finisher_value", True, 0.08, 0.8, 1.6, "finishers are %.3f of actions (want %.2f)" % (tsh.get("finisher", 0), fmin))
    elif tsh.get("finisher", 0) > fmin * 2: nudge("ai.finisher_value", False, 0.05, 0.8, 1.6, "finishers are %.3f of actions" % tsh.get("finisher", 0))
    omax = float(RT.get("offense", {}).get("max", 0.6))
    support = rs.get("disruption", 0) + rs.get("utility", 0)
    if rs.get("offense", 0) > omax and support < 0.25: nudge("ai.status_scale", True, 0.08, 0.6, 1.6, "offense is %.3f of actions (want %.2f or less), disruption and utility %.3f" % (rs.get("offense", 0), omax, support))
    elif support > 0.32: nudge("ai.status_scale", False, 0.08, 0.6, 1.6, "disruption and utility are %.3f of actions (offense %.3f)" % (support, rs.get("offense", 0)))
    # evolution steps
    if "evo" in su:
        es = T["evolution_step_winrate"]
        rate = su["evo"]["rate"]
        if not (es["min"] <= rate <= es["max"]):
            gb = tune["balance"].setdefault("stats", {}).setdefault("group_bonus", {"basic": 0.0, "middle": 0.0, "final": 0.0, "single": 0.0})
            dlt = 0.04 if rate < es["min"] else -0.04
            gb["middle"] = round(gb["middle"] + dlt, 3); gb["final"] = round(gb["final"] + dlt * 1.5, 3)
            log.append({"change": "stats group_bonus middle %+.2f, final %+.2f (now %s)" % (dlt, dlt * 1.5, gb), "why": "evolved forms win %.2f (target %.2f to %.2f)" % (rate, es["min"], es["max"])})
    # level steps: the level curve's flattening
    if "level" in su:
        ls = T["level_step_winrate"]
        rate = su["level"]["rate"]
        if not (ls["min"] <= rate <= ls["max"]):
            cur = float(tune["config"].get("stats.level_offset", get_config("stats.level_offset")))
            dlt = (25.0 if rate > ls["max"] + 0.12 else 8.0) if rate > ls["max"] else -6.0
            new = max(0.0, min(50.0, cur + dlt))
            tune["config"]["stats.level_offset"] = new
            log.append({"change": "stats.level_offset %s -> %s" % (cur, new), "why": "+10 levels wins %.2f (target %.2f to %.2f)" % (rate, ls["min"], ls["max"])})
    # the starter triangle: the TCG weakness by level (battle_config matchups.weakness_by_level),
    # each sim level's point moved on its own so the right type wins in the band at every level
    if "starters" in su:
        st = T.get("starter_triangle", {"min": 0.55, "max": 0.85})
        lvls = sorted(int(x) for x in su["starters"])
        wb = tune["config"].get("matchups.weakness_by_level") or {}
        if wb.get("levels") != lvls:
            cur = float(tune["config"].get("matchups.weakness_mult", get_config("matchups.weakness_mult")))
            wb = {"levels": lvls, "mult": [cur] * len(lvls)}
        for i, lv in enumerate(lvls):
            xs = [v["x_rate"] for v in su["starters"][str(lv)].values()]
            avg = sum(xs) / max(1, len(xs))
            if st["min"] <= avg <= st["max"]: continue
            old = wb["mult"][i]
            wb["mult"][i] = round(max(1.0, min(2.2, old + (-0.1 if avg > st["max"] else 0.1))), 2)
            if wb["mult"][i] != old:
                log.append({"change": "matchups.weakness_by_level at Lv %d: %s -> %s" % (lv, old, wb["mult"][i]),
                            "why": "a starter beats the one it's strong against %.2f of the time at Lv %d (%s; target %.2f to %.2f)" % (avg, lv, ", ".join("%.2f" % x for x in xs), st["min"], st["max"])})
        tune["config"]["matchups.weakness_by_level"] = wb
    # the three tiers all in real use: mids and finishers pay a little more per chip when they sit idle
    ts = rep["moves"]["tier_share"]
    base_ppc = json.load(open(os.path.join(NATIVE, "life", "kanto151_balance.json")))["power_per_chip"]
    ppc = tune["balance"].setdefault("power_per_chip", {})
    caps = {"mid": 46.0, "finisher": 48.0}
    for tier, want in (("mid", 0.25),):
        row = ppc.setdefault(tier, dict(base_ppc[tier]))
        if ts.get(tier, 0) < want and float(row["common"]) + 1.0 <= caps[tier]:
            for r in RARITIES: row[r] = round(float(row[r]) + 1.0, 1)
            log.append({"change": "power_per_chip %s +1 for every rarity (common now %.1f)" % (tier, row["common"]), "why": "%s are %.2f of actions (want %.2f)" % (tier, ts.get(tier, 0), want)})
    if ts.get("opener", 0) > 0.6 and float(ppc.setdefault("opener", dict(base_ppc["opener"]))["common"]) - 0.5 >= 34.0:
        row = ppc["opener"]
        for r in RARITIES: row[r] = round(float(row[r]) - 0.5, 1)
        log.append({"change": "power_per_chip opener -0.5 (common now %.1f)" % row["common"], "why": "openers are %.2f of actions" % ts.get("opener", 0)})
    for l in log: l["round"] = rnd; l["run"] = A.label
    tune["log"].extend(log)
    return log

def apply_config(tune):
    over = {}
    for k, v in tune.get("config", {}).items():
        sec, key = k.split(".")
        over.setdefault(sec, {})[key] = v
    write_overlay(over)

def main():
    tune = load_tune()
    if A.apply_only:
        apply_config(tune)
        gen()
        print("applied tuning.json to battle_config.json and regenerated the data")
        return
    os.makedirs(A.work, exist_ok=True)
    history = []
    for rnd in range(1, 0 if A.final_only else A.rounds + 1):
        apply_config(tune)
        save_tune(tune)
        gen()
        rep = sim(os.path.join(A.work, "tune_r%d.json" % rnd), "tiers,cross,evo,level,slots,starters", A.n)
        s = summary(rep)
        history.append({"round": rnd, "summary": s})
        print("round %d: %s" % (rnd, json.dumps(s)), flush=True)
        if A.dry: break
        changes = adjust(rep, tune, rnd)
        print("  %d changes" % len(changes), flush=True)
        for c in changes: print("   ", c["change"], "|", c["why"])
        if not changes: break
    apply_config(tune)
    save_tune(tune)
    gen()
    final = sim(A.report, "all", A.final_n)
    final["tuning_history"] = history
    final["tuning_log"] = tune["log"]
    with open(A.report, "w") as f:
        json.dump(final, f, indent=1)
    print("final:", json.dumps(summary(final)))

main()
