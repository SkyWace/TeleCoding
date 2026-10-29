/*
 * Préférences : stockées en local sur la TV (localStorage), jamais envoyées ailleurs.
 */
(function (global) {
    'use strict';

    var TC = global.TC = global.TC || {};
    var KEY = 'telecoding.settings.v1';
    var SECTIONS = ['favorites', 'inputs', 'apps'];

    var DEFAULTS = {
        theme: 'noir',
        wallpaper: 'none',
        wallpaperUrl: '',
        clock24: true,
        showDate: true,
        showWeather: false,
        weatherCity: '',
        weatherLat: null,
        weatherLon: null,
        animations: 'subtle',
        sections: SECTIONS.slice(),
        favorites: null // null = premier lancement, rempli avec les applis détectées
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
        out.sections = secs;
        if (out.favorites !== null && !Array.isArray(out.favorites)) out.favorites = null;
        return out;
    }

    function load() {
        try {
            var raw = global.localStorage.getItem(KEY);
            return sanitize(raw ? JSON.parse(raw) : {});
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
            var favorites = state.favorites;
            state = clone(DEFAULTS);
            state.favorites = favorites;
            save();
            listeners.forEach(function (fn) { fn(state, clone(DEFAULTS)); });
        },
        onChange: function (fn) { listeners.push(fn); }
    };
})(this);
