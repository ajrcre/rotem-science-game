"""Generate game art with Gemini image models.

Usage:
    python3 tools/generate_assets.py            # generate missing assets
    python3 tools/generate_assets.py sparky     # (re)generate specific assets
    python3 tools/generate_assets.py --force    # regenerate everything

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

    def __init__(self, hard: float = 90.0, soft: float = 170.0, max_side: int = 1024) -> None:
        self.hard, self.soft, self.max_side = hard, soft, max_side

    def process(self, image: Image.Image) -> Image.Image:
        rgb = np.asarray(image.convert("RGB")).astype(np.float32)
        dist = np.linalg.norm(rgb - np.array(CHROMA, dtype=np.float32), axis=-1)
        alpha = np.clip((dist - self.hard) / (self.soft - self.hard), 0.0, 1.0)
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

    @property
    def processor(self) -> PostProcessor:
        return ChromaKeyCutout() if self.kind == "sprite" else ResizeBackground()

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
    sprite("laser", "A big retro ray-gun laser cannon on wheels, brass and red, with coils and a glass "
           "lens at the barrel, cartoon 1930s sci-fi weapon, no characters."),
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


def main(argv: list[str]) -> int:
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
