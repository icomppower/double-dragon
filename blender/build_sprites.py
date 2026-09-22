"""雙截龍 · TWIN DRAGON — sprite rig. Renders the eight kit figures (build_assets.py) into a toon-shaded, outlined
sprite atlas from one fixed camera, one frame per pose of the runtime's state machine, and exports a foot anchor,
a right-hand anchor (+ shoulder, so the runtime knows the arm angle) and an overhead carry anchor for every frame.

Run:  blender --background --python blender/build_sprites.py
Writes dist/assets/figures.png + figures.json and blender/previews/sprites.png.

Camera: orthographic, looking along +Y and pitched 20° down (the gameplay view of the Three.js build was a 15° pitch
with perspective; 20° keeps a usable depth band without perspective). Figures face screen-right with the same 0.38 rad
turn toward the camera the 3D build used; the runtime mirrors them for the other facing. 48 px per metre, rendered
at 2× and box-filtered down after a 2 px outline is grown from the alpha.
"""
import bpy, os, sys, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_assets as K   # importing resets the scene and builds the palette
import pngio
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist', 'assets'); os.makedirs(OUT, exist_ok=True)
TMP = os.path.join(ROOT, 'blender', 'out'); os.makedirs(TMP, exist_ok=True)
PREV = os.path.join(ROOT, 'blender', 'previews'); os.makedirs(PREV, exist_ok=True)

PPM = 48                      # atlas pixels per metre
SS = 2                        # supersample
PITCH = math.radians(20)      # camera pitch down
YAW = -(math.pi / 2 + 0.38)   # face +X, turned 0.38 rad toward the camera (camera sits at -Y)
OUTLINE = (0.07, 0.06, 0.09)  # outline colour (sRGB 0..1)
OUTLINE_R = 2 * SS            # px at render scale
ATLAS_W = 2048

# ------------------------------------------------------------------ scene
def setup_scene():
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try: sc.render.engine = eng; break
        except Exception: pass
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '8'
    sc.render.image_settings.compression = 15
    sc.render.dither_intensity = 0
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    try: sc.eevee.taa_render_samples = 16
    except Exception: pass
    w = bpy.data.worlds.new('W'); w.use_nodes = True; sc.world = w
    bg = w.node_tree.nodes.get('Background'); bg.inputs[0].default_value = (0.35, 0.36, 0.42, 1); bg.inputs[1].default_value = 1.0
    sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = 1.0; sun.use_shadow = False
    so = bpy.data.objects.new('Sun', sun); sc.collection.objects.link(so)
    d = Vector((0.45, 0.5, -1.0)).normalized()          # light travels down, toward +Y (away from camera), from the left
    so.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('Cam'); cam.type = 'ORTHO'; cam.clip_start = 0.1; cam.clip_end = 500
    co = bpy.data.objects.new('Cam', cam); sc.collection.objects.link(co); sc.camera = co
    co.rotation_euler = (math.pi / 2 - PITCH, 0, 0)
    return sc, co

