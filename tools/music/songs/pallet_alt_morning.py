"""Pallet Town (morning, alternate): "Tide Pools at Sunrise" (original composition).

D major, 96 bpm, 4/4. A fresh, gentle, optimistic morning by the sea: the
village waking up, gulls over the harbour, fishing boats heading out, kids
running down to the tide pools. Plays outdoors in Pallet Town from 7 to 11 AM
game time, taking turns with the main town theme's morning version (G major,
110 bpm), so it stays light: fingerpicked nylon guitar, woodwinds, pizzicato,
harp and glockenspiel, shaker and brushes, a soft kick, no heavy drums.

Form (bars, 4 beats each; the intro plays once, the game loops bars 3-82):
  Intro   1-2    guitar alone, harp rising, a glockenspiel spark
  A       3-18   flute sings the theme, the oboe answers each phrase;
                 guitar, cello pizzicato, shaker; clarinet warms bars 11-18
  A'      19-34  the clarinet takes the theme, flute descant above, new oboe
                 answers, harp rolls, violin pizzicato off-beats, soft kick,
                 basses join; a flute run on D7 turns toward G
  B       35-50  warm string pad: the oboe sings a new tune over
                 Gmaj7 A F#m7 Bm, the violins take it up (B7, Gm6 colour),
                 harp in quarter notes, brushes enter, a swell into ...
  Bridge  51-62  breakdown: upright piano alone over a D pedal with the
                 theme's first motif (D C/D G/D, gull calls in the flute),
                 the clarinet low with D C/D G/D Gm/D, then a build
                 (Em7 F#m7 Gmaj7 A7) with strings, harp glissando, shaker
  A''     63-78  everyone: violins have the theme, flute descant, harp
                 eighths, glockenspiel on the peaks, brushes, kick, shaker
  Link    79-82  thinning out: clarinet and guitar lead back to A

Instrumentation: VSCO 2 CE (flute, oboe, clarinet, violins I/II, violas,
cellos and basses arco + pizzicato, harp, glockenspiel, upright piano)
through tools/music's sampler; GeneralUser GS through fluidsynth for the
nylon guitar and the brush kit (shaker, brush taps and swirls, soft kick,
triangle). All stems share render.py's concert hall and master.

  python3 tools/music/songs/pallet_alt_morning.py --out DIR [--excerpt B0 B1]

Writes DIR/pallet_alt_morning.{ogg,mp3}, _spectrogram.png, info.json.
"""
import argparse
import json
import os
import subprocess
import sys
import zlib

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import build  # noqa: E402
import render  # noqa: E402
from score import Part, Tempo, midi  # noqa: E402
from sfz import SR  # noqa: E402

ID = 'pallet_alt_morning'
TITLE = 'Tide Pools at Sunrise'
BPB = 4
BPM = 96
GUGS = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'

render.ORCH['piano'] = ('UprightPiano.sfz', 0.0, 0.9, None)
render.SEAT['piano'] = dict(pan=-0.2, width=0.6, depth=0.4)
render.SEAT['gtr'] = dict(pan=0.3, width=0.55, depth=0.3)
render.SEAT['perc'] = dict(pan=0.05, width=0.7, depth=0.6)

NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def nm(k):
    return NOTE[k % 12] + str(k // 12 - 1)


def pc(n):
    return midi(n + '4') % 12


# chord -> (bass, guitar upper voicing, pad voicing low..high, chord tones, allowed tensions)
CH = {
    'D':       ('D2', 'A3 D4 F#4 A4', 'A3 D4 F#4', 'D F# A', 'E B'),
    'Gmaj7/D': ('D2', 'G3 B3 D4 F#4', 'B3 D4 F#4', 'G B D F#', 'A E'),
    'Gmaj7':   ('G2', 'D3 B3 D4 F#4', 'B3 D4 F#4', 'G B D F#', 'A E'),
    'A/C#':    ('C#2', 'A3 C#4 E4 A4', 'A3 C#4 E4', 'A C# E', 'B'),
    'Bm7':     ('B1', 'F#3 A3 D4 F#4', 'A3 D4 F#4', 'B D F# A', 'C# E'),
    'Em7':     ('E2', 'B3 D4 E4 G4', 'B3 D4 G4', 'E G B D', 'F# A'),
    'Asus4':   ('A1', 'A3 D4 E4 A4', 'A3 D4 E4', 'A D E', 'B'),
    'A':       ('A1', 'A3 C#4 E4 A4', 'A3 C#4 E4', 'A C# E', 'B'),
    'A7':      ('A1', 'G3 C#4 E4 A4', 'G3 C#4 E4', 'A C# E G', 'B'),
    'A7sus':   ('A1', 'G3 D4 E4 A4', 'G3 D4 E4', 'A D E G', 'B'),
    'F#m7':    ('F#2', 'A3 C#4 E4 F#4', 'A3 C#4 E4', 'F# A C# E', 'B'),
    'D7':      ('D2', 'A3 C4 F#4 A4', 'A3 C4 F#4', 'D F# A C', 'E'),
    'A/G':     ('G2', 'A3 C#4 E4 A4', 'A3 C#4 E4', 'A C# E G', 'B'),
    'F#7':     ('F#2', 'A#3 C#4 E4 F#4', 'A#3 C#4 E4', 'F# A# C# E', ''),
    'Bm/A':    ('A1', 'B3 D4 F#4 B4', 'B3 D4 F#4', 'B D F# A', 'C# E'),
    'B7':      ('B1', 'A3 D#4 F#4 B4', 'A3 D#4 F#4', 'B D# F# A', 'C#'),
    'Gm6':     ('G2', 'A#3 D4 E4 G4', 'A#3 D4 E4', 'G A# D E', 'A'),
    'D/A':     ('A1', 'A3 D4 F#4 A4', 'A3 D4 F#4', 'D F# A', 'E B'),
    'C/D':     ('D2', 'G3 C4 E4 G4', 'G3 C4 E4', 'C E G D', 'A'),
    'G/D':     ('D2', 'G3 B3 D4 G4', 'G3 B3 D4', 'G B D', 'A E'),
    'Gm/D':    ('D2', 'G3 A#3 D4 G4', 'G3 A#3 D4', 'G A# D', 'A'),
}


def bar(*chs):
    """One bar of harmony as two half-bar entries."""
    return list(chs) if len(chs) == 2 else [chs[0], chs[0]]


INTRO = bar('Gmaj7') + bar('A7sus', 'A7')
A_SEC = (bar('D') + bar('Gmaj7/D') + bar('D') + bar('A/C#') + bar('Bm7') + bar('Em7') + bar('Gmaj7') + bar('Asus4', 'A')
         + bar('D') + bar('Gmaj7/D') + bar('F#m7') + bar('Bm7') + bar('Em7') + bar('A7') + bar('D') + bar('D'))
A2_SEC = A_SEC[:-2] + bar('D7')
B_SEC = (bar('Gmaj7') + bar('A') + bar('F#m7') + bar('Bm7') + bar('Em7') + bar('F#7') + bar('Bm7') + bar('Bm/A')
         + bar('Gmaj7') + bar('A/G') + bar('F#m7') + bar('B7') + bar('Em7') + bar('Gm6') + bar('D/A') + bar('A7sus', 'A7'))
BR_SEC = (bar('D') + bar('C/D') + bar('G/D') + bar('D') + bar('D') + bar('C/D') + bar('G/D') + bar('Gm/D')
          + bar('Em7') + bar('F#m7') + bar('Gmaj7') + bar('A7sus', 'A7'))
A3_SEC = A_SEC
LINK = bar('D') + bar('Gmaj7/D') + bar('Em7') + bar('A7sus', 'A7')
HARM = INTRO + A_SEC + A2_SEC + B_SEC + BR_SEC + A3_SEC + LINK

S_INTRO = 0
S_A = 8
S_A2 = S_A + 64
S_B = S_A2 + 64
S_BR = S_B + 64
S_A3 = S_BR + 48
S_LINK = S_A3 + 64
END = S_LINK + 16
SECTIONS = [('Intro', S_INTRO), ('A', S_A), ("A'", S_A2), ('B', S_B), ('Bridge', S_BR), ("A''", S_A3), ('Link', S_LINK), ('end', END)]

# ---------------------------------------------------------------- melodies
MEL_A1 = """A4:q. D5:e F#5:q E5:e D5:e | G5:q. F#5:e D5:h | r:q A4:e B4:e D5:q F#5:q | E5:h. r:q |
D5:q. F#5:e A5:q F#5:q | G5:q. F#5:e E5:q D5:q | B4:q D5:q F#5:q. E5:e | D5:h C#5:q r:q |"""
MEL_A2 = """A4:q. D5:e F#5:q E5:e D5:e | G5:q. A5:e B5:h | A5:q. F#5:e E5:q C#5:q | D5:h. r:q |
B4:q E5:q G5:q. F#5:e | E5:q. D5:e C#5:q A4:q | D5:w | r:w |"""
MEL_A = MEL_A1 + ' ' + MEL_A2

OB_ANS_A = """r:w | r:w | r:w | r:h C#5:e B4:e A4:q | r:w | r:w | r:w | r:h. C#5:e B4:e |
r:w | r:w | r:w | r:h F#5:e E5:e D5:q | r:w | r:w | r:w | r:q D5:e E5:e F#5:q E5:q |"""
OB_ANS_A2 = """r:w | r:w | r:w | r:h A4:e C#5:e E5:q | r:w | r:w | r:w | r:h. E5:e C#5:e |
r:w | r:w | r:w | r:h B4:e C#5:e D5:q | r:w | r:w | r:w | r:w |"""

FL_DESC = """F#5:w | G5:h F#5:h | A5:w | E5:h r:h | D6:w | B5:h D6:h | D6:h B5:h | A5:h. r:q |
A5:w | B5:h D6:h | C#6:w | B5:h. r:q | B5:w | C#6:h A5:h | D6:w |"""
FL_FILL_D7 = 'F#5:e E5:e D5:e C5:e A4:q F#4:q |'

MEL_B1 = """D5:q. E5:e F#5:h | E5:q. C#5:e A4:h | C#5:q. E5:e A5:q. F#5:e | F#5:h. r:q |
G5:q. F#5:e E5:h | E5:q. C#5:e A#4:h | B4:q. C#5:e D5:q F#5:q | D5:h. r:q |"""
MEL_B2 = """D5:q. E5:e F#5:q B5:q | A5:q. G5:e E5:h | E5:q. F#5:e A5:q C#6:q | B5:h A5:q F#5:q |
G5:q. F#5:e E5:q B4:q | E5:q. D5:e A#4:h | A4:q. D5:e F#5:q A5:q | G5:h. E5:q |"""
FL_ANS_B = """r:w | r:w | r:w | r:h D6:e C#6:e B5:q | r:w | r:w | r:w | r:h F#5:e E5:e D5:e C#5:e |"""

BR_PNO = 'A4:q. D5:e F#5:q E5:e D5:e | G5:q. E5:e C5:h | B4:q. D5:e G5:h | F#5:h. r:q |'
BR_CL = 'A3:q. D4:e F#4:q E4:e D4:e | G4:q. E4:e C4:h | B3:q. D4:e G4:h | A#3:h. r:q |'
BR_OB = 'B4:q. E5:e G5:h | C#5:q. E5:e A5:h | D5:q. F#5:e B5:h | A5:h G5:q E5:q |'
BR_GULL = 'r:w | r:h. G6:s E6:s C6:e | r:w | r:w | r:w | r:h. G6:s E6:s C6:e | r:w | r:w |'
BR_FL = 'r:w | r:w | D6:h. r:q | r:h C#6:e D6:e E6:q |'

LINK_CL = 'F#5:q. E5:e D5:h | B4:q. D5:e F#5:h | E5:q. D5:e B4:h | D5:h C#5:q E5:q |'


def octv(text, n):
    import re
    return re.sub(r'([A-G][#b]?)(-?\d)(?=[:,~])', lambda m: m.group(1) + str(int(m.group(2)) + n), text)


def bars(text, a, b):
    """Bars a..b-1 (0-based) of a part text."""
    bs = [x.strip() for x in text.split('|') if x.strip()]
    return ' | '.join(bs[a:b]) + ' |'


# ---------------------------------------------------------------- generators
def chord(h):
    bass, gtr, pad, tones, ten = CH[h]
    return dict(bass=midi(bass), gtr=[midi(x) for x in gtr.split()], pad=pad.split(),
                tones={pc(t) for t in tones.split()},
                ten={pc(t) for t in ten.split()})


def pad_voice(harm, v, oct_=0):
    out = []
    for i in range(0, len(harm), 2):
        a, b = CH[harm[i]][2].split()[v], CH[harm[i + 1]][2].split()[v]
        a, b = octv(a + ':', oct_)[:-1], octv(b + ':', oct_)[:-1]
        out.append(('%s:w |' % a) if a == b else ('%s:h %s:h |' % (a, b)))
    return ' '.join(out)


def bass_arco(harm, octave=0):
    out = []
    for i in range(0, len(harm), 2):
        a, b = chord(harm[i])['bass'] + 12 * octave, chord(harm[i + 1])['bass'] + 12 * octave
        out.append(('%s:w |' % nm(a)) if a == b else ('%s:h %s:h |' % (nm(a), nm(b))))
    return ' '.join(out)


SCALE = {2, 4, 6, 7, 9, 11, 1}


def bass_pizz(harm, nxt, octave=0, busy=True):
    """Bouncy pizzicato bass: root on 1, fifth (or the second chord) on 3,
    an eighth-note step into the next bar's root on the and of 4."""
    out = []
    n = len(harm) // 2
    for i in range(n):
        a, b = harm[2 * i], harm[2 * i + 1]
        r1 = chord(a)['bass'] + 12 * octave
        nb = harm[2 * i + 2] if 2 * i + 2 < len(harm) else nxt
        rn = chord(nb)['bass'] + 12 * octave
        if a != b:
            r2 = chord(b)['bass'] + 12 * octave
            out.append('%s:q r:q %s:q r:q |' % (nm(r1), nm(r2)))
            continue
        tones = chord(a)['tones']
        f = next(r1 - d for d in (5, 7, 4, 3, 8, 9) if (r1 - d) % 12 in tones)
        # approach: a key (or chord) tone a step below the next root
        apr = None
        if busy and rn != r1:
            for d in (1, 2):
                k = rn - d
                if k % 12 in SCALE or k % 12 in tones:
                    apr = k
                    break
        if apr is not None and i % 2 == 1:
            out.append('%s:q r:q %s:q r:e %s:e |' % (nm(r1), nm(f), nm(apr)))
        elif i % 2 == 1:
            out.append('%s:q r:e %s:e %s:q r:q |' % (nm(r1), nm(r1), nm(f)))
        else:
            out.append('%s:q r:q %s:q r:q |' % (nm(r1), nm(f)))
    return ' '.join(out)


def offbeats(harm):
    out = []
    for i in range(0, len(harm), 2):
        a, b = CH[harm[i]][2].split(), CH[harm[i + 1]][2].split()
        out.append('r:q %s:q r:q %s:q |' % (','.join(a[1:]), ','.join(b[1:])))
    return ' '.join(out)


def harp_rolls(harm):
    """A rolled chord on each bar (two when the harmony changes)."""
    out = []
    for i in range(0, len(harm), 2):
        a, b = harm[i], harm[i + 1]
        ca = chord(a)
        va = [ca['bass'] + 12] + ca['gtr']
        if a == b:
            out.append('%s:w |' % ','.join(nm(k) for k in va))
        else:
            cb = chord(b)
            vb = [cb['bass'] + 12] + cb['gtr']
            out.append('%s:h %s:h |' % (','.join(nm(k) for k in va), ','.join(nm(k) for k in vb)))
    return ' '.join(out)


def up_from(c, start, n):
    pcs = c['tones']
    seq, k = [], start
    while len(seq) < n:
        if k % 12 in pcs:
            seq.append(k)
        k += 1
    return seq


def harp_quarters(harm, low='G3'):
    """Quarter-note arpeggios climbing from below the middle."""
    out = []
    for i in range(0, len(harm), 2):
        a, b = harm[i], harm[i + 1]
        if a == b:
            toks = ['%s:q' % nm(x) for x in up_from(chord(a), midi(low), 4)]
        else:
            toks = ['%s:q' % nm(x) for x in up_from(chord(a), midi(low), 2) + up_from(chord(b), midi(low), 2)]
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


def harp_eighths(harm, low=50):
    """Flowing eighths up through two octaves and back, one shape per half bar."""
    out = []
    for i in range(0, len(harm), 2):
        toks = []
        for half, h in enumerate((harm[i], harm[i + 1])):
            c = chord(h)
            b = c['bass'] + 12
            while b < low:
                b += 12
            seq = up_from(c, b, 7)
            shape = [seq[4], seq[5], seq[3], seq[2]] if (half == 1 and harm[i] == harm[i + 1]) else seq[:4]
            toks += ['%s:e' % nm(x) for x in shape]
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


def piano_lh(harm):
    """Left hand: bass, fifth/inner, octave, inner in quarters, an octave down."""
    out = []
    for i in range(0, len(harm), 2):
        toks = []
        for h in (harm[i], harm[i + 1]):
            c = chord(h)
            b = c['bass']
            if b < midi('C2'):
                b += 12
            up = up_from(c, b + 5, 2)
            toks += ['%s:e' % nm(b), '%s:e' % nm(up[0]), '%s:e' % nm(up[1]), '%s:e' % nm(up[0])]
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


def piano_rh_arps(harm):
    """High sparkling eighths over the chord (bridge, under the clarinet)."""
    out = []
    for i in range(0, len(harm), 2):
        toks = []
        for half, h in enumerate((harm[i], harm[i + 1])):
            c = chord(h)
            s = up_from(c, midi('A4'), 5)
            shape = [s[0], s[2], s[4], s[2]] if half == 0 else [s[1], s[3], s[4], s[3]]
            toks += ['%s:e' % nm(x) for x in shape]
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


def gliss_up(c, start, n, dur='s'):
    return ' '.join('%s:%s' % (nm(k), dur) for k in up_from(c, start, n))


# ---------------------------------------------------------------- the score
def build_score():
    P = []

    def part(n, patch, text='', start=0, **perf):
        P.append(Part(n, patch, text, start, BPB, **perf))
        return P[-1]

    # melody winds
    fl = part('Flute', 'fl', legato=True, humanize=0.007, swell=0.05)
    fl.add('@mp ' + MEL_A, S_A)
    fl.add('@p ' + FL_DESC + ' @mp ' + FL_FILL_D7, S_A2)
    fl.add('@mp ' + FL_ANS_B, S_B)
    fl.add('@pp ' + BR_GULL, S_BR)
    fl.add('@mp< ' + BR_FL + ' @mf', S_BR + 32)
    fl.add('@mp ' + bars(FL_DESC, 0, 8) + ' @mf ' + bars(FL_DESC, 8, 14) + ' @mp> ' + bars(FL_DESC, 14, 15) + ' r:w | @p', S_A3)

    ob = part('Oboe', 'ob', legato=True, humanize=0.008, swell=0.05)
    ob.add('@mp ' + OB_ANS_A, S_A)
    ob.add('@mp ' + OB_ANS_A2, S_A2)
    ob.add('@mp< ' + MEL_B1 + ' @mf', S_B)
    ob.add('@mp< ' + BR_OB + ' @mf', S_BR + 32)
    ob.add('@mp ' + OB_ANS_A, S_A3)

    cl = part('Clarinet', 'cl', legato=True, humanize=0.007, swell=0.04)
    cl.add('@pp ' + pad_voice(A_SEC[16:], 2), S_A + 32)
    cl.add('@mp ' + MEL_A, S_A2)
    cl.add('@p ' + BR_CL, S_BR + 16)
    cl.add('@mp ' + octv(bars(MEL_A, 8, 15), -1), S_A3 + 32)
    cl.add('@p ' + LINK_CL, S_LINK)

    # strings
    vln1 = part('Violins I', 'vln', legato=True, swell=0.05, humanize=0.01, cents=2)
    vln1.add('@pp ' + pad_voice(B_SEC[:16], 2, 1), S_B)
    vln1.add('@mf< ' + MEL_B2 + ' @f', S_B + 32)
    vln1.add('@pp< ' + pad_voice(BR_SEC[16:], 2, 1) + ' @mf', S_BR + 32)
    vln1.add('@mf ' + bars(MEL_A, 0, 8) + ' @f ' + bars(MEL_A, 8, 14) + ' @mf> ' + bars(MEL_A, 14, 16) + ' @mp', S_A3)

    vln2 = part('Violins II', 'vln', legato=True, swell=0.05, humanize=0.012, cents=-3)
    vla = part('Violas', 'vla', legato=True, swell=0.05, humanize=0.012)
    vc = part('Cellos', 'vc', legato=True, swell=0.05, humanize=0.012)
    cb = part('Basses', 'cb', legato=True, swell=0.03, humanize=0.012, layers=3)
    vln2.add('@p< ' + pad_voice(B_SEC, 2) + ' @mf', S_B)
    vla.add('@p< ' + pad_voice(B_SEC, 1) + ' @mf', S_B)
    vc.add('@p< ' + bass_arco(B_SEC, 1) + ' @mf', S_B)
    cb.add('@p< ' + bass_arco(B_SEC, 0) + ' @mp', S_B)
    cb.add('@pp ' + 'D2:w~ | D2:w~ | D2:w~ | D2:w~ | D2:w~ | D2:w~ | D2:w~ | D2:w |', S_BR)
    vla.add('@pp ' + pad_voice(BR_SEC[8:16], 1), S_BR + 16)
    vla.add('@pp< ' + pad_voice(BR_SEC[16:], 1) + ' @mf', S_BR + 32)
    vln2.add('@pp< ' + pad_voice(BR_SEC[16:], 2) + ' @mf', S_BR + 32)
    vc.add('@pp< ' + bass_arco(BR_SEC[16:], 1) + ' @mf', S_BR + 32)
    cb.add('@pp< ' + bass_arco(BR_SEC[16:], 0) + ' @mp', S_BR + 32)
    vln2.add('@mp ' + pad_voice(A3_SEC, 2) + ' @mp>', S_A3)
    vla.add('@mp ' + pad_voice(A3_SEC, 1), S_A3)
    vc.add('@mp ' + bass_arco(A3_SEC, 1), S_A3)
    vln2.add('@p ' + pad_voice(LINK, 2) + ' @pp', S_LINK)
    vla.add('@p ' + pad_voice(LINK, 1) + ' @pp', S_LINK)

    vcp = part('Cellos pizz', 'vc_pizz', humanize=0.008)
    vcp.add('@mp ' + bass_pizz(A_SEC, 'D', 1), S_A)
    vcp.add('@mp ' + bass_pizz(A2_SEC, 'Gmaj7', 1), S_A2)
    vcp.add('@p ' + bass_pizz(LINK, 'D', 1, busy=False), S_LINK)
    cbp = part('Basses pizz', 'cb_pizz', humanize=0.008)
    cbp.add('@mp ' + bass_pizz(A2_SEC, 'Gmaj7', 0), S_A2)
    cbp.add('@mf ' + bass_pizz(A3_SEC, 'D', 0), S_A3)
    vnp = part('Violins pizz', 'vln_pizz', humanize=0.01, spread=0.012)
    vnp.add('@p ' + offbeats(A2_SEC), S_A2)

    # harp, piano, glockenspiel
    harp = part('Harp', 'harp', humanize=0.006, gate=1.4, spread=0.035)
    harp.add('@mp G2,D3,B3,F#4:w | @p A3:e D4:e E4:e G4:e A4:e C#5:e E5:e G5:e |', S_INTRO)
    harp.add('@mp ' + harp_rolls(A2_SEC[:14]) + ' ' + harp_rolls(A2_SEC[14:]), S_A2)
    harp.add('@mp ' + harp_quarters(B_SEC[:16]) + ' @mf ' + harp_eighths(B_SEC[16:]), S_B)
    harp.add('@mp< ' + 'r:w | r:w | r:w | r:h ' + gliss_up(chord('A7'), midi('A3'), 8) + ' @mf', S_BR + 32)
    harp.add('@mp ' + harp_eighths(A3_SEC), S_A3)
    harp.add('@p ' + harp_rolls(LINK), S_LINK)

    pno = part('Piano', 'piano', humanize=0.01, gate=1.6, gain=0)
    pno.add('@mp ' + BR_PNO, S_BR)
    pno.add('@p ' + piano_lh(BR_SEC[:8]), S_BR)
    pno.add('@p ' + piano_rh_arps(BR_SEC[8:16]), S_BR + 16)
    pno.add('@pp ' + piano_lh(BR_SEC[8:16]), S_BR + 16)

    gl = part('Glockenspiel', 'glock', humanize=0.004, gate=2.0)
    gl.add('@p r:w | r:h. E6:q |', S_INTRO)
    gl.add('@p r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:h C#6:q E6:q | r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:h. A5:q |', S_A)
    gl.add('@p F#6:q r:q r:h | r:w | r:w | r:w | r:w | r:w | r:w | r:w | A6:q r:q r:h | r:w | r:w | r:w | r:w | r:w | r:w | r:w |', S_A2)
    gl.add('@p r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w | B6:q r:q A6:q r:q | r:w | r:w | r:w | r:w |', S_B)
    gl.add('@mp F#6:q r:q r:h | G6:q r:q r:h | r:w | r:h E6:q r:q | D6:q r:q r:h | r:w | r:w | r:h C#6:q E6:q | '
           'F#6:q r:q r:h | B6:q r:q r:h | r:w | r:w | r:w | r:w | D6:q r:q r:h | r:w |', S_A3)
    gl.add('@pp r:w | r:w | r:w | r:h. E6:q |', S_LINK)

    tempo = Tempo([[0, 92], [6, 96], [S_B - 2, 96], [S_B, 95], [S_B + 1, 96],
                   [S_BR - 4, 96], [S_BR, 91], [S_BR + 2, 95], [S_BR + 8, 96],
                   [S_A3 - 3, 96], [S_A3, 93], [S_A3 + 1, 96],
                   [END - 3, 96], [END, 94], [END + 0.01, 96]])
    return P, tempo


SEATS = {
    'Violins I': 'vln1', 'Violins II': 'vln2', 'Violas': 'vla', 'Cellos': 'vc', 'Cellos pizz': 'vc',
    'Basses': 'cb', 'Basses pizz': 'cb', 'Violins pizz': 'vln2', 'Harp': 'harp', 'Flute': 'fl', 'Oboe': 'ob',
    'Clarinet': 'cl', 'Glockenspiel': 'glock', 'Piano': 'piano',
}


# ---------------------------------------------------------------- GM layers (guitar, brushes)
def sec_level(b):
    """Arrangement energy 0..1 at a beat (drives guitar and percussion)."""
    pts = [(S_INTRO, .5), (S_A, .55), (S_A2, .62), (S_B, .55), (S_B + 56, .62), (S_BR, 0), (S_BR + 16, .4),
           (S_BR + 32, .5), (S_A3, .7), (S_A3 + 32, .78), (S_A3 + 56, .65), (S_LINK, .5)]
    v = pts[0][1]
    for p, l in pts:
        if b >= p:
            v = l
    return v


def guitar_events(rng):
    ev = []
    for i in range(0, len(HARM), 2):
        b0 = i * 2
        lv = sec_level(b0)
        if S_BR <= b0 < S_BR + 16 or lv == 0:
            continue
        if b0 >= S_A3 + 60 and b0 < S_LINK:   # last bar of A'': let it ring
            pass
        for half in range(2):
            c = chord(HARM[i + half])
            bass = c['bass'] + 12 if c['bass'] < midi('E2') else c['bass']
            if bass > midi('D3'):
                bass -= 12
            up = c['gtr']
            # p i m a: bass, upper2, upper3, upper1 / upper0, upper2, upper3, upper2
            pat = [bass, up[2], up[3], up[1]] if half == 0 else [up[0], up[2], up[3], up[2]]
            if half == 1 and HARM[i] != HARM[i + 1]:
                pat = [bass, up[2], up[3], up[1]]
            for j, k in enumerate(pat):
                b = b0 + half * 2 + j * 0.5
                ring = 2 - j * 0.5 if j else 2.0
                acc = [1.0, .72, .82, .7][j]
                vel = int(np.clip((34 + 70 * lv) * acc + rng.normal(0, 4), 18, 120))
                ev.append((b, ring, 0, k, vel))
    return ev


SHAKER, KICK, TAP, SLAP, SWIRL, TRI = 82, 36, 38, 39, 40, 81


def perc_events(rng):
    ev = []
    nbars = len(HARM) // 2
    for i in range(nbars):
        b0 = i * 4
        lv = sec_level(b0)
        in_br = S_BR <= b0 < S_BR + 48
        if b0 < S_A or in_br:
            pass
        else:
            acc = [.55, .9, .5, .95, .55, .9, .5, 1.0]
            for j in range(8):
                v = (30 + 55 * lv) * acc[j]
                ev.append((b0 + j * 0.5, 0.25, 9, SHAKER, int(np.clip(v + rng.normal(0, 4), 8, 110))))
            if b0 >= S_A3 and b0 < S_LINK:          # sixteenth ghosts in A''
                for j in range(8):
                    if j % 2 == 1:
                        ev.append((b0 + j * 0.5 + 0.25, 0.2, 9, SHAKER, int(np.clip(22 + rng.normal(0, 3), 8, 60))))
        # kick
        if S_A2 <= b0 < S_B or S_A3 <= b0 < S_LINK:
            ev.append((b0, 0.4, 9, KICK, int(62 + 10 * lv + rng.normal(0, 3))))
            ev.append((b0 + 2, 0.4, 9, KICK, int(50 + 8 * lv + rng.normal(0, 3))))
            if S_A3 <= b0 and i % 2 == 1:
                ev.append((b0 + 3.5, 0.3, 9, KICK, int(38 + rng.normal(0, 3))))
        elif S_B <= b0 < S_BR or S_BR + 32 <= b0 < S_BR + 48:
            ev.append((b0, 0.4, 9, KICK, int(52 + 10 * lv + rng.normal(0, 3))))
        # brushes on 2 and 4
        if S_B + 32 <= b0 < S_BR or S_A3 <= b0 < S_LINK:
            for bt in (1, 3):
                ev.append((b0 + bt, 0.3, 9, TAP, int(44 + 18 * lv + rng.normal(0, 4))))
        if S_BR + 32 <= b0 < S_BR + 48:
            for j in range(8):
                ev.append((b0 + j * 0.5, 0.25, 9, SHAKER, int(np.clip((20 + 50 * (b0 - S_BR - 32) / 16 + 15) * [.6, 1][j % 2], 8, 100))))
    # swirls into section changes, triangle on arrivals
    for s in (S_B - 4, S_BR - 4, S_A3 - 4):
        ev.append((s, 3.8, 9, SWIRL, 55))
    for s in (S_A2, S_A3):
        ev.append((s, 1.0, 9, TRI, 52))
    ev.append((S_B, 1.0, 9, TRI, 44))
    return ev


def write_mid(path, events, tempo, origin, programs):
    import mido
    tpb = 960
    mf = mido.MidiFile(ticks_per_beat=tpb)
    tr = mido.MidiTrack()
    mf.tracks.append(tr)
    tr.append(mido.MetaMessage('set_tempo', tempo=1000000, time=0))   # 1 beat = 1 s: ticks are seconds
    msgs = []
    for ch, (bank, prog) in programs.items():
        msgs.append((0, 0, mido.Message('control_change', channel=ch, control=0, value=bank if ch != 9 else 0)))
        msgs.append((0, 0, mido.Message('program_change', channel=ch, program=prog)))
        msgs.append((0, 0, mido.Message('control_change', channel=ch, control=7, value=110)))
    t0 = tempo.sec(origin)
    last = 0
    for b, d, ch, k, v in events:
        rng = np.random.default_rng(zlib.crc32(repr((round(b, 4), k, ch)).encode()))
        on = tempo.sec(b) - t0 + rng.normal(0, 0.006 if ch == 9 else 0.009)
        off = tempo.sec(b + d) - t0
        on = max(on, 0.0)
        msgs.append((int(on * tpb), 2, mido.Message('note_on', channel=ch, note=k, velocity=int(v))))
        msgs.append((int(off * tpb), 1, mido.Message('note_off', channel=ch, note=k, velocity=0)))
        last = max(last, off)
    msgs.append((int((last + 5) * tpb), 0, mido.Message('control_change', channel=0, control=121, value=0)))
    msgs.sort(key=lambda m: (m[0], m[1]))
    now = 0
    for t, _, m in msgs:
        tr.append(m.copy(time=t - now))
        now = t
    mf.save(path)


def fluid(mid, wav):
    subprocess.run(['fluidsynth', '-ni', '-R', '0', '-C', '0', '-g', '0.5', '-r', str(SR), '-O', 'float', '-T', 'wav',
                    '-F', wav, GUGS, mid], check=True, capture_output=True)
    x, sr = sf.read(wav, dtype='float32', always_2d=True)
    assert sr == SR
    return x


GM_GAIN = {'Guitar': 1.6, 'Brushes': 1.4}


def gm_stems(tempo, work, loop_start, loop_end, b_lo=None, b_hi=None):
    """Render the GM layers. Returns {name: (intro_buf, loop_buf)} (or one
    buffer per name for an excerpt window b_lo..b_hi)."""
    rng = np.random.default_rng(11)
    layers = {'Guitar': (guitar_events(rng), {0: (0, 24)}),
              'Brushes': (perc_events(rng), {9: (128, 40)})}
    out = {}
    for name, (ev, progs) in layers.items():
        if b_lo is not None:
            w = [e for e in ev if b_lo <= e[0] < b_hi]
            mid = os.path.join(work, '%s_x.mid' % name)
            write_mid(mid, w, tempo, b_lo, progs)
            out[name] = fluid(mid, mid[:-4] + '.wav') * GM_GAIN[name]
            continue
        parts = []
        for lo, hi, origin, tag in ((0, loop_start, 0, 'intro'), (loop_start, loop_end, loop_start, 'loop')):
            w = [e for e in ev if lo <= e[0] < hi]
            mid = os.path.join(work, '%s_%s.mid' % (name, tag))
            write_mid(mid, w, tempo, origin, progs)
            parts.append(fluid(mid, mid[:-4] + '.wav') * GM_GAIN[name])
        out[name] = tuple(parts)
    return out


GM_SEAT = {'Guitar': 'gtr', 'Brushes': 'perc'}
GM_SEND = {'Guitar': 0.8, 'Brushes': 0.7}


# ---------------------------------------------------------------- render
def render_song(parts, tempo, loop_start, loop_end, work, seats):
    """render.render_piece with the GM stems mixed in (same loop layout:
    intro once, then the body three times back to back through the hall and
    master; the second pass is the loop)."""
    intro_s = tempo.sec(loop_start)
    loop_s = tempo.sec(loop_end) - intro_s
    intro_n = int(round(intro_s * SR))
    N = int(round(loop_s * SR))
    reps = 3
    total = intro_n + reps * N + 6 * SR
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)

    def lay(stem, a, lp):
        if a is not None:
            stem[:min(len(a), total)] += a[:total]
        for k in range(reps):
            i = intro_n + k * N
            seg = lp[:max(0, total - i)]
            stem[i:i + len(seg)] += seg

    def mixin(stem, seat, gain_db, sendl):
        d, s = render.place(stem, seat)
        g = 10 ** (gain_db / 20)
        dry[:] += d * g
        send[:] += s * g * sendl
        return float(np.sqrt(np.mean((d * g) ** 2)))

    for p in parts:
        seat = render.SEAT[seats.get(p.name, p.name)]
        seat = dict(seat, **{k: p.perf[k] for k in ('pan', 'width', 'depth') if k in p.perf})
        stem = np.zeros((total, 2), np.float32)
        a = render.render_part(p, tempo, 0, loop_start, 0) if loop_start > 0 else None
        lp = render.render_part(p, tempo, loop_start, loop_end, loop_start)
        lay(stem, a, lp)
        r = mixin(stem, seat, p.perf.get('gain', 0), p.perf.get('send', 1.0))
        print('  part %-14s rms %.4f' % (p.name, r), flush=True)
        del stem
    for name, (a, lp) in gm_stems(tempo, work, loop_start, loop_end).items():
        stem = np.zeros((total, 2), np.float32)
        lay(stem, a, lp)
        r = mixin(stem, render.SEAT[GM_SEAT[name]], 0, GM_SEND[name])
        print('  gm   %-14s rms %.4f' % (name, r), flush=True)
        del stem
    ir = render.hall_ir()
    wet = render.reverb(send, ir)
    mix = dry + wet * 0.75
    del dry, send, wet
    m = render.master(mix)
    k = 1
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
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1)


