"""Pallet Town wild battle: "Seaside Showdown" (original composition).

E minor with a heroic turn to G major in the B section, 150 bpm, 4/4.
The battle music for a wild Pokémon in Pallet Town: a scrappy first battle
(Ash has no Pokémon of his own yet: he runs, hides, throws stones), brave and
a bit frantic, with a seaside flavour (steel drums, marimba, glockenspiel).
It starts as the battle intro's ink bands sweep in.

Form (bars; the intro plays once, the game loops bars 5-68):
  Intro  1-4    tutti brass/string hits, rising spiccato run, B7 swell, tom fill
  A1     5-12   the hook: flute + xylophone + square lead over a pumping band
                (gallop spiccato strings, steel-drum offbeat chops)
  A2    13-20   hook in trumpets, violins' spiccato 16th runs above, horn
                counterline, trombone stabs; tom fill into
  B1    21-28   G major, heroic: horns + violins sing the B tune, ride cymbal,
                walking bass, viola runs, trumpet stabs
  B2    29-36   B tune up in trumpets, violins and piccolo, horn countermelody,
                trombone pads, timpani roll into B7
  C1    37-44   breakdown ("hiding"): steel-drum tune, marimba arpeggios,
                toms, side stick and shaker, sneaky cello and pizzicato offbeats
  C2    45-52   build: tune again with glockenspiel, string tremolo rising,
                snare from quarters to a 16th roll, horns swell, glock run
  A3    53-60   hook in trombones + horns, both violin sections running 16ths,
                trumpet offbeat stabs, 16th hats
  A4    61-68   tutti hook (violins, xylophone, piccolo 8va, trumpets, lead),
                horn counterline, tom fill back to A1

Instruments: VSCO 2 CE (trumpets sus + staccato, trombones sus + staccato,
F horns sus + staccato, tuba staccato, string ensembles spiccato, sustain,
tremolo and pizzicato, flute, piccolo, xylophone, glockenspiel, marimba,
timpani hits and rolls) plus General MIDI from GeneralUser GS through
fluidsynth (standard drum kit, fingered electric bass, steel drums, square
lead), all in one hall (a shorter, punchier one than the town themes).

  python3 tools/music/songs/battle_pallet.py --out DIR [--excerpt BAR0 BAR1]
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import build  # noqa: E402
import render  # noqa: E402
import sfz  # noqa: E402
from pallet_town import octv  # noqa: E402
from score import Part, Tempo, midi as pmidi  # noqa: E402
from sfz import SR  # noqa: E402

ID = 'battle_pallet'
TITLE = 'Seaside Showdown'
BPM = 150
BPB = 4
BEAT_S = 60.0 / BPM                # 0.4 s
BEAT_N = int(round(BEAT_S * SR))   # 17640 samples, exact
GUGS = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'
WORK = None

# ---------- extra instruments (added at run time; shared files untouched) ----------
render.ORCH.update({
    'vln_spic': ('ViolinEnsSpic.sfz', -0.6, 0.25, None),
    'vla_spic': ('ViolaEnsSpic.sfz', -3.0, 0.25, None),
    'vc_spic': ('CelloEnsSpic.sfz', 2.7, 0.28, None),
    'cb_spic': ('ContrabassSpic.sfz', 5.0, 0.3, None),
    'vln_trem': ('ViolinEnsTrem.sfz', 0.0, 0.5, 0.08),
    'vla_trem': ('ViolaEnsTrem.sfz', -4.0, 0.5, 0.08),
    'tpt': ('TrumpetSus.sfz', -8.7, 0.3, 0.03),
    'tpt_stac': ('TrumpetStac.sfz', 7.9, None, None),
    'tbn': ('TromboneSus.sfz', 7.7, 0.3, 0.04),
    'tbn_stac': ('TromboneStac.sfz', 8.7, None, None),
    'hn_stac': ('FHornStac.sfz', -5.0, None, None),
    'tuba_stac': ('TubaStac.sfz', 5.4, None, None),
    'picc': ('PiccoloSus.sfz', -13.0, 0.25, 0.03),
    'xylo': ('Xylophone.sfz', -3.0, 1.0, None),
})
render.SUSTAINED |= {'tpt', 'tbn', 'vln_trem', 'vla_trem', 'picc'}
render.SEAT.update({
    'tpt': dict(pan=0.22, width=0.4, depth=0.6),
    'tbn': dict(pan=0.48, width=0.45, depth=0.65),
    'tuba': dict(pan=0.6, width=0.3, depth=0.7),
    'picc': dict(pan=-0.22, width=0.25, depth=0.5),
    'xylo': dict(pan=0.32, width=0.35, depth=0.6),
    'drums': dict(pan=0.0, width=0.9, depth=0.3),
    'bass': dict(pan=0.0, width=0.2, depth=0.2),
    'steel': dict(pan=0.42, width=0.45, depth=0.45),
    'lead': dict(pan=-0.3, width=0.35, depth=0.4),
})

# ---------- harmony ----------
NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def nm(k):
    return NOTE[k % 12] + str(k // 12 - 1)


# root = electric bass root key; v = close voicing (low..high) for stabs and pads
CH = {
    'Em':    dict(root=40, tones='E G B', v=['G3', 'B3', 'E4']),
    'C':     dict(root=36, tones='C E G', v=['G3', 'C4', 'E4']),
    'Cmaj7': dict(root=36, tones='C E G B', v=['G3', 'B3', 'E4']),
    'D':     dict(root=38, tones='D F# A', v=['F#3', 'A3', 'D4']),
    'B7':    dict(root=35, tones='B D# F# A', v=['F#3', 'A3', 'D#4']),
    'G':     dict(root=31, tones='G B D', v=['G3', 'B3', 'D4']),
    'Am':    dict(root=33, tones='A C E', v=['A3', 'C4', 'E4']),
    'Am7':   dict(root=33, tones='A C E G', v=['G3', 'C4', 'E4']),
}
for c in CH.values():
    c['pcs'] = [NOTE.index(t) for t in c['tones'].split()]
    c['vk'] = [pmidi(p) for p in c['v']]
DIA = [7, 9, 11, 0, 2, 4, 6]          # G major = E natural minor
HMIN = [4, 6, 7, 9, 11, 0, 3]         # E harmonic minor (over B7)


def scale_of(ch):
    return HMIN if ch == 'B7' else DIA


def step(k, n, ch):
    """Move n diatonic steps from key k in the scale of chord ch."""
    sc = scale_of(ch)
    d = 1 if n > 0 else -1
    for _ in range(abs(n)):
        k += d
        while k % 12 not in sc:
            k += d
    return k


INTRO_H = ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'B7', 'B7']
A_H = ['Em', 'Em', 'Em', 'Em', 'C', 'C', 'D', 'D', 'Em', 'Em', 'Em', 'Em', 'C', 'D', 'B7', 'B7']
A2_H = A_H[:12] + ['C', 'B7', 'Em', 'D']
B1_H = ['G', 'G', 'D', 'D', 'Em', 'Em', 'C', 'C', 'G', 'G', 'D', 'D', 'C', 'C', 'D', 'D']
B2_H = ['G', 'G', 'D', 'D', 'Em', 'Em', 'C', 'C', 'Am7', 'Am7', 'D', 'D', 'Cmaj7', 'Cmaj7', 'B7', 'B7']
C_H = ['Em', 'Em', 'Em', 'Em', 'C', 'C', 'C', 'C', 'Am', 'Am', 'Am', 'Am', 'B7', 'B7', 'B7', 'B7']
HARM = INTRO_H + A_H + A2_H + B1_H + B2_H + C_H + C_H + A_H + A_H

S = dict(INTRO=0, A1=16, A2=48, B1=80, B2=112, C1=144, C2=176, A3=208, A4=240, END=272)
LS, LE = S['A1'], S['END']


def chord_at(b):
    return HARM[min(int(b // 2), len(HARM) - 1)]


def bars(text):
    return [x.strip() for x in text.split('|') if x.strip()]


def join(bl):
    return ' | '.join(bl) + ' |'


# ---------- melodies ----------
MEL_A = bars("""B4:e E5:e F#5:e G5:q B5:q A5:e | G5:q. F#5:e E5:q B4:q |
C5:e E5:e G5:e C6:q. B5:e G5:e | A5:q. F#5:e D5:q E5:e F#5:e |
G5:q. B5:e E6:q D6:e B5:e | B5:e A5:e G5:e F#5:e E5:h |
C6:q B5:e G5:e A5:e F#5:e D5:e F#5:e | B5:q A5:e F#5:e D#5:e F#5:e B4:q |""")
MEL_A2 = MEL_A[:6] + bars("C6:q B5:e G5:e F#5:q D#5:e B4:e | E5:q. G5:e F#5:e A5:e D6:q |")

