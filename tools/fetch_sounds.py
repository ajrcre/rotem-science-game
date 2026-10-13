"""Fetch candidate sound effects from real-world sources, for A/B against the synth.

Usage:
    python3 tools/fetch_sounds.py elevenlabs            # missing ElevenLabs candidates
    python3 tools/fetch_sounds.py kenney boom click     # specific Kenney (CC0) candidates
    python3 tools/fetch_sounds.py elevenlabs --force    # re-master everything from the raw cache
    python3 tools/fetch_sounds.py elevenlabs --refetch  # new generations (costs API credits)
    python3 tools/fetch_sounds.py promote elevenlabs    # ship a source's candidates to the game

Each source (Strategy pattern) only knows how to get raw audio bytes for one sound;
SoundSource.produce (Template Method) handles variants, skipping and post-processing,
so every candidate lands trimmed, mono, 44.1 kHz and at the same loudness. Then open
game/sfx_compare.html to listen side by side and pick winners.

ElevenLabs needs ELEVENLABS_API_KEY (a paid plan for commercial use). Kenney packs are CC0.
"""
from __future__ import annotations

import io
import json
import os
import re
import subprocess
import sys
import urllib.request
import wave
import zipfile
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_sounds import StructuredLogger  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "tools" / "sfx_manifest.json"
CANDIDATES = ROOT / "assets" / "sfx_candidates"
GAME_SFX = ROOT / "assets" / "sfx"
CACHE = ROOT / ".cache"
RATE = 44100

logger = StructuredLogger("fetch_sounds")


def load_manifest(path: Path = MANIFEST) -> dict[str, dict]:
    return json.loads(path.read_text(encoding="utf-8"))


# ---------- Post-processing ----------

@dataclass
class Postprocess:
    """Decode anything ffmpeg reads, trim silence, then even out loudness and fade the tail."""
    silence_db: float = -45     # below the clip's own peak, so quiet recordings keep their body
    peak_db: float = -1.0
    fade: float = 0.01
    cut_fade: float = 0.25
    window: float = 0.05

    def decode(self, data: bytes) -> np.ndarray:
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
               "-ac", "1", "-ar", str(RATE), "-f", "f32le", "pipe:1"]
        out = subprocess.run(cmd, input=data, capture_output=True, check=True).stdout
        return np.frombuffer(out, dtype="<f4").astype(np.float64)

    def trim(self, x: np.ndarray) -> np.ndarray:
        """Drop leading and trailing silence, measured relative to the clip's own peak."""
        peak = np.max(np.abs(x)) if len(x) else 0.0
        loud = np.flatnonzero(np.abs(x) > peak * 10 ** (self.silence_db / 20))
        if not len(loud):
            return x
        start = max(loud[0] - int(0.002 * RATE), 0)          # keep a 2 ms run-up to the attack
        return x[start:loud[-1] + 1]

    def level(self, x: np.ndarray, level_db: float) -> np.ndarray:
        """Scale so the loudest 50 ms sits at level_db RMS, then never let a peak pass peak_db.

        Whole-clip RMS would rank a click with a quiet tail as soft; the loudest window is
        closer to how loud an effect feels.
        """
        if not len(x):
            return x
        win = min(int(self.window * RATE), len(x))
        rms = np.sqrt(np.max(np.convolve(x ** 2, np.ones(win) / win, mode="valid")))
        if rms == 0:
            return x
        x = x * 10 ** (level_db / 20) / rms
        ceiling = 10 ** (self.peak_db / 20)
        peak = np.max(np.abs(x))
        return x * (ceiling / peak) if peak > ceiling else x

    def process(self, data: bytes, level_db: float, max_seconds: float | None = None) -> np.ndarray:
        x = self.level(self.trim(self.decode(data)), level_db)
        fade = self.fade
        if max_seconds and len(x) > max_seconds * RATE:
            x, fade = x[:int(max_seconds * RATE)].copy(), self.cut_fade   # cut a long loop down gently
        n = min(int(fade * RATE), len(x))
        if n:
            x[len(x) - n:] *= np.linspace(1, 0, n)
        return x


def write_wav(path: Path, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())


# ---------- Sources ----------

@dataclass
class SoundSource(ABC):
    variants: int = 1
    post: Postprocess = field(default_factory=Postprocess)
    raw_cache: Path = CACHE / "raw"

    @property
    @abstractmethod
    def key(self) -> str: ...

    @abstractmethod
    def fetch(self, name: str, entry: dict, variant: int) -> bytes | None:
        """Raw audio for one variant, or None if this source has nothing for the sound."""

    def raw(self, name: str, entry: dict, variant: int, refetch: bool) -> bytes | None:
        """fetch() through a disk cache, so re-mastering never costs another download or API call."""
        path = self.raw_cache / self.key / f"{name}_v{variant}.bin"
        if path.exists() and not refetch:
            return path.read_bytes()
        data = self.fetch(name, entry, variant)
        if data is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        return data

    def produce(self, name: str, entry: dict, out_dir: Path, force: bool, refetch: bool = False) -> list[Path]:
        written = []
        for v in range(1, self.variants + 1):
            path = out_dir / self.key / (f"{name}.wav" if v == 1 else f"{name}_v{v}.wav")
            if path.exists() and not (force or refetch):
                logger.info("skip existing candidate", source=self.key, name=name, variant=v)
                continue
            data = self.raw(name, entry, v, refetch)
            if data is None:
                logger.info("no candidate from source", source=self.key, name=name)
                break
            samples = self.post.process(data, entry.get("level_db", -18), entry["seconds"] * 1.25)
            write_wav(path, samples)
            logger.info("wrote candidate", source=self.key, name=name, variant=v,
                        seconds=round(len(samples) / RATE, 2))
            written.append(path)
        return written


