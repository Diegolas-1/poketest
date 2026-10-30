#!/usr/bin/env python3
# The forest region's own sounds (native/arena/regions/forest_life.gd), made from
# scratch with numpy only (the filters on short overlapping FFT frames, as
# battle_sfx.py), added to native/audio/sfx/catalog.json:
#   amb_forest       the wood's bed: leaves washing in a breeze, a faint shimmer of
#                    insects high up, a branch creaking far off (a 24 s loop)
#   hive_buzz        a hive's hum: many wings, a low drone with a beating chorus (a loop)
#   beedrill_buzz    one Beedrill darting past: a rasping wing buzz that swells and goes
#   beedrill_swarm   the hive roused: a swarm's buzz rising into a roar
#   pebble_tap       a pebble knocking up through the leaves into a branch
#   silk_snap        a cocoon's thread snapping
#   cocoon_tick      a hard shell shifting: two dry clicks
#   harden_clink     a shell hardening: a short bright clink
#   spot_ping        something spotted: a soft rising ping
#   python3 tools/sfx/forest_sfx.py        (needs ffmpeg with libvorbis)
import json, subprocess, wave, tempfile, os
from pathlib import Path
import numpy as np

SR = 44100
ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / 'native' / 'audio' / 'sfx'
LIC = 'CC0 1.0 (original, made for this game: tools/sfx/forest_sfx.py)'
rng = np.random.default_rng(151)


def stft_filter(x, gain_fn, n=2048, hop=512):
    win = np.hanning(n).astype(np.float32)
    out = np.zeros(len(x) + n, dtype=np.float32)
    norm = np.zeros(len(x) + n, dtype=np.float32)
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    xp = np.concatenate([x, np.zeros(n, dtype=np.float32)])
    for i in range(0, len(x), hop):
        fr = xp[i:i + n] * win
        sp = np.fft.rfft(fr) * gain_fn((i + n / 2) / SR, freqs)
        out[i:i + n] += np.fft.irfft(sp, n).astype(np.float32) * win
        norm[i:i + n] += win * win
    return (out / np.maximum(norm, 1e-3))[:len(x)]


def band(freqs, fc, q):
    lf = np.log2(np.maximum(freqs, 20.0) / fc)
    return np.exp(-(lf * lf) / (2.0 * (1.0 / q) ** 2))


def t_(d): return np.arange(int(d * SR)) / SR


def smooth_noise(n, rate, seed):
    r = np.random.default_rng(seed)
    k = max(2, int(n / SR * rate) + 2)
    pts = r.random(k)
    xs = np.linspace(0, k - 1, n)
    i = np.floor(xs).astype(int)
    f = xs - i
    f = f * f * (3 - 2 * f)
    return pts[np.minimum(i, k - 1)] * (1 - f) + pts[np.minimum(i + 1, k - 1)] * f


def loopify(x, xf=1.5):
    """crossfade the tail into the head so it loops (x: (n, ch))"""
    m = int(xf * SR)
    head = x[:m].copy()
    tail = x[-m:].copy()
    w = np.linspace(0, 1, m)[:, None]
    x = x[:-m].copy()
    x[:m] = tail * (1 - w) + head * w
    return x


def amb_forest(L=24.0):
    n = int(L * SR)
    out = np.zeros((n, 2), dtype=np.float32)
    for ch in range(2):
        w = rng.standard_normal(n).astype(np.float32)
        gust = 0.35 + 0.65 * smooth_noise(n, 0.35, 10 + ch) ** 1.5
        leaves = stft_filter(w, lambda tt, f: band(f, 2400, 0.9) * 0.9 + band(f, 5200, 1.2) * 0.4)
        out[:, ch] += leaves * gust * 0.5
        # the insects: a high shimmer, pulsing
        ins = stft_filter(rng.standard_normal(n).astype(np.float32), lambda tt, f: band(f, 6800, 5.0))
        pulse = 0.6 + 0.4 * np.sin(2 * np.pi * (7.0 + ch * 0.4) * t_(L))
        out[:, ch] += ins * pulse * 0.07 * (0.5 + 0.5 * smooth_noise(n, 0.1, 20 + ch))
    # a far creak or two
    for c0 in [5.0, 15.5]:
        d = 0.9
        tt = t_(d)
        f = 140 + 30 * np.sin(2 * np.pi * 1.3 * tt)
        cr = np.sin(2 * np.pi * np.cumsum(f) / SR) * (np.sin(np.pi * tt / d) ** 2)
        cr += 0.4 * np.sign(np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR)) * (np.sin(np.pi * tt / d) ** 2)
        i = int(c0 * SR)
        out[i:i + len(cr), 0] += cr * 0.035
        out[i:i + len(cr), 1] += cr * 0.025
    return loopify(out)


