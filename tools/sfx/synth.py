# Original sounds made from scratch for the SFX library (tools/sfx/build.py):
# interface sounds, dialogue blips, chimes and stingers, machines, wind,
# bells, creature chirps, whooshes and the capture-ball mechanism. Nothing
# here imitates a game's sounds; the stingers are short new figures.
import numpy as np
from scipy import signal
from pedalboard import Pedalboard, Reverb, Compressor, Chorus
import dsp
from dsp import SR

rng = np.random.default_rng(7)


def t_(d): return np.arange(int(d * SR)) / SR


def adsr(n, a=0.005, d=0.05, s=0.6, r=0.1):
    e = np.zeros(n, dtype=np.float32)
    A = int(a * SR); D = int(d * SR); R = int(r * SR)
    S = max(0, n - A - D - R)
    i = 0
    e[i:i + A] = np.linspace(0, 1, A); i += A
    e[i:i + D] = np.linspace(1, s, D); i += D
    e[i:i + S] = s; i += S
    e[i:i + R] = np.linspace(s, 0, len(e[i:i + R]))
    return e


def expdec(n, tau):
    return np.exp(-np.arange(n) / (tau * SR)).astype(np.float32)


def osc(freq, d, wave='sine', phase=0.0):
    """freq may be an array (sweeps); band-limited by summing harmonics."""
    n = int(d * SR)
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,)) if np.ndim(freq) else np.full(n, float(freq))
    ph = 2 * np.pi * np.cumsum(f) / SR + phase
    if wave == 'sine': return np.sin(ph).astype(np.float32)
    out = np.zeros(n)
    nyq = SR / 2
    for k in range(1, 40):
        if k * f.max() > nyq * 0.9: break
        if wave == 'square' and k % 2 == 0: continue
        if wave == 'tri' and k % 2 == 0: continue
        amp = (1 / k) if wave in ('saw', 'square') else ((-1) ** ((k - 1) // 2)) / k ** 2
        out += amp * np.sin(k * ph)
    return (out / np.abs(out).max()).astype(np.float32)


def noise(d, color='white', seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    n = int(d * SR)
    w = r.standard_normal(n).astype(np.float32)
    if color == 'white': return w * 0.3
    if color == 'pink':
        b, a = [0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400]
        return (signal.lfilter(b, a, w) * 3).astype(np.float32)
    if color == 'brown':
        y = np.cumsum(w) * 0.02
        y = signal.lfilter([1, -1], [1, -0.995], y)
        return (y / (np.abs(y).max() + 1e-9) * 0.8).astype(np.float32)


def verb(x, room=0.3, wet=0.2, damp=0.5, width=1.0, tail=1.0):
    x = dsp.pad(dsp.stereo(x), tail)
    pb = Pedalboard([Reverb(room_size=room, wet_level=wet, dry_level=1.0 - wet * 0.5, damping=damp, width=width)])
    return pb(x.T.copy(), SR).T.astype(np.float32)


def bell_tone(f, d, parts=((1, 1, 1.0), (2.76, .5, .6), (5.4, .25, .35), (8.93, .12, .2)), strike=0.002, seed=0):
    """Additive metal bar / bell: (ratio, amplitude, decay x) partials."""
    n = int(d * SR)
    out = np.zeros(n, dtype=np.float32)
    r = np.random.default_rng(seed)
    for ratio, amp, dk in parts:
        ff = f * ratio * (1 + r.uniform(-0.002, 0.002))
        out += amp * osc(ff, d, 'sine', r.uniform(0, 6.28)) * expdec(n, d * dk * 0.35)
    a = int(strike * SR)
    out[:a] *= np.linspace(0, 1, a)
    return dsp.fade(out, 0.0, min(0.08, d / 4))


def marimba(f, d=0.6):
    n = int(d * SR)
    x = osc(f, d) * expdec(n, 0.18) + 0.35 * osc(f * 4.0, d) * expdec(n, 0.04) + 0.15 * osc(f * 9.9, d) * expdec(n, 0.012)
    x[:int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return dsp.fade(x.astype(np.float32), 0.0, 0.06)


def pluck(f, d=0.4, bright=0.6):
    """Karplus-Strong string."""
    n = int(d * SR)
    p = int(SR / f)
    buf = rng.uniform(-1, 1, p).astype(np.float32)
    buf = dsp.lp(buf, 2000 + 8000 * bright)
    out = np.zeros(n, dtype=np.float32)
    for i in range(n):
        v = buf[i % p]
        out[i] = v
        buf[i % p] = 0.5 * (v + buf[(i + 1) % p]) * 0.996
    return out


def m2f(m): return 440.0 * 2 ** ((m - 69) / 12)


# ---------------- UI ----------------
def ui_click(f=2400, d=0.03, body=0.0):
    n = int(d * SR)
    x = noise(d, 'white') * expdec(n, 0.0025)
    x = dsp.bp(x, f * 0.7, min(f * 1.6, 18000))
    x += 0.5 * osc(f, d) * expdec(n, 0.006)
    if body: x += body * osc(f / 4, d) * expdec(n, 0.01)
    return dsp.fade(x, 0.0005, 0.005)


def ui_chime(notes, step=0.07, dur=0.35, wave='sine', bright=0.3, room=0.15):
    parts = []
    for i, m in enumerate(notes):
        f = m2f(m)
        d = dur
        n = int(d * SR)
        x = osc(f, d, 'sine') * expdec(n, d * 0.35) + bright * osc(f * 2, d) * expdec(n, d * 0.12) + 0.08 * osc(f * 3, d) * expdec(n, d * 0.06)
        x[:int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))
        parts.append((dsp.fade(x, 0.0, 0.05), i * step))
    y = dsp.mix(*[p for p, _ in parts], at=[o for _, o in parts])
    return dsp.trim(verb(y, room, 0.12, tail=0.4), -50, 0, 0.05)


def blip(f, d=0.05, wave='square', formant=None, seed=0):
    """Dialogue text blip: a soft square through a gentle low-pass, quick envelope."""
    r = np.random.default_rng(seed)
    n = int(d * SR)
    fr = f * (1 + np.linspace(0.04, -0.03, n) * r.uniform(0.5, 1.5))
    x = osc(fr, d, wave)
    x = dsp.lp(x, formant or f * 5)
    e = adsr(n, 0.003, 0.012, 0.55, d * 0.45)
    return dsp.fade(x * e, 0.001, 0.008)


def stinger_item():
    """A short bright 'you got it' figure: marimba arpeggio up to a held major chord with a bell on top."""
    seq = [72, 76, 79, 84]
    parts = [(marimba(m2f(m), 0.5) * 0.7, i * 0.085) for i, m in enumerate(seq)]
    chord = sum(osc(m2f(m), 1.3, 'tri') * 0.18 for m in (72, 76, 79))
    chord = dsp.lp(chord, 3500) * adsr(len(chord), 0.03, 0.2, 0.6, 0.7)
    parts.append((chord, 0.34))
    parts.append((bell_tone(m2f(91), 1.4) * 0.35, 0.34))
    parts.append((bell_tone(m2f(96), 1.2, seed=3) * 0.18, 0.5))
    y = dsp.mix(*[p for p, _ in parts], at=[o for _, o in parts])
    return verb(y, 0.35, 0.18, tail=0.6)


def save_sound():
    seq = [79, 84, 88, 91, 96]
    parts = [(bell_tone(m2f(m), 0.7, seed=i) * (0.5 - i * 0.05), i * 0.05) for i, m in enumerate(seq)]
    sw = noise(0.6, 'white') * adsr(int(0.6 * SR), 0.2, 0.1, 0.3, 0.3)
    sw = dsp.bp(sw, 4000, 12000) * 0.25
    parts.append((sw, 0.0))
    y = dsp.mix(*[p for p, _ in parts], at=[o for _, o in parts])
    return verb(y, 0.4, 0.2, tail=0.5)


def error_buzz(f=160, d=0.11, gap=0.05, n=2):
    one = dsp.lp(osc(f, d, 'square'), 1800) * adsr(int(d * SR), 0.004, 0.02, 0.8, 0.03)
    return dsp.mix(*[one] * n, at=[i * (d + gap) for i in range(n)])


# ---------------- machines (loops) ----------------
def loop_tone(freqs, amps, L):
    """Tones with a whole number of cycles in L s, so they loop on their own."""
    t = t_(L)
    out = np.zeros(len(t), dtype=np.float32)
    for f, a in zip(freqs, amps):
        fq = round(f * L) / L
        out += a * np.sin(2 * np.pi * fq * t).astype(np.float32)
    return out


def machine_hum(L=8.0, seed=1):
    t = t_(L)
    hum = loop_tone([60, 120, 180, 240, 300, 420], [1, .55, .3, .22, .1, .05], L)
    # a slow beat from a slightly detuned second motor (whole cycles of the beat too)
    hum += 0.4 * loop_tone([121.5, 243.0], [1, 0.4], L)
    wob = 1 + 0.12 * np.sin(2 * np.pi * (round(0.25 * L) / L) * t)
    hum *= wob.astype(np.float32)
    nz = dsp.seam_loop(dsp.bp(noise(L + 2, 'pink', seed), 200, 2500), L, 1.5) * 0.25
    whine = loop_tone([2400, 3150], [0.025, 0.012], L)
    x = hum * 0.5 + nz + whine
    return dsp.stereo(x) * np.array([1.0, 0.97], dtype=np.float32)


def light_buzz(L=4.0):
    x = loop_tone([120, 240, 360, 480, 600, 720, 840, 960, 1200, 1440], [1, .7, .55, .45, .3, .25, .2, .15, .1, .06], L)
    x = np.tanh(x * 1.5) * 0.4
    nz = dsp.seam_loop(dsp.hp(noise(L + 1, 'white', 3), 3000) * 0.04, L, 0.5)
    return (x + nz).astype(np.float32)


def vent_loop(L=10.0, seed=4):
    n1 = dsp.seam_loop(dsp.lp(noise(L + 3, 'pink', seed), 1800), L, 2.0)
    n2 = dsp.seam_loop(dsp.lp(noise(L + 3, 'pink', seed + 9), 1800), L, 2.0)
    tone = loop_tone([95, 190, 285], [0.08, 0.05, 0.02], L)
    t = t_(L)
    mod = 1 + 0.08 * np.sin(2 * np.pi * (round(0.3 * L) / L) * t)
    l = (n1 * mod + tone) * 0.6
    r = (n2 * mod + tone) * 0.6
    return np.stack([l, r], axis=1).astype(np.float32)


def pc_beep(f, d=0.07):
    x = dsp.lp(osc(f, d, 'square'), 5000) * adsr(int(d * SR), 0.002, 0.01, 0.8, 0.015)
    return x * 0.6


def pc_boot():
    d = 2.2
    n = int(d * SR)
    t = t_(d)
    # drive spin-up whir
    f = 80 + 520 * (1 - np.exp(-t / 0.6))
    whir = osc(f, d, 'saw') * 0.12
    whir = dsp.lp(whir, 1500) * adsr(n, 0.15, 0.5, 0.5, 0.6)
    clicks = [dsp.bp(noise(0.03, 'white', s), 1500, 6000) * expdec(int(0.03 * SR), 0.004) for s in range(5)]
    beeps = [pc_beep(m2f(m), 0.09) for m in (84, 88, 91)]
    chime = ui_chime([72, 79, 84, 88], 0.06, 0.6, room=0.3)
    return dsp.mix(whir, *clicks, *beeps, chime, at=[0, .45, .58, .66, .93, 1.0, 1.25, 1.36, 1.47, 1.6])


# ---------------- air ----------------
def wind(L=20.0, strength=0.4, seed=10):
    """Wind as moving air through a slowly wandering band-pass, with gusts; stereo."""
    tot = L + 3
    n = int(tot * SR)
    r = np.random.default_rng(seed)
    ch = []
    for c in range(2):
        w = noise(tot, 'pink', seed + c * 31)
        # gust envelope from smoothed noise
        g = signal.resample(r.standard_normal(int(tot * 2)), n)
        g = (g - g.min()) / (g.max() - g.min())
        gust = 0.35 + 0.65 * g ** (1.5 - strength)
        lo = dsp.lp(w, 300 + 500 * strength) * 0.8
        # a whistle band that wanders
        fc = 500 + 900 * g
        band = np.zeros(n, dtype=np.float32)
        blk = 2048
        for i in range(0, n, blk):
            f0 = fc[i]
            sos = signal.butter(2, [max(80, f0 * 0.7) / (SR / 2), min(f0 * 1.4, SR / 2 - 100) / (SR / 2)], 'bandpass', output='sos')
            band[i:i + blk] = signal.sosfilt(sos, w[i:i + blk])
        x = (lo + band * (0.4 + strength)) * gust
        ch.append(x)
    st = np.stack(ch, axis=1).astype(np.float32)
    return dsp.seam_loop(st, L, 2.5)


def whoosh(d=0.35, f0=600, f1=3500, seed=0, q=1.6):
    n = int(d * SR)
    w = noise(d + 0.05, 'pink', seed)[:n]
    out = np.zeros(n, dtype=np.float32)
    blk = 256
    k = np.linspace(0, 1, n)
    fc = f0 * (f1 / f0) ** (np.sin(np.pi * k) ** 0.7)
    for i in range(0, n, blk):
        f = fc[i]
        sos = signal.butter(2, [f / q / (SR / 2), min(f * q, SR / 2 - 100) / (SR / 2)], 'bandpass', output='sos')
        out[i:i + blk] = signal.sosfilt(sos, w[i:i + blk])
    e = np.sin(np.pi * k) ** 1.6
    return (out * e).astype(np.float32)


def wind_chimes(seed=0, d=3.0):
    r = np.random.default_rng(seed)
    tubes = [m2f(m) for m in (84, 86, 89, 91, 93, 96)]
    parts = []
    tt = 0.0
    for i in range(r.integers(4, 8)):
        f = tubes[r.integers(len(tubes))]
        parts.append((bell_tone(f, 2.0, ((1, 1, 1), (2.76, .45, .5), (5.4, .2, .3), (8.93, .1, .2)), seed=i + seed) * r.uniform(0.25, 0.6), tt))
        tt += r.uniform(0.05, 0.35)
    y = dsp.mix(*[p for p, _ in parts], at=[o for _, o in parts])
    return verb(y, 0.5, 0.25, tail=0.8)


def church_bell(f=196.0, d=5.0, seed=0):
    parts = ((0.5, .5, 1.6), (1, 1, 1.0), (1.19, .45, .8), (1.5, .35, .6), (2.0, .55, .5), (2.51, .2, .3), (3.0, .15, .25), (4.07, .08, .15))
    x = bell_tone(f, d, parts, seed=seed)
    return verb(x, 0.7, 0.3, damp=0.6, tail=1.0)


def ship_bell(f=880, seed=0):
    parts = ((1, 1, 1.0), (2.32, .5, .5), (4.25, .3, .25), (6.63, .15, .15))
    a = bell_tone(f, 2.2, parts, seed=seed)
    b = bell_tone(f, 2.0, parts, seed=seed + 1) * 0.8
    return verb(dsp.mix(a, b, at=[0, 0.16]), 0.4, 0.2, tail=0.6)


def cow_bell(seed=0):
    """A grazing cow's bell: a hammered sheet bell, the clapper knocking 1-3 times."""
    r = np.random.default_rng(seed)
    f = r.uniform(520, 640)
    parts = ((1, 1, .5), (1.48, .7, .4), (2.13, .5, .3), (2.93, .3, .2), (3.95, .2, .12))
    hits = []
    tt = 0.0
    for i in range(r.integers(1, 4)):
        h = bell_tone(f, 0.9, parts, seed=seed * 7 + i) * r.uniform(0.5, 1.0)
        hits.append((h, tt)); tt += r.uniform(0.12, 0.3)
    y = dsp.mix(*[p for p, _ in hits], at=[o for _, o in hits])
    return dsp.lp(y, 6000)


# ---------------- creatures (original, non-voice) ----------------
def chirp(seed=0, base=2200, d=0.12):
    """A small critter's chirp: a quick rising-falling sine with vibrato and a soft formant."""
    r = np.random.default_rng(seed)
    n = int(d * SR)
    k = np.linspace(0, 1, n)
    f = base * r.uniform(0.85, 1.2) * (1 + r.uniform(0.2, 0.6) * np.sin(np.pi * k ** r.uniform(0.6, 1.4)))
    f *= 1 + 0.03 * np.sin(2 * np.pi * r.uniform(25, 45) * k * d)
    x = osc(f, d, 'sine') + 0.2 * osc(f * 2, d)
    e = np.sin(np.pi * k) ** 0.8
    return (x * e * 0.7).astype(np.float32)


def chirp_seq(seed=0, base=2200):
    r = np.random.default_rng(seed)
    parts = []
    tt = 0.0
    for i in range(r.integers(1, 4)):
        parts.append((chirp(seed * 13 + i, base, r.uniform(0.06, 0.13)), tt))
        tt += r.uniform(0.07, 0.14)
    return verb(dsp.mix(*[p for p, _ in parts], at=[o for _, o in parts]), 0.15, 0.08, tail=0.15)


def squeak(seed=0, base=1300):
    r = np.random.default_rng(seed)
    d = r.uniform(0.08, 0.16)
    n = int(d * SR)
    k = np.linspace(0, 1, n)
    f = base * r.uniform(0.9, 1.25) * (1 + 0.8 * k ** 0.5 - 0.6 * k ** 3)
    x = osc(f, d, 'tri')
    x = dsp.bp(x, base * 0.8, base * 5)
    e = adsr(n, 0.008, 0.03, 0.7, d * 0.4)
    return (x * e).astype(np.float32)


def bird_call(seed=0, base=1600):
    """A two- or three-note whistle with a trill, for bird-like creatures."""
    r = np.random.default_rng(seed)
    parts = []
    tt = 0.0
    for i in range(r.integers(2, 4)):
        d = r.uniform(0.09, 0.22)
        n = int(d * SR)
        k = np.linspace(0, 1, n)
        f0 = base * r.uniform(0.8, 1.4)
        f = f0 * (1 + r.uniform(-0.25, 0.35) * k) * (1 + r.uniform(0, 0.05) * np.sin(2 * np.pi * r.uniform(18, 35) * k * d))
        x = osc(f, d, 'sine') + 0.15 * osc(f * 2, d)
        parts.append((x * np.sin(np.pi * k) ** 0.6 * 0.6, tt))
        tt += d + r.uniform(0.02, 0.08)
    return verb(dsp.mix(*[p for p, _ in parts], at=[o for _, o in parts]), 0.25, 0.1, tail=0.2)


def honk(seed=0, base=420):
    """A bigger bird's double honk (a reed-like buzz), for the larger creatures."""
    r = np.random.default_rng(seed)
    parts = []
    tt = 0.0
    for i in range(r.integers(1, 3)):
        d = r.uniform(0.14, 0.22)
        n = int(d * SR)
        k = np.linspace(0, 1, n)
        f = base * r.uniform(0.9, 1.15) * (1 + 0.15 * np.sin(np.pi * k))
        x = osc(f, d, 'saw')
        x = dsp.bp(x, 600, 2600) + 0.3 * dsp.bp(x, 2800, 4200)
        parts.append((x * adsr(n, 0.01, 0.04, 0.8, 0.05), tt))
        tt += d + r.uniform(0.04, 0.09)
    return dsp.mix(*[p for p, _ in parts], at=[o for _, o in parts])


# ---------------- battle and the capture ball ----------------
def sparkle(seed=0, d=1.0, n=14):
    r = np.random.default_rng(seed)
    parts = []
    for i in range(n):
        f = m2f(r.choice([84, 88, 91, 93, 96, 100, 103]))
        parts.append((bell_tone(f, 0.5, ((1, 1, 1), (2.4, .3, .4)), seed=i) * r.uniform(0.15, 0.4), r.uniform(0, d * 0.7)))
    y = dsp.mix(*[p for p, _ in parts], at=[o for _, o in parts])
    return verb(y, 0.5, 0.25, tail=0.6)


def heal():
    up = [(bell_tone(m2f(m), 0.9, seed=i) * 0.4, i * 0.09) for i, m in enumerate([72, 76, 79, 84, 88, 91])]
    pad = sum(osc(m2f(m), 1.6, 'tri') * 0.1 for m in (72, 79, 84))
    pad = dsp.lp(pad, 3000) * adsr(len(pad), 0.25, 0.3, 0.6, 0.8)
    y = dsp.mix(*[p for p, _ in up], pad, sparkle(5, 1.0, 10) * 0.6, at=[o for _, o in up] + [0.0, 0.3])
    return verb(y, 0.45, 0.2, tail=0.5)


def levelup():
    seq = [(67, 0), (71, .08), (74, .16), (79, .24), (83, .40), (86, .48), (91, .56)]
    parts = [(marimba(m2f(m), 0.6) * 0.6, o) for m, o in seq]
    chord = sum(osc(m2f(m), 1.1, 'saw') * 0.08 for m in (79, 83, 86, 91))
    chord = dsp.lp(chord, 4000) * adsr(len(chord), 0.01, 0.2, 0.6, 0.6)
    parts.append((chord, 0.64))
    parts.append((sparkle(9, 0.8, 8) * 0.5, 0.64))
    y = dsp.mix(*[p for p, _ in parts], at=[o for _, o in parts])
    return verb(y, 0.35, 0.15, tail=0.5)


def encounter():
    """A tense rising sting: low pulses into a stab and a riser."""
    pulses = [(dsp.lp(osc(m2f(m), 0.12, 'saw'), 2500) * adsr(int(0.12 * SR), 0.003, 0.04, 0.5, 0.05) * 0.5, o)
              for m, o in [(45, 0), (45, .14), (48, .28), (51, .42), (54, .56)]]
    riser = whoosh(0.7, 300, 6000, 4) * 0.6
    stab = sum(dsp.lp(osc(m2f(m), 0.6, 'saw'), 3500) * 0.12 for m in (57, 60, 64, 69))
    stab *= adsr(len(stab), 0.004, 0.15, 0.4, 0.3)
    y = dsp.mix(*[p for p, _ in pulses], riser, stab, at=[o for _, o in pulses] + [0.2, 0.72])
    return verb(y, 0.3, 0.15, tail=0.4)


def ball_click(seed=0):
    """The capture ball's latch: a sharp plastic snap with a metallic spring ring."""
    r = np.random.default_rng(seed)
    d = 0.18
    n = int(d * SR)
    snap = dsp.bp(noise(d, 'white', seed), 2500, 9000) * expdec(n, 0.0018) * 1.4
    ring = sum(osc(f * r.uniform(0.98, 1.02), d) * a * expdec(n, tau) for f, a, tau in ((3100, .25, .03), (4700, .18, .02), (6900, .1, .012)))
    body = osc(260, d) * expdec(n, 0.012) * 0.5
    x = snap + ring + body
    return dsp.fade(x, 0.0003, 0.03)


def ball_open(seed=0):
    """Mechanical snap, then a soft pop of air and a little shimmer."""
    click = ball_click(seed)
    d = 0.35
    n = int(d * SR)
    t = t_(d)
    pop = osc(220 * np.exp(-t / 0.05) + 70, d) * expdec(n, 0.05) * 0.8
    air = dsp.bp(noise(d, 'pink', seed + 1), 400, 3000) * adsr(n, 0.005, 0.05, 0.3, 0.2) * 0.5
    shim = sparkle(seed + 2, 0.4, 5) * 0.25
    return dsp.mix(click, pop, air, shim, at=[0, 0.05, 0.05, 0.08])


def wobble(seed=0):
    """A shaking ball: two quick plastic knocks on the ground and a faint rattle."""
    r = np.random.default_rng(seed)
    k = []
    for i in range(2):
        d = 0.09
        n = int(d * SR)
        x = osc(r.uniform(300, 380), d) * expdec(n, 0.015) + dsp.bp(noise(d, 'white', seed * 3 + i), 1200, 5000) * expdec(n, 0.004)
        k.append((x * (1 if i == 0 else 0.7), i * r.uniform(0.11, 0.16)))
    rat = dsp.bp(noise(0.25, 'white', seed + 9), 3000, 8000) * adsr(int(0.25 * SR), 0.01, 0.05, 0.2, 0.15) * 0.15
    return dsp.mix(*[p for p, _ in k], rat, at=[o for _, o in k] + [0.02])


def thump(f=90, d=0.25, seed=0):
    n = int(d * SR)
    t = t_(d)
    x = osc(f * (1 + 1.5 * np.exp(-t / 0.02)), d) * expdec(n, 0.06)
    x += dsp.lp(noise(d, 'pink', seed), 800) * expdec(n, 0.03) * 0.6
    return dsp.fade(x.astype(np.float32), 0.0, 0.04)


# ---------------- animals and weather that had no open recording ----------------
def frog(seed=0):
    """A frog's croak: a fast train of glottal pulses (40-70 a second) through
    two formants, rising a little; 1-3 croaks."""
    r = np.random.default_rng(seed + 500)
    parts = []
    tt = 0.0
    base = r.uniform(0.85, 1.25)
    for i in range(r.integers(1, 4)):
        d = r.uniform(0.12, 0.28)
        n = int(d * SR)
        k = np.linspace(0, 1, n)
        rate = r.uniform(38, 70) * (1 + 0.25 * k)
        ph = np.cumsum(rate) / SR
        pulse = (np.sin(2 * np.pi * ph) > 0.92).astype(np.float32)
        pulse = signal.lfilter([1], [1, -0.9], pulse).astype(np.float32)
        x = dsp.bp(pulse, 420 * base, 900 * base) * 1.0 + dsp.bp(pulse, 1500 * base, 2300 * base) * 0.5
        x *= np.sin(np.pi * k) ** 0.5
        parts.append((x, tt))
        tt += d + r.uniform(0.04, 0.12)
    y = dsp.mix(*[p for p, _ in parts], at=[o for _, o in parts])
    return verb(y, 0.3, 0.12, tail=0.25)


def owl(seed=0):
    """A tawny-owl-like hoot: a breathy low whistle, a pause, then a wavering one."""
    r = np.random.default_rng(seed + 600)
    f0 = r.uniform(360, 430)

    def hoot(d, wav=0.0, glide=0.05):
        n = int(d * SR)
        k = np.linspace(0, 1, n)
        f = f0 * (1 + glide * np.sin(np.pi * k)) * (1 + wav * np.sin(2 * np.pi * 9 * k * d))
        x = osc(f, d) + 0.12 * osc(f * 2, d)
        br = dsp.bp(noise(d, 'pink', seed), f0 * 0.8, f0 * 3) * 0.25
        e = np.sin(np.pi * k ** 0.7) ** 1.2
        return ((x + br) * e).astype(np.float32)
    y = dsp.mix(hoot(0.55), hoot(0.3, 0, 0.0) * 0.7, hoot(0.9, 0.04, 0.02) * 0.9,
                at=[0, r.uniform(0.9, 1.2), r.uniform(1.4, 1.7)])
    return verb(dsp.lp(y, 3000), 0.6, 0.3, tail=1.0)


def hen(seed=0):
    """A hen clucking: short throaty "buk" bursts (a rough, low-voiced buzz with a
    breathy edge through two vowel formants), 2-5 of them, the last one longer."""
    r = np.random.default_rng(seed + 700)
    parts = []
    tt = 0.0
    cnt = r.integers(2, 6)
    for i in range(cnt):
        last = i == cnt - 1 and cnt > 3
        d = r.uniform(0.18, 0.28) if last else r.uniform(0.05, 0.09)
        n = int(d * SR)
        k = np.linspace(0, 1, n)
        f = r.uniform(300, 420) * (1 + (0.35 if last else 0.15) * np.sin(np.pi * k ** 0.8))
        v = osc(f, d, 'saw') * (1 + 0.5 * np.sin(2 * np.pi * r.uniform(55, 80) * k * d))   # roughness
        br = noise(d, 'white', seed * 13 + i) * 0.5
        x = dsp.bp(v + br, 600, 1500) + 0.45 * dsp.bp(v + br, 1900, 3000)
        x = dsp.lp(x, 4000)
        x *= np.minimum(1.0, k * 12) * (1 - k) ** 0.6
        parts.append((x.astype(np.float32), tt))
        tt += d + r.uniform(0.06, 0.2)
    return dsp.mix(*[p for p, _ in parts], at=[o for _, o in parts])


def clap(seed=0, soft=False):
    """A hand clap: three or four tiny noise bursts a few ms apart, then a short body."""
    r = np.random.default_rng(seed + 800)
    d = 0.18
    n = int(d * SR)
    x = np.zeros(n, dtype=np.float32)
    for j in range(r.integers(3, 5)):
        o = int(j * r.uniform(0.004, 0.009) * SR)
        b = noise(0.02, 'white', seed * 10 + j)[:n - o] * expdec(int(0.02 * SR), 0.0025)[:n - o]
        x[o:o + len(b)] += b
    x += noise(d, 'white', seed + 99) * expdec(n, 0.03) * 0.5
    x = dsp.bp(x, 700 if soft else 900, 3500 if soft else 5500)
    return dsp.fade(x, 0.0005, 0.04)


def thunder(seed=0, d=7.0):
    """Rolling thunder: a crack, then low rumbles that swell and fade."""
    r = np.random.default_rng(seed + 900)
    n = int(d * SR)
    rum = dsp.lp(noise(d, 'brown', seed), 220) * 1.4
    env = np.zeros(n, dtype=np.float32)
    for j in range(r.integers(3, 6)):
        c = r.uniform(0.2, d * 0.6); w = r.uniform(0.4, 1.6)
        t = np.arange(n) / SR
        env += r.uniform(0.4, 1.0) * np.exp(-((t - c) / w) ** 2)
    env *= np.exp(-np.arange(n) / (d * 0.45 * SR))
    crack = dsp.bp(noise(0.4, 'white', seed + 1), 800, 5000) * expdec(int(0.4 * SR), 0.06) * 0.6
    y = dsp.mix(rum * env, crack, at=[0, r.uniform(0.0, 0.15)])
    return verb(dsp.stereo(y), 0.9, 0.35, damp=0.7, tail=1.5)


def roof_drips(L=20.0, rate=40.0, seed=0):
    """Rain on a roof from inside: random taps (each a small damped knock), loop length L."""
    r = np.random.default_rng(seed + 1000)
    n = int(L * SR)
    out = np.zeros((n, 2), dtype=np.float32)
    for i in range(int(L * rate)):
        at = int(r.uniform(0, L) * SR)
        f = r.uniform(700, 2600)
        dd = 0.05
        m = int(dd * SR)
        tap = (osc(f, dd) * expdec(m, 0.006) + dsp.hp(noise(dd, 'white', i % 97), 2000) * expdec(m, 0.002) * 0.6) * r.uniform(0.05, 0.3)
        pan = r.uniform(0.2, 0.8)
        idx = (np.arange(m) + at) % n
        np.add.at(out[:, 0], idx, tap * (1 - pan))
        np.add.at(out[:, 1], idx, tap * pan)
    return out
