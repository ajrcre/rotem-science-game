"""Generate game art with Gemini image models.

Usage:
    python3 tools/generate_assets.py            # generate missing assets
    python3 tools/generate_assets.py sparky     # (re)generate specific assets
    python3 tools/generate_assets.py --force    # regenerate everything
    python3 tools/generate_assets.py --align-poses  # build aligned animation frames

Reads the API key from the GEMINI_API_KEY environment variable.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import sys
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path

import numpy as np
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART_DIR = ROOT / "assets" / "art"
RAW_DIR = ROOT / "assets" / "raw"
MODEL = "gemini-3-pro-image"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
CHROMA = (255, 0, 255)


class StructuredLogger:
    """Static message text, dynamic data as keyword parameters."""

    def __init__(self, name: str) -> None:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
        self._log = logging.getLogger(name)

    def _emit(self, level: int, message: str, **params) -> None:
        suffix = " ".join(f"{k}={v}" for k, v in params.items())
        self._log.log(level, "%s %s", message, suffix)

    def info(self, message: str, **params) -> None:
        self._emit(logging.INFO, message, **params)

    def error(self, message: str, **params) -> None:
        self._emit(logging.ERROR, message, **params)


logger = StructuredLogger("assets")

STYLE = (
    "Hand-drawn 1930s rubber hose cartoon animation style, like a vintage Fleischer studio "
    "cel: bold clean black ink outlines, rubber hose limbs, white four-finger gloves, "
    "pie-cut eyes, soft watercolor and gouache shading, slightly faded warm vintage palette, "
    "high resolution, smooth vector-like lines, absolutely no pixel art, no text, no letters, "
    "no watermark. Original character design."
)
SPRITE_BG = (
    "Isolated single subject, full body, centered, generous empty margin around it, on a "
    "perfectly flat solid pure magenta (#FF00FF) background with no shadows, no gradient, "
    "no floor and no other objects. Do not use magenta or pink anywhere on the subject."
)


# ---------- Post-processing strategies ----------

class PostProcessor(ABC):
    @abstractmethod
    def process(self, image: Image.Image) -> Image.Image: ...


class KeepAsIs(PostProcessor):
    def process(self, image: Image.Image) -> Image.Image:
        return image.convert("RGB")


class ChromaKeyCutout(PostProcessor):
    """Remove the flat magenta background, despill edges and crop to content."""

    def __init__(self, hard: float = 90.0, soft: float = 170.0, max_side: int = 1024,
                 drop_islands: bool = False) -> None:
        self.hard, self.soft, self.max_side = hard, soft, max_side
        self.drop_islands = drop_islands

    def process(self, image: Image.Image) -> Image.Image:
        rgb = np.asarray(image.convert("RGB")).astype(np.float32)
        dist = np.linalg.norm(rgb - np.array(CHROMA, dtype=np.float32), axis=-1)
        alpha = np.clip((dist - self.hard) / (self.soft - self.hard), 0.0, 1.0)
        # Ghost limbs from the reference image come out as faint magenta-tinted shapes: drop them.
        alpha *= 1.0 - self._ghost_mask(rgb)
        if self.drop_islands:
            alpha *= self._island_mask(alpha)
        # Despill: pull magenta tint out of semi-transparent edge pixels.
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        spill = np.clip(np.minimum(r, b) - g, 0, None) * (1.0 - alpha)
        rgb[..., 0] -= spill
        rgb[..., 2] -= spill
        rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
        out = Image.fromarray(rgba, "RGBA")
        bbox = out.getchannel("A").point(lambda a: 255 if a > 20 else 0).getbbox()
        if bbox:
            pad = 12
            out = out.crop((max(bbox[0] - pad, 0), max(bbox[1] - pad, 0),
                            min(bbox[2] + pad, out.width), min(bbox[3] + pad, out.height)))
        out.thumbnail((self.max_side, self.max_side), Image.LANCZOS)
        return out


    @staticmethod
    def _island_mask(alpha: np.ndarray, grid: int = 256) -> np.ndarray:
        """Remove detached mid-sized blobs (stray hands); keep the body and tiny bits like sparks."""
        h, w = alpha.shape
        small = np.asarray(Image.fromarray((alpha > 0.3).astype(np.uint8) * 255)
                           .resize((grid, grid), Image.NEAREST)) > 0
        labels = np.zeros(small.shape, dtype=np.int32)
        sizes = [0]
        for y0, x0 in zip(*np.nonzero(small)):
            if labels[y0, x0]:
                continue
            label, stack, count = len(sizes), [(y0, x0)], 0
            labels[y0, x0] = label
            while stack:
                y, x = stack.pop()
                count += 1
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < grid and 0 <= nx < grid and small[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = label
                        stack.append((ny, nx))
            sizes.append(count)
        biggest = max(sizes)
        drop = [i for i, n in enumerate(sizes) if i and 0.006 * biggest < n < 0.25 * biggest]
        if not drop:
            return np.ones_like(alpha)
        mask = Image.fromarray(np.isin(labels, drop).astype(np.uint8) * 255).resize((w, h), Image.BILINEAR)
        return 1.0 - (np.asarray(mask) > 0).astype(np.float32)

    @staticmethod
    def _ghost_mask(rgb: np.ndarray) -> np.ndarray:
        """1.0 where a pixel is magenta-pink (hue ~285-345 deg) - a color our palette never uses."""
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        mx, mn = rgb.max(axis=-1), rgb.min(axis=-1)
        sat = (mx - mn) / np.maximum(mx, 1.0)
        hue = (np.degrees(np.arctan2(np.sqrt(3.0) * (g - b), 2.0 * r - g - b)) + 360.0) % 360.0
        in_band = np.clip(np.minimum(hue - 280.0, 350.0 - hue) / 10.0, 0.0, 1.0)
        return in_band * np.clip((sat - 0.12) / 0.08, 0.0, 1.0)


class ResizeBackground(PostProcessor):
    def __init__(self, width: int = 1920) -> None:
        self.width = width

    def process(self, image: Image.Image) -> Image.Image:
        image = image.convert("RGB")
        ratio = self.width / image.width
        return image.resize((self.width, round(image.height * ratio)), Image.LANCZOS)


# ---------- Asset specs ----------

@dataclass
class AssetSpec:
    name: str
    prompt: str
    aspect: str = "1:1"
    kind: str = "sprite"  # sprite | background
    references: list[str] = field(default_factory=list)
    drop_islands: bool = False

    @property
    def processor(self) -> PostProcessor:
        if self.kind == "sprite":
            return ChromaKeyCutout(drop_islands=self.drop_islands)
        return ResizeBackground()

    @property
    def extension(self) -> str:
        return "png" if self.kind == "sprite" else "jpg"

    def full_prompt(self) -> str:
        parts = [self.prompt, STYLE]
        if self.kind == "sprite":
            parts.append(SPRITE_BG)
        if self.references:
            parts.append("Match the exact drawing style, line weight and palette of the reference image(s).")
        return " ".join(parts)


def sprite(name: str, prompt: str, refs: list[str] | None = None) -> AssetSpec:
    return AssetSpec(name, prompt, references=refs if refs is not None else ["professor"])


ASSETS: list[AssetSpec] = [
    AssetSpec(
        "professor",
        "Professor Volt, a lovable eccentric inventor scientist: tall skinny body, wild white "
        "hair standing up crackling with little electric sparks, round brass goggles on forehead, "
        "big bushy mustache, long white lab coat with patched pockets full of tools, rubber hose "
        "arms, one gloved finger raised as if explaining an idea, big friendly smile.",
        aspect="3:4",
    ),
    sprite("sparky", "Sparky, a cute small walking electrical plug mascot: round cream-colored "
           "plug body with two brass prongs on top like antennae, big pie-cut eyes, wide grin, "
           "rubber hose arms and legs, white gloves, big round shoes, a curly black power cord "
           "tail, cheerful heroic pose with one fist raised."),
    sprite("alien", "A mischievous green octopus-like alien villain with three eyes riding a "
           "riveted metal flying saucer with a glass dome and round light bulbs along the rim, "
           "tentacles waving menacingly, toothy evil grin, 1930s cartoon villain energy.", ),
    AssetSpec(
        "lab_bg",
        "Wide background painting of a cozy 1930s mad-scientist laboratory interior: wooden "
        "workbench in the foreground center, brick walls, big round window showing a night sky "
        "with a distant flying saucer, Tesla coils, copper pipes, glowing vacuum tubes, shelves of "
        "bubbling flasks, warm lamp light. Empty middle area for game elements, no characters.",
        aspect="16:9", kind="background", references=["professor"],
    ),
    sprite("sun", "A smiling cartoon sun with a friendly face and wavy rays, rubber hose style."),
    sprite("solar_panel", "A vintage cartoon solar panel on a little wooden stand, dark blue grid "
           "cells with brass frame, cute face, rubber hose style object."),
    sprite("battery", "A cartoon battery character, copper top and black body, cute face, "
           "rubber hose arms."),
    sprite("speaker", "A vintage brass gramophone horn loudspeaker with a cute face, rubber hose style."),
    sprite("turbine", "A cartoon wind turbine character: tall cream tower with a cute face and rubber hose arms, three long wooden blades on a hub at the top. Exactly two arms, no extra hands or floating objects."),
    sprite("electricity", "A yellow zig-zag lightning bolt character with a cheeky face, rubber hose arms and legs, no glow or halo around it."),
    sprite("heat", "A cheerful cartoon flame character, orange and red, rubber hose style."),
    sprite("light", "A vintage incandescent light bulb character with a happy face, little yellow light rays drawn as ink strokes, rubber hose arms and legs. The background must be solid magenta, not white."),
    sprite("lever_base", "A chunky 1930s control panel box for a big lever switch: riveted brass and dark "
           "wood housing, a vertical slot on top where a lever goes, two round dial gauges and a red "
           "and green indicator bulb on the front, a cute face on the front plate. No lever handle."),
    sprite("porthole", "A big round riveted brass ship porthole window frame seen straight on, thick ring "
           "with bolts and a hinge on one side. The glass area inside the ring is completely empty solid "
           "magenta, same as the background."),
    AssetSpec(
        "night_sky",
        "Wide background painting of a starry night sky seen from a laboratory window: big cartoon moon "
        "with a sleepy face, twinkling stars, soft swirling clouds, and a tiny 1930s town skyline with "
        "water tower and chimneys silhouetted at the bottom. No spaceships, no characters.",
        aspect="16:9", kind="background", references=["professor"],
    ),
    sprite("explosion", "A huge cartoon explosion burst: puffy round billowing smoke clouds in orange, "
           "yellow and cream with a jagged starburst flash in the middle, little debris bits and "
           "spinning stars around it, classic 1930s animation explosion, no text."),
    sprite("laser", "A big retro ray-gun laser cannon on wheels, brass and red, with coils and a glass "
           "lens at the barrel, cartoon 1930s sci-fi weapon, no characters."),
]
POSE_PREFIX = ("The exact same character as in the reference image - identical design, face, colors, "
               "proportions and outfit - redrawn in a new pose: ")
POSE_SUFFIX = (" Exactly two arms and two legs. Do not keep any limb from the reference pose and do not draw "
               "faint, transparent or ghosted copies of limbs.")


def pose(base: str, name: str, prompt: str) -> AssetSpec:
    return AssetSpec(f"{base}_{name}", POSE_PREFIX + prompt + POSE_SUFFIX, aspect="3:4" if base == "professor" else "1:1",
                     references=[base], drop_islands=base == "professor")


ASSETS += [
    pose("professor", "talk", "talking excitedly with mouth wide open, both gloved hands spread out gesturing, eyebrows up."),
    pose("professor", "cheer", "jumping for joy with both arms thrown up in the air, huge open-mouth grin, knees bent, hair crackling."),
    pose("professor", "worried", "worried and nervous, both hands grabbing his cheeks, eyes wide, mouth wavy, sweat drops flying."),
    pose("professor", "point", "pointing excitedly down and to the side with one long arm, his other hand resting on his hip, leaning forward, mouth open shouting. No raised hand."),
    pose("sparky", "dance_a", "dancing a happy jig, left leg kicked high, arms swinging out, eyes closed in joy, big smile."),
    pose("sparky", "dance_b", "dancing a happy jig, right leg kicked high, arms swinging the other way, mouth open singing."),
    pose("sparky", "sad", "sad and deflated, slumped shoulders, prongs drooping, teary eyes, frown, arms hanging."),
    pose("sparky", "pull", "leaning far back pulling something heavy downward with both gloved hands raised above his head, straining face, gritted teeth."),
    pose("sparky", "cheer", "leaping in the air with both fists raised in victory, legs tucked, huge grin."),
    pose("alien", "laugh", "laughing hysterically in the flying saucer, head thrown back, eyes squeezed shut, tentacles clutching its belly, tears of laughter."),
    pose("alien", "scared", "terrified in the flying saucer, three eyes bulging huge, tentacles thrown up, teeth chattering, sweat drops."),
]
# ---------- Levels 2-6 ----------
WEAPON_POSE = " Seen from the side, the barrel or nozzle pointing up and to the right. No characters."


def card(name: str, prompt: str) -> AssetSpec:
    return AssetSpec(name, prompt, references=[])


def boss(name: str, prompt: str) -> list[AssetSpec]:
    return [
        AssetSpec(name, prompt + " Riding a riveted metal flying saucer with a glass dome and round light "
                  "bulbs along the rim, 1930s cartoon villain energy.", references=[]),
        pose(name, "laugh", "laughing hysterically in the flying saucer, head thrown back, eyes squeezed shut, "
             "clutching its belly, tears of laughter."),
        pose(name, "scared", "terrified in the flying saucer, eyes bulging huge, arms thrown up, teeth "
             "chattering, sweat drops flying."),
    ]


ASSETS += [
    card("chemical", "A cartoon round glass chemistry flask character bubbling with green liquid and floating "
         "molecule balls, cute face on the flask, rubber hose arms."),
    card("motion", "A cartoon rolling wheel character dashing forward with bold speed lines behind it, cute "
         "determined face, rubber hose arms and legs."),
    card("wind", "A cartoon puffy cloud character with puffed cheeks blowing a strong gust of wind, with swirly "
         "wind lines and a few leaves flying."),
    card("generator", "A vintage brass electric dynamo generator machine with copper coils, a flywheel and a "
         "hand crank, cute face, rubber hose arms."),
    card("motor", "A vintage electric motor with copper windings and a spinning shaft with motion lines, cute "
         "face, rubber hose arms."),
    card("dam", "A cartoon concrete water dam holding back a blue lake, water gushing from a gate at the bottom, "
         "a small cute face on the dam wall."),
    card("height", "A cartoon round boulder character sitting on the very edge of a tall cliff, nervous smile, "
         "about to tip over."),
    card("fuel", "A vintage red metal fuel jerrycan character with a cute face and rubber hose arms."),
    card("burning", "A cartoon wooden campfire with crossed logs and big orange flames, a cute face in the "
         "flames, little sparks rising."),
    card("food", "A cartoon shiny red apple character with a leaf on top, cute face, rubber hose arms and legs."),
    card("muscle", "A cartoon arm flexing a huge bicep muscle, wearing a white four-finger glove, with a cute "
         "proud face drawn on the bicep."),
    card("elastic", "A cartoon thin orange rubber band stretched long and tight between two small wooden pegs, "
         "forming a long narrow loop, with little stretch lines and a tiny strained face on the band. "
         "Clearly a rubber band, not a blob."),
    card("sound", "A cartoon musical note character singing, with curved sound waves around it, cute face, "
         "rubber hose arms."),
    card("sonic_cannon", "A big retro sonic cannon: a giant brass gramophone horn mounted on a wheeled wooden "
         "cart with speaker cones, dials and a battery box, 1930s sci-fi weapon. No text, no signs, no banners." + WEAPON_POSE),
    card("fan_cannon", "A giant retro electric fan cannon on a wheeled cart: a huge caged propeller fan driven "
         "by a brass electric motor, 1930s sci-fi weapon." + WEAPON_POSE),
    card("water_cannon", "A big retro water cannon on wheels: a riveted brass water tank, an electric pump with "
         "copper coils and a long nozzle, 1930s sci-fi weapon." + WEAPON_POSE),
    card("flamethrower", "A big retro flame cannon on wheels: a red fuel tank, brass pipes and a wide nozzle "
         "with a small pilot flame, 1930s sci-fi weapon. Nothing floating above it." + WEAPON_POSE),
    card("slingshot", "A giant wooden Y-shaped slingshot on a sturdy stand, a thick orange rubber band pulled "
         "back with a leather pouch holding a round grey rock." + WEAPON_POSE),
    *boss("alien2", "A chubby sky-blue alien villain with two enormous floppy ears and a big grin."),
    *boss("alien3", "A tall skinny yellow alien villain with a propeller beanie hat and long noodle arms."),
    *boss("alien4", "A teal fish-like alien villain with fins and gills, blowing bubbles, the glass dome "
          "filled with water."),
    *boss("alien5", "A boxy red robot alien villain with two smokestacks on its head puffing black smoke."),
    *boss("alien6", "A big orange alien king with five eyes, a golden crown and a royal blue cape, the final "
          "boss, on an extra large ornate golden saucer."),
]
ASSETS_BY_NAME = {a.name: a for a in ASSETS}


# ---------- Gemini client ----------

class GeminiImageClient:
    def __init__(self, api_key: str) -> None:
        self._session = requests.Session()
        self._session.headers.update({"x-goog-api-key": api_key, "Content-Type": "application/json"})

    def generate(self, prompt: str, aspect: str, references: list[Path], retries: int = 3) -> Image.Image:
        parts: list[dict] = [{"text": prompt}]
        for ref in references:
            parts.append({"inline_data": {"mime_type": "image/png",
                                          "data": base64.b64encode(ref.read_bytes()).decode()}})
        body = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseModalities": ["IMAGE"],
                                 "imageConfig": {"aspectRatio": aspect, "imageSize": "2K"}},
        }
        for attempt in range(1, retries + 1):
            resp = self._session.post(API_URL, data=json.dumps(body), timeout=300)
            if resp.ok:
                for cand in resp.json().get("candidates", []):
                    for part in cand.get("content", {}).get("parts", []):
                        data = part.get("inlineData") or part.get("inline_data")
                        if data:
                            return Image.open(BytesIO(base64.b64decode(data["data"])))
                logger.error("No image in response", attempt=attempt, body=resp.text[:300])
            else:
                logger.error("Gemini request failed", attempt=attempt, status=resp.status_code,
                             body=resp.text[:300])
            time.sleep(4 * attempt)
        raise RuntimeError("image generation failed")


def generate_asset(client: GeminiImageClient, spec: AssetSpec) -> None:
    refs = [RAW_DIR / f"{r}.png" for r in spec.references if (RAW_DIR / f"{r}.png").exists()]
    logger.info("Generating asset", name=spec.name, references=len(refs))
    raw = client.generate(spec.full_prompt(), spec.aspect, refs)
    raw.convert("RGB").save(RAW_DIR / f"{spec.name}.png")
    out = spec.processor.process(raw)
    path = ART_DIR / f"{spec.name}.{spec.extension}"
    if spec.extension == "jpg":
        out.save(path, quality=88)
    else:
        out.save(path, optimize=True)
    logger.info("Saved asset", name=spec.name, path=path.relative_to(ROOT), size=out.size)


# ---------- Pose alignment ----------

@dataclass(frozen=True)
class PoseTransform:
    scale: float  # applied to the pose image
    dx: float     # offset of the scaled pose's top-left from the base's top-left, in base pixels
    dy: float


class PoseAligner:
    """Register pose frames onto a base pose so the body keeps its size and position.

    Every pose is drawn independently by the image model, so the character's scale and
    placement drift between frames. We search scale + translation that maximise the
    silhouette overlap (IoU) with the base pose; the body dominates the overlap, so
    raised arms or kicked legs don't throw the fit off.
    """

    def __init__(self, grid: int = 160, scales: np.ndarray | None = None, search: int = 12,
                 pad: tuple[float, float, float] = (0.40, 0.35, 0.04)) -> None:
        self.grid = grid
        self.scales = scales if scales is not None else np.arange(0.70, 1.31, 0.02)
        self.search = search
        self.pad_top, self.pad_side, self.pad_bottom = pad

    @staticmethod
    def _mask(image: Image.Image, size: tuple[int, int]) -> np.ndarray:
        alpha = image.getchannel("A").resize(size, Image.BILINEAR)
        return (np.asarray(alpha) > 64).astype(np.float32)

    def find_transform(self, base: Image.Image, pose: Image.Image) -> PoseTransform:
        f = self.grid / max(base.size)
        bw, bh = round(base.width * f), round(base.height * f)
        margin = self.grid
        canvas_w, canvas_h = bw + 2 * margin, bh + 2 * margin
        target = np.zeros((canvas_h, canvas_w), np.float32)
        target[margin:margin + bh, margin:margin + bw] = self._mask(base, (bw, bh))
        base_bottom, base_cx = margin + bh, margin + bw / 2

        best = (-1.0, PoseTransform(1.0, 0.0, 0.0))
        for s in self.scales:
            pw, ph = max(1, round(pose.width * f * s)), max(1, round(pose.height * f * s))
            if pw >= canvas_w or ph >= canvas_h:
                continue
            m = self._mask(pose, (pw, ph))
            # Start from feet on the same baseline and the same horizontal centre of mass.
            cx = (m.sum(axis=0) * np.arange(pw)).sum() / max(m.sum(), 1.0)
            x0 = round(base_cx - cx)
            y0 = round(base_bottom - ph)
            for oy in range(-self.search, self.search + 1, 2):
                for ox in range(-self.search, self.search + 1, 2):
                    x, y = x0 + ox, y0 + oy
                    if x < 0 or y < 0 or x + pw > canvas_w or y + ph > canvas_h:
                        continue
                    window = target[y:y + ph, x:x + pw]
                    inter = np.minimum(window, m).sum()
                    union = target.sum() + m.sum() - inter
                    iou = inter / union
                    if iou > best[0]:
                        best = (iou, PoseTransform(float(s), (x - margin) / f, (y - margin) / f))
        return best[1]

    def canvas_size(self, base: Image.Image) -> tuple[int, int]:
        return (round(base.width * (1 + 2 * self.pad_side)),
                round(base.height * (1 + self.pad_top + self.pad_bottom)))

    def place(self, base: Image.Image, pose: Image.Image, t: PoseTransform) -> Image.Image:
        canvas = Image.new("RGBA", self.canvas_size(base), (0, 0, 0, 0))
        ox, oy = base.width * self.pad_side, base.height * self.pad_top
        scaled = pose.resize((max(1, round(pose.width * t.scale)), max(1, round(pose.height * t.scale))),
                             Image.LANCZOS)
        canvas.alpha_composite(scaled, (round(ox + t.dx), round(oy + t.dy)))
        return canvas

    def align_character(self, base_name: str, pose_names: list[str], out_dir: Path) -> None:
        base = Image.open(ART_DIR / f"{base_name}.png").convert("RGBA")
        out_dir.mkdir(parents=True, exist_ok=True)
        self.place(base, base, PoseTransform(1.0, 0.0, 0.0)).save(out_dir / "idle.png", optimize=True)
        for name in pose_names:
            pose = Image.open(ART_DIR / f"{base_name}_{name}.png").convert("RGBA")
            t = self.find_transform(base, pose)
            self.place(base, pose, t).save(out_dir / f"{name}.png", optimize=True)
            logger.info("Aligned pose", character=base_name, pose=name, scale=round(t.scale, 2),
                        dx=round(t.dx), dy=round(t.dy))


def align_all_poses() -> None:
    aligner = PoseAligner()
    characters: dict[str, list[str]] = {}
    for spec in ASSETS:
        base, _, pose_name = spec.name.partition("_")
        if spec.references == [base] and spec.name.startswith(base + "_") and spec.prompt.startswith(POSE_PREFIX):
            characters.setdefault(base, []).append(pose_name)
    for base, poses in characters.items():
        aligner.align_character(base, poses, ART_DIR / "frames" / base)


def main(argv: list[str]) -> int:
    if "--align-poses" in argv:
        align_all_poses()
        return 0
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.error("Missing environment variable", variable="GEMINI_API_KEY")
        return 1
    ART_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    force = "--force" in argv
    names = [a for a in argv if not a.startswith("--")]
    specs = [ASSETS_BY_NAME[n] for n in names] if names else ASSETS
    client = GeminiImageClient(api_key)
    for spec in specs:
        exists = (ART_DIR / f"{spec.name}.{spec.extension}").exists()
        if exists and not (force or names):
            continue
        generate_asset(client, spec)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
