#!/usr/bin/env bash
# Step 0 of the Kanto 151 move-design pipeline: caches the raw data it is built from.
#   tools/native/kanto151/fetch.sh <cache dir>
# PokeAPI (pokemon, pokemon-species, evolution-chain and move records for #1-151) and the
# Pokémon TCG API's Scarlet & Violet 151 set (sv3pt5): the current card types, weakness,
# resistance and rarity of every Kanto species. Then: extract.py, then gen.py.
set -euo pipefail
C="${1:?cache dir}"
mkdir -p "$C/mv" "$C/ev"
curl -sS -m 60 "https://api.pokemontcg.io/v2/cards?q=set.id:sv3pt5&pageSize=250&select=name,number,types,rarity,weaknesses,resistances,attacks,abilities,nationalPokedexNumbers,hp" -o "$C/sv151.json"
for i in $(seq 1 151); do
  [ -s "$C/p$i.json" ] || curl -sS -m 60 "https://pokeapi.co/api/v2/pokemon/$i" -o "$C/p$i.json"
  [ -s "$C/s$i.json" ] || curl -sS -m 60 "https://pokeapi.co/api/v2/pokemon-species/$i" -o "$C/s$i.json"
done
python3 -I - "$C" > "$C/chains.txt" <<'EOF'
import json, sys
c = sys.argv[1]
print("\n".join(sorted({json.load(open("%s/s%d.json" % (c, i)))["evolution_chain"]["url"] for i in range(1, 152)})))
EOF
for u in $(cat "$C/chains.txt"); do
  id=$(basename "$u"); [ -s "$C/ev/$id.json" ] || curl -sS -m 60 "$u" -o "$C/ev/$id.json"
done
python3 -I - "$C" > "$C/allmoves.txt" <<'EOF'
import json, sys
c = sys.argv[1]
s = set()
for i in range(1, 152):
    for m in json.load(open("%s/p%d.json" % (c, i)))["moves"]: s.add(m["move"]["name"])
print("\n".join(sorted(s)))
EOF
for m in $(cat "$C/allmoves.txt"); do
  [ -s "$C/mv/$m.json" ] || curl -sS -m 60 "https://pokeapi.co/api/v2/move/$m" -o "$C/mv/$m.json"
done
echo "cached in $C"
