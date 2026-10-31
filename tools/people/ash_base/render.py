"""Renders of Ash's base model in the concept's style: flat two-tone cel shading lit from the camera's
upper left, ink outlines, dark navy briefs, and the concept's own drawing (the face, and the body's
anatomy lines) projected onto it from the concept's front and back views.

  blender -b <ash.blend> -P tools/people/ash_base/render.py -- <concept.jpg> <out_dir> <view>[,<view>...] [--ortho] [--size=W,H]

views: front, back, side_r (facing right), side_l (facing left), front34 (high, front left), back34 (high, back right),
front34low (low, front right), back34low (low, back left), turn30 (the figure turned a little to its left), top, bottom
"""
import sys, os, math
import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
CONCEPT, OUT, VIEWS = argv[0], argv[1], argv[2].split(',')
ORTHO = '--ortho' in argv
SIZE = next((tuple(map(int, a[7:].split(','))) for a in argv if a.startswith('--size=')), (700, 1000))
os.makedirs(OUT, exist_ok=True)

TOP, GROUND = 100.0, 1025.0
S = 1.40 / (GROUND - TOP)
FRONT_C, HEAD_C, BACK_C, SIDE_C = 372.0, 366.0, 980.0, 1390.0   # the concept's middle columns: front view (body, face), back view, side view

SKIN = (228, 148, 108); SKIN_SH = (184, 116, 98)
NAVY = (63, 69, 88); NAVY_SH = (46, 50, 66)
INK = (22, 8, 8)
LIGHT_CAM = Vector((-0.62, 0.5, 0.6)).normalized()   # in the camera's frame: from its upper left, in front


def lin(c):
    def f(x):
        x /= 255
        return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1)


# ---------- the concept's drawing as decals ----------
def concept_pixels():
    img = bpy.data.images.load(CONCEPT)
    W, H = img.size
    return np.array(img.pixels[:]).reshape(H, W, 4)[::-1].copy()   # top row first


def save_rgba(name, arr):
    h, w = arr.shape[:2]
    im = bpy.data.images.new(name, w, h, alpha=True)
    im.pixels[:] = arr[::-1].reshape(-1)
    path = os.path.join(OUT, name + '.png')
    im.filepath_raw = path; im.file_format = 'PNG'; im.save()
    return path


def erode(m, k):
    out = m.copy()
    for _ in range(k):
        e = out.copy()
        e[1:] &= out[:-1]; e[:-1] &= out[1:]; e[:, 1:] &= out[:, :-1]; e[:, :-1] &= out[:, 1:]
        out = e
    return out


def dilate(m, k):
    out = m.copy()
    for _ in range(k):
        e = out.copy()
        e[1:] |= out[:-1]; e[:-1] |= out[1:]; e[:, 1:] |= out[:, :-1]; e[:, :-1] |= out[:, 1:]
        out = e
    return out


def filled(m):
    """the figure with its inside filled: what the outside cannot reach"""
    out = np.zeros_like(m); out[0, :] = out[-1, :] = out[:, 0] = out[:, -1] = True; out &= ~m
    while True:
        g = out.copy(); g[1:] |= out[:-1]; g[:-1] |= out[1:]; g[:, 1:] |= out[:, :-1]; g[:, :-1] |= out[:, 1:]; g &= ~m
        if (g == out).all():
            return ~out
        out = g


