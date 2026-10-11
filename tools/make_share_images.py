"""Draw the images other sites show for the game: the link preview card and the icons.

Usage:
    python3 tools/make_share_images.py

Writes (all from the game's own art and fonts):
    assets/share/og.jpg               1200x630 card for WhatsApp, Facebook, X, Slack… (Open Graph)
    assets/share/icon-192.png         home-screen icons (web manifest)
    assets/share/icon-512.png
    assets/share/apple-touch-icon.png 180x180, opaque (iOS paints transparency black)
    favicon.ico                       16/32/48, at the site root where browsers look for it

The card text is the game title and SUBTITLE below; keep them in step with game/index.html.
Fonts are the game's (Suez One, Rubik; SIL OFL, in tools/fonts/).
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, features

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_assets import StructuredLogger  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "assets" / "art"
OUT = ROOT / "assets" / "share"
FONTS = Path(__file__).resolve().parent / "fonts"
logger = StructuredLogger("share")

TITLE = "המעבדה של פרופסור מדעני"
SUBTITLE = "משחקי מדע לילדים"
OG_SIZE = (1200, 630)

INK = (28, 20, 16)
PAPER = (243, 230, 200)
GLOW = (255, 216, 74)
RED = (184, 57, 43)
BRASS = (192, 138, 62)


def font(name: str, size: int, weight: int | None = None) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONTS / name), size, layout_engine=ImageFont.Layout.RAQM)
    if weight is not None:
        f.set_variation_by_axes([weight])
    return f


def cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Scale to fill `size`, cropping the overflow evenly (CSS background-size: cover)."""
    scale = max(size[0] / img.width, size[1] / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left, top = (img.width - size[0]) // 2, (img.height - size[1]) // 2
    return img.crop((left, top, left + size[0], top + size[1]))


@dataclass
class Headline:
    """The splash screen's title look: yellow letters, ink outline, a hard red drop shadow."""
    text: str
    font: ImageFont.FreeTypeFont
    stroke: int = 6
    shadow: tuple[int, int] = (6, 8)

    def draw(self, canvas: Image.Image, center_x: int, top: int) -> None:
        d = ImageDraw.Draw(canvas)
        w = d.textlength(self.text, font=self.font, direction="rtl")
        x = center_x - w / 2
        sx, sy = self.shadow
        d.text((x + sx, top + sy), self.text, font=self.font, fill=RED, stroke_width=self.stroke, stroke_fill=RED,
               direction="rtl")
        d.text((x, top), self.text, font=self.font, fill=GLOW, stroke_width=self.stroke, stroke_fill=INK,
               direction="rtl")


def ribbon(canvas: Image.Image, text: str, f: ImageFont.FreeTypeFont, center_x: int, top: int) -> None:
    """A red label with paper text and an ink border, like the splash subtitle."""
    d = ImageDraw.Draw(canvas)
    left, t, right, bottom = d.textbbox((0, 0), text, font=f, direction="rtl")
    pad_x, pad_y = 30, 12
    w, h = right - left + 2 * pad_x, bottom - t + 2 * pad_y
    box = (center_x - w // 2, top, center_x + w // 2, top + h)
    d.rounded_rectangle((box[0], box[1] + 6, box[2], box[3] + 6), radius=16, fill=INK)        # drop edge
    d.rounded_rectangle(box, radius=16, fill=RED, outline=INK, width=5)
    tx, ty = box[0] + pad_x - left, box[1] + pad_y - t
    d.text((tx + 2, ty + 2), text, font=f, fill=INK, direction="rtl")
    d.text((tx, ty), text, font=f, fill=PAPER, direction="rtl")


def vignette(size: tuple[int, int], strength: int = 150) -> Image.Image:
    """A dark edge fade (alpha mask) like the game's old-film vignette."""
    w, h = size
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse((-w * 0.15, -h * 0.25, w * 1.15, h * 1.25), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(size) // 6))
    return mask.point(lambda v: strength - v * strength // 255)


def professor(height: int) -> Image.Image:
    img = Image.open(ART / "frames" / "professor" / "idle.png").convert("RGBA")
    img = img.crop(img.getbbox())
    return img.resize((round(img.width * height / img.height), height), Image.LANCZOS)


def og_card() -> Image.Image:
    card = cover(Image.open(ART / "splash.jpg").convert("RGB"), OG_SIZE).convert("RGBA")
    card.paste(Image.new("RGBA", OG_SIZE, (10, 6, 4, 255)), (0, 0), vignette(OG_SIZE))
    prof = professor(500)
    card.alpha_composite(prof, (34, OG_SIZE[1] - prof.height + 40))
    Headline(TITLE, font("SuezOne-Regular.ttf", 92)).draw(card, OG_SIZE[0] // 2 + 40, 28)
    ribbon(card, SUBTITLE, font("Rubik[wght].ttf", 40, weight=700), OG_SIZE[0] // 2 + 40, 172)
    return card.convert("RGB")


def head_crop() -> Image.Image:
    """The professor's head (hair, goggles, moustache) from his idle pose."""
    img = Image.open(ART / "frames" / "professor" / "idle.png").convert("RGBA")
    return img.crop((315, 405, 690, 780))


def badge(size: int, round_badge: bool = True) -> Image.Image:
    """The icon: the professor's head on paper, inside a brass-and-ink ring (or a full square for iOS)."""
    scale = 4                                                    # draw big, then shrink: smooth edges
    s = size * scale
    icon = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(icon)
    ring = s // 22
    if round_badge:
        d.ellipse((0, 0, s - 1, s - 1), fill=INK)
        d.ellipse((ring, ring, s - 1 - ring, s - 1 - ring), fill=BRASS)
        d.ellipse((2 * ring, 2 * ring, s - 1 - 2 * ring, s - 1 - 2 * ring), fill=PAPER)
    else:
        d.rectangle((0, 0, s, s), fill=PAPER)
    head = head_crop()
    inner = round(s * (0.86 if round_badge else 0.9))
    head = head.resize((inner, inner), Image.LANCZOS)
    pos = ((s - inner) // 2, round(s * 0.07))
    if round_badge:                                              # keep the hair inside the ring
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).ellipse((2 * ring, 2 * ring, s - 1 - 2 * ring, s - 1 - 2 * ring), fill=255)
        layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        layer.alpha_composite(head, pos)
        layer.putalpha(Image.composite(layer.getchannel("A"), Image.new("L", (s, s), 0), mask))
        icon.alpha_composite(layer)
    else:
        icon.alpha_composite(head, pos)
    return icon.resize((size, size), Image.LANCZOS)


def main() -> None:
    if not features.check("raqm"):
        raise SystemExit("Pillow needs libraqm to lay out Hebrew (pip install Pillow with raqm, or apt install libraqm0)")
    OUT.mkdir(parents=True, exist_ok=True)
    og_card().save(OUT / "og.jpg", quality=86, optimize=True, progressive=True)
    for size in (192, 512):
        badge(size).save(OUT / f"icon-{size}.png", optimize=True)
    badge(180, round_badge=False).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    badge(256).save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    for path in (OUT / "og.jpg", OUT / "icon-512.png", OUT / "apple-touch-icon.png", ROOT / "favicon.ico"):
        logger.info("share image written", path=path.relative_to(ROOT), kb=path.stat().st_size // 1024)


if __name__ == "__main__":
    main()
