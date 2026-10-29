/*
 * Test de fumée de l'interface dans Chromium, au clavier uniquement
 * (flèches = télécommande, Entrée = OK, Échap = Retour, M = Menu).
 * Les API Tizen sont simulées : ce test ne remplace PAS un essai sur la TV.
 *
 *   node tests/smoke.test.js                 (nécessite playwright)
 *   node tests/smoke.test.js --screenshots   (met à jour docs/*.png)
 */
'use strict';

const path = require('path');
const { chromium } = require('playwright');

const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const SHOTS = process.env.SCREENSHOTS === '1' || process.argv.includes('--screenshots');
let failures = 0;

function check(cond, label) {
    console.log((cond ? '  ok   ' : '  FAIL ') + label);
    if (!cond) failures++;
}

async function focused(page) {
    return page.evaluate(() => {
        const el = document.querySelector('.focused');
        if (!el) return null;
        return {
            row: el.getAttribute('data-row'),
            app: el.getAttribute('data-app'),
            input: el.getAttribute('data-input'),
            source: el.getAttribute('data-source'),
            action: el.getAttribute('data-action'),
            setting: el.getAttribute('data-setting'),
            text: el.textContent.trim()
        };
    });
}

async function press(page, key, times = 1) {
    for (let i = 0; i < times; i++) {
        await page.keyboard.press(key);
        await page.waitForTimeout(60);
    }
}

async function until(page, key, test, max = 20) {
    for (let i = 0; i < max; i++) {
        if (test(await focused(page))) return true;
        await press(page, key);
    }
    return test(await focused(page));
}

