"""Build the Pallet Town soundtrack (the town's OST) from one recorded song.

  python3 tools/music/ost.py [dawn|morning|day|evening|night ...] [--preview DIR]

Source: tools/music/sources/pallet_town_better_sound.mp3 (2:46, G major,
110 bpm, 4/4; the user's own recording). It is split into stems with Demucs
(htdemucs_6s: drums, bass, piano, other; guitar, vocals and whatever the
model leaves out are folded into "other", so the stems add back up to the
recording exactly), cut into 8-bar phrases on the song's bar grid, and
re-arranged into five long versions, one per part of the day (clock.gd
periods):

  dawn     pallet_ost_dawn.ogg      5-7 AM    92 bpm, piano and pads waking up
  morning  pallet_ost_morning.ogg   7-11 AM   110 bpm, light percussion, bright
  day      pallet_ost_day.ogg       11 AM-6 PM  110 bpm, the full song, long form
  evening  pallet_ost_evening.ogg   6-9 PM    100 bpm, soft drums, warm and mellow
  night    pallet_ost_night.ogg     9 PM-5 AM  82 bpm, no drums, dark and roomy

Phrases of the song (bars counted from its first downbeat, 8 bars each):
  P  0   solo piano over the verse chords (G C | G Em | C D | G D ...)
  C  8   the band without drums, the second theme (C D | Em | C Cm ...)
  A1 16  verse, full band          B1 24  answer (C Cm | G | Am Em ...)
  A2 32  verse                     C2 40  second theme with drums
  A3 48  verse                     B3 56  answer
Any verse can follow a B or C phrase and lead into one; P is a verse.

Each phrase of a plan is one or more layers (source phrase + stem gains).
Phrases are joined on the bar line with a 30 ms crossfade; a stem that drops
out lets its source ring on for half a beat (the next downbeat's hit, then
out). The loop body is laid down three times after the intro, the tempo
change (Rubber Band, per stem: crisp drums, smooth pads), hall and master run
over that continuous signal, and the second pass becomes the loop in the file
(file = intro + loop, as in build.py), so the seam is the same audio as the
inside of the piece.

Needs: python3 with numpy, scipy, soundfile, librosa, pedalboard, pyloudnorm,
matplotlib, demucs (torch, CPU is fine: about a minute); ffmpeg.
Writes native/audio/music/pallet_ost_<id>.ogg (+ .ogg.import with the loop
point). The orchestral themes (pallet_town*.ogg) stay in the game folder.
"""
import hashlib
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, sosfiltfilt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build  # noqa: E402  (write_import, seam_check, spectrogram)
import render  # noqa: E402  (hall_ir, reverb, loudness, to_ogg, to_mp3)
from sfz import SR  # noqa: E402  (44100, Demucs' own rate)

SRC = os.path.join(HERE, 'sources', 'pallet_town_better_sound.mp3')
WORK = os.environ.get('MUSIC_WORK', '/tmp/claude-0/music-work')

BPM = 110.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
GRID0 = 0.060          # the first downbeat in the recording (s)
PHRASE = 8             # bars

SRC_BAR = {'P': 0, 'C': 8, 'A1': 16, 'B1': 24, 'A2': 32, 'C2': 40, 'A3': 48, 'B3': 56}
GROUPS = ['drums', 'bass', 'other', 'piano']     # stretched one by one

# textures: stem -> gain. kit = the drums as recorded, hats = the drums above
# 5 kHz (hi-hat, shaker, the snare's sizzle), brush = the drums below 3.5 kHz
# and softer (kick and snare body without the cymbals)
TEX = {
    'FULL': {'kit': 1.0, 'bass': 1.0, 'other': 1.0, 'piano': 1.0},
    'LIGHT': {'hats': 0.95, 'bass': 0.9, 'other': 1.0, 'piano': 1.0},
    'SOFT': {'brush': 0.5, 'hats': 0.3, 'bass': 0.9, 'other': 1.0, 'piano': 1.0},
    'NOD': {'bass': 0.9, 'other': 1.0, 'piano': 1.0},
    'LOW': {'bass': 0.55, 'other': 0.85, 'piano': 1.0},
    'AIR': {'bass': 0.3, 'other': 0.85, 'piano': 1.0},
    'PNO': {'other': 1.0, 'piano': 1.0},
}


