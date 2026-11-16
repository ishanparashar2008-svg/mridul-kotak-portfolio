# Hero renders: what to make in Blender

The hero has three models on a carousel. One stands in front and the other two stand smaller, behind it to the left and right. Scrolling turns the carousel so model 2, then model 3, comes to the front.

The site shows three modes:

| Mode | What you see | What you send |
|---|---|---|
| Wireframe | the live 3D models as wires | the models (GLB) + **env-wireframe.png** |
| Clay | the live 3D models in clay, lit by the visitor's cursor | the models (GLB) + **env-clay.png** |
| Final | **your rendered images** of each model, moved around by the site | **env-final.png** + **final-1.png**, **final-2.png**, **final-3.png** |

So you send **3 models and 6 images**. Put them in:
- `mridul/models/hero/`: the three models (`.glb`, or `.blend`, and we export them)
- `mridul/renders/hero/`: the six PNGs with the names above

Every image must be shot from **exactly** the camera below. The live 3D in wireframe and clay modes uses the same camera, so when the site switches to your final images the models stay in the same place.

## Render settings (all six images)

- Resolution **1920 × 1080**, 100%
- PNG, RGBA, 8-bit (we convert to WebP for the web)
- Units: metres, Z up (Blender's default)

## Camera

| Setting | Value |
|---|---|
| Location | X **-1.35**, Y **-15.5**, Z **2.5** |
| Rotation (XYZ Euler) | X **85.573°**, Y **0°**, Z **0°** |
| Lens | Perspective, focal length **37.79 mm** |
| Sensor | Fit **Horizontal**, width **36 mm** |
| Shift | X 0, Y 0 |

It looks at the point (-1.35, 0, 1.3). The camera sits left of the carousel so the models stand on the right and the name has room on the left. Vertical field of view is 30° and horizontal is 50.94°.

## Where the models stand

The floor is Z = 0. The carousel is a circle of radius 3.4 m centred on the world origin.

| Slot | Location (X, Y, Z) |
|---|---|
| Front | 0, **-3.4**, 0 |
| Back left | -2.944, 1.7, 0 |
| Back right | 2.944, 1.7, 0 |

**Each model should fit inside a box 3.6 m tall and 2.6 m wide and deep**, with its base on the floor and centred on its slot. The site resizes models to this box anyway, but the images only line up if your model is that size too.

**Rotation:** each model faces one fixed way and never spins. Pick a Z rotation for each model and tell us the number. It goes into the site as that model's `rotation`, so the live 3D faces the same way as your render.

## The six images

1. **env-wireframe.png, env-clay.png, env-final.png**: the set (floor, backdrop, atmosphere) with **no models in it**, one per mode. Wireframe should look like a viewport (dark, grid-like); clay should be matte and grey-ish; final is the real lit set. The live models are drawn on top, so keep the area around the three slots clear and the floor at Z = 0.
2. **final-1.png, final-2.png, final-3.png**: each model alone, **at the front slot**, in its final look.
   - Transparent background (Render Properties > Film > Transparent).
   - Floor as a shadow catcher (Object Properties > Visibility > Shadow Catcher), so the contact shadow comes along.
   - Render the **whole 1920 × 1080 frame**. Don't crop it: the site places the full frame over the background.
   - The site reuses this one image for the back slots, scaled down and dimmed. Lighting that's even all round (no hard light from one side only) looks right in every slot.

## Things that break the illusion

- A different camera, lens or resolution: the images won't line up with the live 3D.
- A model taller than 3.6 m, or not standing on Z = 0.
- Cropped or trimmed PNGs.
- A model rotated differently from the `rotation` value we were given.

The numbers come from `website/js/hero-rig.js`. If that file changes, these numbers change too and the images need rendering again.
