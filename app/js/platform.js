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

    /*
     * Tri des applis. getAppsInfo() renvoie ~450 entrées sur une Samsung : surtout des
     * services système (pub, assistants, mises à jour…) déclarés visibles. On garde :
     *  - les applis du store Samsung : identifiant « 10 caractères » + « . » + nom,
     *    sauf leurs services d'arrière-plan ;
     *  - les quelques vraies applis intégrées par Samsung (affichées seulement si installées).
     * Le reste est classé « système » : masqué par défaut, affichable dans les paramètres.
     */
    var STORE_ID = /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/;
    var STORE_HELPER = /service$|preview$|extension$|emanual|publicvalue|privacychoices|^otapp$|cmswebapp/i;
    var BUILTIN_APPS = [
        'org.tizen.netflix-app', 'org.tizen.primevideo', 'org.tizen.browser',
        'com.samsung.tv.cobalt-yt', 'com.samsung.tv.cobalt-ytkids', 'org.tizen.apple.apple-music',
        'com.samsung.tv.aria-video', 'com.samsung.tv.SmartThingsApp', 'com.samsung.tv.gaminghub',
        'com.samsung.tv.store'
    ];

    var SYSTEM_APPS = {
        settings: ['com.samsung.tv.coba.setting', 'org.tizen.menu'],
        network: ['com.samsung.tv.coba.setting.networksettings', 'org.tizen.NetworkSetting-Tizen']
    };

    /*
     * Applis du Smart Hub (l'accueil Samsung), relevées sur une UE43CU7025 avec « sdb shell 0 applist ».
     * Le mode accueil de TeleCoding ne réagit qu'à elles : jamais aux sources, réglages, volume, etc.
     */
    var SMART_HUB = /^(com\.samsung\.tv\.coba\.newhome|com\.samsung\.tv\.home\.|com\.samsung\.tv\.homeupdateview$)/;
    function isSmartHub(id) { return SMART_HUB.test(id || ''); }

    function isUserApp(id) {
        if (/-dummy$/.test(id)) return false;
        if (BUILTIN_APPS.indexOf(id) >= 0) return true;
        return STORE_ID.test(id) && !STORE_HELPER.test(id.split('.')[1]);
    }

    // « TF1+ : Streaming, TV en Direct » -> « TF1+ » ; « Spotify - Music and Podcasts » -> « Spotify »
    function cleanName(name) {
        var n = String(name || '').trim();
        var short = n.split(/\s[:\-–|]\s/)[0].trim();
        return short || n;
    }

    // Une même appli peut exister deux fois (YouTube du store + YouTube intégré) :
    // on garde l'appli utilisateur, puis la première rencontrée.
    function dedupeByName(apps) {
        var byName = {};
        apps.forEach(function (a) {
            var k = a.name.toLowerCase();
            var prev = byName[k];
            if (!prev || (prev.system && !a.system) || (!prev.system && !a.system && STORE_ID.test(a.id) && !STORE_ID.test(prev.id))) byName[k] = a;
        });
        return apps.filter(function (a) { return byName[a.name.toLowerCase()] === a; });
    }

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
                    if (!a || !a.id || !String(a.name || '').trim() || a.show === false || a.id === self || seen[a.id]) return false;
                    seen[a.id] = true;
                    return true;
                }).map(function (a) {
                    return { id: a.id, name: cleanName(a.name), icon: iconUrl(a.iconPath), system: !isUserApp(a.id) };
                });
                return sortByName(dedupeByName(apps));
            });
        },

        /*
         * group = true : lancement en « mode groupe » (ApplicationControl, launchMode 'GROUP').
         * L'appli s'ouvre dans le groupe de TeleCoding : quand on la quitte avec Retour, le système
         * revient à TeleCoding au lieu du Smart Hub. C'est l'appli lancée qui décide si elle accepte
         * ce mode ; si la TV refuse le lancement, on relance normalement.
         */
        launchApp: function (id, opts) {
            var plain = function () { return promisify(function (ok, ko) { tz.application.launch(id, ok, ko); }); };
            if (!(opts && opts.group) || !tz.ApplicationControl || !tz.application.launchAppControl) return plain();
            return promisify(function (ok, ko) {
                var ctrl = new tz.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, null, 'GROUP');
                tz.application.launchAppControl(ctrl, id, ok, ko, null);
            }).catch(plain);
        },

        /*
         * Surveille une appli lancée depuis TeleCoding (Tizen 4.0+, addAppStatusChangeListener).
         * Quand elle se désactive, on regarde si elle tourne encore :
         *  - fermée (Retour jusqu'à la quitter) -> onClosed() ;
         *  - encore en mémoire (touche HOME, mise en pause) -> rien, HOME garde le Smart Hub.
         * Renvoie false si la TV ne propose pas cette API.
         */
        watchApp: function (id, onClosed) {
            var app = tz.application;
            if (!app.addAppStatusChangeListener || !app.getAppsContext) return false;
            this.unwatchApp();
            var self = this, seenActive = false;
            try {
                this._watch = app.addAppStatusChangeListener(function (appId, isActive) {
                    if (isActive) { seenActive = true; return; }
                    if (!seenActive) return;
                    setTimeout(function () {
                        app.getAppsContext(function (contexts) {
                            var running = contexts.some(function (c) { return c.appId === id; });
                            // Dans les deux cas on arrête de surveiller : après HOME, TeleCoding ne doit
                            // pas surgir plus tard si la TV ferme l'appli pour libérer de la mémoire.
                            self.unwatchApp();
                            if (!running) onClosed();
                        }, function () { /* contexte illisible : on ne fait rien */ });
                    }, 600);
                }, id);
                return true;
            } catch (e) {
                return false;
            }
        },

        unwatchApp: function () {
            if (this._watch === undefined || this._watch === null) return;
            try { tz.application.removeAppStatusChangeListener(this._watch); } catch (e) { /* déjà retiré */ }
            this._watch = null;
        },

        // Toutes les activations / désactivations d'applis (Tizen 4.0+). false si l'API manque.
        onAppStatus: function (cb) {
            if (!tz.application.addAppStatusChangeListener) return false;
            try { tz.application.addAppStatusChangeListener(cb); return true; } catch (e) { return false; }
        },

        // Remet TeleCoding au premier plan.
        bringToFront: function () {
            var self = SELF_ID;
            try { self = tz.application.getCurrentApplication().appInfo.id; } catch (e) { /* valeur par défaut */ }
            return promisify(function (ok, ko) { tz.application.launch(self, ok, ko); });
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

        // { type: 'WIFI' | 'ETHERNET' | 'NONE' | …, ssid: nom du Wi-Fi si la TV le donne }
        network: function () {
            if (!tz.systeminfo) return Promise.reject(new Error('systeminfo absent'));
            return promisify(function (ok, ko) { tz.systeminfo.getPropertyValue('NETWORK', ok, ko); }).then(function (n) {
                var out = { type: n.networkType, ssid: '' };
                if (n.networkType !== 'WIFI') return out;
                return promisify(function (ok, ko) { tz.systeminfo.getPropertyValue('WIFI_NETWORK', ok, ko); })
                    .then(function (w) { out.ssid = (w && w.ssid) || ''; return out; })
                    .catch(function () { return out; });
            });
        },

        // Réglages de la TV : Samsung ne documente pas comment les ouvrir depuis une appli.
        // On essaie les applis de réglages présentes sur ce modèle (relevées avec « sdb shell 0 applist »).
        openSystem: function (kind) {
            var ids = SYSTEM_APPS[kind] || [];
            var self = this;
            return ids.reduce(function (p, id) {
                return p.catch(function () { return self.launchApp(id); });
            }, Promise.reject(new Error('aucune')));
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
    // Identifiants relevés sur une UE43CU7025 (sdb shell 0 applist), mélange d'applis et de services.
    var MOCK_APPS = [
        ['org.tizen.netflix-app', 'Netflix'], ['org.tizen.primevideo', 'Prime Video'],
        ['org.tizen.primevideo-dummy', 'Prime Video'], ['9Ur5IzDKqV.TizenYouTube', 'YouTube'],
        ['com.samsung.tv.cobalt-yt', 'Youtube'], ['MCmYXNxgcu.DisneyPlus', 'Disney+'],
        ['MCmYXNxgcu.DisneyPlusService', 'DisneyPlusPreviewService'],
        ['rJeHak5zRg.Spotify', 'Spotify - Music and Podcasts'], ['rJeHak5zRg.SpotifyService', 'SpotifyRecomendationsService'],
        ['Ol7HVEXtqh.6play', '6play'], ['E0P3lRI4H7.MYTF1', 'TF1+ : Streaming, TV en Direct'],
        ['QY16tZ64E3.francetv', 'france.tv'], ['aLlph042JZ.arte', 'ARTE'], ['aLlph042JZ.preview', 'preview'],
        ['org.tizen.browser', 'Internet'], ['OGLLvqej7u.service', 'service'],
        ['org.tizen.rm-network-status', ' Network status widget '], ['org.tizen.rm-survey', ' RM survey popup '],
        ['com.samsung.tv.adplayer', 'AdPlayer'], ['com.samsung.tv.targeted-ad-service', 'Targeted Advertisment Service'],
        ['25emanual2.emanual', 'User Guide'], ['w2VwCK465D.OTApp', 'Samsung TV Plus Privacy Settings'],
        ['com.samsung.tv.aria-video', 'Apple TV'], ['org.tizen.apple.apple-music', 'Apple Music'],
        ['QmpwflxWdt.CanalPlusLauncher', 'CANAL+'], ['GHI3a0zMSx.XboxGamePass', 'Xbox'],
        ['CmeyUlnhYY.LunaWebApp', 'Amazon Luna'], ['HEPsqFNie0.tvplusstandalone', 'Samsung TV Plus'],
        ['OGLLvqej7u.CrunchyrollWebApp', 'Crunchyroll'], ['eG4XpSuhpX.OrangeTV', 'Orange TV']
    ];
    // Icônes d'aperçu dessinées à la volée (couleurs de marque approximatives), pour juger le rendu.
    var MOCK_ICONS = {
        'org.tizen.netflix-app': ['#000000', '#e50914', 'NETFLIX'],
        'org.tizen.primevideo': ['#0f79ff', '#ffffff', 'prime video'],
        '9Ur5IzDKqV.TizenYouTube': ['#f4f4f4', '#ff0000', '▶ YouTube'],
        'MCmYXNxgcu.DisneyPlus': ['#0b3a5e', '#ffffff', 'Disney+'],
        'rJeHak5zRg.Spotify': ['#121212', '#1ed760', 'Spotify'],
        'aLlph042JZ.arte': ['#fa481c', '#ffffff', 'arte'],
        'Ol7HVEXtqh.6play': ['#222222', '#f2e600', '6play'],
        'E0P3lRI4H7.MYTF1': ['#0c2fb3', '#ffffff', 'TF1+']
    };
    function mockIcon(id) {
        var m = MOCK_ICONS[id];
        if (!m || !global.document) return '';
        var c = global.document.createElement('canvas');
        c.width = 512; c.height = 423;
        var ctx = c.getContext('2d');
        ctx.fillStyle = m[0]; ctx.fillRect(0, 0, 512, 423);
        ctx.fillStyle = m[1]; ctx.font = 'bold 84px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(m[2], 256, 212, 440);
        return c.toDataURL('image/png');
    }

    var mockSources = {
        connected: [{ type: 'HDMI', number: 1 }, { type: 'HDMI', number: 3 }, { type: 'TV', number: 1 }],
        disconnected: [{ type: 'HDMI', number: 2 }]
    };

    var previewImpl = {
        preview: true,
        launched: [],
        watching: null,

        listApps: function () {
            return Promise.resolve(sortByName(dedupeByName(MOCK_APPS.map(function (m) {
                return { id: m[0], name: cleanName(m[1]), icon: mockIcon(m[0]), system: !isUserApp(m[0]) };
            }))));
        },
        launchApp: function (id, opts) {
            this.launched.push(id);
            this.lastLaunchMode = opts && opts.group ? 'GROUP' : 'SINGLE';
            return Promise.resolve();
        },
        listInputs: function () {
            return Promise.resolve(normalizeSources(mockSources));
        },
        watchApp: function (id, onClosed) { this.watched = id; this._onClosed = onClosed; return true; },
        unwatchApp: function () { this.watched = null; this._onClosed = null; },
        // Tests : simule la fermeture de l'appli surveillée.
        simulateClose: function () { var fn = this._onClosed; this.unwatchApp(); if (fn) fn(); },
        bringToFront: function () { this.broughtBack = (this.broughtBack || 0) + 1; return Promise.resolve(); },
        onAppStatus: function (cb) { this._status = cb; return true; },
        // Tests : simule l'activation / la désactivation d'une appli.
        simulateStatus: function (id, active) { if (this._status) this._status(id, active); },
        watchInput: function (source) {
            this.watching = source.key;
            return Promise.resolve();
        },
        stopWatching: function () {
            this.watching = null;
            return Promise.resolve();
        },
        network: function () { return Promise.resolve({ type: global.navigator.onLine === false ? 'NONE' : 'WIFI', ssid: 'Maison' }); },
        openSystem: function () { return Promise.resolve(); },
        registerKeys: function () { /* le clavier du PC suffit */ },
        exit: function () { /* rien à fermer dans un navigateur */ }
    };

    TC.platform = isTizen ? tizenImpl : previewImpl;
    TC.platform.errorText = errorText;
    TC.platform.isUserApp = isUserApp;
    TC.platform.isSmartHub = isSmartHub;
    TC.KEYS = KEYS;
})(this);
