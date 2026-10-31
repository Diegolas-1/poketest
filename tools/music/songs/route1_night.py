"""Route 1 at night: "Fireflies in the Tall Grass" (original composition).

D Dorian / D minor with lifts to F major, 72 bpm, 4/4. Hushed and a little
mysterious (something rustles in the grass), but magical and safe: a harp
and celesta ostinato like fireflies blinking, a low clarinet singing under
a big moon, pizzicato footsteps, a quiet sustained string pad, soft-mallet
marimba, and only the lightest percussion (shaker, a soft wooden "tok",
finger-cymbal and bell-tree glints). No drum kit.

Form (bars, 72 bpm; the game loops bars 5-60, the intro plays once):
  Intro 1-4    harp + celesta ostinato appear, pad fades in, a flute call
  A    5-20    the tune on low clarinet (D Dorian); bars 13-20 add celesta,
               shaker and a high violin counterline; harp run into F
  B    21-36   lift to F major (the moon): flute melody, clarinet inner
               line, marimba, fuller pad with cellos arco
  C    37-48   the rustle in the grass: D minor, tremolo violins ppp,
               marimba and pizzicato cello ostinato, woodblock taps,
               clarinet fragments answered by flute, a bell-tree firefly
  A'   49-60   the tune returns on flute (8va) with celesta, clarinet
               countermelody, pizzicato violin sprinkles; thins out into
               the loop seam (A major -> D minor)

Instrumentation: VSCO 2 CE (harp, clarinet, flute, marimba, violins I/II,
violas, cellos quiet sustains + tremolo, pizzicato strings, GM-style
percussion map: log drum as a soft woodblock, triangle "finger cymbal"
taps, bell tree) + GeneralUser GS through fluidsynth (celesta, shaker),
all in the render.py concert hall.

Plays on Route 1 at night (9 PM - 5 AM). -20 LUFS.

  python3 tools/music/songs/route1_night.py --out DIR [--check]
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import render  # noqa: E402
import build  # noqa: E402
from score import Part, Tempo, midi  # noqa: E402
from sfz import SR  # noqa: E402

ID = 'route1_night'
TITLE = 'Fireflies in the Tall Grass'
BPB = 4
BPM = 72
GM_SF2 = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'

# ---------- extra instruments (added at run time, shared files untouched) ----------
render.ORCH.update({
    'vln_q': ('ViolinEnsSusVib-Quiet.sfz', -3.3, 0.7, 0.12),
    'vla_q': ('ViolaEnsSusVib-Quiet.sfz', -11.8, 0.7, 0.12),
    'vc_q': ('CelloEnsSusVib-Quiet.sfz', -2.3, 0.7, 0.12),
    'vln_trem': ('ViolinEnsTrem.sfz', 4.0, 0.6, 0.2),
    'perc': ('GM-StylePerc.sfz', 0.0, None, None),
})
render.SUSTAINED.update({'vln_q', 'vla_q', 'vc_q', 'vln_trem'})
render.SEAT.update({
    'celesta': dict(pan=0.42, width=0.45, depth=0.6),
    'shaker': dict(pan=-0.32, width=0.3, depth=0.75),
    'wood': dict(pan=0.38, width=0.3, depth=0.8),
    'glint': dict(pan=0.15, width=0.6, depth=0.85),
    'trem': dict(pan=-0.4, width=0.7, depth=0.3),
})

NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
PCN = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'Eb': 3, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7,
       'G#': 8, 'Ab': 8, 'A': 9, 'Bb': 10, 'A#': 10, 'B': 11}


def nm(k):
    return NOTE[k % 12] + str(k // 12 - 1)


# chord: bass, pad voicing (low..high), root, third interval, colour interval
# (9th 14 / octave 12 / 7th 10), chord tones, allowed tensions
CH = {}
for n, bass, pad, root, th, col, tones, tens in [
    ('Dm', 'D2', 'A3 D4 F4', 'D', 3, 14, 'D F A', 'E C G'),
    ('G/D', 'D2', 'G3 B3 D4', 'G', 4, 14, 'G B D', 'A E'),
    ('C', 'C2', 'G3 C4 E4', 'C', 4, 14, 'C E G', 'D A'),
    ('C7', 'C2', 'G3 Bb3 E4', 'C', 4, 14, 'C E G Bb', 'D'),
    ('Bbmaj7', 'Bb1', 'A3 D4 F4', 'Bb', 4, 14, 'Bb D F A', 'C G'),
    ('Am7', 'A1', 'G3 C4 E4', 'A', 3, 10, 'A C E G', 'D'),
    ('F', 'F2', 'A3 C4 F4', 'F', 4, 14, 'F A C', 'G D E'),
    ('Gm7', 'G1', 'Bb3 D4 F4', 'G', 3, 14, 'G Bb D F', 'A C'),
    ('Csus4', 'C2', 'G3 C4 F4', 'C', 5, 14, 'C F G', 'D Bb'),
    ('C/E', 'E2', 'G3 C4 E4', 'C', 4, 14, 'C E G', 'D A'),
    ('Dm7', 'D2', 'A3 C4 F4', 'D', 3, 14, 'D F A C', 'E G'),
    ('F/A', 'A1', 'A3 C4 F4', 'F', 4, 14, 'F A C', 'G D'),
    ('Bb/C', 'C2', 'Bb3 D4 F4', 'C', 5, 10, 'C F Bb D', 'G'),
    ('Asus4', 'A1', 'A3 D4 E4', 'A', 5, 12, 'A D E', 'G B'),
    ('A', 'A1', 'A3 C#4 E4', 'A', 4, 12, 'A C# E', ''),
    ('Bbmaj7/D', 'D2', 'A3 D4 F4', 'Bb', 4, 14, 'Bb D F A', 'C G'),
    ('Gm/D', 'D2', 'Bb3 D4 G4', 'G', 3, 14, 'G Bb D', 'A F'),
]:
    CH[n] = dict(bass=bass, pad=pad.split(), root=PCN[root], th=th, col=col,
                 tones={PCN[t] for t in tones.split()}, tens={PCN[t] for t in tens.split()})


def bars(s):
    """'Dm | G/D | Asus4 A' -> half-bar list (one name = whole bar)."""
    out = []
    for b in s.split('|'):
        c = b.split()
        out += c * 2 if len(c) == 1 else c
    return out


INTRO = bars('Dm | G/D | Dm | Asus4 A')
A_SEC = bars('Dm | G/D | Dm | C | Bbmaj7 | C | Am7 | Dm | Dm | G/D | F | C | Bbmaj7 | Gm7 | Csus4 | C7')
B_SEC = bars('F | C/E | Dm7 | Bbmaj7 | F/A | Gm7 | Bb/C | C7 | F | Am7 | Bbmaj7 | F/A | Gm7 | Bbmaj7 | Gm7 | Asus4 A')
C_SEC = bars('Dm | Bbmaj7/D | Gm/D | Dm | Bbmaj7 | C | Dm | Dm | Gm7 | Am7 | Bbmaj7 | Asus4 A')
A2_SEC = bars('Dm | G/D | Dm | C | Bbmaj7 | C | Am7 | Dm | Bbmaj7 | C | Asus4 | A')
HARM = INTRO + A_SEC + B_SEC + C_SEC + A2_SEC

S_IN, S_A, S_B, S_C, S_A2 = 0, 16, 80, 144, 192
END = S_A2 + len(A2_SEC) * 2          # 240
SECTIONS = [('Intro', S_IN), ('A', S_A), ('B', S_B), ('C', S_C), ("A'", S_A2), ('end', END)]


def chord_at(beat):
    return HARM[int(beat // 2)]


# ---------- melodies ----------
MEL_A1 = """r:e A3:e D4:e E4:e F4:q. E4:e | D4:e E4:e B3:h. | r:e A3:e D4:e E4:e F4:q A4:q | G4:q. E4:e C4:h |
r:e D4:e F4:e A4:e Bb4:q. A4:e | G4:q. F4:e E4:q C4:q | E4:q. D4:e C4:q E4:q | D4:h. r:q |"""
MEL_A2 = """r:e A3:e D4:e E4:e F4:q. E4:e | D4:e E4:e B3:h. | r:e C4:e F4:e G4:e A4:q. C5:e | G4:h E4:q G4:q |
A4:q. G4:e F4:q D4:q | Bb4:q. A4:e G4:q F4:q | F4:h G4:q. F4:e | E4:h. r:q |"""
MEL_B = """C5:h. A4:e C5:e | D5:q. C5:e G4:h | F5:h. E5:e D5:e | D5:q. C5:e A4:h |
C5:h. A4:e C5:e | D5:q. C5:e Bb4:h | C5:q D5:q F5:q G5:q | E5:h. G5:q |
A5:h. G5:e F5:e | E5:q. G5:e C5:h | D5:h F5:q A5:q | G5:q. F5:e C5:h |
D5:q. C5:e Bb4:q D5:q | F5:h D5:h | C5:q. Bb4:e A4:q G4:q | A4:w |"""
TAIL_A2 = """r:e D5:e F5:e A5:e Bb5:q. A5:e | G5:q. E5:e C5:h | D5:w | C#5:h r:h |"""