def toonify_all():
    """Every palette material becomes: diffuse -> shader-to-RGB -> 3-band ramp x base colour -> emission.
    Emissive materials keep their colour as flat emission. Alpha < 1 stays a blend."""
    for m in bpy.data.materials:
        if not m.use_nodes or m.get('toon'): continue
        nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
        if not p: continue
        base = tuple(p.inputs['Base Color'].default_value); emit = p.inputs['Emission Strength'].default_value; alpha = p.inputs['Alpha'].default_value
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.0
        if emit > 0:
            k = min(1.6, 1.0 + emit * 0.25)
            em.inputs['Color'].default_value = (min(1, base[0] * k), min(1, base[1] * k), min(1, base[2] * k), 1)
        else:
            dif = nt.nodes.new('ShaderNodeBsdfDiffuse'); dif.inputs['Color'].default_value = (1, 1, 1, 1)
            s2r = nt.nodes.new('ShaderNodeShaderToRGB'); nt.links.new(dif.outputs[0], s2r.inputs[0])
            ramp = nt.nodes.new('ShaderNodeValToRGB'); cr = ramp.color_ramp; cr.interpolation = 'CONSTANT'
            cr.elements[0].position = 0.0; cr.elements[0].color = (0.50, 0.50, 0.56, 1)
            cr.elements[1].position = 0.32; cr.elements[1].color = (0.80, 0.80, 0.82, 1)
            e3 = cr.elements.new(0.68); e3.color = (1.0, 1.0, 1.0, 1)
            nt.links.new(s2r.outputs[0], ramp.inputs[0])
            mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY'
            mul.inputs[1].default_value = (base[0], base[1], base[2])
            nt.links.new(ramp.outputs[0], mul.inputs[0])
            nt.links.new(mul.outputs[0], em.inputs['Color'])
        # always through a transparent mix so the stage builder can blank a material (fac 0) for overlay passes
        mix = nt.nodes.new('ShaderNodeMixShader'); mix.name = 'ToonMix'; tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix.inputs[0].default_value = alpha; nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs[0])
        em.name = 'ToonEmit'
        if alpha < 1:
            try: m.surface_render_method = 'BLENDED'
            except Exception: pass
        m['toon'] = True; m['alpha'] = alpha; m['emissive'] = 1 if emit > 0 else 0
        if emit > 0: m['emit_color'] = list(em.inputs['Color'].default_value)[:3]

