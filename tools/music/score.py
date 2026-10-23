"""Score notation for the soundtrack: a compact text format for each part,
a tempo map with rubato, and export to MusicXML (music21) so the score can be
opened and edited in MuseScore or engraved with LilyPond.

Part text, tokens separated by spaces:
  F#4:q.      a note (pitch, then w h q e s t for whole..sixteenth / triplet
              eighth; a trailing '.' dots it; a number is beats: D4:3)
  D4,F#4:h    a chord
  r:q         a rest
  A4:h~       tied into the next note of the same pitch
  @mp         a dynamic (pp p mp mf f ff); '@p<' or '@f>' ramps to the next one
  |           a barline (checked against the time signature)
"""
import re

DUR = {'w': 4.0, 'h': 2.0, 'q': 1.0, 'e': 0.5, 's': 0.25, 't': 1 / 3}
DYN = {'ppp': .1, 'pp': .2, 'p': .32, 'mp': .45, 'mf': .58, 'f': .72, 'ff': .85}
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi(p):
    m = re.fullmatch(r'([A-G])(#{1,2}|b{1,2})?(-?\d)', p)
    if not m:
        raise ValueError('bad pitch ' + p)
    acc = m.group(2) or ''
    return 12 * (int(m.group(3)) + 1) + PC[m.group(1)] + acc.count('#') - acc.count('b')


class Part:
    def __init__(self, name, patch, text='', start=0.0, beats_per_bar=4, transpose=0, **perf):
        self.name = name
        self.patch = patch           # instrument key in the orchestra
        self.notes = []              # [beat, dur, [keys], spelled pitches]
        self.dyn = []                # [beat, level, ramp]
        self.bpb = beats_per_bar
        self.transpose = transpose
        self.perf = perf             # pan, width, depth, humanize, legato...
        self.marks = []              # [beat, text] (pizz., arco, solo...)
        if text:
            self.add(text, start)

    def add(self, text, start=0.0):
        b = start
        bar_start = start
        pending_tie = {}
        for tok in text.split():
            if tok == '|':
                if abs((b - bar_start) - self.bpb) > 1e-6 and abs(b - bar_start) > 1e-6:
                    raise ValueError('%s: bar at beat %.2f has %.3f beats' % (self.name, bar_start, b - bar_start))
                bar_start = b
                continue
            if tok.startswith('@'):
                m = re.fullmatch(r'@(\w+)([<>]?)', tok)
                self.dyn.append([b, DYN[m.group(1)], bool(m.group(2))])
                continue
            if tok.startswith('"'):
                self.marks.append([b, tok.strip('"').replace('_', ' ')])
                continue
            m = re.fullmatch(r'([^:]+):([whqest]|\d+(?:\.\d+)?)(\.?)(~?)', tok)
            if not m:
                raise ValueError('%s: bad token %s' % (self.name, tok))
            d = DUR[m.group(2)] if m.group(2) in DUR else float(m.group(2))
            if m.group(3):
                d *= 1.5
            tie = bool(m.group(4))
            if m.group(1) != 'r':
                ps = m.group(1).split(',')
                keys = [midi(p) + self.transpose for p in ps]
                key = tuple(keys)
                if key in pending_tie:
                    self.notes[pending_tie.pop(key)][1] += d
                    idx = len(self.notes) - 1
                else:
                    self.notes.append([b, d, keys, ps])
                    idx = len(self.notes) - 1
                if tie:
                    pending_tie[key] = idx
            b += d
        self.end = b
        return self

    def level(self, beat):
        """Dynamic level 0..1 at a beat (ramps are linear between marks)."""
        if not self.dyn:
            return DYN['mp']
        pts = sorted(self.dyn)
        prev = pts[0]
        for i, p in enumerate(pts):
            if p[0] <= beat:
                prev = p
                nxt = pts[i + 1] if i + 1 < len(pts) else None
            else:
                break
        if beat < pts[0][0]:
            return pts[0][1]
        if prev[2] and nxt is not None:
            t = (beat - prev[0]) / max(nxt[0] - prev[0], 1e-6)
            return prev[1] + (nxt[1] - prev[1]) * min(max(t, 0), 1)
        return prev[1]


class Tempo:
    """Tempo map: points [beat, bpm]; between points the tempo moves smoothly
    (cosine) so a ritardando or a stretto never jumps."""

    def __init__(self, points):
        self.pts = sorted(points)

    def bpm(self, beat):
        pts = self.pts
        if beat <= pts[0][0]:
            return pts[0][1]
        for (b0, t0), (b1, t1) in zip(pts, pts[1:]):
            if b0 <= beat < b1:
                if t0 == t1:
                    return t0
                import math
                x = (beat - b0) / (b1 - b0)
                return t0 + (t1 - t0) * (1 - math.cos(math.pi * x)) / 2
        return pts[-1][1]

    def sec(self, beat, step=1 / 64):
        # integrate 60/bpm; cached on a grid
        if not hasattr(self, '_grid'):
            self._grid = [0.0]
        n = int(beat / step)
        while len(self._grid) <= n + 1:
            k = len(self._grid) - 1
            self._grid.append(self._grid[-1] + step * 60.0 / self.bpm((k + 0.5) * step))
        frac = beat / step - n
        return self._grid[n] + frac * (self._grid[n + 1] - self._grid[n])


# ---------- MusicXML export (via music21) ----------

def to_musicxml(title, parts, path, bpb=4, tempo=84, key_sharps=2, composer='Original score'):
    from music21 import stream, note, chord, meter, key as mkey, tempo as mtempo, dynamics, metadata, expressions, instrument as minst
    sc = stream.Score()
    sc.metadata = metadata.Metadata()
    sc.metadata.title = title
    sc.metadata.composer = composer
    inames = {}
    for p in parts:
        st = stream.Part()
        st.partName = p.name
        ins = minst.Instrument()
        ins.partName = p.name
        st.insert(0, ins)
        st.insert(0, meter.TimeSignature('%d/4' % bpb))
        st.insert(0, mkey.KeySignature(key_sharps))
        if not inames:
            st.insert(0, mtempo.MetronomeMark(number=tempo))
        inames[p.name] = 1
        seen = set()
        for b, d, keys, ps in p.notes:
            ql = d
            if len(keys) == 1:
                n = note.Note(keys[0], quarterLength=ql)
                n.pitch.spellingIsInferred = False
                n.pitch.name = ps[0][:-1].replace('b', '-') if len(ps) == 1 and p.transpose == 0 else n.pitch.name
            else:
                n = chord.Chord(keys, quarterLength=ql)
            st.insert(b, n)
        for b, lvl, ramp in p.dyn:
            name = min(DYN, key=lambda k: abs(DYN[k] - lvl))
            if (b, name) in seen:
                continue
            seen.add((b, name))
            st.insert(b, dynamics.Dynamic(name))
        for b, txt in p.marks:
            st.insert(b, expressions.TextExpression(txt))
        end = max([b + d for b, d, _, _ in p.notes] + [0])
        st.makeRests(fillGaps=True, inPlace=True, timeRangeFromBarDuration=False)
        sc.insert(0, st)
    sc = sc.makeNotation()
    sc.write('musicxml', fp=path)
    return path