def wings(d, f0, seed, rasp=0.5, vib=3.0):
    r = np.random.default_rng(seed)
    tt = t_(d)
    f = f0 * (1 + 0.04 * np.sin(2 * np.pi * vib * tt + r.random() * 6) + 0.02 * r.standard_normal() )
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.zeros_like(tt)
    for k in range(1, 18):
        x += np.sin(k * ph) / k ** (1.0 - rasp * 0.4)
    am = 0.75 + 0.25 * np.sin(ph * 0.5)
    return (x * am).astype(np.float32)


def hive_buzz(L=6.0):
    n = int(L * SR)
    x = np.zeros(n, dtype=np.float32)
    # a chorus of wings: whole numbers of cycles over L so it loops on its own
    for k in range(9):
        f0 = round((150 + rng.random() * 90) * L) / L
        x += wings(L, f0, 30 + k, 0.4, round((2 + rng.random() * 3) * L) / L) * (0.5 + rng.random() * 0.5)
    x = stft_filter(x, lambda tt, f: band(f, 600, 0.7) + 0.4 * band(f, 1800, 1.2))
    noise = stft_filter(rng.standard_normal(n).astype(np.float32), lambda tt, f: band(f, 900, 1.5)) * 0.3
    y = x + noise
    return np.stack([y, y], axis=1)[:, :1]


def beedrill_buzz(d=0.9):
    tt = t_(d)
    env = np.sin(np.pi * tt / d) ** 1.5
    f = 210 + 60 * np.sin(np.pi * tt / d)          # (rising as it comes, falling as it goes)
    ph = 2 * np.pi * np.cumsum(f * (1 + 0.03 * np.sin(2 * np.pi * 31 * tt))) / SR
    x = sum(np.sign(np.sin(k * ph)) / k ** 1.2 for k in range(1, 6))
    x = stft_filter(x.astype(np.float32), lambda t2, fr: band(fr, 900, 0.8) + 0.5 * band(fr, 2500, 1.5))
    return (x * env)[:, None]


def beedrill_swarm(d=2.6):
    n = int(d * SR)
    x = np.zeros(n, dtype=np.float32)
    tt = t_(d)
    for k in range(12):
        x += wings(d, 170 + rng.random() * 120, 60 + k, 0.7, 4 + rng.random() * 4) * (0.4 + rng.random() * 0.6)
    x = stft_filter(x, lambda t2, f: band(f, 700 + 500 * min(1.0, t2 / d), 0.7) + 0.5 * band(f, 2200, 1.3))
    env = np.minimum(1.0, tt / (d * 0.7)) ** 1.6 * np.minimum(1.0, (d - tt) / 0.25)
    return (x * env)[:, None]


def knock(f, d, seed, bright=0.5):
    r = np.random.default_rng(seed)
    tt = t_(d)
    x = np.sin(2 * np.pi * f * tt) * np.exp(-tt / (d * 0.18))
    x += 0.5 * np.sin(2 * np.pi * f * 2.3 * tt) * np.exp(-tt / (d * 0.1))
    x += bright * r.standard_normal(len(tt)) * np.exp(-tt / 0.004)
    return x.astype(np.float32)


def pebble_tap():
    x = np.zeros(int(0.5 * SR), dtype=np.float32)
    # through the leaves (a short rustle), then the knock on a branch, a smaller bounce
    rs = stft_filter(rng.standard_normal(int(0.18 * SR)).astype(np.float32), lambda t2, f: band(f, 3500, 0.9))
    rs *= np.sin(np.pi * t_(0.18) / 0.18)
    x[:len(rs)] += rs * 0.5
    k1 = knock(620, 0.12, 1, 0.8); i = int(0.12 * SR); x[i:i + len(k1)] += k1
    k2 = knock(700, 0.08, 2, 0.5); i = int(0.27 * SR); x[i:i + len(k2)] += k2 * 0.4
    return x[:, None]


def silk_snap():
    tt = t_(0.18)
    f = 2400 * np.exp(-tt * 9)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.03)
    x += rng.standard_normal(len(tt)) * np.exp(-tt / 0.003) * 0.6
    return x.astype(np.float32)[:, None]


def cocoon_tick():
    x = np.zeros(int(0.22 * SR), dtype=np.float32)
    for k, at in enumerate([0.0, 0.085]):
        c = knock(1500 + k * 300, 0.05, 5 + k, 1.0)
        i = int(at * SR); x[i:i + len(c)] += c * (1.0 - 0.3 * k)
    return x[:, None]