# ------------------------------------------------------------------ poses (three.js rotations, [x, y, z]) ported from game.js
IDLE = {'ArmL': [0.55, 0, 0], 'ArmR': [0.75, 0, 0], 'LegL': [0, 0, 0], 'LegR': [0, 0, 0], 'Torso': [0.05, 0, 0], 'Head': [0, 0, 0]}
POSE = {
    'hit': {'ArmL': [-0.5, 0, 0.4], 'ArmR': [-0.5, 0, -0.4], 'Torso': [-0.35, 0, 0], 'Head': [-0.4, 0, 0], 'LegL': [0.2, 0, 0], 'LegR': [-0.2, 0, 0]},
    'held': {'ArmL': [0.6, 0, 0.8], 'ArmR': [0.6, 0, -0.8], 'Torso': [-0.2, 0, 0], 'Head': [-0.2, 0, 0], 'LegL': [0.1, 0, 0], 'LegR': [-0.1, 0, 0]},
    'grab': {'ArmL': [1.45, 0, 0], 'ArmR': [0.9, 0, 0], 'Torso': [0.15, 0, 0], 'Head': [0.1, 0, 0], 'LegL': [0.15, 0, 0], 'LegR': [-0.15, 0, 0]},
    'jump': {'ArmL': [-0.6, 0, 0.5], 'ArmR': [-0.6, 0, -0.5], 'LegL': [0.9, 0, 0], 'LegR': [0.4, 0, 0], 'Torso': [0.1, 0, 0], 'Head': [0, 0, 0]},
    'reload': {'ArmL': [1.1, 0, 0], 'ArmR': [0.5, 0, 0], 'Torso': [0.25, 0.4, 0], 'Head': [0.4, 0, 0], 'LegL': [0, 0, 0], 'LegR': [0, 0, 0]},
    'pickup': {'ArmL': [0.9, 0, 0], 'ArmR': [1.2, 0, 0], 'Torso': [0.7, 0, 0], 'Head': [0.3, 0, 0], 'LegL': [0.3, 0, 0], 'LegR': [-0.3, 0, 0]},
    'lying': {'ArmL': [0.3, 0, 0.9], 'ArmR': [0.3, 0, -0.9], 'LegL': [0.05, 0, 0.1], 'LegR': [0.05, 0, -0.1], 'Torso': [0, 0, 0], 'Head': [0.2, 0, 0]},
}
ATTACK = {
    'punchL': [{'ArmL': [0.4, 0, 0.2], 'ArmR': [0.9, 0, 0], 'Torso': [0.05, 0.35, 0]}, {'ArmL': [1.6, 0, 0], 'ArmR': [0.7, 0, 0], 'Torso': [0.1, -0.3, 0]}],
    'punchR': [{'ArmR': [0.4, 0, -0.2], 'ArmL': [0.9, 0, 0], 'Torso': [0.05, -0.35, 0]}, {'ArmR': [1.6, 0, 0], 'ArmL': [0.7, 0, 0], 'Torso': [0.1, 0.35, 0]}],
    'kick': [{'LegR': [-0.5, 0, 0], 'LegL': [0.1, 0, 0], 'Torso': [0.1, 0, 0], 'ArmL': [0.8, 0, 0], 'ArmR': [0.3, 0, 0]}, {'LegR': [1.45, 0, 0], 'LegL': [0.1, 0, 0], 'Torso': [-0.25, 0, 0], 'ArmL': [0.4, 0, 0], 'ArmR': [0.2, 0, 0]}],
    'jumpkick': [{'LegR': [0.6, 0, 0], 'LegL': [0.7, 0, 0], 'Torso': [0.2, 0, 0], 'ArmL': [-0.4, 0, 0.4], 'ArmR': [-0.4, 0, -0.4]}, {'LegR': [1.5, 0, 0], 'LegL': [0.7, 0, 0], 'Torso': [-0.2, 0, 0], 'ArmL': [-0.4, 0, 0.5], 'ArmR': [-0.6, 0, -0.5]}],
    'elbow': [{'ArmR': [0.9, 0, -0.3], 'Torso': [0, 0.5, 0]}, {'ArmR': [1.7, 0, -1.0], 'Torso': [0, 1.6, 0], 'Head': [0, 1.0, 0]}],
    'headbutt': [{'Head': [-0.6, 0, 0], 'Torso': [-0.15, 0, 0], 'ArmL': [1.45, 0, 0], 'ArmR': [1.2, 0, 0]}, {'Head': [0.7, 0, 0], 'Torso': [0.3, 0, 0], 'ArmL': [1.45, 0, 0], 'ArmR': [1.2, 0, 0]}],
    'knee': [{'LegR': [-0.3, 0, 0], 'Torso': [0.1, 0, 0], 'ArmL': [1.45, 0, 0], 'ArmR': [1.3, 0, 0]}, {'LegR': [1.8, 0, 0], 'Torso': [0.35, 0, 0], 'ArmL': [1.45, 0, 0], 'ArmR': [1.2, 0, 0]}],
    'throw': [{'ArmL': [2.6, 0, 0.3], 'ArmR': [2.6, 0, -0.3], 'Torso': [-0.3, 0, 0], 'LegL': [-0.2, 0, 0]}, {'ArmL': [1.4, 0, 0.3], 'ArmR': [1.4, 0, -0.3], 'Torso': [0.6, 0, 0], 'LegL': [0.4, 0, 0], 'LegR': [-0.3, 0, 0]}],
    'weapon': [{'ArmR': [2.7, 0, -0.2], 'ArmL': [0.9, 0, 0], 'Torso': [-0.2, -0.4, 0]}, {'ArmR': [0.9, 0, 0], 'ArmL': [0.6, 0, 0], 'Torso': [0.3, 0.4, 0]}],
    'heave': [{'ArmL': [2.9, 0, 0.2], 'ArmR': [2.9, 0, -0.2], 'Torso': [-0.3, 0, 0]}, {'ArmL': [1.5, 0, 0.2], 'ArmR': [1.5, 0, -0.2], 'Torso': [0.5, 0, 0]}],
    'throwarm': [{'ArmR': [-0.9, 0, -0.3], 'ArmL': [1.0, 0, 0], 'Torso': [-0.1, -0.5, 0]}, {'ArmR': [1.7, 0, 0], 'ArmL': [0.4, 0, 0], 'Torso': [0.25, 0.5, 0]}],
    'pound': [{'ArmL': [2.9, 0, 0.3], 'ArmR': [2.9, 0, -0.3], 'Torso': [-0.3, 0, 0]}, {'ArmL': [0.9, 0, 0.3], 'ArmR': [0.9, 0, -0.3], 'Torso': [0.8, 0, 0], 'LegL': [0.5, 0, 0], 'LegR': [-0.2, 0, 0]}],
    'hug': [{'ArmL': [1.2, 0, 1.0], 'ArmR': [1.2, 0, -1.0], 'Torso': [0.1, 0, 0]}, {'ArmL': [1.5, 0, 0.2], 'ArmR': [1.5, 0, -0.2], 'Torso': [0.3, 0, 0]}],
    'gun': [{'ArmR': [1.35, 0, 0], 'ArmL': [1.1, 0, 0.3], 'Torso': [0.05, 0.15, 0]}, {'ArmR': [1.55, 0, 0], 'ArmL': [1.2, 0, 0.3], 'Torso': [-0.05, 0.15, 0]}],
}
PARTS = ['LegL', 'LegR', 'ArmL', 'ArmR', 'Torso', 'Head']

