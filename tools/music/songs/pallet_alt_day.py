"""Pallet Town (day, alternate): "Kites over Pallet" (original composition).

C major with a lift to D major for the last chorus, 108 bpm, 4/4. A sunny
afternoon in Pallet Town: kids flying kites on the hill, the sea sparkling.
Plays outdoors in Pallet Town from 11 AM to 6 PM, alternating with the main
town theme's day version (G major, 110 bpm, piano and band), so it keeps a
light pop-band groove with the orchestra on top for the big tunes.

Form (bars, intro counted 1-4, then the loop body 1-96):
  Intro  1-4    guitar strums and the glockenspiel hook, a drum fill
  A1     1-8    verse: piano melody over guitar, bass and a light groove
  A2     9-16   verse: violins (flute above), glockenspiel answers
  C1     17-32  chorus: violins and horns in full, tambourine, xylophone
  P1     33-36  post-chorus: the hook on xylophone and glockenspiel
  B      37-52  woodwind section (A minor colour, a Bb chord): oboe, then
                flute and clarinet in thirds over pizzicato and bassoon
  D      53-60  breakdown: piano, glockenspiel, shaker, then a snare and
                timpani build
  A3     61-68  verse: cellos and clarinet, xylophone, D7 turns the corner
  C2     69-84  last chorus in D major: tutti, horns and violins
  T      85-92  tag: the hook in D under a soaring string line
  L      93-96  link: Bbmaj7 and F/G walk back to C (soft, a tom fill)
The game loops the body (bars 1-96 of the loop); the intro plays once.

Instrumentation: GM band from GeneralUser GS through fluidsynth (drum kit:
kick, snare / side stick, hi-hats, crash, toms; tambourine and shaker;
fingered electric bass; steel-string acoustic guitar strums; grand piano)
and VSCO 2 CE orchestra through tools/music's SFZ sampler (violins, violas,
cellos, pizzicato strings, French horns, flute, oboe, clarinet, bassoon,
glockenspiel, xylophone, timpani). Everything shares one hall
(render.hall_ir, shorter than the orchestral pieces') and one master.

  python3 tools/music/songs/pallet_alt_day.py --out DIR [--check] [--bars A B]

--check only prints the section map and the harmony checks; --bars renders
an excerpt (absolute bars, intro = 0-3) without the loop layout.
"""
import argparse
import json
import os
import subprocess
import sys
import zlib

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # tools/music
sys.path.insert(0, HERE)

import build  # noqa: E402
import render  # noqa: E402
from score import Part, Tempo, midi  # noqa: E402
from sfz import SR  # noqa: E402

ID = 'pallet_alt_day'
TITLE = 'Kites over Pallet'
BPM = 108.0
BEAT = 60.0 / BPM
GUGS = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'

render.ORCH.setdefault('xylo', ('Xylophone.sfz', 5.0, 1.0, None))
render.SEAT.setdefault('xylo', dict(pan=0.4, width=0.3, depth=0.7))

# ---------------------------------------------------------------- harmony
PCN = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
       'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
QUAL = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10],
        'sus': [0, 5, 7], 'sus2': [0, 2, 7], '7sus': [0, 5, 7, 10]}
NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']


def chord(name):
    """'Dm7', 'G/B', 'Bbmaj7', 'D7sus' -> dict(root pc, bass pc, tones [pcs], core [pcs])."""
    main, _, bass = name.partition('/')
    r = main[:2] if len(main) > 1 and main[1] in '#b' else main[:1]
    q = main[len(r):]
    root = PCN[r]
    iv = QUAL[q]
    tones = [(root + i) % 12 for i in iv]
    b = PCN[bass] if bass else root
    allt = tones + ([b] if b not in tones else [])
    return dict(name=name, root=root, bass=b, tones=tones, all=allt, q=q)