MEL_B = bars("""D5:q. B4:e G5:h | F#5:q. E5:e D5:h | E5:q. F#5:e G5:q B5:q | G5:h. E5:q |
D5:q. B4:e G5:q. A5:e | A5:q. G5:e F#5:h | E5:q. F#5:e G5:q E5:q | F#5:h. r:e D5:e |
G5:q. A5:e B5:h | A5:q. G5:e F#5:h | G5:q. A5:e B5:q E6:q | E6:q D6:e C6:e G5:h |
C6:q. B5:e A5:h | F#5:q. G5:e A5:h | B5:q. A5:e G5:q E5:q | F#5:q. D#5:e F#5:e A5:e B5:q |""")

MEL_C = bars("""B4:e E5:e r:e G5:e r:e B5:e G5:e E5:e | G5:e F#5:e r:e E5:q. r:q |
C5:e E5:e r:e G5:e r:e C6:e G5:e E5:e | E5:e D5:e r:e C5:q. r:q |
A4:e C5:e r:e E5:e r:e A5:e E5:e C5:e | C5:e B4:e r:e A4:q. r:q |
B4:e D#5:e r:e F#5:e r:e A5:e F#5:e D#5:e | F#5:e A5:e B5:q r:h |""")
MEL_C2 = MEL_C[:7] + bars("F#5:e A5:e B5:e D#6:e F#6:q r:q |")

HN_A = bars("G4:w | B4:h G4:h | G4:h E4:h | F#4:h A4:h | B4:w | B4:h G4:h | G4:h F#4:h | F#4:h D#4:h |")
HN_A2 = HN_A[:6] + bars("G4:h F#4:h | E4:h F#4:h |")
HN_B = bars("B3:h D4:h | D4:h A3:h | B3:h E4:h | E4:h G4:h | E4:h C4:h | D4:h F#4:h | E4:h B3:h | D#4:h F#4:h |")

# ---------- parts ----------
P = []
GM = {}       # part name -> dict(program, drums, gain, send, seat)


def part(name, patch, seat, **perf):
    p = Part(name, patch, '', 0, BPB, **{k: v for k, v in perf.items() if k != 'transpose'})
    p.transpose = perf.get('transpose', 0)
    p.seat = seat
    P.append(p)
    return p


def gm(name, program, seat, drums=False, **perf):
    p = part(name, 'gm', seat, **perf)
    GM[name] = dict(program=program, drums=drums)
    return p


def addn(p, b, d, keys, v=None):
    keys = [k + p.transpose for k in keys]
    e = [b, d, keys, [nm(k) for k in keys]]
    if v is not None:
        e.append(v)
    p.notes.append(e)


def dyn(p, b, name, ramp=False):
    from score import DYN
    p.dyn.append([b, DYN[name], ramp])


def mel(p, bl, start, level=None, shift=0):
    t = join(bl)
    if shift:
        t = octv(t, shift)
    if level:
        t = '@' + level + ' ' + t
    p.add(t, start)


# generators -------------------------------------------------------------

def runs(p, b0, nbars, lo, alt=True):
    """Spiccato 16th runs: up from the root and back (or down from the fifth
    and back), so every beat lands on a chord tone and the 16ths between are
    scale steps."""
    for i in range(nbars):
        bb = b0 + 4 * i
        c1, c2 = chord_at(bb), chord_at(bb + 2)
        down = alt and i % 2 == 1
        if c1 == c2:
            pat = [0, 1, 2, 3, 4, 5, 6, 8, 7, 6, 5, 4, 2, 1, 0, -1]
            segs = [(bb, c1, pat)]
        else:
            pat = [0, 1, 2, 3, 4, 3, 2, 1]
            segs = [(bb, c1, pat), (bb + 2, c2, pat)]
        for s, ch, pt in segs:
            pc = CH[ch]['pcs'][2 if down else 0]
            k = lo
            while k % 12 != pc:
                k += 1
            for j, st in enumerate(pt):
                addn(p, s + j * 0.25, 0.25, [step(k, -st if down else st, ch)])


def pump(p, b0, nbars, voice, shift=0, pos=(0, 1, 1.5, 2, 3, 3.5), dur=0.42):
    """Gallop chord pump (1, 2, 2&, 3, 4, 4&) on one voice of the voicing."""
    for i in range(nbars):
        bb = b0 + 4 * i
        for x in pos:
            ch = chord_at(bb + x)
            addn(p, bb + x, dur, [CH[ch]['vk'][voice] + 12 * shift])


def roots(p, b0, nbars, oct=0, every=0.5, dur=0.42, offbeat=False):
    for i in range(int(nbars * 4 / every)):
        b = b0 + i * every
        if offbeat and (b % 1) == 0:
            continue
        addn(p, b, dur, [CH[chord_at(b)]['root'] + 12 * oct])


