// 雙截龍 · TWIN DRAGON — input, audio, flow, HUD. All rules live in sim.js; drawing lives in render2d.js (Canvas 2D,
// Blender-rendered atlases). This file only listens, sequences and skins the DOM.
import { createGame, step, snap, skilledBot, useContinue, STAGES, FOES, WEAPONS, DT, LIVES } from './sim.js';
import { Renderer2D } from './render2d.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug'); if (DEBUG) document.body.classList.add('debug');
const SAVE_KEY = 'twindragon.v1';
const HEROES = { blue: { model: 'HeroBlue', name: 'Long Feng', zh: '龍鋒' }, red: { model: 'HeroRed', name: 'Long Wei', zh: '龍偉' } };

// ------------------------------------------------------------------ save
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { cleared: [], best: 0 }; } catch { return { cleared: [], best: 0 }; } }
function writeSave(sv) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(sv)); } catch { /* private mode */ } }
let save = loadSave();
if (params.has('reset')) { save = { cleared: [], best: 0 }; writeSave(save); }

// ------------------------------------------------------------------ renderer
const canvas = $('view');
const R = new Renderer2D(canvas);
let assetsOk = false;
addEventListener('resize', () => { R.resize(); skinAll(); });

// ------------------------------------------------------------------ audio (procedural, tiny)
const audio = { ctx: null, on: true, unlock() { if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; } try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; } },
  play(kind) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return; const c = this.ctx, t = c.currentTime;
    const g = c.createGain(); g.connect(c.destination);
    const noise = (dur, f0, f1, vol) => { const n = c.createBufferSource(); const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); n.buffer = buf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); n.connect(f); f.connect(g); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); n.start(t); n.stop(t + dur); };
    const tone = (freq, dur, vol, type = 'square', f1) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(g); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.start(t); o.stop(t + dur); };
    switch (kind) {
      case 'swing': noise(0.12, 900, 300, 0.12); break;
      case 'hit': noise(0.09, 600, 150, 0.35); tone(150, 0.08, 0.25, 'sine', 60); break;
      case 'kd': noise(0.25, 300, 60, 0.45); tone(90, 0.25, 0.4, 'sine', 35); break;
      case 'hurt': tone(220, 0.15, 0.25, 'sawtooth', 110); break;
      case 'pickup': tone(660, 0.08, 0.2); setTimeout(() => this.play('blip2'), 70); break;
      case 'blip2': tone(990, 0.1, 0.2); break;
      case 'eat': tone(520, 0.1, 0.2, 'triangle'); setTimeout(() => this.play('blip2'), 90); break;
      case 'gun': noise(0.05, 2500, 800, 0.25); break;
      case 'boom': noise(0.6, 200, 40, 0.7); tone(60, 0.5, 0.5, 'sine', 25); break;
      case 'clear': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => { if (this.ctx) { const o = this.ctx.createOscillator(); const gg = this.ctx.createGain(); o.type = 'square'; o.frequency.value = f; o.connect(gg); gg.connect(this.ctx.destination); gg.gain.setValueAtTime(0.18, this.ctx.currentTime); gg.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25); o.start(); o.stop(this.ctx.currentTime + 0.25); } }, i * 130)); break;
      case 'lose': tone(300, 0.6, 0.3, 'sawtooth', 80); break;
      case 'throw': noise(0.2, 500, 200, 0.2); break;
      case 'boss': tone(110, 0.5, 0.35, 'sawtooth', 55); break;
    }
  } };
