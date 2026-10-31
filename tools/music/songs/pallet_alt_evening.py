"""Pallet Town, evening: "Lanterns on the Pier" (original composition).

Song 3/12 of the second Pallet Town soundtrack. Plays outdoors in Pallet Town
from 6 to 9 PM, alternating with the main town theme's evening version
(G major slowed to 100 bpm, warm, soft drums): golden hour fading to dusk,
lanterns lit along the pier, families heading home for dinner.

Key B-flat major (B section turns to the relative minor, G minor; the
breakdown borrows E-flat minor for one bar), about 84 bpm with gentle
rubato, 4/4.

Form (bars; the game loops bars 1-72, the 4-bar intro plays once):
  Intro  i1-4   piano motif over harp, soft string pad
  A      1-16   piano sings the theme; harp eighths, pizzicato bass, the
                clarinet answers at the phrase ends, brushes from bar 9
  A'     17-32  clarinet takes the theme, cellos sing a countermelody,
                piano comps off the beat, horns join, full (soft) brushes
  B      33-48  G minor: cellos sing the second theme under twinkling piano,
                then the horn takes it with violins an octave up, crescendo,
                ride cymbal, back down into
  C      49-56  breakdown: clarinet alone over a piano nocturne and a string
                pad, no drums (E-flat minor colour in bar 54), ritardando
  A''    57-72  homecoming: piano in octaves with violins above, cello
                countermelody, horns, harp, ride; fades to the loop's start

Instrumentation: upright piano (lead), cellos (countermelody), French horn,
harp, string pad (violins, violas), clarinet, contrabass pizzicato as the
upright bass (VSCO 2 CE), brushed drums (GeneralUser GS "Brush" kit through
fluidsynth). Everything shares the concert hall of tools/music/render.py.

  python3 tools/music/songs/pallet_alt_evening.py --out DIR [--check-only]
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MUSIC = os.path.dirname(HERE)
sys.path.insert(0, MUSIC)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import build  # noqa: E402
import render  # noqa: E402
from score import Part, Tempo, midi  # noqa: E402
from sfz import SR  # noqa: E402

ID = 'pallet_alt_evening'
TITLE = 'Lanterns on the Pier'
BPB = 4
SF2 = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'

# extra instruments for this song (added at run time, shared files untouched)
render.ORCH['piano'] = ('VSUpright1.sfz', -9.0, 0.7, None)
render.SEAT['piano'] = dict(pan=-0.05, width=0.75, depth=0.25)
render.SEAT['drums'] = dict(pan=0.05, width=0.6, depth=0.6)

# ---------------------------------------------------------------- harmony
# name -> (bass, pad voicing low..high, chord tones (root first))
CH = {
    'Bb':      ('Bb1', ['F3', 'Bb3', 'D4'], ['Bb', 'D', 'F']),
    'Bbmaj7':  ('Bb1', ['F3', 'Bb3', 'D4'], ['Bb', 'D', 'F', 'A']),
    'Bb/D':    ('D2', ['F3', 'Bb3', 'D4'], ['Bb', 'D', 'F']),
    'Bbmaj7/D': ('D2', ['F3', 'A3', 'D4'], ['Bb', 'D', 'F', 'A']),
    'Bb/F':    ('F1', ['F3', 'Bb3', 'D4'], ['Bb', 'D', 'F']),
    'Gm':      ('G1', ['G3', 'Bb3', 'D4'], ['G', 'Bb', 'D']),
    'Gm7':     ('G1', ['F3', 'Bb3', 'D4'], ['G', 'Bb', 'D', 'F']),
    'Gm/F':    ('F1', ['G3', 'Bb3', 'D4'], ['G', 'Bb', 'D', 'F']),
    'Gm/Bb':   ('Bb1', ['G3', 'Bb3', 'D4'], ['G', 'Bb', 'D']),
    'Eb':      ('Eb2', ['G3', 'Bb3', 'Eb4'], ['Eb', 'G', 'Bb']),
    'Eb6':     ('Eb2', ['G3', 'C4', 'Eb4'], ['Eb', 'G', 'Bb', 'C']),
    'Ebmaj7':  ('Eb2', ['G3', 'Bb3', 'D4'], ['Eb', 'G', 'Bb', 'D']),
    'Ebm6':    ('Eb2', ['Gb3', 'C4', 'Eb4'], ['Eb', 'Gb', 'Bb', 'C']),
    'Cm7':     ('C2', ['G3', 'Bb3', 'Eb4'], ['C', 'Eb', 'G', 'Bb']),
    'Cm7/F':   ('F1', ['G3', 'Bb3', 'Eb4'], ['F', 'C', 'Eb', 'G', 'Bb']),
    'C7':      ('C2', ['G3', 'Bb3', 'E4'], ['C', 'E', 'G', 'Bb']),
    'F':       ('F1', ['F3', 'A3', 'C4'], ['F', 'A', 'C']),
    'F/A':     ('A1', ['F3', 'A3', 'C4'], ['F', 'A', 'C']),
    'F7':      ('F1', ['Eb3', 'A3', 'C4'], ['F', 'A', 'C', 'Eb']),
    'Fsus4':   ('F1', ['F3', 'Bb3', 'C4'], ['F', 'Bb', 'C']),
    'F7sus4':  ('F1', ['Eb3', 'Bb3', 'C4'], ['F', 'Bb', 'C', 'Eb']),
    'Dm7':     ('D2', ['F3', 'A3', 'C4'], ['D', 'F', 'A', 'C']),
    'D7':      ('D2', ['F#3', 'A3', 'C4'], ['D', 'F#', 'A', 'C']),
    'Am7b5':   ('A1', ['G3', 'C4', 'Eb4'], ['A', 'C', 'Eb', 'G']),
}

# two entries per bar (half notes)
INTRO = ['Ebmaj7', 'Ebmaj7', 'Bb/D', 'Bb/D', 'Cm7', 'Cm7', 'F7sus4', 'F7']
A_BODY = ['Bbmaj7', 'Bbmaj7', 'Gm7', 'Gm7', 'Eb', 'Eb', 'Fsus4', 'F',
          'Bb/D', 'Bb/D', 'Eb', 'Eb6', 'Cm7', 'F7', 'Bb', 'Bb',
          'Gm', 'Gm/F', 'Eb', 'Eb', 'Cm7', 'Dm7', 'Eb', 'F',
          'Bb/D', 'Eb', 'Gm7', 'C7', 'Cm7/F', 'F7']
A_SEC = A_BODY + ['Bb', 'F7sus4']          # A and A'': back to the theme
A2_SEC = A_BODY + ['Bb', 'D7']             # A': on to G minor
B_SEC = ['Gm', 'Gm', 'Eb', 'Eb', 'Cm7', 'Cm7', 'D7', 'D7',
         'Gm/Bb', 'Gm/Bb', 'Eb', 'Eb', 'Am7b5', 'D7', 'Gm', 'Gm/F',
         'Ebmaj7', 'Ebmaj7', 'F', 'F', 'Dm7', 'Dm7', 'Gm7', 'Gm7',
         'Cm7', 'Cm7', 'F7', 'F7', 'Dm7', 'Gm7', 'Cm7/F', 'F7']
C_SEC = ['Ebmaj7', 'Ebmaj7', 'Dm7', 'Dm7', 'Cm7', 'Cm7', 'Bbmaj7/D', 'Bbmaj7/D',
         'Eb', 'Ebmaj7', 'Ebm6', 'Ebm6', 'Bb/F', 'Gm7', 'Cm7/F', 'F7']

# section starts in beats (intro = beats 0-16, loop = 16-304)
S_I, S_A, S_A2, S_B, S_C, S_A3, END = 0, 16, 80, 144, 208, 240, 304
SECTIONS = [('Intro', S_I, INTRO), ('A', S_A, A_SEC), ("A'", S_A2, A2_SEC), ('B', S_B, B_SEC),
            ('C', S_C, C_SEC), ("A''", S_A3, A_SEC)]

# ---------------------------------------------------------------- melodies
MEL_A_BODY = """D5:q. C5:e Bb4:q F4:q | G4:q. A4:e Bb4:q D5:q | Eb5:q. D5:e Bb4:q G4:q | C5:h A4:h |
D5:q. C5:e Bb4:q F5:q | G5:q. F5:e Eb5:q C5:q | Eb5:q. D5:e C5:q A4:q | Bb4:h. r:q |
Bb4:q. C5:e D5:q G5:q | G5:q. F5:e Eb5:q D5:q | C5:q Eb5:q D5:q F5:q | G5:h F5:h |
Bb5:q. A5:e G5:q Eb5:q | D5:q. C5:e Bb4:q C5:q | Eb5:q. D5:e C5:q A4:q |"""
MEL_A = MEL_A_BODY + ' Bb4:h. F4:q |'
MEL_A2 = MEL_A_BODY + ' Bb4:h A4:h |'
MEL_A_END = MEL_A_BODY + ' Bb4:h. r:q |'

MEL_B1 = """G4:q Bb4:q D5:h | Eb5:q. D5:e Bb4:q G4:q | C5:q. D5:e Eb5:q G5:q | F#5:h D5:q C5:q |
Bb4:q. A4:e G4:h | G4:q Bb4:q Eb5:h | C5:q. Bb4:e A4:q F#4:q | G4:h. r:q |"""
MEL_B2 = """Bb4:q. C5:e D5:q G5:q | F5:q. Eb5:e C5:q A4:q | D5:q. C5:e D5:q F5:q | G5:h F5:h |
Eb5:q. D5:e C5:q Bb4:q | A4:q. Bb4:e C5:q Eb5:q | F5:q D5:q D5:q Bb4:q | C5:h A4:h |"""