def harden_clink():
    tt = t_(0.5)
    x = np.zeros_like(tt)
    for ratio, a, dk in [(1, 1, 0.12), (2.76, 0.5, 0.07), (5.4, 0.3, 0.04)]:
        x += a * np.sin(2 * np.pi * 1700 * ratio * tt) * np.exp(-tt / dk)
    x += rng.standard_normal(len(tt)) * np.exp(-tt / 0.002) * 0.4
    return x.astype(np.float32)[:, None]


def spot_ping():
    tt = t_(0.35)
    f = 1200 + 500 * np.minimum(1.0, tt / 0.06)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.09) * np.minimum(1.0, tt / 0.004)
    x += 0.3 * np.sin(2 * np.pi * np.cumsum(f * 2) / SR) * np.exp(-tt / 0.05)
    return x.astype(np.float32)[:, None]


def write(path, x):
    x = x / max(1e-6, np.abs(x).max()) * 10 ** (-1.0 / 20)
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with tempfile.TemporaryDirectory() as td:
        wp = os.path.join(td, 'x.wav')
        with wave.open(wp, 'wb') as f:
            f.setnchannels(pcm.shape[1]); f.setsampwidth(2); f.setframerate(SR)
            f.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wp, '-c:a', 'libvorbis', '-q:a', '4', str(path)], check=True)


def main():
    cat_p = OUT / 'catalog.json'
    cat = json.loads(cat_p.read_text())
    one = {'pitch': [0.95, 1.05], 'vjit': 1.5, 'loop': False, 'voices': 3, 'bus': 'SFX'}
    made = {
        'amb_forest': (amb_forest(), {'cat': 'nature', 'vol': -3.0, 'pitch': [1, 1], 'vjit': 0, 'mode': '2d', 'dist': 30.0, 'unit': 3.0, 'loop': True, 'voices': 2, 'bus': 'Ambience', 'tags': ['nature', 'forest', 'ambience', 'leaves']}),
        'hive_buzz': (hive_buzz(), {'cat': 'nature', 'vol': -2.0, 'pitch': [1, 1], 'vjit': 0, 'mode': '3d', 'dist': 34.0, 'unit': 4.0, 'loop': True, 'voices': 2, 'bus': 'Ambience', 'tags': ['nature', 'hive', 'buzz', 'beedrill']}),
        'beedrill_buzz': (beedrill_buzz(), dict(one, cat='creatures', vol=-3.0, mode='3d', dist=30.0, unit=3.0, voices=4, tags=['creatures', 'beedrill', 'buzz', 'wings'])),
        'beedrill_swarm': (beedrill_swarm(), dict(one, cat='creatures', vol=0.0, mode='2d', dist=50.0, unit=6.0, voices=1, tags=['creatures', 'beedrill', 'swarm'])),
        'pebble_tap': (pebble_tap(), dict(one, cat='nature', vol=-2.0, mode='3d', dist=24.0, unit=3.0, tags=['nature', 'pebble', 'knock'])),
        'silk_snap': (silk_snap(), dict(one, cat='creatures', vol=-4.0, mode='3d', dist=16.0, unit=2.0, tags=['creatures', 'silk', 'snap'])),
        'cocoon_tick': (cocoon_tick(), dict(one, cat='creatures', vol=-6.0, mode='3d', dist=16.0, unit=2.0, tags=['creatures', 'cocoon', 'click'])),
        'harden_clink': (harden_clink(), dict(one, cat='creatures', vol=-6.0, mode='3d', dist=20.0, unit=2.0, tags=['creatures', 'harden', 'clink'])),
        'spot_ping': (spot_ping(), dict(one, cat='ui', vol=-8.0, mode='2d', dist=30.0, unit=3.0, voices=2, tags=['ui', 'alert', 'spot'])),
    }
    for sid, (x, m) in made.items():
        if m['mode'] == '3d': x = x.mean(axis=1, keepdims=True)
        rel = '%s/%s_1.ogg' % (m['cat'], sid)
        write(OUT / rel, x)
        e = {'id': sid, 'category': m['cat'], 'vol': m['vol'], 'pitch': m['pitch'], 'vjit': m['vjit'], 'mode': m['mode'], 'dist': m['dist'],
             'unit': m['unit'], 'loop': m['loop'], 'voices': m['voices'], 'bus': m['bus'], 'gap': 0.0, 'tags': m['tags'],
             'source': ['original'], 'license': LIC, 'files': [rel]}
        cat['sounds'] = [s for s in cat['sounds'] if s['id'] != sid]
        idx = max([i for i, s in enumerate(cat['sounds']) if s.get('category') == m['cat']] + [-1]) + 1
        cat['sounds'].insert(idx, e)
        print('made', rel)
    cat_p.write_text(json.dumps(cat, indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
