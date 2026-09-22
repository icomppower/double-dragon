// 雙截龍 · TWIN DRAGON — Canvas 2D renderer. Draws the sim from the Blender-rendered atlases (figures, fx, per-stage
// layers, ui). No WebGL, no dependencies, no ctx.filter: tint and flash go through globalCompositeOperation on a scratch
// canvas. Coordinates: the atlases were rendered by an orthographic camera pitched 20° down at 48 px per metre, so a
// world point (x, z depth toward the camera, y height) lands at screen (x·S, groundY + z·sin20·S − y·cos20·S).
import { STAGES, WEAPONS, FOES } from './sim.js';

const PPM = 48, SIN = Math.sin(20 * Math.PI / 180), COS = Math.cos(20 * Math.PI / 180);
const HEAVY = { drum: 'W_Drum', crate: 'W_Crate' };
const WSPRITE = { bat: 'W_Bat', knife: 'W_Knife', whip: 'W_Whip', dynamite: 'W_Dynamite', drum: 'W_Drum', crate: 'W_Crate', gun: 'W_Gun' };
const FIG_COLOR = { HeroBlue: '#2455c8', HeroRed: '#c8262e', Thug: '#4f8a3a', Whip: '#b2308f', Brute: '#a8734f', Knife: '#1a1a1d', Boss: '#2f4a2a', Captive: '#e9d1a2' };
const GOLD = '#d4a520';

function loadImage(url) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image ' + url)); im.src = url; }); }
async function loadJson(url) { const r = await fetch(url); if (!r.ok) throw new Error('json ' + url); return r.json(); }

