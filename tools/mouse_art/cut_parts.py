"""Cut the painted parts (parts_raw/*.jpg on magenta) into sprites in parts/.

Strips are split into their pieces (split.py); single props keep only their largest blob,
which drops soft drop-shadows and stray specks."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_assets import ChromaKeyCutout  # noqa: E402
from split import split  # noqa: E402

SRC, OUT = Path("parts_raw"), Path("parts")
STRIPS = {
    "flames": ["flame_1", "flame_2", "flame_3"],
    "fan": ["fan", "fan_blades"],
    "sponge": ["sponge", "sponge_wet"],
    "scale": ["scale_post", "scale_beam"],
}
SINGLES = ["candle", "icepack", "tray", "board", "metal", "cotton", "feather", "sieve", "pan", "bucket", "plank", "pulley", "shelf"]


def largest_blob(src: Path, out: Path) -> None:
    rgba = ChromaKeyCutout(max_side=10000).process(Image.open(src).convert("RGB"))
    arr = np.asarray(rgba).copy()
    lab, n = ndimage.label(arr[..., 3] > 10, structure=np.ones((3, 3)))
    sizes = ndimage.sum(np.ones(lab.shape), lab, range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    arr[..., 3] = np.where(lab == keep, arr[..., 3], 0)
    im = Image.fromarray(arr, "RGBA")
    bb = im.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
    im = im.crop((max(bb[0] - 6, 0), max(bb[1] - 6, 0), bb[2] + 6, bb[3] + 6))
    im.thumbnail((1024, 1024))
    im.save(out)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for strip, names in STRIPS.items():
        split(SRC / f"{strip}.jpg", names, OUT)
    for name in SINGLES:
        largest_blob(SRC / f"{name}.jpg", OUT / f"{name}.png")
    for p in sorted(OUT.glob("*.png")):
        im = Image.open(p)
        if max(im.size) > 1024:
            im.thumbnail((1024, 1024)); im.save(p)
        print(p.stem, im.size)


if __name__ == "__main__":
    main()
