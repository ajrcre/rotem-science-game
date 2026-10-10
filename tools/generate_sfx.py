"""Generate the game's sound effects with the ElevenLabs sound-generation API.

Usage:
    python3 tools/generate_sfx.py              # generate missing effects
    python3 tools/generate_sfx.py laser boom   # (re)generate specific effects
    python3 tools/generate_sfx.py --force      # regenerate everything

Reads the API key from the ELEVENLABS_API_KEY environment variable.
Writes 48 kHz / 16-bit PCM WAV masters to assets/audio/sfx/, the highest
quality the API returns (convert to OGG/MP3 for the web build).
"""
from __future__ import annotations

import logging
import os
import sys
import time
import wave
from dataclasses import dataclass
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "audio" / "sfx"
API_URL = "https://api.elevenlabs.io/v1/sound-generation"
SAMPLE_RATE = 48000


class StructuredLogger:
    """Static message text, dynamic data as keyword parameters."""

    def __init__(self, name: str) -> None:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
        self._log = logging.getLogger(name)

    def info(self, message: str, **params) -> None:
        self._log.info("%s %s", message, " ".join(f"{k}={v}" for k, v in params.items()))

    def error(self, message: str, **params) -> None:
        self._log.error("%s %s", message, " ".join(f"{k}={v}" for k, v in params.items()))


logger = StructuredLogger("sfx")

STYLE = "high quality, clean studio recording, no music, no voice-over"


@dataclass(frozen=True)
class SoundSpec:
    name: str
    prompt: str
    seconds: float
    influence: float = 0.6   # how literally to follow the prompt (0-1)
    loop: bool = False

    def full_prompt(self) -> str:
        return f"{self.prompt}, {STYLE}"


SOUNDS: list[SoundSpec] = [
    # UI and cards
    SoundSpec("click", "short crisp wooden button click with a tiny cartoon pop", 0.5),
    SoundSpec("card_whoosh", "quick airy whoosh of a playing card flying through the air", 0.8),
    SoundSpec("correct", "bright bell ding with a short sparkling chime tail, success sound", 1.2),
    SoundSpec("wrong", "1930s cartoon spring boing, comedic wrong answer", 1.0),
    SoundSpec("iris", "old film projector shutter clatter with a soft swoosh", 1.0),
    SoundSpec("typewriter", "a few fast vintage typewriter key strikes", 1.0),
    # Characters
    SoundSpec("alien_laugh", "mischievous high pitched cartoon alien giggle, wobbly and nasal", 1.8),
    SoundSpec("alien_scared", "cartoon alien panicked yelp with teeth chattering", 1.5),
    SoundSpec("professor_yay", "old man scientist joyful cartoon whoop", 1.2),
    SoundSpec("sparky_sad", "small cute cartoon creature sad whimper", 1.2),
    # Chain and lever
    SoundSpec("energy_flow", "electric current humming and crackling, rising in pitch", 2.0),
    SoundSpec("lever_rise", "heavy brass machinery clanks and rises, gears ratcheting", 1.5),
    SoundSpec("lever_pull", "heavy iron lever pulled down with a solid mechanical clunk and spring", 1.2),
    SoundSpec("charge", "retro sci-fi energy weapon charging up, rising electric whine", 1.5),
    # Weapons
    SoundSpec("laser", "powerful sustained laser beam blast, sizzling electric hum", 2.0),
    SoundSpec("sonic", "massive deep sonic boom from a giant brass horn, air pressure wave", 2.0),
    SoundSpec("wind", "violent gust of storm wind blasting from a huge fan", 2.0),
    SoundSpec("water", "high pressure water cannon jet spraying and splashing on metal", 2.0),
    SoundSpec("flame", "roaring flamethrower burst of fire", 2.0),
    SoundSpec("sling", "giant rubber band slingshot stretch and release twang, rock whooshing away", 1.5),
    # Finale
    SoundSpec("explosion", "big explosion of a metal flying saucer, deep boom with debris", 3.0, influence=0.5),
    SoundSpec("debris", "metal pieces and bolts clattering and tinkling as they fall", 2.0),
    SoundSpec("stars", "magical twinkling sparkle chimes, ascending", 1.5),
    # Ambience
    SoundSpec("vinyl_crackle", "soft vinyl record crackle and hiss, steady room tone", 10.0, influence=0.4, loop=True),
]
SOUNDS_BY_NAME = {s.name: s for s in SOUNDS}


class ElevenLabsSfxClient:
    def __init__(self, api_key: str) -> None:
        self._session = requests.Session()
        self._session.headers.update({"xi-api-key": api_key, "Content-Type": "application/json"})

    def generate(self, spec: SoundSpec, retries: int = 3) -> bytes:
        body = {"text": spec.full_prompt(), "duration_seconds": spec.seconds,
                "prompt_influence": spec.influence}
        if spec.loop:
            body["loop"] = True
        for attempt in range(1, retries + 1):
            resp = self._session.post(API_URL, params={"output_format": f"pcm_{SAMPLE_RATE}"},
                                      json=body, timeout=180)
            if resp.ok and resp.content:
                return resp.content
            logger.error("Sound generation failed", sound=spec.name, attempt=attempt,
                         status=resp.status_code, body=resp.text[:300])
            time.sleep(4 * attempt)
        raise RuntimeError("sound generation failed")


def save_wav(path: Path, pcm: bytes) -> None:
    """Wrap raw 16-bit mono PCM in a WAV container."""
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm)


def main(argv: list[str]) -> int:
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        logger.error("Missing environment variable", variable="ELEVENLABS_API_KEY")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    force = "--force" in argv
    names = [a for a in argv if not a.startswith("--")]
    specs = [SOUNDS_BY_NAME[n] for n in names] if names else SOUNDS
    client = ElevenLabsSfxClient(api_key)
    for spec in specs:
        path = OUT_DIR / f"{spec.name}.wav"
        if path.exists() and not (force or names):
            continue
        logger.info("Generating sound", sound=spec.name, seconds=spec.seconds)
        save_wav(path, client.generate(spec))
        logger.info("Saved sound", sound=spec.name, path=path.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
