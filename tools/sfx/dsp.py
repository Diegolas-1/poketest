# Audio helpers for the SFX library build (tools/sfx/build.py): load through
# ffmpeg, trim, fade, filter, level, cut steps out of a recording, make loops
# seamless, and write Ogg Vorbis. Everything is float32 numpy, shape (n,) for
# mono or (n, 2) for stereo.
import subprocess
import numpy as np
from scipy import signal

SR = 44100


def load(path, sr=SR, mono=True, start=None, dur=None):
    a = ['ffmpeg', '-v', 'error']
    if start is not None: a += ['-ss', str(start)]
    if dur is not None: a += ['-t', str(dur)]
    a += ['-i', str(path), '-f', 'f32le', '-ac', '1' if mono else '2', '-ar', str(sr), '-']
    raw = subprocess.run(a, check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).copy()
    return x if mono else x.reshape(-1, 2)


def write_ogg(path, x, sr=SR, q=4, out_sr=None):
    x = np.clip(np.asarray(x, dtype=np.float32), -1.0, 1.0)
    ch = 1 if x.ndim == 1 else 2
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', str(ch), '-ar', str(sr), '-i', '-',
                    '-ar', str(out_sr or sr), '-c:a', 'libvorbis', '-q:a', str(q), '-map_metadata', '-1', str(path)],
                   input=x.tobytes(), check=True)


def write_mp3(path, x, sr=SR):
    x = np.clip(np.asarray(x, dtype=np.float32), -1.0, 1.0)
    ch = 1 if x.ndim == 1 else 2
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', str(ch), '-ar', str(sr), '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', '128k', str(path)], input=x.tobytes(), check=True)


def mono(x):
    return x if x.ndim == 1 else x.mean(axis=1)


def stereo(x):
    return np.stack([x, x], axis=1) if x.ndim == 1 else x


def env(x, ms=5.0, sr=SR):
    m = np.abs(mono(x))
    n = max(1, int(sr * ms / 1000))
    return np.convolve(m, np.ones(n) / n, mode='same')


def db(v):
    return 20 * np.log10(max(v, 1e-9))


def fade(x, fin=0.002, fout=0.02, sr=SR):
    x = x.copy()
    a = int(fin * sr); b = int(fout * sr)
    if a > 0:
        r = np.linspace(0, 1, a) ** 2
        x[:a] = (x[:a].T * r).T
    if b > 0 and b < len(x):
        r = np.linspace(1, 0, b) ** 2
        x[-b:] = (x[-b:].T * r).T
    return x


def trim(x, thr_db=-42.0, pre=0.004, post=0.04, sr=SR):
    """Cut leading and trailing quiet (relative to the peak)."""
    e = env(x, 3)
    pk = e.max() if len(e) else 0
    if pk <= 0: return x
    on = np.where(e > pk * 10 ** (thr_db / 20))[0]
    if len(on) == 0: return x
    a = max(0, on[0] - int(pre * sr)); b = min(len(x), on[-1] + int(post * sr))
    return x[a:b]


def filt(x, kind, f, order=2, sr=SR):
    if isinstance(f, (list, tuple)): wn = [v / (sr / 2) for v in f]
    else: wn = f / (sr / 2)
    sos = signal.butter(order, wn, btype=kind, output='sos')
    return signal.sosfilt(sos, x, axis=0).astype(np.float32)


def hp(x, f, order=2): return filt(x, 'highpass', f, order)
def lp(x, f, order=2): return filt(x, 'lowpass', f, order)
def bp(x, lo, hi, order=2): return filt(x, 'bandpass', [lo, hi], order)


def shelf(x, f, gain_db, high=True, sr=SR):
    """Simple shelf by mixing a filtered copy."""
    g = 10 ** (gain_db / 20) - 1
    y = hp(x, f) if high else lp(x, f)
    return (x + y * g).astype(np.float32)


def denoise(x, floor_db=-50.0, sr=SR):
    """Spectral gate: subtract a noise floor estimated from the quietest frames."""
    m = x.ndim == 1
    chans = [x] if m else [x[:, 0], x[:, 1]]
    out = []
    for c in chans:
        f, t, Z = signal.stft(c, sr, nperseg=1024)
        mag = np.abs(Z)
        en = mag.mean(axis=0)
        q = np.quantile(en, 0.1)
        nf = mag[:, en <= q].mean(axis=1, keepdims=True) if (en <= q).any() else mag.min(axis=1, keepdims=True)
        g = np.clip(1 - 1.5 * nf / np.maximum(mag, 1e-9), 10 ** (floor_db / 20), 1.0)
        # smooth the gain across time to avoid chirpy artefacts
        g = signal.convolve2d(g, np.ones((3, 5)) / 15, mode='same', boundary='symm')
        _, y = signal.istft(Z * g, sr, nperseg=1024)
        out.append(y[:len(c)].astype(np.float32))
    return out[0] if m else np.stack(out, axis=1)


