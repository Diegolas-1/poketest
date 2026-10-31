"""Route 1, evening: "Golden Fields" (original composition, OST part 2, 6/12).

Where: Route 1, the country road north of Pallet Town, 6-9 PM. Tall grass,
the flower meadow, the turning windmill, the little tea house; the sun goes
down over the fields, a long shadow on the road, Pidgey flocks heading home
to roost. Peaceful, a bit wistful, the day's adventure winding down, but
still a gentle walking pulse.

Key E-flat major, 6/8 (the tempo map counts quarter notes: q = 92, so the
dotted-quarter walking pulse is about 61), one bar = 3 quarter beats.

Form (bars of 6/8, loop body = bars 5-92):
  Intro   1-4    nylon guitar alone, then shaker, strings and an accordion
                 pickup                                         (plays once)
  A       5-20   the tune on accordion; guitar picking, soft bass, shaker,
                 a quiet string pad
  A2     21-36   the tune on oboe, the solo violin's countermelody over it,
                 brushes come in, the pad opens up
  B      37-52   the wistful middle: C minor, the solo violin sings a new
                 long-breathed melody, accordion answers underneath, the
                 basses bow, a swell and a sigh on A-flat minor
  C      53-60   the tea house: the accordion's little dance over pizzicato
                 strings and a woodblock clip-clop, no bass, no shaker
  C'     61-68   build: violin and oboe climb in thirds, the strings rise,
                 shaker and brushes return
  A3     69-84   everyone home: accordion + oboe on the tune with the violin
                 descant, then the violin takes the tune an octave up
  Coda   85-92   the tune fades down the road, a slight ritardando, the
                 violin's pickup leads back into A (the loop point)

Instrumentation: GM (GeneralUser GS through fluidsynth) accordion, nylon
guitar, acoustic bass, brush kit (shaker, brush taps, woodblocks,
triangle); VSCO 2 CE oboe, solo violin, string ensemble (violins, violas,
cellos, basses, pizzicato). All of it goes through render.py's concert hall
and master so it sits in one room.

  python3 tools/music/songs/route1_evening.py --out DIR [--excerpt B0 B1]
"""
import json
import os
import subprocess
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import build  # noqa: E402
import render  # noqa: E402
from score import Part, Tempo, midi  # noqa: E402
from sfz import SR  # noqa: E402

ID = 'route1_evening'
TITLE = 'Golden Fields'
BPB = 3                       # 6/8 = 3 quarter beats
BPM = 92
SF2 = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'

# solo violin (not in the shared orchestra)
render.ORCH['svln'] = ('SViolinVib.sfz', -0.5, 0.45, 0.05)
render.SUSTAINED.add('svln')
render.SEAT.update({
    'svln': dict(pan=-0.18, width=0.25, depth=0.12),
    'oboe': dict(pan=0.12, width=0.3, depth=0.35),
    'acc': dict(pan=0.3, width=0.45, depth=0.25),
    'gtr': dict(pan=-0.38, width=0.55, depth=0.28),
    'gbass': dict(pan=0.08, width=0.2, depth=0.35),
    'drums': dict(pan=0.05, width=0.75, depth=0.55),
    'wood': dict(pan=0.4, width=0.3, depth=0.5),
})

# GM programs: part patch -> (bank, program, channel)
GM = {
    'gm_acc': (0, 21, 0),       # Accordion
    'gm_gtr': (0, 24, 1),       # Nylon Guitar
    'gm_bass': (0, 32, 2),      # Acoustic Bass
    'gm_drums': (128, 40, 9),   # Brush kit
}

# ---------------------------------------------------------------- harmony
# name -> (bass, pad voicing low..high, chord tones, other good notes)
CH = {
    'Eb':     ('Eb2', ['G3', 'Bb3', 'Eb4'], 'Eb G Bb', 'D F'),
    'Ebmaj7': ('Eb2', ['G3', 'Bb3', 'D4'], 'Eb G Bb D', 'F'),
    'Eb/G':   ('G2', ['G3', 'Bb3', 'Eb4'], 'Eb G Bb', 'D F'),
    'Eb/Bb':  ('Bb1', ['G3', 'Bb3', 'Eb4'], 'Eb G Bb', 'D F'),
    'Eb7':    ('Eb2', ['G3', 'Db4', 'Eb4'], 'Eb G Bb Db', 'F'),
    'Ab':     ('Ab1', ['Ab3', 'C4', 'Eb4'], 'Ab C Eb', 'G Bb'),
    'Abmaj7': ('Ab1', ['G3', 'C4', 'Eb4'], 'Ab C Eb G', 'Bb'),
    'Abm':    ('Ab1', ['Ab3', 'Cb4', 'Eb4'], 'Ab Cb Eb', 'F Bb'),
    'Abm6':   ('Ab1', ['F3', 'Cb4', 'Eb4'], 'Ab Cb Eb F', 'Bb'),
    'Fm7':    ('F2', ['Ab3', 'C4', 'Eb4'], 'F Ab C Eb', 'G Bb'),
    'Bb7':    ('Bb1', ['Ab3', 'D4', 'F4'], 'Bb D F Ab', 'C G'),
    'Bb':     ('Bb1', ['F3', 'Bb3', 'D4'], 'Bb D F', 'C'),
    'Bb9sus': ('Bb1', ['Ab3', 'C4', 'Eb4'], 'Bb Eb F Ab C', ''),
    'Bb7sus': ('Bb1', ['Ab3', 'Eb4', 'F4'], 'Bb Eb F Ab', 'C'),
    'Cm':     ('C2', ['G3', 'C4', 'Eb4'], 'C Eb G', 'D Bb F'),
    'Cm7':    ('C2', ['G3', 'Bb3', 'Eb4'], 'C Eb G Bb', 'D F'),
    'Gm7':    ('G2', ['F3', 'Bb3', 'D4'], 'G Bb D F', 'C'),
    'Gm':     ('G2', ['G3', 'Bb3', 'D4'], 'G Bb D', 'C F'),
    'Gm7/Bb': ('Bb1', ['F3', 'Bb3', 'D4'], 'G Bb D F', 'C'),
    'Bb/Ab':  ('Ab1', ['F3', 'Bb3', 'D4'], 'Bb D F Ab', 'C'),
}


