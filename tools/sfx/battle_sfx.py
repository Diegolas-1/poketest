#!/usr/bin/env python3
# The battle's own sounds (battle/battle.gd), made from scratch with numpy only
# (no scipy needed: the filters are done on short overlapping FFT frames), and
# added to native/audio/sfx/catalog.json under the "battle" category:
#   gust_vortex   Gust's wind: a roaring, swirling whoosh that builds, pulses with
#                 the wing beats (three a second) and tears past at the end
#   sand_spray    a hiss of grit: sand kicked up and thrown
#   python3 tools/sfx/battle_sfx.py        (needs ffmpeg with libvorbis)
import json, subprocess, wave, tempfile, os
from pathlib import Path
import numpy as np

SR = 44100
ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / 'native' / 'audio' / 'sfx'
LIC = 'CC0 1.0 (original, made for this game: tools/sfx/battle_sfx.py)'
rng = np.random.default_rng(42)


def stft_filter(x, gain_fn, n=2048, hop=512):
    """gain_fn(t_seconds, freqs) -> gains per bin; overlap-add with a Hann window"""
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
    # a soft band-pass bump (log-frequency gaussian)
    lf = np.log2(np.maximum(freqs, 20.0) / fc)
    return np.exp(-(lf * lf) / (2.0 * (1.0 / q) ** 2))


def gust(d=2.4):
    n = int(d * SR)
    t = np.arange(n) / SR
    w = rng.standard_normal(n).astype(np.float32)
    # the centre sweeps up as it builds, a wobble round it (the swirl), beats push it
    def g(tt, f):
        u = tt / d
        build = min(1.0, u / 0.55)
        fc = 300 + 1500 * build ** 1.5 + 380 * np.sin(tt * 2 * np.pi * 1.7)
        beat = 0.5 + 0.5 * np.sin(tt * 2 * np.pi * 3.2)
        fc *= 1.0 + 0.35 * beat
        low = band(f, 140 + 60 * build, 1.2) * 0.8
        return band(f, fc, 1.6) + band(f, fc * 2.3, 2.5) * 0.45 + low
    y = stft_filter(w, g)
    # loudness: swells in, pulses with the beats, a peak as it tears past (~1.6 s), dies away
    u = t / d
    env = np.clip(u / 0.5, 0, 1) ** 1.3 * (0.75 + 0.25 * np.sin(t * 2 * np.pi * 3.2) ** 2)
    env *= 1.0 + 1.1 * np.exp(-((t - 1.6) / 0.16) ** 2)
    env *= np.clip((d - t) / 0.55, 0, 1)
    y = y * env
    # a stereo swirl: the wind pans round
    pan = 0.5 + 0.35 * np.sin(t * 2 * np.pi * 1.1)
    st = np.stack([y * np.sqrt(1 - pan), y * np.sqrt(pan)], axis=1)
    return st


def sand(d=0.75):
    n = int(d * SR)
    t = np.arange(n) / SR
    w = rng.standard_normal(n).astype(np.float32)
    # grains: sparse clicks on top of a bright hiss
    grains = (rng.random(n) < 0.012).astype(np.float32) * rng.standard_normal(n).astype(np.float32) * 3.0
    y = stft_filter(w * 0.6 + grains, lambda tt, f: band(f, 4200 + 1500 * (tt / d), 1.1) + band(f, 9000, 1.5) * 0.6, n=1024, hop=256)
    env = np.clip(t / 0.03, 0, 1) * np.exp(-t / 0.32)
    y = y * env
    return np.stack([y, y], axis=1)


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
    made = {
        'gust_vortex': (gust(), {'vol': -2.0, 'pitch': [0.95, 1.05], 'vjit': 1.0, 'mode': '3d', 'dist': 40.0, 'unit': 6.0, 'voices': 2,
                                 'tags': ['battle', 'wind', 'gust', 'vortex']}),
        'sand_spray': (sand(), {'vol': -4.0, 'pitch': [0.9, 1.15], 'vjit': 2.0, 'mode': '3d', 'dist': 25.0, 'unit': 3.0, 'voices': 3,
                                'tags': ['battle', 'sand', 'spray', 'grit']}),
    }
    for sid, (x, meta) in made.items():
        if meta['mode'] == '3d': x = x.mean(axis=1, keepdims=True)   # (3D one-shots are mono, as the library's)
        rel = 'battle/%s_1.ogg' % sid
        write(OUT / rel, x)
        e = {'id': sid, 'category': 'battle', 'vol': meta['vol'], 'pitch': meta['pitch'], 'vjit': meta['vjit'], 'mode': meta['mode'],
             'dist': meta['dist'], 'unit': meta['unit'], 'loop': False, 'voices': meta['voices'], 'bus': 'SFX', 'gap': 0.0,
             'tags': meta['tags'], 'source': ['original'], 'license': LIC, 'files': [rel]}
        cat['sounds'] = [s for s in cat['sounds'] if s['id'] != sid]
        # after the other battle sounds
        idx = max([i for i, s in enumerate(cat['sounds']) if s.get('category') == 'battle'] + [-1]) + 1
        cat['sounds'].insert(idx, e)
        print('made', rel)
    cat_p.write_text(json.dumps(cat, indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