MEL_C = """G4:h. Bb4:q | A4:h F4:h | G4:q. F4:e Eb4:q G4:q | F4:h D4:h |
Eb4:q G4:q Bb4:q D5:q | C5:h Bb4:q Gb4:q | F4:h G4:q Bb4:q | C5:h A4:h |"""

INTRO_MEL = """G5:q. F5:e D5:h | F5:q. Eb5:e D5:h | Eb5:q. D5:e C5:q G4:q | Bb4:h A4:h |"""

# cello countermelody under the theme (A' and A'')
COUNTER = """D3:h F3:q A3:q | D4:h Bb3:h | G3:h Bb3:q G3:q | Bb3:q C4:q A3:q F3:q |
F3:q Bb3:q D4:h | Eb4:h Bb3:h | G3:h Eb4:h | D4:h Bb3:q F3:q |
D4:q C4:q Bb3:h | G3:q Bb3:q Eb4:h | G3:h A3:h | Bb3:q G3:q A3:q C4:q |
D4:h Bb3:h | Bb3:q D4:q G3:q E3:q | F3:q G3:q A3:q Eb4:q |"""
COUNTER_A2 = COUNTER + ' D4:h C4:q A3:q |'     # into D7
COUNTER_A3 = COUNTER + ' D4:h. Eb4:q |'       # into F7sus4, then home

