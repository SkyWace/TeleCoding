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

    var colors = {};

    function hexToRgb(hex) {
        var n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function neutral(rgb) { return Math.max.apply(null, rgb) - Math.min.apply(null, rgb) < 24; }

    function normName(name) {
        return String(name).toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '');
    }

    // Logo du pack (Simple Icons) correspondant au nom de l'appli, ou null.
    function logoFor(app) {
        var logos = TC.LOGOS || {};
        var n = normName(app.name);
        var keys = Object.keys(logos);
        for (var i = 0; i < keys.length; i++) {
            if (logos[keys[i]].names.indexOf(n) >= 0) return logos[keys[i]];
        }
        return null;
    }

    function logoArt(app, logo) {
        var box = h('div', { class: 'art logo' });
        box.style.background = logo.bg;
        box.style.color = logo.text;
        box.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="' + logo.fg + '" d="' + logo.path + '"/></svg>';
        box.appendChild(h('span', { class: 'brand' + (/netflix/i.test(logo.title) ? ' caps' : ''), text: app.name }));
        var fg = hexToRgb(logo.fg), bg = hexToRgb(logo.bg);
        colors[app.id + '|pack'] = { bg: bg, glow: !neutral(fg) ? fg : !neutral(bg) ? bg : [120, 124, 136] };
        return box;
    }

    // Bannière à logo officiel (app/logos/) correspondant au nom de l'appli, ou null.
    function bannerFor(app) {
        var banners = TC.BANNERS || {};
        var n = normName(app.name);
        var keys = Object.keys(banners);
        for (var i = 0; i < keys.length; i++) {
            if (banners[keys[i]].names.indexOf(n) >= 0) return { key: keys[i], b: banners[keys[i]] };
        }
        return null;
    }

    function bannerArt(app, found) {
        var b = found.b;
        var box = h('div', { class: 'art banner' });
        box.style.background = b.bg;
        var img = h('img', { src: 'logos/' + found.key + '.svg', alt: '' });
        var size = (b.size || 0.5) * 100;
        if (b.rotate) {
            // Logo vertical (ARTE) : une fois tourné, sa largeur devient sa hauteur à l'écran.
            // size est alors une part de la largeur de la carte.
            img.style.width = size + '%';
            img.style.maxHeight = 'none';
            img.style.transform = 'rotate(90deg)';
        } else {
            img.style.height = size + '%'; // la largeur suit les proportions du logo, bornée à 76 %
        }
        // Logo à passer en blanc : on le recolore une fois dans un canvas plutôt qu'avec un filtre CSS,
        // que la TV recalculerait à chaque image pendant le zoom de la carte.
        if (b.white) {
            img.style.visibility = 'hidden';
            img.onload = function () {
                img.onload = null;
                try {
                    var k = Math.min(2, 800 / (img.naturalWidth || 800));
                    var c = doc.createElement('canvas');
                    c.width = Math.max(1, Math.round((img.naturalWidth || 400) * k));
                    c.height = Math.max(1, Math.round((img.naturalHeight || 200) * k));
                    var cx = c.getContext('2d');
                    cx.drawImage(img, 0, 0, c.width, c.height);
                    cx.globalCompositeOperation = 'source-in';
                    cx.fillStyle = '#fff';
                    cx.fillRect(0, 0, c.width, c.height);
                    img.src = c.toDataURL('image/png');
                } catch (e) {
                    img.style.filter = 'brightness(0) invert(1)'; // canvas refusé : filtre en secours
                }
                img.style.visibility = '';
            };
        }
        img.onerror = function () { box.innerHTML = ''; box.appendChild(h('span', { class: 'label', text: app.name })); };
        box.appendChild(img);
        colors[app.id + '|pack'] = { bg: b.glow, glow: b.glow };
        return box;
    }

    function appArt(app, style) {
        if (style !== 'samsung') {
            var banner = bannerFor(app);
            if (banner) return bannerArt(app, banner);
            var logo = logoFor(app);
            if (logo) return logoArt(app, logo);
        }
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
            // Mode « uniform tiles » de CleanYourTV : la carte prend le support de l'icône
            // (ou un dégradé de sa couleur), l'icône occupe 62 % de la hauteur.
            var col = TC.artwork.analyze(img);
            if (col) {
                colors[app.id] = { bg: col.backdrop[0], glow: col.glow };
                box.style.background = 'linear-gradient(180deg,' + css(col.backdrop[0]) + ',' + css(col.backdrop[1]) + ')';
            } else {
                colors[app.id] = { bg: null, glow: fallback };
            }
            box.classList.add('uniform');
            if (TC.ui.colorReady) TC.ui.colorReady(app.id);
        };
        box.appendChild(img);
        return box;
    }

    function glowOf(app) {
        var c = colors[app.id + '|pack'] && (bannerFor(app) || logoFor(app)) && TC.store.get().logoStyle !== 'samsung' ? colors[app.id + '|pack'] : colors[app.id];
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
            this.timer = setTimeout(function () { self.paint(rgb); }, 160);
        },
        paint: function (rgb) {
            if (!this.layers) {
                // Comme CleanYourTV (setAmbient) : un dégradé plein écran redessiné à chaque appli fait
                // ramer une TV. On peint un petit canvas de 192×108, étiré par la carte graphique ;
                // les deux calques se relaient en fondu (opacité seulement : rien n'est redessiné).
                this.layers = Array.prototype.map.call(doc.querySelectorAll('#ambient .glow'), function (layer) {
                    var c = doc.createElement('canvas');
                    c.width = 192; c.height = 108;
                    c.className = 'glow';
                    layer.parentNode.replaceChild(c, layer);
                    return c;
                });
            }
            if (!this.layers.length) return;
            var next = this.layers[1 - this.current];
            var ctx = next.getContext('2d');
            var w = next.width, hh = next.height;
            ctx.clearRect(0, 0, w, hh);
            // Même dégradé que leur code : centre à 32 % / 42 %, rayon 62 % de la largeur, alpha 0x5C puis 0x26.
            var g = ctx.createRadialGradient(w * 0.32, hh * 0.42, 0, w * 0.32, hh * 0.42, w * 0.62);
            g.addColorStop(0, css(rgb, 0.36));
            g.addColorStop(0.45, css(rgb, 0.15));
            g.addColorStop(1, css(rgb, 0));
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, hh);
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

    // Icône carrée de la bibliothèque : l'icône Samsung, sinon un monogramme.
    function libraryIcon(app) {
        var box = h('div', { class: 'lib-icon' });
        function mono() {
            box.innerHTML = '';
            box.style.background = css(hslToRgb(hue(app.name), 45, 32));
            box.appendChild(h('span', { text: app.name.slice(0, 2).toUpperCase() }));
        }
        if (!app.icon) { mono(); return box; }
        var img = h('img', { src: app.icon, alt: '' });
        img.onerror = mono;
        box.appendChild(img);
        return box;
    }

    TC.ui = { h: h, appArt: appArt, logoFor: logoFor, libraryIcon: libraryIcon, glowOf: glowOf, ambient: ambient, hslToRgb: hslToRgb, toast: toast };
})(this);
