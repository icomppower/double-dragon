"""雙截龍 · TWIN DRAGON — stage layers. Rebuilds each stage's kit-piece layout (blender/layouts.json, dumped from
dist/sim.js STAGES[i].layout()) in Blender and renders it as parallax layers from the sprite camera:
  far    — one repeating 1024 px sky tile (gradient, skyline / hills / clouds / moon), parallax 0.4 at runtime
  back   — everything at depth z <= 1.0 (walls, garage, fences, lamps, dumpsters, signs, cliffs, trees, pillars ...)
  ground — the floor: sidewalk strip, road/dirt/stone, road dashes, carpet, spike pit, gorge, with gaps at pits and the gorge
  fore   — everything at z >= 5.5 (cars, hydrants, barrels, truck, bushes, rocks, statues, braziers' stands, the cage)
  neon   — the back layer's emissive geometry alone, drawn over it and dimmed at random for the flicker
Animated hazards become sprite loops with their world positions: conveyor (4), spike wall (4), trap floor (3),
rope bridge sway (3), waterfall (4), torch (3), brazier (3). Tiles are 1024 px wide; everything packs into one
atlas per stage. Run:  blender --background --python blender/build_stages.py
"""
import bpy, os, sys, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_assets as K
import build_sprites as S
import pngio
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT, OUT, TMP, PREV = S.ROOT, S.OUT, S.TMP, S.PREV
PPM, PITCH = S.PPM, S.PITCH
TILE = 1016; TILE_M = TILE / PPM      # two tiles + padding fit a 2048 atlas row
LAY = json.load(open(os.path.join(ROOT, 'blender', 'layouts.json')))
GROUND = {'night': ('2c2d30', '8f8a80', 'd8d0b0'), 'dusk': ('6e6a62', '55524c', 'f2c400'), 'day': ('8a7a55', '5f7a3a', 'a89a70'), 'indoor': ('4a4540', '3a3530', '5a5550')}
SKYCOL = {'night': ('0d0a18', '2a1240'), 'dusk': ('2a1830', 'c8603a'), 'day': ('3f7fc8', 'c8e0f4'), 'indoor': ('0a0709', '1a1418')}
BACK_Z, FORE_Z = 1.0, 5.5
ANIMATED = {'SpikeWall', 'TrapFloor', 'Conveyor', 'Bridge', 'Waterfall', 'Torch', 'Brazier'}
LAYERS = {'back': (-0.4, 10.6), 'ground': (-2.95, 0.4), 'fore': (-2.95, 0.4), 'neon': (-0.4, 10.6)}
FAR = (-1.0, 7.0)

# ------------------------------------------------------------------ helpers
def dup(root, x, y, yaw=0.0, coll=None):
    coll = coll or bpy.context.scene.collection
    r = root.copy(); r.location = (x, y, 0); r.rotation_euler = (0, 0, yaw); r.hide_render = False; coll.objects.link(r)
    for c in root.children:
        c2 = c.copy(); c2.parent = r; c2.hide_render = False; coll.objects.link(c2)
    return r

def screen_up(y, z): return z * math.cos(PITCH) + y * math.sin(PITCH)
def z_for(s, y=0.0): return (s - y * math.sin(PITCH)) / math.cos(PITCH)

def render_window(sc, cam, cx, s0, s1, w_px, h_px, path):
    sc.render.resolution_x = w_px; sc.render.resolution_y = h_px; sc.render.resolution_percentage = 100
    cam.data.ortho_scale = max(w_px, h_px) / PPM
    center = Vector((cx, 0, z_for((s0 + s1) / 2)))
    d = Vector((0, math.cos(PITCH), -math.sin(PITCH)))
    cam.location = center - d * 120
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return pngio.read(path)

def outline1x(img, r=2):
    f = img.astype(np.float32) / 255.0; a = f[..., 3]
    m = S.dilate(a > 0.5, r); oa = m.astype(np.float32)
    prem = f[..., :3] * a[..., None] + np.array(S.OUTLINE, dtype=np.float32)[None, None, :] * (oa * (1 - a))[..., None]
    al = a + oa * (1 - a)
    rgb = np.where(al[..., None] > 1e-4, prem / np.maximum(al, 1e-4)[..., None], 0)
    return np.clip(np.round(np.concatenate([rgb, al[..., None]], axis=2) * 255), 0, 255).astype(np.uint8)

