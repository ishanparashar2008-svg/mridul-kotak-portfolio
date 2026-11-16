# Mridul's upload folder

Put your models, renders and other 3D work here. Nothing in this folder goes on the website by itself: Ishan optimises what's needed and adds it to the site. So upload the full-quality originals and don't worry about file size or tidiness.

## Where things go

| Folder | What goes in it | Example |
|---|---|---|
| `models/hero/` | The three models for the home page hero (see [HERO-RENDERS.md](HERO-RENDERS.md)) | `statue-1.glb` |
| `renders/hero/` | The hero's six images: 3 backgrounds + 3 final renders ([HERO-RENDERS.md](HERO-RENDERS.md)) | `renders/hero/final-1.png` |
| `models/projects/<project-name>/` | Models for a project | `models/projects/kiln/potter.glb` |
| `textures/<project-name>/` | Texture maps that aren't packed into a model | `textures/kiln/clay_normal.png` |
| `renders/<project-name>/` | Final images, gallery stills and breakdown passes | `renders/kiln/wireframe.png` |
| `videos/` | Showreel and project clips | `videos/kiln-final.mp4` |
| `portrait/` | Your photo for the About section | `portrait/mridul.jpg` |
| `source-files/<project-name>/` | Working files: `.blend`, `.fbx`, `.ma`, `.ztl`, `.hip`, `.psd`, `.zip` | `source-files/kiln/kiln_v12.blend` |

**Hero:** the exact camera, sizes and file names are in [HERO-RENDERS.md](HERO-RENDERS.md).

Use lowercase names with hyphens for project folders (`low-tide-motel`, not `Low Tide Motel`). If a folder doesn't exist yet, make it.

## How to upload

**Files under 25 MB, not in `source-files/`: use the website.**

1. Open the repository on GitHub and go into the folder you want.
2. Click **Add file > Upload files** and drag your files in.
3. Write a short note about what you added, such as "Kiln final renders".
4. Click **Commit changes**.

To put files in a new folder this way, drag the folder itself onto the upload page.

**Anything bigger, and everything in `source-files/`: use GitHub Desktop.**

1. Install [GitHub Desktop](https://desktop.github.com) and sign in.
2. Choose **File > Clone repository** and pick this repository. The first download is large, so start it on a good connection.
3. Copy your files into the `mridul` folder on your computer.
4. In GitHub Desktop, write a short note, click **Commit to main**, then **Push origin**.
5. Before you start another session, click **Fetch origin** to get the latest changes.

## Limits

- **25 MB** per file through the website.
- **100 MB** per file through GitHub Desktop, outside `source-files/`.
- **2 GB** per file in `source-files/`.

Everything in `source-files/` shares a free 10 GB allowance for storage and another 10 GB for downloads. Please keep old versions out of it and upload the latest working file rather than every revision.

## What helps most for 3D models

- Export as `.glb` if you can (in Blender: File > Export > glTF 2.0 > glTF Binary). `.fbx` and `.obj` also work.
- Keep textures embedded in the `.glb`, at 2K or 4K. They get resized for the web later.
- Apply transforms before exporting. Position and scale don't matter, they get adjusted on the site.
- If a model is animated, leave the animation in and mention which clip should play.
- For a render breakdown, the wireframe, clay and final images must be the **same shot** with the same framing.

## Please don't touch

Stay inside the `mridul` folder. The other folders (`website`, `3d`, `tools`) run the site, and changing them can break it.