function audioFromEvents(s, from) {
  for (let i = from; i < s.events.length; i++) { const e = s.events[i]; if (e.ev === 'pickup') audio.play('pickup'); else if (e.ev === 'eat') audio.play('eat'); else if (e.ev === 'throw') audio.play('throw'); else if (e.ev === 'playerdown') audio.play('kd'); else if (e.ev === 'section' && s.stage.sections[e.i] && s.stage.sections[e.i].boss) audio.play('boss'); }
  for (let i = lastLog; i < s.log.length; i++) { const h = s.log[i]; if (h.on === 'player') audio.play('hurt'); else if (h.move === 'Hook' || h.move === 'Throw' || h.move === 'Bat' || h.move === 'Elbow' || h.move === 'Jump Kick') audio.play('kd'); else audio.play('hit'); }
  lastLog = s.log.length;
  for (const fx of s.effects) { if (!fx._snd) { fx._snd = true; if (fx.kind === 'boom') audio.play('boom'); else if (fx.kind === 'muzzle') audio.play('gun'); else if (fx.kind === 'rumble') audio.play('kd'); } }
}
let lastLog = 0, lastEv = 0, lastPlayerAttack = null;

// ------------------------------------------------------------------ input
const keys = {}, latch = {}; const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', KeyJ: 'punch', KeyZ: 'punch', KeyK: 'kick', KeyX: 'kick', KeyL: 'jump', Space: 'jump', KeyC: 'jump' };
addEventListener('keydown', (e) => { const k = KEYMAP[e.code]; if (k) { if (!keys[k]) latch[k] = true; keys[k] = true; e.preventDefault(); } if (e.code === 'Enter') { keys.enter = true; } if (e.code === 'Escape') togglePause(); if (e.code === 'KeyM') { audio.on = !audio.on; } audio.unlock(); });
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; if (e.code === 'Enter') keys.enter = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; for (const k in latch) latch[k] = false; for (const k in touch) touch[k] = false; for (const b of document.querySelectorAll('#touch button')) b.classList.remove('on'); });
const touch = { left: false, right: false, up: false, down: false, punch: false, kick: false, jump: false };
function setupTouch() {
  const joy = $('joy'); const knob = $('knob'); let jid = null; const Rj = 60;
  const move = (t) => { const r = joy.getBoundingClientRect(); const dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2); const d = Math.hypot(dx, dy) || 1; const k = Math.min(1, d / Rj); knob.style.transform = `translate(${dx / d * k * 36}px,${dy / d * k * 36}px)`; touch.left = dx < -14; touch.right = dx > 14; touch.up = dy < -14; touch.down = dy > 14; };
  joy.addEventListener('pointerdown', (e) => { jid = e.pointerId; joy.setPointerCapture(jid); move(e); audio.unlock(); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) move(e); });
  const end = (e) => { if (e.pointerId === jid) { jid = null; knob.style.transform = ''; touch.left = touch.right = touch.up = touch.down = false; } };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  for (const b of document.querySelectorAll('#touch button')) {
    const k = b.dataset.key;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); touch[k] = true; latch[k] = true; b.classList.add('on'); audio.unlock(); });
    const up = () => { touch[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  }
}
function readInput() { const i = {}; for (const k of ['left', 'right', 'up', 'down', 'punch', 'kick', 'jump']) { i[k] = !!(keys[k] || touch[k] || latch[k]); latch[k] = false; } return i; }

