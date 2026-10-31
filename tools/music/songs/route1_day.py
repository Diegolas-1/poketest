"""Route 1 (day): "The Road to Viridian" (original composition).

Song 5/12 of the second Pallet Town soundtrack. Plays on Route 1, the country
road north out of Pallet Town (tall grass, ledges, the flower meadow, the
windmill, the tea house, Pidgey flocks, the gate to Viridian City), from dawn
to 6 PM. The start of an adventure: a ten-year-old setting out under an open
sky, adventurous but friendly, at a walking tempo.

Key A major, 120 bpm, 4/4. Written for this fan game in the spirit of the
series' route music; every melody and progression here is new.

Form (bars; the file is intro + one loop body, the game loops the body):
  Intro      I1-I4    spiccato ostinato starts, guitar, the horn call (the
                      theme's head on D), snare roll in
  Verse      1-16     horns sing the theme over the spiccato ostinato,
                      acoustic guitar strums, march groove; flute birdcalls
  Chorus     17-32    trumpet + violins take the refrain (starts on IV),
                      horn counterline, piano stabs, tambourine
  B          33-48    F# minor: oboe, then flute an octave up, clarinet and
                      bassoon, harp, pizzicato oom-pah, fingerpicked guitar,
                      shaker and side stick (the meadow and the windmill)
  Breakdown  49-56    piano alone with the theme on D, string pad, flute echo,
                      a little slower
  Build      57-64    E pedal: ostinato back, horns then trumpet climb, snare
                      from eighths to a roll, timpani roll, tremolo violins
  Verse 2    65-80    trumpet + violins (octave up) on the theme, horn counter,
                      piano off-beats, glockenspiel birdcalls
  Chorus 2   81-96    tutti: violins up the octave, trumpet, horns below,
                      trombone, flute and oboe descant, glockenspiel,
                      tambourine sixteenths; a drum fill turns back to bar 1

Instruments: VSCO 2 CE (spiccato and sustained string sections, pizzicato,
tremolo violins, F horns, trumpet, trombone, flute, oboe, clarinet, bassoon,
harp, upright piano, glockenspiel, timpani) and General MIDI from GeneralUser
GS through fluidsynth (steel-string acoustic guitar, finger bass, drum kit with
tambourine and shaker), all placed on one stage and through one hall.

  python3 tools/music/songs/route1_day.py --out DIR [--excerpt BAR0 BAR1]

Bars for --excerpt count from the first intro bar (1) to 100. MUSIC_WORK is
the work dir (default DIR/work).
"""
import argparse
import json
import os
import subprocess
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
MUSIC = os.path.dirname(HERE)
sys.path.insert(0, MUSIC)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import build  # noqa: E402
import render  # noqa: E402
import score  # noqa: E402
from score import Part, Tempo, midi  # noqa: E402
from sfz import SR  # noqa: E402

ID = 'route1_day'
TITLE = 'The Road to Viridian'
BPM = 120
SF2 = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'

# fine dynamics: @v0 .. @v100 (level = n / 100)
score.DYN.update({'v%d' % i: i / 100 for i in range(101)})

# ---------- instruments added at run time (shared files stay untouched) ----------
render.ORCH.update({
    'vln_spic': ('ViolinEnsSpic.sfz', -0.4, None, None),
    'vla_spic': ('ViolaEnsSpic.sfz', 0.8, None, None),
    'vc_spic': ('CelloEnsSpic.sfz', 3.9, None, None),
    'cb_spic': ('ContrabassSpic.sfz', 3.5, None, None),
    'vln_trem': ('ViolinEnsTrem.sfz', 7.9, 0.5, 0.1),
    'tpt': ('TrumpetSus.sfz', -8.7, 0.35, 0.03),
    'tbn': ('TromboneSus.sfz', 11.0, 0.4, 0.05),
    'piano': ('UprightPiano.sfz', -2.0, 0.6, None),
})
render.SUSTAINED.add('vln_trem')
render.SEAT.update({
    'tpt': dict(pan=0.15, width=0.3, depth=0.7),
    'tbn': dict(pan=0.35, width=0.35, depth=0.8),
    'piano': dict(pan=-0.2, width=0.7, depth=0.4),
    'gtr': dict(pan=-0.45, width=0.6, depth=0.3),
    'bass': dict(pan=0.05, width=0.15, depth=0.3),
    'drums': dict(pan=0.0, width=0.85, depth=0.45),
    'perc': dict(pan=0.4, width=0.3, depth=0.5),
})

