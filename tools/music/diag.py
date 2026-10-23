"""Mix check: level of each part per section (dB RMS of its placed stem),
so a melody can be checked against the parts around it without ears."""
import sys
import numpy as np
import render
from sfz import SR


def report(P, tempo, ls, le, seats, sections, name='piece'):
    info = render.render_piece(name, P, tempo, ls, le, '/tmp/claude-0/music-work', seats)
    st = info['stems']
    print('%-14s' % 'part' + ''.join('%8s' % s for s, _, _ in sections))
    for k, x in st.items():
        row = []
        for s, b0, b1 in sections:
            a, b = int(tempo.sec(b0) * SR), int(tempo.sec(b1) * SR)
            r = np.sqrt(np.mean(x[a:b] ** 2) + 1e-12)
            row.append('%8.1f' % (20 * np.log10(r)))
        print('%-14s' % k[:14] + ''.join(row))
    return info
