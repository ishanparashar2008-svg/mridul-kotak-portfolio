"""
Saltwater Cathedral: the "Watch a frame get made" scroll sequence.

A broken fragment of a flooded gothic nave hanging in the same dark void as
the site's #work section: a slab of floor with two bays of piers and pointed
arches, one tall lancet window, a section of ribbed vault, a few pews and
still water that spills off the broken edges in thin falls. Built entirely
from code and rendered from one camera move in three passes;
compose_cathedral.py stitches the passes together in bucket tiles so the
shot "renders" as the visitor scrolls.

    blender -b --factory-startup --python-exit-code 1 -P 3d/build_cathedral.py -- --out 3d/cathedral
    (writes 3d/cathedral/wire.blend, clay.blend, final.blend, specks.blend)

Add --passes final to rebuild just one. render_cathedral.py runs the whole
pipeline (build, render both framings, compose) in one go.

Passes (same geometry, same cameras; only shading and lights change)
  wire    Wireframe modifier on the fragment, emission #f26b38 on #0a0b0d
  clay    view-layer material override #b8b1a6, soft studio light
  lit     (not used by the site any more; build with --passes lit) neutral grey
          surfaces under the final lighting and light shafts
  final   stone, mirror water, falls and mist, candles, light shafts
  specks  the void's star specks and dust alone (the fragment is a holdout).
          The compositor adds them to every pass, so the void stays
          identical through every tile hand-off.

Camera (120 frames): a close three-quarter view, a ~70 degree orbit during
the passes, then in the last 15% a pull-back that drifts past the fragment
so the final frames are empty void, like the top of #work.

Layout (metres). Y runs toward the window, X across, Z up. Water is z = 0.
Cameras: "Cam" (desktop, 16:9) and "CamMobile" (portrait 720x1280).
"""

import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

SKILL = os.path.join(os.path.expanduser("~"), ".claude", "skills", "blender-scroll-3d", "scripts")
sys.path.insert(0, SKILL)
import bscroll as bs  # noqa: E402

# ---------------------------------------------------------------- tunables

BG = "#0a0b0d"            # page background (tokens.css --bg); the void
ACCENT = "#f26b38"        # Render Orange: the wireframe pass only
CLAY = "#b8b1a6"          # tokens.css --clay
SPECK = "#8b8d92"         # dust colour in js/world.js

FRAMES = 120
RES = (1600, 900)
SAMPLES = 64

# Fragment
FLOOR_Z = -0.6
RIM_Z = 0.08
BAY = 4.6
PIER_X = 4.2
PIER_Y = (0.0, BAY, 2 * BAY)
WALL_T = 0.9
ARCADE = dict(w=3.4, spring=4.6, ratio=1.0)
VAULT_SPRING = 8.8
VAULT_RATIO = 0.62
END_Y = 10.65             # centre line of the window wall
WINDOW = dict(w=2.0, sill=1.4, spring=8.6, ratio=1.5)
CENTRE = Vector((0.0, 4.6, 2.8))   # what the camera orbits

# Camera: orbit (azimuth 0 = in front, looking toward the window), then pull-back
HOLD_IN = 6
ORBIT_END = 100           # ~83%: the orbit is done, the pull-back starts
DRIFT_END = 114           # fragment is long gone; void hold to 120
CAMS = {
    "Cam": dict(lens=35, az=(-40.0, 30.0), el=(13.0, 7.0), dist=(48.0, 55.0)),
    "CamMobile": dict(lens=30, az=(-40.0, 30.0), el=(13.0, 7.0), dist=(36.0, 42.0)),
}
DRIFT_SIDE, DRIFT_BACK, DRIFT_AIM = 18.0, 12.0, 85.0

# Light (lit + final): a low sun straight behind the window. An invisible
# shadow-only screen behind the wall lets it in through the window alone.
SUN_AZ, SUN_EL = 84.0, 13.0       # azimuth from +X toward +Y
SUN_COLOR = "#ffd7a8"
SUN_STRENGTH = 22.0
FOG_DENSITY = 0.14
FOG_RADIUS = 17.0                 # fog fades to nothing this far from CENTRE: shafts dissolve into space

# Wireframe line width grows with distance from the camera path (~1.4 px everywhere)
WIRE_K = 0.00085
WIRE_MIN, WIRE_MAX = 0.006, 0.08

SEED = 7


# ---------------------------------------------------------------- small helpers

def clamp01(v):
    return min(1.0, max(0.0, v))


def smootherstep(t):
    t = clamp01(t)
    return t * t * t * (t * (6 * t - 15) + 10)


def arch_points(c, w, spring, ratio, n=7):
    """Pointed arch from the left springing over the apex to the right one.
    Two arcs of radius ratio * w; ratio 1 is equilateral, higher is a lancet."""
    r = ratio * w
    cx = w / 2 - r
    top = math.acos(max(-1.0, min(1.0, -cx / r)))
    right = [(cx + r * math.cos(top * i / n), r * math.sin(top * i / n)) for i in range(n + 1)]
    pts = [(-x, z) for x, z in reversed(right)] + [(x, z) for x, z in right[-2::-1]]
    return [(c + x, spring + z) for x, z in pts]


def pointed_height(x, span, ratio):
    r = ratio * span
    cx = span / 2 - r
    return math.sqrt(max(0.0, r * r - (abs(x) - cx) ** 2))


def new_object(name, bm, mat=None, collection=None):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    if mat is not None:
        me.materials.append(mat)
    ob["fragment"] = True
    return ob


def bake_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def bm_box(bm, center, size, rot=(0, 0, 0)):
    m = (Matrix.Translation(center) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()
         @ Matrix.Diagonal((*size, 1.0)))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def bm_cyl(bm, center, r, h, segs=10, r2=None, rot=(0, 0, 0)):
    m = Matrix.Translation(center) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r, radius2=r if r2 is None else r2, depth=h, matrix=m)


def bm_tube(bm, pts, r, sides=6, up=(0, 0, 1)):
    pts = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        t = (b - a).normalized()
        ref = Vector(up) if abs(t.dot(Vector(up))) < 0.95 else Vector((1, 0, 0))
        n = t.cross(ref).normalized()
        bn = t.cross(n).normalized()
        rings.append([bm.verts.new(p + (n * math.cos(2 * math.pi * k / sides) + bn * math.sin(2 * math.pi * k / sides)) * r)
                      for k in range(sides)])
    for ra, rb in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((ra[k], ra[(k + 1) % sides], rb[(k + 1) % sides], rb[k]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])


