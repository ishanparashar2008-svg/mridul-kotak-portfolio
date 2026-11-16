"""
Render the case-study art for every project from its diorama (Phase 3).

    python 3d/render_dioramas.py                    # all projects -> website/assets/placeholders/<slug>/
    python 3d/render_dioramas.py kiln               # one project
    python 3d/render_dioramas.py --preview          # render to 3d/dioramas/build/ only (site untouched)

Per project (3d/dioramas/<slug>.py, built around 3d/models/build/<slug>.blend,
so run 3d/build_models.py first):
  wireframe.webp clay.webp final.webp   one locked "hero" camera, 1600x900
  gallery-1.webp (wide, 1600x900) gallery-2.webp (close-up, 1200x900) gallery-3.webp (low angle, 1200x900)
  model.glb   the diorama for the case-page turntable (skipped for paper-tigers, which has none)
Needs Pillow (pip install pillow) and `npm install` in tools/ once.
"""

import json
import os
import subprocess
import sys
import time

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SKILL = os.path.join(os.path.expanduser("~"), ".claude", "skills", "blender-scroll-3d", "scripts")
SLUGS = ["saltwater-cathedral", "kiln", "orbital-nursery", "paper-tigers", "low-tide-motel"]
NO_TURNTABLE = {"paper-tigers"}
# The site has no lighting pass any more (wireframe, clay, final only); diorama_kit can still build "lit".
PASS_FILES = {"wire": "wireframe", "clay": "clay", "final": "final"}
GALLERY = {"g1": "gallery-1", "g2": "gallery-2", "g3": "gallery-3"}
QUALITY = 84


def blender():
    path = os.environ.get("BLENDER_PATH")
    if path:
        return path
    return subprocess.check_output([sys.executable, os.path.join(SKILL, "find_blender.py")], text=True).strip().splitlines()[-1]


def run(cmd):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=ROOT)
    for line in p.stdout.splitlines():
        if line.startswith(("[glb]", "Model", "Traceback")) or "Error" in line:
            print("   ", line, flush=True)
    if p.returncode:
        print(p.stdout[-3000:])
        sys.exit(f"failed: {' '.join(cmd[:6])}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    preview = "--preview" in sys.argv
    exe = blender()
    times = {}
    for slug in args or SLUGS:
        t0 = time.time()
        script = os.path.join(HERE, "dioramas", f"{slug}.py")
        build = os.path.join(HERE, "dioramas", "build", slug)
        site = os.path.join(ROOT, "website", "assets", "placeholders", slug)
        print(f"[dioramas] {slug}", flush=True)
        for p in PASS_FILES:
            cams = "hero,g1,g2,g3" if p == "final" else "hero"
            run([exe, "-b", "--factory-startup", "--python-exit-code", "1", "-P", script,
                 "--", "--pass", p, "--cams", cams, "--out", os.path.join(build, p)])
        if not preview:
            os.makedirs(site, exist_ok=True)
            out = {f"{PASS_FILES[p]}.webp": os.path.join(build, p, "hero.png") for p in PASS_FILES}
            out.update({f"{name}.webp": os.path.join(build, "final", f"{cam}.png") for cam, name in GALLERY.items()})
            for name, src in out.items():
                Image.open(src).convert("RGB").save(os.path.join(site, name), "WEBP", quality=QUALITY, method=6)
            if slug not in NO_TURNTABLE:
                tt = os.path.join(build, "turntable.blend")
                raw = os.path.join(build, "turntable.glb")
                run([exe, "-b", "--factory-startup", "--python-exit-code", "1", "-P", script, "--", "--turntable", tt])
                run([exe, "-b", tt, "--python-exit-code", "1", "-P", os.path.join(SKILL, "export_glb.py"),
                     "--", "--out", raw, "--no-anim", "--no-camera", "--no-draco"])
                run(["node", os.path.join(ROOT, "tools", "optimize-model.mjs"), raw, slug, "--no-wire",
                     "--out", os.path.join(site, "model.glb")])
        times[slug] = round(time.time() - t0, 1)
        print(f"[dioramas] {slug}: {times[slug]} s", flush=True)
    log = os.path.join(HERE, "dioramas", "build", "render_times.json")
    history = json.load(open(log)) if os.path.exists(log) else []
    history.append({"when": time.strftime("%Y-%m-%d %H:%M"), "preview": preview, "seconds": times})
    json.dump(history, open(log, "w"), indent=2)


if __name__ == "__main__":
    main()
