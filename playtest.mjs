// Headless browser playtest: serve dist/ then `node playtest.mjs http://127.0.0.1:8124 [--mobile]`
// Canvas 2D build: checks the Blender atlases load, sprites animate, the elite tint is really on the canvas, no Three.js
// is referenced or requested, and the frame time budget holds (p95 < 16.7 ms desktop, < 33 ms on a 390x844 phone).
import puppeteer from 'puppeteer';
const BASE = process.argv[2] || 'http://127.0.0.1:8124';
const MOBILE = process.argv.includes('--mobile');
const fails = [], notes = [];
const ok = (c, m) => { (c ? notes : fails).push((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport(MOBILE ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 720 });
const errs = [], failedReq = [], reqs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('request', (r) => reqs.push(r.url()));
page.on('requestfailed', (r) => failedReq.push(r.url() + ' ' + r.failure()?.errorText));
const snap = () => page.evaluate(() => window.__td.snap());
const inView = (sel) => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return { missing: sel }; const r = el.getBoundingClientRect(); const c = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { top: c === el || el.contains(c), inView: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, w: Math.round(r.width), h: Math.round(r.height) }; }, sel);
// frame-based waits: a software renderer may draw one frame a second, so never rely on wall-clock holds
const waitFrames = async (n, timeout = 30000) => { const f0 = (await snap()).frames; await page.waitForFunction((f0, n) => window.__td.snap().frames >= f0 + n, { timeout, polling: 'raf' }, f0, n).catch(() => {}); };
const holdKey = async (key, n) => { await page.keyboard.down(key); await waitFrames(n); await page.keyboard.up(key); await waitFrames(1); };
// the gold tint lands on the toon skin as (r>=165, g>=120, b<=65); untinted skin never reaches that
const goldish = (px) => px.some(([r, g, b]) => r >= 165 && g >= 120 && b <= 65 && r > g && g > b);
const sampleAround = (who) => page.evaluate((who) => { const p = window.__td.screenOf(who); const S = window.__td.snap().S; if (!p) return null; return window.__td.samplePixels(p.x - 0.5 * S, p.y - 2.1 * S * 0.94, S, 2.1 * S * 0.94); }, who);

