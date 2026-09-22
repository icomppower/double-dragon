// Headless browser playtest: serve dist/ then `node playtest.mjs http://127.0.0.1:8124 [--mobile]`
import puppeteer from 'puppeteer';
const BASE = process.argv[2] || 'http://127.0.0.1:8124';
const MOBILE = process.argv.includes('--mobile');
const fails = [], notes = [];
const ok = (c, m) => { (c ? notes : fails).push((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport(MOBILE ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 720 });
const errs = [], failedReq = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => failedReq.push(r.url() + ' ' + r.failure()?.errorText));
const snap = () => page.evaluate(() => window.__td.snap());
const inView = (sel) => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return { missing: sel }; const r = el.getBoundingClientRect(); const c = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { top: c === el || el.contains(c), inView: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, w: Math.round(r.width), h: Math.round(r.height) }; }, sel);

// 1. boot: the Blender kit and every figure rig
await page.goto(BASE + '/index.html?reset&all', { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForFunction('document.body.classList.contains("ready")', { timeout: 90000 });
let s = await snap();
ok(s.assetsOk === true, `Blender GLB kit loaded (assetsOk=${s.assetsOk})`);
ok(failedReq.length === 0, `no failed requests (${failedReq.slice(0, 3).join(' | ')})`);
const rigs = await page.evaluate(() => ['HeroBlue', 'HeroRed', 'Thug', 'Whip', 'Brute', 'Knife', 'Boss', 'Captive'].map((n) => [n, window.__td.pivots(n).length]));
ok(rigs.every(([, n]) => n === 6), `all eight figures expose the six limb pivots: ${rigs.map(([n, k]) => n + '=' + k).join(' ')}`);
const cards = await page.$$eval('#stages .stage', (b) => b.map((x) => ({ id: x.dataset.id, disabled: x.disabled })));
ok(cards.length === 4 && cards.every((c) => !c.disabled), `four stage cards, all unlocked with ?all (${cards.map((c) => c.id).join('/')})`);

// 2. menu reachability on a phone
if (MOBILE) {
  const h = await inView('#stages .stage');
  ok(h.top && h.inView, `first stage card is the top element at its centre on 390px (${JSON.stringify(h)})`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow at 390px');
}
// hero select
await page.click('#heroes button[data-hero="red"]');
ok(await page.$eval('#heroes button[data-hero="red"]', (b) => b.classList.contains('on')), 'clicking the red hero selects him');

// 3. start Dragon Street through the real card click: the intro plays, skip it, play begins
await page.click('#stages .stage[data-id="street"]');
await page.waitForFunction('window.__td.snap().mode==="intro"', { timeout: 15000 });
ok(await page.$eval('#intro', (el) => el.classList.contains('show')), 'kidnapping intro is showing');
await page.click('#skipIntro');
await page.waitForFunction('window.__td.snap().mode==="play"', { timeout: 15000 });
await page.waitForFunction('window.__td.snap().frames>30', { timeout: 20000 }).catch(() => {});
await sleep(300);
s = await snap();
ok(s.stage === 'street' && s.phase === 'play' && s.frames > 20, `stage started and the sim is stepping (${s.stage}, ${s.phase}, frames=${s.frames})`);
ok(s.section === 0 && s.lock && s.foes.length >= 1, `first section opened with a camera lock and foes walking in (section=${s.section} foes=${s.foes.length})`);
const calls = await page.evaluate(() => ({ calls: window.__td.drawCalls(), tris: window.__td.triangles(), decor: window.__td.snap().decor }));
ok(calls.calls > 20 && calls.tris > 1000 && calls.decor > 40, `renderer drawing the kit (draw calls ${calls.calls}, triangles ${calls.tris}, decor ${calls.decor})`);
const hudIn = await page.evaluate(() => ['#timer', '#score', '#hpBar', '#heroName'].map((q) => { const r = document.querySelector(q).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }));
ok(hudIn.every(Boolean), `HUD timer/score/hp/name inside the viewport (${hudIn.join(',')})`);
ok((await page.$eval('#heroName', (e) => e.textContent)).includes('Long Wei'), 'HUD names the red hero Long Wei');

// 4. keyboard: walk right, then punch
let p0 = s.player;
await page.keyboard.down('ArrowRight'); await sleep(600); await page.keyboard.up('ArrowRight');
s = await snap();
ok(s.player.x - p0.x > 0.7 || s.player.x >= s.lock[1] - 0.5, `ArrowRight for 0.6 s walked ${(s.player.x - p0.x).toFixed(2)} m (or reached the lock edge)`);
await page.keyboard.down('ArrowUp'); await sleep(400); await page.keyboard.up('ArrowUp');
const zAfter = (await snap()).player.z; ok(zAfter < s.player.z, `ArrowUp moved into depth (${s.player.z} -> ${zAfter})`);
await page.keyboard.press('KeyJ');
let attacked = false; for (let i = 0; i < 12; i++) { const q = await snap(); if (q.player.state === 'attack' || q.player.combo > 0 || q.hitsDealt > 0) { attacked = true; break; } await sleep(40); }
ok(attacked, 'J punches (player entered the attack state)');
const pose1 = await page.evaluate(() => window.__td.figurePose()); await sleep(700); const pose2 = await page.evaluate(() => window.__td.figurePose());
ok(pose1 && pose2 && Object.keys(pose1).some((k) => Math.abs(pose1[k] - pose2[k]) > 0.01), 'limb pivots are animating (pose changed between samples)');

// 5. mobile: touch controls fit and work
if (MOBILE) {
  const tc = await page.evaluate(() => [...document.querySelectorAll('#touch button, #joy')].map((b) => { const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { k: b.dataset.key || b.id, hit: el === b || b.contains(el), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, w: Math.round(r.width) }; }));
  ok(tc.length === 4 && tc.every((t) => t.hit && t.inView && t.w >= 44), 'joystick + 3 buttons inside 390x844 and hit-testable: ' + JSON.stringify(tc));
  await sleep(700);
  const b = await page.$('#touch button[data-key="punch"]'); const bb = await b.boundingBox();
  const before = await snap();
  await page.touchscreen.touchStart(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(60); await page.touchscreen.touchEnd();
  let tapped = false; for (let i = 0; i < 12; i++) { const q = await snap(); if (q.player.state === 'attack' || q.hitsDealt > before.hitsDealt) { tapped = true; break; } await sleep(40); }
  ok(tapped, 'tapping PUNCH starts an attack');
  const joy = await (await page.$('#joy')).boundingBox(); const px = (await snap()).player.x;
  await page.touchscreen.touchStart(joy.x + joy.width / 2 + 40, joy.y + joy.height / 2); await sleep(500); await page.touchscreen.touchEnd();
  const px2 = (await snap()).player.x; ok(px2 > px || px2 >= (await snap()).lock?.[1] - 0.5, `joystick drag walked right (${px.toFixed(2)} -> ${px2.toFixed(2)})`);
  const boss = await inView('#bossHud'); ok(boss.inView, 'boss bar slot inside the phone viewport ' + JSON.stringify(boss));
}

// 6. sustained loop under the in-browser bot
await page.evaluate(() => window.__td.autoplay(true));
await sleep(20000);
s = await snap();
ok(s.phase === 'play' || s.phase === 'clear', `20 s of autoplay keeps the stage running (phase=${s.phase} t=${s.t})`);
ok(s.t > 15, `sim time tracks wall time (t=${s.t})`);
ok(s.kills >= 2 && s.hitsDealt > 8, `bot is fighting: kills=${s.kills} hitsDealt=${s.hitsDealt} hitsTaken=${s.hitsTaken}`);
ok(s.section >= 1 || s.player.x > 14, `bot progressed past the first screen (section=${s.section} x=${s.player.x})`);
const foeHud = await page.$eval('#foeHud', (e) => e.classList.contains('show')); const scoreTxt = await page.$eval('#score', (e) => e.textContent.trim());
ok(parseInt(scoreTxt.replace(/,/g, '')) === s.score && s.score > 0, `score HUD tracks the sim (${scoreTxt} vs ${s.score}); foe bar shown=${foeHud}`);

// 7. continue flow: bleed the player out, take the continue
await page.evaluate(() => { const sim = window.__td.sim(); sim.lives = 1; sim.player.hp = 1; window.__td.autoplay(false); });
await page.waitForFunction('window.__td.snap().phase==="continue"', { timeout: 60000 }).catch(() => {});
s = await snap();
ok(s.phase === 'continue', `losing the last life shows CONTINUE? (phase=${s.phase})`);
ok(await page.$eval('#continue', (e) => e.classList.contains('show')), 'continue overlay visible');
await page.click('#contBtn');
await sleep(300); s = await snap();
ok(s.phase === 'play' && s.lives === 3 && s.continues === 2, `continue button restores play with 3 lives (phase=${s.phase} lives=${s.lives} continues=${s.continues})`);

// 8. hideout: the kit builds, the captive stands in her cage
await page.evaluate(() => window.__td.start('hideout', 'blue'));
await sleep(1500); s = await snap();
ok(s.stage === 'hideout' && s.captive === true && s.decor > 40, `hideout built with the captive in the cage (decor=${s.decor}, captive=${s.captive})`);
const calls2 = await page.evaluate(() => ({ calls: window.__td.drawCalls(), tris: window.__td.triangles() }));
ok(calls2.calls > 20, `hideout renders (draw calls ${calls2.calls}, triangles ${calls2.tris})`);

// 9. pause, quit to menu, progress persisted
await page.keyboard.press('Escape'); await sleep(200);
ok(await page.$eval('#pause', (e) => e.classList.contains('show')) && (await snap()).paused === true, 'Escape pauses');
await page.click('#quitBtn'); await sleep(300); s = await snap();
ok(s.mode === 'menu' && (await page.$eval('#menu', (e) => e.classList.contains('show'))), 'quit returns to the menu');
ok(errs.length === 0, `no console/page errors (${errs.slice(0, 3).join(' | ')})`);

await browser.close();
for (const n of notes) console.log(n);
for (const f of fails) console.log(f);
console.log(`\n${notes.length} passed, ${fails.length} failed${MOBILE ? ' (mobile)' : ''}`);
process.exit(fails.length ? 1 : 0);
