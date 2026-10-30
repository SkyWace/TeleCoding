/*
 * Mesure de fluidité : processeur ralenti 6× (proche d'une TV), on parcourt l'accueil à la
 * télécommande et on mesure les images affichées (requestAnimationFrame) et le temps de peinture.
 *   node tests/perf.js
 */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(APP);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('body.ready');
    await page.waitForTimeout(1500);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await cdp.send('Performance.enable');
    const before = await cdp.send('Performance.getMetrics');

    await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
    await page.evaluate(() => {
        window.__frames = [];
        let last = performance.now();
        (function loop(t) { window.__frames.push(t - last); last = t; window.__raf = requestAnimationFrame(loop); })(last);
    });
    const keys = ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight',
        'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft'];
    const t0 = Date.now();
    for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(220); }
    await page.waitForTimeout(800);
    const elapsed = Date.now() - t0;
    const frames = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__frames.slice(1); });
    const after = await cdp.send('Performance.getMetrics');
    const trace = JSON.parse((await browser.stopTracing()).toString()).traceEvents;
    const sum = (name) => trace.filter((e) => e.name === name && e.dur).reduce((a, e) => a + e.dur, 0) / 1000;
    const nb = (name) => trace.filter((e) => e.name === name).length;
    const paintClips = trace.filter((e) => e.name === 'Paint' && e.args && e.args.data && e.args.data.clip)
        .length;
    const m = (r, n) => (r.metrics.find((x) => x.name === n) || {}).value || 0;
    const long = frames.filter((d) => d > 50).length;
    const worst = Math.max.apply(null, frames);
    const fps = frames.length / (elapsed / 1000);
    console.log('images/s : ' + fps.toFixed(1) + ' · images > 50 ms : ' + long + ' · pire image : ' + Math.round(worst) + ' ms');
    console.log('mise en page : ' + Math.round((m(after, 'LayoutDuration') - m(before, 'LayoutDuration')) * 1000) + ' ms · ' +
        'recalcul de style : ' + Math.round((m(after, 'RecalcStyleDuration') - m(before, 'RecalcStyleDuration')) * 1000) + ' ms · ' +
        'scripts : ' + Math.round((m(after, 'ScriptDuration') - m(before, 'ScriptDuration')) * 1000) + ' ms');
    console.log('peinture : ' + nb('Paint') + ' fois, ' + Math.round(sum('Paint')) + ' ms · ' +
        'rastérisation : ' + Math.round(sum('RasterTask')) + ' ms · calques : ' + Math.round(sum('UpdateLayerTree')) + ' ms');
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