def bm_ring(bm, center, radius, r, segs=20, sides=5):
    cx, cy, cz = center
    pts = [(cx + radius * math.cos(2 * math.pi * i / segs), cy, cz + radius * math.sin(2 * math.pi * i / segs))
           for i in range(segs + 1)]
    bm_tube(bm, pts, r, sides, up=(0, 1, 0))


def bm_ico(bm, center, r, subdiv=0):
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r, matrix=Matrix.Translation(center))


# ---------------------------------------------------------------- walls with pointed openings

def wall_quads(u0, u1, v0, v1, openings, row=2.8):
    """Quads (wall u/v space) for a wall with pointed openings: clean quad
    topology (no booleans), so the wireframe pass reads like a modelled asset."""
    quads = []
    rows = max(1, round((v1 - v0) / row))
    levels = [v0 + (v1 - v0) * i / rows for i in range(rows + 1)]

    def solid(a, b):
        if b - a < 1e-4:
            return
        for va, vb in zip(levels, levels[1:]):
            quads.append(((a, va), (b, va), (b, vb), (a, vb)))

    cursor = u0
    for op in sorted(openings, key=lambda o: o["c"]):
        a, b = op["c"] - op["w"] / 2, op["c"] + op["w"] / 2
        solid(cursor, a)
        pts = arch_points(op["c"], op["w"], op["spring"], op["ratio"], n=op.get("n", 5))
        sill = op.get("sill")
        if sill is not None and sill > v0:
            for (ua, _), (ub, _) in zip(pts, pts[1:]):
                quads.append(((ua, v0), (ub, v0), (ub, sill), (ua, sill)))
        for (ua, va), (ub, vb) in zip(pts, pts[1:]):
            quads.append(((ua, va), (ub, vb), (ub, v1), (ua, v1)))
        cursor = b
    solid(cursor, u1)
    return quads


def wall(name, quads, to3d, thickness, mat):
    bm = bmesh.new()
    cache = {}

    def vert(uv):
        k = (round(uv[0], 4), round(uv[1], 4))
        if k not in cache:
            cache[k] = bm.verts.new(to3d(*uv))
        return cache[k]

    for q in quads:
        vs = [vert(p) for p in q]
        if len({id(v) for v in vs}) == 4:
            bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_object(name, bm, mat)
    if thickness:
        mod = ob.modifiers.new("Solidify", "SOLIDIFY")
        mod.thickness = thickness
        mod.offset = 0.0
        mod.use_even_offset = True
        bake_modifiers(ob)
    return ob


# ---------------------------------------------------------------- materials

class Materials:
    """A material per role. In the wire and clay passes the roles get cheap
    stand-ins; they're replaced by the wireframe emission or the override."""

    def __init__(self, pass_name):
        self.p = pass_name
        self.cache = {}

    def __call__(self, role):
        if role not in self.cache:
            self.cache[role] = self.make(role)
        return self.cache[role]

    def make(self, role):
        if self.p in ("wire", "clay", "specks"):
            return bs.material(f"{role}_{self.p}", "#808080", roughness=0.8)
        if self.p == "lit":
            grey = {
                "water": lambda: bs.material("water_lit", "#4a4a4a", roughness=0.1),
                "flame": lambda: bs.material("flame_lit", "#8a8a8a", emission="#ffffff", emission_strength=2.0),
                "dust": lambda: bs.material("dust_lit", "#a8a8a8", roughness=1.0),
                "glass": lambda: glass("glass_lit", tint=False),
                "sky": lambda: sky("sky_lit", "#d8d8d8"),
                "falls": lambda: falls("falls_lit", "#9a9a9a"),
                "mist": lambda: mist("mist_lit", "#b0b0b0"),
            }
            return grey[role]() if role in grey else bs.material(f"{role}_lit", "#8c8c8a", roughness=0.62)
        return {
            "stone_x": lambda: stone("stone_x", ("Y", "Z")),
            "stone_y": lambda: stone("stone_y", ("X", "Z")),
            "stone": lambda: stone("stone", None),
            "rock": lambda: stone("rock", None, dark=True),
            "water": water,
            "wood": lambda: wood("wood"),
            "wax": lambda: bs.material("wax", "#e9e1d0", roughness=0.42),
            "flame": lambda: bs.material("flame", "#ffe2b8", emission="#ffd9a6", emission_strength=28.0),
            "dust": lambda: bs.material("dust", "#a8a8a8", roughness=1.0),
            "glass": lambda: glass("glass", tint=True),
            "sky": lambda: sky("sky", "#fff0d8"),
            "falls": lambda: falls("falls", "#d6e2ea"),
            "mist": lambda: mist("mist", "#cfdae3"),
        }[role]()


def _nodes(m):
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    return nt, bsdf


def _out(nt):
    return next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")


def _ramp(nt, stops):
    r = nt.nodes.new("ShaderNodeValToRGB")
    el = r.color_ramp.elements
    for i, (pos, col) in enumerate(stops):
        e = el[i] if i < len(el) else el.new(pos)
        e.position = pos
        e.color = (*bs.hex_color(col), 1.0) if isinstance(col, str) else col
    return r


def _map(nt, value, a, b, c, d):
    mr = nt.nodes.new("ShaderNodeMapRange")
    nt.links.new(value, mr.inputs["Value"])
    mr.inputs["From Min"].default_value = a
    mr.inputs["From Max"].default_value = b
    mr.inputs["To Min"].default_value = c
    mr.inputs["To Max"].default_value = d
    return mr.outputs["Result"]


def _wetness(nt, pos):
    """1 at and below the waterline, fading out ~1 m above it with a ragged tide line."""
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(pos, sep.inputs[0])
    tide = nt.nodes.new("ShaderNodeTexNoise")
    tide.inputs["Scale"].default_value = 1.6
    tide.inputs["Detail"].default_value = 4.0
    nt.links.new(pos, tide.inputs["Vector"])
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "MULTIPLY_ADD"
    nt.links.new(tide.outputs["Fac"], add.inputs[0])
    add.inputs[1].default_value = 0.6
    nt.links.new(sep.outputs["Z"], add.inputs[2])
    return _map(nt, add.outputs[0], 0.55, 1.35, 1.0, 0.0)


