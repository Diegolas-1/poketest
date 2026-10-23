"""Pallet Town: "Hometown by the Sea" (original composition).

A pastoral seaside-hometown theme in D major, 84 bpm, 4/4. Written for this
fan game in the spirit of the series' hometown music (gentle, nostalgic,
hopeful) without borrowing any of its melodies or progressions.

Form (bars): Intro 1-4 | A 5-12 (clarinet, harp, pizzicato) | A' 13-20
(violins, oboe descant, horns) | B 21-28 (cellos and horn sing; crescendo,
timpani roll) | A'' 29-36 (tutti) | Link 37-38 (back to A). The game loops
bars 5-38; the intro plays once.

`night=True` gives the evening variation: slower, flute and clarinet over
harp and soft strings, no brass or timpani, a fading close each pass.
"""
from score import Part, Tempo

BPB = 4

# chord per half bar: name -> (bass key name, pad voicing low..high, chord tones)
CH = {
    'D':     ('D2', ['A3', 'D4', 'F#4'], ['D', 'F#', 'A']),
    'G':     ('G2', ['G3', 'B3', 'D4'], ['G', 'B', 'D']),
    'G/B':   ('B1', ['G3', 'B3', 'D4'], ['G', 'B', 'D']),
    'Em7':   ('E2', ['G3', 'D4', 'E4'], ['E', 'G', 'B', 'D']),
    'A':     ('A1', ['A3', 'C#4', 'E4'], ['A', 'C#', 'E']),
    'Asus4': ('A1', ['A3', 'D4', 'E4'], ['A', 'D', 'E']),
    'A7':    ('A1', ['G3', 'C#4', 'E4'], ['A', 'C#', 'E', 'G']),
    'A7sus': ('A1', ['A3', 'D4', 'G4'], ['A', 'D', 'E', 'G']),
    'D/F#':  ('F#2', ['A3', 'D4', 'F#4'], ['D', 'F#', 'A']),
    'D7/C':  ('C2', ['A3', 'C4', 'F#4'], ['D', 'F#', 'A', 'C']),
    'F#m7':  ('F#2', ['A3', 'C#4', 'F#4'], ['F#', 'A', 'C#', 'E']),
    'Bm':    ('B1', ['B3', 'D4', 'F#4'], ['B', 'D', 'F#']),
    'Gmaj7': ('G2', ['B3', 'D4', 'F#4'], ['G', 'B', 'D', 'F#']),
    'G/A':   ('A1', ['G3', 'B3', 'D4'], ['G', 'B', 'D']),
}

# harmony, two entries per bar (half notes)
INTRO = ['D', 'D', 'G', 'G', 'D', 'D', 'Asus4', 'A']
A_SEC = ['D', 'D', 'G/B', 'G/B', 'Em7', 'Em7', 'A', 'A', 'D/F#', 'D/F#', 'G', 'G', 'Em7', 'A7', 'D', 'D']
A2_SEC = A_SEC[:-2] + ['D', 'D7/C']
B_SEC = ['G', 'G', 'A', 'A', 'F#m7', 'F#m7', 'Bm', 'Bm', 'Em7', 'Em7', 'G', 'G', 'A', 'A', 'A7', 'A7']
LINK = ['Gmaj7', 'Gmaj7', 'A7sus', 'A7']
HARM = INTRO + A_SEC + A2_SEC + B_SEC + A_SEC + LINK

MEL_A = """F#4:q. G4:e A4:h | B4:q. A4:e G4:q F#4:q | E4:q F#4:q G4:q B4:q | A4:h. r:q |
F#4:q. G4:e A4:q D5:q | D5:q. C#5:e B4:q A4:q | G4:q B4:q A4:q. G4:e | F#4:h. r:q |"""
MEL_B = """B4:q. C#5:e D5:q B4:q | C#5:h A4:h | A4:q. B4:e C#5:q A4:q | B4:h F#4:h |
G4:q A4:q B4:q E5:q | D5:q. C#5:e B4:q A4:q | C#5:q D5:q E5:h | E5:q. D5:e C#5:q E5:q |"""

NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
FLAT = {'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'}


