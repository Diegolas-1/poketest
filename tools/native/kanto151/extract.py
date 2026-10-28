#!/usr/bin/env python3
# Step 1 of the Kanto 151 move-design pipeline: boils the raw PokeAPI cache (fetch.sh)
# down to one compact source file the generator reads (gen.py).
#   python3 -I extract.py <cache dir> <out source.json>
# Per species: names, types, base stats, capture rate, the Kanto evolution link, and
# every move it can learn in any main-series game, by method (level-up, machine,
# tutor, egg). Per move: the game numbers (power, accuracy, priority, class, type,
# meta: ailment, chances, drain, healing, hits, stat changes, target) and a short text.
import json, os, sys

CACHE, OUT = sys.argv[1], sys.argv[2]

def load(p):
    with open(os.path.join(CACHE, p)) as f:
        return json.load(f)

# version groups, oldest first; the level a move is learned at is taken from the
# Kanto-era games first (Yellow, Red/Blue, FireRed/LeafGreen, Let's Go), then the newest
LEVEL_PREF = ["yellow", "red-blue", "firered-leafgreen", "lets-go-pikachu-lets-go-eevee"]
NEWEST = ["champions", "scarlet-violet", "legends-arceus", "brilliant-diamond-shining-pearl",
          "sword-shield", "ultra-sun-ultra-moon", "sun-moon", "omega-ruby-alpha-sapphire", "x-y",
          "black-2-white-2", "black-white", "heartgold-soulsilver", "platinum", "diamond-pearl",
          "emerald", "ruby-sapphire", "crystal", "gold-silver", "xd", "colosseum", "blue-japan",
          "red-green-japan"]
METHOD_MAP = {"level-up": "level", "machine": "tm", "tutor": "tutor", "egg": "egg",
              "stadium-surfing-pikachu": "tutor", "xd-purification": "tutor", "train": "tutor"}

def eng(entries, key):
    for e in entries:
        if e["language"]["name"] == "en":
            return e[key]
    return ""

def chain_links(node, parent, out):
    sp = node["species"]["name"]
    det = node["evolution_details"]
    d = None
    for x in det:
        if x.get("version_group") and x["version_group"]["name"] in ("red-blue", "yellow", "gold-silver"):
            d = x; break
    if d is None and det:
        d = det[0]
    out[sp] = {"from": parent, "detail": d}
    for n in node["evolves_to"]:
        chain_links(n, sp, out)

links = {}
for f in os.listdir(os.path.join(CACHE, "ev")):
    chain_links(load("ev/" + f)["chain"], None, links)

species = []
moves_used = set()
for i in range(1, 152):
    p = load("p%d.json" % i)
    s = load("s%d.json" % i)
    name = eng(s["names"], "name")
    lk = links.get(s["name"], {"from": None, "detail": None})
    evo = None
    if lk["from"]:
        d = lk["detail"] or {}
        evo = {"from": lk["from"].replace("-", "_"),
               "trigger": (d.get("trigger") or {}).get("name"),
               "level": d.get("min_level"),
               "item": (d.get("item") or {}).get("name"),
               "happiness": d.get("min_happiness")}
    learn = {}
    for mv in p["moves"]:
        mid = mv["move"]["name"]
        best = {}
        for v in mv["version_group_details"]:
            meth = METHOD_MAP.get(v["move_learn_method"]["name"])
            if not meth:
                continue
            vg = v["version_group"]["name"]
            lv = v["level_learned_at"]
            best.setdefault(meth, []).append((vg, lv))
        if not best:
            continue
        moves_used.add(mid)
        row = {}
        if "level" in best:
            byvg = dict(best["level"])
            lv = None
            for vg in LEVEL_PREF + NEWEST:
                if vg in byvg:
                    lv = byvg[vg]; break
            row["level"] = lv
            row["level_vg"] = vg
        for meth in ("tm", "tutor", "egg"):
            if meth in best:
                row[meth] = True
        learn[mid] = row
    species.append({
        "dex": i, "api": s["name"], "name": name,
        "types": [t["type"]["name"] for t in sorted(p["types"], key=lambda t: t["slot"])],
        "stats": {st["stat"]["name"]: st["base_stat"] for st in p["stats"]},
        "height": p["height"], "weight": p["weight"],
        "capture_rate": s["capture_rate"], "legendary": s["is_legendary"], "mythical": s["is_mythical"],
        "evolution": evo, "learn": learn,
        "abilities": [[a["ability"]["name"], a["is_hidden"]] for a in sorted(p["abilities"], key=lambda a: a["slot"])],
    })

moves = {}
for mid in sorted(moves_used):
    d = load("mv/%s.json" % mid)
    meta = d.get("meta") or {}
    text = ""
    for f in reversed(d.get("flavor_text_entries", [])):
        if f["language"]["name"] == "en":
            text = f["flavor_text"]; break
    moves[mid] = {
        "name": eng(d["names"], "name"),
        "type": d["type"]["name"], "class": d["damage_class"]["name"],
        "power": d["power"], "accuracy": d["accuracy"], "priority": d["priority"], "pp": d["pp"],
        "gen": int({"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9}[d["generation"]["name"].split("-")[1]]),
        "target": d["target"]["name"],
        "effect_chance": d.get("effect_chance"),
        "ailment": (meta.get("ailment") or {}).get("name"),
        "category": (meta.get("category") or {}).get("name"),
        "min_hits": meta.get("min_hits"), "max_hits": meta.get("max_hits"),
        "drain": meta.get("drain", 0), "healing": meta.get("healing", 0),
        "crit_rate": meta.get("crit_rate", 0), "ailment_chance": meta.get("ailment_chance", 0),
        "flinch_chance": meta.get("flinch_chance", 0), "stat_chance": meta.get("stat_chance", 0),
        "stat_changes": [[c["stat"]["name"], c["change"]] for c in d.get("stat_changes", [])],
        "short": eng(d.get("effect_entries", []), "short_effect"),
        "text": " ".join(text.split()),
    }

with open(OUT, "w") as f:
    json.dump({"species": species, "moves": moves}, f, indent=0, ensure_ascii=False)
print("species", len(species), "moves", len(moves))
