"""Render a score to a mixed, mastered, seamlessly looping Ogg Vorbis file.

Signal path (an analog-minded orchestral mix):
  each part -> SFZ sampler with humanized timing, dynamics and legato
  -> placed on a concert stage (seating pan, width, distance: air absorption,
     a few ms of travel time, more hall for players further back)
  -> synthetic concert-hall impulse (early reflections + a tail whose decay
     is longer in the lows than the highs, like a wooden hall)
  -> master: 28 Hz high-pass, warm low shelf, slow glue compression,
     tape-style saturation (soft knee with a touch of 2nd harmonic),
     rolled-off top, then -18 LUFS integrated with peaks kept under -1 dBFS.

Loops: the loop body is rendered once and laid down four times back to back
(sample-exact), the hall and master run over that continuous signal, and the
third repetition (a steady state: its start holds the previous pass's tails)
becomes the loop in the file. File = intro + loop; the game loops back to the
loop offset, so the seam is the same audio as the inside of the piece.
"""
import os
import subprocess
import zlib

import numpy as np
import soundfile as sf
from scipy.signal import oaconvolve, butter, sosfilt

import sfz
from sfz import SR

LIB = os.environ.get('VSCO', '/tmp/claude-0/samples/vsco')

# instrument key -> (sfz file, gain dB, release s or None, attack s or None)
# gains calibrated so every sustained section sounds equally loud at the same
# dynamic (measured RMS of mid-register notes at mf), solo winds a little
# under the sections, short notes and percussion by ear-like targets
ORCH = {
    'vln': ('ViolinEnsSusVib.sfz', 4.4, 0.55, 0.06),
    'vla': ('ViolaEnsSusVib.sfz', -6.7, 0.55, 0.06),
    'vc': ('CelloEnsSusVib.sfz', -6.2, 0.6, 0.06),
    'cb': ('ContrabassSusNV.sfz', 2.5, 0.6, 0.07),
    'vln_pizz': ('ViolinEnsPizz.sfz', 2.9, None, None),
    'vla_pizz': ('ViolaEnsPizz.sfz', -3.6, None, None),
    'vc_pizz': ('CelloEnsPizz.sfz', 2.4, None, None),
    'cb_pizz': ('ContrabassPizz.sfz', 3.1, None, None),
    'harp': ('Harp.sfz', 3.5, 2.5, None),
    'fl': ('FluteSusVib.sfz', -3.9, 0.35, 0.04),
    'fl_stac': ('FluteStac.sfz', 6.9, None, None),
    'ob': ('OboeSusVib.sfz', 1.8, 0.3, 0.04),
    'ob_stac': ('OboeStac.sfz', -0.8, None, None),
    'cl': ('ClarinetSus.sfz', -5.5, 0.3, 0.05),
    'cl_stac': ('ClarinetStac.sfz', 5.1, None, None),
    'bn': ('BassoonSus.sfz', -3.5, 0.3, 0.05),
    'bn_stac': ('BassoonStac.sfz', -0.1, None, None),
    'hn': ('FHornSus.sfz', -2.3, 0.45, 0.08),
    'glock': ('Glockenspiel.sfz', 7.2, 3.0, None),
    'timp': ('Timpani.sfz', -2, 2.0, None),
    'timp_roll': ('TimpaniRolls.sfz', -1.5, 1.2, 0.25),
    'marimba': ('Marimba.sfz', 3, 1.2, None),
}

# concert seating: pan (-1 left .. 1 right), stereo width, depth 0 front .. 1 back
SEAT = {
    'vln1': dict(pan=-0.55, width=0.55, depth=0.15),
    'vln2': dict(pan=-0.25, width=0.5, depth=0.2),
    'vla': dict(pan=0.2, width=0.5, depth=0.2),
    'vc': dict(pan=0.45, width=0.5, depth=0.2),
    'cb': dict(pan=0.65, width=0.4, depth=0.35),
    'harp': dict(pan=-0.6, width=0.45, depth=0.35),
    'fl': dict(pan=-0.15, width=0.3, depth=0.5),
    'ob': dict(pan=0.12, width=0.3, depth=0.5),
    'cl': dict(pan=-0.12, width=0.3, depth=0.55),
    'bn': dict(pan=0.15, width=0.3, depth=0.55),
    'hn': dict(pan=-0.35, width=0.5, depth=0.75),
    'timp': dict(pan=-0.05, width=0.5, depth=0.9),
    'glock': dict(pan=0.35, width=0.3, depth=0.8),
    'marimba': dict(pan=0.3, width=0.4, depth=0.75),
}