def set_visible(objs, on):
    for o in objs:
        o.hide_render = not on
        for c in o.children: c.hide_render = not on

# material passes: dim emissives for the back layer, blank non-emissives for the neon overlay
def mat_pass(mode):
    for m in bpy.data.materials:
        if not m.get('toon'): continue
        nt = m.node_tree; em = nt.nodes.get('ToonEmit'); mix = nt.nodes.get('ToonMix')
        if not em or not mix: continue
        alpha = m['alpha']
        if m['emissive']:
            c = m['emit_color']; k = 0.55 if mode == 'back' else 1.0
            em.inputs['Color'].default_value = (c[0] * k, c[1] * k, c[2] * k, 1)
            mix.inputs[0].default_value = alpha
        else:
            mix.inputs[0].default_value = 0.0 if mode == 'neon' else alpha

# ------------------------------------------------------------------ scene content
def build_library():
    lib = {}
    for builder in (K.build_slum, K.build_industrial, K.build_forest, K.build_hideout):
        for root in builder():
            lib[root.name] = root; root.location = (-2000, 0, 0); root.hide_render = True
            for c in root.children: c.hide_render = True
    return lib

def ground_objects(st):
    """Floor: sidewalk strip behind the band, road/dirt in the band and in front, with gaps at pits and the gorge."""
    g, side, dash = GROUND[st['sky']]
    GM = K.mat('Ground ' + st['sky'], g, 0.95); SM = K.mat('Side ' + st['sky'], side, 0.95); DM = K.mat('Dash ' + st['sky'], dash, 0.8)
    objs = []
    gaps = sorted([(h['x0'] - (0.25 if h['kind'] == 'pit' else 0), h['x1'] + (0.25 if h['kind'] == 'pit' else 0)) for h in st['hazards'] if h['kind'] in ('pit', 'bridge')])
    x0 = -14; segs = []
    for a, b in gaps: segs.append((x0, a)); x0 = b
    segs.append((x0, st['length'] + 16))
    for a, b in segs:
        if b - a < 0.1: continue
        w = b - a; cx = (a + b) / 2
        objs.append(K.cube('road', (cx, -4.6, -0.05), (w, 8.2, 0.1), GM))        # z 0.5 .. 8.7 toward the camera
        objs.append(K.cube('side', (cx, 0.15, -0.04), (w, 1.7, 0.1), SM))        # z -0.7 .. 1.0 (sidewalk behind the band)
    if st['sky'] == 'night':
        for x in range(-6, int(st['length']) + 12, 6): objs.append(K.cube('dash', (x, -5.6, 0.005), (2.6, 0.18, 0.02), DM))
    if st['sky'] == 'dusk':
        for h in st['hazards']:
            if h['kind'] == 'pit':
                for k in range(6): objs.append(K.cube('stripe', (h['x0'] - 1.4 + k * 0.5 if k < 3 else h['x1'] + 0.4 + (k - 3) * 0.5, -2.9, 0.01), (0.25, 2.4, 0.02), DM if k % 2 == 0 else K.mat('Hazard black', '141414', 0.6)))
    if st['sky'] == 'indoor':
        for x in range(-12, int(st['length']) + 16, 2): objs.append(K.cube('seam', (x, -4.6, 0.01), (0.04, 8.2, 0.02), K.mat('Seam', '3a3530', 0.95)))
    return objs