def full(p): return {k: list(p.get(k, IDLE[k])) for k in PARTS}
def mix(a, b, u): return {k: [a[k][i] + (b[k][i] - a[k][i]) * u for i in range(3)] for k in PARTS}
def walk(a, moving=True):
    return full({'LegL': [a * 0.75, 0, 0], 'LegR': [-a * 0.75, 0, 0], 'ArmL': [0.55 - a * 0.35, 0, 0], 'ArmR': [0.75 + a * 0.35, 0, 0], 'Torso': [0.1 if moving else 0.05, a * 0.08 if moving else 0, 0]})
def with_arms(p, x): q = full(p); q['ArmL'] = [x, 0, 0.15]; q['ArmR'] = [x, 0, -0.15]; return q

ATTACKS_BY = {
    'HeroBlue': ['punchL', 'punchR', 'kick', 'jumpkick', 'elbow', 'headbutt', 'knee', 'throw', 'weapon', 'heave', 'throwarm'],
    'HeroRed': ['punchL', 'punchR', 'kick', 'jumpkick', 'elbow', 'headbutt', 'knee', 'throw', 'weapon', 'heave', 'throwarm'],
    'Thug': ['punchR', 'weapon'], 'Whip': ['weapon'], 'Brute': ['pound', 'hug'], 'Knife': ['punchR', 'throwarm'], 'Boss': ['gun', 'weapon'], 'Captive': [],
}
CELL_M = {'Brute': 3.7, 'Boss': 3.3}
ANIM_FPS = {'idle': 3, 'walk': 10, 'carry_walk': 10, 'thrown': 12}

def frames_for(name):
    """-> list of (frame_name, pose, lie, spin, raise, anim)"""
    fr = []
    for i in range(4): fr.append((f'idle_{i}', walk(math.sin(math.pi * 2 * i / 4) * 0.15, False), 0, 0, 0, 'idle'))
    for i in range(6): fr.append((f'walk_{i}', walk(math.sin(math.pi * 2 * i / 6)), 0, 0, 0, 'walk'))
    fr.append(('jump_0', full(POSE['jump']), 0, 0, 0, 'jump'))
    fr.append(('hit_0', full(POSE['hit']), 0, 0, 0, 'hit')); fr.append(('hit_1', mix(full(POSE['hit']), full(IDLE), 0.5), 0, 0, 0, 'hit'))
    fr.append(('held_0', full(POSE['held']), 0, 0, 0, 'held')); fr.append(('grab_0', full(POSE['grab']), 0, 0, 0, 'grab'))
    fr.append(('fly_0', full(POSE['lying']), 0.6, 0, 0, 'fly')); fr.append(('lying_0', full(POSE['lying']), 1.0, 0, 0, 'lying'))
    fr.append(('getup_0', full(POSE['lying']), 0.66, 0, 0, 'getup')); fr.append(('getup_1', mix(full(POSE['lying']), full(IDLE), 0.5), 0.33, 0, 0, 'getup'))
    dead = full(POSE['lying']); dead['Head'] = [0.5, 0, 0.35]; fr.append(('dead_0', dead, 1.0, 0, 0, 'dead'))
    for i in range(4): fr.append((f'thrown_{i}', full(POSE['hit']), 0, i * math.pi / 2, 0.6, 'thrown'))
    fr.append(('pickup_0', full(POSE['pickup']), 0, 0, 0, 'pickup'))
    if name == 'Boss': fr.append(('reload_0', full(POSE['reload']), 0, 0, 0, 'reload'))
    for a in ATTACKS_BY[name]:
        k = ATTACK[a]; w, ac = full(k[0]), full(k[1])
        fr.append((f'{a}_0', w, 0, 0, 0, a)); fr.append((f'{a}_1', ac, 0, 0, 0, a))
        if a == 'gun': fr.append((f'{a}_2', full({**k[1], 'ArmR': [1.62, 0, 0]}), 0, 0, 0, a))
        fr.append((f'{a}_{3 if a == "gun" else 2}', mix(ac, full(IDLE), 0.5), 0, 0, 0, a))
    if name.startswith('Hero'):
        fr.append(('carry_idle_0', with_arms(IDLE, 2.9), 0, 0, 0, 'carry_idle'))
        for i in range(6): fr.append((f'carry_walk_{i}', with_arms(walk(math.sin(math.pi * 2 * i / 6)), 2.9), 0, 0, 0, 'carry_walk'))
    return fr