# clarinet answers at the theme's phrase ends (A)
CL_FILLS = """r:w | r:w | r:w | r:h C5:e D5:e F5:q | r:w | r:w | r:w | r:h F5:e Eb5:e D5:q |
r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:h Bb4:e C5:e Eb5:q |"""
CL_FILLS3 = """r:w | r:w | r:w | r:h C5:e D5:e F5:q | r:w | r:w | r:w | r:h F5:e Eb5:e D5:q |
r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w |"""

NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
PCS = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
       'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def nm(k):
    return NOTE[k % 12] + str(k // 12 - 1)


def tones(h):
    return [PCS[t] for t in CH[h][2]]


def octv(text, n):
    import re
    return re.sub(r'([A-G][#b]?)(-?\d)(?=[:,~])', lambda m: m.group(1) + str(int(m.group(2)) + n), text)


def bars(harm):
    return [(harm[i], harm[i + 1]) for i in range(0, len(harm), 2)]


def arp_seq(h, low, n=8, gap=0):
    """Chord tones rising from the bass (moved up to >= low)."""
    pcs = tones(h)
    b = midi(CH[h][0])
    while b < low:
        b += 12
    seq, k = [b], b + 1 + gap
    while len(seq) < n:
        need = (7 if len(seq) == 1 else 3) if gap else 1
        if k % 12 in pcs and k - seq[-1] >= need:
            seq.append(k)
        k += 1
    return seq


def harp_text(harm, low=46):
    out = []
    for h1, h2 in bars(harm):
        bar = []
        for half, h in enumerate((h1, h2)):
            s = arp_seq(h, low)
            shape = [s[4], s[5], s[3], s[2]] if half == 1 and h1 == h2 else s[:4]
            bar += ['%s:e' % nm(x) for x in shape]
        out.append(' '.join(bar) + ' |')
    return ' '.join(out)


def harp_rolled(harm, low=46):
    """Rolled half-note chords (spread set on the part)."""
    out = []
    for h1, h2 in bars(harm):
        out.append(' '.join(','.join(nm(x) for x in arp_seq(h, low)[:4]) + ':h' for h in (h1, h2)) + ' |')
    return ' '.join(out)


def nocturne(harm, low=34):
    """Piano left/right hand arpeggio in eighths, wide spacing (C section)."""
    out = []
    for h1, h2 in bars(harm):
        if h1 == h2:
            s = arp_seq(h1, low, 9, gap=1)
            shape = [s[0], s[1], s[2], s[3], s[4], s[3], s[2], s[1]]
        else:
            a, b = arp_seq(h1, low, 6, gap=1), arp_seq(h2, low, 6, gap=1)
            shape = [a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]]
        out.append(' '.join('%s:e' % nm(x) for x in shape) + ' |')
    return ' '.join(out)


def pad_text(harm, voice, shift=0):
    """One voice of the string pad, tied while it holds (across bars too)."""
    notes = [nm(midi(CH[h][1][voice]) + shift) for h in harm]
    toks = []
    for i, n in enumerate(notes):
        tie = '~' if i + 1 < len(notes) and notes[i + 1] == n else ''
        toks.append('%s:h%s' % (n, tie))
        if i % 2 == 1:
            toks.append('|')
    return ' '.join(toks)


def tenths(harm):
    """Piano left hand: bass with a tenth (or a sixth/seventh) above."""
    out = []
    for h1, h2 in bars(harm):
        bar = []
        for h in (h1, h2):
            b = midi(CH[h][0])
            while b < 34:
                b += 12
            pcs = tones(h)
            cand = [pcs[1], pcs[2] if len(pcs) > 2 else pcs[1]]
            t = next(c for c in cand if c != b % 12)
            k = b + 12
            while k % 12 != t:
                k += 1
            bar.append('%s,%s:h' % (nm(b), nm(k)))
        out.append(' '.join(bar) + ' |')
    return ' '.join(out)


