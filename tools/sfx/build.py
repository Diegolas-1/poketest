#!/usr/bin/env python3
# Builds the game's sound effects library: native/audio/sfx/<category>/<id>_<n>.ogg
# and native/audio/sfx/catalog.json (what native/sfx.gd reads), from
#   - Kenney's CC0 audio packs (kenney.nl: Impact Sounds, Interface Sounds,
#     RPG Audio, UI Audio, Sci-fi Sounds, Digital Audio, Casino Audio),
#   - CC0 recordings from OpenGameArt.org (tools/sfx/sources.json: each pack,
#     its author and page; every one checked as CC0 only),
#   - sounds made here from scratch (synth.py: interface, chimes, stingers,
#     machines, bells, creature chirps, the capture ball).
# Every file is trimmed, faded, filtered, levelled per category (one-shots on
# their loudest 50 ms, beds on their RMS), loops are crossfaded on their loop
# point, 3D one-shots are mono, beds stereo; Ogg Vorbis q4 (one-shots, 44.1
# kHz) and q4 at 32 kHz (beds).
#
#   python3 tools/sfx/build.py --src <dir>            build everything
#   python3 tools/sfx/build.py --src <dir> --only ui,footsteps
#   python3 tools/sfx/build.py --src <dir> --reel <out dir>   also a preview mp3 per category
# <dir> holds kenney/<pack>/ and oga/<slug>/ (the packs unzipped; fetch them
# with tools/sfx/fetch.py <dir>).
import argparse, json, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import dsp, synth
from dsp import SR

ROOT = HERE.parent.parent
OUT = ROOT / 'native' / 'audio' / 'sfx'
SOURCES = json.loads((HERE / 'sources.json').read_text())

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
ap.add_argument('--only', default='')
ap.add_argument('--reel', default='')
A = ap.parse_args()
SRC = Path(A.src)
ONLY = set(A.only.split(',')) if A.only else None
rng = np.random.default_rng(1234)

# loudness targets (dBFS of the loudest 50 ms) per category; beds by RMS
TARGET = {'ui': -17.0, 'footsteps': -19.0, 'character': -20.0, 'interior': -18.0, 'nature': -17.0,
          'creatures': -17.0, 'battle': -15.0, 'town': -17.0}
BED_RMS = -22.0

CAT = {}        # category -> list of entries
LIC_KENNEY = 'CC0 1.0 (Kenney, kenney.nl)'
LIC_ORIG = 'CC0 1.0 (original, made for this game: tools/sfx/synth.py)'


# ---------------- sources ----------------
USED_KEN = set()


def ken(pack, name):
    USED_KEN.add(pack)
    p = SRC / 'kenney' / pack / 'Audio' / name
    if not p.exists(): raise FileNotFoundError(p)
    return p


def kens(pack, prefix, n=None):
    USED_KEN.add(pack)
    d = SRC / 'kenney' / pack / 'Audio'
    fs = sorted(f for f in d.iterdir() if f.name.startswith(prefix) and f.suffix == '.ogg')
    return fs[:n] if n else fs


USED_OGA = set()


def og(slug, pattern):
    """Files of an OpenGameArt pack (unzipped under <src>/oga/<slug>/), sorted."""
    if slug not in SOURCES['oga']: raise KeyError('not in sources.json: ' + slug)
    USED_OGA.add(slug)
    fs = sorted((SRC / 'oga' / slug).rglob(pattern))
    if not fs: raise FileNotFoundError('%s/%s' % (slug, pattern))
    return fs


def ogl(slug, pattern, **kw):
    return [dsp.load(p, **kw) for p in og(slug, pattern)]


def credit(*slugs):
    return ['"%s" by %s (OpenGameArt, CC0): %s' % (SOURCES['oga'][s]['title'], SOURCES['oga'][s]['author'], SOURCES['oga'][s]['url']) for s in slugs]


LIC_OGA = 'CC0 1.0 (OpenGameArt; authors in source)'


def load(p, **kw):
    return dsp.load(p, **kw)


def hits(x, n, **kw):
    return dsp.cut_hits(x, n, **kw)


def loop_of(x, L, start=0.0, xf=2.0):
    return dsp.seam_loop(x, L, xf, start)


def calm_loop(x, L, xf=2.5):
    """A seamless loop of L s from the steadiest stretch of a long recording (no
    bumps or handling noise: the window whose loudest 50 ms sits least above its RMS)."""
    best, bs = None, 1e9
    for st in np.arange(0.0, max(0.1, len(x) / SR - L - xf - 0.5), 2.0):
        w = x[int(st * SR):int((st + L + xf) * SR)]
        if len(w) < int((L + xf) * SR): break
        sc = dsp.loud(w) - dsp.rms_db(w)
        if sc < bs: best, bs = st, sc
    return dsp.seam_loop(x, L, xf, best or 0.0)


def scatter(L, events, seed=0, stereo=True):
    """A loop of length L made of one-shots placed at random times (wrapping round
    the loop end, so it repeats seamlessly): events = [(clip, count, gain lo, gain hi)]."""
    r = np.random.default_rng(seed)
    n = int(L * SR)
    out = np.zeros((n, 2), dtype=np.float32)
    for clips, count, g0, g1 in events:
        for i in range(count):
            c = dsp.mono(clips[r.integers(len(clips))])
            at = int(r.uniform(0, L) * SR)
            g = r.uniform(g0, g1)
            pan = r.uniform(0.15, 0.85) if stereo else 0.5
            idx = (np.arange(len(c)) + at) % n
            np.add.at(out[:, 0], idx, c * g * (1 - pan) * 1.4)
            np.add.at(out[:, 1], idx, c * g * pan * 1.4)
    return out


# ---------------- processing ----------------
def clean_oneshot(x, cat, hp=50, thr=-45, fout=0.03, denoise=False, target=None, stereo=False, lp=None):
    if not stereo: x = dsp.mono(x)
    if denoise: x = dsp.denoise(x)
    if hp: x = dsp.hp(x, hp)
    if lp: x = dsp.lp(x, lp)
    x = dsp.trim(x, thr, 0.003, 0.04)
    x = dsp.fade(x, 0.002, fout)
    return dsp.level(x, TARGET[cat] if target is None else target)


def clean_bed(x, rms=BED_RMS, hp=40):
    x = dsp.stereo(x)
    if hp:   # filtered round the loop (three copies, the middle kept), so the seam stays seamless
        n = len(x)
        x = dsp.hp(np.concatenate([x, x, x]), hp)[n:2 * n]
    return dsp.level(x, rms, -3.0, by='rms')


def add(id, cat, xs, *, vol=0.0, pitch=(0.96, 1.04), vjit=1.5, mode='3d', dist=30.0, unit=3.0, loop=False,
        voices=4, bus='SFX', gap=0.0, tags=(), src=(), lic=LIC_KENNEY, clean=True, **ck):
    if ONLY and cat not in ONLY: return
    out = []
    for x in xs:
        if clean:
            x = clean_bed(x, **ck) if loop else clean_oneshot(x, cat, **ck)
        out.append(x)
    CAT.setdefault(cat, []).append(dict(id=id, category=cat, data=out, vol=vol, pitch=list(pitch), vjit=vjit,
                                        mode=mode, dist=dist, unit=unit, loop=loop, voices=voices, bus=bus, gap=gap,
                                        tags=list(tags), source=list(src), license=lic))


