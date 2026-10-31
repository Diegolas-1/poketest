"""Route 1 tea house: "Steeped in Stillness" (original composition).

D Yo scale (D E G A B) with a Miyako-bushi (In) middle on D (D Eb G A Bb) and
a livelier shamisen section in G Yo (G A C D E); about 70 bpm, 4/4, with a
free, breathing tempo (rubato through the Tempo map: every phrase leans in
and lets go, the B section settles, the shamisen section pushes on).

Where: indoors in the little tea house on Route 1 (tatami, a kettle
steaming, the tea keeper). Calm, elegant and contemplative, a rest on the road.

Form (bars, 4/4):
  Intro 1-4   koto sweep and tremolo, wind chime, a breathy shakuhachi call
  --- loop ---
  A1  5-12    shakuhachi sings the theme over flowing koto arpeggios and a
              faint string drone (D + A)
  A2  13-20   the koto takes the theme (oshide presses, tremolo, yuri
              vibrato), the shakuhachi answers low and breathy, kotsuzumi
  B   21-28   Miyako-bushi colour: meri notes Eb and Bb, long bent tones,
              koto tremolo, soft strings walk down D-Bb-G-A-G-Eb-A-D; it
              ends with accelerating hyoshigi clacks
  C   29-40   G Yo, livelier: shamisen tune over off-beat koto, kotsuzumi
              pon/ta and soft taiko; the shakuhachi joins, then koto and
              shamisen play the tune together (heterophony); ends on D
  Brk 41-44   koto alone: sweeps, tremolo, bells (the kettle moment)
  A3  45-52   the theme again, ornamented, fuller (shamisen plucks,
              kotsuzumi, strings)
  Link 53-56  the koto echoes the opening high and soft, a sweep into A1
The game loops bars 5-56; the intro plays once.

Instruments: koto, shamisen, shakuhachi, taiko (as kotsuzumi and as a soft
low drum), wood block + claves (hyoshigi), wind chimes from GeneralUser GS
(fluidsynth, its reverb and chorus off) with MIDI pitch bend and expression
per note (round-robin channels, so each note bends on its own); a breath
noise layer for the shakuhachi made here; VSCO 2 CE strings (very soft
drone) and glockenspiel. Everything goes through render.py's stage, hall
and master, at -18 LUFS.

  python3 tools/music/songs/tea_house.py --out DIR [--check] [--excerpt A,B]
"""
import json
import math
import os
import subprocess
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import render  # noqa: E402
import build as mbuild  # noqa: E402
from score import Part, Tempo, midi  # noqa: E402
from sfz import SR  # noqa: E402

ID = 'tea_house'
TITLE = 'Steeped in Stillness'
SF2 = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'
BPB = 4

NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
PCN = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
       'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def nm(k):
    return NOTE[k % 12] + str(k // 12 - 1)


# ---------------------------------------------------------------- form
S_A1, S_A2, S_B, S_C, S_BRK, S_A3, S_LINK, END = 16, 48, 80, 112, 160, 176, 208, 224
LOOP0 = S_A1
SECTIONS = [('Intro', 0), ('A1', S_A1), ('A2', S_A2), ('B', S_B), ('C', S_C),
            ('Break', S_BRK), ('A3', S_A3), ('Link', S_LINK), ('end', END)]

YO_D = {2, 4, 7, 9, 11}
MIYAKO_D = {2, 3, 7, 9, 10}
YO_G = {7, 9, 0, 2, 4}


def scale_at(b):
    if S_B <= b < S_C:
        return MIYAKO_D
    if S_C <= b < S_BRK:
        return YO_G
    return YO_D


# harmony fields: bass note, chord tones (the notes that may sound together)
F = {
    'D5': ('D3', 'D A E'), 'Bm11': ('B2', 'B D E A'), 'G6': ('G2', 'G B D E'),
    'A4': ('A2', 'A D E'), 'Em7': ('E3', 'E G B D'), 'A7s': ('A2', 'A D E G'),
    'Dm_in': ('D3', 'D A G'), 'Bbmaj7': ('Bb2', 'Bb D A'), 'Gm': ('G2', 'G Bb D'),
    'A4in': ('A2', 'A D'), 'Ebmaj7': ('Eb3', 'Eb G Bb D'), 'A7s_in': ('A2', 'A D G'),
    'Gc': ('G2', 'G D A'), 'Amc': ('A2', 'A C E G'), 'C6': ('C3', 'C E G A'),
    'Emc': ('E3', 'E G A D'), 'Dc': ('D3', 'D G A'),
}
INTRO_H = ['D5', 'D5', 'G6', 'A4']
A_H = ['D5', 'Bm11', 'G6', 'A4', 'G6', 'Em7', 'A7s', 'D5']
B_H = ['Dm_in', 'Bbmaj7', 'Gm', 'A4in', 'Gm', 'Ebmaj7', 'A7s_in', 'Dm_in']
C_H = ['Gc', 'Amc', 'C6', 'Emc', 'C6', 'Amc', 'Emc', 'Gc', 'Gc', 'Amc', 'C6', 'Dc']
BRK_H = ['D5', 'Bm11', 'G6', 'A4']
LINK_H = ['D5', 'G6', 'Em7', 'A4']
HARM = INTRO_H + A_H + A_H + B_H + C_H + BRK_H + A_H + LINK_H   # one per bar
assert len(HARM) * 4 == END


def field_at(b):
    return F[HARM[min(int(b // 4), len(HARM) - 1)]]


def tones(fname):
    return {PCN[t] for t in F[fname][1].split()}


def ladder(fname, lo, hi):
    pcs = tones(fname)
    return [k for k in range(lo, hi + 1) if k % 12 in pcs]


# ---------------------------------------------------------------- tempo (rubato)
TEMPO = Tempo([
    [0, 54], [3, 58], [6, 62], [11, 64], [14, 60], [15.5, 62], [16, 68],
    # A1: each phrase leans in, then lets go at its long note
    [24, 70], [28, 69], [31, 64], [32, 63], [33, 69], [40, 71], [45, 67], [48, 63],
    # A2
    [49, 69], [56, 71], [61, 67], [64, 64], [65, 69], [72, 71], [77, 66], [80, 62],
    # B: settles, Miyako-bushi
    [81, 63], [88, 65], [93, 61], [96, 60], [97, 63], [104, 65], [109, 62],
    # hyoshigi drive into C
    [110, 64], [112, 74],
    # C: lively
    [113, 76], [128, 77], [129, 76], [144, 78], [156, 76], [159, 70], [160, 60],
    # break: the kettle moment
    [166, 62], [172, 61], [175, 56], [176, 57], [177, 70],
    # A3
    [184, 71], [190, 69], [192, 66], [193, 70], [200, 71], [205, 68], [208, 64],
    # link: soft ritardando, then a tempo back into A1
    [209, 66], [216, 65], [221, 59], [223, 60], [224, 66],
])

# ---------------------------------------------------------------- melodies
SHAKU_INTRO = '@p r:w | "br" "sc" A4:h. B4:e D5:e | "mr" E5:h. r:q | r:w |'

SHAKU_A1 = ('@mp "br" "sc" A4:q. B4:e D5:h | E5:e D5:e B4:q A4:h | B4:q A4:e G4:e E4:q G4:q | "mr" A4:h. r:q | '
            '"sc" D5:q. E5:e "gr" G5:h | E5:e D5:e B4:q D5:q. B4:e | A4:q G4:e E4:e G4:q A4:e G4:e | "mr" D4:h. r:q |')

KOTO_A2 = ('@mp A4:q. "os" B4:e "tr" D5:h | "os" E5:e D5:e B4:q A4:h | B4:q A4:e G4:e E4:q G4:q | A4:h. r:q | '
           'D5:q. "os" E5:e "tr" G5:h | E5:e D5:e B4:q D5:q. B4:e | "os" A4:q G4:e E4:e G4:q A4:e G4:e | "tr" D4:h. r:q |')

SHAKU_A2 = ('@p r:h "br" "sc" D4:h | "mr" E4:w | r:h "sc" G4:q E4:q | E4:h D4:h | '
            'r:w | "sc" G4:h. A4:q | "mr" E4:w | D4:h. r:q |')

SHAKU_B = ('@p "br" "sc" D5:h. Eb5:e D5:e | @p< A4:w | @mp Bb4:q. A4:e G4:q Bb4:q | "mr" A4:h. r:q | '
           '"sc" G4:q. A4:e Bb4:q D5:q | @mp< "sc" Eb5:h D5:q Bb4:q | @mp> A4:q. Bb4:e A4:q G4:q | @p "mr" D4:h. r:q |')

SHAM_C = ('@mf G4:e A4:e "hj" C5:e A4:e G4:q "su" D4:q | E4:e G4:e A4:e C5:e "su" D5:q C5:e A4:e | '
          'G4:e A4:e C5:e D5:e "su" E5:q D5:e C5:e | A4:q G4:e E4:e G4:q "sk" G4:e D4:e | '
          'D5:e E5:e D5:e C5:e A4:q C5:e D5:e | "su" E5:q D5:e C5:e A4:q G4:q | '
          'A4:e C5:e A4:e G4:e E4:q G4:e A4:e | G4:q D4:q G3:q r:q | '
          '@f G4:e A4:e "hj" C5:e A4:e G4:q "su" D4:q | E4:e G4:e A4:e C5:e "su" D5:q C5:e A4:e | '
          'E5:e D5:e C5:e A4:e G4:e A4:e C5:e D5:e | @mf> "su" E5:q D5:h r:q | @mp')

SHAKU_C = ('@mp r:w | r:w | r:w | r:w | r:w | r:h "br" "sc" E5:q D5:q | C5:h A4:h | G4:h. r:q | '
           '@mf "sc" D5:w | E5:h C5:h | D5:h. E5:q | @mp> "mr" D5:h. r:q | @p')

SHAKU_A3 = ('@mf "br" "sc" A4:q. B4:e "gr" D5:q. E5:e | E5:e D5:e B4:q A4:q. B4:e | A4:e G4:e A4:e B4:e G4:q E4:q | '
            '"mr" A4:h. B4:e D5:e | "sc" E5:q. D5:e "gr" G5:h | A5:e G5:e E5:q D5:q. B4:e | '
            'A4:q G4:e E4:e D4:q E4:e G4:e | @mp> "mr" D4:h. r:q | @p')

KOTO_LINK = '@p A5:q. "os" B5:e "tr" D6:h | E6:e D6:e B5:q "tr" A5:h | G5:h. E5:q | @pp A5:h. r:q |'


def notes_from(text, start, name='p'):
    """Parse score text into note dicts with marks."""
    p = Part(name, 'x', text, start, BPB)
    marks = {}
    for b, t in p.marks:
        marks.setdefault(round(b, 4), set()).add(t)
    out = []
    for b, d, keys, _ in p.notes:
        for k in keys:
            out.append(dict(b=b, d=d, k=k, lv=p.level(b), m=set(marks.get(round(b, 4), ()))))
    return out


# ---------------------------------------------------------------- koto patterns
def gliss(target_b, lo, hi, scale, up=True, dt=0.034, lv0=0.25, lv1=0.5, land=True, lvl_land=0.6, dur=2.0, start_b=None):
    """Koto sweep (sararin) across the strings of the scale, landing on the
    top (or bottom) note at target_b. Notes before the target are placed in
    seconds before it (ts offsets)."""
    ks = [k for k in range(lo, hi + 1) if k % 12 in scale]
    if not up:
        ks = ks[::-1]
    n = len(ks)
    out = []
    for i, k in enumerate(ks[:-1] if land else ks):
        off = -(n - 1 - i) * dt
        lv = lv0 + (lv1 - lv0) * i / max(n - 2, 1)
        if start_b is not None:
            out.append(dict(b=start_b, ts=i * dt, d=1.2, k=k, lv=lv, m={'gl'}))
        else:
            out.append(dict(b=target_b, ts=off, d=1.2, k=k, lv=lv, m={'gl'}))
    if land:
        if start_b is not None:
            out.append(dict(b=start_b, ts=(n - 1) * dt, d=dur, k=ks[-1], lv=lvl_land, m={'acc'}))
        else:
            out.append(dict(b=target_b, d=dur, k=ks[-1], lv=lvl_land, m={'acc'}))
    return out


def trem(b, d, keys, lv, step=0.125, swell=0.12):
    """Koto tremolo (fast repeated strokes) on one note or a dyad."""
    out = []
    n = int(round(d / step))
    for i in range(n):
        x = i / max(n - 1, 1)
        l = lv + swell * math.sin(math.pi * x) - (0.05 if i % 2 else 0)
        for j, k in enumerate(keys):
            out.append(dict(b=b + i * step, ts=j * 0.006, d=step * 1.6, k=k, lv=l, m={'tr'}))
    return out


def koto_bar(bar_b, fname, style, lv, seed=0):
    bass_k = midi(F[fname][0])
    out = []
    rng = np.random.default_rng(seed)

    def N(b, k, d, l=lv, m=()):
        out.append(dict(b=bar_b + b, d=d, k=k, lv=l, m=set(m)))

    if style == 'flow':
        L = ladder(fname, bass_k + 5, bass_k + 30)
        v = int(rng.integers(0, 3))
        if v == 0:
            seq = [bass_k, L[0], L[1], L[2], L[3], L[2], L[1], L[0]]
        elif v == 1:
            seq = [bass_k, L[1], L[2], L[3], L[4], L[3], L[2], L[1]]
        else:
            seq = [bass_k, L[0], L[2], L[1], L[3], L[4], L[3], L[2]]
        for i, k in enumerate(seq):
            acc = 0.06 if i in (0, 4) else (-0.04 if i % 2 else 0)
            N(i * 0.5, k, 2.0 if i == 0 else 1.4, lv + acc)
    elif style == 'flowhi':     # A3: a higher, wider wash with a turn
        L = ladder(fname, bass_k + 12, bass_k + 34)
        seq = [bass_k, L[0], L[1], L[2], L[3], L[4], L[3], L[2]]
        for i, k in enumerate(seq):
            N(i * 0.5, k, 2.0 if i == 0 else 1.3, lv + (0.06 if i in (0, 5) else -0.03 * (i % 2)))
    elif style == 'sparse':     # under a melody: low and open
        L = ladder(fname, bass_k + 5, bass_k + 19)
        N(0, bass_k, 3.0, lv + 0.05)
        N(0, L[0], 2.5, lv - 0.05)
        N(1.5, L[1], 1.5, lv - 0.08)
        N(2, L[2], 2.0, lv - 0.04)
        N(3, L[1], 1.5, lv - 0.1)
    elif style == 'trem':       # B: tremolo on an open dyad, a low stroke
        L = ladder(fname, bass_k + 7, bass_k + 24)
        N(0, bass_k, 3.5, lv + 0.08)
        out.extend(trem(bar_b + 0.5, 2.0, [L[0], L[2]], lv - 0.08))
        N(3, L[0], 0.95, lv - 0.06)
    elif style == 'flowq':      # B second half: slow rising quarters
        L = ladder(fname, bass_k + 7, bass_k + 24)
        N(0, bass_k, 3.5, lv + 0.06)
        for i in range(1, 4):
            N(i, L[i - 1], 2.0 if i < 3 else 1.0, lv - 0.03 * i)
    elif style == 'off':        # C: bass on 1 and 3, dyads off the beat
        L = ladder(fname, bass_k + 7, bass_k + 22)
        N(0, bass_k, 1.4, lv + 0.08)
        N(2, bass_k + 7 if (bass_k + 7) % 12 in tones(fname) else L[0], 1.2, lv + 0.02)
        for i, b in enumerate((0.5, 1.5, 2.5, 3.5)):
            a, c = (L[0], L[2]) if i % 2 == 0 else (L[1], L[3])
            N(b, a, 0.45, lv - 0.06, ('st',))
            N(b, c, 0.45, lv - 0.06, ('st',))
    elif style == 'down':       # link: falling arpeggio
        L = ladder(fname, bass_k + 5, bass_k + 26)
        seq = [L[4], L[3], L[2], L[1], L[0], L[1], L[0], bass_k]
        N(0, bass_k, 3.0, lv + 0.04)
        for i, k in enumerate(seq[:-1]):
            N(i * 0.5 + (0.5 if i else 0.0), k, 1.4, lv - 0.04 * (i % 2))
    return out


def koto_section(start, harm, style, lv, seed):
    out = []
    for i, h in enumerate(harm):
        out += koto_bar(start + 4 * i, h, style, lv, seed=seed + i)
    return out


# ---------------------------------------------------------------- build the score
def build():
    S = {}   # stem name -> list of notes

    # ---- koto accompaniment ----
    ka = []
    # intro: a sweep up from the low strings, open fifth, tremolo, arpeggios
    ka += gliss(None, midi('D3'), midi('D5'), YO_D, start_b=0.15, dt=0.05, lv0=0.2, lv1=0.42, lvl_land=0.5, dur=3)
    ka += [dict(b=1.75, d=3, k=midi('D3'), lv=0.4, m=set()), dict(b=1.75, d=3, k=midi('A3'), lv=0.34, m=set())]
    ka += [dict(b=4, d=4, k=midi('D3'), lv=0.36, m=set())]
    ka += trem(4.5, 3.0, [midi('D4'), midi('A4')], 0.26, swell=0.1)
    ka += koto_bar(8, 'G6', 'flowq', 0.36)
    ka += koto_bar(12, 'A4', 'flow', 0.34, seed=3)
    ka += gliss(S_A1, midi('D4'), midi('D5'), YO_D, dt=0.045, lv0=0.22, lv1=0.4, land=False)
    # A1: flowing arpeggios; the sweep's landing note
    ka += [dict(b=S_A1, d=2.5, k=midi('D5'), lv=0.44, m={'acc'})]
    ka += koto_section(S_A1, A_H, 'flow', 0.38, 10)
    ka += gliss(S_A1 + 16, midi('A4'), midi('A5'), YO_D, dt=0.04, lv0=0.2, lv1=0.36, lvl_land=0.38, dur=1.5)
    # A2: low and open under the koto melody
    ka += koto_section(S_A2, A_H, 'sparse', 0.36, 20)
    # B: tremolo, then slow quarters
    ka += koto_section(S_B, B_H[:4], 'trem', 0.34, 30)
    ka += koto_section(S_B + 16, B_H[4:], 'flowq', 0.36, 34)
    # C: off-beat dyads (bars 1-8), then the bass alone under the heterophony
    ka += koto_section(S_C, C_H[:8], 'off', 0.42, 40)
    for i, h in enumerate(C_H[8:]):
        bk = midi(F[h][0])
        ka += [dict(b=S_C + 32 + 4 * i, d=1.6, k=bk, lv=0.46, m=set()),
               dict(b=S_C + 32 + 4 * i + 2, d=1.6, k=bk + 7 if (bk + 7) % 12 in tones(h) else bk + 12, lv=0.4, m=set())]
    # into the break: a sweep on notes both scales share
    ka += gliss(S_BRK, midi('D4'), midi('D6'), {2, 4, 7, 9}, dt=0.04, lv0=0.2, lv1=0.4, land=False)
    # break: koto alone
    br = S_BRK
    ka += [dict(b=br, d=3, k=midi('D6'), lv=0.46, m={'acc'}), dict(b=br, d=4, k=midi('D3'), lv=0.4, m=set()),
           dict(b=br + 1, d=2, k=midi('B5'), lv=0.34, m=set()), dict(b=br + 2, d=2, k=midi('A5'), lv=0.34, m=set()),
           dict(b=br + 3, d=2, k=midi('E5'), lv=0.3, m=set())]
    ka += [dict(b=br + 4, d=4, k=midi('B2'), lv=0.38, m=set())]
    ka += trem(br + 4.25, 2.25, [midi('D5'), midi('A5')], 0.24, swell=0.14)
    ka += [dict(b=br + 6.75, d=1.5, k=midi('E5'), lv=0.32, m=set()), dict(b=br + 7.25, d=1.5, k=midi('D5'), lv=0.3, m=set())]
    for i, (o, k) in enumerate([(0, 'G2'), (0.5, 'G3'), (1, 'D4'), (1.5, 'E4'), (2, 'B4'), (3, 'D5')]):
        ka += [dict(b=br + 8 + o, d=2.5, k=midi(k), lv=0.34 - 0.01 * i, m=set())]
    for i, (o, k) in enumerate([(0, 'A2'), (0.5, 'A3'), (1.5, 'D4'), (2.25, 'E4'), (3, 'A4')]):
        ka += [dict(b=br + 12 + o, d=2.5, k=midi(k), lv=0.32 - 0.01 * i, m=set())]
    ka += gliss(S_A3, midi('A4'), midi('D6'), YO_D, dt=0.04, lv0=0.2, lv1=0.42, lvl_land=0.46, dur=2.5)
    # A3: high wash
    ka += koto_section(S_A3, A_H, 'flowhi', 0.36, 50)
    # link: falling arpeggios, then the sweep that lands at A1
    ka += koto_section(S_LINK, LINK_H, 'down', 0.32, 60)
    ka += gliss(END, midi('D4'), midi('D5'), YO_D, dt=0.045, lv0=0.2, lv1=0.38, land=False)
    S['koto'] = ka

    # ---- koto melody (its own stem: oshide presses and yuri vibrato) ----
    km = notes_from(KOTO_A2, S_A2, 'koto melody')
    # C bars 9-12: the koto doubles the shamisen tune, simplified (heterophony)
    sh = notes_from(SHAM_C, S_C, 'sham')
    for n in sh:
        if n['b'] >= S_C + 32 and abs(n['b'] - round(n['b'])) < 1e-6:
            km.append(dict(b=n['b'] + 0.0, d=1.0, k=n['k'] - 12, lv=0.5, m=set()))
    km += notes_from(KOTO_LINK, S_LINK, 'koto link')
    S['koto_mel'] = km

    # ---- shakuhachi ----
    sk = notes_from(SHAKU_INTRO, 0) + notes_from(SHAKU_A1, S_A1) + notes_from(SHAKU_A2, S_A2) + \
        notes_from(SHAKU_B, S_B) + notes_from(SHAKU_C, S_C) + notes_from(SHAKU_A3, S_A3)
    S['shaku'] = sk

    # ---- shamisen: the C tune, and light plucks in A3 ----
    sm = list(sh)
    for i, h in enumerate(A_H):
        L = ladder(h, midi('A3'), midi('A4'))
        b0 = S_A3 + 4 * i
        sm += [dict(b=b0 + 1, d=0.5, k=L[-1], lv=0.36, m={'st'}),
               dict(b=b0 + 3, d=0.5, k=L[-2], lv=0.32, m={'st'})]
        if i % 2 == 1:
            sm += [dict(b=b0 + 3.5, d=0.5, k=L[-1], lv=0.3, m={'sk', 'st'})]
    S['shamisen'] = sm

    # ---- kotsuzumi (pon / ta) ----
    PON, TA = midi('C4'), midi('G4')
    kz = []
    for i in (0, 2, 4, 6):
        kz.append(dict(b=S_A2 + 4 * i, d=1, k=PON, lv=0.36, m={'pon'}))
    for i in range(12):
        b0 = S_C + 4 * i
        lv = 0.5 if i < 8 else 0.56
        if i % 2 == 0:
            kz += [dict(b=b0, d=1, k=PON, lv=lv, m={'pon'}), dict(b=b0 + 1.5, d=1, k=PON, lv=lv - 0.1, m={'pon'}),
                   dict(b=b0 + 3, d=0.5, k=TA, lv=lv + 0.06, m={'ta'})]
        else:
            kz += [dict(b=b0 + 0.5, d=0.5, k=TA, lv=lv, m={'ta'}), dict(b=b0 + 2, d=1, k=PON, lv=lv - 0.04, m={'pon'}),
                   dict(b=b0 + 3.5, d=1, k=PON, lv=lv - 0.12, m={'pon'})]
    for i in range(8):
        b0 = S_A3 + 4 * i
        kz += [dict(b=b0, d=1, k=PON, lv=0.42, m={'pon'})]
        if i % 2:
            kz += [dict(b=b0 + 2.5, d=0.5, k=TA, lv=0.44, m={'ta'})]
    S['kotsuzumi'] = kz

    # ---- soft low taiko ----
    tk = [dict(b=b, d=2, k=midi('F2'), lv=lv, m=set()) for b, lv in
          [(S_B, 0.3), (S_C, 0.5), (S_C + 16, 0.46), (S_C + 32, 0.52), (S_C + 44, 0.4), (S_C + 46, 0.36),
           (S_A3, 0.44), (S_A3 + 16, 0.4)]]
    S['taiko'] = tk

    # ---- hyoshigi: accelerating clacks into C, one at A3 ----
    hy = []
    b8 = S_B + 28
    for o in (0.0, 1.5, 2.35, 2.95, 3.32, 3.58, 3.76, 3.89):
        hy.append(dict(b=b8 + o, d=0.2, k=75, lv=0.32 + 0.05 * o, m=set()))
    hy += [dict(b=S_C, d=0.3, k=75, lv=0.62, m=set()), dict(b=S_A3, d=0.3, k=75, lv=0.46, m=set())]
    S['hyoshigi'] = hy

    # ---- wind chimes ----
    S['chime'] = [dict(b=b, d=4, k=k, lv=lv, m=set()) for b, k, lv in
                  [(0, 72, 0.4), (S_A1 + 16, 76, 0.28), (S_B, 72, 0.36), (S_BRK, 74, 0.42),
                   (S_A3 + 16, 76, 0.3), (S_LINK + 14, 72, 0.32)]]
    return S


def build_vsco():
    """Soft strings drone and glockenspiel glints (VSCO)."""
    P = []
    vc = Part('Cellos', 'vc', '', 0, BPB, legato=True, swell=0.04, humanize=0.01)
    vla = Part('Violas', 'vla', '', 0, BPB, legato=True, swell=0.04, humanize=0.01)
    cb = Part('Basses', 'cb', '', 0, BPB, legato=True, swell=0.03, humanize=0.01, layers=2)
    # A1: D + A drone, very soft
    vc.add('@pp ' + 'D3:w~ | D3:w | ' * 4, S_A1)
    vla.add('@pp ' + 'A3:w~ | A3:w | ' * 4, S_A1)
    # B: the bass walk D Bb G A G Eb A D, violas above
    vc.add('@pp< D3:w | Bb2:w | G2:w | A2:w | @p G2:w | Eb3:w | A2:w | @pp D3:w |', S_B)
    cb.add('@pp D2:w | Bb1:w | G1:w | A1:w | G1:w | Eb2:w | A1:w | D2:w |', S_B)
    vla.add('@pp A3:w | D4:w | D4:w | D4:w | @p Bb3:w | Bb3:w | D4:w | @pp A3:w |', S_B)
    # A3 and link
    vc.add('@pp< D3:w | B2:w | G2:w | A2:w | @p G2:w | E3:w | A2:w | D3:w |', S_A3)
    vla.add('@pp A3:w | D4:w | D4:w | E4:w | @p D4:w | D4:w | E4:w | @pp A3:w |', S_A3)
    vc.add('@pp D3:w | G2:w | E3:w | @pp> A2:w | @ppp', S_LINK)
    vla.add('@pp A3:w | B3:w | B3:w | @pp> A3:w | @ppp', S_LINK)
    gl = Part('Glockenspiel', 'glock', '', 0, BPB, humanize=0.004, gate=2.0)
    for b, t in [(S_A1 + 14, 'A6:h'), (S_A1 + 30, 'D7:h'), (S_BRK + 6, 'A6:q'), (S_BRK + 7, 'E6:q'),
                 (S_A3 + 14, 'B6:h'), (S_A3 + 30, 'D7:h'), (S_LINK + 6, 'E6:h')]:
        gl.add('@pp ' + t, b)
    P += [vc, vla, cb, gl]
    return P


# ---------------------------------------------------------------- performance (MIDI)
GM = {   # stem: (bank, program, drum?, rr channels, curves?)
    'koto': (0, 107, False), 'koto_mel': (0, 107, False), 'shaku': (0, 77, False),
    'shamisen': (0, 106, False), 'kotsuzumi': (0, 116, False), 'taiko': (0, 116, False),
    'hyoshigi': (0, 0, True), 'chime': (5, 124, False),
}
SEATS = {
    'koto': dict(pan=-0.32, width=0.65, depth=0.3), 'koto_mel': dict(pan=-0.22, width=0.4, depth=0.25),
    'shaku': dict(pan=0.12, width=0.25, depth=0.25), 'breath': dict(pan=0.12, width=0.3, depth=0.25),
    'shamisen': dict(pan=0.38, width=0.35, depth=0.3), 'kotsuzumi': dict(pan=0.25, width=0.3, depth=0.45),
    'taiko': dict(pan=-0.08, width=0.5, depth=0.7), 'hyoshigi': dict(pan=-0.3, width=0.2, depth=0.55),
    'chime': dict(pan=0.5, width=0.9, depth=0.55),
}
# active-level targets in dB (relative); the auto balance sets the gains
TARGET = {'shaku': 0, 'koto_mel': -1.5, 'shamisen': -2.5, 'koto': -5.5, 'kotsuzumi': -8, 'taiko': -10,
          'hyoshigi': -11, 'chime': -15, 'breath': -21, 'Cellos': -12, 'Violas': -14, 'Basses': -15,
          'Glockenspiel': -15}
TPS = 1920        # MIDI ticks per second (tempo 120, 960 per beat)
PRE = 0.5         # pre-roll in each rendered MIDI (s)


def _rng(*a):
    return np.random.default_rng(zlib.crc32(repr(a).encode()))


def vel(lv, rng, spread=4):
    return int(np.clip(round(18 + 112 * lv + rng.normal(0, spread)), 8, 127))


def perform(stem, notes, tempo, b0, b1, origin):
    """Turn notes [b0, b1) into timed MIDI notes with bend/expression curves.
    Times in seconds from `origin` beat (plus PRE). Returns list of dicts
    {t, dur, k, v, bend(fn or None), expr(fn or None), drum}."""
    t0 = tempo.sec(origin)
    out = []
    sel = sorted([n for n in notes if b0 - 1e-6 <= n['b'] < b1 - 1e-6], key=lambda n: (n['b'] + n.get('ts', 0), n['k']))
    scale_cache = {}
    for i, n in enumerate(sel):
        rng = _rng(stem, round(n['b'], 4), n['k'], round(n.get('ts', 0), 4))
        b, d = n['b'], n['d']
        on = tempo.sec(b) - t0 + n.get('ts', 0.0)
        off = tempo.sec(b + d) - t0 + n.get('ts', 0.0)
        hum = {'koto': 0.006, 'koto_mel': 0.008, 'shaku': 0.012, 'shamisen': 0.006}.get(stem, 0.005)
        if 'gl' in n['m'] or 'tr' in n['m']:
            hum = 0.002
        on += rng.normal(0, hum)
        dur = max(off - on, 0.06)
        m = n['m']
        v = vel(n['lv'], rng)
        ev = dict(t=on + PRE, dur=dur, k=n['k'], v=v, bend=None, expr=None, drum=GM[stem][2])
        if stem == 'shaku':
            # legato: overlap into a following note
            nxt = sel[i + 1] if i + 1 < len(sel) else None
            gap_before = True
            if i > 0:
                p = sel[i - 1]
                gap_before = n['b'] - (p['b'] + p['d']) > 0.2
            if nxt is not None and abs(nxt['b'] - (b + d)) < 0.02:
                ev['dur'] = dur + 0.05
            else:
                ev['dur'] = dur * 0.96
            ev['v'] = vel(n['lv'] * 0.9 + 0.08, rng, 3)
            ev.update(shaku_curves(n, dur, gap_before, rng))
            # grace from the scale note above
            if 'gr' in m:
                sc = scale_at(b)
                g = n['k'] + 1
                while g % 12 not in sc:
                    g += 1
                out.append(dict(t=ev['t'] - 0.075, dur=0.09, k=g, v=max(ev['v'] - 10, 20), bend=None,
                                expr=(lambda t: 0.75), drum=False))
            ev['gap'] = gap_before
            ev['lv'] = n['lv']
        elif stem == 'koto_mel':
            if 'tr' in m:
                # tremolo for the length of the note, fading
                nn = trem(b, d, [n['k']], n['lv'] - 0.06, swell=0.1)
                for j, tn in enumerate(nn):
                    r2 = _rng('kt', round(tn['b'], 4), tn['k'])
                    ton = tempo.sec(tn['b']) - t0 + PRE + r2.normal(0, 0.003)
                    out.append(dict(t=ton, dur=tempo.sec(tn['b'] + tn['d']) - tempo.sec(tn['b']), k=tn['k'],
                                    v=vel(tn['lv'] * (1 - 0.25 * j / max(len(nn), 1)), r2, 5), bend=None, expr=None, drum=False))
                continue
            if 'os' in m:
                # pluck a whole step below and press the string up to the note
                ev['k'] = n['k'] - 2
                tp = 0.09 + 0.04 * rng.random()
                ev['bend'] = (lambda t, tp=tp: 2.0 * _smooth(min(max((t - tp) / 0.14, 0), 1)))
                ev['dur'] = max(dur, 0.5)
            elif dur > 1.0:
                # yuri: a slow press vibrato on a long note (upward only)
                dl = 0.35
                ev['bend'] = (lambda t, dl=dl: 0.3 * max(0.0, min((t - dl) / 0.5, 1.0)) * (0.5 - 0.5 * math.cos(2 * math.pi * 4.6 * max(t - dl, 0))))
            ev['dur'] = max(ev['dur'], 1.0)
        elif stem == 'koto':
            if 'st' in m:
                ev['dur'] = min(dur, 0.35)
        elif stem == 'shamisen':
            ev['dur'] = max(dur * 0.9, 0.25)
            if 'sk' in m:       # sukui: an upstroke, softer and a hair late
                ev['t'] += 0.012
                ev['v'] = max(ev['v'] - 14, 15)
            if 'hj' in m:       # hajiki: a left-hand pluck, softer
                ev['v'] = max(ev['v'] - 18, 15)
            if 'su' in m:       # suri: slide into the note
                ev['bend'] = (lambda t: -1.6 * (1 - _smooth(min(t / 0.11, 1.0))))
            if 'st' in m:
                ev['dur'] = 0.3
        elif stem == 'kotsuzumi':
            if 'pon' in m:      # the drum's tone sinks as the grip relaxes
                ev['bend'] = (lambda t: 0.6 - 1.5 * _smooth(min(t / 0.35, 1.0)))
                ev['dur'] = 0.8
            else:
                ev['dur'] = 0.15
        elif stem == 'hyoshigi':
            ev['dur'] = 0.15
            out.append(dict(ev, k=76, v=max(ev['v'] - 22, 10)))     # a woodblock under the claves
        elif stem == 'chime':
            ev['dur'] = 4.0
        out.append(ev)
    return out


def _smooth(x):
    return x * x * (3 - 2 * x)


def shaku_curves(n, dur, gap_before, rng):
    """Pitch bend (semitones) and expression (0..1) for one shakuhachi note:
    a scoop into the note (bigger after a breath or when marked), vibrato that
    grows on long tones, a meri fall at the end of a phrase, and a blown swell."""
    m = n['m']
    scoop = 0.0
    if 'sc' in m:
        scoop = -0.9
    elif gap_before:
        scoop = -0.35
    elif dur > 0.8:
        scoop = -0.15
    ts = 0.16 if 'sc' in m else 0.09
    vib = dur > 1.1
    vstart = max(0.35 * dur, 0.4)
    rate = 4.8 + 0.6 * rng.random()
    depth = 0.28 if dur > 2 else 0.18
    meri = 'mr' in m
    mstart = dur * 0.72

    def bend(t):
        x = 0.0
        if scoop and t < ts:
            x += scoop * (1 - _smooth(t / ts))
        if vib and t > vstart:
            a = min((t - vstart) / 0.9, 1.0) * depth
            x += a * math.sin(2 * math.pi * rate * (t - vstart))
        if meri and t > mstart:
            x -= 0.85 * _smooth(min((t - mstart) / (dur - mstart + 1e-6), 1.0))
        return x

    peak = 1.0
    breath = 'br' in m

    def expr(t):
        a = 0.55 if gap_before else 0.78
        if breath:
            a -= 0.1
        up = min(t / (0.3 if gap_before else 0.12), 1.0)
        e = a + (peak - a) * _smooth(up)
        if dur > 1.2:
            x = t / dur
            e *= 0.9 + 0.1 * math.sin(math.pi * min(x, 1.0))
        if meri and t > mstart:
            e *= 1 - 0.55 * _smooth(min((t - mstart) / (dur - mstart + 1e-6), 1.0))
        return e

    return dict(bend=bend if (scoop or vib or meri) else None, expr=expr)


def write_midi(path, stem, evs, tail=4.0):
    import mido
    bank, prog, drum = GM[stem]
    mf = mido.MidiFile(ticks_per_beat=960)
    tr = mido.MidiTrack()
    mf.tracks.append(tr)
    tr.append(mido.MetaMessage('set_tempo', tempo=500000, time=0))
    msgs = []   # (tick, order, msg)
    chans = [c for c in range(16) if c != 9]
    if drum:
        chans = [9]
    for c in chans:
        msgs += [(0, 0, mido.Message('control_change', channel=c, control=0, value=bank)),
                 (0, 1, mido.Message('program_change', channel=c, program=prog)),
                 (0, 2, mido.Message('control_change', channel=c, control=101, value=0)),
                 (0, 3, mido.Message('control_change', channel=c, control=100, value=0)),
                 (0, 4, mido.Message('control_change', channel=c, control=6, value=2)),
                 (0, 5, mido.Message('control_change', channel=c, control=38, value=0)),
                 (0, 6, mido.Message('control_change', channel=c, control=7, value=110)),
                 (0, 7, mido.Message('control_change', channel=c, control=11, value=127)),
                 (0, 8, mido.Message('control_change', channel=c, control=10, value=64)),
                 (0, 9, mido.Message('pitchwheel', channel=c, pitch=0))]
    free = {c: -1.0 for c in chans}
    last_end = 0
    for e in sorted(evs, key=lambda e: e['t']):
        t = max(e['t'], 0.01)
        rel = 1.2 if stem in ('koto', 'koto_mel', 'chime') else 0.5
        # the channel free longest (its last note's release is over)
        c = min(chans, key=lambda c: free[c])
        free[c] = t + e['dur'] + rel
        on = int(round(t * TPS))
        offt = int(round((t + e['dur']) * TPS))
        if not drum:
            msgs.append((on - 2, 10, mido.Message('pitchwheel', channel=c, pitch=_pw(e['bend'](0.0) if e['bend'] else 0.0))))
            msgs.append((on - 2, 11, mido.Message('control_change', channel=c, control=11,
                                                  value=_cc(e['expr'](0.0) if e['expr'] else 1.0))))
        msgs.append((on, 20, mido.Message('note_on', channel=c, note=int(e['k']), velocity=int(e['v']))))
        msgs.append((offt, 5, mido.Message('note_off', channel=c, note=int(e['k']), velocity=0)))
        span = e['dur'] + (0.4 if e['bend'] else 0.0)
        if e['bend']:
            lastv = None
            for s in np.arange(0.01, span, 0.01):
                pv = _pw(e['bend'](min(s, e['dur'])))
                if pv != lastv:
                    msgs.append((on + int(round(s * TPS)), 12, mido.Message('pitchwheel', channel=c, pitch=pv)))
                    lastv = pv
        if e['expr']:
            lastv = None
            for s in np.arange(0.02, e['dur'], 0.02):
                cv = _cc(e['expr'](s))
                if cv != lastv:
                    msgs.append((on + int(round(s * TPS)), 13, mido.Message('control_change', channel=c, control=11, value=cv)))
                    lastv = cv
        last_end = max(last_end, offt)
    end = last_end + int(tail * TPS)
    msgs.append((end, 30, mido.Message('control_change', channel=chans[0], control=91, value=0)))
    msgs.sort(key=lambda x: (max(x[0], 0), x[1]))
    cur = 0
    for tk, _, msg in msgs:
        tk = max(tk, 0)
        msg.time = tk - cur
        cur = tk
        tr.append(msg)
    mf.save(path)


def _pw(st):
    return int(np.clip(round(st / 2.0 * 8191), -8192, 8191))


def _cc(e):
    return int(np.clip(round(127 * e), 0, 127))


def fluid(mid, wav):
    subprocess.run(['fluidsynth', '-ni', '-R', '0', '-C', '0', '-g', '0.5', '-r', str(SR), '-O', 'float', '-T', 'wav',
                    '-F', wav, SF2, mid], check=True, capture_output=True)
    x, sr = sf.read(wav, dtype='float32')
    assert sr == SR
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    return x


# ---------------------------------------------------------------- breath noise
def breath_layer(evs, length):
    """A breath layer for the shakuhachi: a noisy puff at each attack (strong
    after a breath, marked "br" strongest) and a faint airy hiss under each
    note that follows its expression."""
    from scipy.signal import butter, sosfilt
    out = np.zeros(length, np.float32)
    rng = np.random.default_rng(11)
    hi = butter(2, [900 / (SR / 2), 6500 / (SR / 2)], 'band', output='sos')
    lo = butter(2, [250 / (SR / 2), 1100 / (SR / 2)], 'band', output='sos')
    for e in evs:
        if e.get('expr') is None or 'gap' not in e:
            continue
        n = int((e['dur'] + 0.15) * SR)
        i0 = int(e['t'] * SR)
        if i0 < 0 or i0 >= length:
            continue
        t = np.arange(n) / SR
        nz = sosfilt(hi, rng.normal(0, 1, n)) + 0.5 * sosfilt(lo, rng.normal(0, 1, n))
        strong = 1.6 if e['gap'] else 0.5
        if e['bend'] is not None and e['bend'](0.0) < -0.5:
            strong *= 1.2
        puff = strong * np.exp(-np.maximum(t - 0.02, 0) / 0.11) * np.minimum(t / 0.015, 1)
        ex = np.array([e['expr'](min(s, e['dur'])) for s in t[::64]])
        ex = np.interp(t, t[::64], ex)
        sus = 0.22 * ex * (t < e['dur']) + 0.22 * ex * (t >= e['dur']) * np.exp(-(t - e['dur']) / 0.05)
        env = (puff + sus) * (0.5 + e['lv'])
        seg = (nz * env).astype(np.float32)
        j = min(length, i0 + n)
        out[i0:j] += seg[:j - i0]
    return np.stack([out, out], 1)


# ---------------------------------------------------------------- checks
def check(S, P, verbose=True):
    """Every pitched note in its section's scale; no minor seconds / ninths
    held together across parts (harsh clashes); long or downbeat melody notes
    against the harmony field; a section map."""
    probs = []
    pitched = ['koto', 'koto_mel', 'shaku', 'shamisen']
    allnotes = []
    for s in pitched:
        for n in S[s]:
            allnotes.append((s, n['b'] + n.get('ts', 0) * TEMPO.bpm(n['b']) / 60, n['d'], n['k']))
    for p in P:
        if p.name == 'Glockenspiel':
            pass
        for b, d, keys, _ in p.notes:
            for k in keys:
                allnotes.append((p.name, b, d, k))
    nscale = 0
    for s, b, d, k in allnotes:
        sc = scale_at(b)
        if k % 12 not in sc:
            # a sweep into a new section may borrow; report everything
            probs.append('scale: %s %s at beat %.2f (bar %d)' % (s, nm(k), b, b // 4 + 1))
            nscale += 1
    # clashes: minor 2nd / minor 9th held together (overlap >= .5 beat)
    nclash = 0
    seen = set()
    srt = sorted(allnotes, key=lambda x: x[1])
    for i, (s1, b1, d1, k1) in enumerate(srt):
        for s2, b2, d2, k2 in srt[i + 1:]:
            if b2 >= b1 + d1:
                if b2 > b1 + 6:
                    break
                continue
            if s1 == s2 and s1 == 'koto':
                continue
            ov = min(b1 + d1, b2 + d2) - max(b1, b2)
            iv = abs(k1 - k2)
            if ov >= 0.5 and iv % 12 == 1 and iv <= 25:
                key = (round(b1, 2), round(b2, 2), k1, k2)
                if key in seen:
                    continue
                seen.add(key)
                probs.append('clash: %s %s (beat %.2f) vs %s %s (beat %.2f), overlap %.2f' % (s1, nm(k1), b1, s2, nm(k2), b2, ov))
                nclash += 1
    # melody notes against the field
    info = []
    for s in ('shaku', 'koto_mel', 'shamisen'):
        for n in S[s]:
            b = n['b']
            if n['d'] >= 1.0 or abs(b % 4) < 1e-6:
                fname = HARM[int(b // 4)]
                if n['k'] % 12 not in tones(fname):
                    info.append('%s %s at bar %d beat %.1f over %s (%s)' % (s, nm(n['k']), b // 4 + 1, b % 4 + 1, fname, 'long' if n['d'] >= 1 else 'downbeat'))
    if verbose:
        print('section map:')
        for (nme, b), (_, b2) in zip(SECTIONS, SECTIONS[1:]):
            print('  %-6s bars %2d-%2d  %6.1f s - %6.1f s  (%.1f s)' % (nme, b // 4 + 1, b2 // 4, TEMPO.sec(b), TEMPO.sec(b2), TEMPO.sec(b2) - TEMPO.sec(b)))
        print('scale problems: %d, clashes: %d' % (nscale, nclash))
        for p in probs[:40]:
            print('  ', p)
        print('non-chord melody notes (long or downbeat): %d' % len(info))
        for x in info:
            print('   ', x)
    return probs, info


# ---------------------------------------------------------------- render
def active_db(x):
    m = x.mean(1) if x.ndim == 2 else x
    w = int(0.4 * SR)
    n = len(m) // w
    if n == 0:
        return -120
    r = np.sqrt(np.mean(m[:n * w].reshape(n, w) ** 2, 1) + 1e-12)
    db = 20 * np.log10(r)
    act = db[db > db.max() - 24]
    return float(10 * np.log10(np.mean(10 ** (act / 10))))


def render_song(outdir, work, excerpt=None):
    S = build()
    P = build_vsco()
    intro_s = TEMPO.sec(LOOP0)
    loop_s = TEMPO.sec(END) - intro_s
    intro_n = int(round(intro_s * SR))
    N = int(round(loop_s * SR))
    reps = 3
    total = intro_n + reps * N + 6 * SR
    pre = int(PRE * SR)
    stems = {}

    def lay(intro_buf, loop_buf):
        st = np.zeros((total, 2), np.float32)
        a = intro_buf[pre:]
        st[:min(len(a), total)] += a[:total]
        for k in range(reps):
            i = intro_n + k * N - pre
            seg = loop_buf[:max(0, total - i)]
            st[i:i + len(seg)] += seg
        return st

    shaku_ev = {}
    for stem in S:
        evs_i = perform(stem, S[stem], TEMPO, 0, LOOP0, 0)
        evs_l = perform(stem, S[stem], TEMPO, LOOP0, END, LOOP0)
        bufs = []
        for tag, evs in (('i', evs_i), ('l', evs_l)):
            if not evs:
                bufs.append(np.zeros((SR, 2), np.float32))
                continue
            mid = os.path.join(work, '%s_%s.mid' % (stem, tag))
            write_midi(mid, stem, evs)
            bufs.append(fluid(mid, os.path.join(work, '%s_%s.wav' % (stem, tag))))
        stems[stem] = lay(*bufs)
        if stem == 'shaku':
            shaku_ev = (evs_i, evs_l)
        print('  gm', stem, len(evs_i) + len(evs_l), 'notes')
    # breath layer, laid out the same way
    li = int((TEMPO.sec(LOOP0) + 8) * SR)
    ll = int((loop_s + 8) * SR)
    stems['breath'] = lay(breath_layer(shaku_ev[0], li), breath_layer(shaku_ev[1], ll))
    # VSCO parts
    for p in P:
        a = render.render_part(p, TEMPO, 0, LOOP0, 0) if any(n[0] < LOOP0 for n in p.notes) else np.zeros((SR, 2), np.float32)
        lp = render.render_part(p, TEMPO, LOOP0, END, LOOP0)
        z = np.zeros((pre, 2), np.float32)
        stems[p.name] = lay(np.concatenate([z, a]), np.concatenate([z, lp]))
        print('  vsco', p.name)
    # balance: each stem's playing level to its target, shakuhachi as reference
    ref = None
    gains = {}
    for name in stems:
        db = active_db(stems[name][intro_n:intro_n + N])
        gains[name] = TARGET[name] - db
    off = -gains['shaku']
    seatmap = dict(SEATS)
    seatmap.update({'Cellos': render.SEAT['vc'], 'Violas': render.SEAT['vla'], 'Basses': render.SEAT['cb'],
                    'Glockenspiel': render.SEAT['glock']})
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    sends = {'shaku': 1.0, 'breath': 0.7, 'koto': 1.0, 'koto_mel': 0.9, 'chime': 1.3, 'Glockenspiel': 1.2,
             'Cellos': 1.2, 'Violas': 1.2, 'Basses': 1.1}
    for name, st in stems.items():
        g = 10 ** ((gains[name] + off) / 20) * 0.12
        d, s = render.place(st, seatmap[name])
        dry += d * g
        send += s * g * sends.get(name, 0.9)
        print('  mix %-12s gain %+5.1f dB' % (name, gains[name] + off))
        stems[name] = None
    ir = render.hall_ir(seconds=2.8, rt_low=2.0, rt_mid=1.7, rt_high=0.9, seed=5)
    wet = render.reverb(send, ir)
    mix = dry + wet * 0.62
    del dry, send, wet
    m = render.master(mix)
    del mix
    k = 2
    body = m[intro_n + k * N: intro_n + (k + 1) * N].copy()
    head = m[:intro_n].copy()
    f = int(0.06 * SR)
    w = np.linspace(0, 1, f)[:, None]
    e = intro_n + k * N
    head[-f:] = head[-f:] * (1 - w) + m[e - f:e] * w
    out = np.concatenate([head, body])
    out, l0, l1 = render.loudness(out, -18.0)
    wav = os.path.join(work, ID + '.wav')
    sf.write(wav, out, SR, subtype='FLOAT')
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1,
                peak_db=20 * math.log10(float(np.max(np.abs(out))) + 1e-12))


def main():
    out = None
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    S = build()
    P = build_vsco()
    probs, info = check(S, P)
    if '--check' in sys.argv or out is None:
        return
    os.makedirs(out, exist_ok=True)
    work = os.environ.get('MUSIC_WORK', os.path.join(out, 'work'))
    os.makedirs(work, exist_ok=True)
    info = render_song(out, work)
    ogg = os.path.join(out, ID + '.ogg')
    render.to_ogg(info['wav'], ogg, q=6)
    render.to_mp3(info['wav'], os.path.join(out, ID + '.mp3'))
    mbuild.spectrogram(info['wav'], os.path.join(out, ID + '_spectrogram.png'), TITLE)
    jump, p999, mx = mbuild.seam_check(info['wav'], info['intro_s'])
    x, sr = sf.read(info['wav'])
    o = int(round(info['intro_s'] * sr))
    seam = np.concatenate([x[-4 * sr:], x[o:o + 4 * sr]])
    sf.write(os.path.join(work, ID + '_seam.wav'), seam, sr)
    render.to_mp3(os.path.join(work, ID + '_seam.wav'), os.path.join(out, ID + '_loop_seam.mp3'))
    meta = dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(info['intro_s'], 6), loop_s=round(info['loop_s'], 6),
                total_s=round(info['total_s'], 3), lufs=round(info['lufs'], 2), bpm=70, key='D (Yo; Miyako-bushi B, G Yo C)',
                seam=[round(jump, 5), round(p999, 5), round(mx, 5)])
    json.dump(meta, open(os.path.join(out, 'info.json'), 'w'), indent=1)
    print('%s: %.1f s (intro %.2f s, loop %.2f s), %.2f LUFS, peak %.2f dBFS, seam jump %.5f (99.9%% %.5f, max %.5f)' % (
        ID, info['total_s'], info['intro_s'], info['loop_s'], info['lufs'], info['peak_db'], jump, p999, mx))


if __name__ == '__main__':
    main()