def decals():
    px = concept_pixels()
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    mx = px[..., :3].max(-1)
    skin = (r > 0.5) & (r > g + 0.12) & (g > b)
    navy = (b > r + 0.03) & (mx < 0.47)
    dark = mx < 0.30
    fig = skin | navy | dark
    # the sheet's thin horizontal guide lines would close the gaps between the legs and under the arms
    v = fig.copy()
    v[2:-2] = fig[2:-2] & ((fig[:-4] & fig[1:-3]) | (fig[4:] & fig[3:-1]) | (fig[1:-3] & fig[3:-1]))
    fig = v
    drawn = (mx < 0.52) & ~navy   # the drawing's lines, the fine ones lighter than the outline
    out = []
    # the face (the front view's head): everything but the skin, as drawn
    x0, x1, y0, y1 = 296, 438, 150, 300
    crop = px[y0:y1, x0:x1].copy()
    crop[..., 3] = np.where(skin[y0:y1, x0:x1], 0.0, 1.0)
    out.append(dict(path=save_rgba('decal_face', crop), x0=x0, y0=y0, centre=HEAD_C, sign=1, facing=-1, axis='X', faxis='Y'))
    # the body's anatomy lines: the ink inside the silhouette (clear of the outline and of the briefs' edges)
    for name, (x0, x1, y0, y1), centre, sign, facing, axis, faxis in (
            ('decal_front', (30, 720, 300, 1030), FRONT_C, 1, -1, 'X', 'Y'),
            ('decal_back', (690, 1280, 120, 1030), BACK_C, -1, 1, 'X', 'Y'),
            # the side view (facing right: the figure's right side; its front is -y): both sides, as the model is symmetric
            ('decal_side', (1296, 1500, 120, 1030), SIDE_C, -1, 0, 'Y', 'X')):
        f = filled(fig[y0 - 4:y1 + 4, x0 - 4:x1 + 4])[4:-4, 4:-4]
        inside = erode(f, 7)
        line = drawn[y0:y1, x0:x1] & inside & ~dilate(navy[y0:y1, x0:x1], 6)
        line = dilate(line, 1) & inside
        a = np.clip((0.56 - mx[y0:y1, x0:x1]) / 0.2, 0, 1) * line
        if axis == 'Y':   # the face is the front view's: the side view's eye and mouth left out
            a[:300 - y0, 1404 - x0:] = 0
        # the drawing is not quite symmetric (the model is): each row moved so its body's middle is on the centre column
        cc = int(centre - x0)
        for i in range(a.shape[0]):
            row = f[i]
            d = np.diff(np.r_[0, row.astype(int), 0]); st = np.where(d == 1)[0]; en = np.where(d == -1)[0]
            if not len(st):
                continue
            segs = list(zip(st, en))
            if axis == 'Y':
                continue   # the side view: as drawn
            hit = [sg for sg in segs if sg[0] <= cc < sg[1]]
            if hit and hit[0][1] - hit[0][0] < 260:
                mid = (hit[0][0] + hit[0][1]) / 2
            else:   # the legs: the middle of the two spans nearest the centre
                near = sorted(segs, key=lambda sg: abs((sg[0] + sg[1]) / 2 - cc))[:2]
                mid = (min(sg[0] for sg in near) + max(sg[1] for sg in near)) / 2
            a[i] = np.roll(a[i], int(round(cc - mid)))
        rgba = np.zeros((y1 - y0, x1 - x0, 4))
        rgba[..., :3] = [INK[0] / 255, INK[1] / 255, INK[2] / 255]
        rgba[..., 3] = a
        out.append(dict(path=save_rgba(name, rgba), x0=x0, y0=y0, centre=centre, sign=sign, facing=facing, axis=axis, faxis=faxis))
    return out


# ---------- materials ----------
def toon(name, light, shadow, decal_list=()):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    for n in list(N):
        N.remove(n)
    out = N.new('ShaderNodeOutputMaterial')
    em = N.new('ShaderNodeEmission')
    geo = N.new('ShaderNodeNewGeometry')
    dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.name = 'light'
    L.new(geo.outputs['Normal'], dot.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = lin(shadow)
    ramp.color_ramp.elements[1].position = 0.47; ramp.color_ramp.elements[1].color = lin(light)
    mp = N.new('ShaderNodeMapRange'); mp.inputs['From Min'].default_value = -1; mp.inputs['From Max'].default_value = 1
    L.new(dot.outputs['Value'], mp.inputs['Value'])
    L.new(mp.outputs['Result'], ramp.inputs['Fac'])
    col = ramp.outputs['Color']
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs[0])
    sepn = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], sepn.inputs[0])
    for d in decal_list:
        img = bpy.data.images.load(d['path'])
        W, H = img.size
        # object x, z -> the concept's column and row -> the decal's u, v
        u = N.new('ShaderNodeMath'); u.operation = 'MULTIPLY_ADD'; u.inputs[1].default_value = d['sign'] / S / W
        u.inputs[2].default_value = (d['centre'] - d['x0']) / W
        L.new(sep.outputs[d['axis']], u.inputs[0])
        v = N.new('ShaderNodeMath'); v.operation = 'MULTIPLY_ADD'; v.inputs[1].default_value = 1 / S / H
        v.inputs[2].default_value = 1 - (GROUND - d['y0']) / H
        L.new(sep.outputs['Z'], v.inputs[0])
        comb = N.new('ShaderNodeCombineXYZ'); L.new(u.outputs[0], comb.inputs[0]); L.new(v.outputs[0], comb.inputs[1])
        tex = N.new('ShaderNodeTexImage'); tex.image = img; tex.extension = 'CLIP'; tex.interpolation = 'Cubic'
        L.new(comb.outputs[0], tex.inputs['Vector'])
        # only where the surface faces the view it was drawn from
        face = N.new('ShaderNodeMapRange')
        fv = sepn.outputs[d['faxis']]
        if d['facing'] == 0:   # either side
            ab = N.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; L.new(fv, ab.inputs[0]); fv = ab.outputs[0]
        f = d['facing'] or 1
        face.inputs['From Min'].default_value = 0.35 * f; face.inputs['From Max'].default_value = 0.6 * f
        if d['faxis'] == 'Y':
            face.inputs['From Min'].default_value = 0.15 * f; face.inputs['From Max'].default_value = 0.45 * f
        L.new(fv, face.inputs['Value'])
        mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
        L.new(tex.outputs['Alpha'], mul.inputs[0]); L.new(face.outputs['Result'], mul.inputs[1])
        mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        L.new(mul.outputs[0], mix.inputs['Factor']); L.new(col, mix.inputs[6]); L.new(tex.outputs['Color'], mix.inputs[7])
        col = mix.outputs[2]
    col = briefs(N, L, mp, sep, col)
    L.new(col, em.inputs['Color'])
    L.new(em.outputs[0], out.inputs['Surface'])
    return m


