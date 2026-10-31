"""Route 1 wild battle: "Tall Grass Ambush" (original composition).

A Pidgey or Spearow bursts out of the tall grass, a Rattata ambush: the
battle music for wild Pokemon on Route 1. Wilder and more urgent than the
town battle: rustic, feral, the grass whipping around, adrenaline.

A minor with Dorian colour (F sharp: the D major chord), 160 bpm, 4/4, the
kit and the stabs often in a 3+3+2 grouping of eighths.

Form (bars, loop bars counted from the loop start):
  Intro  i1-i4   the ambush hit: tutti A minor stab, stabs F-G-Am and
                 C-D-E in 3+3+2, an E chord with a timpani roll, tom fill
                 and a string run up (plays once while the ink bands sweep)
  G      1-4     groove: growling bass riff, spiccato low strings, horn call
                 and trombone answer
  A      5-20    the hook: a fiddle (solo violin) tune over a lament bass
                 (A G F# F E), flute joins for the answer
  B      21-36   horns sing a broad tune (F G Em Am Dm G C E ...), tribal
                 toms and taiko, string tremolo; trumpets take it up an
                 octave in the second half with horns in thirds
  C      37-48   breakdown: Dorian vamp (Am D/A), toms and shaker only,
                 fiddle and clarinet / flute trade licks, then a build
                 (F F E E) with snare and timpani rolls
  A''    49-64   tutti hook: violins, solo violin, flute, xylophone, trumpet
                 countermelody, horn pads, timpani at the peaks
  Link   65-72   brass stabs in 3+3+2 (F G Am Am F G E E), tom fill back to G
The game loops bars 1-72 (108 s); the intro (6 s) plays once.

Instrumentation: VSCO 2 CE (solo violin sustain and spiccato, violin /
viola / cello / bass ensembles in spiccato, sustain and tremolo, flute,
piccolo, clarinet, F horns sustain and staccato, trumpets, trombones, tuba,
timpani hits and rolls, xylophone) plus General MIDI from GeneralUser GS
(drum kit with toms and shaker, picked electric bass with a growl, taiko),
all in one concert hall, mastered to -16 LUFS (battle).

  python3 tools/music/songs/battle_route1.py --out DIR [--excerpt A B] [--check]
"""
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

import render  # noqa: E402
import build  # noqa: E402
from score import Part, Tempo, midi  # noqa: E402
from sfz import SR  # noqa: E402

ID = 'battle_route1'
TITLE = 'Tall Grass Ambush'
BPM = 160
BPB = 4
SF2 = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'

# ---------- extra VSCO instruments (gains matched to the sections at mf) ----------
render.ORCH.update({
    'svln': ('SViolinVib.sfz', -3.0, 0.3, 0.03),
    'svln_spic': ('SViolinSpic.sfz', 3.5, None, None),
    'vln_spic': ('ViolinEnsSpic.sfz', 0.0, None, None),
    'vla_spic': ('ViolaEnsSpic.sfz', 2.0, None, None),
    'vc_spic': ('CelloEnsSpic.sfz', 5.0, None, None),
    'cb_spic': ('ContrabassSpic.sfz', 5.5, None, None),
    'vln_trem': ('ViolinEnsTrem.sfz', 5.0, 0.4, 0.05),
    'vla_trem': ('ViolaEnsTrem.sfz', 1.0, 0.4, 0.05),
    'vc_trem': ('CelloEnsTrem.sfz', -3.5, 0.4, 0.05),
    'tpt': ('TrumpetSus.sfz', -6.0, 0.35, 0.05),
    'tpt_stac': ('TrumpetStac.sfz', 7.0, None, None),
    'tbn': ('TromboneSus.sfz', 5.0, 0.4, 0.06),
    'tbn_stac': ('TromboneStac.sfz', 7.5, None, None),
    'tuba': ('TubaSus.sfz', 2.0, 0.4, 0.06),
    'tuba_stac': ('TubaStac.sfz', 8.5, None, None),
    'hn_stac': ('FHornStac.sfz', -2.0, None, None),
    'picc': ('PiccoloSus.sfz', -9.0, 0.3, 0.03),
    'xylo': ('Xylophone.sfz', -4.0, 1.0, None),
})
render.SUSTAINED |= {'svln', 'vln_trem', 'vla_trem', 'vc_trem', 'tpt', 'tbn', 'tuba', 'picc'}
render.SEAT.update({
    'svln': dict(pan=-0.3, width=0.2, depth=0.05),
    'tpt': dict(pan=0.1, width=0.4, depth=0.8),
    'tbn': dict(pan=0.4, width=0.4, depth=0.8),
    'tuba': dict(pan=0.55, width=0.3, depth=0.85),
    'picc': dict(pan=-0.2, width=0.25, depth=0.5),
    'xylo': dict(pan=0.3, width=0.35, depth=0.75),
    'kit': dict(pan=0.0, width=0.85, depth=0.45),
    'bass': dict(pan=0.05, width=0.2, depth=0.3),
    'taiko': dict(pan=-0.1, width=0.6, depth=0.85),
})

# ---------- harmony ----------
# name -> bass root, pad voicing (low..high), chord tones, scale, long-note tensions
NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def pcs(s):
    return {NOTE.index(x) for x in s.split()}


CH = {
    'Am':    ('A1', ['A3', 'C4', 'E4'], 'A C E', 'A B C D E F G', 'B D G'),
    'Amd':   ('A1', ['A3', 'C4', 'E4'], 'A C E', 'A B C D E F# G', 'B D F# G'),
    'G':     ('G1', ['G3', 'B3', 'D4'], 'G B D', 'G A B C D E F', 'A E F'),
    'D/F#':  ('F#1', ['F#3', 'A3', 'D4'], 'D F# A', 'D E F# G A B C', 'E B C'),
    'D/A':   ('A1', ['A3', 'D4', 'F#4'], 'D F# A', 'D E F# G A B C', 'E B C'),
    'D':     ('D2', ['A3', 'D4', 'F#4'], 'D F# A', 'D E F# G A B C', 'E B C'),
    'F':     ('F1', ['A3', 'C4', 'F4'], 'F A C', 'F G A B C D E', 'G E D'),
    'E':     ('E1', ['G#3', 'B3', 'E4'], 'E G# B', 'E F G# A B C D', 'D'),
    'Esus4': ('E1', ['A3', 'B3', 'E4'], 'E A B', 'E F# A B C D', 'D'),
    'Em':    ('E1', ['G3', 'B3', 'E4'], 'E G B', 'E F# G A B C D', 'D F# A'),
    'Dm':    ('D2', ['A3', 'D4', 'F4'], 'D F A', 'D E F G A B C', 'E C G'),
    'C':     ('C2', ['G3', 'C4', 'E4'], 'C E G', 'C D E F G A B', 'D A B'),
}

