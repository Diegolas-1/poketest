"""Professor Oak's Lab: "Curious Minds" (original composition).

G major, 100 bpm, 4/4: warm and a little scientific. Pizzicato strings tick
like a lab clock, staccato woodwinds poke around, a flute sings the middle
section, glockenspiel and marimba sparkle like glassware.

Form (bars): A 1-8 (staccato clarinet over pizzicato) | B 9-16 (flute song,
bassoon walking, soft horns and arco strings) | A' 17-24 (oboe and marimba,
violins pizz) | Link 25-28 (bassoon and flute lead back). The whole piece
loops.
"""
from score import Part, Tempo
from pallet_town import octv

BPB = 4

CH = {
    'G':     ('G2', ['B3', 'D4', 'G4']),
    'Em':    ('E2', ['B3', 'E4', 'G4']),
    'C':     ('C3', ['C4', 'E4', 'G4']),
    'D':     ('D2', ['A3', 'D4', 'F#4']),
    'Bm/F#': ('F#2', ['B3', 'D4', 'F#4']),
    'Bm':    ('B1', ['B3', 'D4', 'F#4']),
    'Am7':   ('A2', ['C4', 'E4', 'G4']),
    'D7':    ('D2', ['A3', 'C4', 'F#4']),
    'G/B':   ('B1', ['B3', 'D4', 'G4']),
}
A_SEC = ['G', 'G', 'Em', 'Em', 'C', 'C', 'D', 'D', 'G', 'G', 'Bm/F#', 'Bm/F#', 'Am7', 'Am7', 'D7', 'D7']
B_SEC = ['C', 'C', 'D', 'D', 'Bm', 'Bm', 'Em', 'Em', 'Am7', 'Am7', 'D', 'D', 'G/B', 'C', 'D7', 'D7']
LINK = ['Am7', 'Am7', 'D7', 'D7', 'G', 'G', 'D7', 'D7']

MEL_A = """D5:e B4:e G4:e B4:e D5:q C#5:e D5:e | E5:e D5:e B4:e G4:e E4:q r:q |
E4:e G4:e C5:e E5:e D5:e C5:e B4:e A4:e | F#4:q A4:q D5:q r:q |
D5:e B4:e G4:e B4:e D5:q C#5:e D5:e | F#5:e E5:e D5:e B4:e F#4:q r:q |
G4:e A4:e C5:e E5:e G5:e F#5:e E5:e C5:e | D5:q C5:e A4:e F#4:q D4:q |"""
MEL_B = """E5:h G5:q F#5:q | F#5:q E5:q D5:h | D5:q. C#5:e B4:q D5:q | E5:h. r:q |
C5:q E5:q A5:q G5:q | F#5:q. E5:e D5:q C5:q | B4:q D5:q E5:q G5:q | F#5:h E5:q C5:q |"""

from pallet_town import name, key  # noqa: E402


def bass(harm, octave=0):
    """Pizzicato bass: root on 1, root or fifth on 3."""
    out = []
    for i in range(0, len(harm), 2):
        a, b = harm[i], harm[i + 1]
        r1 = key(CH[a][0]) + 12 * octave
        r2 = key(CH[b][0]) + 12 * octave + (7 if a == b else 0)
        if a == b and r2 - 12 >= key(CH[a][0]) + 12 * octave - 5:
            r2 -= 12     # the fifth below sits better
        out.append('%s:q r:q %s:q r:q |' % (name(r1), name(r2)))
    return ' '.join(out)


def offbeat(harm, voice):
    """Tick-tock: chord tones on beats 2 and 4."""
    out = []
    for i in range(0, len(harm), 2):
        a, b = harm[i], harm[i + 1]
        out.append('r:q %s:q r:q %s:q |' % (CH[a][1][voice], CH[b][1][voice]))
    return ' '.join(out)


def chords_on_offbeats(harm):
    out = []
    for i in range(0, len(harm), 2):
        a, b = harm[i], harm[i + 1]
        out.append('r:q %s:q r:q %s:q |' % (','.join(CH[a][1]), ','.join(CH[b][1])))
    return ' '.join(out)


def pad(harm, voice):
    out = []
    for i in range(0, len(harm), 2):
        a, b = CH[harm[i]][1][voice], CH[harm[i + 1]][1][voice]
        out.append(('%s:w |' % a) if a == b else ('%s:h %s:h |' % (a, b)))
    return ' '.join(out)


def harp_quarters(harm):
    out = []
    for i in range(0, len(harm), 2):
        bar = []
        for h in (harm[i], harm[i + 1]):
            b = key(CH[h][0]) + 12
            v = [key(x) for x in CH[h][1]]
            bar += ['%s:e' % name(x) for x in (b, v[0], v[1], v[2])]
        out.append(' '.join(bar) + ' |')
    return ' '.join(out)