def ph(src, tex='FULL', **over):
    """One phrase: `src` (a SRC_BAR key) with texture `tex`; keyword args
    override single stem gains (bass=0.5)."""
    g = dict(TEX[tex])
    g.update(over)
    return [(src, g)]


def pa(verse='A2', other=0.45, bass=0.6, hats=0.0):
    """The solo piano of P laid over a band verse (same chords): a piano
    feature with the band's pads and bass under it."""
    g = {'other': other, 'bass': bass}
    if hats:
        g['hats'] = hats
    return [('P', {'piano': 1.0, 'other': 0.6}), (verse, g)]


# Versions: intro phrases (played once) and the loop body.
#   bpm, transient modes, master (eq, lowpass, saturation, reverb send), LUFS
VERSIONS = {
    'day': dict(
        title='Pallet Town (day)', bpm=110,
        intro=[ph('P', 'PNO'), ph('C', 'NOD')],
        body=[ph('A1'), ph('B1'), ph('A2'), ph('C2'),
              ph('A3', 'LIGHT'), ph('B3', 'LIGHT'), ph('A1', 'NOD'), ph('C', 'NOD'),
              pa('A2', hats=0.5), ph('C2', 'LIGHT'), ph('A2'), ph('B3'),
              ph('A3'), ph('C2'), ph('A1', 'AIR'), ph('B1', 'NOD'),
              ph('A2'), ph('B1'), ph('A3'), ph('C2')],
        low_shelf=0.0, high_shelf=0.0, lowpass=None, sat=0.0, rev=0.04, width=1.0, lufs=-18.0),
    'morning': dict(
        title='Pallet Town (morning)', bpm=110,
        intro=[ph('P', 'PNO')],
        body=[ph('C', 'NOD'), ph('A1', 'LIGHT'), ph('B1', 'LIGHT'), ph('A2', 'LIGHT'),
              ph('C', 'NOD'), pa('A3', hats=0.6), ph('C2', 'LIGHT'), ph('A3', 'LIGHT'),
              ph('B3', 'NOD'), ph('A1', 'AIR'), ph('B1', 'LIGHT'), ph('A2', 'LIGHT'),
              ph('C2', 'LIGHT'), ph('A3', 'LIGHT', kit=0.35), ph('B3', 'LIGHT'), ph('A1', 'NOD')],
        low_shelf=-2.0, high_shelf=1.5, lowpass=None, sat=0.0, rev=0.08, width=1.08, lufs=-18.5),
    'evening': dict(
        title='Pallet Town (evening)', bpm=100,
        intro=[ph('P', 'PNO')],
        body=[ph('C', 'NOD'), ph('A1', 'SOFT'), ph('B1', 'SOFT'), ph('A2', 'NOD'),
              ph('C2', 'SOFT'), pa('A3'), ph('C', 'LOW'), ph('A3', 'SOFT'),
              ph('B3', 'NOD'), ph('A1', 'AIR'), ph('C', 'AIR'), ph('A2', 'SOFT'),
              ph('B1', 'SOFT'), ph('A3', 'NOD')],
        low_shelf=1.5, high_shelf=-3.0, lowpass=7500, sat=0.35, rev=0.14, width=1.0, lufs=-19.0),
    'dawn': dict(
        title='Pallet Town (dawn)', bpm=92,
        intro=[],
        body=[ph('P', 'PNO'), ph('C', 'AIR'), pa('A1', other=0.35, bass=0.35), ph('C', 'LOW'),
              ph('A1', 'AIR'), ph('B1', 'LOW'), ph('P', 'PNO'), ph('C2', 'AIR'),
              ph('A2', 'LOW', hats=0.25), ph('B3', 'AIR'), ph('A3', 'AIR'), ph('C', 'LOW'),
              pa('A2', other=0.4, bass=0.45, hats=0.2), ph('B1', 'AIR')],
        low_shelf=-1.0, high_shelf=-2.0, lowpass=6000, sat=0.2, rev=0.2, width=1.12, lufs=-20.0),
    'night': dict(
        title='Pallet Town (night)', bpm=82,
        intro=[ph('P', 'PNO')],
        body=[ph('C', 'AIR'), ph('A1', 'AIR'), pa('A2', other=0.3, bass=0.3), ph('C', 'LOW', bass=0.4),
              ph('A2', 'AIR'), ph('B1', 'AIR'), ph('P', 'PNO', other=0.7), ph('C2', 'AIR'),
              ph('A3', 'AIR'), ph('B3', 'AIR'), pa('A1', other=0.3, bass=0.25), ph('P', 'PNO', other=0.6)],
        low_shelf=0.5, high_shelf=-5.0, lowpass=3400, sat=0.3, rev=0.3, width=1.15, lufs=-20.5),
}

XF = 0.030             # crossfade at each bar-line join (s)
RING = 0.5 * BEAT      # a stem that drops out rings on this long


# ---------------------------------------------------------------- stems

def stems():
    """Load (making them once) the recording and its stems at SR, stereo
    float32. Returns {drums, bass, other, piano, mix}."""
    h = hashlib.sha1(open(SRC, 'rb').read()).hexdigest()[:10]
    d = os.path.join(WORK, 'ost-' + h)
    os.makedirs(d, exist_ok=True)
    wav = os.path.join(d, 'src.wav')
    if not os.path.exists(wav):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', SRC, '-ar', str(SR), '-ac', '2', wav], check=True)
    sd = os.path.join(d, 'htdemucs_6s', 'src')
    if not os.path.exists(os.path.join(sd, 'other.wav')):
        print('  separating stems (demucs htdemucs_6s)...')
        subprocess.run([sys.executable, '-m', 'demucs', '-n', 'htdemucs_6s', '-o', d, wav], check=True)
    mix, sr = sf.read(wav, dtype='float32')
    assert sr == SR
    S = {}
    for n in ('drums', 'bass', 'other', 'piano', 'guitar', 'vocals'):
        x, sr = sf.read(os.path.join(sd, n + '.wav'), dtype='float32')
        assert sr == SR
        S[n] = x[:len(mix)]
    rest = mix - sum(S.values())
    S['other'] = S['other'] + S.pop('guitar') + S.pop('vocals') + rest
    S['mix'] = mix
    return S


def variants(S):
    """The per-stem sources a texture can name, each with its stretch group."""
    sos_hp = butter(4, 5000 / (SR / 2), 'high', output='sos')
    sos_lp = butter(2, 3500 / (SR / 2), 'low', output='sos')
    return {
        'kit': (S['drums'], 'drums'),
        'hats': (sosfiltfilt(sos_hp, S['drums'], axis=0).astype(np.float32), 'drums'),
        'brush': (sosfiltfilt(sos_lp, S['drums'], axis=0).astype(np.float32), 'drums'),
        'bass': (S['bass'], 'bass'),
        'other': (S['other'], 'other'),
        'piano': (S['piano'], 'piano'),
    }


# ---------------------------------------------------------------- arranging

def _win(n0, n1, a, b, x0, x1):
    """Gain over output samples [x0, x1): 0 -> 1 across [n0 - a, n0 + a],
    1 -> 0 across [n1 - b, n1 + b] (raised cosine, so a join of two copies of
    the same audio adds up to exactly that audio)."""
    t = np.arange(x0, x1, dtype=np.float64)
    up = np.clip((t - (n0 - a)) / (2 * a), 0, 1) if a > 0 else (t >= n0).astype(float)
    dn = np.clip(((n1 + b) - t) / (2 * b), 0, 1) if b > 0 else (t < n1).astype(float)
    return (0.5 - 0.5 * np.cos(np.pi * up)) * (0.5 - 0.5 * np.cos(np.pi * dn))