def sky_objects(st, cx):
    """Far layer content for one repeating tile centred at cx: gradient quad plus period-locked silhouettes."""
    top, hor = SKYCOL[st['sky']]
    objs = []
    # gradient quad facing the camera, far behind
    bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, 40, z_for((FAR[0] + FAR[1]) / 2, 40)))
    q = bpy.context.object; q.scale = (TILE_M + 2, (FAR[1] - FAR[0]) + 2, 1); q.rotation_euler = (math.pi / 2 - PITCH, 0, 0)
    m = bpy.data.materials.new('Sky ' + st['sky']); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    def lin(h): return tuple(K.lin(int(h[i:i + 2], 16)) for i in (0, 2, 4)) + (1,)
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = lin(hor)
    ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = lin(top)
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Y'], ramp.inputs[0]); nt.links.new(ramp.outputs[0], em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs[0])
    q.data.materials.append(m); m['toon'] = True; m['alpha'] = 1.0; m['emissive'] = 0
    objs.append(q)
    period = TILE_M
    import random; rng = random.Random(7)
    if st['sky'] == 'night':
        SIL = K.mat('Skyline night', '1a1430', 0.9, 0, 0.3); WIN = K.mat('Skyline window', 'ffcf7a', 0.4, 0, 1.2); MOON = K.mat('Moon', 'fff4d0', 0.5, 0, 1.4)
        for rep in (-1, 0, 1):
            x = 0.0
            while x < period:
                w = rng.uniform(2.5, 5.5); h = rng.uniform(4, 12); bx = cx - period / 2 + x + w / 2 + rep * period
                objs.append(K.cube('sil', (bx, 30, h / 2 + z_for(-0.2, 30) * 0 - 30 * math.sin(PITCH) / math.cos(PITCH) + 0.0), (w, 2, h), SIL))
                for wy in range(int(h / 1.4)):
                    for wx in range(int(w / 1.2)):
                        if rng.random() < 0.35: objs.append(K.cube('win', (bx - w / 2 + 0.6 + wx * 1.2, 28.9, 0.6 + wy * 1.4 - 30 * math.sin(PITCH) / math.cos(PITCH)), (0.5, 0.05, 0.6), WIN))
                x += w + rng.uniform(0.5, 2.5)
        objs.append(K.cyl('moon', (cx + 5, 45, z_for(5.6, 45)), 1.1, 0.05, MOON, None, 24, (math.pi / 2 - PITCH, 0, 0)))
    elif st['sky'] == 'dusk':
        SIL = K.mat('Skyline dusk', '2a1a28', 0.9); SUN = K.mat('Sun disk', 'ffb060', 0.5, 0, 1.6)
        objs.append(K.cyl('sun', (cx - 4, 45, z_for(2.6, 45)), 2.2, 0.05, SUN, None, 32, (math.pi / 2 - PITCH, 0, 0)))
        for rep in (-1, 0, 1):
            x = 0.0
            while x < period:
                w = rng.uniform(3, 7); h = rng.uniform(3, 9); bx = cx - period / 2 + x + w / 2 + rep * period
                objs.append(K.cube('sil', (bx, 30, h / 2 - 30 * math.sin(PITCH) / math.cos(PITCH)), (w, 2, h), SIL))
                if rng.random() < 0.4: objs.append(K.cyl('stack', (bx + w * 0.3, 30, h + 2 - 30 * math.sin(PITCH) / math.cos(PITCH)), 0.5, 4, SIL, None, 10))
                x += w + rng.uniform(1, 3)
    elif st['sky'] == 'day':
        HILL = K.mat('Hill', '5a7a4a', 0.95); HILL2 = K.mat('Hill far', '7a95a8', 0.95); CLOUD = K.mat('Cloud', 'ffffff', 0.6, 0, 0.6)
        for rep in (-1, 0, 1):
            for i in range(4):
                bx = cx - period / 2 + (i + 0.5) * period / 4 + rep * period
                objs.append(K.sphere('hill', (bx + rng.uniform(-1, 1), 30, -30 * math.sin(PITCH) / math.cos(PITCH) - 4), 6.5, HILL2, None, 16, 10, (1.3, 1, 1)))
                objs.append(K.sphere('hill2', (bx + 3, 26, -26 * math.sin(PITCH) / math.cos(PITCH) - 3.5), 5.2, HILL, None, 16, 10, (1.4, 1, 0.9)))
            for i in range(3):
                bx = cx - period / 2 + (i + 0.3) * period / 3 + rep * period; cz = z_for(5.2 + i * 0.5, 40)
                for k in range(3): objs.append(K.sphere('cloud', (bx + k * 1.3, 40, cz + (k % 2) * 0.5), 1.1 - (k % 2) * 0.2, CLOUD, None, 12, 8))
    return objs