def bars(s):
    """'Eb | Fm7 Bb7 | ...' -> two entries (dotted quarters) per bar."""
    out = []
    for b in s.split('|'):
        c = b.split()
        if not c:
            continue
        out += c if len(c) == 2 else c * 2
    return out


INTRO = bars('Ebmaj7 | Abmaj7 | Ebmaj7 | Fm7 Bb7')
A_SEC = bars('Eb | Ab | Eb/G | Fm7 Bb7 | Eb | Cm7 | Ab Bb | Fm7 Bb |'
             'Eb | Ab | Gm7 Cm7 | Ab Abm | Eb/G | Fm7 Bb7 | Eb Bb9sus | Eb')
B_SEC = bars('Cm | Gm7/Bb | Ab | Eb/G | Fm7 | Bb7 | Eb | Eb7 |'
             'Abmaj7 | Gm7 | Fm7 | Bb | Ab | Abm6 | Eb/Bb | Bb7sus Bb7')
C_SEC = bars('Ab | Bb/Ab | Gm7 | Cm | Fm7 | Bb | Ebmaj7 | Ebmaj7 |'
             'Ab | Bb | Gm | Cm | Fm7 | Gm7 | Ab | Bb7sus Bb7')
CODA = bars('Eb | Ab | Eb/G | Abm | Eb/Bb | Fm7 Bb7 | Ebmaj7 | Bb7sus Bb7')

S_INTRO, S_A, S_A2, S_B, S_C, S_A3, S_CODA = 0, 12, 60, 108, 156, 204, 252
END = 276
HARM = INTRO + A_SEC + A_SEC + B_SEC + C_SEC + A_SEC + CODA
assert len(HARM) * 1.5 == END

# ---------------------------------------------------------------- melodies
MEL_A = """G4:q. Bb4:e Ab4:e G4:e | Eb4:e F4:e Ab4:e C5:q. | Bb4:q Ab4:e G4:q. | F4:q Eb4:e D4:q. |
G4:q. Bb4:e Eb5:e D5:e | C5:q Bb4:e G4:q. | Ab4:e C5:e Eb5:e D5:q. | C5:q Ab4:e Bb4:q. |
G4:q. Bb4:e Ab4:e G4:e | Eb4:e F4:e Ab4:e Eb5:q. | D5:q C5:e Bb4:q. | C5:q. Cb5:q. |
Bb4:q. G4:e Ab4:e Bb4:e | C5:q Ab4:e F4:q. | G4:q Bb4:e F4:q. | Eb4:h. |"""

# the solo violin's countermelody over the tune
CTR_A = """Eb5:q. G5:q Bb5:e | Ab5:q. Eb5:q. | G5:h. | Ab5:q. F5:q. |
Eb5:q. G5:e Bb5:q | Eb5:h. | Eb5:q. F5:q. | Eb5:q. D5:q. |
r:q. Bb5:q G5:e | Ab5:h. | Bb5:q. G5:q. | Eb5:h. |
G5:q. Bb5:q. | Ab5:q. F5:q. | G5:q. Ab5:q. | G5:h. |"""

MEL_B = """G5:q. Eb5:e F5:e G5:e | F5:q D5:e Bb4:q. | C5:q. Eb5:e F5:e Ab5:e | G5:h. |
Ab5:q G5:e F5:q. | D5:q Eb5:e F5:q. | G5:q. Bb5:q. | G5:q F5:e Db5:q. |
C5:q. Eb5:q. | D5:q. F5:e G5:e Bb5:e | Ab5:q. G5:e F5:e Eb5:e | F5:h. |
Eb5:q. C5:e Eb5:e Ab5:e | F5:q. Eb5:q. | G5:q F5:e Eb5:q. | F5:q. D5:q. |"""

# accordion under the violin in B: a slow guide-tone line
ACC_B = """G4:h. | F4:h. | Eb4:h. | Bb4:q. G4:q. | Ab4:h. | Ab4:q. F4:q. | G4:h. | G4:q. Bb4:q. |
G4:h. | F4:h. | Eb4:h. | D4:q. F4:q. | C4:q. Eb4:q. | Cb4:h. | Bb3:h. | Eb4:q. D4:q. |"""