def harder(x):
    """A running step from a walking one: brighter, more attack, a touch higher."""
    x = dsp.shelf(dsp.mono(x), 2500, 3.0)
    g = 1 + 0.8 * np.exp(-np.arange(len(x)) / (0.015 * SR))
    return dsp.pitch(x * g.astype(np.float32), 1.04)


def takeoff(step, seed):
    """A jump's push-off: the step with a soft attack, a scuff higher up, and a little cloth."""
    r = np.random.default_rng(seed)
    x = dsp.mono(step).copy()
    n = min(len(x), int(0.03 * SR))
    x[:n] *= np.linspace(0.2, 1, n)
    x = dsp.pitch(dsp.hp(x, 180), r.uniform(1.05, 1.12))
    cl = dsp.mono(load(ken('rpg-audio', 'cloth%d.ogg' % (1 + seed % 4))))
    return dsp.mix(x, dsp.hp(cl, 400) * 0.25, at=[0, 0.01])


def landing(step, step2, seed):
    """Both feet landing: two steps a few ms apart, lower, with a body thump."""
    r = np.random.default_rng(seed)
    a = dsp.pitch(dsp.mono(step), r.uniform(0.86, 0.93))
    b = dsp.pitch(dsp.mono(step2), r.uniform(0.9, 0.97)) * 0.8
    th = synth.thump(r.uniform(70, 95), 0.25, seed) * 0.45
    return dsp.mix(a, b, th, at=[0, r.uniform(0.018, 0.04), 0])


# =====================================================================
# UI (2D, bus UI)
# =====================================================================
def ui():
    I = 'interface-sounds'
    U = dict(mode='2d', bus='UI', pitch=(0.98, 1.02), vjit=0.5, voices=3, tags=('ui',))
    add('ui_confirm', 'ui', [load(ken(I, f)) for f in ('confirmation_001.ogg', 'confirmation_003.ogg')] + [synth.ui_chime([76, 83], 0.06, 0.3)],
        src=['Kenney Interface Sounds: confirmation'], lic=LIC_KENNEY + '; ' + LIC_ORIG, **U)
    add('ui_cancel', 'ui', [load(ken(I, f)) for f in ('back_001.ogg', 'back_002.ogg', 'back_003.ogg')], src=['Kenney Interface Sounds: back'], **U)
    add('ui_cursor', 'ui', [load(p) for p in kens(I, 'select_', 4)], target=-21, src=['Kenney Interface Sounds: select'], **U)
    add('ui_menu_open', 'ui', [load(ken(I, f)) for f in ('maximize_001.ogg', 'maximize_003.ogg')], src=['Kenney Interface Sounds: maximize'], **U)
    add('ui_menu_close', 'ui', [load(ken(I, f)) for f in ('minimize_001.ogg', 'minimize_003.ogg')], src=['Kenney Interface Sounds: minimize'], **U)
    add('ui_tab', 'ui', [load(p) for p in kens(I, 'switch_', 3)], target=-20, src=['Kenney Interface Sounds: switch'], **U)
    add('ui_toggle_on', 'ui', [load(ken(I, 'toggle_001.ogg'))], src=['Kenney Interface Sounds: toggle'], **U)
    add('ui_toggle_off', 'ui', [load(ken(I, 'toggle_002.ogg'))], src=['Kenney Interface Sounds: toggle'], **U)
    add('ui_slider_tick', 'ui', [load(p) for p in kens(I, 'tick_', 3)], target=-22, src=['Kenney Interface Sounds: tick'], **U)
    add('ui_error', 'ui', [load(ken(I, 'error_004.ogg')), synth.error_buzz()], src=['Kenney Interface Sounds: error'], lic=LIC_KENNEY + '; ' + LIC_ORIG, **U)
    add('ui_notify', 'ui', [synth.ui_chime([84, 88, 91], 0.07, 0.5, room=0.25), synth.ui_chime([79, 84], 0.09, 0.5, room=0.25)], target=-19, src=['original'], lic=LIC_ORIG, **U)
    add('ui_banner', 'ui', [synth.ui_chime([72, 79, 84], 0.11, 0.9, room=0.4)], target=-22, src=['original'], lic=LIC_ORIG, **U)
    add('ui_item_get', 'ui', [synth.stinger_item()], target=-15, src=['original stinger'], lic=LIC_ORIG, **U)
    add('ui_save', 'ui', [synth.save_sound()], target=-17, src=['original'], lic=LIC_ORIG, **U)
    add('ui_prompt', 'ui', [load(ken(I, 'drop_002.ogg'))], target=-24, src=['Kenney Interface Sounds: drop'], **U)
    add('ui_dialog_open', 'ui', [load(ken(I, 'open_002.ogg'))], target=-24, src=['Kenney Interface Sounds: open'], **U)
    add('ui_dialog_advance', 'ui', [dialog_pop(i) for i in range(3)], target=-22, src=['original'], lic=LIC_ORIG, **U)
    add('ui_dialog_close', 'ui', [load(ken(I, 'close_002.ogg'))], target=-23, src=['Kenney Interface Sounds: close'], **U)
    # text blips: five voices, four letters each (soft square / triangle through a formant)
    B = dict(mode='2d', bus='UI', vjit=1.0, voices=2, tags=('ui', 'dialogue'), src=['original'], lic=LIC_ORIG, fout=0.006, thr=-60, hp=80)
    for name, base, wave, form, tg in (('low', 160, 'square', 900, -27), ('mid', 230, 'square', 1300, -27),
                                       ('high', 330, 'tri', 2600, -26), ('kid', 470, 'tri', 3600, -27), ('text', 600, 'sine', 4000, -29)):
        add('ui_blip_' + name, 'ui', [synth.blip(base * r, 0.045, wave, form, seed=k) for k, r in enumerate((1.0, 1.06, 0.94, 1.12))],
            pitch=(0.97, 1.03), target=tg, **B)
    add('ui_blip_critter', 'ui', [synth.chirp(k + 40, 1700, 0.05) for k in range(4)], pitch=(0.95, 1.08), target=-27, **B)


def dialog_pop(seed):
    """A soft page-on pop: a quick falling sine with a paper flick."""
    r = np.random.default_rng(seed + 50)
    d = 0.06
    n = int(d * SR)
    t = np.arange(n) / SR
    f = r.uniform(950, 1100) * np.exp(-t / 0.05)
    x = synth.osc(f, d) * synth.expdec(n, 0.015)
    fl = dsp.bp(synth.noise(d, 'white', seed), 3000, 9000) * synth.expdec(n, 0.004) * 0.3
    return dsp.fade(x + fl, 0.001, 0.015)


# =====================================================================
# footsteps: walk and run sets per surface, jump take-off and landing
# =====================================================================
FOOT = dict(mode='3d', dist=24.0, unit=2.0, voices=6, pitch=(0.94, 1.06), vjit=2.0)


def tile_step(x, seed):
    """A hard sole on glazed tile: the concrete step brighter, with a short ceramic tick."""
    r = np.random.default_rng(seed)
    x = dsp.shelf(dsp.mono(x), 3000, 4.0)
    d = 0.04
    tick = synth.osc(r.uniform(3200, 4200), d) * synth.expdec(int(d * SR), 0.004) * 0.25
    return dsp.mix(x, tick, at=[0, 0.002])


