// 雙截龍 · TWIN DRAGON — all rules. No DOM, no three.js: this file runs unchanged in Node for the oracle.
// Units: metres, seconds. x = scroll axis (right is forward), z = depth (0 = back wall, larger = toward the camera),
// y = height. Fixed step: the caller steps at 1/60 s. Everything random goes through s.rng.

export const DT = 1 / 60;
export const ATTACK_TOKENS = 2;      // at most this many foes may be winding up / swinging at once
export const HIT_Z = 0.6;            // an attack connects when |dz| <= HIT_Z
// the oracle mutates these to prove its gates can fail; the game never touches them
export const CONFIG = { tokens: ATTACK_TOKENS, hitZ: HIT_Z, foeDmg: 1, playerDmg: 1, downFoe: 0.7, downPlayer: 0.9, buffer: 0.2 };
export const BAND = [0.8, 5.0];      // walkable depth band
export const PLAYER_HP = 120, LIVES = 3, CONTINUES = 3, STAGE_TIME = 99, CONTINUE_TIME = 10;
export const GRAVITY = 14, JUMP_V = 4.6, JUMP_RUN = 3.2;

// ------------------------------------------------------------------ rng
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ moves (ms in the tables, converted once)
const ms = (m) => ({ ...m, windup: m.windup / 1000, active: m.active / 1000, recovery: m.recovery / 1000 });
export const MOVES = {
  jab: ms({ name: 'Jab', dmg: 6, range: 0.9, windup: 80, active: 80, recovery: 150, kd: false, stagger: 0, kb: 0.25, anim: 'punchL' }),
  cross: ms({ name: 'Cross', dmg: 8, range: 0.9, windup: 90, active: 80, recovery: 180, kd: false, stagger: 0.9, kb: 0.3, anim: 'punchR' }),
  hook: ms({ name: 'Hook', dmg: 12, range: 1.0, windup: 120, active: 90, recovery: 250, kd: true, stagger: 0, kb: 0.9, anim: 'punchR' }),
  kick: ms({ name: 'Kick', dmg: 10, range: 1.1, windup: 140, active: 100, recovery: 260, kd: false, stagger: 0.5, kb: 0.4, anim: 'kick' }),
  jumpkick: ms({ name: 'Jump Kick', dmg: 16, range: 1.2, windup: 60, active: 260, recovery: 120, kd: true, stagger: 0, kb: 1.0, anim: 'jumpkick' }),
  elbow: ms({ name: 'Elbow', dmg: 12, range: 0.7, windup: 80, active: 80, recovery: 200, kd: true, stagger: 0, kb: 0.8, anim: 'elbow', back: true }),
  headbutt: ms({ name: 'Headbutt', dmg: 10, range: 0.8, windup: 100, active: 80, recovery: 200, kd: false, stagger: 0, kb: 0, anim: 'headbutt', grab: true }),
  knee: ms({ name: 'Knee', dmg: 14, range: 0.8, windup: 120, active: 80, recovery: 250, kd: false, stagger: 0, kb: 0, anim: 'knee', grab: true }),
  throw: ms({ name: 'Throw', dmg: 25, range: 0.8, windup: 200, active: 100, recovery: 500, kd: true, stagger: 0, kb: 0, anim: 'throw', grab: true, splash: 12 }),
};
export const FOOD = { bun: { name: 'Char Siu Bao', zh: '叉燒包', heal: 40 } };
export const WEAPONS = {
  bat: { name: 'Bat', dmg: 18, range: 1.3, uses: 8, melee: true, kd: true, kb: 0.9, windup: 0.15, active: 0.1, recovery: 0.3 },
  whip: { name: 'Whip', dmg: 14, range: 2.2, uses: 10, melee: true, kd: false, stagger: 0.6, kb: 0.4, windup: 0.2, active: 0.1, recovery: 0.32 },
  knife: { name: 'Knife', dmg: 12, range: 6, uses: 1, thrown: true, speed: 9, kd: true, windup: 0.15, active: 0.05, recovery: 0.3 },
  drum: { name: 'Oil Drum', dmg: 30, range: 4.5, uses: 1, thrown: true, heavy: true, speed: 7, kd: true, windup: 0.2, active: 0.05, recovery: 0.4 },
  crate: { name: 'Crate', dmg: 22, range: 4.5, uses: 1, thrown: true, heavy: true, speed: 7, kd: true, windup: 0.2, active: 0.05, recovery: 0.4 },
  dynamite: { name: 'Dynamite', dmg: 40, range: 5, uses: 1, thrown: true, speed: 7, fuse: 1.2, radius: 1.6, kd: true, windup: 0.15, active: 0.05, recovery: 0.3 },
};
export const FOE_MOVES = {
  jab: ms({ name: 'Jab', dmg: 5, range: 0.8, windup: 150, active: 100, recovery: 300, kd: false, kb: 0.2, anim: 'punchR' }),
  haymaker: ms({ name: 'Haymaker', dmg: 10, range: 0.9, windup: 300, active: 150, recovery: 450, kd: true, kb: 0.8, anim: 'punchR' }),
  pipe: ms({ name: 'Bat Swing', dmg: 12, range: 1.3, windup: 450, active: 150, recovery: 550, kd: true, kb: 0.9, anim: 'weapon' }),
  slash: ms({ name: 'Slash', dmg: 8, range: 0.9, windup: 200, active: 100, recovery: 300, kd: false, kb: 0.3, anim: 'punchR' }),
  knifethrow: ms({ name: 'Knife Throw', dmg: 8, range: 6, windup: 400, active: 100, recovery: 600, kd: true, kb: 0.5, anim: 'throwarm', projectile: 'knife' }),
  lash: ms({ name: 'Whip Lash', dmg: 10, range: 2.2, windup: 450, active: 120, recovery: 500, kd: false, kb: 0.4, anim: 'weapon' }),
  trip: ms({ name: 'Whip Trip', dmg: 8, range: 1.5, windup: 350, active: 100, recovery: 400, kd: true, kb: 0.6, anim: 'weapon' }),
  pound: ms({ name: 'Ground Pound', dmg: 16, range: 1.5, windup: 600, active: 200, recovery: 700, kd: true, kb: 1.2, anim: 'pound' }),
  bearhug: ms({ name: 'Bear Hug', dmg: 12, range: 1.0, windup: 400, active: 150, recovery: 500, kd: true, kb: 0.6, anim: 'hug', hold: 0.8 }),
  spray: ms({ name: 'Machine Gun', dmg: 6, range: 8, windup: 600, active: 1200, recovery: 600, kd: false, kb: 0.15, anim: 'gun', spray: 0.24, reload: 2.0, nostun: true }),
  butt: ms({ name: 'Rifle Butt', dmg: 18, range: 1.2, windup: 350, active: 150, recovery: 500, kd: true, kb: 1.0, anim: 'weapon' }),
};
export const FOES = {
  thug: { name: 'Thug', zh: '路痞', model: 'Thug', hp: 30, speed: 1.8, moves: ['jab', 'jab', 'haymaker'], standoff: 0.75, score: 100, drop: null },
  ganger: { name: 'Pipe Ganger', zh: '鐵管打手', model: 'Thug', tint: 0x8a3a2a, hp: 40, speed: 1.7, moves: ['pipe'], standoff: 1.1, score: 150, drop: 'bat', holds: 'bat' },
  knife: { name: 'Blade', zh: '擲刃手', model: 'Knife', hp: 25, speed: 2.0, moves: ['slash', 'knifethrow'], standoff: 0.75, keep: 4.0, score: 150, drop: 'knife', holds: 'knife', throwCd: 3.0 },
  whip: { name: 'Whip Dancer', zh: '鞭影', model: 'Whip', hp: 35, speed: 2.0, moves: ['lash', 'lash', 'trip'], standoff: 1.8, keep: 1.8, score: 200, drop: 'whip', holds: 'whip' },
  brute: { name: 'Ox', zh: '巨漢', model: 'Brute', hp: 70, speed: 1.3, moves: ['pound', 'bearhug'], standoff: 1.1, score: 400, drop: null, armor: true, nograb: true },
  boss: { name: 'Warlord Hei Gang', zh: '黑鋼', model: 'Boss', hp: 200, speed: 1.0, moves: ['spray', 'butt'], standoff: 1.0, keep: 5.0, score: 2000, drop: null, armor: true, nograb: true, boss: true, holds: 'gun' },
};
const ELITE = { hpMul: 1.5, scale: 1.12, score: 2 };

