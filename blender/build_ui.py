"""雙截龍 · TWIN DRAGON — UI atlas. Everything the page shows that is not the game world is rendered here:
the 雙截龍 TWIN DRAGON title logo (extruded text, the CJK glyphs from blender/fonts/NotoSerifTC-Regular.otf),
menu cards, hero cards, HUD plates, health-bar frames and fills, portraits, a bitmap digit font, the touch stick,
PUNCH / KICK / JUMP / ❚❚ buttons, panel plates for the pause / continue / game-over dialogs, the GO arrow, and the
intro and ending frames (kit backdrops with posed figures). Run:  blender --background --python blender/build_ui.py
Writes dist/assets/ui.png + ui.json and blender/previews/ui.png.
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
UPM = 100                      # UI pixels per unit
FONT = bpy.data.fonts.load(os.path.join(ROOT, 'blender', 'fonts', 'NotoSerifTC-Regular.otf'))

PINK = K.mat('UI pink', 'ff2d7a', 0.5, 0, 0.6); CYAN = K.mat('UI cyan', '2de0ff', 0.5, 0, 0.6); GOLD = K.mat('UI gold', 'ffe12d', 0.5, 0, 0.5)
INK = K.mat('UI ink', 'f4f0ff', 0.6); DARK = K.mat('UI dark', '15121c', 0.7); PLATE = K.mat('UI plate', '1c1826', 0.7, 0, 0, 0.86)
PLATE2 = K.mat('UI plate light', '2a2436', 0.7); RIM = K.mat('UI rim', '6a6280', 0.5); GLASS = K.mat('UI glass', 'ffffff', 0.6, 0, 0, 0.14)
RED = K.mat('UI red', 'c8262e', 0.6); BLUE = K.mat('UI blue', '2455c8', 0.6); GREEN = K.mat('UI green', '7dff4a', 0.5, 0, 0.5)
ORANGE = K.mat('UI orange', 'ff8a2a', 0.5, 0, 0.4); WHITE = K.mat('UI white', 'ffffff', 0.5, 0, 0.3)

# ------------------------------------------------------------------ builders (UI units; y is depth toward +Y, camera at -Y)
def text(body, size, ma, extrude=0.08, bevel=0.012, align='CENTER', font=FONT, loc=(0, 0, 0)):
    cu = bpy.data.curves.new('T', 'FONT'); cu.body = body; cu.size = size; cu.extrude = extrude; cu.bevel_depth = bevel; cu.bevel_resolution = 2
    cu.align_x = align; cu.align_y = 'CENTER'; cu.font = font
    o = bpy.data.objects.new('T', cu); bpy.context.scene.collection.objects.link(o); o.data.materials.append(ma)
    o.rotation_euler = (math.pi / 2, 0, 0); o.location = loc
    return o

def plate(w, h, ma, r=0.12, depth=0.08, loc=(0, 0, 0), rim=None):
    """Rounded rectangle plate standing up (faces the camera). Optional rim = a slightly larger plate behind it."""
    objs = []
    if rim is not None:
        objs += plate(w + 0.08, h + 0.08, rim, r + 0.03, depth * 0.6, (loc[0], loc[1] + 0.03, loc[2]))
    o = K.cube('plate', (loc[0], loc[1], loc[2]), (w, depth, h), ma)
    b = o.modifiers.new('bevel', 'BEVEL'); b.width = min(r, w / 2 - 0.01, h / 2 - 0.01); b.segments = 6; b.limit_method = 'NONE'
    objs.append(o); return objs

def disc(rad, ma, depth=0.08, loc=(0, 0, 0), verts=48):
    return K.cyl('disc', loc, rad, depth, ma, None, verts, (math.pi / 2, 0, 0))

def group(objs):
    root = K.empty('UI')
    for o in objs: o.parent = root
    return root

# ------------------------------------------------------------------ elements
def build_elements():
    E = {}
    def add(key, objs, w, h, ppm=UPM, outline=True, cam='flat', center=(0, 0)):
        E[key] = {'objs': objs, 'w': w, 'h': h, 'ppm': ppm, 'outline': outline, 'cam': cam, 'center': center}
    # title logo
    add('logo', [text('雙截龍', 1.7, GOLD, 0.12, 0.025, loc=(0, 0, 1.75)), text('TWIN', 1.85, PINK, 0.16, 0.025, loc=(-2.55, 0, 0.0)), text('DRAGON', 1.85, CYAN, 0.16, 0.025, loc=(1.75, 0, 0.0)),
                  K.cube('rule', (0, 0.1, -1.05), (8.6, 0.06, 0.06), RIM)], 10.4, 4.6)
    # menu cards (normal / cleared / locked) with the number badge disc on the left
    for key, badge, rim in (('card', PINK, None), ('card_done', GOLD, GOLD), ('card_lock', RIM, None)):
        add(key, plate(7.2, 1.3, PLATE, 0.16, 0.08, rim=rim) + [disc(0.42, badge, 0.1, (-3.1, -0.05, 0))], 7.6, 1.6)
    add('hero_card', plate(3.5, 1.15, PLATE, 0.16, 0.08), 3.8, 1.4)
    add('hero_card_on', plate(3.5, 1.15, PLATE2, 0.16, 0.08, rim=GOLD), 3.8, 1.4)
    # panels + banner + top HUD plate
    add('panel', plate(3.2, 3.0, PLATE, 0.2, 0.08, rim=RIM), 3.5, 3.3)
    add('panel_wide', plate(4.6, 2.2, PLATE, 0.2, 0.08, rim=RIM), 4.9, 2.5)
    add('banner', plate(7.0, 1.4, PLATE, 0.14, 0.06, rim=PINK), 7.3, 1.7)
    add('hud_top', plate(10.24, 0.9, PLATE, 0.0, 0.05), 10.24, 0.9, outline=False)
    add('bar_frame', plate(2.6, 0.2, DARK, 0.05, 0.05, rim=RIM), 2.7, 0.3, outline=False)
    add('bar_frame_boss', plate(5.2, 0.24, DARK, 0.05, 0.05, rim=GOLD), 5.3, 0.34, outline=False)
    # bar fills: stripes of emissive cubes so the toon light leaves a two-tone gradient look
    def fill(key, a, b, w=2.56, h=0.14):
        objs = []
        for i in range(16): objs.append(K.cube('f', (-w / 2 + (i + 0.5) * w / 16, 0, 0), (w / 16 + 0.002, 0.06, h), a if i < 8 else b))
        add(key, objs, w + 0.04, h + 0.04, outline=False)
    fill('fill_hero', CYAN, GREEN); fill('fill_foe', PINK, ORANGE); fill('fill_boss', PINK, GOLD, 5.12, 0.16); fill('fill_low', PINK, GOLD)
    # digits and glyphs
    for ch in '0123456789:/-+x♥':
        add('glyph_' + ch, [text(ch, 0.5, INK if ch != '♥' else PINK, 0.06, 0.01)], 0.42, 0.62)
    # touch controls
    add('stick_base', [disc(0.62, GLASS, 0.05), K.cyl('ring', (0, -0.02, 0), 0.62, 0.06, RIM, None, 48, (math.pi / 2, 0, 0)), K.cyl('ring2', (0, -0.03, 0), 0.5, 0.05, DARK, None, 48, (math.pi / 2, 0, 0))], 1.3, 1.3, outline=False)
    add('stick_knob', [disc(0.25, INK, 0.1)], 0.56, 0.56)
    add('btn_punch', [disc(0.42, PINK, 0.12), text('PUNCH', 0.15, INK, 0.02, 0.003, loc=(0, -0.08, -0.02))], 0.9, 0.9)
    add('btn_kick', [disc(0.31, CYAN, 0.12), text('KICK', 0.13, DARK, 0.02, 0.003, loc=(0, -0.08, -0.02))], 0.68, 0.68)
    add('btn_jump', [disc(0.31, INK, 0.12), text('JUMP', 0.13, DARK, 0.02, 0.003, loc=(0, -0.08, -0.02))], 0.68, 0.68)
    add('btn_pause', [disc(0.22, DARK, 0.1), K.cube('p1', (-0.05, -0.06, 0), (0.05, 0.02, 0.16), INK), K.cube('p2', (0.05, -0.06, 0), (0.05, 0.02, 0.16), INK)], 0.5, 0.5)
    add('btn_pill', plate(2.4, 0.5, GOLD, 0.25, 0.08), 2.5, 0.6)
    add('btn_pill_ghost', plate(2.4, 0.5, PLATE2, 0.25, 0.08, rim=RIM), 2.5, 0.6)
    add('btn_on', [disc(0.42, GOLD, 0.12)], 0.9, 0.9)
    # GO arrow
    add('go', [text('GO', 0.6, GOLD, 0.08, 0.012, loc=(-0.45, 0, 0)), K.cube('shaft', (0.45, 0, 0), (0.45, 0.08, 0.16), GOLD), K.cyl('head', (0.85, 0, 0), 0.26, 0.08, GOLD, None, 3, (math.pi / 2, 0, 0))], 2.6, 0.9)
    return E

def build_portraits(E):
    for name, spec in K.FIGURES.items():
        root = K.build_figure(name, spec); root.rotation_euler = (0, 0, S.YAW)
        S.pose_root(root, name, S.full(S.IDLE), 0, 0, 0)
        big = name.startswith('Hero')
        E['portrait_' + name] = {'objs': [root], 'w': 1.0 if big else 0.7, 'h': 1.0 if big else 0.7, 'ppm': 96, 'outline': True, 'cam': 'pitch', 'center': (0, 1.62 * spec.get('scale', 1.0))}

def build_scenes(E):
    """Intro (three frames) and ending (two frames): kit backdrops + posed figures, rendered with the sprite camera."""
    lib = {}
    for builder in (K.build_slum, K.build_hideout):
        for r in builder(): lib[r.name] = r; r.location = (-3000, 0, 0); r.hide_render = True
        for r in list(lib.values()):
            for c in r.children: c.hide_render = True
    def place(kind, x, z, yaw=0.0):
        root = lib[kind]; r = root.copy(); r.location = (x, -z, 0); r.rotation_euler = (0, 0, yaw); r.hide_render = False; bpy.context.scene.collection.objects.link(r)
        for c in root.children: c2 = c.copy(); c2.parent = r; c2.hide_render = False; bpy.context.scene.collection.objects.link(c2)
        return r
    def fig(name, x, z, pose, facing=1, lie=0.0, raise_=0.0):
        root = K.build_figure(name, K.FIGURES[name]); root.location = (x, -z, raise_)
        S.pose_root(root, name, pose, lie, 0, 0)
        if facing < 0: root.rotation_euler.z = math.pi / 2 + 0.38
        return root
    GM = K.mat('Ground night', '2c2d30', 0.95); SM = K.mat('Side night', '8f8a80', 0.95); GH = K.mat('Ground indoor', '4a4540', 0.95)
    def street(objs, cx):
        objs += [place('SlumWallA', cx - 4, 0), place('SlumWallB', cx + 4, 0), place('StreetLamp', cx - 1, 0.5), place('Dumpster', cx + 6.5, 0.7), place('CarA', cx + 5, 6.6),
                 K.cube('road', (cx, -4.6, -0.05), (24, 8.2, 0.1), GM), K.cube('side', (cx, 0.15, -0.04), (24, 1.7, 0.1), SM)]
    W = S.full
    # intro 0: Su Lin on the sidewalk, thugs closing in
    o = []; street(o, 0); o += [fig('Captive', 0, 3.0, W(S.IDLE), -1), fig('Thug', -3.4, 2.6, S.walk(0.8), 1), fig('Thug', 3.6, 3.3, S.walk(-0.8), -1)]
    E['intro_0'] = {'objs': o, 'w': 21.17, 'h': 8.7, 'ppm': 48, 'outline': False, 'cam': 'pitch', 'center': (0, 3.0)}
    # intro 1: the punch
    o = []; street(o, 0); o += [fig('Captive', 0.4, 3.0, W(S.POSE['hit']), -1), fig('Thug', -0.6, 2.9, W({**S.IDLE, **S.ATTACK['punchR'][1]}), 1), fig('Thug', 3.2, 3.3, W(S.IDLE), -1)]
    E['intro_1'] = {'objs': o, 'w': 21.17, 'h': 8.7, 'ppm': 48, 'outline': False, 'cam': 'pitch', 'center': (0, 3.0)}
    # intro 2: carried off
    o = []; street(o, 0); o += [fig('Thug', 2.0, 3.0, S.walk(0.9), 1), fig('Captive', 2.3, 3.0, W(S.POSE['held']), 1, 0.35, 0.55), fig('Thug', 4.2, 3.4, S.walk(-0.9), 1)]
    E['intro_2'] = {'objs': o, 'w': 21.17, 'h': 8.7, 'ppm': 48, 'outline': False, 'cam': 'pitch', 'center': (0, 3.0)}
    # ending 0: the throne room, cage open, Su Lin stepping out toward the hero
    def hideout(objs, cx):
        objs += [place('StoneWallA', cx - 4, 0), place('StoneWallB', cx + 4, 0), place('Pillar', cx - 7, 0.9), place('Torch', cx - 2, 0.3), place('Torch', cx + 6, 0.3), place('Throne', cx + 2, 0.9), place('Carpet', cx, 2.9),
                 K.cube('floor', (cx, -4.6, -0.05), (24, 8.2, 0.1), GH)]
    o = []; hideout(o, 0); o += [place('Cage', 5.5, 5.0), fig('Captive', 4.2, 4.0, S.walk(0.6), -1), fig('HeroBlue', 0.5, 3.4, W(S.IDLE), 1), fig('Boss', -4.5, 3.0, W(S.POSE['lying']), 1, 1.0)]
    E['ending_0'] = {'objs': o, 'w': 21.17, 'h': 8.7, 'ppm': 48, 'outline': False, 'cam': 'pitch', 'center': (0, 3.0)}
    o = []; hideout(o, 0); o += [place('Cage', 5.5, 5.0), fig('Captive', 1.6, 3.4, W(S.IDLE), -1), fig('HeroBlue', 0.2, 3.4, W(S.POSE['grab']), 1), fig('HeroRed', -1.9, 3.8, W(S.IDLE), 1), fig('Boss', -5.0, 3.0, W(S.POSE['lying']), 1, 1.0)]
    E['ending_1'] = {'objs': o, 'w': 21.17, 'h': 8.7, 'ppm': 48, 'outline': False, 'cam': 'pitch', 'center': (0, 3.0)}

# ------------------------------------------------------------------ render
def render_element(sc, cams, key, e):
    objs = e['objs']; w, h, ppm = e['w'], e['h'], e['ppm']
    W, H = int(round(w * ppm)) * S.SS, int(round(h * ppm)) * S.SS
    cam = cams[e['cam']]; sc.camera = cam
    sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
    cam.data.ortho_scale = max(w, h)
    cx, cz = e['center']
    if e['cam'] == 'flat':
        cam.location = (cx, -60, cz)
    else:
        center = Vector((cx, 0, cz / math.cos(S.PITCH))); d = Vector((0, math.cos(S.PITCH), -math.sin(S.PITCH))); cam.location = center - d * 120
    for o in bpy.data.objects:
        if o.type in ('MESH', 'FONT', 'EMPTY'): o.hide_render = True
    def show(o):
        o.hide_render = False
        for c in o.children: show(c)
    for o in objs: show(o)
    bpy.context.view_layer.update()
    path = os.path.join(TMP, f'ui_{key}.png'); sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = pngio.read(path).astype(np.float32) / 255.0
    if e['outline']: im = S.outline_and_downsample(img)
    else:
        a = img[..., 3]; prem = img[..., :3] * a[..., None]; hh, ww = a.shape
        prem = prem.reshape(hh // S.SS, S.SS, ww // S.SS, S.SS, 3).mean(axis=(1, 3)); al = a.reshape(hh // S.SS, S.SS, ww // S.SS, S.SS).mean(axis=(1, 3))
        rgb = np.where(al[..., None] > 1e-4, prem / np.maximum(al, 1e-4)[..., None], 0)
        im = np.clip(np.round(np.concatenate([rgb, al[..., None]], axis=2) * 255), 0, 255).astype(np.uint8)
    if key.startswith(('intro', 'ending')): im[..., 3] = 255
    return im

def main():
    sc, cam = S.setup_scene()
    flat = bpy.data.cameras.new('Flat'); flat.type = 'ORTHO'; flat.clip_end = 500
    fo = bpy.data.objects.new('Flat', flat); sc.collection.objects.link(fo); fo.rotation_euler = (math.pi / 2, 0, 0)
    cams = {'flat': fo, 'pitch': cam}
    E = build_elements(); build_portraits(E); build_scenes(E)
    S.toonify_all()
    sprites, meta = [], {}
    for key, e in E.items():
        im = render_element(sc, cams, key, e)
        im, tx, ty = S.trim(im)
        sprites.append((key, im)); meta[key] = {'w': int(im.shape[1]), 'h': int(im.shape[0])}
        print('UI', key, im.shape[1], im.shape[0])
    atlas, place = S.pack(sprites, width=2048, pad=2)
    for key in meta: meta[key]['x'], meta[key]['y'] = place[key][0], place[key][1]
    size = pngio.write(os.path.join(OUT, 'ui.png'), atlas)
    with open(os.path.join(OUT, 'ui.json'), 'w') as f: json.dump({'atlas': 'ui.png', 'width': int(atlas.shape[1]), 'height': int(atlas.shape[0]), 'sprites': meta}, f, separators=(',', ':'))
    print('ATLAS ui', atlas.shape[1], 'x', atlas.shape[0], size, 'bytes,', len(sprites), 'sprites')
    prev = atlas.copy(); bg = np.zeros_like(prev); bg[..., :3] = (60, 58, 70); bg[..., 3] = 255
    a = prev[..., 3:4].astype(np.float32) / 255; bg[..., :3] = (prev[..., :3] * a + bg[..., :3] * (1 - a)).astype(np.uint8)
    pngio.write(os.path.join(PREV, 'ui.png'), bg)
    print('DONE')

if __name__ == '__main__':
    main()