def water_step(splash, seed):
    """A foot in shallow water: a splash over a muffled footfall."""
    r = np.random.default_rng(seed)
    th = dsp.lp(dsp.mono(load(kens('impact-sounds', 'footstep_grass_')[seed % 5])), 900) * 0.6
    sp = dsp.mono(splash)[:int(0.45 * SR)]
    sp = dsp.fade(sp, 0.002, 0.12)
    return dsp.mix(th, sp * r.uniform(0.6, 0.9), at=[0, r.uniform(0.0, 0.02)])


def grass_rustle_step(step, rustle, seed):
    r = np.random.default_rng(seed)
    ru = dsp.fade(dsp.mono(rustle)[:int(0.5 * SR)], 0.01, 0.15)
    return dsp.mix(dsp.mono(step) * 0.8, ru * r.uniform(0.5, 0.8), at=[0, r.uniform(0.0, 0.03)])


def footsteps():
    IS = 'impact-sounds'
    FZ = 'fantozzis-footsteps-grasssand-stone'
    sets, runs = {}, {}
    K = lambda *n: ['Kenney %s' % x for x in n]
    sets['grass'] = ([load(p) for p in kens(IS, 'footstep_grass_')], K('Impact Sounds: footstep_grass'), LIC_KENNEY)
    rpg = [load(p) for p in kens('rpg-audio', 'footstep')]
    sets['dirt'] = (rpg[:6], K('RPG Audio: footstep'), LIC_KENNEY)
    runs['dirt'] = (rpg[6:], K('RPG Audio: footstep'), LIC_KENNEY)
    sets['sand'] = (ogl(FZ, '*Sand*.flac'), credit(FZ), LIC_OGA)
    sets['stone'] = (ogl(FZ, '*Stone*.flac'), credit(FZ), LIC_OGA)
    runs['stone'] = ([load(p) for p in kens(IS, 'footstep_concrete_')], K('Impact Sounds: footstep_concrete'), LIC_KENNEY)
    v2w = ogl('100-cc0-sfx-2', 'sfx100v2_footstep_wood_*')
    sets['wood'] = ([load(p) for p in kens(IS, 'footstep_wood_')] + v2w[:1], K('Impact Sounds: footstep_wood') + credit('100-cc0-sfx-2'), LIC_KENNEY + '; ' + LIC_OGA)
    runs['wood'] = (v2w[1:] + [harder(load(kens(IS, 'footstep_wood_')[2]))], credit('100-cc0-sfx-2') + K('Impact Sounds: footstep_wood'), LIC_KENNEY + '; ' + LIC_OGA)
    conc = [load(p) for p in kens(IS, 'footstep_concrete_')]
    sets['tile'] = ([tile_step(x, i) for i, x in enumerate(conc)], K('Impact Sounds: footstep_concrete (+ original tile tick)'), LIC_KENNEY + '; ' + LIC_ORIG)
    met = ogl('metal-footsteps-on-concrete', '*.wav')
    lv = sorted(range(len(met)), key=lambda i: dsp.loud(met[i]))
    sets['metal'] = ([met[i] for i in lv[8:14]], credit('metal-footsteps-on-concrete'), LIC_OGA)
    runs['metal'] = ([met[i] for i in lv[-4:]], credit('metal-footsteps-on-concrete'), LIC_OGA)
    sp = ogl('6-short-water-splashes', '*.flac')
    wet = ogl('100-cc0-sfx-2', 'sfx100v2_footstep_wet_*')
    sets['water'] = (wet + [water_step(sp[i], i) for i in (1, 2, 4)], credit('100-cc0-sfx-2', '6-short-water-splashes') + K('Impact Sounds: footstep_grass'), LIC_KENNEY + '; ' + LIC_OGA)
    rus = ogl('20-rustles-dry-leaves', '*.flac')
    short = sorted(rus, key=len)[:8]
    gr = sets['grass'][0]
    sets['tallgrass'] = ([grass_rustle_step(gr[i % 5], short[i], i) for i in range(6)], K('Impact Sounds: footstep_grass') + credit('20-rustles-dry-leaves'), LIC_KENNEY + '; ' + LIC_OGA)
    for s, (xs, src, lic) in sets.items():
        add('step_' + s, 'footsteps', xs, src=src, lic=lic, tags=('footstep', s, 'walk'), hp=70, **FOOT)
        rx, rsrc, rlic = runs.get(s, ([harder(x) for x in xs[:5]], src, lic))
        add('step_%s_run' % s, 'footsteps', rx, src=rsrc, lic=rlic, tags=('footstep', s, 'run'), hp=70, target=-16.5, **FOOT)
        if s == 'tallgrass': continue
        add('jump_' + s, 'footsteps', [takeoff(xs[i % len(xs)], i) for i in range(2)], src=src + K('RPG Audio: cloth'), lic=lic,
            tags=('jump', s), hp=90, target=-21, **FOOT)
        add('land_' + s, 'footsteps', [landing(xs[i % len(xs)], xs[(i + 2) % len(xs)], i) for i in range(3)], src=src + ['original thump'], lic=lic + '; ' + LIC_ORIG,
            tags=('land', s), hp=40, target=-15.5, **FOOT)


# =====================================================================
# the player and people
# =====================================================================
def character():
    R = 'rpg-audio'
    C = dict(mode='3d', dist=18.0, unit=2.0, voices=3)
    add('cloth_rustle', 'character', [load(p) for p in kens(R, 'cloth')], tags=('cloth',), src=['Kenney RPG Audio: cloth, clothBelt'], **C)
    add('bag_jostle', 'character', [load(ken(R, f)) for f in ('handleSmallLeather.ogg', 'handleSmallLeather2.ogg', 'beltHandle1.ogg', 'beltHandle2.ogg')],
        tags=('bag', 'leather'), src=['Kenney RPG Audio: handleSmallLeather, beltHandle'], **C)
    add('clap', 'character', [synth.verb(synth.clap(i), 0.2, 0.1, tail=0.15) for i in range(4)], tags=('clap', 'hands'), src=['original'], lic=LIC_ORIG, **C)
    add('tag_tap', 'character', [dsp.mix(synth.clap(10 + i, soft=True), dsp.lp(load(kens(R, 'cloth')[i]), 3000) * 0.5) for i in range(3)], tags=('tap', 'tag', 'play'),
        src=['original', 'Kenney RPG Audio: cloth'], lic=LIC_KENNEY + '; ' + LIC_ORIG, target=-22, **C)
    add('scuff', 'character', [dsp.hp(load(p), 300) for p in kens('impact-sounds', 'footstep_carpet_', 3)] + ogl('100-cc0-sfx-2', 'sfx100v2_footstep_0*')[:2],
        tags=('scuff', 'shoe'), src=['Kenney Impact Sounds: footstep_carpet'] + credit('100-cc0-sfx-2'), lic=LIC_KENNEY + '; ' + LIC_OGA, target=-23, **C)


