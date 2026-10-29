/*
 * Bannières des applis : logos officiels (Wikimedia Commons, licences libres, voir
 * tools/wikimedia-logos.json et THIRD_PARTY_NOTICES.md) posés sur la couleur de la marque,
 * comme les bannières Android TV qu'affiche CleanYourTV. Les marques restent la propriété
 * de leurs détenteurs.
 *
 * bg     : fond de la carte (couleur CSS ou dégradé)
 * white  : passe le logo en blanc (logo sombre sur fond de couleur)
 * glow   : couleur du halo [r, g, b]
 * rotate : logo vertical à remettre à l'horizontale (size est alors une part de la largeur)
 * size   : hauteur du logo, en part de la hauteur de la carte (0.5 par défaut)
 */
(function (global) {
    'use strict';
    var TC = global.TC = global.TC || {};
    TC.BANNERS = {
        netflix:         { names: ['netflix'], bg: '#ffffff', glow: [229, 9, 20], size: 0.34 },
        youtube:         { names: ['youtube'], bg: '#f4f4f4', glow: [255, 0, 0], size: 0.3 },
        primevideo:      { names: ['primevideo', 'amazonprimevideo'], bg: '#0779ff', glow: [7, 121, 255], size: 0.62 },
        disneyplus:      { names: ['disneyplus'], bg: 'linear-gradient(180deg, #1b4aa8, #0a1d4d)', white: true, glow: [27, 74, 168], size: 0.62 },
        spotify:         { names: ['spotify'], bg: '#121212', glow: [30, 215, 96], size: 0.32 },
        arte:            { names: ['arte'], bg: '#fd5d22', white: true, rotate: true, glow: [253, 93, 34], size: 0.15 },
        canalplus:       { names: ['canalplus', 'canal'], bg: '#000000', glow: [140, 140, 150], size: 0.3 },
        crunchyroll:     { names: ['crunchyroll'], bg: '#ff640a', white: true, glow: [255, 100, 10], size: 0.6 },
        appletv:         { names: ['appletv'], bg: '#000000', white: true, glow: [150, 150, 160], size: 0.4 },
        applemusic:      { names: ['applemusic'], bg: 'linear-gradient(180deg, #fc5c65, #fa233b)', white: true, glow: [250, 35, 59], size: 0.26 },
        xbox:            { names: ['xbox', 'xboxgamepass'], bg: '#107c10', white: true, glow: [16, 124, 16], size: 0.56 },
        luna:            { names: ['luna', 'amazonluna'], bg: '#5b2ee0', white: true, glow: [91, 46, 224], size: 0.62 },
        orangetv:        { names: ['orangetv', 'orange'], bg: '#000000', glow: [255, 121, 0], size: 0.56 },
        plutotv:         { names: ['plutotv'], bg: '#000000', white: true, glow: [255, 230, 0], size: 0.26 },
        samsunginternet: { names: ['internet', 'samsunginternet'], bg: '#ffffff', glow: [118, 120, 255], size: 0.56 },
        tvplus:          { names: ['samsungtvplus', 'tvplus'], bg: '#ffffff', glow: [0, 160, 230], size: 0.66 }
    };
})(this);