def offbeat_chords(harm, skip=()):
    """Piano right hand comping: off-beat chords (pad voicing an octave up)."""
    out = []
    for i, (h1, h2) in enumerate(bars(harm)):
        bar = []
        for half, h in enumerate((h1, h2)):
            if (i, half) in skip:
                bar.append('r:h')
            else:
                v = ','.join(nm(midi(x) + 12) for x in CH[h][1])
                bar.append('r:e %s:q.' % v)
        out.append(' '.join(bar) + ' |')
    return ' '.join(out)


def quarter_chords(harm):
    out = []
    for h1, h2 in bars(harm):
        bar = []
        for h in (h1, h2):
            v = ','.join(nm(midi(x) + 12) for x in CH[h][1])
            bar.append('%s:q %s:q' % (v, v))
        out.append(' '.join(bar) + ' |')
    return ' '.join(out)


def twinkle(harm):
    """Piano high broken chords, eighths (B section)."""
    out = []
    for h1, h2 in bars(harm):
        bar = []
        for half, h in enumerate((h1, h2)):
            v = [midi(x) + 12 for x in CH[h][1]]
            shape = [v[0], v[1], v[2], v[1]] if half == 0 else [v[2] + 0, v[1], v[0], v[1]]
            bar += ['%s:e' % nm(x) for x in shape]
        out.append(' '.join(bar) + ' |')
    return ' '.join(out)


SCALE = {0, 2, 3, 5, 7, 9, 10}     # B-flat major


def bass_line(harm, nxt=None, walk=False):
    """Upright bass (pizzicato): a two-feel; `walk` adds an eighth-note
    approach into the next bar's root on the 'and' of four."""
    bl = bars(harm)
    out = []
    for i, (h1, h2) in enumerate(bl):
        r1 = midi(CH[h1][0])
        if h2 != h1:
            r2 = midi(CH[h2][0])
        else:   # same chord: the fifth below or above
            f = r1 + 7
            r2 = f if f <= 46 else r1 - 5
        while r2 < 29:
            r2 += 12
        if i + 1 < len(bl):
            target = midi(CH[bl[i + 1][0]][0])
        elif nxt:
            target = midi(CH[nxt][0])
        else:
            target = None
        if walk and target is not None:
            pcs = set(tones(h2)) | SCALE
            cands = [target - 2, target - 1, target + 1, target + 2]
            cands = [c for c in cands if c % 12 in SCALE or c % 12 in set(tones(h2))]
            app = min(cands, key=lambda c: (abs(c - r2), c))
            if app == r2:
                app = cands[0]
            out.append('%s:h %s:q. %s:e |' % (nm(r1), nm(r2), nm(app)))
        else:
            out.append('%s:h %s:h |' % (nm(r1), nm(r2)))
    return ' '.join(out)


def arco_bass(harm, octave=0):
    toks = []
    for i, h in enumerate(harm):
        toks.append('%s:h' % nm(midi(CH[h][0]) + 12 * octave))
        if i % 2 == 1:
            toks.append('|')
    return ' '.join(toks)


# ---------------------------------------------------------------- the score