def name(k):
    return NOTE[k % 12] + str(k // 12 - 1)


C_MAJ = [0, 2, 4, 5, 7, 9, 11]
D_MAJ = [(p + 2) % 12 for p in C_MAJ]

# sections: name, first bar (absolute; intro = 0-3), bars, key scale
SECTIONS = [
    ('Intro', 0, 4, C_MAJ), ('A1', 4, 8, C_MAJ), ('A2', 12, 8, C_MAJ), ('C1', 20, 16, C_MAJ),
    ('P1', 36, 4, C_MAJ), ('B', 40, 16, C_MAJ + [10, 8]), ('D', 56, 8, C_MAJ), ('A3', 64, 8, C_MAJ),
    ('C2', 72, 16, D_MAJ), ('T', 88, 8, D_MAJ), ('L', 96, 4, C_MAJ + [10]),
]
LOOP0, LOOP1 = 4, 100            # loop body bars [4, 100)
SB = {s[0]: s[1] for s in SECTIONS}

HARM = {
    'Intro': ['C Am', 'F G', 'C Am', 'F G7'],
    'A1': ['C', 'G/B', 'Am', 'F', 'C/E', 'F', 'Dm7 G', 'C'],
    'A2': ['C', 'G/B', 'Am', 'F', 'C/E', 'F', 'Dm7 G', 'Gsus G'],
    'C1': ['F', 'G', 'Em7', 'Am', 'Dm7', 'G', 'C/E F', 'Gsus G',
           'F', 'G', 'Em7', 'A7', 'Dm7', 'G7', 'Am7', 'F G'],
    'P1': ['C Am', 'F G', 'C Am', 'F G'],
    'B': ['Am', 'Em', 'F', 'C', 'Dm7', 'Am', 'Bbmaj7', 'Gsus G',
          'Am', 'Em', 'F', 'C/E', 'Dm7', 'E7', 'Fmaj7', 'Gsus G'],
    'D': ['Fmaj7', 'C/E', 'Dm7', 'C', 'Fmaj7', 'C/E', 'Dm7', 'Gsus G'],
    'A3': ['C', 'G/B', 'Am', 'F', 'C/E', 'F', 'Dm7 G', 'D7sus D7'],
    'C2': ['G', 'A', 'F#m7', 'Bm', 'Em7', 'A', 'D/F# G', 'Asus A',
           'G', 'A', 'F#m7', 'B7', 'Em7', 'A7', 'Bm7', 'G A'],
    'T': ['D Bm', 'G A', 'D Bm', 'G A', 'D Bm', 'G A', 'Em7 A', 'Dsus2'],
    'L': ['Bbmaj7', 'Bbmaj7', 'F/G', 'G7'],
}


def harm_list():
    """[(beat0, beats, chord dict)] over the whole piece."""
    out = []
    for sname, b0, n, _ in SECTIONS:
        bars = HARM[sname]
        assert len(bars) == n, sname
        for i, bar in enumerate(bars):
            cs = bar.split()
            d = 4.0 / len(cs)
            for j, c in enumerate(cs):
                out.append(((b0 + i) * 4 + j * d, d, chord(c)))
    return out


HL = harm_list()


def ch_at(beat):
    for b, d, c in HL:
        if b - 1e-6 <= beat < b + d - 1e-6:
            return c
    return HL[-1][2]


def sec_at(beat):
    bar = int(beat // 4 + 1e-9)
    for s in SECTIONS:
        if s[1] <= bar < s[1] + s[2]:
            return s
    return SECTIONS[-1]


def chords_over(b, d):
    return [c for cb, cd, c in HL if cb < b + d - 1e-6 and cb + cd > b + 1e-6]


# ---------------------------------------------------------------- melodies
def mel(text, bar, tr=0):
    """Part text -> [(beat, dur, key)] starting at absolute bar `bar`."""
    p = Part('m', 'vln', text, bar * 4, transpose=tr)
    return [(b, d, k[0]) for b, d, k, _ in p.notes]


def shift(ev, semis):
    return [(b, d, k + semis) for b, d, k in ev]


V_HEAD = """r:e G4:e C5:e D5:e E5:q. D5:e | D5:q B4:e G4:e D5:q. C5:e | C5:q A4:e C5:e E5:q. D5:e | C5:h A4:q r:q |
r:e G4:e C5:e D5:e E5:q. G5:e | A5:q. G5:e F5:q E5:e D5:e | D5:q F5:q D5:q B4:q |"""
V_END = {'A1': 'C5:h. r:q |', 'A2': 'D5:q C5:q B4:q G4:q |', 'A3': 'D5:q E5:q F#5:q A5:q |'}

CH_A = """C5:q. F5:e A5:h | G5:q. F5:e G5:q B5:q | B5:q. A5:e G5:q E5:q |"""
CH_1 = CH_A + """ A5:h. r:q | F5:q. E5:e F5:q A5:q | G5:q. F5:e D5:q B4:q | C5:q E5:q F5:q A5:q | G5:h. r:q |"""
CH_2 = CH_A + """ A5:h G5:h | F5:q. E5:e F5:q A5:q | B5:q. A5:e G5:q F5:q | E5:h G5:q E5:q | C5:q A4:q B4:q D5:q |"""

HOOK = """E5:e G5:e C6:e G5:e A5:e E5:e C6:e A5:e | F5:e A5:e C6:e A5:e G5:e B5:e D6:e B5:e |"""
HOOK2 = """E5:e G5:e C6:e G5:e A5:e E5:e C6:e A5:e | F5:e A5:e C6:e A5:e D6:q B5:q |"""

BM1 = """E5:q. D5:e C5:q B4:e A4:e | B4:h G4:q B4:q | A4:q. C5:e F5:q E5:e D5:e | E5:h. r:q |
F5:q. E5:e D5:q C5:q | E5:q. C5:e A4:h | D5:q. C5:e D5:q F5:q | G5:h F5:q D5:q |"""
BM2 = """A5:q. G5:e E5:q C5:q | B5:q. A5:e G5:q E5:q | A5:q. G5:e F5:q C5:q | E5:h G5:h |
F5:q. E5:e D5:q A5:q | G#5:h E5:q D5:q | A5:q. G5:e F5:q E5:q | G5:h. r:q |"""

BRK = """A5:q C6:q E6:h | G5:q C6:q E6:h | F5:q A5:q D6:h | E5:q G5:q C6:h |
A5:q C6:q E6:h | G5:q C6:q E6:h | F5:q A5:q D6:h | D6:h B5:h |"""

TAG = """A5:h F#5:h | B5:h A5:h | F#5:q. E5:e F#5:q D5:q | B5:h C#6:h |
D6:h. B5:q | G5:q B5:q A5:q C#6:q | B5:h C#6:h | D6:w |"""

LINK = """D5:h F5:h | A5:w | G5:h F5:h | D5:h B4:h |"""

# lines per section (concert "voice" pitch)
M = {}
M['verseA1'] = mel(V_HEAD + ' ' + V_END['A1'], SB['A1'])
M['verseA2'] = mel(V_HEAD + ' ' + V_END['A2'], SB['A2'])
M['verseA3'] = mel(V_HEAD + ' ' + V_END['A3'], SB['A3'])
M['ch1'] = mel(CH_1 + ' ' + CH_2, SB['C1'])
M['ch2'] = mel(CH_1 + ' ' + CH_2, SB['C2'], 2)
M['hookI'] = mel(HOOK + ' ' + HOOK2, SB['Intro'])
M['hookP'] = mel(HOOK + ' ' + HOOK2, SB['P1'])
M['hookT'] = mel(HOOK + ' ' + HOOK + ' ' + HOOK, SB['T'], 2)
M['bm1'] = mel(BM1, SB['B'])
M['bm2'] = mel(BM2, SB['B'] + 8)
M['brk'] = mel(BRK, SB['D'])
M['tag'] = mel(TAG, SB['T'])
M['link'] = mel(LINK, SB['L'])


# ---------------------------------------------------------------- helpers
def scale_at(beat):
    return sorted(set(sec_at(beat)[3]))


def below(line, lo=0, min_gap=3, max_gap=9):
    """A harmony line under a melody: the next chord tone 3..9 semitones
    below (split at chord changes); under a passing note the harmony holds
    its last note when that still fits the chord, else takes a chord tone."""
    out = []
    for b, d, k in line:
        segs = []
        for c in chords_over(b, d):
            cb = max(b, [x for x in HL if x[2] is c][0][0])
            segs.append((cb, c))
        for i, (sb, c) in enumerate(segs):
            se = segs[i + 1][0] if i + 1 < len(segs) else b + d
            pcs = c['tones']
            cand = [x for x in range(k - max_gap, k - min_gap + 1) if x % 12 in pcs]
            if k % 12 not in c['all'] and out and out[-1][2] % 12 in pcs and min_gap - 1 <= k - out[-1][2] <= max_gap \
                    and abs(out[-1][0] + out[-1][1] - sb) < 1e-6:
                pb, pd, ph = out[-1]
                out[-1] = (pb, pd + se - sb, ph)
                continue
            h = max(cand) if cand else max(x for x in range(k - 12, k - 1) if x % 12 in pcs)
            while h < lo:
                h += 12
            out.append((sb, se - sb, h))
    return out


def gaps(line, b0, b1, minhold=2.0, minrest=1.0):
    """Holes in a melody: the tail of long notes and rests. -> [(g0, g1)]"""
    out = []
    ev = sorted(line)
    t = b0
    for b, d, k in ev:
        if b - t >= minrest:
            out.append((t, b))
        if d >= minhold:
            out.append((b + 1.0, b + d))
        t = max(t, b + d)
    if b1 - t >= minrest:
        out.append((t, b1))
    return out


def fill_gaps(line, b0, b1, lo, hi, step=0.5, minhold=2.0, seed=0, hold_last=True):
    """Countermelody in the melody's holes: chord-tone arpeggio figures."""
    rng = np.random.default_rng(seed)
    out = []
    for gi, (g0, g1) in enumerate(gaps(line, b0, b1, minhold)):
        g0 = np.ceil(g0 / step - 1e-6) * step
        n = int(round((g1 - g0) / step))
        if n < 2:
            continue
        up = (gi + seed) % 2 == 0
        prev = None
        for j in range(n):
            t = g0 + j * step
            c = ch_at(t)
            tones = sorted(x for x in range(lo, hi + 1) if x % 12 in c['tones'])
            if prev is None:
                mid = tones[len(tones) // 3] if up else tones[-1 - len(tones) // 4]
                k = mid
            else:
                ups = [x for x in tones if x > prev]
                dns = [x for x in tones if x < prev]
                if up:
                    k = ups[0] if ups else (dns[-1] if dns else prev)
                    if not ups:
                        up = False
                else:
                    k = dns[-1] if dns else (ups[0] if ups else prev)
                    if not dns:
                        up = True
                if k % 12 not in c['tones']:
                    k = min(tones, key=lambda x: abs(x - k))
            d = step
            if hold_last and j == n - 1:
                d = step
            out.append((t, d * 0.95, k))
            prev = k
    return out


def voicing(c, lo, hi, n, prev=None, center=None):
    """Close voicing of chord c, n notes in [lo, hi], nearest to prev."""
    tones = list(c['tones'])
    if c['q'] == 'maj7' and n <= 3:
        tones = tones[:3]                               # pads leave the maj7 to the tune
    elif n == 3 and len(tones) == 4:
        tones = [tones[0], tones[1], tones[3]]          # drop the fifth
    elif n == 2 and len(tones) == 4:
        tones = [tones[0], tones[1], tones[3]]
    cands = []
    for inv in range(len(tones)):
        order = tones[inv:] + tones[:inv]
        for base in range(lo, lo + 12):
            if base % 12 != order[0]:
                continue
            v = [base]
            for i in range(1, n):
                pc = order[i % len(order)]
                x = v[-1] + 1
                while x % 12 != pc:
                    x += 1
                v.append(x)
            if v[-1] <= hi:
                cands.append(v)
            v2 = [x + 12 for x in v]
            if v2[-1] <= hi and v2[0] >= lo:
                cands.append(v2)
    if not cands:
        raise ValueError('no voicing for %s in %d-%d' % (c['name'], lo, hi))
    ok = [v for v in cands if all(b - a > 1 for a, b in zip(v, v[1:]))]
    cands = ok or cands
    if prev:
        return min(cands, key=lambda v: sum(abs(a - b) for a, b in zip(v, prev)) + 0.01 * v[0])
    ctr = center if center is not None else (lo + hi) / 2
    return min(cands, key=lambda v: abs(np.mean(v) - ctr))


def to_change(b, d, gap=0.04):
    """Cut a duration at the next chord change."""
    for cb, cd, c in HL:
        if b + 1e-6 < cb < b + d - 1e-6:
            return max(cb - b - gap, 0.1)
    return d


def fifth_over(r, c):
    """A chord tone a fourth to a sixth above the bass key r."""
    for x in (r + 7, r + 8, r + 6, r + 5, r + 9, r + 4, r + 3):
        if x % 12 in c['tones'] and x % 12 != r % 12:
            return x
    return r + 12


def bass_key(pc, lo=28, hi=40):
    k = lo + ((pc - lo) % 12)
    return k if k <= hi else k - 12


def approach(cur, nxt_pc, scale):
    """A note leading into the next root: a scale step from below or above."""
    tgt = cur + ((nxt_pc - cur) % 12)
    if tgt - cur > 6:
        tgt -= 12
    if tgt == cur:
        return cur + 7 if cur + 7 <= 47 else cur - 5
    if tgt > cur:
        c = [x for x in range(tgt - 2, tgt) if x % 12 in scale]
        return c[-1] if c else tgt - 1
    c = [x for x in range(tgt + 1, tgt + 3) if x % 12 in scale]
    return c[0] if c else tgt + 1


# ---------------------------------------------------------------- the band
def chord_spans(b0, b1):
    return [(b, d, c) for b, d, c in HL if b0 - 1e-6 <= b < b1 - 1e-6]


def bass_part():
    ev = []
    for sname, s0, n, sc in SECTIONS:
        for b, d, c in chord_spans(s0 * 4, (s0 + n) * 4):
            bar = int(b // 4) - s0
            nxt = ch_at(b + d)
            r = bass_key(c['bass'])
            five = r + 7 if (r + 7) % 12 in c['tones'] else r + 12
            app = approach(r, nxt['bass'], sc)
            v = 0.82
            if sname == 'Intro':
                if bar < 2:
                    continue
                ev += [(b, d - 0.6, r, 0.7), (b + d - 0.5, 0.45, app, 0.55)]
            elif sname in ('A1', 'A2', 'A3'):
                if d == 4:
                    ev += [(b, 1.4, r, v), (b + 1.5, 0.45, r, 0.6), (b + 2, 0.9, five, 0.7),
                           (b + 3, 0.45, r + 12, 0.62), (b + 3.5, 0.45, app, 0.6)]
                else:
                    ev += [(b, 1.4, r, v), (b + 1.5, 0.45, app, 0.6)]
            elif sname in ('C1', 'C2', 'T', 'P1'):
                last = (sname == 'T' and bar == 7)
                if last:
                    ev += [(b, 3.8, r, 0.85)]
                    continue
                pat = [0, 0, 12, 0, 0, 0, 7, 'a'] if d == 4 else [0, 0, 12, 'a']
                for j, p in enumerate(pat):
                    t = b + j * 0.5
                    if p == 'a':
                        k = app
                    elif p == 7:
                        k = five
                    else:
                        k = r + p
                    acc = 0.88 if j % 2 == 0 else 0.68
                    ev.append((t, 0.42, k, acc))
            elif sname == 'B':
                if d == 4:
                    third = [x for x in range(r + 3, r + 5) if x % 12 in c['tones']]
                    t3 = third[0] if third else five
                    ev += [(b, 2.4, r, 0.72), (b + 2.5, 0.45, five, 0.55), (b + 3, 0.45, t3, 0.6), (b + 3.5, 0.45, app, 0.55)]
                else:
                    ev += [(b, 1.4, r, 0.7), (b + 1.5, 0.45, app, 0.5)]
            elif sname == 'D':
                if bar < 4:
                    ev += [(b, d - 0.1, r, 0.6)] if bar % 2 == 0 or d < 4 else [(b, d - 0.1, r, 0.55)]
                elif bar < 6:
                    ev += [(b, 2.9, r, 0.65), (b + 3, 0.9, five, 0.55)] if d == 4 else [(b, d - 0.1, r, 0.6)]
                else:
                    for j in range(int(d * 2)):
                        ev.append((b + j * 0.5, 0.42, r if j % 4 != 3 else r + 12, 0.6 + 0.04 * j))
            elif sname == 'L':
                ev += [(b, 3.4, r, 0.6), (b + 3.5, 0.45, app, 0.5)] if bar < 3 else [(b, 1.9, r, 0.6), (b + 2, 0.9, five, 0.55), (b + 3, 0.9, approach(r, 0, sc), 0.55)]
    return ev


GT_STR = [40, 45, 50, 55, 59, 64]       # E2 A2 D3 G3 B3 E4


def gtr_shape(c):
    """A guitar voicing: per string the lowest fret 0..4 that gives a chord
    tone; strings below the bass note are muted."""
    pcs = set(c['all'])
    keys = []
    for s in GT_STR:
        f = next((f for f in range(0, 5) if (s + f) % 12 in pcs), None)
        keys.append(None if f is None else s + f)
    # the bass: lowest string whose note is the chord's bass
    bi = next((i for i, k in enumerate(keys) if k is not None and k % 12 == c['bass'] and i < 3), None)
    if bi is None:
        bi = next(i for i, k in enumerate(keys) if k is not None)
    out = [k for i, k in enumerate(keys) if i >= bi and k is not None]
    return out


GT_PAT = {
    'verse': [(0, 'D', .8), (1, 'D', .5), (1.5, 'U', .45), (2.5, 'U', .5), (3, 'D', .62), (3.5, 'U', .45)],
    'chorus': [(0, 'D', .9), (1, 'D', .62), (1.5, 'U', .55), (2, 'D', .7), (2.5, 'U', .58), (3, 'D', .7), (3.5, 'U', .55)],
    'half': [(0, 'D', .6), (2, 'D', .5), (3.5, 'U', .35)],
    'ring': [(0, 'D', .55)],
}


def guitar_part():
    ev = []
    for sname, s0, n, sc in SECTIONS:
        for bar in range(n):
            ab = (s0 + bar) * 4
            if sname in ('Intro',):
                pat = 'verse' if bar < 3 else 'chorus'
            elif sname in ('A1', 'A2'):
                pat = 'verse'
            elif sname in ('A3',):
                pat = 'chorus' if bar == 7 else 'verse'
            elif sname in ('C1', 'C2', 'P1', 'T'):
                pat = 'chorus'
                if sname == 'T' and bar == 7:
                    pat = 'ring'
            elif sname == 'B':
                pat = 'half'
            elif sname == 'D':
                if bar < 4:
                    continue
                pat = 'ring' if bar < 6 else 'verse'
            else:
                pat = 'ring' if bar < 3 else 'half'
            hits = GT_PAT[pat]
            for i, (t, dr, v) in enumerate(hits):
                nt = hits[i + 1][0] if i + 1 < len(hits) else 4.0
                c = ch_at(ab + t)
                shape = gtr_shape(c)
                if dr == 'U':
                    shape = shape[-4:][::-1]
                    gap = 0.006
                else:
                    gap = 0.011
                length = (nt - t) * 0.97
                if pat == 'ring':
                    length = 3.9
                length = to_change(ab + t, length)
                for j, k in enumerate(shape):
                    ev.append((ab + t, length, k, v * (0.92 if dr == 'D' and j < 2 else 1.0), j * gap))
    return ev


def piano_part():
    ev = []
    prev = None
    for sname, s0, n, sc in SECTIONS:
        for b, d, c in chord_spans(s0 * 4, (s0 + n) * 4):
            bar = int(b // 4) - s0
            r = bass_key(c['bass'], 36, 47)
            if sname == 'A1':
                v = voicing(c, 52, 67, 3, prev)        # left hand in the tenor
                prev = v
                for t, du, vel in ([(0, 1.4, .5), (1.5, 1.0, .42), (3, 0.9, .45)] if d == 4 else [(0, 1.4, .5), (1.5, 0.45, .4)]):
                    for k in v:
                        ev.append((b + t, du, k, vel, 0))
                ev.append((b, d - 0.1, r, .5, 0))
                continue
            v = voicing(c, 60, 77, 4 if sname in ('C1', 'C2', 'T') else 3, prev if prev and len(prev) == (4 if sname in ('C1', 'C2', 'T') else 3) else None, center=68)
            prev = v
            if sname == 'Intro':
                if bar < 2:
                    continue
                for k in v:
                    ev.append((b, d * 0.9, k, .45, 0))
                ev.append((b, d - 0.1, r, .45, 0))
            elif sname in ('A2', 'A3'):
                pat = [(0, 1.4, .5), (1.5, 1.0, .42), (3, 0.9, .45)] if d == 4 else [(0, 1.4, .5), (1.5, 0.45, .4)]
                for t, du, vel in pat:
                    for k in v:
                        ev.append((b + t, du, k, vel, 0))
                ev += [(b, 1.9, r, .5, 0), (b + 2, 1.9, fifth_over(r, c), .42, 0)] if d == 4 else [(b, d - .1, r, .5, 0)]
            elif sname in ('C1', 'C2', 'T', 'P1'):
                if sname == 'T' and bar == 7:
                    for k in v + [r, r + 12]:
                        ev.append((b, 3.9, k, .6, 0))
                    continue
                for j in range(int(d)):
                    for k in v:
                        ev.append((b + j, 0.85, k, .56 if j % 2 == 0 else .48, 0))
                ev += [(b, 1.9, r, .6, 0), (b, 1.9, r + 12, .5, 0)]
                if d == 4:
                    ev += [(b + 2, 1.9, fifth_over(r, c), .5, 0)]
            elif sname in ('B', 'D', 'L'):
                # broken chords in eighths over a held bass
                spread = sorted(set([r, fifth_over(r, c), r + 12] + [x for x in v]))
                order = [0, 1, 2, 3, 4, 3, 2, 1]
                vel = .38 if sname != 'D' else .34
                if sname == 'D' and bar >= 6:
                    vel = .42
                for j in range(int(d * 2)):
                    k = spread[order[j % 8] % len(spread)]
                    ev.append((b + j * 0.5, to_change(b + j * 0.5, 0.9), k, vel + (0.06 if j % 4 == 0 else 0), 0))
                ev.append((b, d - 0.1, r, vel + 0.05, 0))
    # A1: the melody in the right hand, in octaves
    for b, d, k in M['verseA1']:
        ev.append((b, d * 0.95, k, .62, 0))
        ev.append((b, d * 0.95, k + 12, .5, 0))
    # the link: the piano echoes the flute softly up high
    return ev


# drums (GM key numbers)
KICK, SNARE, STICK, HHC, HHP, HHO, CRASH, CRASH2, RIDE, TAMB, SHAKER, CLAP = 36, 38, 37, 42, 44, 46, 49, 57, 51, 54, 82, 39
T_HI, T_MID, T_LO, T_FLO = 50, 47, 45, 41

CRASH_AT = {'A1': False, 'A2': False, 'C1': True, 'P1': True, 'B': False, 'D': False, 'A3': True, 'C2': True, 'T': True, 'L': False}


def fill(ab, rng, strength=1.0, toms=True):
    """A fill on beats 3-4 of a bar."""
    h = []
    if toms:
        seq = [(2, SNARE, .8), (2.25, SNARE, .5), (2.5, SNARE, .75), (2.75, SNARE, .55),
               (3, T_HI, .8), (3.25, T_HI, .65), (3.5, T_MID, .8), (3.75, T_LO, .85)]
        if rng.random() < 0.5:
            seq = [(2, SNARE, .75), (2.5, SNARE, .7), (2.75, T_HI, .7), (3, T_HI, .8),
                   (3.25, T_MID, .7), (3.5, T_LO, .8), (3.75, T_FLO, .85)]
    else:
        seq = [(2, SNARE, .6), (2.5, SNARE, .5), (3, SNARE, .65), (3.25, SNARE, .55), (3.5, SNARE, .7), (3.75, SNARE, .8)]
    for t, k, v in seq:
        h.append((ab + t, k, v * strength))
    h += [(ab + 2, KICK, .7 * strength), (ab + 3, KICK, .6 * strength)]
    return h


def drum_parts():
    kit, perc = [], []
    rng = np.random.default_rng(11)
    for sname, s0, n, sc in SECTIONS:
        for bar in range(n):
            ab = (s0 + bar) * 4
            last = bar == n - 1
            k = []
            p = []
            if bar == 0 and CRASH_AT.get(sname):
                k += [(ab, CRASH, .8), (ab, KICK, .85)]
            if sname == 'Intro':
                p += [(ab + j * 0.5, SHAKER, .5 if j % 2 else .62) for j in range(8)]
                if bar >= 2:
                    k += [(ab, KICK, .7), (ab + 2, KICK, .6)] + [(ab + j * 0.5, HHC, .4 if j % 2 else .5) for j in range(4 if bar == 3 else 8)]
                if bar == 3:
                    k += fill(ab, rng, 0.8, toms=True)
            elif sname in ('A1', 'A2', 'A3', 'L'):
                full = sname == 'A3'
                if sname == 'L' and bar < 3:
                    k += [(ab, KICK, .55)] + [(ab + j * 0.5, HHC, .32 if j % 2 else .42) for j in range(8)]
                    p += [(ab + j * 0.5, SHAKER, .38 if j % 2 else .45) for j in range(8)]
                    continue
                kicks = [(0, .82), (1.5, .45), (2, .72)] + ([(3.5, .4)] if full else [])
                k += [(ab + t, KICK, v) for t, v in kicks]
                hh = [(ab + j * 0.5, HHC, (.55 if j % 2 == 0 else .38) + (.06 if full else 0)) for j in range(8)]
                if full and bar % 2 == 1:
                    hh[-1] = (ab + 3.5, HHO, .5)
                bk = SNARE if full else STICK
                bv = .78 if full else .7
                back = [(ab + 1, bk, bv), (ab + 3, bk, bv)]
                if last or (bar == 3 and sname != 'L'):
                    st = 1.0 if last else 0.55
                    hh = [h for h in hh if h[0] < ab + 2]
                    back = back[:1]
                    k += fill(ab, rng, st if sname != 'A1' else 0.7, toms=last)
                k += hh + back
                if sname in ('A2', 'A3'):
                    p += [(ab + 1, TAMB, .55), (ab + 3, TAMB, .55)]
                    if full:
                        p += [(ab + j * 0.5, TAMB, .35) for j in range(8) if j % 2 == 1]
            elif sname in ('C1', 'C2', 'P1', 'T'):
                big = sname in ('C2', 'T')
                if sname == 'T' and bar == 7:
                    k += [(ab, CRASH2, .9), (ab, KICK, .9), (ab + 2, KICK, .5)] + [(ab + j, HHP, .35) for j in range(1, 4)]
                    p += [(ab, TAMB, .7)]
                    continue
                if bar % 4 == 0 and bar > 0:
                    k += [(ab, CRASH if bar % 8 else CRASH2, .7 if not big else .8)]
                k += [(ab + t, KICK, v) for t, v in [(0, .9), (1.5, .6), (2, .82), (3.5, .45)]]
                hh = []
                for j in range(8):
                    if big and sname == 'C2' and bar >= 8:
                        hh.append((ab + j * 0.5, RIDE, .55 if j % 2 == 0 else .42))
                    else:
                        hh.append((ab + j * 0.5, HHC, .62 if j % 2 == 0 else .45))
                if not (big and bar >= 8):
                    hh[7] = (ab + 3.5, HHO, .55)
                back = [(ab + 1, SNARE, .88), (ab + 3, SNARE, .9)]
                if big:
                    back += [(ab + 1, CLAP, .5), (ab + 3, CLAP, .5)]
                p += [(ab + j * 0.5, TAMB, .62 if j in (2, 6) else .4) for j in range(8)]
                if last or bar % 8 == 7:
                    hh = [h for h in hh if h[0] < ab + 2]
                    back = back[:1] if not big else [b_ for b_ in back if b_[0] < ab + 2]
                    k += fill(ab, rng, 1.0 if last else 0.8, toms=True)
                elif bar % 4 == 3:
                    k += [(ab + 3.75, SNARE, .45)]
                k += hh + back
            elif sname == 'B':
                k += [(ab, KICK, .7), (ab + 2.5, KICK, .45)]
                if bar % 2 == 1:
                    k += [(ab + 3.5, KICK, .35)]
                k += [(ab + 2, STICK, .62)]
                k += [(ab + j * 0.5, HHC, .36 if j % 2 else .45) for j in range(8)]
                p += [(ab + j * 0.25, SHAKER, .42 if j % 4 == 0 else (.32 if j % 2 == 0 else .25)) for j in range(16)]
                if bar == 7:
                    k += [(ab + 3, T_HI, .45), (ab + 3.5, T_MID, .5)]
                if last:
                    k += fill(ab, rng, 0.6, toms=True)
            elif sname == 'D':
                p += [(ab + j * 0.5, SHAKER, .45 if j % 2 == 0 else .34) for j in range(8)]
                if bar >= 4:
                    k += [(ab, KICK, .55)]
                if bar == 5:
                    k += [(ab + 2, KICK, .45)]
                if bar == 6:
                    k += [(ab + j * 0.5, SNARE, .25 + 0.04 * j) for j in range(8)] + [(ab + j, KICK, .5) for j in range(4)]
                if bar == 7:
                    k += [(ab + j * 0.25, SNARE, .45 + 0.03 * j) for j in range(16)] + [(ab + j, KICK, .6 + .05 * j) for j in range(4)]
            kit += k
            perc += p
    return kit, perc


# ---------------------------------------------------------------- orchestra
def vpart(name_, patch, ev, dyn, **perf):
    """VSCO Part from events [(beat, dur, key)] and dynamics [(beat, mark)]."""
    from score import DYN
    p = Part(name_, patch, **perf)
    for b, d, k in sorted(ev):
        p.notes.append([b, d, [k], [name(k)]])
    for item in dyn:
        b, m = item[0], item[1]
        ramp = m.endswith('<') or m.endswith('>')
        p.dyn.append([b, DYN[m.rstrip('<>')], ramp])
    return p


def pad_lines(b0, b1, lo, hi, n, split, merge=True):
    """Sustained chord voicings per chord span, split into lines (top voice
    first). split = list of index lists, one per line."""
    lines = [[] for _ in split]
    prev = None
    for b, d, c in chord_spans(b0, b1):
        v = voicing(c, lo, hi, n, prev)
        prev = v
        v = sorted(v, reverse=True)
        for li, idx in enumerate(split):
            for i in idx:
                lines[li].append((b, d, v[i]))
    if merge:
        out = []
        for ln in lines:
            m = []
            for b, d, k in ln:
                if m and m[-1][2] == k and abs(m[-1][0] + m[-1][1] - b) < 1e-6:
                    m[-1] = (m[-1][0], m[-1][1] + d, k)
                else:
                    m.append((b, d, k))
            out.append(m)
        lines = out
    return lines


def bass_line(b0, b1, lo=36, hi=50, rhythm='h'):
    out = []
    for b, d, c in chord_spans(b0, b1):
        r = bass_key(c['bass'], lo, lo + 11)
        out.append((b, d, r))
    return out


def bars(a, n=1):
    return a * 4, (a + n) * 4


def orchestra():
    P = []
    S = SB
    # --- violins I: melody roles
    vln1 = vpart('Violins I', 'vln', M['verseA2'] + M['ch1'] + M['ch2'] + M['tag'],
                 [(S['A2'] * 4, 'mp'), (S['A2'] * 4 + 24, 'mp<'), (S['C1'] * 4, 'f'), (S['C1'] * 4 + 60, 'mf'),
                  (S['C2'] * 4, 'f'), (S['C2'] * 4 + 32, 'f<'), (S['C2'] * 4 + 60, 'ff'), (S['T'] * 4, 'ff'),
                  (S['T'] * 4 + 28, 'ff>'), (S['L'] * 4, 'f')],
                 legato=True, swell=0.05, humanize=0.01)
    P.append(vln1)
    # long high notes over the post-chorus hook and the breakdown's build
    vhi = [(S['P1'] * 4, 4, midi('E5')), (S['P1'] * 4 + 4, 2, midi('F5')), (S['P1'] * 4 + 6, 2, midi('D5')),
            (S['P1'] * 4 + 8, 4, midi('E5')), (S['P1'] * 4 + 12, 2, midi('F5')), (S['P1'] * 4 + 14, 2, midi('G5'))]
    vhi += [(S['D'] * 4 + 24, 2, midi('A4')), (S['D'] * 4 + 26, 2, midi('C5')), (S['D'] * 4 + 28, 2, midi('D5')), (S['D'] * 4 + 30, 2, midi('F5'))]
    P.append(vpart('Violins I long', 'vln', vhi, [(S['P1'] * 4, 'mf'), (S['D'] * 4 + 24, 'p<'), (S['D'] * 4 + 32, 'mf')],
                   legato=True, swell=0.08, humanize=0.01, seat='vln1'))
    # --- violins II: harmony / pads / octave melody
    P.append(vpart('Violins II mel', 'vln', shift(M['ch2'], -12) + shift(M['tag'], -12),
                   [(S['C2'] * 4, 'f'), (S['T'] * 4, 'f')], legato=True, swell=0.05, humanize=0.012, cents=-3, seat='vln2'))
    v2 = []
    v2 += below(M['ch1'], lo=60)
    a2pad = pad_lines(*bars(S['A2'], 8), 60, 74, 3, [[0]])[0]
    a3pad = pad_lines(*bars(S['A3'], 8), 62, 76, 3, [[0]])[0]
    bpad = pad_lines(*bars(S['B'] + 8, 8), 64, 76, 3, [[0]])[0]
    dpad = pad_lines(*bars(S['D'], 6), 60, 72, 3, [[0]])[0]
    lpad = pad_lines(*bars(S['L'], 4), 62, 74, 3, [[0]])[0]
    ppad = pad_lines(*bars(S['P1'], 4), 60, 72, 3, [[0]])[0]
    v2 += a2pad + a3pad + bpad + dpad + lpad + ppad
    P.append(vpart('Violins II', 'vln', v2,
                   [(S['A2'] * 4, 'p'), (S['C1'] * 4, 'mf'), (S['P1'] * 4, 'mp'), (S['B'] * 4, 'p'), (S['D'] * 4, 'pp'),
                    (S['D'] * 4 + 16, 'pp<'), (S['D'] * 4 + 24, 'mp'), (S['A3'] * 4, 'p'), (S['A3'] * 4 + 28, 'p<'),
                    (S['C2'] * 4, 'f'), (S['T'] * 4, 'f'), (S['L'] * 4, 'p')],
                   legato=True, swell=0.05, humanize=0.012, cents=-3, seat='vln2'))
    # --- violas: pads (middle voices)
    va = []
    for sec, n, lo, hi in [('A1', 8, 55, 67), ('A2', 8, 55, 67), ('C1', 16, 55, 69), ('P1', 4, 55, 67), ('B', 16, 55, 65),
                           ('D', 8, 53, 65), ('A3', 8, 55, 67), ('C2', 16, 57, 69), ('T', 8, 57, 69), ('L', 4, 55, 67)]:
        b0, b1 = bars(S[sec], n)
        if sec == 'A1':
            b0 = (S['A1'] + 4) * 4
        ls = pad_lines(b0, b1, lo, hi, 2, [[0], [1]])
        va += ls[0] + ls[1]
    P.append(vpart('Violas', 'vla', va,
                   [(S['A1'] * 4, 'pp'), (S['A2'] * 4, 'p'), (S['C1'] * 4, 'mf'), (S['P1'] * 4, 'mp'), (S['B'] * 4, 'p'),
                    (S['D'] * 4, 'pp'), (S['D'] * 4 + 20, 'pp<'), (S['D'] * 4 + 32, 'mp'), (S['A3'] * 4, 'p'),
                    (S['C2'] * 4, 'f'), (S['T'] * 4, 'f'), (S['L'] * 4, 'p')],
                   legato=True, swell=0.05, humanize=0.012))
    # --- cellos: bass line in choruses, the melody in A3
    vc = []
    for sec, n in [('C1', 16), ('P1', 4), ('C2', 16), ('T', 8), ('D', 8), ('L', 4)]:
        vc += bass_line(*bars(S[sec], n), lo=36)
    vc += shift(M['verseA3'], -12)
    P.append(vpart('Cellos', 'vc', vc,
                   [(S['C1'] * 4, 'mf'), (S['D'] * 4, 'pp'), (S['D'] * 4 + 24, 'p<'), (S['A3'] * 4, 'mf'), (S['C2'] * 4, 'f'),
                    (S['L'] * 4, 'p')],
                   legato=True, swell=0.05, humanize=0.012))
    # --- horns: chorus melody (an octave below), harmony, the tag
    hn = shift(M['ch1'], -12) + shift(M['ch2'], -12) + shift(M['tag'], -12)
    P.append(vpart('Horns', 'hn', hn, [(S['C1'] * 4, 'mf'), (S['C2'] * 4, 'f'), (S['T'] * 4, 'f')],
                   legato=True, swell=0.06, humanize=0.012, seat='hn'))
    hn2 = below(shift(M['ch1'], -12), lo=53) + below(shift(M['ch2'], -12), lo=55) + below(shift(M['tag'], -12), lo=55)
    # soft pads in the B section's second half and the link
    for sec, b0, n in [('B', S['B'] + 8, 8), ('L', S['L'], 4)]:
        ls = pad_lines(*bars(b0, n), 53, 67, 2, [[0], [1]])
        hn2 += ls[0] + ls[1]
    P.append(vpart('Horns 2', 'hn', hn2,
                   [(S['C1'] * 4, 'mp'), (S['B'] * 4, 'p'), (S['C2'] * 4, 'mf'), (S['T'] * 4, 'mf'), (S['L'] * 4, 'pp')],
                   legato=True, swell=0.06, humanize=0.014, cents=-4, seat='hn', pan=-0.2))
    # --- flute
    fl = shift(M['verseA2'], 12) + [e for e in shift(M['ch1'], 12) if e[0] >= (S['C1'] + 8) * 4] + M['bm2'] + M['ch2'] + M['tag'] + M['link']
    P.append(vpart('Flute', 'fl', fl,
                   [(S['A2'] * 4, 'p'), (S['C1'] * 4, 'mp'), (S['B'] * 4, 'mp'), (S['C2'] * 4, 'mf'), (S['T'] * 4, 'mf'),
                    (S['L'] * 4, 'p')],
                   legato=True, swell=0.04, humanize=0.01))
    # --- oboe: the B tune, then harmony in the last chorus
    ob = M['bm1'] + [e for e in below(M['ch2'], lo=62) if e[0] >= (S['C2'] + 8) * 4]
    P.append(vpart('Oboe', 'ob', ob, [(S['B'] * 4, 'mp'), (S['B'] * 4 + 24, 'mp>'), (S['B'] * 4 + 32, 'p'), (S['C2'] * 4, 'mf')],
                   legato=True, swell=0.05, humanize=0.01))
    # --- clarinet: thirds under the flute, the A3 melody
    cl = below(M['bm2'], lo=55) + shift(M['verseA3'], -12)
    P.append(vpart('Clarinet', 'cl', cl, [(S['B'] * 4 + 32, 'mp'), (S['A3'] * 4, 'mf')],
                   legato=True, swell=0.04, humanize=0.01))
    # --- bassoon: a moving line in the B section
    bn = []
    for b, d, c in chord_spans(*bars(S['B'], 16)):
        r = bass_key(c['bass'], 41, 52)
        tones = sorted(x for x in range(r, r + 13) if x % 12 in c['tones'])
        bn += [(b, 2, tones[0]), (b + 2, 1, tones[1]), (b + 3, 1, tones[2] if len(tones) > 2 else tones[1])] if d == 4 else [(b, d, tones[0])]
    P.append(vpart('Bassoon', 'bn', bn, [(S['B'] * 4, 'mp')], legato=True, swell=0.03, humanize=0.012))
    # --- pizzicato: B section and the verse A3
    vp = []
    for b, d, c in chord_spans(*bars(S['B'], 16)):
        v = voicing(c, 62, 76, 2)
        for t in ([0.5, 1.5, 2.5, 3.5] if d == 4 else [0.5, 1.5]):
            vp += [(b + t, 0.4, k) for k in v]
    for b, d, c in chord_spans(*bars(S['A3'], 8)):
        v = voicing(c, 64, 79, 2)
        for t in ([1, 3] if d == 4 else [1]):
            vp += [(b + t, 0.4, k) for k in v]
    P.append(vpart('Violins pizz', 'vln_pizz', vp, [(S['B'] * 4, 'mp'), (S['A3'] * 4, 'mp')], humanize=0.008, seat='vln1', pan=-0.4))
    cp = []
    for b, d, c in chord_spans(*bars(S['B'], 16)):
        cp += [(b, 0.8, bass_key(c['bass'], 36, 47))]
        if d == 4:
            cp += [(b + 2, 0.8, bass_key(c['bass'], 36, 47) + 7 if (bass_key(c['bass'], 36, 47) + 7) % 12 in c['tones'] else bass_key(c['bass'], 36, 47))]
    P.append(vpart('Cellos pizz', 'vc_pizz', cp, [(S['B'] * 4, 'mp')], humanize=0.008, seat='vc'))
    # --- glockenspiel: hook, countermelody in the holes, the breakdown line
    gl = list(M['hookI']) + list(M['hookP']) + list(M['brk']) + list(M['hookT'])
    gl += fill_gaps(M['verseA2'], *bars(S['A2'], 8), 79, 91, step=1.0, minhold=2.0, seed=1)
    gl += fill_gaps(M['ch1'], *bars(S['C1'], 16), 77, 93, step=0.5, minhold=2.0, seed=2)
    gl += fill_gaps(M['ch2'], *bars(S['C2'], 16), 79, 95, step=0.5, minhold=2.0, seed=4)
    gl += [(S['L'] * 4 + t, 0.9, midi(n_)) for t, n_ in [(0, 'A6'), (1, 'F6'), (2, 'D6'), (3, 'Bb5'), (4, 'A6'), (5, 'F6'), (6, 'D6'), (7, 'A5'),
                                                           (8, 'C6'), (10, 'A5'), (12, 'B5'), (14, 'G5')]]
    P.append(vpart('Glockenspiel', 'glock', gl,
                   [(0, 'mp'), (S['A2'] * 4, 'p'), (S['C1'] * 4, 'mp'), (S['P1'] * 4, 'mf'), (S['D'] * 4, 'mp'), (S['C2'] * 4, 'mf'),
                    (S['L'] * 4, 'p')], humanize=0.004, gate=2.0))
    # --- xylophone: hook in the post-chorus and the tag, countermelody in C1b and A3
    xy = list(shift(M['hookP'], -12)) + list(shift(M['hookT'], -12))
    xy += fill_gaps(M['verseA3'], *bars(S['A3'], 7), 72, 86, step=0.5, minhold=2.0, seed=3)
    P.append(vpart('Xylophone', 'xylo', xy, [(S['P1'] * 4, 'mf'), (S['A3'] * 4, 'mp'), (S['T'] * 4, 'mf')], humanize=0.004, gate=1.5))
    # --- timpani: rolls into the big moments, hits in the last chorus
    tr = [((S['D'] + 6) * 4, 4, midi('D3')), ((S['D'] + 7) * 4, 4, midi('G2')), ((S['A3'] + 7) * 4, 4, midi('D3'))]
    P.append(vpart('Timpani roll', 'timp_roll', tr, [((S['D'] + 6) * 4, 'pp<'), ((S['D'] + 8) * 4 - 0.5, 'f'), ((S['A3'] + 7) * 4, 'p<'),
                                                    ((S['A3'] + 8) * 4 - 0.5, 'mf')], humanize=0.0, gate=1.0, seat='timp'))
    th = [(S['C2'] * 4, 1, midi('G2')), ((S['C2'] + 8) * 4, 1, midi('G2')), (S['T'] * 4, 1, midi('D3')), ((S['T'] + 7) * 4, 2, midi('D3')),
          (S['C1'] * 4, 1, midi('F2')), ((S['A3']) * 4, 1, midi('C3'))]
    P.append(vpart('Timpani', 'timp', th, [(0, 'mf'), (S['C2'] * 4, 'f')], humanize=0.0, gate=1.0, seat='timp'))
    return P


SEATS = {'Violins I': 'vln1', 'Violins I long': 'vln1', 'Violins II': 'vln2', 'Violins II mel': 'vln2', 'Violas': 'vla', 'Cellos': 'vc',
         'Horns': 'hn', 'Horns 2': 'hn', 'Flute': 'fl', 'Oboe': 'ob', 'Clarinet': 'cl', 'Bassoon': 'bn',
         'Violins pizz': 'vln1', 'Cellos pizz': 'vc', 'Glockenspiel': 'glock', 'Xylophone': 'xylo',
         'Timpani roll': 'timp', 'Timpani': 'timp'}

# GM stems: name -> (program, drum?, seat, send)
GM = {
    'Drums': (0, True, dict(pan=0.0, width=0.85, depth=0.12), 0.32),
    'Percussion': (0, True, dict(pan=0.45, width=0.3, depth=0.25), 0.45),
    'Bass': (33, False, dict(pan=0.0, width=0.15, depth=0.1), 0.08),
    'Guitar': (25, False, dict(pan=-0.45, width=0.55, depth=0.25), 0.5),
    'Piano': (0, False, dict(pan=0.22, width=0.75, depth=0.25), 0.55),
}

# active-RMS mix targets (dBFS of each stem where it plays)
TARGET = {
    'Drums': -17.0, 'Percussion': -27.0, 'Bass': -18.5, 'Guitar': -24.0, 'Piano': -22.0,
    'Violins I': -19.0, 'Violins I long': -24.0, 'Violins II': -23.5, 'Violins II mel': -23.0, 'Violas': -26.5, 'Cellos': -23.5,
    'Horns': -21.0, 'Horns 2': -25.5, 'Flute': -23.0, 'Oboe': -21.5, 'Clarinet': -23.0, 'Bassoon': -26.5,
    'Violins pizz': -27.0, 'Cellos pizz': -26.0, 'Glockenspiel': -25.0, 'Xylophone': -24.5,
    'Timpani roll': -27.0, 'Timpani': -25.0,
}


def gm_events():
    kit, perc = drum_parts()
    return {
        'Drums': [(b, 0.25, k, v, 0.0) for b, k, v in kit],
        'Percussion': [(b, 0.25, k, v, 0.0) for b, k, v in perc],
        'Bass': [(b, d, k, v, 0.0) for b, d, k, v in bass_part()],
        'Guitar': guitar_part(),
        'Piano': piano_part(),
    }


# ---------------------------------------------------------------- checks
RANGES = {'vln': (55, 86), 'vla': (48, 81), 'vc': (36, 72), 'hn': (34, 77), 'fl': (60, 96), 'ob': (58, 89),
          'cl': (50, 90), 'bn': (34, 72), 'glock': (67, 96), 'xylo': (55, 96), 'vln_pizz': (55, 88),
          'vc_pizz': (36, 72), 'timp': (38, 57), 'timp_roll': (38, 57)}
HARMONY_PARTS = {'Violins II', 'Violas', 'Horns 2', 'Bassoon', 'Violins pizz', 'Cellos pizz', 'Guitar'}


def check(P, gm):
    probs, warns = [], []
    allparts = [(p.name, p.patch, [(b, d, k) for b, d, ks, _ in p.notes for k in ks]) for p in P]
    allparts += [(n, 'gm', [(e[0], e[1], e[2]) for e in ev]) for n, ev in gm.items() if n not in ('Drums', 'Percussion')]
    for pname, patch, ev in allparts:
        lo, hi = RANGES.get(patch, (0, 127))
        for b, d, k in ev:
            if not (lo <= k <= hi):
                probs.append('%s: %s out of range at bar %.2f' % (pname, name(k), b / 4))
            sc = set(sec_at(b)[3])
            c = ch_at(b)
            pc = k % 12
            if pc not in sc and pc not in c['all']:
                probs.append('%s: %s outside key and chord %s at bar %.2f' % (pname, name(k), c['name'], b / 4 + 1))
                continue
            if pname in HARMONY_PARTS or (pname in ('Piano',) and d >= 0.8) or (pname == 'Cellos' and sec_at(b)[0] != 'A3'):
                for cc in chords_over(b, max(d * 0.85, 0.05)):
                    if pc not in cc['all']:
                        probs.append('%s: %s not in %s (bar %.2f)' % (pname, name(k), cc['name'], b / 4 + 1))
                        break
            elif pname == 'Bass':
                if (b % 1.0) < 0.01 and pc not in c['all']:
                    probs.append('Bass: %s on a beat over %s (bar %.2f)' % (name(k), c['name'], b / 4 + 1))
            else:
                strong = abs(b % 2.0) < 0.01
                if strong and d >= 1.0 and pc not in c['all']:
                    warns.append('%s: %s held on a strong beat over %s (bar %.2f, %s beats)' % (pname, name(k), c['name'], b / 4 + 1, d))
                for cc in chords_over(b + 1.0, d - 1.0) if d > 1.5 else []:
                    if pc not in cc['all']:
                        warns.append('%s: %s held into %s (bar %.2f)' % (pname, name(k), cc['name'], b / 4 + 1))
    # minor-second clashes between sustained orchestral notes
    sus = [(p.name, b, d, k) for p in P if p.patch in ('vln', 'vla', 'vc', 'hn', 'fl', 'ob', 'cl', 'bn') for b, d, ks, _ in p.notes for k in ks]
    sus.sort(key=lambda x: x[1])
    for i, (n1, b1, d1, k1) in enumerate(sus):
        for n2, b2, d2, k2 in sus[i + 1:]:
            if b2 >= b1 + d1 - 0.25:
                break
            if min(b1 + d1, b2 + d2) - max(b1, b2) >= 0.75 and abs(k1 - k2) % 12 in (1, 11):
                warns.append('clash %s %s / %s %s at bar %.2f' % (n1, name(k1), n2, name(k2), max(b1, b2) / 4 + 1))
    return probs, warns


def section_map():
    lines = []
    for sname, b0, n, _ in SECTIONS:
        t0 = b0 * 4 * BEAT
        t1 = (b0 + n) * 4 * BEAT
        rel = '' if sname == 'Intro' else ' (loop bars %d-%d)' % (b0 - LOOP0 + 1, b0 - LOOP0 + n)
        lines.append('  %-6s %6.1f - %6.1f s  %2d bars%s  %s' % (sname, t0, t1, n, rel, ' | '.join(HARM[sname])))
    return '\n'.join(lines)


# ---------------------------------------------------------------- rendering
def write_midi(path, ev, program, drum, b0, b1, origin, pre=0.1, hum=0.005, seed=0):
    """Events [(beat, dur, key, vel 0..1, offset s)] starting in [b0, b1),
    time 0 = beat `origin` minus `pre` seconds."""
    import mido
    mf = mido.MidiFile(ticks_per_beat=960)
    tr = mido.MidiTrack()
    mf.tracks.append(tr)
    tr.append(mido.MetaMessage('set_tempo', tempo=int(60e6 / BPM), time=0))
    ch = 9 if drum else 0
    msgs = []
    if not drum:
        msgs.append((0.0, 0, mido.Message('program_change', channel=ch, program=program, time=0)))
        msgs.append((0.0, 0, mido.Message('control_change', channel=ch, control=64, value=0, time=0)))
    for e in ev:
        b, d, k, v, off = e
        if not (b0 - 1e-6 <= b < b1 - 1e-6):
            continue
        rng = np.random.default_rng(zlib.crc32(repr((seed, round(b, 4), k)).encode()))
        t = (b - origin) * BEAT + pre + off + rng.normal(0, hum)
        t = max(t, 0.001)
        if drum and k in (HHC, HHO, HHP, SHAKER, TAMB, RIDE) and (b * 2) % 2 > 0.5:
            t += 0.006           # a hair of lay-back on the offbeats
        dur = max(d * BEAT - (0.0 if drum else 0.0), 0.05)
        vel = int(np.clip(round((v + rng.normal(0, 0.035)) * 127), 1, 127))
        msgs.append((t, 1, mido.Message('note_on', channel=ch, note=int(k), velocity=vel, time=0)))
        msgs.append((t + dur, 0, mido.Message('note_off', channel=ch, note=int(k), velocity=0, time=0)))
    msgs.sort(key=lambda x: (x[0], x[1]))
    tick = 960 * BPM / 60.0       # ticks per second
    last = 0
    end = 0.0
    for t, _, m in msgs:
        tt = int(round(t * tick))
        m.time = max(tt - last, 0)
        last = max(tt, last)
        tr.append(m)
        end = max(end, t)
    tr.append(mido.MetaMessage('end_of_track', time=int(4.0 * tick)))
    mf.save(path)


def fluid(mid, wav, gain=0.5):
    subprocess.run(['fluidsynth', '-ni', '-q', '-g', str(gain), '-r', str(SR), '-R', '0', '-C', '0',
                    '-O', 'float', '-T', 'wav', '-F', wav, GUGS, mid], check=True, capture_output=True)
    x, sr = sf.read(wav, dtype='float32', always_2d=True)
    assert sr == SR
    return x


def gm_stem(work, nm, ev, b0, b1, origin, total, reps=None, N=None, at=0):
    prog, drum, seat, send = GM[nm]
    mid = os.path.join(work, 'gm_%s_%d.mid' % (nm, b0))
    wav = os.path.join(work, 'gm_%s_%d.wav' % (nm, b0))
    write_midi(mid, ev, prog, drum, b0, b1, origin, seed=hash(nm) % 1000 if False else len(nm))
    x = fluid(mid, wav)
    pre = int(round(0.1 * SR))
    x = x[pre:]
    stem = np.zeros((total, 2), np.float32)
    if reps is None:
        n = min(len(x), total - at)
        stem[at:at + n] += x[:n]
    else:
        for r in range(reps):
            i = at + r * N
            n = min(len(x), total - i)
            if n > 0:
                stem[i:i + n] += x[:n]
    return stem


def active_rms(x):
    m = x.mean(1)
    w = int(0.4 * SR)
    n = len(m) // w
    if n == 0:
        return -120.0
    e = np.sqrt(np.mean(m[:n * w].reshape(n, w) ** 2, 1) + 1e-20)
    db = 20 * np.log10(e)
    top = db.max()
    act = e[db > top - 24]
    return float(10 * np.log10(np.mean(act ** 2) + 1e-20))


def master_pop(x):
    import pedalboard as pb
    board = pb.Pedalboard([
        pb.HighpassFilter(cutoff_frequency_hz=30),
        pb.LowShelfFilter(cutoff_frequency_hz=120, gain_db=1.0, q=0.6),
        pb.PeakFilter(cutoff_frequency_hz=320, gain_db=-1.0, q=0.9),
        pb.PeakFilter(cutoff_frequency_hz=3200, gain_db=-0.6, q=0.8),
        pb.Compressor(threshold_db=-18, ratio=2.0, attack_ms=20, release_ms=220),
    ])
    y = board(x.T.astype(np.float32), SR).T
    pk = np.max(np.abs(y)) + 1e-9
    y = y / pk * 0.7
    drive = 1.35
    y = np.tanh(drive * y) / np.tanh(drive)
    y = y + 0.02 * (y ** 2 - np.mean(y ** 2, axis=0))
    board2 = pb.Pedalboard([
        pb.HighShelfFilter(cutoff_frequency_hz=9000, gain_db=-0.8, q=0.6),
        pb.LowpassFilter(cutoff_frequency_hz=17500),
    ])
    return board2(y.T.astype(np.float32), SR).T.astype(np.float32)


def render_song(outdir, work, excerpt=None):
    P = orchestra()
    gm = gm_events()
    tempo = Tempo([[0, BPM], [LOOP1 * 4 + 64, BPM]])
    if excerpt:
        a, b = excerpt
        b0, b1 = a * 4, b * 4
        total = int(round((b1 - b0) * BEAT * SR)) + 5 * SR
        layout = dict(intro=(b0, b1), loop=None)
    else:
        b0 = 0
    intro_n = int(round(LOOP0 * 4 * BEAT * SR))
    N = int(round((LOOP1 - LOOP0) * 4 * BEAT * SR))
    reps = 3
    if not excerpt:
        total = intro_n + reps * N + 6 * SR
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    levels = {}

    def add(nm, stem, seat, sendlv):
        a_ = active_rms(stem[:min(total, intro_n + N + 2 * SR)] if not excerpt else stem)
        g = 10 ** ((TARGET[nm] - a_) / 20) if a_ > -100 else 0.0
        levels[nm] = (a_, 20 * np.log10(g + 1e-12))
        d, s = render.place(stem * g, seat)
        dry[:] += d
        send[:] += s * sendlv

    for p in P:
        seat = dict(render.SEAT[SEATS[p.name]])
        seat.update({k: p.perf[k] for k in ('pan', 'width', 'depth') if k in p.perf})
        stem = np.zeros((total, 2), np.float32)
        if excerpt:
            x = render.render_part(p, tempo, b0, b1, b0)
            n = min(len(x), total)
            stem[:n] += x[:n]
        else:
            x = render.render_part(p, tempo, 0, LOOP0 * 4, 0)
            n = min(len(x), total)
            stem[:n] += x[:n]
            x = render.render_part(p, tempo, LOOP0 * 4, LOOP1 * 4, LOOP0 * 4)
            for r in range(reps):
                i = intro_n + r * N
                n = min(len(x), total - i)
                stem[i:i + n] += x[:n]
        if np.max(np.abs(stem)) < 1e-6:
            continue
        add(p.name, stem, seat, 1.0)
        print('  part %-16s done' % p.name, flush=True)
        del stem, x
    for nm, ev in gm.items():
        prog, drum, seat, sendlv = GM[nm]
        if excerpt:
            stem = gm_stem(work, nm, ev, b0, b1, b0, total)
        else:
            stem = gm_stem(work, nm, ev, 0, LOOP0 * 4, 0, total)
            stem += gm_stem(work, nm, ev, LOOP0 * 4, LOOP1 * 4, LOOP0 * 4, total, reps=reps, N=N, at=intro_n)
        add(nm, stem, seat, sendlv)
        print('  gm   %-16s done' % nm, flush=True)
        del stem
    for nm, (a_, g) in sorted(levels.items()):
        print('  level %-16s raw %6.1f dB  gain %+6.1f dB -> %6.1f' % (nm, a_, g, TARGET[nm]))
    ir = render.hall_ir(seconds=2.6, rt_low=1.7, rt_mid=1.45, rt_high=0.85, seed=21)
    wet = render.reverb(send, ir)
    mix = dry + wet * 0.55
    del dry, send, wet
    m = master_pop(mix)
    del mix
    if excerpt:
        out, l0, l1 = render.loudness(m)
        wav = os.path.join(outdir, '%s_excerpt_%d_%d.wav' % (ID, excerpt[0], excerpt[1]))
        sf.write(wav, out, SR, subtype='FLOAT')
        return dict(wav=wav, lufs=l1)
    k = 1
    body = m[intro_n + k * N: intro_n + (k + 1) * N].copy()
    head = m[:intro_n].copy()
    f = int(0.06 * SR)
    w = np.linspace(0, 1, f)[:, None]
    e = intro_n + k * N
    head[-f:] = head[-f:] * (1 - w) + m[e - f:e] * w
    out = np.concatenate([head, body])
    out, l0, l1 = render.loudness(out, target=-18.0, ceiling_db=-1.0)
    wav = os.path.join(work, ID + '.wav')
    sf.write(wav, out, SR, subtype='FLOAT')
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1,
                peak=float(20 * np.log10(np.max(np.abs(out)))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='/tmp/claude-0/-home-user/f478e46a-5ce7-5b9b-a76e-154bb8baec5c/scratchpad/ost2/' + ID)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--bars', nargs=2, type=int)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    work = os.environ.get('MUSIC_WORK', os.path.join(a.out, 'work'))
    os.makedirs(work, exist_ok=True)
    print(TITLE, '- section map (intro then loop body):')
    print(section_map())
    P = orchestra()
    probs, warns = check(P, gm_events())
    print('harmony problems: %d, warnings: %d' % (len(probs), len(warns)))
    for x in probs[:80]:
        print('  !', x)
    for x in warns[:80]:
        print('  ~', x)
    if a.check:
        return
    if a.bars:
        info = render_song(a.out, work, excerpt=a.bars)
        mp3 = info['wav'][:-4] + '.mp3'
        render.to_mp3(info['wav'], mp3)
        build.spectrogram(info['wav'], info['wav'][:-4] + '.png', TITLE + ' excerpt')
        print('excerpt', info)
        return
    info = render_song(a.out, work)
    ogg = os.path.join(a.out, ID + '.ogg')
    render.to_ogg(info['wav'], ogg, q=6)
    render.to_mp3(info['wav'], os.path.join(a.out, ID + '.mp3'))
    build.spectrogram(info['wav'], os.path.join(a.out, ID + '_spectrogram.png'), TITLE)
    seam = build.seam_check(info['wav'], info['intro_s'])
    x, sr = sf.read(info['wav'])
    o = int(round(info['intro_s'] * sr))
    sf.write(os.path.join(work, ID + '_seam.wav'), np.concatenate([x[-4 * sr:], x[o:o + 4 * sr]]), sr)
    render.to_mp3(os.path.join(work, ID + '_seam.wav'), os.path.join(work, ID + '_loop_seam.mp3'))
    meta = dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(info['intro_s'], 6), loop_s=round(info['loop_s'], 6),
                total_s=round(info['total_s'], 3), lufs=round(info['lufs'], 2), bpm=BPM, key='C major (last chorus D major)',
                seam=[round(v, 5) for v in seam])
    json.dump(meta, open(os.path.join(a.out, 'info.json'), 'w'), indent=1)
    print('done', meta, 'peak %.2f dBFS' % info['peak'])


if __name__ == '__main__':
    main()
