// Mechanics oracle: node verify.mjs   (no browser; drives dist/sim.js directly)
// Positive half: the skilled bot clears every stage on five seeds without a continue, wins every 1v1 duel, and a
// full four-stage campaign. Negative half: the idle player loses every stage, and five mutations of the rules each
// break the gate that is supposed to catch them (a gate that cannot fail is not a gate).
import { createGame, createDuel, duel, step, snap, skilledBot, idleBot, useContinue, STAGES, FOES, MOVES, FOE_MOVES, WEAPONS, CONFIG, DT, LIVES } from './dist/sim.js';

const fails = [], notes = [];
const ok = (c, m) => { (c ? notes : fails).push((c ? 'PASS ' : 'FAIL ') + m); };
const SEEDS = [1, 2, 3, 4, 5];

function run(stageId, bot, opts = {}, maxT = 320, hook) {
  const s = createGame(stageId, opts);
  while (s.phase === 'play' && s.t < maxT) { step(s, bot(s), DT); if (hook) hook(s); }
  return s;
}

// 1. every stage: skilled clears without a continue on five seeds; idle loses
const times = {};
for (const st of STAGES) {
  for (const seed of SEEDS) {
    const s = run(st.id, skilledBot, { seed });
    const sn = snap(s);
    ok(sn.phase === 'clear' && sn.continues === 3, `${st.id} seed ${seed}: skilled bot clears the stage on its own lives (phase=${sn.phase} t=${sn.t} lives=${sn.lives} deaths=${sn.deaths} kills=${sn.kills} hp=${sn.player.hp})`);
    times[st.id] = Math.max(times[st.id] || 0, sn.t);
  }
  const s = run(st.id, idleBot, { seed: 1 }, 200);
  const sn = snap(s);
  ok(sn.phase === 'continue' || sn.phase === 'lost', `${st.id}: idle player loses all three lives (phase=${sn.phase} t=${sn.t} deaths=${sn.deaths})`);
}
ok(Object.values(times).every((t) => t < 300), `slowest skilled clear per stage under 300 s: ${JSON.stringify(times)}`);

// 2. the campaign: four stages back to back with carried lives (+1 per clear, cap 5) and score
for (const seed of [11, 12]) {
  let lives = LIVES, score = 0, continues = 3, won = false, total = 0;
  for (const st of STAGES) {
    const s = run(st.id, skilledBot, { seed, lives, score, continues });
    total += s.t;
    if (s.phase !== 'clear') break;
    lives = Math.min(5, s.lives + 1); score = s.score; continues = s.continues;
    while (s.phase === 'clear') step(s, {}, DT);
    won = s.phase === 'won';
  }
  ok(won && continues === 3, `campaign seed ${seed}: all four stages cleared in sequence without a continue (lives left ${lives}, score ${score}, ${Math.round(total)} s)`);
}

// 3. determinism: same seed + same bot => identical snapshots and hit logs
{
  const a = run('yard', skilledBot, { seed: 7 }, 70), b = run('yard', skilledBot, { seed: 7 }, 70);
  ok(JSON.stringify(snap(a)) === JSON.stringify(snap(b)) && JSON.stringify(a.log) === JSON.stringify(b.log), 'yard seed 7 is deterministic across two runs (snapshot + hit log identical)');
  const c = run('yard', skilledBot, { seed: 8 }, 70);
  ok(JSON.stringify(snap(a)) !== JSON.stringify(snap(c)), 'a different seed produces a different run');
}