// ------------------------------------------------------------------ stages
// Each stage: length, sky, floor, band, sections (camera locks with spawn scripts), hazards, weapons on the ground,
// and a decor layout built from the Blender kit piece names (see blender/build_assets.py).
function layoutRng(seed) { return mulberry32(seed); }
function street() {
  const r = layoutRng(101), d = [];
  for (let x = -6; x < 132; x += 8) { const k = r() < 0.55 ? 'SlumWallA' : 'SlumWallB'; d.push({ kind: k, x: x + 4, z: 0, yaw: 0 }); if (r() < 0.25) { d[d.length - 1].kind = 'Garage'; d[d.length - 1].x = x + 3; d.push({ kind: 'ChainFence', x: x + 6, z: 0.3, yaw: 0 }); } }
  for (let x = 6; x < 126; x += 16) d.push({ kind: 'StreetLamp', x, z: 0.5, yaw: 0 });
  for (let x = 14; x < 126; x += 22) d.push({ kind: r() < 0.5 ? 'CarA' : 'CarB', x, z: 6.6, yaw: 0 });
  for (let x = 3; x < 126; x += 13) d.push({ kind: r() < 0.5 ? 'Dumpster' : 'TrashPile', x: x + r() * 4, z: 0.7, yaw: 0 });
  for (let x = 9; x < 126; x += 26) d.push({ kind: 'Hydrant', x, z: 6.0, yaw: 0 });
  for (let x = 20; x < 126; x += 31) d.push({ kind: 'NeonSign', x, z: 0.4, yaw: 0 });
  d.push({ kind: 'Billboard', x: 60, z: -1.5, yaw: 0 }); d.push({ kind: 'Billboard', x: 118, z: -1.5, yaw: 0 });
  return d;
}
function yard() {
  const r = layoutRng(202), d = [];
  for (let x = -6; x < 142; x += 8) d.push({ kind: r() < 0.6 ? 'FactoryWallA' : 'FactoryWallB', x: x + 4, z: 0, yaw: 0 });
  for (let x = 10; x < 136; x += 24) d.push({ kind: ['ContainerA', 'ContainerB', 'ContainerC'][Math.floor(r() * 3)], x, z: -0.3, yaw: 0 });
  d.push({ kind: 'Crane', x: 40, z: -1, yaw: 0 }); d.push({ kind: 'Crane', x: 104, z: -1, yaw: 0 });
  d.push({ kind: 'Smokestack', x: 22, z: -3, yaw: 0 }); d.push({ kind: 'Smokestack', x: 86, z: -3, yaw: 0 });
  d.push({ kind: 'Gantry', x: 66, z: -0.5, yaw: 0 });
  for (let x = 5; x < 136; x += 17) d.push({ kind: r() < 0.5 ? 'BarrelStack' : 'Barrier', x: x + r() * 3, z: 6.3, yaw: 0 });
  d.push({ kind: 'Truck', x: 120, z: 7.0, yaw: 0 });
  d.push({ kind: 'Conveyor', x: 50, z: 2.9, yaw: 0 }); d.push({ kind: 'Conveyor', x: 54, z: 2.9, yaw: 0 }); d.push({ kind: 'Conveyor', x: 58, z: 2.9, yaw: 0 });
  d.push({ kind: 'SpikePit', x: 74, z: 2.9, yaw: 0 });
  return d;
}
function ridge() {
  const r = layoutRng(303), d = [];
  for (let x = -6; x < 152; x += 8) d.push({ kind: (x > 60 && x < 84) ? 'Waterfall' : 'Cliff', x: x + 4, z: 0, yaw: 0 });
  for (let x = -2; x < 150; x += 5) if (!(x > 66 && x < 90)) d.push({ kind: ['TreeA', 'TreeB', 'TreeC'][Math.floor(r() * 3)], x: x + r() * 2, z: -0.8 - r() * 1.5, yaw: r() * 6.28 });
  for (let x = 2; x < 150; x += 7) if (!(x > 66 && x < 90)) d.push({ kind: r() < 0.5 ? 'Bush' : 'Rock', x: x + r() * 3, z: 6.0 + r() * 1.0, yaw: r() * 6.28 });
  for (let x = 12; x < 150; x += 23) if (!(x > 66 && x < 90)) d.push({ kind: r() < 0.5 ? 'Log' : 'Stump', x, z: 0.9, yaw: 0 });
  d.push({ kind: 'Gorge', x: 70, z: 2.9, yaw: 0 }); d.push({ kind: 'Gorge', x: 78, z: 2.9, yaw: 0 }); d.push({ kind: 'Gorge', x: 86, z: 2.9, yaw: 0 });
  for (let x = 68; x < 88; x += 4) d.push({ kind: 'Bridge', x: x + 2, z: 2.9, yaw: 0 });
  d.push({ kind: 'Hut', x: 132, z: 0.4, yaw: 0 });
  return d;
}
function hideout() {
  const r = layoutRng(404), d = [];
  for (let x = -6; x < 132; x += 8) d.push({ kind: r() < 0.5 ? 'StoneWallA' : 'StoneWallB', x: x + 4, z: 0, yaw: 0 });
  for (let x = 4; x < 128; x += 12) d.push({ kind: 'Pillar', x, z: 0.9, yaw: 0 });
  for (let x = 10; x < 128; x += 12) d.push({ kind: 'Torch', x, z: 0.3, yaw: 0 });
  for (let x = 16; x < 100; x += 36) d.push({ kind: 'Statue', x, z: 6.3, yaw: 0 });
  for (let x = 30; x < 110; x += 40) d.push({ kind: 'Door', x, z: 0.1, yaw: 0 });
  for (let x = 20; x < 120; x += 8) d.push({ kind: 'Carpet', x: x + 4, z: 2.9, yaw: 0 });
  d.push({ kind: 'SpikeWall', x: 45, z: 0.9, yaw: 0 }); d.push({ kind: 'SpikeWall', x: 91, z: 0.9, yaw: 0 });
  d.push({ kind: 'TrapFloor', x: 63, z: 1.85, yaw: 0 }); d.push({ kind: 'TrapFloor', x: 65, z: 1.85, yaw: 0 });
  d.push({ kind: 'Brazier', x: 108, z: 6.2, yaw: 0 }); d.push({ kind: 'Brazier', x: 122, z: 6.2, yaw: 0 });
  d.push({ kind: 'Throne', x: 120, z: 0.9, yaw: 0 }); d.push({ kind: 'Cage', x: 124, z: 6.0, yaw: 0 });
  return d;
}
export const STAGES = [
  { id: 'street', name: 'Dragon Street', zh: '龍城陋巷', length: 124, sky: 'night', floor: 'asphalt', band: BAND, layout: street,
    sections: [
      { x: 12, foes: [['thug', 2]] },
      { x: 34, foes: [['thug', 2], ['ganger', 1]] },
      { x: 58, foes: [['whip', 1], ['thug', 2]], weapons: [{ kind: 'drum', dx: 3 }] },
      { x: 82, foes: [['brute', 1], ['thug', 1]] },
      { x: 104, foes: [['ganger', 1], ['knife', 1], ['thug', 1]], weapons: [{ kind: 'dynamite', dx: -3 }] },
      { x: 118, boss: { type: 'brute', name: 'Ox Guo', zh: '牛哥', elite: true }, foes: [['thug', 1]], weapons: [{ kind: 'bat', dx: -4 }] },
    ], weapons: [{ kind: 'bat', x: 22, z: 3.6 }, { kind: 'crate', x: 70, z: 4.4 }], hazards: [] },
  { id: 'yard', name: 'Ironbone Freight Yard', zh: '鐵骨貨運廠', length: 134, sky: 'dusk', floor: 'concrete', band: BAND, layout: yard,
    sections: [
      { x: 12, foes: [['ganger', 2]] },
      { x: 34, foes: [['thug', 2], ['knife', 1]] },
      { x: 60, foes: [['brute', 1], ['thug', 2]], weapons: [{ kind: 'drum', dx: 4 }] },
      { x: 94, foes: [['whip', 1], ['ganger', 1], ['thug', 1]] },
      { x: 112, foes: [['knife', 2], ['thug', 1]], weapons: [{ kind: 'dynamite', dx: -3 }] },
      { x: 126, boss: { type: 'knife', name: 'Razor', zh: '刀疤', elite: true }, foes: [['ganger', 1], ['thug', 1]], weapons: [{ kind: 'drum', dx: -4 }] },
    ], weapons: [{ kind: 'bat', x: 40, z: 4.2 }, { kind: 'crate', x: 84, z: 4.4 }],
    hazards: [{ kind: 'conveyor', x0: 48, x1: 60, push: -0.7 }, { kind: 'pit', x0: 73.25, x1: 74.75, dmg: 20 }] },
  { id: 'ridge', name: 'Azure Ridge', zh: '蒼嶺懸崖', length: 144, sky: 'day', floor: 'dirt', band: BAND, layout: ridge,
    sections: [
      { x: 12, foes: [['thug', 2], ['knife', 1]] },
      { x: 36, foes: [['whip', 1], ['ganger', 1], ['thug', 1]] },
      { x: 56, foes: [['brute', 1], ['knife', 1]], weapons: [{ kind: 'crate', dx: -4 }] },
      { x: 104, foes: [['whip', 1], ['thug', 2], ['knife', 1]] },
      { x: 122, foes: [['knife', 2], ['ganger', 1]], weapons: [{ kind: 'dynamite', dx: 3 }] },
      { x: 138, boss: { type: 'whip', name: 'Viper Mei', zh: '毒蛇梅', elite: true }, foes: [['thug', 1], ['knife', 1]], weapons: [{ kind: 'bat', dx: -4 }] },
    ], weapons: [{ kind: 'bat', x: 22, z: 4.2 }],
    hazards: [{ kind: 'bridge', x0: 68, x1: 88, band: [2.0, 3.8], dmg: 25 }, { kind: 'boulder', x0: 108, x1: 132, period: 7, speed: 5, dmg: 18, z: 2.9, zTol: 0.9 }] },
  { id: 'hideout', name: 'Shadow Fang Hideout', zh: '影牙巢穴', length: 126, sky: 'indoor', floor: 'stone', band: BAND, layout: hideout,
    sections: [
      { x: 12, foes: [['ganger', 2], ['thug', 1]] },
      { x: 32, foes: [['knife', 2], ['whip', 1]] },
      { x: 56, foes: [['brute', 1], ['ganger', 1], ['thug', 1]], weapons: [{ kind: 'drum', dx: 4 }] },
      { x: 82, foes: [['whip', 1], ['knife', 1], ['thug', 2]] },
      { x: 104, foes: [['brute', 1], ['thug', 1], ['ganger', 1]], weapons: [{ kind: 'dynamite', dx: -3 }] },
      { x: 120, boss: { type: 'boss', name: 'Warlord Hei Gang', zh: '黑鋼', elite: false }, foes: [], weapons: [{ kind: 'bat', dx: -4 }] },
    ], weapons: [{ kind: 'bat', x: 22, z: 4.2 }, { kind: 'crate', x: 40, z: 4.4 }],
    hazards: [{ kind: 'spikewall', x0: 44, x1: 46, period: 4, telegraph: 0.8, active: 0.4, zmax: 2.6, dmg: 20 }, { kind: 'spikewall', x0: 90, x1: 92, period: 4, telegraph: 0.8, active: 0.4, zmax: 2.6, dmg: 20 },
      { kind: 'trap', x0: 62, x1: 66, zmax: 2.9, hold: 0.6, dmg: 15 }] },
];

