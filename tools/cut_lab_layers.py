"""Cut each lab station out of the lab hub painting as its own layer.

The hub (assets/art/lab_hub.jpg) is one painting, so the stations sit in the room naturally.
To animate a station on hover we need it as a separate layer that lines up exactly with the
painting. Gemini repaints just that station magenta (it does this precisely); the magenta area,
closed and grown a little, is used as a stencil over the ORIGINAL pixels.

Usage:
    python3 tools/cut_lab_layers.py              # cut every station
    python3 tools/cut_lab_layers.py energy       # (re)cut one station
    python3 tools/cut_lab_layers.py --reuse      # rebuild layers from cached masks, no API calls

Writes assets/art/hub_<id>.png and assets/art/lab_hub_layers.json (stage px, 1600x900).
Reads GEMINI_API_KEY from the environment.
"""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_assets import ART_DIR, RAW_DIR, GeminiImageClient, StructuredLogger  # noqa: E402

STAGE = (1600, 900)
HUB = ART_DIR / "lab_hub.jpg"
LAYOUT = ART_DIR / "lab_hub_layers.json"
logger = StructuredLogger("lab-layers")


@dataclass(frozen=True)
class Station:
    id: str
    what: str                             # how Gemini should recognise it
    box: tuple[int, int, int, int]        # stage px region it must stay inside (left, top, right, bottom)
    extra: tuple[tuple[int, int, int, int], ...] = ()   # ellipses to add where Gemini won't paint (a glowing bulb)


STATIONS = [
    Station("chemistry", "the chemistry table on the far left with its flasks, test tubes, burners and colored smoke",
            (10, 250, 440, 690)),
    Station("energy", "the energy workbench left of center with everything standing on it - the dynamo, the "
            "batteries, the glowing light bulb with its little sparks, the Tesla coil and the windmill - and the big "
            "yellow lightning-bolt sign hanging above it", (410, 250, 860, 715), extra=((658, 418, 704, 490),)),
    Station("electric", "the magnets and electricity cabinet and the blue switchboard right of center", (860, 300, 1245, 690)),
    Station("space", "the space table on the right with the telescopes, ringed globe, star chart board and rocket",
            (1225, 280, 1600, 715)),
]


def magenta(rgb: np.ndarray) -> np.ndarray:
    """True where a pixel is saturated magenta-pink: the repainted station, shading and all."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(axis=-1), rgb.min(axis=-1)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    hue = (np.degrees(np.arctan2(np.sqrt(3.0) * (g - b), 2.0 * r - g - b)) + 360.0) % 360.0
    return (hue > 285) & (hue < 345) & (sat > 0.35) & (mx > 90)


def fill_holes(mask: Image.Image) -> Image.Image:
    """Fill gaps fully enclosed by the silhouette (white gloves and highlights Gemini left unpainted)."""
    padded = Image.new("L", (mask.width + 2, mask.height + 2), 0)
    padded.paste(mask.point(lambda v: 255 if v > 127 else 0), (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)          # everything reachable from outside
    outside = np.asarray(padded)[1:-1, 1:-1] == 128
    return Image.fromarray(np.where(outside, 0, 255).astype(np.uint8))


class StationCutter:
    def __init__(self, client: GeminiImageClient | None, grow: int = 9, feather: float = 2.5) -> None:
        self.client = client
        self.grow, self.feather = grow, feather
        self.hub = Image.open(HUB).convert("RGB").resize(STAGE, Image.LANCZOS)

    def mask_path(self, station: Station) -> Path:
        return RAW_DIR / f"hub_mask_{station.id}.png"

    def paint_mask(self, station: Station) -> Image.Image:
        path = self.mask_path(station)
        if self.client is None:
            return Image.open(path)
        prompt = (f"Edit this exact image. Paint {station.what} completely solid flat pure magenta (#FF00FF), "
                  "filling its whole silhouette including every part attached to it. Leave everything else - walls, "
                  "floor, window, lamps, pipes and the other stations - exactly as it is. Do not move, redraw or "
                  "restyle anything.")
        image = self.client.generate(prompt, "16:9", [HUB])
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        image.convert("RGB").save(path)
        return image

    def alpha(self, station: Station, painted: Image.Image) -> np.ndarray:
        rgb = np.asarray(painted.convert("RGB").resize(STAGE, Image.BILINEAR)).astype(np.float32)
        keep = magenta(rgb)
        left, top, right, bottom = station.box
        region = np.zeros_like(keep)
        region[top:bottom, left:right] = True
        mask = Image.fromarray(((keep & region) * 255).astype(np.uint8))
        for ellipse in station.extra:
            ImageDraw.Draw(mask).ellipse(ellipse, fill=255)
        # Close the ink lines Gemini leaves inside the silhouette, then grow and soften the edge.
        mask = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
        mask = fill_holes(mask)
        mask = mask.filter(ImageFilter.MaxFilter(self.grow)).filter(ImageFilter.GaussianBlur(self.feather))
        return np.asarray(mask)

    def cut(self, station: Station) -> dict:
        alpha = self.alpha(station, self.paint_mask(station))
        layer = Image.fromarray(np.dstack([np.asarray(self.hub), alpha]).astype(np.uint8), "RGBA")
        bbox = layer.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        if not bbox:
            raise RuntimeError(f"empty mask for {station.id}")
        layer.crop(bbox).save(ART_DIR / f"hub_{station.id}.png", optimize=True)
        x0, y0, x1, y1 = bbox
        logger.info("cut station", station=station.id, x=x0, y=y0, w=x1 - x0, h=y1 - y0)
        return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}


def main(argv: list[str]) -> int:
    reuse = "--reuse" in argv
    api_key = os.environ.get("GEMINI_API_KEY")
    if not reuse and not api_key:
        logger.error("Missing environment variable", variable="GEMINI_API_KEY")
        return 1
    names = [a for a in argv if not a.startswith("--")]
    cutter = StationCutter(None if reuse else GeminiImageClient(api_key))
    layout = json.loads(LAYOUT.read_text()) if LAYOUT.exists() else {}
    for station in STATIONS:
        if names and station.id not in names:
            continue
        layout[station.id] = cutter.cut(station)
    LAYOUT.write_text(json.dumps(layout, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
