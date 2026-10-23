"""Build the soundtrack: score (MusicXML, PDF), audio, game files.

  python3 tools/music/build.py [pallet|night|lab ...] [--preview DIR] [--no-score | --score-only]

Needs: the VSCO 2 CE sample library with its SFZ files (env VSCO, default
/tmp/claude-0/samples/vsco: a checkout of github.com/sgossner/VSCO-2-CE
master with the SFZ branch's *.sfz files in an `sfz` folder), python3 with
numpy, scipy, soundfile, pedalboard, pyloudnorm, music21, matplotlib;
ffmpeg; lilypond (musicxml2ly) for the PDF score.

Writes native/audio/music/<id>.ogg (+ .ogg.import with the loop point) and
tools/music/scores/<id>.musicxml.

Sample credits: VSCO 2 Community Edition by Versilian Studios (Sam Gossner,
Simon Dalzell), "use for ANY purpose" (CC0-style terms), vis.versilstudios.net.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(os.path.dirname(HERE))

import numpy as np  # noqa: E402

import render  # noqa: E402
import score  # noqa: E402

GAME = os.path.join(ROOT, 'native', 'audio', 'music')
SCORES = os.path.join(HERE, 'scores')

PIECES = {
    'pallet': ('pallet_town', 'Pallet Town: Hometown by the Sea', 2, 84),
    'night': ('pallet_town_night', 'Pallet Town: Evening Tide', 2, 70),
    'lab': ('oak_lab', "Professor Oak's Lab: Curious Minds", 1, 100),
}

IMPORT = """[remap]

importer="oggvorbisstr"
type="AudioStreamOggVorbis"

[params]

loop=true
loop_offset={offset}
bpm=0
beat_count=0
bar_beats=4
"""


def write_import(ogg, offset):
    """Loop on import with the loop offset (seconds). Keeps the uid and paths
    Godot wrote when the file exists; Godot fills them in on its next import."""
    import re
    path = ogg + '.import'
    if os.path.exists(path):
        t = open(path).read()
        t = re.sub(r'(?m)^loop=.*$', 'loop=true', t)
        t = re.sub(r'(?m)^loop_offset=.*$', 'loop_offset=%s' % offset, t)
    else:
        t = IMPORT.format(offset=offset)
    open(path, 'w').write(t)


def load(which):
    if which == 'pallet':
        import pallet_town as m
        P, tempo, ls, le = m.build()
        return P, tempo, ls, le, m.SEATS
    if which == 'night':
        import pallet_town as m
        P, tempo, ls, le = m.build(night=True)
        return P, tempo, ls, le, m.SEATS
    if which == 'lab':
        import oak_lab as m
        P, tempo, ls, le = m.build()
        return P, tempo, ls, le, m.SEATS


def spectrogram(wav, png, title):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import soundfile as sf
    x, sr = sf.read(wav)
    m = x.mean(1)
    fig, ax = plt.subplots(3, 1, figsize=(12, 8), gridspec_kw=dict(height_ratios=[3, 1, 1]))
    ax[0].specgram(m, NFFT=4096, Fs=sr, noverlap=2048, cmap='magma', vmin=-130)
    ax[0].set_ylim(0, 16000)
    ax[0].set_title(title)
    t = np.arange(len(m)) / sr
    ax[1].plot(t[::200], x[::200, 0], lw=.3)
    ax[1].plot(t[::200], x[::200, 1], lw=.3)
    ax[1].set_xlim(0, t[-1])
    # stereo: correlation over time
    w = sr
    cor = [np.corrcoef(x[i:i + w, 0], x[i:i + w, 1])[0, 1] for i in range(0, len(x) - w, w)]
    ax[2].plot(cor)
    ax[2].set_ylim(-1, 1)
    ax[2].set_ylabel('L/R corr')
    fig.tight_layout()
    fig.savefig(png, dpi=90)
    plt.close(fig)


def seam_check(wav, offset_s):
    """Compare the end of the file with the loop start: the jump should look
    like any other pair of neighbouring samples."""
    import soundfile as sf
    x, sr = sf.read(wav)
    o = int(round(offset_s * sr))
    jump = np.abs(x[0 + o] - x[-1]).max()
    steps = np.abs(np.diff(x, axis=0)).max(1)
    return float(jump), float(np.percentile(steps, 99.9)), float(steps.max())


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    prev = None
    if '--preview' in sys.argv:
        prev = sys.argv[sys.argv.index('--preview') + 1]
        args = [a for a in args if a != prev]
        os.makedirs(prev, exist_ok=True)
    which = args or ['pallet', 'lab', 'night']
    os.makedirs(GAME, exist_ok=True)
    os.makedirs(SCORES, exist_ok=True)
    work = os.environ.get('MUSIC_WORK', '/tmp/claude-0/music-work')
    os.makedirs(work, exist_ok=True)
    for w in which:
        name, title, sharps, bpm = PIECES[w]
        P, tempo, ls, le, seats = load(w)
        print(name, 'parts', len(P))
        if '--no-score' not in sys.argv:
            xml = os.path.join(SCORES, name + '.musicxml')
            score.to_musicxml(title, P, xml, tempo=bpm, key_sharps=sharps)
            if prev:
                try:
                    subprocess.run(['musicxml2ly', '-o', os.path.join(work, name + '.ly'), xml], check=True, capture_output=True)
                    subprocess.run(['lilypond', '-o', os.path.join(prev, name + '_score'), os.path.join(work, name + '.ly')], check=True, capture_output=True)
                except subprocess.CalledProcessError as e:
                    print('  score pdf failed:', (e.stderr or b'')[-400:])
        if '--score-only' in sys.argv:
            continue
        info = render.render_piece(name, P, tempo, ls, le, work, seats)
        ogg = os.path.join(GAME, name + '.ogg')
        render.to_ogg(info['wav'], ogg, q=6)
        write_import(ogg, '%.6f' % info['intro_s'])
        jump, p999, mx = seam_check(info['wav'], info['intro_s'])
        print('  %s: %.1f s (intro %.2f s, loop %.2f s), %.1f LUFS, ogg %.0f kB, seam jump %.4f (99.9%% step %.4f, max %.4f)' % (
            name, info['total_s'], info['intro_s'], info['loop_s'], info['lufs'], os.path.getsize(ogg) / 1024, jump, p999, mx))
        if prev:
            render.to_mp3(info['wav'], os.path.join(prev, name + '.mp3'))
            spectrogram(info['wav'], os.path.join(prev, name + '_spectrogram.png'), title)
            # the seam: last 4 s then the loop start, as heard in the game
            import soundfile as sf
            x, sr = sf.read(info['wav'])
            o = int(round(info['intro_s'] * sr))
            seam = np.concatenate([x[-4 * sr:], x[o:o + 4 * sr]])
            sf.write(os.path.join(work, name + '_seam.wav'), seam, sr)
            render.to_mp3(os.path.join(work, name + '_seam.wav'), os.path.join(prev, name + '_loop_seam.mp3'))


if __name__ == '__main__':
    main()