@dataclass
class ElevenLabsSource(SoundSource):
    variants: int = 2
    api_key: str = ""
    url: str = "https://api.elevenlabs.io/v1/sound-generation"

    @property
    def key(self) -> str:
        return "elevenlabs"

    def fetch(self, name: str, entry: dict, variant: int) -> bytes:
        body = {"text": entry["prompt"], "duration_seconds": entry["seconds"],
                "prompt_influence": entry["influence"]}
        req = urllib.request.Request(self.url, data=json.dumps(body).encode(), method="POST", headers={
            "xi-api-key": self.api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read()


@dataclass
class KenneySource(SoundSource):
    cache: Path = CACHE / "kenney"
    _zips: dict[str, zipfile.ZipFile] = field(default_factory=dict)

    @property
    def key(self) -> str:
        return "kenney"

    def _pack(self, slug: str) -> zipfile.ZipFile:
        if slug not in self._zips:
            path = self.cache / f"{slug}.zip"
            if not path.exists():
                page = urllib.request.urlopen(f"https://kenney.nl/assets/{slug}", timeout=60).read().decode()
                url = re.search(r"https://kenney\.nl/media/pages/assets/[^\"']+\.zip", page).group(0)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(urllib.request.urlopen(url, timeout=120).read())
                logger.info("downloaded kenney pack", pack=slug)
            self._zips[slug] = zipfile.ZipFile(io.BytesIO(path.read_bytes()))
        return self._zips[slug]

    def fetch(self, name: str, entry: dict, variant: int) -> bytes | None:
        ref = entry.get("kenney")
        if not ref:
            return None
        pack = self._pack(ref["pack"])
        member = next(m for m in pack.namelist() if m.rsplit("/", 1)[-1] == ref["file"])
        return pack.read(member)


def make_source(key: str) -> SoundSource:
    if key == "elevenlabs":
        api_key = os.environ.get("ELEVENLABS_API_KEY", "")
        if not api_key:
            raise SystemExit("ELEVENLABS_API_KEY is not set")
        return ElevenLabsSource(api_key=api_key)
    if key == "kenney":
        return KenneySource()
    raise SystemExit(f"unknown source: {key} (use elevenlabs or kenney)")


# ---------- Index for the compare page ----------

def write_index(out_dir: Path, names: list[str]) -> Path:
    """List every candidate file per sound, so the static compare page knows what exists."""
    index = {n: sorted(str(p.relative_to(out_dir)) for p in out_dir.glob(f"*/{n}*.wav")
                       if re.fullmatch(rf"{re.escape(n)}(_v\d+)?", p.stem)) for n in names}
    path = out_dir / "index.json"
    path.write_text(json.dumps(index, indent=1) + "\n", encoding="utf-8")
    return path


# ---------- Promote winners into the game ----------

def promote(source_key: str, names: list[str], candidates: Path = CANDIDATES, out_dir: Path = GAME_SFX) -> Path:
    """Encode every variant of each sound to MP3 for the game and list them in variants.json.

    MP3 decodes in every browser's Web Audio; sound.js picks a random variant per play.
    Sounds not named keep their entries, so new sounds can be shipped without re-encoding the rest.
    """
    path = out_dir / "variants.json"
    try:
        variants: dict[str, list[str]] = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        variants = {}
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in names:
        files = sorted((candidates / source_key).glob(f"{name}*.wav"),
                       key=lambda p: (p.stem != name, p.stem))
        files = [f for f in files if re.fullmatch(rf"{re.escape(name)}(_v\d+)?", f.stem)]
        if not files:
            logger.info("no candidate to promote", source=source_key, name=name)
            continue
        variants[name] = []
        for i, src in enumerate(files, start=1):
            target = out_dir / (f"{name}.mp3" if i == 1 else f"{name}_{i}.mp3")
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
                            "-codec:a", "libmp3lame", "-b:a", "128k", str(target)], check=True)
            variants[name].append(target.name)
        logger.info("promoted sound", source=source_key, name=name, variants=len(files))
    path.write_text(json.dumps(variants, indent=1) + "\n", encoding="utf-8")
    return path


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 1
    if args[0] == "promote":
        if len(args) < 2:
            print(__doc__)
            return 1
        promote(args[1], args[2:] or list(load_manifest()))
        return 0
    source, names = make_source(args[0]), args[1:]
    manifest = load_manifest()
    unknown = [n for n in names if n not in manifest]
    if unknown:
        logger.info("unknown sound names", names=",".join(unknown), known=",".join(manifest))
        return 1
    for name in names or list(manifest):
        source.produce(name, manifest[name], CANDIDATES, force="--force" in argv, refetch="--refetch" in argv)
    write_index(CANDIDATES, list(manifest))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
