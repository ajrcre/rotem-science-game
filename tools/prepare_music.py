"""Turn the Suno tracks into seamless background loops for the game.

Usage:
    python3 tools/prepare_music.py

The Suno songs end at full volume, so looping them as-is jumps at the seam. Each track's
last few seconds are cross-faded (equal power) into its first seconds: the file then ends
exactly where it begins, and Web Audio's `loop = true` plays it without a seam. Loudness is
evened out so the music sits under the narration and effects.

Reads assets/music_src/*.mp3 and writes assets/music/<name>.mp3 (MP3 128k stereo).
"""
from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_assets import StructuredLogger  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "music_src"
OUT = ROOT / "assets" / "music"
RATE = 44100
TRACKS = {"credits": "suno_lab_1.mp3", "lab": "suno_lab_2.mp3"}   # game name -> Suno file
logger = StructuredLogger("music")


@dataclass
class LoopMaker:
    crossfade: float = 2.0      # seconds of the tail blended into the head
    rms_db: float = -20.0       # target loudness of the whole loop

    def seamless(self, x: np.ndarray) -> np.ndarray:
        """x is (samples, channels). Returns a loop whose end flows straight into its start."""
        n = int(self.crossfade * RATE)
        if len(x) < 3 * n:
            raise ValueError("track too short to loop")
        t = np.linspace(0.0, 1.0, n, endpoint=False)[:, None]
        fade_in, fade_out = np.sin(t * np.pi / 2), np.cos(t * np.pi / 2)   # equal power
        head = x[:n] * fade_in + x[-n:] * fade_out
        return np.concatenate([head, x[n:-n]])

    def level(self, x: np.ndarray) -> np.ndarray:
        rms = np.sqrt(np.mean(x ** 2))
        if rms == 0:
            return x
        x = x * 10 ** (self.rms_db / 20) / rms
        peak = np.max(np.abs(x))
        return x * (0.97 / peak) if peak > 0.97 else x

    def make(self, x: np.ndarray) -> np.ndarray:
        return self.level(self.seamless(x))


def decode(path: Path) -> np.ndarray:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
           "-ac", "2", "-ar", str(RATE), "-f", "f32le", "pipe:1"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").astype(np.float64).reshape(-1, 2)


def encode(x: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "2",
           "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "128k", str(path)]
    subprocess.run(cmd, input=x.astype("<f4").tobytes(), check=True)


def main() -> int:
    maker = LoopMaker()
    for name, src in TRACKS.items():
        loop = maker.make(decode(SRC / src))
        target = OUT / f"{name}.mp3"
        encode(loop, target)
        logger.info("wrote loop", name=name, seconds=round(len(loop) / RATE, 1),
                    kb=target.stat().st_size // 1024)
    return 0


if __name__ == "__main__":
    sys.exit(main())
