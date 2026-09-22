// 雙截龍 · TWIN DRAGON — renderer, input, HUD, flow. All rules live in sim.js; this file only draws and listens.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGame, step, snap, skilledBot, useContinue, STAGES, FOES, WEAPONS, DT, LIVES, PLAYER_HP } from './sim.js';

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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const HFOV = 62;
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  // keep the horizontal field fixed so the 12 m arena always fits, portrait or landscape
  const v = 2 * Math.atan(Math.tan(HFOV * Math.PI / 360) / camera.aspect) * 180 / Math.PI;
  camera.fov = Math.min(105, v); camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ assets
const lib = {}; let assetsOk = false; let kitFoot = {};
async function loadAssets() {
  const loader = new GLTFLoader();
  try { kitFoot = (await (await fetch('./assets/kit.json')).json()).pieces || {}; } catch { kitFoot = {}; }
  const files = ['figures', 'weapons', 'kit']; let done = 0, allOk = true;
  for (const f of files) {
    try { const g = await loader.loadAsync(`./assets/${f}.glb`); for (const root of g.scene.children.slice()) lib[root.name] = root; }
    catch (e) { console.warn('asset load failed, using fallback for', f, e); allOk = false; }
    done++; $('loadBar').style.width = (done / files.length * 100) + '%';
  }
  assetsOk = allOk;
  const FALLBACK_COLOR = { W_Bat: 0xc9a066, W_Knife: 0xc8ccd0, W_Whip: 0x4a2a14, W_Dynamite: 0xc8302a, W_Gun: 0x2b2e33, W_Drum: 0x3a6ea5, W_Crate: 0xb58a4a, W_Boulder: 0x7d7a72, Bun: 0xf3e3c8, Marker: 0xf2c400 };
  for (const n of ['HeroBlue', 'HeroRed', 'Thug', 'Whip', 'Brute', 'Knife', 'Boss', 'Captive']) if (!lib[n]) lib[n] = fallbackFigure(n);
  for (const n of new Set([...Object.keys(kitFoot), ...Object.keys(FALLBACK_COLOR)])) if (!lib[n]) { const ft = kitFoot[n] || { w: 0.3, h: 0.3, d: 0.3 }; lib[n] = fallbackBox(n, [ft.w || 1, ft.h || 1, ft.d || 1], FALLBACK_COLOR[n] || 0x8a8a8a); }
}
function fallbackBox(name, [w, h, d], color = 0x8a8a8a) {
  const g = new THREE.Group(); g.name = name;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color })); m.position.y = h / 2; m.position.z = -d / 2; g.add(m); return g;
}
function fallbackFigure(name) {
  const g = new THREE.Group(); g.name = name;
  const col = { HeroBlue: 0x2455c8, HeroRed: 0xc8262e, Thug: 0x4f8a3a, Whip: 0xb2308f, Brute: 0xa8734f, Knife: 0x1a1a1d, Boss: 0x2f4a2a, Captive: 0xe9d1a2 }[name] || 0x888888;
  const mk = (pn, w, h, d, y, x = 0) => { const p = new THREE.Group(); p.name = `${name}_${pn}`; p.position.set(x, y, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: col })); m.position.y = -h / 2; p.add(m); g.add(p); return p; };
  mk('LegL', 0.14, 0.95, 0.14, 0.95, -0.1); mk('LegR', 0.14, 0.95, 0.14, 0.95, 0.1);
  const t = new THREE.Group(); t.name = `${name}_Torso`; t.position.y = 0.95; const tm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.56, 0.21), new THREE.MeshStandardMaterial({ color: col })); tm.position.y = 0.29; t.add(tm); g.add(t);
  const h = new THREE.Group(); h.name = `${name}_Head`; h.position.y = 1.55; const hm = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd9a880 })); hm.position.y = 0.1; h.add(hm); g.add(h);
  mk('ArmL', 0.1, 0.62, 0.1, 1.45, -0.235); mk('ArmR', 0.1, 0.62, 0.1, 1.45, 0.235);
  return g;
}
function inst(name) { const t = lib[name]; if (!t) return new THREE.Group(); const o = t.clone(true); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); return o; }
function findPart(root, suffix) { let r = null; root.traverse((o) => { if (!r && o.name.endsWith(suffix)) r = o; }); return r; }
function tintMaterial(root, matName, color) {
  root.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m, i) => { if (m.name === matName) { const c = m.clone(); c.color.set(color); if (Array.isArray(o.material)) o.material[i] = c; else o.material = c; } }); } });
}
function cloneMaterials(root) { root.traverse((o) => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); if (world) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => world.owned.push(m)); } }); }
function disposeFigure(fig) { fig.o.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }); }
function disposeWorld(w) { for (const m of w.owned) m.dispose(); w.owned.length = 0; }

