# 雙截龍 · TWIN DRAGON

A Double Dragon-style side-scrolling beat 'em up drawn entirely from Blender-rendered sprites on a dependency-free Canvas 2D runtime. The Shadow Fang syndicate takes Su Lin; you walk four stages to bring her back: Dragon Street (slum at night), the Ironbone Freight Yard, Azure Ridge (cliffs and a rope bridge) and the Shadow Fang Hideout, where a warlord waits with a machine gun.

Play: https://icomppower.github.io/double-dragon/

## Run locally

```sh
python3 -m http.server 8124 --directory dist --bind 127.0.0.1
```

Open http://127.0.0.1:8124. Any browser with Canvas 2D (no WebGL, no dependencies). Query flags: `?all` unlocks every stage, `?stage=yard&nointro` jumps straight in, `?hero=red` picks Long Wei, `?auto=1` lets the built-in bot play, `?debug` shows the numeric readout, `?reset` clears progress.

## How it plays

- **Move** with the arrows or WASD (up/down changes depth), **J/Z** punch, **K/X** kick, **L/Space** jump, **Esc** or the ❚❚ button pauses (sound toggle and quit live there). On a phone: stick plus PUNCH, KICK, JUMP. A well-timed jump clears a low swing.
- Punch three times for jab, cross, hook. The cross staggers a thug; punch again while he reels to **grab** him, then knee (kick), headbutt (punch) or **throw** him over your shoulder (jump). Whoever he lands on goes down too. A thug behind you eats an **elbow**. Punch or kick in the air for a **jump kick**.
- Punch while standing on a bat, knife, whip, oil drum, crate or dynamite to pick it up; punch again to swing or throw it. Bats and whips wear out. Dynamite hurts everyone in range, you included.
- Only two enemies swing at once. The Ox and the warlord shrug off jabs: bait a swing, sidestep in depth, punish the recovery. The warlord sprays a lane; step out of it and hit him while he reloads.
- Hazards: a conveyor that drags you back, a spike pit to jump, a rope bridge with a gorge on both sides, boulders rolling down the ridge, spike walls and trap floors in the hideout. Buns heal 40.
- Three lives, three continues, 99 seconds per screen. Each stage cleared adds a life. Progress and best score are saved in the browser.

## Blender source

Every pixel the game shows is rendered by Blender 5.2 in `--background` mode from the bpy-built kit in `blender/build_assets.py` (eight articulated figures with named limb pivots, eight weapons, 59 stage pieces). One fixed orthographic camera pitched 20° down at 48 px per metre, toon shading (diffuse → shader-to-RGB → three-band ramp) with a 2 px outline grown from the alpha, rendered at 2× and box-filtered down:

- `blender/build_sprites.py` — the sprite rig: the per-state pose tables (idle, walk, jab/cross/hook, kick, jump, jump kick, elbow, grab, knee, headbutt, throw, hurt, knockdown, lying, getup, death, thrown, pickup, carry, plus whip lash, ox pound and bear hug, warlord spray/reload/rifle butt, blade throw) become Blender poses; one facing rendered, mirrored at runtime; every frame exports a foot pivot, a right-hand anchor with the arm angle, a shoulder and an overhead carry anchor → `dist/assets/figures.png` + `figures.json` (309 frames).
- `blender/build_fx.py` — weapons (grip-left, rotated at runtime to the arm angle), heavies, bun, hit sparks, blast, muzzle flash, dust, splinters, heal, tracer, blob shadow → `fx.png` + `fx.json`.
- `blender/build_stages.py` — each stage's kit layout (dumped from `sim.js` into `blender/layouts.json`) rendered as parallax layers in 1016 px tiles: far sky tile (parallax 0.4), backdrop, ground, foreground occluders and a neon overlay that flickers, plus hazard loops (conveyor, spike wall, trap floor, rope-bridge sway, waterfall, torches, braziers) → `stage_<id>.png` + `.json`.
- `blender/build_ui.py` — the 雙截龍 TWIN DRAGON logo (Noto Serif TC, OFL, bundled in `blender/fonts`), menu and hero cards, HUD plates, bar frames and fills, portraits, a bitmap digit font, the touch stick and buttons, panels, the GO arrow, and the intro / ending frames → `ui.png` + `ui.json`.
- `blender/build_all.sh` runs all four and `tools/manifest.mjs` packs `manifest.json` and enforces the 8 MB budget (currently 1.4 MB). `blender/pngio.py` reads and writes the PNGs in numpy so atlas bytes never pass through colour management.

The Three.js build lives on at the `v1-threejs` tag.

## Verification

- `node verify.mjs` — mechanics oracle on `dist/sim.js`, no browser. Skilled bot clears every stage on five seeds without a continue and wins a two-seed four-stage campaign; idle player loses every stage; determinism; every logged hit matches the spec tables; attack-token cap; entered foes never leave the arena; one-on-one duels against every archetype and the elites; knockdown timing in ticks; depth tolerance at 0.59 vs 0.61; continues; bat wear and knife throws; the whip's reach and wear, buns, and five mutations of the rules that each break their gate. 60 checks. CI runs it, then both browser playtests, before every deploy.
- `node playtest.mjs http://127.0.0.1:8124 [--mobile]` — headless Chrome (needs `npm install`): the four atlases load, the view is a 2D context with no THREE global, no import map and no request to any vendor script or GLB; real card clicks on atlas-skinned cards; the rendered intro; keyboard walk with the sprite frame index cycling; depth; punch; 20 s of autoplay; the bitmap-digit score and timer keep their text; p95 frame time under 16.7 ms (desktop) / 33 ms (390×844 phone); the elite boss's gold tint sampled from canvas pixels (and an isolated plain foe without it); continue flow; hideout with the captive; pause/quit; the rendered ending; and on the phone the joystick, three buttons and pause button hit-tested with elementFromPoint plus a real touch tap and drag. 48 desktop / 60 mobile checks. Screenshots of the menu, HUD, all four stages, the warlord fight and the ending are in `docs/screens/` (`node tools/screens.mjs`).

## Source map

- `dist/sim.js` — all rules: moves, foes, stages, sections, hazards, weapons, food, grabs, lives, bots, duel harness, snapshot. Frozen across the sprite rebuild (`SIM_SHA256`).
- `dist/render2d.js` — Canvas 2D renderer: atlas loading, depth-sorted sprites with anchors, weapon rotation, tint and flash via `globalCompositeOperation`, parallax layers, hazard loops, procedural-box fallback, frame-time ring, DOM skin helpers.
- `dist/game.js` — input, audio, flow, HUD, `window.__td` hooks.
- `dist/index.html`, `dist/style.css` — menu, intro and ending, HUD, touch controls (DOM ids unchanged; skinned from the UI atlas).
- `blender/` — the kit and the four atlas builders; `tools/` — manifest/budget gate and the screenshot script.