SUSTAINED = {'vln', 'vla', 'vc', 'cb', 'fl', 'ob', 'cl', 'bn', 'hn'}

_INST = {}


def inst(key):
    if key not in _INST:
        f, g, rel, att = ORCH[key]
        _INST[key] = sfz.Instrument(LIB, f, gain_db=g, release=rel, attack=att)
        if key == 'timp_roll':
            # the library's key centres for the rolls are a little off: the
            # drums' principal tones, measured from the recordings (MIDI)
            meas = {'Timpani1': 41.7, 'Timpani2': 47.6, 'Timpani3': 49.1, 'Timpani4': 52.1, 'Timpani5': 55.6}
            for r in _INST[key].regions:
                drum = os.path.basename(r['sample']).split('_')[0]
                if drum in meas:
                    r['tune'] += (r['center'] - meas[drum]) * 100
    return _INST[key]


def _seed(*a):
    return zlib.crc32(repr(a).encode())


def render_part(part, tempo, b0, b1, origin_beat):
    """Render the notes of `part` that start in [b0, b1) to a stereo buffer
    whose sample 0 is `origin_beat`. Returns (buffer)."""
    perf = part.perf
    hum = perf.get('humanize', 0.008)       # timing spread, seconds
    legato = perf.get('legato', False)
    swell = perf.get('swell', 0.0)
    cents = perf.get('cents', 0.0)
    dshift = perf.get('dyn', 0.0)
    spread = perf.get('spread', 0.0)       # chord roll (harp, pizz), seconds
    lay = perf.get('layers', 1)            # >1: extra detuned players (a section from a solo sample)
    t_origin = tempo.sec(origin_beat)
    notes = [n for n in part.notes if b0 - 1e-6 <= n[0] < b1 - 1e-6]
    pieces = []
    prev_end = None
    for i, (b, d, keys, _) in enumerate(notes):
        rng = np.random.default_rng(_seed(part.name, round(b, 4), tuple(keys)))
        on = tempo.sec(b) - t_origin
        off = tempo.sec(b + d) - t_origin
        is_leg = legato and prev_end is not None and abs(prev_end - b) < 0.02
        prev_end = b + d
        jitter = rng.normal(0, hum) if not is_leg else rng.normal(0, hum * 0.4)
        on += jitter
        dur = max(off - on, 0.05)
        if legato:
            nxt = notes[i + 1] if i + 1 < len(notes) else None
            if nxt is not None and abs(nxt[0] - (b + d)) < 0.02:
                dur += 0.07          # overlap into the next note
            else:
                dur *= 0.97          # a breath before a gap
        else:
            dur *= perf.get('gate', 0.94)
        bpm = tempo.bpm(b)
        vj = rng.normal(0, 0.025)
        # how far into a bowed / blown swell the note starts: short notes
        # speak quickly, a melody's first note a little, long pads swell
        if part.patch not in SUSTAINED:
            skip = 0.0               # plucked and struck notes keep their attack
        elif dur < 0.9:
            skip = 0.85
        elif legato:
            skip = 0.5
        else:
            skip = perf.get('skip', 0.2)

        def dyn(t, b=b, bpm=bpm, d=d, dur=dur, vj=vj):
            beat = b + t * bpm / 60.0
            lv = part.level(beat) + dshift + vj
            if swell and dur > 1.2:
                x = min(t / dur, 1.0)
                lv += swell * np.sin(np.pi * x) - swell * 0.3
            return float(np.clip(lv, 0.03, 0.98))

        for j, k in enumerate(sorted(keys)):
            for layer in range(lay):
                lr = np.random.default_rng(_seed(part.name, round(b, 4), k, layer))
                c = cents + (layer - (lay - 1) / 2) * 7 + lr.normal(0, 1.5)
                st = on + j * spread + layer * 0.011
                buf = inst(part.patch).note(k, dur, dyn, lr, legato=is_leg, cents=c, skip=skip)
                if lay > 1:
                    buf = buf * (0.8 / np.sqrt(lay))
                pieces.append((st, buf))
    if not pieces:
        return np.zeros((SR, 2), np.float32)
    start = min(p[0] for p in pieces)
    pad = int(max(0, -start) * SR) + 1
    n = max(int(p[0] * SR) + pad + len(p[1]) for p in pieces) + 1
    out = np.zeros((n, 2), np.float32)
    for st, buf in pieces:
        i = int(round(st * SR)) + pad
        out[i:i + len(buf)] += buf
    return out[pad:] if pad <= len(out) else out