// ------------------------------------------------------------------ world
let world = null; let shake = 0;
const SKY = {
  night: { bg: 0x0d0a18, fog: [0x0d0a18, 30, 90], hemi: [0x7f8fff, 0x2a1a30, 1.0], sun: [0xffc090, 0.8, [-10, 20, 30]], ground: 0x2c2d30, side: 0x8f8a80 },
  dusk: { bg: 0x3a2432, fog: [0x3a2432, 40, 110], hemi: [0xffb08a, 0x2b2540, 1.0], sun: [0xffa060, 1.3, [-30, 25, 40]], ground: 0x6e6a62, side: 0x55524c },
  day: { bg: 0x9fc7ea, fog: [0x9fc7ea, 50, 140], hemi: [0xffffff, 0x4a6a3a, 1.1], sun: [0xffffff, 1.6, [20, 60, 30]], ground: 0x8a7a55, side: 0x5f7a3a },
  indoor: { bg: 0x120e10, fog: [0x120e10, 25, 70], hemi: [0xffd6a0, 0x2a1a10, 0.9], sun: [0xffb070, 1.0, [-10, 20, 20]], ground: 0x4a4540, side: 0x3a3530 },
};
function buildWorld(s) {
  if (world) { scene.remove(world.group); disposeWorld(world); }
  const group = new THREE.Group(); scene.add(group);
  const st = s.stage; const cfg = SKY[st.sky] || SKY.night;
  scene.background = new THREE.Color(cfg.bg); scene.fog = new THREE.Fog(cfg.fog[0], cfg.fog[1], cfg.fog[2]);
  group.add(new THREE.HemisphereLight(cfg.hemi[0], cfg.hemi[1], cfg.hemi[2]));
  const sun = new THREE.DirectionalLight(cfg.sun[0], cfg.sun[1]); sun.position.set(...cfg.sun[2]); group.add(sun);
  // ground: strips with gaps at pits and the gorge (subdivided: big planes crossing the near plane render badly in software GL)
  const gaps = st.hazards.filter((h) => h.kind === 'pit' || h.kind === 'bridge').map((h) => [h.x0 - (h.kind === 'pit' ? 0.25 : 0), h.x1 + (h.kind === 'pit' ? 0.25 : 0)]).sort((a, b) => a[0] - b[0]);
  const gm = new THREE.MeshStandardMaterial({ color: cfg.ground, roughness: 0.95 }); const sm = new THREE.MeshStandardMaterial({ color: cfg.side, roughness: 0.95 });
  let x0 = -12; const segs = [];
  for (const g of gaps) { segs.push([x0, g[0]]); x0 = g[1]; } segs.push([x0, st.length + 14]);
  for (const [a, b] of segs) { if (b - a < 0.1) continue; const w = b - a; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 9, Math.ceil(w / 6), 3), gm); m.rotation.x = -Math.PI / 2; m.position.set((a + b) / 2, 0, 3.0); group.add(m);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.3, Math.ceil(w / 6), 1), sm); side.rotation.x = -Math.PI / 2; side.position.set((a + b) / 2, 0.012, -0.05); group.add(side); }
  const under = new THREE.Mesh(new THREE.PlaneGeometry(st.length + 40, 20, 8, 2), new THREE.MeshBasicMaterial({ color: 0x050308 })); under.rotation.x = -Math.PI / 2; under.position.set(st.length / 2, -2.5, 3); group.add(under);
  if (st.id === 'street') for (let x = -6; x < st.length + 10; x += 6) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.18), new THREE.MeshBasicMaterial({ color: 0xd8d0b0 })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.015, 5.6); group.add(m); }
  // decor
  const decor = [];
  for (const d of st.layout()) { const o = inst(d.kind); o.position.set(d.x, 0, d.z); o.rotation.y = d.yaw || 0; if (d.scale) o.scale.setScalar(d.scale); group.add(o); decor.push({ o, kind: d.kind, x: d.x }); }
  // hazard visuals
  const hz = [];
  for (const h of st.hazards) {
    if (h.kind === 'spikewall') { const pieces = decor.filter((d) => d.kind === 'SpikeWall' && Math.abs(d.x - (h.x0 + h.x1) / 2) < 1.5); hz.push({ h, pieces: pieces.map((p) => p.o), base: 0.9 }); }
    if (h.kind === 'trap') { const pieces = decor.filter((d) => d.kind === 'TrapFloor' && d.x > h.x0 - 1 && d.x < h.x1 + 1); hz.push({ h, pieces: pieces.map((p) => p.o) }); }
    if (h.kind === 'conveyor') { const belt = new THREE.Mesh(new THREE.PlaneGeometry(h.x1 - h.x0, 1.4, 12, 1), new THREE.MeshStandardMaterial({ color: 0x1f2022, roughness: 0.9 })); belt.rotation.x = -Math.PI / 2; belt.position.set((h.x0 + h.x1) / 2, 0.66, 2.9); group.add(belt); const arrows = []; for (let x = h.x0 + 0.5; x < h.x1; x += 1.2) { const a = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshBasicMaterial({ color: 0xf2c400 })); a.rotation.x = -Math.PI / 2; a.position.set(x, 0.675, 2.9); group.add(a); arrows.push(a); } hz.push({ h, arrows, x0: h.x0, x1: h.x1 }); }
  }
  // lamps glow at night
  if (st.sky === 'night' || st.sky === 'indoor') { let n = 0; for (const d of decor) { if ((d.kind === 'StreetLamp' || d.kind === 'Torch' || d.kind === 'Brazier') && n < 10) { const pl = new THREE.PointLight(d.kind === 'StreetLamp' ? 0xffd9a0 : 0xff9a40, d.kind === 'StreetLamp' ? 30 : 14, 18, 1.6); pl.position.set(d.x, d.kind === 'StreetLamp' ? 5.8 : 2.4, d.kind === 'StreetLamp' ? 1.9 : 1.2); group.add(pl); n++; } } }
  world = { group, decor, hz, foes: new Map(), pickups: new Map(), projectiles: new Map(), boulders: new Map(), effects: [], player: null, captive: null, cage: null, owned: [gm, sm] };
  const pf = inst(HEROES[s.hero].model); cloneMaterials(pf); group.add(pf); world.player = makeFigure(pf, 1);
  if (st.id === 'hideout') { const cage = decor.find((d) => d.kind === 'Cage'); if (cage) { const c = inst('Captive'); cloneMaterials(c); c.position.set(cage.x, 0, cage.o.position.z + 0.05); group.add(c); world.captive = makeFigure(c, 1); world.captive.o.rotation.y = Math.PI / 2 + 0.4; world.cage = cage.o; } }
  camX = s.player.x + 1.5; camSnap = true;
}
function makeFigure(o, scale) {
  const f = { o, body: new THREE.Group(), parts: {}, phase: 0, cur: {}, tgt: {}, weapon: null, weaponKind: null, carry: null };
  // re-parent everything under a body group so lying-down / spin poses don't fight the facing yaw
  const kids = o.children.slice(); for (const k of kids) { o.remove(k); f.body.add(k); } o.add(f.body);
  for (const k of ['LegL', 'LegR', 'ArmL', 'ArmR', 'Head', 'Torso']) f.parts[k] = findPart(f.body, '_' + k);
  o.scale.setScalar(scale || 1);
  return f;
}
const YAW_TILT = 0.38;   // face slightly toward the camera
const POSE = {
  idle: { ArmL: [0.55, 0, 0], ArmR: [0.75, 0, 0], LegL: [0, 0, 0], LegR: [0, 0, 0], Torso: [0.05, 0, 0], Head: [0, 0, 0] },
  hit: { ArmL: [-0.5, 0, 0.4], ArmR: [-0.5, 0, -0.4], Torso: [-0.35, 0, 0], Head: [-0.4, 0, 0], LegL: [0.2, 0, 0], LegR: [-0.2, 0, 0] },
  held: { ArmL: [0.6, 0, 0.8], ArmR: [0.6, 0, -0.8], Torso: [-0.2, 0, 0], Head: [-0.2, 0, 0], LegL: [0.1, 0, 0], LegR: [-0.1, 0, 0] },
  grab: { ArmL: [1.45, 0, 0], ArmR: [0.9, 0, 0], Torso: [0.15, 0, 0], Head: [0.1, 0, 0], LegL: [0.15, 0, 0], LegR: [-0.15, 0, 0] },
  jump: { ArmL: [-0.6, 0, 0.5], ArmR: [-0.6, 0, -0.5], LegL: [0.9, 0, 0], LegR: [0.4, 0, 0], Torso: [0.1, 0, 0], Head: [0, 0, 0] },
  reload: { ArmL: [1.1, 0, 0], ArmR: [0.5, 0, 0], Torso: [0.25, 0.4, 0], Head: [0.4, 0, 0], LegL: [0, 0, 0], LegR: [0, 0, 0] },
  pickup: { ArmL: [0.9, 0, 0], ArmR: [1.2, 0, 0], Torso: [0.7, 0, 0], Head: [0.3, 0, 0], LegL: [0.3, 0, 0], LegR: [-0.3, 0, 0] },
};
// attack poses: [windup pose, active pose] for the animating limbs; other limbs keep idle
const ATTACK = {
  punchL: [{ ArmL: [0.4, 0, 0.2], ArmR: [0.9, 0, 0], Torso: [0.05, 0.35, 0] }, { ArmL: [1.6, 0, 0], ArmR: [0.7, 0, 0], Torso: [0.1, -0.3, 0] }],
  punchR: [{ ArmR: [0.4, 0, -0.2], ArmL: [0.9, 0, 0], Torso: [0.05, -0.35, 0] }, { ArmR: [1.6, 0, 0], ArmL: [0.7, 0, 0], Torso: [0.1, 0.35, 0] }],
  kick: [{ LegR: [-0.5, 0, 0], LegL: [0.1, 0, 0], Torso: [0.1, 0, 0], ArmL: [0.8, 0, 0], ArmR: [0.3, 0, 0] }, { LegR: [1.45, 0, 0], LegL: [0.1, 0, 0], Torso: [-0.25, 0, 0], ArmL: [0.4, 0, 0], ArmR: [0.2, 0, 0] }],
  jumpkick: [{ LegR: [0.6, 0, 0], LegL: [0.7, 0, 0], Torso: [0.2, 0, 0], ArmL: [-0.4, 0, 0.4], ArmR: [-0.4, 0, -0.4] }, { LegR: [1.5, 0, 0], LegL: [0.7, 0, 0], Torso: [-0.2, 0, 0], ArmL: [-0.4, 0, 0.5], ArmR: [-0.6, 0, -0.5] }],
  elbow: [{ ArmR: [0.9, 0, -0.3], Torso: [0, 0.5, 0] }, { ArmR: [1.7, 0, -1.0], Torso: [0, 1.6, 0], Head: [0, 1.0, 0] }],
  headbutt: [{ Head: [-0.6, 0, 0], Torso: [-0.15, 0, 0], ArmL: [1.45, 0, 0], ArmR: [1.2, 0, 0] }, { Head: [0.7, 0, 0], Torso: [0.3, 0, 0], ArmL: [1.45, 0, 0], ArmR: [1.2, 0, 0] }],
  knee: [{ LegR: [-0.3, 0, 0], Torso: [0.1, 0, 0], ArmL: [1.45, 0, 0], ArmR: [1.3, 0, 0] }, { LegR: [1.8, 0, 0], Torso: [0.35, 0, 0], ArmL: [1.45, 0, 0], ArmR: [1.2, 0, 0] }],
  throw: [{ ArmL: [2.6, 0, 0.3], ArmR: [2.6, 0, -0.3], Torso: [-0.3, 0, 0], LegL: [-0.2, 0, 0] }, { ArmL: [1.4, 0, 0.3], ArmR: [1.4, 0, -0.3], Torso: [0.6, 0, 0], LegL: [0.4, 0, 0], LegR: [-0.3, 0, 0] }],
  weapon: [{ ArmR: [2.7, 0, -0.2], ArmL: [0.9, 0, 0], Torso: [-0.2, -0.4, 0] }, { ArmR: [0.9, 0, 0], ArmL: [0.6, 0, 0], Torso: [0.3, 0.4, 0] }],
  heave: [{ ArmL: [2.9, 0, 0.2], ArmR: [2.9, 0, -0.2], Torso: [-0.3, 0, 0] }, { ArmL: [1.5, 0, 0.2], ArmR: [1.5, 0, -0.2], Torso: [0.5, 0, 0] }],
  throwarm: [{ ArmR: [-0.9, 0, -0.3], ArmL: [1.0, 0, 0], Torso: [-0.1, -0.5, 0] }, { ArmR: [1.7, 0, 0], ArmL: [0.4, 0, 0], Torso: [0.25, 0.5, 0] }],
  pound: [{ ArmL: [2.9, 0, 0.3], ArmR: [2.9, 0, -0.3], Torso: [-0.3, 0, 0] }, { ArmL: [0.9, 0, 0.3], ArmR: [0.9, 0, -0.3], Torso: [0.8, 0, 0], LegL: [0.5, 0, 0], LegR: [-0.2, 0, 0] }],
  hug: [{ ArmL: [1.2, 0, 1.0], ArmR: [1.2, 0, -1.0], Torso: [0.1, 0, 0] }, { ArmL: [1.5, 0, 0.2], ArmR: [1.5, 0, -0.2], Torso: [0.3, 0, 0] }],
  gun: [{ ArmR: [1.35, 0, 0], ArmL: [1.1, 0, 0.3], Torso: [0.05, 0.15, 0] }, { ArmR: [1.55, 0, 0], ArmL: [1.2, 0, 0.3], Torso: [-0.05, 0.15, 0] }],
};
function setTgt(f, pose) { for (const k in f.parts) f.tgt[k] = pose[k] || POSE.idle[k] || [0, 0, 0]; }
function poseFigure(f, e, dt, s) {
  const o = f.o; const b = f.body;
  o.position.set(e.x, e.y || 0, e.z);
  const yaw = e.facing > 0 ? -Math.PI / 2 - YAW_TILT : Math.PI / 2 + YAW_TILT;
  o.rotation.y = yaw;
  let lying = 0, spin = 0, bodyY = 0;
  const st = e.state;
  const moving = e.walking && (st === 'walk' || st === 'idle');
  if (moving) f.phase += dt * (e.speed || 2.4) * 3.2; else f.phase *= Math.max(0, 1 - dt * 10);
  let pose = POSE.idle;
  if (st === 'walk' || st === 'idle' || st === 'getup' || st === 'pickup' || st === 'reload' || st === 'jump' || st === 'grab' || st === 'held' || st === 'hit' || st === 'fall') {
    pose = POSE[st] || POSE.idle;
    if (st === 'walk' || st === 'idle') { const a = moving ? Math.sin(f.phase) : Math.sin(f.phase) * 0.15; pose = { ...POSE.idle, LegL: [a * 0.75, 0, 0], LegR: [-a * 0.75, 0, 0], ArmL: [0.55 - a * 0.35, 0, 0], ArmR: [0.75 + a * 0.35, 0, 0], Torso: [moving ? 0.1 : 0.05, moving ? a * 0.08 : 0, 0] }; }
    if (st === 'jump' && (e.y || 0) < 0.15 && e.vy < 0) pose = POSE.idle;
    if (st === 'getup') { lying = Math.max(0, 1 - (0.3 - e.t) / 0.3); }
    if (st === 'fall') { bodyY = -2.2 * (1 - e.t / 0.9); pose = POSE.jump; }
  } else if (st === 'attack' && e.move) {
    const k = ATTACK[e.move.anim] || ATTACK.punchR;
    pose = e.phase === 'windup' ? { ...POSE.idle, ...k[0] } : e.phase === 'active' ? { ...POSE.idle, ...k[1] } : { ...POSE.idle, ...k[1] };
    if (e.phase === 'recovery') { const m = e.move; const u = Math.min(1, 1 - e.t / (m.recovery || 0.2)); const mix = {}; for (const key in pose) mix[key] = pose[key].map((v, i) => v + (POSE.idle[key][i] - v) * u); pose = mix; }
    if (e.move.spray && e.phase === 'active') { pose = { ...pose, ArmR: [1.5 + Math.sin(s.t * 60) * 0.06, 0, 0] }; }
  } else if (st === 'down' || st === 'dead') { lying = 1; pose = { ArmL: [0.3, 0, 0.9], ArmR: [0.3, 0, -0.9], LegL: [0.05, 0, 0.1], LegR: [0.05, 0, -0.1], Torso: [0, 0, 0], Head: [0.2, 0, 0] }; if ((e.y || 0) > 0.05) lying = 0.6; }
  else if (st === 'thrown') { spin = 1; pose = POSE.hit; }
  // apply with easing
  const rate = 1 - Math.pow(0.0005, dt);
  for (const k in f.parts) {
    const p = f.parts[k]; if (!p) continue;
    const t = pose[k] || POSE.idle[k] || [0, 0, 0]; const c = f.cur[k] || (f.cur[k] = [0, 0, 0]);
    for (let i = 0; i < 3; i++) c[i] += (t[i] - c[i]) * rate;
    p.rotation.set(c[0], c[1], c[2]);
  }
  // body: lying flat on the back (head away from the facing direction), spinning when thrown
  f.lie = (f.lie || 0) + ((lying) - (f.lie || 0)) * (1 - Math.pow(0.001, dt));
  if (spin) { f.spinA = (f.spinA || 0) + dt * 9; b.rotation.x = f.spinA; b.position.y = 0.6; }
  else { f.spinA = 0; b.rotation.x = f.lie * Math.PI / 2; b.position.y = f.lie * 0.28 + bodyY; }
  if (st === 'dead' && e.t < 0.6) { o.visible = Math.floor(e.t * 20) % 2 === 0; } else o.visible = true;
  // damage flash
  const flash = e.flash > 0;
  if (flash !== f.flashed) { f.flashed = flash; b.traverse((m) => { if (m.isMesh) { const ms = Array.isArray(m.material) ? m.material : [m.material]; ms.forEach((mm) => { if (flash) { mm.emissive = mm.emissive || new THREE.Color(); mm._em = mm._em ?? mm.emissiveIntensity; mm.emissive.set(0xffffff); mm.emissiveIntensity = 0.9; } else if (mm._em !== undefined) { mm.emissive.set(0x000000); mm.emissiveIntensity = mm._em; } }); } }); }
  // held weapon
  const wk = e.weapon || null;
  if (wk !== f.weaponKind) {
    if (f.weapon) { f.weapon.parent.remove(f.weapon); f.weapon = null; }
    f.weaponKind = wk;
    if (wk) {
      const heavy = WEAPONS[wk] && WEAPONS[wk].heavy;
      const w = inst(heavy ? (wk === 'drum' ? 'W_Drum' : 'W_Crate') : wk === 'gun' ? 'W_Gun' : 'W_' + wk[0].toUpperCase() + wk.slice(1));
      if (heavy) { w.position.set(0, 0.9, 0); f.parts.Torso.add(w); }
      else { w.position.set(0, -0.62, 0); w.rotation.set(Math.PI, 0, 0); if (wk === 'gun') { w.position.set(0, -0.6, 0.05); } f.parts.ArmR.add(w); }
      f.weapon = w;
    }
  }
  if (f.weapon && WEAPONS[wk] && WEAPONS[wk].heavy && st !== 'attack') { for (const k of ['ArmL', 'ArmR']) { const c = f.cur[k]; c[0] += (2.9 - c[0]) * rate; f.parts[k].rotation.x = c[0]; } }
}

