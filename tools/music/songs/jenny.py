"""Officer Jenny at the Viridian gate: "On Official Duty" (original composition).

C minor, 100 bpm, 4/4. Firm and a little tense: a police officer on duty
telling Ash the road is closed. Crisp snare march, low brass and horns carry
the main motif over driving staccato strings and low piano octaves; a muted
trumpet calls like a whistle or a radio; timpani punctuate. The middle section
turns to E-flat major and lets her warmth show (cello, then horn). Not a
villain theme: the minor is serious, never menacing.

Form (bars, 1 bar = 2.4 s):
  Intro 0      (one bar: snare call to attention, strings on C; plays once)
  A    1-8     trombones (8ves) sing the motif, horns pad, strings drive,
               tuba and piano octaves march, muted trumpet answers in bar 8
  A'   9-16    horns take the motif up an octave, trombones under it, a new
               turn to B-flat 7 (half cadence) with a trumpet call
  B    17-24   E-flat major, softer: cellos sing, horn holds a counterline,
               rim clicks instead of snare, piano warm and low
  B'   25-32   the horn sings the B tune, cellos answer, snare creeps back,
               turning to G (dominant of C minor)
  C    33-40   "radio" section: muted trumpet signals answered by trombones
               and horns over a C pedal, tremolo violins; then a build with
               timpani roll, snare roll and a suspended cymbal swell
  A''  41-48   tutti: trombones, horns and violins on the motif, the trumpet
               signal in the last bar turns back to bar 1
The game loops bars 1-48 (about 1:55); the intro bar plays once.

Instrumentation: VSCO 2 CE: trombones, tuba, F horns, trumpet (straight
mute), strings spiccato / legato / tremolo / pizzicato, upright piano,
timpani, VSCO snare / cymbals / bass drum; rim click from GeneralUser GS
(side stick, rendered with fluidsynth into a small SFZ).

Where it plays: talking to Officer Jenny at her post at the gate to Viridian
City while the road is closed.

  python3 tools/music/songs/jenny.py --out DIR [--check] [--excerpt BAR0 BAR1]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MUSIC = os.path.dirname(HERE)
sys.path.insert(0, MUSIC)

import numpy as np  # noqa: E402

import render  # noqa: E402
from score import Part, Tempo, midi  # noqa: E402
from pallet_town import name, key, octv  # noqa: E402

ID = 'jenny'
TITLE = 'On Official Duty'
BPB = 4
BPM = 100
GUGS = '/tmp/claude-0/samples/gugs/GeneralUser-GS.sf2'

# ---------------------------------------------------------------- instruments

NEW_ORCH = {
    'tbn': ('TromboneSus.sfz', 8.0, 0.45, 0.06),
    'tbn_stac': ('TromboneStac.sfz', -5.0, None, None),
    'tuba': ('TubaSus.sfz', 5.0, 0.5, 0.07),
    'tuba_stac': ('TubaStac.sfz', 6.5, None, None),
    'hn_stac': ('FHornStac.sfz', -13.0, None, None),
    'tpt_mute': ('TrumpetStraightMuteSus.sfz', 0.0, 0.3, 0.025),
    'vln_spic': ('ViolinEnsSpic.sfz', 0.0, None, None),
    'vla_spic': ('ViolaEnsSpic.sfz', -2.0, None, None),
    'vc_spic': ('CelloEnsSpic.sfz', -2.0, None, None),
    'cb_spic': ('ContrabassSpic.sfz', -5.0, None, None),
    'vln_trem': ('ViolinEnsTrem.sfz', 2.0, 0.5, 0.1),
    'vla_trem': ('ViolaEnsTrem.sfz', -4.0, 0.5, 0.1),
    'piano': ('UprightPiano.sfz', -12.0, 0.5, None),
    'perc': ('GM-StylePerc.sfz', -9.0, None, None),
    'rim': (None, 0.0, None, None),          # file filled in by setup()
}
NEW_SEAT = {
    'tbn': dict(pan=0.3, width=0.45, depth=0.8),
    'tbn2': dict(pan=0.42, width=0.45, depth=0.82),
    'tuba': dict(pan=0.55, width=0.35, depth=0.85),
    'tpt': dict(pan=0.08, width=0.3, depth=0.78),
    'hn2': dict(pan=-0.45, width=0.5, depth=0.78),
    'piano': dict(pan=-0.4, width=0.5, depth=0.45),
    'snare': dict(pan=-0.15, width=0.4, depth=0.85),
    'perc': dict(pan=0.1, width=0.7, depth=0.92),
    'rim': dict(pan=0.2, width=0.3, depth=0.8),
}


def setup(work):
    """Register this song's instruments (at run time, the shared files stay
    as they are) and make the rim-click SFZ from the GM soundfont."""
    work = os.path.abspath(work)
    os.makedirs(work, exist_ok=True)
    sfzp = os.path.join(work, 'rim.sfz')
    if not os.path.exists(sfzp):
        import pretty_midi
        import subprocess
        import soundfile as sf
        pm = pretty_midi.PrettyMIDI()
        d = pretty_midi.Instrument(0, is_drum=True)
        vels = [45, 80, 115]
        for i, v in enumerate(vels):
            d.notes.append(pretty_midi.Note(v, 37, 1.0 * i + 0.2, 1.0 * i + 0.4))
        pm.instruments.append(d)
        mid = os.path.join(work, 'rim.mid')
        wav = os.path.join(work, 'rim_all.wav')
        pm.write(mid)
        subprocess.run(['fluidsynth', '-ni', '-g', '0.6', '-r', '44100', '-R', '0', '-C', '0', '-F', wav, GUGS, mid],
                       check=True, capture_output=True)
        x, sr = sf.read(wav, dtype='float32', always_2d=True)
        regs = []
        for i, (lo, hi) in enumerate([(0, 62), (63, 97), (98, 127)]):
            seg = x[int((i + 0.19) * sr): int((i + 0.9) * sr)].copy()
            f = int(0.05 * sr)
            seg[-f:] *= np.linspace(1, 0, f)[:, None]
            p = os.path.join(work, 'rim_v%d.wav' % (i + 1))
            sf.write(p, seg, sr)
            regs.append('<region> sample=%s\nlokey=0 hikey=127 pitch_keycenter=60 lovel=%d hivel=%d\n' % (p, lo, hi))
        open(sfzp, 'w').write('<global> ampeg_release=0.2\n' + ''.join(regs))
    orch = dict(NEW_ORCH)
    orch['rim'] = (sfzp, 21.0, None, None)    # absolute path: os.path.join keeps it
    render.ORCH.update(orch)
    render.SEAT.update(NEW_SEAT)
    render.SUSTAINED.update({'tbn', 'tuba', 'tpt_mute', 'vln_trem', 'vla_trem'})
    for k in LEVEL:
        level_zones(k)


# patches whose key zones are levelled (the library's zones jump by up to
# 9 dB between neighbouring samples, e.g. horn F#4 -> G4)
LEVEL = ['hn', 'hn_stac', 'tbn', 'tbn_stac', 'tuba', 'tuba_stac', 'tpt_mute', 'vln', 'vla', 'vc',
         'vln_spic', 'vla_spic', 'vc_spic', 'cb_spic', 'vln_trem', 'cb_pizz']


def level_zones(k):
    """Give every key zone of a patch the same body loudness within each
    velocity layer (median of the layer), so a melody does not jump in level
    when it crosses into another sample. Runtime only (this process)."""
    ins = render.inst(k)
    short = k.endswith(('stac', 'spic', 'pizz'))
    lv = []
    for r in ins.regions:
        a = ins._load(r['sample'])
        on, body = ins.marks[r['sample']]
        st = 0 if short else body - on
        seg = a[st: st + int((0.3 if short else 1.0) * render.SR)].mean(1)
        lv.append(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9) + r['vol'])
    bands = {}
    for r, l in zip(ins.regions, lv):
        bands.setdefault((r['lovel'], r['hivel']), []).append(l)
    med = {b: float(np.median(v)) for b, v in bands.items()}
    # a zone recorded with one layer only (0-127) sits at the level the
    # layered zones have around velocity 75 (a mid dynamic)
    mid = [l for r, l in zip(ins.regions, lv) if r['lovel'] <= 75 <= r['hivel'] and r['hivel'] - r['lovel'] < 100]
    if mid:
        for b in med:
            if b[1] - b[0] >= 100:
                med[b] = float(np.median(mid))
    for r, l in zip(ins.regions, lv):
        r['vol'] += float(np.clip(med[(r['lovel'], r['hivel'])] - l, -12, 12))


# ---------------------------------------------------------------- harmony

# name -> (bass key, voicing low..high, chord pitch classes)
CH = {
    'Cm':     ('C2', ['G3', 'C4', 'Eb4'], 'C Eb G'),
    'Bb':     ('Bb1', ['F3', 'Bb3', 'D4'], 'Bb D F'),
    'Ab':     ('Ab1', ['Ab3', 'C4', 'Eb4'], 'Ab C Eb'),
    'G':      ('G1', ['G3', 'B3', 'D4'], 'G B D'),
    'G7':     ('G1', ['F3', 'B3', 'D4'], 'G B D F'),
    'Fm':     ('F2', ['F3', 'Ab3', 'C4'], 'F Ab C'),
    'Dm7b5':  ('D2', ['F3', 'Ab3', 'C4'], 'D F Ab C'),
    'Eb':     ('Eb2', ['G3', 'Bb3', 'Eb4'], 'Eb G Bb'),
    'Gm/D':   ('D2', ['G3', 'Bb3', 'D4'], 'G Bb D'),
    'Eb/G':   ('G1', ['G3', 'Bb3', 'Eb4'], 'Eb G Bb'),
    'Fm7':    ('F2', ['Ab3', 'C4', 'Eb4'], 'F Ab C Eb'),
    'Bb7sus': ('Bb1', ['F3', 'Ab3', 'Eb4'], 'Bb Eb F Ab'),
    'Bb7':    ('Bb1', ['F3', 'Ab3', 'D4'], 'Bb D F Ab'),
    'Ab/C':   ('C2', ['Ab3', 'C4', 'Eb4'], 'Ab C Eb'),
    'Fm/C':   ('C2', ['F3', 'Ab3', 'C4'], 'F Ab C'),
}
PCN = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}


def pcs(ch):
    return {PCN[t] for t in CH[ch][2].split()}


# two entries per bar (half notes)
INTRO = ['Cm', 'Cm']
A_SEC = ['Cm', 'Cm', 'Bb', 'Bb', 'Ab', 'Ab', 'G', 'G', 'Cm', 'Cm', 'Fm', 'Dm7b5', 'G7', 'G7', 'Cm', 'Cm']
A2_SEC = A_SEC[:8] + ['Ab', 'Ab', 'Fm7', 'Fm7', 'Bb7sus', 'Bb7sus', 'Bb7', 'Bb7']
B_SEC = ['Eb', 'Eb', 'Gm/D', 'Gm/D', 'Cm', 'Cm', 'Ab', 'Ab', 'Eb/G', 'Eb/G', 'Fm7', 'Fm7', 'Bb7sus', 'Bb7sus', 'Bb7sus', 'Bb7']
B2_SEC = B_SEC[:12] + ['Ab', 'Ab', 'G', 'G']
C_SEC = ['Cm', 'Cm', 'Ab/C', 'Ab/C', 'Fm/C', 'Fm/C', 'Cm', 'Cm', 'Ab', 'Ab', 'Fm', 'Fm', 'Dm7b5', 'Dm7b5', 'G7', 'G7']
A3_SEC = A_SEC[:-2] + ['Cm', 'G7']
HARM = INTRO + A_SEC + A2_SEC + B_SEC + B2_SEC + C_SEC + A3_SEC

S_IN, S_A, S_A2, S_B, S_B2, S_C, S_A3, END = 0, 4, 36, 68, 100, 132, 164, 196

# ---------------------------------------------------------------- tunes

# the main motif (trombone register): "attention!" dotted pickup, up a fourth
MEL_A = """G3:e. G3:s C4:q. D4:e Eb4:q | D4:e C4:e Bb3:e C4:e D4:h |
Ab3:e. Ab3:s C4:q. Eb4:e F4:q | Eb4:e D4:e C4:e B3:e D4:h |
G3:e. G3:s C4:q. D4:e Eb4:q | F4:q. Eb4:e D4:q C4:e Ab3:e |
G3:e B3:e D4:e F4:e Eb4:e D4:q. | C4:h. r:q |"""
MEL_A_HEAD = MEL_A.split('|')
MEL_A2_TAIL = """C4:q. Bb3:e Ab3:q Eb3:q | F3:e G3:e Ab3:e Bb3:e C4:q Eb4:q |
Eb4:h. F4:e Eb4:e | D4:h r:h |"""
MEL_A2 = '|'.join(MEL_A_HEAD[:4]) + '| ' + MEL_A2_TAIL
MEL_A3 = '|'.join(MEL_A_HEAD[:7]) + '| C4:q r:q r:h |'

# her warmth (cello register), E-flat major
MEL_B = """G3:q. Ab3:e Bb3:h | Bb3:q. C4:e D4:q Bb3:q | Eb4:h. F4:e D4:e | C4:q Bb3:q Ab3:h |
G3:q. Ab3:e Bb3:q Eb4:q | Eb4:q. D4:e C4:q Ab3:q | Bb3:h. C4:e D4:e | Eb4:h D4:h |"""
MEL_B2 = '|'.join(MEL_B.split('|')[:6]) + '| C4:q. Bb3:e Ab3:q F3:q | G3:h. r:q |'

# cello answer under the horn in B'
VC_B2 = """Eb3:h G3:q Bb3:q | D3:h G3:h | G3:h. Eb3:q | Ab3:q C4:q Eb4:h |
Bb3:h G3:h | Ab3:h. C4:q | Eb3:h. Ab3:q | B2:h D3:h |"""

# horn counterline in B (long notes)
HN_B = """Bb3:w | Bb3:h D4:h | C4:w | C4:h Eb4:h |
Eb4:w | C4:h Eb4:h | Eb4:w | Eb4:h D4:h |"""


def bars(text):
    return [b.strip() for b in text.split('|') if b.strip()]


# ---------------------------------------------------------------- helpers

def eighths(harm, fn):
    """fn(chord, half) -> 4 keys (or None for a rest) per half bar."""
    out = []
    for i in range(0, len(harm), 2):
        bar = []
        for half, h in enumerate((harm[i], harm[i + 1])):
            for k in fn(h, half):
                bar.append('r:e' if k is None else '%s:e' % name(k))
        out.append(' '.join(bar) + ' |')
    return ' '.join(out)


def bk(h, o=0):
    return key(CH[h][0]) + 12 * o


def vk(h, v):
    return key(CH[h][1][v])


def pad(harm, voice, o=0):
    out = []
    for i in range(0, len(harm), 2):
        a, b = vk(harm[i], voice) + 12 * o, vk(harm[i + 1], voice) + 12 * o
        out.append(('%s:w |' % name(a)) if a == b else ('%s:h %s:h |' % (name(a), name(b))))
    return ' '.join(out)


def fifth_below(h):
    """The chord's fifth under its root (march bass 'pah')."""
    r = bk(h)
    for d in (5, 7, 6, 4, 3, 8, 9):   # the chord's fifth, else the nearest chord tone
        if (r - d) % 12 in pcs(h):
            return r - d
    return r - 5