// ------------------------------------------------------------------ state
let NEXT_ID = 1;
function ent(kind, x, z, extra) {
  return { id: NEXT_ID++, kind, x, z, y: 0, vy: 0, facing: 1, hp: 100, maxHp: 100, state: 'idle', t: 0, phase: null, move: null, hitDone: false,
    combo: 0, comboT: 0, weapon: null, uses: 0, held: null, holder: null, stagger: 0, invuln: 0, hitstop: 0, cd: 0, alive: true, speed: 2.4, walking: false,
    vx: 0, vz: 0, grabHits: 0, flash: 0, armor: false, ...extra };
}
export function createGame(stageId = 'street', opts = {}) {
  const stage = STAGES.find((st) => st.id === stageId) || STAGES[0];
  const idx = STAGES.indexOf(stage);
  const s = { stageId: stage.id, stage, stageIndex: idx, seed: opts.seed ?? 1987, rng: mulberry32((opts.seed ?? 1987) * 7919 + idx * 131),
    t: 0, frames: 0, phase: 'play', result: '', hero: opts.hero || 'blue', lives: opts.lives ?? LIVES, continues: opts.continues ?? CONTINUES, score: opts.score ?? 0,
    timer: STAGE_TIME, continueT: 0, clearT: 0, progress: 0, lock: null, section: -1, foes: [], pickups: [], projectiles: [], effects: [], log: [], events: [],
    hazardT: {}, boulders: [], bossAdds: false, kills: 0, hitsTaken: 0, hitsDealt: 0, prev: {}, msg: null, msgT: 0, deaths: 0 };
  NEXT_ID = 1;
  s.player = ent('player', 3, 2.9, { hp: PLAYER_HP, maxHp: PLAYER_HP, speed: 2.4, zspeed: 1.7 });
  for (const w of stage.weapons || []) s.pickups.push({ id: NEXT_ID++, kind: w.kind, x: w.x, z: w.z, uses: WEAPONS[w.kind].uses });
  return s;
}
function band(s) { const b = s.stage.band; for (const h of s.stage.hazards) if (h.kind === 'bridge' && s.player.x > h.x0 - 0.3 && s.player.x < h.x1 + 0.3) return h.band; return b; }
function bandAt(s, x) { const b = s.stage.band; for (const h of s.stage.hazards) if (h.kind === 'bridge' && x > h.x0 - 0.3 && x < h.x1 + 0.3) return h.band; return b; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ------------------------------------------------------------------ spawning
function spawnFoe(s, type, x, z, opts = {}) {
  const def = FOES[type];
  const mul = def.boss ? 1 : (1 + 0.06 * s.stageIndex) * (opts.elite ? ELITE.hpMul : 1);
  const hp = Math.round(def.hp * mul);
  const f = ent(type, x, z, { hp, maxHp: hp, speed: def.speed, zspeed: 1.4, def, armor: !!def.armor, elite: !!opts.elite, name: opts.name || def.name, zh: opts.zh || def.zh, boss: !!(def.boss || opts.elite),
    weapon: def.holds || null, uses: def.holds ? 99 : 0, ai: { side: s.rng() < 0.4 ? -1 : 1, cd: 0.4 + s.rng() * 0.8, throwCd: 1.0 + s.rng() * 1.5, hover: s.rng() * 6.28, restrain: 0 }, scale: opts.elite ? ELITE.scale : 1 });
  f.facing = x < s.player.x ? 1 : -1;
  s.foes.push(f); return f;
}
function openSection(s, i) {
  const sec = s.stage.sections[i];
  s.section = i; const cx = Math.min(s.player.x + 1, s.stage.length - 7); s.lock = { min: cx - 6, max: cx + 6 }; s.timer = STAGE_TIME;
  let side = 1;
  const b = bandAt(s, cx);
  for (const [type, n] of sec.foes) for (let k = 0; k < n; k++) { spawnFoe(s, type, side > 0 ? s.lock.max + 1.5 + s.rng() : s.lock.min - 1.5 - s.rng(), b[0] + 0.3 + s.rng() * (b[1] - b[0] - 0.6)); side = -side; }
  if (sec.boss) { const f = spawnFoe(s, sec.boss.type, s.lock.max + 2, (b[0] + b[1]) / 2, { elite: sec.boss.elite, name: sec.boss.name, zh: sec.boss.zh }); f.isBoss = true; s.boss = f; s.msg = `${sec.boss.name} ${sec.boss.zh}`; s.msgT = 2.5; }
  for (const w of sec.weapons || []) s.pickups.push({ id: NEXT_ID++, kind: w.kind, x: cx + w.dx, z: b[0] + 0.5 + s.rng() * (b[1] - b[0] - 1), uses: WEAPONS[w.kind].uses });
  s.events.push({ t: s.t, ev: 'section', i });
}

// ------------------------------------------------------------------ helpers
function alive(s) { return s.foes.filter((f) => f.alive); }
function inFront(a, b) { return (b.x - a.x) * a.facing > 0; }
function canAct(e) { return e.state === 'idle' || e.state === 'walk'; }
function busy(e) { return e.state === 'hit' || e.state === 'down' || e.state === 'getup' || e.state === 'held' || e.state === 'dead' || e.state === 'thrown' || e.state === 'fall'; }
function setState(e, st, t = 0) { e.state = st; e.t = t; e.walking = false; }
function startMove(e, move, phase = 'windup') { e.move = move; e.phase = phase; e.t = move.windup; e.hitDone = false; setStateKeep(e, 'attack'); }
function setStateKeep(e, st) { e.state = st; e.walking = false; }
function knockdown(e, dir, kb) { setState(e, 'down', e.kind === 'player' ? CONFIG.downPlayer : CONFIG.downFoe); e.move = null; e.phase = null; e.air = false; e.vx = dir * (kb || 0.8) * 3; e.vy = 2.2; e.y = Math.max(e.y, 0.01); e.combo = 0; e.stagger = 0; if (e.held) release(e); if (e.holder) releaseBy(e.holder); }
function release(g) { const h = g.held; if (h) { h.holder = null; if (h.state === 'held') setState(h, 'idle'); } g.held = null; g.grabHits = 0; if (g.state === 'grab') setState(g, 'idle'); }
function releaseBy(g) { release(g); }
function logHit(s, by, on, move, dmg, before) { if (s.log.length < 4000) s.log.push({ t: +s.t.toFixed(3), by: by.kind, on: on.kind, move: move.name, dmg, before, after: on.hp }); }

// damage application. dir = knockback direction (+1 right)
function hit(s, by, on, move, dir, opts = {}) {
  if (!on.alive || on.invuln > 0 || on.state === 'dead') return false;
  if (on.state === 'down' || on.state === 'getup' || on.state === 'fall') return false;
  let dmg = opts.dmg ?? move.dmg; if (by.kind !== 'player' && CONFIG.foeDmg !== 1) dmg = Math.round(dmg * CONFIG.foeDmg); if (by.kind === 'player' && CONFIG.playerDmg !== 1) dmg = Math.max(1, Math.round(dmg * CONFIG.playerDmg));
  const before = on.hp;
  on.hp = Math.max(0, on.hp - dmg);
  logHit(s, by, on, move, dmg, before);
  on.flash = 0.12; by.hitstop = Math.max(by.hitstop, 0.06); on.hitstop = Math.max(on.hitstop, 0.06);
  if (on.kind === 'player') { s.hitsTaken++; s.player.combo = 0; if (s.player.held) release(s.player); }
  else if (by.kind === 'player') { s.hitsDealt++; s.score += dmg * 10; }
  if (on.holder && on.holder !== by) release(on.holder);
  s.effects.push({ kind: 'spark', x: (by.x + on.x) / 2, z: on.z, y: 1.2 + (on.y || 0), t: 0.15, big: !!(move.kd || (dmg >= 14)) });
  if (on.hp <= 0) { die(s, on, dir, by); return true; }
  const kd = move.kd && !(opts.noKd);
  if (kd) knockdown(on, dir, move.kb);
  else if (move.nostun) { on.x += dir * 0.03; }
  else if (on.armor && !opts.force) { /* brute / boss shrug light hits */ on.x += dir * 0.05; if (on.kind !== 'player' && s.lock && on.entered) on.x = clamp(on.x, s.lock.min + 0.3, s.lock.max - 0.3); }
  else { setState(on, 'hit', on.kind === 'player' ? 0.3 : 0.35); on.move = null; on.phase = null; on.vx = dir * (move.kb || 0.3) * 3; if (move.stagger) on.stagger = move.stagger; if (on.held) release(on); }
  if (move.hold && on.kind === 'player' && on.hp > 0) { setState(on, 'held', move.hold); on.holder = by; by.held = on; by.hugT = move.hold; }
  return true;
}
function die(s, e, dir, by) {
  e.alive = e.kind === 'player'; // player "death" handled by lives
  if (e.kind === 'player') { playerDown(s, dir); return; }
  setState(e, 'dead', 1.4); e.vx = dir * 2.4; e.vy = 2.6; e.y = Math.max(e.y, 0.01); e.alive = false; if (e.held) release(e); if (e.holder) release(e.holder);
  s.kills++; const sc = Math.round(e.def.score * (e.elite ? ELITE.score : 1) * (by && by.kind === 'player' ? 1 : 0.5)); s.score += sc;
  if (e.def.drop && s.rng() < 0.75) s.pickups.push({ id: NEXT_ID++, kind: e.def.drop, x: e.x + dir * 0.6, z: e.z, uses: WEAPONS[e.def.drop].uses });
  s.events.push({ t: s.t, ev: 'kill', type: e.kind, by: by ? by.kind : 'hazard' });
  if (e.isBoss) { s.boss = null; }
}
function playerDown(s, dir) {
  const P = s.player; P.hp = 0; setState(P, 'dead', 2.0); P.vx = dir * 2; P.vy = 2.2; P.y = Math.max(P.y, 0.01); if (P.held) release(P); if (P.holder) release(P.holder); P.weapon = null;
  s.deaths++; s.events.push({ t: s.t, ev: 'playerdown', lives: s.lives });
}
function respawn(s) {
  const P = s.player; s.lives--;
  if (s.lives <= 0) { s.lives = 0; if (s.continues > 0) { s.phase = 'continue'; s.continueT = CONTINUE_TIME; } else { s.phase = 'lost'; s.result = 'game over'; } return; }
  P.hp = PLAYER_HP; setState(P, 'idle'); P.invuln = 2.0; P.y = 0; P.vy = 0; P.vx = 0; P.combo = 0; s.timer = STAGE_TIME;
  for (const f of alive(s)) { if (Math.abs(f.x - P.x) < 2.2) f.x += Math.sign(f.x - P.x || 1) * 2.0; f.ai.cd = Math.max(f.ai.cd, 1.0); }
}
export function useContinue(s) {
  if (s.phase !== 'continue') return false;
  s.continues--; s.lives = LIVES; s.phase = 'play'; const P = s.player; P.hp = PLAYER_HP; setState(P, 'idle'); P.invuln = 2.0; P.y = 0; P.vy = 0; s.timer = STAGE_TIME; P.alive = true;
  for (const f of alive(s)) { if (Math.abs(f.x - P.x) < 3) f.x += Math.sign(f.x - P.x || 1) * 2.5; f.ai.cd = 1.2; }
  return true;
}

// ------------------------------------------------------------------ player control
function pstart(s, P, m) { s.attacks = (s.attacks || 0) + 1; startMove(P, m); }
function playerControl(s, inp, dt) {
  const P = s.player; const b = band(s);
  const press = { punch: inp.punch && !s.prev.punch, kick: inp.kick && !s.prev.kick, jump: inp.jump && !s.prev.jump };
  if (P.state === 'grab') {
    const h = P.held; if (!h || !h.alive) { release(P); return; }
    P.t -= dt; if (P.t <= 0 || P.grabHits >= 3) { release(P); setState(h, 'hit', 0.3); h.vx = P.facing * 1.5; return; }
    if (press.punch) { pstart(s, P, MOVES.headbutt); }
    else if (press.kick) { pstart(s, P, MOVES.knee); }
    else if (press.jump) { pstart(s, P, MOVES.throw); }
    return;
  }
  // input buffer: a punch/kick/jump pressed during recovery or hitstun fires as soon as you are free (0.2 s window)
  if (P.buf) { P.buf.t -= dt; if (P.buf.t <= 0) P.buf = null; }
  if (P.state === 'attack' || busy(P) || P.state === 'pickup') { for (const k of ['punch', 'kick', 'jump']) if (press[k] && CONFIG.buffer > 0) P.buf = { k, t: CONFIG.buffer }; return; }
  if (P.buf) { press[P.buf.k] = true; P.buf = null; }
  // grab: punch next to a staggered foe you face
  if (press.punch) {
    const tgt = alive(s).find((f) => f.stagger > 0 && !f.def.nograb && Math.abs(f.x - P.x) <= 0.9 && Math.abs(f.z - P.z) <= CONFIG.hitZ && inFront(P, f) && !busy(f) && f.state !== 'attack');
    if (tgt) { P.held = tgt; tgt.holder = P; setState(tgt, 'held', 3); setState(P, 'grab', 2.5); P.grabHits = 0; tgt.stagger = 0; tgt.x = P.x + P.facing * 0.55; tgt.z = P.z; tgt.facing = -P.facing; s.events.push({ t: s.t, ev: 'grab', type: tgt.kind }); return; }
    // pick up a weapon
    if (!P.weapon) {
      const pk = s.pickups.find((p) => !p.food && Math.abs(p.x - P.x) <= 0.6 && Math.abs(p.z - P.z) <= 0.6);
      const foeNear = alive(s).some((f) => Math.abs(f.x - P.x) <= 1.0 && Math.abs(f.z - P.z) <= CONFIG.hitZ && inFront(P, f) && !busy(f));
      if (pk && !foeNear) { s.pickups.splice(s.pickups.indexOf(pk), 1); P.weapon = pk.kind; P.uses = pk.uses; setState(P, 'pickup', 0.25); s.events.push({ t: s.t, ev: 'pickup', kind: pk.kind }); return; }
    }
  }
  if (P.y > 0 || P.state === 'jump') {
    if (press.punch || press.kick) { pstart(s, P, MOVES.jumpkick); P.state = 'attack'; P.air = true; }
    return;
  }
  if (press.jump) { setState(P, 'jump'); P.vy = JUMP_V; P.y = 0.001; P.jumpDir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0); if (P.jumpDir) P.facing = P.jumpDir; return; }
  if (press.punch || press.kick) {
    // elbow: a foe right behind you
    const behind = alive(s).find((f) => !inFront(P, f) && Math.abs(f.x - P.x) <= 0.8 && Math.abs(f.z - P.z) <= CONFIG.hitZ && !busy(f));
    if (behind && press.punch) { pstart(s, P, MOVES.elbow); return; }
    if (P.weapon) {
      const w = WEAPONS[P.weapon];
      pstart(s, P, { ...MOVES.jab, name: w.name, dmg: w.dmg, range: w.range, windup: w.windup, active: w.active, recovery: w.recovery, kd: w.kd, stagger: w.stagger || 0, kb: w.kb || 0.8, anim: w.heavy ? 'heave' : w.thrown ? 'throwarm' : 'weapon', weapon: P.weapon, thrown: !!w.thrown });
      return;
    }
    if (press.kick) { pstart(s, P, MOVES.kick); return; }
    const m = P.combo === 0 ? MOVES.jab : P.combo === 1 ? MOVES.cross : MOVES.hook;
    pstart(s, P, m); return;
  }
  // walking
  let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), dz = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
  if (dx) P.facing = dx;
  P.walking = !!(dx || dz);
  P.state = P.walking ? 'walk' : 'idle';
  P.x += dx * P.speed * dt; P.z = clamp(P.z + dz * P.zspeed * dt, b[0], b[1]);
}