def arrange(V, plan):
    """Lay the phrases of `plan` end to end at the song's tempo. Returns
    {group: stereo array} and the phrase start positions (samples)."""
    Lf = PHRASE * BAR * SR
    xf = int(XF * SR)
    ring = int(RING * SR)
    total = int(round(len(plan) * Lf)) + int(2 * SR)
    out = {g: np.zeros((total, 2), np.float32) for g in GROUPS}
    starts = [int(round(k * Lf)) for k in range(len(plan) + 1)]
    for k, layers in enumerate(plan):
        n0, n1 = starts[k], starts[k + 1]
        nxt = plan[k + 1] if k + 1 < len(plan) else None
        for src, gains in layers:
            s0 = int(round((GRID0 + SRC_BAR[src] * BAR) * SR))
            for stem, g in gains.items():
                if g <= 0:
                    continue
                x, grp = V[stem]
                # this stem's gain in the neighbouring phrases (any layer)
                gn = max([gg.get(stem, 0) for _, gg in nxt] or [0]) if nxt else g
                # entering: a quick fade on the bar line; leaving: ring on
                a = xf
                b = ring if gn < g * 0.5 else xf
                x0, x1 = max(0, n0 - a), min(total, n1 + b)
                w = _win(n0, n1, a, b, x0, x1).astype(np.float32)
                i0 = s0 + (x0 - n0)
                seg = np.zeros((x1 - x0, 2), np.float32)
                j0, j1 = max(i0, 0), min(i0 + (x1 - x0), len(x))
                if j1 > j0:
                    seg[j0 - i0:j1 - i0] = x[j0:j1]
                out[grp][x0:x1] += seg * (w[:, None] * g)
    return out, starts


# ---------------------------------------------------------------- mastering

def stretch(x, factor, mode):
    import pedalboard as pb
    if abs(factor - 1) < 1e-6:
        return x
    y = pb.time_stretch(x.T.astype(np.float32), SR, stretch_factor=factor, high_quality=True,
                        transient_mode=mode, retain_phase_continuity=True, preserve_formants=True)
    return y.T.astype(np.float32)


def master(x, cfg):
    import pedalboard as pb
    fx = [pb.HighpassFilter(cutoff_frequency_hz=28)]
    if cfg['low_shelf']:
        fx.append(pb.LowShelfFilter(cutoff_frequency_hz=180, gain_db=cfg['low_shelf'], q=0.7))
    if cfg['high_shelf']:
        fx.append(pb.HighShelfFilter(cutoff_frequency_hz=5000, gain_db=cfg['high_shelf'], q=0.6))
    y = pb.Pedalboard(fx)(x.T.astype(np.float32), SR).T
    if cfg['lowpass']:
        # 12 dB/oct, the top of the room rolled away (pedalboard's is 6 dB/oct)
        y = sosfilt(butter(2, cfg['lowpass'] / (SR / 2), 'low', output='sos'), y, axis=0)
    if cfg['sat']:
        # tape-style soft knee with a touch of 2nd harmonic, level matched
        d = 1 + 3 * cfg['sat']
        r = np.sqrt(np.mean(y ** 2)) + 1e-9
        z = np.tanh(d * y / (4 * r)) * (4 * r) / d
        z = z + 0.02 * cfg['sat'] * (z ** 2) / (r * 4)
        z -= z.mean(0)
        y = (1 - cfg['sat']) * y + cfg['sat'] * z
    if cfg['width'] != 1.0:
        m, s = (y[:, 0] + y[:, 1]) / 2, (y[:, 0] - y[:, 1]) / 2
        s = s * cfg['width']
        y = np.stack([m + s, m - s], 1)
    if cfg['rev']:
        ir = render.hall_ir(seconds=3.6, rt_low=2.8, rt_mid=2.3, rt_high=1.2, seed=11)
        y = y + render.reverb(y.astype(np.float32), ir) * cfg['rev']
    return y.astype(np.float32)


