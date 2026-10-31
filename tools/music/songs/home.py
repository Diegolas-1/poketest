"""Home: "Mom's Kitchen" (original composition), song 8/12 of the Pallet Town OST.

Plays indoors in Ash's home (the Ketchum house: Delia cooking, Mr. Mime
sweeping) and in the other Pallet Town houses, at any time of day. A cozy
indoor cousin of the town theme (G major, piano + band): G major, 92 bpm,
4/4 with a light swing (eighths played about 60:40), a small warm room.

Form (bars; the loop body is 64 bars, the intro plays once):
  Intro  1-4    kitchen-clock tick-tock (woodblocks), piano chords G Em7 Am7 D7,
                clarinet and bassoon peek in
  A      5-12   upright piano melody, nylon guitar fingerpicking, upright bass
                two-feel, shaker and soft rim; staccato clarinet answer
  A'     13-20  + string pad, clarinet guide-tone countermelody, piano "chick"
                chords, the clock ticking; staccato bassoon answer into B
  B      21-28  tender and a little nostalgic (Cmaj7 D/C Bm7 E7 Am7, Cm6):
                piano melody over pedalled arpeggios, rolled guitar chords
  B'     29-36  violins take the B melody, clarinet a third below, piano
                arpeggios float above; swells into the bridge
  C      37-44  "Mr. Mime" bridge in C: staccato bassoon tiptoe tune, walking
                bass, pizzicato off-beats, xylophone winks, clock ticks
  C'     45-52  the clarinet takes the tune up an octave; the mime FREEZES
                (bar 51: one hit, then only the clock), piano runs up a D7
  A''    53-60  the whole band: piano melody in thirds, clarinet counter,
                pizzicato strings, glockenspiel
  Link   61-68  breakdown: the tune a music-box octave higher over the clock,
                a tender Cm6, the bassoon walks back to the top
The game loops bars 5-68.

Instruments: VSCO 2 CE upright piano, clarinet (legato and staccato),
bassoon (staccato), string ensembles (pad, pizzicato), contrabass pizzicato,
xylophone, glockenspiel; GeneralUser GS (fluidsynth) nylon guitar, acoustic
bass (layered with the contrabass pizz) and percussion (shaker, side stick,
wood blocks, triangle). All in one small room reverb.

  python3 tools/music/songs/home.py --out DIR [--check] [--excerpt B0 B1]
"""
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import build  # noqa: E402
import render  # noqa: E402
from score import Part, Tempo, midi, DYN  # noqa: E402
from sfz import SR  # noqa: E402

ID, TITLE, BPM = 'home', "Mom's Kitchen", 92
SF2 = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'
BPB = 4
SWING = 0.60          # where the off-beat eighth falls inside the beat

render.ORCH['piano'] = ('UprightPiano.sfz', 0.0, 0.45, None)
render.ORCH['xylo'] = ('Xylophone.sfz', 3.0, 1.0, None)
render.SEAT.update({
    'piano': dict(pan=-0.12, width=0.7, depth=0.15),
    'guitar': dict(pan=0.38, width=0.45, depth=0.25),
    'bass': dict(pan=0.08, width=0.3, depth=0.25),
    'shaker': dict(pan=0.45, width=0.2, depth=0.4),
    'rim': dict(pan=-0.05, width=0.2, depth=0.4),
    'wood': dict(pan=-0.4, width=0.2, depth=0.45),
    'tri': dict(pan=0.3, width=0.2, depth=0.5),
    'xylo': dict(pan=0.3, width=0.35, depth=0.5),
    'pvln': dict(pan=-0.45, width=0.5, depth=0.3),
    'pvla': dict(pan=0.25, width=0.5, depth=0.3),
})

NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
PCN = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
QUAL = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10],
        'dim7': [0, 3, 6, 9], 'm6': [0, 3, 7, 9], '6': [0, 4, 7, 9], 'sus4': [0, 5, 7], '7sus4': [0, 5, 7, 10]}


