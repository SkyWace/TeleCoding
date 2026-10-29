#!/usr/bin/env python3
"""
Récupère les logos officiels des applis sur Wikimedia Commons, en ne gardant que les
fichiers dont la fiche indique une licence libre (logo texte du domaine public, CC0…).

    python3 -I tools/fetch-wikimedia-logos.py candidats.json

candidats.json : { "clé": ["Nom de fichier Commons.svg", ...], ... }
Écrit logos/<clé>.svg et logos/found.json (fichier, licence, adresse de la fiche).
Le résultat utilisé par TeleCoding est dans app/logos/ et tools/wikimedia-logos.json.
"""
import hashlib, re, sys, time, urllib.request, urllib.parse, json, os
UA = "TeleCoding/1.0 (https://github.com/SkyWace/TeleCoding; logo fetch)"
PD = re.compile(r"\{\{\s*(PD-textlogo|PD-text|PD-shape|PD-simple|PD-ineligible|PD-logo|CC-zero|Cc-zero|PD-trivial|PD-geometry|PD-font)", re.I)
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.read()
    except Exception as e: return None
def raw(name):
    for _ in range(3):
        t = get("https://commons.wikimedia.org/w/index.php?title=" + urllib.parse.quote("File:" + name) + "&action=raw")
        time.sleep(1.2)
        if t is None: return None, name
        t = t.decode("utf8", "replace")
        m = re.match(r"#REDIRECT\s*\[\[\s*(?:File|Fichier):([^\]]+)\]\]", t, re.I)
        if m: name = m.group(1).strip(); continue
        return t, name
    return None, name
def file_url(name):
    n = name.replace(" ", "_"); h = hashlib.md5(n.encode()).hexdigest()
    return "https://upload.wikimedia.org/wikipedia/commons/%s/%s/%s" % (h[0], h[:2], urllib.parse.quote(n))
cands = json.load(open(sys.argv[1]))
out = {}
for key, names in cands.items():
    for name in names:
        t, real = raw(name)
        if not t: print("  -", key, name, "absent"); continue
        lic = PD.search(t)
        if not lic: print("  x", key, real, "licence non libre:", re.findall(r"\{\{([^}|]+)", t.split("license-header")[-1])[:3]); continue
        data = get(file_url(real)); time.sleep(1)
        if not data: print("  ?", key, real, "téléchargement raté"); continue
        ext = real.rsplit(".", 1)[-1].lower()
        path = "logos/%s.%s" % (key, ext)
        open(path, "wb").write(data)
        out[key] = {"file": real, "license": lic.group(1), "url": "https://commons.wikimedia.org/wiki/File:" + real.replace(" ", "_"), "local": path}
        print("OK", key, real, lic.group(1), len(data)); break
json.dump(out, open("logos/found.json", "w"), indent=1, ensure_ascii=False)