// 4. damage audit: every logged hit matches the spec tables exactly
{
  const expected = (h) => {
    if (h.by === 'player') { const m = Object.values(MOVES).find((m) => m.name === h.move); if (m) return m.dmg; if (h.move === 'Throw Splash') return 12; const w = Object.values(WEAPONS).find((w) => w.name === h.move); if (w) return w.dmg; }
    else if (h.by === 'hazard') { return { 'Spike Pit': 20, Gorge: 25, 'Trap Floor': 15, Boulder: 18, 'Spike Wall': 20, Dynamite: 40 }[h.move]; }
    else { if (h.move === 'Knife') return FOE_MOVES.knifethrow.dmg; const m = Object.values(FOE_MOVES).find((m) => m.name === h.move); if (m) return m.dmg; if (h.move === 'Dynamite') return 40; }
    return undefined;
  };
  let checked = 0, bad = [];
  for (const st of STAGES) { const s = run(st.id, skilledBot, { seed: 3 }); for (const h of s.log) { const e = expected(h); checked++; if (e === undefined || e !== h.dmg) bad.push(`${h.by}/${h.move}=${h.dmg} (spec ${e})`); if (h.after < 0 || h.after > h.before) bad.push('hp out of range ' + JSON.stringify(h)); } }
  ok(checked > 300 && bad.length === 0, `damage audit: ${checked} logged hits match the spec tables (${bad.slice(0, 4).join(' | ')})`);
}

// 5. attack tokens: never more than two foes winding up or swinging at once; entered foes never leave the arena
{
  let maxAtOnce = 0, escaped = 0, ticks = 0;
  const hook = (s) => { ticks++; const n = s.foes.filter((f) => f.alive && f.state === 'attack' && f.phase !== 'recovery').length; maxAtOnce = Math.max(maxAtOnce, n); if (s.lock) for (const f of s.foes) if (f.alive && f.entered && (f.x < s.lock.min + 0.29 || f.x > s.lock.max - 0.29)) escaped++; };
  run('hideout', skilledBot, { seed: 2 }, 320, hook); run('street', skilledBot, { seed: 4 }, 320, hook);
  ok(maxAtOnce <= CONFIG.tokens && maxAtOnce > 0, `attack tokens respected: at most ${maxAtOnce} foes attacking at once over ${ticks} ticks (cap ${CONFIG.tokens})`);
  ok(escaped === 0, `no foe that entered the arena ever left it (${escaped} escaped ticks)`);
}

// 6. duels: the bot beats every archetype one on one, and the elite versions
for (const type of Object.keys(FOES)) {
  const rows = SEEDS.map((seed) => duel(type, { seed }));
  if (type === 'boss') ok(rows.every((r) => r.won && r.deaths <= 1), `duel vs the warlord bare-handed: 5/5 wins losing at most one life (${rows.map((r) => `t=${r.t} taken=${r.taken} deaths=${r.deaths}`).join(', ')})`);
  else ok(rows.every((r) => r.won && r.deaths === 0), `duel vs ${type}: 5/5 wins without dying (${rows.map((r) => `t=${r.t} taken=${r.taken}`).join(', ')})`);
}
for (const type of ['brute', 'knife', 'whip']) { const rows = [1, 2, 3].map((seed) => duel(type, { seed, elite: true })); ok(rows.every((r) => r.won && r.deaths === 0), `duel vs elite ${type}: 3/3 wins (${rows.map((r) => `t=${r.t} hp=${r.hp}`).join(', ')})`); }

// 7. knockdown timing: enemy 0.7 s (42 ticks ±1), player 0.9 s (54 ticks ±1)
function hookDownTicks() { // jab, cross, hook on a frozen dummy; count the ticks it spends down
  const s = createDuel('thug', { seed: 1 }); const f = s.foes[0]; f.frozen = true; f.hp = f.maxHp = 1000; f.def = { ...f.def, nograb: true }; f.x = s.player.x + 0.7; f.z = s.player.z;
  let t = 0, seen = false;
  for (let i = 0; i < 400; i++) { if (i % 24 === 0 && i < 72 && f.state !== 'down') { f.x = s.player.x + 0.7; f.vx = 0; } step(s, { punch: i % 24 === 0 && i < 72 }, DT); if (f.state === 'down') { seen = true; t++; } else if (seen) break; }
  return seen ? t : -1;
}
function downTicks(s, who) { let t = 0, seen = false; for (let i = 0; i < 2000; i++) { const e = who(s); if (e && e.state === 'down') { seen = true; t++; } else if (seen) break; step(s, seen ? {} : skilledBot(s), DT); } return seen ? t : -1; }
{
  const t = hookDownTicks();
  ok(t >= 42 && t <= 46, `thug knockdown lasts ${t} ticks (42 + up to 4 ticks of hitstop)`);
  const s2 = createDuel('brute', { seed: 1 }); s2.player.x = 9.6; let tp = -1, seen = false, n = 0;
  for (let i = 0; i < 3000 && !(seen && s2.player.state !== 'down'); i++) { step(s2, {}, DT); if (s2.player.state === 'down') { seen = true; n++; } }
  tp = seen ? n : -1;
  ok(tp >= 54 && tp <= 58, `player knockdown lasts ${tp} ticks (54 + up to 4 ticks of hitstop)`);
}

