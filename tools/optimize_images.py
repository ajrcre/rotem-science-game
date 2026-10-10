"""Make the web copies of the game art: small WebP files the browser loads quickly.

Usage:
    python3 tools/optimize_images.py            # only new or changed images
    python3 tools/optimize_images.py --force    # everything again

The art in assets/art/ is the master copy (what generate_assets.py and cut_lab_layers.py write):
PNG sprites up to ~1700 px and 1920 px paintings, about 100 MB in all. Phones choked on it.
Nothing on the 1600x900 stage is drawn bigger than ~700 px, so each image is scaled down by its
kind's policy and saved as WebP, keeping transparency. Other files (the lab layout JSON) are copied.

Reads assets/art/**, writes assets/web/** with the same layout (x.png -> x.webp).
After making new art, run this and commit assets/web/: the game only loads from there.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_assets import StructuredLogger  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "art"
OUT = ROOT / "assets" / "web"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg"}
COPY_SUFFIXES = {".json"}
logger = StructuredLogger("images")


@dataclass(frozen=True)
class WebPolicy:
    """How one kind of image is shrunk (Strategy): a size cap and a WebP quality."""
    max_side: int          # longest side, in pixels
    quality: int

    def apply(self, img: Image.Image) -> Image.Image:
        scale = self.max_side / max(img.size)
        if scale >= 1:
            return img
        size = (round(img.width * scale), round(img.height * scale))
        return img.resize(size, Image.LANCZOS)

    def save(self, img: Image.Image, dest: Path) -> None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        img = self.apply(img)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() or "transparency" in img.info else "RGB")
        img.save(dest, "WEBP", quality=self.quality, method=6)


# Full-stage paintings (JPG) keep their width: the stage is 1600 px and screens are often wider.
BACKDROP = WebPolicy(max_side=1920, quality=80)
# Sprites, cards and pose frames (PNG with transparency): drawn at most ~700 px on the stage.
SPRITE = WebPolicy(max_side=1024, quality=82)


def policy_for(path: Path) -> WebPolicy:
    return BACKDROP if path.suffix.lower() in {".jpg", ".jpeg"} else SPRITE


def web_path(src: Path) -> Path:
    rel = src.relative_to(SRC)
    return OUT / (rel.with_suffix(".webp") if src.suffix.lower() in IMAGE_SUFFIXES else rel)


def sources() -> list[Path]:
    return sorted(p for p in SRC.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES | COPY_SUFFIXES)


def is_stale(src: Path, dest: Path) -> bool:
    return not dest.exists() or dest.stat().st_mtime < src.stat().st_mtime


def build(force: bool = False) -> int:
    made = 0
    wanted = set()
    for src in sources():
        dest = web_path(src)
        wanted.add(dest)
        if not force and not is_stale(src, dest):
            continue
        if src.suffix.lower() in COPY_SUFFIXES:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
        else:
            with Image.open(src) as img:
                policy_for(src).save(img, dest)
            logger.info("image optimized", src=src.relative_to(ROOT), kb_before=src.stat().st_size // 1024,
                        kb_after=dest.stat().st_size // 1024)
        made += 1
    for old in (p for p in OUT.rglob("*") if p.is_file() and p not in wanted):   # art that was removed
        old.unlink()
        logger.info("stale web copy removed", path=old.relative_to(ROOT))
    return made


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="re-encode every image")
    args = parser.parse_args()
    made = build(force=args.force)
    total = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    logger.info("web images ready", updated=made, total_mb=round(total / 2 ** 20, 1))


if __name__ == "__main__":
    main()