# =====================================================================
# doors and interiors
# =====================================================================
def interior():
    R = 'rpg-audio'; SF = 'sci-fi-sounds'; IS = 'impact-sounds'
    DS = 'door-open-door-close-set'
    D = dict(mode='3d', dist=30.0, unit=3.0, voices=3)
    add('door_wood_open', 'interior', ogl(DS, '*DoorOpen0[1-4].flac') + [load(ken(R, 'doorOpen_1.ogg'))], tags=('door', 'wood'),
        src=credit(DS) + ['Kenney RPG Audio: doorOpen'], lic=LIC_KENNEY + '; ' + LIC_OGA, **D)
    add('door_wood_close', 'interior', ogl(DS, '*DoorClose0[1-4].flac') + [load(ken(R, 'doorClose_1.ogg'))], tags=('door', 'wood'),
        src=credit(DS) + ['Kenney RPG Audio: doorClose'], lic=LIC_KENNEY + '; ' + LIC_OGA, **D)
    knock = [dsp.mix(*[load(ken(IS, 'impactWood_medium_00%d.ogg' % ((i + j) % 5))) * (1 - 0.12 * j) for j in range(3)], at=[0, 0.17, 0.33]) for i in range(2)]
    add('door_knock', 'interior', knock, tags=('door', 'knock'), src=['Kenney Impact Sounds: impactWood_medium'], **D)
    # the lab's automatic door: a pneumatic hiss over the panel sliding on its track
    slide_o, slide_c = [], []
    for i in range(2):
        hiss = synth.whoosh(0.55, 2500, 7000, 20 + i, 2.0) * 0.5
        o = dsp.mono(load(ken(SF, 'doorOpen_00%d.ogg' % i)))
        c = dsp.mono(load(ken(SF, 'doorClose_00%d.ogg' % i)))
        thunk = synth.thump(110, 0.2, i) * 0.35
        slide_o.append(dsp.mix(hiss, dsp.lp(o, 6000) * 0.8, at=[0, 0.03]))
        slide_c.append(dsp.mix(hiss * 0.7, dsp.lp(c, 6000) * 0.8, thunk, at=[0, 0.02, 0.42]))
    add('door_slide_open', 'interior', slide_o, tags=('door', 'automatic', 'lab'), src=['Kenney Sci-fi Sounds: doorOpen', 'original hiss'], lic=LIC_KENNEY + '; ' + LIC_ORIG, **D)
    add('door_slide_close', 'interior', slide_c, tags=('door', 'automatic', 'lab'), src=['Kenney Sci-fi Sounds: doorClose', 'original hiss'], lic=LIC_KENNEY + '; ' + LIC_ORIG, **D)
    add('door_locked', 'interior', [dsp.mix(load(ken(R, 'metalLatch.ogg')), load(ken(R, 'metalClick.ogg')), at=[0, 0.22])], tags=('door', 'locked'),
        src=['Kenney RPG Audio: metalLatch, metalClick'], **D)
    MW = '100-cc0-metal-and-wood-sfx'; C1 = '100-cc0-sfx'
    add('gate_creak', 'interior', ogl(C1, 'door_0[12].ogg') + ogl(MW, 'wood_squeak_*') + ogl('metal-interactions', '*metal_swing1.wav'), tags=('gate', 'creak', 'hinge'),
        src=credit(C1, MW, 'metal-interactions'), lic=LIC_OGA, **D)
    add('fence_latch', 'interior', [load(ken(R, 'metalLatch.ogg')), dsp.pitch(load(ken(R, 'metalClick.ogg')), 0.85)] + ogl(MW, 'lock_open*'), tags=('fence', 'latch'),
        src=['Kenney RPG Audio: metalLatch, metalClick'] + credit(MW), lic=LIC_KENNEY + '; ' + LIC_OGA, **D)
    add('drawer', 'interior', ogl(MW, 'wood_misc_0[1-3].ogg'), tags=('drawer', 'wood'), src=credit(MW), lic=LIC_OGA, **D)
    add('cupboard', 'interior', ogl(MW, 'wood_close_*') + [load(ken(R, 'creak1.ogg'))], tags=('cupboard', 'door'), src=credit(MW) + ['Kenney RPG Audio: creak'],
        lic=LIC_KENNEY + '; ' + LIC_OGA, **D)
    SW = '10-clicks-and-switches'
    add('switch', 'interior', [load(p) for p in og(SW, 'click.[1345].ogg')] + ogl(C1, 'switch_*'), tags=('switch', 'light', 'button'), src=credit(SW, C1), lic=LIC_OGA, target=-21, **D)
    add('pc_beep', 'interior', [dsp.mix(*[synth.pc_beep(synth.m2f(m)) for m in seq], at=[k * 0.09 for k in range(len(seq))])
                                for seq in ((88, 91), (91, 84, 88), (84,), (93, 93))], tags=('computer', 'beep'), src=['original'], lic=LIC_ORIG, target=-22, **D)
    add('pc_boot', 'interior', [synth.pc_boot()], tags=('computer', 'boot'), src=['original'], lic=LIC_ORIG, target=-19, **D)
    add('glass_clink', 'interior', [load(p) for p in kens(IS, 'impactGlass_light_', 4)], tags=('glass', 'lab'), src=['Kenney Impact Sounds: impactGlass_light'], target=-22, **D)
    add('globe_spin', 'interior', [dsp.mix(synth.whoosh(0.8, 300, 1400, 31, 1.4) * 0.6, load(ken(R, 'creak3.ogg')) * 0.4, at=[0, 0.05])],
        tags=('globe',), src=['original whoosh', 'Kenney RPG Audio: creak'], lic=LIC_KENNEY + '; ' + LIC_ORIG, target=-22, **D)
    add('page_turn', 'interior', [load(p) for p in kens(R, 'bookFlip')], tags=('paper', 'book'), src=['Kenney RPG Audio: bookFlip'], target=-21, **D)
    add('book_shelf', 'interior', [load(p) for p in kens(R, 'bookPlace')] + [load(ken(R, 'bookClose.ogg'))], tags=('book',), src=['Kenney RPG Audio: bookPlace, bookClose'], **D)
    add('ball_click', 'interior', [synth.ball_click(i) for i in range(3)], tags=('capture-ball', 'click'), src=['original'], lic=LIC_ORIG, target=-17, **D)
    add('ball_open', 'interior', [synth.ball_open(i) for i in range(2)], tags=('capture-ball', 'open'), src=['original'], lic=LIC_ORIG, target=-16, **D)
    add('mailbox', 'interior', ogl(MW, 'metal_open*') + ogl(MW, 'metal_close*') + ogl('metal-interactions', '*metal_interaction*.wav'), tags=('mailbox', 'metal', 'lid'),
        src=credit(MW, 'metal-interactions'), lic=LIC_OGA, **D)
    add('sign_knock', 'interior', [load(p) for p in kens(IS, 'impactWood_light_', 3)], tags=('sign', 'wood'), src=['Kenney Impact Sounds: impactWood_light'], target=-21, **D)
    BU = 'bubble-sound-effects'
    add('tank_glug', 'interior', ogl(BU, 'bubbles-single*'), tags=('water', 'bubbles', 'tank'), src=credit(BU), lic=LIC_OGA, target=-20, **D)
    TK = 'ticking-clock'
    add('clock_tick', 'interior', ogl(TK, '*tick[1-4].wav'), tags=('clock',), src=credit(TK), lic=LIC_OGA, target=-24, **D)
    # loops that stand somewhere in a room (3D beds)
    L = dict(mode='3d', loop=True, voices=8, pitch=(1.0, 1.0), vjit=0.0)
    HH = 'general-household-sound-effects'
    add('machine_hum', 'interior', [synth.machine_hum(8.0)], dist=16.0, unit=2.5, tags=('machine', 'hum', 'loop'), src=['original'], lic=LIC_ORIG, rms=-24, **L)
    add('pc_hum', 'interior', [loop_of(load(og(HH, 'computerfans01.wav')[0], mono=False), 10.0, 1.0, 1.5)], dist=7.0, unit=1.5, tags=('computer', 'fan', 'loop'),
        src=credit(HH), lic=LIC_OGA, rms=-30, **L)
    add('light_buzz', 'interior', [synth.light_buzz(4.0)], dist=5.0, unit=1.0, tags=('light', 'buzz', 'loop'), src=['original'], lic=LIC_ORIG, rms=-34, **L)
    add('vent_loop', 'interior', [loop_of(load(og(HH, 'airconditioner01.wav')[0], mono=False), 12.0, 1.0, 2.0)], dist=10.0, unit=2.0, tags=('vent', 'air', 'loop'),
        src=credit(HH), lic=LIC_OGA, rms=-28, **L)
    b1 = ogl(BU, 'bubbles-loop1-amp.wav'); b2 = ogl(BU, 'bubbles-loop2-amp.wav')
    tank = scatter(16.0, [(b1 + b2, 7, 0.5, 0.9), (ogl(BU, 'bubbles-single*'), 10, 0.2, 0.5)], seed=3)
    tank += dsp.stereo(synth.loop_tone([55, 110, 165], [0.02, 0.012, 0.006], 16.0))
    tank += dsp.stereo(dsp.seam_loop(dsp.bp(synth.noise(18.0, 'pink', 5), 200, 1200), 16.0, 1.5) * 0.05)
    add('tank_bubbles', 'interior', [tank], dist=14.0, unit=2.0, tags=('water', 'bubbles', 'tank', 'aquarium', 'loop'), src=credit(BU) + ['original pump hum'],
        lic=LIC_OGA + '; ' + LIC_ORIG, rms=-24, **L)
    add('clock_loop', 'interior', [clock_loop()], dist=7.0, unit=1.0, tags=('clock', 'loop'), src=credit(TK), lic=LIC_OGA, rms=-34, **L)
    add('room_tone', 'interior', [loop_of(load(og(HH, 'hepafilter01.wav')[0], mono=False), 14.0, 1.0, 2.0)], mode='2d', bus='Ambience', loop=True, voices=2,
        pitch=(1, 1), vjit=0, tags=('room', 'tone', 'loop'), src=credit(HH), lic=LIC_OGA, rms=-40)