def march_bass(harm, o=0):
    out = []
    for i in range(0, len(harm), 2):
        a, b = harm[i], harm[i + 1]
        x = bk(a, o)
        y = bk(b, o) if a != b else fifth_below(a) + 12 * o
        if y < key('F1'):
            y += 12
        out.append('%s:q r:q %s:q r:q |' % (name(x), name(y)))
    return ' '.join(out)


def piano_oct(harm, rhythm='march'):
    out = []
    for i in range(0, len(harm), 2):
        a, b = harm[i], harm[i + 1]
        x, y = bk(a), bk(b)
        ca = '%s,%s' % (name(x), name(x + 12))
        cb = '%s,%s' % (name(y), name(y + 12))
        if rhythm == 'march':
            out.append('%s:q r:q %s:q r:q |' % (ca, cb))
        elif rhythm == 'drive':    # the C section: dotted push
            out.append('%s:e. %s:s r:e %s:e %s:q r:q |' % (ca, ca, ca, cb))
        elif rhythm == 'warm':     # B: low octave + soft chord above
            v = ','.join(CH[a][1])
            w = ','.join(CH[b][1])
            out.append('%s:q %s:q %s:q %s:q |' % (ca, v, cb, w))
    return ' '.join(out)


# snare bars (VSCO GM-StylePerc: D2 snare, C#2 soft taps, D#2 roll)
SN = {
    'mar': '@mf D2:e @pp C#2:s C#2:s @mf D2:e @pp C#2:e @mf D2:e. @p D2:s @mf D2:e @pp C#2:e |',
    'mar2': '@mf D2:e @pp C#2:e @mp D2:e. @pp C#2:s @mf D2:e @pp C#2:s C#2:s @mp D2:e @p D2:e |',
    'roll': '@mf D2:e @pp C#2:s C#2:s @mf D2:e @pp C#2:e @mf D2:q @p< D#2:q @mf |',
    'fill': '@mf D2:e @pp C#2:s C#2:s @mf D2:e D2:e @p< D2:s D2:s D2:s D2:s D2:s D2:s D2:s D2:s @f |',
    'quiet': '@p D2:e @ppp C#2:s C#2:s @pp D2:e @ppp C#2:e @p D2:e. @ppp D2:s @pp D2:e @ppp C#2:e |',
    'rest': 'r:w |',
}