def stone(name, axes, dark=False):
    """Cool blue-grey stone: tonal patches, ashlar coursing on walls, and a
    dark glossy wet band with a ragged tide line at the water."""
    m = bpy.data.materials.new(name)
    nt, bsdf = _nodes(m)
    pos = nt.nodes.new("ShaderNodeNewGeometry").outputs["Position"]
    patch = nt.nodes.new("ShaderNodeTexNoise")
    patch.inputs["Scale"].default_value = 0.32
    patch.inputs["Detail"].default_value = 6.0
    patch.inputs["Roughness"].default_value = 0.6
    nt.links.new(pos, patch.inputs["Vector"])
    base = _ramp(nt, [(0.3, "#3f464d" if dark else "#58616a"), (0.7, "#646d75" if dark else "#8a939b")])
    nt.links.new(patch.outputs["Fac"], base.inputs["Fac"])
    color = base.outputs["Color"]
    grain = nt.nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 9.0
    grain.inputs["Detail"].default_value = 8.0
    nt.links.new(pos, grain.inputs["Vector"])
    height = grain.outputs["Fac"]
    if axes:
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(pos, sep.inputs[0])
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(sep.outputs[axes[0]], comb.inputs["X"])
        nt.links.new(sep.outputs[axes[1]], comb.inputs["Y"])
        brick = nt.nodes.new("ShaderNodeTexBrick")
        brick.offset = 0.5
        for k, v in (("Scale", 1.0), ("Brick Width", 0.95), ("Row Height", 0.46), ("Mortar Size", 0.012),
                     ("Mortar Smooth", 0.4), ("Bias", 0.0)):
            brick.inputs[k].default_value = v
        brick.inputs["Color1"].default_value = (1.0, 1.0, 1.0, 1.0)
        brick.inputs["Color2"].default_value = (0.82, 0.84, 0.86, 1.0)
        brick.inputs["Mortar"].default_value = (0.55, 0.57, 0.6, 1.0)
        nt.links.new(comb.outputs[0], brick.inputs["Vector"])
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        nt.links.new(color, mul.inputs["A"])
        nt.links.new(brick.outputs["Color"], mul.inputs["B"])
        color = mul.outputs["Result"]
        hm = nt.nodes.new("ShaderNodeMath")
        hm.operation = "SUBTRACT"
        nt.links.new(height, hm.inputs[0])
        nt.links.new(brick.outputs["Fac"], hm.inputs[1])
        height = hm.outputs[0]
    wet = _wetness(nt, pos)
    wet_col = nt.nodes.new("ShaderNodeMix")
    wet_col.data_type = "RGBA"
    nt.links.new(wet, wet_col.inputs["Factor"])
    nt.links.new(color, wet_col.inputs["A"])
    wet_col.inputs["B"].default_value = (*bs.hex_color("#27302f"), 1.0)
    nt.links.new(wet_col.outputs["Result"], bsdf.inputs["Base Color"])
    nt.links.new(_map(nt, wet, 0, 1, 0.8, 0.22), bsdf.inputs["Roughness"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.02
    nt.links.new(height, bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def wood(name):
    m = bpy.data.materials.new(name)
    nt, bsdf = _nodes(m)
    pos = nt.nodes.new("ShaderNodeNewGeometry").outputs["Position"]
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.inputs["Scale"].default_value = 3.0
    wave.inputs["Distortion"].default_value = 6.0
    nt.links.new(pos, wave.inputs["Vector"])
    ramp = _ramp(nt, [(0.25, "#2a211b"), (0.8, "#4a3a2e")])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    wet = _wetness(nt, pos)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(wet, mix.inputs["Factor"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["A"])
    mix.inputs["B"].default_value = (*bs.hex_color("#17130f"), 1.0)
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    nt.links.new(_map(nt, wet, 0, 1, 0.7, 0.3), bsdf.inputs["Roughness"])
    return m


def water():
    """Mirror-still and dark; reflections from EEVEE screen-space ray tracing.
    (A planar light probe blanks reflections in Blender 5.2 background renders.)"""
    m = bpy.data.materials.new("water")
    nt, bsdf = _nodes(m)
    bsdf.inputs["Base Color"].default_value = (*bs.hex_color("#0b1316"), 1.0)
    bsdf.inputs["Roughness"].default_value = 0.012
    bsdf.inputs["IOR"].default_value = 1.33
    return m


def _emission_only(name, color_socket_fn, strength):
    m = bpy.data.materials.new(name)
    nt, bsdf = _nodes(m)
    nt.nodes.remove(bsdf)
    em = nt.nodes.new("ShaderNodeEmission")
    color_socket_fn(nt, em.inputs["Color"])
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], _out(nt).inputs["Surface"])
    return m, nt, em


def glass(name, tint):
    """Backlit frosted glass: emission only, so it glows from the inside view
    yet still casts a shadow for the sun (broken panes make the shafts)."""
    def col(nt, sock):
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 2.5
        nt.links.new(nt.nodes.new("ShaderNodeNewGeometry").outputs["Position"], noise.inputs["Vector"])
        ramp = _ramp(nt, [(0.35, "#9aa8b2" if tint else "#a0a0a0"), (0.75, "#e4e3dc" if tint else "#d8d8d8")])
        nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], sock)
    return _emission_only(name, col, 1.1)[0]


def sky(name, color):
    """The bright day behind the window: only the camera sees it (no shadow)."""
    def col(nt, sock):
        sock.default_value = (*bs.hex_color(color), 1.0)
    m = _emission_only(name, col, 2.4)[0]
    m.use_backface_culling = True
    return m


def _fade_mix(name, color, alpha_fn, emission=0.0):
    """Principled surface mixed with Transparent by alpha_fn(nt, position)."""
    m = bpy.data.materials.new(name)
    nt, bsdf = _nodes(m)
    bsdf.inputs["Base Color"].default_value = (*bs.hex_color(color), 1.0)
    bsdf.inputs["Roughness"].default_value = 0.25
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*bs.hex_color(color), 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    pos = nt.nodes.new("ShaderNodeNewGeometry").outputs["Position"]
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(alpha_fn(nt, pos), mix.inputs["Fac"])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[1])
    nt.links.new(bsdf.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], _out(nt).inputs["Surface"])
    for attr, val in (("surface_render_method", "DITHERED"), ("blend_method", "HASHED")):
        try:
            setattr(m, attr, val)
            break
        except (AttributeError, TypeError):
            continue
    return m


