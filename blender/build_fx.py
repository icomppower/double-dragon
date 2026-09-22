"""雙截龍 · TWIN DRAGON — weapons, projectiles and effects atlas.
Run:  blender --background --python blender/build_fx.py
Writes dist/assets/fx.png + fx.json and blender/previews/fx.png.

Same camera as build_sprites.py (orthographic, 20° pitch, 48 px/m, 2× supersampled, 2 px outline). Hand-held weapons
are rendered pointing screen-right with the grip at their pivot; the runtime rotates them to the arm angle exported
per figure frame. Heavies (drum, crate, boulder) and the bun stand on their base pivot. Effects are small Blender
objects: hit sparks (two sizes, three frames), the dynamite blast (four frames), muzzle flash (two), dust (three),
smash splinters (two), heal sparkle (two), a bullet tracer and the blob shadow.
"""
import bpy, os, sys, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_assets as K
import build_sprites as S     # camera/toon/outline/pack helpers (its main() does not run on import)
import pngio
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = S.ROOT; OUT = S.OUT; TMP = S.TMP; PREV = S.PREV
PPM, SS, PITCH = S.PPM, S.SS, S.PITCH

SPARK = K.mat('FX spark', 'fff2a0', 0.5, 0, 3.0); SPARK2 = K.mat('FX spark orange', 'ffb03a', 0.5, 0, 3.0); WHITE = K.mat('FX white', 'ffffff', 0.5, 0, 3.0)
FIRE = K.mat('FX fire', 'ff7a2a', 0.5, 0, 3.0); FIRE2 = K.mat('FX fire dark', 'c8301a', 0.6, 0, 1.2); SMOKE = K.mat('FX smoke', '5a5560', 0.9); SMOKE2 = K.mat('FX smoke light', '8a8590', 0.9)
DUST = K.mat('FX dust', 'b8ad98', 0.9); SPLINT = K.mat('FX splinter', 'b58a4a', 0.8); HEAL = K.mat('FX heal', '7dff4a', 0.5, 0, 3.0)
SHADOW = K.mat('FX shadow', '000000', 1.0, 0, 0, 0.42); TRACER = K.mat('FX tracer', 'fff6c0', 0.4, 0, 3.0)
BUN = K.mat('Bun', 'f3e3c8', 0.7); BUNPINK = K.mat('Bun pink', 'e0607a', 0.6); PLATE = K.mat('Plate', 'f4f4f0', 0.4)

def star(name, r_out, r_in, points, ma, z=0.0, rot=0.0, thick=0.04):
    verts = []
    for i in range(points * 2):
        r = r_out if i % 2 == 0 else r_in; a = rot + math.pi * i / points
        verts.append((math.cos(a) * r, math.sin(a) * r * 0.55, 0))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], [list(range(len(verts)))]); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(ma)
    o.location = (0, 0, z)
    o.rotation_euler = (math.pi / 2 - PITCH, 0, 0)   # face the camera
    return o

def group(name, objs):
    root = K.empty(name)
    for o in objs: o.parent = root
    return root