// ------------------------------------------------------------------ foe AI
function foeAI(s, f, dt) {
  const P = s.player, d = f.def, ai = f.ai; const b = bandAt(s, f.x);
  ai.cd -= dt; ai.throwCd -= dt; ai.hover += dt;
  if (!canAct(f) || f.frozen) return;
  if (P.state === 'dead' || s.phase !== 'play') { f.walking = false; f.state = 'idle'; return; }
  const dx = P.x - f.x, dz = P.z - f.z, adx = Math.abs(dx);
  const tokens = s.foes.filter((o) => o.alive && o.state === 'attack' && o.phase !== 'recovery').length;
  const playerDown = P.state === 'down' || P.state === 'getup' || P.state === 'fall' || P.state === 'dead';
  // face the player, keep a side
  let want = f.x, wantZ = P.z, keep = d.keep || 0;
  const standoff = d.standoff;
  if (d.boss) { // the warlord holds range and sprays, closes in only to butt when you are adjacent
    want = P.x + (dx > 0 ? -1 : 1) * 0; wantZ = P.z;
    if (adx < 4.5 && adx > 1.4) want = f.x; // hold
    else if (adx >= 4.5) want = P.x - Math.sign(dx) * 4.0;
  } else if (keep && (f.kind === 'knife' && ai.throwCd <= 0 || (f.kind === 'whip' && adx > 1.0))) {
    want = P.x - Math.sign(dx || 1) * keep; // hover at range (the whip dancer only backs off once pressed)
  } else {
    want = P.x - Math.sign(dx || 1) * standoff * (ai.side < 0 && f.kind === 'thug' ? -1 : 1);
    if (ai.side < 0 && f.kind === 'thug') { // flank: go around behind the player
      if (adx > 2.2) want = P.x - Math.sign(dx || 1) * standoff; // approach first
    }
  }
  // not inside the arena yet: walk in first, whatever the role says
  if (s.lock && !f.entered) want = f.x < s.lock.min ? s.lock.min + 1.6 : s.lock.max - 1.6;
  // hover jitter so groups don't stack
  wantZ = clamp(wantZ + Math.sin(ai.hover * 0.9 + f.id) * 0.35, b[0], b[1]);
  const inRangeX = adx <= (f.weapon && f.kind !== 'boss' ? (f.kind === 'ganger' ? 1.3 : f.kind === 'whip' ? 2.2 : 0.9) : d.boss ? 8 : 0.95) && Math.abs(dz) <= CONFIG.hitZ;
  const facingOk = (dx > 0 && f.facing > 0) || (dx < 0 && f.facing < 0);
  // attack decision
  if (!playerDown && ai.cd <= 0 && tokens < CONFIG.tokens && facingOk && P.state !== 'held' && P.state !== 'dead' && (f.entered || !s.lock)) {
    let mv = null;
    if (f.kind === 'knife') {
      if (ai.throwCd <= 0 && adx > 2.0 && adx <= 6 && Math.abs(dz) <= CONFIG.hitZ) { mv = FOE_MOVES.knifethrow; ai.throwCd = d.throwCd; }
      else if (adx <= 0.95 && Math.abs(dz) <= CONFIG.hitZ) mv = FOE_MOVES.slash;
    } else if (f.kind === 'whip') {
      if (adx <= 2.2 && Math.abs(dz) <= CONFIG.hitZ) mv = adx < 1.1 && s.rng() < 0.5 ? FOE_MOVES.trip : FOE_MOVES.lash;
    } else if (f.kind === 'brute') {
      if (adx <= 1.5 && Math.abs(dz) <= CONFIG.hitZ) mv = adx < 1.0 && s.rng() < 0.35 ? FOE_MOVES.bearhug : FOE_MOVES.pound;
    } else if (f.kind === 'boss') {
      if (adx <= 1.3 && Math.abs(dz) <= CONFIG.hitZ) mv = FOE_MOVES.butt;
      else if (adx <= 8 && adx > 1.3 && Math.abs(dz) <= 1.2) mv = FOE_MOVES.spray;
    } else if (f.kind === 'ganger') {
      if (adx <= 1.3 && Math.abs(dz) <= CONFIG.hitZ) mv = FOE_MOVES.pipe;
    } else {
      if (adx <= 0.95 && Math.abs(dz) <= CONFIG.hitZ) mv = FOE_MOVES[d.moves[Math.floor(s.rng() * d.moves.length)]];
    }
    if (mv) { startMove(f, mv); f.walking = false; ai.cd = 0.5 + s.rng() * 0.8 + (f.kind === 'brute' ? 0.4 : 0) + (f.kind === 'whip' ? 0.6 : 0) + (f.kind === 'ganger' ? 0.4 : 0); return; }
  }
  // movement
  const speed = d.speed * (playerDown ? 0.6 : 1);
  let mx = 0, mz = 0;
  if (playerDown) { want = P.x - Math.sign(dx || 1) * 1.6; }
  if (Math.abs(want - f.x) > 0.12) mx = Math.sign(want - f.x);
  if (Math.abs(wantZ - f.z) > 0.15) mz = Math.sign(wantZ - f.z);
  if (ai.restrain > 0) { ai.restrain -= dt; mx = 0; }
  // don't stack on other foes
  for (const o of s.foes) if (o !== f && o.alive && Math.abs(o.x - f.x) < 0.5 && Math.abs(o.z - f.z) < 0.4) { mz = mz || (o.z > f.z ? -1 : 1); mx = mx || (o.x > f.x ? -1 : 1); }
  f.x += mx * speed * dt; f.z = clamp(f.z + mz * f.zspeed * dt, b[0], b[1]);
  // walk in from off-screen, then never leave the arena (the player can't either)
  if (s.lock) { if (!f.entered && f.x > s.lock.min + 0.3 && f.x < s.lock.max - 0.3) f.entered = true; f.x = f.entered ? clamp(f.x, s.lock.min + 0.3, s.lock.max - 0.3) : clamp(f.x, s.lock.min - 3, s.lock.max + 3); }
  f.walking = !!(mx || mz); f.state = f.walking ? 'walk' : 'idle';
  if (dx !== 0 && !inRangeX) f.facing = Math.sign(dx); else if (dx !== 0) f.facing = Math.sign(dx);
}