// ------------------------------------------------------------------ DOM skin from the UI atlas
function skinAll() {
  if (!R.ui) return;
  const phone = innerWidth < 600; const u = phone ? 0.78 : 1;
  const shellW = Math.min(560, innerWidth) - 36;
  R.skin($('logo'), 'logo', Math.min(0.62, shellW / 880));
  const cs = Math.min(0.72, shellW / 770);
  for (const b of document.querySelectorAll('#stages .stage')) R.skin(b, b.classList.contains('done') ? 'card_done' : b.disabled ? 'card_lock' : 'card', cs);
  const hs = Math.min(0.7, (shellW - 12) / 2 / 385);
  for (const b of document.querySelectorAll('#heroes button')) R.skin(b, b.classList.contains('on') ? 'hero_card_on' : 'hero_card', hs);
  R.skin($('hpFrame'), 'bar_frame', u); R.skin($('hpBar'), 'fill_hero', u, { keepSize: true });
  R.skin($('foeFrame'), 'bar_frame', u * 0.85); R.skin($('foeBar'), 'fill_foe', u * 0.85, { keepSize: true });
  const bs = Math.min(u, (innerWidth - 40) / 540);
  R.skin($('bossFrame'), 'bar_frame_boss', bs); R.skin($('bossBar'), 'fill_boss', bs, { keepSize: true });
  R.skin($('heroPortrait'), 'portrait_' + HEROES[campaign ? campaign.hero : hero].model, phone ? 0.45 : 0.55);
  R.skin($('go'), 'go', phone ? 0.55 : 0.75);
  R.skin($('banner'), 'banner', Math.min(0.9, (innerWidth - 24) / 740));
  for (const id of ['continue', 'clear', 'over', 'pause']) R.skin($(id), 'panel', Math.min(0.95, (innerWidth - 24) / 360));
  for (const id of ['contBtn', 'resumeBtn', 'overBtn']) R.skin($(id), 'btn_pill', 0.8);
  for (const id of ['muteBtn', 'quitBtn']) R.skin($(id), 'btn_pill_ghost', 0.8);
  R.skin($('joy'), 'stick_base', 0.95); R.skin($('knob'), 'stick_knob', 0.9);
  R.skin(document.querySelector('#touch button[data-key="punch"]'), 'btn_punch', 0.93);
  R.skin(document.querySelector('#touch button[data-key="kick"]'), 'btn_kick', 0.91);
  R.skin(document.querySelector('#touch button[data-key="jump"]'), 'btn_jump', 0.91);
  R.skin($('pauseBtn'), 'btn_pause', 0.88);
  R.skin($('introScene'), 'intro_' + Math.max(0, introFrame), sceneScale()); R.skin($('endScene'), 'ending_' + Math.max(0, endFrame), sceneScale());
}
function sceneScale() { return Math.min(innerWidth / 1016, innerHeight * 0.5 / 418); }

// ------------------------------------------------------------------ flow
let sim = null, mode = 'menu', autoplay = params.has('auto'), paused = false, campaign = null, acc = 0, lastT = 0, introT = 0, endT = 0, introFrame = -1, endFrame = -1;
const stageOrder = STAGES.map((s) => s.id);
function unlocked(id) { if (params.has('all')) return true; const i = stageOrder.indexOf(id); return i === 0 || save.cleared.includes(stageOrder[i - 1]); }
let hero = 'blue';
function renderMenu() {
  const box = $('stages'); box.innerHTML = '';
  STAGES.forEach((st, i) => { const b = document.createElement('button'); b.className = 'stage' + (save.cleared.includes(st.id) ? ' done' : ''); b.dataset.id = st.id; b.disabled = !unlocked(st.id); b.innerHTML = `<span class="n">${i + 1}</span><b>${st.name}</b><i>${st.zh}</i>${save.cleared.includes(st.id) ? '<em>cleared</em>' : b.disabled ? '<em>locked</em>' : ''}`; b.addEventListener('click', () => { startCampaign(st.id); }); box.appendChild(b); });
  $('best').textContent = save.best ? `BEST ${save.best.toLocaleString()}` : '';
  for (const h of document.querySelectorAll('#heroes button')) h.classList.toggle('on', h.dataset.hero === hero);
  skinAll();
}
function startCampaign(stageId) {
  campaign = { lives: LIVES, score: 0, continues: 3, hero };
  audio.unlock();
  if (stageId === 'street') { mode = 'intro'; introT = 0; introFrame = -1; $('intro').classList.add('show'); $('menu').classList.remove('show'); startStage(stageId); showOverlay(null); return; }
  startStage(stageId); mode = 'play'; $('menu').classList.remove('show'); showOverlay(null);
}
async function startStage(id) {
  sim = createGame(id, { seed: (Date.now() % 100000) | 0, hero: campaign.hero, lives: campaign.lives, continues: campaign.continues, score: campaign.score });
  lastLog = 0; lastEv = 0; document.body.classList.add('playing');
  await R.loadStage(id); R.buildWorld(sim);
  $('stageName').textContent = `${stageOrder.indexOf(id) + 1} · ${sim.stage.name} ${sim.stage.zh}`;
  $('heroName').textContent = `${HEROES[campaign.hero].zh} ${HEROES[campaign.hero].name}`;
  skinAll();
  banner(`STAGE ${stageOrder.indexOf(id) + 1}<small>${sim.stage.name} · ${sim.stage.zh}</small>`, 2.2);
}
function endStage() {
  campaign.lives = Math.min(5, sim.lives + 1); campaign.score = sim.score; campaign.continues = sim.continues;
  if (!save.cleared.includes(sim.stageId)) save.cleared.push(sim.stageId);
  save.best = Math.max(save.best, sim.score); writeSave(save);
  const i = stageOrder.indexOf(sim.stageId);
  if (i < stageOrder.length - 1) { startStage(stageOrder[i + 1]); mode = 'play'; }
  else { mode = 'ending'; endT = 0; endFrame = -1; $('ending').classList.add('show'); R.digits($('endScore'), String(sim.score), 0.9); }
}
function showOverlay(id, html) { for (const o of document.querySelectorAll('.center')) o.classList.remove('show'); if (id) { const el = $(id); if (html !== undefined) el.querySelector('.inner').innerHTML = html; el.classList.add('show'); } }
function toMenu() { mode = 'menu'; sim = null; document.body.classList.remove('playing'); for (const o of document.querySelectorAll('.overlay, .center')) o.classList.remove('show'); $('menu').classList.add('show'); renderMenu(); }
function togglePause() { if (mode !== 'play') return; paused = !paused; showOverlay(paused ? 'pause' : null); }
let bannerT = 0;
function banner(html, t) { $('banner').querySelector('.inner').innerHTML = html; $('banner').classList.add('show'); bannerT = t; }

