"""
Build the five project models for the void (#work), export and shrink them.

    python 3d/build_models.py                 # all models
    python 3d/build_models.py kiln paper-tigers

For each 3d/models/<slug>.py:
  1. Blender builds it        -> 3d/models/build/<slug>.blend
  2. export_glb.py (skill)    -> 3d/models/build/<slug>.glb   (--no-anim --no-camera --no-draco)
  3. tools/optimize-model.mjs -> website/assets/models/world/<slug>.glb  (Meshopt, no wire copy)
  4. preview_model.py         -> 3d/models/build/<slug>_a/b/c.png
Blender comes from BLENDER_PATH, else the skill's find_blender.py. The
optimiser needs `npm install` in tools/ once.
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SKILL = os.path.join(os.path.expanduser("~"), ".claude", "skills", "blender-scroll-3d", "scripts")
MODELS = ["saltwater-cathedral", "kiln", "orbital-nursery", "paper-tigers", "low-tide-motel"]
BUILD = os.path.join(HERE, "models", "build")


def blender():
    path = os.environ.get("BLENDER_PATH")
    if path:
        return path
    return subprocess.check_output([sys.executable, os.path.join(SKILL, "find_blender.py")], text=True).strip().splitlines()[-1]


def run(cmd, keep=("[glb]", "[bscroll]", "[preview]", "Error", "Traceback", "Model", "Input")):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=ROOT)
    for line in p.stdout.splitlines():
        if line.startswith(keep) or "Error" in line:
            print("   ", line)
    if p.returncode:
        sys.exit(f"failed: {' '.join(cmd)}")


def main():
    exe = blender()
    os.makedirs(BUILD, exist_ok=True)
    for slug in sys.argv[1:] or MODELS:
        print(f"[models] {slug}")
        blend = os.path.join(BUILD, f"{slug}.blend")
        raw = os.path.join(BUILD, f"{slug}.glb")
        run([exe, "-b", "--factory-startup", "--python-exit-code", "1",
             "-P", os.path.join(HERE, "models", f"{slug}.py"), "--", "--save", blend])
        run([exe, "-b", blend, "--python-exit-code", "1", "-P", os.path.join(SKILL, "export_glb.py"),
             "--", "--out", raw, "--no-anim", "--no-camera", "--no-draco"])
        run(["node", os.path.join(ROOT, "tools", "optimize-model.mjs"), raw, f"world/{slug}", "--no-wire"])
        run([exe, "-b", blend, "--python-exit-code", "1", "-P", os.path.join(HERE, "preview_model.py"),
             "--", "--out", os.path.join(BUILD, slug)])


if __name__ == "__main__":
    main()