def loud(x, ms=50.0, sr=SR):
    """Loudness of the loudest 50 ms (RMS, dB) - one-shots are levelled on it."""
    mm = mono(x)
    n = max(1, int(sr * ms / 1000))
    if len(mm) < n: return db(np.sqrt(np.mean(mm ** 2)) + 1e-12)
    p = np.convolve(mm ** 2, np.ones(n) / n, mode='valid')
    return db(np.sqrt(p.max()))


def rms_db(x):
    return db(np.sqrt(np.mean(mono(x) ** 2)) + 1e-12)


def level(x, target_db, peak_db=-1.0, by='loud'):
    """Gain to the target (loudest-50ms RMS for one-shots, whole RMS for beds), peak capped."""
    cur = loud(x) if by == 'loud' else rms_db(x)
    g = 10 ** ((target_db - cur) / 20)
    pk = np.abs(x).max() * g
    lim = 10 ** (peak_db / 20)
    if pk > lim:
        # soft limit rather than lowering everything: a tanh knee above -6 dB of the cap
        y = x * g
        k = lim * 0.5
        a = np.abs(y)
        over = a > k
        y[over] = np.sign(y[over]) * (k + (lim - k) * np.tanh((a[over] - k) / (lim - k)))
        return y.astype(np.float32)
    return (x * g).astype(np.float32)


def onsets(x, min_gap=0.18, thr=0.25, sr=SR):
    """Onsets in a recording of separate hits (steps, knocks): rises of the 4 ms
    envelope above thr x its 95th percentile, at least min_gap apart."""
    e = env(x, 4)
    ref = np.quantile(e, 0.98)
    base = np.quantile(e, 0.3)
    th = base + (ref - base) * thr
    above = e > th
    idx = np.where(above[1:] & ~above[:-1])[0] + 1
    out = []
    for i in idx:
        if not out or i - out[-1] > min_gap * sr: out.append(i)
    return out


def cut_hits(x, n, max_len=0.45, min_gap=0.18, thr=0.25, pre=0.012, sr=SR, skip=0):
    """The n most typical hits of a recording (by loudness: the middle of the pack)."""
    on = onsets(x, min_gap, thr, sr)
    segs = []
    for k, i in enumerate(on):
        a = max(0, i - int(pre * sr))
        b = min(len(x), i + int(max_len * sr))
        if k + 1 < len(on): b = min(b, on[k + 1] - int(0.01 * sr))
        s = x[a:b]
        if len(s) < 0.06 * sr: continue
        segs.append(s)
    segs = segs[skip:]
    if not segs: return []
    lv = np.array([loud(s) for s in segs])
    med = np.median(lv)
    order = np.argsort(np.abs(lv - med))
    pick = sorted(order[:n])
    return [trim(fade(segs[i], 0.002, 0.03), -40, 0.004, 0.03) for i in pick]


def seam_loop(x, length, xfade=1.5, start=0.0, sr=SR):
    """A seamless loop of `length` s: the tail past the loop end is crossfaded
    (equal power) into the start, so the last sample flows into the first."""
    a = int(start * sr); L = int(length * sr); X = int(xfade * sr)
    if a + L + X > len(x):
        raise ValueError('source too short for loop: %d < %d' % (len(x), a + L + X))
    seg = x[a:a + L + X].copy()
    body = seg[:L].copy()
    t = np.linspace(0, np.pi / 2, X)
    fi = np.sin(t); fo = np.cos(t)
    if body.ndim == 2: fi = fi[:, None]; fo = fo[:, None]
    body[:X] = seg[:X] * fi + seg[L:L + X] * fo
    return body


def pitch(x, ratio):
    """Resample to change pitch and length together (tape style)."""
    n = int(len(x) / ratio)
    return signal.resample(x, n, axis=0).astype(np.float32)


def mix(*parts, at=None):
    """Sum signals; at = list of offsets in seconds."""
    at = at or [0.0] * len(parts)
    st = any(p.ndim == 2 for p in parts)
    n = max(int(o * SR) + len(p) for p, o in zip(parts, at))
    out = np.zeros((n, 2) if st else n, dtype=np.float32)
    for p, o in zip(parts, at):
        p = stereo(p) if st else p
        i = int(o * SR)
        out[i:i + len(p)] += p
    return out


def pad(x, secs):
    z = np.zeros((int(secs * SR),) + x.shape[1:], dtype=np.float32)
    return np.concatenate([x, z])