# ------------------------------------------------------------------ animated hazards
def anim_frames(name, lib, st, coll):
    """-> (cell_w_m, cell_h_m, frames: list of object lists, pivot_local, fps)"""
    R = []
    if name == 'conveyor':
        for i in range(4):
            r = dup(lib['Conveyor'], 0, 0, 0, coll); objs = [r]
            AM = K.mat('Belt arrow', 'f2c400', 0.6)
            for k in range(4):
                x = -1.8 + ((k * 1.0 + i * 0.25) % 4.0); objs.append(K.cube('arrow', (x, 0, 0.675), (0.5, 0.35, 0.02), AM))
            R.append(objs)
        return 4.4, 1.3, R, Vector((0, 0, 0)), 8
    if name == 'spikewall':
        for i, ext in enumerate((0.0, 0.15, 0.7, 1.3)):
            r = dup(lib['SpikeWall'], 0, ext, 0, coll); R.append([r])   # slides toward the camera (-Y in sim = +z) -> here +ext means... front is -Y: extension toward camera is -Y
            r.location = (0, -ext, 0)
        return 2.6, 3.4, R, Vector((0, 0, 0)), 12
    if name == 'trapfloor':
        for drop in (0.0, 0.15, 0.4):
            r = dup(lib['TrapFloor'], 0, 0, 0, coll); r.location = (0, 0, -drop); R.append([r])
        return 2.4, 1.5, R, Vector((0, 0, 0)), 12
    if name == 'bridge':
        # the whole 20 m span centred on the pivot (the runtime draws it at the span's centre x)
        for i in range(3):
            objs = []
            for k in range(5):
                r = dup(lib['Bridge'], k * 4 + 2 - 10, 0, 0, coll)
                r.location.z = 0.06 * math.sin((k * 4 + 2) * 0.55 + i * 2.09); objs.append(r)
            R.append(objs)
        return 21.0, 2.2, R, Vector((0, 0, 0)), 4
    if name == 'waterfall':
        FOAM = K.mat('Foam', 'f4fbff', 0.3, 0, 0.5)
        for i in range(4):
            # the sim's layout puts 5 m waterfall pieces on an 8 m grid: an 8 m cliff behind each one fills the gaps
            r = dup(lib['Waterfall'], 0, 0, 0, coll); objs = [dup(lib['Cliff'], 0, 0.5, 0, coll), r]
            for k in range(6):
                z = ((k * 1.4 + i * 0.5) % 8.0); objs.append(K.cube('foam', (-0.5 + (k % 3) * 0.5, -0.32, z + 0.3), (0.35, 0.05, 0.5), FOAM))
            objs.append(K.sphere('splash', (0.3 * (i % 2) - 0.15, -0.6, 0.25), 0.35 + 0.1 * (i % 2), FOAM, None, 8, 6, (1.6, 1, 0.5)))
            R.append(objs)
        return 8.6, 9.0, R, Vector((0, 0, 0)), 8
    if name in ('torch', 'brazier'):
        base = lib['Torch' if name == 'torch' else 'Brazier']
        for i in range(3):
            r = dup(base, 0, 0, 0, coll); objs = [r]
            FL = K.mat('Torch flame', 'ff8a2a', 0.5, 0, 4.0); FL2 = K.mat('Flame core', 'ffd070', 0.5, 0, 4.0)
            if name == 'torch': cz, sc = 2.45, 0.16
            else: cz, sc = 1.45, 0.35
            objs.append(K.sphere('fl', (0.04 * math.sin(i * 2.1), 0, cz + 0.08 * i), sc * (1 + 0.15 * (i % 2)), FL, None, 8, 6, (1, 1, 1.5 + 0.3 * i)))
            objs.append(K.sphere('fl2', (0.03 * math.cos(i * 2.1), -0.02, cz - 0.05 + 0.05 * i), sc * 0.55, FL2, None, 8, 6, (1, 1, 1.4)))
            R.append(objs)
        return (1.2, 3.2, R, Vector((0, 0, 0)), 8) if name == 'torch' else (1.6, 2.6, R, Vector((0, 0, 0)), 8)
    raise KeyError(name)