def briefs(N, L, shade, sep, skin_col):
    """the briefs, painted: navy between the waist and the leg openings (rising from the crotch to the hips,
    a little lower behind), with ink along the waist, the waistband's lower edge and the openings"""
    def op(kind, a, b=None, c=None):
        n = N.new('ShaderNodeMath'); n.operation = kind
        for i, x in enumerate((a, b, c)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                n.inputs[i].default_value = x
            else:
                L.new(x, n.inputs[i])
        return n.outputs[0]
    X, Y, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    zw = (GROUND - 546) * S; zband = (GROUND - 560) * S
    zc = (GROUND - 641) * S; zs = (GROUND - 590) * S
    ax = op('ABSOLUTE', X)
    t = op('POWER', op('MINIMUM', op('MAXIMUM', op('DIVIDE', op('SUBTRACT', ax, 0.018), 0.105), 0.0), 1.0), 1.1)
    behind = op('GREATER_THAN', Y, 0.0)
    drop = op('MULTIPLY', behind, op('MULTIPLY', 0.008, op('SUBTRACT', 1.0, op('MINIMUM', op('DIVIDE', ax, 0.12), 1.0))))
    cut = op('SUBTRACT', op('MULTIPLY_ADD', t, zs - zc, zc), drop)
    inside = op('MULTIPLY', op('MULTIPLY', op('GREATER_THAN', Z, cut), op('LESS_THAN', Z, zw)), op('LESS_THAN', ax, 0.17))
    near = op('MULTIPLY', op('MULTIPLY', op('GREATER_THAN', Z, op('SUBTRACT', cut, 0.004)), op('LESS_THAN', Z, zw + 0.004)), op('LESS_THAN', ax, 0.17))
    d = op('MINIMUM', op('ABSOLUTE', op('SUBTRACT', Z, zw)), op('ABSOLUTE', op('SUBTRACT', Z, cut)))
    d = op('MINIMUM', d, op('ADD', op('ABSOLUTE', op('SUBTRACT', Z, zband)), op('MULTIPLY', op('SUBTRACT', 1.0, inside), 1.0)))
    ink = op('MULTIPLY', op('LESS_THAN', d, 0.0016), near)
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = lin(NAVY_SH)
    ramp.color_ramp.elements[1].position = 0.47; ramp.color_ramp.elements[1].color = lin(NAVY)
    L.new(shade.outputs['Result'], ramp.inputs['Fac'])
    m1 = N.new('ShaderNodeMix'); m1.data_type = 'RGBA'
    L.new(inside, m1.inputs['Factor']); L.new(skin_col, m1.inputs[6]); L.new(ramp.outputs['Color'], m1.inputs[7])
    m2 = N.new('ShaderNodeMix'); m2.data_type = 'RGBA'
    L.new(ink, m2.inputs['Factor']); L.new(m1.outputs[2], m2.inputs[6]); m2.inputs[7].default_value = lin(INK)
    return m2.outputs[2]


def assign_materials(ob):
    ob.data.materials.clear()
    ob.data.materials.append(toon('skin', SKIN, SKIN_SH, decals()))


def set_light(cam):
    lw = (cam.matrix_world.to_3x3() @ LIGHT_CAM).normalized()
    for m in bpy.data.materials:
        if m.node_tree and 'light' in m.node_tree.nodes:
            m.node_tree.nodes['light'].inputs[1].default_value = lw


# ---------- the set ----------
def scene_setup():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24; sc.cycles.use_denoising = False
    sc.cycles.device = 'CPU'
    sc.render.resolution_x, sc.render.resolution_y = SIZE
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    N = world.node_tree.nodes; L = world.node_tree.links
    bg = N['Background']
    # darker at the top of the frame, lighter towards the floor (as the concept's backdrop)
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); ramp = N.new('ShaderNodeValToRGB')
    L.new(tc.outputs['Window'], sep.inputs[0]); L.new(sep.outputs['Y'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[0].color = lin((140, 136, 136))
    ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = lin((92, 89, 89))
    L.new(ramp.outputs['Color'], bg.inputs['Color'])
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = 'ABSOLUTE'; sc.render.line_thickness = 1.0
    vl = sc.view_layers[0]; vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(128)
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new('ink')
    ls.select_by_visibility = True; ls.visibility = 'VISIBLE'
    ls.select_by_edge_types = True
    ls.select_silhouette = True; ls.select_border = True; ls.select_crease = False; ls.select_material_boundary = True
    ls.select_external_contour = True
    ls.select_by_collection = True
    ls.linestyle.color = lin(INK)[:3]; ls.linestyle.thickness = 3.6 * SIZE[1] / 1000
    return sc


def floor():
    col = bpy.data.collections.new('set'); bpy.context.scene.collection.children.link(col)
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.0005))
    g = bpy.context.active_object
    for c in g.users_collection:
        c.objects.unlink(g)
    col.objects.link(g)
    m = bpy.data.materials.new('floor'); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links
    for n in list(N):
        N.remove(n)
    out = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission')
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs[0])
    lines = []
    for axis in ('X', 'Y'):
        # distance to the nearest grid line (every 30 cm), in metres
        d = N.new('ShaderNodeMath'); d.operation = 'PINGPONG'; d.inputs[1].default_value = 0.25
        off = N.new('ShaderNodeMath'); off.operation = 'ADD'; off.inputs[1].default_value = 0.25
        L.new(sep.outputs[axis], off.inputs[0]); L.new(off.outputs[0], d.inputs[0])
        lt = N.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = 0.007
        L.new(d.outputs[0], lt.inputs[0]); lines.append(lt)
    mx = N.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; L.new(lines[0].outputs[0], mx.inputs[0]); L.new(lines[1].outputs[0], mx.inputs[1])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs[6].default_value = lin((146, 142, 142)); mix.inputs[7].default_value = lin((112, 108, 108))
    L.new(mx.outputs[0], mix.inputs['Factor']); L.new(mix.outputs[2], em.inputs['Color']); L.new(em.outputs[0], out.inputs['Surface'])
    g.data.materials.append(m)
    # the ink only for the figure
    ls = bpy.context.scene.view_layers[0].freestyle_settings.linesets[0]
    figs = bpy.data.collections.new('figure'); bpy.context.scene.collection.children.link(figs)
    ls.collection = figs
    return g, figs