def build_items():
    """-> list of (key, root, pivot_local, kind)  kind: 'weapon' | 'heavy' | 'fx'"""
    items = []
    for w in K.build_weapons():
        n = w.name
        if n in ('W_Drum', 'W_Crate', 'W_Boulder'): items.append((n, w, Vector((0, 0, 0)), 'heavy'))
        else:
            w.rotation_euler = (0, math.pi / 2, 0)   # length +Z -> +X (screen right), grip stays at the origin
            items.append((n, w, Vector((0, 0, 0)), 'weapon'))
    # bun
    items.append(('Bun', group('Bun', [K.cyl('plate', (0, 0, 0.015), 0.28, 0.03, PLATE, None, 16), K.sphere('bun', (0, 0, 0.17), 0.17, BUN, None, 12, 8, (1, 1, 0.85)), K.sphere('dot', (0, 0, 0.3), 0.05, BUNPINK, None, 8, 6, (1, 1, 0.5))]), Vector((0, 0, 0)), 'heavy'))
    # sparks: three growing frames, small (white/yellow) and big (orange)
    for i in range(3):
        s = 0.18 + i * 0.12
        items.append((f'spark_{i}', group(f'spark_{i}', [star('s', s, s * 0.4, 5, SPARK if i < 2 else WHITE, 0.6, i * 0.5), star('s2', s * 0.55, s * 0.2, 4, WHITE, 0.6, 0.4 + i)]), Vector((0, 0, 0.6)), 'fx'))
        b = 0.3 + i * 0.18
        items.append((f'sparkbig_{i}', group(f'sparkbig_{i}', [star('s', b, b * 0.38, 6, SPARK2, 0.6, i * 0.4), star('s2', b * 0.6, b * 0.25, 5, SPARK, 0.6, 0.6 + i * 0.3)]), Vector((0, 0, 0.6)), 'fx'))
    # dynamite blast: four frames — fireball grows, then smoke takes over
    for i in range(4):
        r = 0.4 + i * 0.25; objs = []
        if i < 3: objs.append(K.sphere('fire', (0, 0, 0.5 + r * 0.6), r, FIRE if i < 2 else FIRE2, None, 12, 8))
        if i >= 1:
            for k in range(5):
                a = k * 1.26 + i * 0.7; objs.append(K.sphere('smk', (math.cos(a) * r * 0.9, math.sin(a) * 0.3, 0.4 + r * 0.7 + math.sin(a * 2) * 0.2), r * 0.45, SMOKE if k % 2 else SMOKE2, None, 8, 6))
        if i == 0: objs.append(star('flash', 1.1, 0.3, 8, WHITE, 0.8))
        items.append((f'boom_{i}', group(f'boom_{i}', objs), Vector((0, 0, 0)), 'fx'))
    # muzzle flash: two frames, elongated
    for i in range(2):
        items.append((f'muzzle_{i}', group(f'muzzle_{i}', [star('m', 0.45 + i * 0.15, 0.12, 4, SPARK, 0, 0), star('m2', 0.25, 0.08, 4, WHITE, 0, 0.78)]), Vector((0, 0, 0)), 'fx'))
    # dust / rumble: three growing puffs
    for i in range(3):
        r = 0.35 + i * 0.25; objs = []
        for k in range(4 + i):
            a = k * 6.28 / (4 + i) + i; objs.append(K.sphere('d', (math.cos(a) * r, math.sin(a) * r * 0.4, 0.2 + r * 0.5 + (k % 2) * 0.15), r * 0.55, DUST if k % 2 else SMOKE2, None, 8, 6))
        items.append((f'dust_{i}', group(f'dust_{i}', objs), Vector((0, 0, 0)), 'fx'))
    # smash splinters: two frames
    for i in range(2):
        objs = []
        for k in range(7):
            a = k * 0.9 + i; d = 0.3 + i * 0.35
            objs.append(K.cube('sp', (math.cos(a) * d, 0, 0.3 + abs(math.sin(a)) * d), (0.16, 0.06, 0.05), SPLINT, None, (0, a, 0)))
        items.append((f'smash_{i}', group(f'smash_{i}', objs), Vector((0, 0, 0)), 'fx'))
    # heal sparkle
    for i in range(2):
        items.append((f'heal_{i}', group(f'heal_{i}', [star('h', 0.3 + i * 0.15, 0.08, 4, HEAL, 0.3 + i * 0.35, 0), star('h2', 0.16, 0.05, 4, WHITE, 0.6 + i * 0.3, 0.78)]), Vector((0, 0, 0)), 'fx'))
    # bullet tracer and blob shadow
    items.append(('tracer', group('tracer', [K.cube('t', (0, 0, 0), (0.7, 0.05, 0.05), TRACER)]), Vector((0, 0, 0)), 'fx'))
    items.append(('shadow', group('shadow', [K.cyl('sh', (0, 0, 0.005), 0.42, 0.01, SHADOW, None, 24)]), Vector((0, 0, 0)), 'fx'))
    return items