# ------------------------------------------------------------------ posing
def pivots_of(root, name):
    p = {}
    for c in root.children:
        for part in PARTS:
            if c.name.startswith(name + '_' + part): p[part] = c
    return p

def pose_root(root, name, pose, lie, spin, raise_):
    piv = pivots_of(root, name)
    for part, rot in pose.items():
        o = piv.get(part)
        if not o: continue
        o.rotation_mode = 'ZYX'; o.rotation_euler = (rot[0], -rot[2], rot[1])   # three (x, y, z) -> blender (x, -z, y)
    root.rotation_mode = 'XYZ'
    root.rotation_euler = (lie * math.pi / 2 + spin, 0, YAW)
    root.location.z += lie * 0.28 + raise_

def clear_figures(keep):
    for o in list(bpy.data.objects):
        if o not in keep: bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0: bpy.data.meshes.remove(me)

# ------------------------------------------------------------------ image ops (numpy, premultiplied where it matters)
def dilate(mask, r):
    out = mask.copy(); h, w = mask.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r or (dx == 0 and dy == 0): continue
            sh = np.zeros_like(mask)
            ys, ye = max(0, dy), min(h, h + dy); xs, xe = max(0, dx), min(w, w + dx)
            sh[ys:ye, xs:xe] = mask[ys - dy:ye - dy, xs - dx:xe - dx]
            out |= sh
    return out