// 8. depth tolerance: a jab connects at |dz| = 0.59 and whiffs at 0.61
function jabAt(dz) { const s = createDuel('thug', { seed: 1 }); const f = s.foes[0]; f.frozen = true; f.x = s.player.x + 0.7; f.z = s.player.z + dz; const hp = f.hp; for (let i = 0; i < 30; i++) step(s, { punch: i === 0 }, DT); return f.hp < hp; }
ok(jabAt(0.59) === true && jabAt(0.61) === false, 'jab hits at |dz| 0.59 and whiffs at 0.61');
ok(jabAt(-0.59) === true && jabAt(-0.61) === false, 'same tolerance on the near side');

// 9. lives & continues: losing all lives offers a continue; taking it restores three lives; ignoring it loses the game
{
  const s = run('street', idleBot, { seed: 2 }, 200);
  ok(s.phase === 'continue' && s.continues === 3, `idle run reaches CONTINUE? with 3 continues (phase=${s.phase})`);
  const a = JSON.parse(JSON.stringify(snap(s)));
  useContinue(s); ok(s.phase === 'play' && s.lives === LIVES && s.continues === 2 && s.player.hp === s.player.maxHp, `continue restores play, ${LIVES} lives, full hp, 2 continues left`);
  const s2 = run('street', idleBot, { seed: 2 }, 200); while (s2.phase === 'continue') step(s2, {}, DT);
  ok(s2.phase === 'lost', `letting the countdown expire ends the game (phase=${s2.phase} after ${a.t}s)`);
}

// 10. weapons: the bat breaks after eight hits; a thrown knife lands as a pickup
{
  const s = createDuel('brute', { seed: 1, weapon: 'bat' }); const f = s.foes[0]; f.frozen = true; f.hp = f.maxHp = 10000; f.x = s.player.x + 0.9; f.z = s.player.z;
  for (let i = 0; i < 1500 && s.player.weapon === 'bat'; i++) { if (i % 100 === 0) { f.x = s.player.x + 0.9; f.z = s.player.z; f.state = 'idle'; f.y = 0; f.vy = 0; f.vx = 0; f.invuln = 0; f.t = 0; } step(s, { punch: i % 100 === 0 }, DT); }
  const hits = s.log.filter((h) => h.move === 'Bat').length;
  ok(hits === WEAPONS.bat.uses, `bat breaks after exactly ${hits} hits (spec ${WEAPONS.bat.uses})`);
  const k = createDuel('thug', { seed: 1, weapon: 'knife' }); k.foes[0].frozen = true; k.foes[0].x = k.player.x + 3; k.foes[0].z = k.player.z;
  for (let i = 0; i < 90; i++) step(k, { punch: i === 0 }, DT);
  ok(k.player.weapon === null && k.log.some((h) => h.move === 'Knife' && h.dmg === 12) && (k.pickups.some((p) => p.kind === 'knife') || !k.foes[0].alive), `thrown knife hits for ${WEAPONS.knife.dmg} and lands as a pickup`);
}