const focusSetting = (page, label) => until(page, 'ArrowDown', (f) => f && f.setting === label, 30);
const count = (page, sel) => page.locator(sel).count();
const hero = (page) => page.evaluate(() => document.getElementById('hero').textContent);

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(APP);
    await page.waitForSelector('body.ready');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('body.ready');
    await page.waitForTimeout(1200);

    console.log('Accueil');
    check(/^\d\d:\d\d$/.test(await page.textContent('#time')), 'heure au format 24 h');
    check((await page.textContent('#date')).length > 5, 'date affichée');
    check(/^Bon(jour|soir)$/.test(await page.textContent('#greeting')), 'salutation');
    check(await count(page, '#dock [data-app]') === 8, 'premier lancement : 8 favoris dans la bande');
    const ids = await page.$$eval('#sections [data-app]', (els) => els.map((e) => e.getAttribute('data-app')));
    check(ids.length === 18, '18 vraies applis sur 30 entrées');
    check(!ids.some((id) => /adplayer|network-status|rm-survey|Service$|preview$|emanual|OTApp|dummy/i.test(id)), 'services système masqués');
    check(ids.includes('9Ur5IzDKqV.TizenYouTube') && !ids.includes('com.samsung.tv.cobalt-yt'), 'YouTube en double fusionné');
    let f = await focused(page);
    check(f && f.row === 'favorites', 'focus initial sur le premier favori');
    check(await hero(page) === '6play', 'grand titre = appli sélectionnée');
    check(await count(page, '#ambient .glow.on') === 1, 'halo d’ambiance allumé');
    const sixBg = await page.$eval('#dock [data-app="Ol7HVEXtqh.6play"] .art', (e) => e.style.background);
    check(/linear-gradient/.test(sixBg), 'carte teintée à la couleur de l’icône (' + sixBg + ')');
    check(await count(page, '[data-app="org.tizen.netflix-app"] .art.banner img[src="logos/netflix.svg"]') === 1, 'Netflix : logo officiel');
    check(await count(page, '[data-app="rJeHak5zRg.Spotify"] .art.banner') === 1, 'Spotify : logo officiel');
    check(await count(page, '#dock [data-app="Ol7HVEXtqh.6play"] .art.uniform') === 1, '6play : icône Samsung en mode « uniform tiles »');
    const broken = await page.$$eval('.art.banner img', (els) => els.filter((i) => !i.complete || !i.naturalWidth).length);
    check(broken === 0, 'tous les logos officiels se chargent');
        if (SHOTS) await page.screenshot({ path: path.resolve(__dirname, '../docs/accueil.png') });

    console.log('Navigation');
    const first = f.app;
    await press(page, 'ArrowRight', 2);
    await page.waitForTimeout(300);
    check((await focused(page)).app === 'org.tizen.apple.apple-music' && await hero(page) === 'Apple Music', 'droite : Apple Music, le titre suit');
    if (SHOTS) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.resolve(__dirname, '../docs/accueil-disney.png') });
    }
    await press(page, 'ArrowLeft', 5);
    check((await focused(page)).app === first, 'gauche bloquée au début de la bande');
    await press(page, 'ArrowDown');
    check((await focused(page)).row === 'apps-0', 'bas : grille des applis');
    await press(page, 'ArrowRight');
    const gridBefore = (await focused(page)).app;
    await press(page, 'ArrowDown');
    check((await focused(page)).row === 'apps-1', 'bas : deuxième rangée de la grille');
    await press(page, 'ArrowUp');
    check((await focused(page)).app === gridBefore, 'haut : retrouve la dernière appli visitée');
    await press(page, 'ArrowUp');
    check((await focused(page)).app === first, 'haut : retour dans la bande');
    await page.waitForTimeout(600);
    check(await page.evaluate(() => document.getElementById('page').scrollTop) === 0, 'la page remonte en haut');
    await press(page, 'ArrowUp');
    check((await focused(page)).row === 'header', 'haut : boutons de l’en-tête');
    await press(page, 'ArrowDown');
    check((await focused(page)).app === first, 'bas depuis l’en-tête : favori retenu');
    await press(page, 'ArrowRight', 20);
    check((await focused(page)).action === 'manage-favorites', 'fin de bande : carte « Gérer les favoris »');
    await page.waitForTimeout(400);
    check(await page.evaluate(() => document.querySelector('#dock .track').scrollLeft) > 0, 'la bande défile');
    await press(page, 'Escape');
    check((await focused(page)).app === first, 'Retour : revient au premier favori');

    console.log('Lancement');
    await press(page, 'Enter');
    await page.waitForTimeout(150);
    check((await page.textContent('#toast')).includes('lancement'), 'OK lance l’application');

    console.log('Entrées');
    await press(page, 'ArrowUp');
    await until(page, 'ArrowLeft', (x) => x.action === 'inputs');
    check((await focused(page)).action === 'inputs', 'pastille « Entrées »');
    await press(page, 'Enter');
    await page.waitForTimeout(250);
    check(await page.isVisible('.panel.dropdown'), 'menu déroulant des entrées');
    check(await count(page, '.panel.dropdown [data-source]') === 4, '4 entrées listées');
    check(await count(page, '.panel.dropdown .status') === 3, 'statut « Connecté » sur les 3 entrées branchées');
    if (SHOTS) await page.screenshot({ path: path.resolve(__dirname, '../docs/entrees.png') });
    check((await focused(page)).source === 'HDMI:1', 'focus sur HDMI 1');
    await press(page, 'Enter');
    await page.waitForTimeout(150);
    check(await page.evaluate(() => document.body.classList.contains('watching')), 'OK : affichage de HDMI 1');
    check(await page.evaluate(() => TC.platform.watching) === 'HDMI:1', 'source HDMI 1 demandée à TVWindow');
    await press(page, 'Escape');
    await page.waitForTimeout(150);
    check(!(await page.evaluate(() => document.body.classList.contains('watching'))), 'Retour : revient à l’accueil');
    check((await focused(page)).action === 'inputs', 'le focus revient sur « Entrées »');

    console.log('Favoris');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowLeft', 10);
    const order0 = await page.evaluate(() => TC.store.get().favorites.slice());
    await press(page, 'm');
    check(await page.isVisible('#overlay .panel'), 'Menu : options de la carte');
    await press(page, 'ArrowDown', 2);
    check((await focused(page)).text.startsWith('Déplacer'), 'option « Déplacer »');
    await press(page, 'Enter');
    await page.waitForTimeout(100);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    const order1 = await page.evaluate(() => TC.store.get().favorites.slice());
    check(order1[0] === order0[1] && order1[1] === order0[0], 'réorganisation enregistrée');
    check((await focused(page)).app === order0[0], 'le focus suit l’appli déplacée');

    await page.keyboard.down('Enter');
    await page.waitForTimeout(850);
    await page.keyboard.up('Enter');
    check(await page.isVisible('#overlay .panel'), 'appui long OK : menu d’options');
    await press(page, 'ArrowDown');
    check((await focused(page)).text === 'Retirer des favoris', 'option « Retirer des favoris »');
    await press(page, 'Enter');
    await page.waitForTimeout(100);
    check(await count(page, '#dock [data-app]') === 7, 'favori retiré');

    await until(page, 'ArrowDown', (x) => x && /^apps-/.test(x.row || ''), 4);
    check(/^apps-/.test((await focused(page)).row), 'grille des applis');
    await press(page, 'm');
    check(await until(page, 'ArrowDown', (x) => x.text === 'Masquer cette appli', 6), 'option « Masquer cette appli »');
    await press(page, 'Enter');
    await page.waitForTimeout(100);
    check(await count(page, '#sections [data-app]') === 17, 'appli masquée');

    console.log('Paramètres');
    await until(page, 'ArrowUp', (x) => x.row === 'header', 6);
    await until(page, 'ArrowRight', (x) => x.action === 'settings', 4);
    check((await focused(page)).action === 'settings', 'pastille « Paramètres »');
    await press(page, 'Enter');
    await page.waitForTimeout(300);
    check(await page.isVisible('.panel.side'), 'page Paramètres ouverte');
    if (SHOTS) await page.screenshot({ path: path.resolve(__dirname, '../docs/parametres.png') });
    await press(page, 'ArrowRight');
    check(await page.evaluate(() => document.body.getAttribute('data-theme')) === 'minuit', 'thème modifié avec droite');
    check(await focusSetting(page, 'Applis par rangée'), 'ligne « Applis par rangée »');
    await press(page, 'ArrowRight');
    check(await count(page, '[data-row="apps-0"]') === 5, '5 applis par rangée');
    check(await focusSetting(page, 'Format de l’heure'), 'ligne « Format de l’heure »');
    await press(page, 'ArrowRight');
    check(/(AM|PM)$/.test(await page.textContent('#time')), 'heure au format 12 h');
    check(await focusSetting(page, 'Afficher la date'), 'ligne « Afficher la date »');
    await press(page, 'Enter');
    check(await page.isHidden('#date'), 'date masquée');
    check(await focusSetting(page, 'Rangée Entrées'), 'ligne « Rangée Entrées »');
    await press(page, 'Enter');
    check(await count(page, '[data-section="inputs"] [data-input]') === 4, 'rangée Entrées affichée');
    check(await focusSetting(page, 'Ordre des rangées'), 'ligne « Ordre des rangées »');
    const firstRow = () => page.evaluate(() => document.querySelector('#sections .row-section').getAttribute('data-section'));
    const before = await firstRow();
    await press(page, 'Enter');
    check(await firstRow() !== before, 'ordre des rangées inversé (' + before + ' → ' + (await firstRow()) + ')');
    check(await focusSetting(page, 'Ordre des applis'), 'ligne « Ordre des applis »');
    await page.evaluate(() => TC.store.set({ launches: { 'rJeHak5zRg.Spotify': 3 } }));
    await press(page, 'ArrowRight');
    check(await page.$eval('#sections [data-app]', (e) => e.getAttribute('data-app')) === 'rJeHak5zRg.Spotify', 'tri « les plus utilisées » : Spotify en premier');
    await press(page, 'ArrowRight');
        check(await focusSetting(page, 'Applis système'), 'ligne « Applis système »');
    await press(page, 'ArrowRight');
    const withSystem = await count(page, '#sections [data-app]');
    check(withSystem > 17, 'applis système affichées sur demande (' + withSystem + ')');
    await press(page, 'ArrowRight');
    check(await count(page, '#sections [data-app]') === 17, 'applis système de nouveau masquées');
    check(await focusSetting(page, 'Applis masquées'), 'ligne « Applis masquées »');
    await press(page, 'Enter');
    check(await count(page, '#sections [data-app]') === 18, 'applis masquées réaffichées');
    await press(page, 'Escape');
    await page.waitForTimeout(200);
    check(await page.isHidden('#overlay'), 'Retour ferme les paramètres');
    check((await focused(page)).action === 'settings', 'le focus revient sur « Paramètres »');

    console.log('Persistance');
    await page.reload();
    await page.waitForSelector('body.ready');
    await page.waitForTimeout(300);
    check(/(AM|PM)$/.test(await page.textContent('#time')), 'format 12 h conservé après redémarrage');
    check(await page.evaluate(() => document.body.getAttribute('data-theme')) === 'minuit', 'thème conservé');
    check(await count(page, '#dock [data-app]') === 7, 'favoris conservés');
    check(await count(page, '[data-row="apps-0"]') === 5, 'nombre de colonnes conservé');

    console.log('Migration');
    await page.evaluate(() => localStorage.setItem('telecoding.settings.v1', JSON.stringify({ theme: 'noir', favorites: ['x'], favoritesVersion: 2 })));
    await page.reload();
    await page.waitForSelector('body.ready');
    check(await page.evaluate(() => document.body.getAttribute('data-theme')) === 'ambiance', 'ancien réglage : passage au thème Ambiance');

    console.log('Erreurs JavaScript');
    check(errors.length === 0, 'aucune erreur (' + errors.join(' | ') + ')');

    await browser.close();
    console.log(failures ? '\n' + failures + ' échec(s)' : '\nTout est vert.');
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