VIEW = {
    # yaw (degrees; 0 = from the front, + = the camera moves to the figure's left), pitch (+ = from above)
    'front': (0, 6), 'back': (180, 6), 'side_r': (-90, 6), 'side_l': (90, 6), 'turn30': (-28, 6),
    'front34': (-38, 26), 'back34': (142, 26), 'front34low': (38, -6), 'back34low': (-142, -6),
    'top': (0, 76), 'bottom': (0, -76),
}


def camera(view):
    yaw, pitch = VIEW[view]
    cam = bpy.data.cameras.new('cam')
    ob = bpy.data.objects.new('cam', cam); bpy.context.scene.collection.objects.link(ob)
    target = Vector((0, 0, 0.70))
    dist = 6.0
    if ORTHO:   # pixel for pixel with the concept (its rows 50..1050 in a 1000 px high frame)
        pitch = 0; target = Vector((0, 0, (GROUND - 550) * S))
    a, p = math.radians(yaw), math.radians(pitch)
    pos = target + Vector((math.sin(a) * math.cos(p), -math.cos(a) * math.cos(p), math.sin(p))) * dist
    ob.location = pos
    d = (target - pos).normalized()
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if ORTHO:
        cam.type = 'ORTHO'; cam.ortho_scale = SIZE[1] * S
    else:
        cam.sensor_fit = 'VERTICAL'; cam.sensor_height = 24
        # frame the 1.4 m figure in about 83% of the height (the views from above and below take in the spread arms)
        cam.lens = 24 * dist / (1.40 / 0.83) if abs(pitch) < 60 else 24 * dist / 1.9
    bpy.context.scene.camera = ob
    bpy.context.view_layer.update()
    return ob


def main():
    sc = scene_setup()
    body = bpy.data.objects['ash_base']
    assign_materials(body)
    fl, figs = floor()
    for c in body.users_collection:
        c.objects.unlink(body)
    figs.objects.link(body)
    for v in VIEWS:
        fl.hide_render = ORTHO or v == 'bottom'
        cam = camera(v)
        set_light(cam)
        sc.render.filepath = os.path.join(OUT, f'{v}.png')
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam)


main()
