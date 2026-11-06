"""
Shared helpers for the small project models in 3d/models/ (Phase 2).

Every model is built straight into one geometry space (all objects at the
origin, identity transforms). The site's dissolve shader sweeps up through
the model in that space, so parts must not carry their own transforms.

Each 3d/models/<slug>.py does:

    import model_kit as kit
    kit.start()
    ... kit.box(...), kit.lathe(...), kit.obj("Body", bm, kit.mat(...)) ...
    kit.finish()          # saves 3d/models/<slug>.blend (path from --save)

3d/build_models.py runs them, exports GLBs and shrinks them for the site.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

SKILL = os.path.join(os.path.expanduser("~"), ".claude", "skills", "blender-scroll-3d", "scripts")
sys.path.insert(0, SKILL)
import bscroll as bs  # noqa: E402

hex_color = bs.hex_color


def start():
    bs.new_scene()


def finish():
    args = bs.cli_args()
    path = args[args.index("--save") + 1]
    bs.save(path)


def mat(name, color, rough=0.6, metal=0.0, emission=None, strength=0.0):
    """Principled material; maps 1:1 to glTF PBR (emission -> emissive + KHR strength)."""
    return bs.material(name, color, metallic=metal, roughness=rough, emission=emission, emission_strength=strength)


def obj(name, bm, material=None, flat=False):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = not flat
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if material is not None:
        me.materials.append(material)
    if not flat:
        bs.smooth(ob, 32)
    return ob


def bake_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def _m(center, rot=(0, 0, 0), scale=None):
    m = Matrix.Translation(center) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()
    return m @ Matrix.Diagonal((*scale, 1.0)) if scale else m


def box(bm, center, size, rot=(0, 0, 0)):
    bmesh.ops.create_cube(bm, size=1.0, matrix=_m(center, rot, size))


def cyl(bm, center, r, h, segs=12, r2=None, rot=(0, 0, 0)):
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                          radius2=r if r2 is None else r2, depth=h, matrix=_m(center, rot))


def ico(bm, center, r, subdiv=1):
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r, matrix=Matrix.Translation(center))


def tube(bm, pts, r, sides=6, closed=False):
    """A tube along a polyline (neon, struts, rails). closed=True joins the ends."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    rings = []
    for i, p in enumerate(pts):
        a = pts[(i - 1) % n] if closed else pts[max(0, i - 1)]
        b = pts[(i + 1) % n] if closed else pts[min(n - 1, i + 1)]
        t = (b - a).normalized()
        ref = Vector((0, 0, 1)) if abs(t.z) < 0.95 else Vector((1, 0, 0))
        nn = t.cross(ref).normalized()
        bn = t.cross(nn).normalized()
        rings.append([bm.verts.new(p + (nn * math.cos(2 * math.pi * k / sides) + bn * math.sin(2 * math.pi * k / sides)) * r)
                      for k in range(sides)])
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for ra, rb in pairs:
        for k in range(sides):
            bm.faces.new((ra[k], ra[(k + 1) % sides], rb[(k + 1) % sides], rb[k]))
    if not closed:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])


def lathe(bm, profile, segs=16, center=(0, 0, 0)):
    """Revolve [(radius, z), ...] around Z (bottom to top). Caps where radius > 0."""
    cx, cy, cz = center
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((cx, cy, cz + z))])
        else:
            rings.append([bm.verts.new((cx + r * math.cos(2 * math.pi * k / segs), cy + r * math.sin(2 * math.pi * k / segs), cz + z))
                          for k in range(segs)])
    for ra, rb in zip(rings, rings[1:]):
        if len(ra) == 1 and len(rb) == 1:
            continue
        if len(ra) == 1:
            for k in range(segs):
                bm.faces.new((ra[0], rb[k], rb[(k + 1) % segs]))
        elif len(rb) == 1:
            for k in range(segs):
                bm.faces.new((ra[k], ra[(k + 1) % segs], rb[0]))
        else:
            for k in range(segs):
                bm.faces.new((ra[k], ra[(k + 1) % segs], rb[(k + 1) % segs], rb[k]))
    if len(rings[0]) > 1:
        bm.faces.new(rings[0][::-1])
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])


def prism(bm, pts2d, z0, z1, to3d=None):
    """Extrude a 2D polygon (x, y) between z0 and z1. to3d maps (x, y, z) if the
    plane isn't XY (e.g. a sign board standing up)."""
    to3d = to3d or (lambda x, y, z: (x, y, z))
    lo = [bm.verts.new(to3d(x, y, z0)) for x, y in pts2d]
    hi = [bm.verts.new(to3d(x, y, z1)) for x, y in pts2d]
    n = len(pts2d)
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    for i in range(n):
        bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))


def tri(bm, *pts):
    vs = [bm.verts.new(p) for p in pts]
    bm.faces.new(vs)


def arch_points(c, w, spring, ratio, n=5):
    """Pointed arch, left springing -> apex -> right springing."""
    r = ratio * w
    cx = w / 2 - r
    top = math.acos(max(-1.0, min(1.0, -cx / r)))
    right = [(cx + r * math.cos(top * i / n), r * math.sin(top * i / n)) for i in range(n + 1)]
    pts = [(-x, z) for x, z in reversed(right)] + [(x, z) for x, z in right[-2::-1]]
    return [(c + x, spring + z) for x, z in pts]


def wall_with_lancet(bm_target_name, u0, u1, v0, v1, op, to3d, thickness, material):
    """A wall panel with one pointed opening (clean quads), solidified."""
    bm = bmesh.new()
    cache = {}

    def v(uv):
        k = (round(uv[0], 4), round(uv[1], 4))
        if k not in cache:
            cache[k] = bm.verts.new(to3d(*uv))
        return cache[k]

    a, b = op["c"] - op["w"] / 2, op["c"] + op["w"] / 2
    quads = [((u0, v0), (a, v0), (a, v1), (u0, v1)), ((b, v0), (u1, v0), (u1, v1), (b, v1))]
    pts = arch_points(op["c"], op["w"], op["spring"], op["ratio"], op.get("n", 4))
    for (ua, _), (ub, _) in zip(pts, pts[1:]):
        quads.append(((ua, v0), (ub, v0), (ub, op["sill"]), (ua, op["sill"])))
    for (ua, va), (ub, vb) in zip(pts, pts[1:]):
        quads.append(((ua, va), (ub, vb), (ub, v1), (ua, v1)))
    for q in quads:
        vs = [v(p) for p in q]
        if len({id(x) for x in vs}) == 4:
            bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj(bm_target_name, bm, material, flat=True)
    mod = ob.modifiers.new("Solidify", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = 0.0
    return bake_modifiers(ob)


def text(body, size, extrude, material, location, rotation=(90, 0, 0)):
    """3D text converted to mesh, transforms applied (one geometry space)."""
    ob = bs.add_text(body, size=size, extrude=extrude, bevel=0.0, mat=material, location=location, rotation=rotation)
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob
