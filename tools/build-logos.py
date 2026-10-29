#!/usr/bin/env python3
"""
Génère app/js/logos.js à partir du paquet npm « simple-icons » (CC0).

    npm pack simple-icons && tar xzf simple-icons-*.tgz
    python3 tools/build-logos.py package/

Chaque marque a une carte (fond, couleur du logo, couleur du nom) choisie pour
ressembler à sa bannière officielle. Les applis absentes gardent leur icône Samsung.
"""
import json
import pathlib
import re
import sys

# slug simple-icons -> (fond, logo, texte, noms reconnus)
BRANDS = {
    'netflix':       ('#000000', '#E50914', '#E50914', ['netflix']),
    'youtube':       ('#FFFFFF', '#FF0000', '#212121', ['youtube']),
    'youtubekids':   ('#FFFFFF', '#FF0000', '#212121', ['youtubekids']),
    'appletv':       ('#000000', '#FFFFFF', '#FFFFFF', ['appletv']),
    'applemusic':    ('#FA243C', '#FFFFFF', '#FFFFFF', ['applemusic']),
    'spotify':       ('#121212', '#1ED760', '#FFFFFF', ['spotify']),
    'crunchyroll':   ('#FF5E00', '#FFFFFF', '#FFFFFF', ['crunchyroll']),
    'rakuten':       ('#BF0000', '#FFFFFF', '#FFFFFF', ['rakutentv', 'rakuten']),
    'orange':        ('#000000', '#FF7900', '#FFFFFF', ['orangetv', 'orange']),
    'smartthings':   ('#15BFFF', '#FFFFFF', '#FFFFFF', ['smartthings']),
    'plex':          ('#1F1F1F', '#EBAF00', '#FFFFFF', ['plex']),
    'kodi':          ('#17B2E7', '#FFFFFF', '#FFFFFF', ['kodi']),
    'twitch':        ('#9146FF', '#FFFFFF', '#FFFFFF', ['twitch']),
    'deezer':        ('#A238FF', '#FFFFFF', '#FFFFFF', ['deezer']),
    'paramountplus': ('#0064FF', '#FFFFFF', '#FFFFFF', ['paramount', 'paramountplus']),
    'max':           ('#002BE7', '#FFFFFF', '#FFFFFF', ['max', 'hbomax']),
    'dazn':          ('#0C161C', '#F8F8F5', '#F8F8F5', ['dazn']),
}


def main(pkg):
    pkg = pathlib.Path(pkg)
    version = json.loads((pkg / 'package.json').read_text())['version']
    out = {}
    for slug, (bg, fg, text, names) in BRANDS.items():
        svg = (pkg / 'icons' / (slug + '.svg')).read_text()
        title = re.search(r'<title>(.*?)</title>', svg).group(1)
        path = re.search(r' d="([^"]+)"', svg).group(1)
        out[slug] = {'title': title, 'bg': bg, 'fg': fg, 'text': text, 'names': names, 'path': path}
    js = (
        '/*\n'
        ' * Logos des applis : tracés de Simple Icons ' + version + ' (CC0, https://simpleicons.org).\n'
        ' * Les marques restent la propriété de leurs détenteurs ; usage personnel pour identifier les applis.\n'
        ' * Fichier généré par tools/build-logos.py : ne pas modifier à la main.\n'
        ' */\n'
        '(function (global) {\n'
        "    'use strict';\n"
        '    var TC = global.TC = global.TC || {};\n'
        '    TC.LOGOS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n'
        '})(this);\n'
    )
    target = pathlib.Path(__file__).resolve().parent.parent / 'app' / 'js' / 'logos.js'
    target.write_text(js, encoding='utf-8')
    print('%d logos -> %s (%d octets)' % (len(out), target, len(js)))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'package')