def build_parts():
    P = []

    def part(n, patch, **perf):
        P.append(Part(n, patch, '', 0, BPB, **perf))
        return P[-1]

    # ---------- piano (lead) ----------
    pr = part('Piano RH', 'piano', humanize=0.008, gate=1.35, pan=-0.12)
    pl = part('Piano LH', 'piano', humanize=0.01, gate=1.05, pan=-0.02, dyn=-0.06)
    pr.add('@mp ' + INTRO_MEL, S_I)
    pl.add('@p ' + tenths(INTRO), S_I)
    pr.add('@mp ' + MEL_A, S_A)
    pl.add('@p ' + tenths(A_SEC), S_A)
    # A': comping off the beat, high echoes where the clarinet holds
    pr.add('@p ' + offbeat_chords(A2_SEC, skip={(3, 1), (7, 1), (11, 1), (15, 1)}), S_A2)
    pr.add('@p A5:e C6:e F6:q', S_A2 + 3 * 4 + 2)
    pr.add('@p D6:e Bb5:e F5:q', S_A2 + 7 * 4 + 2)
    pr.add('@p A5:e Bb5:e C6:q', S_A2 + 11 * 4 + 2)
    pr.add('@p F#5:e A5:e D6:q', S_A2 + 15 * 4 + 2)
    pl.add('@p ' + tenths(A2_SEC), S_A2)
    # B: high twinkle under the cellos, then quarter chords building
    pr.add('@p ' + twinkle(B_SEC[:16]), S_B)
    pr.add('@p< ' + quarter_chords(B_SEC[16:24]) + ' @mf ' + quarter_chords(B_SEC[24:28]) + ' @mp> '
           + quarter_chords(B_SEC[28:]) + ' @p', S_B + 32)
    pl.add('@p ' + tenths(B_SEC[:16]) + ' @mp ' + tenths(B_SEC[16:28]) + ' @p ' + tenths(B_SEC[28:]), S_B)
    # C: a nocturne in one flowing hand pair
    pn = part('Piano nocturne', 'piano', humanize=0.012, gate=2.2, pan=-0.05, dyn=-0.04)
    pn.add('@p ' + nocturne(C_SEC[:14]) + ' @pp ' + nocturne(C_SEC[14:]), S_C)
    # A'': the theme in octaves
    pr.add('@mf ' + MEL_A_BODY + ' @mp> Bb4:h. F4:q | @p', S_A3)
    po = part('Piano octave', 'piano', humanize=0.008, gate=1.3, pan=-0.12, dyn=-0.1)
    po.add('@mf ' + octv(MEL_A_BODY, -1) + ' @mp> Bb3:h. F3:q | @p', S_A3)
    pl.add('@mp ' + tenths(A_SEC[:28]) + ' @p ' + tenths(A_SEC[28:]), S_A3)

    # ---------- clarinet ----------
    cl = part('Clarinet', 'cl', legato=True, humanize=0.007, swell=0.05, gain=1.0)
    cl.add('@mp ' + CL_FILLS, S_A)
    cl.add('@mp ' + MEL_A2, S_A2)
    cl.add('@p< ' + octv(MEL_C, 0).replace('| C5:h Bb4:q Gb4:q |', '| @mp C5:h Bb4:q Gb4:q | @mp>') + ' @p', S_C)
    cl.add('@mp ' + CL_FILLS3, S_A3)

    # ---------- cellos (countermelody, B theme) ----------
    vc = part('Cellos', 'vc', legato=True, swell=0.06, humanize=0.01, cents=1, gain=0.5)
    vc.add('@pp ' + arco_bass(INTRO, 1), S_I)
    vc.add('@pp ' + arco_bass(A_SEC, 1), S_A)
    vc.add('@mp ' + COUNTER_A2, S_A2)
    vc.add('@mp ' + octv(MEL_B1, -1), S_B)
    vc.add('@mp ' + arco_bass(B_SEC[16:], 1), S_B + 32)
    vc.add('@mp ' + COUNTER_A3, S_A3)

    # ---------- horns ----------
    hn = part('Horn', 'hn', legato=True, humanize=0.012, swell=0.07, gain=-1.0)
    hn2 = part('Horn 2', 'hn', legato=True, humanize=0.012, swell=0.07, cents=-4, gain=-3.0)
    hn.add('@pp< ' + pad_text(A_SEC[24:], 2) + ' @p', S_A + 48)
    hn.add('@p ' + pad_text(A2_SEC[16:], 2), S_A2 + 32)
    hn2.add('@p ' + pad_text(A2_SEC[16:], 1), S_A2 + 32)
    hn.add('@pp ' + pad_text(B_SEC[:16], 2), S_B)
    hn.add('@mp< ' + octv(MEL_B2, -1) + ' @mf', S_B + 32)
    hn2.add('@p< ' + pad_text(B_SEC[16:], 1) + ' @mp', S_B + 32)
    hn.add('@p ' + pad_text(A_SEC[:28], 2) + ' @pp ' + pad_text(A_SEC[28:], 2), S_A3)
    hn2.add('@p ' + pad_text(A_SEC[:28], 1) + ' @pp ' + pad_text(A_SEC[28:], 1), S_A3)

    # ---------- harp ----------
    hp = part('Harp', 'harp', humanize=0.006, gate=1.4, gain=-1.0)
    hp.add('@p ' + harp_text(INTRO), S_I)
    hp.add('@p ' + harp_text(A_SEC), S_A)
    hp.add('@pp ' + harp_text(A2_SEC), S_A2)
    hpr = part('Harp rolled', 'harp', humanize=0.006, gate=1.6, spread=0.045, gain=-2.0)
    hpr.add('@p ' + harp_rolled(B_SEC[:16]), S_B)
    hp.add('@p ' + harp_text(B_SEC[16:]), S_B + 32)
    hpr.add('@pp Eb2,Bb2,G3,Bb3:w | r:w | r:w | r:w | r:w | r:w | r:w | r:h F3,C4,Eb4,A4:h |', S_C)
    hp.add('@mp ' + harp_text(A_SEC[:28]) + ' @p ' + harp_text(A_SEC[28:]), S_A3)

    # ---------- strings: pad and violins ----------
    vln1 = part('Violins I', 'vln', legato=True, swell=0.05, humanize=0.01, cents=2, gain=-1.0)
    vln2 = part('Violins II', 'vln', legato=True, swell=0.05, humanize=0.012, cents=-3, gain=-2.0)
    vla = part('Violas', 'vla', legato=True, swell=0.05, humanize=0.012, gain=-1.0)
    for h, s, d in ((INTRO, S_I, '@pp '), (A_SEC, S_A, '@pp '), (A2_SEC, S_A2, '@p '), (B_SEC, S_B, '@p '),
                    (C_SEC, S_C, '@pp '), (A_SEC, S_A3, '@p ')):
        vln2.add(d + pad_text(h, 2), s)
        vla.add(d + pad_text(h, 0), s)
    vln1.add('@pp ' + pad_text(INTRO, 1, 12), S_I)
    vln1.add('@p< ' + MEL_B2 + ' @mp', S_B + 32)
    vln1.add('@pp ' + pad_text(C_SEC, 1, 12), S_C)
    vln1.add('@mp ' + MEL_A_BODY + ' @p> Bb4:h. r:q | @pp', S_A3)

    # ---------- bass ----------
    cbp = part('Upright bass', 'cb_pizz', humanize=0.008, gain=2.0)
    cbp.add('@p ' + bass_line(INTRO, nxt=A_SEC[0]), S_I)
    cbp.add('@p ' + bass_line(A_SEC, nxt=A2_SEC[0]), S_A)
    cbp.add('@mp ' + bass_line(A2_SEC, nxt=B_SEC[0], walk=True), S_A2)
    cbp.add('@mp ' + bass_line(B_SEC, nxt=C_SEC[0], walk=True), S_B)
    cbp.add('@mp ' + bass_line(A_SEC, nxt=A_SEC[0], walk=True), S_A3)
    cba = part('Basses arco', 'cb', legato=True, swell=0.03, humanize=0.012, layers=3, gain=-3.0)
    cba.add('@pp ' + arco_bass(C_SEC, 0), S_C)

    tempo = Tempo([[0, 76], [4, 84], [S_A - 1, 83], [S_A, 84],
                   [S_A2 - 2, 84], [S_A2, 81], [S_A2 + 1, 84],
                   [S_B - 2, 84], [S_B, 82], [S_B + 1, 84],
                   [S_C - 4, 84], [S_C, 76], [S_C + 2, 80], [S_A3 - 4, 80], [S_A3, 72], [S_A3 + 1.5, 84],
                   [END - 4, 84], [END, 80]])
    return P, tempo


