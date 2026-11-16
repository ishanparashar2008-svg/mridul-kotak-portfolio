# The Render: portfolio of Mridul Kotak

A portfolio that feels like being inside a 3D viewport. The work floats in a dark void and every piece "renders" in passes: wireframe, then clay (lit by your cursor), then the final look.

Plain HTML, CSS and JavaScript (ES modules). No build step. Three.js and GSAP load from a CDN through an import map.

**Status: complete (Phases 1 to 4).** All project content is placeholder until the real work arrives.

---

## Run it locally

Browsers block ES modules on pages opened straight from disk, so the site needs a small local server.

- **Easiest:** double-click **`Open Website.bat`** (needs [Node.js](https://nodejs.org)). It opens http://localhost:5200.
- **Terminal:** `node tools/serve.mjs 5200 --open`
- **Python:** `cd website` then `python -m http.server 5200`

Testing switches: add `?lite` to any URL to see the phone version on a desktop, or `?full` to force the full 3D version on a phone.

## Deploy to Netlify

**Drag and drop (simplest)**
1. Go to https://app.netlify.com/drop and log in.
2. Drag the **`website`** folder (not the whole `The-Render` folder) onto the page.
3. When it finishes, Netlify gives you a URL like `https://random-name.netlify.app`. Rename it under **Site configuration > Change site name**.
4. To update later: open the site in Netlify, go to **Deploys**, and drag the `website` folder onto the deploy area again.

**After the first deploy, once you know the final URL**
1. In `website/index.html`, change `og:image` from `/assets/og-image.jpg` to the full URL, e.g. `https://your-site.netlify.app/assets/og-image.jpg`, so link previews show the image everywhere.
2. Optional: add a custom domain under **Domain management**.

**Git (optional):** this project lives on GitHub, so you can create a Netlify site from the repository instead of dragging folders. Set **Base directory** to `website`; `website/netlify.toml` covers the rest.

Headers (security and caching) live in `website/_headers`, which works for every deploy method.

## Working with Mridul's uploads

Mridul uploads originals to `mridul/` (see `mridul/README.md`). That folder is outside `website/`, so nothing in it deploys. To use something: pull the latest changes, run a model through `tools/optimize-model.mjs` or export images into `website/assets/`, then update `website/data/projects.json`.

Files in `mridul/source-files/` use Git LFS. After cloning on a new machine, run `git lfs install` once. Run `npm install` inside `tools/` before using the optimiser.

## Add a new project (step by step)

1. **Make a folder for its files:** `website/assets/work/<slug>/`, where the slug is short, lowercase and uses hyphens, e.g. `neon-harbour`.
2. **Export the images** (WebP or JPEG, about 1600px wide, ideally 100 to 300 KB each):
   - the three passes of **one shot**, all the same framing: `wireframe.webp`, `clay.webp`, `final.webp`
   - any stills for the gallery: `still-1.webp`, `still-2.webp`...
3. **Optional 3D model:** export a `.glb` from Blender (File > Export > glTF 2.0, format "glTF Binary"). Keep it under about 10 MB. To shrink it a lot, run `npx @gltf-transform/cli meshopt model.glb model.glb`. The site loads Meshopt and Draco models.
4. **Optional film:** a YouTube or Vimeo link, or an `.mp4` in the project folder.
5. **Add an entry to `website/data/projects.json`** inside `"projects": [ ... ]`. Copy an existing project and change the values. The order in the file is the order in the void. Every field except `id` and `title` is optional, and a missing field just hides its section.

```json
{
  "id": "neon-harbour",
  "title": "Neon Harbour",
  "year": 2026,
  "type": "Environment",
  "discipline": "Environment Design",
  "role": "Environment artist, lighting",
  "client": "Studio name",
  "summary": "One or two sentences for the header and link previews.",
  "shape": "torus",
  "finish": "metal",
  "worldModel": "assets/models/world/neon-harbour.glb",
  "accent": "#6fa8c9",
  "hero": "assets/work/neon-harbour/final.webp",
  "heroAlt": "Describe the hero image for screen readers",
  "breakdown": {
    "wireframe": "assets/work/neon-harbour/wireframe.webp",
    "clay": "assets/work/neon-harbour/clay.webp",
    "final": "assets/work/neon-harbour/final.webp"
  },
  "model": "assets/work/neon-harbour/model.glb",
  "modelAlt": "What the 3D model shows",
  "video": { "url": "https://vimeo.com/123456789", "poster": "assets/work/neon-harbour/final.webp", "title": "Final film" },
  "brief": "What the project was and what it needed.",
  "process": [
    { "title": "Blockout", "text": "..." },
    { "title": "Lighting", "text": "..." }
  ],
  "tools": [{ "name": "Blender", "use": "Modelling" }, { "name": "Unreal Engine 5", "use": "Lighting" }],
  "gallery": [
    { "src": "assets/work/neon-harbour/still-1.webp", "layout": "full", "alt": "Describe the still" },
    { "src": "assets/work/neon-harbour/still-2.webp", "layout": "half", "alt": "..." },
    { "src": "assets/work/neon-harbour/still-3.webp", "layout": "half", "alt": "..." }
  ]
}
```

6. **Check it locally** (`Open Website.bat`): the new object appears in the void, in the index and in the phone card list, and `project.html?id=neon-harbour` shows its page.
7. **Deploy** by dragging the `website` folder onto Netlify again.

Field notes:
- `shape`: `sphere`, `torus`, `shard`, `cube`, `capsule`, `octahedron`, `cone`, `knot` or `cylinder` (the object in the void)
- `worldModel`: optional small `.glb` shown in the void instead of the `shape` (see "Project models in the void"). The `shape` stays as the stand-in while it loads, and as the fallback if it fails. This is separate from `model`, which is the case-study turntable
- `finish`: `satin`, `metal`, `iridescent` or `glossy` (its final material)
- `accent`: the object's colour, also used as the accent on its project page
- `gallery[].layout`: `full` for full width, `half` for two side by side (use them in pairs)
- JSON is strict: every item needs a comma after it except the last, and there are no comments. If the page goes blank, check the file at https://jsonlint.com

## Hero: three models on a carousel

The hero holds three models on a turntable-style carousel: one in front, two smaller ones behind it to the left and right. Scrolling turns the carousel two steps (model 2 comes to the front, then model 3), then the page carries on. The models never spin on their own, they only travel round the circle.

On every load the hero plays the intro, about 3.5 seconds once the loader clears: wireframe, then clay, then final. Final "renders" in with an accent scanline sweeping left to right; leaving final sweeps it back. Keys 1 to 3 (or the buttons, bottom right) switch modes. In clay mode the cursor is a light. Scrolling turns the carousel in whatever mode is showing.

| Mode | Models | Background |
|---|---|---|
| Wireframe | live 3D (the GLB's wireframe) | `env-wireframe` PNG |
| Clay | live 3D, matte clay, lit by the cursor | `env-clay` PNG |
| Final | one pre-rendered PNG per model, moved and scaled to follow the carousel | `env-final` PNG |

Everything lives in `artist.hero` in `projects.json`:

```json
"hero": {
  "environments": { "wireframe": "assets/hero/env-wireframe.webp", "clay": "assets/hero/env-clay.webp", "final": "assets/hero/env-final.webp" },
  "models": [
    { "name": "Statue 1", "src": "assets/models/statue-1.glb", "wire": "assets/models/statue-1-wire.glb", "final": "assets/hero/final-1.webp", "rotation": 28 },
    { "name": "Statue 2", "...": "..." },
    { "name": "Statue 3", "...": "..." }
  ]
}
```

- `src` / `wire`: the live model and its light wireframe copy. Leave them out and that slot shows a placeholder cube (as it does now).
- `final`: the model rendered in Blender at the **front** slot, transparent background. The site moves and scales this one image to the left and right slots, so it must be shot from exactly the site's camera.
- `rotation`: which way the model faces, in degrees. Use the same value in Blender.
- The camera, slot positions and model size are in `website/js/hero-rig.js`. `mridul/HERO-RENDERS.md` gives the same numbers in Blender terms. If the rig changes, the PNGs must be re-rendered.
- Placeholder art: open `/tools/placeholders/hero.html` on the placeholder server (`node tools/placeholders/server.mjs`). It renders all six images from the rig.

To add a real model:
1. One-time setup: `cd tools` then `npm install`.
2. Optimise the model (your original file is never changed):
   `node tools/optimize-model.mjs "C:\path\to\Model.glb" statue-1`
   This writes `website/assets/models/statue-1.glb` (textures 1024px WebP, Meshopt geometry) and `statue-1-wire.glb` (a tiny copy for the wireframe pass) and prints the sizes. Options: `--tex 2048` for sharper textures (bigger file), `--wire-error 0.002` for a denser wireframe.
3. Add `src` and `wire` to that model's entry, then render its `final` PNG in Blender (see `mridul/HERO-RENDERS.md`).

## Blender scenes (3d/)

The 3D made in Blender lives in `3d/` as Python build scripts. Each scene gets its own script, so everything can be rebuilt and tweaked later. The `.blend` files and renders are build products and can be deleted at any time. The scripts import helpers (`bscroll`) from the **blender-scroll-3d** skill, installed at `~/.claude/skills/blender-scroll-3d`. Blender 5.2 lives at `D:\Blender\blender.exe`; set `BLENDER_PATH` to use another install. Compositing needs Python with Pillow and numpy (`pip install pillow numpy`).

### Watch a frame get made (Saltwater Cathedral)

The section between the hero and the work is a 120-frame shot of a broken fragment of a flooded gothic nave, hanging in the same dark void as the work section. It holds:
- a floor slab with still water spilling off its edges in thin falls
- two bays of piers and pointed arches
- one tall lancet window, with light shafts coming through it
- a section of ribbed vault, plus a few pews and candles

The camera starts on a close three-quarter view and orbits about 70° while the shot renders: wireframe, then clay, then final. Each pass takes over the one before in bucket tiles. In the last 15% the camera pulls back and drifts past, so the final frames are empty void and specks, like the top of #work. Scrolling back un-renders it.

- `3d/build_cathedral.py`: the whole scene, built from code. Tunables sit at the top: colours, camera orbit and drift, sun angle, fog, wire width and speck colour. It writes `3d/cathedral/wire|clay|final|specks.blend`.
  - `specks` holds only the void's star specks and dust (colour and size matched to `js/world.js`), with the fragment as a holdout.
  - The sun reaches the scene only through the window, via an invisible shadow-only screen behind the wall. Fog fades out about 17 m from the fragment, so the shafts dissolve into space and the frame edges stay pure `#0a0b0d`.
- `3d/compose_cathedral.py`: merges the three passes into the final frames and adds the specks on top of every frame, so the void never changes during a hand-off. The tile schedule is set at the top (`TRANSITIONS`: 26-34%, 58-66%). It writes `website/assets/seq/cathedral/{desktop,mobile}/frame_0001.webp ... frame_0120.webp` plus `manifest.json`, which also carries the schedule the page's readouts use.
- `3d/render_cathedral.py`: runs everything in one go.

```
python 3d/render_cathedral.py --preview     # 6 check frames per pass -> 3d/cathedral/preview/ (about 3 min)
python 3d/render_cathedral.py               # full rebuild: build, render 5 passes x 2 framings, compose (about 15 min)
python 3d/render_cathedral.py --resume      # continue an interrupted render
python 3d/render_cathedral.py --framing mobile --passes final   # redo one part, then compose again:
python 3d/compose_cathedral.py
```

The intermediate PNGs in `3d/cathedral/render/` take about 1.5 GB and can be deleted after composing. Render times are logged in `3d/cathedral/render_times.json`.

On the page: `index.html` (section `data-making`), `css/making.css`, `js/making.js` (readouts, ScrollTrigger) and `js/frame-sequence.js` (the canvas frame player, adapted from the skill). Frames are not fetched until the loader has finished, the hero model has loaded (or the visitor scrolls), and the section is within about 1.5 screens. Phones get the portrait set (720x1280), chosen by aspect ratio. Reduced motion and no-JS visitors see one screen with the finished last frame.

### Project models in the void (worldModel)

Each project floats in the void as its own small Blender model:
- Saltwater Cathedral: a flooded gothic spire on a floating slab
- Kiln: a bottle kiln with a vase on a potter's wheel
- Orbital Nursery: a ring station with a greenhouse dome
- Paper Tigers: an origami tiger
- Low Tide Motel: a motel sign on a post

They play the same passes as before (wireframe, clay dissolve, final, the hover glow) and keep the same labels, fly-in and keyboard route. The wireframe pass draws the model's feature edges, and the final look is the model's own Blender materials. Models turn upright like a turntable; primitives still tumble.

- `3d/models/<slug>.py`: one build script per model, using the shared helpers in `3d/model_kit.py`.
- `3d/build_models.py`: builds each model, exports it with the skill's `export_glb.py --no-anim --no-camera --no-draco`, shrinks it with `tools/optimize-model.mjs <glb> world/<slug> --no-wire`, and renders three preview stills to `3d/models/build/`.

```
python 3d/build_models.py                  # all five (about 40 s)
python 3d/build_models.py kiln             # just one
```

The output goes to `website/assets/models/world/<slug>.glb` (6-25 KB each). Point a project at its model with `"worldModel"` in `projects.json`. For a new model, add `3d/models/<slug>.py` and put the slug in `MODELS` in `build_models.py`. Build everything in one geometry space with no object transforms (`model_kit` does this), because the dissolve sweeps up through that space. On the page, `js/world-model.js` loads and normalises the GLB for `world.js` and for the case page's next-project preview.

### Case-study art (dioramas)

Every project's case-study images and turntable come from a small Blender diorama built around its void model. Each set has its own scene and lighting:
- Saltwater Cathedral: the spire over a flooded plinth with drowned columns, lit by a warm light behind the tower
- Kiln: a brick yard at dusk with pots and a woodpile, lit by the glowing firing door
- Orbital Nursery: the station on a display stand, with a planet and stars behind it in the stills
- Paper Tigers: a folded-paper hillock with paper trees, in bright commercial light
- Low Tide Motel: wet tarmac with puddles, a motel wall and a vending machine, in rain and neon

- `3d/dioramas/<slug>.py`: one script per diorama, using the shared `3d/diorama_kit.py` (passes, cameras, the turntable export). It appends the model from `3d/models/build/<slug>.blend`, so run `build_models.py` first.
- `3d/render_dioramas.py`: renders everything and writes it over the files in `website/assets/placeholders/<slug>/`, so the paths in `projects.json` don't change.

| File | What it is |
|---|---|
| `wireframe.webp`, `clay.webp`, `final.webp` | the three passes from one locked camera, 1600x900 |
| `gallery-1.webp` | wide shot, 1600x900 |
| `gallery-2.webp` | close-up, 1200x900 |
| `gallery-3.webp` | low angle, 1200x900 |
| `model.glb` | the diorama for the turntable (25-42 KB); Paper Tigers has none, as before |

```
python 3d/render_dioramas.py                 # all five (about 2.5 min)
python 3d/render_dioramas.py kiln            # one project
python 3d/render_dioramas.py --preview       # render to 3d/dioramas/build/ only, site untouched
```

The images and models are still stand-in art, so the alt text keeps "(placeholder)".

## Artist details

The `artist` block at the top of `projects.json` drives the hero, the showreel, About and Contact: `name`, `role`, `description`, `showreel { url, length, title }`, `portrait { src, wireframe, alt }`, `bio`, `skills [{ name, level }]`, `experience [{ years, role, company }]`, `clients`, `availability`, `email`, `phone` and `socials [{ label, url }]`. Any number of socials works; each opens in a new tab.

## Placeholder content still to replace

- [ ] **Showreel:** `artist.showreel.url` (currently Big Buck Bunny, Blender Foundation) and `length`
- [ ] **Portrait:** `artist.portrait.src` (a real photo). Remove `wireframe` or supply a matching wireframe render
- [ ] **Bio:** `artist.bio`, both paragraphs start with "Placeholder"
- [ ] **Skills and levels:** `artist.skills`
- [ ] **Experience:** `artist.experience` (years, roles, studios)
- [ ] **Clients:** `artist.clients` (the names are invented)
- [ ] **Availability line:** `artist.availability`
- [x] **Email, phone and social links:** real (Instagram, LinkedIn, Upwork, YouTube, Spotify). If they change, edit `artist.email`, `artist.phone` and `artist.socials` in the JSON, plus the fallback email in `index.html` (`data-email-text`, `mailto:`) and the `sameAs` list in its JSON-LD block
- [ ] **All five projects:** titles, years, clients, roles, summaries, briefs, process and tools are invented
- [ ] **Project images:** `hero`, `breakdown`, `gallery` and `cover` all point to `assets/placeholders/` (Blender diorama renders from 3d/dioramas/, still stand-ins)
- [ ] **Project models:** `model` points to the Blender dioramas from 3d/dioramas/ (Paper Tigers has none on purpose)
- [ ] **Void models:** `worldModel` points to generated stand-in models (3d/models/). Swap in Mridul's own low-poly versions when they exist
- [ ] **Project films:** `video.url` is Big Buck Bunny for four projects
- [ ] **Alt text:** `heroAlt`, `modelAlt` and `gallery[].alt` say "(placeholder)"
- [ ] **Cathedral sequence:** a generated stand-in scene. To use a real shot, render its three passes (wire, clay, final, plus specks) as PNG frames into `3d/cathedral/render/<framing>/<pass>/frame_NNNN.png` and run `python 3d/compose_cathedral.py`
- [ ] **Share image:** `website/assets/og-image.jpg` (regenerate it or design one at 1200 x 630) and its full URL in `index.html`
- [ ] When everything is replaced, delete `website/assets/placeholders/`

## Project structure

```
The-Render/
  Open Website.bat        double-click to preview locally
  README.md
  mridul/                 Mridul's uploads: models, renders, source files (not deployed)
  tools/serve.mjs         local dev server (not deployed)
  tools/placeholders/     renders the placeholder art (not deployed)
  3d/                     Blender build scripts (not deployed), see "Blender scenes"
  website/                <- the deployable site
    index.html            hero, the cathedral sequence, the void, about, contact
    project.html          case study (project.html?id=slug)
    404.html              "Render failed: frame not found"
    netlify.toml, _headers, robots.txt, favicon.ico
    css/                  tokens.css first: colours, fonts, spacing
    js/
      main.js             boot order
      device.js           lite mode detection (phones, low-power devices)
      loader.js, cursor.js, sound.js, data.js
      hero.js, scene.js, hero-rig.js   hero carousel (rig = camera and slots shared with the PNG renders)
      making.js, frame-sequence.js   the Saltwater Cathedral scroll sequence
      showreel.js         full-screen showreel overlay
      work.js, world.js   the void (full) or project cards (lite)
      world-model.js      loads a project's worldModel GLB for the void
      about.js            about + contact
      project.js, case/   case study page parts
      render-material.js, shapes.js, video-embed.js   shared pieces
    data/projects.json    ALL content
    assets/               images, models, icons, seq/ (rendered frame sequences)
```

## Regenerating the placeholder art

The project art now comes from the Blender dioramas (see "Case-study art"); this older browser generator still makes the portrait, share image and app icon. Run `node tools/placeholders/server.mjs`, then open http://localhost:5211/tools/placeholders/generate.html. Always add `?only=site` now: without it, the generator also re-renders the old project art and overwrites the dioramas (re-run `python 3d/render_dioramas.py` if that happens). The generator writes uncompressed models; shrink them afterwards with `npx @gltf-transform/cli meshopt <file> <file>` for each `model.glb`.

## Accessibility and performance

- Reduced motion: no loader theatre, no intro, no spinning, instant reveals, static grain and sound bars.
- Keyboard: every control is focusable with a visible focus ring. In the void, Tab through the projects: the camera flies to each one and Enter opens it. Keys 1 to 4 switch the hero's shading.
- The cathedral sequence loads after the loader and hero, pauses its draw loop off screen, and becomes a single still under reduced motion.
- Sound is off by default; the choice is remembered per browser.
- Phones and low-power devices get lite mode: a low-poly hero, project cards instead of the 3D flight, and a still instead of the 3D next-project preview.
- Pixel ratio is capped (2, or 1.5 in lite). Every WebGL scene pauses when off screen or when the tab is hidden. Heavy parts load only when needed.