def render_anim(sc, cam, name, lib, st, coll):
    cw, ch, frames, pivot_local, fps = anim_frames(name, lib, st, coll)
    n = len(frames); cell_w = int(round(cw * PPM)); cell_h = int(round(ch * PPM))
    for i, objs in enumerate(frames):
        for o in objs:
            o.location.x += i * cw + cw / 2
            # keep the object's own z (bridge sway / trap drop) and slide it down so its base sits 0.6 m above the cell bottom
            o.location.z += z_for(0.6 + (0 if name != 'spikewall' else 0.5))
    bpy.context.view_layer.update()
    W, H = n * cell_w, cell_h
    sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
    cam.data.ortho_scale = max(W, H) / PPM
    center = Vector((n * cw / 2, 0, z_for(ch / 2))); d = Vector((0, math.cos(PITCH), -math.sin(PITCH))); cam.location = center - d * 120
    bpy.context.view_layer.update()
    pivots = []
    for i, objs in enumerate(frames):
        p = Vector((i * cw + cw / 2, 0, z_for(0.6 + (0 if name != 'spikewall' else 0.5))))
        u, v, _ = world_to_camera_view(sc, cam, p); pivots.append((u * W, (1 - v) * H))
    path = os.path.join(TMP, f'anim_{st["id"]}_{name}.png'); sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    sheet = pngio.read(path)
    out = []
    for i in range(n):
        cell = sheet[:, i * cell_w:(i + 1) * cell_w]
        im = outline1x(cell) if name not in ('torch', 'brazier', 'waterfall') else cell
        im, tx, ty = S.trim(im)
        px, py = pivots[i]
        out.append((im, round(px - i * cell_w - tx, 1), round(py - ty, 1)))
    for objs in frames:
        for o in objs:
            for c in list(o.children): bpy.data.objects.remove(c, do_unlink=True)
            bpy.data.objects.remove(o, do_unlink=True)
    return out, fps