// ------------------------------------------------------------------ HUD
let lastTgt = null, tgtT = 0, shownMsg = null, lastTimer = -1, lastScore = -1, lastLives = -1;
function hud(s) {
  const P = s.player;
  $('hpBar').style.width = Math.max(0, P.hp / P.maxHp * 100) + '%'; const low = P.hp <= 30; if ($('hpBar').dataset.low !== String(low)) { $('hpBar').dataset.low = String(low); R.skin($('hpBar'), low ? 'fill_low' : 'fill_hero', innerWidth < 600 ? 0.78 : 1, { keepSize: true }); }
  if (s.lives !== lastLives) { lastLives = s.lives; R.digits($('lives'), '♥'.repeat(Math.max(0, s.lives)), 0.7); }
  if (s.score !== lastScore) { lastScore = s.score; R.digits($('score'), String(s.score), innerWidth < 600 ? 0.75 : 0.95); }
  const tm = String(Math.max(0, Math.ceil(s.timer))).padStart(2, '0'); if (tm !== lastTimer) { lastTimer = tm; R.digits($('timer'), tm, innerWidth < 600 ? 1.0 : 1.3); } $('timer').classList.toggle('low', s.timer < 15);
  const tgt = s.foes.find((f) => f.alive && f.flash > 0) || s.foes.find((f) => f.alive && f.hp < f.maxHp && !f.isBoss);
  if (tgt) { lastTgt = tgt; tgtT = 2.5; } tgtT -= 1 / 60;
  if (lastTgt && tgtT > 0 && lastTgt.alive) { $('foeHud').classList.add('show'); $('foeName').textContent = `${lastTgt.zh} ${lastTgt.name}`; $('foeBar').style.width = Math.max(0, lastTgt.hp / lastTgt.maxHp * 100) + '%'; if ($('foePortrait').dataset.m !== lastTgt.kind) { $('foePortrait').dataset.m = lastTgt.kind; R.skin($('foePortrait'), 'portrait_' + FOES[lastTgt.kind].model, 0.5); } } else $('foeHud').classList.remove('show');
  const boss = s.boss && s.boss.alive ? s.boss : null;
  $('bossHud').classList.toggle('show', !!boss); if (boss) { $('bossName').textContent = `${boss.zh} ${boss.name}`; $('bossBar').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%'; }
  $('go').classList.toggle('show', !s.lock && s.phase === 'play' && s.section < s.stage.sections.length - 1 && s.t > 1);
  $('weapon').textContent = P.weapon ? `${WEAPONS[P.weapon].name}${WEAPONS[P.weapon].uses > 1 ? ' ×' + P.uses : ''}` : '';
  if (s.msgT > 0 && s.msg && s.msg !== shownMsg) { shownMsg = s.msg; banner(s.msg.includes('!') ? s.msg : `<small>WARNING</small>${s.msg}`, 2.2); }
  if (bannerT > 0) { bannerT -= 1 / 60; if (bannerT <= 0) $('banner').classList.remove('show'); }
  if (DEBUG) $('debug').textContent = JSON.stringify({ ...snap(s), perf: R.perf(), draws: R.draws }, null, 0).slice(0, 900);
}
function drawHudPlate() {
  if (!R.ui || !sim) return; const sp = R.ui.meta.sprites.hud_top; if (!sp) return;
  const c = R.ctx; c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); c.globalAlpha = 0.92; c.drawImage(R.ui.img, sp.x, sp.y, sp.w, sp.h, 0, 0, R.W, innerWidth < 600 ? 76 : 88); c.globalAlpha = 1;
}