# section starts (beats)
S_INTRO, S_G, S_A, S_B, S_C, S_A2, S_LINK, END = 0, 16, 32, 96, 160, 208, 272, 304
LOOP0, LOOP1 = S_G, END

H_G = ['Amd'] * 4
H_A = ['Am', 'Am', 'G', 'D/F#', 'F', 'G', 'E', 'E', 'Am', 'Am', 'G', 'D/F#', 'F', 'G', 'E', 'E']
H_B = ['F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'E', 'F', 'G', 'Am', 'D', 'F', 'G', 'Esus4', 'E']
H_C = ['Amd', 'D/A', 'Amd', 'D/A', 'Amd', 'D/A', 'Amd', 'G', 'F', 'F', 'E', 'E']
H_A2 = H_A
H_LINK = ['F', 'G', 'Am', 'Am', 'F', 'G', 'E', 'E']

# chord segments (beat, chord): the intro moves inside the bar
SEGS = [(0, 'Am'), (4, 'F'), (5.5, 'G'), (7, 'Am'), (8, 'C'), (9.5, 'D'), (11, 'E')]
for s0, hh in ((S_G, H_G), (S_A, H_A), (S_B, H_B), (S_C, H_C), (S_A2, H_A2), (S_LINK, H_LINK)):
    SEGS += [(s0 + 4 * i, h) for i, h in enumerate(hh)]
SEGS.append((END, 'Amd'))


def chord_at(beat):
    c = SEGS[0][1]
    for b, h in SEGS:
        if b <= beat + 1e-6:
            c = h
        else:
            break
    return c


def nm(k):
    return NOTE[k % 12] + str(k // 12 - 1)


def low_root(h, lo=28):
    """Bass root key between E1 (28) and D#2."""
    r = midi(CH[h][0])
    while r < lo:
        r += 12
    while r >= lo + 12:
        r -= 12
    return r


def octv(text, n):
    import re
    return re.sub(r'([A-G][#b]?)(-?\d)(?=[:,~])', lambda m: m.group(1) + str(int(m.group(2)) + n), text)


def pad(harm, voice, octave=0, dur='w'):
    """One pad voice, whole notes, tied when it holds."""
    ks = [midi(CH[h][1][voice]) + 12 * octave for h in harm]
    out = []
    for i, k in enumerate(ks):
        tie = '~' if i + 1 < len(ks) and ks[i + 1] == k else ''
        out.append('%s:%s%s |' % (nm(k), dur, tie))
    return ' '.join(out)


def fifth_above(h, r):
    """The chord tone above the bass nearest a fifth (a sixth for an inversion)."""
    tones = pcs(CH[h][2])
    cand = [r + d for d in range(3, 10) if (r + d) % 12 in tones]
    return min(cand, key=lambda k: abs(k - r - 7))


def ostinato(harm, kind, octave=0):
    """Spiccato eighths in a 3+3+2 grouping on chord tones."""
    out = []
    for h in harm:
        v = [midi(x) + 12 * octave for x in CH[h][1]]
        r = low_root(h) + 12 + 12 * octave
        while r < v[0] - 12:
            r += 12
        if kind == 'low':        # cellos: root, root, fifth...
            fifth = fifth_above(h, r)
            seq = [r, r, fifth, r, r, fifth, r, r + 12]
        else:                    # violas: upper voices rocking
            seq = [v[1], v[1], v[2], v[1], v[1], v[2], v[1], v[2]]
        out.append(' '.join('%s:e' % nm(k) for k in seq) + ' |')
    return ' '.join(out)


# ---------- melodies ----------
HOOK = """E5:e A5:e A5:e G5:e A5:q E5:e G5:e | A5:e B5:e C6:e B5:e A5:q. G5:e |
D5:e G5:e B5:e A5:e~ A5:e G5:e D5:q | F#5:e A5:e D6:e C6:e A5:e F#5:e D5:e F#5:e |
A5:q. C6:e A5:e F5:e G5:e A5:e | B5:q. D6:e B5:e G5:e A5:e B5:e |
G#5:e B5:e E6:e D6:e B5:e G#5:e E5:e G#5:e | B5:h r:e E5:e G#5:e B5:e |
C6:e B5:e A5:e E5:e A5:e B5:e C6:e D6:e | E6:q. D6:e C6:e B5:e A5:q |
B5:e A5:e G5:e B5:e D6:q. B5:e | A5:e F#5:e D5:e F#5:e A5:q. B5:e |
C6:e A5:e F5:e A5:e C6:e D6:e E6:e C6:e | D6:q. B5:e G5:e B5:e D6:e F6:e |
E6:q D6:e C6:e B5:e A5:e G#5:e B5:e | G#5:e A5:e B5:e G#5:e E5:h |"""

BTUNE1 = """A4:h. C5:q | D5:h B4:q G4:q | E5:h. D5:q | C5:q. B4:e A4:h |
F4:q A4:q D5:q. C5:e | B4:h G4:q D5:q | E5:h. C5:q | B4:h G#4:h |"""
BTUNE2 = """A4:h. C5:q | D5:h. E5:q | E5:h. G5:q | F#5:h. E5:q |
F5:h E5:q C5:q | D5:h B4:q D5:q | E5:w | E5:h. r:q |"""
BHARM2 = """F4:h. A4:q | B4:h. B4:q | C5:h. E5:q | D5:h. C5:q |
C5:h C5:q A4:q | B4:h G4:q B4:q | B4:w | G#4:h. r:q |"""

TPT_COUNTER = """C5:w | C5:h. B4:q | B4:w | A4:w | A4:w | B4:h D5:h | E5:w~ | E5:h D5:h |
C5:w | E5:h D5:h | D5:w | D5:h C5:h | C5:w | B4:h D5:h | B4:w | G#4:h B4:h |"""

# breakdown: fiddle and woodwinds trade (r = the other's turn)
C_FID = """A5:e E5:e A5:e B5:e C6:e B5:e A5:e E5:e | F#5:e A5:e D6:e A5:e F#5:e D5:e E5:e F#5:e |
r:w | r:w |
E6:e D6:e C6:e B5:e A5:e B5:e C6:e A5:e | F#5:q. A5:e D6:e C6:e A5:e F#5:e |
r:w | r:w |
A5:e C6:e F6:e C6:e A5:e C6:e F6:e C6:e | A5:e C6:e F6:e G6:e A6:e G6:e F6:e C6:e |
G#5:e B5:e E6:e B5:e G#5:e B5:e E6:e B5:e | G#5:e B5:e E6:e F6:e E6:e D6:e B5:e G#5:e |"""
C_CL = """r:w | r:w | A4:e B4:e C5:e D5:e E5:e D5:e C5:e B4:e | A4:e F#4:e D4:e F#4:e A4:q. r:e |
r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w |"""
C_FL = """r:w | r:w | r:w | r:w | r:w | r:w |
E6:e C6:e A5:e C6:e E6:e G6:e E6:e C6:e | D6:e B5:e G5:e B5:e D6:q. r:e |
r:w | r:w | r:w | r:w |"""

LINK_TOP = """A5:q. C6:q. F6:q | G5:q. B5:q. D6:q | E6:q. C6:q. A5:q | B5:e C6:e B5:e A5:e E5:h |
A5:q. C6:q. F6:q | G6:q. F6:q. D6:q | B5:q. G#5:q. E5:q | G#5:h. r:q |"""


def stab_voicing(h, top=True):
    """Brass stab chord: trumpets / horns high triad, trombones low."""
    v = [midi(x) for x in CH[h][1]]
    return v


def stabs_text(harm, which, pattern=(0, 1.5, 3), lens=(1.5, 1.5, 1.0), short='e'):
    """3+3+2 stabs: a short chord at each group start, rests between."""
    out = []
    for h in harm:
        v = [midi(x) for x in CH[h][1]]
        if which == 'hi':
            ks = [k + 12 for k in v]            # trumpets / horns
        elif which == 'mid':
            ks = v
        else:                                   # trombones / tuba: root + fifth
            r = low_root(h) + 12
            ks = [r, r + 7] if which == 'low' else [r - 12 + 12]
        chord = ','.join(nm(k) for k in ks)
        toks = []
        for p, ln in zip(pattern, lens):
            toks.append('%s:%s' % (chord, short))
            rest = ln - {'e': .5, 'q': 1.0}[short]
            if rest > 1e-6:
                toks.append('r:%s' % ({0.5: 'e', 1.0: 'q', 1.5: 'q.'}[rest]))
        out.append(' '.join(toks) + ' |')
    return ' '.join(out)


# ---------- the score ----------
SEATS = {}


def build_parts():
    P = []

    def part(name, patch, seat, **perf):
        p = Part(name, patch, '', 0, BPB, **perf)
        SEATS[name] = seat
        P.append(p)
        return p

    W4 = 'r:w | r:w | r:w | r:w |'

    def rests(n):
        return ' '.join(['r:w |'] * n)

    # ===== fiddle (solo violin) =====
    fid = part('Fiddle', 'svln', 'svln', legato=True, humanize=0.006, swell=0.02, gain=1.5)
    fid.add('@f ' + HOOK, S_A)
    fid.add('@mf ' + C_FID.replace('A5:e C6:e F6:e C6:e A5:e C6:e F6:e C6:e', '@mf< A5:e C6:e F6:e C6:e A5:e C6:e F6:e C6:e', 1).rstrip() + ' @f', S_C)
    fid.add('@f ' + HOOK, S_A2)
    fid.add('@f ' + LINK_TOP, S_LINK)

    # ===== violins (ensemble) =====
    vl1 = part('Violins I', 'vln', 'vln1', legato=True, humanize=0.008, swell=0.03)
    vl1.add('@mf ' + rests(3) + ' E5:e F5:e G#5:e A5:e B5:e C6:e D6:e E6:e |', S_INTRO)
    vl1.add('@f ' + HOOK, S_A2)
    vl1.add('@f ' + LINK_TOP, S_LINK)
    vtr = part('Violins trem', 'vln_trem', 'vln1', humanize=0.01, gate=1.0)
    vtr.add('@mp< A4:w | @f ' + rests(3), S_INTRO)
    vtr.add('@mp ' + pad(H_B[:8], 2, 1), S_B)
    vtr.add('@mf ' + pad(H_B[8:], 2, 1), S_B + 32)
    vtr.add(rests(8) + ' @p< ' + pad(H_C[8:], 2, 1) + ' @f', S_C)
    v2s = part('Violins II spic', 'vln_spic', 'vln2', humanize=0.006, gate=0.9)
    v2s.add('@mf ' + ostinato(H_B[8:], 'up', 1), S_B + 32)
    v2s.add('@mp ' + ostinato(H_A2, 'up', 1), S_A2)
    v2s.add('@f ' + stabs_text(H_LINK, 'hi', short='e'), S_LINK)
    v2s.add('@f A4,C5,E5:e r:e r:q r:h |', S_G)     # the downbeat after the intro run

    # ===== low strings =====
    vlas = part('Violas spic', 'vla_spic', 'vla', humanize=0.006, gate=0.9)
    vcs = part('Cellos spic', 'vc_spic', 'vc', humanize=0.006, gate=0.9)
    cbs = part('Basses spic', 'cb_spic', 'cb', humanize=0.006, gate=0.9, layers=2)
    vlas.add('@mf ' + ostinato(H_G, 'up'), S_G)
    vcs.add('@f ' + ostinato(H_G, 'low', 0), S_G)
    vlas.add('@mf ' + ostinato(H_A, 'up'), S_A)
    vcs.add('@mf ' + ostinato(H_A, 'low', 0), S_A)
    vcs.add('@mf ' + ostinato(H_C, 'low', 0), S_C)
    vlas.add('@mp ' + rests(4) + ' ' + ostinato(H_C[4:], 'up'), S_C)
    vlas.add('@f ' + ostinato(H_A2, 'up'), S_A2)
    vcs.add('@f ' + ostinato(H_A2, 'low', 0), S_A2)
    cbs.add('@mf ' + ostinato(H_C, 'low', -1).replace(':e', ':e'), S_C)
    # intro gallop under the hit
    vcs.add('@f ' + 'A2:e A2:e A2:e A2:e A2:e A2:e A2:e A2:e | ' + rests(3), S_INTRO)
    vlat = part('Violas trem', 'vla_trem', 'vla', humanize=0.01, gate=1.0)
    vlat.add('@mp ' + pad(H_B, 1), S_B)
    vlat.add(rests(8) + ' @p< ' + pad(H_C[8:], 1) + ' @f', S_C)
    vc = part('Cellos', 'vc', 'vc', legato=True, humanize=0.01, swell=0.04)
    vc.add('@mf ' + octv(BTUNE1, -1), S_B)
    vc.add('@mf ' + pad(H_B[8:], 0, -1), S_B + 32)
    cb = part('Basses', 'cb', 'cb', legato=True, humanize=0.01, layers=2)
    cb.add('@mf ' + ' '.join('%s:w |' % nm(low_root(h)) for h in H_B), S_B)
    cb.add('@f ' + 'E1:w~ | E1:w |', S_INTRO + 8)

    # ===== woodwinds =====
    fl = part('Flute', 'fl', 'fl', legato=True, humanize=0.006, swell=0.02)
    fl.add('@mf ' + rests(8) + ' ' + '\n'.join(HOOK.split('\n')[4:]), S_A)
    fl.add('@mf ' + C_FL, S_C)
    fl.add('@f ' + HOOK, S_A2)
    picc = part('Piccolo', 'picc', 'picc', legato=True, humanize=0.006)
    # a fast run up at the ends of the tutti phrases
    picc.add('@mf ' + rests(7) + ' r:h E6:e G#6:e B6:e E7:e | ' + rests(7) + ' r:h B6:e C7:e D7:e E7:e |', S_A2)
    cl = part('Clarinet', 'cl', 'cl', legato=True, humanize=0.006)
    cl.add('@mf ' + C_CL, S_C)
    cl.add('@mp ' + octv(BTUNE1, 0).replace('A4:h. C5:q', 'A4:h. C5:q', 1), S_B)

    # ===== brass =====
    hn = part('Horns', 'hn', 'hn', legato=True, humanize=0.01, swell=0.05, gain=1.0)
    hn2 = part('Horns 2', 'hn', 'hn', legato=False, humanize=0.012, swell=0.05, cents=-4)
    hn.add('@f E4:q. D4:e E4:q A4:q | G4:e E4:e D4:q E4:h | r:w | r:w |', S_G)
    hn.add('@mp ' + pad(H_A, 2), S_A)
    hn2.add('@mp ' + pad(H_A, 1), S_A)
    hn.add('@f ' + BTUNE1, S_B)
    hn.add('@mf ' + BHARM2, S_B + 32)
    hn2.add('@mp ' + pad(H_B, 0), S_B)
    hn.add(rests(8) + ' @p< ' + pad(H_C[8:], 2) + ' @ff', S_C)
    hn2.add(rests(8) + ' @p< ' + pad(H_C[8:], 1) + ' @ff', S_C)
    hn.add('@mf ' + pad(H_A2, 2), S_A2)
    hn2.add('@mf ' + pad(H_A2, 1), S_A2)
    hns = part('Horns stac', 'hn_stac', 'hn', humanize=0.008)
    hns.add('@ff ' + 'A3,C4,E4:q r:q r:h | A3,C4,F4:e r:e r:e G3,B3,D4:e r:e r:e A3,C4,E4:e r:e | '
            'G3,C4,E4:e r:e r:e A3,D4,F#4:e r:e r:e G#3,B3,E4:e r:e | r:w |', S_INTRO)
    hns.add('@f ' + stabs_text(H_LINK, 'mid'), S_LINK)
    tpt = part('Trumpets', 'tpt', 'tpt', legato=True, humanize=0.008, swell=0.03)
    tpt.add('@f ' + BTUNE2, S_B + 32)
    tpt.add('@mf ' + TPT_COUNTER, S_A2)
    tpts = part('Trumpets stac', 'tpt_stac', 'tpt', humanize=0.006)
    tpts.add('@ff ' + 'A4,C5,E5:q r:q r:h | A4,C5,F5:e r:e r:e B4,D5,G5:e r:e r:e C5,E5,A5:e r:e | '
             'C5,E5,G5:e r:e r:e D5,F#5,A5:e r:e r:e G#4,B4,E5:e r:e | G#4,B4,E5:h r:h |', S_INTRO)
    tpts.add('@f ' + stabs_text(H_LINK, 'hi'), S_LINK)
    # answering fanfare in A: bar 8 and 16 (E chord)
    tpts.add('@mf ' + rests(7) + ' r:h B4,E5:e r:e B4,E5:e B4,E5:e | ' + rests(7) + ' r:h G#4,B4:e r:e G#4,B4:e G#4,B4:e |', S_A)
    tbn = part('Trombones', 'tbn', 'tbn', legato=True, humanize=0.01, swell=0.04)
    tbn.add('@f r:w | r:w | A3:q. G3:e A3:q C4:q | B3:e G3:e E3:q A3:h |', S_G)
    tbn.add('@mf ' + octv(BTUNE1, -1), S_B)
    tbn.add(rests(8) + ' @mp< ' + pad(H_C[8:], 0, -1) + ' @ff', S_C)
    tbns = part('Trombones stac', 'tbn_stac', 'tbn', humanize=0.008)
    tbns.add('@ff ' + 'A2,E3:q r:q r:h | F2,C3:e r:e r:e G2,D3:e r:e r:e A2,E3:e r:e | '
             'C3,G3:e r:e r:e D3,A3:e r:e r:e E2,B2:e r:e | r:w |', S_INTRO)
    tbns.add('@f ' + stabs_text(H_LINK, 'low'), S_LINK)
    tuba = part('Tuba', 'tuba', 'tuba', legato=True, humanize=0.01)
    tuba.add('@mf ' + ' '.join('%s:w |' % nm(low_root(h) + 12) for h in H_B[:8]), S_B)
    tuba.add('@f E2:w~ | E2:w |', S_INTRO + 8)
    tubas = part('Tuba stac', 'tuba_stac', 'tuba', humanize=0.008)
    tubas.add('@ff A1:q r:q r:h | F1:e r:e r:e G1:e r:e r:e A1:e r:e | C2:e r:e r:e D2:e r:e r:e r:q | r:w |', S_INTRO)
    tubas.add('@f ' + stabs_text(H_LINK, 'root'), S_LINK)

    # ===== percussion (VSCO) =====
    timp = part('Timpani', 'timp', 'timp', humanize=0.003, gate=1.0)
    timp.add('@ff A2:q r:q r:h | F2:e r:e r:e G2:e r:e r:e A2:e r:e | C3:e r:e r:e D3:e r:e r:e E2:e r:e | r:w |', S_INTRO)
    timp.add('@f A2:q r:q r:h | r:w | r:w | r:h E2:e E2:e A2:q |', S_G)
    timp.add('@f ' + ' '.join(['%s:q r:q r:h |' % nm(low_root(h) + 12 if low_root(h) + 12 >= 40 else low_root(h) + 24) if i % 2 == 0 else 'r:w |'
                               for i, h in enumerate(H_B)]), S_B)
    timp.add('@ff ' + ' '.join(['%s:q r:q r:h |' % nm(low_root(h) + 12 if low_root(h) + 12 >= 40 else low_root(h) + 24) if i % 4 == 0 else 'r:w |'
                                for i, h in enumerate(H_A2)]), S_A2)
    timp.add('@f ' + stabs_text(H_LINK, 'timp').replace('E2,', 'E2,'), S_LINK)
    troll = part('Timpani roll', 'timp_roll', 'timp', humanize=0.0, gate=1.0)
    troll.add('@mp ' + rests(3) + ' @mp< E2:w | @ff', S_INTRO)
    troll.add('@pp ' + rests(8) + ' @p< A2:w~ | A2:w | E2:w~ | E2:h. r:q | @ff', S_C)
    troll.add('@mf ' + rests(14) + ' @mf< E2:w~ | E2:h. r:q | @ff', S_A2)
    troll.add('@mp ' + rests(6) + ' @mp< E2:w~ | E2:h. r:q | @ff', S_LINK)
    xyl = part('Xylophone', 'xylo', 'xylo', humanize=0.004, gate=1.0)
    xyl.add('@mf ' + '\n'.join(HOOK.split('\n')[:4]), S_A2)
    return P


def fix_timp(P):
    """The timpani stabs in the link: one drum note (root in A2..E3)."""
    for p in P:
        if p.name == 'Timpani':
            for n in p.notes:
                if len(n[2]) > 1:
                    n[2] = [n[2][0]]
    return P


# ---------- GM layers (drums, bass, taiko) ----------
K = dict(kick=36, kick2=35, snare=38, rim=37, ch=42, ph=44, oh=46, crash=49, crash2=57, ride=51, bell=53,
         t1=50, t2=48, t3=47, t4=45, t5=43, t6=41, shaker=70, tamb=54, china=52, splash=55)


def kit_events():
    """(beat, key, vel 0..1) for the whole score."""
    ev = []

    def add(b, k, v):
        ev.append((b, K[k], v))

    def groove(b0, bars, style, crash_every=8, fill_every=4, last_fill=True):
        for i in range(bars):
            b = b0 + 4 * i
            fill = (i % fill_every == fill_every - 1) and (last_fill or i < bars - 1)
            if i % crash_every == 0:
                add(b, 'crash', 0.85)
            if style in ('drive', 'full'):
                kicks = [0, 1.5, 2, 3.5] if style == 'full' else [0, 1.5, 2.5]
                if i % 2 == 1:
                    kicks = [0, 1.5, 3, 3.75] if style == 'full' else [0, 1.5, 3]
                for k in kicks:
                    if not (fill and k >= 2):
                        add(b + k, 'kick', 0.9 if k == 0 else 0.78)
                for s in (1, 3):
                    if not (fill and s >= 2):
                        add(b + s, 'snare', 0.85)
                for g in (1.75, 3.25) if i % 2 else (2.75,):
                    if not (fill and g >= 2):
                        add(b + g, 'snare', 0.3)       # ghost notes
                cym = 'ride' if style == 'full' else 'ch'
                for e in range(8):
                    if fill and e >= 4:
                        continue
                    acc = (0.75 if e % 2 == 0 else 0.5) if cym == 'ch' else (0.6 if e % 2 == 0 else 0.45)
                    if e in (0, 3, 6):
                        acc += 0.12                     # the 3+3+2 lilt
                    add(b + e * 0.5, cym, acc)
                if style == 'drive' and i % 4 == 1:
                    add(b + 3.5, 'oh', 0.6)
            elif style == 'tribal':
                for e, tk in zip((0, 1.5, 3), ('t6', 't5', 't4')):
                    add(b + e, tk, 0.85)
                for e in (0.5, 1, 2, 2.5, 3.5):
                    if not (fill and e >= 2):
                        add(b + e, 't6' if e < 2 else 't5', 0.45)
                add(b, 'kick', 0.85)
                add(b + 2, 'kick', 0.7)
                if not fill:
                    add(b + 3, 'rim', 0.6)
                for q in range(4):
                    add(b + q, 'ride', 0.55 if q % 2 == 0 else 0.42)
                    add(b + q + 0.5, 'ride', 0.32)
            elif style == 'break':
                for e, tk, v in ((0, 't6', 0.8), (1.5, 't5', 0.65), (3, 't4', 0.7), (2.5, 't6', 0.45), (3.5, 't5', 0.5)):
                    if not (fill and e >= 2):
                        add(b + e, tk, v)
                for s in range(16):
                    add(b + s * 0.25, 'shaker', 0.55 if s % 4 == 0 else (0.42 if s % 2 == 0 else 0.3))
                if i % 2 == 0:
                    add(b, 'kick', 0.7)
            if fill:
                # 16th tom fill over beats 3-4, falling, kick under the last
                seq = ['t1', 't1', 't2', 't2', 't3', 't3', 't4', 't5'] if i % 8 == 7 else ['snare', 't2', 't3', 'snare', 't4', 't5', 't6', 't6']
                for j, tk in enumerate(seq):
                    add(b + 2 + j * 0.25, tk, 0.55 + 0.04 * j)
                add(b + 3.5, 'kick', 0.8)

    # intro: hits with crash + kick, then roll and fill
    for b, v in ((0, 1.0), (4, .9), (5.5, .9), (7, .95), (8, .9), (9.5, .9), (11, .95)):
        add(b, 'crash' if b in (0, 4, 8, 11) else 'splash', v * 0.9)
        add(b, 'kick', v)
        add(b, 't6', v * 0.8)
    for j in range(8):
        add(1 + j * 0.25, 't%d' % (1 + j // 2 + (j % 2)), 0.45 + 0.03 * j)   # a rumble after the hit
    for j in range(8):
        add(12 + j * 0.25, 'snare', 0.35 + 0.05 * j)                      # snare roll up
    for j, tk in enumerate(['t1', 't2', 't2', 't3', 't3', 't4', 't5', 't6']):
        add(14 + j * 0.25, tk, 0.65 + 0.04 * j)
    add(15.5, 'kick', 0.9)
    add(15.75, 'kick', 0.8)

    groove(S_G, 4, 'drive', crash_every=4)
    groove(S_A, 16, 'drive')
    groove(S_B, 16, 'tribal')
    groove(S_C, 8, 'break', crash_every=99, fill_every=8)
    # build: snare eighths then sixteenths, crescendo, kick on beats
    for i in range(4):
        b = S_C + 32 + 4 * i
        step = 0.5 if i < 2 else 0.25
        n = int(4 / step)
        for j in range(n):
            if i == 3 and j >= 8:
                continue
            add(b + j * step, 'snare', 0.35 + 0.15 * i + 0.1 * j / n)
        for q in range(4):
            add(b + q, 'kick', 0.6 + 0.08 * i)
        if i == 3:
            for j, tk in enumerate(['t1', 't1', 't2', 't2', 't3', 't4', 't5', 't6']):
                add(b + 2 + j * 0.25, tk, 0.75 + 0.03 * j)
    groove(S_A2, 16, 'full')
    # link: kick + crash on the 3+3+2 stabs, hats ticking, fill at the end
    for i in range(8):
        b = S_LINK + 4 * i
        last = i == 7
        for e in (0, 1.5, 3):
            if last and e > 0:
                continue
            add(b + e, 'kick', 0.9)
            add(b + e, 'crash' if e == 0 and i % 4 == 0 else 'china' if e == 0 else 'splash', 0.7)
            add(b + e, 'snare', 0.75 if e else 0.5)
        for s in range(8):
            if not (last and s >= 1):
                add(b + s * 0.5, 'ch', 0.5)
        if i == 3:
            for j, tk in enumerate(['snare'] * 4):
                add(b + 3 + j * 0.25, tk, 0.5 + 0.07 * j)
        if last:
            for j, tk in enumerate(['snare', 'snare', 't1', 't1', 't2', 't2', 't3', 't3', 't4', 't4', 't5', 't6']):
                add(b + 1 + j * 0.25, tk, 0.6 + 0.03 * j)
            add(b + 3.5, 'kick', 0.85)
    return ev


def bass_events():
    """Growling picked bass: eighths, root / octave / fifth with a walk-up
    to the next chord on the last eighth."""
    ev = []

    def riff(b0, harm, style='drive', nxt_after=None):
        for i, h in enumerate(harm):
            b = b0 + 4 * i
            r = low_root(h)
            nh = harm[i + 1] if i + 1 < len(harm) else nxt_after
            nr = low_root(nh) if nh else r
            sc = pcs(CH[h][3])
            # approach: the scale tone (of this chord) a step from the next root
            appr = None
            for dlt in (-1, 1, -2, 2):
                if (nr + dlt) % 12 in sc and nr + dlt != r:
                    appr = nr + dlt
                    break
            if appr is None:
                appr = r + 7
            while appr - r > 9:
                appr -= 12
            while appr - r < -5:
                appr += 12
            if style == 'drive':
                seq = [r, r, r + 12, r, r, r + 12, fifth_above(h, r), appr]
                vel = [0.9, 0.6, 0.75, 0.85, 0.6, 0.75, 0.8, 0.75]
            elif style == 'riff' and h not in ('Amd', 'D/A'):
                seq = [r, r, r + 12, r, r, r + 12, fifth_above(h, r), appr]
                vel = [0.9, 0.6, 0.75, 0.85, 0.6, 0.75, 0.8, 0.75]
            elif style == 'riff':     # the groove: Dorian riff
                seq = [r, r, r + 12, r, r + 10, r, r + 3, r + 5] if i % 2 == 0 else [r, r, r + 12, r, r + 7, r + 5, r + 3, r + 2]
                vel = [0.95, 0.6, 0.8, 0.9, 0.75, 0.65, 0.8, 0.75]
            elif style == 'tribal':
                seq = [r, None, None, r, None, None, r + 12, r]
                vel = [0.95, 0, 0, 0.85, 0, 0, 0.7, 0.8]
            elif style == 'pulse':
                seq = [r] * 8
                vel = [0.8, 0.5, 0.6, 0.75, 0.5, 0.6, 0.7, 0.55]
            for j, (k, v) in enumerate(zip(seq, vel)):
                if k is None:
                    continue
                dur = 0.42 if style != 'tribal' else (1.4 if j in (0, 3) else 0.42)
                ev.append((b + j * 0.5, dur, k, v))

    # intro: the stabs
    for b, k, d in ((0, 33, 1.0), (4, 29, 0.4), (5.5, 31, 0.4), (7, 33, 0.4), (8, 36, 0.4), (9.5, 38, 0.4), (11, 28, 4.6)):
        ev.append((b, d, k, 0.95))
    riff(S_G, H_G, 'riff')
    riff(S_A, H_A, 'drive', 'F')
    riff(S_B, H_B, 'tribal')
    riff(S_C, H_C[:8], 'riff')
    riff(S_C + 32, H_C[8:], 'pulse')
    riff(S_A2, H_A2, 'drive', 'F')
    for i, h in enumerate(H_LINK):
        b = S_LINK + 4 * i
        r = low_root(h)
        for e in ((0, 1.5, 3) if i < 7 else (0,)):
            ev.append((b + e, 0.45, r, 0.95))
        ev.append((b + 3.5, 0.4, r + 12, 0.6))
    return ev


def taiko_events():
    ev = []
    for i in range(16):                              # B: big drum on 1 and the 2&
        b = S_B + 4 * i
        ev.append((b, 0.9, 41, 0.95))
        if i % 2 == 1:
            ev.append((b + 1.5, 0.9, 41, 0.7))
            ev.append((b + 3, 0.9, 45, 0.75))
    for i in range(8):                               # C: sparser, deep
        b = S_C + 4 * i
        ev.append((b, 0.9, 41, 0.85))
        if i % 2 == 1:
            ev.append((b + 3, 0.9, 41, 0.6))
            ev.append((b + 3.5, 0.9, 41, 0.7))
    for b in (0, 4, 5.5, 7, 8, 9.5, 11):
        ev.append((b, 0.9, 41, 1.0))
    for i in range(8):
        b = S_LINK + 4 * i
        for e in ((0, 1.5, 3) if i < 7 else (0,)):
            ev.append((b + e, 0.9, 41, 0.85))
    for i in range(16):
        if i % 4 == 0:
            ev.append((S_A2 + 4 * i, 0.9, 41, 0.9))
    return ev


GM = {
    # name: (program, is_drum, bank, seat, gain dB, send)
    'Kit': (0, True, 128, 'kit', -1.0, 0.55),
    'Bass': (34, False, 0, 'bass', 0.0, 0.25),
    'Taiko': (116, False, 0, 'taiko', -2.0, 0.9),
}


def gm_tracks():
    kit = [(b, 0.2, k, v) for b, k, v in kit_events()]
    return {'Kit': kit, 'Bass': bass_events(), 'Taiko': taiko_events()}


def gm_render(name, events, tempo, ls, le, intro_s, loop_s, reps, total, work):
    """Write the events (intro once, the loop `reps` times) to MIDI and render
    them with fluidsynth (its own reverb and chorus off)."""
    import pretty_midi
    prog, drum, bank, _, _, _ = GM[name]
    pm = pretty_midi.PrettyMIDI(initial_tempo=BPM)
    ins = pretty_midi.Instrument(prog, is_drum=drum, name=name)
    t_ls = tempo.sec(ls)
    for b, d, k, v in events:
        rng = np.random.default_rng(zlib.crc32(repr((name, round(b - (ls if b >= ls else 0), 4), k)).encode()))
        jit = rng.normal(0, 0.004 if drum else 0.006)
        vel = int(np.clip(20 + 105 * (v + rng.normal(0, 0.03)), 1, 127))
        if b < ls:
            times = [tempo.sec(b)]
            ends = [tempo.sec(b + d)]
        elif b < le:
            rel = tempo.sec(b) - t_ls
            rel_e = tempo.sec(b + d) - t_ls
            times = [intro_s + kk * loop_s + rel for kk in range(reps)]
            ends = [intro_s + kk * loop_s + rel_e for kk in range(reps)]
        else:
            continue
        for t0, t1 in zip(times, ends):
            t0 = max(0.0, t0 + jit)
            ins.notes.append(pretty_midi.Note(vel, int(k), t0, max(t0 + 0.03, t1 + jit)))
    pm.instruments.append(ins)
    mid = os.path.join(work, 'gm_%s.mid' % name)
    wav = os.path.join(work, 'gm_%s.wav' % name)
    pm.write(mid)
    if drum and bank == 128:
        pass
    subprocess.run(['fluidsynth', '-ni', '-R', '0', '-C', '0', '-g', '0.5', '-r', str(SR), '-O', 'float',
                    '-F', wav, SF2, mid], check=True, capture_output=True)
    x, sr = sf.read(wav, dtype='float32', always_2d=True)
    lat = int(0.003 * SR)                       # fluidsynth's onset latency
    x = x[lat:]
    out = np.zeros((total, 2), np.float32)
    n = min(total, len(x))
    out[:n] = x[:n]
    return out


def growl(x):
    """The bass: a clean low end plus a driven, band-limited copy."""
    import pedalboard as pb
    dirty = pb.Pedalboard([pb.HighpassFilter(cutoff_frequency_hz=90), pb.Distortion(drive_db=16),
                           pb.LowpassFilter(cutoff_frequency_hz=2600), pb.Gain(gain_db=-14)])(x.T, SR).T
    clean = pb.Pedalboard([pb.LowpassFilter(cutoff_frequency_hz=1800)])(x.T, SR).T
    y = pb.Pedalboard([pb.Compressor(threshold_db=-22, ratio=3, attack_ms=8, release_ms=120)])((clean + dirty).T, SR).T
    return y.astype(np.float32)


# ---------- render ----------

def render_song(P, tempo, ls, le, work, reps=4, target=-16.0, name=ID, intro=True):
    intro_s = tempo.sec(ls) if intro else 0.0
    loop_s = tempo.sec(le) - tempo.sec(ls)
    intro_n = int(round(intro_s * SR))
    N = int(round(loop_s * SR))
    total = intro_n + reps * N + 6 * SR
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    for p in P:
        if not any(ls <= n[0] < le or (intro and n[0] < ls) for n in p.notes):
            continue
        seat = render.SEAT[SEATS.get(p.name, p.name)]
        seat = dict(seat, **{k: p.perf[k] for k in ('pan', 'width', 'depth') if k in p.perf})
        stem = np.zeros((total, 2), np.float32)
        if intro and ls > 0:
            a = render.render_part(p, tempo, 0, ls, 0)
            stem[:min(len(a), total)] += a[:total]
        lp = render.render_part(p, tempo, ls, le, ls)
        for k in range(reps):
            i = intro_n + k * N
            seg = lp[:max(0, total - i)]
            stem[i:i + len(seg)] += seg
        d, s = render.place(stem, seat)
        g = 10 ** (p.perf.get('gain', 0) / 20)
        dry += d * g
        send += s * g * p.perf.get('send', 1.0)
        print('  part %-18s peak %.2f' % (p.name, float(np.max(np.abs(d * g)))), flush=True)
    tr = gm_tracks()
    for nmk, evs in tr.items():
        if not intro:
            evs = [e for e in evs if e[0] >= ls]
        x = gm_render(nmk, evs, tempo, ls, le, intro_s, loop_s, reps, total, work)
        if nmk == 'Bass':
            x = growl(x)
        prog, drum, bank, seat, gdb, snd = GM[nmk]
        d, s = render.place(x * 2.2, render.SEAT[seat])
        g = 10 ** (gdb / 20)
        dry += d * g
        send += s * g * snd
        print('  gm   %-18s peak %.2f' % (nmk, float(np.max(np.abs(d * g)))), flush=True)
    ir = render.hall_ir(seconds=2.8, rt_low=2.0, rt_mid=1.7, rt_high=1.0)
    wet = render.reverb(send, ir)
    mix = dry + wet * 0.6
    m = render.master(mix)
    k = 2 if reps >= 3 else 0
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
    wav = os.path.join(work, name + '.wav')
    sf.write(wav, out, SR, subtype='FLOAT')
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1, intro_n=intro_n, N=N)


# ---------- checks ----------
MELODIC = {'Fiddle', 'Violins I', 'Flute', 'Piccolo', 'Clarinet', 'Horns', 'Horns 2', 'Trumpets', 'Trombones',
           'Cellos', 'Xylophone', 'Violins trem', 'Violas trem', 'Violins II spic', 'Violas spic', 'Cellos spic',
           'Basses spic', 'Horns stac', 'Trumpets stac', 'Trombones stac', 'Tuba', 'Tuba stac', 'Timpani',
           'Timpani roll', 'Basses'}


def check_harmony(P):
    bad = 0
    for p in P:
        if p.name not in MELODIC:
            continue
        for b, d, keys, ps in p.notes:
            h = chord_at(b)
            _, _, tones, scale, tens = CH[h]
            for k in keys:
                pc = k % 12
                long_ = d >= 1.0 or (d >= 0.75 and abs(b - round(b)) < 1e-6)
                if pc not in pcs(scale):
                    bad += 1
                    print('  OUT OF SCALE %-16s bar %5.2f %s over %s' % (p.name, (b - S_G) / 4 + 1, nm(k), h))
                elif long_ and pc not in pcs(tones) | pcs(tens):
                    bad += 1
                    print('  LONG NON-CHORD %-14s bar %5.2f %s (%.2f beats) over %s' % (p.name, (b - S_G) / 4 + 1, nm(k), d, h))
    for b, d, k, v in bass_events():
        h = chord_at(b)
        if k % 12 not in pcs(CH[h][3]):
            bad += 1
            print('  BASS OUT %5.2f %s over %s' % ((b - S_G) / 4 + 1, nm(k), h))
        if d >= 1 and k % 12 not in pcs(CH[h][2]):
            bad += 1
            print('  BASS LONG %5.2f %s over %s' % ((b - S_G) / 4 + 1, nm(k), h))
    # parallel octaves / unisons between the fiddle and the bass are fine;
    # check ranges
    RANGE = {'svln': (55, 100), 'vln': (55, 100), 'fl': (60, 98), 'picc': (74, 108), 'cl': (50, 91), 'hn': (34, 77),
             'tpt': (54, 82), 'tbn': (40, 72), 'tuba': (28, 58), 'vc': (36, 76), 'cb': (28, 60), 'timp': (38, 57)}
    for p in P:
        base = p.patch.split('_')[0]
        if base in RANGE:
            lo, hi = RANGE[base]
            for b, d, keys, ps in p.notes:
                for k in keys:
                    if not lo <= k <= hi:
                        bad += 1
                        print('  RANGE %-14s bar %5.2f %s' % (p.name, (b - S_G) / 4 + 1, nm(k)))
    print('harmony check: %d problems' % bad)
    return bad


def section_map(tempo):
    rows = [('Intro', S_INTRO, S_G), ('G groove', S_G, S_A), ('A hook', S_A, S_B), ('B horn tune', S_B, S_C),
            ('C breakdown + build', S_C, S_A2), ("A'' tutti", S_A2, S_LINK), ('Link stabs', S_LINK, END)]
    out = []
    for n, a, b in rows:
        s = '%-22s bars %3s-%-3s  %6.2f - %6.2f s' % (n, (a - S_G) // 4 + 1 if a >= S_G else 'i1',
                                                   (b - S_G) // 4 if a >= S_G else 'i4', tempo.sec(a), tempo.sec(b))
        out.append(s)
        print(s)
    return out


def main():
    out = None
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    out = out or os.path.join(os.path.dirname(os.path.abspath(__file__)), '_out')
    os.makedirs(out, exist_ok=True)
    work = os.environ.get('MUSIC_WORK', os.path.join(out, 'work'))
    os.makedirs(work, exist_ok=True)
    P = fix_timp(build_parts())
    tempo = Tempo([[0, BPM], [END + 8, BPM]])
    smap = section_map(tempo)
    bad = check_harmony(P)
    if '--check' in sys.argv:
        return
    if '--excerpt' in sys.argv:
        i = sys.argv.index('--excerpt')
        a, b = float(sys.argv[i + 1]), float(sys.argv[i + 2])     # loop bars, 1-based; 0 = from the intro
        ls = S_G + 4 * (a - 1) if a > 0 else 0
        le = S_G + 4 * b
        if a > 0:
            info = render_song(P, tempo, ls, le, work, reps=1, name='excerpt', intro=False)
        else:
            info = render_song(P, tempo, S_G, le, work, reps=1, name='excerpt', intro=True)
        render.to_mp3(info['wav'], os.path.join(out, 'excerpt.mp3'))
        build.spectrogram(info['wav'], os.path.join(out, 'excerpt_spectrogram.png'), 'excerpt')
        print('excerpt', info)
        return
    info = render_song(P, tempo, LOOP0, LOOP1, work)
    ogg = os.path.join(out, ID + '.ogg')
    render.to_ogg(info['wav'], ogg, q=6)
    render.to_mp3(info['wav'], os.path.join(out, ID + '.mp3'))
    build.spectrogram(info['wav'], os.path.join(out, ID + '_spectrogram.png'), '%s: %s' % (ID, TITLE))
    seam = build.seam_check(info['wav'], info['intro_s'])
    x, sr = sf.read(info['wav'])
    peak = 20 * np.log10(np.max(np.abs(x)))
    o = int(round(info['intro_s'] * sr))
    sf.write(os.path.join(work, 'seam.wav'), np.concatenate([x[-4 * sr:], x[o:o + 4 * sr]]), sr)
    render.to_mp3(os.path.join(work, 'seam.wav'), os.path.join(out, ID + '_loop_seam.mp3'))
    meta = dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(info['intro_s'], 6), loop_s=round(info['loop_s'], 6),
                total_s=round(info['total_s'], 3), lufs=round(info['lufs'], 2), bpm=BPM, key='A minor (Dorian colour)',
                seam=[round(v, 5) for v in seam], peak_dbfs=round(float(peak), 2), harmony_problems=bad, sections=smap)
    json.dump(meta, open(os.path.join(out, 'info.json'), 'w'), indent=1)
    print(json.dumps(meta, indent=1))


if __name__ == '__main__':
    main()