def stabs(p, b0, nbars, pos, shift=0, dur=0.4, which=None, voices=(0, 1, 2)):
    for i in range(nbars):
        if which is not None and i not in which:
            continue
        bb = b0 + 4 * i
        for x in pos:
            ch = chord_at(bb + x)
            addn(p, bb + x, dur, [CH[ch]['vk'][v] + 12 * shift for v in voices])


def pads(p, b0, nbars, shift=0, voices=(0, 1, 2)):
    for i in range(nbars * 2):
        b = b0 + 2 * i
        ch = chord_at(b)
        addn(p, b, 2, [CH[ch]['vk'][v] + 12 * shift for v in voices])


def tbn_pads(p, b0, nbars):
    for i in range(nbars * 2):
        b = b0 + 2 * i
        ch = chord_at(b)
        r = CH[ch]['root']
        while r < 40:
            r += 12
        addn(p, b, 2, [r, r + 7])


def arp(p, b0, nbars, shift=1, pat=(0, 1, 2, 1)):
    for i in range(nbars * 2):
        b = b0 + 2 * i
        ch = chord_at(b)
        for j, v in enumerate(pat):
            addn(p, b + j * 0.5, 0.45, [CH[ch]['vk'][v] + 12 * shift])


def chops(p, b0, nbars, vel=0.5):
    """Steel-drum offbeat chords (calypso skank): upper two voices up an octave."""
    for i in range(nbars * 4):
        b = b0 + i + 0.5
        ch = chord_at(b)
        v = vel * (1.08 if i % 2 else 0.92)
        addn(p, b, 0.3, [k + 12 for k in CH[ch]['vk'][1:]], v)


def glock_run(p, b, ch, n=4, top=False, step16=0.25):
    """A quick glockenspiel run up the chord (sounding pitch, from octave 6)."""
    pcs = CH[ch]['pcs'][:3] if ch != 'B7' else CH[ch]['pcs']
    k = 88 if not top else 83    # start near E6 / B5
    while k % 12 not in pcs:
        k += 1
    out = []
    while len(out) < n:
        if k % 12 in pcs:
            out.append(k)
        k += 1
    for j, x in enumerate(out):
        addn(p, b + j * step16, 0.3, [x])


def bass_line(p, b0, nbars, style):
    """Fingered electric bass."""
    for i in range(nbars):
        bb = b0 + 4 * i
        nxt = CH[chord_at(bb + 4)]['root'] if bb + 4 < S['END'] else CH[chord_at(LS)]['root']
        for half in (0, 2):
            ch = chord_at(bb + half)
            r = CH[ch]['root']
            if style == 'pump':
                seq = [r, r, r + 12, r]
            elif style == 'melodic':
                seq = [r, r + 7, r + 12, r + 7]
            elif style == 'drive':
                seq = [r, r + 12, r, r + 12]
            if style in ('pump', 'melodic', 'drive'):
                for j, k in enumerate(seq):
                    b = bb + half + j * 0.5
                    if half == 2 and j == 3 and nxt != r:
                        # approach the next root from a scale step below
                        k = step(nxt, -1, ch)
                        while k < r - 7:
                            k += 12
                        while k > r + 7:
                            k -= 12
                    addn(p, b, 0.4, [k], 0.62 + (0.12 if j == 0 else 0) + (0.05 if half == 0 and j == 0 else 0))
        if style == 'synco':
            r = CH[chord_at(bb)]['root']
            r2 = CH[chord_at(bb + 2)]['root']
            for x, d, k, v in [(0, 1.3, r, .7), (1.5, .4, r, .55), (2.5, .4, r2, .6), (3, .4, r2 + 12, .55), (3.5, .4, r2 + 7, .55)]:
                addn(p, bb + x, d, [k], v)


# drums (GM numbers)
KICK, SIDE, SNARE, CHH, PHH, OHH, CRASH, RIDE, BELL, CRASH2 = 36, 37, 38, 42, 44, 46, 49, 51, 53, 57
TLO, TFL, TLM, THM, THI, TFL2, CABASA, TAMB = 45, 41, 47, 48, 50, 43, 69, 54


def hitd(d, b, k, v):
    addn(d, b, 0.2, [k], float(np.clip(v, 0.05, 1.0)))


def tom_fill(d, b, beats=2, v0=0.7, v1=0.95):
    seq = [THI, THI, THM, THM, TLM, TLM, TLO, TLO, TFL2, TFL2, TFL, TFL]
    n = int(beats * 4)
    seq = seq[-n:] if n <= len(seq) else seq
    for j, k in enumerate(seq):
        hitd(d, b + j * 0.25, k, v0 + (v1 - v0) * j / max(1, n - 1))
    hitd(d, b, KICK, 0.8)