def build():
    SA, SB, SA2, SL, END = 0, 32, 64, 96, 112
    P = []

    def part(n, patch, text='', start=0, **perf):
        P.append(Part(n, patch, text, start, BPB, **perf))
        return P[-1]

    ALL = A_SEC + B_SEC + A_SEC + LINK

    cl = part('Clarinet', 'cl_stac', humanize=0.006, gate=0.8)
    cl.add('"stacc." @mp ' + MEL_A, SA)
    cl.add('@mp r:w | r:w | r:w | D5:e C#5:e D5:e E5:e F#5:e G5:e A5:e F#5:e |', SL)
    cll = part('Clarinet legato', 'cl', legato=True, humanize=0.008, swell=0.04)
    cll.add('@p r:w | r:w | r:w | r:w | A4:h C5:h | D5:h A4:h | G4:h G4:h | A4:h F#4:h |', SB)

    fl = part('Flute', 'fl', legato=True, humanize=0.008, swell=0.05)
    fl.add('@f ' + MEL_B, SB)
    fl.add('@p r:h E5:e F#5:e G5:q | r:h F#5:e G5:e A5:q | B5:h. r:q | r:w |', SL)
    fls = part('Flute stacc', 'fl_stac', humanize=0.006)
    fls.add('@p r:w | r:w | r:w | r:h. D6:e B5:e | r:w | r:w | r:w | r:h. A5:e D6:e |', SA2)

    ob = part('Oboe', 'ob_stac', humanize=0.006, gate=0.8)
    ob.add('"stacc." @mp ' + MEL_A, SA2)
    mar = part('Marimba', 'marimba', humanize=0.005, gate=1.5)
    mar.add('@p ' + octv(MEL_A, -1), SA2)

    bn = part('Bassoon', 'bn_stac', humanize=0.006)
    bn.add('@p r:w | r:h G2:e A2:e B2:q | r:w | r:h D3:e E3:e F#3:q | r:w | r:h F#2:e G2:e A2:q | r:w | r:h D3:e C3:e A2:q |', SA)
    bn.add('@p C3:q E3:q G3:q E3:q | D3:q F#3:q A3:q F#3:q | B2:q D3:q F#3:q D3:q | E3:q G3:q B3:q G3:q | '
           'A2:q C3:q E3:q C3:q | D3:q F#3:q A3:q C4:q | B2:q D3:q C3:q E3:q | D3:q F#3:q A3:q C4:q |', SB)
    bn.add('@p r:w | r:h G2:e A2:e B2:q | r:w | r:h D3:e E3:e F#3:q | r:w | r:h F#2:e G2:e A2:q | r:w | r:h D3:e C3:e A2:q |', SA2)
    bn.add('@mp A2:e C3:e E3:e G3:e A3:q r:q | D3:e F#3:e A3:e C4:e D4:q r:q | G3:e F#3:e E3:e D3:e B2:q G2:q | D3:q E3:e F#3:e A3:q C4:q |', SL)

    hn = part('Horns', 'hn', humanize=0.012, swell=0.06)
    hn.add('@pp< r:w | r:w | r:w | r:w | ' + pad(B_SEC[8:], 2) + ' @p', SB)
    hn2 = part('Horns 2', 'hn', humanize=0.012, swell=0.06, cents=-4)
    hn2.add('@pp< r:w | r:w | r:w | r:w | ' + pad(B_SEC[8:], 1) + ' @p', SB)

    glock = part('Glockenspiel', 'glock', humanize=0.004, gate=2.0)
    glock.add('@mp r:w | r:w | r:w | r:h. D6:e A5:e | r:w | r:w | r:w | r:h F#5:e A5:e C6:e D6:e |', SA)
    glock.add('@p G5:q r:q r:h | r:w | B5:q r:q r:h | r:w | C6:q r:q r:h | r:w | B5:q r:q r:h | r:w |', SB)
    glock.add('@p r:w | r:w | B5:q r:q D6:q r:q | r:w |', SL)

    harp = part('Harp', 'harp', humanize=0.006, gate=1.4)
    harp.add('@pp ' + harp_quarters(B_SEC), SB)
    harp.add('@pp ' + harp_quarters(LINK), SL)

    # strings
    vcp = part('Cellos pizz', 'vc_pizz', humanize=0.006)
    cbp = part('Basses pizz', 'cb_pizz', humanize=0.006)
    v2p = part('Violins II pizz', 'vln_pizz', humanize=0.007)
    vlp = part('Violas pizz', 'vla_pizz', humanize=0.007)
    v1p = part('Violins I pizz', 'vln_pizz', humanize=0.006)
    vcp.add('"pizz." @mp ' + bass(ALL, 1), SA)
    cbp.add('"pizz." @mp ' + bass(ALL, 0), SA)
    v2p.add('"pizz." @p ' + offbeat(A_SEC, 2), SA)
    vlp.add('"pizz." @p ' + offbeat(A_SEC, 0) , SA)
    v2p.add('@p ' + offbeat(A_SEC + LINK, 2), SA2)
    vlp.add('@p ' + offbeat(A_SEC + LINK, 0), SA2)
    v1p.add('"pizz." @pp ' + MEL_A, SA2)
    v2 = part('Violins II', 'vln', legato=True, humanize=0.012, swell=0.05, cents=-3)
    va = part('Violas', 'vla', legato=True, humanize=0.012, swell=0.05)
    v2.add('"arco" @ppp< ' + pad(B_SEC, 2) + ' @pp', SB)
    va.add('"arco" @pp< ' + pad(B_SEC, 1) + ' @p', SB)

    tempo = Tempo([[0, 100], [SB - 2, 100], [SB, 96], [SB + 1, 100], [SA2 - 2, 100], [SA2, 97], [SA2 + 1, 100],
                   [END - 2, 100], [END, 97]])
    return P, tempo, 0, END


SEATS = {
    'Clarinet': 'cl', 'Clarinet legato': 'cl', 'Flute': 'fl', 'Flute stacc': 'fl', 'Oboe': 'ob',
    'Marimba': 'marimba', 'Bassoon': 'bn', 'Horns': 'hn', 'Horns 2': 'hn', 'Glockenspiel': 'glock',
    'Harp': 'harp', 'Cellos pizz': 'vc', 'Basses pizz': 'cb', 'Violins II pizz': 'vln2', 'Violas pizz': 'vla',
    'Violins I pizz': 'vln1', 'Violins II': 'vln2', 'Violas': 'vla',
}