def falls(name, color):
    """Thin falls: streaky, fading out as they drop away from the slab."""
    def alpha(nt, pos):
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(pos, sep.inputs[0])
        fade = _map(nt, sep.outputs["Z"], -0.2, -4.4, 0.7, 0.0)
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.bands_direction = "X"
        wave.inputs["Scale"].default_value = 4.0
        wave.inputs["Distortion"].default_value = 3.0
        wave.inputs["Detail"].default_value = 4.0
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (6.0, 6.0, 0.25)
        nt.links.new(pos, mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], wave.inputs["Vector"])
        streak = _map(nt, wave.outputs["Fac"], 0.2, 0.8, 0.25, 1.0)
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        nt.links.new(fade, mul.inputs[0])
        nt.links.new(streak, mul.inputs[1])
        return mul.outputs[0]
    return _fade_mix(name, color, alpha, emission=0.15)


def mist(name, color):
    """Spray under the falls, thinning out with depth into the void."""
    def alpha(nt, pos):
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(pos, sep.inputs[0])
        return _map(nt, sep.outputs["Z"], -2.2, -5.8, 0.5, 0.0)
    return _fade_mix(name, color, alpha, emission=0.25)


# ---------------------------------------------------------------- the fragment

def outline_points(rnd):
    """Broken edge of the slab: a squarish superellipse with bites taken out
    (kept clear of the piers and the window wall)."""
    n = 44
    cx, cy, rx, ry = 0.0, 4.6, 6.3, 7.3
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        r = 1.0 / (abs(c) ** 4 + abs(s) ** 4) ** 0.25
        jitter = rnd.uniform(-0.05, 0.05)
        if rnd.random() < 0.18 and abs(s) < 0.9:   # a bite out of the edge
            jitter -= rnd.uniform(0.04, 0.09)
        pts.append(Vector((cx + rx * r * c * (1 + jitter), cy + ry * r * s * (1 + jitter), 0)))
    return pts


BREACHES = (4, 15, 27, 37)   # outline indices where the water spills over