def snare(seq):
    return ' '.join(SN[s] for s in seq)


# ---------------------------------------------------------------- the score

def build():
    P = []

    def part(n, patch, text='', start=0, **perf):
        P.append(Part(n, patch, text, start, BPB, **perf))
        return P[-1]

    # --- low brass ---
    tb1 = part('Trombone 1', 'tbn', humanize=0.008, gate=0.92, swell=0.03, layers=2)
    tb2 = part('Trombone 2', 'tbn', gain=-2, humanize=0.009, gate=0.92, swell=0.03, layers=2, cents=-3)
    tb1.add('@mf ' + MEL_A, S_A)
    tb2.add('@mf ' + octv(MEL_A, -1), S_A)
    tb1.add('@mp ' + pad(A2_SEC, 1, -1) + ' @p', S_A2)       # under the horns
    tb2.add('@mp ' + pad(A2_SEC, 0, -1) + ' @p', S_A2)
    tb1.add('@pp ' + pad(B2_SEC[8:], 1, -1), S_B2 + 16)     # soft warmth late in B'
    tb2.add('@pp ' + pad(B2_SEC[8:], 0, -1), S_B2 + 16)
    # C: answers to the trumpet signal
    tb1.add('@mf r:w | Ab3:e. Ab3:s C4:q Eb4:q r:q | r:w | r:w | r:w | @f F3:e. F3:s Ab3:q. C4:e F4:q | r:w | r:w |', S_C)
    tb2.add('@mf r:w | Ab2:e. Ab2:s C3:q Eb3:q r:q | r:w | r:w | r:w | @f F2:e. F2:s Ab2:q. C3:e F3:q | r:w | r:w |', S_C)
    tb1.add('@f ' + MEL_A3, S_A3)
    tb2.add('@f ' + octv(MEL_A3, -1), S_A3)
    tbs = part('Trombones stac', 'tbn_stac', humanize=0.006, layers=2)
    # C bars 39-40: rising stabs, then the dotted motif on G7
    tbs.add('@mf r:w | r:w | r:w | r:w | r:w | r:w | @f D3,Ab3:q r:q F3,C4:q r:q | @ff F3,B3:e. F3,B3:s F3,B3:q F3,B3:q r:q |', S_C)
    tbs.add('@mf r:w | ' * 7 + '@mf C3,G3:q r:q r:q G2,F3:q |', S_A3)

    tuba = part('Tuba', 'tuba_stac', humanize=0.007, gate=1.0)
    tuba.add('@mf ' + march_bass(INTRO), S_IN)
    tuba.add('@mf ' + march_bass(A_SEC + A2_SEC), S_A)
    tuba.add('@mf ' + march_bass(A3_SEC[:-2]) + ' C2:q r:q G1:q G1:q |', S_A3)
    tubal = part('Tuba sus', 'tuba', gain=-3, humanize=0.01, swell=0.05)
    tubal.add('@pp ' + 'G1:w | F1:w | ' + '@p< Ab1:w | G1:w | @mp', S_B2 + 16)   # B' turn
    tubal.add('@p C2:w~ | C2:w~ | C2:w~ | C2:w | @mp< Ab1:w | F1:w | D2:w | G1:w | @f', S_C)

    # --- horns ---
    hn1 = part('Horn 1', 'hn', humanize=0.01, swell=0.05)
    hn2 = part('Horn 2', 'hn', humanize=0.012, swell=0.05, cents=-4)
    hn1.add('@p ' + pad(A_SEC, 2), S_A)
    hn2.add('@p ' + pad(A_SEC, 1), S_A)
    hn1.add('@f ' + octv(MEL_A2, 1), S_A2)
    hn2.add('@mp ' + pad(A2_SEC, 2) + ' @p', S_A2)
    hn1.add('@pp ' + HN_B, S_B)
    hn2.add('@pp ' + pad(B_SEC, 1), S_B)
    hn1.add('@mp ' + octv(MEL_B2, 1), S_B2)
    hn2.add('@pp ' + pad(B2_SEC, 1) + ' @p', S_B2)
    hn1.add('@mf r:w | r:w | r:w | G4:e. G4:s C5:q. D5:e Eb5:q | r:w | @f F4:e. F4:s Ab4:q. C5:e F5:q | r:w | r:w |', S_C)
    hn2.add('@mp r:w | r:w | r:w | Eb4:e. Eb4:s G4:q. F4:e G4:q | r:w | @f C4:e. C4:s F4:q. Ab4:e C5:q | r:w | r:w |', S_C)
    hn1.add('@f ' + octv(MEL_A3, 1), S_A3)
    hn2.add('@mf ' + pad(A3_SEC[:14], 2) + ' C4:q r:q r:h |', S_A3)
    hns = part('Horns stac', 'hn_stac', humanize=0.006)
    hns.add('@mf r:w | ' * 6 + '@f Ab3,D4:q r:q Ab3,F4:q r:q | @ff B3,D4:e. B3,D4:s B3,D4:q B3,D4:q r:q |', S_C)

    # --- trumpet (straight mute): whistle / radio ---
    tp = part('Trumpet mute', 'tpt_mute', humanize=0.005, gate=0.85)
    tp.add('@mp ' + 'r:w | ' * 7 + 'r:h G4:s G4:s C5:e r:e G4:e |', S_A)
    tp.add('@mf ' + 'r:w | ' * 7 + 'r:h F4:s F4:s Bb4:e r:e F4:e |', S_A2)
    tp.add('@p ' + 'r:w | ' * 7 + 'r:h. @pp Bb4:s Bb4:s Bb4:e |', S_B)
    tp.add('@mp ' + 'r:w | ' * 7 + 'r:h D5:s D5:s G4:e r:e B4:e |', S_B2)
    tp.add('@mf C5:e. C5:s G4:e C5:e Eb5:q r:q | r:w | C5:e. C5:s Ab4:e C5:e F5:q r:q | r:w | '
           '@f Eb5:e. Eb5:s C5:e Eb5:e Ab5:q r:q | r:w | F5:e. F5:s D5:e F5:e Ab5:q r:q | r:w |', S_C)
    tp.add('@mf ' + 'r:w | ' * 7 + 'r:q r:e G4:s G4:s B4:e. B4:s D5:e F5:e |', S_A3)

    # --- strings ---
    def cello(h, half):
        r = bk(h, 1)
        return [r, r, r + 12, r]

    def basses(h, half):
        r = bk(h)
        return [r, r, r, r]

    def viola(h, half):
        return [vk(h, 0), vk(h, 1), vk(h, 0), vk(h, 1)]

    def vln2(h, half):
        return [vk(h, 2) + 12, vk(h, 1) + 12, vk(h, 2) + 12, vk(h, 1) + 12]

    def vln1(h, half):
        return [vk(h, 1) + 12, vk(h, 2) + 12, vk(h, 0) + 24, vk(h, 2) + 12]

    def cpedal(h, half):
        return [key('C3'), key('C3'), key('C4'), key('C3')]

    def bpedal(h, half):
        return [key('C2')] * 4

    vcs = part('Cellos spic', 'vc_spic', humanize=0.006)
    cbs = part('Basses spic', 'cb_spic', humanize=0.006)
    vas = part('Violas spic', 'vla_spic', humanize=0.006)
    v2s = part('Violins II spic', 'vln_spic', humanize=0.006)
    v1s = part('Violins I spic', 'vln_spic', humanize=0.006)
    vcs.add('@mf ' + eighths(INTRO + A_SEC + A2_SEC, cello), S_IN)
    cbs.add('@mf ' + eighths(INTRO + A_SEC + A2_SEC, basses), S_IN)
    vas.add('@mp ' + eighths(INTRO + A_SEC + A2_SEC, viola), S_IN)
    v2s.add('@mp ' + eighths(A_SEC + A2_SEC, vln2), S_A)
    v1s.add('@mp ' + eighths(A2_SEC, vln1), S_A2)
    # B': violas come back softly in the second half
    vas.add('@p ' + eighths(B2_SEC[8:], viola), S_B2 + 16)
    # C: pedal on C, then roots
    vcs.add('@p< ' + eighths(C_SEC[:8], cpedal) + ' @mf ' + eighths(C_SEC[8:], cello) + ' @f', S_C)
    cbs.add('@p< ' + eighths(C_SEC[:8], bpedal) + ' @mf ' + eighths(C_SEC[8:], basses) + ' @f', S_C)
    vas.add('@p< ' + eighths(C_SEC, viola) + ' @f', S_C)
    vcs.add('@f ' + eighths(A3_SEC, cello), S_A3)
    cbs.add('@f ' + eighths(A3_SEC, basses), S_A3)
    vas.add('@mf ' + eighths(A3_SEC, viola), S_A3)
    v2s.add('@mf ' + eighths(A3_SEC, vln2), S_A3)

    # legato strings: B pads and melody, A'' violins on the motif
    v1 = part('Violins I', 'vln', legato=True, humanize=0.01, swell=0.05, cents=2)
    v2 = part('Violins II', 'vln', legato=True, humanize=0.012, swell=0.05, cents=-3)
    va = part('Violas', 'vla', legato=True, humanize=0.012, swell=0.05)
    vc = part('Cellos', 'vc', legato=True, humanize=0.01, swell=0.06)
    v1.add('@pp ' + pad(B_SEC, 2, 1), S_B)
    v2.add('@pp ' + pad(B_SEC, 2), S_B)
    va.add('@pp ' + pad(B_SEC, 1), S_B)
    vc.add('@mf ' + MEL_B, S_B)
    v1.add('@p ' + pad(B2_SEC, 2, 1) + ' @mp', S_B2)
    v2.add('@pp ' + pad(B2_SEC, 2) + ' @p', S_B2)
    va.add('@pp ' + pad(B2_SEC[:8], 1), S_B2)
    vc.add('@mp ' + VC_B2, S_B2)
    v1.add('@mf ' + octv(MEL_A3, 1), S_A3)

    vt1 = part('Violins I trem', 'vln_trem', humanize=0.01, swell=0.04)
    vt2 = part('Violins II trem', 'vln_trem', humanize=0.012, swell=0.04, cents=-4)
    vt1.add('@pp< ' + pad(C_SEC, 2, 1) + ' @f', S_C)
    vt2.add('@pp< ' + pad(C_SEC, 2) + ' @mf', S_C)

    cbp = part('Basses pizz', 'cb_pizz', humanize=0.008)
    bline = []
    for i in range(0, 16, 2):
        a, b = B_SEC[i], B_SEC[i + 1]
        bline.append('%s:q r:q %s:q r:q |' % (name(bk(a, 1)), name(bk(b, 1) if a != b else fifth_below(a) + 12)))
    cbp.add('"pizz." @mp ' + ' '.join(bline), S_B)
    bline2 = []
    for i in range(0, 16, 2):
        a, b = B2_SEC[i], B2_SEC[i + 1]
        bline2.append('%s:q r:q %s:q r:q |' % (name(bk(a, 1)), name(bk(b, 1) if a != b else fifth_below(a) + 12)))
    cbp.add('@mp ' + ' '.join(bline2), S_B2)

    # --- piano: low octaves ---
    pno = part('Piano', 'piano', humanize=0.006, gate=0.6)
    pno.add('@mf ' + piano_oct(INTRO + A_SEC + A2_SEC), S_IN)
    pno.add('@p ' + piano_oct(B_SEC + B2_SEC, 'warm'), S_B)
    pno.add('@mp< ' + piano_oct(C_SEC, 'drive') + ' @f', S_C)
    pno.add('@mf ' + piano_oct(A3_SEC), S_A3)

    # --- timpani ---
    tim = part('Timpani', 'timp', humanize=0.004, gate=1.0, gain=4)
    tim.add('@mf C2:q r:q r:h |', S_IN)
    tim.add('@mf C2:q r:q r:h | r:w | r:w | G2:q r:q r:h | C2:q r:q r:h | r:w | G2:q r:q G2:q r:q | C2:q r:h G2:e. G2:s |', S_A)
    tim.add('@f C2:q r:q r:h | r:w | r:w | G2:q r:q r:h | Ab2:q r:q r:h | F2:q r:q r:h | r:w | @mf Bb2:q r:q r:h |', S_A2)
    tim.add('@pp ' + 'r:w | ' * 6 + 'G2:q r:q r:h | G2:q r:q G2:q G2:q |', S_B2)
    tim.add('@mp C2:q r:q r:h | r:w | r:w | C2:q r:q r:h | Ab2:q r:q r:h | F2:q r:q r:h | r:w | r:w |', S_C)
    tim.add('@f C2:q r:q r:h | r:w | r:w | G2:q r:q r:h | C2:q r:q r:h | F2:q r:q r:h | G2:q r:q G2:q r:q | C2:q r:q G2:q r:q |', S_A3)
    timr = part('Timpani roll', 'timp_roll', humanize=0.0, gate=1.0, gain=4)
    timr.add('@p< ' + 'r:w | ' * 6 + 'G2:w~ | G2:h. r:q | @f', S_C)

    # --- snare, rim, cymbals, bass drum ---
    sn = part('Snare', 'perc', humanize=0.004, gate=4.0, gain=4)
    sn.add(snare(['fill']), S_IN)
    sn.add(snare(['mar', 'mar2', 'mar', 'roll', 'mar', 'mar2', 'mar', 'fill']), S_A)
    sn.add(snare(['mar', 'mar2', 'mar', 'roll', 'mar', 'mar2', 'quiet', 'rest']), S_A2)
    sn.add(snare(['rest'] * 4 + ['quiet', 'quiet', 'mar2', 'roll']), S_B2)
    sn.add(snare(['quiet', 'quiet', 'quiet', 'quiet', 'mar', 'mar2', 'mar', 'rest']) , S_C)
    sn.add('@p< D#2:h. @f D2:e D2:e |', S_C + 28)
    sn.add(snare(['mar', 'mar2', 'mar', 'roll', 'mar', 'mar2', 'mar', 'fill']), S_A3)

    # rolls stop at the next downbeat: their own part without the long gate
    snr = part('Snare roll', 'perc', humanize=0.002, gate=1.0, gain=4)
    snr.notes = [n for n in sn.notes if n[2] == [midi('D#2')]]
    snr.dyn = list(sn.dyn)
    sn.notes = [n for n in sn.notes if n[2] != [midi('D#2')]]

    rim = part('Rim', 'rim', humanize=0.005, gate=1.0)
    rimb = '@p r:q C4:q r:e @pp C4:e @p C4:q |'
    rimb2 = '@p r:q C4:q r:q C4:e @pp C4:e |'
    rim.add(' '.join([rimb, rimb2] * 4), S_B)
    rim.add(' '.join([rimb, rimb2] * 2), S_B2)
    rim.add('@pp ' + ' '.join([rimb, rimb2] * 2), S_C)

    pc = part('Perc', 'perc', humanize=0.003, gate=4.0)
    # suspended cymbal swell into A'', cymbal + bass drum on its downbeat
    pc.add('@mp B2:1.875', S_A3 - 1.875)
    pc.add('@mf D#3:q r:q r:h | r:w | r:w | r:w | @mp C2:q r:q r:h | r:w | r:w | r:w |', S_A3)
    pc.add('@mf C2:q r:q r:h |', S_A3)
    pc.add('@mp C2:q r:q r:h |', S_A)

    tempo = Tempo([[0, 100], [S_B - 3, 100], [S_B - 0.25, 94], [S_B + 1, 97], [S_B2 - 1, 97], [S_B2 + 1, 98],
                   [S_C - 3, 98], [S_C, 100], [S_A3 - 2, 100], [S_A3 - 0.5, 98], [S_A3 + 0.5, 100], [END, 100]])
    return P, tempo, S_A, END


