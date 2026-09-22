"""雙截龍 · TWIN DRAGON — asset kit built with Blender's bpy API (Blender 5.2 LTS).
Run:  blender --background --python blender/build_assets.py
As a script it writes blender/glb/{figures,weapons,kit}.glb + kit.json, blender/TwinDragon_Kit.blend and blender/kit-preview.png.
As a module (build_sprites.py, build_stages.py, build_ui.py import it) it only provides the palette, primitives, build_figure, FIGURES,
build_weapons and the four stage-kit builders; the sprite pipeline renders those objects instead of exporting them.

Conventions: metres, Blender Z up, figures face +Y (glTF export flips to -Z, three.js "forward").
Backdrop pieces put their visible front at y = 0 and extend into +Y (behind, -Z in three), so the
side-scrolling camera at +Z sees the front. Everything is built from code here; nothing is hand-edited
or downloaded. Articulated parts are Empties (pivots) with joined mesh children so the runtime can swing
limbs by name: <Figure>_{Torso,Head,ArmL,ArmR,LegL,LegR}. Weapons are separate roots the runtime parents
to a hand.
"""
import bpy, math, random, os, json
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(1987)
MATS = {}
FOOT = {}   # piece name -> footprint {w, h, d} (three axes: x width, y height, z depth)

def lin(c):  # sRGB byte -> linear float
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def mat(name, hexcol, rough=0.7, metal=0.0, emit=0.0, alpha=1.0):
    if name in MATS: return MATS[name]
    r, g, b = (lin(int(hexcol[i:i + 2], 16)) for i in (0, 2, 4))
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (r, g, b, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit:
        p.inputs['Emission Color'].default_value = (r, g, b, 1); p.inputs['Emission Strength'].default_value = emit
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'
    m.diffuse_color = (r, g, b, alpha)
    MATS[name] = m
    return m

# palette -------------------------------------------------------------------------------------
SKIN = mat('Skin', 'd9a880'); SKIN2 = mat('Skin dark', 'a8734f'); SKIN3 = mat('Skin pale', 'e8c7a8')
HAIR = mat('Hair black', '0d0c0c'); HAIRBLOND = mat('Hair blond', 'd9b24a'); HAIRRED = mat('Hair red', '8a2d1a'); HAIRBROWN = mat('Hair brown', '3b2416')
BLUEVEST = mat('Vest blue', '2455c8', 0.6); REDVEST = mat('Vest red', 'c8262e', 0.6); PANTSBLUE = mat('Pants blue', '1d2b5e', 0.8); PANTSRED = mat('Pants red', '5e1d22', 0.8)
HEADBAND = mat('Headband', 'f2f2f2', 0.6); BOOT = mat('Boot', '2a2320', 0.9); RUBBER = mat('Rubber', '0e0e0e', 0.9)
TANK = mat('Tank green', '4f8a3a', 0.8); JEANS = mat('Jeans', '3b4a70', 0.85); CAP = mat('Cap orange', 'd9761f', 0.7)
LEO = mat('Leotard magenta', 'b2308f', 0.5); TIGHTS = mat('Tights', '3a2a4a', 0.7); BRUTEPANTS = mat('Brute pants', '2b2b2f', 0.9)
LEATHER = mat('Leather', '1a1a1d', 0.35); SHADES = mat('Sunglasses', '0a0a0c', 0.2, 0.3); COAT = mat('Coat green', '2f4a2a', 0.7); BOSSPANTS = mat('Boss pants', '1a1f1a', 0.8)
DRESS = mat('Dress', 'e9d1a2', 0.6); STEEL = mat('Steel', '8d949c', 0.35, 0.8); DARKSTEEL = mat('Dark steel', '4a4f55', 0.4, 0.7); GUNMETAL = mat('Gunmetal', '2b2e33', 0.3, 0.8)
WOOD = mat('Wood', '9a6a3a', 0.8); BAT = mat('Bat wood', 'c9a066', 0.6); DYNA = mat('Dynamite', 'c8302a', 0.6); FUSE = mat('Fuse', 'f2e2a0', 0.8)
WHIP = mat('Whip leather', '4a2a14', 0.7); DRUM = mat('Oil drum', '3a6ea5', 0.5, 0.4); DRUMRED = mat('Oil drum red', 'a5342a', 0.5, 0.4); CRATE = mat('Crate', 'b58a4a', 0.85)
# stage 1 slum
BRICK = mat('Brick', '6e3a2e', 0.95); BRICK2 = mat('Brick dark', '4a2820', 0.95); MORTAR = mat('Mortar', '8d7d6a', 0.95); WINDOW = mat('Window', '1a2230', 0.2, 0.2)
WINLIT = mat('Window lit', 'ffcf7a', 0.4, 0, 1.6); SHUTTER = mat('Shutter', '6f7378', 0.6, 0.4); GRAFFITI = [mat('Graffiti %d' % i, c, 0.8) for i, c in enumerate(['e83a8f', '2fc1e8', 'f5e23a', 'ffffff'])]
FENCE = mat('Chain fence', 'a9adb2', 0.4, 0.8); DUMP = mat('Dumpster green', '2f6a3a', 0.6, 0.2); CARBODY = mat('Car body', '7a3a8a', 0.4, 0.3); CARBODY2 = mat('Car body 2', 'c9b23a', 0.4, 0.3)
GLASS = mat('Glass', '1b2b38', 0.15, 0.2); LAMPPOLE = mat('Pole grey', '5b6066', 0.5, 0.6); LAMPLIGHT = mat('Lamp light', 'ffe7b0', 0.4, 0, 2.5)
HYDRANT = mat('Hydrant', 'd12b2b', 0.5); NEON = [mat('Neon %d' % i, c, 0.3, 0, 3.0) for i, c in enumerate(['ff2d7a', '2de0ff', 'ffe12d', '7dff4a'])]
SIGNBOARD = mat('Signboard', '15161a', 0.6); TRASH = mat('Trash bag', '202226', 0.5); ASPHALT = mat('Asphalt', '2c2d30', 0.98); CURB = mat('Curb', '9a958c', 0.9)
# stage 2 industrial
CORR = mat('Corrugated', '6f7a82', 0.6, 0.6); CORR2 = mat('Corrugated rust', '7a5a44', 0.8, 0.3); PIPE = mat('Pipe', '8a8f94', 0.4, 0.7); PIPEY = mat('Pipe yellow', 'd9b32a', 0.5, 0.3)
BELT = mat('Conveyor belt', '1f2022', 0.9); ROLLER = mat('Roller', '9aa0a6', 0.3, 0.8); HAZARD = mat('Hazard stripe', 'f2c400', 0.6); HAZARDK = mat('Hazard black', '141414', 0.6)
CONTAINER = [mat('Container %d' % i, c, 0.6, 0.3) for i, c in enumerate(['b8412e', '2e6bb8', '3f8f4a'])]; TRUCKCAB = mat('Truck cab', 'c8c8c0', 0.5, 0.3); TIRE = mat('Tire', '141414', 0.9)
SPIKE = mat('Spike', 'c8ccd0', 0.25, 0.9); CRANE = mat('Crane yellow', 'e0a020', 0.5, 0.4); CONCRETE = mat('Concrete', 'a9a49b', 0.9); CONCRETE2 = mat('Concrete dark', '7d7a74', 0.9)
# stage 3 forest
LEAF = mat('Leaf', '3f7a3a', 0.9); LEAF2 = mat('Leaf dark', '2b5a2c', 0.9); LEAF3 = mat('Leaf autumn', '9a6a2a', 0.9); TRUNK = mat('Trunk', '5b4633', 0.9)
ROCK = mat('Rock', '7d7a72', 0.95); ROCK2 = mat('Rock dark', '55524b', 0.95); CLIFF = mat('Cliff', '8a7a62', 0.95); MOSS = mat('Moss', '4f7a3a', 0.95)
ROPE = mat('Rope', 'b89a5a', 0.9); PLANK = mat('Plank', '8a6a3a', 0.9); WATER = mat('Water', '2a6a8a', 0.15, 0.2, 0, 0.8); THATCH = mat('Thatch', 'a8863a', 0.95)
# stage 4 hideout
STONE = mat('Stone', '6a6560', 0.95); STONE2 = mat('Stone dark', '46423e', 0.95); GOLD = mat('Gold', 'd4a520', 0.3, 0.9); TORCH = mat('Torch flame', 'ff8a2a', 0.5, 0, 4.0)
BANNER = mat('Banner', '7a1a24', 0.8); CARPET = mat('Carpet', '5a1a24', 0.95); IRON = mat('Iron', '3a3a3e', 0.5, 0.8); MARBLE = mat('Marble', 'c8c2b8', 0.4)

# primitives ----------------------------------------------------------------------------------
def _assign(o, name, ma, parent):
    o.name = name
    if ma is not None:
        o.data.materials.clear(); o.data.materials.append(ma)
    if parent is not None:
        o.parent = parent
    return o

def cube(name, loc, size, ma, parent=None, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.scale = size
    if rot: o.rotation_euler = rot
    return _assign(o, name, ma, parent)

def cyl(name, loc, r, depth, ma, parent=None, verts=12, rot=None, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc)
    o = bpy.context.object
    if rot: o.rotation_euler = rot
    return _assign(o, name, ma, parent)

def sphere(name, loc, r, ma, parent=None, seg=12, rings=8, scale=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.object
    if scale: o.scale = scale
    return _assign(o, name, ma, parent)

def beam(name, a, b, r, ma, parent=None, verts=8):
    a, b = Vector(a), Vector(b); d = b - a
    o = cyl(name, (a + b) / 2, r, d.length, ma, parent, verts)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); return o

def empty(name, loc=(0, 0, 0), parent=None):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=loc)
    o = bpy.context.object; o.name = name; o.empty_display_size = 0.1
    if parent is not None: o.parent = parent
    return o

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object; o.name = name
    bpy.ops.object.shade_flat()
    return o

def piece(name, objs, foot=None):
    """A stage piece: root Empty at the origin with one joined mesh child. Records the footprint."""
    root = empty(name)
    m = join(objs, name + '_Mesh'); m.parent = root
    if foot is None:
        xs = [(m.matrix_world @ Vector(c)) for c in m.bound_box]
        foot = {'w': round(max(v.x for v in xs) - min(v.x for v in xs), 2), 'h': round(max(v.z for v in xs) - min(v.z for v in xs), 2), 'd': round(max(v.y for v in xs) - min(v.y for v in xs), 2)}
    FOOT[name] = foot
    return root

def select_tree(o):
    o.select_set(True)
    for c in o.children: select_tree(c)

def export(roots, filename, outdir):
    bpy.ops.object.select_all(action='DESELECT')
    for r in roots: select_tree(r)
    bpy.ops.export_scene.gltf(filepath=os.path.join(outdir, filename), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True)
    print('EXPORTED', filename)

# figures -------------------------------------------------------------------------------------
def build_figure(name, spec):
    """Humanoid, 1.75 m × spec.scale, faces +Y. Pivots: Torso, Head, ArmL, ArmR, LegL, LegR (all children of the root)."""
    top, bottom, skin, hair = spec['top'], spec['bottom'], spec.get('skin', SKIN), spec.get('hair', HAIR)
    role = spec.get('role', ''); bulk = spec.get('bulk', 1.0)
    root = empty(name)
    for side, sx in (('L', -1), ('R', 1)):
        leg = empty(name + '_Leg' + side, (sx * 0.1, 0, 0.95), root)
        parts = [cyl('thigh', (sx * 0.1, 0, 0.73), 0.075 * bulk, 0.46, bottom, None, 10),
                 cyl('shin', (sx * 0.1, 0, 0.30), 0.06 * bulk, 0.44, bottom if role != 'whip' else TIGHTS, None, 10),
                 cube('shoe', (sx * 0.1, 0.04, 0.05), (0.11 * bulk, 0.27, 0.09), BOOT)]
        if role == 'whip': parts.append(cyl('bootcuff', (sx * 0.1, 0, 0.20), 0.07, 0.3, BOOT, None, 10))
        m = join(parts, 'Leg' + side + '_Mesh'); m.parent = leg; m.matrix_parent_inverse = leg.matrix_world.inverted()
    torso = empty(name + '_Torso', (0, 0, 0.95), root)
    tparts = [cube('chest', (0, 0, 1.24), (0.38 * bulk, 0.21 * bulk, 0.56), top), cyl('neck', (0, 0, 1.53), 0.05, 0.06, skin, None, 8),
              cube('belt', (0, 0, 0.97), (0.36 * bulk, 0.22 * bulk, 0.06), RUBBER)]
    if role in ('hero',):
        tparts.append(cube('vestL', (-0.12, -0.115, 1.26), (0.1, 0.02, 0.5), top)); tparts.append(cube('vestR', (0.12, -0.115, 1.26), (0.1, 0.02, 0.5), top))
        tparts.append(cube('shirt', (0, -0.11, 1.24), (0.14, 0.01, 0.48), skin))  # open vest shows chest
    if role == 'brute':
        tparts.append(cube('pecs', (0, -0.12, 1.36), (0.44, 0.06, 0.16), skin)); tparts.append(cube('abs', (0, -0.12, 1.12), (0.3, 0.04, 0.26), skin))
    if role == 'boss':
        tparts.append(cube('coat', (0, 0, 1.15), (0.46, 0.27, 0.74), COAT)); tparts.append(cube('lapel', (0, -0.14, 1.36), (0.2, 0.01, 0.3), BOSSPANTS))
    if role == 'knife':
        tparts.append(cube('jacket', (0, 0, 1.24), (0.42, 0.25, 0.56), LEATHER)); tparts.append(cube('zip', (0, -0.13, 1.24), (0.02, 0.01, 0.5), STEEL))
    if role == 'captive':
        tparts.append(cube('skirt', (0, 0, 0.72), (0.4, 0.26, 0.5), DRESS))
    m = join(tparts, 'Torso_Mesh'); m.parent = torso; m.matrix_parent_inverse = torso.matrix_world.inverted()
    head = empty(name + '_Head', (0, 0, 1.55), root)
    hparts = [sphere('skull', (0, 0, 1.65), 0.115, skin)]
    hs = spec.get('hairstyle', 'short')
    if hs == 'short': hparts.append(sphere('hair', (0, -0.015, 1.68), 0.118, hair, None, 12, 8, (1, 1, 0.75)))
    if hs == 'long':
        hparts.append(sphere('hair', (0, -0.01, 1.68), 0.12, hair, None, 12, 8, (1, 1, 0.8))); hparts.append(cube('mane', (0, 0.08, 1.5), (0.22, 0.1, 0.34), hair))
    if hs == 'mohawk': hparts.append(cube('mohawk', (0, 0, 1.76), (0.05, 0.22, 0.09), hair))
    if hs == 'bald': pass
    if hs == 'cap':
        hparts.append(sphere('hair', (0, -0.015, 1.68), 0.118, hair, None, 12, 8, (1, 1, 0.75)))
        hparts.append(sphere('cap', (0, 0, 1.70), 0.125, CAP, None, 12, 8, (1, 1, 0.6))); hparts.append(cube('brim', (0, -0.15, 1.69), (0.2, 0.12, 0.02), CAP))
    if role == 'hero': hparts.append(cyl('band', (0, 0, 1.69), 0.122, 0.035, HEADBAND, None, 14))
    if role in ('knife', 'boss'): hparts.append(cube('shades', (0, -0.1, 1.67), (0.2, 0.03, 0.05), SHADES))
    if role == 'boss': hparts.append(cube('beard', (0, -0.09, 1.58), (0.14, 0.05, 0.06), HAIRBROWN))
    m = join(hparts, 'Head_Mesh'); m.parent = head; m.matrix_parent_inverse = head.matrix_world.inverted()
    for side, sx in (('L', -1), ('R', 1)):
        ax = sx * (0.235 + 0.04 * (bulk - 1))
        arm = empty(name + '_Arm' + side, (ax, 0, 1.45), root)
        sleeve = top if role in ('boss', 'knife') else skin
        if role == 'boss': sleeve = COAT
        if role == 'knife': sleeve = LEATHER
        parts = [cyl('upper', (ax, 0, 1.30), 0.052 * bulk, 0.32, sleeve, None, 10),
                 cyl('fore', (ax, 0, 1.00), 0.045 * bulk, 0.30, skin if role not in ('boss', 'knife') else sleeve, None, 10),
                 sphere('hand', (ax, 0, 0.83), 0.05 * bulk, skin)]
        if role == 'whip': parts.append(cyl('glove', (ax, 0, 0.93), 0.05, 0.18, LEO, None, 10))
        m = join(parts, 'Arm' + side + '_Mesh'); m.parent = arm; m.matrix_parent_inverse = arm.matrix_world.inverted()
    if spec.get('scale', 1.0) != 1.0:
        root.scale = (spec['scale'],) * 3
    return root

FIGURES = {
    'HeroBlue': dict(top=BLUEVEST, bottom=PANTSBLUE, role='hero', hair=HAIR),
    'HeroRed': dict(top=REDVEST, bottom=PANTSRED, role='hero', hair=HAIRBLOND),
    'Thug': dict(top=TANK, bottom=JEANS, role='thug', hair=HAIRBROWN, hairstyle='cap', skin=SKIN2),
    'Whip': dict(top=LEO, bottom=TIGHTS, role='whip', hair=HAIRRED, hairstyle='long', skin=SKIN3),
    'Brute': dict(top=SKIN2, bottom=BRUTEPANTS, role='brute', hair=HAIR, hairstyle='mohawk', skin=SKIN2, bulk=1.35, scale=1.22),
    'Knife': dict(top=LEATHER, bottom=JEANS, role='knife', hair=HAIRBLOND, hairstyle='short'),
    'Boss': dict(top=COAT, bottom=BOSSPANTS, role='boss', hair=HAIRBROWN, hairstyle='short', bulk=1.1, scale=1.08),
    'Captive': dict(top=DRESS, bottom=DRESS, role='captive', hair=HAIRBROWN, hairstyle='long', skin=SKIN3),
}

# weapons (origin = grip point, blade/handle along +Z so the runtime can orient them) ------------
def build_weapons():
    ws = []
    ws.append(piece('W_Bat', [cyl('grip', (0, 0, 0.08), 0.02, 0.2, BAT, None, 10), cyl('barrel', (0, 0, 0.5), 0.02, 0.65, BAT, None, 10, None, 0.038)], {'w': 0.08, 'h': 0.85, 'd': 0.08}))
    ws.append(piece('W_Knife', [cyl('handle', (0, 0, 0.05), 0.014, 0.11, LEATHER, None, 8), cube('guard', (0, 0, 0.11), (0.06, 0.02, 0.012), STEEL), cube('blade', (0, 0, 0.21), (0.028, 0.006, 0.19), STEEL)], {'w': 0.06, 'h': 0.32, 'd': 0.03}))
    ws.append(piece('W_Whip', [cyl('handle', (0, 0, 0.1), 0.016, 0.22, WHIP, None, 8)] + [beam('lash%d' % i, (0, 0, 0.21 + i * 0.28), (0, 0.06 * (i + 1), 0.21 + (i + 1) * 0.28), 0.009 - i * 0.002, WHIP) for i in range(3)], {'w': 0.05, 'h': 1.1, 'd': 0.25}))
    ws.append(piece('W_Dynamite', [cyl('stick', (0, 0, 0.09), 0.025, 0.18, DYNA, None, 10), cyl('stick2', (0.04, 0.02, 0.09), 0.025, 0.18, DYNA, None, 10), beam('fuse', (0, 0, 0.18), (0.03, -0.03, 0.26), 0.005, FUSE)], {'w': 0.1, 'h': 0.27, 'd': 0.08}))
    ws.append(piece('W_Gun', [cube('body', (0, 0, 0.18), (0.05, 0.08, 0.36), GUNMETAL), cyl('barrel', (0, 0.01, 0.5), 0.014, 0.3, GUNMETAL, None, 8), cube('mag', (0, -0.09, 0.14), (0.04, 0.12, 0.08), GUNMETAL), cube('stock', (0, 0, -0.08), (0.04, 0.06, 0.18), WOOD)], {'w': 0.06, 'h': 0.8, 'd': 0.2}))
    # ground-only heavies: origin at base centre
    ws.append(piece('W_Drum', [cyl('drum', (0, 0, 0.44), 0.29, 0.88, DRUM, None, 16), cyl('rim1', (0, 0, 0.3), 0.3, 0.03, DARKSTEEL, None, 16), cyl('rim2', (0, 0, 0.6), 0.3, 0.03, DARKSTEEL, None, 16), cyl('lid', (0, 0, 0.885), 0.27, 0.02, DARKSTEEL, None, 16)]))
    ws.append(piece('W_Crate', [cube('box', (0, 0, 0.3), (0.6, 0.6, 0.6), CRATE), cube('slatA', (0, -0.31, 0.3), (0.62, 0.02, 0.08), WOOD), cube('slatB', (0, -0.31, 0.3), (0.08, 0.02, 0.62), WOOD), cube('slatC', (-0.31, 0, 0.3), (0.02, 0.62, 0.08), WOOD)]))
    ws.append(piece('W_Boulder', [sphere('rock', (0, 0, 0.45), 0.45, ROCK, None, 10, 7, (1, 0.95, 0.9)), sphere('rock2', (0.15, 0.1, 0.5), 0.3, ROCK2, None, 8, 6)]))
    return ws

# stage kits ----------------------------------------------------------------------------------
def windows(parts, x0, x1, z0, z1, cols, rows, lit=0.35, depth=0.02, w=0.7, h=0.9, ma_dark=WINDOW, ma_lit=WINLIT):
    for i in range(cols):
        for j in range(rows):
            x = x0 + (x1 - x0) * (i + 0.5) / cols; z = z0 + (z1 - z0) * (j + 0.5) / rows
            parts.append(cube('win', (x, -depth, z), (w, 0.04, h), ma_lit if random.random() < lit else ma_dark))

def build_slum():
    k = []
    # brick tenement wall segment 8 m wide, 9 m tall, front at y=0
    for v, (bm, tag) in enumerate([(BRICK, 'A'), (BRICK2, 'B')]):
        parts = [cube('wall', (0, 2.0, 4.5), (8, 4, 9), bm), cube('ledge', (0, -0.05, 3.05), (8.2, 0.3, 0.12), MORTAR), cube('ledge2', (0, -0.05, 6.05), (8.2, 0.3, 0.12), MORTAR)]
        windows(parts, -3.4, 3.4, 3.6, 8.4, 4, 2, 0.4 if v == 0 else 0.25)
        parts.append(cube('shop', (0, -0.06, 1.3), (5.5, 0.12, 2.6), SHUTTER))
        for i in range(6): parts.append(cube('slat', (0, -0.14, 0.35 + i * 0.42), (5.5, 0.02, 0.06), DARKSTEEL))
        parts.append(cube('sign', (0, -0.2, 2.85), (5.8, 0.1, 0.5), SIGNBOARD)); parts.append(cube('neon', (-1.2 + v, -0.28, 2.85), (2.2, 0.04, 0.22), NEON[v]))
        for g in range(3): parts.append(cube('graf', (-3 + g * 2.5 + v, -0.05, 1.0 + g * 0.35), (0.9, 0.03, 0.4), GRAFFITI[(g + v) % 4]))
        k.append(piece('SlumWall' + tag, parts))
    # garage with roller door, 6 m wide
    parts = [cube('wall', (0, 2.0, 2.5), (6, 4, 5), BRICK2), cube('door', (0, -0.05, 1.7), (4.2, 0.1, 3.4), SHUTTER)]
    for i in range(8): parts.append(cube('rib', (0, -0.12, 0.3 + i * 0.42), (4.2, 0.02, 0.05), DARKSTEEL))
    parts.append(cube('graf', (0, -0.12, 1.4), (2.4, 0.03, 0.9), GRAFFITI[0])); parts.append(cube('graf2', (0.4, -0.13, 1.5), (1.2, 0.03, 0.5), GRAFFITI[3]))
    k.append(piece('Garage', parts))
    # chain-link fence 4 m
    parts = [cyl('postL', (-2, 0, 1.1), 0.04, 2.2, LAMPPOLE, None, 8), cyl('postR', (2, 0, 1.1), 0.04, 2.2, LAMPPOLE, None, 8), cube('rail', (0, 0, 2.15), (4, 0.04, 0.04), LAMPPOLE), cube('mesh', (0, 0, 1.1), (4, 0.01, 2.0), mat('Fence mesh', 'a9adb2', 0.4, 0.8, 0, 0.35))]
    for i in range(1, 8): parts.append(cube('wire', (-2 + i * 0.5, 0, 1.1), (0.012, 0.012, 2.0), FENCE))
    k.append(piece('ChainFence', parts))
    # dumpster
    k.append(piece('Dumpster', [cube('body', (0, 0, 0.7), (1.8, 1.0, 1.2), DUMP), cube('lid', (0, 0, 1.36), (1.85, 1.05, 0.12), DUMP), cube('lidrib', (0, 0, 1.44), (1.85, 0.2, 0.05), DARKSTEEL), cube('legs', (0, 0, 0.06), (1.6, 0.8, 0.12), DARKSTEEL)]))
    # parked car wreck 4.4 m
    for v, cb in enumerate([CARBODY, CARBODY2]):
        parts = [cube('body', (0, 0, 0.6), (4.4, 1.8, 0.7), cb), cube('cabin', (-0.2, 0, 1.2), (2.4, 1.7, 0.6), cb), cube('glassF', (1.0, 0, 1.2), (0.05, 1.5, 0.5), GLASS), cube('glassS', (-0.2, 0, 1.2), (2.2, 1.75, 0.45), GLASS)]
        for wx, wy in ((-1.4, -0.9), (-1.4, 0.9), (1.4, -0.9), (1.4, 0.9)): parts.append(cyl('wheel', (wx, wy, 0.35), 0.35, 0.25, TIRE, None, 12, (math.radians(90), 0, 0)))
        k.append(piece('Car' + 'AB'[v], parts))
    # street lamp
    k.append(piece('StreetLamp', [cyl('pole', (0, 0, 3.0), 0.06, 6.0, LAMPPOLE, None, 8), cyl('base', (0, 0, 0.15), 0.16, 0.3, LAMPPOLE, None, 8), beam('arm', (0, 0, 5.9), (0, -1.4, 6.2), 0.05, LAMPPOLE), cube('head', (0, -1.5, 6.15), (0.5, 0.35, 0.18), LAMPPOLE), cube('light', (0, -1.5, 6.05), (0.44, 0.3, 0.05), LAMPLIGHT)]))
    # hydrant
    k.append(piece('Hydrant', [cyl('body', (0, 0, 0.35), 0.11, 0.7, HYDRANT, None, 10), sphere('cap', (0, 0, 0.72), 0.11, HYDRANT), cyl('nozL', (-0.14, 0, 0.42), 0.05, 0.14, HYDRANT, None, 8, (0, math.radians(90), 0)), cyl('nozR', (0.14, 0, 0.42), 0.05, 0.14, HYDRANT, None, 8, (0, math.radians(90), 0))]))
    # trash bags pile
    k.append(piece('TrashPile', [sphere('b%d' % i, (random.uniform(-0.5, 0.5), random.uniform(-0.2, 0.2), 0.3 + random.uniform(-0.05, 0.1)), random.uniform(0.28, 0.36), TRASH, None, 8, 6, (1, 0.9, 0.75)) for i in range(4)]))
    # neon sign on a pole (standalone)
    k.append(piece('NeonSign', [cyl('pole', (0, 0.3, 1.8), 0.05, 3.6, LAMPPOLE, None, 8), cube('board', (0, 0.3, 4.0), (1.2, 0.15, 0.9), SIGNBOARD), cube('n1', (0, 0.2, 4.15), (0.9, 0.04, 0.16), NEON[2]), cube('n2', (0, 0.2, 3.85), (0.7, 0.04, 0.16), NEON[0])]))
    # billboard (background)
    k.append(piece('Billboard', [cube('board', (0, 0.4, 7.5), (7, 0.2, 3.2), SIGNBOARD), cube('face', (0, 0.28, 7.5), (6.6, 0.04, 2.8), mat('Billboard face', '3a2a5a', 0.7)), cube('t1', (-1.2, 0.24, 7.9), (3.4, 0.03, 0.5), NEON[1]), cube('t2', (0.6, 0.24, 7.1), (4.2, 0.03, 0.5), NEON[3]), cyl('legL', (-2.5, 0.4, 3.0), 0.08, 6.0, LAMPPOLE, None, 8), cyl('legR', (2.5, 0.4, 3.0), 0.08, 6.0, LAMPPOLE, None, 8)]))
    return k

def build_industrial():
    k = []
    for v, (cm, tag) in enumerate([(CORR, 'A'), (CORR2, 'B')]):
        parts = [cube('wall', (0, 2.0, 4.0), (8, 4, 8), cm)]
        for i in range(16): parts.append(cube('rib', (-3.75 + i * 0.5, -0.03, 4.0), (0.12, 0.06, 8), CORR2 if v == 0 else CORR))
        windows(parts, -3.4, 3.4, 5.5, 7.6, 4, 1, 0.5, 0.06, 1.2, 1.4)
        parts.append(cube('pipe', (0, -0.25, 2.6), (8, 0.18, 0.18), PIPE)); parts.append(cube('pipe2', (0, -0.25, 3.0), (8, 0.12, 0.12), PIPEY))
        parts.append(cube('stripe', (0, -0.04, 0.5), (8, 0.02, 0.3), HAZARD))
        for i in range(8): parts.append(cube('stripek', (-3.5 + i * 1.0, -0.05, 0.5), (0.5, 0.02, 0.3), HAZARDK, None, (0, 0, 0)))
        k.append(piece('FactoryWall' + tag, parts))
    # conveyor belt segment 4 m (belt moves the player in the sim)
    parts = [cube('frame', (0, 0, 0.35), (4, 1.6, 0.5), DARKSTEEL), cube('belt', (0, 0, 0.62), (4, 1.4, 0.06), BELT)]
    for i in range(9): parts.append(cyl('roller', (-1.8 + i * 0.45, 0, 0.66), 0.06, 1.45, ROLLER, None, 8, (math.radians(90), 0, 0)))
    parts.append(cube('legL', (-1.7, 0, 0.1), (0.15, 1.5, 0.2), DARKSTEEL)); parts.append(cube('legR', (1.7, 0, 0.1), (0.15, 1.5, 0.2), DARKSTEEL))
    k.append(piece('Conveyor', parts))
    # crane gantry with hook (background)
    k.append(piece('Crane', [cube('beam', (0, 1.0, 7.0), (10, 0.5, 0.5), CRANE), cyl('legL', (-4.5, 1.0, 3.4), 0.18, 6.8, CRANE, None, 8), cyl('legR', (4.5, 1.0, 3.4), 0.18, 6.8, CRANE, None, 8), cube('trolley', (1.0, 1.0, 6.55), (1.0, 0.7, 0.4), DARKSTEEL), beam('cable', (1.0, 1.0, 6.4), (1.0, 1.0, 4.2), 0.02, DARKSTEEL), cube('hook', (1.0, 1.0, 4.0), (0.25, 0.1, 0.5), STEEL)]))
    # barrel stack
    k.append(piece('BarrelStack', [cyl('b1', (-0.32, 0, 0.44), 0.29, 0.88, DRUMRED, None, 14), cyl('b2', (0.32, 0, 0.44), 0.29, 0.88, DRUM, None, 14), cyl('b3', (0, 0, 1.32), 0.29, 0.88, DRUMRED, None, 14)]))
    # shipping container 6 m
    for v in range(3):
        parts = [cube('box', (0, 1.2, 1.3), (6.0, 2.4, 2.6), CONTAINER[v])]
        for i in range(12): parts.append(cube('rib', (-2.75 + i * 0.5, -0.03, 1.3), (0.1, 0.06, 2.5), CONTAINER[v]))
        parts.append(cube('doorline', (0, -0.05, 1.3), (0.04, 0.02, 2.5), DARKSTEEL))
        k.append(piece('Container' + 'ABC'[v], parts))
    # truck 7 m
    parts = [cube('trailer', (-1.2, 0, 2.0), (4.8, 2.3, 2.6), TRUCKCAB), cube('cab', (2.4, 0, 1.6), (2.0, 2.2, 1.9), CONTAINER[0]), cube('glass', (3.42, 0, 1.9), (0.05, 1.9, 0.8), GLASS), cube('chassis', (0, 0, 0.6), (7.0, 2.0, 0.3), DARKSTEEL)]
    for wx in (-2.6, -1.4, 2.2):
        for wy in (-1.0, 1.0): parts.append(cyl('wheel', (wx, wy, 0.5), 0.5, 0.35, TIRE, None, 12, (math.radians(90), 0, 0)))
    k.append(piece('Truck', parts))
    # spike pit hazard 3 m (floor piece)
    parts = [cube('pit', (0, 0, -0.5), (3, 2.2, 1.0), STONE2)]
    for i in range(6):
        for j in range(4): parts.append(cyl('spike', (-1.25 + i * 0.5, -0.8 + j * 0.53, -0.35), 0.06, 0.9, SPIKE, None, 6, None, 0.0))
    k.append(piece('SpikePit', parts, {'w': 3, 'h': 0.1, 'd': 2.2}))
    # smokestack (background)
    k.append(piece('Smokestack', [cyl('stack', (0, 1.5, 7.0), 0.9, 14.0, BRICK2, None, 14, None, 0.7), cyl('band', (0, 1.5, 13.6), 0.75, 0.3, HAZARD, None, 14)]))
    # gantry walkway (background)
    k.append(piece('Gantry', [cube('walk', (0, 1.5, 4.5), (8, 1.2, 0.15), DARKSTEEL), cube('rail', (0, 0.95, 5.05), (8, 0.04, 0.04), STEEL), cube('rail2', (0, 0.95, 4.8), (8, 0.04, 0.04), STEEL)] + [cyl('post', (-3.8 + i * 1.9, 0.95, 4.8), 0.025, 0.6, STEEL, None, 6) for i in range(5)] + [cyl('leg', (-3.5 + i * 7, 1.5, 2.25), 0.12, 4.5, DARKSTEEL, None, 8) for i in range(2)]))
    # concrete barrier
    k.append(piece('Barrier', [cube('base', (0, 0, 0.25), (2.0, 0.6, 0.5), CONCRETE), cube('top', (0, 0, 0.65), (2.0, 0.3, 0.3), CONCRETE2), cube('stripe', (0, -0.31, 0.25), (2.0, 0.02, 0.3), HAZARD)]))
    return k

def build_forest():
    k = []
    for v, (lm, tag) in enumerate([(LEAF, 'A'), (LEAF2, 'B'), (LEAF3, 'C')]):
        parts = [cyl('trunk', (0, 0, 1.8), 0.22, 3.6, TRUNK, None, 8, None, 0.16), sphere('c1', (0, 0, 4.4), 1.5, lm, None, 10, 7, (1, 1, 0.8)), sphere('c2', (-0.9, 0.3, 3.9), 1.1, lm, None, 8, 6), sphere('c3', (0.9, -0.2, 4.0), 1.0, lm, None, 8, 6)]
        k.append(piece('Tree' + tag, parts, {'w': 3.0, 'h': 5.9, 'd': 3.0}))
    k.append(piece('Bush', [sphere('b1', (0, 0, 0.5), 0.55, LEAF2, None, 8, 6, (1, 0.9, 0.8)), sphere('b2', (0.45, 0.1, 0.4), 0.4, LEAF, None, 8, 6), sphere('b3', (-0.4, -0.1, 0.42), 0.38, LEAF, None, 8, 6)]))
    k.append(piece('Rock', [sphere('r1', (0, 0, 0.5), 0.7, ROCK, None, 8, 6, (1, 0.8, 0.7)), sphere('r2', (0.5, 0.2, 0.35), 0.45, ROCK2, None, 7, 5)]))
    # cliff wall segment 8 m (backdrop)
    CLIFF2 = mat('Cliff shade', '76684f', 0.95)
    parts = [cube('cliff', (0, 1.25, 3.1), (8, 2.5, 6.2), CLIFF), cube('strata', (0, -0.05, 1.6), (8, 0.1, 0.35), ROCK2), cube('strata2', (0, -0.05, 4.3), (8, 0.1, 0.4), ROCK2), cube('moss', (-2, -0.06, 0.5), (3, 0.05, 0.8), MOSS), cube('top', (0, 1.25, 6.3), (8.2, 2.7, 0.3), MOSS)]
    for i in range(4): parts.append(sphere('bump', (-3.0 + i * 2.0, -0.08, random.uniform(0.8, 5.4)), random.uniform(0.35, 0.6), CLIFF2, None, 7, 5))
    k.append(piece('Cliff', parts))
    # rope bridge segment 4 m (walkable floor piece over the gorge)
    parts = [cube('plank%d' % i, (-1.8 + i * 0.4, 0, 0.05), (0.32, 2.0, 0.08), PLANK) for i in range(10)]
    parts += [cube('ropeL', (0, -1.05, 0.05), (4, 0.05, 0.05), ROPE), cube('ropeR', (0, 1.05, 0.05), (4, 0.05, 0.05), ROPE), cube('railL', (0, -1.05, 1.0), (4, 0.04, 0.04), ROPE), cube('railR', (0, 1.05, 1.0), (4, 0.04, 0.04), ROPE)]
    for i in range(3): parts += [cyl('postL', (-1.6 + i * 1.6, -1.05, 0.5), 0.04, 1.0, TRUNK, None, 6), cyl('postR', (-1.6 + i * 1.6, 1.05, 0.5), 0.04, 1.0, TRUNK, None, 6)]
    k.append(piece('Bridge', parts, {'w': 4, 'h': 1.0, 'd': 2.2}))
    # log (obstacle)
    k.append(piece('Log', [cyl('log', (0, 0, 0.35), 0.35, 3.0, TRUNK, None, 10, (0, math.radians(90), 0)), cyl('ring', (1.51, 0, 0.35), 0.33, 0.02, PLANK, None, 10, (0, math.radians(90), 0))]))
    k.append(piece('Stump', [cyl('stump', (0, 0, 0.3), 0.4, 0.6, TRUNK, None, 10), cyl('top', (0, 0, 0.61), 0.38, 0.02, PLANK, None, 10)]))
    # gorge water (floor decoration, below the bridge)
    k.append(piece('Gorge', [cube('water', (0, 0, -3.0), (8, 6, 0.1), WATER), cube('bankL', (-4.2, 0, -1.6), (0.6, 6, 3.2), ROCK2), cube('bankR', (4.2, 0, -1.6), (0.6, 6, 3.2), ROCK2)], {'w': 8, 'h': 0.1, 'd': 6}))
    # hut (backdrop)
    k.append(piece('Hut', [cube('wall', (0, 1.5, 1.4), (4, 3, 2.8), PLANK), cyl('roof', (0, 1.5, 3.4), 2.9, 1.4, THATCH, None, 4, (0, 0, math.radians(45)), 0.05), cube('door', (0, -0.05, 1.0), (0.9, 0.1, 2.0), STONE2)]))
    k.append(piece('Waterfall', [cube('rock', (0, 2.0, 3.1), (5, 4, 6.2), CLIFF), cube('fall', (0, -0.15, 3.1), (1.6, 0.2, 6.2), mat('Falls', 'cfe8f2', 0.2, 0, 0.3, 0.75)), cube('pool', (0, -0.6, 0.05), (4, 1.2, 0.1), WATER)]))
    return k

def build_hideout():
    k = []
    for v, tag in enumerate('AB'):
        parts = [cube('wall', (0, 2.0, 4.0), (8, 4, 8), STONE if v == 0 else STONE2)]
        for j in range(8):
            for i in range(8): parts.append(cube('block', (-3.5 + i * 1.0 + (0.5 if j % 2 else 0), -0.03, 0.5 + j * 1.0), (0.94, 0.06, 0.94), STONE2 if (i + j + v) % 3 else STONE))
        parts.append(cube('banner', (0, -0.12, 5.0), (1.4, 0.04, 3.0), BANNER)); parts.append(cube('bannerbar', (0, -0.14, 6.55), (1.6, 0.06, 0.06), GOLD))
        parts.append(cube('emblem', (0, -0.15, 5.2), (0.6, 0.02, 0.6), GOLD))
        k.append(piece('StoneWall' + tag, parts))
    k.append(piece('Pillar', [cyl('col', (0, 0, 3.0), 0.45, 6.0, MARBLE, None, 12), cube('cap', (0, 0, 6.1), (1.2, 1.2, 0.3), STONE), cube('base', (0, 0, 0.15), (1.2, 1.2, 0.3), STONE)]))
    k.append(piece('Torch', [cyl('bracket', (0, 0.1, 1.9), 0.05, 0.5, IRON, None, 6), cyl('bowl', (0, 0, 2.2), 0.16, 0.25, IRON, None, 8, None, 0.06), sphere('flame', (0, 0, 2.45), 0.16, TORCH, None, 8, 6, (1, 1, 1.6))]))
    k.append(piece('Statue', [cube('plinth', (0, 0, 0.4), (1.2, 1.2, 0.8), STONE2), cyl('body', (0, 0, 1.8), 0.32, 2.0, MARBLE, None, 10, None, 0.28), sphere('head', (0, 0, 3.05), 0.28, MARBLE), cube('armL', (-0.45, -0.2, 2.3), (0.18, 0.5, 0.18), MARBLE), cube('armR', (0.45, -0.2, 2.1), (0.18, 0.18, 0.9), MARBLE)]))
    k.append(piece('Door', [cube('frame', (0, 0.3, 2.2), (3.2, 0.6, 4.4), STONE2), cube('door', (0, -0.05, 2.0), (2.4, 0.15, 4.0), WOOD), cube('bandA', (0, -0.14, 1.0), (2.4, 0.03, 0.15), IRON), cube('bandB', (0, -0.14, 3.0), (2.4, 0.03, 0.15), IRON), sphere('knob', (0.7, -0.18, 2.0), 0.08, GOLD)]))
    # spike wall hazard (slides out of the wall in the sim)
    parts = [cube('block', (0, 0.4, 1.2), (2.0, 0.8, 2.4), STONE2)]
    for i in range(4):
        for j in range(5): parts.append(cyl('spike', (-0.75 + i * 0.5, -0.4, 0.3 + j * 0.5), 0.05, 0.7, SPIKE, None, 6, (math.radians(90), 0, 0), 0.0))
    k.append(piece('SpikeWall', parts))
    k.append(piece('Throne', [cube('seat', (0, 0, 0.5), (1.4, 1.2, 0.5), GOLD), cube('back', (0, 0.5, 1.7), (1.4, 0.2, 2.4), BANNER), cube('backtrim', (0, 0.5, 3.0), (1.5, 0.25, 0.2), GOLD), cube('armL', (-0.7, 0, 1.0), (0.15, 1.2, 0.5), GOLD), cube('armR', (0.7, 0, 1.0), (0.15, 1.2, 0.5), GOLD), cube('dais', (0, 0, 0.1), (3.0, 2.2, 0.2), MARBLE)]))
    k.append(piece('Brazier', [cyl('stand', (0, 0, 0.5), 0.08, 1.0, IRON, None, 8), cyl('bowl', (0, 0, 1.1), 0.45, 0.35, IRON, None, 10, None, 0.2), sphere('flame', (0, 0, 1.45), 0.35, TORCH, None, 8, 6, (1, 1, 1.5))]))
    k.append(piece('Carpet', [cube('carpet', (0, 0, 0.01), (8, 2.4, 0.02), CARPET), cube('trimA', (0, -1.15, 0.015), (8, 0.1, 0.02), GOLD), cube('trimB', (0, 1.15, 0.015), (8, 0.1, 0.02), GOLD)], {'w': 8, 'h': 0.02, 'd': 2.4}))
    k.append(piece('Cage', [cube('floor', (0, 0, 0.05), (1.6, 1.6, 0.1), IRON)] + [cyl('bar', (-0.75 + (i % 5) * 0.375, -0.75 + (i // 5) * 1.5, 1.2), 0.03, 2.3, IRON, None, 6) for i in range(10)] + [cyl('barS', (-0.75 + (i % 2) * 1.5, -0.375 + (i // 2) * 0.75, 1.2), 0.03, 2.3, IRON, None, 6) for i in range(4)] + [cube('roof', (0, 0, 2.35), (1.6, 1.6, 0.1), IRON)]))
    k.append(piece('TrapFloor', [cube('slab', (0, 0, -0.02), (2.0, 2.2, 0.06), STONE2), cube('crack', (0, 0, 0.005), (1.9, 0.06, 0.02), RUBBER)], {'w': 2, 'h': 0.05, 'd': 2.2}))
    return k

def main():
    OUT = os.path.join(ROOT, 'blender', 'glb'); os.makedirs(OUT, exist_ok=True)
    figures = [build_figure(n, sp) for n, sp in FIGURES.items()]
    export(figures, 'figures.glb', OUT)
    export(build_weapons(), 'weapons.glb', OUT)
    kit = build_slum() + build_industrial() + build_forest() + build_hideout()
    BUN = mat('Bun', 'f3e3c8', 0.7); BUNPINK = mat('Bun pink', 'e0607a', 0.6); PLATE = mat('Plate', 'f4f4f0', 0.4)
    kit.append(piece('Bun', [cyl('plate', (0, 0, 0.015), 0.28, 0.03, PLATE, None, 16), sphere('bun', (0, 0, 0.17), 0.17, BUN, None, 12, 8, (1, 1, 0.85)), sphere('dot', (0, 0, 0.3), 0.05, BUNPINK, None, 8, 6, (1, 1, 0.5))]))
    kit.append(piece('Marker', [cyl('ring', (0, 0, 0.02), 0.9, 0.04, HAZARD, None, 24, None, None)], {'w': 1.8, 'h': 0.05, 'd': 1.8}))
    export(kit, 'kit.glb', OUT)
    with open(os.path.join(OUT, 'kit.json'), 'w') as f:
        json.dump({'figures': list(FIGURES.keys()), 'pieces': FOOT, 'blender': bpy.app.version_string}, f, indent=1, sort_keys=True)
    print('KIT.JSON', len(FOOT), 'pieces')

    # preview render + .blend --------------------------------------------------------------------------
    def preview():
        roots = figures + kit
        x = 0.0
        for r in roots:
            r.location.x = x; x += max(FOOT.get(r.name, {'w': 1})['w'], 1.2) + 1.0
        sc = bpy.context.scene
        bpy.ops.object.camera_add(location=(x / 2, -70, 26), rotation=(math.radians(68), 0, 0)); cam = bpy.context.object
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = x + 6; sc.camera = cam
        bpy.ops.object.light_add(type='SUN', location=(0, -20, 40)); sun = bpy.context.object; sun.rotation_euler = (math.radians(45), math.radians(15), math.radians(25)); sun.data.energy = 3.5
        try:
            sc.render.engine = 'BLENDER_EEVEE_NEXT'
        except Exception:
            sc.render.engine = 'BLENDER_EEVEE'
        sc.render.resolution_x = 3000; sc.render.resolution_y = 500; sc.render.resolution_percentage = 100
        sc.render.filepath = os.path.join(ROOT, 'blender', 'kit-preview.png'); sc.render.image_settings.file_format = 'PNG'
        w = bpy.data.worlds.new('W'); w.use_nodes = True; sc.world = w
        bg = w.node_tree.nodes.get('Background'); bg.inputs[0].default_value = (0.06, 0.07, 0.1, 1); bg.inputs[1].default_value = 1.0
        bpy.ops.render.render(write_still=True)
        print('PREVIEW written')
    try:
        preview()
    except Exception as e:
        print('preview skipped:', e)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'TwinDragon_Kit.blend'))
    print('DONE')

if __name__ == '__main__':
    main()
