/*
 * TeleCoding : écran d'accueil, transposé du launcher CleanYourTV (MIT) pour Samsung Tizen.
 *
 * Modèle (comme CleanYourTV) : une seule liste ordonnée d'applis, `home`. Les `cols` premières
 * forment la bande (le dock), les suivantes la grille. Les autres sont dans la bibliothèque
 * d'applications. Une appli nouvellement installée s'ajoute à la fin de l'accueil.
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
        network: null,
        reorder: null,     // { held: id | null } pendant « Réorganiser les applis »
        watching: null,    // source affichée en plein écran
        overlay: null,     // fenêtre ouverte
        weather: null
    };

    var LONG_PRESS_MS = 650;

    // Textes repris de la traduction française de CleanYourTV (values-fr/strings.xml).
    var T = {
        inputs: 'Sources',
        settings: 'Paramètres',
        connected: 'Connecté',
        liveTv: 'TV en direct',
        noInputs: 'Aucune source trouvée',
        notAvailable: 'Indisponible sur cette TV',
        offline: 'Hors ligne',
        ethernet: 'Ethernet',
        wifi: 'Wi-Fi',
        tvSettings: 'Paramètres du téléviseur',
        network: 'Réseau',
        launcherSettings: 'Paramètres du lanceur',
        reorder: 'Réorganiser les applis',
        reorderHint: 'OK prend une appli, les flèches la déplacent, Retour la pose. Retour à nouveau pour terminer.',
        move: 'Déplacer',
        library: 'Bibliothèque d’applications',
        libraryHintAdd: 'Appuyer : ajouter à Accueil · Maintenir : options',
        libraryEmpty: 'Aucune application à ouvrir',
        onHome: 'Sur l’accueil',
        addHome: 'Ajouter à l’accueil',
        removeHome: 'Retirer de l’accueil',
        open: 'Ouvrir',
        columns: 'Applications par ligne',
        followTheme: 'Suivre le thème (réinitialiser les choix)',
        cantOpen: 'Impossible d’ouvrir '
    };

    var THEMES = [
        { id: 'ambiance', label: 'Ambiance (couleur de l’appli)' },
        { id: 'noir', label: 'Noir' },
        { id: 'oled', label: 'Noir OLED' },
        { id: 'minuit', label: 'Minuit', glow: [48, 86, 190] },
        { id: 'ambre', label: 'Ambre', glow: [190, 104, 36] },
        { id: 'emeraude', label: 'Émeraude', glow: [20, 140, 120] }
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
        { id: 'subtle', label: 'Activées' },
        { id: 'normal', label: 'Effets avancés' }
    ];
    var COLS = [{ id: 4, label: '4' }, { id: 5, label: '5' }, { id: 6, label: '6' }, { id: 7, label: '7' }];

    var ICONS = {
        hdmi: '<svg viewBox="0 0 24 24"><path d="M7 3h10v6l-1.5 2v6.5a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5V11L7 9z"/></svg>',
        tv: '<svg viewBox="0 0 24 24"><path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm1 2v8h14V8zM8 2.5l4 3 4-3 .9 1.2L13.2 6h-2.4L7.1 3.7zM8 20h8v1.5H8z"/></svg>',
        av: '<svg viewBox="0 0 24 24"><path d="M5 3h2v6h1.5v4H7v8H5v-8H3.5V9H5zm6 0h2v10h1.5v4H13v4h-2v-4H9.5v-4H11zm6 0h2v4h1.5v4H19v10h-2V11h-1.5V7H17z"/></svg>',
        gear: '<svg viewBox="0 0 24 24"><path d="M19.1 12.9a7 7 0 0 0 0-1.8l2-1.5-2-3.4-2.3.9a7 7 0 0 0-1.6-.9L14.9 3.8h-3.8l-.3 2.4a7 7 0 0 0-1.6.9l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 1.8l-2 1.5 2 3.4 2.3-.9c.5.4 1 .7 1.6.9l.3 2.4h3.8l.3-2.4c.6-.2 1.1-.5 1.6-.9l2.3.9 2-3.4zM13 15.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4z" transform="translate(-1 0)"/></svg>',
        wifi: '<svg viewBox="0 0 24 24"><path d="M12 19.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM6.3 13.6l1.6 1.6a5.8 5.8 0 0 1 8.2 0l1.6-1.6a8.1 8.1 0 0 0-11.4 0zM3 10.3l1.6 1.6a10.5 10.5 0 0 1 14.8 0l1.6-1.6a12.8 12.8 0 0 0-18 0z"/></svg>',
        apps: '<svg viewBox="0 0 24 24"><path d="M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 10h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 16h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z"/></svg>',
        swap: '<svg viewBox="0 0 24 24"><path d="M8 3 4 7h3v7h2V7h3zm9 14V10h-2v7h-3l4 4 4-4z"/></svg>',
        home: '<svg viewBox="0 0 24 24"><path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/></svg>'
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
    // Mêmes tranches horaires que CleanYourTV (MainActivity, langues par défaut).
    function greetingFor(hour) {
        if (hour < 5) return 'Bonne nuit';
        if (hour < 12) return 'Bonjour';
        if (hour < 17) return 'Bon après-midi';
        if (hour < 22) return 'Bonsoir';
        return 'Bonne nuit';
    }

    function tick() {
        var s = store.get();
        var now = new Date();
        var hh = now.getHours();
        var mm = ('0' + now.getMinutes()).slice(-2);
        doc.getElementById('greeting').textContent = greetingFor(hh);
        doc.getElementById('time').innerHTML = s.clock24
            ? ('0' + hh).slice(-2) + ':' + mm
            : ((hh % 12) || 12) + ':' + mm + '<small>' + (hh < 12 ? 'AM' : 'PM') + '</small>';
        // date_format de CleanYourTV en français : « EEEE d MMMM ».
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

    // Pastille réseau : nom du Wi-Fi quand la TV le donne, sinon Wi-Fi / Ethernet / Hors ligne.
    function refreshNetwork() {
        platform.network().then(function (n) {
            state.network = n;
            var label = n.type === 'NONE' ? T.offline : n.type === 'ETHERNET' ? T.ethernet : (n.ssid || T.wifi);
            doc.getElementById('net-label').textContent = label;
        }).catch(function () { /* on garde « Wi-Fi » */ });
    }

    /* ------------------------------------------------------------------ */
    /* Données : applications et sources                                   */
    /* ------------------------------------------------------------------ */
    function appById(id) {
        for (var i = 0; i < state.apps.length; i++) if (state.apps[i].id === id) return state.apps[i];
        return null;
    }

    function homeApps() {
        return (store.get().home || []).map(appById).filter(Boolean);
    }

    function isOnHome(id) { return (store.get().home || []).indexOf(id) >= 0; }

    // Construit ou met à jour la liste de l'accueil à partir des applis installées.
    function syncHome(apps) {
        var s = store.get();
        var ids = apps.map(function (a) { return a.id; });
        var user = apps.filter(function (a) { return !a.system; });
        var home = s.home;
        if (home === null) {
            // Premier lancement, ou migration : d'abord les anciens favoris, puis les autres vraies applis.
            home = (s.favorites || []).filter(function (id) { return ids.indexOf(id) >= 0; });
            user.forEach(function (a) {
                if (home.indexOf(a.id) < 0 && s.hiddenApps.indexOf(a.id) < 0) home.push(a.id);
            });
        } else if (s.knownApps.length) {
            // Une appli installée depuis la dernière fois s'ajoute à la fin de l'accueil.
            user.forEach(function (a) {
                if (s.knownApps.indexOf(a.id) < 0 && home.indexOf(a.id) < 0) home.push(a.id);
            });
        }
        store.set({ home: home, knownApps: ids, appsCache: apps });
    }

    function loadApps() {
        return platform.listApps().then(function (apps) {
            state.apps = apps;
            state.appsLoaded = true;
            syncHome(apps);
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

    function sourceLabel(src) { return src.type === 'TV' ? T.liveTv : src.label; }

    /* ------------------------------------------------------------------ */
    /* Rendu de l'accueil                                                  */
    /* ------------------------------------------------------------------ */
    function appTile(app, row) {
        var held = state.reorder && state.reorder.held === app.id;
        return h('button', {
            class: 'tile focusable' + (held ? ' held' : ''),
            'data-row': row,
            'data-app': app.id
        }, [
            TC.ui.appArt(app, store.get().logoStyle),
            // Sous la bande, le nom apparaît sous la carte sélectionnée.
            row !== 'dock' ? h('span', { class: 'name', text: app.name }) : null
        ]);
    }

    function renderDock(apps, cols) {
        var dock = doc.getElementById('dock');
        var old = dock.querySelector('.track');
        var scroll = TC.focus.offsetOf(old);
        var tiles = apps.slice(0, cols).map(function (a) { return appTile(a, 'dock'); });
        if (!tiles.length && state.appsLoaded) {
            tiles.push(h('button', { class: 'tile ghost focusable', 'data-row': 'dock', 'data-action': 'library' }, [
                h('div', { class: 'art' }, [
                    h('span', { class: 'plus', html: ICONS.apps }),
                    h('span', { class: 'hint-text', text: T.library })
                ])
            ]));
        }
        dock.innerHTML = '';
        var track = h('div', { class: 'track', 'data-scroll': 'x' }, tiles);
        dock.appendChild(h('div', { class: 'band' }, [track]));
        TC.focus.setOffset(track, scroll, false);
    }

    function renderGrid(apps, cols) {
        var main = doc.getElementById('sections');
        main.innerHTML = '';
        var rest = apps.slice(cols);
        var grid = rest.map(function (a, i) { return appTile(a, 'row-' + (1 + Math.floor(i / cols))); });
        main.appendChild(h('section', { class: 'row-section', 'data-section': 'apps' }, [h('div', { class: 'grid' }, grid)]));
        // Pastille « Bibliothèque d'applications » (show_library_pill de CleanYourTV).
        main.appendChild(h('div', { class: 'library-pill-row' }, [
            h('button', { class: 'pill library-pill focusable', 'data-row': 'library', 'data-action': 'library' }, [
                h('span', { html: ICONS.apps }), h('span', { text: T.library })
            ])
        ]));
    }

    function focusKey(el) {
        if (!el) return null;
        if (el.getAttribute('data-app')) return '#app [data-app="' + el.getAttribute('data-app') + '"]';
        if (el.getAttribute('data-action')) return '#app [data-action="' + el.getAttribute('data-action') + '"]';
        return null;
    }

    function render(focusSelector) {
        var keep = focusSelector || focusKey(TC.focus.current);
        var cols = store.get().cols;
        var apps = homeApps();
        renderDock(apps, cols);
        renderGrid(apps, cols);
        if (!state.overlay) TC.focus.restore(keep);
    }

    // Grand titre et halo suivent l'appli sélectionnée.
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
        if (!app) return;
        setHero(app.name);
        if (!themeOf(store.get().theme).glow) TC.ui.ambient.set(TC.ui.glowOf(app));
    }

    /* ------------------------------------------------------------------ */
    /* Actions                                                             */
    /* ------------------------------------------------------------------ */
    function launch(app) {
        platform.launchApp(app.id).then(function () {
            if (platform.preview) TC.ui.toast('Aperçu : lancement de ' + app.name);
        }).catch(function (err) {
            TC.ui.toast(T.cantOpen + app.name + ' (' + platform.errorText(err) + ')', 5000);
        });
    }

    function addToHome(id) {
        var home = (store.get().home || []).slice();
        if (home.indexOf(id) < 0) home.push(id);
        store.set({ home: home });
        render();
    }

    function removeFromHome(id) {
        store.set({ home: (store.get().home || []).filter(function (x) { return x !== id; }) });
        render();
    }

    /* Réorganiser les applis : OK prend / pose, flèches déplacent, Retour pose puis termine. */
    var hintTimer = null;
    function showHint(text) {
        var el = doc.getElementById('watch-hint');
        el.innerHTML = '';
        el.appendChild(h('span', { class: 'hint-icon', html: ICONS.swap }));
        el.appendChild(h('span', { text: text }));
        el.hidden = false;
        el.classList.add('show');
        clearTimeout(hintTimer);
    }
    function hideHint() {
        var el = doc.getElementById('watch-hint');
        el.classList.remove('show');
        hintTimer = setTimeout(function () { el.hidden = true; }, 300);
    }

    function startReorder(heldId) {
        state.reorder = { held: heldId || null };
        doc.body.classList.add('reordering');
        showHint(T.reorderHint);
        render(heldId ? '#app [data-app="' + heldId + '"]' : null);
        if (!heldId) {
            var first = doc.querySelector('#dock [data-app]');
            if (first) TC.focus.set(first);
        }
    }

    function endReorder() {
        state.reorder = null;
        doc.body.classList.remove('reordering');
        hideHint();
        render();
    }

    function moveHeld(delta) {
        var id = state.reorder.held;
        var home = (store.get().home || []).slice();
        var visible = homeApps().map(function (a) { return a.id; });
        var from = visible.indexOf(id);
        var to = Math.max(0, Math.min(visible.length - 1, from + delta));
        if (from < 0 || to === from) return;
        visible.splice(from, 1);
        visible.splice(to, 0, id);
        // Les applis de l'accueil absentes de la TV (désinstallées) gardent leur place à la fin.
        var missing = home.filter(function (x) { return visible.indexOf(x) < 0; });
        store.set({ home: visible.concat(missing) });
        render('#app [data-app="' + id + '"]');
    }

    function inputByKey(key) {
        for (var i = 0; i < state.inputs.length; i++) if (state.inputs[i].key === key) return state.inputs[i];
        return null;
    }

    function watch(src) {
        platform.watchInput(src).then(function () {
            state.watching = src;
            doc.body.classList.add('watching');
            TC.ui.toast(sourceLabel(src) + ' · Retour pour revenir à l’accueil', 4000);
        }).catch(function (err) {
            TC.ui.toast('Impossible d’afficher ' + sourceLabel(src) + ' (' + platform.errorText(err) + '). Utilise la touche SOURCE.', 6000);
        });
    }

    function stopWatch() {
        platform.stopWatching().catch(function () { /* déjà masquée */ });
        state.watching = null;
        doc.body.classList.remove('watching');
        loadInputs().then(function () { render(); });
    }

    function openSystem(kind, label) {
        platform.openSystem(kind).then(function () {
            if (platform.preview) TC.ui.toast('Aperçu : ouverture de « ' + label + ' »');
        }).catch(function () {
            TC.ui.toast(label + ' : ' + T.notAvailable.toLowerCase() + ' depuis une appli. Utilise la touche ⚙ de la télécommande.', 5000);
        });
    }

    function activate(el) {
        var action = el.getAttribute('data-action');
        if (action === 'settings') return openQuickMenu(el);
        if (action === 'inputs') return openInputsMenu(el);
        if (action === 'network') return openSystem('network', T.network);
        if (action === 'library') return openLibrary();
        var appId = el.getAttribute('data-app');
        if (appId) {
            var app = appById(appId);
            if (app) launch(app);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Fenêtres                                                            */
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

    function menuItem(label, fn, opts) {
        opts = opts || {};
        var b = h('button', { class: 'item focusable' + (opts.icon ? ' source' : ''), 'data-first': opts.first || null, 'data-menu': label }, [
            opts.icon ? h('span', { html: opts.icon }) : null,
            h('span', { class: 'grow', text: label }),
            opts.note ? h('span', { class: 'note-right', text: opts.note }) : null
        ]);
        b._activate = fn;
        return b;
    }

    function openMenu(title, items) {
        openOverlay(function (panel) {
            if (title) panel.appendChild(h('h3', { text: title }));
            var list = h('div', { class: 'list', 'data-scroll': 'y' });
            items.forEach(function (it, i) { list.appendChild(menuItem(it[0], it[1], { first: i === 0 })); });
            panel.appendChild(list);
        });
    }

    // Menu déroulant sous une pastille de l'en-tête (Sources, Paramètres).
    function openDropdown(pill, build, alignRight) {
        var r = pill.getBoundingClientRect();
        openOverlay(function (panel) {
            panel.style.top = (r.bottom + 12) + 'px';
            if (alignRight) panel.style.right = (global.innerWidth - r.right) + 'px';
            else panel.style.left = r.left + 'px';
            var list = h('div', { class: 'list', 'data-scroll': 'y' });
            build(list);
            panel.appendChild(list);
        }, { kind: 'dropdown', light: true });
    }

    function openInputsMenu(pill) {
        openDropdown(pill, function (list) {
            if (state.inputsError) {
                list.appendChild(menuItem(T.notAvailable, closeOverlay, { first: true, icon: ICONS.hdmi }));
                return;
            }
            var inputs = state.inputs.filter(function (s) { return !store.get().inputsConnectedOnly || s.connected || s.type === 'TV'; });
            if (!inputs.length) list.appendChild(menuItem(T.noInputs, closeOverlay, { first: true }));
            var lastGroup = null;
            inputs.forEach(function (src, i) {
                var group = src.type === 'HDMI' ? 'HDMI' : src.type === 'TV' ? 'TV' : 'AV';
                if (lastGroup && group !== lastGroup) list.appendChild(h('div', { class: 'sep' }));
                lastGroup = group;
                var icon = group === 'HDMI' ? ICONS.hdmi : group === 'TV' ? ICONS.tv : ICONS.av;
                var b = h('button', { class: 'item source focusable', 'data-first': i === 0 || null, 'data-source': src.key }, [
                    h('span', { html: icon }),
                    h('span', { class: 'grow', text: sourceLabel(src) }),
                    src.connected && src.type !== 'TV' ? h('span', { class: 'status', text: T.connected }) : null
                ]);
                b._activate = function () { closeOverlay(); watch(src); };
                list.appendChild(b);
            });
        });
    }

    // Menu de la pastille Paramètres (quick settings panel de CleanYourTV).
    function openQuickMenu(pill) {
        openDropdown(pill, function (list) {
            [
                [T.tvSettings, ICONS.gear, function () { closeOverlay(); openSystem('settings', T.tvSettings); }],
                [T.network, ICONS.wifi, function () { closeOverlay(); openSystem('network', T.network); }],
                [T.library, ICONS.apps, function () { closeOverlay(); openLibrary(); }],
                [T.reorder, ICONS.swap, function () { closeOverlay(); startReorder(); }],
                [T.launcherSettings, ICONS.home, function () { closeOverlay(); openSettings(); }]
            ].forEach(function (it, i) { list.appendChild(menuItem(it[0], it[2], { first: i === 0, icon: it[1] })); });
        }, true);
    }

    function openTileOptions(el) {
        var appId = el.getAttribute('data-app');
        var app = appId ? appById(appId) : null;
        if (!app) return false;
        openMenu(app.name, [
            [T.open, function () { closeOverlay(); launch(app); }],
            [T.move, function () { closeOverlay(); startReorder(appId); }],
            [T.removeHome, function () { closeOverlay(); removeFromHome(appId); TC.ui.toast(app.name + ' est dans la bibliothèque d’applications'); }],
            ['Annuler', closeOverlay]
        ]);
        return true;
    }

    /* Bibliothèque d'applications : toutes les applis, celles hors de l'accueil d'abord. */
    function openLibrary() {
        // Comme CleanYourTV, seulement des applis qu'on peut ouvrir : les services système
        // de Samsung n'y sont que si on le demande dans les paramètres.
        var showSystem = store.get().librarySystemApps;
        var all = state.apps.filter(function (a) { return showSystem || !a.system; });
        all.sort(function (a, b) {
            var d = (isOnHome(a.id) ? 1 : 0) - (isOnHome(b.id) ? 1 : 0);
            return d || (a.system ? 1 : 0) - (b.system ? 1 : 0) || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
        });
        openOverlay(function (panel) {
            panel.appendChild(h('div', { class: 'library-head' }, [
                h('h3', { text: T.library }),
                h('span', { class: 'count', text: all.length + (all.length > 1 ? ' applications' : ' application') })
            ]));
            panel.appendChild(h('p', { class: 'text', text: T.libraryHintAdd }));
            var track = h('div', { class: 'library-track', 'data-scroll': 'x' });
            if (!all.length) panel.appendChild(menuItem(T.libraryEmpty, closeOverlay, { first: true }));
            all.forEach(function (app, i) {
                var status = h('span', { class: 'status', text: isOnHome(app.id) ? T.onHome : T.addHome });
                var card = h('button', { class: 'lib-card focusable', 'data-row': 'library', 'data-first': i === 0 || null, 'data-lib': app.id }, [
                    TC.ui.libraryIcon(app), h('span', { class: 'lib-name', text: app.name }), status
                ]);
                card._activate = function () {
                    if (isOnHome(app.id)) { closeOverlay(); launch(app); return; }
                    addToHome(app.id);
                    status.textContent = T.onHome;
                    TC.ui.toast(app.name + ' ajoutée à l’accueil');
                };
                card._options = function () {
                    var on = isOnHome(app.id);
                    closeOverlay();
                    openMenu(app.name, [
                        [T.open, function () { closeOverlay(); launch(app); }],
                        [on ? T.removeHome : T.addHome, function () { closeOverlay(); if (on) removeFromHome(app.id); else addToHome(app.id); }],
                        ['Annuler', closeOverlay]
                    ]);
                };
                track.appendChild(card);
            });
            panel.appendChild(track);
        }, { kind: 'library' });
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

    /* Paramètres du lanceur. */
    function openSettings() {
        var ctx = openOverlay(function (panel) {
            panel.appendChild(h('h3', { text: T.launcherSettings }));
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
            var scroll = TC.focus.offsetOf(list);
            list.innerHTML = '';
            build(list);
            TC.focus.setOffset(list, scroll, false);
            var target = key ? list.querySelector('[data-setting="' + key.replace(/"/g, '\\"') + '"]') : null;
            TC.focus.set(target || list.querySelector('.focusable'));
        }

        function build(list) {
            var s = store.get();
            function set(patch) { store.set(patch); rebuild(); }

            list.appendChild(h('div', { class: 'group', text: 'Accueil' }));
            list.appendChild(row(T.columns, choiceLabel(COLS, s.cols), {
                cycle: function (d) { set({ cols: cycle(COLS, s.cols, d) }); render(); }
            }, true));
            list.appendChild(row(T.reorder, '', { activate: function () { closeOverlay(); startReorder(); } }));
            list.appendChild(row(T.library, '', { activate: function () { closeOverlay(); openLibrary(); } }));
            list.appendChild(row('Applis système dans la bibliothèque', s.librarySystemApps ? 'Activé' : 'Désactivé', {
                cycle: function () { set({ librarySystemApps: !s.librarySystemApps }); }
            }));

            list.appendChild(h('div', { class: 'group', text: 'Apparence' }));
            list.appendChild(row('Thème', choiceLabel(THEMES, s.theme), {
                cycle: function (d) { set({ theme: cycle(THEMES, s.theme, d) }); }
            }));
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
            list.appendChild(row('Logos des applis', s.logoStyle === 'samsung' ? 'Icônes Samsung' : 'Logos officiels', {
                cycle: function () { set({ logoStyle: s.logoStyle === 'samsung' ? 'pack' : 'samsung' }); render(); }
            }));
            list.appendChild(row('Animations', choiceLabel(ANIMATIONS, s.animations), {
                cycle: function (d) { set({ animations: cycle(ANIMATIONS, s.animations, d) }); }
            }));

            list.appendChild(h('div', { class: 'group', text: 'En-tête' }));
            list.appendChild(row('Salutation', s.showGreeting ? 'Activé' : 'Désactivé', {
                cycle: function () { set({ showGreeting: !s.showGreeting }); }
            }));
            list.appendChild(row('Format de l’heure', s.clock24 ? '24 h' : '12 h', {
                cycle: function () { set({ clock24: !s.clock24 }); }
            }));
            list.appendChild(row('Date', s.showDate ? 'Activé' : 'Désactivé', {
                cycle: function () { set({ showDate: !s.showDate }); }
            }));
            list.appendChild(row('Météo', s.showWeather ? 'Activé' : 'Désactivé', {
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

            list.appendChild(h('div', { class: 'group', text: T.inputs }));
            list.appendChild(row('Seulement les sources connectées', s.inputsConnectedOnly ? 'Activé' : 'Désactivé', {
                cycle: function () { set({ inputsConnectedOnly: !s.inputsConnectedOnly }); }
            }));

            list.appendChild(h('div', { class: 'group', text: 'Système' }));
            list.appendChild(row('Actualiser les applications', '', {
                activate: function () { refreshAll().then(function () { TC.ui.toast('Applications actualisées'); }); }
            }));
            list.appendChild(row(T.followTheme, '', {
                activate: function () { store.reset(); rebuild(); render(); TC.ui.toast('Choix réinitialisés (l’accueil est conservé)'); }
            }));
            list.appendChild(row('Quitter TeleCoding', '', { activate: function () { platform.exit(); } }));
            list.appendChild(h('p', { class: 'text small', text:
                'TeleCoding 3.0 · design et code adaptés de CleanYourTV (MIT). Sur Samsung, la touche HOME ouvre ' +
                'toujours le Smart Hub : c’est imposé par le système. Pour que TeleCoding s’ouvre au démarrage, active ' +
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
            if (isBack(code)) stopWatch();
            return;
        }

        if (DIRS[code]) {
            e.preventDefault();
            var dir = DIRS[code];
            if (state.reorder && state.reorder.held) {
                var cols = store.get().cols;
                moveHeld(dir === 'left' ? -1 : dir === 'right' ? 1 : dir === 'up' ? -cols : cols);
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
            if (state.reorder) {
                var id = el.getAttribute('data-app');
                if (id) {
                    state.reorder.held = state.reorder.held === id ? null : id;
                    render('#app [data-app="' + id + '"]');
                }
                return;
            }
            if (press) { clearTimeout(press.timer); press = null; }
            // Appui long = options (carte de l'accueil ou de la bibliothèque).
            press = { el: el, long: false, timer: null };
            if (el.getAttribute('data-app') || el._options) {
                press.timer = setTimeout(function () {
                    if (!press) return;
                    press.long = true;
                    if (press.el._options) press.el._options(); else openTileOptions(press.el);
                }, LONG_PRESS_MS);
            }
            return;
        }

        if (isBack(code)) {
            e.preventDefault();
            if (state.reorder) {
                if (state.reorder.held) { state.reorder.held = null; render(); } else endReorder();
                return;
            }
            if (state.overlay) { closeOverlay(); return; }
            // Sur l'accueil, Retour ramène à la première appli.
            var first = doc.querySelector('#dock .focusable');
            if (first) TC.focus.set(first);
            return;
        }

        if (isMenu(code)) {
            e.preventDefault();
            if (state.overlay || state.reorder) return;
            if (el && el._options) { el._options(); return; }
            if (!el || !openTileOptions(el)) openQuickMenu(doc.querySelector('[data-action="settings"]'));
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
        if (cached.length && store.get().home) {
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
