"""A small SFZ sampler for offline rendering.

Reads the SFZ files of an acoustic sample library (made for VSCO 2 CE, which
uses only the basic opcodes: sample, lokey/hikey, pitch_keycenter, lovel/hivel,
volume, tune, ampeg_attack/release, seq_length/seq_position, lorand/hirand,
default_path) and plays notes into float32 stereo buffers.

On top of plain SFZ playback it does what a player would do with the mod
wheel and expression pedal:
  * velocity layers are crossfaded by the note's dynamic (no hard switch),
  * the dynamic curve over the note's life is applied as expression gain and
    a gentle brightness filter (louder = brighter, like a real bow or breath),
  * legato: a note that follows another without a gap skips its own attack
    transient and fades in under the previous note's release,
  * notes longer than their sample loop a crossfaded stretch of the sustain.
"""
import os
import re
from fractions import Fraction

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, butter, sosfilt

SR = 44100


def _read_sfz(path):
    """Parse headers and opcodes (one or more key=value per line; sample and
    default_path values run to the end of the line, they may hold spaces)."""
    regions, glob, group, ctrl = [], {}, {}, {}
    scope, cur = None, None
    for line in open(path, encoding='latin-1'):
        line = line.split('//')[0].strip()
        while line:
            m = re.match(r'<(\w+)>\s*', line)
            if m:
                scope = m.group(1)
                if scope == 'group':
                    group = {}
                if scope == 'region':
                    cur = dict(glob, **group)
                    regions.append(cur)
                line = line[m.end():]
                continue
            m = re.match(r'(\w+)=', line)
            if not m:
                break
            k = m.group(1)
            rest = line[m.end():]
            if k in ('sample', 'default_path'):
                v, line = rest.strip(), ''
            else:
                parts = rest.split(None, 1)
                v, line = parts[0], (parts[1] if len(parts) > 1 else '')
            {'control': ctrl, 'global': glob, 'group': group}.get(scope, cur if cur is not None else {})[k] = v
            if scope == 'region':
                cur[k] = v
    base = ctrl.get('default_path', '').replace('\\', '/')
    out = []
    for d in regions:
        if 'sample' in d:
            d['sample'] = base + d['sample'].replace('\\', '/')
            out.append(d)
    return out


