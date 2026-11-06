"""
Quick look at a project model: three stills on the page colour, EEVEE.

    blender -b 3d/models/build/kiln.blend --python-exit-code 1 -P 3d/preview_model.py -- --out 3d/models/build/kiln

Writes <out>_a.png, _b.png, _c.png (front three-quarter, side, high).
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "blender-scroll-3d", "scripts"))
import bscroll as bs  # noqa: E402

out = bs.cli_args()[bs.cli_args().index("--out") + 1]
scene = bpy.context.scene
bs.setup_render(scene, "EEVEE", res=(520, 520), frames=(1, 1), samples=32, file_format="PNG")

pts = [o.matrix_world @ Vector(c) for o in scene.objects if o.type == "MESH" for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
centre, radius = (lo + hi) / 2, (hi - lo).length / 2

bs.world_hdri("studio.exr", strength=0.5, bg_color="#0a0b0d")
bs.three_point_lights(target=tuple(centre), radius=radius * 4, power=180 * radius * radius)
cd = bpy.data.cameras.new("PreviewCam")
cd.lens = 50
cam = bpy.data.objects.new("PreviewCam", cd)
scene.collection.objects.link(cam)
scene.camera = cam
dist = radius / math.tan(math.atan(18 / 50)) * 1.15

for tag, az, el in (("a", -35, 18), ("b", 70, 8), ("c", 200, 40)):
    a, e = math.radians(az), math.radians(el)
    cam.location = centre + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{out}_{tag}.png"
    bpy.ops.render.render(write_still=True)
print(f"[preview] {out}_a/b/c.png")