export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.ok = false; this.figures = null; this.fx = null; this.ui = null; this.stage = null; this.stageId = null; this.stageCache = new Map();
    this.camX = 0; this.snap = true; this.shake = 0; this.time = 0; this.W = 1; this.H = 1; this.S = 60; this.k = 1; this.groundY = 100; this.portrait = false; this.dpr = 1;
    this.ents = new Map(); this.tintCache = new Map(); this.scratch = document.createElement('canvas'); this.sctx = this.scratch.getContext('2d');
    this.draws = 0; this.times = []; this.captive = null; this.skyTop = '#0d0a18'; this.groundColor = '#2c2d30';
    this.resize();
  }
  resize() {
    const W = innerWidth, H = innerHeight; this.W = W; this.H = H; this.portrait = H > W;
    this.dpr = Math.min(devicePixelRatio || 1, ('ontouchstart' in window) ? 1.5 : 2);
    this.canvas.width = Math.round(W * this.dpr); this.canvas.height = Math.round(H * this.dpr);
    this.S = this.portrait ? W / 14 : W / 15;            // metres across: the 12 m arena always fits
    this.k = this.S / PPM; this.groundY = this.portrait ? H * 0.58 : H * 0.68;
  }
  // ------------------------------------------------------------------ loading
  async load(onProgress) {
    const steps = ['figures', 'fx', 'ui']; let done = 0; let ok = true;
    for (const n of steps) {
      try { const [meta, img] = await Promise.all([loadJson(`./assets/${n}.json`), loadImage(`./assets/${n}.png`)]); this[n] = { meta, img }; }
      catch (e) { console.warn('atlas failed', n, e); ok = false; }
      done++; if (onProgress) onProgress(done / (steps.length + 1));
    }
    this.ok = ok; return ok;
  }
  async loadStage(id) {
    if (this.stageCache.has(id)) { this.stage = this.stageCache.get(id); this.stageId = id; return !!this.stage; }
    let st = null;
    try { const [meta, img] = await Promise.all([loadJson(`./assets/stage_${id}.json`), loadImage(`./assets/stage_${id}.png`)]); st = { meta, img }; }
    catch (e) { console.warn('stage atlas failed', id, e); }
    this.stageCache.set(id, st); this.stage = st; this.stageId = id;
    if (st) {
      // sample the sky top and the ground colour so the areas the tiles do not cover match
      const c = document.createElement('canvas'); c.width = 4; c.height = 4; const x = c.getContext('2d');
      const far = st.meta.sprites.far; x.drawImage(st.img, far.x, far.y, 4, 2, 0, 0, 4, 2); let p = x.getImageData(0, 0, 1, 1).data; this.skyTop = `rgb(${p[0]},${p[1]},${p[2]})`;
      const g = st.meta.layers.ground; const t = g.tiles.find(Boolean); if (t) { const sp = st.meta.sprites[t.key]; x.drawImage(st.img, sp.x + 10, sp.y + sp.h - 3, 2, 2, 0, 2, 2, 2); p = x.getImageData(0, 2, 1, 1).data; this.groundColor = `rgb(${p[0]},${p[1]},${p[2]})`; }
    }
    return !!st;
  }
  buildWorld(s) {
    this.ents.clear(); this.camX = s.player.x + 1.5; this.snap = true; this.shake = 0;
    this.captive = s.stageId === 'hideout' ? { x: 124.2, z: 5.9, y: 0, facing: -1, state: 'idle', walking: false, speed: 1.6, flash: 0, t: 0, kind: 'captive', model: 'Captive', hp: 1 } : null;
    this.decorCount = s.stage.layout().length;
  }
  // ------------------------------------------------------------------ mapping
  sx(x) { return (x - this.camX) * this.S + this.W / 2; }
  sy(z, y = 0) { return this.groundY + z * SIN * this.S - y * COS * this.S; }
  updateCamera(s, dt) {
    const P = s.player; let want = s.lock ? (s.lock.min + s.lock.max) / 2 : Math.max(P.x + 1.4 * P.facing, s.progress - 1.5);
    want = Math.max(4.5, Math.min(s.stage.length - 5.5, want));
    if (this.snap) { this.camX = want; this.snap = false; } else this.camX += (want - this.camX) * (1 - Math.pow(0.02, dt));
    this.shake = Math.max(0, this.shake - dt * 3);
  }
  // ------------------------------------------------------------------ sprite helpers
  blit(img, fr, x, y, k, flip = false, rot = 0, alpha = 1, pivot = null) {
    const c = this.ctx; c.save(); c.translate(x, y); if (rot) c.rotate(rot); if (flip) c.scale(-1, 1); if (alpha < 1) c.globalAlpha = alpha;
    const px = pivot ? pivot[0] : fr.px, py = pivot ? pivot[1] : fr.py;
    c.drawImage(img, fr.x, fr.y, fr.w, fr.h, -px * k, -py * k, fr.w * k, fr.h * k); c.restore(); this.draws++;
  }
  tinted(img, fr, key, color, alpha) {
    const id = `${key}|${color}|${alpha}`; let cv = this.tintCache.get(id);
    if (!cv) {
      cv = document.createElement('canvas'); cv.width = fr.w; cv.height = fr.h; const x = cv.getContext('2d');
      x.drawImage(img, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = alpha; x.fillStyle = color; x.fillRect(0, 0, fr.w, fr.h);
      this.tintCache.set(id, cv);
    }
    return cv;
  }
  flashed(img, fr) {
    const sc = this.scratch; if (sc.width !== fr.w || sc.height !== fr.h) { sc.width = fr.w; sc.height = fr.h; }
    const x = this.sctx; x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, fr.w, fr.h);
    x.drawImage(img, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.85; x.fillStyle = '#ffffff'; x.fillRect(0, 0, fr.w, fr.h);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; return sc;
  }
  // ------------------------------------------------------------------ figure animation
  frameFor(e, fig, st, dt) {
    const A = fig.anims, F = fig.frames; const has = (a) => !!A[a];
    const pick = (a, i) => { const fr = A[a].frames; return fr[Math.max(0, Math.min(fr.length - 1, i))]; };
    const heavy = e.weapon && WEAPONS[e.weapon] && WEAPONS[e.weapon].heavy;
    st.t += dt;
    switch (e.state) {
      case 'walk': case 'idle': {
        const moving = e.walking && e.state === 'walk';
        if (moving) st.phase += dt * (e.speed || 2.4) * 2.4; else st.phase = 0;
        if (heavy && has('carry_walk')) return moving ? pick('carry_walk', Math.floor(st.phase) % 6) : pick('carry_idle', 0);
        return moving ? pick('walk', Math.floor(st.phase) % A.walk.frames.length) : pick('idle', Math.floor(st.t * A.idle.fps) % A.idle.frames.length);
      }
      case 'attack': {
        const m = e.move; let a = m ? m.anim : 'punchR'; if (!has(a)) a = has('punchR') ? 'punchR' : 'idle';
        const n = A[a].frames.length;
        if (e.phase === 'windup') return pick(a, 0);
        if (e.phase === 'active') { if (m && m.spray) return pick(a, 1 + (Math.floor(st.t * 16) % 2)); return pick(a, Math.min(1, n - 1)); }
        return pick(a, n - 1);
      }
      case 'hit': return pick('hit', e.t < 0.12 ? 1 : 0);
      case 'held': return pick('held', 0);
      case 'grab': return pick('grab', 0);
      case 'jump': case 'fall': return pick('jump', 0);
      case 'pickup': return pick('pickup', 0);
      case 'reload': return has('reload') ? pick('reload', 0) : pick('idle', 0);
      case 'down': return (e.y || 0) > 0.05 ? pick('fly', 0) : pick('lying', 0);
      case 'dead': return pick('dead', 0);
      case 'getup': return pick('getup', e.t > 0.15 ? 0 : 1);
      case 'thrown': return pick('thrown', Math.floor(st.t * 12) % 4);
      default: return pick('idle', 0);
    }
  }
  drawFigure(e, model, tint) {
    const fig = this.figures.meta.figures[model]; if (!fig) return;
    let st = this.ents.get(e); if (!st) { st = { phase: 0, t: 0, last: null, flip: e.facing < 0 }; this.ents.set(e, st); }
    const dt = this._dt;
    const fr = this.frameFor(e, fig, st, dt); st.last = fr;
    const F = fig.frames[fr]; const k = this.k * (e.scale || 1); const flip = e.facing < 0;
    const x = this.sx(e.x), y = this.sy(e.z, (e.y || 0) + (F.oy || 0));
    let alpha = 1;
    if (e.state === 'fall') alpha = Math.max(0.05, e.t / 0.9);
    if (e.state === 'dead' && e.t < 0.6 && Math.floor(e.t * 20) % 2) alpha = 0.15;
    const img = this.figures.img;
    if (e.flash > 0) { const sc = this.flashed(img, F); this.blit(sc, { x: 0, y: 0, w: F.w, h: F.h, px: F.px, py: F.py }, x, y + (e.state === 'fall' ? -this.sy(0, -2.2 * (1 - e.t / 0.9)) + this.groundY : 0), k, flip, 0, alpha); }
    else if (tint) { const cv = this.tinted(img, F, `${model}/${fr}`, tint, 0.45); this.blit(cv, { x: 0, y: 0, w: F.w, h: F.h, px: F.px, py: F.py }, x, y, k, flip, 0, alpha); }
    else this.blit(img, F, x, y + (e.state === 'fall' ? 2.2 * (1 - e.t / 0.9) * COS * this.S : 0), k, flip, 0, alpha);
    // weapon in hand: rotate the grip-left sprite to the arm angle exported with the frame
    const wk = e.weapon;
    if (wk && this.fx && !(WEAPONS[wk] && WEAPONS[wk].heavy) && e.state !== 'thrown') {
      const ws = this.fx.meta.sprites[WSPRITE[wk]]; if (ws) {
        const c = this.ctx; c.save(); c.translate(x, y); if (flip) c.scale(-1, 1);
        c.translate((F.hx - F.px) * k, (F.hy - F.py) * k); c.rotate(-F.ang * Math.PI / 180);
        c.drawImage(this.fx.img, ws.x, ws.y, ws.w, ws.h, -ws.px * k, -ws.py * k, ws.w * k, ws.h * k); c.restore(); this.draws++;
      }
    }
    if (wk && HEAVY[wk] && this.fx) {
      const hs = this.fx.meta.sprites[HEAVY[wk]]; if (hs) this.blit(this.fx.img, hs, x + (flip ? -1 : 1) * (F.cx - F.px) * k, y + (F.cy - F.py) * k, k, false);
    }
  }
  shadow(x, z, y, scale = 1) {
    if (!this.fx) return; const sh = this.fx.meta.sprites.shadow; if (!sh) return;
    const k = this.k * scale * Math.max(0.6, 1 - (y || 0) * 0.25);
    this.blit(this.fx.img, sh, this.sx(x), this.sy(z), k, false, 0, 0.55);
  }
  // ------------------------------------------------------------------ layers
  drawLayer(st, name, alpha = 1) {
    const L = st.meta.layers[name]; if (!L) return; const c = this.ctx; const k = this.k;
    if (alpha < 1) { c.save(); c.globalAlpha = alpha; }
    const top = this.groundY - L.s1 * this.S;
    for (let t = 0; t < L.tiles.length; t++) {
      const tile = L.tiles[t]; if (!tile) continue;
      const wx = L.x0 + t * L.tile_m; const x0 = this.sx(wx); if (x0 > this.W + 4 || x0 + L.tile_m * this.S < -4) continue;
      const sp = st.meta.sprites[tile.key];
      // snap tile edges to whole pixels so neighbouring tiles share an edge (no hairline seams at fractional scales)
      const dx = Math.round(x0 + tile.ox * k), dw = Math.round(x0 + (tile.ox + sp.w) * k) - dx;
      c.drawImage(st.img, sp.x, sp.y, sp.w, sp.h, dx, top + tile.oy * k, dw, sp.h * k); this.draws++;
    }
    if (alpha < 1) c.restore();
  }
  drawFar(st) {
    const c = this.ctx; const L = st.meta.layers.far; const sp = st.meta.sprites.far; const k = this.k;
    const top = this.groundY - L.s1 * this.S, h = sp.h * k, tw = sp.w * k;
    c.fillStyle = this.skyTop; c.fillRect(0, 0, this.W, Math.max(0, top + 1));
    let off = (this.camX * 0.4 * this.S) % tw; if (off < 0) off += tw;
    for (let x = -off - tw; x < this.W; x += tw) { c.drawImage(st.img, sp.x, sp.y, sp.w, sp.h, x, top, tw, h); this.draws++; }
    c.fillStyle = this.groundColor; c.fillRect(0, top + h - 1, this.W, this.H - (top + h) + 1);
  }
  drawAnim(st, name, s, list) {
    const A = st.meta.anims[name]; if (!A) return;
    A.at.forEach((pos, i) => {
      const [x, z] = pos; const sx = this.sx(x); if (sx < -12 * this.S || sx > this.W + 12 * this.S) return;
      let idx = Math.floor((this.time + i * 0.37) * A.fps) % A.frames.length; let dx = 0;
      if (name === 'spikewall') { const h = s.stage.hazards.find((h) => h.kind === 'spikewall' && x >= h.x0 - 1 && x <= h.x1 + 1); idx = !h || h.phase === 'idle' ? 0 : h.phase === 'telegraph' ? 1 : 3; if (h && h.phase === 'telegraph') dx = Math.sin(this.time * 40) * 2; }
      if (name === 'trapfloor') { const h = s.stage.hazards.find((h) => h.kind === 'trap' && x >= h.x0 - 1 && x <= h.x1 + 1); idx = h && h.open ? 2 : 0; }
      const f = A.frames[idx]; const sp = st.meta.sprites[f.key];
      list.push({ z: name === 'conveyor' || name === 'bridge' || name === 'trapfloor' ? -1 : z, x, draw: () => this.blit(st.img, { ...sp, px: f.px, py: f.py }, sx + dx, this.sy(z), this.k) });
    });
  }
  // ------------------------------------------------------------------ frame
  frame(s, dt, opts = {}) {
    this._dt = dt; this.time += dt; this.draws = 0;
    const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.imageSmoothingEnabled = true;
    if (!s) { c.fillStyle = '#0d0a18'; c.fillRect(0, 0, this.W, this.H); return; }
    this.updateCamera(s, dt);
    const sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.25 * this.S : 0;
    if (!this.ok || !this.stage) { this.fallback(s); return; }
    const st = this.stage; c.save(); c.translate(sh, sh * 0.5);
    this.drawFar(st);
    this.drawLayer(st, 'back');
    const flick = (Math.sin(this.time * 7.3) * Math.sin(this.time * 3.1) > 0.9) ? 0.3 : 1;
    this.drawLayer(st, 'neon', flick);
    const list = [];
    for (const n of ['spikewall', 'torch', 'brazier', 'waterfall']) this.drawAnim(st, n, s, list);
    list.sort((a, b) => a.z - b.z || a.x - b.x); for (const it of list) it.draw(); list.length = 0;
    this.drawLayer(st, 'ground');
    for (const n of ['conveyor', 'bridge', 'trapfloor']) this.drawAnim(st, n, s, list);
    list.sort((a, b) => a.z - b.z || a.x - b.x); for (const it of list) it.draw(); list.length = 0;
    // shadows
    const P = s.player;
    for (const e of [P, ...s.foes]) if ((e.alive || e.state === 'dead' || e.state === 'fall') && e.state !== 'fall') this.shadow(e.x, e.z, e.y, e.scale || 1);
    if (this.captive) this.shadow(this.captive.x, this.captive.z, 0, 1);
    for (const p of s.projectiles) this.shadow(p.x, p.z, p.y, 0.6);
    for (const bo of s.boulders) this.shadow(bo.x, bo.z, 0, 1.2);
    // depth-sorted sprites
    const fxs = this.fx ? this.fx.meta.sprites : {};
    list.push({ z: P.z, x: P.x, draw: () => this.drawFigure(P, s.hero === 'red' ? 'HeroRed' : 'HeroBlue', null) });
    for (const f of s.foes) { if (!(f.alive || f.state === 'dead' || f.state === 'fall')) continue; const def = FOES[f.kind]; list.push({ z: f.z, x: f.x, draw: () => this.drawFigure(f, def.model, f.elite ? GOLD : (def.tint ? '#8a3a2a' : null)) }); }
    if (this.captive) { const cp = this.captive; if (s.phase === 'clear' || s.phase === 'won') { cp.x += (P.x + 0.9 - cp.x) * (1 - Math.pow(0.3, dt)); cp.z += (P.z - cp.z) * (1 - Math.pow(0.3, dt)); cp.state = 'walk'; cp.walking = Math.abs(P.x + 0.9 - cp.x) > 0.1; cp.facing = cp.x > P.x ? -1 : 1; } list.push({ z: cp.z, x: cp.x, draw: () => this.drawFigure(cp, 'Captive', null) }); }
    for (const p of s.pickups) { const key = p.food ? 'Bun' : WSPRITE[p.kind]; const sp = fxs[key]; if (!sp) continue; const heavy = p.food || (WEAPONS[p.kind] && WEAPONS[p.kind].heavy); list.push({ z: p.z, x: p.x, draw: () => this.blit(this.fx.img, sp, this.sx(p.x), this.sy(p.z, p.food ? 0.05 + Math.sin(this.time * 4) * 0.04 : 0.04), this.k, false, heavy ? 0 : -0.25) }); }
    for (const p of s.projectiles) { const sp = fxs[WSPRITE[p.kind]]; if (!sp) continue; const heavy = WEAPONS[p.kind] && WEAPONS[p.kind].heavy; list.push({ z: p.z, x: p.x, draw: () => { const rot = p.kind === 'knife' ? this.time * 22 * Math.sign(p.vx) : this.time * 6 * Math.sign(p.vx); this.blit(this.fx.img, sp, this.sx(p.x), this.sy(p.z, p.y), this.k, false, rot, 1, heavy ? [sp.w / 2, sp.h / 2] : null); if (p.kind === 'dynamite' && fxs.spark_1) this.blit(this.fx.img, fxs.spark_1, this.sx(p.x), this.sy(p.z, p.y + 0.3), this.k * 0.6); } }); }
    for (const bo of s.boulders) { const sp = fxs.W_Boulder; if (!sp) continue; list.push({ z: bo.z, x: bo.x, draw: () => this.blit(this.fx.img, sp, this.sx(bo.x), this.sy(bo.z, 0.45), this.k, false, -(bo.rot || 0), 1, [sp.w / 2, sp.h / 2]) }); }
    // bullet tracers while the warlord sprays
    for (const f of s.foes) if (f.alive && f.state === 'attack' && f.move && f.move.spray && f.phase === 'active' && fxs.tracer) { for (let i = 0; i < 3; i++) { const d = ((this.time * 28 + i * 2.6) % 7.5); list.push({ z: f.z, x: f.x + f.facing * d, draw: () => this.blit(this.fx.img, fxs.tracer, this.sx(f.x + f.facing * (0.9 + d)), this.sy(f.z, 1.3), this.k, false, 0, 0.9) }); } }
    // effects
    for (const fx of s.effects) {
      if (fx._t0 === undefined) { fx._t0 = fx.t; if (fx.kind === 'boom') this.shake = Math.max(this.shake, 1.2); else if (fx.kind === 'rumble') this.shake = Math.max(this.shake, 0.7); else if (fx.big) this.shake = Math.max(this.shake, 0.5); }
      const anim = fx.kind === 'boom' ? 'boom' : fx.kind === 'muzzle' ? 'muzzle' : fx.kind === 'smash' ? 'smash' : fx.kind === 'heal' ? 'heal' : fx.kind === 'fall' || fx.kind === 'rumble' ? 'dust' : fx.big ? 'sparkbig' : 'spark';
      const frames = this.fx && this.fx.meta.anims[anim]; if (!frames) continue;
      const u = 1 - fx.t / fx._t0; const sp = fxs[frames[Math.min(frames.length - 1, Math.floor(u * frames.length))]];
      const scale = fx.kind === 'rumble' ? 1.6 : fx.kind === 'fall' ? 0.8 : 1;
      list.push({ z: fx.z + 0.01, x: fx.x, draw: () => this.blit(this.fx.img, sp, this.sx(fx.x), this.sy(fx.z, fx.y || 0), this.k * scale, fx.dir < 0, 0, fx.kind === 'muzzle' ? 1 : Math.min(1, 0.4 + fx.t / fx._t0)) });
    }
    list.sort((a, b) => a.z - b.z || a.x - b.x); for (const it of list) it.draw();
    this.drawLayer(st, 'fore');
    c.restore();
    // prune animation state for entities that are gone
    if (s.frames % 120 === 0) { const live = new Set([P, this.captive, ...s.foes]); for (const e of this.ents.keys()) if (!live.has(e)) this.ents.delete(e); }
  }
  pushTime(t0) { this.times.push(performance.now() - t0); if (this.times.length > 240) this.times.shift(); }
  perf() { const a = [...this.times].sort((x, y) => x - y); return { n: a.length, p50: a[Math.floor(a.length * 0.5)] || 0, p95: a[Math.floor(a.length * 0.95)] || 0, max: a[a.length - 1] || 0 }; }
  // ------------------------------------------------------------------ fallback: procedural boxes when an atlas fails
  fallback(s) {
    const c = this.ctx; c.fillStyle = '#0d0a18'; c.fillRect(0, 0, this.W, this.H);
    c.fillStyle = '#3a2a2a'; c.fillRect(0, this.groundY - 9 * COS * this.S, this.W, 9 * COS * this.S);
    c.fillStyle = '#2c2d30'; c.fillRect(0, this.groundY, this.W, this.H - this.groundY);
    const box = (e, col, w = 0.4, h = 1.75) => { const x = this.sx(e.x), y = this.sy(e.z, e.y || 0); c.fillStyle = col; const lying = e.state === 'down' || e.state === 'dead'; if (lying) c.fillRect(x - h * this.S / 2, y - w * this.S, h * this.S, w * this.S); else c.fillRect(x - w * this.S / 2, y - h * COS * this.S, w * this.S, h * COS * this.S); c.fillStyle = '#d9a880'; c.beginPath(); c.arc(x, y - (lying ? 0.2 : 1.6 * COS) * this.S, 0.12 * this.S, 0, 6.28); c.fill(); this.draws++; };
    const all = [{ e: s.player, col: s.hero === 'red' ? '#c8262e' : '#2455c8' }, ...s.foes.filter((f) => f.alive || f.state === 'dead').map((f) => ({ e: f, col: FIG_COLOR[FOES[f.kind].model] }))].sort((a, b) => a.e.z - b.e.z);
    for (const { e, col } of all) box(e, col);
    for (const p of s.pickups) { c.fillStyle = p.food ? '#f3e3c8' : '#c9a066'; c.fillRect(this.sx(p.x) - 6, this.sy(p.z) - 6, 12, 8); }
  }
  // ------------------------------------------------------------------ DOM skin from the UI atlas
  skin(el, key, scale = 1, opts = {}) {
    if (!this.ui) return false; const sp = this.ui.meta.sprites[key]; if (!sp || !el) return false;
    const aw = this.ui.meta.width * scale, ah = this.ui.meta.height * scale;
    el.style.backgroundImage = 'url(./assets/ui.png)'; el.style.backgroundSize = `${aw}px ${ah}px`; el.style.backgroundPosition = `${-sp.x * scale}px ${-sp.y * scale}px`; el.style.backgroundRepeat = 'no-repeat';
    if (!opts.keepSize) { el.style.width = `${sp.w * scale}px`; el.style.height = `${sp.h * scale}px`; }
    return true;
  }
  spriteSize(key) { const sp = this.ui && this.ui.meta.sprites[key]; return sp ? { w: sp.w, h: sp.h } : null; }
  digits(el, str, scale = 1) {
    if (!this.ui) { el.textContent = str; return; }
    el.textContent = ''; const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = str; el.appendChild(sr);
    const row = document.createElement('span'); row.className = 'digits';
    for (const ch of str) { const sp = this.ui.meta.sprites['glyph_' + ch]; if (!sp) continue; const d = document.createElement('i'); this.skin(d, 'glyph_' + ch, scale); row.appendChild(d); }
    el.appendChild(row);
  }
  frameName(e) { const st = this.ents.get(e); return st ? st.last : null; }
  samplePixels(x, y, w, h) {
    const d = this.dpr; const data = this.ctx.getImageData(Math.round(x * d), Math.round(y * d), Math.max(1, Math.round(w * d)), Math.max(1, Math.round(h * d))).data;
    const out = []; for (let i = 0; i < data.length; i += 4 * 7) out.push([data[i], data[i + 1], data[i + 2]]); return out;
  }
  screenOf(e) { return { x: this.sx(e.x), y: this.sy(e.z, e.y || 0) }; }
}
