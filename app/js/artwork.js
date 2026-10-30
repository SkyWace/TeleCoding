/*
 * Couleurs des cartes et du halo, à partir de l'icône d'une appli.
 *
 * Portage JavaScript du mode « uniform tiles » du launcher CleanYourTV
 * (launcher/app/src/main/java/com/gathin/tvhome/AppAdapter.java : dominantColor,
 * backdrop, iconPlate, plateColor, mix), © 2026 Gathin, licence MIT
 * (voir THIRD_PARTY_NOTICES.md). Sur Samsung, les applis n'ont pas de bannière
 * comme sous Android TV : seulement une icône, d'où ce mode.
 */
(function (global) {
    'use strict';

    var TC = global.TC = global.TC || {};
    var doc = global.document;

    /** Part de la hauteur de la carte occupée par l'icône (ICON_SHARE). */
    var ICON_SHARE = 0.62;
    var GREY = [110, 110, 115]; // 0xFF6E6E73

    // Dessine l'icône en n×n et renvoie ses pixels. Lève une erreur si le canvas est protégé.
    function pixels(img, n) {
        var c = doc.createElement('canvas');
        c.width = c.height = n;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, n, n);
        return ctx.getImageData(0, 0, n, n).data;
    }

    function rgbToHsv(r, g, b) {
        var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, hh = 0;
        if (d) {
            if (max === r) hh = ((g - b) / d) % 6;
            else if (max === g) hh = (b - r) / d + 2;
            else hh = (r - g) / d + 4;
            hh *= 60;
            if (hh < 0) hh += 360;
        }
        return [hh, max ? d / max : 0, max / 255];
    }

    function hsvToRgb(hh, s, v) {
        var c = v * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
        if (hh < 60) { r = c; g = x; } else if (hh < 120) { r = x; g = c; } else if (hh < 180) { g = c; b = x; }
        else if (hh < 240) { g = x; b = c; } else if (hh < 300) { r = x; b = c; } else { r = c; b = x; }
        return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    }

    /**
     * La couleur qui couvre la plus grande partie de l'icône : un petit badge saturé
     * ne doit pas l'emporter. Gris si l'icône est monochrome.
     */
    function dominantColor(img) {
        var n = 24, d = pixels(img, n);
        var weight = [], sum = [];
        for (var k = 0; k < 12; k++) { weight[k] = 0; sum[k] = [0, 0, 0]; }
        for (var i = 0; i < n * n; i++) {
            var r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
            if (d[i * 4 + 3] < 128) continue;
            var hsv = rgbToHsv(r, g, b);
            if (hsv[1] < 0.3 || hsv[2] < 0.25) continue; // blanc, gris et noir n'ont pas de teinte
            var bin = Math.floor(hsv[0] / 30) % 12;
            var w = hsv[1] * hsv[2];
            weight[bin] += w;
            sum[bin][0] += r * w; sum[bin][1] += g * w; sum[bin][2] += b * w;
        }
        var best = 0;
        for (var j = 1; j < 12; j++) if (weight[j] > weight[best]) best = j;
        if (weight[best] < n * n * 0.03) return GREY;
        var tw = weight[best];
        return [Math.round(sum[best][0] / tw), Math.round(sum[best][1] / tw), Math.round(sum[best][2] / tw)];
    }

    function median(values) {
        var s = values.slice().sort(function (a, b) { return a - b; });
        return s[Math.floor(s.length / 2)];
    }

    /** La couleur que partage la majeure partie d'une ligne ; null si la ligne n'est pas surtout du support. */
    function plateColorOfRow(row) {
        var r = [], g = [], b = [];
        for (var i = 0; i < row.length; i++) {
            if (row[i][3] < 240) continue;
            r.push(row[i][0]); g.push(row[i][1]); b.push(row[i][2]);
        }
        if (r.length < row.length * 0.9) return null;
        var mr = median(r), mg = median(g), mb = median(b);
        var sr = 0, sg = 0, sb = 0, close = 0;
        for (var j = 0; j < r.length; j++) {
            if (Math.abs(r[j] - mr) + Math.abs(g[j] - mg) + Math.abs(b[j] - mb) >= 48) continue;
            sr += r[j]; sg += g[j]; sb += b[j]; close++;
        }
        if (close < row.length * 0.7) return null;
        return [Math.round(sr / close), Math.round(sg / close), Math.round(sb / close)];
    }

    function plateColor(d, y, n) {
        var inset = Math.min(y, n - 1 - y), row = [];
        for (var x = inset; x < n - inset; x++) {
            var i = (y * n + x) * 4;
            row.push([d[i], d[i + 1], d[i + 2], d[i + 3]]);
        }
        return plateColorOfRow(row);
    }

    function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

    /** a + (b - a) * t par canal ; t hors de 0..1 extrapole. */
    function mix(a, b, t) {
        return [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];
    }

    /**
     * Le support sur lequel repose le dessin de l'icône (un carré arrondi uni ou en dégradé
     * vertical), prolongé jusqu'aux bords haut et bas de la carte ; null si l'icône n'en a pas.
     */
    function iconPlate(img) {
        var n = 48, d = pixels(img, n);
        var topRow = 7, bottomRow = n - 8;
        var a = plateColor(d, topRow, n), b = plateColor(d, bottomRow, n);
        if (!a && b) a = plateColor(d, topRow = 10, n);
        else if (!b && a) b = plateColor(d, bottomRow = n - 11, n);
        if (!a || !b) return null;
        var margin = (1 - ICON_SHARE) / 2;
        var yA = margin + ICON_SHARE * topRow / n, yB = margin + ICON_SHARE * bottomRow / n;
        var t0 = -yA / (yB - yA), t1 = (1 - yA) / (yB - yA);
        if (topRow !== 7 || bottomRow !== n - 8) {
            t0 = Math.max(-0.35, t0);
            t1 = Math.min(1.35, t1);
        }
        return [mix(a, b, t0), mix(a, b, t1)];
    }

    /**
     * Le fond de la carte : la couleur du support de l'icône s'il y en a un, sinon un dégradé
     * de sa couleur principale, assombri pour que le dessin ressorte.
     */
    function backdrop(img, fallback) {
        var plate = iconPlate(img);
        if (plate) return plate;
        var hsv = rgbToHsv(fallback[0], fallback[1], fallback[2]);
        // Un jaune assombri vire au kaki : on le pousse vers l'ambre.
        if (hsv[0] > 42 && hsv[0] < 70 && hsv[1] > 0.3) hsv[0] = 36;
        hsv[2] = Math.min(hsv[2], 0.62);
        var top = hsvToRgb(hsv[0], hsv[1], hsv[2]);
        return [top, hsvToRgb(hsv[0], hsv[1], hsv[2] * 0.6)];
    }

    // Couleurs déjà calculées, gardées d'un lancement à l'autre : le démarrage ne relit plus les icônes.
    var CACHE_KEY = 'telecoding.artwork.v1';
    var cache = {};
    try { cache = JSON.parse(global.localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
    var saveTimer = null;
    function remember(key, value) {
        cache[key] = value;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            try { global.localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* stockage plein */ }
        }, 1500);
    }

    /** { glow, backdrop: [haut, bas] } pour une icône chargée, ou null si elle est illisible. */
    function analyze(img) {
        var src = img.getAttribute('src') || '';
        var key = src.indexOf('data:') === 0 ? null : src; // pas de clé pour les icônes d'aperçu
        if (key && cache[key]) return cache[key];
        try {
            var glow = dominantColor(img);
            var out = { glow: glow, backdrop: backdrop(img, glow) };
            if (key) remember(key, out);
            return out;
        } catch (e) {
            return null; // canvas protégé : la carte garde son fond par défaut
        }
    }

    TC.artwork = { analyze: analyze, ICON_SHARE: ICON_SHARE, GREY: GREY };
})(this);
