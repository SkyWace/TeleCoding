/*
 * Préférences : stockées en local sur la TV (localStorage), jamais envoyées ailleurs.
 */
(function (global) {
    'use strict';

    var TC = global.TC = global.TC || {};
    var KEY = 'telecoding.settings.v1';

    var DEFAULTS = {
        theme: 'ambiance',
        designVersion: 4,
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
        cols: 4,                    // applis par ligne ; la bande (dock) en a toujours autant
        logoStyle: 'pack',          // 'pack' (logos officiels) ou 'samsung' (icônes de la TV)
        inputsConnectedOnly: false, // menu Sources : seulement les entrées branchées
        librarySystemApps: false,   // bibliothèque : montrer aussi les services système de Samsung
        showPerf: false,            // compteur d'images par seconde (diagnostic de fluidité)
        returnToLauncher: true,     // lancer les applis en mode groupe : Retour revient à TeleCoding
        // Comme CleanYourTV : une seule liste ordonnée. Les `cols` premières forment la bande,
        // les suivantes la grille ; le reste est dans la bibliothèque d'applications.
        home: null,                 // null = premier lancement
        knownApps: [],              // applis déjà vues : une nouvelle appli s'ajoute à l'accueil
        appsCache: [],              // dernière liste d'applis : affichage immédiat au démarrage
        // Anciennes versions (lus une fois pour construire `home`).
        favorites: null,
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
        if ([4, 5, 6, 7].indexOf(out.cols) < 0) out.cols = 4;
        if (out.home !== null && !Array.isArray(out.home)) out.home = null;
        if (out.home) out.home = out.home.filter(function (x, i, a) { return typeof x === 'string' && a.indexOf(x) === i; });
        ['knownApps', 'appsCache', 'hiddenApps'].forEach(function (k) { if (!Array.isArray(out[k])) out[k] = []; });
        if (out.favorites !== null && !Array.isArray(out.favorites)) out.favorites = null;
        return out;
    }

    function load() {
        try {
            var raw = global.localStorage.getItem(KEY);
            var saved = raw ? JSON.parse(raw) : {};
            // Réglages d'avant le design CleanYourTV : thème « Ambiance ».
            if (raw && (saved.designVersion || 0) < 3) saved.theme = 'ambiance';
            saved.designVersion = 4;
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
        // « Suivre le thème (réinitialiser les choix) » : l'apparence revient aux valeurs par défaut,
        // l'accueil (ordre des applis) est conservé.
        reset: function () {
            var keep = { home: state.home, knownApps: state.knownApps, appsCache: state.appsCache };
            state = clone(DEFAULTS);
            Object.assign(state, keep);
            save();
            listeners.forEach(function (fn) { fn(state, clone(DEFAULTS)); });
        },
        onChange: function (fn) { listeners.push(fn); }
    };
})(this);