def nm(k):
    return NOTE[k % 12] + str(k // 12 - 1)


def chord(name):
    """'G7/B' -> (root pc, [pcs], bass pc)"""
    body, _, bass = name.partition('/')
    r = PCN[body[0]]
    i = 1
    while i < len(body) and body[i] in '#b':
        r += 1 if body[i] == '#' else -1
        i += 1
    pcs = [(r + x) % 12 for x in QUAL[body[i:]]]
    b = r % 12
    if bass:
        b = PCN[bass[0]] + bass[1:].count('#') - bass[1:].count('b')
    return r % 12, pcs, b % 12


# ---------------- harmony (two chords per bar) ----------------
INTRO = ['G', 'G', 'Em7', 'Em7', 'Am7', 'Am7', 'D7', 'D7']
A1 = ['G', 'G/B', 'C', 'C#dim7', 'G/D', 'E7', 'Am7', 'D7', 'G', 'G7/B', 'C', 'Cm6', 'G/D', 'D7', 'G', 'D7']
A2 = A1[:8] + ['C', 'D/C', 'Bm7', 'E7', 'Am7', 'D7', 'G', 'G']
B1 = ['Cmaj7', 'Cmaj7', 'D/C', 'D/C', 'Bm7', 'E7', 'Am7', 'Am7',
      'Cmaj7', 'Cm6', 'G/B', 'E7', 'Am7', 'D7', 'Dsus4', 'D7']
B2 = B1[:12] + ['Am7', 'D7', 'G', 'G7']
C1 = ['C', 'C', 'C', 'C', 'Dm7', 'G7', 'C', 'A7', 'F', 'F', 'F#dim7', 'F#dim7', 'C/G', 'A7', 'D7', 'G7']
C2 = ['C', 'C', 'C', 'C', 'Dm7', 'G7', 'Em7', 'A7', 'Dm7', 'Dm7', 'G7', 'G7', 'Am7', 'Am7', 'D7', 'D7']
A3 = A2
LINK = ['G', 'G/B', 'C', 'C#dim7', 'G/D', 'E7', 'Am7', 'D7', 'Cmaj7', 'Cmaj7', 'Cm6', 'Cm6', 'G/D', 'Em7', 'Am7', 'D7']

LS = 16                       # loop start (beat)
SEC = [('Intro', 0, INTRO), ('A', 16, A1), ("A'", 48, A2), ('B', 80, B1), ("B'", 112, B2),
       ('C', 144, C1), ("C'", 176, C2), ("A''", 208, A3), ('Link', 240, LINK)]
END = 272
S = {n: b for n, b, _ in SEC}
HARM = []                     # [beat, chord name]
for _, b0, h in SEC:
    for i, c in enumerate(h):
        HARM.append([b0 + 2 * i, c])


def chord_at(beat):
    c = HARM[0][1]
    for b, n in HARM:
        if b <= beat + 1e-6:
            c = n
    return c


def halves(b0, b1):
    """(beat, dur, chord) for every half bar in [b0, b1)."""
    return [(b, 2, c) for b, c in HARM if b0 <= b < b1]


# ---------------- melodies ----------------
MEL_A_HEAD = """G4:e B4:e D5:q. B4:e D5:e E5:e | D5:e C5:q. r:e E5:e G5:e E5:e |
D5:q. B4:e G#4:q B4:q | C5:q. A4:e r:e F#4:e A4:e C5:e |"""
MEL_A1 = MEL_A_HEAD + """ G4:e B4:e D5:q. B4:e F5:e D5:e | E5:q. C5:e r:e Eb5:e C5:e A4:e |
B4:q. G4:e A4:q. F#4:e | G4:h r:h |"""
MEL_A2 = MEL_A_HEAD + """ E5:e G5:e E5:q. D5:e C5:e D5:e | D5:q. B4:e r:e G#4:e B4:e D5:e |
C5:q E5:q D5:q. C5:e | B4:e A4:e G4:h. |"""
MEL_B_HEAD = """G4:q B4:q E5:h | D5:q. C5:e A4:h | B4:q. A4:e G#4:q B4:q | C5:h~ C5:e B4:e A4:e G4:e |
B4:q. C5:e Eb5:h | D5:q. B4:e G#4:h | A4:e C5:e E5:q D5:q. C5:e |"""
MEL_B1 = MEL_B_HEAD + ' D5:h C5:q A4:q |'
MEL_B2 = MEL_B_HEAD + ' B4:h r:e G4:e A4:e B4:e |'
TUNE_C = """G3:e r:e C4:e r:e E4:e D4:e C4:e r:e | B3:e C4:e D#4:e E4:e r:q G3:q |
F4:e r:e D4:e r:e B3:e r:e G3:e r:e | E4:q C4:q C#4:e E4:e G4:e E4:e |
F4:e r:e A3:e r:e C4:e A3:e F3:e r:e | Eb4:e r:e C4:e r:e A3:e F#3:e A3:e C4:e |
E4:q. G3:e C#4:q E4:q | F#4:e A4:e F#4:e D4:e B3:e D4:e F4:e G4:e |"""
TUNE_C2 = """G4:e r:e C5:e r:e E5:e D5:e C5:e r:e | B4:e C5:e D#5:e E5:e r:q G4:q |
F5:e r:e D5:e r:e B4:e r:e G4:e r:e | E5:q G5:q C#5:e E5:e G5:e E5:e |
D5:e r:e F5:e r:e A5:e F5:e D5:e r:e | B5:e r:e G5:e r:e F5:e D5:e B4:e D5:e |
A4:e r:q. r:h | r:w |"""
MEL_LINK = """G4:q B4:q E5:h | Eb5:h. C5:q | B4:h G4:h | A4:h r:h |"""


def octv(text, n):
    import re
    return re.sub(r'([A-G][#b]?)(-?\d)(?=[:,~])', lambda m: m.group(1) + str(int(m.group(2)) + n), text)


# ---------------- generators ----------------
def dyn(p, beat, d, ramp=False):
    p.dyn.append([beat, DYN[d], ramp])


def addn(p, b, d, keys, vel=None):
    keys = sorted(keys)
    n = [b, d, keys, [nm(k) for k in keys]]
    if vel is not None:
        n.append(vel)
    p.notes.append(n)


def voicings(pcs, lo, hi, n):
    """Close-ish voicings: n notes from the chord's pcs inside [lo, hi],
    span at most 14 semitones, every pc used when n >= len(pcs)."""
    out = []
    keys = [k for k in range(lo, hi + 1) if k % 12 in pcs]
    import itertools
    for comb in itertools.combinations(keys, n):
        if comb[-1] - comb[0] > 14:
            continue
        got = {k % 12 for k in comb}
        if n >= len(pcs) and len(got) < len(pcs):
            continue
        if n < len(pcs) and len(got) < n:
            continue
        if any(b - a < 2 for a, b in zip(comb, comb[1:])):
            continue
        out.append(comb)
    return out


def lead(prev, cands, center):
    if prev is None:
        return min(cands, key=lambda c: abs(sum(c) / len(c) - center))
    return min(cands, key=lambda c: sum(abs(a - b) for a, b in zip(c, prev)) + 0.15 * abs(sum(c) / len(c) - center))


def voice_seq(b0, b1, lo, hi, n, center, drop=None):
    """One voicing per half bar, voice-led. drop: pcs to leave out first
    (the root is dropped from 4-note chords when n == 3)."""
    prev, out = None, []
    for b, d, c in halves(b0, b1):
        r, pcs, bass = chord(c)
        if 'maj7' in c:
            # accompaniment plays the major 7th chord as add9 (no 7th
            # under the root: the melody carries the 7th)
            pcs = [r, (r + 4) % 12, (r + 7) % 12, (r + 2) % 12]
        use = pcs
        if n < len(pcs):
            use = [p for p in pcs if p != r] if len(pcs) - 1 == n else pcs
        v = lead(prev, voicings(use, lo, hi, n), center)
        out.append((b, d, c, v))
        prev = v
    return out


def pad(parts, b0, b1, lo=55, hi=76, center=65):
    """parts: [low, mid, high] Parts; ties repeated notes."""
    seq = voice_seq(b0, b1, lo, hi, 3, center)
    for vi, p in enumerate(parts):
        cur = None
        for b, d, c, v in seq:
            k = v[vi]
            if cur and cur[2] == [k] and abs(cur[0] + cur[1] - b) < 1e-6:
                cur[1] += d
            else:
                addn(p, b, d, [k])
                cur = p.notes[-1]


def bass_root(c, lo=28, hi=40):
    r, pcs, b = chord(c)
    k = lo + (b - lo) % 12
    return k


def bass_two(p, b0, b1):
    """Two-feel: root, fifth or the next root, chromatic approach notes."""
    hs = halves(b0, b1)
    nxt_root = lambda i: bass_root(hs[i + 1][2]) if i + 1 < len(hs) else bass_root(chord_at(b1))
    for i, (b, d, c) in enumerate(hs):
        r = bass_root(c)
        same_prev = i % 2 == 1 and hs[i - 1][2] == c
        if same_prev:
            rr, pcs, bb = chord(c)
            fifth = r + 7 if r + 7 <= 43 else r - 5
            k = fifth
        else:
            k = r
        nr = nxt_root(i)
        if i % 4 == 3 and nr != k:
            addn(p, b, 1.5, [k])
            ap = nr - 1 if abs(nr - 1 - k) <= abs(nr + 1 - k) else nr + 1
            if ap == k:
                ap = nr + 1 if ap == nr - 1 else nr - 1
            addn(p, b + 1.5, 0.5, [ap])
        else:
            addn(p, b, 2, [k])


SCALE_G = {0, 2, 4, 6, 7, 9, 11}


def bass_walk(p, b0, b1):
    """Walking quarters: root, a chord tone on the way, the next root or the
    fifth, a chromatic approach to the next bar's root."""
    for bar in range(int(b0), int(b1), 4):
        c1, c2 = chord_at(bar), chord_at(bar + 2)
        nc = chord_at(bar + 4) if bar + 4 < b1 else chord_at(b1)
        r1 = bass_root(c1, 31, 43)
        r2 = bass_root(c2, 31, 43)
        rn = bass_root(nc, 31, 43)
        p1 = chord(c1)[1]
        p2 = chord(c2)[1]
        t1 = sorted(k for k in range(28, 51) if k % 12 in p1 and k != r1)
        if c2 == c1:
            # root, 3rd, 5th (or octave), approach
            b2 = min(t1, key=lambda k: abs(k - (r1 + 4)))
            b3 = min(t1, key=lambda k: abs(k - (r1 + 7)))
        else:
            b2 = min(t1, key=lambda k: abs(k - (r1 + (r2 - r1) / 2)) if abs(k - r1) <= 7 else 99)
            b3 = r2
        ap = rn - 1 if b3 < rn else rn + 1
        if ap == b3:
            ap = rn + (2 if ap > rn else -2)
        for j, k in enumerate([r1, b2, b3, ap]):
            addn(p, bar + j, 1, [k])


def guitar_pick(p, b0, b1, lo=52, hi=74):
    seq = voice_seq(b0, b1, lo, hi, 4, 62)
    pat = [0, 2, 1, 3]
    for b, d, c, v in seq:
        for j, vi in enumerate(pat):
            ring = 2 - j * 0.5
            addn(p, b + j * 0.5, ring, [v[vi]])


def guitar_roll(p, b0, b1, every=4, lo=50, hi=74):
    seq = voice_seq(b0, b1, lo, hi, 4, 62)
    for b, d, c, v in seq:
        if (b - b0) % every == 0 or c != chord_at(b - 0.01):
            addn(p, b, every if c == chord_at(b + 2) and every == 4 else 2, list(v))


def guitar_chop(p, b0, b1, lo=55, hi=72):
    seq = voice_seq(b0, b1, lo, hi, 3, 64)
    for b, d, c, v in seq:
        addn(p, b + 1, 0.3, list(v))


def piano_hold(p, b0, b1, lo=48, hi=66):
    for b, d, c, v in voice_seq(b0, b1, lo, hi, 3, 57):
        addn(p, b, d, list(v))


def piano_chick(p, b0, b1, lo=53, hi=70):
    for b, d, c, v in voice_seq(b0, b1, lo, hi, 3, 61):
        addn(p, b + 1, 0.45, list(v))


def piano_arp(p, b0, b1):
    for b, d, c in halves(b0, b1):
        r, pcs, bass = chord(c)
        if 'maj7' in c:
            pcs = [r, (r + 4) % 12, (r + 7) % 12, (r + 2) % 12]
        root = 36 + (bass - 36) % 12
        if root > 45:
            root -= 12
        up = sorted(k for k in range(root + 5, root + 20) if k % 12 in pcs)
        seq = [root, up[0], up[1], up[2] if len(up) > 2 else up[1] + 12]
        for j, k in enumerate(seq):
            addn(p, b + j * 0.5, d - j * 0.5, [k])


def piano_float(p, b0, b1):
    """RH broken chords high above a melody (harp-like), up then down."""
    prev = None
    for i, (b, d, c, v) in enumerate(voice_seq(b0, b1, 72, 88, 3, 79)):
        seq = [v[0], v[1], v[2], v[1]] if i % 2 == 0 else [v[2], v[1], v[0], v[1]]
        for j, k in enumerate(seq):
            addn(p, b + j * 0.5, 1.0 if j < 3 else 0.5, [k])


def harmony_below(mel_part, b0, b1, mind=3, maxd=9):
    """A chord tone 3-9 semitones under each melody note that is a chord tone."""
    out = []
    for b, d, keys, ps in [n for n in mel_part.notes if b0 <= n[0] < b1]:
        k = keys[-1]
        r, pcs, bass = chord(chord_at(b))
        if k % 12 not in pcs or d < 0.5:
            continue
        cand = [x for x in range(k - maxd, k - mind + 1) if x % 12 in pcs]
        if cand:
            out.append((b, d, max(cand)))
    return out


def guide_tones(p, b0, b1, mel, lo=60, hi=69):
    prev = None
    for b, d, c in halves(b0, b1):
        r, pcs, bass = chord(c)
        third = [x for x in pcs if (x - r) % 12 in (3, 4)]
        sev = [x for x in pcs if (x - r) % 12 in (10, 11, 9)]
        pref = third + sev + [x for x in pcs if x not in third + sev]
        mk = {n[2][-1] for n in mel.notes if n[0] < b + d and n[0] + n[1] > b}
        cands = [k for k in range(lo, hi + 1) if k % 12 in pref and all(abs(k - m) > 2 for m in mk)]
        if not cands:
            cands = [k for k in range(lo, hi + 1) if k % 12 in pcs]
        if prev is None:
            k = min(cands, key=lambda k: (pref.index(k % 12), abs(k - 64)))
        else:
            k = min(cands, key=lambda k: abs(k - prev) + 0.8 * pref.index(k % 12))
        if p.notes and p.notes[-1][2] == [k] and abs(p.notes[-1][0] + p.notes[-1][1] - b) < 1e-6:
            p.notes[-1][1] += d
        else:
            addn(p, b, d, [k])
        prev = k


def pizz_off(hi_p, lo_p, b0, b1):
    for b, d, c, v in voice_seq(b0, b1, 55, 76, 3, 66):
        addn(hi_p, b + 1, 0.4, [v[1], v[2]])
        addn(lo_p, b + 1, 0.4, [v[0]])


# GM drum keys
SIDE, SHAKER, WB_HI, WB_LO, TRI, TRI_M = 37, 82, 76, 77, 81, 80


def shaker(p, b0, b1, lv=1.0):
    for b in np.arange(b0, b1, 0.5):
        off = (b % 1) > 0.25
        addn(p, float(b), 0.25, [SHAKER], (0.62 if off else 0.4) * lv)


def rim(p, b0, b1, lv=1.0):
    for b in range(int(b0), int(b1)):
        if b % 2 == 1:
            addn(p, b, 0.25, [SIDE], 0.5 * lv)


def clock(p, b0, b1, lv=1.0):
    for b in range(int(b0), int(b1)):
        addn(p, b, 0.2, [WB_HI if b % 2 == 0 else WB_LO], (0.42 if b % 2 == 0 else 0.36) * lv)


def swing(parts, r=SWING):
    def w(x):
        f = x - np.floor(x)
        base = np.floor(x)
        return float(base + (f * 2 * r if f < 0.5 else r + (f - 0.5) * 2 * (1 - r)))
    for p in parts:
        for n in p.notes:
            b, d = n[0], n[1]
            nb, ne = w(b), w(b + d)
            n[0], n[1] = nb, max(ne - nb, 0.05)


# ---------------- the score ----------------
def build_score():
    P = []

    def part(name, patch, seat, **perf):
        p = Part(name, patch, '', 0, BPB, **perf)
        p.seat = seat
        P.append(p)
        return p

    pno = part('Piano', 'piano', 'piano', humanize=0.006, gate=1.0)
    pnoh = part('Piano harmony', 'piano', 'piano', humanize=0.008, gate=1.0, dyn=-0.07)
    pnol = part('Piano LH', 'piano', 'piano', humanize=0.01, gate=1.0, dyn=-0.1)
    cl = part('Clarinet', 'cl', 'cl', legato=True, humanize=0.008, swell=0.04)
    cls = part('Clarinet stacc', 'cl_stac', 'cl', humanize=0.006)
    bns = part('Bassoon stacc', 'bn_stac', 'bn', humanize=0.006)
    vln1 = part('Violins I', 'vln', 'vln1', legato=True, swell=0.06, humanize=0.01, cents=2)
    vln2 = part('Violins II', 'vln', 'vln2', legato=True, swell=0.04, humanize=0.012, cents=-3)
    vla = part('Violas', 'vla', 'vla', legato=True, swell=0.04, humanize=0.012)
    vc = part('Cellos', 'vc', 'vc', legato=True, swell=0.04, humanize=0.012)
    pv = part('Violins pizz', 'vln_pizz', 'pvln', humanize=0.008)
    pa = part('Violas pizz', 'vla_pizz', 'pvla', humanize=0.008)
    cbp = part('Bass', 'cb_pizz', 'bass', humanize=0.007)
    xy = part('Xylophone', 'xylo', 'xylo', humanize=0.004)
    gl = part('Glockenspiel', 'glock', 'glock', humanize=0.004, gate=2.0)
    gtr = part('Guitar', 'gm:24', 'guitar', humanize=0.008)
    bgm = part('Bass GM', 'gm:32', 'bass', humanize=0.007)
    sh = part('Shaker', 'gm:drum', 'shaker', humanize=0.006)
    rm = part('Rim', 'gm:drum', 'rim', humanize=0.006)
    wb = part('Clock', 'gm:drum', 'wood', humanize=0.003)
    tr = part('Triangle', 'gm:drum', 'tri', humanize=0.003)

    I, A, A_, B, B_, C, C_, A__, L = (S[k] for k in ['Intro', 'A', "A'", 'B', "B'", 'C', "C'", "A''", 'Link'])

    # ---- intro: clock, piano chords, winds peek in
    clock(wb, 0, 16, 1.0)
    dyn(pno, 0, 'mp')
    for b, d, c, v in voice_seq(0, 16, 55, 74, 4, 64):
        if (b % 4) == 0:
            addn(pno, b, 1.4, list(v))
            addn(pno, b + 1.5, 0.45, list(v))
        else:
            addn(pno, b + 0.5, 0.45, list(v))
            addn(pno, b + 1, 0.9, list(v))
    for b, d, c in halves(0, 16):
        if b % 4 == 0:
            addn(pnol, b, 4, [bass_root(c, 40, 52)])
    dyn(pnol, 0, 'mp')
    cls.add('@mp r:w | r:h r:e B4:e G4:e r:e | r:h E5:e r:e C5:e A4:e | r:w |', I)
    bns.add('@mp r:w | r:w | r:w | r:e D3:e E3:e F#3:e A3:e C4:e r:q |', I)

    # ---- A
    pno.add('@mp ' + MEL_A1, A)
    piano_hold(pnol, A, A_)
    dyn(pnol, A, 'p')
    guitar_pick(gtr, A, A_)
    dyn(gtr, A, 'mp')
    bass_two(cbp, A, A_)
    dyn(cbp, A, 'mp')
    shaker(sh, A, A_, 0.8)
    rim(rm, A, A_, 0.7)
    cls.add('@mp r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:h D5:e C5:e A4:e F#4:e |', A)

    # ---- A'
    pno.add('@mp ' + MEL_A2, A_)
    piano_chick(pnol, A_, B)
    dyn(pnol, A_, 'p')
    guitar_pick(gtr, A_, B)
    bass_two(cbp, A_, B)
    shaker(sh, A_, B, 0.85)
    rim(rm, A_, B, 0.8)
    clock(wb, A_, B, 0.55)
    pad([vc, vla, vln2], A_, B)
    for p in (vc, vla, vln2):
        dyn(p, A_, 'pp')
    cl.add('@p B3:h D4:h | E4:h Bb3:h | B3:h D4:h | E4:h C4:h | G4:h F#4:h | F#4:h E4:h | E4:h F#4:h | D4:w |', A_)
    bns.add('@mp r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:h B2:e D3:e G3:e r:e |', A_)

    # ---- B (tender)
    addn(tr, B, 1, [TRI], 0.35)
    pno.add('@mp ' + MEL_B1, B)
    piano_arp(pnol, B, B_)
    dyn(pnol, B, 'p')
    guitar_roll(gtr, B, B_)
    dyn(gtr, B, 'p')
    pad([vc, vla, vln2], B, B_)
    for p in (vc, vla, vln2):
        dyn(p, B, 'p')
    for b, d, c in halves(B, B_):
        if b % 4 == 0:
            addn(cbp, b, 2, [bass_root(c)])
        elif c != chord_at(b - 1):
            addn(cbp, b, 2, [bass_root(c)])
    dyn(cbp, B, 'mp')
    shaker(sh, B, B_, 0.45)
    cl.add('@p r:w | r:w | r:w | r:h E4:e G4:e A4:q | r:w | r:w | r:w | r:w |', B)
    # piano fill into B' (over Dsus4 | D7)
    pfill = part('Piano fill', 'piano', 'piano', humanize=0.006, dyn=-0.05)
    pfill.add('@p r:w | ' * 7 + 'r:h D5:e F#5:e A5:e C6:e |', B)

    # ---- B' (violins sing)
    addn(tr, B_, 1, [TRI], 0.4)
    vln1.add('@mp< ' + MEL_B2.replace('B4:h r:e G4:e A4:e B4:e', 'B4:h r:h') + ' @mf', B_)
    clh = harmony_below(vln1, B_, C)
    cl.notes += []
    for b, d, k in clh:
        addn(cl, b, d, [k])
    dyn(cl, B_, 'p')
    dyn(cl, B_ + 16, 'mp')
    piano_float(pno, B_, C - 4)
    dyn(pno, B_, 'p')
    piano_arp(pnol, B_, C)
    pad([vc, vla, vln2], B_, C)
    for p in (vc, vla, vln2):
        dyn(p, B_, 'p', True)
        dyn(p, C - 2, 'mp')
    guitar_roll(gtr, B_, C)
    for b, d, c in halves(B_, C):
        if b % 4 == 0 or c != chord_at(b - 1):
            addn(cbp, b, 2, [bass_root(c)])
    shaker(sh, B_, C, 0.55)
    # run into the bridge
    cls.add('@mp r:w | ' * 7 + 'r:h G4:e B4:e D5:e F5:e |', B_)
    pno.add('@mp r:h r:e G5:e A5:e B5:e |', C - 4)

    # ---- C (Mr. Mime): bassoon tiptoe
    bns.add('@mf ' + TUNE_C, C)
    bass_walk(cbp, C, C_ + 24)
    dyn(cbp, C, 'mp')
    pizz_off(pv, pa, C, C_ + 24)
    dyn(pv, C, 'mp')
    dyn(pa, C, 'mp')
    guitar_chop(gtr, C, C_ + 24)
    dyn(gtr, C, 'mp')
    clock(wb, C, C_ + 24, 0.8)
    rim(rm, C, C_ + 24, 0.75)
    xy.add('@mp r:e G5:e r:e C6:e r:h | r:h E6:e G6:e r:q | r:w | r:w | r:e A5:e r:e C6:e r:h | r:w | r:w | r:w |', C)
    # ---- C': clarinet up an octave, bassoon oom-pah, freeze, piano run
    cls.add('@mf ' + TUNE_C2, C_)
    for b, d, c in halves(C_, C_ + 24):
        addn(bns, b, 0.5, [bass_root(c, 43, 55)])
    dyn(bns, C_, 'mp')
    xy.add('@mp r:w | r:h E6:e G6:e r:q | r:w | r:w | r:w | r:w | r:w | r:w |', C_)
    pnoc = part('Piano bridge', 'piano', 'piano', humanize=0.006, dyn=-0.05)
    pnoc.add('@mp r:w | r:w | r:w | r:h r:e E6:e G6:e A6:e | r:w | r:w | r:w | r:h r:e F#6:e A6:e C7:e |', C)
    pnoc.add('@p r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w |', C_)
    # FREEZE bar (C' bar 7, Am7): one hit, then only the clock
    FZ = C_ + 24
    addn(pnoc, FZ, 0.4, [57, 60, 64, 67])
    addn(pnoc, FZ, 0.4, [45])
    dyn(pnoc, FZ, 'mf')
    addn(cbp, FZ, 1, [33])
    addn(bns, FZ, 0.5, [45])
    addn(pv, FZ, 0.4, [67, 72])
    addn(pa, FZ, 0.4, [64])
    addn(gtr, FZ, 0.3, [57, 60, 64, 69])
    for j in (1, 2, 3):
        addn(wb, FZ + j, 0.2, [WB_HI if j % 2 == 0 else WB_LO], 0.5)
    # bar 8 (D7): piano runs up, the clock ticks on, bass walks to G
    pnoc.add('@mp< D4:e F#4:e A4:e C5:e D5:e F#5:e A5:e C6:e @mf', FZ + 4)
    for j in range(4):
        addn(wb, FZ + 4 + j, 0.2, [WB_HI if j % 2 == 0 else WB_LO], 0.5 + 0.08 * j)
    for j, k in enumerate([38, 42, 45, 42]):
        addn(cbp, FZ + 4 + j, 1, [k])
    addn(bns, FZ + 4, 0.5, [50])
    addn(bns, FZ + 6, 0.5, [45])
    addn(tr, FZ + 7.5, 1, [TRI], 0.4)

    # ---- A'': everyone
    pno.add('@mf ' + MEL_A2, A__)
    for b, d, k in harmony_below(pno, A__, L):
        addn(pnoh, b, d, [k])
    dyn(pnoh, A__, 'mf')
    piano_chick(pnol, A__, L)
    dyn(pnol, A__, 'mp')
    guitar_pick(gtr, A__, L)
    dyn(gtr, A__, 'mp')
    bass_two(cbp, A__, L)
    dyn(cbp, A__, 'mf')
    pizz_off(pv, pa, A__, L)
    dyn(pv, A__, 'mp')
    dyn(pa, A__, 'mp')
    pad([vc, vla, vln2], A__, L)
    for p in (vc, vla, vln2):
        dyn(p, A__, 'mp')
        dyn(p, L - 4, 'mp', True)
        dyn(p, L, 'pp')
    cl.add('@mp ' + octv(MEL_A2, -1), A__)
    shaker(sh, A__, L, 1.0)
    rim(rm, A__, L, 0.9)
    gl.add('@mp r:w | r:w | r:w | r:h r:e F#6:e A6:e C7:e | r:w | r:w | r:w | r:h D6:e B5:e G5:q |', A__)
    bns.add('@mp r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:h G3:e D3:e B2:e r:e |', A__)

    # ---- Link: music box over the clock, back to the top
    pno.add('@p ' + octv(MEL_A_HEAD, 1) + ' ' + MEL_LINK, L)
    dyn(pno, L + 16, 'mp')
    piano_hold(pnol, L, END)
    dyn(pnol, L, 'pp')
    dyn(pnol, L + 16, 'p')
    clock(wb, L, END, 0.75)
    for b, d, c in halves(L, END):
        if b % 4 == 0 or c != chord_at(b - 1):
            addn(cbp, b, 2, [bass_root(c)])
    pad([vc, vla, vln2], L + 16, END)
    shaker(sh, L + 16, END, 0.35)
    bns.add('@mp r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:h D3:e F#3:e A3:e C4:e |', L)

    # GM bass doubles the contrabass pizz (definition + body)
    for n in cbp.notes:
        bgm.notes.append([n[0], n[1], list(n[2]), list(n[3])])
    bgm.dyn = [list(x) for x in cbp.dyn]

    tempo = Tempo([[0, 86], [6, 92], [B - 2, 92], [B - 0.5, 89.5], [B + 0.5, 92],
                   [FZ - 0.5, 92], [FZ + 0.5, 84], [FZ + 3.5, 83], [FZ + 5, 92], [END, 92]])
    return P, tempo


# ---------------- checks ----------------
TENS = {'': {2, 9}, 'm': {2, 5}, '7': {2, 9}, 'maj7': {2, 9}, 'm7': {2, 5}, 'dim7': set(), 'm6': {2},
        '6': {2}, 'sus4': {2}, '7sus4': {2, 9}}


def check(P):
    melodic = ['Piano', 'Piano harmony', 'Clarinet', 'Clarinet stacc', 'Bassoon stacc', 'Violins I',
               'Xylophone', 'Glockenspiel', 'Piano fill', 'Piano bridge']
    issues = 0
    for p in P:
        if p.name not in melodic:
            continue
        for b, d, keys, ps in p.notes:
            c = chord_at(b)
            r, pcs, bass = chord(c)
            q = c.partition('/')[0].lstrip('ABCDEFG#b')
            for k in keys:
                pc = k % 12
                if pc in pcs:
                    continue
                iv = (pc - r) % 12
                strong = abs(b - round(b)) < 1e-6 and (b % 2 == 0 or d >= 1)
                if iv in TENS.get(q, set()) and not strong:
                    continue
                tag = 'tension' if iv in TENS.get(q, set()) else 'NCT'
                if d >= 1 or strong:
                    print('  %-14s beat %6.2f bar %3d  %-4s over %-7s %s dur %.2f%s' % (
                        p.name, b, int(b // 4) + 1, nm(k), c, tag, d, '  <-- check' if tag == 'NCT' else ''))
                    issues += tag == 'NCT'
    # semitone clashes between simultaneous sounding melodic notes (minor 2nd / minor 9th)
    snd = []
    for p in P:
        if p.patch.startswith('gm:drum'):
            continue
        for b, d, keys, ps in p.notes:
            for k in keys:
                snd.append((b, b + min(d, 2.0), k, p.name))
    snd.sort()
    clash = 0
    for i, (b, e, k, nmx) in enumerate(snd):
        for b2, e2, k2, n2 in snd[i + 1:]:
            if b2 >= e:
                break
            if n2 == nmx:
                continue
            if abs(k - k2) in (1, 13) and min(e, e2) - max(b, b2) >= 0.5:
                c = chord_at(max(b, b2))
                print('  clash %s %s (%s) vs %s (%s) at beat %.2f over %s' % (nmx, nm(k), '', n2, nm(k2), max(b, b2), c))
                clash += 1
    print('NCT on strong beats / long notes:', issues, '  semitone clashes:', clash)


def section_map(tempo):
    print('Section map:')
    for n, b, h in SEC:
        print('  %-5s bar %3d  beat %3d  %6.2f s' % (n, b // 4 + 1, b, tempo.sec(b)))
    print('  end   bar %3d  beat %3d  %6.2f s' % (END // 4 + 1, END, tempo.sec(END)))


# ---------------- rendering ----------------
def gm_render(p, tempo, b0, b1, origin, work, tag):
    import pretty_midi as pm
    prog = p.patch.split(':')[1]
    drum = prog == 'drum'
    inst = pm.Instrument(program=0 if drum else int(prog), is_drum=drum)
    PAD = 1.0
    t0 = tempo.sec(origin)
    hum = p.perf.get('humanize', 0.006)
    last = 0
    for n in p.notes:
        b, d, keys = n[0], n[1], n[2]
        if not (b0 - 1e-6 <= b < b1 - 1e-6):
            continue
        rng = np.random.default_rng(render._seed(p.name, round(b, 4), tuple(keys)))
        on = tempo.sec(b) - t0 + rng.normal(0, hum) + PAD
        off = tempo.sec(b + d) - t0 + PAD
        lv = p.level(b) + p.perf.get('dyn', 0)
        for j, k in enumerate(sorted(keys)):
            v = n[4] if len(n) > 4 else lv
            vel = int(np.clip(22 + 105 * v + rng.normal(0, 4), 8, 124))
            st = on + j * (0.018 if len(keys) > 2 and not drum else 0)
            inst.notes.append(pm.Note(velocity=vel, pitch=int(k), start=max(st, 0.01), end=max(off, st + 0.05)))
            last = max(last, off)
    if not inst.notes:
        return np.zeros((SR, 2), np.float32)
    inst.control_changes.append(pm.ControlChange(64, 0, last + 3.0))
    m = pm.PrettyMIDI(initial_tempo=120)
    m.instruments.append(inst)
    mid = os.path.join(work, '%s_%s.mid' % (p.name.replace(' ', '_'), tag))
    wav = mid[:-4] + '.wav'
    m.write(mid)
    subprocess.run(['fluidsynth', '-ni', '-q', '-g', '0.6', '-R', '0', '-C', '0', '-r', str(SR), '-F', wav, SF2, mid],
                   check=True, capture_output=True)
    x, sr = sf.read(wav, dtype='float32', always_2d=True)
    return x[int(PAD * SR):]


GAINS = {}          # part name -> dB trim (set after measuring stems)


def stem_audio(p, tempo, b0, b1, origin, work, tag):
    if p.patch.startswith('gm:'):
        return gm_render(p, tempo, b0, b1, origin, work, tag)
    return render.render_part(p, tempo, b0, b1, origin)


def mix_down(parts, tempo, work, loop=True, ex=None):
    room = render.hall_ir(seconds=2.2, rt_low=1.4, rt_mid=1.05, rt_high=0.55, seed=11)
    if loop:
        intro_s = tempo.sec(LS)
        loop_s = tempo.sec(END) - intro_s
        intro_n, N = int(round(intro_s * SR)), int(round(loop_s * SR))
        reps = 3
        total = intro_n + reps * N + 6 * SR
    else:
        b0, b1 = ex
        total = int((tempo.sec(b1) - tempo.sec(b0) + 6) * SR)
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    levels = {}
    for p in parts:
        stem = np.zeros((total, 2), np.float32)
        if loop:
            a = stem_audio(p, tempo, 0, LS, 0, work, 'intro')
            stem[:min(len(a), total)] += a[:total]
            lp = stem_audio(p, tempo, LS, END, LS, work, 'loop')
            for k in range(reps):
                i = intro_n + k * N
                seg = lp[:max(0, total - i)]
                stem[i:i + len(seg)] += seg
        else:
            a = stem_audio(p, tempo, ex[0], ex[1], ex[0], work, 'ex')
            stem[:min(len(a), total)] += a[:total]
        seat = dict(render.SEAT[p.seat], **{k: p.perf[k] for k in ('pan', 'width', 'depth') if k in p.perf})
        d, s = render.place(stem, seat)
        g = 10 ** ((p.perf.get('gain', 0) + GAINS.get(p.name, 0)) / 20)
        dry += d * g
        send += s * g * p.perf.get('send', 1.0)
        act = np.abs(d).max(1) > 1e-4
        rms = float(np.sqrt(np.mean((d[act] * g) ** 2))) if act.any() else 0
        levels[p.name] = 20 * np.log10(rms + 1e-9)
        print('  %-16s active rms %6.1f dB  peak %.2f' % (p.name, levels[p.name], float(np.max(np.abs(d * g)))))
        del stem, d, s
    wet = render.reverb(send, room)
    mix = dry + wet * 0.55
    del dry, send, wet
    m = render.master(mix)
    del mix
    if not loop:
        out, l0, l1 = render.loudness(m)
        return out, dict(lufs=l1, levels=levels)
    k = 1
    body = m[intro_n + k * N: intro_n + (k + 1) * N].copy()
    head = m[:intro_n].copy()
    f = int(0.06 * SR)
    w = np.linspace(0, 1, f)[:, None]
    e = intro_n + k * N
    head[-f:] = head[-f:] * (1 - w) + m[e - f:e] * w
    out = np.concatenate([head, body])
    out, l0, l1 = render.loudness(out, target=-18.0)
    return out, dict(intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1, levels=levels)


# stem trims (dB), set from measured active RMS so the piano leads
GAINS.update({
    'Piano': 0, 'Piano harmony': -3, 'Piano LH': -5, 'Piano fill': -2, 'Piano bridge': -2,
    'Clarinet': -1, 'Clarinet stacc': 0, 'Bassoon stacc': 0, 'Violins I': 0,
    'Violins II': -6, 'Violas': -5, 'Cellos': -6, 'Violins pizz': -5, 'Violas pizz': -5,
    'Bass': -1, 'Bass GM': -4, 'Xylophone': -4, 'Glockenspiel': -8, 'Guitar': -3,
    'Shaker': -10, 'Rim': -9, 'Clock': -10, 'Triangle': -14,
})


def main():
    out = None
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    out = out or '/tmp/claude-0/-home-user/f478e46a-5ce7-5b9b-a76e-154bb8baec5c/scratchpad/ost2/home'
    work = os.environ.get('MUSIC_WORK', os.path.join(out, 'work'))
    os.makedirs(work, exist_ok=True)
    P, tempo = build_score()
    print(TITLE, 'parts', len(P))
    check(P)
    section_map(tempo)
    if '--check' in sys.argv:
        return
    swing(P)
    if '--excerpt' in sys.argv:
        i = sys.argv.index('--excerpt')
        b0, b1 = float(sys.argv[i + 1]), float(sys.argv[i + 2])
        x, info = mix_down(P, tempo, work, loop=False, ex=(b0, b1))
        wav = os.path.join(work, 'excerpt.wav')
        sf.write(wav, x, SR, subtype='FLOAT')
        render.to_mp3(wav, os.path.join(out, 'excerpt.mp3'))
        build.spectrogram(wav, os.path.join(out, 'excerpt_spec.png'), TITLE + ' excerpt')
        print('excerpt', info['lufs'])
        return
    x, info = mix_down(P, tempo, work)
    wav = os.path.join(work, ID + '.wav')
    sf.write(wav, x, SR, subtype='FLOAT')
    ogg = os.path.join(out, ID + '.ogg')
    render.to_ogg(wav, ogg, q=6)
    render.to_mp3(wav, os.path.join(out, ID + '.mp3'))
    build.spectrogram(wav, os.path.join(out, ID + '_spectrogram.png'), '%s (%s)' % (TITLE, ID))
    seam = build.seam_check(wav, info['intro_s'])
    pk = 20 * np.log10(np.max(np.abs(x)))
    print('total %.2f s intro %.3f loop %.3f  LUFS %.2f  peak %.2f dBFS  seam %s' % (
        info['total_s'], info['intro_s'], info['loop_s'], info['lufs'], pk, seam))
    json.dump(dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(info['intro_s'], 6),
                   loop_s=round(info['loop_s'], 6), total_s=round(info['total_s'], 3), lufs=round(info['lufs'], 2),
                   bpm=BPM, key='G major', seam=[round(v, 5) for v in seam]),
              open(os.path.join(out, 'info.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