def outline_and_downsample(cell):
    """cell: float (H, W, 4) straight alpha at SS scale -> uint8 (H/SS, W/SS, 4) straight alpha with an outline."""
    a = cell[..., 3]
    m = dilate(a > 0.5, OUTLINE_R)
    oa = m.astype(np.float32)
    rgb_p = cell[..., :3] * a[..., None]
    out_rgb = np.array(OUTLINE, dtype=np.float32)[None, None, :] * (oa * (1 - a))[..., None]
    prem = rgb_p + out_rgb; alpha = a + oa * (1 - a)
    h, w = alpha.shape
    prem = prem.reshape(h // SS, SS, w // SS, SS, 3).mean(axis=(1, 3)); alpha = alpha.reshape(h // SS, SS, w // SS, SS).mean(axis=(1, 3))
    rgb = np.where(alpha[..., None] > 1e-4, prem / np.maximum(alpha, 1e-4)[..., None], 0)
    out = np.concatenate([rgb, alpha[..., None]], axis=2)
    return np.clip(np.round(out * 255), 0, 255).astype(np.uint8)

def trim(img):
    a = img[..., 3] > 8
    if not a.any(): return img[:1, :1], 0, 0
    ys = np.where(a.any(axis=1))[0]; xs = np.where(a.any(axis=0))[0]
    y0, y1, x0, x1 = ys[0], ys[-1] + 1, xs[0], xs[-1] + 1
    return img[y0:y1, x0:x1], int(x0), int(y0)

def pack(sprites, width=ATLAS_W, pad=1, extrude=0):
    """sprites: list of (key, img). Shelf packing sorted by height. -> (atlas uint8, placements {key: (x, y, w, h)})
    extrude > 0 duplicates each sprite's edge pixels that far into its padding, so scaled drawImage sampling at a tile
    edge reads the tile's own colour instead of transparent padding (no hairline seams between adjacent tiles)."""
    order = sorted(range(len(sprites)), key=lambda i: -sprites[i][1].shape[0])
    x = y = shelf = 0; place = {}
    for i in order:
        key, im = sprites[i]; h, w = im.shape[:2]
        if x + w + pad > width: x = 0; y += shelf + pad; shelf = 0
        place[key] = (x, y, w, h); x += w + pad; shelf = max(shelf, h)
    H = y + shelf + pad
    atlas = np.zeros((H, width, 4), dtype=np.uint8)
    for key, im in sprites:
        px, py, w, h = place[key]; atlas[py:py + h, px:px + w] = im
    if extrude:
        e = min(extrude, pad // 2)
        for key, im in sprites:
            px, py, w, h = place[key]
            for k in range(1, e + 1):
                if px - k >= 0: atlas[py:py + h, px - k] = im[:, 0]
                if px + w - 1 + k < width: atlas[py:py + h, px + w - 1 + k] = im[:, -1]
                if py - k >= 0: atlas[py - k, px:px + w] = im[0]
                if py + h - 1 + k < H: atlas[py + h - 1 + k, px:px + w] = im[-1]
    return atlas, place

# ------------------------------------------------------------------ render one figure sheet
def render_figure(sc, cam, name, spec):
    frames = frames_for(name)
    n = len(frames); cols = math.ceil(math.sqrt(n)); rows = math.ceil(n / cols)
    cell_m = CELL_M.get(name, 3.0); cell_px = int(round(cell_m * PPM))
    keep = set(bpy.data.objects)
    roots = []
    for i, (fname, pose, lie, spin, raise_, anim) in enumerate(frames):
        col, row = i % cols, i // cols
        root = K.build_figure(name, spec)
        scale = spec.get('scale', 1.0)
        # screen cell: x from col*cell_m, screen-up from (rows-1-row)*cell_m; feet 0.35 m above the cell bottom.
        # Lying bodies stretch 1.75 m behind the feet (screen-left): slide them right so they stay inside the cell.
        sx = col * cell_m + cell_m / 2 + (0.7 * scale if lie > 0 else 0); sup = (rows - 1 - row) * cell_m + 0.35
        root.location = (sx, 0, sup / math.cos(PITCH))
        pose_root(root, name, pose, lie, spin, raise_)
        pivots_extra = None
        if anim == 'thrown':
            # tumble around the body centre (0.9 m up the figure), which becomes this frame's pivot
            bpy.context.view_layer.update()
            c = root.matrix_world @ Vector((0, 0, 0.9))
            target = Vector((col * cell_m + cell_m / 2, 0, (sup + 0.9 * scale) / math.cos(PITCH)))
            root.location = root.location + (target - c)
            pivots_extra = target
        roots.append((root, pivots_extra, 0.9 * scale if anim == 'thrown' else 0.0))
    bpy.context.view_layer.update()
    W, H = cols * cell_px * SS, rows * cell_px * SS
    sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
    cam.data.ortho_scale = cols * cell_m
    center = Vector((cols * cell_m / 2, 0, (rows * cell_m / 2) / math.cos(PITCH)))
    d = Vector((0, math.cos(PITCH), -math.sin(PITCH)))
    cam.location = center - d * 60
    bpy.context.view_layer.update()
    # anchors before rendering (world -> camera -> pixels at SS scale)
    anchors = []
    for i, (root, pivot_pt, oy) in enumerate(roots):
        piv = pivots_of(root, name)
        def proj(v):
            u, vv, _ = world_to_camera_view(sc, cam, v); return (u * W, (1 - vv) * H)
        foot = proj(pivot_pt if pivot_pt is not None else (root.matrix_world @ Vector((0, 0, 0))))
        armR = piv['ArmR']; sh = proj(armR.matrix_world @ Vector((0, 0, 0))); hand = proj(armR.matrix_world @ Vector((0, 0, -0.62)))
        carry = proj(piv['Torso'].matrix_world @ Vector((0, 0, 0.95)))
        anchors.append((foot, sh, hand, carry, oy))
    path = os.path.join(TMP, f'{name}_sheet.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    sheet = pngio.read(path).astype(np.float32) / 255.0
    sprites, meta = [], {}
    for i, (fname, pose, lie, spin, raise_, anim) in enumerate(frames):
        col, row = i % cols, i // cols
        x0, y0 = col * cell_px * SS, row * cell_px * SS
        cell = sheet[y0:y0 + cell_px * SS, x0:x0 + cell_px * SS]
        im = outline_and_downsample(cell)
        im, tx, ty = trim(im)
        foot, sh, hand, carry, oy = anchors[i]
        def loc(p): return [round(p[0] / SS - col * cell_px - tx, 1), round(p[1] / SS - row * cell_px - ty, 1)]
        f, s, h, c = loc(foot), loc(sh), loc(hand), loc(carry)
        ang = math.degrees(math.atan2(-(h[1] - s[1]), h[0] - s[0]))
        key = f'{name}/{fname}'
        sprites.append((key, im))
        meta[fname] = {'w': int(im.shape[1]), 'h': int(im.shape[0]), 'px': f[0], 'py': f[1], 'hx': h[0], 'hy': h[1], 'sx': s[0], 'sy': s[1], 'cx': c[0], 'cy': c[1], 'ang': round(ang, 1), 'anim': anim, 'oy': round(oy, 2)}
    clear_figures(keep)
    return sprites, meta

def main():
    sc, cam = setup_scene()
    toonify_all()
    all_sprites, figures = [], {}
    for name, spec in K.FIGURES.items():
        sp, meta = render_figure(sc, cam, name, spec)
        all_sprites += sp
        anims = {}
        for fname, m in meta.items(): anims.setdefault(m['anim'], []).append(fname)
        figures[name] = {'frames': meta, 'anims': {a: {'frames': fr, 'fps': ANIM_FPS.get(a, 12), 'loop': a in ('idle', 'walk', 'carry_walk', 'thrown')} for a, fr in anims.items()}, 'scale': spec.get('scale', 1.0)}
        print('FIGURE', name, len(meta), 'frames')
    atlas, place = pack(all_sprites)
    for name in figures:
        for fname, m in figures[name]['frames'].items():
            x, y, w, h = place[f'{name}/{fname}']; m['x'] = x; m['y'] = y
    size = pngio.write(os.path.join(OUT, 'figures.png'), atlas)
    manifest = {'ppm': PPM, 'pitch': 20, 'yaw_tilt': 0.38, 'atlas': 'figures.png', 'width': int(atlas.shape[1]), 'height': int(atlas.shape[0]), 'figures': figures}
    with open(os.path.join(OUT, 'figures.json'), 'w') as f: json.dump(manifest, f, separators=(',', ':'))
    print('ATLAS', atlas.shape[1], 'x', atlas.shape[0], size, 'bytes,', len(all_sprites), 'sprites')
    # preview: the two heroes and the warlord, re-tiled
    rows = []
    for name in ('HeroBlue', 'Brute', 'Boss', 'Whip'):
        fr = figures[name]['frames']; keys = list(fr.keys())[:24]
        cw = max(fr[k]['w'] for k in keys) + 2; ch = max(fr[k]['h'] for k in keys) + 2
        strip = np.zeros((ch, cw * len(keys), 4), dtype=np.uint8); strip[..., :3] = (60, 58, 70); strip[..., 3] = 255
        for i, k in enumerate(keys):
            m = fr[k]; im = atlas[m['y']:m['y'] + m['h'], m['x']:m['x'] + m['w']]
            a = im[..., 3:4].astype(np.float32) / 255
            dst = strip[1:1 + m['h'], i * cw + 1:i * cw + 1 + m['w']]
            dst[..., :3] = (im[..., :3] * a + dst[..., :3] * (1 - a)).astype(np.uint8)
        rows.append(strip)
    W = max(r.shape[1] for r in rows); H = sum(r.shape[0] for r in rows)
    prev = np.zeros((H, W, 4), dtype=np.uint8); prev[..., :3] = (60, 58, 70); prev[..., 3] = 255; y = 0
    for r in rows: prev[y:y + r.shape[0], :r.shape[1]] = r; y += r.shape[0]
    pngio.write(os.path.join(PREV, 'sprites.png'), prev)
    print('DONE')

if __name__ == '__main__':
    main()