# the tea house dance (accordion), then the build (violin, oboe in thirds)
MEL_C = """Eb5:e C5:e Ab4:e C5:e Eb5:e F5:e | D5:q. Bb4:q. | Bb4:e D5:e F5:e G5:q. | Eb5:h. |
Ab4:e C5:e Eb5:e Ab5:q. | F5:q D5:e Bb4:q. | D5:q. Eb5:e F5:e G5:e | G5:q. Bb4:q. |"""
VLN_BUILD = """C5:q. Eb5:q. | D5:q. F5:q. | G5:q. Bb5:q. | G5:h. | F5:q. Ab5:q. | G5:q. Bb5:q. | Ab5:q. C6:q. |
Bb5:q. Ab5:e F5:e D5:e |"""
OB_BUILD = """Ab4:q. C5:q. | Bb4:q. D5:q. | D5:q. G5:q. | Eb5:h. | C5:q. F5:q. | D5:q. G5:q. | Eb5:q. Ab5:q. |
F5:q. D5:e Bb4:e Ab4:e |"""

ACC_CODA = """G4:q. Bb4:e Ab4:e G4:e | Eb4:e F4:e Ab4:e C5:q. | Bb4:h. | Cb5:q. Ab4:q. | G4:h. | Ab4:q. F4:q. | Eb4:h. | r:h. |"""
VLN_CODA = """r:h. | r:q. Eb5:q. | G5:h. | Eb5:q. Cb5:q. | Bb4:h. | C5:q. D5:q. | D5:h. | Eb5:q. D5:q. |"""

NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']