// ------------------------------------------------------------------ main loop
function frame(now) {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  const dt = Math.min(1.0, (now - lastT) / 1000 || 0); lastT = now;   // a slow renderer still gets real time: the sim is cheap, so up to 60 steps a frame
  if (mode === 'intro') { introT += dt; const fi = introT < 1.8 ? 0 : introT < 3.6 ? 1 : 2; if (fi !== introFrame) { introFrame = fi; R.skin($('introScene'), 'intro_' + fi, sceneScale()); } if (introT > 5.2 || keys.punch || touch.punch || keys.enter) { $('intro').classList.remove('show'); mode = 'play'; } }
  if (mode === 'ending') { endT += dt; const ei = endT < 4 ? 0 : 1; if (ei !== endFrame) { endFrame = ei; R.skin($('endScene'), 'ending_' + ei, sceneScale()); } if (sim) { acc += dt; let k = 0; while (acc >= DT && k < 60) { step(sim, {}, DT); acc -= DT; k++; } R.frame(sim, dt); } if (endT > 14 || (endT > 2 && (keys.enter || keys.punch || touch.punch))) toMenu(); return; }
  if (mode !== 'play' || !sim) { R.frame(sim, dt); R.pushTime(t0); return; }
  if (!paused) {
    acc += dt; let n = 0;
    if (acc > DT * 60) acc = DT * 60;
    while (acc >= DT && n < 60) {
      const inp = autoplay ? skilledBot(sim) : readInput();
      const ph = sim.phase;
      step(sim, inp, DT); acc -= DT; n++;
      if (sim.player.state === 'attack' && sim.player.phase === 'windup' && lastPlayerAttack !== sim.player.move) { audio.play('swing'); }
      lastPlayerAttack = sim.player.state === 'attack' ? sim.player.move : null;
      if (sim.phase !== ph) onPhase(sim.phase);
      if (sim.phase === 'continue' && (inp.punch && !sim.prev.punch || keys.enter)) { useContinue(sim); showOverlay(null); }
    }
    audioFromEvents(sim, lastEv); lastEv = sim.events.length;
    if (sim.phase === 'continue') { const n2 = String(Math.ceil(sim.continueT)); if ($('contN').dataset.v !== n2) { $('contN').dataset.v = n2; R.digits($('contN'), n2, 1.4); } }
    if (sim.phase === 'lost') { if (keys.enter || keys.punch || touch.punch) toMenu(); }
    if (sim.phase === 'next') endStage();
    if (sim.phase === 'won') { endStage(); }
    hud(sim);
  }
  R.frame(sim, paused ? 0 : dt); drawHudPlate(); R.pushTime(t0);
}
function onPhase(ph) {
  if (ph === 'clear') { audio.play('clear'); showOverlay('clear', `<b>STAGE CLEAR</b><small>${sim.stage.zh} · bonus ${(1000 + Math.round(sim.timer) * 10).toLocaleString()}</small>`); }
  if (ph === 'continue') { audio.play('lose'); showOverlay('continue'); }
  if (ph === 'lost') { showOverlay('over'); $('over').querySelector('small').textContent = `score ${sim.score.toLocaleString()} · press PUNCH`; save.best = Math.max(save.best, sim.score); writeSave(save); }
  if (ph === 'play' || ph === 'next' || ph === 'won') showOverlay(null);
}

