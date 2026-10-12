"""Cut a magenta sprite sheet into frames: each big blob is a rat, small blobs (crumbs, tail tips) join the nearest rat."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, "/home/user/rotem-science-game/tools")
from generate_assets import ChromaKeyCutout

def split(src: Path, names: list[str], out: Path):
    rgba = ChromaKeyCutout(max_side=10000).process(Image.open(src).convert("RGB"))
    arr = np.asarray(rgba).copy()
    alpha = arr[..., 3]
    lab, n = ndimage.label(alpha > 10, structure=np.ones((3, 3)))
    sizes = ndimage.sum(np.ones_like(alpha), lab, range(1, n + 1))
    big = [i + 1 for i in np.argsort(-sizes)[:len(names)]]
    cents = {b: np.array(ndimage.center_of_mass(alpha > 10, lab, b)) for b in big}
    owner = np.zeros(n + 1, int)
    for b in big: owner[b] = b
    for i in range(1, n + 1):
        if owner[i]: continue
        c = np.array(ndimage.center_of_mass(alpha > 10, lab, i))
        owner[i] = min(big, key=lambda b: np.linalg.norm(cents[b] - c))
    rows_h = alpha.shape[0] / 2
    order = sorted(big, key=lambda b: (int(cents[b][0] // rows_h) if len(names) > 3 else 0, cents[b][1]))
    for name, b in zip(names, order):
        mask = owner[lab] == b
        piece = arr.copy(); piece[..., 3] = np.where(mask, piece[..., 3], 0)
        im = Image.fromarray(piece, "RGBA")
        bb = im.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
        im.crop((max(bb[0]-10,0), max(bb[1]-10,0), bb[2]+10, bb[3]+10)).save(out / f"{name}.png")
        print(name, bb)

if __name__ == "__main__":
    out = Path("frames2"); out.mkdir(exist_ok=True)
    split(Path("sheets_raw/run_sheet_a.jpg"), ["run_1", "run_2", "run_3", "run_4"], out)
    split(Path("sheets_raw/eat_sheet.jpg"), ["eat_1", "eat_2", "eat_3"], out)