def name(k):
    return NOTE[k % 12] + str(k // 12 - 1)


def octv(text, n):
    import re
    return re.sub(r'([A-G][#b]?)(-?\d)(?=[:,~])', lambda m: m.group(1) + str(int(m.group(2)) + n), text)


def pcs(names):
    return {midi(n + '4') % 12 for n in names.split()}


def rest_bars(n):
    return ' '.join(['r:h. |'] * n)


# ---------------------------------------------------------------- accompaniment generators
def note(part, b, d, keys):
    keys = keys if isinstance(keys, list) else [keys]
    part.notes.append([b, d, keys, [name(k) for k in keys]])


def guitar(part, harm, start, busy=False):
    """Fingerpicked nylon guitar: per dotted quarter a bass note then two
    chord tones, the notes left to ring to the end of the group."""
    for i, h in enumerate(harm):
        bass, pad, tones, _ = CH[h]
        b0 = start + i * 1.5
        bk = midi(bass)
        while bk < 40:
            bk += 12
        ps = pcs(tones)
        up = sorted(k for k in range(55, 72) if k % 12 in ps)
        first = (i % 2 == 0)
        same = i % 2 == 1 and harm[i - 1] == h
        if first or not same:
            low = bk
            u = [up[0], up[1]] if not busy else [up[1], up[2]]
        else:
            fifth = [k for k in range(bk + 5, bk + 9) if k % 12 in ps]
            low = fifth[0] if fifth else bk + 12
            u = [up[2], up[1]] if not busy else [up[3] if len(up) > 3 else up[2], up[2]]
        note(part, b0, 1.5, low)
        note(part, b0 + 0.5, 1.0, u[0])
        note(part, b0 + 1.0, 0.5, u[1])


def bassline(part, harm, start, walk=True):
    """Acoustic bass: root on the dotted quarter; a whole-bar chord gets its
    fifth and an approach eighth into the next bar."""
    def root(h):
        k = midi(CH[h][0])
        while k < 31:
            k += 12
        while k > 43:
            k -= 12
        return k
    n = len(harm)
    for i in range(0, n, 2):
        b0 = start + i * 1.5
        h1, h2 = harm[i], harm[i + 1]
        r1 = root(h1)
        if h1 != h2:
            note(part, b0, 1.4, r1)
            note(part, b0 + 1.5, 1.4, root(h2))
            continue
        ps = pcs(CH[h1][2])
        fifth = next((k for k in (r1 + 7, r1 + 6, r1 + 8) if k % 12 in ps), r1 + 12)
        if fifth > 46:
            fifth -= 12
        note(part, b0, 1.4, r1)
        nxt = harm[i + 2] if i + 2 < n else 'Eb'
        if walk and nxt != h1:
            tgt = root(nxt)
            scale = pcs('Eb F G Ab Bb C D')
            if (i // 2) % 2:      # diatonic step from below
                appr = tgt - 1 if (tgt - 1) % 12 in scale else tgt - 2
            else:                 # diatonic step from above
                appr = tgt + 1 if (tgt + 1) % 12 in scale else tgt + 2
            note(part, b0 + 1.5, 0.9, fifth)
            note(part, b0 + 2.5, 0.45, appr)
        else:
            note(part, b0 + 1.5, 1.4, fifth)


def pad(part, harm, start, voice, octave=0):
    """One voice of a sustained string pad: ties while the note holds."""
    k_prev, b_prev, d = None, None, 0
    for i, h in enumerate(harm):
        k = midi(CH[h][1][voice]) + 12 * octave
        b = start + i * 1.5
        if k == k_prev and i % 4 != 0:       # re-bow every two bars
            d += 1.5
            continue
        if k_prev is not None:
            note(part, b_prev, d, k_prev)
        k_prev, b_prev, d = k, b, 1.5
    note(part, b_prev, d, k_prev)


def basspad(part, harm, start, octave=0):
    for i in range(0, len(harm), 2):
        b0 = start + i * 1.5
        h1, h2 = harm[i], harm[i + 1]
        r = lambda h: midi(CH[h][0]) + 12 * octave
        if h1 == h2 or CH[h1][0] == CH[h2][0]:
            note(part, b0, 3, r(h1))
        else:
            note(part, b0, 1.5, r(h1))
            note(part, b0 + 1.5, 1.5, r(h2))


def pizz(part_lo, part_hi, harm, start):
    """Tea-house oom-pah: cello pizz on the bar, violin pizz chord on the
    second dotted quarter."""
    for i in range(0, len(harm), 2):
        b0 = start + i * 1.5
        h1, h2 = harm[i], harm[i + 1]
        k = midi(CH[h1][0])
        while k < 36:
            k += 12
        note(part_lo, b0, 0.5, k)
        note(part_hi, b0 + 1.5, 0.5, [midi(x) + 12 for x in CH[h2][1][1:]])


DR = {'kick': 36, 'tap': 38, 'slap': 39, 'swirl': 40, 'ride': 51, 'shaker': 82,
      'wbh': 76, 'wbl': 77, 'tri': 81, 'trim': 80}


def drum(part, b, key, vel, d=0.25):
    part.notes.append([b, d, [DR[key]], [key], vel])


def shaker(part, b0, nbars, v=1.0):
    for k in range(nbars):
        for j in range(6):
            acc = 1.0 if j in (0, 3) else (0.7 if j in (2, 5) else 0.55)
            drum(part, b0 + 3 * k + 0.5 * j, 'shaker', 0.55 * acc * v)


def brushes(part, b0, nbars, v=1.0, fill_last=False):
    for k in range(nbars):
        b = b0 + 3 * k
        drum(part, b, 'kick', 0.42 * v)
        drum(part, b + 1.5, 'tap', 0.5 * v)
        drum(part, b + 1.0, 'tap', 0.22 * v)
        drum(part, b + 2.5, 'tap', 0.25 * v)
        if k % 2 == 0:
            drum(part, b, 'swirl', 0.3 * v, d=2.9)
    if fill_last:
        b = b0 + 3 * (nbars - 1)
        for j, x in enumerate([2.0, 2.25, 2.5, 2.75]):
            drum(part, b + x, 'tap', (0.25 + 0.08 * j) * v)


def clipclop(part, b0, nbars, v=1.0):
    for k in range(nbars):
        b = b0 + 3 * k
        for x, kk, a in ((0, 'wbl', .5), (0.5, 'wbh', .38), (1.5, 'wbl', .45), (2.0, 'wbh', .36)):
            drum(part, b + x, kk, a * v)


# ---------------------------------------------------------------- the score
def build_score():
    P = []

    def part(n, patch, text='', start=0, **perf):
        P.append(Part(n, patch, text, start, BPB, **perf))
        return P[-1]

    # ----- accordion: the tune -----
    acc = part('Accordion', 'gm_acc', legato=True, humanize=0.006, gain=0)
    acc.add('@p r:h. | r:h. | r:h. | r:q. F4:e G4:e Ab4:e |', S_INTRO)
    acc.add('@mp ' + MEL_A, S_A)
    acc.add('@p ' + ACC_B, S_B)
    acc.add('@mp ' + MEL_C, S_C)
    acc.add('@p ' + rest_bars(7) + ' r:q. Bb4:e C5:e D5:e |', S_C + 24)
    acc.add('@mf ' + MEL_A, S_A3)
    acc.add('@mp> ' + ACC_CODA + ' @p', S_CODA)

    # ----- oboe: the tune in A2, climbs in C', doubles in A3 -----
    ob = part('Oboe', 'ob', legato=True, humanize=0.008, swell=0.05)
    ob.add('@mp ' + MEL_A, S_A2)
    ob.add('@mp< ' + OB_BUILD + ' @mf', S_C + 24)
    ob.add('@mp ' + '|'.join(MEL_A.split('|')[:8]) + '|', S_A3)

    # ----- solo violin -----
    sv = part('Solo violin', 'svln', legato=True, humanize=0.01, swell=0.07, cents=2)
    sv.add('@p ' + rest_bars(15) + ' r:q. Bb4:e C5:e D5:e |', S_A)      # pickup into A2
    sv.add('@mp ' + CTR_A, S_A2)
    sv.add('@mf ' + MEL_B, S_B)
    sv.add('@mp< ' + VLN_BUILD + ' @mf', S_C + 24)
    sv.add('@mp ' + '|'.join(CTR_A.split('|')[:8]) + '|', S_A3)
    sv.add('@mf ' + octv('|'.join(MEL_A.split('|')[8:16]) + '|', 1), S_A3 + 24)
    sv.add('@p ' + VLN_CODA, S_CODA)

    # ----- nylon guitar -----
    gt = part('Guitar', 'gm_gtr', humanize=0.006)
    guitar(gt, INTRO, S_INTRO)
    gt.dyn += [[S_INTRO, .5, False]]
    guitar(gt, A_SEC, S_A)
    guitar(gt, A_SEC, S_A2, busy=True)
    guitar(gt, B_SEC, S_B)
    guitar(gt, C_SEC, S_C, busy=True)
    guitar(gt, A_SEC, S_A3, busy=True)
    guitar(gt, CODA, S_CODA)
    gt.dyn += [[S_A, .5, False], [S_A2, .52, False], [S_B, .48, False], [S_C, .52, False],
               [S_A3, .56, False], [S_CODA, .52, True], [END, .42, False]]

    # ----- acoustic bass -----
    gb = part('Bass', 'gm_bass', humanize=0.006)
    gb.dyn += [[S_A, .5, False]]
    note(gb, S_INTRO + 6, 3, midi('Eb2'))
    note(gb, S_INTRO + 9, 1.4, midi('F2'))
    note(gb, S_INTRO + 10.5, 1.4, midi('Bb1'))
    bassline(gb, A_SEC, S_A, walk=False)
    bassline(gb, A_SEC, S_A2)
    bassline(gb, B_SEC, S_B)
    bassline(gb, C_SEC[16:], S_C + 24)
    bassline(gb, A_SEC, S_A3)
    bassline(gb, CODA, S_CODA, walk=False)
    gb.dyn += [[S_INTRO, .4, False], [S_A, .48, False], [S_A2, .52, False], [S_B, .55, False],
               [S_C + 24, .48, True], [S_A3, .58, False], [S_CODA, .5, True], [END, .42, False]]

    # ----- strings -----
    vn = part('Violins', 'vln', legato=True, humanize=0.012, swell=0.05, cents=-3)
    va = part('Violas', 'vla', legato=True, humanize=0.012, swell=0.05)
    vc = part('Cellos', 'vc', legato=True, humanize=0.012, swell=0.05)
    cb = part('Basses', 'cb', legato=True, humanize=0.012, swell=0.03, layers=3)
    # intro: the pad breathes in
    va.add('@pp< ' + rest_bars(2), S_INTRO)
    pad(va, INTRO[4:], S_INTRO + 6, 1)
    pad(vc, INTRO[4:], S_INTRO + 6, 0)
    va.dyn += [[S_INTRO + 6, .14, True], [S_A, .26, False]]
    vc.dyn += [[S_INTRO + 6, .14, True], [S_A, .24, False]]
    # A: violas and cellos only
    pad(va, A_SEC, S_A, 1)
    pad(vc, A_SEC, S_A, 0)
    # A2: the pad opens up
    pad(vn, A_SEC, S_A2, 2)
    pad(va, A_SEC, S_A2, 1)
    pad(vc, A_SEC, S_A2, 0)
    vn.dyn += [[S_A2, .26, False]]
    va.dyn += [[S_A2, .3, False]]
    vc.dyn += [[S_A2, .3, False]]
    # B: warm, swelling; basses bow
    pad(vn, B_SEC, S_B, 2)
    pad(va, B_SEC, S_B, 1)
    pad(vc, B_SEC, S_B, 0)
    basspad(cb, B_SEC, S_B, 1)
    for p_, lv in ((vn, .3), (va, .34), (vc, .36), (cb, .3)):
        p_.dyn += [[S_B, lv, True], [S_B + 30, lv + .12, True], [S_B + 36, lv + .08, True], [S_B + 48, lv - .04, False]]
    # C: tea house pizzicato; C': the pad climbs back
    vcp = part('Cellos pizz', 'vc_pizz', humanize=0.008)
    vnp = part('Violins pizz', 'vln_pizz', humanize=0.01, spread=0.012)
    pizz(vcp, vnp, C_SEC[:16], S_C)
    vcp.dyn += [[S_C, .42, False]]
    vnp.dyn += [[S_C, .36, False]]
    pad(vn, C_SEC[16:], S_C + 24, 2)
    pad(va, C_SEC[16:], S_C + 24, 1)
    pad(vc, C_SEC[16:], S_C + 24, 0)
    basspad(cb, C_SEC[16:], S_C + 24, 1)
    for p_ in (vn, va, vc, cb):
        p_.dyn += [[S_C + 24, .2, True], [S_A3 - 0.5, .5, False]]
    # A3: full
    pad(vn, A_SEC, S_A3, 2)
    pad(va, A_SEC, S_A3, 1)
    pad(vc, A_SEC, S_A3, 0)
    basspad(cb, A_SEC, S_A3, 1)
    for p_, lv in ((vn, .36), (va, .38), (vc, .4), (cb, .34)):
        p_.dyn += [[S_A3, lv, False], [S_A3 + 24, lv + .05, False]]
    # coda: thins out to violas and cellos
    pad(va, CODA, S_CODA, 1)
    pad(vc, CODA, S_CODA, 0)
    basspad(cb, CODA[:8], S_CODA, 1)
    va.dyn += [[S_CODA, .34, True], [END, .24, False]]
    vc.dyn += [[S_CODA, .34, True], [END, .22, False]]
    cb.dyn += [[S_CODA, .28, True], [S_CODA + 12, .16, False]]

    # ----- brush kit: shaker, brushes, woodblocks, triangle -----
    dr = part('Drums', 'gm_drums', humanize=0.007)
    shaker(dr, S_INTRO + 6, 2, 0.6)
    shaker(dr, S_A, 16, 0.85)
    shaker(dr, S_A2, 16)
    brushes(dr, S_A2, 16, 0.8, fill_last=True)
    shaker(dr, S_B, 16, 0.85)
    brushes(dr, S_B, 16, 0.9, fill_last=True)
    shaker(dr, S_C + 36, 4, 0.8)
    brushes(dr, S_C + 24, 8, 0.75, fill_last=True)
    shaker(dr, S_A3, 16, 1.0)
    brushes(dr, S_A3, 16, 1.0)
    shaker(dr, S_CODA, 6, 0.7)
    brushes(dr, S_CODA, 4, 0.6)
    for b in (S_A2, S_B, S_C, S_A3):
        drum(dr, b, 'tri', 0.35, d=1.0)
    drum(dr, S_C + 69, 'swirl', 0.45, d=1.5)          # into C'
    wb = part('Woodblock', 'gm_drums', humanize=0.006)
    clipclop(wb, S_C, 8, 0.9)
    clipclop(wb, S_CODA + 12, 2, 0.45)

    # ----- tempo with rubato -----
    tempo = Tempo([[0, 88], [5, 92], [S_A2 - 2, 92], [S_A2, 90], [S_A2 + 1, 92],
                   [S_B - 2, 92], [S_B, 89], [S_B + 1.5, 92],
                   [S_C - 4, 92], [S_C, 87], [S_C + 2, 90], [S_C + 22, 90], [S_C + 26, 91],
                   [S_A3 - 2, 93], [S_A3, 88], [S_A3 + 1.5, 93], [S_CODA - 2, 92],
                   [S_CODA + 12, 91], [END - 3, 87], [END, 89]])
    return P, tempo


SEATS = {'Accordion': 'acc', 'Oboe': 'oboe', 'Solo violin': 'svln', 'Guitar': 'gtr', 'Bass': 'gbass',
         'Violins': 'vln2', 'Violas': 'vla', 'Cellos': 'vc', 'Basses': 'cb', 'Cellos pizz': 'vc',
         'Violins pizz': 'vln1', 'Drums': 'drums', 'Woodblock': 'wood'}


# ---------------------------------------------------------------- checks
SCALE = pcs('Eb F G Ab Bb C D')


def check_harmony(P):
    """Every melodic note against the chord of its moment: notes on the
    dotted-quarter beats (and held across a chord change) must be chord tones
    or listed colour tones; the eighths in between must be in the key or the
    chord."""
    bad = 0
    for p in P:
        if p.patch in ('gm_drums',):
            continue
        for n in p.notes:
            b, d, keys = n[0], n[1], n[2]
            for k in keys:
                pc = k % 12
                spots = [b] + [x * 1.5 for x in range(int(b / 1.5) + 1, int((b + d - 0.01) / 1.5) + 1)]
                for s in spots:
                    hi = min(int(s / 1.5), len(HARM) - 1)
                    h = HARM[hi]
                    _, _, tones, ok = CH[h]
                    strong = abs(s / 1.5 - round(s / 1.5)) < 1e-6
                    good = pcs(tones) | (pcs(ok) if ok else set())
                    allowed = good if strong else (good | SCALE | pcs(tones))
                    if pc not in allowed:
                        bad += 1
                        print('  CLASH %-12s bar %5.2f %s over %s' % (p.name, s / 3 + 1, name(k), h))
    print('harmony check: %d clashes' % bad)
    return bad


def section_map(tempo):
    secs = [('Intro', S_INTRO), ('A (accordion)', S_A), ('A2 (oboe + violin)', S_A2), ('B (violin, C minor)', S_B),
            ('C (tea house)', S_C), ("C' (build)", S_C + 24), ('A3 (tutti)', S_A3), ('Coda', S_CODA), ('loop end', END)]
    out = []
    for n, b in secs:
        out.append((n, int(b / 3) + 1, round(tempo.sec(b), 2)))
        print('  %-22s bar %3d  %6.2f s' % out[-1])
    return out


# ---------------------------------------------------------------- GM rendering (fluidsynth)
PRE = 0.25


def gm_render(part, tempo, b0, b1, origin, work):
    """Render the notes of a GM part starting in [b0, b1) with fluidsynth;
    sample 0 = origin beat (like render.render_part)."""
    import mido
    bank, prog, ch = GM[part.patch]
    perf = part.perf
    hum = perf.get('humanize', 0.006)
    legato = perf.get('legato', False)
    t0 = tempo.sec(origin)
    notes = [n for n in part.notes if b0 - 1e-6 <= n[0] < b1 - 1e-6]
    if not notes:
        return np.zeros((SR, 2), np.float32)
    TPS = 1920   # ticks per second at 120 bpm, 960 ppq
    ev = []
    is_drum = ch == 9
    for i, n in enumerate(notes):
        b, d, keys = n[0], n[1], n[2]
        rng = np.random.default_rng(zlib.crc32(repr((part.name, round(b, 4), tuple(keys))).encode()))
        on = tempo.sec(b) - t0 + rng.normal(0, hum)
        off = tempo.sec(b + d) - t0
        if legato:
            nx = notes[i + 1] if i + 1 < len(notes) else None
            off += 0.03 if (nx and abs(nx[0] - (b + d)) < 0.02) else -0.04
        else:
            off = on + (off - on) * (0.98 if not is_drum else 1)
        lvl = n[4] if len(n) > 4 else part.level(b)
        accent = 1.0
        if part.patch == 'gm_gtr':
            accent = 1.12 if abs((b / 1.5) - round(b / 1.5)) < 1e-6 else 0.92
        vel = int(np.clip((22 + 100 * lvl) * accent + rng.normal(0, 4), 8, 127))
        for j, k in enumerate(keys):
            ev.append((on + PRE + j * 0.004, 1, k, vel))
            ev.append((max(off, on + 0.05) + PRE, 0, k, 0))
    cc = []
    if part.patch == 'gm_acc':
        # bellows: expression follows the dynamic, long notes swell and ease
        tmax = max(e[0] for e in ev) + 0.5
        for t in np.arange(0, tmax, 0.04):
            beat = None
            # find beat at time t
            lo, hi = b0, b1 + 4
            tt = t - PRE + t0
            for _ in range(30):
                mid = (lo + hi) / 2
                if tempo.sec(mid) < tt:
                    lo = mid
                else:
                    hi = mid
            beat = lo
            lv = part.level(beat)
            sw = 0
            for n in notes:
                if n[0] <= beat < n[0] + n[1] and n[1] >= 1.4:
                    x = (beat - n[0]) / n[1]
                    sw = 0.1 * np.sin(np.pi * min(x * 1.3, 1.0)) - 0.04 * x
            cc.append((t, int(np.clip(30 + 120 * (lv + sw), 20, 127))))
    mf = mido.MidiFile(ticks_per_beat=960)
    tr = mido.MidiTrack()
    mf.tracks.append(tr)
    tr.append(mido.MetaMessage('set_tempo', tempo=500000, time=0))
    if not is_drum:
        tr.append(mido.Message('control_change', channel=ch, control=0, value=bank, time=0))
    tr.append(mido.Message('program_change', channel=ch, program=prog, time=0))
    for c, v in ((7, 100), (10, 64), (91, 0), (93, 0), (11, 100)):
        tr.append(mido.Message('control_change', channel=ch, control=c, value=v, time=0))
    allev = [(t, 'n', a, k, v) for t, a, k, v in ev] + [(t, 'c', 0, 11, v) for t, v in cc]
    allev.sort(key=lambda e: (e[0], 0 if e[1] == 'n' and e[2] == 0 else 1))
    last = 0
    for t, kind, a, k, v in allev:
        tick = int(round(t * TPS))
        dt = max(0, tick - last)
        last += dt
        if kind == 'c':
            tr.append(mido.Message('control_change', channel=ch, control=k, value=v, time=dt))
        elif a:
            tr.append(mido.Message('note_on', channel=ch, note=k, velocity=v, time=dt))
        else:
            tr.append(mido.Message('note_off', channel=ch, note=k, velocity=0, time=dt))
    tr.append(mido.Message('control_change', channel=ch, control=1, value=0, time=int(4 * TPS)))
    tag = '%s_%d' % (part.name.replace(' ', '_'), zlib.crc32(repr((b0, b1, origin)).encode()))
    mid = os.path.join(work, tag + '.mid')
    wav = os.path.join(work, tag + '.wav')
    mf.save(mid)
    subprocess.run(['fluidsynth', '-ni', '-q', '-g', '0.5', '-r', str(SR), '-R', '0', '-C', '0',
                    '-o', 'synth.polyphony=256', '-F', wav, SF2, mid], check=True, capture_output=True)
    x, sr = sf.read(wav, dtype='float32', always_2d=True)
    assert sr == SR
    return x[int(round(PRE * SR)):]


def stem(p, tempo, b0, b1, origin, work):
    if p.patch.startswith('gm_'):
        return gm_render(p, tempo, b0, b1, origin, work)
    return render.render_part(p, tempo, b0, b1, origin)


def mixdown(parts, total, lay, work):
    """lay(p) -> list of (offset samples, buffer). Returns (dry, send)."""
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    levels = {}
    for p in parts:
        seat = render.SEAT[SEATS.get(p.name, p.name)]
        seat = dict(seat, **{k: p.perf[k] for k in ('pan', 'width', 'depth') if k in p.perf})
        st = np.zeros((total, 2), np.float32)
        for i, buf in lay(p):
            seg = buf[:max(0, total - i)]
            st[i:i + len(seg)] += seg
        d, s = render.place(st, seat)
        g = 10 ** (GAIN.get(p.name, 0) / 20)
        dry += d * g
        send += s * g * SEND.get(p.name, 1.0)
        nz = np.abs(d).max(1) > 1e-4
        levels[p.name] = 20 * np.log10(np.sqrt(np.mean((d[nz] * g) ** 2)) + 1e-9) if nz.any() else -99
        print('  part %-14s active rms %6.1f dB' % (p.name, levels[p.name]))
    return dry, send, levels


# stem gains (dB) after the stage: balance the GM synth against VSCO
GAIN = {'Accordion': 13.0, 'Guitar': 3.0, 'Bass': 4.5, 'Drums': 3.5, 'Woodblock': 0.0,
        'Oboe': 0.5, 'Solo violin': 1.0, 'Violins': -2.0, 'Violas': -1.0, 'Cellos': -1.5, 'Basses': -8.0,
        'Cellos pizz': -2.0, 'Violins pizz': -4.0}
SEND = {'Bass': 0.5, 'Drums': 0.7, 'Guitar': 0.8}


def finish(mix):
    ir = render.hall_ir(seconds=3.0, rt_low=2.2, rt_mid=1.8, rt_high=1.0)
    return mix, ir


def render_song(P, tempo, outdir, work):
    ls, le = S_A, END
    intro_s = tempo.sec(ls)
    loop_s = tempo.sec(le) - intro_s
    intro_n = int(round(intro_s * SR))
    N = int(round(loop_s * SR))
    reps = 4
    total = intro_n + reps * N + 6 * SR

    def lay(p):
        out = [(0, stem(p, tempo, 0, ls, 0, work))]
        lp = stem(p, tempo, ls, le, ls, work)
        out += [(intro_n + k * N, lp) for k in range(reps)]
        return out

    dry, send, levels = mixdown(P, total, lay, work)
    ir = render.hall_ir(seconds=3.0, rt_low=2.2, rt_mid=1.8, rt_high=1.0)
    m = render.master(dry + render.reverb(send, ir) * 0.7)
    k = 2
    body = m[intro_n + k * N: intro_n + (k + 1) * N].copy()
    head = m[:intro_n].copy()
    f = int(0.06 * SR)
    w = np.linspace(0, 1, f)[:, None]
    e = intro_n + k * N
    head[-f:] = head[-f:] * (1 - w) + m[e - f:e] * w
    out, l0, l1 = render.loudness(np.concatenate([head, body]), target=-18.0)
    wav = os.path.join(work, ID + '.wav')
    sf.write(wav, out, SR, subtype='FLOAT')
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1,
                peak_db=20 * np.log10(np.abs(out).max()), levels=levels)


def render_excerpt(P, tempo, b0, b1, work):
    total = int((tempo.sec(b1) - tempo.sec(b0) + 4) * SR)
    dry, send, levels = mixdown(P, total, lambda p: [(0, stem(p, tempo, b0, b1, b0, work))], work)
    ir = render.hall_ir(seconds=3.0, rt_low=2.2, rt_mid=1.8, rt_high=1.0)
    m = render.master(dry + render.reverb(send, ir) * 0.7)
    out, l0, l1 = render.loudness(m, target=-18.0)
    wav = os.path.join(work, 'excerpt_%d_%d.wav' % (b0, b1))
    sf.write(wav, out, SR, subtype='FLOAT')
    return wav, levels


def main():
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(
        '/tmp/claude-0/-home-user/f478e46a-5ce7-5b9b-a76e-154bb8baec5c/scratchpad/ost2', ID)
    os.makedirs(out, exist_ok=True)
    work = os.environ.get('MUSIC_WORK', os.path.join(out, 'work'))
    os.makedirs(work, exist_ok=True)
    P, tempo = build_score()
    print(TITLE, '- parts', len(P))
    smap = section_map(tempo)
    check_harmony([p for p in P if p.patch not in ('gm_drums',)])
    if '--check' in sys.argv:
        return
    if '--excerpt' in sys.argv:
        i = sys.argv.index('--excerpt')
        b0, b1 = float(sys.argv[i + 1]), float(sys.argv[i + 2])
        wav, _ = render_excerpt(P, tempo, b0, b1, work)
        render.to_mp3(wav, wav[:-4] + '.mp3')
        build.spectrogram(wav, wav[:-4] + '.png', 'excerpt')
        print(wav)
        return
    info = render_song(P, tempo, out, work)
    ogg = os.path.join(out, ID + '.ogg')
    render.to_ogg(info['wav'], ogg, q=6)
    render.to_mp3(info['wav'], os.path.join(out, ID + '.mp3'))
    build.spectrogram(info['wav'], os.path.join(out, ID + '_spectrogram.png'), TITLE + ' (Route 1, evening)')
    seam = build.seam_check(info['wav'], info['intro_s'])
    x, _ = sf.read(info['wav'])
    o = int(round(info['intro_s'] * SR))
    sf.write(os.path.join(work, 'seam.wav'), np.concatenate([x[-4 * SR:], x[o:o + 4 * SR]]), SR)
    render.to_mp3(os.path.join(work, 'seam.wav'), os.path.join(work, ID + '_loop_seam.mp3'))
    meta = dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(info['intro_s'], 6), loop_s=round(info['loop_s'], 6),
                total_s=round(info['total_s'], 3), lufs=round(info['lufs'], 2), bpm=BPM, key='E-flat major',
                seam=[round(v, 5) for v in seam])
    json.dump(meta, open(os.path.join(out, 'info.json'), 'w'), indent=1)
    print(json.dumps(meta))
    print('peak %.2f dBFS' % info['peak_db'])
    print('sections', smap)


if __name__ == '__main__':
    main()