// ------------------------------------------------------------------ camera
let camX = 0, camSnap = false;
function updateCamera(s, dt) {
  const P = s.player;
  let want;
  if (s.lock) want = (s.lock.min + s.lock.max) / 2;
  else want = Math.max(P.x + 1.4 * P.facing, s.progress - 1.5);
  want = Math.max(4.5, Math.min(s.stage.length - 5.5, want));
  if (camSnap) { camX = want; camSnap = false; } else camX += (want - camX) * (1 - Math.pow(0.02, dt));
  const sh = shake > 0 ? (Math.random() - 0.5) * shake * 0.25 : 0; shake = Math.max(0, shake - dt * 3);
  const portrait = camera.aspect < 1;
  camera.position.set(camX + sh, portrait ? 5.0 : 4.3, portrait ? 15.5 : 13.6);
  camera.lookAt(camX, 1.35 + sh * 0.5, 2.6);
}

// ------------------------------------------------------------------ sync sim -> scene
function ensure(map, key, make) { let e = map.get(key); if (!e) { e = make(); map.set(key, e); } return e; }
function foeFigure(f) {
  const def = FOES[f.kind]; const o = inst(def.model); cloneMaterials(o);
  if (def.tint) tintMaterial(o, 'Tank green', def.tint);
  if (f.elite) { for (const n of ['Brute pants', 'Leather', 'Leotard magenta', 'Tank green', 'Jeans']) tintMaterial(o, n, 0xd4a520); }
  world.group.add(o); return makeFigure(o, (f.scale || 1));
}
function syncWorld(s, dt) {
  poseFigure(world.player, s.player, dt, s);
  for (const f of s.foes) { if (!f.alive && f.state !== 'dead' && f.state !== 'fall') continue; const fig = ensure(world.foes, f, () => foeFigure(f)); poseFigure(fig, f, dt, s); fig.seen = s.frames; }
  for (const [f, fig] of world.foes) if (fig.seen !== s.frames) { world.group.remove(fig.o); disposeFigure(fig); world.foes.delete(f); }
  // pickups
  for (const p of s.pickups) {
    const o = ensure(world.pickups, p, () => { const n = p.food ? 'Bun' : (WEAPONS[p.kind] && WEAPONS[p.kind].heavy ? (p.kind === 'drum' ? 'W_Drum' : 'W_Crate') : 'W_' + p.kind[0].toUpperCase() + p.kind.slice(1)); const o = inst(n); if (!p.food && !(WEAPONS[p.kind] && WEAPONS[p.kind].heavy)) { o.rotation.z = -Math.PI / 2; o.position.y = 0.04; } world.group.add(o); return o; });
    o.position.x = p.x; o.position.z = p.z; if (p.food) o.position.y = 0.05 + Math.sin(s.t * 4) * 0.04; o.seen = s.frames;
  }
  for (const [p, o] of world.pickups) if (o.seen !== s.frames) { world.group.remove(o); world.pickups.delete(p); }
  // projectiles
  for (const p of s.projectiles) {
    const o = ensure(world.projectiles, p, () => { const o = inst(p.kind === 'knife' ? 'W_Knife' : p.kind === 'drum' ? 'W_Drum' : p.kind === 'crate' ? 'W_Crate' : 'W_Dynamite'); world.group.add(o); return o; });
    o.position.set(p.x, p.y, p.z); if (p.kind === 'knife') { o.rotation.z = -Math.sign(p.vx) * Math.PI / 2; o.rotation.x += dt * 25; } else { o.rotation.z += dt * 6 * Math.sign(p.vx); } o.seen = s.frames;
  }
  for (const [p, o] of world.projectiles) if (o.seen !== s.frames) { world.group.remove(o); world.projectiles.delete(p); }
  for (const bo of s.boulders) { const o = ensure(world.boulders, bo, () => { const o = inst('W_Boulder'); world.group.add(o); return o; }); o.position.set(bo.x, 0, bo.z); o.rotation.z = -(bo.rot || 0); o.seen = s.frames; }
  for (const [bo, o] of world.boulders) if (o.seen !== s.frames) { world.group.remove(o); world.boulders.delete(bo); }
  // effects
  for (const fx of s.effects) {
    if (fx._o) continue;
    const color = fx.kind === 'boom' ? 0xff8a2a : fx.kind === 'heal' ? 0x7dff4a : fx.kind === 'muzzle' ? 0xfff0a0 : fx.kind === 'smash' || fx.kind === 'rumble' ? 0xd0c0a0 : fx.big ? 0xffe12d : 0xffffff;
    const size = fx.kind === 'boom' ? 1.6 : fx.kind === 'rumble' ? 1.8 : fx.kind === 'smash' ? 0.9 : fx.big ? 0.75 : 0.45;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(fx.x, fx.y, fx.z + 0.3); m.rotation.z = Math.random() * 6.28; world.group.add(m); fx._o = m; fx._t0 = fx.t; world.effects.push(fx);
    if (fx.kind === 'boom' || fx.big || fx.kind === 'rumble') shake = Math.max(shake, fx.kind === 'boom' ? 1.2 : fx.kind === 'rumble' ? 0.7 : 0.5);
  }
  for (const fx of world.effects) { const u = fx.t / fx._t0; fx._o.material.opacity = Math.max(0, u); const sc = 1 + (1 - u) * 1.4; fx._o.scale.set(sc, sc, sc); fx._o.rotation.z += dt * 4; if (fx.t <= 0) { world.group.remove(fx._o); fx._o.geometry.dispose(); fx._o.material.dispose(); } }
  world.effects = world.effects.filter((fx) => fx.t > 0);
  // hazards
  for (const z of world.hz) {
    const h = z.h;
    if (h.kind === 'spikewall') { const out = h.phase === 'active' ? 1.3 : h.phase === 'telegraph' ? 0.15 + Math.sin(s.t * 40) * 0.05 : 0; for (const p of z.pieces) p.position.z += (z.base + out - p.position.z) * (1 - Math.pow(0.0001, dt)); }
    if (h.kind === 'trap') { const drop = h.open ? -0.35 : 0; for (const p of z.pieces) p.position.y += (drop - p.position.y) * (1 - Math.pow(0.001, dt)); }
    if (h.kind === 'conveyor') { for (const a of z.arrows) { a.position.x += h.push * dt; if (a.position.x < z.x0 + 0.2) a.position.x += (z.x1 - z.x0 - 0.4); } }
  }
  // culling: only decor near the camera
  for (const d of world.decor) d.o.visible = Math.abs(d.x - camX) < 34;
  // ending: the captive steps out of the cage once the warlord is down
  if (world.captive && s.phase !== 'play' && s.stageId === 'hideout' && (s.phase === 'clear' || s.phase === 'won')) { const c = world.captive; c.o.position.x += (s.player.x + 0.9 - c.o.position.x) * (1 - Math.pow(0.3, dt)); c.o.position.z += (s.player.z - c.o.position.z) * (1 - Math.pow(0.3, dt)); c.o.rotation.y = Math.PI / 2 + YAW_TILT; if (world.cage) world.cage.position.y += (-2.4 - world.cage.position.y) * (1 - Math.pow(0.2, dt)); poseFigure(c, { x: c.o.position.x, z: c.o.position.z, y: 0, facing: -1, state: 'walk', walking: true, speed: 1.6, flash: 0, t: 0 }, dt, s); }
  else if (world.captive) poseFigure(world.captive, { x: world.captive.o.position.x, z: world.captive.o.position.z, y: 0, facing: -1, state: 'idle', walking: false, flash: 0, t: 0 }, dt, s);
}

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
  const joy = $('joy'); const knob = $('knob'); let jid = null; const R = 60;
  const move = (t) => { const r = joy.getBoundingClientRect(); const dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2); const d = Math.hypot(dx, dy) || 1; const k = Math.min(1, d / R); knob.style.transform = `translate(${dx / d * k * 36}px,${dy / d * k * 36}px)`; touch.left = dx < -14; touch.right = dx > 14; touch.up = dy < -14; touch.down = dy > 14; };
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