def render_excerpt(parts, tempo, b0, b1, work, seats, out_wav):
    """A straight render of beats b0..b1 (for checking balance)."""
    n = int((tempo.sec(b1) - tempo.sec(b0) + 4) * SR)
    dry = np.zeros((n, 2), np.float32)
    send = np.zeros((n, 2), np.float32)
    for p in parts:
        seat = render.SEAT[seats.get(p.name, p.name)]
        x = render.render_part(p, tempo, b0, b1, b0)[:n]
        d, s = render.place(x, seat)
        g = 10 ** (p.perf.get('gain', 0) / 20)
        dry[:len(d)] += d * g
        send[:len(s)] += s * g * p.perf.get('send', 1.0)
        print('  part %-14s rms %.4f' % (p.name, float(np.sqrt(np.mean((d * g) ** 2)))))
    for name, x in gm_stems(tempo, work, 0, 0, b0, b1).items():
        x = x[:n]
        d, s = render.place(x, render.SEAT[GM_SEAT[name]])
        dry[:len(d)] += d
        send[:len(s)] += s * GM_SEND[name]
        print('  gm   %-14s rms %.4f' % (name, float(np.sqrt(np.mean(d ** 2)))))
    mix = dry + render.reverb(send, render.hall_ir()) * 0.75
    m = render.master(mix)
    m, _, l1 = render.loudness(m, -18.0)
    sf.write(out_wav, m, SR, subtype='FLOAT')
    return l1