// ------------------------------------------------------------------ boot
async function boot() {
  setupTouch();
  for (const h of document.querySelectorAll('#heroes button')) h.addEventListener('click', () => { hero = h.dataset.hero; renderMenu(); audio.unlock(); });
  $('resetBtn').addEventListener('click', () => { save = { cleared: [], best: 0 }; writeSave(save); renderMenu(); });
  $('contBtn').addEventListener('click', () => { if (sim && sim.phase === 'continue') { useContinue(sim); showOverlay(null); } });
  $('quitBtn').addEventListener('click', () => { toMenu(); paused = false; });
  $('resumeBtn').addEventListener('click', () => togglePause());
  $('overBtn').addEventListener('click', () => toMenu());
  $('pauseBtn').addEventListener('click', () => { if (mode === 'play') togglePause(); });
  $('muteBtn').addEventListener('click', () => { audio.on = !audio.on; $('muteBtn').textContent = audio.on ? 'SOUND: ON' : 'SOUND: OFF'; });
  $('skipIntro').addEventListener('click', () => { $('intro').classList.remove('show'); mode = 'play'; });
  assetsOk = await R.load((p) => { $('loadBar').style.width = (p * 100) + '%'; });
  $('startNote').textContent = assetsOk ? 'Blender atlases loaded · pick a stage' : 'Atlases failed to load · using fallback boxes';
  document.body.classList.add('ready'); $('menu').classList.add('show'); renderMenu();
  const st = params.get('stage'); if (st && STAGES.some((s) => s.id === st)) { hero = params.get('hero') === 'red' ? 'red' : 'blue'; startCampaign(st); if (params.has('nointro')) { $('intro').classList.remove('show'); mode = 'play'; } }
  requestAnimationFrame(frame);
}
window.__td = {
  snap: () => ({ mode, assetsOk, autoplay, paused, camX: +R.camX.toFixed(2), S: +R.S.toFixed(2), captive: !!R.captive, decor: R.decorCount || 0, ...(sim ? snap(sim) : {}) }),
  start: (id, h) => { hero = h || hero; startCampaign(id); $('intro').classList.remove('show'); mode = 'play'; },
  autoplay: (v) => { autoplay = !!v; },
  drawCalls: () => R.draws,
  atlases: () => ({ ok: R.ok, figures: R.figures ? Object.keys(R.figures.meta.figures).length : 0, frames: R.figures ? Object.values(R.figures.meta.figures).reduce((a, f) => a + Object.keys(f.frames).length, 0) : 0, fx: R.fx ? Object.keys(R.fx.meta.sprites).length : 0, ui: R.ui ? Object.keys(R.ui.meta.sprites).length : 0, stage: R.stageId, stageOk: !!R.stage }),
  frameName: () => (sim ? R.frameName(sim.player) : null),
  screenOf: (who) => { if (!sim) return null; const e = who === 'boss' ? sim.boss : who === 'player' ? sim.player : sim.foes.find((f) => f.alive && f.kind === who); return e ? R.screenOf(e) : null; },
  samplePixels: (x, y, w, h) => R.samplePixels(x, y, w, h),
  perf: () => R.perf(),
  step: (n) => { for (let i = 0; i < n; i++) step(sim, autoplay ? skilledBot(sim) : readInput(), DT); },
  useContinue: () => useContinue(sim),
  sim: () => sim,
};
boot();