// 1. boot: atlases, no Three.js anywhere
await page.goto(BASE + '/index.html?reset&all', { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForFunction('document.body.classList.contains("ready")', { timeout: 90000 });
let s = await snap();
ok(s.assetsOk === true, `Blender atlases loaded (assetsOk=${s.assetsOk})`);
ok(failedReq.length === 0, `no failed requests (${failedReq.slice(0, 3).join(' | ')})`);
const at = await page.evaluate(() => window.__td.atlases());
ok(at.ok && at.figures === 8 && at.frames >= 300 && at.fx >= 25 && at.ui >= 50, `figure atlas has 8 figures / ${at.frames} frames, fx ${at.fx} sprites, ui ${at.ui} sprites`);
ok(await page.evaluate(() => typeof THREE === 'undefined' && !document.querySelector('script[type="importmap"]')), 'no THREE global and no import map');
ok(reqs.every((u) => !/three/i.test(u) && !/\.glb$/i.test(u)), `no request to vendor/three or any GLB (${reqs.length} requests)`);
ok(await page.evaluate(() => { const c = document.getElementById('view'); return !!c.getContext('2d') && !c.getContext('webgl2', { failIfMajorPerformanceCaveat: false }); }), 'the view canvas is a 2D context');
const cards = await page.$$eval('#stages .stage', (b) => b.map((x) => ({ id: x.dataset.id, disabled: x.disabled, bg: getComputedStyle(x).backgroundImage })));
ok(cards.length === 4 && cards.every((c) => !c.disabled), `four stage cards, all unlocked with ?all (${cards.map((c) => c.id).join('/')})`);
ok(cards.every((c) => c.bg.includes('ui.png')), 'stage cards are skinned from the UI atlas');
ok(await page.$eval('#logo', (e) => getComputedStyle(e).backgroundImage.includes('ui.png') && e.getBoundingClientRect().width > 200), 'title logo comes from the UI atlas');

// 2. menu reachability on a phone
if (MOBILE) {
  const h = await inView('#stages .stage');
  ok(h.top && h.inView, `first stage card is the top element at its centre on 390px (${JSON.stringify(h)})`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow at 390px');
}
await page.click('#heroes button[data-hero="red"]');
ok(await page.$eval('#heroes button[data-hero="red"]', (b) => b.classList.contains('on') && getComputedStyle(b).backgroundImage.includes('ui.png')), 'clicking the red hero selects him (skinned card)');

// 3. start Dragon Street through the real card click: the intro plays from rendered frames, skip it, play begins
await page.click('#stages .stage[data-id="street"]');
await page.waitForFunction('window.__td.snap().mode==="intro"', { timeout: 15000 });
ok(await page.$eval('#intro', (el) => el.classList.contains('show')) && await page.$eval('#introScene', (e) => getComputedStyle(e).backgroundImage.includes('ui.png') && e.getBoundingClientRect().width > 300), 'kidnapping intro shows a Blender-rendered frame');
await page.click('#skipIntro');
await page.waitForFunction('window.__td.snap().mode==="play"', { timeout: 15000 });
const stepping = await page.waitForFunction('window.__td.snap().frames>30', { timeout: 20000 }).then(() => true).catch(() => false);
ok(stepping, 'sim reached 30 frames within 20 s of play starting');
await sleep(300);
s = await snap();
ok(s.stage === 'street' && s.phase === 'play' && s.frames > 20, `stage started and the sim is stepping (${s.stage}, ${s.phase}, frames=${s.frames})`);
ok(s.section === 0 && s.lock && s.foes.length >= 1, `first section opened with a camera lock and foes walking in (section=${s.section} foes=${s.foes.length})`);
const at2 = await page.evaluate(() => window.__td.atlases());
ok(at2.stage === 'street' && at2.stageOk, `stage atlas loaded (${at2.stage})`);
const draws = await page.evaluate(() => window.__td.drawCalls());
ok(draws > 8 && s.decor > 40, `renderer drawing the layers and sprites (draw calls ${draws}, decor entries ${s.decor})`);
const hudIn = await page.evaluate(() => ['#timer', '#score', '#hpBar', '#heroName', '#pauseBtn'].map((q) => { const r = document.querySelector(q).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && r.width > 0; }));
ok(hudIn.every(Boolean), `HUD timer/score/hp/name/pause inside the viewport (${hudIn.join(',')})`);
ok((await page.$eval('#heroName', (e) => e.textContent)).includes('Long Wei'), 'HUD names the red hero Long Wei');
ok(await page.$eval('#timer', (e) => /^\d\d$/.test(e.textContent.trim()) && e.querySelectorAll('.digits i').length === 2 && getComputedStyle(e.querySelector('.digits i')).backgroundImage.includes('ui.png')), 'timer is drawn with the bitmap digit font and keeps its text');
ok(await page.$eval('#hpFrame', (e) => getComputedStyle(e).backgroundImage.includes('ui.png')) && await page.$eval('#hpBar', (e) => getComputedStyle(e).backgroundImage.includes('ui.png')), 'health bar frame and fill come from the UI atlas');

// 4. keyboard: walk right, sprite frames cycle, depth, punch
let p0 = s.player;
const seen = new Set();
await page.keyboard.down('ArrowRight');
for (let i = 0; i < 8; i++) { await waitFrames(5); seen.add(await page.evaluate(() => window.__td.frameName())); }
await page.keyboard.up('ArrowRight'); await waitFrames(1);
s = await snap();
ok(s.player.x - p0.x > 0.7 || s.player.x >= s.lock[1] - 0.5, `ArrowRight held walked ${(s.player.x - p0.x).toFixed(2)} m (or reached the lock edge)`);
const walkFrames = [...seen].filter((n) => n && n.startsWith('walk_'));
ok(walkFrames.length >= 2, `sprite frame index changes while walking (${[...seen].join(',')})`);
await holdKey('ArrowUp', 25);
const zAfter = (await snap()).player.z; ok(zAfter < s.player.z, `ArrowUp moved into depth (${s.player.z} -> ${zAfter})`);
const att0 = (await snap()).attacks;
await page.keyboard.press('KeyJ'); await waitFrames(2);
ok((await snap()).attacks > att0, `J punches (attack starts ${att0} -> ${(await snap()).attacks})`);

// 5. mobile: touch controls fit and work, skinned from the atlas
if (MOBILE) {
  const tc = await page.evaluate(() => [...document.querySelectorAll('#touch button, #joy')].map((b) => { const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { k: b.dataset.key || b.id, hit: el === b || b.contains(el), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, w: Math.round(r.width), skinned: getComputedStyle(b).backgroundImage.includes('ui.png') }; }));
  ok(tc.length === 4 && tc.every((t) => t.hit && t.inView && t.w >= 44), 'joystick + 3 buttons inside 390x844 and hit-testable: ' + JSON.stringify(tc));
  ok(tc.every((t) => t.skinned), 'stick and buttons are rendered art from the UI atlas');
  await sleep(500);
  const b = await page.$('#touch button[data-key="punch"]'); const bb = await b.boundingBox();
  const before = await snap();
  await page.touchscreen.touchStart(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(60); await page.touchscreen.touchEnd(); await waitFrames(2);
  ok((await snap()).attacks > before.attacks, `tapping PUNCH starts an attack (${before.attacks} -> ${(await snap()).attacks})`);
  const joy = await (await page.$('#joy')).boundingBox(); const px = (await snap()).player.x;
  await page.touchscreen.touchStart(joy.x + joy.width / 2 + 40, joy.y + joy.height / 2); await waitFrames(30); await page.touchscreen.touchEnd(); await waitFrames(1);
  const px2 = (await snap()).player.x; ok(px2 > px || px2 >= (await snap()).lock?.[1] - 0.5, `joystick drag walked right (${px.toFixed(2)} -> ${px2.toFixed(2)})`);
  const boss = await inView('#bossHud'); ok(boss.inView, 'boss bar slot inside the phone viewport ' + JSON.stringify(boss));
}

// 6. sustained loop under the in-browser bot, then the frame-time budget
await page.evaluate(() => window.__td.autoplay(true));
await sleep(20000);
s = await snap();
ok(s.phase === 'play' || s.phase === 'clear', `20 s of autoplay keeps the stage running (phase=${s.phase} t=${s.t})`);
ok(s.t > 12, `sim time tracks wall time (t=${s.t} after 20 s)`);
ok(s.kills >= 1 && s.hitsDealt >= 6, `bot is fighting: kills=${s.kills} hitsDealt=${s.hitsDealt} hitsTaken=${s.hitsTaken}`);
ok(s.section >= 1 || s.kills >= 2 || s.player.x > 10, `bot is clearing the first screen (section=${s.section} kills=${s.kills} x=${s.player.x})`);
const scoreTxt = await page.$eval('#score', (e) => e.textContent.trim());
ok(parseInt(scoreTxt.replace(/,/g, '')) === s.score && s.score > 0, `score HUD tracks the sim through the bitmap digits (${scoreTxt} vs ${s.score})`);
// negative half of the tint check while only plain foes are around: an untinted figure must not read as gold
const plainPx = await page.evaluate(() => { const sim = window.__td.sim(); const S = window.__td.snap().S; const t = sim.foes.find((f) => f.alive && !f.elite && f.entered && sim.foes.every((o) => o === f || !o.alive || Math.abs(o.x - f.x) > 1.6 || Math.abs(o.z - f.z) > 1.2) && Math.abs(f.x - sim.player.x) > 1.6); if (!t) return null; const p = window.__td.screenOf(t.kind); return window.__td.samplePixels(p.x - 0.5 * S, p.y - 2.1 * S * 0.94, S, 2.1 * S * 0.94); });
ok(!plainPx || !goldish(plainPx), plainPx ? `an isolated plain foe carries no gold (${plainPx.length} samples)` : 'no isolated plain foe to sample this run (skipped)');
const perf = await page.evaluate(() => window.__td.perf());
const budget = MOBILE ? 33 : 16.7;
ok(perf.n >= 100 && perf.p95 < budget, `p95 frame time ${perf.p95.toFixed(2)} ms under ${budget} ms (p50 ${perf.p50.toFixed(2)}, max ${perf.max.toFixed(1)}, n=${perf.n})`);

// 6b. the stage boss is an elite: gold tint sampled from the canvas, boss bar
await page.evaluate(() => { const sim = window.__td.sim(); sim.foes.length = 0; sim.lock = null; sim.section = 4; sim.player.x = 106; sim.progress = 106; });
const bossUp = await page.waitForFunction('!!window.__td.snap().boss', { timeout: 30000 }).then(() => true).catch(() => false);
s = await snap();
ok(bossUp && s.boss && s.boss.name.includes('Ox'), `elite boss spawned when the last screen opened (${s.boss && s.boss.name})`);
await page.waitForFunction(() => { const sim = window.__td.sim(); return sim.boss && sim.boss.entered; }, { timeout: 20000, polling: 'raf' }).catch(() => {});
await waitFrames(2);
let bossPx = await sampleAround('boss');
ok(bossPx && goldish(bossPx), `elite figure carries the gold tint on the canvas (${bossPx ? bossPx.length : 0} samples)`);
ok(await page.$eval('#bossHud', (e) => e.classList.contains('show')), 'boss bar shown');
ok(await page.$eval('#bossFrame', (e) => getComputedStyle(e).backgroundImage.includes('ui.png')), 'boss bar frame from the UI atlas');
if (MOBILE) {
  const pb = await inView('#pauseBtn'); ok(pb.top && pb.inView && pb.w >= 44, 'pause button hit-testable on the phone HUD ' + JSON.stringify(pb));
  const b2 = await page.$('#pauseBtn'); const bb2 = await b2.boundingBox();
  await page.touchscreen.touchStart(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2); await sleep(50); await page.touchscreen.touchEnd(); await sleep(200);
  ok((await snap()).paused === true && (await page.$eval('#pause', (e) => e.classList.contains('show'))), 'tapping ❚❚ pauses');
  ok(await page.$eval('#pause', (e) => getComputedStyle(e).backgroundImage.includes('ui.png')), 'pause panel is a rendered plate');
  await page.click('#muteBtn'); ok((await page.$eval('#muteBtn', (e) => e.textContent)) === 'SOUND: OFF', 'sound toggle in the pause menu');
  await page.click('#resumeBtn'); await sleep(200); ok((await snap()).paused === false, 'RESUME unpauses');
}

// 7. continue flow: bleed the player out, take the continue
await page.evaluate(() => { const sim = window.__td.sim(); sim.lives = 1; sim.player.hp = 1; window.__td.autoplay(false); });
await page.waitForFunction('window.__td.snap().phase==="continue"', { timeout: 60000 }).catch(() => {});
s = await snap();
ok(s.phase === 'continue', `losing the last life shows CONTINUE? (phase=${s.phase})`);
ok(await page.$eval('#continue', (e) => e.classList.contains('show') && getComputedStyle(e).backgroundImage.includes('ui.png')), 'continue overlay visible on a rendered panel');
await page.click('#contBtn');
await sleep(300); s = await snap();
ok(s.phase === 'play' && s.lives === 3 && s.continues === 2, `continue button restores play with 3 lives (phase=${s.phase} lives=${s.lives} continues=${s.continues})`);

// 8. hideout: the stage atlas builds, the captive stands in her cage
await page.evaluate(() => window.__td.start('hideout', 'blue'));
await page.waitForFunction('window.__td.atlases().stage==="hideout" && window.__td.atlases().stageOk', { timeout: 20000 }).catch(() => {});
await sleep(600); s = await snap();
ok(s.stage === 'hideout' && s.captive === true && s.decor > 40, `hideout built with the captive in the cage (decor=${s.decor}, captive=${s.captive})`);
const draws2 = await page.evaluate(() => window.__td.drawCalls());
ok(draws2 > 8, `hideout renders (draw calls ${draws2})`);

// 9. pause, quit to menu
await page.keyboard.press('Escape'); await sleep(200);
ok(await page.$eval('#pause', (e) => e.classList.contains('show')) && (await snap()).paused === true, 'Escape pauses');
await page.click('#quitBtn'); await sleep(300); s = await snap();
ok(s.mode === 'menu' && (await page.$eval('#menu', (e) => e.classList.contains('show'))), 'quit returns to the menu');

// 10. the ending: clear the hideout, the captive walks out, the rendered ending frame shows, back to the menu
await page.evaluate(() => window.__td.start('hideout', 'blue'));
await sleep(600);
await page.evaluate(() => { const sim = window.__td.sim(); sim.foes.length = 0; sim.lock = null; sim.section = 4; sim.player.x = 108; sim.progress = 108; window.__td.autoplay(true); });
const warlord = await page.waitForFunction('!!window.__td.snap().boss', { timeout: 30000 }).then(() => true).catch(() => false);
ok(warlord, 'the warlord appears in the throne room');
await page.evaluate(() => { const sim = window.__td.sim(); if (sim.boss) sim.boss.hp = 1; });
const ended = await page.waitForFunction('window.__td.snap().mode==="ending"', { timeout: 60000 }).then(() => true).catch(() => false);
s = await snap();
ok(ended && s.phase === 'won', `beating the warlord runs the ending (mode=${s.mode} phase=${s.phase})`);
ok(await page.$eval('#ending', (e) => e.classList.contains('show')) && /\d/.test(await page.$eval('#endScore', (e) => e.textContent)) && await page.$eval('#endScene', (e) => getComputedStyle(e).backgroundImage.includes('ui.png')), 'ending overlay shows the rendered frame and the final score');
await sleep(2600); await page.keyboard.down('KeyJ'); await waitFrames(3); await page.keyboard.up('KeyJ'); await sleep(300);
s = await snap(); ok(s.mode === 'menu', `PUNCH after the ending returns to the menu (mode=${s.mode})`);
ok(await page.$$eval('#stages .stage em', (els) => els.filter((e) => e.textContent === 'cleared').length) >= 1, 'hideout marked cleared in the menu');
ok(errs.length === 0, `no console/page errors (${errs.slice(0, 3).join(' | ')})`);

await browser.close();
for (const n of notes) console.log(n);
for (const f of fails) console.log(f);
console.log(`\n${notes.length} passed, ${fails.length} failed${MOBILE ? ' (mobile)' : ''}`);
process.exit(fails.length ? 1 : 0);
