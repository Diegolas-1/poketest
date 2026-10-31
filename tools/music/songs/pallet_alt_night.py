"""Pallet Town at night: "Lighthouse Lullaby" (original composition).

A seaside lullaby in F major with a Lydian lean (the G-over-F chord and the
raised fourth over B-flat), 66 bpm, 3/4. Written for this fan game: the
village asleep, the lighthouse beam sweeping over the bay, waves and stars.
Tender and a little mysterious, never sad.

Plays: Pallet Town outdoors at night (9 PM - 5 AM), alternating with the
main town theme's night version (pallet_ost_night).

Form (bars of 3/4, the game loops bars 5-80, the intro plays once):
  Intro   1-4    the lighthouse: harp rolls and a celesta beam sweeping up
  A       5-20   celesta sings the lullaby; harp rocks, piano low, pad
  A'     21-36   solo flute takes the tune, solo violin answers each phrase,
                 celesta stars, harp in flowing eighths, strings
  B      37-52   solo violin sings the second theme (Bb Lydian, a dark
                 Db-Eb turn halfway), flute answers, cymbal swell in
  C      53-60   breakdown: the piano alone in the low-mid register with
                 the hook, harp harmonics and celesta stars, waves of pad
  A''    61-76   music box carries the tune, violin countermelody, the flute
                 joins for the second phrase, the fullest (still soft) pass
  Link   77-80   the beam sweeps again and leads back to A

Instruments: GM celesta and music box (GeneralUser GS through fluidsynth),
VSCO 2 CE harp, solo flute, solo violin (quiet samples), quiet string
ensembles (violins, violas, cellos, basses), upright piano, suspended
cymbal crescendos (very soft). One concert hall for everything; master at
-20 LUFS (night theme).

  python3 tools/music/songs/pallet_alt_night.py --out DIR [--check] [--excerpt A B]
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
MUSIC = os.path.dirname(HERE)
sys.path.insert(0, MUSIC)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import render  # noqa: E402
import build  # noqa: E402
from score import Part, Tempo, midi  # noqa: E402
from sfz import SR  # noqa: E402

ID = 'pallet_alt_night'
TITLE = 'Lighthouse Lullaby'
BPB = 3
BPM = 66
GM_SF2 = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'
CYM = os.path.join(render.LIB, 'Percussion', 'susCymb1-cresc-Median_v1.wav')

# ---------- extra instruments (added at run time, shared files untouched) ----------
render.ORCH.update({
    'vlnq': ('ViolinEnsSusVib-Quiet.sfz', -5.3, 0.7, 0.08),
    'vlaq': ('ViolaEnsSusVib-Quiet.sfz', -8.0, 0.7, 0.08),
    'vcq': ('CelloEnsSusVib-Quiet.sfz', -3.0, 0.7, 0.08),
    'cbq': ('ContrabassSusVB-Quiet.sfz', 5.3, 0.7, 0.08),
    'svln': ('SViolinVib-Quiet.sfz', -4.0, 0.45, 0.05),
    'fl': ('FluteSusVib.sfz', -3.9, 0.4, 0.04),
    'piano': ('VSUpright1.sfz', -1.0, 0.9, None),
})
render.SUSTAINED.update({'vlnq', 'vlaq', 'vcq', 'cbq', 'svln'})
render.SEAT.update({
    'celesta': dict(pan=-0.3, width=0.5, depth=0.45),
    'mbox': dict(pan=0.25, width=0.4, depth=0.5),
    'svln': dict(pan=-0.35, width=0.25, depth=0.25),
    'flr': dict(pan=0.3, width=0.3, depth=0.45),
    'piano': dict(pan=0.12, width=0.7, depth=0.4),
    'cym': dict(pan=0.3, width=0.7, depth=0.9),
})

# ---------- harmony ----------
# name -> (bass, pad voicing low..high, chord tones, tensions allowed)
CH = {
    'F':      ('F2', ['A3', 'C4', 'F4'], 'F A C', 'G E'),
    'G/F':    ('F2', ['G3', 'B3', 'D4'], 'G B D F', 'A E'),
    'Am7':    ('A2', ['G3', 'C4', 'E4'], 'A C E G', 'D'),
    'Dm7':    ('D2', ['F3', 'A3', 'C4'], 'D F A C', 'E G'),
    'Bbmaj7': ('Bb1', ['F3', 'A3', 'D4'], 'Bb D F A', 'C E'),
    'Gm7':    ('G2', ['F3', 'Bb3', 'D4'], 'G Bb D F', 'A C'),
    'Gm7/C':  ('C2', ['F3', 'Bb3', 'D4'], 'C G Bb D F', 'A'),
    'C':      ('C2', ['G3', 'C4', 'E4'], 'C E G', 'D'),
    'C7':     ('C2', ['G3', 'Bb3', 'E4'], 'C E G Bb', 'D A'),
    'C/Bb':   ('Bb1', ['G3', 'C4', 'E4'], 'C E G Bb', 'D'),
    'Dbmaj7': ('Db2', ['F3', 'Ab3', 'C4'], 'Db F Ab C', 'Eb G'),
    'Eb/Db':  ('Db2', ['G3', 'Bb3', 'Eb4'], 'Eb G Bb Db', 'F C'),
}
PCN = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
SCALE_F = {0, 2, 4, 5, 7, 9, 10}
# passing notes allowed per chord beyond F major (Lydian colours, the Db turn)
SCALE_X = {'G/F': {11}, 'Bbmaj7': {4}, 'Dbmaj7': {1, 3, 8, 7, 0, 5, 10}, 'Eb/Db': {1, 3, 8, 7, 0, 5, 10}}


def pcs(s):
    return {PCN[t] for t in s.split()}


def bars(*spec):
    """Per-beat harmony from bars: 'F' = whole bar, ('Gm7', 'C7') = 2 + 1."""
    out = []
    for b in spec:
        if isinstance(b, tuple):
            out += [b[0], b[0], b[1]]
        else:
            out += [b] * 3
    return out


INTRO = bars('F', 'G/F', 'F', 'Gm7/C')
A1 = bars('F', 'G/F', 'Am7', 'Dm7', 'Bbmaj7', 'Gm7', 'Gm7/C', 'C')
A2 = bars('F', 'G/F', 'Am7', 'Dm7', 'Bbmaj7', 'C/Bb', ('Gm7', 'C7'), 'F')
A_SEC = A1 + A2
B_SEC = bars('Bbmaj7', 'C/Bb', 'Am7', 'Dm7', 'Gm7', 'Am7', 'Bbmaj7', ('Gm7/C', 'C7'),
             'Dbmaj7', 'Eb/Db', 'Bbmaj7', 'Am7', 'Gm7', 'Dm7', 'Gm7/C', 'C7')
C_SEC = bars('F', 'G/F', 'F', 'G/F', 'Dm7', 'Bbmaj7', 'Gm7', ('Gm7/C', 'C7'))
LINK = bars('F', 'G/F', 'Bbmaj7', ('Gm7/C', 'C7'))

S_IN, S_A, S_A2, S_B, S_C, S_A3, S_L = [b * BPB for b in (0, 4, 20, 36, 52, 60, 76)]
END = 80 * BPB
HARM = INTRO + A_SEC + A_SEC + B_SEC + C_SEC + A_SEC + LINK
assert len(HARM) == END

# ---------- melodies ----------
MEL_A = """A4:q C5:q F5:q | E5:q. D5:e B4:q | C5:q. D5:e C5:q | A4:h. |
D5:q F5:q A5:q | G5:q. F5:e D5:q | D5:q F5:q G5:q | E5:h. |
A4:q C5:q F5:q | E5:q. D5:e B4:q | C5:q. E5:e A5:q | A5:q. G5:e F5:q |
F5:q E5:q D5:q | E5:h C5:q | D5:h E5:q | F5:h. |"""

MEL_B = """F5:h E5:q | G5:q. F5:e E5:q | E5:h C5:q | D5:h. |
D5:q G5:q Bb5:q | A5:q. G5:e E5:q | F5:h D5:q | F5:h E5:q |
Ab5:q. G5:e F5:q | G5:h Bb5:q | A5:h. | G5:q E5:q C5:q |
D5:q. F5:e Bb5:q | A5:h F5:q | G5:q F5:q D5:q | E5:h. |"""

R = 'r:3 | '

# violin answers in A' (the flute has the tune)
VLN_ANS = (R * 3 + 'r:q F5:e E5:e D5:q | ' + R * 3 + 'r:q G5:e E5:e C5:q | '
           + R * 5 + 'r:q G5:e C6:e Bb5:q | r:3 | r:q C6:e A5:e F5:q |')
# flute answers in B (the violin has the tune)
FL_ANS_B = (R * 3 + 'r:q A5:e G5:e F5:q | ' + R * 4 + 'C5:3 | Bb4:3 | r:q F5:e E5:e D5:q | '
            + R * 4 + 'r:q G5:e A5:e Bb5:q |')
# violin countermelody under the music box in A''
VLN_CTR = """C5:h. | B4:h. | C5:h. | D5:q. E5:e F5:q | F5:h. | D5:h. | D5:q. C5:e Bb4:q | C5:h. |
C5:h. | D5:h. | E5:h. | F5:q. E5:e D5:q | D5:h. | E5:h. | D5:h C5:q | C5:h. |"""
# piano melody in the breakdown (low-mid register)
PNO_C = """A3:q C4:q F4:q | E4:q. D4:e B3:q | A3:q C4:q F4:q | G4:h. |
F4:q. D4:e A3:q | D4:h. | Bb3:q D4:q F4:q | F4:h E4:q |"""


# ---------- helpers ----------
NOTE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']


def nm(k):
    return NOTE[k % 12] + str(k // 12 - 1)


def segs(harm, bpb=BPB):
    """(start beat, beats, chord) runs, split at bar lines."""
    out = []
    for i, h in enumerate(harm):
        if out and out[-1][2] == h and i % bpb != 0:
            out[-1][1] += 1
        else:
            out.append([i, 1, h])
    return out


def text_from(events, n_beats, bpb=BPB):
    """events [(beat, beats, token-pitch or 'r')] -> part text with bars."""
    toks, b = [], 0.0
    for st, d, p in events:
        if st > b + 1e-6:
            toks.append((b, st - b, 'r'))
        toks.append((st, d, p))
        b = st + d
    if b < n_beats - 1e-6:
        toks.append((b, n_beats - b, 'r'))
    out = []
    for st, d, p in toks:
        # split at bar lines
        while d > 1e-6:
            bar_end = (int(st // bpb + 1e-9) + 1) * bpb
            dd = min(d, bar_end - st)
            tie = '~' if (d - dd > 1e-6 and p != 'r') else ''
            out.append('%s:%g%s' % (p, dd, tie))
            st += dd
            d -= dd
            if abs(st - bar_end) < 1e-6:
                out.append('|')
    return ' '.join(out)


def chord_seq(h, low):
    bass, pad, tones, _ = CH[h]
    pc = pcs(tones)
    b = midi(bass) + 12
    while b < low:
        b += 12
    seq, k = [], b
    while len(seq) < 8:
        if k % 12 in pc:
            seq.append(k)
        k += 1
    return seq


def harp_arp(harm, low=41, kind='arp6'):
    ev = []
    for st, d, h in segs(harm):
        s = chord_seq(h, low)
        if kind == 'arp6':
            shape = [s[0], s[1], s[2], s[3], s[2], s[1]] if d == 3 else [s[0], s[1], s[2], s[3]][:int(d * 2)]
            for j, k in enumerate(shape):
                ev.append((st + 0.5 * j, 0.5, nm(k)))
        elif kind == 'arp3':
            shape = [s[0], s[2], s[3]][:d]
            for j, k in enumerate(shape):
                ev.append((st + j, 1, nm(k)))
        elif kind == 'roll':
            b = midi(CH[h][0])
            while b < 34:
                b += 12
            ev.append((st, d, ','.join(nm(k) for k in [b, s[0], s[1], s[2], s[3]])))
        elif kind == 'harm':        # high single notes, beat 1 of each chord (harmonics-like)
            ev.append((st, d, nm(s[4] + 12)))
    return text_from(ev, len(harm))


def pad(harm, voice, octave=0):
    ev = [(st, d, nm(midi(CH[h][1][voice]) + 12 * octave)) for st, d, h in segs(harm)]
    return text_from(ev, len(harm))


def bassline(harm, octave=0, lowest=36):
    ev = []
    for st, d, h in segs(harm):
        k = midi(CH[h][0]) + 12 * octave
        while k < lowest:
            k += 12
        ev.append((st, d, nm(k)))
    return text_from(ev, len(harm))


def piano(harm, kind):
    ev = []
    for st, d, h in segs(harm):
        bass = midi(CH[h][0])
        while bass < 34:
            bass += 12
        v = [midi(x) for x in CH[h][1]]
        if kind == 'block':
            ev.append((st, d, ','.join(nm(k) for k in [bass, bass + 12] + v)))
        elif kind == 'waltz':      # bass, then the chord on 2 and 3
            ev.append((st, 1, nm(bass)))
            for j in range(1, d):
                ev.append((st + j, 1, ','.join(nm(k) for k in v)))
        elif kind == 'rock':       # bass, low chord tone, upper pair
            pat = [nm(bass), nm(v[0]), ','.join(nm(k) for k in v[1:])]
            for j in range(d):
                ev.append((st + j, 1, pat[j]))
        elif kind == 'lh':         # left hand only: bass and fifth
            up = bass + 7 if (bass + 7) % 12 in pcs(CH[h][2]) else bass + 12
            ev.append((st, d, ','.join(nm(k) for k in [bass, up])))
    return text_from(ev, len(harm))


def stars(harm, every=2, phase=0, seed=3):
    """Celesta stars: two high chord tones near the end of every other bar."""
    rng = np.random.default_rng(seed)
    ev = []
    nb = len(harm) // BPB
    for bar in range(nb):
        if bar % every != phase:
            continue
        s1 = chord_seq(harm[bar * BPB + 1], 84)
        s2 = chord_seq(harm[bar * BPB + 2], 84)
        a, b = rng.choice(4, 2, replace=False)
        ev.append((bar * BPB + 1.5, 0.5, nm(s1[a])))
        ev.append((bar * BPB + 2, 1, nm(s2[b] + (12 if s2[b] < 91 else 0))))
    return text_from(ev, len(harm))


def bars_of(text, a, b):
    """Bars a..b-1 (0-based) of a part text."""
    bs = [x.strip() for x in text.split('|') if x.strip()]
    return ' | '.join(bs[a:b]) + ' |'


def octv(text, n):
    import re
    return re.sub(r'([A-G][#b]?)(-?\d)(?=[:,~])', lambda m: m.group(1) + str(int(m.group(2)) + n), text)


# ---------- the score ----------
def build_score():
    P = []

    def part(n, patch, **perf):
        P.append(Part(n, patch, '', 0, BPB, **perf))
        return P[-1]

    cel = part('Celesta', 'gm:8', humanize=0.006)
    mbox = part('Music box', 'gm:10', humanize=0.004)
    harp = part('Harp', 'harp', humanize=0.007, gate=1.6, spread=0.0)
    hroll = part('Harp rolls', 'harp', humanize=0.004, gate=1.3, spread=0.07)
    fl = part('Flute', 'fl', legato=True, humanize=0.008, swell=0.06)
    vs = part('Solo violin', 'svln', legato=True, humanize=0.01, swell=0.07)
    pno = part('Piano', 'piano', humanize=0.01, gate=1.5)
    pnm = part('Piano melody', 'piano', humanize=0.012, gate=1.25)
    v1 = part('Violins', 'vlnq', legato=True, humanize=0.012, swell=0.05, cents=2)
    va = part('Violas', 'vlaq', legato=True, humanize=0.012, swell=0.05)
    vc = part('Cellos', 'vcq', legato=True, humanize=0.012, swell=0.05, cents=-2)
    cb = part('Basses', 'cbq', legato=True, humanize=0.012, swell=0.03)

    # Intro: the lighthouse
    hroll.add('@p ' + harp_arp(INTRO, low=29, kind='roll'), S_IN)
    cel.add('@mp F6:e C6:e A5:e C6:e F6:e A6:e | G6:e D6:e B5:e D6:e G6:e B6:e | '
            'F6:e C6:e A5:e C6:e F6:e A6:e | Bb5:q D6:q F6:q |', S_IN)
    v1.add('@pp ' + pad(INTRO, 2), S_IN)
    va.add('@pp ' + pad(INTRO, 1), S_IN)
    vc.add('@pp ' + bassline(INTRO, 0), S_IN)

    # A: celesta lullaby
    cel.add('@mp ' + octv(MEL_A, 1), S_A)
    harp.add('@p ' + harp_arp(A_SEC, low=41, kind='arp3'), S_A)
    pno.add('@pp ' + piano(A_SEC, 'block'), S_A)
    vc.add('@pp ' + bassline(A_SEC, 0), S_A)
    va.add('@ppp ' + R * 8 + ' @pp ' + pad(A2, 1), S_A)
    v1.add('@ppp ' + R * 8 + ' @pp ' + pad(A2, 2), S_A)

    # A': flute sings, violin answers
    fl.add('@mp ' + MEL_A, S_A2)
    vs.add('@mp ' + VLN_ANS, S_A2)
    cel.add('@p ' + stars(A_SEC, 2, 1), S_A2)
    harp.add('@p ' + harp_arp(A_SEC, low=41, kind='arp6'), S_A2)
    pno.add('@pp ' + piano(A_SEC, 'waltz'), S_A2)
    v1.add('@pp ' + pad(A_SEC, 2), S_A2)
    va.add('@pp ' + pad(A_SEC, 1), S_A2)
    vc.add('@pp ' + pad(A_SEC, 0, -1), S_A2)
    cb.add('@pp ' + bassline(A_SEC, 0, 28), S_A2)

    # B: violin sings, flute answers
    vs.add('@mp< ' + bars_of(MEL_B, 0, 8) + ' @mf ' + bars_of(MEL_B, 8, 16) + ' @mp', S_B)
    fl.add('@p ' + FL_ANS_B, S_B)
    harp.add('@p ' + harp_arp(B_SEC, low=41, kind='arp6'), S_B)
    pno.add('@pp ' + piano(B_SEC, 'rock'), S_B)
    v1.add('@pp ' + pad(B_SEC[:24], 2) + ' @p< ' + pad(B_SEC[24:], 2) + ' @mp', S_B)
    va.add('@pp ' + pad(B_SEC[:24], 1) + ' @p< ' + pad(B_SEC[24:], 1) + ' @mp', S_B)
    vc.add('@pp ' + pad(B_SEC[:24], 0, -1) + ' @p< ' + pad(B_SEC[24:], 0, -1) + ' @mp', S_B)
    cb.add('@pp ' + bassline(B_SEC[:24], 0, 28) + ' @p< ' + bassline(B_SEC[24:], 0, 28) + ' @mp', S_B)
    cel.add('@p ' + R * 15 + ' r:1.5 C6:e E6:e G6:e |', S_B)

    # C: breakdown, piano alone with harp harmonics, stars and waves of pad
    pnm.add('@mp ' + PNO_C, S_C)
    pno.add('@p ' + piano(C_SEC, 'lh'), S_C)
    harp.add('@pp ' + harp_arp(C_SEC, kind='harm'), S_C)
    cel.add('@p ' + stars(C_SEC, 1, 0, seed=11), S_C)
    for k in range(4):     # waves: two-bar swells
        va.add('@ppp< ' + pad(C_SEC[6 * k:6 * k + 3], 1) + ' @pp> ' + pad(C_SEC[6 * k + 3:6 * k + 6], 1) + ' @ppp', S_C + 6 * k)
        vc.add('@ppp< ' + pad(C_SEC[6 * k:6 * k + 3], 0, -1) + ' @pp> ' + pad(C_SEC[6 * k + 3:6 * k + 6], 0, -1) + ' @ppp', S_C + 6 * k)
    v1.add('@ppp ' + R * 6 + '@ppp< ' + pad(C_SEC[18:], 2) + ' @pp', S_C)

    # A'': music box, violin countermelody, flute joins
    mbox.add('@mf ' + octv(MEL_A, 1), S_A3)
    vs.add('@p ' + VLN_CTR, S_A3)
    fl.add('@p ' + R * 8 + ' @mp ' + bars_of(MEL_A, 8, 16), S_A3)
    harp.add('@mp ' + harp_arp(A_SEC, low=41, kind='arp6'), S_A3)
    pno.add('@p ' + piano(A_SEC, 'waltz'), S_A3)
    v1.add('@p ' + pad(A_SEC, 2), S_A3)
    va.add('@p ' + pad(A_SEC, 1), S_A3)
    vc.add('@p ' + pad(A_SEC, 0, -1), S_A3)
    cb.add('@p ' + bassline(A_SEC, 0, 28), S_A3)

    # Link: the beam sweeps again, everything thins out toward A
    hroll.add('@p> ' + harp_arp(LINK, low=29, kind='roll') + ' @pp', S_L)
    cel.add('@p F6:e C6:e A5:e C6:e F6:e A6:e | G6:e D6:e B5:e D6:e G6:e B6:e | '
            'F6:e D6:e A5:e D6:e F6:e A6:e | Bb5:q D6:q E6:q |', S_L)
    v1.add('@p> ' + pad(LINK, 2) + ' @pp', S_L)
    va.add('@p> ' + pad(LINK, 1) + ' @pp', S_L)
    vc.add('@p> ' + bassline(LINK, 0) + ' @pp', S_L)
    pno.add('@pp ' + piano(LINK, 'lh'), S_L)

    tempo = Tempo([[0, 60], [4, 64], [S_A - 2, 63], [S_A, 63], [S_A + 2, 66],
                   [S_A2 - 3, 66], [S_A2, 64], [S_A2 + 2, 66],
                   [S_B - 3, 66], [S_B, 63], [S_B + 2, 66],
                   [S_C - 4, 66], [S_C, 61], [S_C + 2, 64], [S_A3 - 4, 64], [S_A3, 62], [S_A3 + 2, 66],
                   [S_L - 2, 66], [S_L, 64], [END - 3, 63], [END, 63]])
    swells = [S_A, S_B, S_A3, END]     # suspended cymbal crescendos peak on these beats
    return P, tempo, swells


SEATS = {
    'Celesta': 'celesta', 'Music box': 'mbox', 'Harp': 'harp', 'Harp rolls': 'harp', 'Flute': 'flr',
    'Solo violin': 'svln', 'Piano': 'piano', 'Piano melody': 'piano', 'Violins': 'vln2', 'Violas': 'vla',
    'Cellos': 'vc', 'Basses': 'cb',
}
MELODIC = ['Celesta', 'Music box', 'Flute', 'Solo violin', 'Piano melody', 'Violins', 'Violas', 'Cellos', 'Harp']


# ---------- checks ----------
def check(P):
    """Every note against the chord of its beats. A note on a downbeat or a
    beat long or more must be a chord tone or an allowed tension, and so
    must any note held into a new chord; shorter notes off the downbeat may
    pass through the scale of the moment. Pads and harp: chord tones only.
    Nothing sustained a minor second above a chord tone (a b9)."""
    bad = 0
    PADS = ('Violins', 'Violas', 'Cellos', 'Basses', 'Harp', 'Harp rolls', 'Piano')
    for p in P:
        for b, d, keys, ps in p.notes:
            i0 = int(b + 1e-6)
            i1 = int(b + d - 1e-6)
            for k in keys:
                pc = k % 12
                for i in range(i0, min(i1, END - 1) + 1):
                    h = HARM[i]
                    T, X = pcs(CH[h][2]), pcs(CH[h][3])
                    first = i == i0
                    strong = (not first) or d >= 1 or (abs(b - i0) < 1e-6 and i0 % BPB == 0)
                    if p.name in PADS:
                        ok = pc in T
                    elif strong:
                        ok = pc in T or pc in X
                    else:
                        ok = pc in T or pc in X or pc in (SCALE_F | SCALE_X.get(h, set()))
                    b9 = (d >= 1 or not first) and pc not in T and any((pc - t) % 12 == 1 for t in T)
                    if not ok or b9:
                        print('  %s %-12s bar %d beat %.2f %s over %s' % ('B9' if ok else 'CLASH', p.name, b // BPB + 1, b % BPB + 1, nm(k), h))
                        bad += 1
                        break
    return bad


def section_map(tempo):
    names = [('Intro', S_IN), ('A (celesta)', S_A), ("A' (flute + violin)", S_A2), ('B (violin, Db turn)', S_B),
             ('C (piano breakdown)', S_C), ("A'' (music box)", S_A3), ('Link', S_L), ('(loop end)', END)]
    t0 = tempo.sec(S_A)
    for n, b in names:
        t = tempo.sec(b)
        print('  bar %3d  %6.1f s  (loop +%5.1f s)  %s' % (b // BPB + 1, t, t - t0, n))


# ---------- rendering ----------
def render_gm(part, tempo, b0, b1, origin):
    """Notes of a GM part starting in [b0, b1) through fluidsynth (no
    built-in reverb or chorus). Sample 0 = origin beat."""
    import pretty_midi as pm
    prog = int(part.patch.split(':')[1])
    t_or = tempo.sec(origin)
    PAD = 0.2
    m = pm.PrettyMIDI(initial_tempo=60)
    ins = pm.Instrument(program=prog)
    hum = part.perf.get('humanize', 0.005)
    notes = [n for n in part.notes if b0 - 1e-6 <= n[0] < b1 - 1e-6]
    if not notes:
        return np.zeros((SR, 2), np.float32)
    for b, d, keys, _ in notes:
        rng = np.random.default_rng(render._seed(part.name, round(b, 4), tuple(keys)))
        on = tempo.sec(b) - t_or + rng.normal(0, hum) + PAD
        off = tempo.sec(b + d) - t_or + PAD
        lv = part.level(b) + rng.normal(0, 0.02)
        vel = int(np.clip(18 + 110 * lv, 1, 127))
        for j, k in enumerate(sorted(keys)):
            ins.notes.append(pm.Note(vel, k, max(0.0, on + 0.015 * j), max(on + 0.05, off * 0.98 + on * 0.02)))
    m.instruments.append(ins)
    with tempfile.TemporaryDirectory() as td:
        mid, wav = os.path.join(td, 'g.mid'), os.path.join(td, 'g.wav')
        m.write(mid)
        subprocess.run(['fluidsynth', '-ni', '-g', '0.6', '-r', str(SR), '-R', '0', '-C', '0', '-F', wav, GM_SF2, mid],
                       check=True, capture_output=True)
        a, sr = sf.read(wav, dtype='float32', always_2d=True)
    a = a[int(PAD * SR):]
    # fade the synth's own tail end
    return a


def cymbal(tempo, beats, origin, n):
    a, sr = sf.read(CYM, dtype='float32', always_2d=True)
    if a.shape[1] == 1:
        a = np.repeat(a, 2, 1)
    e = np.convolve(np.abs(a.mean(1)), np.ones(2205) / 2205, 'same')
    pk = int(np.argmax(e))
    out = np.zeros((n, 2), np.float32)
    t0 = tempo.sec(origin)
    for b in beats:
        i = int(round((tempo.sec(b) - t0) * SR)) - pk
        s0 = max(0, -i)
        seg = a[s0:]
        j = i + s0
        m = min(len(seg), n - j)
        if m > 0:
            out[j:j + m] += seg[:m]
    return out


def render_song(P, tempo, swells, outdir, loop_start, loop_end, target=-20.0, intro=True):
    """render.render_piece's loop layout with GM stems and the cymbal added:
    the loop body is laid down three times back to back, hall and master
    run over the continuous signal, the third pass becomes the loop."""
    intro_s = tempo.sec(loop_start)
    loop_s = tempo.sec(loop_end) - intro_s
    intro_n = int(round(intro_s * SR)) if intro else 0
    N = int(round(loop_s * SR))
    reps = 3
    total = intro_n + reps * N + 6 * SR
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    level = {}

    def lay(stem, a, lp):
        if a is not None:
            stem[:min(len(a), total)] += a[:total]
        for k in range(reps):
            i = intro_n + k * N
            seg = lp[:max(0, total - i)]
            stem[i:i + len(seg)] += seg

    for p in P:
        if not p.notes:
            continue
        seat = render.SEAT[SEATS.get(p.name, p.name)]
        stem = np.zeros((total, 2), np.float32)
        if p.patch.startswith('gm:'):
            a = render_gm(p, tempo, 0, loop_start, 0) if intro_n else None
            lp = render_gm(p, tempo, loop_start, loop_end, loop_start)
        else:
            a = render.render_part(p, tempo, 0, loop_start, 0) if intro_n else None
            lp = render.render_part(p, tempo, loop_start, loop_end, loop_start)
        lay(stem, a, lp)
        d, s = render.place(stem, seat)
        g = 10 ** (p.perf.get('gain', 0) / 20)
        dry += d * g
        send += s * g * p.perf.get('send', 1.0)
        level[p.name] = 20 * np.log10(np.sqrt(np.mean((d * g) ** 2)) + 1e-12)
        print('  part %-14s rms %6.1f dB  peak %.3f' % (p.name, level[p.name], float(np.max(np.abs(d * g)))), flush=True)
        del stem, d, s
    # very soft suspended-cymbal crescendos into sections
    cg = 10 ** (CYM_DB / 20)
    stem = np.zeros((total, 2), np.float32)
    lp = cymbal(tempo, [b for b in swells if b > loop_start], loop_start, N + 14 * SR)
    a = cymbal(tempo, [loop_start], 0, intro_n + 14 * SR) if intro_n else None
    lay(stem, a, lp)
    stem = render.sfz.lowpass(stem, 7000, 2) * cg
    d, s = render.place(stem, render.SEAT['cym'])
    dry += d
    send += s
    print('  part %-14s rms %6.1f dB' % ('Cymbal', 20 * np.log10(np.sqrt(np.mean(d ** 2)) + 1e-12)))
    del stem, d, s
    ir = render.hall_ir(seconds=4.2, rt_low=3.2, rt_mid=2.6, rt_high=1.4, seed=11)
    wet = render.reverb(send, ir)
    del send
    mix = dry + wet * 0.85
    del dry, wet
    m = render.master(mix)
    del mix
    k = 2
    body = m[intro_n + k * N: intro_n + (k + 1) * N].copy()
    if intro_n:
        head = m[:intro_n].copy()
        f = int(0.06 * SR)
        w = np.linspace(0, 1, f)[:, None]
        e = intro_n + k * N
        head[-f:] = head[-f:] * (1 - w) + m[e - f:e] * w
        out = np.concatenate([head, body])
    else:
        out = body
    out, l0, l1 = render.loudness(out, target=target)
    wav = os.path.join(outdir, ID + '.wav')
    sf.write(wav, out, SR, subtype='FLOAT')
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1, levels=level)


CYM_DB = -21.0


def main():
    args = sys.argv[1:]
    out = args[args.index('--out') + 1] if '--out' in args else os.path.join(os.getcwd(), ID)
    os.makedirs(out, exist_ok=True)
    work = os.environ.setdefault('MUSIC_WORK', os.path.join(out, 'work'))
    os.makedirs(work, exist_ok=True)
    P, tempo, swells = build_score()
    print('harmony check:')
    bad = check(P)
    print('  %d problems' % bad)
    print('section map:')
    section_map(tempo)
    if '--check' in args:
        return
    ls, le = S_A, END
    if '--excerpt' in args:
        i = args.index('--excerpt')
        ls, le = int(args[i + 1]) * BPB, int(args[i + 2]) * BPB
    info = render_song(P, tempo, swells, work, ls, le, intro=(ls == S_A))
    wav = info['wav']
    if '--excerpt' in args:
        render.to_mp3(wav, os.path.join(out, ID + '_excerpt.mp3'))
        build.spectrogram(wav, os.path.join(out, ID + '_excerpt_spectrogram.png'), TITLE + ' (excerpt)')
        print('excerpt: %.1f s, %.1f LUFS' % (info['total_s'], info['lufs']))
        return
    ogg = os.path.join(out, ID + '.ogg')
    render.to_ogg(wav, ogg, q=6)
    render.to_mp3(wav, os.path.join(out, ID + '.mp3'))
    build.spectrogram(wav, os.path.join(out, ID + '_spectrogram.png'), TITLE)
    seam = build.seam_check(wav, info['intro_s'])
    x, _ = sf.read(wav)
    peak = 20 * np.log10(np.max(np.abs(x)))
    o = int(round(info['intro_s'] * SR))
    sf.write(os.path.join(work, ID + '_seam.wav'), np.concatenate([x[-4 * SR:], x[o:o + 4 * SR]]), SR)
    render.to_mp3(os.path.join(work, ID + '_seam.wav'), os.path.join(out, ID + '_loop_seam.mp3'))
    meta = dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(info['intro_s'], 6), loop_s=round(info['loop_s'], 6),
                total_s=round(info['total_s'], 6), lufs=round(info['lufs'], 2), bpm=BPM, key='F major (Lydian colour)',
                seam=[round(v, 5) for v in seam])
    json.dump(meta, open(os.path.join(out, 'info.json'), 'w'), indent=1)
    print('%.1f s (intro %.2f s, loop %.2f s), %.1f LUFS, peak %.2f dBFS, seam jump %.4f (99.9%% step %.4f, max %.4f)' % (
        info['total_s'], info['intro_s'], info['loop_s'], info['lufs'], peak, *seam))


if __name__ == '__main__':
    main()
