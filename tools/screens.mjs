// Kill-gate screenshots: node tools/screens.mjs http://127.0.0.1:8124  -> docs/screens/*.png
import puppeteer from 'puppeteer';
const BASE = process.argv[2] || 'http://127.0.0.1:8124';
const OUT = new URL('../docs/screens/', import.meta.url).pathname;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => page.screenshot({ path: OUT + name + '.png' });
const teleport = (x, section) => page.evaluate((x, section) => { const sim = window.__td.sim(); sim.foes.length = 0; sim.lock = null; sim.section = section; sim.player.x = x; sim.progress = x; }, x, section);
await page.goto(BASE + '/index.html?reset&all', { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForFunction('document.body.classList.contains("ready")', { timeout: 90000 });
await sleep(400); await shot('menu');
await page.click('#stages .stage[data-id="street"]'); await page.waitForFunction('window.__td.snap().mode==="intro"'); await sleep(2200); await shot('intro');
await page.click('#skipIntro'); await page.waitForFunction('window.__td.snap().mode==="play"'); await page.evaluate(() => window.__td.autoplay(true));
await sleep(9000); await shot('hud-street');
for (const [id, x, name] of [['yard', 44, 'stage-yard'], ['ridge', 60, 'stage-ridge'], ['hideout', 70, 'stage-hideout']]) {
  await page.evaluate((id) => window.__td.start(id, 'blue'), id); await page.waitForFunction((id) => window.__td.atlases().stage === id && window.__td.atlases().stageOk, {}, id);
  await sleep(500); await teleport(x, 1); await sleep(7000); await shot(name);
}
await teleport(108, 4); await page.waitForFunction('!!window.__td.snap().boss', { timeout: 30000 }); await sleep(6000); await shot('warlord');
await page.evaluate(() => { const sim = window.__td.sim(); if (sim.boss) sim.boss.hp = 1; }); await page.waitForFunction('window.__td.snap().mode==="ending"', { timeout: 60000 }); await sleep(4500); await shot('ending');
await browser.close(); console.log('screens written to', OUT);
