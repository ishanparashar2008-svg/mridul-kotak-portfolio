"""
Orbital Nursery diorama: the ring station on a display stand, like a studio
model kit, tilted toward a hard sun. In the stills a planet limb and star
specks sit behind it (atmosphere only, not in the turntable).
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bmesh  # noqa: E402
import bpy  # noqa: E402

import diorama_kit as dk  # noqa: E402

kit = dk.kit
dk.start()
rnd = random.Random(9)

metal = kit.mat("Stand", "#2c3035", rough=0.35, metal=0.8)
dk.plinth(radius=1.15, height=0.22, side_mat=metal)
bm = bmesh.new()
kit.cyl(bm, (0, 0, 0.75), 0.03, 1.5, 10)
kit.cyl(bm, (0, 0, 0.04), 0.22, 0.06, 20)
kit.obj("Rod", bm, metal)
dk.append_model("orbital-nursery", offset=(0, 0, 1.55), scale=1.0, rot=(18, 0, 20))

# Planet limb and specks behind (stills only)
pm = bpy.data.materials.new("Planet")
pm.use_nodes = True
nt = pm.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
noise = nt.nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value = 1.2
noise.inputs["Detail"].default_value = 6.0
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (*kit.hex_color("#1d4a5a"), 1)
ramp.color_ramp.elements[1].color = (*kit.hex_color("#4f7d55"), 1)
nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
lw = nt.nodes.new("ShaderNodeLayerWeight")
lw.inputs["Blend"].default_value = 0.25
nt.links.new(lw.outputs["Facing"], bsdf.inputs["Emission Strength"])
bsdf.inputs["Emission Color"].default_value = (*kit.hex_color("#6fb7d6"), 1)
bsdf.inputs["Roughness"].default_value = 0.6
bm = bmesh.new()
kit.ico(bm, (9, 26, -14), 16.0, 4)
dk.tag(kit.obj("Planet", bm, pm), "fx")
speck = kit.mat("Specks", "#8b8d92", emission="#8b8d92", strength=1.2)
bm = bmesh.new()
for _ in range(500):
    a, e = rnd.uniform(0, 2 * math.pi), math.asin(rnd.uniform(-1, 1))
    r = rnd.uniform(30, 60)
    kit.ico(bm, (math.cos(a) * math.cos(e) * r, math.sin(a) * math.cos(e) * r, math.sin(e) * r + 1.5), r * 0.0009, 0)
dk.tag(kit.obj("Specks", bm, speck, flat=True), "fx")

# Light: hard sun, cool rim, very little ambient (it's space)
dk.world("#5a6a80", 0.05)
dk.sun("Sun", -35, 28, 5.0, "#fff2e2", angle=0.5)
dk.area("Rim", (-3.5, 4, 3.5), (0, 0, 1.5), power=600, size=3, color="#9fb6d4")
dk.area("Fill", (3, -4.5, 1.2), (0, 0, 1.4), power=140, size=4, color="#a9b6c6")

dk.camera("hero", (3.5, -4.7, 2.7), (0, 0, 1.35), lens=48)
dk.camera("g1", (-5.2, -5.4, 2.3), (0, 0, 1.25), lens=32)
dk.camera("g2", (0.75, -1.35, 2.35), (0.05, 0.05, 1.75), lens=60)
dk.camera("g3", (1.4, -2.6, 0.35), (0, 0, 1.55), lens=26)
dk.run(target=(0, 0, 1.3))
