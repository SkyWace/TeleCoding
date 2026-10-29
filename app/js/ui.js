/*
 * Petits outils d'affichage : création d'éléments, cartes d'applis, halo, toasts.
 */
(function (global) {
    'use strict';

    var TC = global.TC = global.TC || {};
    var doc = global.document;

    function h(tag, attrs, children) {
        var el = doc.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            var v = attrs[k];
            if (v === null || v === undefined || v === false) return;
            if (k === 'class') el.className = v;
            else if (k === 'text') el.textContent = v;
            else if (k === 'html') el.innerHTML = v;
            else if (k.indexOf('on') === 0) el[k] = v;
            else el.setAttribute(k, v === true ? '' : v);
        });
        [].concat(children || []).forEach(function (c) {
            if (c === null || c === undefined || c === false) return;
            el.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
        });
        return el;
    }

    // Teinte stable dérivée du nom (applis sans icône lisible).
    function hue(name) {
        var x = 0;
        for (var i = 0; i < name.length; i++) x = (x * 31 + name.charCodeAt(i)) % 360;
        return x;
    }

    function hslToRgb(hh, s, l) {
        s /= 100; l /= 100;
        var k = function (n) { return (n + hh / 30) % 12; };
        var a = s * Math.min(l, 1 - l);
        var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
        return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
    }

    function css(rgb, alpha) {
        return alpha === undefined ? 'rgb(' + rgb.join(',') + ')' : 'rgba(' + rgb.join(',') + ',' + alpha + ')';
    }

    /*
     * Couleurs d'une icône, lues sur une miniature 32×32 :
     *  - bg   : couleur moyenne des bords, pour que l'icône se fonde dans la carte ;
     *  - glow : la couleur la plus vive, pour le halo (le rouge de YouTube, pas son fond blanc).
     * Renvoie null si l'image n'est pas lisible (canvas protégé) : on garde alors une carte sombre.
     */
    var colors = {};
    function analyze(img) {
        try {
            var size = 32;
            var c = doc.createElement('canvas');
            c.width = c.height = size;
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, size, size);
            var d = ctx.getImageData(0, 0, size, size).data;
            var edge = [0, 0, 0], edgeN = 0, edgeTotal = 0;
            var best = null, bestScore = 0;
            for (var y = 0; y < size; y++) {
                for (var x = 0; x < size; x++) {
                    var i = (y * size + x) * 4;
                    var r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
                    var isEdge = x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
                    if (isEdge) edgeTotal++;
                    if (a < 160) continue;
                    if (isEdge) { edge[0] += r; edge[1] += g; edge[2] += b; edgeN++; }
                    var max = Math.max(r, g, b), min = Math.min(r, g, b);
                    var score = max ? ((max - min) / max) * (max / 255) : 0;
                    if (score > bestScore) { bestScore = score; best = [r, g, b]; }
                }
            }
            var bg = edgeN > edgeTotal * 0.7 ? edge.map(function (v) { return Math.round(v / edgeN); }) : null;
            return { bg: bg, glow: bestScore > 0.3 ? best : bg };
        } catch (e) {
            return null;
        }
    }

    function appArt(app) {
        var box = h('div', { class: 'art' });
        var fallback = hslToRgb(hue(app.name), 45, 32);
        function useMonogram() {
            box.innerHTML = '';
            box.style.background = 'linear-gradient(135deg,' + css(fallback) + ',' + css(hslToRgb(hue(app.name), 40, 18)) + ')';
            box.appendChild(h('span', { class: 'label', text: app.name }));
            colors[app.id] = { bg: fallback, glow: fallback };
        }
        if (!app.icon) { useMonogram(); return box; }

        var img = h('img', { src: app.icon, alt: '' });
        img.onerror = useMonogram;
        img.onload = function () {
            var col = colors[app.id] || analyze(img);
            colors[app.id] = col || { bg: null, glow: fallback };
            if (col && col.bg) box.style.background = css(col.bg);
            else box.classList.add('small'); // icône détourée : plus petite, sur fond sombre
            if (TC.ui.colorReady) TC.ui.colorReady(app.id);
        };
        box.appendChild(img);
        return box;
    }

    function glowOf(app) {
        var c = colors[app.id];
        return (c && (c.glow || c.bg)) || hslToRgb(hue(app.name), 45, 32);
    }

    /* Halo d'ambiance : deux calques qui se relaient en fondu. */
    var ambient = {
        layers: null, current: 0, color: null, timer: null,
        set: function (rgb) {
            if (!rgb) return;
            var key = rgb.join(',');
            if (key === this.color) return;
            this.color = key;
            var self = this;
            clearTimeout(this.timer);
            // Petit délai : on ne repeint pas à chaque carte quand on fait défiler vite.
            this.timer = setTimeout(function () { self.paint(rgb); }, 90);
        },
        paint: function (rgb) {
            if (!this.layers) this.layers = doc.querySelectorAll('#ambient .glow');
            if (!this.layers.length) return;
            // Une couleur sombre (bleu nuit de Disney+) donnerait un halo invisible : on l'éclaircit.
            var max = Math.max(rgb[0], rgb[1], rgb[2], 1);
            var k = max < 210 ? Math.min(210 / max, 3) : 1;
            rgb = rgb.map(function (v) { return Math.min(255, Math.round(v * k)); });
            var next = this.layers[1 - this.current];
            next.style.background =
                'radial-gradient(ellipse 62% 72% at 30% 40%, ' + css(rgb, 0.62) + ' 0%, ' + css(rgb, 0.22) + ' 42%, rgba(0,0,0,0) 78%)';
            next.classList.add('on');
            this.layers[this.current].classList.remove('on');
            this.current = 1 - this.current;
        }
    };

    var toastTimer = null;
    function toast(text, ms) {
        var el = doc.getElementById('toast');
        el.textContent = text;
        el.hidden = false;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            el.classList.remove('show');
            toastTimer = setTimeout(function () { el.hidden = true; }, 300);
        }, ms || 2600);
    }

    TC.ui = { h: h, appArt: appArt, glowOf: glowOf, ambient: ambient, hslToRgb: hslToRgb, toast: toast };
})(this);