// ------------------------------------------------------------------ flow
let sim = null, mode = 'menu', autoplay = params.has('auto'), paused = false, campaign = null, acc = 0, lastT = 0, introT = 0, endT = 0;
const stageOrder = STAGES.map((s) => s.id);
function unlocked(id) { if (params.has('all')) return true; const i = stageOrder.indexOf(id); return i === 0 || save.cleared.includes(stageOrder[i - 1]); }
function renderMenu() {
  const box = $('stages'); box.innerHTML = '';
  STAGES.forEach((st, i) => { const b = document.createElement('button'); b.className = 'stage'; b.dataset.id = st.id; b.disabled = !unlocked(st.id); b.innerHTML = `<span class="n">${i + 1}</span><b>${st.name}</b><i>${st.zh}</i>${save.cleared.includes(st.id) ? '<em>cleared</em>' : b.disabled ? '<em>locked</em>' : ''}`; b.addEventListener('click', () => { startCampaign(st.id); }); box.appendChild(b); });
  $('best').textContent = save.best ? `BEST ${save.best.toLocaleString()}` : '';
  for (const h of document.querySelectorAll('#heroes button')) h.classList.toggle('on', h.dataset.hero === hero);
}
let hero = 'blue';
function startCampaign(stageId) {
  campaign = { lives: LIVES, score: 0, continues: 3, hero };
  audio.unlock();
  if (stageId === 'street') { mode = 'intro'; introT = 0; $('intro').classList.add('show'); $('menu').classList.remove('show'); campaign.next = stageId; startStage(stageId); showOverlay(null); return; }
  startStage(stageId); mode = 'play'; $('menu').classList.remove('show'); showOverlay(null);
}
function startStage(id) {
  sim = createGame(id, { seed: (Date.now() % 100000) | 0, hero: campaign.hero, lives: campaign.lives, continues: campaign.continues, score: campaign.score });
  lastLog = 0; lastEv = 0; buildWorld(sim); document.body.classList.add('playing');
  $('stageName').textContent = `${stageOrder.indexOf(id) + 1} · ${sim.stage.name} ${sim.stage.zh}`;
  $('heroName').textContent = `${HEROES[campaign.hero].zh} ${HEROES[campaign.hero].name}`;
  banner(`STAGE ${stageOrder.indexOf(id) + 1}<small>${sim.stage.name} · ${sim.stage.zh}</small>`, 2.2);
}
function endStage() {
  campaign.lives = Math.min(5, sim.lives + 1); campaign.score = sim.score; campaign.continues = sim.continues;
  if (!save.cleared.includes(sim.stageId)) save.cleared.push(sim.stageId);
  save.best = Math.max(save.best, sim.score); writeSave(save);
  const i = stageOrder.indexOf(sim.stageId);
  if (i < stageOrder.length - 1) { startStage(stageOrder[i + 1]); mode = 'play'; }
  else { mode = 'ending'; endT = 0; $('ending').classList.add('show'); $('endScore').textContent = sim.score.toLocaleString(); }
}
function showOverlay(id, html) { for (const o of document.querySelectorAll('.center')) o.classList.remove('show'); if (id) { const el = $(id); if (html !== undefined) el.innerHTML = html; el.classList.add('show'); } }
function toMenu() { mode = 'menu'; sim = null; document.body.classList.remove('playing'); for (const o of document.querySelectorAll('.overlay, .center')) o.classList.remove('show'); $('menu').classList.add('show'); renderMenu(); if (world) { scene.remove(world.group); world = null; } }
function togglePause() { if (mode !== 'play') return; paused = !paused; showOverlay(paused ? 'pause' : null); }
let bannerT = 0;
function banner(html, t) { $('banner').innerHTML = html; $('banner').classList.add('show'); bannerT = t; }

