"""
Shared machinery for the case-study dioramas in 3d/dioramas/ (Phase 3).

A diorama script builds one small set around a project's Phase 2 model
(appended from 3d/models/build/<slug>.blend), adds its lights and cameras,
then calls run(). run() reads the command line and either renders one pass
from the chosen cameras or saves a stripped copy for the turntable GLB:

    blender -b --factory-startup --python-exit-code 1 -P 3d/dioramas/kiln.py -- \
        --pass final --cams hero,g1,g2,g3 --out 3d/dioramas/build/kiln/final
    blender ... -P 3d/dioramas/kiln.py -- --turntable 3d/dioramas/build/kiln/turntable.blend

Passes (same set, same locked "hero" camera)
  wire   Wireframe modifier on every set object, emission #f26b38 on #0a0b0d
  clay   view-layer material override #b8b1a6, soft studio light
  lit    (not used by the site any more) every surface neutral grey under the final lighting
  final  the set as built

Object tags (custom property "tags"):
  fx      atmosphere only (fog, rain, specks, mist): hidden in wire/clay, never exported
  nowire  hidden in the wireframe pass only (e.g. mirrored lettering that reads wrong through the wires)
  fog     a volume object: keeps its material in the lit pass
Everything else is set geometry: wired, clay'd, greyed, and exported to the turntable.

3d/render_dioramas.py runs all of this and writes the site's images.
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import model_kit as kit  # noqa: E402

bs = kit.bs
HERE = os.path.dirname(os.path.abspath(__file__))
BG = "#0a0b0d"
ACCENT = "#f26b38"
CLAY = "#b8b1a6"
SIZES = {"hero": (1600, 900), "g1": (1600, 900), "g2": (1200, 900), "g3": (1200, 900)}
CAMS = {}


# ---------------------------------------------------------------- scene setup

def start():
    kit.start()
    scene = bpy.context.scene
    bs.setup_render(scene, "EEVEE", res=SIZES["hero"], frames=(1, 1), samples=64, file_format="PNG")
    scene.view_settings.look = "AgX - Medium High Contrast"
    ee = scene.eevee
    for attr, val in (("use_raytracing", True), ("use_shadows", True), ("use_volumetric_shadows", True),
                      ("volumetric_samples", 64), ("volumetric_tile_size", "4"), ("volumetric_end", 60.0)):
        try:
            setattr(ee, attr, val)
        except (AttributeError, TypeError):
            pass
    try:
        ee.ray_tracing_options.resolution_scale = "1"
        ee.ray_tracing_options.screen_trace_quality = 1.0
    except (AttributeError, TypeError):
        pass
    return scene


def tag(ob, *tags):
    ob["tags"] = ",".join(sorted(set(filter(None, ob.get("tags", "").split(","))) | set(tags)))
    return ob


def has(ob, t):
    return t in ob.get("tags", "").split(",")


def append_model(slug, offset=(0, 0, 0), scale=1.0, rot=(0, 0, 0)):
    """Bring in a project's Phase 2 model, transformed into place (mesh data
    transformed, objects left at identity, like everything else here)."""
    path = os.path.join(HERE, "models", "build", f"{slug}.blend")
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = list(src.objects)
    from mathutils import Euler
    m = Matrix.Translation(offset) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() @ Matrix.Scale(scale, 4)
    obs = []
    for ob in dst.objects:
        if ob is None or ob.type != "MESH":
            continue
        bpy.context.scene.collection.objects.link(ob)
        ob.data.transform(ob.matrix_world)
        ob.data.transform(m)
        ob.matrix_world = Matrix.Identity(4)
        obs.append(ob)
    return obs


def world(light_hex="#6f8498", strength=0.15):
    """Camera sees the page colour; the set is lit by a dim ambient."""
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
    cam_rgb = bs.display_match(BG)   # exact page colour under whatever view transform is set
    a = nt.nodes.new("ShaderNodeBackground")
    a.inputs["Color"].default_value = (*bs.hex_color(light_hex), 1)
    a.inputs["Strength"].default_value = strength
    b = nt.nodes.new("ShaderNodeBackground")
    b.inputs["Color"].default_value = (*cam_rgb, 1)
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(a.outputs["Background"], mix.inputs[1])
    nt.links.new(b.outputs["Background"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    w.color = cam_rgb
    return w


def camera(name, location, target, lens=50):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start, cd.clip_end = 0.02, 200
    cam = bpy.data.objects.new(name, cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = location
    cam.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    CAMS[name] = cam
    return cam


def sun(name, az, el, strength, color="#ffffff", angle=1.0):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = strength
    ld.color = bs.hex_color(color)
    ld.angle = math.radians(angle)
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    a, e = math.radians(az), math.radians(el)
    ob.rotation_euler = (-Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))).to_track_quat("-Z", "Y").to_euler()
    return ob


def point(name, location, power, color="#ffffff", radius=0.05, shadow=True, volume=1.0):
    ld = bpy.data.lights.new(name, "POINT")
    ld.energy = power
    ld.color = bs.hex_color(color)
    ld.shadow_soft_size = radius
    ld.use_shadow = shadow
    ld.volume_factor = volume
    ob = bpy.data.objects.new(name, ld)
    ob.location = location
    bpy.context.scene.collection.objects.link(ob)
    return ob


def spot(name, location, target, power, angle, color="#ffffff", blend=0.3, radius=0.1):
    """A spot aimed at target: lights fog only inside its cone (no full-frame glow)."""
    ld = bpy.data.lights.new(name, "SPOT")
    ld.energy = power
    ld.color = bs.hex_color(color)
    ld.spot_size = math.radians(angle)
    ld.spot_blend = blend
    ld.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, ld)
    ob.location = location
    bpy.context.scene.collection.objects.link(ob)
    bs.aim(ob, target)
    return ob


def area(name, location, target, power, size, color="#ffffff", volume=0.0):
    ob = bs.area_light(name, location, target, power=power, size=size, color=color)
    ob.data.volume_factor = volume
    return ob


def fog(center, radius, density, color="#d3dbe2", anisotropy=0.55, below=None):
    """A soft ball of fog (density fading to zero at `radius`) for light shafts."""
    vm = bpy.data.materials.new("Fog")
    vm.use_nodes = True
    nt = vm.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*bs.hex_color(color), 1)
    vol.inputs["Anisotropy"].default_value = anisotropy
    pos = nt.nodes.new("ShaderNodeNewGeometry").outputs["Position"]
    dist = nt.nodes.new("ShaderNodeVectorMath")
    dist.operation = "DISTANCE"
    nt.links.new(pos, dist.inputs[0])
    dist.inputs[1].default_value = tuple(center)
    mr = nt.nodes.new("ShaderNodeMapRange")
    nt.links.new(dist.outputs["Value"], mr.inputs["Value"])
    mr.inputs["From Max"].default_value = radius
    mr.inputs["To Min"].default_value = density
    mr.inputs["To Max"].default_value = 0.0
    nt.links.new(mr.outputs["Result"], vol.inputs["Density"])
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    nt.links.new(vol.outputs["Volume"], out.inputs["Volume"])
    import bmesh
    bm = bmesh.new()
    kit.box(bm, tuple(center), (2 * radius,) * 3)
    ob = kit.obj("Fog", bm, vm, flat=True)
    return tag(ob, "fx", "fog")


def plinth(radius=1.6, height=0.35, top_mat=None, side_mat=None, segs=40, z_top=0.0):
    """The diorama base: a chunky disc with a bevelled lip; the set sits on z_top."""
    import bmesh
    side = side_mat or kit.mat("Plinth", "#24272b", rough=0.6)
    bm = bmesh.new()
    kit.lathe(bm, [(0.0, z_top - height), (radius * 0.97, z_top - height), (radius, z_top - height + 0.04),
                   (radius, z_top - 0.05), (radius * 0.985, z_top), (0.0, z_top)], segs=segs)
    ob = kit.obj("Plinth", bm, side)
    if top_mat is not None:
        bm = bmesh.new()
        kit.lathe(bm, [(0.0, z_top + 0.001), (radius * 0.96, z_top + 0.001)], segs=segs)
        kit.obj("PlinthTop", bm, top_mat)
    return ob


# ---------------------------------------------------------------- passes

def _set_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and not has(o, "fx")]


def _hide_fx():
    for o in bpy.context.scene.objects:
        if has(o, "fx"):
            o.hide_render = True


def _hide_lights():
    for o in bpy.context.scene.objects:
        if o.type == "LIGHT":
            o.hide_render = True


def _emission_mat(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"))
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*bs.hex_color(color), 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL").inputs["Surface"])
    return m, nt, em


def wire_pass():
    scene = bpy.context.scene
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    _hide_fx()
    for o in scene.objects:
        if has(o, "nowire"):
            o.hide_render = True
    _hide_lights()
    world("#000000", 0.0)
    cam = CAMS["hero"].matrix_world.translation
    mat, nt, em = _emission_mat("Wire", ACCENT, 1.0)
    obs = [o for o in _set_objects() if not has(o, "nowire")]
    dists = []
    for ob in obs:
        co = np.empty(len(ob.data.vertices) * 3)
        ob.data.vertices.foreach_get("co", co)
        dists.append(np.linalg.norm(co.reshape(-1, 3) - np.array(tuple(cam)), axis=1))
    near, far = min(d.min() for d in dists), max(d.max() for d in dists)
    camd = nt.nodes.new("ShaderNodeCameraData")
    mr = nt.nodes.new("ShaderNodeMapRange")
    nt.links.new(camd.outputs["View Z Depth"], mr.inputs["Value"])
    mr.inputs["From Min"].default_value = near
    mr.inputs["From Max"].default_value = far
    mr.inputs["To Min"].default_value = 1.0
    mr.inputs["To Max"].default_value = 0.45
    nt.links.new(mr.outputs["Result"], em.inputs["Strength"])
    # ~1.4 px lines at every depth: thickness grows with distance from the lens
    lens = CAMS["hero"].data.lens
    k = 1.4 * 36.0 / (lens * SIZES["hero"][0])
    tmax = k * far
    for ob, d in zip(obs, dists):
        w = np.round(np.clip(k * d, k * near * 0.8, tmax) / tmax, 3)
        vg = ob.vertex_groups.new(name="wire")
        for val in np.unique(w):
            vg.add(np.nonzero(w == val)[0].tolist(), float(val), "REPLACE")
        mod = ob.modifiers.new("Wireframe", "WIREFRAME")
        mod.thickness = tmax
        mod.use_replace = True
        mod.use_even_offset = True
        mod.offset = 0.0
        mod.vertex_group = "wire"
        mod.thickness_vertex_group = 0.0
        ob.data.materials.clear()
        ob.data.materials.append(mat)


def clay_pass(target):
    _hide_fx()
    _hide_lights()
    bpy.context.view_layer.material_override = bs.material("ClayOverride", CLAY, roughness=0.85)
    world("#cfcbc4", 0.45)
    t = Vector(target)
    area("ClaySoftbox", t + Vector((-3, -3, 6)), t, power=900, size=5.0, color="#fff6ec")
    area("ClayFill", t + Vector((5, -5, 1.5)), t, power=350, size=5.0, color="#f2f1ee")


def lit_pass():
    """Same lights, every surface neutral grey. Glows stay glows (grey), fog stays."""
    cache = {}
    for ob in _set_objects():
        for slot in ob.material_slots:
            m = slot.material
            if m is None:
                continue
            bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m.use_nodes else None
            glow = bsdf is not None and bsdf.inputs["Emission Strength"].default_value > 0.01
            glossy = bsdf is not None and bsdf.inputs["Roughness"].default_value < 0.12
            key = "glow" if glow else "glossy" if glossy else "grey"
            if key not in cache:
                if key == "glow":
                    cache[key] = bs.material("lit_glow", "#9a9a9a", roughness=0.5, emission="#ffffff",
                                             emission_strength=bsdf.inputs["Emission Strength"].default_value * 0.5)
                elif key == "glossy":
                    cache[key] = bs.material("lit_glossy", "#4a4a4a", roughness=0.1)
                else:
                    cache[key] = bs.material("lit_grey", "#8c8c8a", roughness=0.62)
            slot.material = cache[key]


def save_turntable(path):
    """Keep only the set geometry (no fx, lights, cameras) for the turntable GLB."""
    for o in list(bpy.context.scene.objects):
        if o.type != "MESH" or has(o, "fx") or has(o, "noexport"):
            bpy.data.objects.remove(o, do_unlink=True)
    # glTF can't carry procedural textures: a texture-driven colour would export
    # as white, so flatten it to the material's viewport colour.
    for m in bpy.data.materials:
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m.use_nodes else None
        if bsdf and bsdf.inputs["Base Color"].is_linked:
            for link in list(bsdf.inputs["Base Color"].links):
                m.node_tree.links.remove(link)
            bsdf.inputs["Base Color"].default_value = m.diffuse_color
    bs.save(path)


def run(target=(0, 0, 0)):
    args = bs.cli_args()
    if "--turntable" in args:
        save_turntable(args[args.index("--turntable") + 1])
        return
    pass_name = args[args.index("--pass") + 1]
    out = args[args.index("--out") + 1]
    cams = args[args.index("--cams") + 1].split(",") if "--cams" in args else ["hero"]
    if pass_name == "wire":
        wire_pass()
    elif pass_name == "clay":
        clay_pass(target)
    elif pass_name == "lit":
        lit_pass()
    os.makedirs(out, exist_ok=True)
    scene = bpy.context.scene
    for name in cams:
        scene.camera = CAMS[name]
        scene.render.resolution_x, scene.render.resolution_y = SIZES[name]
        scene.render.filepath = os.path.join(out, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[diorama] {pass_name} {name} -> {scene.render.filepath}", flush=True)
