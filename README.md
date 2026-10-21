# poketest

Pokémon Red (and Blue) built from the [pret/pokered](https://github.com/pret/pokered) disassembly and played in the browser with [binjgb](https://github.com/binji/binjgb), a Game Boy emulator compiled to WebAssembly.

## Play

```sh
git clone --recurse-submodules https://github.com/Diegolas-1/poketest
cd poketest
./build.sh                          # or: ./build.sh blue
python3 -m http.server 8000 -d web  # then open http://localhost:8000
```

`build.sh` downloads rgbds 1.0.4 into `tools/` (Linux x86-64 and macOS), builds the ROM, checks it against the original cartridge's checksum, and copies it to `web/pokered.gbc`. On other systems, install [rgbds 1.0.4](https://rgbds.gbdev.io/install) yourself first.

If `web/pokered.gbc` is missing, the page asks for a ROM file instead and remembers it on that device (IndexedDB). Add `?pick` to the address to choose a different one.

## Online

The player (without any ROM) is published to GitHub Pages, from the `gh-pages` branch that `.github/workflows/pages.yml` rewrites on every push to `main` touching `web/`: https://diegolas-1.github.io/poketest/. Open it, pick the `pokered.gbc` you built, and it loads by itself from then on.

## 3D Pallet Town (work in progress)

`web/world/` (the "3D Pallet Town" link, or https://diegolas-1.github.io/poketest/world/) is a spin-off: Pallet Town rebuilt as a free-roaming 3D world in the style of the anime's background paintings. It needs no ROM. Walk with WASD or the arrows (Shift runs, Space jumps), E talks and reads, drag or Q/R turns the camera, the wheel zooms; touch screens get a stick and buttons. Add `?q=low|medium|high` to pick the detail level (Chromebooks and phones start on low).

- `toon.js` cel shading (flat light bands, cool blue-green shade) for every Lambert material.
- `foliage.js` painted leaf-stroke atlas and procedural trees, bushes, flowers and rocks; `veg.js` places them.
- `town.js` Red's and Blue's cottages, Oak's hilltop lab, fences, signs, lamps and the dock, with painted textures and ink outlines.
- `terrain.js` ground, roads, the pond, the sea, Oak's hill and its stairs; `nature.js` sky, clouds and the painted mountains.
- `main.js` the player, camera, collisions, villagers, dialog and Oak stopping you at the tall grass.
- `foliage.html` and `oldtree.html` (`?ink=1` for outlines, `ink.js`) preview the plants on their own.

## HD-2D (work in progress)

`web/hd/` (the "HD-2D" link, or https://diegolas-1.github.io/poketest/hd/) plays the same game in 3D. The real game keeps running in the emulator; every frame the page reads the game's memory (map, positions, facing, text on screen) and draws it as an HD-2D scene with three.js: pixel-art ground, trees, signs, houses and furniture that stand up out of the map, characters as sprites facing the camera, shadows, a tilt-shift blur and bloom. Text boxes and menus are redrawn in a new style from the text the game writes to its screen. Battles, menus that fill the screen and the intro show the Game Boy screen.

So far Pallet Town is done: Red's house, Blue's house, Oak's lab and the town, from a new game to the edge of Route 1 (Oak stopping you, choosing a starter, the first rival battle). Other places show the Game Boy screen.

- `web/hd/gb.js` reads the game's memory and the ROM; `web/hd/syms.js` holds the memory addresses, generated from the build's symbol file by `tools/gen-syms.sh` (run by `build.sh`).
- `web/hd/world.js` builds the 3D map and the characters; `web/hd/tilesets.js` says which tiles stand up, which become furniture and how each is coloured.
- `web/hd/textbox.js` draws the text boxes and menus.

## Controls

| Key | Button |
| --- | --- |
| Arrow keys | D-pad |
| X | A |
| Z | B |
| Enter | Start |
| Tab | Select |
| Shift (hold) | Fast forward |
| Backspace (hold) | Rewind |
| Space | Pause |
| `[` / `]` | Change colour palette |
| F6 / F9 | Save / load state |

Touch screens get an on-screen controller. In-game saves and save states are kept in the browser's localStorage.

## Layout

- `pokered/`: the pret/pokered disassembly (git submodule). Changes to the game go here.
- `web/`: the player (`index.html`, `player.js`, binjgb's `binjgb.js` / `binjgb.wasm`).
- `build.sh`: builds the ROM into `web/`.

## Note on the ROM

The built ROM is a copy of Nintendo's game, so it is never committed (see `.gitignore`). Build it on your own machine; don't host it publicly.

## Credits

- [pret/pokered](https://github.com/pret/pokered) disassembly.
- [binjgb](https://github.com/binji/binjgb) by Ben Smith, MIT (`web/LICENSE.binjgb`); the player page and controller come from GB Studio (`web/LICENSE.gbstudio`).
- [three.js](https://threejs.org) r169, MIT (`web/lib/three/LICENSE`).
- [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans), SIL Open Font License (`web/hd/fonts/OFL.txt`).