// ------------------------------------------------------------------ HUD
function hud(s) {
  const P = s.player;
  $('hpBar').style.width = Math.max(0, P.hp / P.maxHp * 100) + '%'; $('hpBar').classList.toggle('low', P.hp <= 30);
  $('lives').textContent = '♥'.repeat(Math.max(0, s.lives)); $('score').textContent = s.score.toLocaleString().padStart(7, ' ');
  $('timer').textContent = String(Math.max(0, Math.ceil(s.timer))).padStart(2, '0'); $('timer').classList.toggle('low', s.timer < 15);
  const tgt = s.foes.find((f) => f.alive && f.flash > 0) || s.foes.find((f) => f.alive && f.hp < f.maxHp && !f.isBoss);
  if (tgt) { lastTgt = tgt; tgtT = 2.5; } tgtT -= 1 / 60;
  if (lastTgt && tgtT > 0 && lastTgt.alive) { $('foeHud').classList.add('show'); $('foeName').textContent = `${lastTgt.zh} ${lastTgt.name}`; $('foeBar').style.width = Math.max(0, lastTgt.hp / lastTgt.maxHp * 100) + '%'; } else $('foeHud').classList.remove('show');
  const boss = s.boss && s.boss.alive ? s.boss : null;
  $('bossHud').classList.toggle('show', !!boss); if (boss) { $('bossName').textContent = `${boss.zh} ${boss.name}`; $('bossBar').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%'; }
  $('go').classList.toggle('show', !s.lock && s.phase === 'play' && s.section < s.stage.sections.length - 1 && s.t > 1);
  $('weapon').textContent = P.weapon ? `${WEAPONS[P.weapon].name}${WEAPONS[P.weapon].uses > 1 ? ' ×' + P.uses : ''}` : '';
  if (s.msgT > 0 && s.msg && s.msg !== shownMsg) { shownMsg = s.msg; banner(s.msg.includes('!') ? s.msg : `<small>WARNING</small>${s.msg}`, 2.2); }
  if (bannerT > 0) { bannerT -= 1 / 60; if (bannerT <= 0) $('banner').classList.remove('show'); }
  if (DEBUG) $('debug').textContent = JSON.stringify(snap(s), null, 0).slice(0, 900);
}
let lastTgt = null, tgtT = 0, shownMsg = null;

// ------------------------------------------------------------------ main loop
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.5, (now - lastT) / 1000 || 0); lastT = now;   // a slow renderer (software GL) still gets real time: the sim is cheap, so up to 30 steps a frame
  if (mode === 'intro') { introT += dt; $('intro').style.setProperty('--t', introT); if (introT > 5.2 || keys.punch || touch.punch || keys.enter) { $('intro').classList.remove('show'); mode = 'play'; } }
  if (mode === 'ending') { endT += dt; if (sim) { acc += dt; let k = 0; while (acc >= DT && k < 30) { step(sim, {}, DT); acc -= DT; k++; } syncWorld(sim, dt); updateCamera(sim, dt); renderer.render(scene, camera); } if (endT > 14 || (endT > 2 && (keys.enter || keys.punch || touch.punch))) toMenu(); return; }
  if (mode !== 'play' || !sim) { if (sim && world) { syncWorld(sim, dt); updateCamera(sim, dt); renderer.render(scene, camera); } return; }
  if (!paused) {
    acc += dt; let n = 0;
    if (acc > DT * 30) acc = DT * 30;
    while (acc >= DT && n < 30) {
      const inp = autoplay ? skilledBot(sim) : readInput();
      const ph = sim.phase;
      step(sim, inp, DT); acc -= DT; n++;
      if (sim.player.state === 'attack' && sim.player.phase === 'windup' && sim.player.t === sim.player.move.windup - DT + 0 && lastPlayerAttack !== sim.player.move) { audio.play('swing'); }
      lastPlayerAttack = sim.player.state === 'attack' ? sim.player.move : null;
      if (sim.phase !== ph) onPhase(sim.phase);
      if (sim.phase === 'continue' && (inp.punch && !sim.prev.punch || keys.enter)) { useContinue(sim); showOverlay(null); }
    }
    audioFromEvents(sim, lastEv); lastEv = sim.events.length;
    if (sim.phase === 'continue') $('contN').textContent = Math.ceil(sim.continueT);
    if (sim.phase === 'lost') { if (keys.enter || keys.punch || touch.punch) toMenu(); }
    if (sim.phase === 'next') endStage();
    if (sim.phase === 'won') { endStage(); }
    hud(sim);
  }
  syncWorld(sim, paused ? 0 : dt); updateCamera(sim, dt); renderer.render(scene, camera);
}
function onPhase(ph) {
  if (ph === 'clear') { audio.play('clear'); showOverlay('clear', `<b>STAGE CLEAR</b><small>${sim.stage.zh} · bonus ${(1000 + Math.round(sim.timer) * 10).toLocaleString()}</small>`); }
  if (ph === 'continue') { audio.play('lose'); showOverlay('continue'); }
  if (ph === 'lost') { showOverlay('over', `<b>GAME OVER</b><small>score ${sim.score.toLocaleString()} · press PUNCH</small>`); save.best = Math.max(save.best, sim.score); writeSave(save); }
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
  $('pauseBtn').addEventListener('click', () => { if (mode === 'play') togglePause(); });
  $('muteBtn').addEventListener('click', () => { audio.on = !audio.on; $('muteBtn').textContent = audio.on ? 'SOUND: ON' : 'SOUND: OFF'; });
  $('overBtn').addEventListener('click', () => toMenu());
  $('skipIntro').addEventListener('click', () => { $('intro').classList.remove('show'); mode = 'play'; });
  await loadAssets();
  $('startNote').textContent = assetsOk ? 'Blender kit loaded · pick a stage' : 'Kit failed to load · using fallback boxes';
  document.body.classList.add('ready'); $('menu').classList.add('show'); renderMenu();
  const st = params.get('stage'); if (st && STAGES.some((s) => s.id === st)) { hero = params.get('hero') === 'red' ? 'red' : 'blue'; startCampaign(st); if (params.has('nointro')) { $('intro').classList.remove('show'); mode = 'play'; } }
  requestAnimationFrame(frame);
}
window.__td = {
  snap: () => ({ mode, assetsOk, autoplay, paused, camX: +camX.toFixed(2), captive: !!(world && world.captive), decor: world ? world.decor.length : 0, ...(sim ? snap(sim) : {}) }),
  start: (id, h) => { hero = h || hero; startCampaign(id); $('intro').classList.remove('show'); mode = 'play'; },
  autoplay: (v) => { autoplay = !!v; },
  drawCalls: () => renderer.info.render.calls, triangles: () => renderer.info.render.triangles,
  pivots: (name) => { const t = lib[name]; if (!t) return []; const r = []; t.traverse((o) => { if (/_(Torso|Head|ArmL|ArmR|LegL|LegR)$/.test(o.name)) r.push(o.name); }); return r; },
  foeTints: () => { if (!world) return []; return [...world.foes.values()].map((fig) => { const cols = new Set(); fig.o.traverse((m) => { if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => cols.add(mm.color.getHexString())); }); return [...cols]; }); },
  figurePose: () => { const f = world && world.player; if (!f) return null; const r = {}; for (const k in f.parts) if (f.parts[k]) r[k] = f.parts[k].rotation.x; r.lie = f.lie; r.y = f.o.position.y; return r; },
  step: (n) => { for (let i = 0; i < n; i++) step(sim, autoplay ? skilledBot(sim) : readInput(), DT); },
  useContinue: () => useContinue(sim),
  sim: () => sim,
};
boot();