def octv(text, n):
    import re
    return re.sub(r'([A-G](?:#|b)?)(-?\d)(?=[:,~])', lambda m: m.group(1) + str(int(m.group(2)) + n), text)


# ---------- accompaniment generators (half-bar harmony lists) ----------
def per_bar(harm, fn):
    out = []
    for i in range(0, len(harm), 2):
        out.append(fn(harm[i], harm[i + 1], i // 2) + ' |')
    return ' '.join(out)


def root_in(c, lo, hi):
    k = lo + ((CH[c]['root'] - lo) % 12)
    return k if k <= hi else k - 12


def harp_shape(c, wide=False):
    d = CH[c]
    r = root_in(c, 43, 54)
    t = d['th'] + 12
    if wide:
        iv = [0, 7, d['col'], t, 19, t + 12, 19, t]
    else:
        iv = [0, 7, d['col'], t, 19, t, d['col'], 7]
    return [r + x for x in iv]


def harp_ost(harm, wide=False):
    def bar(a, b, i):
        if a == b:
            ks = harp_shape(a, wide)
        else:
            ks = harp_shape(a, wide)[:4] + harp_shape(b, wide)[:4]
        return ' '.join('%s:e' % nm(k) for k in ks)
    return per_bar(harm, bar)


def harp_sparse(harm):
    """C section: a low rolled chord on 1, a high colour note on 3-and."""
    def bar(a, b, i):
        d = CH[a]
        r = root_in(a, 43, 54)
        ch = ','.join(nm(x) for x in (r, r + 7, r + d['th'] + 12))
        hi = nm(root_in(b, 67, 78) + CH[b]['col'] % 12 if CH[b]['col'] != 12 else root_in(b, 67, 78) + 7)
        return '%s:h r:e %s:e r:q' % (ch, hi)
    return per_bar(harm, bar)


def cel_notes(c):
    d = CH[c]
    pcs = {(d['root'] + x) % 12 for x in (0, d['th'], 7, d['col'])}
    return [k for k in range(74, 92) if k % 12 in pcs]


def celesta_ost(harm, light=False):
    """3+3+2 sixteenths: two twinkling groups per bar."""
    def grp(c, which):
        S = cel_notes(c)
        g = [S[-1], S[-3], S[-2]] if which == 0 else [S[-2], S[-1], S[-4]]
        return '%s:e. %s:e. %s:e' % tuple(nm(k) for k in g)

    def bar(a, b, i):
        if light:
            return grp(a, i % 2) + ' r:h'
        return grp(a, 0) + ' ' + grp(b, 1)
    return per_bar(harm, bar)


def pad_line(harm, voice, shift=0):
    toks, out = [], []
    for i, c in enumerate(harm):
        toks.append(midi(CH[c]['pad'][voice]) + 12 * shift)
    for i, k in enumerate(toks):
        nxt = toks[i + 1] if i + 1 < len(toks) else None
        out.append('%s:h%s' % (nm(k), '~' if nxt == k else ''))
        if i % 2 == 1:
            out.append('|')
    return ' '.join(out)


def bass_line(harm, octave, style):
    def bar(a, b, i):
        k1 = midi(CH[a]['bass']) + 12 * octave
        k2 = midi(CH[b]['bass']) + 12 * octave
        if style == 'pizz':        # root on 1, fifth (or the new bass) on 3
            if a != b:
                f = k2
            elif CH[a]['root'] == k1 % 12 and k1 + 7 < 60:
                f = k1 + 7
            else:
                f = k1
            return '%s:q r:q %s:q r:q' % (nm(k1), nm(f))
        if style == 'one':         # a single pluck on 1
            return '%s:q r:h.' % nm(k1)
        if style == 'rustle':      # syncopated footsteps in the grass
            return '%s:e r:e r:e %s:e r:e %s:e r:q' % (nm(k1), nm(k1 + 7 if k1 + 7 < 62 else k1 - 5), nm(k2))
        if style == 'arco':
            return ('%s:w' % nm(k1)) if k1 == k2 else '%s:h %s:h' % (nm(k1), nm(k2))
    return per_bar(harm, bar)


def marimba_q(harm):
    def bar(a, b, i):
        p = [midi(x) for x in CH[a]['pad']]
        q = [midi(x) for x in CH[b]['pad']]
        if i % 2 == 0:
            return 'r:q %s:q %s:q %s:q' % (nm(p[0]), nm(q[1]), nm(q[2]))
        return 'r:q %s:q %s:q %s:q' % (nm(p[2]), nm(q[1]), nm(q[0]))
    return per_bar(harm, bar)


def marimba_rustle(harm):
    def shape(c):
        d = CH[c]
        r = root_in(c, 57, 68)
        col = d['col'] if d['col'] != 12 else 7
        return [r, r + 7, r + d['th'], r + 7, r + col - 12 if col > 12 else r + col, r + 7, r + d['th'], r + 7]

    def bar(a, b, i):
        ks = shape(a)[:4] + shape(b)[4:]
        return ' '.join('%s:e' % nm(k) for k in ks)
    return per_bar(harm, bar)


def vln_sprinkle(harm):
    def bar(a, b, i):
        p = [midi(x) + 12 for x in CH[a]['pad']]
        q = [midi(x) + 12 for x in CH[b]['pad']]
        if i % 2 == 0:
            return 'r:e %s:e r:q r:e %s:e r:q' % (nm(p[2]), nm(q[1]))
        return 'r:q r:e %s:e r:e %s:e r:q' % (nm(p[1]), nm(q[2]))
    return per_bar(harm, bar)


def shaker(nbars, lvl='@pp'):
    return lvl + ' ' + ' '.join(' '.join(['A#5:s'] * 16) + ' |' for _ in range(nbars))


def rests(n):
    return ' '.join(['r:w |'] * n)


# ---------- the score ----------
def build_parts():
    P = []

    def part(n, patch, **perf):
        P.append(Part(n, patch, '', 0, BPB, **perf))
        return P[-1]

    # harp: the firefly ostinato
    harp = part('Harp', 'harp', humanize=0.006, gate=1.6, gain=-2.5, pan=-0.42)
    harp.add('@pp< ' + harp_ost(INTRO) + ' @p', S_IN)
    harp.add('@pp ' + harp_ost(A_SEC[:16]) + ' @p ' + harp_ost(A_SEC[16:28]), S_A)
    # bar 16 of A: a run up into F major
    harp.add('@p C3:e G3:e E4:e G4:e @p< C4:s D4:s E4:s F4:s G4:s A4:s Bb4:s C5:s |', S_A + 60)
    harp.add('@mp ' + harp_ost(B_SEC[:30], wide=True), S_B)
    harp.add('@mp> A2:e E3:e A3:e D4:e @p A2:e E3:e A3:e C#4:e |', S_B + 60)
    harp.add('@p ' + harp_sparse(C_SEC[:22]), S_C)
    harp.add('@p A2:e E3:e A3:e D4:e @p< A3:s C#4:s E4:s A4:s C#5:s E5:s A5:s C#6:s |', S_C + 44)
    harp.add('@p ' + harp_ost(A2_SEC[:20]), S_A2)
    harp.add('@p> ' + harp_ost(A2_SEC[20:]) + ' @pp', S_A2 + 40)

    # celesta (GM): twinkles
    cel = part('Celesta', 'gm:8', humanize=0.005, gate=1.0, gain=8.0)
    cel.add('@p ' + celesta_ost(INTRO), S_IN)
    cel.add('@pp< ' + celesta_ost(A_SEC[16:]) + ' @p', S_A + 32)
    cel.add('@pp ' + celesta_ost(B_SEC[:30], light=True) + ' r:w |', S_B)
    cel.add('@pp r:w | r:h. D6:e A5:e | r:w | r:w | r:w | r:h r:e G5:e C6:e E6:e | r:w | r:w | r:w | r:h. E6:e C6:e | r:w | r:w |', S_C)
    cel.add('@p ' + celesta_ost(A2_SEC[:20]), S_A2)
    cel.add('@p> ' + celesta_ost(A2_SEC[20:22]) + ' @pp r:h. E6:s C#6:s A5:s E5:s |', S_A2 + 40)

    # melody: clarinet (A), flute (B), clarinet + flute fragments (C), flute (A')
    cl = part('Clarinet', 'cl', legato=True, humanize=0.008, swell=0.05)
    cl.add('@mp ' + MEL_A1 + ' ' + MEL_A2, S_A)
    cl.add('@p A3:w | G3:w | A3:w | F3:w | A3:h C4:h | Bb3:w | Bb3:h D4:h | G3:h E3:h | '
           'C4:w | C4:h E4:h | D4:w | C4:w | Bb3:w | A3:w | D4:h Bb3:h | D4:h C#4:h |', S_B)
    cl.add('@p r:h r:e A3:e D4:e F4:e | A4:h. r:q | r:h r:e G3:e Bb3:e D4:e | F4:h. r:q | r:w | r:w | '
           '@mp r:e A3:e D4:e E4:e F4:q. E4:e | D4:h r:h | @p< Bb3:q D4:q F4:q G4:q | C4:q E4:q G4:q A4:q | '
           'D4:h F4:h | @mp> E4:h. r:q |', S_C)
    cl.add('@pp F4:h A4:h | G4:h D4:h | F4:h A4:h | G4:h E4:h | F4:h D4:h | E4:h G4:h | E4:h C4:h | D4:w | '
           'D4:w | E4:w | @pp> E4:h D4:h | C#4:h. r:q | @ppp', S_A2)

    fl = part('Flute', 'fl', legato=True, humanize=0.008, swell=0.05, gain=3.0)
    fl.add('@pp r:w | r:w | r:h. A4:e D5:e | E5:w |', S_IN)
    fl.add('@mp< ' + MEL_B[:MEL_B.index('A5:h.')] + '@mf ' + MEL_B[MEL_B.index('A5:h.'):], S_B)
    fl.add('@pp r:w | r:w | r:w | r:w | r:e F4:e A4:e D5:e C5:h | G4:h. r:q | r:w | r:w | '
           '@p< D4:q F4:q A4:q Bb4:q | E4:q G4:q A4:q C5:q | A4:h D5:h | @mp D5:h C#5:h |', S_C)
    fl.add('@mp ' + octv(MEL_A1, 1) + ' @mp> ' + TAIL_A2 + ' @pp', S_A2)

    # high violin counterline in A bars 9-16
    v1 = part('Violins I', 'vln_q', legato=True, humanize=0.012, swell=0.06, cents=2)
    v1.add('@ppp< A4:w | B4:w | C5:w | G4:w | F4:w | Bb4:w | C5:w | @pp> Bb4:w | @ppp', S_A + 32)
    v1.add('@pp< ' + pad_line(B_SEC[:16], 2, 1) + ' @p ' + pad_line(B_SEC[16:], 2, 1) + ' @pp', S_B)

    # string pad
    v2 = part('Violins II', 'vln_q', legato=True, humanize=0.012, swell=0.05, cents=-3)
    va = part('Violas', 'vla_q', legato=True, humanize=0.012, swell=0.05)
    vc = part('Cellos', 'vc_q', legato=True, humanize=0.012, swell=0.04)
    v2.add('@ppp< ' + pad_line(INTRO, 2) + ' @pp', S_IN)
    va.add('@ppp< ' + pad_line(INTRO, 1) + ' @pp', S_IN)
    v2.add('@pp ' + pad_line(A_SEC, 2), S_A)
    va.add('@pp ' + pad_line(A_SEC, 1), S_A)
    vc.add('@ppp ' + rests(8) + ' ' + bass_line(A_SEC[16:], 1, 'arco'), S_A)
    v2.add('@pp< ' + pad_line(B_SEC[:16], 2) + ' @p ' + pad_line(B_SEC[16:], 2) + ' @pp', S_B)
    va.add('@pp< ' + pad_line(B_SEC[:16], 1) + ' @p ' + pad_line(B_SEC[16:], 1) + ' @pp', S_B)
    vc.add('@pp< ' + bass_line(B_SEC[:16], 1, 'arco') + ' @pp ' + bass_line(B_SEC[16:], 1, 'arco') + ' @pp', S_B)
    va.add('@ppp ' + pad_line(C_SEC, 0), S_C)
    vc.add('@ppp ' + rests(8) + ' ' + bass_line(C_SEC[16:], 1, 'arco'), S_C)
    v2.add('@pp ' + pad_line(A2_SEC, 2) + ' @ppp', S_A2)
    va.add('@pp ' + pad_line(A2_SEC, 1) + ' @ppp', S_A2)
    vc.add('@ppp ' + bass_line(A2_SEC, 1, 'arco'), S_A2)

    trem = part('Violins trem', 'vln_trem', legato=True, humanize=0.012, swell=0.08)
    trem.add('@ppp ' + pad_line(C_SEC, 2, 1) + ' @ppp', S_C)

    # pizzicato
    vcp = part('Cellos pizz', 'vc_pizz', humanize=0.008)
    cbp = part('Basses pizz', 'cb_pizz', humanize=0.008)
    vcp.add('@pp ' + rests(2) + ' ' + bass_line(INTRO[4:], 1, 'one'), S_IN)
    vcp.add('@p ' + bass_line(A_SEC, 1, 'pizz'), S_A)
    cbp.add('@p ' + bass_line(A_SEC, 0, 'one'), S_A)
    cbp.add('@p ' + bass_line(B_SEC, 0, 'one'), S_B)
    vcp.add('@p ' + bass_line(C_SEC, 1, 'rustle'), S_C)
    cbp.add('@pp ' + bass_line(C_SEC, 0, 'one'), S_C)
    vcp.add('@p ' + bass_line(A2_SEC, 1, 'pizz'), S_A2)
    cbp.add('@p ' + bass_line(A2_SEC, 0, 'one'), S_A2)
    v1p = part('Violins I pizz', 'vln_pizz', humanize=0.007, gain=-2)
    v1p.add('@pp ' + vln_sprinkle(A2_SEC[:20]), S_A2)

    # marimba, soft mallets
    mar = part('Marimba', 'marimba', humanize=0.006, gate=1.3, gain=3.5)
    mar.add('@pp ' + marimba_q(B_SEC[:30]) + ' r:w |', S_B)
    mar.add('@pp< ' + marimba_rustle(C_SEC[:16]) + ' @p ' + marimba_rustle(C_SEC[16:22]) + ' r:w |', S_C)

    # percussion: shaker (GM), woodblock, finger cymbals, bell tree (VSCO map)
    sh = part('Shaker', 'gmdrum', humanize=0.004, gate=0.5,
              accent=[1.0, 0.42, 0.68, 0.45], gain=8.0)
    sh.add(shaker(8, '@pp<') + ' @p', S_A + 32)
    sh.add(shaker(4, '@pp') + ' ' + shaker(12, '@p'), S_B)
    sh.add(shaker(6, '@pp<') + ' @p', S_C + 16)
    sh.add(shaker(10, '@p') + ' @pp', S_A2)

    wood = part('Woodblock', 'perc', humanize=0.006, gate=1.0, gain=-6)
    # the rustle: E5 = log drum high, F5 = low
    wpat = 'r:h. r:e E5:e | r:q F5:e r:e r:h | r:h. r:e E5:s E5:s | r:h F5:q r:q |'
    wood.add('@pp ' + wpat + ' ' + wpat + ' @p ' + wpat, S_C)
    wood.add('@pp ' + 'r:w | r:h. E5:q | ' * 4 + 'r:w | r:w | r:w | r:w |', S_A2)
    wood.add('@pp r:w | r:w | r:w | r:h. E5:q | r:w | r:w | r:w | r:h. E5:q | r:w | r:w | r:w | r:h. E5:q | r:w | r:w | r:w | r:w |', S_B)

    glint = part('Glints', 'perc', humanize=0.004, gate=1.0, gain=8)
    # G#5 = small triangle muted (finger cymbal), F#5 = triangle muted, C6 / D6 = bell tree
    glint.add('@pp C6:w | r:w | G#5:q r:h. | r:w |', S_IN)
    glint.add('@pp G#5:q r:h. | r:w | r:w | r:h r:e G#5:e r:q | G#5:q r:h. | r:w | r:w | r:w | '
              'G#5:q r:h. | r:w | r:w | r:w | F#5:q r:h. | r:w | r:w | r:h. @p D6:q |', S_A)
    glint.add('@pp G#5:q r:h. | r:w | r:w | r:w | G#5:q r:h. | r:w | r:w | r:h r:e G#5:e r:q | '
              'G#5:q r:h. | r:w | r:w | r:w | G#5:q r:h. | r:w | r:w | r:h. C6:q |', S_B)
    glint.add('@pp G#5:q r:h. | r:w | r:w | r:w | F#5:q r:h. | r:w | @p D6:w | r:w | '
              '@pp G#5:q r:h. | r:w | r:w | r:h. C6:q |', S_C)
    glint.add('@pp G#5:q r:h. | r:w | r:w | r:h r:e G#5:e r:q | G#5:q r:h. | r:w | r:w | r:w | '
              'F#5:q r:h. | r:w | r:w | r:w |', S_A2)

    tempo = Tempo([[0, 66], [4, 72], [S_A - 2, 72], [S_A, 70], [S_A + 1, 72],
                   [S_B - 2, 72], [S_B, 68], [S_B + 1.5, 72],
                   [S_C - 2, 72], [S_C, 69], [S_C + 1, 72],
                   [S_A2 - 2, 72], [S_A2, 69], [S_A2 + 1, 72],
                   [END - 3, 72], [END, 70]])
    return P, tempo


SEATS = {
    'Harp': 'harp', 'Celesta': 'celesta', 'Clarinet': 'cl', 'Flute': 'fl',
    'Violins I': 'vln1', 'Violins II': 'vln2', 'Violas': 'vla', 'Cellos': 'vc',
    'Violins trem': 'trem', 'Cellos pizz': 'vc', 'Basses pizz': 'cb', 'Violins I pizz': 'vln1',
    'Marimba': 'marimba', 'Shaker': 'shaker', 'Woodblock': 'wood', 'Glints': 'glint',
}
PITCHED_CHECK = ['Harp', 'Celesta', 'Clarinet', 'Flute', 'Violins I', 'Violins II', 'Violas', 'Cellos',
                 'Violins trem', 'Cellos pizz', 'Basses pizz', 'Violins I pizz', 'Marimba']


# ---------- harmony check ----------
def check(P):
    bad, soft = [], 0
    for p in P:
        if p.name not in PITCHED_CHECK:
            continue
        for b, d, keys, ps in p.notes:
            c = CH[chord_at(b)]
            for k in keys:
                pc = k % 12
                if pc in c['tones'] or pc in c['tens']:
                    continue
                strong = abs(b - round(b)) < 1e-6
                semi = any((pc - t) % 12 in (1, 11) for t in c['tones'])
                if d <= 0.5 and not strong:
                    soft += 1           # a short passing note off the beat
                    continue
                bad.append('%-15s bar %5.2f %-9s %s%s' % (p.name, b / 4 + 1, chord_at(b), nm(k),
                                                         ' CLASH' if semi else ' (non-chord)'))
    for p in P:
        if p.end > END + 1e-6:
            bad.append('%s runs past the end: %.2f' % (p.name, p.end))
    return bad, soft


# ---------- rendering ----------
def render_gm(part, tempo, b0, b1, origin, work, tag):
    import pretty_midi as pm
    notes = [n for n in part.notes if b0 - 1e-6 <= n[0] < b1 - 1e-6]
    if not notes:
        return np.zeros((SR, 2), np.float32)
    drum = part.patch == 'gmdrum'
    prog = 0 if drum else int(part.patch.split(':')[1])
    m = pm.PrettyMIDI(initial_tempo=120)
    ins = pm.Instrument(prog, is_drum=drum)
    PRE = 0.5
    t0 = tempo.sec(origin)
    hum = part.perf.get('humanize', 0.006)
    acc = part.perf.get('accent')
    for b, d, keys, _ in notes:
        rng = np.random.default_rng(render._seed(part.name, round(b, 4), tuple(keys)))
        on = tempo.sec(b) - t0 + rng.normal(0, hum) + PRE
        off = tempo.sec(b + d) - t0 + PRE
        dur = max((off - on) * part.perf.get('gate', 0.94), 0.04)
        lv = part.level(b) + rng.normal(0, 0.03)
        if acc:
            lv *= acc[int(round((b % 1) * 4)) % len(acc)]
        vel = int(np.clip(10 + 120 * lv, 1, 127))
        for k in keys:
            ins.notes.append(pm.Note(vel, k, max(on, 0.0), max(on, 0.0) + dur))
    m.instruments = [ins]
    mid = os.path.join(work, 'gm_%s_%s.mid' % (part.name.replace(' ', '_'), tag))
    wav = mid[:-4] + '.wav'
    m.write(mid)
    subprocess.run(['fluidsynth', '-ni', '-R', '0', '-C', '0', '-g', '0.6', '-r', str(SR), '-F', wav, GM_SF2, mid],
                   check=True, capture_output=True)
    a, sr = sf.read(wav, dtype='float32', always_2d=True)
    a = a[int(PRE * SR):]
    return a.astype(np.float32)


def render_song(P, tempo, ls, le, work, seats):
    intro_s = tempo.sec(ls)
    loop_s = tempo.sec(le) - intro_s
    intro_n = int(round(intro_s * SR))
    N = int(round(loop_s * SR))
    reps = 3
    total = intro_n + reps * N + 6 * SR
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    report = []
    for p in P:
        seat = render.SEAT[seats.get(p.name, p.name)]
        seat = dict(seat, **{k: p.perf[k] for k in ('pan', 'width', 'depth') if k in p.perf})
        stem = np.zeros((total, 2), np.float32)
        gm = p.patch.startswith('gm')
        if ls > 0:
            a = render_gm(p, tempo, 0, ls, 0, work, 'intro') if gm else render.render_part(p, tempo, 0, ls, 0)
            stem[:min(len(a), total)] += a[:total]
        lp = render_gm(p, tempo, ls, le, ls, work, 'loop') if gm else render.render_part(p, tempo, ls, le, ls)
        for k in range(reps):
            i = intro_n + k * N
            seg = lp[:max(0, total - i)]
            stem[i:i + len(seg)] += seg
        d, s = render.place(stem, seat)
        g = 10 ** (p.perf.get('gain', 0) / 20)
        dry += d * g
        send += s * g * p.perf.get('send', 1.0)
        seg = d[intro_n + 2 * N: intro_n + 3 * N] * g
        secs = []
        for (n_, b0_), (_, b1_) in zip(SECTIONS[1:], SECTIONS[2:]):
            i0 = int((tempo.sec(b0_) - intro_s) * SR)
            i1 = int((tempo.sec(b1_) - intro_s) * SR)
            secs.append('%s %6.1f' % (n_, 20 * np.log10(np.sqrt(np.mean(seg[i0:i1] ** 2)) + 1e-12)))
        print('  part %-16s peak %6.1f dB | rms by section: %s' % (
            p.name, 20 * np.log10(np.abs(seg).max() + 1e-12), '  '.join(secs)))
        del stem, d, s
    ir = render.hall_ir(seconds=3.6, rt_low=2.8, rt_mid=2.3, rt_high=1.2)
    wet = render.reverb(send, ir)
    mix = dry + wet * 0.85
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
    out, l0, l1 = render.loudness(out, target=-20.0, ceiling_db=-1.0)
    wav = os.path.join(work, ID + '.wav')
    sf.write(wav, out, SR, subtype='FLOAT')
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1,
                peak=20 * np.log10(np.abs(out).max()))


def section_map(tempo):
    lines = []
    for (n, b), (_, b2) in zip(SECTIONS, SECTIONS[1:]):
        t0, t1 = tempo.sec(b), tempo.sec(b2)
        lines.append('%-6s bars %2d-%2d  %6.1f - %6.1f s  (file %d:%04.1f)' % (
            n, b // 4 + 1, b2 // 4, t0, t1, int(t0 // 60), t0 % 60))
    return lines


def main():
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else '.'
    os.makedirs(out, exist_ok=True)
    work = os.environ.get('MUSIC_WORK', os.path.join(out, 'work'))
    os.makedirs(work, exist_ok=True)
    P, tempo = build_parts()
    bad, soft = check(P)
    print('harmony check: %d flagged, %d short passing notes' % (len(bad), soft))
    for x in bad:
        print('  ', x)
    print('\n'.join(section_map(tempo)))
    if '--check' in sys.argv:
        return
    info = render_song(P, tempo, S_A, END, work, SEATS)
    ogg = os.path.join(out, ID + '.ogg')
    render.to_ogg(info['wav'], ogg, q=6)
    render.to_mp3(info['wav'], os.path.join(out, ID + '.mp3'))
    build.spectrogram(info['wav'], os.path.join(out, ID + '_spectrogram.png'), TITLE)
    seam = build.seam_check(info['wav'], info['intro_s'])
    x, sr = sf.read(info['wav'])
    o = int(round(info['intro_s'] * sr))
    sf.write(os.path.join(work, ID + '_seam.wav'), np.concatenate([x[-4 * sr:], x[o:o + 4 * sr]]), sr)
    render.to_mp3(os.path.join(work, ID + '_seam.wav'), os.path.join(work, ID + '_loop_seam.mp3'))
    meta = dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(info['intro_s'], 6),
                loop_s=round(info['loop_s'], 6), total_s=round(info['total_s'], 3),
                lufs=round(info['lufs'], 2), bpm=BPM, key='D Dorian / D minor (lifts to F major)',
                seam=[round(v, 5) for v in seam])
    json.dump(meta, open(os.path.join(out, 'info.json'), 'w'), indent=1)
    print('%.1f s (intro %.2f, loop %.2f), %.2f LUFS, peak %.2f dBFS, seam jump %.4f (99.9%% %.4f, max %.4f)' % (
        info['total_s'], info['intro_s'], info['loop_s'], info['lufs'], info['peak'], *seam))


if __name__ == '__main__':
    main()