// ------------------------------------------------------------------ attacks & timers
function resolveActive(s, e) {
  const m = e.move; if (!m || e.hitDone) return;
  e.hitDone = true;
  const dir = e.facing;
  if (m.grab) {
    const h = e.held; if (!h || !h.alive) { release(e); return; }
    if (m.name === 'Throw') {
      release(e); setState(h, 'thrown', 1.2); h.vx = dir * 5.5; h.vy = 3.6; h.y = 0.6; h.facing = -dir; h.thrower = e; h.throwDmg = m.dmg; h.splash = m.splash;
      s.events.push({ t: s.t, ev: 'throw', type: h.kind });
    } else {
      e.grabHits++; hit(s, e, h, m, dir, { force: true, noKd: true }); if (h.alive) { setState(h, 'held', 3); }
    }
    return;
  }
  if (m.projectile || m.thrown) {
    if (m.thrown && e.kind === 'player') { const w = WEAPONS[e.weapon]; s.projectiles.push({ kind: e.weapon, x: e.x + dir * 0.5, z: e.z, y: w.heavy ? 1.9 : 1.2, vx: dir * w.speed, vy: w.heavy ? 1.0 : 0.6, by: e, dmg: w.dmg, kd: w.kd, range: w.range, x0: e.x, fuse: w.fuse || 0, radius: w.radius || 0, hitIds: [] }); e.weapon = null; e.uses = 0; return; }
    if (m.projectile) { s.projectiles.push({ kind: 'knife', x: e.x + dir * 0.5, z: e.z, y: 1.2, vx: dir * 8, vy: 0.4, by: e, dmg: m.dmg, kd: m.kd, range: 6, x0: e.x, hitIds: [] }); return; }
  }
  if (m.spray) { e.sprayT = 0; return; }
  // melee: everyone in front within range and |dz| tolerance (thrown heavy hits several; melee hits the nearest, bat/pound hit all)
  const targets = e.kind === 'player' ? alive(s) : [s.player];
  const cands = targets.filter((o) => o !== e && o.alive && Math.abs(o.z - e.z) <= CONFIG.hitZ && ((m.back ? !inFront(e, o) : inFront(e, o)) || Math.abs(o.x - e.x) < 0.35) && Math.abs(o.x - e.x) <= m.range + (o.kind === 'brute' ? 0.2 : 0) && (o.y || 0) < 0.6 && !(o.state === 'down' || o.state === 'getup' || o.state === 'fall' || o.state === 'dead' || o.state === 'thrown'));
  cands.sort((a, bb) => Math.abs(a.x - e.x) - Math.abs(bb.x - e.x));
  const multi = m.name === 'Ground Pound' || m.weapon === 'bat' || m.weapon === 'whip' || m.name === 'Hook';
  let any = false;
  for (const o of multi ? cands : cands.slice(0, 1)) {
    const d = m.back ? -e.facing : e.facing;
    if (hit(s, e, o, m, d)) any = true;
  }
  if (e.kind === 'player') {
    if (any && !m.weapon) { e.combo = (m.name === 'Hook') ? 0 : (m.name === 'Jab' ? 1 : m.name === 'Cross' ? 2 : e.combo); e.comboT = 0.6; }
    else if (!any && !m.weapon && !m.back) e.combo = 0;
    if (m.weapon && any) { e.uses--; if (e.uses <= 0) { e.weapon = null; s.events.push({ t: s.t, ev: 'weaponbreak' }); } }
  }
}
function tickEntity(s, e, dt) {
  const b = e.kind === 'player' ? band(s) : bandAt(s, e.x);
  if (e.flash > 0) e.flash -= dt;
  if (e.invuln > 0) e.invuln -= dt;
  if (e.stagger > 0) e.stagger -= dt;
  if (e.comboT > 0) { e.comboT -= dt; if (e.comboT <= 0) e.combo = 0; }
  if (e.hitstop > 0) { e.hitstop -= dt; return; }
  // airborne / physics
  if (e.state === 'jump' || (e.y > 0 && e.state !== 'grab' && e.state !== 'held') || e.vy !== 0) {
    if (e.state === 'jump' || (e.state === 'attack' && e.air)) { e.x += (e.jumpDir || 0) * JUMP_RUN * dt; }
    e.y += e.vy * dt; e.vy -= GRAVITY * dt;
    if (e.state === 'thrown' || e.state === 'down' || e.state === 'dead' || e.state === 'hit') { e.x += e.vx * dt; e.vx *= (1 - 2.5 * dt); }
    if (e.y <= 0) {
      e.y = 0; e.vy = 0;
      if (e.state === 'jump') { setState(e, 'idle'); e.air = false; }
      else if (e.state === 'attack' && e.air) { e.air = false; e.phase = 'recovery'; e.t = 0.15; }
      else if (e.state === 'thrown') { landThrow(s, e); }
    }
  } else if (e.state === 'hit' || e.state === 'down' || e.state === 'dead') { e.x += e.vx * dt; e.vx *= (1 - 6 * dt); }
  // timers
  switch (e.state) {
    case 'attack': {
      const m = e.move; e.t -= dt;
      if (m.spray && e.phase === 'active') { e.sprayT -= dt; if (e.sprayT <= 0) { e.sprayT = m.spray; sprayShot(s, e, m); } }
      if (e.t <= 0) {
        if (e.phase === 'windup') { e.phase = 'active'; e.t = m.active; resolveActive(s, e); if (m.spray) e.sprayT = 0.02; }
        else if (e.phase === 'active') { if (e.air) { /* jump kick: stays active until landing */ e.t = 0.02; e.hitDone = false; resolveActive(s, e); } else { e.phase = 'recovery'; e.t = m.recovery; } }
        else { if (m.reload) { setState(e, 'reload', m.reload); } else if (m.grab && e.held && e.held.alive && e.state === 'attack') { e.state = 'grab'; e.t = 2.0; } else setState(e, 'idle'); e.move = null; e.phase = null; if (e.state === 'grab' && !e.held) setState(e, 'idle'); }
      }
      break; }
    case 'hit': e.t -= dt; if (e.t <= 0) setState(e, 'idle'); break;
    case 'held': e.t -= dt; if (!e.holder || !e.holder.alive || (e.holder.state !== 'grab' && e.holder.state !== 'attack' && !(e.holder.hugT > 0))) { e.holder && release(e.holder); setState(e, 'idle'); } else if (e.kind === 'player' && e.holder.hugT !== undefined) { e.holder.hugT -= dt; if (e.holder.hugT <= 0) { const g = e.holder; release(g); knockdown(e, g.facing, 0.6); } } else if (e.t <= 0) { e.holder && release(e.holder); setState(e, 'idle'); } break;
    case 'down': e.t -= dt; if (e.t <= 0 && e.y <= 0) { setState(e, 'getup', 0.3); e.invuln = Math.max(e.invuln, e.kind === 'player' ? 0.8 : 0.4); } break;
    case 'getup': e.t -= dt; if (e.t <= 0) setState(e, 'idle'); break;
    case 'pickup': e.t -= dt; if (e.t <= 0) setState(e, 'idle'); break;
    case 'reload': e.t -= dt; if (e.t <= 0) setState(e, 'idle'); break;
    case 'grab': if (e.kind !== 'player') { e.t -= dt; if (e.t <= 0) release(e); } break;
    case 'dead': e.t -= dt; break;
    case 'fall': e.t -= dt; if (e.t <= 0) { if (e.kind === 'player') { playerDown(s, e.facing); } else { e.state = 'gone'; } } break;
  }
  e.z = clamp(e.z, b[0], b[1]);
  if (e.kind !== 'player' && s.lock && e.entered) e.x = clamp(e.x, s.lock.min + 0.3, s.lock.max - 0.3);
}
function landThrow(s, e) {
  const dir = Math.sign(e.vx || 1);
  const th = e.thrower; const dmgMove = { name: 'Throw', dmg: e.throwDmg || 25, kd: true, kb: 0.4 };
  e.state = 'idle'; e.invuln = 0;
  if (th) { hit(s, th, e, dmgMove, dir, { force: true }); }
  if (e.alive || e.kind === 'player') { if (e.state !== 'dead') knockdown(e, dir, 0.3); }
  // splash on whoever it lands on
  const others = (th && th.kind === 'player') ? alive(s).filter((o) => o !== e) : [];
  for (const o of others) if (Math.abs(o.x - e.x) < 1.2 && Math.abs(o.z - e.z) <= CONFIG.hitZ) hit(s, th, o, { name: 'Throw Splash', dmg: e.splash || 12, kd: true, kb: 0.5 }, dir, { force: true });
}
function sprayShot(s, e, m) {
  const P = s.player; s.effects.push({ kind: 'muzzle', x: e.x + e.facing * 0.7, z: e.z, y: 1.3, t: 0.08, dir: e.facing });
  if (inFront(e, P) && Math.abs(P.x - e.x) <= m.range && Math.abs(P.z - e.z) <= CONFIG.hitZ && (P.y || 0) < 0.6) hit(s, e, P, m, e.facing, { noKd: true });
}

