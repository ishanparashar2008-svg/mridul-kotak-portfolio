"""
Rebuild the Saltwater Cathedral sequence end to end.

    python 3d/render_cathedral.py              # build, render 4 passes + specks x 2 framings, compose into the site
    python 3d/render_cathedral.py --preview    # only frames 1,32,60,90,106,120 -> 3d/cathedral/preview/
    python 3d/render_cathedral.py --resume     # continue an interrupted full render

Options: --framing desktop|mobile, --passes wire,clay,..., --skip-build, --skip-compose.
Blender comes from BLENDER_PATH, else the skill's find_blender.py.
Intermediate PNGs land in 3d/cathedral/render/ (about 1 GB; safe to delete
after composing). Render times are appended to 3d/cathedral/render_times.json.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "cathedral")
SKILL = os.path.join(os.path.expanduser("~"), ".claude", "skills", "blender-scroll-3d", "scripts")
PASSES = ["wire", "clay", "final", "specks"]  # the site has no lighting pass; "lit" still builds on request
FRAMINGS = {
    "desktop": [],
    "mobile": ["--camera", "CamMobile", "--res", "720x1280"],
}
PREVIEW_FRAMES = [1, 32, 60, 90, 106, 120]


def blender():
    path = os.environ.get("BLENDER_PATH")
    if path:
        return path
    return subprocess.check_output([sys.executable, os.path.join(SKILL, "find_blender.py")], text=True).strip().splitlines()[-1]


def run(cmd):
    print(">", " ".join(cmd[:4]), "...", flush=True)
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in p.stdout.splitlines():
        if line.startswith(("[render]", "[bscroll]", "[cathedral]", "Error", "Traceback")) or "Error" in line:
            print("   ", line, flush=True)
    if p.returncode:
        sys.exit(f"failed: {' '.join(cmd)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--framing", default="desktop,mobile")
    ap.add_argument("--passes", default=",".join(PASSES))
    ap.add_argument("--skip-build", action="store_true")
    ap.add_argument("--skip-compose", action="store_true")
    a = ap.parse_args()
    exe = blender()
    passes = a.passes.split(",")
    times = {}

    if not a.skip_build:
        run([exe, "-b", "--factory-startup", "--python-exit-code", "1", "-P", os.path.join(HERE, "build_cathedral.py"),
             "--", "--out", WORK, "--passes", ",".join(passes)])

    root = os.path.join(WORK, "preview" if a.preview else "render")
    for framing in a.framing.split(","):
        for p in passes:
            out = os.path.join(root, framing, p)
            os.makedirs(out, exist_ok=True)
            base = [exe, "-b", os.path.join(WORK, f"{p}.blend"), "--python-exit-code", "1",
                    "-P", os.path.join(SKILL, "render_sequence.py"), "--", "--format", "PNG", *FRAMINGS[framing]]
            t0 = time.time()
            if a.preview:
                for f in PREVIEW_FRAMES:
                    tmp = os.path.join(out, "_tmp")
                    run(base + ["--out", tmp, "--start", str(f), "--end", str(f)])
                    shutil.move(os.path.join(tmp, "frame_0001.png"), os.path.join(out, f"frame_{f:04d}.png"))
                    shutil.rmtree(tmp, ignore_errors=True)
            else:
                run(base + ["--out", out] + (["--resume"] if a.resume else []))
            times[f"{framing}/{p}"] = round(time.time() - t0, 1)
            print(f"[cathedral] {framing}/{p}: {times[f'{framing}/{p}']} s", flush=True)

    log = os.path.join(WORK, "render_times.json")
    history = json.load(open(log)) if os.path.exists(log) else []
    history.append({"when": time.strftime("%Y-%m-%d %H:%M"), "preview": a.preview, "seconds": times})
    json.dump(history, open(log, "w"), indent=2)

    if a.skip_compose:
        return
    compose = [sys.executable, os.path.join(HERE, "compose_cathedral.py"), "--framing", a.framing, "--src", root]
    if a.preview:
        compose += ["--frames", ",".join(str(f) for f in PREVIEW_FRAMES)]
    subprocess.run(compose, check=True)


if __name__ == "__main__":
    main()