def clock_loop():
    """Two seconds: a tick, then a slightly lower tock - loops exactly."""
    ticks = ogl('ticking-clock', '*tick[1-4].wav')
    a = dsp.hp(dsp.mono(ticks[0]), 300)[:int(0.2 * SR)]
    b = dsp.pitch(dsp.hp(dsp.mono(ticks[1]), 300), 0.9)[:int(0.2 * SR)]
    a = dsp.fade(a, 0.001, 0.05); b = dsp.fade(b, 0.001, 0.05)
    out = np.zeros(2 * SR, dtype=np.float32)
    out[:len(a)] += a
    out[SR:SR + len(b)] += b * 0.85
    return dsp.stereo(out)


# =====================================================================
# nature and ambience
# =====================================================================
def nature():
    B = dict(mode='2d', loop=True, bus='Ambience', voices=2, pitch=(1, 1), vjit=0)
    B3 = dict(mode='3d', loop=True, bus='Ambience', voices=2, pitch=(1, 1), vjit=0)
    PA = 'park-ambiences'; RL = 'rain-loopable'; WV = ('beach-ocean-waves', 'water-waves'); V2 = '100-cc0-sfx-2'
    park = lambda name, start, L: calm_loop(load(og(PA, name)[0], mono=False, start=start, dur=L * 4), L)
    add('amb_wind_light', 'nature', [park('park_ambience_wind.wav', 40, 24.0)], tags=('wind', 'light', 'loop'), src=credit(PA), lic=LIC_OGA, rms=-25, **B)
    strong = synth.wind(24.0, 0.85, 11) + park('park_ambience_wind.wav', 120, 24.0) * 0.5
    add('amb_wind_strong', 'nature', [strong], tags=('wind', 'strong', 'gusts', 'hill', 'loop'), src=['original wind'] + credit(PA), lic=LIC_ORIG + '; ' + LIC_OGA, rms=-22, **B)
    add('amb_birds_day', 'nature', [dsp.hp(park('park_ambience_birds.wav', 100, 24.0), 300)], tags=('day', 'birds', 'park', 'loop'), src=credit(PA), lic=LIC_OGA, rms=-28, **B)
    add('amb_rain_light', 'nature', [loop_of(load(og(RL, '4.ogg')[0], mono=False), 30.0, 3.0, 3.0)], tags=('rain', 'light', 'loop'), src=credit(RL), lic=LIC_OGA, rms=-26, **B)
    add('amb_rain_heavy', 'nature', [loop_of(load(og(RL, '2.ogg')[0], mono=False), 20.0, 2.0, 3.0)], tags=('rain', 'heavy', 'loop'), src=credit(RL), lic=LIC_OGA, rms=-20, **B)
    roof = dsp.lp(loop_of(load(og(RL, '3.ogg')[0], mono=False), 20.0, 3.0, 3.0), 1800) * 0.6 + synth.roof_drips(20.0, 45.0, 2)
    add('amb_rain_roof', 'nature', [roof], tags=('rain', 'roof', 'indoor', 'loop'), src=credit(RL) + ['original drips'], lic=LIC_OGA + '; ' + LIC_ORIG, rms=-26, **B)
    cr = load(og('crickets-ambient-noise-loopable', 'crickets_1.mp3')[0], mono=False)
    chirps = hits(load(og('cricket-sounds', '*.wav')[0]), 10, max_len=0.6, min_gap=0.25)
    crick = np.tile(loop_of(cr, 10.0, 0.2, 1.0), (2, 1)) * 0.8 + scatter(20.0, [(chirps, 25, 0.15, 0.4)], seed=8)
    add('amb_crickets', 'nature', [crick], tags=('night', 'crickets', 'insects', 'loop'), src=credit('crickets-ambient-noise-loopable', 'cricket-sounds'), lic=LIC_OGA, rms=-28, **B)
    waves = [x for s in WV for x in ogl(s, '*.flac')]
    lap = scatter(24.0, [(waves, 10, 0.25, 0.6)], seed=4)
    lap = lap + np.tile(dsp.stereo(loop_of(load(og(V2, 'sfx100v2_loop_water_03.ogg')[0]), 8.0, 0.5, 1.2)), (3, 1)) * 0.5
    add('amb_shore_lap', 'nature', [lap], tags=('sea', 'shore', 'lapping', 'beach', 'loop'), src=credit(*WV, V2), lic=LIC_OGA, rms=-24, **B)
    SR_ = 'sea-and-river-wave-sounds'
    add('amb_sea_waves', 'nature', [loop_of(load(og(SR_, 'VistulaShort*')[0], mono=False, start=20, dur=40), 30.0, 0.0, 4.0)], dist=160.0, unit=18.0,
        tags=('sea', 'waves', 'surf', 'loop'), src=credit(SR_), lic=LIC_OGA, rms=-20, **B3)
    add('amb_stream', 'nature', [park('park_ambience_river.wav', 60, 20.0)], dist=45.0, unit=5.0, tags=('stream', 'brook', 'river', 'water', 'loop'), src=credit(PA), lic=LIC_OGA, rms=-22, **B3)
    pond = np.tile(dsp.stereo(loop_of(load(og(V2, 'sfx100v2_loop_water_02.ogg')[0]), 8.0, 0.2, 0.5)), (2, 1)) * 0.6 + scatter(16.0, [([drip(i) for i in range(6)], 9, 0.1, 0.3)], seed=9)
    add('amb_pond', 'nature', [dsp.lp(pond, 6000)], dist=40.0, unit=6.0, tags=('pond', 'water', 'loop'), src=credit(V2) + ['original plops'], lic=LIC_OGA + '; ' + LIC_ORIG, rms=-27, **B3)
    add('amb_drips', 'nature', [loop_of(load(og('dripping-water-loop', '*.flac')[0], mono=False), 16.0, 1.0, 2.0)], dist=20.0, unit=3.0, tags=('cave', 'drips', 'water', 'loop'),
        src=credit('dripping-water-loop'), lic=LIC_OGA, rms=-30, **B3)
    add('wind_gust', 'nature', [synth.whoosh(2.2, 250, 1400, 50 + i, 1.3) * synth.adsr(int(2.2 * SR), 0.6, 0.4, 0.7, 1.0) for i in range(3)], mode='2d', bus='Ambience',
        tags=('wind', 'gust'), src=['original'], lic=LIC_ORIG, target=-22)
    rt = load(og('rain-long-thunder', '*.ogg')[0], mono=False, start=21.5, dur=15.0)
    add('thunder', 'nature', [dsp.fade(rt, 0.01, 4.0)] + [synth.thunder(i) for i in range(2)], mode='2d', bus='Ambience', voices=2, tags=('thunder', 'storm'),
        src=credit('rain-long-thunder') + ['original'], lic=LIC_OGA + '; ' + LIC_ORIG, target=-14, stereo=True)
    # birds: single calls cut from the park and garden recordings
    pb = dsp.denoise(dsp.hp(load(og(PA, 'park_ambience_birds.wav')[0], start=200, dur=60), 1500), -40)
    calls = hits(pb, 2, max_len=1.0, min_gap=0.6, thr=0.6) + hits(dsp.hp(load(og('ambient-bird-sounds', '*.ogg')[0]), 1200), 6, max_len=1.2, min_gap=0.8, thr=0.45)
    add('bird_call', 'nature', calls, dist=60.0, unit=6.0, voices=4, tags=('bird', 'day', 'song'), src=credit(PA, 'ambient-bird-sounds'), lic=LIC_OGA, target=-19, hp=1200, thr=-38, denoise=True)
    SG = 'solo-seagull-sound-effects'
    gulls = hits(load(og(SG, 'Seagull Ambient 1.wav')[0]), 2, max_len=1.2, min_gap=0.5) + ogl(SG, 'Seagull Ambient [24].wav')
    add('seagull', 'nature', gulls, dist=90.0, unit=8.0, voices=3, tags=('seagull', 'coast'), src=credit(SG), lic=LIC_OGA, target=-18, hp=300)
    add('frog', 'nature', [synth.frog(i) for i in range(6)], dist=40.0, unit=4.0, voices=3, tags=('frog', 'night', 'pond'), src=['original'], lic=LIC_ORIG, target=-19)
    add('owl', 'nature', [synth.owl(i) for i in range(3)], dist=90.0, unit=8.0, voices=2, tags=('owl', 'night'), src=['original'], lic=LIC_ORIG, target=-19)
    add('bush_rustle', 'nature', [dsp.fade(x[:int(0.8 * SR)], 0.005, 0.25) for x in sorted(rus_all(), key=len)[:7]], dist=16.0, unit=2.0, voices=4,
        tags=('plants', 'bush', 'leaves', 'rustle'), src=credit('20-rustles-dry-leaves'), lic=LIC_OGA, target=-19)
    tc = load(og('tree-creaking', '*.flac')[0])
    add('tree_creak', 'nature', [tc[:int(1.6 * SR)], tc[int(1.2 * SR):int(3.0 * SR)], dsp.pitch(tc[:int(2.0 * SR)], 0.8)], dist=30.0, unit=3.0, voices=2,
        tags=('tree', 'creak', 'wind', 'wood'), src=credit('tree-creaking'), lic=LIC_OGA, target=-21)
    DG = 'dog-sounds'
    dogs = [synth.verb(dsp.lp(load(p), 2500), 0.7, 0.35, damp=0.6, tail=0.8) for p in og(DG, 'Dog Bark*.wav') if 'Raw' not in str(p)]
    add('dog_distant', 'nature', dogs, dist=120.0, unit=8.0, voices=2, tags=('dog', 'town', 'distant', 'bark'), src=credit(DG), lic=LIC_OGA, target=-20, stereo=True)
    add('wind_chimes', 'nature', [synth.wind_chimes(i) for i in range(3)], dist=30.0, unit=3.0, voices=2, tags=('chimes', 'porch', 'wind'), src=['original'], lic=LIC_ORIG, target=-20)
    add('town_bell', 'nature', [synth.church_bell(196.0, 5.0, 0), synth.church_bell(174.6, 5.0, 1)], dist=200.0, unit=15.0, voices=2, tags=('bell', 'town'),
        src=['original'], lic=LIC_ORIG, target=-17, fout=0.5)
    add('water_drip', 'nature', [drip(i) for i in range(4)], dist=12.0, unit=1.5, tags=('water', 'drip'), src=['original'], lic=LIC_ORIG, target=-24)