# ---------- harmony ----------
NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def nm(k):
    return NOTE[k % 12] + str(k // 12 - 1)


def pc(n):
    return midi(n + '4') % 12


# chord -> (bass note, chord tones root first (3rd, 5th, 7th), guitar voicing)
CH = {
    'A': ('A1', ['A', 'C#', 'E'], 'A2 E3 A3 C#4 E4'),
    'A7': ('A1', ['A', 'C#', 'E', 'G'], 'A2 E3 G3 C#4 E4'),
    'A/C#': ('C#2', ['A', 'C#', 'E'], 'C#3 E3 A3 C#4 E4'),
    'E': ('E2', ['E', 'G#', 'B'], 'E2 B2 E3 G#3 B3 E4'),
    'E7': ('E2', ['E', 'G#', 'B', 'D'], 'E2 B2 D3 G#3 B3 E4'),
    'Esus4': ('E2', ['E', 'A', 'B'], 'E2 B2 E3 A3 B3 E4'),
    'E/G#': ('G#1', ['E', 'G#', 'B'], 'G#2 B2 E3 B3 E4'),
    'F#m': ('F#1', ['F#', 'A', 'C#'], 'F#2 C#3 F#3 A3 C#4 F#4'),
    'F#m7': ('F#1', ['F#', 'A', 'C#', 'E'], 'F#2 C#3 E3 A3 C#4 F#4'),
    'D': ('D2', ['D', 'F#', 'A'], 'D3 A3 D4 F#4'),
    'Bm7': ('B1', ['B', 'D', 'F#', 'A'], 'B2 F#3 A3 D4 F#4'),
    'C#m7': ('C#2', ['C#', 'E', 'G#', 'B'], 'C#3 G#3 B3 E4 G#4'),
    'C#7': ('C#2', ['C#', 'E#', 'G#', 'B'], 'C#3 G#3 B3 E#4 G#4'),
    'D/E': ('E2', ['D', 'F#', 'A'], 'E2 D3 A3 D4 F#4'),
    'F#m/E': ('E2', ['F#', 'A', 'C#'], 'E2 C#3 F#3 A3 C#4'),
}


def tones(c):
    return [pc(t) for t in CH[c][1]]


def bassk(c):
    return midi(CH[c][0])


def gvoice(c):
    return [midi(n) for n in CH[c][2].split()]


def bars(*rows):
    out = []
    for r in rows:
        out += r.split()
    return out


# harmony, two entries per bar (half notes)
INTRO = bars('A A', 'A A', 'D D', 'Esus4 E')
VERSE = bars('A A', 'E/G# E/G#', 'F#m7 F#m7', 'D D', 'Bm7 Bm7', 'A/C# A/C#', 'D D', 'Esus4 E',
             'A A', 'E/G# E/G#', 'F#m F#m', 'D Bm7', 'D D', 'E7 E7', 'Bm7 E', 'A A')
CHORUS = bars('D D', 'E E', 'C#m7 C#m7', 'F#m7 F#m7', 'Bm7 Bm7', 'E E', 'A A', 'A7 A7',
              'D D', 'E E', 'C#m7 C#m7', 'F#m7 F#m7', 'Bm7 Bm7', 'E7 E7', 'D E')
CHORUS1 = CHORUS + ['A', 'C#7']
CHORUS2 = CHORUS + ['A', 'E7']
BSEC = bars('F#m F#m', 'D D', 'Bm7 Bm7', 'C#7 C#7', 'F#m F#m', 'D D', 'E7 E7', 'E E',
            'D D', 'E E', 'C#m7 C#m7', 'F#m F#m', 'Bm7 Bm7', 'D D', 'Esus4 Esus4', 'E E')
BREAK = bars('D D', 'D D', 'C#m7 C#m7', 'F#m F#m', 'Bm7 Bm7', 'Bm7 Bm7', 'D D', 'E E')
BUILD = bars('D/E D/E', 'E E', 'D/E D/E', 'E E', 'F#m/E F#m/E', 'D/E D/E', 'Esus4 Esus4', 'E7 E7')

# section starts (beats)
S_IN, S_V1, S_C1, S_B, S_BR, S_BLD, S_V2, S_C2, END = 0, 16, 80, 144, 208, 240, 272, 336, 400
LS = S_V1
HARM = INTRO + VERSE + CHORUS1 + BSEC + BREAK + BUILD + VERSE + CHORUS2
assert len(HARM) * 2 == END
SECTIONS = [('Intro', S_IN), ('Verse', S_V1), ('Chorus', S_C1), ('B (F#m)', S_B), ('Breakdown', S_BR),
            ('Build', S_BLD), ('Verse 2', S_V2), ('Chorus 2', S_C2)]


def chord_at(beat):
    return HARM[min(int(beat // 2), len(HARM) - 1)]


# ---------- melodies ----------
MEL_V = """E4:e A4:e A4:q. B4:e C#5:q | B4:q A4:e F#4:e E4:h | A4:q. C#5:e F#5:q E5:q | D5:q C#5:e B4:e A4:h |
B4:q. C#5:e D5:q B4:q | C#5:q. B4:e A4:q E4:q | F#4:q A4:q D5:q C#5:e B4:e | B4:h r:h |
E4:e A4:e A4:q. B4:e C#5:q | B4:q C#5:e D5:e E5:h | F#5:q. E5:e C#5:q A4:q | D5:q. C#5:e B4:q F#4:q |
A4:q D5:q F#5:q. E5:e | E5:q D5:e C#5:e B4:h | D5:q. C#5:e B4:q G#4:q | A4:h. r:q |"""
MEL_C = """F#5:h. E5:e D5:e | E5:h. B4:q | C#5:q E5:q G#5:q. F#5:e | F#5:h C#5:q E5:q |
D5:h. C#5:e B4:e | B4:q E5:q G#5:q. F#5:e | E5:h C#5:q E5:q | G5:q. F#5:e E5:q C#5:q |
D5:h F#5:q A5:q | A5:q G#5:q E5:q B4:q | G#5:q. F#5:e E5:q C#5:q | A5:h F#5:q E5:q |
F#5:q. E5:e D5:q B4:q | E5:q D5:e C#5:e B4:q G#4:q | F#5:q A5:q G#5:q E5:q | A5:h r:h |"""
PICKUP = 'C#5:e E5:e'          # into the chorus, last beat of the verse
MEL_B = """C#5:q. D5:e C#5:q A4:q | F#4:q A4:q D5:h | D5:q. E5:e F#5:q D5:q | B4:q. A4:e G#4:h |
A4:q. B4:e C#5:q F#5:q | F#5:q. E5:e D5:q A4:q | B4:q. C#5:e D5:q E5:q | E5:h r:h |
F#5:q. G#5:e A5:q F#5:q | G#5:q. F#5:e E5:q B4:q | G#5:q. F#5:e E5:q C#5:q | A5:q. G#5:e F#5:h |
D5:q. E5:e F#5:q A5:q | A5:h F#5:h | E5:h A4:h | G#4:h. r:q |"""
MEL_BR = """A4:e D5:e D5:q. E5:e F#5:q | F#5:q E5:e D5:e A4:h | E5:q. C#5:e B4:h | A4:h. r:q |
F#4:e B4:e B4:q. C#5:e D5:q | D5:q C#5:e B4:e A4:h | F#4:q A4:q D5:h | E5:w |"""
MEL_BLD = """A3:e D4:e D4:q. E4:e F#4:q | E4:q B3:q E4:q G#4:q | A4:e D5:e D5:q. E5:e F#5:q | E5:q B4:q E5:q G#5:q |
C#5:e F#5:e F#5:q. G#5:e A5:q | A5:q F#5:q D5:q A4:q | B4:q E5:q A5:h | G#5:q. F#5:e E5:q D5:q |"""
BIRD8 = 'r:h B5:s G#5:s E5:e B5:s G#5:s E6:e |'      # a Pidgey call over E
BIRD16 = 'r:h. E6:s C#6:s A5:e |'                   # over A
REST = 'r:w |'


def rests(n):
    return ' '.join([REST] * n)


def octv(text, n):
    import re
    return re.sub(r'([A-G][#b]?)(-?\d)(?=[:,~])', lambda m: m.group(1) + str(int(m.group(2)) + n), text)


def octdouble(text):
    import re
    return re.sub(r'(?<![,\w#])([A-G][#b]?)(-?\d):', lambda m: '%s%s,%s%d:' % (m.group(1), m.group(2), m.group(1), int(m.group(2)) + 1), text)


def bars_of(text, a, b):
    """Bars a..b-1 (0-based) of a part text."""
    bl = [x.strip() for x in text.split('|') if x.strip()]
    return ' | '.join(bl[a:b]) + ' |'


# ---------- generated parts ----------
def lv(x):
    return '@v%d' % int(round(np.clip(x, 0.02, 0.98) * 100))


def nearest(cands, prev):
    return min(cands, key=lambda k: (abs(k - prev), k))


def in_range(c, lo, hi, use_bass=False):
    ps = set(tones(c))
    if use_bass:
        ps.add(bassk(c) % 12)
    return [k for k in range(lo, hi + 1) if k % 12 in ps]


def guide(harm, lo, hi, start, pref=(1, 3, 2, 0), dyn=None, move=False):
    """A smooth line of chord tones (third and seventh first), one per half bar,
    held notes tied. move=True adds a passing quarter where the line leaps."""
    toks, prev = [], start
    out = []
    for i, c in enumerate(harm):
        tl = tones(c)
        best, bs = None, 1e9
        for k in range(lo, hi + 1):
            if k % 12 not in tl:
                continue
            idx = tl.index(k % 12)
            rank = pref.index(idx) if idx in pref else 3
            s = abs(k - prev) + rank * 1.2
            if s < bs:
                bs, best = s, k
        toks.append(best)
        prev = best
    for i, k in enumerate(toks):
        if i % 2 == 0:
            if dyn and i // 2 in dyn:
                out.append(lv(dyn[i // 2]))
            if toks[i + 1] == k:
                out.append('%s:h~ %s:h |' % (nm(k), nm(k)))
            else:
                out.append('%s:h %s:h |' % (nm(k), nm(toks[i + 1])))
    return ' '.join(out)


def ostinato(harm, voice, base, acc=0.12, cres=None):
    """Spiccato eighths in a 3+3+2 accent pattern.
    voice: 'vln' (top / low / middle chord tones), 'vla' (one inner tone),
    'vc' (bass note, fifth and octave at the end of the bar), 'cb' (bass
    note on the accents), 'ped' (the bass note only, eighths)."""
    out = []
    prevT = {'vln': 73, 'vla': 61}
    nb = len(harm) // 2
    for b in range(nb):
        toks = []
        bl = base if cres is None else base + (cres - base) * b / max(nb - 1, 1)
        for pos in range(8):
            c = harm[2 * b + pos // 4]
            a = pos in (0, 3, 6)
            v = bl + (acc if a else 0) + (0.03 if pos == 0 else 0)
            if voice == 'vln':
                if pos in (0, 4) or pos == 0:
                    T = nearest(in_range(c, 69, 78), prevT['vln'])
                    prevT['vln'] = T
                T = prevT['vln']
                below = sorted([k for k in in_range(c, T - 12, T - 1)], reverse=True)
                k = [T, below[0], below[1]][[0, 1, 2, 0, 1, 2, 0, 1][pos]]
                toks.append('%s %s:e' % (lv(v), nm(k)))
            elif voice == 'vla':
                if pos in (0, 4):
                    prevT['vla'] = nearest(in_range(c, 57, 66), prevT['vla'])
                toks.append('%s %s:e' % (lv(v), nm(prevT['vla'])))
            elif voice in ('vc', 'ped'):
                r = bassk(c) + 12
                while r > 54:
                    r -= 12
                while r < 40:
                    r += 12
                k = r
                if voice == 'vc' and pos == 6:
                    k = r + 7 if (r + 7) % 12 in tones(c) else r + 12
                if voice == 'vc' and pos == 7:
                    k = r + 12
                toks.append('%s %s:e' % (lv(v), nm(k)))
            elif voice == 'cb':
                r = bassk(c)
                while r < 28:
                    r += 12
                if harm[2 * b] == harm[2 * b + 1]:
                    if pos in (0, 3):
                        toks.append('%s %s:q.' % (lv(v), nm(r)))
                    elif pos == 6:
                        toks.append('%s %s:q' % (lv(v), nm(r)))
                else:
                    if pos in (0, 4):
                        toks.append('%s %s:q.' % (lv(v + (0 if pos == 0 else acc)), nm(r)))
                    elif pos in (3, 7):
                        toks.append('%s %s:e' % (lv(v), nm(r)))
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


def pizz_oompah(harm, voice, level):
    out = []
    pv = 62
    for b in range(len(harm) // 2):
        toks = []
        for beat in range(4):
            c = harm[2 * b + beat // 2]
            if voice == 'vc' and beat in (0, 2):
                r = bassk(c) + 12
                if beat == 2 and harm[2 * b] == harm[2 * b + 1]:
                    f = [k for k in in_range(c, r + 5, r + 8)]
                    r = f[0] if f else r
                toks.append('%s %s:q' % (lv(level), nm(r)))
            elif voice == 'cb' and beat in (0, 2):
                toks.append('%s %s:q' % (lv(level), nm(bassk(c))))
            elif voice == 'vla' and beat in (1, 3):
                cs = in_range(c, 57, 70)
                a = nearest(cs, pv)
                bb = [k for k in cs if k > a][0]
                pv = a
                toks.append('%s %s,%s:q' % (lv(level - (0.04 if beat == 3 else 0)), nm(a), nm(bb)))
            else:
                toks.append('r:q')
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


def harp_arp(harm, level):
    out = []
    for b in range(len(harm) // 2):
        toks = []
        for h in range(2):
            c = harm[2 * b + h]
            r = bassk(c) + 12
            seq = [k for k in in_range(c, r, r + 26)]
            seq = [r] + [k for k in seq if k > r]
            shape = [seq[0], seq[2], seq[3], seq[4]] if h == 0 else [seq[5], seq[4], seq[3], seq[2]]
            toks += ['%s %s:e' % (lv(level + (0.05 if j == 0 else 0)), nm(k)) for j, k in enumerate(shape)]
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


def roots_text(harm, oct_add=0, dur='h', lo=None, level=None):
    out = []
    for b in range(len(harm) // 2):
        c1, c2 = harm[2 * b], harm[2 * b + 1]
        r1, r2 = bassk(c1) + 12 * oct_add, bassk(c2) + 12 * oct_add
        if lo:
            while r1 < lo:
                r1 += 12
            while r2 < lo:
                r2 += 12
        pre = (lv(level) + ' ') if level is not None else ''
        if dur == 'w':
            out.append('%s%s:h %s:h |' % (pre, nm(r1), nm(r2)) if c1 != c2 else '%s%s:w |' % (pre, nm(r1)))
        else:
            if c1 == c2:
                f = [k for k in in_range(c1, r1 + 6, r1 + 8)] or [r1]
                out.append('%s%s:h %s:h |' % (pre, nm(r1), nm(f[0])))
            else:
                out.append('%s%s:h %s:h |' % (pre, nm(r1), nm(r2)))
    return ' '.join(out)


def piano_stabs(harm, level):
    """Right hand: closed chords in 3+3+2; left hand in a separate call."""
    out = []
    prev = 66
    for b in range(len(harm) // 2):
        toks = []
        same = harm[2 * b] == harm[2 * b + 1]
        for st, d in (((0, 'q.'), (1.5, 'q.'), (3, 'q')) if same else ((0, 'q.'), (1.5, 'e'), (2, 'q.'), (3.5, 'e'))):
            c = harm[2 * b + int(st // 2)]
            cs = in_range(c, 61, 78)
            top = nearest([k for k in cs if k >= 69], prev + 4)
            ch = [k for k in cs if top - 9 <= k <= top][-3:]
            prev = ch[0]
            toks.append('%s %s:%s' % (lv(level + (0.06 if st == 0 else 0)), ','.join(nm(k) for k in ch), d))
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


def piano_offbeats(harm, level):
    out = []
    for b in range(len(harm) // 2):
        toks = []
        for beat in range(4):
            c = harm[2 * b + beat // 2]
            if beat in (1, 3):
                cs = in_range(c, 69, 81)
                toks.append('%s %s:q' % (lv(level), ','.join(nm(k) for k in cs[:3])))
            else:
                toks.append('r:q')
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


def piano_lh(harm, level, pattern='oct'):
    out = []
    for b in range(len(harm) // 2):
        toks = []
        for h in range(2):
            c = harm[2 * b + h]
            r = bassk(c) + 12
            while r < 38:
                r += 12
            if pattern == 'oct':
                toks.append('%s %s,%s:h' % (lv(level), nm(r), nm(r + 12)))
            elif pattern == 'broken':
                cs = in_range(c, r + 1, r + 19)
                f = [k for k in cs if (k - r) % 12 == 7 or k % 12 == tones(c)[2]] or cs
                t = [k for k in cs if k > f[0]]
                toks += ['%s %s:q' % (lv(level + .04), nm(r)), '%s %s:q' % (lv(level), nm(t[1] if len(t) > 1 else f[0]))]
            elif pattern == 'eighths':
                toks += ['%s %s,%s:e' % (lv(level + (0.06 if j % 2 == 0 else 0)), nm(r), nm(r + 12)) for j in range(4)]
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


def piano_pulse(harm, base, top):
    """Repeated eighth chords, crescendo from base to top (the build)."""
    out = []
    nb = len(harm) // 2
    for b in range(nb):
        toks = []
        for pos in range(8):
            c = harm[2 * b + pos // 4]
            cs = in_range(c, 62, 76)
            v = base + (top - base) * (b * 8 + pos) / (nb * 8)
            toks.append('%s %s:e' % (lv(v + (0.05 if pos % 2 == 0 else 0)), ','.join(nm(k) for k in cs[-3:])))
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


# ---------- General MIDI layers (guitar, bass, drums) ----------
class GM:
    def __init__(self, name, program, drum=False, seat='gtr', gain=0.0, send=1.0):
        self.name, self.program, self.drum = name, program, drum
        self.seat, self.gain, self.send = seat, gain, send
        self.ev = []        # [beat, dur beats, key, vel 0..127, jitter s]

    def add(self, beat, dur, key, vel, hum=0.006, spread=0.0):
        rng = np.random.default_rng(zlib.crc32(repr((self.name, round(beat, 4), key)).encode()))
        self.ev.append([beat, dur, int(key), int(np.clip(vel + rng.normal(0, 4), 1, 127)), rng.normal(0, hum) + spread])


SCALE = {9, 11, 1, 2, 4, 6, 8}


def approach(cur, nxt):
    if nxt == cur:
        return cur + 7 if cur + 7 <= 45 else cur - 5
    step = (-1, -2) if nxt > cur else (1, 2)
    for s in step:
        k = nxt + s
        if k % 12 in SCALE and k != cur:
            return k
    for s in (-step[0], -step[1]):          # from the other side
        k = nxt + s
        if k % 12 in SCALE and k != cur:
            return k
    return cur + 7


def bass_low(c):
    k = bassk(c)
    while k > 41:
        k -= 12
    while k < 28:
        k += 12
    return k


def gm_bass(B, harm, start, style, vel=92):
    nb = len(harm) // 2
    for b in range(nb):
        c1, c2 = harm[2 * b], harm[2 * b + 1]
        nxt = harm[2 * b + 2] if 2 * b + 2 < len(harm) else c1
        r1, r2, rn = bass_low(c1), bass_low(c2), bass_low(nxt)
        t = start + 4 * b
        if style == 'walk':
            if c1 == c2:
                fifth = nearest([k for k in range(r1 + 3, r1 + 10) if k % 12 in tones(c1)] or [r1 + 12], r1 + 7)
                seq = [(0, 1, r1, vel + 8), (1, .5, r1, vel - 10), (1.5, .5, r1 + 12, vel - 14),
                       (2, 1, fifth, vel), (3, 1, approach(r1, rn), vel - 8)]
            else:
                seq = [(0, 1, r1, vel + 8), (1, 1, r1 + 12, vel - 12), (2, 1, r2, vel), (3, 1, approach(r2, rn), vel - 8)]
        elif style == 'drive':
            seq = []
            for pos in range(8):
                r = r1 if pos < 4 else r2
                k = r
                if pos == 6:
                    k = r + 12
                if pos == 7:
                    k = approach(r2, rn)
                seq.append((pos * .5, .5, k, vel + (10 if pos in (0, 3, 6) else -6)))
        elif style == 'pedal':
            seq = [(pos * .5, .5, 28 + (12 if pos == 7 else 0), vel + (8 if pos in (0, 3, 6) else -8)) for pos in range(8)]
        elif style == 'intro':
            seq = [(0, 1.5, r1, vel), (1.5, .5, r1, vel - 15), (2, 1, r2, vel - 5), (3, 1, r2 + 12 if b == nb - 1 else approach(r2, rn), vel - 10)]
        for o, d, k, v in seq:
            B.add(t + o, d * 0.92, k, v, hum=0.005)


STRUM = [(0, 'D', 1.0), (1, 'D', 0.78), (1.5, 'U', 0.6), (2.5, 'U', 0.66), (3, 'D', 0.82), (3.5, 'U', 0.6)]


def gm_strum(G, harm, start, vel=88, muted=False, cres=None):
    nb = len(harm) // 2
    for b in range(nb):
        t0 = start + 4 * b
        sv = vel if cres is None else vel + (cres - vel) * b / max(nb - 1, 1)
        pat = STRUM if not muted else [(p * .5, 'D', 1.0 if p % 2 == 0 else .7) for p in range(8)]
        for j, (o, d, a) in enumerate(pat):
            c = harm[2 * b + int(o // 2)]
            vo = gvoice(c)
            nxt = pat[j + 1][0] if j + 1 < len(pat) else 4
            dur = (nxt - o) + 0.06 if not muted else 0.18
            notes = vo if d == 'D' else list(reversed(vo[-4:]))
            if muted:
                notes = vo[:3]
            for i, k in enumerate(notes):
                G.add(t0 + o, dur, k, sv * a * (0.9 + 0.1 * (i == len(notes) - 1)), hum=0.004, spread=i * (0.009 if d == 'D' else 0.006))


def gm_pick(G, harm, start, vel=62, quarters=False):
    nb = len(harm) // 2
    for b in range(nb):
        for h in range(2):
            c = harm[2 * b + h]
            vo = gvoice(c)
            if quarters:
                seq = [(0, vo[0], 1.0), (1, vo[-1], .8)]
                step = 1
            else:
                seq = [(0, vo[0], 1.0), (.5, vo[2], .7), (1, vo[-1], .85), (1.5, vo[3 if len(vo) > 4 else 1], .7)]
                step = .5
            for o, k, a in seq:
                G.add(start + 4 * b + 2 * h + o, 2 - o + 0.3, k, vel * a, hum=0.006)


K, SN, SS, CHH, PHH, OHH, CR, CR2, RD, TAMB, SHK = 36, 38, 37, 42, 44, 46, 49, 57, 51, 54, 70
HT, MT, LT, FT = 50, 47, 45, 41


def gm_drums(D, P, start, nbars, style, seed=0):
    for b in range(nbars):
        t = start + 4 * b
        rng = np.random.default_rng(seed * 1000 + b)
        last = b == nbars - 1
        if style in ('verse', 'verse2', 'chorus', 'chorus2'):
            ch = style.startswith('chorus')
            fill = (b % 8 == 7) and ch or (b == 7 and not ch)
            big = last
            # kick
            ks = [0, 2] + ([2.5] if b % 2 == 1 else []) + ([1.5] if ch else [])
            for o in ks:
                if big and o >= 2:
                    continue
                D.add(t + o, .25, K, 104 if o in (0, 2) else 78, hum=0.002)
            # snare + ghosts
            for o in (1, 3):
                if (fill and o == 3) or (big and o == 3):
                    continue
                D.add(t + o, .25, SN, 98 if o == 3 else 92, hum=0.003)
            for o in (0.75, 1.75, 2.75, 3.25):
                if rng.random() < 0.55 and not ((fill or big) and o >= 2.5) and not (big and o >= 1.5):
                    D.add(t + o, .2, SN, 26 + rng.integers(0, 12), hum=0.004)
            # hat
            step = .25 if style in ('verse2', 'chorus2') and b % 2 == 1 else .5
            hp = np.arange(0, 4, step)
            for o in hp:
                if (fill and o >= 3) or (big and o >= 1.5):
                    continue
                strong = abs(o - round(o)) < 1e-6
                if b % 4 == 3 and abs(o - 3.5) < 1e-6 and not fill:
                    D.add(t + o, .5, OHH, 64, hum=0.003)
                    continue
                D.add(t + o, .2, CHH, (74 if strong else 50) - (8 if step == .25 and not strong and abs(o * 2 - round(o * 2)) > 1e-6 else 0), hum=0.003)
            if b % 4 == 0 and b > 0 or b == 0:
                D.add(t, 1, CR if b % 8 == 0 else CR2, 100 if b == 0 else 84, hum=0.002)
            if fill:
                for j, o in enumerate(np.arange(3, 4, .25)):
                    D.add(t + o, .2, SN, 58 + 12 * j, hum=0.003)
            if big:
                seq = [HT, HT, MT, MT, LT, LT, FT, FT, SN, SN]
                for j, o in enumerate(np.arange(1.5, 4, .25)):
                    D.add(t + o, .2, seq[j], 72 + 4 * j, hum=0.003)
                D.add(t + 3.5, .3, K, 96, hum=0.002)
            # tambourine
            if style in ('chorus',):
                for o in np.arange(0, 4, .5):
                    if big and o >= 1.5:
                        continue
                    P.add(t + o, .2, TAMB, 78 if o in (1, 3) else 48, hum=0.004)
            if style == 'verse2':
                for o in (1, 3):
                    P.add(t + o, .2, TAMB, 66, hum=0.004)
            if style == 'chorus2':
                for o in np.arange(0, 4, .25):
                    if big and o >= 1.5:
                        continue
                    acc = 80 if abs(o - round(o)) < 1e-6 and int(round(o)) % 2 == 1 else (58 if abs(o * 2 - round(o * 2)) < 1e-6 else 38)
                    P.add(t + o, .15, TAMB, acc, hum=0.004)
        elif style == 'b':
            for o in (0, 2):
                D.add(t + o, .25, K, 58, hum=0.003)
            for o in (1, 3):
                D.add(t + o, .25, SS, 52 if o == 3 else 44, hum=0.004)
            for o in np.arange(0, 4, .5):
                P.add(t + o, .2, SHK, 56 if abs(o - round(o)) < 1e-6 else 40, hum=0.005)
            if last:
                for j, o in enumerate(np.arange(2, 4, .25)):
                    P.add(t + o, .15, SHK, 40 - 3 * j, hum=0.004)
        elif style == 'breakdown':
            if b >= 6:
                for o in (0, 2):
                    D.add(t + o, .25, K, 44 + 6 * (b - 6), hum=0.003)
                for o in np.arange(0, 4, .5):
                    P.add(t + o, .2, SHK, 30 + 8 * (b - 6), hum=0.005)
        elif style == 'build':
            for o in range(4):
                D.add(t + o, .25, K, 60 + 5 * b, hum=0.002)
            if 4 <= b <= 5:
                for o in np.arange(0, 4, .5):
                    D.add(t + o, .2, SN, 40 + 8 * (b - 4) + 6 * o, hum=0.003)
            if b == 6:
                for o in np.arange(0, 4, .25):
                    D.add(t + o, .15, SN, 62 + 8 * o, hum=0.003)
            if b == 7:
                for o in np.arange(0, 2, .125):
                    D.add(t + o, .1, SN, 86 + 12 * o, hum=0.002)
                seq = [HT, HT, HT, MT, MT, MT, LT, LT, LT, FT, FT, FT, SN, SN, SN, SN]
                for j, o in enumerate(np.arange(2, 4, .125)):
                    D.add(t + o, .1, seq[j], 90 + j, hum=0.002)
                D.add(t + 3.5, .3, K, 100, hum=0.002)
            if b in (0, 4):
                D.add(t, 1, CR2, 70 + 10 * (b == 4), hum=0.002)
        elif style == 'intro':
            if b >= 1:
                for o in np.arange(0, 4, .5):
                    if b == 3 and o >= 2:
                        continue
                    D.add(t + o, .2, CHH, (60 if abs(o - round(o)) < 1e-6 else 40) + 6 * b, hum=0.003)
            if b >= 2:
                D.add(t, .25, K, 90, hum=0.002)
                D.add(t + 2, .25, K, 84, hum=0.002)
            if b == 2:
                D.add(t + 1, .25, SN, 70, hum=0.003)
                D.add(t + 3, .25, SN, 74, hum=0.003)
            if b == 3:
                for j, o in enumerate(np.arange(0, 4, .125)):
                    D.add(t + o, .1, SN, 34 + 2.4 * j, hum=0.002)


# ---------- the score ----------
SEATS = {}


def build_song():
    P = []

    def part(n, patch, seat, **perf):
        P.append(Part(n, patch, '', 0, 4, **perf))
        SEATS[n] = seat
        return P[-1]

    # strings: spiccato ostinato
    vln2 = part('Violins II spic', 'vln_spic', 'vln2', humanize=0.006, gate=0.9)
    vla = part('Violas spic', 'vla_spic', 'vla', humanize=0.006, gate=0.9, gain=-1.5)
    vc = part('Cellos spic', 'vc_spic', 'vc', humanize=0.006, gate=0.9)
    cb = part('Basses spic', 'cb_spic', 'cb', humanize=0.006, gate=0.9, gain=-2)
    vln2.add(ostinato(INTRO, 'vln', 0.30, cres=0.44), S_IN)
    vla.add(ostinato(INTRO, 'vla', 0.30, cres=0.42), S_IN)
    vc.add(rests(1) + ' ' + ostinato(INTRO[2:], 'vc', 0.34, cres=0.44), S_IN)
    cb.add(rests(2) + ' ' + ostinato(INTRO[4:], 'cb', 0.40, cres=0.46), S_IN)
    for h, s, lvl in ((VERSE, S_V1, .45), (CHORUS1, S_C1, .53), (VERSE, S_V2, .5), (CHORUS2, S_C2, .58)):
        vln2.add(ostinato(h, 'vln', lvl), s)
        vla.add(ostinato(h, 'vla', lvl - .02), s)
        vc.add(ostinato(h, 'vc', lvl), s)
        cb.add(ostinato(h, 'cb', lvl + .02), s)
    vln2.add(ostinato(BUILD, 'vln', 0.28, cres=0.6), S_BLD)
    vla.add(ostinato(BUILD, 'vla', 0.26, cres=0.58), S_BLD)
    vc.add(ostinato(BUILD, 'ped', 0.30, cres=0.62), S_BLD)
    cb.add(ostinato(BUILD[8:], 'cb', 0.40, cres=0.62), S_BLD + 16)

    # sustained strings
    vln1 = part('Violins I', 'vln', 'vln1', legato=True, swell=0.04, humanize=0.008, cents=2)
    vln1.add('@v56 ' + MEL_C, S_C1)
    vln1.add('@v34 ' + guide(BSEC[16:], 76, 86, 81), S_B + 32)
    vln1.add('@v30 ' + guide(BREAK, 74, 85, 78, dyn={4: .36, 7: .3}), S_BR)
    vln1.add('@v52 ' + octv(MEL_V, 1), S_V2)
    vln1.add('@v64 ' + octv(MEL_C, 1), S_C2)
    vln1s = part('Violins I sus', 'vln', 'vln2', legato=True, swell=0.05, humanize=0.01, cents=-3)
    vln1s.add('@v30 ' + guide(BSEC, 66, 76, 69), S_B)
    vln1s.add('@v32 ' + guide(BREAK, 64, 74, 69, dyn={4: .38, 7: .32}), S_BR)
    vlas = part('Violas sus', 'vla', 'vla', legato=True, swell=0.05, humanize=0.01)
    vlas.add('@v32 ' + guide(BREAK, 55, 64, 59, pref=(2, 0, 1, 3), dyn={4: .38, 7: .3}), S_BR)
    vcs = part('Cellos sus', 'vc', 'vc', legato=True, swell=0.04, humanize=0.01)
    vcs.add('@v34 ' + roots_text(BREAK, 1, 'w', lo=38), S_BR)
    cbs = part('Basses sus', 'cb', 'cb', legato=True, swell=0.03, humanize=0.01, layers=2)
    cbs.add('@v32 ' + roots_text(BREAK, 0, 'w', lo=28), S_BR)
    trem = part('Violins trem', 'vln_trem', 'vln1', humanize=0.01)
    trem.add('@v26< ' + guide(BUILD, 74, 86, 76, pref=(2, 0, 1, 3)) + ' @v66', S_BLD)

    # pizzicato in B
    vcp = part('Cellos pizz', 'vc_pizz', 'vc', humanize=0.008)
    vcp.add('"pizz." ' + pizz_oompah(BSEC, 'vc', 0.46), S_B)
    cbp = part('Basses pizz', 'cb_pizz', 'cb', humanize=0.008)
    cbp.add(pizz_oompah(BSEC, 'cb', 0.48), S_B)
    vlap = part('Violas pizz', 'vla_pizz', 'vla', humanize=0.01, spread=0.012)
    vlap.add(pizz_oompah(BSEC, 'vla', 0.4), S_B)

    # brass
    hn = part('Horns', 'hn', 'hn', legato=True, swell=0.04, humanize=0.01, layers=2, gain=1.5)
    hn.add('@v48 A3:e D4:e D4:q. E4:e F#4:q | E4:h. r:q |', S_IN + 8)
    hn.add('@v58 ' + MEL_V, S_V1)
    hn.add('@v40 ' + guide(CHORUS1, 57, 67, 61), S_C1)
    hn.add('@v30 ' + guide(BSEC[16:], 56, 66, 61, dyn={7: .26}), S_B + 32)
    hn.add('@v46< ' + bars_of(MEL_BLD, 0, 2), S_BLD)
    hn.add('@v52< ' + guide(BUILD[4:8], 57, 66, 62), S_BLD + 8)
    hn.add('@v58< ' + octv(bars_of(MEL_BLD, 4, 8), -1) + ' @v74', S_BLD + 16)
    hn.add('@v46 ' + guide(VERSE, 57, 67, 61, dyn={8: .5}), S_V2)
    hn.add('@v66 ' + octv(MEL_C, -1), S_C2)
    tpt = part('Trumpet', 'tpt', 'tpt', legato=True, swell=0.03, humanize=0.007, gain=0)
    tpt.add('@v54 ' + PICKUP, S_C1 - 1)
    tpt.add('@v58 ' + MEL_C, S_C1)
    tpt.add('@v54< ' + bars_of(MEL_BLD, 2, 8) + ' @v74', S_BLD + 8)
    tpt.add('@v56 ' + MEL_V, S_V2)
    tpt.add('@v60 ' + PICKUP, S_C2 - 1)
    tpt.add('@v66 ' + MEL_C, S_C2)
    tbn = part('Trombone', 'tbn', 'tbn', legato=True, swell=0.05, humanize=0.01)
    tbn.add('@v36< E3:w~ | E3:w~ | E3:w~ | E3:w | @v64', S_BLD + 16)
    tbn.add('@v52 ' + guide(CHORUS2, 50, 60, 54, pref=(0, 2, 1, 3)), S_C2)

    # woodwinds
    fl = part('Flute', 'fl', 'fl', legato=True, swell=0.04, humanize=0.008)
    fl.add('@v44 ' + rests(7) + ' ' + BIRD8 + ' ' + rests(7) + ' ' + BIRD16, S_V1)
    fl.add('@v46 ' + rests(7) + ' ' + BIRD8, S_B)
    fl.add('@v50 ' + octv(bars_of(MEL_B, 8, 16), 1), S_B + 32)
    fl.add('@v38 ' + rests(3) + ' r:h. C#6:s A5:s F#5:e | ' + rests(3) + ' r:h. E6:s B5:s G#5:e |', S_BR)
    fl.add('@v50 ' + guide(CHORUS2, 76, 88, 81, pref=(1, 2, 0, 3)), S_C2)
    ob = part('Oboe', 'ob', 'ob', legato=True, swell=0.05, humanize=0.008)
    ob.add('@v54 ' + bars_of(MEL_B, 0, 8), S_B)
    ob.add('@v40 ' + bars_of(MEL_B, 8, 16), S_B + 32)
    ob.add('@v46 ' + guide(CHORUS2, 69, 81, 76, pref=(2, 1, 0, 3)), S_C2)
    cl = part('Clarinet', 'cl', 'cl', legato=True, swell=0.04, humanize=0.008)
    cl.add('@v40 ' + bars_of(MEL_V, 8, 16), S_V1 + 32)
    cl.add('@v42 ' + guide(BSEC, 57, 69, 61), S_B)
    bn = part('Bassoon', 'bn', 'bn', legato=True, swell=0.03, humanize=0.008)
    bn.add('@v40 ' + roots_text(BSEC, 1, 'h', lo=40), S_B)

    # keys and percussion
    pno = part('Piano RH', 'piano', 'piano', humanize=0.006, gate=0.92)
    pnl = part('Piano LH', 'piano', 'piano', humanize=0.006, gate=0.95)
    pno.add(piano_stabs(CHORUS1, 0.46), S_C1)
    pnl.add(piano_lh(CHORUS1, 0.42, 'oct'), S_C1)
    pno.add('@v46 ' + octdouble(MEL_BR), S_BR)
    pnl.add(piano_lh(BREAK, 0.34, 'broken'), S_BR)
    pno.add(piano_pulse(BUILD[8:], 0.34, 0.6), S_BLD + 16)
    pnl.add(piano_lh(BUILD[8:], 0.42, 'eighths'), S_BLD + 16)
    pno.add(piano_offbeats(VERSE, 0.38), S_V2)
    pnl.add(piano_lh(VERSE, 0.34, 'oct'), S_V2)
    pno.add(piano_stabs(CHORUS2, 0.5), S_C2)
    pnl.add(piano_lh(CHORUS2, 0.46, 'oct'), S_C2)
    hp = part('Harp', 'harp', 'harp', humanize=0.006, gate=1.4)
    hp.add(harp_arp(BSEC, 0.36), S_B)
    gl = part('Glockenspiel', 'glock', 'glock', humanize=0.004, gate=2.0)
    gl.add('@v36 ' + rests(7) + ' ' + BIRD8 + ' ' + rests(7) + ' ' + BIRD16, S_V2)
    gl.add('@v40 ' + octv(MEL_C, 1), S_C2)
    tp = part('Timpani', 'timp', 'timp', humanize=0.003, gate=1.0)
    tp.add('@v56 A2:q r:q r:h |', S_V1)
    tp.add('@v52 D3:q r:q r:h |', S_C1)
    tp.add('@v56 A2:q r:q r:h |', S_V2)
    tp.add('@v62 D3:q r:q r:h | ' + rests(7) + ' D3:q r:q r:h |', S_C2)
    tr = part('Timpani roll', 'timp_roll', 'timp', humanize=0.0, gate=1.0)
    tr.add('@v20< E2:w | @v44', S_IN + 12)
    tr.add('@v30< E2:w~ | E2:w | @v70', S_BLD + 24)

    # General MIDI: guitar, bass, drums, hand percussion
    G = GM('Guitar', 25, seat='gtr', gain=0.0)
    gm_strum(G, INTRO[2:], 4, vel=70, cres=82)
    gm_strum(G, VERSE, S_V1, vel=82)
    gm_strum(G, CHORUS1, S_C1, vel=92)
    gm_pick(G, BSEC, S_B, vel=66)
    gm_pick(G, BREAK, S_BR, vel=54, quarters=True)
    gm_strum(G, BUILD, S_BLD, vel=56, muted=True, cres=92)
    gm_strum(G, VERSE, S_V2, vel=86)
    gm_strum(G, CHORUS2, S_C2, vel=96)
    B = GM('Bass', 33, seat='bass', gain=0.0, send=0.5)
    gm_bass(B, INTRO[4:], 8, 'intro', vel=84)
    gm_bass(B, VERSE, S_V1, 'walk', vel=90)
    gm_bass(B, CHORUS1, S_C1, 'drive', vel=92)
    gm_bass(B, BUILD, S_BLD, 'pedal', vel=80)
    gm_bass(B, VERSE, S_V2, 'walk', vel=92)
    gm_bass(B, CHORUS2, S_C2, 'drive', vel=96)
    D = GM('Drums', 0, drum=True, seat='drums', gain=0.0, send=0.45)
    PC_ = GM('Hand perc', 0, drum=True, seat='perc', gain=0.0, send=0.6)
    gm_drums(D, PC_, S_IN, 4, 'intro', 1)
    gm_drums(D, PC_, S_V1, 16, 'verse', 2)
    gm_drums(D, PC_, S_C1, 16, 'chorus', 3)
    gm_drums(D, PC_, S_B, 16, 'b', 4)
    gm_drums(D, PC_, S_BR, 8, 'breakdown', 5)
    gm_drums(D, PC_, S_BLD, 8, 'build', 6)
    gm_drums(D, PC_, S_V2, 16, 'verse2', 7)
    gm_drums(D, PC_, S_C2, 16, 'chorus2', 8)

    tempo = Tempo([[0, 118], [4, 120], [S_BR - 2, 120], [S_BR + 2, 114], [S_BLD - 2, 114],
                   [S_BLD + 12, 120], [END, 120]])
    return P, [G, B, D, PC_], tempo


# ---------- checks ----------
WHITELIST = {('Trumpet', S_C1 + 36), ('Trumpet', S_C2 + 36), ('Violins I', S_C1 + 36), ('Violins I', S_C2 + 36),
             ('Horns', S_C2 + 36), ('Glockenspiel', S_C2 + 36)}    # chorus bar 10: A over E (appoggiatura)


def check_harmony(P, gms):
    bad = []
    for p in P:
        if p.patch.startswith('timp'):
            continue
        for b, d, keys, _ in p.notes:
            c = chord_at(b + 1e-6)
            ok = set(tones(c)) | {bassk(c) % 12}
            strong = abs((b % 2)) < 1e-6
            if d >= 0.75 or (strong and d >= 0.5):
                for k in keys:
                    if k % 12 not in ok and (p.name, round(b, 3)) not in WHITELIST:
                        bad.append((p.name, b, d, nm(k), c))
            # a long note that runs into the next chord: check that chord too
            if d > 1:
                for bb in np.arange(np.ceil((b + .01) / 2) * 2, b + d - .5, 2):
                    c2 = chord_at(bb + 1e-6)
                    ok2 = set(tones(c2)) | {bassk(c2) % 12}
                    for k in keys:
                        if k % 12 not in ok2 and (p.name, round(b, 3)) not in WHITELIST:
                            bad.append((p.name + ' (held)', bb, d, nm(k), c2))
    for g in gms:
        if g.drum:
            continue
        for b, d, k, v, j in g.ev:
            c = chord_at(b + 1e-6)
            ok = set(tones(c)) | {bassk(c) % 12}
            if g.name == 'Bass' and abs(b % 4 - 3) < 1e-6 and k % 12 in SCALE:
                continue        # the walking bass's approach note into the next bar
            if k % 12 not in ok and (d >= 0.75 or abs(b % 1) < 1e-6 and g.name == 'Guitar'):
                bad.append((g.name, b, d, nm(k), c))
    return bad


def section_map(tempo):
    rows = []
    for i, (n, s) in enumerate(SECTIONS):
        e = SECTIONS[i + 1][1] if i + 1 < len(SECTIONS) else END
        rows.append('  %-10s bars %3d-%3d  %6.1f-%6.1f s' % (n, s // 4 + 1, e // 4, tempo.sec(s), tempo.sec(e)))
    return '\n'.join(rows)


# ---------- rendering ----------
PRE = 0.25          # beats of pre-roll so early notes at a loop start keep their attacks


def fluid(gm, events, origin_s, work, tag):
    import pretty_midi
    pm = pretty_midi.PrettyMIDI(resolution=1920, initial_tempo=120)
    ins = pretty_midi.Instrument(program=gm.program, is_drum=gm.drum)
    for t, d, k, v in events:
        s = max(t - origin_s, 0.0)
        ins.notes.append(pretty_midi.Note(velocity=v, pitch=k, start=s, end=s + max(d, 0.03)))
    pm.instruments.append(ins)
    mid = os.path.join(work, '%s_%s.mid' % (gm.name.replace(' ', '_'), tag))
    wav = mid[:-4] + '.wav'
    pm.write(mid)
    subprocess.run(['fluidsynth', '-ni', '-g', '0.6', '-r', str(SR), '-R', '0', '-C', '0', '-O', 'float', '-T', 'wav',
                    '-F', wav, SF2, mid], check=True, capture_output=True)
    x, _ = sf.read(wav, dtype='float32')
    lat = 64                    # fluidsynth's block latency
    return x[lat:]


def gm_render(gm, tempo, b0, b1, origin_beat, work, tag):
    t0 = tempo.sec(origin_beat)
    evs = []
    for b, d, k, v, j in gm.ev:
        if b0 - 1e-6 <= b < b1 - 1e-6:
            on = tempo.sec(b) + j
            off = tempo.sec(b + d)
            evs.append((on, off - on, k, v))
    if not evs:
        return np.zeros((SR, 2), np.float32)
    return fluid(gm, evs, t0, work, tag)


def add_at(dst, src, i):
    if i < 0:
        src = src[-i:]
        i = 0
    n = min(len(src), len(dst) - i)
    if n > 0:
        dst[i:i + n] += src[:n]


def render_song(P, gms, tempo, outdir, work, excerpt=None):
    if excerpt:
        b0, b1 = (excerpt[0] - 1) * 4, excerpt[1] * 4
        lo, hi, reps = b0, b1, 1
        intro_n = 0
        N = int(round((tempo.sec(b1) - tempo.sec(b0)) * SR))
        total = N + 5 * SR
    else:
        lo, hi, reps = LS, END, 3
        intro_n = int(round(tempo.sec(LS) * SR))
        N = int(round((tempo.sec(END) - tempo.sec(LS)) * SR))
        total = intro_n + reps * N + 6 * SR
    pre_n = int(round((tempo.sec(lo) - tempo.sec(lo - PRE)) * SR)) if lo >= PRE else 0
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    rms = {}

    def lay(stem, seatkey, perf, name):
        seat = render.SEAT[seatkey]
        seat = dict(seat, **{k: perf[k] for k in ('pan', 'width', 'depth') if k in perf})
        d, s = render.place(stem, seat)
        g = 10 ** (perf.get('gain', 0) / 20)
        dry[:] += d * g
        send[:] += s * g * perf.get('send', 1.0)
        a = int(intro_n + (N if reps > 1 else 0))
        seg = d[a:a + N] * g
        rms[name] = float(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-12))
        print('  %-18s peak %.2f  rms %.1f dB' % (name, float(np.max(np.abs(d * g))), rms[name]), flush=True)

    for p in P:
        stem = np.zeros((total, 2), np.float32)
        if not excerpt and LS > 0:
            add_at(stem, render.render_part(p, tempo, 0, LS, 0), 0)
        body = render.render_part(p, tempo, lo, hi, lo - PRE)
        for k in range(reps):
            add_at(stem, body, intro_n + k * N - pre_n)
        if np.any(stem):
            lay(stem, SEATS[p.name], p.perf, p.name)
    for g in gms:
        stem = np.zeros((total, 2), np.float32)
        if not excerpt and LS > 0:
            add_at(stem, gm_render(g, tempo, 0, LS, 0, work, 'intro'), 0)
        body = gm_render(g, tempo, lo, hi, lo - PRE, work, 'body')
        for k in range(reps):
            add_at(stem, body, intro_n + k * N - pre_n)
        if np.any(stem):
            lay(stem, g.seat, dict(gain=g.gain, send=g.send), g.name)
    ir = render.hall_ir(seconds=2.8, rt_low=2.0, rt_mid=1.7, rt_high=0.9)
    wet = render.reverb(send, ir)
    del send
    mix = dry + wet * 0.6
    del dry, wet
    m = render.master(mix)
    del mix
    if excerpt:
        out = m[:N + 2 * SR]
    else:
        k = 1
        body = m[intro_n + k * N: intro_n + (k + 1) * N].copy()
        head = m[:intro_n].copy()
        f = int(0.06 * SR)
        w = np.linspace(0, 1, f)[:, None]
        e = intro_n + k * N
        head[-f:] = head[-f:] * (1 - w) + m[e - f:e] * w
        out = np.concatenate([head, body])
    out, l0, l1 = render.loudness(out, -18.0, -1.0)
    wav = os.path.join(work if excerpt else outdir, ID + ('_excerpt' if excerpt else '') + '.wav')
    sf.write(wav, out, SR, subtype='FLOAT')
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1, rms=rms)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(MUSIC, 'out', ID))
    ap.add_argument('--excerpt', nargs=2, type=int)
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    work = os.environ.get('MUSIC_WORK', os.path.join(a.out, 'work'))
    os.makedirs(work, exist_ok=True)
    P, gms, tempo = build_song()
    print(TITLE, '-', len(P), 'orchestral parts,', len(gms), 'GM layers')
    print(section_map(tempo))
    bad = check_harmony(P, gms)
    print('harmony check: %d notes outside the chord' % len(bad))
    for x in bad[:60]:
        print('   %-20s beat %6.2f (bar %d.%g) dur %.2f %-4s over %s' % (x[0], x[1], x[1] // 4 + 1, x[1] % 4 + 1, x[2], x[3], x[4]))
    if a.check:
        return
    info = render_song(P, gms, tempo, a.out, work, a.excerpt)
    if a.excerpt:
        build.spectrogram(info['wav'], os.path.join(work, ID + '_excerpt.png'), TITLE + ' (excerpt)')
        render.to_mp3(info['wav'], os.path.join(work, ID + '_excerpt.mp3'))
        print('excerpt', info['wav'], '%.1f s, %.1f LUFS' % (info['total_s'], info['lufs']))
        return
    ogg = os.path.join(a.out, ID + '.ogg')
    render.to_ogg(info['wav'], ogg, q=6)
    render.to_mp3(info['wav'], os.path.join(a.out, ID + '.mp3'))
    build.spectrogram(info['wav'], os.path.join(a.out, ID + '_spectrogram.png'), TITLE)
    seam = build.seam_check(info['wav'], info['intro_s'])
    x, _ = sf.read(info['wav'])
    pk = 20 * np.log10(np.abs(x).max())
    o = int(round(info['intro_s'] * SR))
    sf.write(os.path.join(work, ID + '_seam.wav'), np.concatenate([x[-4 * SR:], x[o:o + 4 * SR]]), SR)
    render.to_mp3(os.path.join(work, ID + '_seam.wav'), os.path.join(work, ID + '_loop_seam.mp3'))
    meta = dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(info['intro_s'], 6), loop_s=round(info['loop_s'], 6),
                total_s=round(info['total_s'], 3), lufs=round(info['lufs'], 2), bpm=BPM, key='A major',
                seam=[round(v, 5) for v in seam])
    json.dump(meta, open(os.path.join(a.out, 'info.json'), 'w'), indent=1)
    print('done: %.1f s (intro %.3f, loop %.3f), %.2f LUFS, peak %.2f dBFS, seam jump %.4f (99.9%% step %.4f, max %.4f)' % (
        info['total_s'], info['intro_s'], info['loop_s'], info['lufs'], pk, *seam))


if __name__ == '__main__':
    main()