def groove(d, b0, nbars, style, crash_at=(0,), fill=None, fill_beats=2, snare_fill=False):
    for i in range(nbars):
        bb = b0 + 4 * i
        last = i == nbars - 1
        cut = 4 - fill_beats if (last and fill) else 4
        if i in crash_at:
            hitd(d, bb, CRASH if i == 0 else CRASH2, 0.9)
        if style in ('A', 'A16'):
            kicks = [0, 1.5, 2] + ([3.5] if i % 2 else [2.75])
            for x in kicks:
                if x < cut:
                    hitd(d, bb + x, KICK, 0.88 if x in (0, 2) else 0.7)
            for x in (1, 3):
                if x < cut:
                    hitd(d, bb + x, SNARE, 0.85)
            if i % 2 == 1 and 3.75 < cut:
                hitd(d, bb + 3.75, SNARE, 0.32)
            if 2.25 < cut and i % 4 == 2:
                hitd(d, bb + 2.25, SNARE, 0.28)
            grid = 0.25 if style == 'A16' else 0.5
            for j in range(int(4 / grid)):
                x = j * grid
                if x >= cut or (x == 0 and i in crash_at):
                    continue
                if x == 3.5 and i % 4 == 3:
                    hitd(d, bb + x, OHH, 0.6)
                    continue
                if x == 3.75 and i % 4 == 3:
                    continue
                acc = 0.62 if x % 1 == 0 else (0.45 if x % 0.5 == 0 else 0.3)
                hitd(d, bb + x, CHH, acc)
        elif style == 'B':
            for x in (0, 2, 2.5):
                if x < cut:
                    hitd(d, bb + x, KICK, 0.85 if x != 2.5 else 0.65)
            if i % 2 and 3.5 < cut:
                hitd(d, bb + 3.5, KICK, 0.6)
            for x in (1, 3):
                if x < cut:
                    hitd(d, bb + x, SNARE, 0.85)
            for j in range(8):
                x = j * 0.5
                if x >= cut or (x == 0 and i in crash_at):
                    continue
                hitd(d, bb + x, BELL if x == 0 else RIDE, 0.55 if x % 1 == 0 else 0.4)
            for x in (1.5, 3.5):
                if x < cut:
                    hitd(d, bb + x, PHH, 0.35)
        elif style == 'C1':
            for x in (0, 2.5):
                hitd(d, bb + x, KICK, 0.75)
            if i % 2:
                hitd(d, bb + 3.25, KICK, 0.45)
            for x in (1, 3):
                if x < cut:
                    hitd(d, bb + x, SIDE, 0.6)
            for j in range(8):
                x = j * 0.5
                if x < cut:
                    hitd(d, bb + x, CHH, 0.32 if x % 1 else 0.4)
            for j in range(16):
                x = j * 0.25
                if x < cut:
                    hitd(d, bb + x, CABASA, 0.3 if j % 4 == 0 else 0.18)
            if 3.5 < cut:
                hitd(d, bb + 3.5, TLO, 0.5)
            if i % 2 == 1 and 3.75 < cut:
                hitd(d, bb + 3.75, TFL, 0.55)
            if i % 4 == 2:
                hitd(d, bb + 1.75, TLM, 0.4)
        elif style == 'C2':
            for x in (0, 1, 2, 3):
                if x < cut:
                    hitd(d, bb + x, KICK, 0.65 + 0.03 * i)
            if i < 4:
                grid, v = 1.0, 0.4 + 0.05 * i
            elif i < 6:
                grid, v = 0.5, 0.55 + 0.05 * (i - 4)
            else:
                grid, v = 0.25, 0.65 + 0.08 * (i - 6)
            for j in range(int(4 / grid)):
                x = j * grid
                if x < cut:
                    hitd(d, bb + x, SNARE, v + 0.1 * (x / 4))
            for j in range(8):
                x = j * 0.5
                if x < cut:
                    hitd(d, bb + x, CHH, 0.35 + 0.03 * i)
        if last and fill:
            if snare_fill:
                for j in range(int(fill_beats * 4)):
                    hitd(d, bb + cut + j * 0.25, SNARE, 0.6 + 0.3 * j / (fill_beats * 4))
                hitd(d, bb + cut, KICK, 0.8)
            else:
                tom_fill(d, bb + cut, fill_beats)