SEATS = {'Piano RH': 'piano', 'Piano LH': 'piano', 'Piano nocturne': 'piano', 'Piano octave': 'piano',
         'Clarinet': 'cl', 'Cellos': 'vc', 'Horn': 'hn', 'Horn 2': 'hn', 'Harp': 'harp', 'Harp rolled': 'harp',
         'Violins I': 'vln1', 'Violins II': 'vln2', 'Violas': 'vla', 'Upright bass': 'cb', 'Basses arco': 'cb'}


# ---------------------------------------------------------------- brushes

def drum_events():
    """(beat, note, velocity, dur beats) for the GS Brush kit: 36 kick,
    38 brush tap, 40 brush swirl, 44 pedal hi-hat, 51 ride, 49 crash."""
    ev = []
    rng = np.random.default_rng(84)

    def v(x):
        return int(np.clip(x + rng.normal(0, 3), 1, 127))

    def groove(b0, lvl, ride=False, swirl=True):
        if swirl:
            ev.append((b0, 40, v(46 * lvl), 1.9))
            ev.append((b0 + 2, 40, v(42 * lvl), 1.9))
        ev.append((b0, 36, v(40 * lvl), 0.5))
        ev.append((b0 + 2, 36, v(30 * lvl), 0.5))
        for k in (1, 3):
            ev.append((b0 + k, 38, v(44 * lvl), 0.25))
            ev.append((b0 + k, 44, v(34 * lvl), 0.25))
        ev.append((b0 + 3.5, 38, v(22 * lvl), 0.25))
        if ride:
            for k in (0, 1, 1.5, 2, 3, 3.5):
                acc = 1.0 if k in (1, 3) else 0.8
                ev.append((b0 + k, 51, v(44 * lvl * acc), 0.5))

    def fill(b0, lvl):
        for k, x in zip((2, 2.5, 3, 3.25, 3.5, 3.75), (.5, .6, .7, .75, .85, 1.0)):
            ev.append((b0 + k, 38, v(52 * lvl * x), 0.25))

    def bar(n):     # loop bar number (1-based) -> beat
        return S_A + (n - 1) * 4

    for n in range(9, 17):          # A: swirls and a soft kick
        b = bar(n)
        ev.append((b, 40, v(36), 1.9))
        ev.append((b + 2, 40, v(32), 1.9))
        ev.append((b, 36, v(28), 0.5))
        for k in (1, 3):
            ev.append((b + k, 44, v(26), 0.25))
    fill(bar(16), 0.6)
    for n in range(17, 33):         # A'
        groove(bar(n), 1.0)
    fill(bar(32), 0.8)
    for n in range(33, 41):         # B, cellos
        groove(bar(n), 0.9)
    for n in range(41, 49):         # B, horn: ride and crescendo, then down
        lvl = [0.95, 1.0, 1.05, 1.1, 1.15, 1.15, 1.0, 0.8][n - 41]
        groove(bar(n), lvl, ride=n < 48)
    fill(bar(47), 1.0)
    ev.append((bar(56) + 2, 40, v(30), 1.9))        # C: silence, a swirl into A''
    fill(bar(56), 0.55)
    ev.append((bar(57), 49, v(38), 2.0))
    for n in range(57, 73):         # A''
        lvl = 1.05 if n < 69 else [0.95, 0.85, 0.7, 0.55][n - 69]
        groove(bar(n), lvl, ride=n < 70)
    return ev


