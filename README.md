# 雙截龍 · TWIN DRAGON

A Double Dragon-style side-scrolling beat 'em up built with Blender and Three.js. The Shadow Fang syndicate takes Su Lin; you walk four stages to bring her back: Dragon Street (slum at night), the Ironbone Freight Yard, Azure Ridge (cliffs and a rope bridge) and the Shadow Fang Hideout, where a warlord waits with a machine gun.

Play: https://icomppower.github.io/double-dragon/

## Run locally

```sh
python3 -m http.server 8124 --directory dist --bind 127.0.0.1
```

Open http://127.0.0.1:8124. WebGL2 required; Three.js is vendored under `dist/vendor`. Query flags: `?all` unlocks every stage, `?stage=yard&nointro` jumps straight in, `?hero=red` picks Long Wei, `?auto=1` lets the built-in bot play, `?debug` shows the numeric readout, `?reset` clears progress.

## How it plays

- **Move** with the arrows or WASD (up/down changes depth), **J/Z** punch, **K/X** kick, **L/Space** jump. On a phone: stick plus PUNCH, KICK, JUMP.
- Punch three times for jab, cross, hook. The cross staggers a thug; punch again while he reels to **grab** him, then knee (kick), headbutt (punch) or **throw** him over your shoulder (jump). Whoever he lands on goes down too. A thug behind you eats an **elbow**. Punch or kick in the air for a **jump kick**.
- Punch while standing on a bat, knife, whip, oil drum, crate or dynamite to pick it up; punch again to swing or throw it. Bats and whips wear out. Dynamite hurts everyone in range, you included.
- Only two enemies swing at once. The Ox and the warlord shrug off jabs: bait a swing, sidestep in depth, punish the recovery. The warlord sprays a lane; step out of it and hit him while he reloads.
- Hazards: a conveyor that drags you back, a spike pit to jump, a rope bridge with a gorge on both sides, boulders rolling down the ridge, spike walls and trap floors in the hideout. Buns heal 40.
- Three lives, three continues, 99 seconds per screen. Each stage cleared adds a life. Progress and best score are saved in the browser.

## Blender source

`blender/build_assets.py` builds the whole kit with the bpy API and exports `dist/assets/{figures,weapons,kit}.glb` plus `kit.json` (piece footprints): eight articulated figures (two heroes, thug, whip dancer, ox, blade, warlord, captive) with named limb pivots the runtime swings procedurally, eight weapon props, and 59 stage pieces (tenements, garage, fences, cars, lamps, factory walls, conveyor, crane, containers, truck, spike pit, cliffs, trees, rope bridge, gorge, waterfall, stone walls, pillars, torches, statues, spike wall, trap floor, throne, cage). Rebuild with Blender 5.2:

```sh
blender --background --python blender/build_assets.py
```

The runtime falls back to procedural boxes if a GLB fails to load.

## Verification

- `node verify.mjs` — mechanics oracle on `dist/sim.js`, no browser. Skilled bot clears every stage on five seeds without a continue and wins a two-seed four-stage campaign; idle player loses every stage; determinism; every logged hit matches the spec tables; attack-token cap; entered foes never leave the arena; one-on-one duels against every archetype and the elites; knockdown timing in ticks; depth tolerance at 0.59 vs 0.61; continues; bat wear and knife throws; and five mutations of the rules that each break their gate. 55 checks.
- `node playtest.mjs http://127.0.0.1:8124 [--mobile]` — headless Chrome (needs `npm install`): kit and all eight rigs load, real menu clicks, intro, keyboard walk/depth/punch, limb animation, autoplay for 20 s, HUD tracking, continue flow, hideout with the captive, pause/quit, and on 390×844 the joystick and three buttons hit-tested with elementFromPoint plus a real touch tap and drag. 28 desktop / 34 mobile checks.

## Source map

- `dist/sim.js` — all rules: moves, foes, stages, sections, hazards, weapons, food, grabs, lives, bots, duel harness, snapshot.
- `dist/game.js` — Three.js renderer, procedural poses, camera, HUD, input, flow, audio, `window.__td` hooks.
- `dist/index.html`, `dist/style.css` — menu, intro and ending, HUD, touch controls.
- `blender/build_assets.py` — the kit.
