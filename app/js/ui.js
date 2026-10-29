/*
 * Petits outils d'affichage : création d'éléments, tuiles, menus, toasts.
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

    // Couleur discrète et stable dérivée du nom (pour les applis sans icône lisible).
    function hue(name) {
        var x = 0;
        for (var i = 0; i < name.length; i++) x = (x * 31 + name.charCodeAt(i)) % 360;
        return x;
    }

    function initials(name) {
        var words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
        var s = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
        return s.toUpperCase();
    }

    function monogram(name) {
        return h('div', {
            class: 'monogram',
            style: 'background:hsl(' + hue(name) + ',22%,18%);color:hsl(' + hue(name) + ',45%,78%)',
            text: initials(name)
        });
    }

    function appArt(app) {
        var box = h('div', { class: 'art' });
        if (app.icon) {
            var img = h('img', { src: app.icon, alt: '' });
            img.onerror = function () { box.innerHTML = ''; box.appendChild(monogram(app.name)); };
            box.appendChild(img);
        } else {
            box.appendChild(monogram(app.name));
        }
        return box;
    }

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

    TC.ui = { h: h, appArt: appArt, monogram: monogram, toast: toast };
})(this);