def fluid_stem(events, tempo, b0, b1, origin, program=40, bank=128, channel=9, tail=4.0):
    """Render events with beats in [b0, b1) through fluidsynth, time 0 =
    origin beat. Returns a stereo float32 buffer."""
    import mido
    work = WORK
    rng = np.random.default_rng(int(b0 * 7 + b1))
    t0 = tempo.sec(origin)
    msgs = []
    for b, n, vel, d in events:
        if not (b0 - 1e-6 <= b < b1 - 1e-6):
            continue
        on = tempo.sec(b) - t0 + rng.normal(0, 0.006)
        off = tempo.sec(b + d) - t0
        msgs.append((max(on, 0), 1, n, vel))
        msgs.append((off, 0, n, 0))
    end = tempo.sec(b1) - t0 + tail
    msgs.sort(key=lambda m: (m[0], m[1]))
    mid = mido.MidiFile(ticks_per_beat=480)
    tr = mido.MidiTrack()
    mid.tracks.append(tr)
    tr.append(mido.MetaMessage('set_tempo', tempo=500000))      # 1 s = 960 ticks
    tr.append(mido.Message('control_change', channel=channel, control=0, value=bank if bank < 128 else 0))
    tr.append(mido.Message('program_change', channel=channel, program=program))
    tr.append(mido.Message('control_change', channel=channel, control=7, value=110))
    last = 0
    for t, on, n, vel in msgs:
        tk = int(round(t * 960))
        tr.append(mido.Message('note_on' if on else 'note_off', channel=channel, note=n, velocity=vel, time=tk - last))
        last = tk
    tr.append(mido.MetaMessage('end_of_track', time=int(end * 960) - last))
    p = os.path.join(work, 'drums_%d_%d.mid' % (b0, b1))
    mid.save(p)
    wav = p[:-4] + '.wav'
    subprocess.run(['fluidsynth', '-ni', '-g', '0.6', '-r', str(SR), '-R', '0', '-C', '0', '-F', wav, SF2, p],
                   check=True, capture_output=True)
    x, sr = sf.read(wav, dtype='float32', always_2d=True)
    return x


# ---------------------------------------------------------------- rendering

def render_song(parts, tempo, outdir):
    """render.render_piece with an extra stem (the brushes) laid down the
    same way: intro once, the loop body four times, hall and master over the
    continuous signal, the third pass cut out as the loop."""
    loop_start, loop_end = S_A, END
    intro_s = tempo.sec(loop_start)
    loop_s = tempo.sec(loop_end) - intro_s
    intro_n = int(round(intro_s * SR))
    N = int(round(loop_s * SR))
    reps = 4
    total = intro_n + reps * N + 6 * SR
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    stems = {}

    def lay(name, intro_buf, loop_buf, seat, gain_db, sendk):
        stem = np.zeros((total, 2), np.float32)
        if intro_buf is not None:
            stem[:min(len(intro_buf), total)] += intro_buf[:total]
        for k in range(reps):
            i = intro_n + k * N
            seg = loop_buf[:max(0, total - i)]
            stem[i:i + len(seg)] += seg
        d, s = render.place(stem, seat)
        g = 10 ** (gain_db / 20)
        nonlocal dry, send
        dry += d * g
        send += s * g * sendk
        stems[name] = d * g
        print('  part %-15s peak %.3f rms %.1f dB' % (name, float(np.max(np.abs(d * g))),
                                                     20 * np.log10(np.sqrt(np.mean((d * g) ** 2)) + 1e-12)))

    for p in parts:
        seat = render.SEAT[SEATS.get(p.name, p.name)]
        seat = dict(seat, **{k: p.perf[k] for k in ('pan', 'width', 'depth') if k in p.perf})
        a = render.render_part(p, tempo, 0, loop_start, 0) if any(n[0] < loop_start for n in p.notes) else None
        lp = render.render_part(p, tempo, loop_start, loop_end, loop_start)
        lay(p.name, a, lp, seat, p.perf.get('gain', 0), p.perf.get('send', 1.0))

    ev = drum_events()
    dl = fluid_stem(ev, tempo, loop_start, loop_end, loop_start)
    dl = render.sfz.lowpass(render.sfz.highpass(dl, 45, 1), 9000, 1)
    lay('Brushes', None, dl, render.SEAT['drums'], 1.0, 0.8)

    ir = render.hall_ir()
    wet = render.reverb(send, ir)
    mix = dry + wet * 0.8
    m = render.master(mix)
    k = 2
    body = m[intro_n + k * N: intro_n + (k + 1) * N].copy()
    head = m[:intro_n].copy()
    f = int(0.06 * SR)
    w = np.linspace(0, 1, f)[:, None]
    e = intro_n + k * N
    head[-f:] = head[-f:] * (1 - w) + m[e - f:e] * w
    out = np.concatenate([head, body])
    out, l0, l1 = render.loudness(out, target=-18.0)
    wav = os.path.join(outdir, ID + '.wav')
    sf.write(wav, out, SR, subtype='FLOAT')
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1)


