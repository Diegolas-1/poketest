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