def name(k):
    return NOTE[k % 12] + str(k // 12 - 1)


def key(n):
    from score import midi
    return midi(n)


def octv(text, n):
    """Move every pitch in a part text by n octaves."""
    import re
    return re.sub(r'([A-G][#b]?)(-?\d)(?=[:,~])', lambda m: m.group(1) + str(int(m.group(2)) + n), text)


def harp_text(harm, low=38, span=2):
    """Harp: flowing eighth-note arpeggios, up from the bass through two
    octaves and back, one shape per half bar of harmony."""
    out = []
    for i in range(0, len(harm), 2):
        bar = []
        for half, h in enumerate((harm[i], harm[i + 1])):
            bass, pad, tones = CH[h]
            pcs = [NOTE.index(FLAT.get(t, t)) for t in tones]
            b = key(bass) + 12
            while b < low:
                b += 12
            seq, k = [], b
            while len(seq) < 7:
                if k % 12 in pcs and (not seq or k > seq[-1]):
                    seq.append(k)
                k += 1
            if half == 1 and harm[i] == harm[i + 1]:
                shape = [seq[4], seq[5], seq[3], seq[2]]   # same chord: crest and fall back
            else:
                shape = [seq[0], seq[1], seq[2], seq[3]]   # rise from the bass
            bar += ['%s:e' % name(x) for x in shape]
        out.append(' '.join(bar) + ' |')
    return ' '.join(out)


def pad_text(harm, voice, dur='h'):
    """One voice of the string pad (0 low .. 2 high), ties when it holds."""
    toks = []
    prev = None
    for i, h in enumerate(harm):
        n = CH[h][1][voice]
        toks.append('%s:%s' % (n, dur))
        if i % 2 == 1:
            toks.append('|')
    # tie repeated notes within the bar
    out = []
    for j, t in enumerate(toks):
        if j % 3 == 0 and toks[j + 1] == t:
            out.append(t + '~')
        else:
            out.append(t)
    return ' '.join(out)


def bass_text(harm, octave=0, rhythm='h'):
    toks = []
    for i, h in enumerate(harm):
        b = key(CH[h][0]) + 12 * octave
        if rhythm == 'h':
            toks.append('%s:h' % name(b))
        else:   # pizzicato: a crotchet then a rest
            toks.append('%s:q r:q' % name(b))
        if i % 2 == 1:
            toks.append('|')
    return ' '.join(toks)


def build(night=False):
    S_INTRO, S_A, S_A2, S_B, S_A3, S_LINK = 0, 16, 48, 80, 112, 144
    END = 152
    P = []

    def part(n, patch, text, start, **perf):
        P.append(Part(n, patch, text, start, BPB, **perf))
        return P[-1]

    # ---------- harp: flows through the whole piece ----------
    harp = part('Harp', 'harp', '', 0, spread=0.0, humanize=0.006, gate=1.4, gain=1.5 if night else 0)
    harp.add('@p ' + harp_text(INTRO), S_INTRO)
    harp.add('@p ' + harp_text(A_SEC), S_A)
    harp.add('@p ' + harp_text(A2_SEC), S_A2)
    harp.add('@p ' + harp_text(B_SEC), S_B)
    harp.add('@mp ' + harp_text(A_SEC), S_A3)
    harp.add('@mp> ' + harp_text(LINK) + ' @p', S_LINK)

    # ---------- melody ----------
    if not night:
        cl = part('Clarinet', 'cl', '', 0, legato=True, humanize=0.006, swell=0.04)
        cl.add('@mp ' + MEL_A, S_A)
        cl.add('@p ' + MEL_B, S_B)              # doubles the cellos softly in B
        cl.add('@mf ' + MEL_A, S_A3)
        vln1 = part('Violins I', 'vln', '', 0, legato=True, swell=0.05, humanize=0.01, cents=2)
        vln1.add('@p ' + pad_text(INTRO, 2), S_INTRO)
        vln1.add('@pp ' + pad_text(A_SEC, 2), S_A)
        vln1.add('@mf ' + octv(MEL_A, 1), S_A2)
        vln1.add('@pp< ' + ' '.join(['D5:w~ |', 'D5:w |', 'C#5:w |', 'D5:w |', 'B4:w |', 'B4:w |', 'C#5:w~ |', 'C#5:h E5:h |']) + ' @mp', S_B)
        vln1.add('@f ' + octv(MEL_A, 1), S_A3)
        vln1.add('@mp> ' + 'D5:w | C#5:h E5:h | @p', S_LINK)
    else:
        fl = part('Flute', 'fl', '', 0, legato=True, humanize=0.008, swell=0.05)
        fl.add('@mp ' + octv(MEL_A, 1), S_A)
        fl.add('@p ' + octv(MEL_A, 1), S_A3)
        cl = part('Clarinet', 'cl', '', 0, legato=True, humanize=0.008, swell=0.05)
        cl.add('@p ' + MEL_A, S_A2)
        cl.add('@mp ' + MEL_B, S_B)
        vln1 = part('Violins I', 'vln', '', 0, legato=True, swell=0.04, humanize=0.012, cents=2)
        vln1.add('@pp ' + pad_text(INTRO + A_SEC + A2_SEC + B_SEC + A_SEC + LINK, 2), 0)

    # flute: intro call, A' echoes, tutti doubling
    if not night:
        fl = part('Flute', 'fl', '', 0, legato=True, humanize=0.008, swell=0.04)
        fl.add('@p r:w | r:w | r:h A5:q. B5:e | A5:h F#5:h |', S_INTRO)
        fl.add('@mp r:w | r:w | r:w | r:h C#6:e D6:e E6:q | r:w | r:w | r:w | r:h A5:e B5:e D6:q |', S_A2)
        fl.add('@mp r:w | r:h D6:e C#6:e B5:q | r:w | r:h D6:e C#6:e B5:q | r:w | r:w | r:w | r:w |', S_B)
        fl.add('@mf ' + octv(MEL_A, 1), S_A3)
        fl.add('@p r:w | A5:q. B5:e A5:q G5:q |', S_LINK)
        ob = part('Oboe', 'ob', '', 0, legato=True, humanize=0.008, swell=0.05)
        ob.add('@mp A4:w | B4:h D5:h | E5:h G4:h | A4:h. r:q | A4:w | B4:h D5:h | E5:h C#5:h | D5:h C5:h |', S_A2)
        ob.add('@mf ' + MEL_A, S_A3)
        bn = part('Bassoon', 'bn', '', 0, legato=True, humanize=0.008, swell=0.04)
        bn.add('@p r:w | r:w | r:w | r:w | A3:h F#3:h | G3:h B3:h | B3:q A3:q G3:h | F#3:w |', S_A)
        bn.add('@mp ' + bass_text(A_SEC, 1), S_A3)
        hn = part('Horns', 'hn', '', 0, legato=False, humanize=0.012, swell=0.06)
        hn.add('@p ' + pad_text(A2_SEC, 1, 'h'), S_A2)
        hn2 = part('Horns 2', 'hn', '', 0, legato=False, humanize=0.012, swell=0.06, cents=-4)
        hn2.add('@p ' + pad_text(A2_SEC, 0, 'h'), S_A2)
        hn.add('@mp< r:w | r:w | r:w | r:w | ' + 'G3:q A3:q B3:q E4:q | D4:q. C#4:e B3:q A3:q | C#4:q D4:q E4:h | E4:q. D4:e C#4:q E4:q | @f', S_B)
        hn.add('@mp ' + pad_text(A_SEC, 2, 'h'), S_A3)
        hn2.add('@mp ' + pad_text(A_SEC, 1, 'h'), S_A3)
        hn2.add('@p< r:w | r:w | r:w | r:w | ' + pad_text(B_SEC[8:], 0) + ' @f', S_B)
        glock = part('Glockenspiel', 'glock', '', 0, humanize=0.004, gate=2.0)
        glock.add('@p A5:q r:q r:h | r:w | r:w | r:w |', S_INTRO)
        glock.add('@p r:w | r:w | r:w | r:h C#6:e D6:e E6:q | r:w | r:w | r:w | r:h A5:e B5:e D6:q |', S_A2)
        glock.add('@mp F#6:q r:q r:h | r:w | r:w | r:w | D6:q r:q r:h | r:w | r:w | r:h. A5:q |', S_A3)
        timp = part('Timpani', 'timp_roll', '', 0, humanize=0.0, gate=1.0)
        timp.add('@pp D3:w | r:w | r:w | r:w |', S_INTRO)
        timp.add('@p< r:w | r:w | r:w | r:w | r:w | r:w | A2:w~ | A2:h. r:q | @f', S_B)
        timp.add('@mf r:w | r:w | r:w | r:w | r:w | r:w | r:h @mp< A2:h | @f D3:h r:h |', S_A3)

    # ---------- strings ----------
    vln2 = part('Violins II', 'vln', '', 0, legato=True, swell=0.05, humanize=0.012, cents=-3)
    vla = part('Violas', 'vla', '', 0, legato=True, swell=0.05, humanize=0.012)
    vc = part('Cellos', 'vc', '', 0, legato=True, swell=0.05, humanize=0.012)
    cb = part('Basses', 'cb', '', 0, legato=True, swell=0.03, humanize=0.012, layers=3)
    soft = '@pp ' if night else '@p '
    vln2.add(soft + pad_text(INTRO, 1), S_INTRO)
    vla.add(soft + pad_text(INTRO, 0), S_INTRO)
    vc.add(soft + bass_text(INTRO, 1), S_INTRO)
    vln2.add(soft + pad_text(A_SEC, 1), S_A)
    vla.add(soft + pad_text(A_SEC, 0), S_A)
    if not night:
        vcp = part('Cellos pizz', 'vc_pizz', '', 0, humanize=0.008)
        vcp.add('"pizz." @mp ' + bass_text(A_SEC, 1, 'pizz'), S_A)
        cbp = part('Basses pizz', 'cb_pizz', '', 0, humanize=0.008)
        cbp.add('"pizz." @mp ' + bass_text(A_SEC, 0, 'pizz'), S_A)
        vln2.add('@p ' + pad_text(A2_SEC, 2), S_A2)
        vla.add('@p ' + pad_text(A2_SEC, 1), S_A2)
        vc.add('@mp ' + bass_text(A2_SEC, 1), S_A2)
        cb.add('@mp ' + bass_text(A2_SEC, 0), S_A2)
        vln2.add('@p ' + pad_text(B_SEC, 2), S_B)
        vla.add('@p< ' + pad_text(B_SEC, 1) + ' @mf', S_B)
        vc.add('@mf< ' + octv(MEL_B, -1) + ' @f', S_B)
        cb.add('@p< ' + bass_text(B_SEC, 0) + ' @mf', S_B)
        vln2.add('@f ' + MEL_A, S_A3)
        vla.add('@mp ' + pad_text(A_SEC, 1), S_A3)
        vc.add('@mf ' + bass_text(A_SEC, 1), S_A3)
        cb.add('@mp ' + bass_text(A_SEC, 0), S_A3)
        vln2.add('@mp> ' + pad_text(LINK, 1) + ' @p', S_LINK)
        vla.add('@mp> ' + pad_text(LINK, 0) + ' @p', S_LINK)
        vc.add('@mp> ' + bass_text(LINK, 1) + ' @p', S_LINK)
        cb.add('@mp> ' + bass_text(LINK, 0) + ' @p', S_LINK)
    else:
        vc.add('@pp ' + bass_text(A_SEC + A2_SEC + B_SEC + A_SEC + LINK, 1), S_A)
        cb.add('@pp ' + bass_text(A2_SEC + B_SEC + A_SEC + LINK, 0), S_A2)
        vln2.add('@pp ' + pad_text(A2_SEC + B_SEC + A_SEC + LINK, 1), S_A2)
        vla.add('@pp ' + pad_text(A2_SEC + B_SEC + A_SEC + LINK, 0), S_A2)
        fl.add('@p r:w | A5:q. B5:e A5:q G5:q |', S_LINK)

    # ---------- tempo with rubato ----------
    if not night:
        tempo = Tempo([[0, 80], [6, 84], [S_A - 2, 84], [S_A, 82], [S_A + 0.5, 84],
                       [S_A2 - 2, 84], [S_A2, 80], [S_A2 + 1, 84],
                       [S_B - 1, 84], [S_B + 1, 85], [S_A3 - 3, 85], [S_A3, 77], [S_A3 + 1, 84],
                       [S_LINK - 2, 84], [S_LINK, 79], [END - 2, 81], [END, 84]])
    else:
        tempo = Tempo([[0, 70], [S_A - 2, 70], [S_A, 68], [S_A + 1, 70], [S_A3 - 2, 70], [S_A3, 66],
                       [S_A3 + 1, 70], [END - 3, 70], [END, 67]])
    return P, tempo, S_A, END


SEATS = {
    'Violins I': 'vln1', 'Violins II': 'vln2', 'Violas': 'vla', 'Cellos': 'vc', 'Cellos pizz': 'vc',
    'Basses': 'cb', 'Basses pizz': 'cb', 'Harp': 'harp', 'Flute': 'fl', 'Oboe': 'ob', 'Clarinet': 'cl',
    'Bassoon': 'bn', 'Horns': 'hn', 'Horns 2': 'hn', 'Glockenspiel': 'glock', 'Timpani': 'timp',
}