SEATS = {
    'Trombone 1': 'tbn', 'Trombone 2': 'tbn2', 'Trombones stac': 'tbn', 'Tuba': 'tuba', 'Tuba sus': 'tuba',
    'Horn 1': 'hn', 'Horn 2': 'hn2', 'Horns stac': 'hn', 'Trumpet mute': 'tpt',
    'Cellos spic': 'vc', 'Basses spic': 'cb', 'Violas spic': 'vla', 'Violins II spic': 'vln2', 'Violins I spic': 'vln1',
    'Violins I': 'vln1', 'Violins II': 'vln2', 'Violas': 'vla', 'Cellos': 'vc', 'Basses pizz': 'cb',
    'Violins I trem': 'vln1', 'Violins II trem': 'vln2',
    'Piano': 'piano', 'Timpani': 'timp', 'Timpani roll': 'timp', 'Snare': 'snare', 'Snare roll': 'snare', 'Rim': 'rim', 'Perc': 'perc',
}
UNPITCHED = {'Snare', 'Snare roll', 'Rim', 'Perc', 'Timpani', 'Timpani roll'}
MELODIC = {'Trombone 1', 'Horn 1', 'Cellos', 'Violins I', 'Trumpet mute', 'Trombone 2'}


# ---------------------------------------------------------------- checks

