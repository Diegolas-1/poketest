#!/usr/bin/env python3
# Downloads the CC0 packs tools/sfx/build.py reads into <dir>: Kenney's audio
# packs (kenney/<pack>/) and the OpenGameArt submissions in sources.json
# (oga/<slug>/), unpacked.   python3 tools/sfx/fetch.py <dir>
import json, re, sys, zipfile, urllib.request, urllib.parse
from pathlib import Path
HERE = Path(__file__).resolve().parent
S = json.loads((HERE / 'sources.json').read_text())
out = Path(sys.argv[1])
UA = {'User-Agent': 'curl/8.5.0'}


def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=300).read()


def unpack(p, d):
    if p.suffix == '.zip': zipfile.ZipFile(p).extractall(d)
    elif p.suffix == '.7z':
        import py7zr   # pip install py7zr
        py7zr.SevenZipFile(p).extractall(d)


for pack, page in S['kenney'].items():
    d = out / 'kenney' / pack
    if d.exists(): continue
    d.mkdir(parents=True)
    u = re.search(r'https://kenney\.nl/media/pages/assets/[^"\']*\.zip', get(page).decode('utf8', 'replace')).group(0)
    p = d / 'pack.zip'
    p.write_bytes(get(u)); unpack(p, d)
    print('kenney', pack)
for slug, s in S['oga'].items():
    d = out / 'oga' / slug
    if d.exists(): continue
    d.mkdir(parents=True)
    for u in s['files']:
        p = d / urllib.parse.unquote(u.rsplit('/', 1)[-1])
        p.write_bytes(get(u)); unpack(p, d)
    print('oga', slug)