def rus_all():
    return ogl('20-rustles-dry-leaves', '*.flac')


def drip(seed):
    r = np.random.default_rng(seed + 300)
    d = 0.18
    n = int(d * SR)
    t = np.arange(n) / SR
    f = r.uniform(900, 1500) * (1 + 1.2 * t / d)
    x = synth.osc(f, d) * synth.expdec(n, 0.03)
    return synth.verb(x, 0.4, 0.15, tail=0.25)


# =====================================================================
# creatures (generic, non-voice)
# =====================================================================
def creatures():
    C = dict(mode='3d', dist=30.0, unit=3.0, voices=4)
    LW = 'large-wings-flap'; VS = 'various-sound-effects-0'
    big = hits(load(og(LW, '*.flac')[0]), 3, max_len=0.8, min_gap=0.5)
    small = [dsp.pitch(x, 1.6)[:int(0.35 * SR)] for x in big] + ogl(VS, 'snd_flap.wav') + ogl(VS, 'snd_batwings.wav')
    add('wing_flap_small', 'creatures', small, tags=('creature', 'wings', 'flap', 'small'), src=credit(LW, VS), lic=LIC_OGA, **C)
    add('wing_flap_large', 'creatures', big, tags=('creature', 'wings', 'flap', 'large'), src=credit(LW), lic=LIC_OGA, **C)
    add('critter_chirp', 'creatures', [synth.chirp_seq(i, 2100) for i in range(6)], tags=('creature', 'chirp', 'small'), src=['original'], lic=LIC_ORIG, target=-18, **C)
    add('critter_squeak', 'creatures', [synth.squeak(i) for i in range(4)], tags=('creature', 'squeak', 'small'), src=['original'], lic=LIC_ORIG, target=-19, **C)
    add('creature_call', 'creatures', [synth.bird_call(i, 1500) for i in range(4)], tags=('creature', 'bird', 'call'), src=['original'], lic=LIC_ORIG, target=-18, **C)
    add('creature_honk', 'creatures', [synth.honk(i) for i in range(4)], tags=('creature', 'bird', 'honk', 'large'), src=['original'], lic=LIC_ORIG, target=-17, **C)
    IS = 'impact-sounds'
    pat_s = [dsp.pitch(dsp.hp(load(p), 300), 1.35) for p in kens(IS, 'footstep_grass_')]
    add('patter_small', 'creatures', pat_s, tags=('creature', 'footstep', 'small'), src=['Kenney Impact Sounds: footstep_grass (pitched)'], target=-24, **C)
    pat_h = [dsp.mix(dsp.pitch(load(p), 0.8), synth.thump(70, 0.2, i) * 0.4) for i, p in enumerate(kens(IS, 'footstep_concrete_', 4))]
    add('patter_heavy', 'creatures', pat_h, tags=('creature', 'footstep', 'heavy'), src=['Kenney Impact Sounds: footstep_concrete (pitched)', 'original thump'],
        lic=LIC_KENNEY + '; ' + LIC_ORIG, target=-19, **C)
    WS = '6-short-water-splashes'
    add('creature_splash', 'creatures', [x for i, x in enumerate(ogl(WS, '*.flac')) if i in (0, 3, 5)] + ogl('tiny-naval-battle-sounds-set', '*/Splash.wav'),
        tags=('creature', 'water', 'splash'), src=credit(WS, 'tiny-naval-battle-sounds-set'), lic=LIC_OGA, **C)
    add('creature_rustle', 'creatures', sorted(rus_all(), key=len)[7:10], tags=('creature', 'plants', 'rustle'), src=credit('20-rustles-dry-leaves'), lic=LIC_OGA, target=-21, **C)
    sh = load(og('shovel-sound', '*')[0])
    add('dig', 'creatures', [dsp.lp(sh, 5000), dsp.pitch(dsp.lp(sh, 4000), 1.25), dsp.pitch(dsp.lp(sh, 4500), 0.85)], tags=('creature', 'dig', 'dirt'), src=credit('shovel-sound'),
        lic=LIC_OGA, **C)
    rab = load(og('rabbit-eating', '*.wav')[0])
    add('munch', 'creatures', hits(rab, 4, max_len=0.4, min_gap=0.15) + ogl(VS, 'nom.wav'), tags=('creature', 'eat', 'munch'), src=credit('rabbit-eating', VS), lic=LIC_OGA, target=-21, **C)
    add('peck', 'creatures', [dsp.pitch(load(p), 1.5) for p in kens(IS, 'impactWood_light_', 3)], tags=('creature', 'peck', 'beak'), src=['Kenney Impact Sounds: impactWood_light (pitched)'], target=-23, **C)
    add('creature_hop', 'creatures', [dsp.mix(synth.thump(110, 0.18, i) * 0.6, dsp.pitch(load(ken(IS, 'impactSoft_medium_00%d.ogg' % i)), 1.2) * 0.6) for i in range(3)],
        tags=('creature', 'hop', 'land'), src=['Kenney Impact Sounds: impactSoft_medium', 'original'], lic=LIC_KENNEY + '; ' + LIC_ORIG, target=-21, **C)


