"""Assemble the rat's frames: singles from frames/, strips from frames2/, all aligned to idle_1."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, "/home/user/rotem-science-game/tools")
from generate_assets import PoseAligner, PoseTransform

OUT = Path("frames_aligned"); OUT.mkdir(exist_ok=True)
for f in OUT.glob("*.png"): f.unlink()
aligner = PoseAligner()
base = Image.open("frames/idle_1.png").convert("RGBA")

def feet_place(im, scale, ref_t):
    """Strip frames share one scale; stand each on the base's baseline, centred on its body mass."""
    a = np.asarray(im.getchannel("A")) > 64
    cx = (a.sum(axis=0) * np.arange(im.width)).sum() / max(a.sum(), 1)
    bw = np.asarray(base.getchannel("A")) > 64
    bcx = (bw.sum(axis=0) * np.arange(base.width)).sum() / max(bw.sum(), 1)
    dx = bcx - cx * scale
    dy = base.height - im.height * scale
    return aligner.place(base, im, PoseTransform(scale, dx, dy))

POSES = {}
def add(pose, frames, fps):
    POSES[pose] = (frames, fps)

# singles, aligned one by one
singles = {"idle": ["idle_1", "idle_2", "idle_3"], "scared": ["scared_1", "scared_2"], "sad": ["sad_1", "sad_2"]}
aligned = {}
for pose, names in singles.items():
    for n in names:
        im = Image.open(f"frames/{n}.png").convert("RGBA")
        t = PoseTransform(1, 0, 0) if n == "idle_1" else aligner.find_transform(base, im)
        aligned[n] = aligner.place(base, im, t)
# strips: one scale per strip, from its most idle-like frame
strips = {"run": (["run_1", "run_2", "run_3", "run_4"], "run_2"), "eat": (["eat_1", "eat_2", "eat_3"], "eat_3")}
full = sorted(Path("frames2").glob("full_*.png"))
if full: strips["full"] = ([p.stem for p in full], None)
for pose, (names, ref) in strips.items():
    ims = {n: Image.open(f"frames2/{n}.png").convert("RGBA") for n in names}
    scale = aligner.find_transform(base, ims[ref]).scale if ref else 0.9 * base.height / max(i.height for i in ims.values()) * 0.75
    for n in names:
        aligned[n] = feet_place(ims[n], scale, None)
for n, im in aligned.items(): im.save(OUT / f"{n}.png")

FPS = {"idle": 4, "run": 10, "scared": 8, "sad": 3, "eat": 6, "full": 3}
CREAM = (243, 230, 200)
def flat(im, size):
    bg = Image.new("RGBA", im.size, CREAM + (255,)); bg.alpha_composite(im)
    out = bg.convert("RGB"); out.thumbnail(size); return out
groups = {}
for n in aligned: groups.setdefault(n.rsplit("_", 1)[0], []).append(n)
for pose, names in groups.items():
    names.sort()
    frames = [flat(aligned[n], (420, 420)) for n in names]
    frames[0].save(f"rat_{pose}.gif", save_all=True, append_images=frames[1:], duration=int(1000 / FPS[pose]), loop=0)
cell = 300
order = [p for p in ["idle", "run", "scared", "sad", "eat", "full"] if p in groups]
sheet = Image.new("RGB", (cell * 4 + 160, cell * len(order)), CREAM)
d = ImageDraw.Draw(sheet)
for r, pose in enumerate(order):
    d.text((14, r * cell + cell // 2 - 20), pose, fill=(28, 20, 16), font_size=34)
    for i, n in enumerate(sorted(groups[pose])):
        im = flat(aligned[n], (cell - 10, cell - 10))
        sheet.paste(im, (160 + i * cell + (cell - im.width) // 2, r * cell + (cell - im.height) // 2))
        d.text((160 + i * cell + 8, r * cell + 6), str(i + 1), fill=(120, 90, 60), font_size=24)
sheet.save("rat_frames_sheet.jpg", quality=86)
print("ok", sorted(groups))