def build_parts():
    global P, GM
    P, GM = [], {}
    I, A1, A2, B1, B2, C1, C2, A3, A4 = (S[k] for k in ('INTRO', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'A3', 'A4'))

    tpt = part('Trumpets', 'tpt', 'tpt', legato=True, humanize=0.005, swell=0.03, layers=2)
    tpt_s = part('Trumpets stac', 'tpt_stac', 'tpt', humanize=0.004, layers=2)
    tbn = part('Trombones', 'tbn', 'tbn', legato=True, humanize=0.006, swell=0.03, layers=2)
    tbn_s = part('Trombones stac', 'tbn_stac', 'tbn', humanize=0.004, layers=2)
    hn = part('Horns', 'hn', 'hn', legato=True, humanize=0.007, swell=0.04, layers=2)
    hn_s = part('Horns stac', 'hn_stac', 'hn', humanize=0.005)
    tuba = part('Tuba', 'tuba_stac', 'tuba', humanize=0.004)
    vln1 = part('Violins I', 'vln', 'vln1', legato=True, humanize=0.006, swell=0.03, cents=2)
    vln1s = part('Violins I spic', 'vln_spic', 'vln1', humanize=0.004)
    vln2s = part('Violins II spic', 'vln_spic', 'vln2', humanize=0.004, cents=-3)
    vlas = part('Violas spic', 'vla_spic', 'vla', humanize=0.004)
    vcs = part('Cellos spic', 'vc_spic', 'vc', humanize=0.004)
    cbs = part('Basses spic', 'cb_spic', 'cb', humanize=0.004)
    vlnt = part('Violins trem', 'vln_trem', 'vln1', humanize=0.006, swell=0.0)
    vlat = part('Violas trem', 'vla_trem', 'vla', humanize=0.006)
    vlnp = part('Violins pizz', 'vln_pizz', 'vln2', humanize=0.006)
    fl = part('Flute', 'fl', 'fl', legato=True, humanize=0.005, swell=0.02)
    picc = part('Piccolo', 'picc', 'picc', legato=True, humanize=0.005, transpose=-12)
    xylo = part('Xylophone', 'xylo', 'xylo', humanize=0.004, gate=1.5, transpose=-12)
    glock = part('Glockenspiel', 'glock', 'glock', humanize=0.003, gate=2.0, transpose=-12)
    mar = part('Marimba', 'marimba', 'marimba', humanize=0.005, gate=1.3)
    timp = part('Timpani', 'timp', 'timp', humanize=0.003, gate=1.0)
    troll = part('Timpani roll', 'timp_roll', 'timp', humanize=0.0, gate=1.0)
    drums = gm('Drums', 0, 'drums', drums=True, gain=0.0, send=0.35)
    bass = gm('Bass', 33, 'bass', gain=0.0, send=0.15)
    steel = gm('Steel drums', 114, 'steel', gain=0.0, send=0.8)
    lead = gm('Square lead', 80, 'lead', gain=0.0, send=0.7)

    # ============ INTRO (bars 1-4) ============
    hits = [(0, 1.0, ['B3', 'E4', 'G4']), (1.5, 0.45, ['E4', 'G4', 'B4']), (3, 1.0, ['G4', 'B4', 'E5']),
            (4, 1.0, ['G4', 'C5', 'E5']), (5.5, 0.45, ['E4', 'G4', 'C5']), (6.5, 0.45, ['F#4', 'A4', 'D5']),
            (7, 0.9, ['A4', 'D5', 'F#5']), (8, 0.5, ['B4', 'E5', 'G5'])]
    for d in (tpt_s, tbn_s, hn_s, vln1s, vln2s, vlas, vcs, cbs, tuba, timp):
        dyn(d, 0, 'ff')
    dyn(tpt_s, 7, 'ff')
    for b, du, ps in hits:
        ks = [pmidi(x) for x in ps]
        ch = chord_at(b)
        r = CH[ch]['root']
        addn(tpt_s, b, du, ks)
        addn(hn_s, b, du, [k - 12 for k in ks])
        addn(tbn_s, b, du, [r + 12, r + 19] if r + 12 >= 40 else [r + 24, r + 19])
        addn(vln1s, b, du, [ks[-1] + 12])
        addn(vln2s, b, du, ks[1:])
        addn(vlas, b, du, [ks[0] - 12 if ks[0] - 12 >= 48 else ks[0]])
        addn(vcs, b, du, [r + 12])
        addn(cbs, b, du, [r])
        addn(tuba, b, du, [r])
        addn(timp, b, du, [r if r >= 36 else r + 12])
        addn(bass, b, du * 0.9, [r], 0.9)
        hitd(drums, b, KICK, 0.95)
        hitd(drums, b, SNARE, 0.75)
        if b in (0, 3, 4, 7, 8):
            hitd(drums, b, CRASH if b in (0, 4, 8) else CRASH2, 0.85)
    # bar 3: rising spiccato run, snare 8ths crescendo, bass pump
    for p_, lo in ((vln1s, 64), (vlas, 52), (vcs, 40)):
        for j in range(12):
            addn(p_, 9 + j * 0.25, 0.25, [step(lo, j, 'Em')])
    dyn(vln1s, 9, 'mf', True), dyn(vln1s, 12, 'ff')
    dyn(vlas, 9, 'mf', True), dyn(vlas, 12, 'f')
    dyn(vcs, 9, 'mf', True), dyn(vcs, 12, 'f')
    for j in range(6):
        hitd(drums, 9 + j * 0.5, SNARE, 0.45 + 0.07 * j)
        hitd(drums, 9 + j * 0.5, CHH, 0.4)
    for j in range(6):
        addn(bass, 9 + j * 0.5, 0.4, [40 if j % 2 == 0 else 52], 0.7)
    # bar 4: B7 swell, timpani roll, snare roll, tom fill, glock run
    dyn(tpt, 12, 'p', True), dyn(tpt, 15.5, 'ff')
    addn(tpt, 12, 3.8, [pmidi('F#4'), pmidi('A4'), pmidi('D#5')])
    dyn(hn, 12, 'p', True), dyn(hn, 15.5, 'ff')
    addn(hn, 12, 3.8, [pmidi('B3'), pmidi('D#4'), pmidi('F#4')])
    dyn(tbn, 12, 'p', True), dyn(tbn, 15.5, 'f')
    addn(tbn, 12, 3.8, [pmidi('B2'), pmidi('F#3')])
    dyn(troll, 12, 'p', True), dyn(troll, 15.8, 'ff')
    addn(troll, 12, 3.9, [pmidi('B2')])
    dyn(vlnt, 12, 'p', True), dyn(vlnt, 15.8, 'ff')
    addn(vlnt, 12, 3.9, [pmidi('D#5'), pmidi('A5')])
    for j in range(12):
        hitd(drums, 12 + j * 0.25, SNARE, 0.35 + 0.045 * j)
    tom_fill(drums, 15, 1, 0.75, 0.95)
    for j in range(8):
        addn(bass, 12 + j * 0.5, 0.4, [35 if j % 2 == 0 else 47], 0.62 + 0.04 * j)
    for j in range(16):
        addn(cbs, 12 + j * 0.25, 0.22, [35 + (12 if j % 4 == 2 else 0)])
    dyn(cbs, 12, 'mf', True), dyn(cbs, 16, 'ff')
    dyn(glock, 0, 'mf')
    glock_run(glock, 15, 'B7', 4, top=True)

    # ============ A1 (bars 5-12): hook in flute + xylophone + square lead ============
    mel(fl, MEL_A, A1, 'mf')
    mel(xylo, MEL_A, A1, 'mf')
    mel(lead, MEL_A, A1, 'mp')
    for p_ in (vln2s, vlas):
        dyn(p_, A1, 'mp')
    pump(vln2s, A1, 8, 2)
    pump(vlas, A1, 8, 1)
    dyn(vcs, A1, 'mp')
    roots(vcs, A1, 8, oct=1, every=1, dur=0.4)
    dyn(tbn_s, A1, 'mf')
    stabs(tbn_s, A1, 8, (0, 1.5), which=(2, 3, 6, 7))
    dyn(hn_s, A1, 'mp')
    stabs(hn_s, A1, 8, (0, 1.5), which=(2, 3, 6, 7))
    dyn(timp, A1, 'f')
    for i in (0, 2, 4, 6):
        addn(timp, A1 + 4 * i, 1, [CH[chord_at(A1 + 4 * i)]['root'] + (0 if CH[chord_at(A1 + 4 * i)]['root'] >= 36 else 12)])
    chops(steel, A1, 8, 0.48)
    glock_run(glock, A1, 'Em', 4)
    groove(drums, A1, 8, 'A', crash_at=(0,), fill=True, fill_beats=1, snare_fill=True)
    bass_line(bass, A1, 8, 'pump')

    # ============ A2 (bars 13-20): hook in trumpets, violin runs, horn counterline ============
    mel(tpt, MEL_A2, A2, 'f', shift=-1)
    dyn(vln1s, A2, 'mf')
    runs(vln1s, A2, 8, 71)
    mel(hn, HN_A2, A2, 'mf', shift=-1)
    pump(vln2s, A2, 8, 2)
    pump(vlas, A2, 8, 1)
    dyn(vln2s, A2, 'mf'), dyn(vlas, A2, 'mf')
    roots(vcs, A2, 8, oct=1, every=0.5, dur=0.4)
    dyn(vcs, A2, 'mf')
    stabs(tbn_s, A2, 8, (0, 1.5))
    dyn(tbn_s, A2, 'f')
    dyn(tuba, A2, 'mf')
    roots(tuba, A2, 8, oct=0, every=4, dur=0.6)
    for j, k in enumerate(['A4', 'D5', 'F#5', 'A5', 'D6', 'A5', 'F#5', 'A5']):
        addn(steel, A2 + 30 + j * 0.25, 0.25, [pmidi(k)], 0.55 + 0.03 * j)
    chops(steel, A2, 7, 0.4)
    for i in (0, 4):
        addn(timp, A2 + 4 * i, 1, [40])
    groove(drums, A2, 8, 'A', crash_at=(0, 4), fill=True, fill_beats=2)
    bass_line(bass, A2, 8, 'pump')

    # ============ B1 (bars 21-28): G major, horns + violins sing ============
    mel(hn, MEL_B[:8], B1, 'f', shift=-1)
    mel(vln1, MEL_B[:8], B1, 'mf')
    dyn(tpt_s, B1, 'mf')
    stabs(tpt_s, B1, 8, (2.5, 3.5), shift=1, which=(0, 2, 4, 6))
    dyn(vlas, B1, 'mf')
    runs(vlas, B1, 8, 55)
    dyn(vcs, B1, 'mf')
    roots(vcs, B1, 8, oct=1, every=0.5, dur=0.4)
    dyn(cbs, B1, 'mf')
    roots(cbs, B1, 8, oct=0, every=1, dur=0.4)
    chops(steel, B1, 8, 0.5)
    glock_run(glock, B1, 'G', 4)
    dyn(timp, B1, 'f')
    addn(timp, B1, 1, [43]), addn(timp, B1 + 16, 1, [43])
    groove(drums, B1, 8, 'B', crash_at=(0,), fill=True, fill_beats=1, snare_fill=True)
    bass_line(bass, B1, 8, 'melodic')

    # ============ B2 (bars 29-36): B tune up high, horn countermelody ============
    mel(tpt, MEL_B[8:], B2, 'f', shift=-1)
    dyn(tpt, B2 + 24, 'f', True), dyn(tpt, B2 + 31, 'ff')
    mel(vln1, MEL_B[8:], B2, 'f')
    mel(picc, MEL_B[8:], B2, 'mp')
    mel(hn, HN_B, B2, 'mf')
    dyn(tbn, B2, 'mf')
    tbn_pads(tbn, B2, 8)
    dyn(vln2s, B2, 'mf')
    runs(vln2s, B2, 8, 59)
    pump(vlas, B2, 8, 1)
    dyn(vlas, B2, 'mf')
    roots(vcs, B2, 8, oct=1, every=0.5, dur=0.4)
    roots(cbs, B2, 8, oct=0, every=1, dur=0.4)
    dyn(cbs, B2, 'f')
    chops(steel, B2, 8, 0.5)
    for i in (0, 1, 2, 3, 4, 5):
        addn(timp, B2 + 4 * i, 0.9, [CH[chord_at(B2 + 4 * i)]['root'] + (12 if CH[chord_at(B2 + 4 * i)]['root'] < 36 else 0)])
    dyn(troll, B2 + 24, 'p', True), dyn(troll, B2 + 31.8, 'ff')
    addn(troll, B2 + 24, 7.9, [pmidi('B2')])
    groove(drums, B2, 8, 'B', crash_at=(0, 4), fill=True, fill_beats=2)
    bass_line(bass, B2, 8, 'melodic')

    # ============ C1 (bars 37-44): breakdown, steel drums ============
    mel(steel, MEL_C, C1, 'mf')
    dyn(mar, C1, 'mp')
    arp(mar, C1, 8, 1)
    dyn(vcs, C1, 'mp')
    roots(vcs, C1, 8, oct=1, every=0.5, dur=0.3, offbeat=True)
    dyn(vlnp, C1, 'mp')
    stabs(vlnp, C1, 8, (1.5, 3.5), shift=1, voices=(1, 2), dur=0.3)
    groove(drums, C1, 8, 'C1', crash_at=())
    bass_line(bass, C1, 8, 'synco')
    dyn(timp, C1, 'mp')
    addn(timp, C1, 1, [40])

    # ============ C2 (bars 45-52): build ============
    mel(steel, MEL_C2, C2, 'mf')
    mel(glock, MEL_C[:4], C2, 'mp', shift=1)
    dyn(vlnt, C2, 'pp', True), dyn(vlnt, C2 + 31, 'f')
    vlnt.add('B4:w~ | B4:w | C5:w~ | C5:w | E5:w~ | E5:w | F#5:w | A5:h. r:q |', C2)
    dyn(vlat, C2, 'pp', True), dyn(vlat, C2 + 31, 'mf')
    vlat.add('G4:w~ | G4:w | G4:w~ | G4:w | C5:w~ | C5:w | D#5:w | D#5:h. r:q |', C2)
    roots(vcs, C2, 4, oct=1, every=0.5, dur=0.3, offbeat=True)
    roots(vcs, C2 + 16, 3, oct=1, every=0.5, dur=0.4)
    dyn(vcs, C2 + 16, 'mp', True), dyn(vcs, C2 + 28, 'f')
    arp(mar, C2, 4, 1)
    dyn(hn, C2 + 16, 'p', True), dyn(hn, C2 + 31, 'f')
    pads(hn, C2 + 16, 4, shift=0)
    bass_line(bass, C2, 4, 'synco')
    bass_line(bass, C2 + 16, 4, 'pump')
    groove(drums, C2, 8, 'C2', crash_at=(0,), fill=True, fill_beats=2)
    dyn(troll, C2 + 24, 'pp', True), dyn(troll, C2 + 31.8, 'ff')
    addn(troll, C2 + 24, 7.9, [pmidi('B2')])
    # bar 52: glock quick run, string run up the harmonic minor, brass swell
    for j, k in enumerate([83, 87, 90, 93, 95, 99, 102, 105]):
        addn(glock, C2 + 30 + j * 0.25, 0.3, [k])
    dyn(glock, C2 + 30, 'mf')
    for p_, lo in ((vln1s, 71), (vlas, 59), (vcs, 47)):
        for j in range(8):
            addn(p_, C2 + 30 + j * 0.25, 0.25, [step(lo, j, 'B7')])
    dyn(vln1s, C2 + 30, 'mf', True), dyn(vln1s, C2 + 32, 'ff')
    dyn(vlas, C2 + 30, 'mf', True), dyn(vlas, C2 + 32, 'f')
    dyn(vcs, C2 + 29.9, 'f')
    dyn(tpt, C2 + 28, 'p', True), dyn(tpt, C2 + 31.6, 'ff')
    addn(tpt, C2 + 28, 3.8, [pmidi('F#4'), pmidi('A4'), pmidi('D#5')])

    # ============ A3 (bars 53-60): hook in low brass, violins running ============
    mel(tbn, MEL_A, A3, 'f', shift=-2)
    mel(hn, MEL_A, A3, 'f', shift=-1)
    dyn(vln1s, A3, 'f'), dyn(vln2s, A3, 'mf')
    runs(vln1s, A3, 8, 71)
    runs(vln2s, A3, 8, 59)
    dyn(tpt_s, A3, 'mf')
    stabs(tpt_s, A3, 8, (1.5, 3.5), shift=1)
    pump(vlas, A3, 8, 1)
    dyn(vlas, A3, 'mf')
    roots(vcs, A3, 8, oct=1, every=0.5, dur=0.4)
    dyn(vcs, A3, 'f')
    roots(cbs, A3, 8, oct=0, every=1, dur=0.4)
    dyn(cbs, A3, 'f')
    chops(steel, A3, 8, 0.45)
    glock_run(glock, A3, 'Em', 4)
    dyn(timp, A3, 'f')
    for i in (0, 2, 4, 6):
        r = CH[chord_at(A3 + 4 * i)]['root']
        addn(timp, A3 + 4 * i, 1, [r + (12 if r < 36 else 0)])
    groove(drums, A3, 8, 'A16', crash_at=(0, 4), fill=True, fill_beats=1, snare_fill=True)
    bass_line(bass, A3, 8, 'drive')

    # ============ A4 (bars 61-68): tutti hook ============
    mel(vln1, MEL_A, A4, 'f')
    mel(xylo, MEL_A, A4, 'f')
    mel(picc, MEL_A, A4, 'mp', shift=1)
    mel(lead, MEL_A, A4, 'mp')
    mel(tpt, MEL_A, A4, 'f', shift=-1)
    mel(hn, HN_A, A4, 'f', shift=-1)
    stabs(tbn_s, A4, 8, (0, 1.5))
    dyn(tbn_s, A4, 'f')
    roots(tuba, A4, 8, oct=0, every=2, dur=0.6)
    dyn(tuba, A4, 'f')
    pump(vln2s, A4, 8, 2)
    dyn(vln2s, A4, 'mf')
    pump(vlas, A4, 8, 1)
    roots(vcs, A4, 8, oct=1, every=0.5, dur=0.4)
    roots(cbs, A4, 8, oct=0, every=1, dur=0.4)
    chops(steel, A4, 8, 0.4)
    glock_run(glock, A4, 'Em', 4)
    for i in (0, 4):
        addn(timp, A4 + 4 * i, 1, [40])
    dyn(troll, A4 + 28, 'p', True), dyn(troll, A4 + 31.8, 'f')
    addn(troll, A4 + 28, 3.9, [pmidi('B2')])
    groove(drums, A4, 8, 'A16', crash_at=(0,), fill=True, fill_beats=2)
    bass_line(bass, A4, 8, 'pump')

    for p_ in P:
        p_.notes.sort(key=lambda e: (e[0], e[2]))
    return P