# =====================================================================
# battle and interaction placeholders
# =====================================================================
def battle():
    IS = 'impact-sounds'
    Bt = dict(mode='2d', voices=3)
    add('hit_soft', 'battle', [load(p) for p in kens(IS, 'impactSoft_medium_', 4)], tags=('battle', 'hit', 'soft'), src=['Kenney Impact Sounds: impactSoft_medium'], **Bt)
    add('hit_heavy', 'battle', [dsp.mix(load(p), synth.thump(60, 0.35, i) * 0.5) for i, p in enumerate(kens(IS, 'impactPunch_heavy_', 4))], tags=('battle', 'hit', 'heavy'),
        src=['Kenney Impact Sounds: impactPunch_heavy', 'original thump'], lic=LIC_KENNEY + '; ' + LIC_ORIG, target=-13, **Bt)
    add('whoosh', 'battle', [synth.whoosh(0.3 + 0.06 * i, 500, 4000, i) for i in range(4)], tags=('battle', 'whoosh', 'swipe'), src=['original'], lic=LIC_ORIG, target=-17, **Bt)
    add('sparkle', 'battle', [synth.sparkle(i, 0.9) for i in range(2)], tags=('battle', 'sparkle', 'magic'), src=['original'], lic=LIC_ORIG, target=-19, **Bt)
    add('heal', 'battle', [synth.heal()], tags=('battle', 'heal'), src=['original'], lic=LIC_ORIG, target=-16, **Bt)
    add('level_up', 'battle', [synth.levelup()], tags=('battle', 'level', 'fanfare'), src=['original'], lic=LIC_ORIG, target=-14, **Bt)
    add('encounter', 'battle', [synth.encounter()], tags=('battle', 'encounter', 'stinger'), src=['original stinger'], lic=LIC_ORIG, target=-14, **Bt)
    add('throw', 'battle', [synth.whoosh(0.28, 900, 5000, 60 + i, 1.8) for i in range(2)], tags=('battle', 'throw'), src=['original'], lic=LIC_ORIG, target=-18, **Bt)
    add('catch_wobble', 'battle', [synth.wobble(i) for i in range(3)], tags=('battle', 'catch', 'capture-ball'), src=['original'], lic=LIC_ORIG, target=-18, **Bt)
    add('catch_click', 'battle', [dsp.mix(synth.ball_click(9), synth.sparkle(11, 0.5, 6) * 0.4, at=[0, 0.05])], tags=('battle', 'catch', 'capture-ball'), src=['original'],
        lic=LIC_ORIG, target=-15, **Bt)


