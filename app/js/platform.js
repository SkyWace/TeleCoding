/*
 * Couche plateforme : tout ce qui touche aux API Samsung / Tizen passe par ici.
 * Sur la TV on utilise les vraies API ; dans un navigateur (aperçu, tests) on
 * bascule sur des données simulées, clairement signalées à l'écran.
 */
(function (global) {
    'use strict';

    var TC = global.TC = global.TC || {};
    var tz = global.tizen;
    var isTizen = typeof tz !== 'undefined' && !!tz.application;
    var SELF_ID = 'TlCdLaunch.TeleCoding';

    // Codes des touches de la télécommande Samsung (valeurs par défaut,
    // remplacées par celles que renvoie tvinputdevice quand c'est possible).
    var KEYS = {
        LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
        BACK: 10009, MENU: 10133, TOOLS: 10135, INFO: 457,
        RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
        IME_DONE: 65376, IME_CANCEL: 65385
    };
    var EXTRA_KEYS = {
        ColorF0Red: 'RED', ColorF1Green: 'GREEN', ColorF2Yellow: 'YELLOW',
        ColorF3Blue: 'BLUE', Menu: 'MENU', Tools: 'TOOLS', Info: 'INFO'
    };

    // Types de sources vidéo que l'on sait nommer (enum VideoSourceType de Tizen).
    var SOURCE_LABELS = {
        HDMI: 'HDMI', AV: 'Composite', COMP: 'Composante', SVIDEO: 'S-Vidéo',
        SCART: 'Péritel', DVI: 'DVI', PC: 'PC', TV: 'TV'
    };
    var SOURCE_ORDER = ['HDMI', 'AV', 'COMP', 'SVIDEO', 'SCART', 'DVI', 'PC', 'TV'];

    function promisify(fn) {
        return new Promise(function (resolve, reject) {
            try {
                fn(resolve, function (err) { reject(err || new Error('Erreur inconnue')); });
            } catch (e) {
                reject(e);
            }
        });
    }

    function errorText(err) {
        if (!err) return 'erreur inconnue';
        return (err.name ? err.name + ' : ' : '') + (err.message || String(err));
    }

    function iconUrl(path) {
        if (!path) return '';
        return /^[a-z]+:/i.test(path) ? path : 'file://' + path;
    }

    function sortByName(list) {
        return list.sort(function (a, b) { return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }); });
    }

    function sourceKey(s) { return s.type + ':' + s.number; }

    function normalizeSources(vs) {
        var out = [];
        function add(list, connected) {
            (list || []).forEach(function (s) {
                if (!SOURCE_LABELS[s.type]) return;
                var multiple = s.type === 'HDMI' || s.type === 'AV' || s.type === 'COMP';
                out.push({
                    key: sourceKey(s),
                    type: s.type,
                    number: s.number,
                    label: SOURCE_LABELS[s.type] + (multiple && s.number ? ' ' + s.number : ''),
                    connected: connected,
                    raw: s
                });
            });
        }
        add(vs.connected, true);
        add(vs.disconnected, false);
        var seen = {};
        out = out.filter(function (s) { if (seen[s.key]) return false; seen[s.key] = true; return true; });
        return out.sort(function (a, b) {
            var d = SOURCE_ORDER.indexOf(a.type) - SOURCE_ORDER.indexOf(b.type);
            return d || a.number - b.number;
        });
    }

    /* ------------------------------------------------------------------ */
    /* Implémentation Tizen (la vraie TV)                                  */
    /* ------------------------------------------------------------------ */
    var tizenImpl = {
        preview: false,

        listApps: function () {
            var self = SELF_ID;
            try { self = tz.application.getCurrentApplication().appInfo.id; } catch (e) { /* garde la valeur par défaut */ }
            return promisify(function (ok, ko) { tz.application.getAppsInfo(ok, ko); }).then(function (infos) {
                var seen = {};
                var apps = infos.filter(function (a) {
                    if (!a || !a.id || !a.name || a.show === false || a.id === self || seen[a.id]) return false;
                    seen[a.id] = true;
                    return true;
                }).map(function (a) {
                    return { id: a.id, name: a.name, icon: iconUrl(a.iconPath) };
                });
                return sortByName(apps);
            });
        },

        launchApp: function (id) {
            return promisify(function (ok, ko) { tz.application.launch(id, ok, ko); });
        },

        listInputs: function () {
            if (!tz.systeminfo || !tz.tvwindow) {
                return Promise.reject(new Error('API TVWindow absente sur ce modèle'));
            }
            return promisify(function (ok, ko) {
                tz.systeminfo.getPropertyValue('VIDEOSOURCE', ok, ko);
            }).then(normalizeSources);
        },

        watchInput: function (source) {
            return promisify(function (ok, ko) {
                tz.tvwindow.setSource(source.raw, ok, ko, 'MAIN');
            }).then(function () {
                return promisify(function (ok, ko) {
                    tz.tvwindow.show(ok, ko, ['0px', '0px', '1920px', '1080px'], 'MAIN');
                });
            });
        },

        stopWatching: function () {
            return promisify(function (ok, ko) { tz.tvwindow.hide(ok, ko, 'MAIN'); });
        },

        registerKeys: function () {
            var input = tz.tvinputdevice;
            if (!input) return;
            Object.keys(EXTRA_KEYS).forEach(function (name) {
                try {
                    input.registerKey(name);
                    var k = input.getKey(name);
                    if (k && k.code) KEYS[EXTRA_KEYS[name]] = k.code;
                } catch (e) { /* touche absente de cette télécommande */ }
            });
        },

        exit: function () {
            try { tz.application.getCurrentApplication().exit(); } catch (e) { /* rien à faire */ }
        }
    };

    /* ------------------------------------------------------------------ */
    /* Implémentation aperçu (navigateur, tests automatisés)               */
    /* ------------------------------------------------------------------ */
    var MOCK_APPS = ['Netflix', 'Prime Video', 'YouTube', 'Disney+', 'Spotify', 'Amazon Music',
        'Plex', 'Kodi', 'Twitch', 'Navigateur Internet', 'Galerie', 'SmartThings'];
    var mockSources = {
        connected: [{ type: 'HDMI', number: 1 }, { type: 'HDMI', number: 3 }, { type: 'TV', number: 1 }],
        disconnected: [{ type: 'HDMI', number: 2 }]
    };

    var previewImpl = {
        preview: true,
        launched: [],
        watching: null,

        listApps: function () {
            return Promise.resolve(sortByName(MOCK_APPS.map(function (name) {
                return { id: 'mock.' + name.toLowerCase().replace(/[^a-z0-9]+/g, ''), name: name, icon: '' };
            })));
        },
        launchApp: function (id) {
            this.launched.push(id);
            return Promise.resolve();
        },
        listInputs: function () {
            return Promise.resolve(normalizeSources(mockSources));
        },
        watchInput: function (source) {
            this.watching = source.key;
            return Promise.resolve();
        },
        stopWatching: function () {
            this.watching = null;
            return Promise.resolve();
        },
        registerKeys: function () { /* le clavier du PC suffit */ },
        exit: function () { /* rien à fermer dans un navigateur */ }
    };

    TC.platform = isTizen ? tizenImpl : previewImpl;
    TC.platform.errorText = errorText;
    TC.KEYS = KEYS;
})(this);