class Instrument:
    """One SFZ instrument from the library."""

    def __init__(self, lib, sfz, gain_db=0.0, release=None, attack=None):
        self.lib = lib
        self.regions = []
        for d in _read_sfz(os.path.join(lib, 'sfz', sfz)):
            self.regions.append(dict(
                sample=os.path.join(lib, d['sample']),
                lokey=int(d.get('lokey', d.get('key', 0))),
                hikey=int(d.get('hikey', d.get('key', 127))),
                center=int(d.get('pitch_keycenter', d.get('key', 60))),
                lovel=int(d.get('lovel', 0)), hivel=int(d.get('hivel', 127)),
                vol=float(d.get('volume', 0)), tune=float(d.get('tune', 0)),
                att=float(d.get('ampeg_attack', 0.001)),
                rel=float(d.get('ampeg_release', 0.3)),
                seql=int(d.get('seq_length', 1)), seqp=int(d.get('seq_position', 1)),
                lorand=float(d.get('lorand', 0)), hirand=float(d.get('hirand', 1)),
            ))
        if not self.regions:
            raise ValueError('no regions in ' + sfz)
        self.gain = 10 ** (gain_db / 20)
        self.release = release
        self.attack = attack
        self.cache = {}
        self.marks = {}
        self.rr = {}

    def _load(self, path):
        if path not in self.cache:
            a, sr = sf.read(path, dtype='float32', always_2d=True)
            if a.shape[1] == 1:
                a = np.repeat(a, 2, axis=1)
            if sr != SR:
                a = resample_poly(a, SR, sr, axis=0).astype(np.float32)
            # the recordings start with up to 0.2 s of room before the note,
            # and bowed sustains swell for up to 2 s: find the onset (5% of
            # the early peak) and the body (65%) so notes can start on time
            # and short or legato notes can begin part way into the swell
            e = np.sqrt(np.convolve(a.mean(1) ** 2, np.ones(441) / 441, 'same'))
            m = e[:int(2.5 * SR)].max() + 1e-9
            on = max(0, int(np.argmax(e > 0.05 * m)) - int(0.004 * SR))
            body = max(on, int(np.argmax(e > 0.65 * m)))
            self.marks[path] = (on, body)
            self.cache[path] = a[on:]
        return self.cache[path]

    def _pitched(self, r, semis):
        key = (r['sample'], round(semis, 3))
        if key in self.cache:
            return self.cache[key]
        a = self._load(r['sample'])
        if abs(semis) > 1e-4:
            ratio = Fraction(2 ** (-semis / 12)).limit_denominator(600)
            a = resample_poly(a, ratio.numerator, ratio.denominator, axis=0).astype(np.float32)
        self.cache[key] = a
        return a

    def layers(self, key, vel, rng):
        """Regions for this key: the layer the velocity falls in and its
        neighbour, with crossfade weights (mod-wheel style)."""
        cand = [r for r in self.regions if r['lokey'] <= key <= r['hikey']]
        if not cand:
            # out of range: take the nearest key range (instrument is stretched)
            near = min(self.regions, key=lambda r: min(abs(r['lokey'] - key), abs(r['hikey'] - key)))
            cand = [r for r in self.regions if r['lokey'] == near['lokey'] and r['hikey'] == near['hikey']]
        # round robin / random groups
        roll = rng.random()
        c2 = [r for r in cand if r['lorand'] <= roll < r['hirand'] or (roll >= 1 and r['hirand'] >= 1)]
        cand = c2 or cand
        seqs = {r['seql'] for r in cand}
        if max(seqs) > 1:
            # round robin picked by the note's own random stream, so a loop
            # rendered twice comes out the same both times
            p = int(rng.random() * max(seqs)) % max(seqs) + 1
            c2 = [r for r in cand if r['seqp'] == p]
            cand = c2 or cand
        bands = sorted({(r['lovel'], r['hivel']) for r in cand})
        if len(bands) == 1:
            return [(1.0, [r for r in cand if (r['lovel'], r['hivel']) == bands[0]][0])]
        mids = [(lo + hi) / 2 for lo, hi in bands]
        if vel <= mids[0]:
            pick = [(1.0, 0)]
        elif vel >= mids[-1]:
            pick = [(1.0, len(bands) - 1)]
        else:
            i = max(j for j in range(len(mids)) if mids[j] <= vel)
            t = (vel - mids[i]) / (mids[i + 1] - mids[i])
            pick = [(1 - t, i), (t, i + 1)]
        out = []
        for w, i in pick:
            rs = [r for r in cand if (r['lovel'], r['hivel']) == bands[i]]
            out.append((w, rs[int(rng.random() * len(rs)) % len(rs)]))
        return out

    def note(self, key, dur, dyn, rng, legato=False, cents=0.0, rel=None, skip=0.0):
        """Render one note. key: MIDI key; dur: seconds until note-off;
        dyn: function t -> 0..1 (dynamic at time t since note-on, seconds).
        skip: 0..1, how far into the sample's swell the note starts (0 = the
        natural attack, 1 = at its body; legato notes always start at 1).
        Returns a stereo buffer (note-on at sample 0)."""
        d0 = float(dyn(0.0))
        vel = 20 + 105 * d0
        rel = rel if rel is not None else (self.release if self.release is not None else None)
        out = None
        for w, r in self.layers(key, vel, rng):
            if w < 0.02:
                continue
            semis = key - r['center'] + (r['tune'] + cents) / 100
            a = self._pitched(r, semis)
            rl = rel if rel is not None else r['rel']
            self._load(r['sample'])
            on, body = self.marks[r['sample']]
            ratio = 2 ** (-semis / 12)            # resampling stretched the times
            sk = 1.0 if legato else skip
            start = min(int((body - on) * ratio * sk), len(a) // 3)
            n_on = int(dur * SR)
            n_rel = int(rl * SR)
            need = n_on + n_rel
            src = a[start:]
            if len(src) < need:
                src = _stretch(src, need)
            buf = src[:need].copy()
            env = np.ones(need, np.float32)
            att = self.attack if self.attack is not None else r['att']
            if legato:
                att = max(att, 0.09)
            elif start > 0:
                att = max(att, 0.03 + 0.05 * sk)    # no click when starting inside the note
            na = min(int(att * SR), need)
            if na > 1:
                env[:na] = np.linspace(0, 1, na) ** (0.7 if legato else 1)
            if n_rel > 1 and n_on < need:
                env[n_on:] *= np.exp(-np.linspace(0, 6.5, need - n_on))
            g = w * 10 ** (r['vol'] / 20) * self.gain
            buf *= (env * g)[:, None]
            out = buf if out is None else _add(out, buf)
        if out is None:
            return np.zeros((1, 2), np.float32)
        # expression over the note: gain follows the dynamic relative to its
        # onset (the layer already carries the onset dynamic), plus brightness
        n = len(out)
        t = np.arange(0, n, 256) / SR
        dv = np.array([dyn(x) for x in t])
        # SFZ velocity tracking + expression: loudness follows the dynamic
        # (the region volumes level the layers, the dynamic sets the level)
        rel_gain = _amp(dv)
        gcurve = np.interp(np.arange(n), np.arange(0, n, 256), rel_gain).astype(np.float32)
        out *= gcurve[:, None]
        return out


def _amp(d):
    # dynamic 0..1 -> amplitude, 30 dB per unit (pp to ff is about 20 dB)
    return 10 ** ((np.asarray(d) - 0.75) * 30 / 20)


def _add(a, b):
    if len(a) < len(b):
        a, b = b, a
    a = a.copy()
    a[:len(b)] += b
    return a


def _stretch(src, need):
    """Loop the sustain of a sample with equal-power crossfades until it is
    `need` samples long (only for notes longer than the recording)."""
    n = len(src)
    if n < SR // 2:
        return np.concatenate([src, np.zeros((need - n, 2), np.float32)])
    ls, le = int(n * 0.35), int(n * 0.85)
    seg = src[ls:le]
    xf = min(int(0.25 * SR), len(seg) // 3)
    out = [src[:le - xf]]
    tail = src[le - xf:le]
    fade = np.linspace(0, np.pi / 2, xf)[:, None]
    total = le - xf
    while total < need:
        head = seg[:xf]
        mixed = tail * np.cos(fade) + head * np.sin(fade)
        body = seg[xf:len(seg) - xf]
        out += [mixed.astype(np.float32), body]
        tail = seg[len(seg) - xf:]
        total += len(mixed) + len(body)
    out.append(tail)
    return np.concatenate(out)


def lowpass(x, hz, order=2):
    sos = butter(order, hz / (SR / 2), 'low', output='sos')
    return sosfilt(sos, x, axis=0).astype(np.float32)


def highpass(x, hz, order=2):
    sos = butter(order, hz / (SR / 2), 'high', output='sos')
    return sosfilt(sos, x, axis=0).astype(np.float32)