def build_slab(M, rnd):
    """The floor slab: a rim around a sunken flooded floor, a broken outer
    edge and a jagged rocky underside, like a chunk torn out of the ground."""
    out = outline_points(rnd)
    n = len(out)
    centre = Vector((0.0, 4.6, 0.0))

    def scaled(k, z, jit=0.0):
        return [centre + (p - centre) * (k * (1 + rnd.uniform(-jit, jit))) + Vector((0, 0, z + rnd.uniform(-jit, jit) * 4))
                for p in out]

    rim_z = [(-0.03 if i in BREACHES or (i - 1) in BREACHES else RIM_Z) for i in range(n)]
    inner = [centre + (p - centre) * 0.94 for p in out]
    bm = bmesh.new()
    loops = [
        [bm.verts.new((p.x, p.y, rim_z[i])) for i, p in enumerate(out)],                 # rim, outer
        [bm.verts.new((p.x, p.y, rim_z[i])) for i, p in enumerate(inner)],               # rim, inner
        [bm.verts.new((p.x, p.y, FLOOR_Z)) for p in inner],                              # sunk floor edge
    ]
    for ra, rb in zip(loops, loops[1:]):
        for i in range(n):
            bm.faces.new((ra[i], ra[(i + 1) % n], rb[(i + 1) % n], rb[i]))
    # floor: concentric rings toward the middle
    prev = loops[2]
    for k in (0.7, 0.4):
        ring = [bm.verts.new(centre + (p - centre) * k + Vector((0, 0, FLOOR_Z))) for p in inner]
        for i in range(n):
            bm.faces.new((prev[i], prev[(i + 1) % n], ring[(i + 1) % n], ring[i]))
        prev = ring
    bm.faces.new(prev)
    # outer edge and underside
    under = [loops[0]]
    for k, z, jit in ((1.0, -0.9, 0.0), (0.93, -1.5, 0.05), (0.72, -2.3, 0.07), (0.42, -3.1, 0.08)):
        under.append([bm.verts.new(p) for p in scaled(k, z, jit)])
    for ra, rb in zip(under, under[1:]):
        for i in range(n):
            bm.faces.new((ra[(i + 1) % n], ra[i], rb[i], rb[(i + 1) % n]))
    tip = bm.verts.new(centre + Vector((0.3, -0.4, -3.8)))
    for i in range(n):
        bm.faces.new((under[-1][(i + 1) % n], under[-1][i], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    new_object("Slab", bm, M("rock"))

    # Water: concentric rings inside the rim (they read as a modelled surface in wireframe)
    bm = bmesh.new()
    rings = []
    for k in (1.0, 0.8, 0.6, 0.4, 0.2):
        rings.append([bm.verts.new(centre + (p - centre) * k) for p in inner])
    for ra, rb in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((ra[i], ra[(i + 1) % n], rb[(i + 1) % n], rb[i]))
    bm.faces.new(rings[-1])
    new_object("Water", bm, M("water"))
    return out


def build_falls(M, outline, rnd, with_mist):
    """Thin falls from the breaches, curving out and down, and their mist."""
    centre = Vector((0.0, 4.6, 0.0))
    bm = bmesh.new()
    spray = []
    for idx in BREACHES:
        p = (outline[idx] + outline[(idx + 1) % len(outline)]) / 2
        nrm = (p - centre).normalized()
        tan = Vector((-nrm.y, nrm.x, 0))
        w = rnd.uniform(0.5, 1.0)
        rows = []
        for j in range(19):
            drop = j * 0.27
            reach = 0.15 + 0.5 * math.sqrt(drop)
            half = w / 2 * (1 + 0.05 * j)
            base = p + nrm * reach + Vector((0, 0, -0.02 - drop))
            rows.append([bm.verts.new(base + tan * (half * (2 * k / 3 - 1))) for k in range(4)])
        for ra, rb in zip(rows, rows[1:]):
            for k in range(3):
                bm.faces.new((ra[k], ra[k + 1], rb[k + 1], rb[k]))
        spray.append((p + nrm * (0.15 + 0.5 * math.sqrt(4.9)), nrm))
    new_object("Falls", bm, M("falls"))

    if with_mist:
        bm = bmesh.new()
        for base, nrm in spray:
            for _ in range(70):
                d = rnd.uniform(0, 1) ** 0.7
                spread = 0.3 + 2.4 * d
                a = rnd.uniform(0, 2 * math.pi)
                q = base + nrm * (d * 1.2) + Vector((math.cos(a) * spread, math.sin(a) * spread, -3.0 - 6.0 * d)) * Vector((1, 1, 1))
                q.z = -2.4 - 4.5 * d + rnd.uniform(-0.3, 0.3)
                bm_ico(bm, q, rnd.uniform(0.012, 0.024))
        new_object("Mist", bm, M("mist"))


def build_nave(M, rnd):
    xi = PIER_X - WALL_T / 2

    # Left arcade: both bays (bay 1 broken lower), right arcade: bay 2 only
    lx = -PIER_X
    wall("ArcadeL1", wall_quads(-0.7, BAY, FLOOR_Z, 7.9, [dict(c=BAY / 2, **ARCADE)]),
         lambda u, v: Vector((lx, u, v)), WALL_T, M("stone_x"))
    wall("ArcadeL2", wall_quads(BAY, 2 * BAY + 0.7, FLOOR_Z, VAULT_SPRING, [dict(c=1.5 * BAY, **ARCADE)]),
         lambda u, v: Vector((lx, u, v)), WALL_T, M("stone_x"))
    rx = PIER_X
    wall("ArcadeR2", wall_quads(BAY - 0.6, 2 * BAY + 0.7, FLOOR_Z, VAULT_SPRING, [dict(c=1.5 * BAY, **ARCADE)]),
         lambda u, v: Vector((rx, u, v)), WALL_T, M("stone_x"))
    # a scrap of clerestory over the right-hand bay, with its own small lancet
    wall("ClerestoryR2", wall_quads(BAY - 0.2, 2 * BAY + 0.4, VAULT_SPRING, 11.8,
                                    [dict(c=1.5 * BAY, w=1.2, sill=9.4, spring=10.5, ratio=1.4, n=4)]),
         lambda u, v: Vector((rx, u, v)), WALL_T, M("stone_x"))

    # Window wall at the far end, with the tall lancet
    wall("WindowWall", wall_quads(-3.6, 3.6, FLOOR_Z, 12.8, [dict(c=0.0, n=6, **WINDOW)]),
         lambda u, v: Vector((u, END_Y, v)), WALL_T, M("stone_y"))

    # Broken masonry along the wall tops: loose blocks, stepped down at the ends
    bm = bmesh.new()
    tops = [((lx, -0.7), (lx, BAY), 7.9), ((lx, BAY), (lx, 2 * BAY + 0.7), VAULT_SPRING),
            ((rx, BAY - 0.2), (rx, 2 * BAY + 0.4), 11.8), ((-3.6, END_Y), (3.6, END_Y), 12.8)]
    for (ax, ay), (bx, by), z in tops:
        length = math.hypot(bx - ax, by - ay)
        for k in range(int(length / 0.95)):
            if rnd.random() < 0.35:
                continue
            t = (k + 0.5) * 0.95 / length
            h = rnd.uniform(0.2, 0.5)
            along_y = abs(bx - ax) < 1e-6
            size = (WALL_T * 0.95, 0.9, h) if along_y else (0.9, WALL_T * 0.95, h)
            bm_box(bm, (ax + (bx - ax) * t, ay + (by - ay) * t, z + h / 2), size, (0, 0, rnd.uniform(-4, 4)))
    # stepped broken ends where the walls stop short
    for x, y, z0 in ((lx, -0.7, 7.9), (rx, BAY - 0.6, VAULT_SPRING)):
        for s in range(4):
            bm_box(bm, (x, y + 0.45 + s * 0.6, z0 - 0.5 - s * 1.1), (WALL_T * 1.02, 0.95, 0.46))
    new_object("Coping", bm, M("stone"))

    # Piers: round core + attached shafts; the front right one is snapped off
    bm = bmesh.new()
    for y in PIER_Y:
        for side in (-1, 1):
            x = side * PIER_X
            top = ARCADE["spring"] if not (side == 1 and y == 0.0) else 2.4
            h = top - FLOOR_Z
            bm_cyl(bm, (x, y, FLOOR_Z + h / 2), 0.55, h, 10)
            bm_cyl(bm, (x, y, FLOOR_Z + 0.25), 0.78, 0.5, 8)
            if top == ARCADE["spring"]:
                bm_cyl(bm, (x, y, top - 0.12), 0.58, 0.24, 10, r2=0.74)
                xs = side * (PIER_X - WALL_T / 2 - 0.15)
                hs = VAULT_SPRING - FLOOR_Z
                bm_cyl(bm, (xs, y, FLOOR_Z + hs / 2), 0.15, hs, 6)
                bm_cyl(bm, (xs, y, VAULT_SPRING - 0.1), 0.18, 0.2, 6, r2=0.26)
    new_object("Piers", bm, M("stone"))

    # Arch mouldings on the nave faces
    bm = bmesh.new()
    for side, bays in ((-1, (BAY / 2, 1.5 * BAY)), (1, (1.5 * BAY,))):
        x = side * (PIER_X - WALL_T / 2 - 0.04)
        for c in bays:
            pts = arch_points(c, ARCADE["w"] + 0.1, ARCADE["spring"], ARCADE["ratio"], n=6)
            bm_tube(bm, [(x, u, v) for u, v in pts], 0.08, 5)
    new_object("ArchMouldings", bm, M("stone"))

    # Vault: the far bay keeps its webbing, the near bay is just a rib skeleton
    s1 = 2 * xi

    def h_across(x):
        return pointed_height(x, s1, VAULT_RATIO)

    nx, ny = 8, 4
    bm = bmesh.new()
    rows = []
    for j in range(ny + 1):
        y = BAY + BAY * j / ny
        yl = y - 1.5 * BAY
        rows.append([bm.verts.new((-xi + s1 * i / nx, y,
                                   VAULT_SPRING + max(h_across(-xi + s1 * i / nx), h_across(yl * s1 / BAY))))
                     for i in range(nx + 1)])
    for ra, rb in zip(rows, rows[1:]):
        for i in range(nx):
            bm.faces.new((ra[i], ra[i + 1], rb[i + 1], rb[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    new_object("Vault", bm, M("stone"))

    bm = bmesh.new()
    n, drop = 16, 0.08

    def rib(x0, x1, y_of_x, r):
        pts = []
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            pts.append((x, y_of_x(x), VAULT_SPRING + h_across(x) - drop))
        bm_tube(bm, pts, r, 5)

    rib(-xi, xi, lambda x: BAY, 0.14)                     # transverse rib between the bays
    rib(-xi, xi, lambda x: 2 * BAY, 0.14)                 # transverse rib at the window end
    for d in (1, -1):                                     # far bay diagonals
        rib(-xi, xi, lambda x, d=d: 1.5 * BAY + d * x * BAY / s1, 0.11)
    rib(-xi, xi, lambda x: 0.5 * BAY + x * BAY / s1, 0.11)    # near bay: one whole diagonal...
    rib(-xi, 0.0, lambda x: 0.5 * BAY - x * BAY / s1, 0.11)   # ...and half of the other, snapped at the boss
    apex = VAULT_SPRING + h_across(0) - drop
    for y in (0.5 * BAY, 1.5 * BAY):
        bm_cyl(bm, (0, y, apex - 0.12), 0.28, 0.28, 8)
    new_object("Ribs", bm, M("stone"))

    # Tracery in the lancet: one mullion, two little heads, an oculus
    bm = bmesh.new()
    y = END_Y - WALL_T / 2 + 0.1
    w = WINDOW["w"]
    hm = WINDOW["spring"] + 0.9 - WINDOW["sill"]
    bm_box(bm, (0, y, WINDOW["sill"] + hm / 2), (0.13, 0.3, hm))
    for c in (-w / 4, w / 4):
        pts = arch_points(c, w / 2 - 0.13, WINDOW["spring"], 0.9, n=5)
        bm_tube(bm, [(u, y, v) for u, v in pts], 0.055, 5, up=(0, 1, 0))
    bm_ring(bm, (0, y, WINDOW["spring"] + 1.45), 0.42, 0.055)
    z = WINDOW["sill"] + 0.65
    while z < WINDOW["spring"] + 0.4:                      # iron saddle bars
        bm_box(bm, (0, y, z), (w, 0.04, 0.03))
        z += 0.65
    new_object("Tracery", bm, M("stone"))

    # Old leaded glass: glows, blocks the sun; broken panes let the shafts through
    rg = random.Random(SEED + 1)
    bm = bmesh.new()
    cw, ch = 0.333, 0.55
    x = -w / 2
    while x < w / 2 - 1e-3:
        z = WINDOW["sill"]
        while z < WINDOW["spring"] + 2.4:
            if rg.random() > 0.3:
                bm_box(bm, (x + cw / 2, END_Y + 0.15, z + ch / 2), (cw, 0.02, ch))
            z += ch
        x += cw
    new_object("Glass", bm, M("glass"))


def build_contents(M, rnd, with_dust):
    # Pews, half under water, knocked about
    bm = bmesh.new()

    def pew(cx, cy, length, rot):
        def part(off, size):
            m = Matrix.Translation((cx, cy, FLOOR_Z)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()
            bmesh.ops.create_cube(bm, size=1.0, matrix=m @ Matrix.Translation(off) @ Matrix.Diagonal((*size, 1)))
        part((0, 0, 0.45), (length, 0.42, 0.06))
        part((0, 0.2, 0.75), (length, 0.05, 0.56))
        part((0, 0.2, 1.06), (length + 0.04, 0.09, 0.06))
        for e in (-1, 1):
            part((e * length / 2, 0.02, 0.52), (0.07, 0.5, 1.04))

    for cx, cy, rot in ((-2.2, 1.6, (-4, 2, 3)), (-2.3, 2.7, (-15, 4, -7)), (2.2, 2.2, (6, -5, 9)),
                        (-2.2, 5.9, (-2, 0, -2)), (2.3, 6.4, (-12, 3, 5)), (-2.4, 7.4, (5, -3, 10))):
        pew(cx, cy, 2.3, rot)
    bm_box(bm, (0.6, 3.9, 0.01), (1.5, 0.22, 0.05), (0, 0, 34))  # a loose plank
    new_object("Pews", bm, M("wood"))

    # The snapped pier's drum lying in the water, and a few fallen blocks
    bm = bmesh.new()
    bm_cyl(bm, (3.0, -0.8, FLOOR_Z + 0.45), 0.55, 1.8, 10, rot=(90, 0, 62))
    for x, y in ((3.4, 1.4), (-3.3, -0.6), (1.1, 8.6)):
        bm_box(bm, (x, y, FLOOR_Z + 0.35), (0.8, 0.6, 0.55), (rnd.uniform(-15, 15), rnd.uniform(-15, 15), rnd.uniform(0, 90)))
    new_object("Debris", bm, M("stone"))

    # Floating candles
    bm_float, bm_wax, bm_flame = bmesh.new(), bmesh.new(), bmesh.new()
    flames = []
    for x, y in ((-0.6, 1.2), (0.7, 3.1), (-0.3, 5.0), (0.9, 6.8), (-0.8, 8.3)):
        h = rnd.uniform(0.12, 0.24)
        bm_cyl(bm_float, (x, y, 0.012), 0.13, 0.05, 10)
        bm_cyl(bm_wax, (x, y, 0.037 + h / 2), 0.038, h, 8)
        fz = 0.037 + h + 0.035
        bmesh.ops.create_uvsphere(bm_flame, u_segments=6, v_segments=5, radius=1.0,
                                  matrix=Matrix.Translation((x, y, fz)) @ Matrix.Diagonal((0.012, 0.012, 0.03, 1)))
        flames.append((x, y, fz))
    new_object("CandleFloats", bm_float, M("wood"))
    new_object("Candles", bm_wax, M("wax"))
    new_object("Flames", bm_flame, M("flame"))

    if with_dust:   # motes that catch the shafts
        bm = bmesh.new()
        for _ in range(500):
            p = Vector((rnd.uniform(-3.6, 3.6), rnd.uniform(-6.0, 10.0), rnd.uniform(0.3, 10.0)))
            bm_ico(bm, p, rnd.uniform(0.008, 0.014))
        new_object("Motes", bm, M("dust"))
    return flames


# ---------------------------------------------------------------- cameras

def cam_frame(spec, f):
    """Camera position and aim for frame f."""
    t = smootherstep((f - HOLD_IN) / (ORBIT_END - HOLD_IN))
    az = math.radians(spec["az"][0] + (spec["az"][1] - spec["az"][0]) * t)
    el = math.radians(spec["el"][0] + (spec["el"][1] - spec["el"][0]) * t)
    d = spec["dist"][0] + (spec["dist"][1] - spec["dist"][0]) * t
    offset = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    pos = CENTRE + offset * d
    aim = CENTRE.copy()
    if f > ORBIT_END:
        u = smootherstep((f - ORBIT_END) / (DRIFT_END - ORBIT_END))
        back = Vector((offset.x, offset.y, 0)).normalized()
        right = (-back).cross(Vector((0, 0, 1)))   # keeps the orbit's sideways momentum
        pos = pos + right * (DRIFT_SIDE * u) + back * (DRIFT_BACK * u)
        aim = CENTRE + right * (DRIFT_AIM * u)
        aim.z = CENTRE.z + (pos.z - CENTRE.z) * u   # level out, like the #work camera
    return pos, aim


def build_cameras():
    for name, spec in CAMS.items():
        cd = bpy.data.cameras.new(name)
        cd.lens = spec["lens"]
        cd.clip_start, cd.clip_end = 0.1, 400
        cd.sensor_fit = "AUTO"
        cam = bpy.data.objects.new(name, cd)
        bpy.context.scene.collection.objects.link(cam)
        for f in range(1, FRAMES + 1):
            pos, aim = cam_frame(spec, f)
            cam.location = pos
            cam.rotation_euler = (aim - pos).to_track_quat("-Z", "Y").to_euler()
            cam.keyframe_insert("location", frame=f)
            cam.keyframe_insert("rotation_euler", frame=f)
        for fc in iter_fcurves(cam.animation_data):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
    bpy.context.scene.camera = bpy.data.objects["Cam"]


def iter_fcurves(ad):
    act = ad.action
    if hasattr(act, "layers") and act.layers:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves
    elif hasattr(act, "fcurves"):
        yield from act.fcurves


_CAM_SAMPLES = None


def camera_samples():
    global _CAM_SAMPLES
    if _CAM_SAMPLES is None:
        _CAM_SAMPLES = np.array([tuple(cam_frame(spec, f)[0]) for spec in CAMS.values() for f in range(1, FRAMES + 1, 2)])
    return _CAM_SAMPLES


def min_cam_distance(points):
    pts = np.asarray(points, dtype=float).reshape(-1, 3)
    out = np.empty(len(pts))
    s = camera_samples()
    for i in range(0, len(pts), 20000):
        out[i:i + 20000] = np.linalg.norm(pts[i:i + 20000, None, :] - s[None], axis=2).min(axis=1)
    return out


# ---------------------------------------------------------------- the void

def build_specks(rnd):
    """Star specks and dust like the #work void: sparse, 1-3 px, #8b8d92.
    Sized from their distance to the camera path so they stay pixel-sized."""
    pts, sizes, glow = [], [], []
    while len(pts) < 1500:
        d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
        r = 22 + 160 * rnd.random() ** 1.6
        p = CENTRE + d * r
        pts.append(tuple(p))
        big = rnd.random() < 0.07
        sizes.append(1.7 if big else rnd.uniform(0.8, 1.15))
        glow.append(rnd.uniform(0.5, 1.0))
    dist = min_cam_distance(pts)
    keep = dist > 6.0
    bm = bmesh.new()
    for p, s, dd, k in zip(pts, sizes, dist, keep):
        if k:
            bm_ico(bm, p, max(0.004, 0.0007 * dd * s))
    m, nt, em = _emission_only("Speck", lambda nt, sock: setattr(sock, "default_value", (*bs.hex_color(SPECK), 1.0)), 0.27)
    ob = new_object("Specks", bm, m)
    ob["fragment"] = False
    return ob


# ---------------------------------------------------------------- passes

def world_split(camera_rgb, light_hex, light_strength):
    """World the camera sees as the page colour, while the scene is lit by a
    dimmer (or brighter, for clay) ambient."""
    scene = bpy.context.scene
    w = bpy.data.worlds.new("World")
    scene.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    for n in [n for n in nt.nodes if n.type != "OUTPUT_WORLD"]:
        nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_WORLD")
    a = nt.nodes.new("ShaderNodeBackground")
    a.inputs["Color"].default_value = (*bs.hex_color(light_hex), 1)
    a.inputs["Strength"].default_value = light_strength
    b = nt.nodes.new("ShaderNodeBackground")
    b.inputs["Color"].default_value = (*camera_rgb, 1)
    b.inputs["Strength"].default_value = 1.0
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(a.outputs["Background"], mix.inputs[1])
    nt.links.new(b.outputs["Background"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    w.color = camera_rgb
    return w


def fragment_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.get("fragment")]


def wire_pass():
    """The fragment as glowing Render Orange lines on the page colour."""
    mat, nt, em = _emission_only("Wire", lambda nt, sock: setattr(sock, "default_value", (*bs.hex_color(ACCENT), 1.0)), 1.0)
    cam = nt.nodes.new("ShaderNodeCameraData")
    nt.links.new(_map(nt, cam.outputs["View Z Depth"], 28.0, 60.0, 1.0, 0.45), em.inputs["Strength"])
    for ob in fragment_objects():
        me = ob.data
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        thick = np.clip(WIRE_K * min_cam_distance(co), WIRE_MIN, WIRE_MAX)
        w = np.round(thick / WIRE_MAX, 3)
        vg = ob.vertex_groups.new(name="wire")
        for val in np.unique(w):
            vg.add(np.nonzero(w == val)[0].tolist(), float(val), "REPLACE")
        mod = ob.modifiers.new("Wireframe", "WIREFRAME")
        mod.thickness = WIRE_MAX
        mod.use_replace = True
        mod.use_even_offset = True
        mod.use_boundary = True
        mod.offset = 0.0
        mod.vertex_group = "wire"
        mod.thickness_vertex_group = 0.0
        me.materials.clear()
        me.materials.append(mat)
    world_split(bs.display_match(BG), BG, 0.0)


def clay_pass():
    """Matte clay through the view-layer override, soft studio light, page-colour void."""
    bpy.context.view_layer.material_override = bs.material("ClayOverride", CLAY, roughness=0.85)
    bpy.context.scene.view_settings.look = "AgX - Medium High Contrast"
    world_split(bs.display_match(BG), "#cfcbc4", 0.4)
    top = bs.area_light("Softbox", CENTRE + Vector((-6, -6, 18)), CENTRE, power=7000, size=12.0, color="#fff6ec")
    fill = bs.area_light("Fill", CENTRE + Vector((14, -24, 4)), CENTRE, power=4500, size=14.0, color="#f2f1ee")
    for light in (top, fill):
        light.data.volume_factor = 0.0


def specks_pass():
    """Only the void's specks; the fragment cuts them out as a holdout."""
    for ob in fragment_objects():
        ob.is_holdout = True
    world_split((0.0, 0.0, 0.0), "#000000", 0.0)


def lights(flames):
    """Final lighting, shared by the lit and final passes."""
    scene = bpy.context.scene
    scene.view_settings.look = "AgX - Medium High Contrast"   # before display_match, which depends on it
    world_split(bs.display_match(BG), "#6f8498", 0.06)

    sd = bpy.data.lights.new("Sun", "SUN")
    sd.energy = SUN_STRENGTH
    sd.color = bs.hex_color(SUN_COLOR)
    sd.angle = math.radians(0.6)
    sun = bpy.data.objects.new("Sun", sd)
    scene.collection.objects.link(sun)
    az, el = math.radians(SUN_AZ), math.radians(SUN_EL)
    sun.rotation_euler = (-Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))) \
        .to_track_quat("-Z", "Y").to_euler()

    # Shadow-only screen behind the window wall, with the lancet cut out of
    # it: the sun reaches the fragment (and the fog) through the window alone.
    screen = wall("SunScreen", wall_quads(-80, 80, -60, 80, [dict(c=0.0, n=8, **{**WINDOW, "w": WINDOW["w"] + 0.1})]),
                  lambda u, v: Vector((u, END_Y + 1.1, v)), 0.0, None)
    screen["fragment"] = False
    for attr in ("visible_camera", "visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter"):
        if hasattr(screen, attr):
            setattr(screen, attr, False)

    # The bright day behind the window (camera only; it must not shade the sun)
    bm = bmesh.new()
    hw, z0, z1, yb = WINDOW["w"] / 2 + 0.5, WINDOW["sill"] - 0.4, WINDOW["spring"] + 3.0, END_Y + 0.75
    vs = [bm.verts.new(c) for c in ((-hw, yb, z0), (-hw, yb, z1), (hw, yb, z1), (hw, yb, z0))]
    bm.faces.new(vs)
    card = new_object("Sky", bm, MATS("sky"))
    card["fragment"] = False
    card.visible_shadow = False

    for i, (x, y, z) in enumerate(flames):
        ld = bpy.data.lights.new(f"Candle{i}", "POINT")
        ld.energy = 5.0
        ld.color = bs.hex_color("#ffc58a")
        ld.shadow_soft_size = 0.03
        ld.use_shadow = False
        ob = bpy.data.objects.new(f"Candle{i}", ld)
        ob.location = (x, y, z + 0.02)
        scene.collection.objects.link(ob)

    # Cool fill and rim so the stone reads against the void (they don't touch the fog)
    rim = bs.area_light("Rim", CENTRE + Vector((-18, 12, 16)), CENTRE, power=26000, size=10.0, color="#b9c8d6")
    fill = bs.area_light("Fill", CENTRE + Vector((8, -28, 5)), CENTRE, power=14000, size=16.0, color="#9fb0c0")
    for light in (rim, fill):
        light.data.volume_factor = 0.0

    # Fog that makes the shafts visible, fading to nothing FOG_RADIUS from the fragment
    vm = bpy.data.materials.new("Fog")
    vm.use_nodes = True
    nt = vm.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*bs.hex_color("#d3dbe2"), 1)
    vol.inputs["Anisotropy"].default_value = 0.65
    pos = nt.nodes.new("ShaderNodeNewGeometry").outputs["Position"]
    sub = nt.nodes.new("ShaderNodeVectorMath")
    sub.operation = "DISTANCE"
    nt.links.new(pos, sub.inputs[0])
    sub.inputs[1].default_value = tuple(CENTRE)
    falloff = _map(nt, sub.outputs["Value"], 0.0, FOG_RADIUS, 1.0, 0.0)
    sq = nt.nodes.new("ShaderNodeMath")
    sq.operation = "POWER"
    nt.links.new(falloff, sq.inputs[0])
    sq.inputs[1].default_value = 1.6
    # no fog behind the window wall: there the sun would light it directly
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(pos, sep.inputs[0])
    front = nt.nodes.new("ShaderNodeMath")
    front.operation = "MULTIPLY"
    nt.links.new(sq.outputs[0], front.inputs[0])
    nt.links.new(_map(nt, sep.outputs["Y"], END_Y - 0.2, END_Y + 0.3, 1.0, 0.0), front.inputs[1])
    dens = nt.nodes.new("ShaderNodeMath")
    dens.operation = "MULTIPLY"
    nt.links.new(front.outputs[0], dens.inputs[0])
    dens.inputs[1].default_value = FOG_DENSITY
    nt.links.new(dens.outputs[0], vol.inputs["Density"])
    nt.links.new(vol.outputs["Volume"], _out(nt).inputs["Volume"])
    bm = bmesh.new()
    bm_box(bm, tuple(CENTRE), (2 * FOG_RADIUS,) * 3)
    fog = new_object("Fog", bm, vm)
    fog["fragment"] = False

    ee = scene.eevee
    for attr, val in (("use_raytracing", True), ("use_shadows", True), ("use_volumetric_shadows", True),
                      ("volumetric_samples", 96), ("volumetric_shadow_samples", 24), ("volumetric_tile_size", "4"),
                      ("volumetric_start", 0.1), ("volumetric_end", 90.0), ("volumetric_light_clamp", 0.0),
                      ("shadow_resolution_scale", 1.0)):
        try:
            setattr(ee, attr, val)
        except (AttributeError, TypeError) as err:
            print(f"[cathedral] skip eevee.{attr}: {err}")
    try:
        ee.ray_tracing_options.resolution_scale = "1"
        ee.ray_tracing_options.screen_trace_quality = 1.0
        ee.ray_tracing_options.screen_trace_thickness = 0.5
    except (AttributeError, TypeError):
        pass


# ---------------------------------------------------------------- main

MATS = None


def build(pass_name, out_dir):
    global MATS
    scene = bs.new_scene()
    bs.setup_render(scene, "EEVEE", res=RES, frames=(1, FRAMES), samples=SAMPLES,
                    view_transform="Standard" if pass_name in ("wire", "specks") else "AgX")
    rnd = random.Random(SEED)
    MATS = M = Materials(pass_name)
    outline = build_slab(M, rnd)
    build_falls(M, outline, rnd, with_mist=pass_name in ("lit", "final"))
    build_nave(M, rnd)
    flames = build_contents(M, rnd, with_dust=pass_name in ("lit", "final"))
    build_cameras()
    if pass_name == "wire":
        wire_pass()
    elif pass_name == "clay":
        clay_pass()
    elif pass_name == "specks":
        build_specks(random.Random(SEED + 2))
        specks_pass()
    else:
        lights(flames)
    scene.frame_set(1)
    bs.save(os.path.join(out_dir, f"{pass_name}.blend"))


def main():
    args = bs.cli_args()
    out_dir = os.path.abspath(args[args.index("--out") + 1]) if "--out" in args else os.path.join(os.path.dirname(__file__), "cathedral")
    passes = args[args.index("--passes") + 1].split(",") if "--passes" in args else ["wire", "clay", "final", "specks"]
    for p in passes:
        build(p, out_dir)


main()