# ---------------------------------------------------------------- checks

def harmony_at(beat):
    for name, s, h in reversed(SECTIONS):
        if beat >= s - 1e-6:
            i = int((beat - s + 1e-6) // 2)
            return name, h[min(i, len(h) - 1)]


def check(parts):
    """Every note of the tuned parts against the chord of the moment.
    Non-chord tones are fine when short and off the strong beats (passing,
    neighbour); anything long or on a strong beat is printed, and any note
    outside the key that its chord does not contain is an error."""
    bad, soft = 0, 0
    for p in parts:
        for b, d, keys, ps in p.notes:
            sec, h = harmony_at(b)
            ct = set(tones(h))
            for k in keys:
                pc = k % 12
                if pc in ct:
                    continue
                strong = abs(b - round(b / 2) * 2) < 1e-6
                if pc not in SCALE:
                    if h == 'Ebm6' and pc == 6:
                        continue
                    print('  OUT OF KEY %-14s bar %-5s %-4s %-9s %s' % (p.name, '%.2f' % (b / 4 + 1), nm(k), h, sec))
                    bad += 1
                elif d >= 1 or (strong and d >= 0.5):
                    print('  non-chord  %-14s beat %6.2f (%s bar %d) %-4s %.2f over %s' % (
                        p.name, b, sec, (b - dict((s[0], s[1]) for s in SECTIONS)[sec]) // 4 + 1, nm(k), d, h))
                    bad += 1
                else:
                    soft += 1
    print('  harmony check: %d flagged, %d short passing/neighbour notes' % (bad, soft))
    return bad


def section_map(tempo):
    print('  section map (file time):')
    for name, s, h in SECTIONS:
        e = s + len(h) * 2
        print('    %-5s bars %5s  %6.1f - %6.1f s' % (name, '%d-%d' % ((s - S_A) // 4 + 1, (e - S_A) // 4) if s >= S_A else 'i1-4',
                                                    tempo.sec(s), tempo.sec(e)))


WORK = None


def main():
    global WORK
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(
        '/tmp/claude-0/-home-user/f478e46a-5ce7-5b9b-a76e-154bb8baec5c/scratchpad/ost2', ID)
    os.makedirs(out, exist_ok=True)
    WORK = os.environ.get('MUSIC_WORK', os.path.join(out, 'work'))
    os.makedirs(WORK, exist_ok=True)
    parts, tempo = build_parts()
    for p in parts:
        assert abs(p.end - round(p.end / 4) * 4) < 1e-6, p.name
    tuned = [p for p in parts if p.name not in ('Upright bass', 'Basses arco')]
    check(tuned)
    section_map(tempo)
    if '--check-only' in sys.argv:
        return
    info = render_song(parts, tempo, WORK)
    ogg = os.path.join(out, ID + '.ogg')
    render.to_ogg(info['wav'], ogg, q=6)
    render.to_mp3(info['wav'], os.path.join(out, ID + '.mp3'))
    build.spectrogram(info['wav'], os.path.join(out, ID + '_spectrogram.png'), 'Lanterns on the Pier (Pallet Town, evening)')
    jump, p999, mx = build.seam_check(info['wav'], info['intro_s'])
    # the seam as heard in the game: last 4 s then the loop start
    x, sr = sf.read(info['wav'])
    o = int(round(info['intro_s'] * sr))
    sf.write(os.path.join(WORK, 'seam.wav'), np.concatenate([x[-4 * sr:], x[o:o + 4 * sr]]), sr)
    pk = 20 * np.log10(np.max(np.abs(x)))
    meta = dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(info['intro_s'], 6), loop_s=round(info['loop_s'], 6),
                total_s=round(info['total_s'], 3), lufs=round(info['lufs'], 2), bpm=84, key='B-flat major',
                seam=[round(jump, 5), round(p999, 5), round(mx, 5)])
    json.dump(meta, open(os.path.join(out, 'info.json'), 'w'), indent=1)
    print('  %.1f s (intro %.2f, loop %.2f), %.2f LUFS, peak %.2f dBFS, seam jump %.4f (99.9%% step %.4f, max %.4f)' % (
        info['total_s'], info['intro_s'], info['loop_s'], info['lufs'], pk, jump, p999, mx))


if __name__ == '__main__':
    main()
