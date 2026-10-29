/*
 * Test de fumée de l'interface dans Chromium, au clavier uniquement
 * (flèches = télécommande, Entrée = OK, Échap = Retour, M = Menu).
 * Les API Tizen sont simulées : ce test ne remplace PAS un essai sur la TV.
 *
 *   node tests/smoke.test.js            (nécessite playwright)
 *   SCREENSHOTS=1 node tests/smoke.test.js   (met à jour docs/*.png)
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

async function focusSetting(page, label) {
    for (let i = 0; i < 20; i++) {
        const f = await focused(page);
        if (f && f.setting === label) return true;
        await press(page, 'ArrowDown');
    }
    return false;
}

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
    await page.waitForTimeout(500);

    console.log('Accueil');
    check(/^\d\d:\d\d$/.test(await page.textContent('#time')), 'heure au format 24 h');
    check((await page.textContent('#date')).length > 5, 'date affichée');
    const favCount = await page.locator('[data-row="favorites"][data-app]').count();
    check(favCount === 8, 'premier lancement : 8 favoris détectés automatiquement (' + favCount + ')');
    const appNames = await page.$$eval('[data-row="apps"] .name', (els) => els.map((e) => e.textContent));
    check(appNames.length === 10, '10 vraies applis sur 22 entrées (' + appNames.join(', ') + ')');
    check(!appNames.some((n) => /AdPlayer|Network status|survey|service|preview|User Guide/i.test(n)), 'services système masqués');
    check(appNames.filter((n) => /^youtube$/i.test(n)).length === 1, 'YouTube en double fusionné');
    check(appNames.includes('Spotify') && appNames.includes('TF1+'), 'noms raccourcis (Spotify, TF1+)');
    check(await page.evaluate(() => TC.platform.isUserApp('org.tizen.primevideo') && !TC.platform.isUserApp('org.tizen.primevideo-dummy')), 'appli « dummy » ignorée');
    check(await page.locator('[data-input]').count() === 4, '4 entrées (HDMI 1-3 + TV)');
    let f = await focused(page);
    check(f && f.row === 'favorites', 'focus initial sur le premier favori');
    if (SHOTS) await page.screenshot({ path: path.resolve(__dirname, '../docs/accueil.png') });

    console.log('Navigation');
    const first = f.app;
    await press(page, 'ArrowRight');
    f = await focused(page);
    check(f.row === 'favorites' && f.app !== first, 'droite : favori suivant');
    await press(page, 'ArrowLeft', 3);
    f = await focused(page);
    check(f.app === first, 'gauche bloquée au début de la rangée');
    await press(page, 'ArrowDown');
    f = await focused(page);
    check(f.row === 'inputs', 'bas : rangée Entrées');
    await press(page, 'ArrowRight');
    const inputBefore = (await focused(page)).input;
    await press(page, 'ArrowDown');
    check((await focused(page)).row === 'apps', 'bas : rangée Applications');
    await press(page, 'ArrowUp');
    check((await focused(page)).input === inputBefore, 'haut : retrouve la dernière entrée visitée');
    await press(page, 'ArrowUp', 2);
    f = await focused(page);
    check(f.row === 'header', 'haut : boutons de l’en-tête');
    await press(page, 'ArrowDown');
    check((await focused(page)).row === 'favorites', 'bas depuis l’en-tête : favoris');
    await press(page, 'ArrowRight', 20);
    f = await focused(page);
    check(f.action === 'manage-favorites', 'fin de rangée : tuile « Gérer »');
    const scrolled = await page.evaluate(() => document.querySelector('[data-section="favorites"] .track').scrollLeft);
    check(scrolled > 0, 'la rangée défile pour garder le focus visible');
    await press(page, 'Escape');
    check((await focused(page)).row === 'favorites', 'Retour : revient au début');

    console.log('Lancement et entrées');
    await press(page, 'Enter');
    await page.waitForTimeout(150);
    check((await page.textContent('#toast')).includes('lancement'), 'OK lance l’application');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowLeft', 5);
    await press(page, 'Enter');
    await page.waitForTimeout(150);
    check(await page.evaluate(() => document.body.classList.contains('watching')), 'OK sur HDMI 1 : affichage de l’entrée');
    check(await page.evaluate(() => TC.platform.watching) === 'HDMI:1', 'source HDMI 1 demandée à TVWindow');
    await press(page, 'Escape');
    await page.waitForTimeout(150);
    check(!(await page.evaluate(() => document.body.classList.contains('watching'))), 'Retour : revient à l’accueil');
    check((await focused(page)).input === 'HDMI:1', 'le focus reste sur HDMI 1');

    console.log('Favoris');
    await press(page, 'ArrowUp');
    await press(page, 'ArrowLeft', 10);
    const order0 = await page.evaluate(() => TC.store.get().favorites.slice());
    await press(page, 'm');
    check(await page.isVisible('#overlay .panel'), 'Menu : options de la tuile');
    await press(page, 'ArrowDown', 2);
    check((await focused(page)).text.startsWith('Déplacer'), 'option « Déplacer »');
    await press(page, 'Enter');
    await page.waitForTimeout(100);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    const order1 = await page.evaluate(() => TC.store.get().favorites.slice());
    check(order1[0] === order0[1] && order1[1] === order0[0], 'réorganisation enregistrée');
    check((await focused(page)).app === order0[0], 'le focus suit l’appli déplacée');

    // Appui long sur OK = menu d'options
    await page.keyboard.down('Enter');
    await page.waitForTimeout(850);
    await page.keyboard.up('Enter');
    check(await page.isVisible('#overlay .panel'), 'appui long OK : menu d’options');
    await press(page, 'ArrowDown');
    check((await focused(page)).text === 'Retirer des favoris', 'option « Retirer des favoris »');
    await press(page, 'Enter');
    await page.waitForTimeout(100);
    check(await page.locator('[data-row="favorites"][data-app]').count() === 7, 'favori retiré');

    // Masquer une appli depuis « Toutes les applications »
    for (let i = 0; i < 4 && (await focused(page)).row !== 'apps'; i++) await press(page, 'ArrowDown');
    check((await focused(page)).row === 'apps', 'rangée Applications');
    await press(page, 'm');
    for (let i = 0; i < 6; i++) {
        if ((await focused(page)).text === 'Masquer cette appli') break;
        await press(page, 'ArrowDown');
    }
    check((await focused(page)).text === 'Masquer cette appli', 'option « Masquer cette appli »');
    await press(page, 'Enter');
    await page.waitForTimeout(100);
    check(await page.locator('[data-row="apps"][data-app]').count() === 9, 'appli masquée');
    await press(page, 'ArrowUp', 2);

    console.log('Paramètres');
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight', 2);
    check((await focused(page)).action === 'settings', 'bouton Paramètres');
    await press(page, 'Enter');
    await page.waitForTimeout(300);
    check(await page.isVisible('.panel.side'), 'page Paramètres ouverte');
    if (SHOTS) await page.screenshot({ path: path.resolve(__dirname, '../docs/parametres.png') });
    await press(page, 'ArrowRight');
    check(await page.evaluate(() => document.body.getAttribute('data-theme')) === 'oled', 'thème modifié avec droite');
    check(await focusSetting(page, 'Format de l’heure'), 'ligne « Format de l’heure »');
    await press(page, 'ArrowRight');
    check(/(AM|PM)$/.test(await page.textContent('#time')), 'heure au format 12 h');
    check(await focusSetting(page, 'Afficher la date'), 'ligne « Afficher la date »');
    await press(page, 'Enter');
    check(await page.isHidden('#date'), 'date masquée');
    check(await focusSetting(page, 'Applis système'), 'ligne « Applis système »');
    await press(page, 'ArrowRight');
    const withSystem = await page.locator('[data-row="apps"][data-app]').count();
    check(withSystem > 9, 'applis système affichées sur demande (' + withSystem + ')');
    await press(page, 'ArrowRight');
    check(await page.locator('[data-row="apps"][data-app]').count() === 9, 'applis système de nouveau masquées');
    check(await focusSetting(page, 'Applis masquées'), 'ligne « Applis masquées »');
    await press(page, 'Enter');
    check(await page.locator('[data-row="apps"][data-app]').count() === 10, 'applis masquées réaffichées');
    check(await focusSetting(page, 'Section 2'), 'ligne « Section 2 »');
    await press(page, 'Enter');
    const secs = await page.evaluate(() => TC.store.get().sections);
    check(secs[0] === 'inputs' && secs[1] === 'favorites', 'ordre des sections modifié');
    check((await focused(page)).setting === 'Section 1', 'le focus suit la section déplacée');
    await press(page, 'Escape');
    await page.waitForTimeout(200);
    check(await page.isHidden('#overlay'), 'Retour ferme les paramètres');
    check((await focused(page)).action === 'settings', 'le focus revient sur Paramètres');
    const firstSection = await page.evaluate(() => document.querySelector('#sections .section').getAttribute('data-section'));
    check(firstSection === 'inputs', 'les Entrées s’affichent en premier');

    console.log('Persistance');
    await page.reload();
    await page.waitForSelector('body.ready');
    await page.waitForTimeout(300);
    check(/(AM|PM)$/.test(await page.textContent('#time')), 'format 12 h conservé après redémarrage');
    check(await page.evaluate(() => document.body.getAttribute('data-theme')) === 'oled', 'thème conservé');
    check(await page.locator('[data-row="favorites"][data-app]').count() === 7, 'favoris conservés');

    console.log('Erreurs JavaScript');
    check(errors.length === 0, 'aucune erreur (' + errors.join(' | ') + ')');

    await browser.close();
    console.log(failures ? '\n' + failures + ' échec(s)' : '\nTout est vert.');
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