# =====================================================================
# vehicles and town
# =====================================================================
def town():
    T = dict(mode='3d', dist=40.0, unit=3.0, voices=3)
    BI = 'bicycle-sounds'; MW = '100-cc0-metal-and-wood-sfx'
    bell = load(og(BI, 'rotating_bicycle_bell-1.wav')[0])
    add('bike_bell', 'town', [bell, bell[:int(0.7 * SR)], dsp.pitch(bell, 1.06)], tags=('bicycle', 'bell'), src=credit(BI), lic=LIC_OGA, **T)
    add('bike_freewheel', 'town', ogl(BI, 'bicycle_spokes-1.wav') + [dsp.pitch(load(og(BI, 'bicycle_spokes-1.wav')[0]), 0.8)], tags=('bicycle', 'ratchet', 'spokes'),
        src=credit(BI), lic=LIC_OGA, target=-21, **T)
    sq = ogl(MW, 'wood_squeak_*')
    tc = load(og('tree-creaking', '*.flac')[0])
    add('boat_creak', 'town', [dsp.lp(dsp.pitch(x, 0.7), 3000) for x in sq] + [dsp.lp(dsp.pitch(tc[:int(2 * SR)], 0.6), 2500)], tags=('boat', 'wood', 'creak', 'dock'),
        src=credit(MW, 'tree-creaking'), lic=LIC_OGA, target=-20, **T)
    add('rope_creak', 'town', [dsp.bp(dsp.pitch(tc[int(a * SR):int((a + 1.0) * SR)], p), 300, 3000) for a, p in ((0.3, 1.2), (1.4, 1.0), (0.8, 1.35))],
        tags=('rope', 'dock', 'mooring'), src=credit('tree-creaking'), lic=LIC_OGA, target=-21, **T)
    add('dock_bell', 'town', [synth.ship_bell(880, 0), synth.ship_bell(784, 1)], dist=150.0, unit=10.0, tags=('bell', 'dock', 'ship'), src=['original'], lic=LIC_ORIG, target=-16, fout=0.4)
    add('windmill_creak', 'town', [windmill_loop()], mode='3d', loop=True, bus='Ambience', dist=70.0, unit=8.0, voices=1, pitch=(1, 1), vjit=0,
        tags=('windmill', 'creak', 'loop'), src=credit('tree-creaking') + ['original whoosh'], lic=LIC_OGA + '; ' + LIC_ORIG, rms=-26)
    grav = ogl('42-snow-and-gravel-footsteps', '*gravel_0[1-4].flac')
    rake = [dsp.lp(dsp.mix(x, dsp.pitch(x, 1.3) * 0.6, at=[0, 0.06]), 5000) for x in grav[:3]]
    add('garden_rake', 'town', rake, tags=('garden', 'tool', 'rake'), src=credit('42-snow-and-gravel-footsteps'), lic=LIC_OGA, **T)
    sh = load(og('shovel-sound', '*')[0])
    add('shovel', 'town', [sh, dsp.pitch(sh, 0.9)], tags=('garden', 'tool', 'shovel'), src=credit('shovel-sound'), lic=LIC_OGA, **T)
    pump = []
    for i in range(2):
        squeak = dsp.pitch(sq[i % len(sq)], 1.1)
        gush = load(og('100-cc0-sfx-2', 'sfx100v2_loop_water_01.ogg')[0], start=0.5 + i, dur=1.0)
        gush = dsp.fade(gush, 0.08, 0.4)
        pump.append(dsp.mix(squeak * 0.7, gush * 0.8, at=[0, 0.25]))
    add('water_pump', 'town', pump, tags=('pump', 'water', 'farm', 'well'), src=credit(MW, '100-cc0-sfx-2'), lic=LIC_OGA, **T)
    add('chicken', 'town', [synth.hen(i) for i in range(5)], tags=('chicken', 'hen', 'farm'), src=['original'], lic=LIC_ORIG, target=-19, **T)
    add('cow_bell', 'town', [synth.cow_bell(i) for i in range(3)], tags=('cow', 'bell', 'farm'), src=['original'], lic=LIC_ORIG, target=-20, **T)
    WS = '6-short-water-splashes'
    add('well_plop', 'town', [synth.verb(dsp.mix(drip(10 + i) * 0.5, dsp.lp(x, 2500)), 0.8, 0.45, damp=0.3, tail=1.2) for i, x in enumerate(ogl(WS, '*.flac')[1:3])],
        tags=('well', 'water', 'echo'), src=credit(WS) + ['original echo'], lic=LIC_OGA + '; ' + LIC_ORIG, target=-21, **T)


def windmill_loop():
    """The lab's windmill: the hub creaks once a turn (3.2 s), three blades swish past - loops exactly."""
    L = 6.4
    n = int(L * SR)
    out = np.zeros(n, dtype=np.float32)
    tc = dsp.mono(load(og('tree-creaking', '*.flac')[0]))

    def put(x, at):
        x = dsp.mono(x)
        idx = (np.arange(len(x)) + int(at * SR)) % n
        np.add.at(out, idx, x)
    put(dsp.fade(dsp.lp(tc[:int(1.2 * SR)], 3000), 0.05, 0.3) * 0.7, 0.3)
    put(dsp.fade(dsp.lp(dsp.pitch(tc[int(1.0 * SR):int(2.2 * SR)], 0.9), 3000), 0.05, 0.3) * 0.55, 3.5)
    for b in range(6):
        put(synth.whoosh(0.9, 180, 700, 80 + b, 1.2) * 0.5, b * L / 6)
    return dsp.stereo(out)


# =====================================================================
STEPS = [('ui', ui), ('footsteps', footsteps), ('character', character), ('interior', interior), ('nature', nature),
         ('creatures', creatures), ('battle', battle), ('town', town)]


def main():
    for name, fn in STEPS:
        if ONLY and name not in ONLY: continue
        print('building', name, flush=True)
        fn()
    cat_path = OUT / 'catalog.json'
    old = json.loads(cat_path.read_text()) if cat_path.exists() else {'sounds': []}
    keep = [e for e in old['sounds'] if ONLY and e['category'] not in ONLY]
    entries = []
    for cat, es in CAT.items():
        d = OUT / cat
        if d.exists():
            for f in d.glob('*.ogg'): f.unlink()
            for f in d.glob('*.ogg.import'): f.unlink()
        d.mkdir(parents=True, exist_ok=True)
        for e in es:
            files = []
            for i, x in enumerate(e.pop('data')):
                rel = '%s/%s_%d.ogg' % (cat, e['id'], i + 1)
                if e['loop']: dsp.write_ogg(OUT / rel, x, q=4, out_sr=32000)
                else: dsp.write_ogg(OUT / rel, x, q=4)
                files.append(rel)
            e['files'] = files
            entries.append(e)
    entries = keep + entries
    entries.sort(key=lambda e: (e['category'], e['id']))
    used = sorted(USED_OGA | set(old.get('oga_used', []))) if ONLY else sorted(USED_OGA)
    sources = [{'title': SOURCES['oga'][s]['title'], 'author': SOURCES['oga'][s]['author'], 'url': SOURCES['oga'][s]['url'], 'license': 'CC0 1.0'} for s in used]
    sources += [{'title': 'Kenney ' + k.replace('-', ' ').title(), 'author': 'Kenney (kenney.nl)', 'url': u, 'license': 'CC0 1.0'} for k, u in SOURCES['kenney'].items() if k in USED_KEN or not ONLY]
    cat = {
        'format': 'pallet-sfx/catalog', 'version': 1,
        'note': 'Built by tools/sfx/build.py; played by native/sfx.gd. Fields: id, category, files (variants), vol (dB), pitch [lo, hi], vjit (dB), '
                'mode 2d|3d, dist (3D max distance m), unit (3D unit size m), loop, voices, bus SFX|UI|Ambience, gap (s), tags, source, license.',
        'licenses': {'kenney': 'Kenney audio packs (kenney.nl): CC0 1.0 Universal',
                     'opengameart': 'OpenGameArt.org submissions listed in sources: each CC0 1.0 Universal (checked on its page)',
                     'original': 'Sounds made for this game in tools/sfx/synth.py: CC0 1.0 Universal'},
        'sounds': entries, 'sources': sources, 'oga_used': used,
    }
    cat_path.write_text(json.dumps(cat, indent=1) + '\n')
    print('%d sounds, %d files, %.1f MB' % (len(entries), sum(len(e['files']) for e in entries),
                                           sum((OUT / f).stat().st_size for e in entries for f in e['files']) / 1048576))
    if A.reel: reels(entries, Path(A.reel))


def reels(entries, out):
    out.mkdir(parents=True, exist_ok=True)
    by = {}
    for e in entries: by.setdefault(e['category'], []).append(e)
    for cat, es in by.items():
        parts = []
        for e in es:
            for f in e['files'][:3 if not e['loop'] else 1]:
                x = dsp.stereo(dsp.load(OUT / f, mono=False))
                if e['loop']: x = x[:int(8 * SR)]
                parts.append(x)
                parts.append(np.zeros((int(0.25 * SR), 2), dtype=np.float32))
            parts.append(np.zeros((int(0.5 * SR), 2), dtype=np.float32))
        dsp.write_mp3(out / ('sfx_%s.mp3' % cat), np.concatenate(parts))
        print('reel', cat)


main()