# ---------------------------------------------------------------- checks
def check_harmony(parts):
    """Every note of the melodic and harmonic parts against the chord of the
    moment: strong beats and long notes must be chord tones or allowed
    tensions; short notes off the beat must at least be in the key (plus the
    chord's own chromatic tones)."""
    bad = 0
    for p in parts:
        for b, d, keys, _ in p.notes:
            idx = int(b // 2)
            if idx >= len(HARM):
                continue
            h = HARM[idx]
            # a note held over a chord change must fit the second chord too
            hs = {h}
            j = idx + 1
            while j < len(HARM) and j * 2 < b + d - 0.26:
                hs.add(HARM[j])
                j += 1
            for k in keys:
                for hh in hs:
                    c = chord(hh)
                    q = k % 12
                    strong = abs(b - round(b)) < 1e-6 or d >= 0.99
                    if q in c['tones'] or q in c['ten']:
                        continue
                    if p.patch in ('vc_pizz', 'cb_pizz') and not strong:
                        if q in SCALE:
                            continue
                    if not strong and (q in SCALE or q in c['tones']) and hh == h:
                        chromatic = {x for x in c['tones'] if x not in SCALE}
                        if q not in {(x + dd) % 12 for x in chromatic for dd in (-1, 1)}:
                            continue
                    bad += 1
                    bar_no = int(b // 4) + 1
                    print('  CLASH %-12s bar %3d beat %.2f %s over %s%s' % (p.name, bar_no, b % 4 + 1, nm(k), hh, ' (strong)' if strong else ''))
    return bad


def section_map(tempo):
    print('section map:')
    for (n, b), (_, b2) in zip(SECTIONS, SECTIONS[1:]):
        print('  %-7s bars %3d-%3d  %6.1f s - %6.1f s' % (n, b // 4 + 1, b2 // 4, tempo.sec(b), tempo.sec(b2)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='/tmp/claude-0/-home-user/f478e46a-5ce7-5b9b-a76e-154bb8baec5c/scratchpad/ost2/' + ID)
    ap.add_argument('--excerpt', nargs=2, type=int)
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    work = os.environ.get('MUSIC_WORK', os.path.join(a.out, 'work'))
    os.makedirs(work, exist_ok=True)
    assert len(HARM) * 2 == END, (len(HARM) * 2, END)
    P, tempo = build_score()
    for p in P:
        assert p.end <= END + 1e-6, (p.name, p.end)
    section_map(tempo)
    nb = check_harmony(P)
    print('harmony clashes:', nb)
    if a.check:
        return
    if a.excerpt:
        b0, b1 = (a.excerpt[0] - 1) * 4, (a.excerpt[1]) * 4
        out = os.path.join(a.out, 'excerpt_%d_%d.wav' % tuple(a.excerpt))
        l = render_excerpt(P, tempo, b0, b1, work, SEATS, out)
        render.to_mp3(out, out[:-4] + '.mp3')
        build.spectrogram(out, out[:-4] + '.png', 'excerpt')
        print('excerpt', out, '%.1f LUFS' % l)
        return
    info = render_song(P, tempo, S_A, END, work, SEATS)
    ogg = os.path.join(a.out, ID + '.ogg')
    render.to_ogg(info['wav'], ogg, q=6)
    render.to_mp3(info['wav'], os.path.join(a.out, ID + '.mp3'))
    build.spectrogram(info['wav'], os.path.join(a.out, ID + '_spectrogram.png'), TITLE)
    jump, p999, mx = build.seam_check(info['wav'], info['intro_s'])
    x, _ = sf.read(info['wav'])
    peak = 20 * np.log10(np.max(np.abs(x)) + 1e-12)
    print('  %.1f s (intro %.2f s, loop %.2f s), %.2f LUFS, peak %.2f dBFS, seam jump %.4f (99.9%% step %.4f, max %.4f)' % (
        info['total_s'], info['intro_s'], info['loop_s'], info['lufs'], peak, jump, p999, mx))
    o = int(round(info['intro_s'] * SR))
    seam = np.concatenate([x[-4 * SR:], x[o:o + 4 * SR]])
    sf.write(os.path.join(work, 'seam.wav'), seam, SR)
    render.to_mp3(os.path.join(work, 'seam.wav'), os.path.join(a.out, ID + '_loop_seam.mp3'))
    json.dump(dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(info['intro_s'], 6), loop_s=round(info['loop_s'], 6),
                   total_s=round(info['total_s'], 3), lufs=round(info['lufs'], 2), bpm=BPM, key='D major',
                   seam=[round(jump, 5), round(p999, 5), round(mx, 5)], peak_dbfs=round(peak, 2)),
              open(os.path.join(a.out, 'info.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