# ------------------------------------------------------------------ per stage
def build_stage(sc, cam, lib, sid, st, previews):
    st = dict(st); st['id'] = sid
    coll = bpy.context.scene.collection
    inst = {'back': [], 'ground': [], 'fore': []}
    anim_inst = {}
    for d in st['decor']:
        k = d['kind']
        if k in ANIMATED:
            key = {'SpikeWall': 'spikewall', 'TrapFloor': 'trapfloor', 'Conveyor': 'conveyor', 'Bridge': 'bridge', 'Waterfall': 'waterfall', 'Torch': 'torch', 'Brazier': 'brazier'}[k]
            anim_inst.setdefault(key, []).append([d['x'], d['z']]); continue
        # the sim lays some scenery behind the wall line (trees, billboards, cranes, containers); in 3D that put them inside
        # the wall volume. Here anything behind the line stands just in front of it instead, ordered by its original depth.
        zz = d['z'] if d['z'] >= 0.5 or k in ('SlumWallA', 'SlumWallB', 'Garage', 'FactoryWallA', 'FactoryWallB', 'Cliff', 'Waterfall', 'StoneWallA', 'StoneWallB', 'Hut', 'Door') else 0.35 - d['z'] * 0.05
        r = dup(lib[k], d['x'], -zz, d.get('yaw', 0), coll)
        layer = 'fore' if d['z'] >= FORE_Z else ('ground' if k in ('SpikePit', 'Gorge', 'Carpet') else 'back')
        inst[layer].append(r)
    if 'bridge' in anim_inst: anim_inst['bridge'] = [[min(p[0] for p in anim_inst['bridge']) - 2 + 10, 2.9]]
    inst['ground'] += ground_objects(st)
    for layer in inst: set_visible(inst[layer], False)
    x0 = -12.0; ntiles = math.ceil((st['length'] + 26) / TILE_M)
    sprites, layers = [], {}
    for layer in ('back', 'ground', 'fore', 'neon'):
        s0, s1 = LAYERS[layer]; H = int(round((s1 - s0) * PPM))
        src = 'back' if layer == 'neon' else layer
        set_visible(inst[src], True)
        mat_pass(layer if layer in ('back', 'neon') else 'plain')
        tiles = []
        for t in range(ntiles):
            cx = x0 + t * TILE_M + TILE_M / 2
            img = render_window(sc, cam, cx, s0, s1, TILE, H, os.path.join(TMP, f'{sid}_{layer}_{t}.png'))
            if layer in ('back', 'fore', 'neon'): img = outline1x(img) if layer != 'neon' else img
            if (img[..., 3] > 8).sum() < 20: tiles.append(None); continue
            img, ox, oy = S.trim(img)
            key = f'{layer}_{t}'; sprites.append((key, img)); tiles.append({'key': key, 'ox': ox, 'oy': oy})
        set_visible(inst[src], False)
        mat_pass('plain')
        layers[layer] = {'s0': s0, 's1': s1, 'h': H, 'x0': x0, 'tile_m': TILE_M, 'tiles': tiles}
    # far tile (own scene content, rendered alone)
    sky = sky_objects(st, 0.0)
    sf0, sf1 = FAR; Hf = int(round((sf1 - sf0) * PPM))
    img = render_window(sc, cam, 0.0, sf0, sf1, TILE, Hf, os.path.join(TMP, f'{sid}_far.png'))
    img[..., 3] = 255
    sprites.append(('far', img)); layers['far'] = {'s0': sf0, 's1': sf1, 'h': Hf, 'tile': 'far'}
    for o in sky: bpy.data.objects.remove(o, do_unlink=True)
    # animated hazards
    anims = {}
    for name, positions in anim_inst.items():
        frames, fps = render_anim(sc, cam, name, lib, st, coll)
        keys = []
        for i, (im, px, py) in enumerate(frames):
            key = f'{name}_{i}'; sprites.append((key, im)); keys.append({'key': key, 'px': px, 'py': py})
        anims[name] = {'frames': keys, 'fps': fps, 'at': positions}
    for layer in inst:
        for o in inst[layer]:
            for c in list(o.children): bpy.data.objects.remove(c, do_unlink=True)
            bpy.data.objects.remove(o, do_unlink=True)
    atlas, place = S.pack(sprites, width=2048, pad=6, extrude=2)
    meta = {'ppm': PPM, 'pitch': 20, 'atlas': f'stage_{sid}.png', 'width': int(atlas.shape[1]), 'height': int(atlas.shape[0]), 'length': st['length'], 'sky': st['sky'], 'layers': layers, 'anims': anims, 'sprites': {}}
    for key, im in sprites:
        x, y, w, h = place[key]; meta['sprites'][key] = {'x': x, 'y': y, 'w': w, 'h': h}
    size = pngio.write(os.path.join(OUT, f'stage_{sid}.png'), atlas)
    with open(os.path.join(OUT, f'stage_{sid}.json'), 'w') as f: json.dump(meta, f, separators=(',', ':'))
    print('STAGE', sid, 'atlas', atlas.shape[1], 'x', atlas.shape[0], size, 'bytes,', len(sprites), 'sprites, anims', list(anims))
    # preview: composite tiles 2 and 3 of far/back/ground/fore over the sky
    pw = 2 * TILE; ph = int(round((10.6 + 2.95) * PPM)) + 4
    prev = np.zeros((ph, pw, 4), dtype=np.uint8)
    far = atlas[place['far'][1]:place['far'][1] + Hf, place['far'][0]:place['far'][0] + TILE]
    fy = int(round((10.6 - sf1) * PPM))
    for rep in range(2): prev[fy:fy + Hf, rep * TILE:(rep + 1) * TILE] = far
    prev[fy + Hf:, :, :3] = far[-1, 0, :3]; prev[..., 3] = 255
    def over(dst, src):
        a = src[..., 3:4].astype(np.float32) / 255; dst[..., :3] = (src[..., :3] * a + dst[..., :3] * (1 - a)).astype(np.uint8)
    for layer in ('back', 'neon', 'ground', 'fore'):
        L = layers[layer]; ty = int(round((10.6 - L['s1']) * PPM))
        for rep, t in enumerate((2, 3)):
            tile = L['tiles'][t] if t < len(L['tiles']) else None
            if not tile: continue
            x, y, w, h = place[tile['key']]; dy = ty + tile['oy']; dx = rep * TILE + tile['ox']
            h = min(h, ph - dy); w = min(w, pw - dx)
            if h > 0 and w > 0: over(prev[dy:dy + h, dx:dx + w], atlas[y:y + h, x:x + w])
    previews.append(prev)

def main():
    sc, cam = S.setup_scene()
    lib = build_library()
    S.toonify_all()
    previews = []
    for sid, st in LAY.items():
        build_stage(sc, cam, lib, sid, st, previews)
    H = sum(p.shape[0] for p in previews); prev = np.zeros((H, 2 * TILE, 4), dtype=np.uint8); y = 0
    for p in previews: prev[y:y + p.shape[0]] = p; y += p.shape[0]
    pngio.write(os.path.join(PREV, 'stages.png'), prev)
    print('DONE')

if __name__ == '__main__':
    main()