// 10b. the whip: 2.2 m reach, staggers instead of knocking down, hits everyone in line, wears out after ten hits
{
  const s = createDuel('thug', { seed: 1, weapon: 'whip', count: 2 }); const [a, b] = s.foes; for (const f of [a, b]) { f.frozen = true; f.hp = f.maxHp = 10000; f.z = s.player.z; f.state = 'idle'; }
  a.x = s.player.x + 1.0; b.x = s.player.x + 2.0;
  for (let i = 0; i < 30; i++) step(s, { punch: i === 0 }, DT);
  const hits = s.log.filter((h) => h.move === 'Whip');
  ok(hits.length === 2 && hits.every((h) => h.dmg === WEAPONS.whip.dmg) && a.state !== 'down' && b.state !== 'down' && a.stagger > 0, `one whip crack hits both thugs at 1.0 and 2.0 m for ${WEAPONS.whip.dmg}, staggers without knocking down (${hits.length} hits, states ${a.state}/${b.state})`);
  let n = 0; for (let i = 0; i < 2000 && s.player.weapon === 'whip'; i++) { if (i % 60 === 0) { for (const f of [a, b]) { f.state = 'idle'; f.t = 0; f.invuln = 0; f.stagger = 0; } b.x = s.player.x + 6; a.x = s.player.x + 1.0; n++; } step(s, { punch: i % 60 === 0 }, DT); }
  ok(s.player.weapon === null && s.log.filter((h) => h.move === 'Whip').length === WEAPONS.whip.uses + 1, `whip wears out after ${WEAPONS.whip.uses} hits (${s.log.filter((h) => h.move === 'Whip').length} total incl. the double hit)`);
}
// 10c. food: a bun appears when section 2 clears and heals 40 (capped) for 200 points
{
  const s = createGame('street', { seed: 2 });
  while (s.phase === 'play' && s.t < 300 && !s.events.some((e) => e.ev === 'clearsection' && e.i === 1)) step(s, skilledBot(s), DT);
  ok(s.pickups.some((p) => p.food && p.kind === 'bun'), `a bun lies ahead after the second screen clears (t=${s.t.toFixed(1)})`);
  const P = s.player; P.hp = 50; const bun = s.pickups.find((p) => p.food); P.x = bun.x; P.z = bun.z; const sc = s.score;
  step(s, {}, DT);
  ok(P.hp === 90 && s.score === sc + 200 && !s.pickups.some((p) => p.food) && s.events.at(-1).ev === 'eat', `walking onto it heals 50 -> ${P.hp} and scores +${s.score - sc}`);
  P.hp = P.maxHp - 10; s.pickups.push({ id: 9999, kind: 'bun', food: true, x: P.x, z: P.z }); step(s, {}, DT);
  ok(P.hp === P.maxHp, `healing is capped at ${P.maxHp}`);
}

// 11. negative half: five mutations, each must break its gate
{
  CONFIG.foeDmg = 0; const s = run('street', idleBot, { seed: 1 }, 200); CONFIG.foeDmg = 1;
  ok(s.phase === 'play', `mutation: zero enemy damage keeps the idle player alive, so the idle-loses gate would fail (phase=${s.phase})`);
  CONFIG.tokens = 99; let mx = 0; run('hideout', skilledBot, { seed: 2 }, 200, (s) => { mx = Math.max(mx, s.foes.filter((f) => f.alive && f.state === 'attack' && f.phase !== 'recovery').length); }); CONFIG.tokens = 2;
  ok(mx > 2, `mutation: token cap 99 lets ${mx} foes attack at once, so the token gate would fail`);
  CONFIG.hitZ = 99; const wide = jabAt(0.61); CONFIG.hitZ = 0.6;
  ok(wide === true, 'mutation: infinite depth tolerance makes the 0.61 jab land, so the depth gate would fail');
  CONFIG.downFoe = 0.2; const t = hookDownTicks(); CONFIG.downFoe = 0.7;
  ok(t < 42 || t > 46, `mutation: 0.2 s enemy knockdown measures ${t} ticks, so the timing gate would fail`);
  CONFIG.playerDmg = 0.15; const s5 = run('street', skilledBot, { seed: 1 }, 320); CONFIG.playerDmg = 1;
  ok(s5.phase !== 'clear', `mutation: player damage at 15% stops the skilled bot clearing Dragon Street, so the clear gate would fail (phase=${s5.phase} t=${s5.t.toFixed(0)})`);
}

for (const n of notes) console.log(n);
for (const f of fails) console.log(f);
console.log(`\n${notes.length} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