def chord_at(beat):
    return HARM[int(beat // 2)]


def check(P):
    """Every note against the chord of the moment, plus minor-second clashes
    between any two parts that sound together."""
    print('section map:')
    for nm, s in [('Intro', S_IN), ('A', S_A), ("A'", S_A2), ('B', S_B), ("B'", S_B2), ('C', S_C), ("A''", S_A3), ('end', END)]:
        print('  %-5s bar %2d  beat %3d' % (nm, s // 4, s))
    print('non-chord tones (strong beats or a beat or longer):')
    for p in P:
        if p.name in UNPITCHED:
            continue
        for b, d, keys, ps in p.notes:
            ch = chord_at(b)
            pos = b % 4
            for k in keys:
                if k % 12 not in pcs(ch) and (pos in (0, 2) or d >= 1 or p.name not in MELODIC):
                    print('  %-16s bar %2d beat %.2f %-4s over %-7s dur %.2f' % (p.name, b // 4, pos + 1, name(k), ch, d))
    print('minor-second clashes (overlap >= 1/2 beat):')
    notes = []
    for p in P:
        if p.name in UNPITCHED:
            continue
        for b, d, keys, ps in p.notes:
            for k in keys:
                notes.append((b, b + d, k, p.name))
    notes.sort()
    n = 0
    for i, (b0, e0, k0, p0) in enumerate(notes):
        for b1, e1, k1, p1 in notes[i + 1:]:
            if b1 >= e0:
                break
            ov = min(e0, e1) - max(b0, b1)
            if ov >= 0.5 and (k0 - k1) % 12 in (1, 11):
                n += 1
                print('  bar %2d beat %.2f: %s %s vs %s %s (%.2f beats)' % (b1 // 4, b1 % 4 + 1, p0, name(k0), p1, name(k1), ov))
    print('  %d clashes' % n)


# ---------------------------------------------------------------- render

def excerpt(P, tempo, bar0, bar1, out):
    import soundfile as sf
    b0, b1 = bar0 * 4, bar1 * 4
    n = int((tempo.sec(b1) - tempo.sec(b0) + 4) * render.SR)
    dry = np.zeros((n, 2), np.float32)
    send = np.zeros((n, 2), np.float32)
    for p in P:
        a = render.render_part(p, tempo, b0, b1, b0)[:n]
        seat = render.SEAT[SEATS[p.name]]
        d, s = render.place(np.pad(a, ((0, n - len(a)), (0, 0))), seat)
        g = 10 ** (p.perf.get('gain', 0) / 20)
        dry += d * g
        send += s * g
        r = np.sqrt(np.mean((d * g) ** 2))
        if r > 0:
            print('  %-16s rms %6.1f dB  peak %6.1f dB' % (p.name, 20 * np.log10(r + 1e-12), 20 * np.log10(np.abs(d * g).max() + 1e-12)))
    mix = dry + render.reverb(send, render.hall_ir()) * 0.75
    m, l0, l1 = render.loudness(render.master(mix))
    sf.write(out, m, render.SR)
    print('excerpt', out, '%.1f LUFS' % l1)


def render_piece_lowmem(name, parts, tempo, loop_start, loop_end, outdir, seats):
    """render.render_piece with the same loop layout and signal path, built
    for a score with many parts: each part's intro and loop are placed on the
    stage once (placement is linear and time-invariant, so placing the loop
    then laying it down four times equals laying down then placing), no stem
    copies are kept, and a patch's sample cache is freed after its last part."""
    import soundfile as sf
    SR = render.SR
    intro_s = tempo.sec(loop_start)
    loop_s = tempo.sec(loop_end) - intro_s
    intro_n = int(round(intro_s * SR))
    N = int(round(loop_s * SR))
    reps = 4
    total = intro_n + reps * N + 6 * SR
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    last_use = {p.patch: i for i, p in enumerate(parts)}

    def lay(buf, at, g, sg):
        d, s_ = render.place(buf, seat)
        n = min(len(d), total - at)
        if n > 0:
            dry[at:at + n] += d[:n] * g
            send[at:at + n] += s_[:n] * sg

    for i, p in enumerate(parts):
        seat = render.SEAT[seats.get(p.name, p.name)]
        seat = dict(seat, **{k: p.perf[k] for k in ('pan', 'width', 'depth') if k in p.perf})
        g = 10 ** (p.perf.get('gain', 0) / 20)
        sg = g * p.perf.get('send', 1.0)
        pk = 0.0
        if loop_start > 0:
            a = render.render_part(p, tempo, 0, loop_start, 0)
            lay(a, 0, g, sg)
            pk = max(pk, float(np.max(np.abs(a))) * g)
        lp = render.render_part(p, tempo, loop_start, loop_end, loop_start)
        pk = max(pk, float(np.max(np.abs(lp))) * g)
        d, s_ = render.place(lp, seat)
        for k in range(reps):
            at = intro_n + k * N
            n = min(len(d), total - at)
            dry[at:at + n] += d[:n] * g
            send[at:at + n] += s_[:n] * sg
        del lp, d, s_
        if last_use[p.patch] == i:
            render._INST.pop(p.patch, None)
        print('  part %-16s peak %.2f' % (p.name, pk), flush=True)
    wet = render.reverb(send, render.hall_ir())
    del send
    mix = dry + wet * 0.75
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
    del m
    out, l0, l1 = render.loudness(out)
    wav = os.path.join(outdir, name + '.wav')
    sf.write(wav, out, SR, subtype='FLOAT')
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1, intro_n=intro_n, N=N)


def main():
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.getcwd()
    os.makedirs(out, exist_ok=True)
    work = os.environ.get('MUSIC_WORK', os.path.join(out, 'work'))
    setup(work)
    P, tempo, ls, le = build()
    check(P)
    if '--check' in sys.argv:
        return
    if '--excerpt' in sys.argv:
        i = sys.argv.index('--excerpt')
        a, b = int(sys.argv[i + 1]), int(sys.argv[i + 2])
        excerpt(P, tempo, a, b, os.path.join(out, '%s_excerpt_%d_%d.wav' % (ID, a, b)))
        return
    import build as B
    info = render_piece_lowmem(ID, P, tempo, ls, le, work, SEATS)
    ogg = os.path.join(out, ID + '.ogg')
    render.to_ogg(info['wav'], ogg, q=6)
    render.to_mp3(info['wav'], os.path.join(out, ID + '.mp3'))
    B.spectrogram(info['wav'], os.path.join(out, ID + '_spectrogram.png'), 'Officer Jenny: ' + TITLE)
    seam = B.seam_check(info['wav'], info['intro_s'])
    js = dict(id=ID, title=TITLE, file=ID + '.ogg', intro_s=round(info['intro_s'], 6), loop_s=round(info['loop_s'], 6),
              total_s=round(info['total_s'], 6), lufs=round(info['lufs'], 2), bpm=BPM, key='C minor',
              seam=[round(x, 5) for x in seam])
    json.dump(js, open(os.path.join(out, 'info.json'), 'w'), indent=1)
    print(json.dumps(js))
    import soundfile as sf
    x, sr = sf.read(info['wav'])
    print('peak %.2f dBFS' % (20 * np.log10(np.abs(x).max())))
    o = int(round(info['intro_s'] * sr))
    import pyloudnorm as pyln
    meter = pyln.Meter(sr)
    for nm, s0, s1 in [('A', S_A, S_A2), ("A'", S_A2, S_B), ('B', S_B, S_B2), ("B'", S_B2, S_C), ('C', S_C, S_A3), ("A''", S_A3, END)]:
        a0, a1 = int(tempo.sec(s0) * sr), int(tempo.sec(s1) * sr)
        print('  %-4s %5.1f-%5.1f s  %6.1f LUFS' % (nm, a0 / sr, a1 / sr, meter.integrated_loudness(x[a0:a1])))
    sm = np.concatenate([x[-4 * sr:], x[o:o + 4 * sr]])
    sf.write(os.path.join(work, ID + '_seam.wav'), sm, sr)


if __name__ == '__main__':
    main()