// ------------------------------------------------------------------ projectiles, pickups, hazards
function tickProjectiles(s, dt) {
  const P = s.player;
  for (const p of s.projectiles) {
    if (p.dead) continue;
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= (p.kind === 'knife' ? 1.5 : 9) * dt;
    const targets = p.by.kind === 'player' ? alive(s) : [P];
    for (const o of targets) {
      if (p.hitIds.includes(o.id) || o === p.by) continue;
      if (Math.abs(o.x - p.x) <= 0.45 && Math.abs(o.z - p.z) <= CONFIG.hitZ && p.y < 1.9 + (o.y || 0) && p.y > (o.y || 0) - 0.2) {
        if (p.kind === 'dynamite') { explode(s, p); break; }
        if (hit(s, p.by, o, { name: WEAPONS[p.kind] ? WEAPONS[p.kind].name : 'Knife', dmg: p.dmg, kd: p.kd, kb: 0.9 }, Math.sign(p.vx))) { p.hitIds.push(o.id); if (p.kind !== 'drum' && p.kind !== 'crate') { p.dead = true; if (p.kind === 'knife') s.pickups.push({ id: NEXT_ID++, kind: 'knife', x: p.x + Math.sign(p.vx) * 0.4, z: p.z, uses: 1 }); } }
      }
    }
    if (p.dead) continue;
    if (p.y <= 0 || Math.abs(p.x - p.x0) > p.range) {
      p.dead = true;
      if (p.kind === 'dynamite') explode(s, p);
      else if (p.kind === 'knife') s.pickups.push({ id: NEXT_ID++, kind: 'knife', x: p.x, z: p.z, uses: 1 });
      else if (p.kind === 'drum' || p.kind === 'crate') s.effects.push({ kind: 'smash', x: p.x, z: p.z, y: 0.3, t: 0.4 });
    }
  }
  s.projectiles = s.projectiles.filter((p) => !p.dead);
  // fuse dynamite lying around explodes too (thrown ones explode on landing)
}
function explode(s, p) {
  p.dead = true; s.effects.push({ kind: 'boom', x: p.x, z: p.z, y: 0.5, t: 0.5 });
  const all = [s.player, ...alive(s)];
  for (const o of all) if (Math.abs(o.x - p.x) <= p.radius && Math.abs(o.z - p.z) <= p.radius) hit(s, p.by, o, { name: 'Dynamite', dmg: p.dmg, kd: true, kb: 1.2 }, Math.sign(o.x - p.x || 1), { force: true });
}
function tickHazards(s, dt) {
  const P = s.player; const st = s.stage;
  for (const h of st.hazards) {
    const key = h.kind + h.x0; s.hazardT[key] = (s.hazardT[key] || 0) + dt;
    const all = [P, ...alive(s)];
    if (h.kind === 'conveyor') { for (const e of all) if (e.x > h.x0 && e.x < h.x1 && e.y <= 0 && e.state !== 'dead') e.x += h.push * dt; }
    if (h.kind === 'pit') { for (const e of all) if (e.x > h.x0 && e.x < h.x1 && e.y <= 0 && e.state !== 'fall' && e.state !== 'dead' && e.state !== 'jump' && !(e.state === 'attack' && e.air)) fall(s, e, h, e.x < (h.x0 + h.x1) / 2 ? h.x0 - 0.5 : h.x1 + 0.5); }
    if (h.kind === 'bridge') { for (const e of all) if (e.x > h.x0 && e.x < h.x1 && (e.z < h.band[0] - 0.05 || e.z > h.band[1] + 0.05) && e.state !== 'fall' && e.state !== 'dead') fall(s, e, h, h.x0 - 0.8); }
    if (h.kind === 'boulder') {
      const period = h.period; const ph = s.hazardT[key] % period;
      const room = P.x < h.x1 - 5 && P.x > h.x0 - 8;
      if (ph < dt && room && (s.lock ? (s.lock.min < h.x1 && s.lock.max > h.x0) : true)) { s.boulders.push({ x: h.x1 + 1, z: h.z, vx: -h.speed, r: 0.55, dmg: h.dmg, zTol: h.zTol, hitIds: [], id: NEXT_ID++ }); s.effects.push({ kind: 'rumble', x: h.x1 + 1, z: h.z, y: 0.6, t: 0.7 }); }
      for (const bo of s.boulders) {
        bo.x += bo.vx * dt; bo.rot = (bo.rot || 0) + bo.vx * dt / 0.5;
        for (const e of all) if (!bo.hitIds.includes(e.id) && Math.abs(e.x - bo.x) < 0.7 && Math.abs(e.z - bo.z) <= bo.zTol && e.y < 0.75 && e.state !== 'dead') { bo.hitIds.push(e.id); hit(s, { kind: 'hazard', x: bo.x, z: bo.z, hitstop: 0 }, e, { name: 'Boulder', dmg: bo.dmg, kd: true, kb: 1.1 }, Math.sign(bo.vx), { force: true }); }
      }
      s.boulders = s.boulders.filter((bo) => bo.x > h.x0 - 6);
    }
    if (h.kind === 'spikewall') {
      const ph = s.hazardT[key] % h.period; h.phase = ph < h.period - h.telegraph - h.active ? 'idle' : ph < h.period - h.active ? 'telegraph' : 'active';
      if (h.phase === 'active' && !h.done) { h.done = true; for (const e of all) if (e.x > h.x0 - 0.3 && e.x < h.x1 + 0.3 && e.z <= h.zmax && e.state !== 'dead' && e.y < 0.5) hit(s, { kind: 'hazard', x: e.x - 1, z: e.z, hitstop: 0 }, e, { name: 'Spike Wall', dmg: h.dmg, kd: true, kb: 1.4 }, 1, { force: true }); }
      if (h.phase !== 'active') h.done = false;
    }
    if (h.kind === 'trap') {
      h.stand = h.stand || {};
      for (const e of all) {
        const on = e.x > h.x0 && e.x < h.x1 && e.z <= h.zmax && e.y <= 0 && e.state !== 'jump' && e.state !== 'dead' && e.state !== 'fall';
        h.stand[e.id] = on ? (h.stand[e.id] || 0) + dt : 0;
        if (on && h.stand[e.id] >= h.hold) { h.stand[e.id] = 0; fall(s, e, h, e.x, h.zmax + 0.6); }
      }
      h.open = Object.values(h.stand).some((v) => v > 0.3);
    }
  }
}
function fall(s, e, h, backX, backZ) {
  if (e.state === 'fall') return;
  s.effects.push({ kind: 'fall', x: e.x, z: e.z, y: 0, t: 0.6 });
  if (e.kind === 'player') {
    const before = e.hp; e.hp = Math.max(0, e.hp - h.dmg); logHit(s, { kind: 'hazard' }, e, { name: h.kind === 'pit' ? 'Spike Pit' : h.kind === 'bridge' ? 'Gorge' : 'Trap Floor' }, h.dmg, before);
    e.fallBack = { x: backX, z: backZ ?? clamp(e.z, bandAt(s, backX)[0], bandAt(s, backX)[1]) }; setState(e, 'fall', 0.9); e.y = 0; e.vy = 0; e.vx = 0; if (e.held) release(e); if (e.holder) release(e.holder);
    s.events.push({ t: s.t, ev: 'fall', hazard: h.kind });
    if (e.hp <= 0) { e.t = 0.01; }
  } else { setState(e, 'fall', 0.7); e.alive = false; e.vx = 0; e.vy = 0; if (e.holder) release(e.holder); if (e.held) release(e); s.kills++; s.score += Math.round(e.def.score * 0.5); s.events.push({ t: s.t, ev: 'kill', type: e.kind, by: 'hazard' }); if (e.isBoss) s.boss = null; }
}

