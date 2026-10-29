/*
 * TeleCoding : écran d'accueil.
 * Modèle = TC.store (préférences) + état en mémoire (applis, entrées).
 * Vue = en-tête, grand titre, bande des favoris, rangées dessous ; contrôleur = touches.
 */
(function (global) {
    'use strict';

    var TC = global.TC;
    var doc = global.document;
    var h = TC.ui.h;
    var store = TC.store;
    var platform = TC.platform;
    var K = TC.KEYS;

    var state = {
        apps: [],
        appsLoaded: false,
        inputs: [],
        inputsError: null,
        moving: null,      // id de l'appli en cours de déplacement
        watching: null,    // entrée affichée en plein écran
        overlay: null,     // fenêtre ouverte
        weather: null
    };

    var LONG_PRESS_MS = 650;

    var THEMES = [
        { id: 'ambiance', label: 'Ambiance (couleur de l’appli)' },
        { id: 'minuit', label: 'Minuit', glow: [48, 86, 190] },
        { id: 'ambre', label: 'Ambre', glow: [190, 104, 36] },
        { id: 'emeraude', label: 'Émeraude', glow: [20, 140, 120] },
        { id: 'noir', label: 'Noir profond' },
        { id: 'oled', label: 'Noir OLED' }
    ];
    var WALLPAPERS = [
        { id: 'none', label: 'Aucun' },
        { id: 'aurore', label: 'Aurore' },
        { id: 'crepuscule', label: 'Crépuscule' },
        { id: 'brume', label: 'Brume' },
        { id: 'custom', label: 'Image perso (URL)' }
    ];
    var ANIMATIONS = [
        { id: 'off', label: 'Désactivées' },
        { id: 'subtle', label: 'Discrètes' },
        { id: 'normal', label: 'Normales' }
    ];
    var COLS = [{ id: 4, label: '4' }, { id: 5, label: '5' }, { id: 6, label: '6' }];

    var ICONS = {
        hdmi: '<svg viewBox="0 0 24 24"><path d="M7 3h10v6l-1.5 2v6.5a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5V11L7 9z"/></svg>',
        tv: '<svg viewBox="0 0 24 24"><path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm1 2v8h14V8zM8 2.5l4 3 4-3 .9 1.2L13.2 6h-2.4L7.1 3.7zM8 20h8v1.5H8z"/></svg>',
        av: '<svg viewBox="0 0 24 24"><path d="M5 3h2v6h1.5v4H7v8H5v-8H3.5V9H5zm6 0h2v10h1.5v4H13v4h-2v-4H9.5v-4H11zm6 0h2v4h1.5v4H19v10h-2V11h-1.5V7H17z"/></svg>'
    };

    function themeOf(id) {
        for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
        return THEMES[0];
    }

    /* ------------------------------------------------------------------ */
    /* Apparence                                                           */
    /* ------------------------------------------------------------------ */
    function applyLook() {
        var s = store.get();
        doc.body.setAttribute('data-theme', s.theme);
        doc.body.setAttribute('data-anim', s.animations);
        doc.body.setAttribute('data-wallpaper', s.wallpaper);
        doc.body.style.setProperty('--cols', s.cols);
        var wp = doc.getElementById('wallpaper');
        wp.style.backgroundImage = s.wallpaper === 'custom' && s.wallpaperUrl
            ? 'url("' + s.wallpaperUrl.replace(/"/g, '%22') + '")' : '';
        doc.getElementById('date').hidden = !s.showDate;
        doc.getElementById('greeting').hidden = !s.showGreeting;
        var fixed = themeOf(s.theme).glow;
        if (fixed) TC.ui.ambient.set(fixed);
        else if (TC.focus.current) onFocus(TC.focus.current);
        renderWeather();
        tick();
    }

    /* ------------------------------------------------------------------ */
    /* Horloge, date, météo, réseau                                        */
    /* ------------------------------------------------------------------ */
    function tick() {
        var s = store.get();
        var now = new Date();
        var hh = now.getHours();
        var mm = ('0' + now.getMinutes()).slice(-2);
        doc.getElementById('greeting').textContent = hh >= 5 && hh < 18 ? 'Bonjour' : 'Bonsoir';
        doc.getElementById('time').innerHTML = s.clock24
            ? ('0' + hh).slice(-2) + ':' + mm
            : ((hh % 12) || 12) + ':' + mm + '<small>' + (hh < 12 ? 'AM' : 'PM') + '</small>';
        doc.getElementById('date').textContent =
            now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    }

    function scheduleClock() {
        tick();
        setTimeout(scheduleClock, 1000 - (Date.now() % 1000) + 5);
    }

    var WEATHER_CODES = [
        [0, 'Ciel dégagé'], [2, 'Éclaircies'], [3, 'Couvert'], [48, 'Brouillard'],
        [57, 'Bruine'], [67, 'Pluie'], [77, 'Neige'], [82, 'Averses'], [86, 'Averses de neige'], [99, 'Orage']
    ];
    function weatherLabel(code) {
        for (var i = 0; i < WEATHER_CODES.length; i++) if (code <= WEATHER_CODES[i][0]) return WEATHER_CODES[i][1];
        return '';
    }

    function renderWeather() {
        var s = store.get();
        var el = doc.getElementById('weather');
        var w = state.weather;
        el.hidden = !(s.showWeather && w);
        if (w) el.textContent = Math.round(w.temp) + '° · ' + weatherLabel(w.code) + (s.weatherCity ? ' · ' + s.weatherCity : '');
    }

    function refreshWeather() {
        var s = store.get();
        if (!s.showWeather || s.weatherLat === null || !global.fetch) { renderWeather(); return; }
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + s.weatherLat + '&longitude=' + s.weatherLon +
            '&current=temperature_2m,weather_code&timezone=auto';
        fetch(url).then(function (r) { return r.json(); }).then(function (j) {
            if (j && j.current) state.weather = { temp: j.current.temperature_2m, code: j.current.weather_code };
            renderWeather();
        }).catch(function () { renderWeather(); });
    }

    function geocode(city) {
        var url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=' + encodeURIComponent(city);
        return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
            var hit = j && j.results && j.results[0];
            if (!hit) throw new Error('Ville introuvable');
            return { name: hit.name, lat: hit.latitude, lon: hit.longitude };
        });
    }

    var NETWORK_LABELS = { WIFI: 'Wi-Fi', ETHERNET: 'Ethernet', NONE: 'Hors ligne' };
    function refreshNetwork() {
        platform.networkType().then(function (t) {
            state.network = t;
            doc.getElementById('net-label').textContent = NETWORK_LABELS[t] || 'Réseau';
        }).catch(function () { /* on garde « Wi-Fi » */ });
    }

    /* ------------------------------------------------------------------ */
    /* Données : applications et entrées                                   */
    /* ------------------------------------------------------------------ */
    function appById(id) {
        for (var i = 0; i < state.apps.length; i++) if (state.apps[i].id === id) return state.apps[i];
        return null;
    }

    // Applis affichées : sans les services système (sauf réglage) ni les applis masquées.
    function visibleApps() {
        var s = store.get();
        var list = state.apps.filter(function (a) {
            return (s.showSystemApps || !a.system) && s.hiddenApps.indexOf(a.id) < 0;
        });
        if (s.appSort === 'usage') {
            // Les plus lancées d'abord ; à égalité, l'ordre alphabétique reste.
            list = list.map(function (a, i) { return { a: a, i: i, n: s.launches[a.id] || 0 }; })
                .sort(function (x, y) { return (y.n - x.n) || (x.i - y.i); })
                .map(function (x) { return x.a; });
        }
        return list;
    }

    function favorites() {
        var s = store.get();
        return (s.favorites || []).map(appById).filter(function (a) {
            return a && s.hiddenApps.indexOf(a.id) < 0;
        });
    }

    function isFavorite(id) { return (store.get().favorites || []).indexOf(id) >= 0; }

    function loadApps() {
        return platform.listApps().then(function (apps) {
            state.apps = apps;
            state.appsLoaded = true;
            store.set({ appsCache: apps });
            var s = store.get();
            if (s.favorites === null || s.favoritesVersion < 2) {
                // Premier lancement (ou favoris choisis avant le tri) : les premières vraies applis.
                store.set({
                    favorites: visibleApps().slice(0, 8).map(function (a) { return a.id; }),
                    favoritesVersion: 2
                });
            }
        }).catch(function (err) {
            state.appsLoaded = true;
            TC.ui.toast('Impossible de lister les applications (' + platform.errorText(err) + ')', 5000);
        });
    }

    function loadInputs() {
        return platform.listInputs().then(function (inputs) {
            state.inputs = inputs;
            state.inputsError = null;
        }).catch(function (err) {
            state.inputs = [];
            state.inputsError = platform.errorText(err);
        });
    }

    function refreshAll() {
        return Promise.all([loadApps(), loadInputs()]).then(function () { render(); });
    }

    /* ------------------------------------------------------------------ */
    /* Rendu                                                               */
    /* ------------------------------------------------------------------ */
    function appTile(app, row, showFav) {
        return h('button', {
            class: 'tile focusable' + (state.moving === app.id ? ' moving' : ''),
            'data-row': row,
            'data-app': app.id
        }, [
            TC.ui.appArt(app, store.get().logoStyle),
            showFav && isFavorite(app.id) ? h('span', { class: 'fav-dot' }) : null,
            // Comme CleanYourTV : sous la bande, le nom apparaît sous la carte sélectionnée.
            row !== 'favorites' ? h('span', { class: 'name', text: app.name }) : null
        ]);
    }

    function inputIcon(type) { return type === 'HDMI' || type === 'DVI' ? ICONS.hdmi : type === 'TV' ? ICONS.tv : ICONS.av; }

    function inputTile(src) {
        return h('button', {
            class: 'tile input focusable' + (src.connected ? ' on' : ''),
            'data-row': 'inputs',
            'data-input': src.key
        }, [
            h('div', { class: 'art' }, [
                h('span', { html: inputIcon(src.type) }),
                h('span', { class: 'port', text: src.label }),
                h('span', { class: 'state', text: src.connected ? 'Connecté' : 'Non connecté' })
            ])
        ]);
    }

    function renderDock() {
        var dock = doc.getElementById('dock');
        var track = dock.querySelector('.track');
        var scroll = track ? track.scrollLeft : 0;
        var favs = favorites();
        var tiles = favs.map(function (a) { return appTile(a, 'favorites', false); });
        if (!state.moving) {
            tiles.push(h('button', { class: 'tile ghost focusable', 'data-row': 'favorites', 'data-action': 'manage-favorites' }, [
                h('div', { class: 'art' }, [
                    h('span', { class: 'plus', text: '+' }),
                    h('span', { class: 'hint-text', text: favs.length ? 'Gérer les favoris' : 'Ajouter des favoris' })
                ])
            ]));
        }
        dock.innerHTML = '';
        var newTrack = h('div', { class: 'track', 'data-scroll': 'x' }, tiles);
        dock.appendChild(h('div', { class: 'band' }, [newTrack]));
        if (state.moving) dock.appendChild(h('p', { class: 'note', text: '◀ ▶ pour déplacer · OK pour valider' }));
        newTrack.scrollLeft = scroll;
    }

    function renderSections() {
        var s = store.get();
        var main = doc.getElementById('sections');
        main.innerHTML = '';
        s.sections.forEach(function (id) {
            if (id === 'inputs' && s.showInputsRow) {
                var tiles = state.inputs.map(inputTile);
                if (state.inputsError) {
                    tiles = [h('button', { class: 'tile ghost focusable', 'data-row': 'inputs', 'data-action': 'inputs-help' }, [
                        h('div', { class: 'art' }, [h('span', { class: 'hint-text', text: 'Entrées indisponibles · touche SOURCE' })])
                    ])];
                }
                main.appendChild(h('section', { class: 'row-section', 'data-section': 'inputs' }, [
                    h('h2', { text: 'Entrées' }),
                    h('div', { class: 'grid' }, tiles)
                ]));
            }
            if (id === 'apps') {
                var all = visibleApps();
                var grid = all.map(function (a, i) { return appTile(a, 'apps-' + Math.floor(i / s.cols), true); });
                if (!all.length && state.appsLoaded) {
                    grid.push(h('button', { class: 'tile ghost focusable', 'data-row': 'apps-0', 'data-action': 'refresh' }, [
                        h('div', { class: 'art' }, [h('span', { class: 'plus', text: '↻' }), h('span', { class: 'hint-text', text: 'Aucune appli détectée · Actualiser' })])
                    ]));
                }
                main.appendChild(h('section', { class: 'row-section', 'data-section': 'apps', 'data-count': all.length }, [
                    h('div', { class: 'grid' }, grid)
                ]));
            }
        });
    }

    function focusKey(el) {
        if (!el) return null;
        if (el.getAttribute('data-app')) return '[data-row="' + el.getAttribute('data-row') + '"][data-app="' + el.getAttribute('data-app') + '"]';
        if (el.getAttribute('data-input')) return '[data-input="' + el.getAttribute('data-input') + '"]';
        if (el.getAttribute('data-action')) return '[data-action="' + el.getAttribute('data-action') + '"]';
        return null;
    }

    function render(focusSelector) {
        var keep = focusSelector || focusKey(TC.focus.current);
        renderDock();
        renderSections();
        if (!state.overlay) TC.focus.restore(keep);
    }

    // Grand titre et halo suivent l'élément sélectionné.
    var heroTimer = null;
    function setHero(text) {
        var el = doc.getElementById('hero');
        if (el.textContent === text) return;
        el.classList.add('swap');
        clearTimeout(heroTimer);
        heroTimer = setTimeout(function () { el.textContent = text; el.classList.remove('swap'); }, 90);
    }

    function onFocus(el) {
        if (state.overlay) return;
        var appId = el.getAttribute('data-app');
        var app = appId ? appById(appId) : null;
        if (app) {
            setHero(app.name);
            if (!themeOf(store.get().theme).glow) TC.ui.ambient.set(TC.ui.glowOf(app));
            return;
        }
        var key = el.getAttribute('data-input');
        if (key) { var src = inputByKey(key); if (src) setHero(src.label); }
    }

    /* ------------------------------------------------------------------ */
    /* Actions                                                             */
    /* ------------------------------------------------------------------ */
    function launch(app) {
        var launches = Object.assign({}, store.get().launches);
        launches[app.id] = (launches[app.id] || 0) + 1;
        store.set({ launches: launches });
        platform.launchApp(app.id).then(function () {
            if (platform.preview) TC.ui.toast('Aperçu : lancement de ' + app.name);
        }).catch(function (err) {
            TC.ui.toast('Impossible d’ouvrir ' + app.name + ' (' + platform.errorText(err) + ')', 5000);
        });
    }

    function toggleFavorite(id) {
        var favs = (store.get().favorites || []).slice();
        var i = favs.indexOf(id);
        if (i >= 0) favs.splice(i, 1); else favs.push(id);
        store.set({ favorites: favs });
        var app = appById(id);
        TC.ui.toast((i >= 0 ? 'Retiré des favoris : ' : 'Ajouté aux favoris : ') + (app ? app.name : id));
    }

    function startMove(id) {
        state.moving = id;
        render('[data-row="favorites"][data-app="' + id + '"]');
    }

    function moveFavorite(delta) {
        var favs = (store.get().favorites || []).slice();
        var visibleIds = favorites().map(function (a) { return a.id; });
        var vi = visibleIds.indexOf(state.moving);
        var target = visibleIds[vi + delta];
        if (vi < 0 || !target) return;
        var a = favs.indexOf(state.moving);
        var b = favs.indexOf(target);
        favs[a] = target;
        favs[b] = state.moving;
        store.set({ favorites: favs });
        render('[data-row="favorites"][data-app="' + state.moving + '"]');
    }

    function endMove() {
        var id = state.moving;
        state.moving = null;
        render('[data-row="favorites"][data-app="' + id + '"]');
        TC.ui.toast('Ordre des favoris enregistré');
    }

    function inputByKey(key) {
        for (var i = 0; i < state.inputs.length; i++) if (state.inputs[i].key === key) return state.inputs[i];
        return null;
    }

    var hintTimer = null;
    function showWatchHint() {
        var el = doc.getElementById('watch-hint');
        el.textContent = state.watching.label + ' · Retour pour revenir à l’accueil';
        el.hidden = false;
        el.classList.add('show');
        clearTimeout(hintTimer);
        hintTimer = setTimeout(function () { el.classList.remove('show'); }, 4000);
    }

    function watch(src) {
        platform.watchInput(src).then(function () {
            state.watching = src;
            doc.body.classList.add('watching');
            showWatchHint();
        }).catch(function (err) {
            TC.ui.toast('Impossible d’afficher ' + src.label + ' (' + platform.errorText(err) + '). Utilise la touche SOURCE.', 6000);
        });
    }

    function stopWatch() {
        platform.stopWatching().catch(function () { /* déjà masquée */ });
        state.watching = null;
        doc.body.classList.remove('watching');
        doc.getElementById('watch-hint').hidden = true;
        loadInputs().then(function () { render(); });
    }

    function activate(el) {
        var action = el.getAttribute('data-action');
        if (action === 'settings') return openSettings();
        if (action === 'inputs') return openInputsMenu(el);
        if (action === 'network') {
            return TC.ui.toast(state.network === 'NONE' ? 'TV hors ligne' : 'Connectée en ' + (NETWORK_LABELS[state.network] || 'réseau'));
        }
        if (action === 'manage-favorites') return openManageFavorites();
        if (action === 'inputs-help') return openInputsHelp();
        if (action === 'refresh') return refreshAll().then(function () { TC.ui.toast('Applications actualisées'); });
        var appId = el.getAttribute('data-app');
        if (appId) {
            var app = appById(appId);
            if (app) launch(app);
            return;
        }
        var key = el.getAttribute('data-input');
        if (key) {
            var src = inputByKey(key);
            if (src) watch(src);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Fenêtres : menus, paramètres                                        */
    /* ------------------------------------------------------------------ */
    function openOverlay(build, opts) {
        opts = opts || {};
        var overlay = doc.getElementById('overlay');
        overlay.innerHTML = '';
        overlay.className = opts.light ? 'light' : '';
        var panel = h('div', { class: 'panel ' + (opts.kind || 'dialog') });
        overlay.appendChild(panel);
        overlay.hidden = false;
        var ctx = { panel: panel };
        state.overlay = ctx;
        build(panel, ctx);
        // Laisse le navigateur poser le panneau avant l'animation d'ouverture.
        requestAnimationFrame(function () { overlay.classList.add('open'); });
        TC.focus.push(panel, panel.querySelector('[data-first]'));
        return ctx;
    }

    function closeOverlay() {
        var overlay = doc.getElementById('overlay');
        overlay.classList.remove('open');
        overlay.hidden = true;
        overlay.innerHTML = '';
        state.overlay = null;
        TC.focus.pop();
    }

    function menuItem(label, fn, first) {
        var b = h('button', { class: 'item focusable', 'data-first': first || null }, [h('span', { text: label })]);
        b._activate = fn;
        return b;
    }

    function openMenu(title, items) {
        openOverlay(function (panel) {
            panel.appendChild(h('h3', { text: title }));
            var list = h('div', { class: 'list', 'data-scroll': 'y' });
            items.forEach(function (it, i) { list.appendChild(menuItem(it[0], it[1], i === 0)); });
            panel.appendChild(list);
        });
    }

    function openTileOptions(el) {
        var appId = el.getAttribute('data-app');
        if (!appId) return false;
        var app = appById(appId);
        if (!app) return false;
        var fav = isFavorite(appId);
        var items = [['Ouvrir', function () { closeOverlay(); launch(app); }]];
        items.push([fav ? 'Retirer des favoris' : 'Ajouter aux favoris', function () { closeOverlay(); toggleFavorite(appId); render(); }]);
        if (fav) items.push(['Déplacer dans les favoris', function () { closeOverlay(); startMove(appId); }]);
        items.push(['Masquer cette appli', function () {
            closeOverlay();
            store.set({ hiddenApps: store.get().hiddenApps.concat([appId]) });
            render();
            TC.ui.toast('Masquée : ' + app.name + ' (Paramètres ▸ Applis masquées pour la réafficher)', 4000);
        }]);
        items.push(['Annuler', closeOverlay]);
        openMenu(app.name, items);
        return true;
    }

    function reorderFavorites() {
        var first = favorites()[0];
        if (first) startMove(first.id); else TC.ui.toast('Aucun favori à réorganiser');
    }

    function openOptions() {
        openMenu('Options', [
            ['Actualiser les applications', function () { closeOverlay(); refreshAll().then(function () { TC.ui.toast('Applications actualisées'); }); }],
            ['Réorganiser les favoris', function () { closeOverlay(); reorderFavorites(); }],
            ['Gérer les favoris', function () { closeOverlay(); openManageFavorites(); }],
            ['Paramètres', function () { closeOverlay(); openSettings(); }],
            ['Quitter TeleCoding', function () { closeOverlay(); platform.exit(); }]
        ]);
    }

    // Menu déroulant sous la pastille « Entrées ».
    function openInputsMenu(pill) {
        var r = pill.getBoundingClientRect();
        openOverlay(function (panel) {
            panel.style.top = (r.bottom + 16) + 'px';
            panel.style.left = r.left + 'px';
            var list = h('div', { class: 'list', 'data-scroll': 'y' });
            if (state.inputsError) {
                list.appendChild(menuItem('Indisponible · utilise la touche SOURCE', function () { closeOverlay(); openInputsHelp(); }, true));
            }
            var lastType = null;
            state.inputs.forEach(function (src, i) {
                var group = src.type === 'HDMI' ? 'HDMI' : src.type;
                if (lastType && group !== lastType) list.appendChild(h('div', { class: 'sep' }));
                lastType = group;
                var b = h('button', { class: 'item source focusable', 'data-first': i === 0 || null, 'data-source': src.key }, [
                    h('span', { html: inputIcon(src.type) }),
                    h('span', { class: 'grow', text: src.label }),
                    src.connected ? h('span', { class: 'status', text: 'Connecté' }) : null
                ]);
                b._activate = function () { closeOverlay(); watch(src); };
                list.appendChild(b);
            });
            panel.appendChild(list);
        }, { kind: 'dropdown', light: true });
    }

    function openInputsHelp() {
        openOverlay(function (panel) {
            panel.appendChild(h('h3', { text: 'Entrées HDMI' }));
            panel.appendChild(h('p', { class: 'text', text: 'Cette TV ne laisse pas TeleCoding lire la liste des entrées (' + state.inputsError + ').' }));
            panel.appendChild(h('p', { class: 'text', text: 'Utilise la touche SOURCE de la télécommande pour changer d’entrée.' }));
            panel.appendChild(menuItem('Compris', closeOverlay, true));
        });
    }

    function openManageFavorites() {
        openOverlay(function (panel) {
            panel.appendChild(h('h3', { text: 'Gérer les favoris' }));
            panel.appendChild(h('p', { class: 'text', text: 'OK pour ajouter ou retirer. Retour pour fermer.' }));
            var list = h('div', { class: 'list', 'data-scroll': 'y' });
            visibleApps().forEach(function (app, i) {
                var b = h('button', { class: 'item check focusable' + (isFavorite(app.id) ? ' on' : ''), 'data-first': i === 0 || null, 'data-app-check': app.id }, [
                    h('span', { text: app.name }), h('span', { class: 'box' })
                ]);
                b._activate = function () {
                    var favs = (store.get().favorites || []).slice();
                    var idx = favs.indexOf(app.id);
                    if (idx >= 0) favs.splice(idx, 1); else favs.push(app.id);
                    store.set({ favorites: favs });
                    b.classList.toggle('on', idx < 0);
                    render();
                };
                list.appendChild(b);
            });
            if (!visibleApps().length) list.appendChild(menuItem('Aucune application détectée', closeOverlay, true));
            panel.appendChild(list);
        }, { kind: 'side' });
    }

    function choiceLabel(list, id) {
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label;
        return String(id);
    }

    function cycle(list, id, delta) {
        var i = 0;
        for (var j = 0; j < list.length; j++) if (list[j].id === id) i = j;
        return list[(i + delta + list.length) % list.length].id;
    }

    function openTextInput(title, value, placeholder, onSubmit) {
        var done = false;
        openOverlay(function (panel) {
            panel.appendChild(h('h3', { text: title }));
            var input = h('input', { type: 'text', class: 'field focusable', value: value || '', placeholder: placeholder, 'data-first': true });
            input._submit = function () {
                if (done) return;
                done = true;
                closeOverlay();
                onSubmit(input.value.trim());
            };
            panel.appendChild(input);
            panel.appendChild(h('p', { class: 'text', text: 'OK pour valider · Retour pour annuler' }));
        });
    }

    function openSettings() {
        var ctx = openOverlay(function (panel) {
            panel.appendChild(h('h3', { text: 'Paramètres' }));
            var list = h('div', { class: 'list', 'data-scroll': 'y' });
            panel.appendChild(list);
            build(list);
        }, { kind: 'side' });

        function row(label, value, handlers, first) {
            var b = h('button', { class: 'item setting focusable', 'data-first': first || null, 'data-setting': label }, [
                h('span', { class: 'label', text: label }),
                h('span', { class: 'value' }, [
                    h('i', { class: handlers.cycle ? 'chev' : 'chev none', text: '‹' }),
                    h('b', { text: value }),
                    h('i', { class: handlers.cycle ? 'chev' : 'chev none', text: '›' })
                ])
            ]);
            b._activate = handlers.activate || (handlers.cycle ? function () { handlers.cycle(1); } : null);
            b._horizontal = handlers.cycle || null;
            return b;
        }

        function rebuild() {
            var list = ctx.panel.querySelector('.list');
            var cur = TC.focus.current;
            var key = cur ? cur.getAttribute('data-setting') : null;
            var scroll = list.scrollTop;
            list.innerHTML = '';
            build(list);
            list.scrollTop = scroll;
            var target = key ? list.querySelector('[data-setting="' + key.replace(/"/g, '\\"') + '"]') : null;
            TC.focus.set(target || list.querySelector('.focusable'));
        }

        function build(list) {
            var s = store.get();
            function set(patch) { store.set(patch); rebuild(); }

            list.appendChild(h('div', { class: 'group', text: 'Apparence' }));
            list.appendChild(row('Thème', choiceLabel(THEMES, s.theme), {
                cycle: function (d) { set({ theme: cycle(THEMES, s.theme, d) }); }
            }, true));
            list.appendChild(row('Fond d’écran', choiceLabel(WALLPAPERS, s.wallpaper), {
                cycle: function (d) { set({ wallpaper: cycle(WALLPAPERS, s.wallpaper, d) }); }
            }));
            if (s.wallpaper === 'custom') {
                list.appendChild(row('Adresse de l’image', s.wallpaperUrl || 'Non définie', {
                    activate: function () {
                        openTextInput('Adresse de l’image (https://…)', s.wallpaperUrl, 'https://…', function (v) {
                            store.set({ wallpaperUrl: v });
                            openSettings();
                        });
                    }
                }));
            }
            list.appendChild(row('Logos des applis', s.logoStyle === 'samsung' ? 'Icônes Samsung' : 'Pack TeleCoding', {
                cycle: function () { set({ logoStyle: s.logoStyle === 'samsung' ? 'pack' : 'samsung' }); render(); }
            }));
            list.appendChild(row('Applis par rangée', choiceLabel(COLS, s.cols), {
                cycle: function (d) { set({ cols: cycle(COLS, s.cols, d) }); render(); }
            }));
            list.appendChild(row('Animations', choiceLabel(ANIMATIONS, s.animations), {
                cycle: function (d) { set({ animations: cycle(ANIMATIONS, s.animations, d) }); }
            }));

            list.appendChild(h('div', { class: 'group', text: 'En-tête' }));
            list.appendChild(row('Salutation', s.showGreeting ? 'Oui' : 'Non', {
                cycle: function () { set({ showGreeting: !s.showGreeting }); }
            }));
            list.appendChild(row('Format de l’heure', s.clock24 ? '24 h' : '12 h', {
                cycle: function () { set({ clock24: !s.clock24 }); }
            }));
            list.appendChild(row('Afficher la date', s.showDate ? 'Oui' : 'Non', {
                cycle: function () { set({ showDate: !s.showDate }); }
            }));
            list.appendChild(row('Afficher la météo', s.showWeather ? 'Oui' : 'Non', {
                cycle: function () { set({ showWeather: !s.showWeather }); refreshWeather(); }
            }));
            if (s.showWeather) {
                list.appendChild(row('Ville (météo)', s.weatherCity || 'À définir', {
                    activate: function () {
                        openTextInput('Ville pour la météo', s.weatherCity, 'Ex. Lille', function (v) {
                            if (!v) { openSettings(); return; }
                            geocode(v).then(function (g) {
                                store.set({ weatherCity: g.name, weatherLat: g.lat, weatherLon: g.lon });
                                refreshWeather();
                                TC.ui.toast('Météo : ' + g.name);
                            }).catch(function (err) {
                                TC.ui.toast('Météo : ' + (err.message || 'réseau indisponible'), 4000);
                            }).then(openSettings);
                        });
                    }
                }));
            }

            list.appendChild(h('div', { class: 'group', text: 'Accueil' }));
            list.appendChild(row('Gérer les favoris', (s.favorites || []).length + ' favori(s)', {
                activate: function () { closeOverlay(); openManageFavorites(); }
            }));
            list.appendChild(row('Réorganiser les favoris', '', {
                activate: function () { closeOverlay(); reorderFavorites(); }
            }));
            list.appendChild(row('Rangée Entrées', s.showInputsRow ? 'Affichée' : 'Menu seulement', {
                cycle: function () { set({ showInputsRow: !s.showInputsRow }); render(); }
            }));
            if (s.showInputsRow) {
                var inputsFirst = s.sections.indexOf('inputs') < s.sections.indexOf('apps');
                list.appendChild(row('Ordre des rangées', inputsFirst ? 'Entrées, puis applis' : 'Applis, puis entrées', {
                    cycle: function () {
                        set({ sections: inputsFirst ? ['favorites', 'apps', 'inputs'] : ['favorites', 'inputs', 'apps'] });
                        render();
                    }
                }));
            }
            list.appendChild(row('Ordre des applis', s.appSort === 'usage' ? 'Les plus utilisées' : 'De A à Z', {
                cycle: function () { set({ appSort: s.appSort === 'usage' ? 'alpha' : 'usage' }); render(); }
            }));
            list.appendChild(row('Applis système', s.showSystemApps ? 'Affichées' : 'Masquées', {
                cycle: function () { set({ showSystemApps: !s.showSystemApps }); render(); }
            }));
            list.appendChild(row('Applis masquées', s.hiddenApps.length ? s.hiddenApps.length + ' · OK pour tout réafficher' : 'Aucune', {
                activate: function () {
                    if (!s.hiddenApps.length) return;
                    set({ hiddenApps: [] });
                    render();
                    TC.ui.toast('Toutes les applis sont réaffichées');
                }
            }));

            list.appendChild(h('div', { class: 'group', text: 'Système' }));
            list.appendChild(row('Actualiser les applications', '', {
                activate: function () { refreshAll().then(function () { TC.ui.toast('Applications actualisées'); }); }
            }));
            list.appendChild(row('Réinitialiser l’apparence', '', {
                activate: function () { store.reset(); rebuild(); render(); TC.ui.toast('Apparence réinitialisée (favoris conservés)'); }
            }));
            list.appendChild(row('Quitter TeleCoding', '', {
                activate: function () { platform.exit(); }
            }));
            list.appendChild(h('p', { class: 'text small', text:
                'TeleCoding 2.0 · Sur Samsung (Tizen), la touche HOME ouvre toujours le Smart Hub : ' +
                'c’est imposé par le système. Pour que TeleCoding s’ouvre au démarrage, active ' +
                '« Exécution auto. de la dernière appli » dans les réglages de la TV.' }));
        }
    }

    /* ------------------------------------------------------------------ */
    /* Télécommande                                                        */
    /* ------------------------------------------------------------------ */
    var DIRS = {};
    DIRS[K.LEFT] = 'left'; DIRS[K.RIGHT] = 'right'; DIRS[K.UP] = 'up'; DIRS[K.DOWN] = 'down';

    function isBack(code) { return code === K.BACK || code === 27 || code === 8; }
    function isMenu(code) { return code === K.MENU || code === K.TOOLS || code === K.YELLOW || code === 77 /* M */; }

    var press = null; // appui OK en cours : { el, timer, long }

    function onKeyDown(e) {
        var code = e.keyCode;
        var el = TC.focus.current;

        // Champ de saisie : on laisse le clavier virtuel travailler.
        if (el && el.tagName === 'INPUT') {
            if (code === K.ENTER || code === K.IME_DONE) { e.preventDefault(); if (el._submit) el._submit(); return; }
            if ((isBack(code) && code !== 8) || code === K.IME_CANCEL) { e.preventDefault(); closeOverlay(); return; }
            if (code !== K.UP && code !== K.DOWN) return;
        }

        if (state.watching) {
            e.preventDefault();
            if (isBack(code)) stopWatch(); else showWatchHint();
            return;
        }

        if (DIRS[code]) {
            e.preventDefault();
            var dir = DIRS[code];
            if (state.moving) {
                if (dir === 'left') moveFavorite(-1);
                if (dir === 'right') moveFavorite(1);
                return;
            }
            if (el && el._horizontal && (dir === 'left' || dir === 'right')) {
                el._horizontal(dir === 'left' ? -1 : 1);
                return;
            }
            TC.focus.move(dir);
            return;
        }

        if (code === K.ENTER) {
            e.preventDefault();
            if (e.repeat || !el) return;
            if (state.moving) { endMove(); return; }
            if (press) { clearTimeout(press.timer); press = null; }
            // Appui long sur une carte d'appli = menu d'options.
            press = { el: el, long: false, timer: null };
            if (!state.overlay && el.getAttribute('data-app')) {
                press.timer = setTimeout(function () {
                    if (!press) return;
                    press.long = true;
                    openTileOptions(press.el);
                }, LONG_PRESS_MS);
            }
            return;
        }

        if (isBack(code)) {
            e.preventDefault();
            if (state.moving) { endMove(); return; }
            if (state.overlay) { closeOverlay(); return; }
            // Sur l'accueil, Retour ramène simplement au premier favori.
            var first = doc.querySelector('#dock .focusable');
            if (first) TC.focus.set(first);
            return;
        }

        if (isMenu(code)) {
            e.preventDefault();
            if (state.overlay || state.moving) return;
            if (!el || !openTileOptions(el)) openOptions();
            return;
        }

        if (code === K.BLUE) { e.preventDefault(); if (!state.overlay) openSettings(); }
    }

    function onKeyUp(e) {
        if (e.keyCode !== K.ENTER || !press) return;
        var p = press;
        press = null;
        clearTimeout(p.timer);
        if (p.long) return;
        if (p.el !== TC.focus.current) return;
        if (p.el._activate) p.el._activate();
        else if (!state.overlay) activate(p.el);
    }

    /* ------------------------------------------------------------------ */
    /* Démarrage                                                           */
    /* ------------------------------------------------------------------ */
    function start() {
        platform.registerKeys();
        doc.getElementById('preview-badge').hidden = !platform.preview;
        doc.addEventListener('keydown', onKeyDown);
        doc.addEventListener('keyup', onKeyUp);
        // Un clic de souris (aperçu PC) se comporte comme OK.
        doc.addEventListener('click', function (e) {
            var el = e.target.closest ? e.target.closest('.focusable') : null;
            if (!el) return;
            TC.focus.set(el);
            if (el._activate) el._activate(); else if (!state.overlay) activate(el);
        });
        TC.focus.onChange(onFocus);
        // Les couleurs d'une icône arrivent quand elle est chargée : on rafraîchit le halo.
        TC.ui.colorReady = function (id) {
            var el = TC.focus.current;
            if (el && el.getAttribute('data-app') === id) onFocus(el);
        };
        store.onChange(function (s, patch) {
            if ('theme' in patch || 'animations' in patch || 'wallpaper' in patch || 'wallpaperUrl' in patch ||
                'showDate' in patch || 'clock24' in patch || 'showWeather' in patch || 'showGreeting' in patch ||
                'cols' in patch) applyLook();
        });
        doc.addEventListener('visibilitychange', function () {
            if (doc.hidden) return;
            tick();
            refreshAll();
            refreshWeather();
            refreshNetwork();
        });

        applyLook();
        scheduleClock();
        refreshNetwork();
        TC.focus.push(doc.getElementById('app'));
        function showHome() {
            if (doc.body.classList.contains('ready')) return;
            var first = doc.querySelector('#dock .focusable');
            if (first) TC.focus.set(first);
            doc.body.classList.add('ready');
        }
        // Démarrage instantané : la dernière liste connue s'affiche tout de suite,
        // la vraie liste la remplace dès que la TV l'a renvoyée.
        var cached = store.get().appsCache;
        if (cached.length && store.get().favorites) {
            state.apps = cached;
            render();
            showHome();
        }
        refreshAll().then(showHome);
        refreshWeather();
        setInterval(refreshWeather, 30 * 60 * 1000);
    }

    TC.app = { state: state, render: render, refreshAll: refreshAll };
    start();
})(this);