def main():
    sc, cam = S.setup_scene()
    items = build_items()
    S.toonify_all()
    cell_m = 4.0; cell_px = int(round(cell_m * PPM))
    n = len(items); cols = math.ceil(math.sqrt(n)); rows = math.ceil(n / cols)
    pivots = []
    for i, (key, root, pivot_local, kind) in enumerate(items):
        col, row = i % cols, i // cols
        sx = col * cell_m + cell_m / 2; sup = (rows - 1 - row) * cell_m + (1.3 if kind == 'weapon' else 0.9)
        root.location = (sx, 0, sup / math.cos(PITCH))
    bpy.context.view_layer.update()
    W, H = cols * cell_px * SS, rows * cell_px * SS
    sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
    cam.data.ortho_scale = cols * cell_m
    center = Vector((cols * cell_m / 2, 0, (rows * cell_m / 2) / math.cos(PITCH))); d = Vector((0, math.cos(PITCH), -math.sin(PITCH)))
    cam.location = center - d * 60
    bpy.context.view_layer.update()
    for key, root, pivot_local, kind in items:
        u, v, _ = world_to_camera_view(sc, cam, root.matrix_world @ pivot_local); pivots.append((u * W, (1 - v) * H))
    path = os.path.join(TMP, 'fx_sheet.png'); sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    sheet = pngio.read(path).astype(np.float32) / 255.0
    sprites, meta = [], {}
    for i, (key, root, pivot_local, kind) in enumerate(items):
        col, row = i % cols, i // cols
        x0, y0 = col * cell_px * SS, row * cell_px * SS
        cell = sheet[y0:y0 + cell_px * SS, x0:x0 + cell_px * SS]
        im = S.outline_and_downsample(cell) if kind != 'fx' or key.startswith('smash') else S.outline_and_downsample(cell)
        if key == 'shadow' or key.startswith(('spark', 'muzzle', 'heal', 'tracer', 'boom', 'dust')):
            # soft things: no dark outline, keep the render's own alpha
            a = cell[..., 3]; prem = cell[..., :3] * a[..., None]
            h, w = a.shape
            prem = prem.reshape(h // SS, SS, w // SS, SS, 3).mean(axis=(1, 3)); al = a.reshape(h // SS, SS, w // SS, SS).mean(axis=(1, 3))
            rgb = np.where(al[..., None] > 1e-4, prem / np.maximum(al, 1e-4)[..., None], 0)
            im = np.clip(np.round(np.concatenate([rgb, al[..., None]], axis=2) * 255), 0, 255).astype(np.uint8)
        im, tx, ty = S.trim(im)
        px, py = pivots[i]
        meta[key] = {'w': int(im.shape[1]), 'h': int(im.shape[0]), 'px': round(px / SS - col * cell_px - tx, 1), 'py': round(py / SS - row * cell_px - ty, 1), 'kind': kind}
        sprites.append((key, im))
    atlas, place = S.pack(sprites, width=1024)
    for key, m in meta.items(): m['x'], m['y'] = place[key][0], place[key][1]
    size = pngio.write(os.path.join(OUT, 'fx.png'), atlas)
    anims = {'spark': ['spark_0', 'spark_1', 'spark_2'], 'sparkbig': ['sparkbig_0', 'sparkbig_1', 'sparkbig_2'], 'boom': [f'boom_{i}' for i in range(4)], 'muzzle': ['muzzle_0', 'muzzle_1'], 'dust': ['dust_0', 'dust_1', 'dust_2'], 'smash': ['smash_0', 'smash_1'], 'heal': ['heal_0', 'heal_1']}
    with open(os.path.join(OUT, 'fx.json'), 'w') as f: json.dump({'ppm': PPM, 'atlas': 'fx.png', 'width': int(atlas.shape[1]), 'height': int(atlas.shape[0]), 'sprites': meta, 'anims': anims}, f, separators=(',', ':'))
    print('ATLAS fx', atlas.shape[1], 'x', atlas.shape[0], size, 'bytes,', len(sprites), 'sprites')
    prev = atlas.copy(); bg = np.zeros_like(prev); bg[..., :3] = (60, 58, 70); bg[..., 3] = 255
    a = prev[..., 3:4].astype(np.float32) / 255; bg[..., :3] = (prev[..., :3] * a + bg[..., :3] * (1 - a)).astype(np.uint8)
    pngio.write(os.path.join(PREV, 'fx.png'), bg)
    print('DONE')

if __name__ == '__main__':
    main()