// ------------------------------------------------------------------ step
export function step(s, inp = {}, dt = DT) {
  if (s.phase === 'continue') { s.continueT -= dt; s.t += dt; s.frames++; if (s.continueT <= 0) { s.phase = 'lost'; s.result = 'game over'; } s.prev = { ...inp }; return s; }
  if (s.phase !== 'play') { s.t += dt; s.frames++; if (s.phase === 'clear') { s.clearT -= dt; if (s.clearT <= 0) { s.phase = s.stageIndex === STAGES.length - 1 ? 'won' : 'next'; } } return s; }
  const P = s.player; s.t += dt; s.frames++;
  if (s.msgT > 0) s.msgT -= dt;
  // stage timer
  s.timer -= dt; if (s.timer <= 0 && P.state !== 'dead') { s.timer = 0; playerDown(s, -1); s.events.push({ t: s.t, ev: 'timeout' }); }
  // input & AI
  if (P.state === 'fall') { /* falling: no control */ }
  else playerControl(s, inp, dt);
  for (const f of s.foes) if (f.alive) foeAI(s, f, dt);
  // entity ticks
  tickEntity(s, P, dt);
  for (const f of s.foes) if (f.alive || f.state === 'dead' || f.state === 'fall') tickEntity(s, f, dt);
  if (P.state === 'fall' && P.t <= 0) { if (P.hp > 0) { P.x = P.fallBack.x; P.z = P.fallBack.z; setState(P, 'idle'); P.invuln = 1.0; } }
  s.foes = s.foes.filter((f) => f.alive || ((f.state === 'dead' || f.state === 'fall') && f.t > 0));
  for (const pk of s.pickups) if (pk.food && Math.abs(pk.x - P.x) < 0.55 && Math.abs(pk.z - P.z) < 0.55 && P.state !== 'dead') { pk.eaten = true; const before = P.hp; P.hp = Math.min(P.maxHp, P.hp + FOOD[pk.kind].heal); s.score += 200; s.events.push({ t: s.t, ev: 'eat', heal: P.hp - before }); s.effects.push({ kind: 'heal', x: P.x, z: P.z, y: 1.6, t: 0.6 }); }
  s.pickups = s.pickups.filter((pk) => !pk.eaten);
  tickProjectiles(s, dt); tickHazards(s, dt);
  for (const fx of s.effects) fx.t -= dt; s.effects = s.effects.filter((fx) => fx.t > 0);
  // player death -> respawn
  if (P.state === 'dead' && P.t <= 0) respawn(s);
  // camera lock / sections
  const b = band(s);
  P.z = clamp(P.z, b[0], b[1]);
  if (s.lock) {
    P.x = clamp(P.x, s.lock.min + 0.4, s.lock.max - 0.4);
    if (alive(s).length === 0) { s.lock = null; s.events.push({ t: s.t, ev: 'clearsection', i: s.section }); if (s.section === 1 || s.section === 3) s.pickups.push({ id: NEXT_ID++, kind: 'bun', food: true, x: P.x + 3, z: 2.9 }); if (s.stage.sections[s.section] && s.stage.sections[s.section].boss) { s.phase = 'clear'; s.clearT = 3.0; s.score += 1000 + Math.round(s.timer) * 10; s.result = 'stage clear'; } }
  } else {
    s.progress = Math.max(s.progress, P.x);
    P.x = clamp(P.x, Math.max(0.5, s.progress - 7), s.stage.length - 0.5);
    const next = s.section + 1;
    if (next < s.stage.sections.length && P.x >= s.stage.sections[next].x - 9.0) openSection(s, next);
  }
  // boss adds
  if (s.boss && s.boss.alive && s.boss.kind === 'boss' && !s.bossAdds && s.boss.hp <= s.boss.maxHp * 0.5) { s.bossAdds = true; spawnFoe(s, 'thug', s.lock.min - 1, b[0] + 0.5); spawnFoe(s, 'thug', s.lock.max + 1, b[1] - 0.5); s.msg = 'Reinforcements!'; s.msgT = 1.5; }
  s.prev = { ...inp };
  return s;
}

// duel harness for the oracle: one foe of `type` in a locked arena, no sections/hazards
export function createDuel(type, opts = {}) {
  const s = createGame(opts.stageId || 'street', opts);
  s.stage = { ...s.stage, sections: [], hazards: [], weapons: [] }; s.pickups = [];
  s.player.x = 6; s.lock = { min: 0.5, max: 12.5 }; s.section = 0;
  const f = spawnFoe(s, type, 10.5, 2.9, { elite: !!opts.elite }); f.isBoss = !!(opts.elite || FOES[type].boss); s.boss = f.isBoss ? f : null;
  for (let k = 1; k < (opts.count || 1); k++) spawnFoe(s, type, 1.5 + k, 2.2 + k * 0.6, { elite: !!opts.elite });
  if (opts.weapon) { s.player.weapon = opts.weapon; s.player.uses = WEAPONS[opts.weapon].uses; }
  return s;
}
export function duel(type, opts = {}, maxT = 120) {
  const s = createDuel(type, opts);
  while (s.phase === 'play' && s.t < maxT && alive(s).length) step(s, skilledBot(s));
  return { won: alive(s).length === 0 && s.phase === 'play', t: +s.t.toFixed(1), hp: s.player.hp, deaths: s.deaths, taken: s.log.filter((h) => h.on === 'player').reduce((a, h) => a + h.dmg, 0), s };
}

// ------------------------------------------------------------------ snapshot
export function snap(s) {
  const P = s.player;
  return { phase: s.phase, result: s.result, stage: s.stageId, t: +s.t.toFixed(2), frames: s.frames, score: s.score, lives: s.lives, continues: s.continues, timer: Math.ceil(s.timer), section: s.section, lock: s.lock ? [s.lock.min, s.lock.max] : null,
    player: { x: +P.x.toFixed(2), z: +P.z.toFixed(2), y: +P.y.toFixed(2), hp: P.hp, state: P.state, phase: P.phase, move: P.move ? P.move.name : null, facing: P.facing, weapon: P.weapon, uses: P.uses, combo: P.combo, invuln: +P.invuln.toFixed(2) },
    foes: s.foes.filter((f) => f.alive).map((f) => ({ type: f.kind, x: +f.x.toFixed(2), z: +f.z.toFixed(2), hp: f.hp, state: f.state, move: f.move ? f.move.name : null, elite: f.elite })),
    boss: s.boss && s.boss.alive ? { name: s.boss.name, hp: s.boss.hp, max: s.boss.maxHp } : null,
    pickups: s.pickups.map((p) => p.kind), projectiles: s.projectiles.length, boulders: s.boulders.length, kills: s.kills, attacks: s.attacks || 0, hitsDealt: s.hitsDealt, hitsTaken: s.hitsTaken, deaths: s.deaths, log: s.log.length };
}

