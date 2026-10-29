/*
 * Préférences : stockées en local sur la TV (localStorage), jamais envoyées ailleurs.
 */
(function (global) {
    'use strict';

    var TC = global.TC = global.TC || {};
    var KEY = 'telecoding.settings.v1';
    var SECTIONS = ['favorites', 'inputs', 'apps'];

    var DEFAULTS = {
        theme: 'ambiance',
        designVersion: 3,
        wallpaper: 'none',
        wallpaperUrl: '',
        clock24: true,
        showGreeting: true,
        showDate: true,
        showWeather: false,
        weatherCity: '',
        weatherLat: null,
        weatherLon: null,
        animations: 'subtle',
        cols: 4,
        showInputsRow: false,
        sections: SECTIONS.slice(),
        favorites: null, // null = premier lancement, rempli avec les applis détectées
        favoritesVersion: 0, // < 2 : favoris choisis avant le tri des applis système, à refaire
        showSystemApps: false,
        hiddenApps: []
    };

    var listeners = [];
    var state = load();

    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    function sanitize(s) {
        var out = clone(DEFAULTS);
        Object.keys(DEFAULTS).forEach(function (k) {
            if (s && Object.prototype.hasOwnProperty.call(s, k)) out[k] = s[k];
        });
        // Les trois sections doivent toujours être présentes, une seule fois chacune.
        var secs = Array.isArray(out.sections) ? out.sections.filter(function (x, i, a) {
            return SECTIONS.indexOf(x) >= 0 && a.indexOf(x) === i;
        }) : [];
        SECTIONS.forEach(function (x) { if (secs.indexOf(x) < 0) secs.push(x); });
        // Les favoris (la bande) restent toujours en premier.
        out.sections = ['favorites'].concat(secs.filter(function (x) { return x !== 'favorites'; }));
        if ([4, 5, 6].indexOf(out.cols) < 0) out.cols = 4;
        if (out.favorites !== null && !Array.isArray(out.favorites)) out.favorites = null;
        if (!Array.isArray(out.hiddenApps)) out.hiddenApps = [];
        return out;
    }

    function load() {
        try {
            var raw = global.localStorage.getItem(KEY);
            var saved = raw ? JSON.parse(raw) : {};
            // Réglages d'avant le nouveau design : on passe au thème « Ambiance ».
            if (raw && !saved.designVersion) { saved.theme = 'ambiance'; saved.designVersion = 3; }
            return sanitize(saved);
        } catch (e) {
            return clone(DEFAULTS);
        }
    }

    function save() {
        try { global.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage plein ou indisponible */ }
    }

    TC.store = {
        get: function () { return state; },
        set: function (patch) {
            state = sanitize(Object.assign({}, state, patch));
            save();
            listeners.forEach(function (fn) { fn(state, patch); });
        },
        reset: function () {
            var keep = { favorites: state.favorites, favoritesVersion: state.favoritesVersion, hiddenApps: state.hiddenApps };
            state = clone(DEFAULTS);
            Object.assign(state, keep);
            save();
            listeners.forEach(function (fn) { fn(state, clone(DEFAULTS)); });
        },
        onChange: function (fn) { listeners.push(fn); }
    };
})(this);