def build_version(name, S, V, cfg):
    intro, body = cfg['intro'], cfg['body']
    reps = 3
    plan = intro + body * reps + body[:1]
    f = cfg['bpm'] / BPM
    # the arranged, stretched mix is cached by plan and tempo (the stretch is
    # the slow part), so trying another master is quick
    key = hashlib.sha1(repr((plan, cfg['bpm'], XF, RING, GRID0)).encode()).hexdigest()[:12]
    cache = os.path.join(WORK, 'ost-mix-%s-%s.npy' % (name, key))
    starts = [int(round(k * PHRASE * BAR * SR)) for k in range(len(plan) + 1)]
    if os.path.exists(cache):
        mix = np.load(cache)
    else:
        groups, starts = arrange(V, plan)
        modes = {'drums': 'crisp', 'bass': 'mixed', 'other': 'smooth', 'piano': 'mixed'}
        mix = None
        for g in GROUPS:
            y = stretch(groups[g], f, modes[g])
            mix = y if mix is None else mix[:min(len(mix), len(y))] + y[:min(len(mix), len(y))]
        np.save(cache, mix)
    m = master(mix, cfg)
    pos = [int(round(n / f)) for n in starts]
    ni, nb = len(intro), len(body)
    a = pos[ni + nb]              # the second pass of the body
    e = pos[ni + 2 * nb]
    body_a = m[a:e].copy()
    F = int(0.06 * SR)
    w = np.linspace(0, 1, F)[:, None].astype(np.float32)
    # the loop's end blends into the audio that comes before its start in a
    # steady pass, so the jump back is continuous (Rubber Band's phases make
    # the passes alike but not sample-identical)
    body_a[-F:] = body_a[-F:] * (1 - w) + m[a - F:a] * w
    if ni:
        head = m[:pos[ni]].copy()
        # the intro's last 60 ms blend into what comes before a loop pass
        head[-F:] = head[-F:] * (1 - w) + m[a - F:a] * w
        out = np.concatenate([head, body_a])
        intro_n = len(head)
    else:
        out = body_a
        intro_n = 0
    out, l0, l1 = render.loudness(out, target=cfg['lufs'])
    os.makedirs(WORK, exist_ok=True)
    wav = os.path.join(WORK, 'pallet_ost_%s.wav' % name)
    sf.write(wav, out, SR, subtype='FLOAT')
    return dict(wav=wav, intro_s=intro_n / SR, loop_s=len(body_a) / SR, total_s=len(out) / SR, lufs=l1)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    prev = None
    if '--preview' in sys.argv:
        prev = sys.argv[sys.argv.index('--preview') + 1]
        args = [a for a in args if a != prev]
        os.makedirs(prev, exist_ok=True)
    which = args or list(VERSIONS)
    S = stems()
    V = variants(S)
    os.makedirs(build.GAME, exist_ok=True)
    for w in which:
        cfg = VERSIONS[w]
        info = build_version(w, S, V, cfg)
        name = 'pallet_ost_' + w
        ogg = os.path.join(build.GAME, name + '.ogg')
        render.to_ogg(info['wav'], ogg, q=5)
        build.write_import(ogg, '%.6f' % info['intro_s'])
        jump, p999, mx = build.seam_check(info['wav'], info['intro_s'])
        print('  %s: %d:%02d (intro %.2f s, loop %d:%02d), %.1f LUFS, ogg %.0f kB, seam jump %.4f (99.9%% step %.4f, max %.4f)' % (
            name, info['total_s'] // 60, info['total_s'] % 60, info['intro_s'], info['loop_s'] // 60, info['loop_s'] % 60,
            info['lufs'], os.path.getsize(ogg) / 1024, jump, p999, mx))
        if prev:
            render.to_mp3(info['wav'], os.path.join(prev, name + '.mp3'))
            build.spectrogram(info['wav'], os.path.join(prev, name + '_spectrogram.png'), cfg['title'])
            x, sr = sf.read(info['wav'])
            o = int(round(info['intro_s'] * sr))
            seam = np.concatenate([x[-4 * sr:], x[o:o + 4 * sr]])
            sp = os.path.join(WORK, name + '_seam.wav')
            sf.write(sp, seam, sr)
            render.to_mp3(sp, os.path.join(prev, name + '_loop_seam.mp3'))


if __name__ == '__main__':
    main()