// ------------------------------------------------------------------ bots
export function idleBot() { return {}; }
export function skilledBot(s) {
  const inp = skilledBotRaw(s); const P = s.player;
  // hard constraint: never stand on the spiked side of a wall or on a trap slab, whatever the fight wants
  for (const h of s.stage.hazards) {
    if ((h.kind === 'spikewall' || h.kind === 'trap') && P.x > h.x0 - 1.6 && P.x < h.x1 + 1.6 && P.z <= h.zmax + 0.55) { inp.up = false; inp.down = true; if (P.z <= h.zmax + 0.1 && h.kind === 'trap') { inp.punch = inp.kick = false; } }
  }
  return inp;
}
function skilledBotRaw(s) {
  const P = s.player; const inp = {};
  if (s.phase !== 'play') return inp;
  if (busy(P) || P.state === 'pickup') return inp;
  const foes = alive(s).filter((f) => f.state !== 'gone');
  const b = band(s); const mid = (b[0] + b[1]) / 2;
  const bot = s._bot || (s._bot = { alt: 0, dodgeT: 0, dodgeDir: 0, offSide: 1, offT: 0 });
  bot.dodgeT -= DT; bot.offT -= DT;
  if (P.state === 'grab') { bot.alt++; if (P.grabHits < 2) inp.kick = bot.alt % 2 === 0; else inp.jump = true; return inp; }
  if (P.state === 'attack') return inp;
  const press = (k) => { inp[k] = !s.prev[k]; };
  const goZ = (dir) => { if (dir > 0) inp.down = true; else inp.up = true; };
  // choose the depth direction that gets away from z with the most room
  const awayDir = (fromZ) => (P.z >= fromZ ? (P.z + 0.9 <= b[1] ? 1 : -1) : (P.z - 0.9 >= b[0] ? -1 : 1));
  const dodge = (fromZ, t) => { bot.dodgeDir = awayDir(fromZ); bot.dodgeT = Math.max(bot.dodgeT, t); goZ(bot.dodgeDir); };
  // 0. an ongoing dodge keeps moving
  if (bot.dodgeT > 0 && bot.dodgeDir) { goZ(bot.dodgeDir); return inp; }
  // 1. incoming projectiles / boulders: sidestep in depth
  for (const p of s.projectiles) if (p.by !== P && Math.sign(p.vx) === Math.sign(P.x - p.x) && Math.abs(P.x - p.x) < 3.5 && Math.abs(p.z - P.z) < 0.9) { dodge(p.z, 0.3); return inp; }
  for (const bo of s.boulders) if (bo.x > P.x - 0.5 && bo.x - P.x < 6 && Math.abs(bo.z - P.z) < bo.zTol + 0.35) { dodge(bo.z, 0.2); return inp; }
  // 2. hazards in the current stretch
  for (const h of s.stage.hazards) {
    if (h.kind === 'spikewall' && P.x > h.x0 - 1.5 && P.x < h.x1 + 1.5 && P.z <= h.zmax + 0.5) { inp.down = true; if (P.z <= h.zmax + 0.4) return inp; }
    if (h.kind === 'trap' && P.x > h.x0 - 2 && P.x < h.x1 + 1 && P.z <= h.zmax + 0.5) { inp.down = true; if (P.z <= h.zmax + 0.4) return inp; }
  }
  // 3. threats: a foe mid-windup that can reach me. Hit first when I can (my jab lands in 80 ms), else sidestep.
  const threat = foes.filter((f) => f.state === 'attack' && f.phase === 'windup' && !f.move.projectile && inFront(f, P) && Math.abs(f.z - P.z) <= CONFIG.hitZ + 0.35 && Math.abs(f.x - P.x) <= f.move.range + 0.5).sort((a, c) => a.t - c.t)[0];
  if (threat) {
    const adx = Math.abs(threat.x - P.x), adz = Math.abs(threat.z - P.z);
    const canHitFirst = inFront(P, threat) && adx <= (P.weapon && !WEAPONS[P.weapon].thrown ? WEAPONS[P.weapon].range : 0.85) && adz <= CONFIG.hitZ && threat.t > 0.11 && !threat.move.spray;
    if (canHitFirst) { press('punch'); return inp; }
    if (Math.sign(threat.x - P.x) !== P.facing && adx <= 0.8 && adz <= CONFIG.hitZ && threat.t > 0.11) { press('punch'); return inp; } // elbow
    dodge(threat.z, threat.t + 0.05); return inp;
  }
  const boss = foes.find((f) => f.kind === 'boss');
  if (boss && boss.state === 'attack' && boss.move.spray && boss.phase !== 'recovery' && Math.abs(boss.z - P.z) < 0.95 && inFront(boss, P)) { dodge(boss.z, 0.2); return inp; }
  // 4. weapons: grab one if close and nobody is in my face
  if (!P.weapon && foes.length) {
    const pk = s.pickups.find((p) => !p.food && Math.abs(p.x - P.x) < 3 && !(p.kind === 'dynamite' && foes.length < 2) && (!s.lock || (p.x > s.lock.min + 0.5 && p.x < s.lock.max - 0.5)));
    const near = foes.some((f) => Math.abs(f.x - P.x) < 1.3 && Math.abs(f.z - P.z) <= CONFIG.hitZ && !busy(f));
    if (pk && !near) {
      if (Math.abs(pk.x - P.x) <= 0.5 && Math.abs(pk.z - P.z) <= 0.5) { press('punch'); return inp; }
      if (pk.x > P.x + 0.2) inp.right = true; else if (pk.x < P.x - 0.2) inp.left = true;
      if (pk.z > P.z + 0.2) inp.down = true; else if (pk.z < P.z - 0.2) inp.up = true;
      return inp;
    }
  }
  // 5. fight
  if (foes.length) {
    const PRIO = { whip: -1.2, ganger: -0.7, knife: -0.4, brute: 0.8, boss: 0.5 };
    const scored = foes.map((f) => ({ f, d: Math.abs(f.x - P.x) + Math.abs(f.z - P.z) * 1.5 + (f.state === 'down' || f.state === 'getup' || f.state === 'fall' ? 50 : 0) + (f.stagger > 0 && !f.def.nograb ? -1.5 : 0) + (PRIO[f.kind] || 0) })).sort((a, c) => a.d - c.d);
    // swarmed: two or more able foes at arm's length -> step back once so they string out
    bot.retreatCd = (bot.retreatCd || 0) - DT;
    const close = foes.filter((f) => Math.abs(f.x - P.x) < 1.7 && Math.abs(f.z - P.z) < 1.0 && !busy(f) && f.state !== 'attack');
    if (bot.retreatT > 0) { bot.retreatT -= DT; if (bot.retreatDir > 0) inp.right = true; else inp.left = true; goZ(bot.retreatZ); return inp; }
    if (close.length >= 2 && bot.retreatCd <= 0 && P.state !== 'attack') {
      const cx = close.reduce((a, f) => a + f.x, 0) / close.length, cz = close.reduce((a, f) => a + f.z, 0) / close.length;
      bot.retreatDir = P.x < cx ? -1 : 1; bot.retreatZ = awayDir(cz); bot.retreatT = 0.4; bot.retreatCd = 2.5;
      if (bot.retreatDir > 0) inp.right = true; else inp.left = true; goZ(bot.retreatZ); return inp;
    }
    const T = scored[0].f;
    const dx = T.x - P.x, dz = T.z - P.z, adx = Math.abs(dx), adz = Math.abs(dz);
    if (T.state === 'down' || T.state === 'getup') { if (adx < 1.0) { if (dx > 0) inp.left = true; else inp.right = true; } return inp; }
    const w = P.weapon ? WEAPONS[P.weapon] : null;
    const range = w ? (w.thrown ? (w.heavy ? 3.5 : 4.5) : w.range) : 0.85;
    // a foe right behind me: elbow
    if (!inFront(P, T) && adx <= 0.8 && adz <= CONFIG.hitZ && !busy(T)) { press('punch'); return inp; }
    // face the target
    if (Math.sign(dx) !== P.facing && adx > 0.25) { if (dx > 0) inp.right = true; else inp.left = true; return inp; }
    if (w && w.thrown) {
      if (adx <= range && adx > (P.weapon === 'dynamite' ? 2.6 : 1.0) && adz <= 0.35) { press('punch'); return inp; }
      if (adz > 0.3) goZ(Math.sign(dz));
      if (adx > range) { if (dx > 0) inp.right = true; else inp.left = true; }
      else if (adx <= 1.0) { if (dx > 0) inp.left = true; else inp.right = true; }
      return inp;
    }
    // armored foes (the ox, the warlord) shrug off jabs: bait a swing, then punish the recovery with a full combo
    if (T.armor && !w) {
      const open = (T.state === 'attack' && (T.phase === 'active' || T.phase === 'recovery') && !(T.move && T.move.spray && T.phase === 'active')) || T.state === 'reload' || T.state === 'hit';
      if (!open) {
        const isBoss = T.kind === 'boss';
        const spraying = isBoss && T.state === 'attack' && T.move && T.move.spray;
        const holdX = isBoss ? 1.7 : 1.95, off = spraying ? 1.05 : 0.3;
        const side = Math.sign(P.z - T.z) || 1;
        let wantZ = T.z + side * off;
        if (wantZ < b[0] + 0.05 || wantZ > b[1] - 0.05) wantZ = T.z - side * off;
        if (Math.abs(P.z - wantZ) > 0.1) goZ(Math.sign(wantZ - P.z));
        if (adx > holdX + 0.15) { if (dx > 0) inp.right = true; else inp.left = true; }
        else if (adx < holdX - 0.15) { if (dx > 0) inp.left = true; else inp.right = true; }
        return inp;
      }
      // punish: get in line and in reach, then punch
      if (adz > 0.4) goZ(Math.sign(dz));
      if (adx > 0.78) { if (dx > 0) inp.right = true; else inp.left = true; if (adx > 0.9) return inp; }
      if (adz <= CONFIG.hitZ) { inp.up = inp.down = false; press('punch'); }
      return inp;
    }
    // depth offset: fight from half a lane off the target's line so its swings can be sidestepped, but still inside my reach
    if (bot.offT <= 0) { bot.offSide = awayDir(T.z); bot.offT = 1.5; }
    const wantZ = clamp(T.z + bot.offSide * 0.45, b[0] + 0.05, b[1] - 0.05);
    if (Math.abs(P.z - wantZ) > 0.08) goZ(Math.sign(wantZ - P.z));
    if (adx > range * 0.9) { if (dx > 0) inp.right = true; else inp.left = true; return inp; }
    if (adx < 0.3 && (T.kind === 'brute' || T.kind === 'boss')) { if (dx > 0) inp.left = true; else inp.right = true; }
    if (adz <= CONFIG.hitZ && !busy(T)) {
      inp.up = inp.down = false;
      if (T.stagger > 0 && !T.def.nograb && adx <= 0.9) { press('punch'); return inp; } // grab
      bot.alt++;
      if (w) press('punch');
      else if (T.kind === 'brute' || T.kind === 'boss') press('punch');
      else press('punch');
    }
    return inp;
  }
  // 6. food when hurt
  if (P.hp < P.maxHp - 30) { const fd = s.pickups.find((p) => p.food && Math.abs(p.x - P.x) < 8 && (!s.lock || (p.x > s.lock.min + 0.5 && p.x < s.lock.max - 0.5))); if (fd) { if (fd.x > P.x + 0.15) inp.right = true; else if (fd.x < P.x - 0.15) inp.left = true; if (fd.z > P.z + 0.15) inp.down = true; else if (fd.z < P.z - 0.15) inp.up = true; return inp; } }
  // 7. travel right
  inp.right = true;
  if (P.z < mid - 0.3) inp.down = true; else if (P.z > mid + 0.3) inp.up = true;
  for (const h of s.stage.hazards) {
    if (h.kind === 'pit' && P.x > h.x0 - 0.45 && P.x < h.x0 - 0.05 && P.y <= 0) { press('jump'); }
    if (h.kind === 'bridge' && P.x > h.x0 - 4 && P.x < h.x1 + 1) { const m = (h.band[0] + h.band[1]) / 2; inp.up = inp.down = false; if (P.z < m - 0.2) inp.down = true; else if (P.z > m + 0.2) inp.up = true; }
    if (h.kind === 'spikewall' && P.x > h.x0 - 2.5 && P.x < h.x1 + 1.5) { inp.up = false; inp.down = P.z <= h.zmax + 0.6; }
    if (h.kind === 'trap' && P.x > h.x0 - 2.5 && P.x < h.x1 + 1) { inp.up = false; inp.down = P.z <= h.zmax + 0.6; }
  }
  return inp;
}
