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
    const home = () => page.evaluate(() => TC.store.get().home.slice());
    const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.resolve(__dirname, '../docs/' + name + '.png') }); };

    await page.goto(APP);
    await page.waitForSelector('body.ready');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('body.ready');
    await page.waitForTimeout(1200);

    console.log('Accueil');
    check(/^\d\d:\d\d$/.test(await page.textContent('#time')), 'heure au format 24 h');
    check((await page.textContent('#date')).length > 5, 'date affichée');
    check(['Bonne nuit', 'Bonjour', 'Bon après-midi', 'Bonsoir'].includes(await page.textContent('#greeting')), 'salutation de CleanYourTV');
    check(await count(page, '#dock [data-app]') === 4, 'bande : les 4 premières applis');
    const ids = await page.$$eval('#app [data-app]', (els) => els.map((e) => e.getAttribute('data-app')));
    check(ids.length === 18, '18 vraies applis sur l’accueil (sur 30 entrées)');
    check(!ids.some((id) => /adplayer|network-status|rm-survey|Service$|preview$|emanual|OTApp|dummy/i.test(id)), 'services système hors de l’accueil');
    check(ids.includes('9Ur5IzDKqV.TizenYouTube') && !ids.includes('com.samsung.tv.cobalt-yt'), 'YouTube en double fusionné');
    check(new Set(ids).size === ids.length, 'aucune appli en double (une seule liste, comme CleanYourTV)');
    let f = await focused(page);
    check(f && f.row === 'dock', 'focus initial sur la première appli');
    check(await hero(page) === '6play', 'grand titre = appli sélectionnée');
    check(await count(page, '#ambient .glow.on') === 1, 'halo d’ambiance allumé');
    check(await count(page, '[data-app="org.tizen.netflix-app"] .art.banner img[src="logos/netflix.svg"]') === 1, 'Netflix : logo officiel');
    check(await count(page, '#dock [data-app="Ol7HVEXtqh.6play"] .art.uniform') === 1, '6play : icône Samsung en mode « uniform tiles »');
    const broken = await page.$$eval('.art.banner img', (els) => els.filter((i) => !i.complete || !i.naturalWidth).length);
    check(broken === 0, 'tous les logos officiels se chargent');
    const tile = await page.$eval('#dock [data-app]:nth-child(2)', (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    check(Math.abs(tile[0] - 360) <= 2 && Math.abs(tile[1] - 201) <= 2, 'cartes de 360 × 201 px comme CleanYourTV (' + tile.join(' × ') + ')');
    await shot('accueil');

    console.log('Navigation');
    const first = f.app;
    await press(page, 'ArrowRight');
    await page.waitForTimeout(300);
    check((await focused(page)).app === 'CmeyUlnhYY.LunaWebApp' && await hero(page) === 'Amazon Luna', 'droite : Amazon Luna, le titre suit');
    await press(page, 'ArrowLeft', 5);
    check((await focused(page)).app === first, 'gauche bloquée au début de la bande');
    await press(page, 'ArrowDown');
    check((await focused(page)).row === 'row-1', 'bas : première ligne de la grille');
    await press(page, 'ArrowRight');
    const gridBefore = (await focused(page)).app;
    await press(page, 'ArrowDown');
    check((await focused(page)).row === 'row-2', 'bas : ligne suivante');
    await page.waitForTimeout(400);
    check(await page.evaluate(() => TC.focus.offsetOf(document.getElementById('page'))) > 0, 'la page glisse vers la grille');
    await shot('grille');
    await press(page, 'ArrowUp');
    check((await focused(page)).app === gridBefore, 'haut : retrouve la dernière appli visitée');
    await press(page, 'ArrowUp');
    check((await focused(page)).app === first, 'haut : retour dans la bande');
    await page.waitForTimeout(600);
    check(await page.evaluate(() => TC.focus.offsetOf(document.getElementById('page'))) === 0, 'la page remonte en haut');
    check(await page.evaluate(() => document.getElementById('page').scrollTop) === 0, 'aucun défilement natif (tout passe par transform)');
    await press(page, 'ArrowUp');
    check((await focused(page)).row === 'header', 'haut : pastilles de l’en-tête');
    await press(page, 'ArrowDown');
    check((await focused(page)).app === first, 'bas depuis l’en-tête : appli retenue');
    await press(page, 'ArrowDown', 3);
    await press(page, 'Escape');
    check((await focused(page)).app === first, 'Retour : revient à la première appli');

    console.log('Lancement');
    await press(page, 'Enter');
    await page.waitForTimeout(150);
    check((await page.textContent('#toast')).includes('lancement'), 'OK lance l’application');

    console.log('Sources');
    await press(page, 'ArrowUp');
    await until(page, 'ArrowLeft', (x) => x.action === 'inputs');
    check((await focused(page)).action === 'inputs', 'pastille « Sources »');
    await press(page, 'Enter');
    await page.waitForTimeout(250);
    check(await page.isVisible('.panel.dropdown'), 'menu déroulant des sources');
    check(await count(page, '.panel.dropdown [data-source]') === 4, '4 sources listées');
    check((await page.textContent('.panel.dropdown')).includes('TV en direct'), '« TV en direct »');
    check(await count(page, '.panel.dropdown .status') === 2, '« Connecté » sur les 2 HDMI branchées');
    await shot('sources');
    check((await focused(page)).source === 'HDMI:1', 'focus sur HDMI 1');
    await press(page, 'Enter');
    await page.waitForTimeout(150);
    check(await page.evaluate(() => document.body.classList.contains('watching')), 'OK : affichage de HDMI 1');
    check(await page.evaluate(() => TC.platform.watching) === 'HDMI:1', 'source HDMI 1 demandée à TVWindow');
    await press(page, 'Escape');
    await page.waitForTimeout(150);
    check(!(await page.evaluate(() => document.body.classList.contains('watching'))), 'Retour : revient à l’accueil');
    check((await focused(page)).action === 'inputs', 'le focus revient sur « Sources »');

    console.log('Menu Paramètres');
    await until(page, 'ArrowRight', (x) => x.action === 'settings', 4);
    await press(page, 'Enter');
    await page.waitForTimeout(250);
    const menu = await page.$$eval('.panel.dropdown [data-menu]', (els) => els.map((e) => e.getAttribute('data-menu')));
    check(menu.join('|') === 'Paramètres du téléviseur|Réseau|Bibliothèque d’applications|Réorganiser les applis|Paramètres du lanceur', 'menu rapide de CleanYourTV');
    await shot('menu-parametres');
    await press(page, 'Escape');

    console.log('Réorganiser');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowLeft', 5);
    const order0 = await home();
    await page.keyboard.down('Enter');
    await page.waitForTimeout(850);
    await page.keyboard.up('Enter');
    const opts = await page.$$eval('#overlay [data-menu]', (els) => els.map((e) => e.getAttribute('data-menu')));
    check(opts.join('|') === 'Ouvrir|Déplacer|Retirer de l’accueil|Annuler', 'appui long : Ouvrir, Déplacer, Retirer de l’accueil');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await page.waitForTimeout(150);
    check(await page.isVisible('#watch-hint'), 'consigne « OK prend une appli… »');
    check(await count(page, '.tile.held') === 1, 'carte prise (bleue)');
    await press(page, 'ArrowRight');
    let order1 = await home();
    check(order1[1] === order0[0] && order1[0] === order0[1], 'droite : l’appli avance d’une place');
    await press(page, 'ArrowDown');
    order1 = await home();
    check(order1.indexOf(order0[0]) === 5, 'bas : l’appli descend d’une ligne (de la bande à la grille)');
    check((await focused(page)).app === order0[0], 'le focus suit l’appli déplacée');
    await shot('reorganiser');
    await press(page, 'Escape');
    check(await count(page, '.tile.held') === 0, 'Retour : l’appli est posée');
    await press(page, 'Escape');
    await page.waitForTimeout(350);
    check(await page.isHidden('#watch-hint'), 'Retour à nouveau : fin de la réorganisation');

    console.log('Bibliothèque');
    await until(page, 'ArrowUp', (x) => x.row === 'dock', 4);
    const removed = (await focused(page)).app;
    await press(page, 'm');
    await until(page, 'ArrowDown', (x) => x.text === 'Retirer de l’accueil', 4);
    await press(page, 'Enter');
    await page.waitForTimeout(150);
    check(!(await home()).includes(removed) && await count(page, '#app [data-app]') === 17, 'retirée de l’accueil');
    await until(page, 'ArrowDown', (x) => x.row === 'library', 10);
    check((await focused(page)).action === 'library', 'pastille « Bibliothèque d’applications »');
    await press(page, 'Enter');
    await page.waitForTimeout(300);
    check(await page.isVisible('.panel.library'), 'bibliothèque ouverte');
    check((await page.textContent('.panel.library .count')) === '18 applications', 'bibliothèque : 18 applications, sans services système');
    const firstCard = await focused(page);
    check(firstCard.text.includes('Ajouter à l’accueil'), 'l’appli retirée arrive en premier, à ajouter');
    await shot('bibliotheque');
    await press(page, 'Enter');
    await page.waitForTimeout(150);
    check((await home()).includes(removed), 'OK : de nouveau sur l’accueil');
    check((await focused(page)).text.includes('Sur l’accueil'), 'statut « Sur l’accueil »');
    await press(page, 'Escape');
    await page.waitForTimeout(200);

    console.log('Paramètres du lanceur');
    await until(page, 'ArrowUp', (x) => x.row === 'header', 12);
    await until(page, 'ArrowRight', (x) => x.action === 'settings', 4);
    await press(page, 'Enter');
    await page.waitForTimeout(200);
    await until(page, 'ArrowDown', (x) => x.text === 'Paramètres du lanceur', 6);
    await press(page, 'Enter');
    await page.waitForTimeout(300);
    check(await page.isVisible('.panel.side'), 'page Paramètres du lanceur');
    await shot('parametres');
    check((await focused(page)).setting === 'Applications par ligne', 'première ligne : Applications par ligne');
    await press(page, 'ArrowRight');
    check(await count(page, '#dock [data-app]') === 5, '5 applis par ligne');
    check(await focusSetting(page, 'Thème'), 'ligne « Thème »');
    await press(page, 'ArrowRight');
    check(await page.evaluate(() => document.body.getAttribute('data-theme')) === 'noir', 'thème Noir');
    check(await focusSetting(page, 'Format de l’heure'), 'ligne « Format de l’heure »');
    await press(page, 'ArrowRight');
    check(/(AM|PM)$/.test(await page.textContent('#time')), 'heure au format 12 h');
    check(await focusSetting(page, 'Date'), 'ligne « Date »');
    await press(page, 'Enter');
    check(await page.isHidden('#date'), 'date masquée');
    check(await focusSetting(page, 'Seulement les sources connectées'), 'ligne « Seulement les sources connectées »');
    await press(page, 'Enter');
    await press(page, 'Escape');
    await page.waitForTimeout(200);
    check(await page.isHidden('#overlay'), 'Retour ferme les paramètres');
    check((await focused(page)).action === 'settings', 'le focus revient sur « Paramètres »');
    await until(page, 'ArrowLeft', (x) => x.action === 'inputs', 4);
    await press(page, 'Enter');
    await page.waitForTimeout(200);
    check(await count(page, '.panel.dropdown [data-source]') === 3, 'seulement les sources connectées (+ TV en direct)');
    await press(page, 'Escape');

    console.log('Persistance');
    const before = await home();
    await page.reload();
    await page.waitForSelector('body.ready');
    await page.waitForTimeout(300);
    check(/(AM|PM)$/.test(await page.textContent('#time')), 'format 12 h conservé après redémarrage');
    check(await page.evaluate(() => document.body.getAttribute('data-theme')) === 'noir', 'thème conservé');
    check(await count(page, '#dock [data-app]') === 5, 'nombre de colonnes conservé');
    check(JSON.stringify(await home()) === JSON.stringify(before), 'ordre de l’accueil conservé');

    console.log('Migration');
    await page.evaluate(() => localStorage.setItem('telecoding.settings.v1', JSON.stringify({ theme: 'noir', favorites: ['org.tizen.netflix-app'], favoritesVersion: 2 })));
    await page.reload();
    await page.waitForSelector('body.ready');
    await page.waitForTimeout(300);
    check(await page.evaluate(() => document.body.getAttribute('data-theme')) === 'ambiance', 'ancien réglage : thème Ambiance');
    check((await home())[0] === 'org.tizen.netflix-app', 'anciens favoris en tête de l’accueil');

    console.log('Erreurs JavaScript');
    check(errors.length === 0, 'aucune erreur (' + errors.join(' | ') + ')');

    await browser.close();
    console.log(failures ? '\n' + failures + ' échec(s)' : '\nTout est vert.');
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