def place(buf, seat):
    """Put a stem on the stage. Returns (dry, send) stereo buffers."""
    pan, width, depth = seat['pan'], seat['width'], seat['depth']
    m = (buf[:, 0] + buf[:, 1]) * 0.5
    s = (buf[:, 0] - buf[:, 1]) * 0.5 * width
    l, r = m + s, m - s
    a = (pan + 1) * np.pi / 4
    gl, gr = np.cos(a) * np.sqrt(2), np.sin(a) * np.sqrt(2)
    # constant-power balance on the (narrowed) stereo image
    x = np.stack([l * gl, r * gr], 1).astype(np.float32)
    # distance: air absorption, travel time and a quieter direct sound
    cut = 16000 - 8500 * depth
    x = sfz.lowpass(x, cut, 1)
    delay = int(SR * 0.012 * depth)
    if delay:
        x = np.concatenate([np.zeros((delay, 2), np.float32), x])[:len(x)]
    dry = x * 10 ** (-3.5 * depth / 20)
    send = x * (0.45 + 0.35 * depth)
    return dry, send


def hall_ir(seconds=3.2, rt_low=2.5, rt_mid=2.0, rt_high=1.1, seed=7):
    """A concert-hall impulse response: sparse early reflections (side walls,
    stage shell, balcony) then a dense diffuse tail decaying per band."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = np.zeros((n, 2), np.float32)
    pre = int(0.018 * SR)
    # early reflections, 18-90 ms
    for ch in range(2):
        for _ in range(14):
            t = int(SR * rng.uniform(0.018, 0.09))
            g = rng.uniform(0.25, 0.6) * (0.018 / (t / SR)) ** 0.6
            ir[t, ch] += g * rng.choice([-1, 1])
    ir[:, :] = sfz.lowpass(ir, 7000, 2)
    # diffuse tail per band
    t = np.arange(n) / SR
    tail = np.zeros((n, 2))
    bands = [(None, 250, rt_low), (250, 2000, rt_mid), (2000, 6000, (rt_mid + rt_high) / 2), (6000, None, rt_high)]
    for lo, hi, rt in bands:
        noise = rng.normal(0, 1, (n, 2))
        if lo and hi:
            sos = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos')
        elif hi:
            sos = butter(2, hi / (SR / 2), 'low', output='sos')
        else:
            sos = butter(2, lo / (SR / 2), 'high', output='sos')
        noise = sosfilt(sos, noise, axis=0)
        env = 10 ** (-3 * t / rt)
        tail += noise * env[:, None]
    onset = np.clip((t - 0.025) / 0.06, 0, 1) ** 1.5
    tail *= onset[:, None]
    tail /= np.sqrt(np.mean(tail[: int(0.3 * SR)] ** 2) + 1e-12)
    ir += (tail * 0.09).astype(np.float32)
    ir[:pre] *= 0
    fade = int(0.2 * SR)
    ir[-fade:] *= np.linspace(1, 0, fade)[:, None]
    # unit energy per channel: the send level is then the reverb level
    return (ir / np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))).astype(np.float32)


def reverb(send, ir):
    wl = oaconvolve(send[:, 0], ir[:, 0]) + 0.25 * oaconvolve(send[:, 1], ir[:, 0])
    wr = oaconvolve(send[:, 1], ir[:, 1]) + 0.25 * oaconvolve(send[:, 0], ir[:, 1])
    w = np.stack([wl, wr], 1)[:len(send)].astype(np.float32)
    return sfz.highpass(w, 120, 1)


def master(x):
    import pedalboard as pb
    board = pb.Pedalboard([
        pb.HighpassFilter(cutoff_frequency_hz=28),
        pb.LowShelfFilter(cutoff_frequency_hz=180, gain_db=2.5, q=0.6),
        pb.PeakFilter(cutoff_frequency_hz=3200, gain_db=-1.2, q=0.8),   # tame string bite
        pb.Compressor(threshold_db=-20, ratio=1.8, attack_ms=30, release_ms=300),
    ])
    y = board(x.T.astype(np.float32), SR).T
    # tape: drive into a soft curve with a little even-order colour
    pk = np.max(np.abs(y)) + 1e-9
    y = y / pk * 0.7
    drive = 1.5
    y = np.tanh(drive * y) / np.tanh(drive)
    y = y + 0.025 * (y ** 2 - np.mean(y ** 2, axis=0))
    board2 = pb.Pedalboard([
        pb.HighShelfFilter(cutoff_frequency_hz=7500, gain_db=-2.5, q=0.6),
        pb.LowpassFilter(cutoff_frequency_hz=15500),
    ])
    y = board2(y.T.astype(np.float32), SR).T
    return y.astype(np.float32)


def loudness(x, target=-18.0, ceiling_db=-1.0):
    import pyloudnorm as pyln
    meter = pyln.Meter(SR)
    lufs = meter.integrated_loudness(x.astype(np.float64))
    g = 10 ** ((target - lufs) / 20)
    y = x * g
    pk = np.max(np.abs(y))
    lim = 10 ** (ceiling_db / 20)
    if pk > lim:
        # soft-limit the few peaks above the ceiling
        y = np.where(np.abs(y) > lim * 0.9, np.sign(y) * (lim * 0.9 + (lim * 0.1) * np.tanh((np.abs(y) - lim * 0.9) / (lim * 0.1))), y)
    return y.astype(np.float32), lufs, meter.integrated_loudness(y.astype(np.float64))


def render_piece(name, parts, tempo, loop_start, loop_end, outdir, seats, preview=None):
    """parts: list of Part; seats: part name -> seat key. Writes
    <outdir>/<name>.wav (mastered, looped layout) and returns info."""
    intro_s = tempo.sec(loop_start)
    loop_s = tempo.sec(loop_end) - intro_s
    intro_n = int(round(intro_s * SR))
    N = int(round(loop_s * SR))
    reps = 4
    total = intro_n + reps * N + 6 * SR
    dry = np.zeros((total, 2), np.float32)
    send = np.zeros((total, 2), np.float32)
    stems = {}
    for p in parts:
        seat = SEAT[seats.get(p.name, p.name)]
        seat = dict(seat, **{k: p.perf[k] for k in ('pan', 'width', 'depth') if k in p.perf})
        stem = np.zeros((total, 2), np.float32)
        if loop_start > 0:
            a = render_part(p, tempo, 0, loop_start, 0)
            stem[:min(len(a), total)] += a[:total]
        lp = render_part(p, tempo, loop_start, loop_end, loop_start)
        for k in range(reps):
            i = intro_n + k * N
            seg = lp[:max(0, total - i)]
            stem[i:i + len(seg)] += seg
        d, s = place(stem, seat)
        g = 10 ** (p.perf.get('gain', 0) / 20)
        dry += d * g
        send += s * g * p.perf.get('send', 1.0)
        stems[p.name] = d * g
        print('  part', p.name, 'peak %.2f' % float(np.max(np.abs(d * g))))
    ir = hall_ir()
    wet = reverb(send, ir)
    mix = dry + wet * 0.75
    m = master(mix)
    # cut: intro, then the third repetition of the loop
    k = 2
    body = m[intro_n + k * N: intro_n + (k + 1) * N].copy()
    if intro_n:
        head = m[:intro_n].copy()
        # the loop body starts with the previous pass's tails, so for the one
        # time the intro leads into it, the intro's last 60 ms blend into what
        # comes before the body in a steady pass (the loop's own ending):
        # both joins (intro -> loop, loop end -> loop start) are continuous
        f = int(0.06 * SR)
        w = np.linspace(0, 1, f)[:, None]
        e = intro_n + k * N
        head[-f:] = head[-f:] * (1 - w) + m[e - f:e] * w
        out = np.concatenate([head, body])
    else:
        out = body
    out, l0, l1 = loudness(out)
    wav = os.path.join(outdir, name + '.wav')
    sf.write(wav, out, SR, subtype='FLOAT')
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=N / SR, total_s=len(out) / SR, lufs=l1, stems=stems, intro_n=intro_n, N=N)


def to_ogg(wav, ogg, q=6):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', str(q), '-ar', str(SR), ogg], check=True)


def to_mp3(wav, mp3):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-q:a', '2', mp3], check=True)