# ---------- checks ----------

def check_harmony(parts):
    """Every pitched note in the scale of the moment; notes on beats 1 and 3
    and notes a beat or longer must be chord tones."""
    bad = []
    for p in parts:
        if p.name == 'Drums':
            continue
        for e in p.notes:
            b, d, keys = e[0], e[1], e[2]
            for k in keys:
                ch = chord_at(b + 1e-6)
                pc = k % 12
                if pc not in scale_of(ch):
                    bad.append((p.name, b, nm(k - p.transpose), ch, 'out of scale'))
                strong = abs((b % 2)) < 1e-6
                if (strong or d >= 1 - 1e-6) and pc not in CH[ch]['pcs']:
                    bad.append((p.name, b, nm(k - p.transpose), ch, 'non-chord on strong beat / long'))
                # a long note must also fit the chords it is held over
                t = (int(b // 2) + 1) * 2
                while t < b + d - 0.25:
                    c2 = chord_at(t)
                    if pc not in CH[c2]['pcs'] and not (d < 1.5):
                        bad.append((p.name, b, nm(k - p.transpose), c2, 'held into %s' % c2))
                    t += 2
    return bad


def section_map():
    names = [('Intro', 'INTRO', 'A1'), ('A1 hook (flute/xylo/lead)', 'A1', 'A2'), ('A2 hook in trumpets', 'A2', 'B1'),
             ('B1 G major heroic (horns+violins)', 'B1', 'B2'), ('B2 trumpets/violins/piccolo', 'B2', 'C1'),
             ('C1 breakdown (steel drums)', 'C1', 'C2'), ('C2 build', 'C2', 'A3'), ('A3 hook in low brass', 'A3', 'A4'),
             ('A4 tutti hook', 'A4', 'END')]
    out = []
    for n, a, b in names:
        out.append('%-36s bars %2d-%2d  %6.1f-%6.1f s' % (n, S[a] // 4 + 1, S[b] // 4, S[a] * BEAT_S, S[b] * BEAT_S))
    return '\n'.join(out)


# ---------- General MIDI rendering ----------

def gm_render(p, b0, b1, origin, tag):
    import mido
    info = GM[p.name]
    ch = 9 if info['drums'] else 0
    notes = [e for e in p.notes if b0 - 1e-6 <= e[0] < b1 - 1e-6]
    if not notes:
        return np.zeros((SR, 2), np.float32)
    PRE = 0.1
    evs = []
    for e in notes:
        b, d, keys = e[0], e[1], e[2]
        r2 = np.random.default_rng(int(round(b * 1000)) * 131 + keys[0])
        hum = 0.0025 if info['drums'] else 0.004
        t = (b - origin) * BEAT_S + PRE + r2.normal(0, hum)
        lv = e[4] if len(e) > 4 else p.level(b)
        if len(e) <= 4:
            vel = 22 + 100 * lv
        else:
            vel = 127 * lv
        vel = int(np.clip(vel + r2.normal(0, 3), 1, 127))
        gate = 1.0 if info['drums'] else p.perf.get('gate', 0.9)
        dur = max(d * BEAT_S * gate, 0.05)
        for k in keys:
            evs.append((max(t, 0), 1, k, vel))
            evs.append((max(t, 0) + dur, 0, k, 0))
    end = max(x[0] for x in evs) + 3.0
    evs.sort(key=lambda x: (x[0], x[1]))
    mid = mido.MidiFile(ticks_per_beat=960)
    tr = mido.MidiTrack()
    mid.tracks.append(tr)
    tr.append(mido.MetaMessage('set_tempo', tempo=int(BEAT_S * 1e6), time=0))
    if not info['drums']:
        tr.append(mido.Message('program_change', program=info['program'], channel=ch, time=0))
    for cc, val in ((7, 110), (10, 64), (11, 127), (91, 0), (93, 0)):
        tr.append(mido.Message('control_change', control=cc, value=val, channel=ch, time=0))
    last = 0
    for t, on, k, v in evs:
        tk = int(round(t / BEAT_S * 960))
        tr.append(mido.Message('note_on' if on else 'note_off', note=int(k), velocity=v, channel=ch, time=tk - last))
        last = tk
    tk = int(round(end / BEAT_S * 960))
    tr.append(mido.Message('control_change', control=7, value=110, channel=ch, time=tk - last))
    safe = p.name.replace(' ', '_')
    mf = os.path.join(WORK, '%s_%s.mid' % (safe, tag))
    wf = os.path.join(WORK, '%s_%s.wav' % (safe, tag))
    mid.save(mf)
    subprocess.run(['fluidsynth', '-ni', '-g', '0.5', '-r', str(SR), '-R', '0', '-C', '0', '-O', 'float', '-T', 'wav',
                    '-F', wf, GUGS, mf], check=True, capture_output=True)
    x, sr = sf.read(wf, dtype='float32', always_2d=True)
    assert sr == SR
    n0 = int(round(PRE * SR))
    return x[n0:]


def stem_of(p, b0, b1, origin, tag):
    if p.patch == 'gm':
        return gm_render(p, b0, b1, origin, tag)
    return render.render_part(p, TEMPO, b0, b1, origin)


TEMPO = Tempo([[0, BPM]])


def mix_parts(parts, layout, total, ranges=()):
    """layout: list of (b0, b1, origin, [sample offsets]); returns dry, send and
    each stem's RMS (dB) over the given sample ranges."""
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    stats = {}
    for p in parts:
        seat = render.SEAT[p.seat]
        seat = dict(seat, **{k: p.perf[k] for k in ('pan', 'width', 'depth') if k in p.perf})
        stem = np.zeros((total, 2), np.float32)
        for b0, b1, origin, offs in layout:
            a = stem_of(p, b0, b1, origin, '%g' % b0)
            for i in offs:
                seg = a[:max(0, total - i)]
                stem[i:i + len(seg)] += seg
        d, s = render.place(stem, seat)
        g = 10 ** (p.perf.get('gain', 0) / 20)
        dry += d * g
        send += s * g * p.perf.get('send', 1.0)
        stats[p.name] = [20 * np.log10(np.sqrt(np.mean((d[a:b] * g) ** 2)) + 1e-9) for a, b in ranges]
        print('  part %-18s peak %.2f' % (p.name, float(np.max(np.abs(d * g)))), flush=True)
    return dry, send, stats


GAINS = {
    # mix balance (dB), set by measuring stem RMS per section
}


def apply_gains(parts):
    for p in parts:
        if p.name in GAINS:
            p.perf['gain'] = p.perf.get('gain', 0) + GAINS[p.name]


def finish(dry, send):
    ir = render.hall_ir(seconds=2.4, rt_low=1.7, rt_mid=1.35, rt_high=0.8, seed=11)
    wet = render.reverb(send, ir)
    return render.master(dry + wet * 0.55)


def stem_report(stats, ranges=None):
    return list(stats.items())


def main():
    global WORK
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--excerpt', nargs=2, type=int)
    a = ap.parse_args()
    out = a.out
    os.makedirs(out, exist_ok=True)
    WORK = os.environ.get('MUSIC_WORK', os.path.join(out, 'work'))
    os.makedirs(WORK, exist_ok=True)
    parts = build_parts()
    apply_gains(parts)
    bad = check_harmony(parts)
    print(section_map())
    print('harmony check: %d issues' % len(bad))
    for x in bad[:60]:
        print('   %-18s bar %3d beat %.2f %-4s over %-6s %s' % (x[0], int(x[1] // 4) + 1, x[1] % 4 + 1, x[2], x[3], x[4]))

    secs = [('INTRO', 'A1'), ('A1', 'A2'), ('A2', 'B1'), ('B1', 'B2'), ('B2', 'C1'), ('C1', 'C2'), ('C2', 'A3'), ('A3', 'A4'), ('A4', 'END')]
    if a.excerpt:
        b0, b1 = a.excerpt[0] * 4, a.excerpt[1] * 4
        total = int((b1 - b0) * BEAT_N + 3 * SR)
        rng = []
        for x0, x1 in secs:
            s0, s1 = max(S[x0], b0), min(S[x1], b1)
            if s1 > s0:
                rng.append(((x0), int((s0 - b0) * BEAT_N), int((s1 - b0) * BEAT_N)))
        dry, send, stats = mix_parts(parts, [(b0, b1, b0, [0])], total, [(p, q) for _, p, q in rng])
        m = finish(dry, send)[:int((b1 - b0) * BEAT_N + 1.5 * SR)]
        m, l0, l1 = render.loudness(m, target=-16)
        wav = os.path.join(out, 'excerpt.wav')
        sf.write(wav, m, SR, subtype='FLOAT')
        render.to_mp3(wav, os.path.join(out, 'excerpt.mp3'))
        build.spectrogram(wav, os.path.join(out, 'excerpt_spectrogram.png'), TITLE + ' excerpt')
        rows = stem_report(stats)
        print('stem RMS dB per section:', [r[0] for r in rng])
        for n_, r in rows:
            print('  %-18s ' % n_ + ' '.join('%6.1f' % v for v in r))
        print('excerpt %.1f LUFS (pre %.1f), peak %.2f dBFS' % (l1, l0, 20 * np.log10(np.abs(m).max())))
        return

    intro_n = LS * BEAT_N
    N = (LE - LS) * BEAT_N
    reps = 3
    total = intro_n + reps * N + 5 * SR
    layout = [(0, LS, 0, [0]), (LS, LE, LS, [intro_n + k * N for k in range(reps)])]
    ranges = [(int(S[x0] * BEAT_N) + (2 * N if S[x0] >= LS else 0), int(S[x1] * BEAT_N) + (2 * N if S[x0] >= LS else 0)) for x0, x1 in secs]
    dry, send, stats = mix_parts(parts, layout, total, ranges)
    rows = stem_report(stats)
    print('stem RMS dB per section:', [x[0] for x in secs])
    for n_, r in rows:
        print('  %-18s ' % n_ + ' '.join('%6.1f' % v for v in r))
    del stats
    m = finish(dry, send)
    del dry, send
    k = 2
    body = m[intro_n + k * N: intro_n + (k + 1) * N].copy()
    head = m[:intro_n].copy()
    f = int(0.06 * SR)
    w = np.linspace(0, 1, f)[:, None]
    e = intro_n + k * N
    head[-f:] = head[-f:] * (1 - w) + m[e - f:e] * w
    full = np.concatenate([head, body])
    full, l0, l1 = render.loudness(full, target=-16)
    wav = os.path.join(WORK, ID + '.wav')
    sf.write(wav, full, SR, subtype='FLOAT')
    ogg = os.path.join(out, ID + '.ogg')
    render.to_ogg(wav, ogg, q=6)
    render.to_mp3(wav, os.path.join(out, ID + '.mp3'))
    build.spectrogram(wav, os.path.join(out, ID + '_spectrogram.png'), '%s (%s)' % (TITLE, ID))
    jump, p999, mx = build.seam_check(wav, intro_n / SR)
    pk = 20 * np.log10(np.abs(full).max())
    info = dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(intro_n / SR, 6), loop_s=round(N / SR, 6),
                total_s=round(len(full) / SR, 3), lufs=round(float(l1), 2), bpm=BPM, key='E minor (B section G major)',
                seam=[round(jump, 5), round(p999, 5), round(mx, 5)])
    json.dump(info, open(os.path.join(out, 'info.json'), 'w'), indent=1)
    # the seam as heard in the game: the last 4 s then the loop start
    o = intro_n
    seam = np.concatenate([full[-4 * SR:], full[o:o + 4 * SR]])
    sf.write(os.path.join(WORK, 'seam.wav'), seam, SR, subtype='FLOAT')
    render.to_mp3(os.path.join(WORK, 'seam.wav'), os.path.join(WORK, 'loop_seam.mp3'))
    print('%s: %.1f s (intro %.2f s, loop %.2f s), %.2f LUFS, peak %.2f dBFS, seam jump %.4f (99.9%% step %.4f, max %.4f)' % (
        ID, info['total_s'], info['intro_s'], info['loop_s'], l1, pk, jump, p999, mx))


if __name__ == '__main__':
    main()
