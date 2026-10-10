"""Synthesize the game's sound effects: 1930s cartoon style, no samples, no API.

Usage:
    python3 tools/generate_sounds.py            # generate missing sounds
    python3 tools/generate_sounds.py boom       # (re)generate specific sounds
    python3 tools/generate_sounds.py --force    # regenerate everything

Every sound is a small tree of signal nodes (Composite pattern): oscillators and noise
are leaves, envelopes and filters wrap a node, and Mix / Seq combine nodes. Each node
renders to a float32 numpy array; the recipes at the bottom are pure data, so the
output is deterministic (fixed noise seeds) and the WAVs can be committed.
"""
from __future__ import annotations

import logging
import sys
import wave
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SFX_DIR = ROOT / "assets" / "sfx"
RATE = 22050


class StructuredLogger:
    """Static message text, dynamic data as keyword parameters."""

    def __init__(self, name: str) -> None:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
        self._log = logging.getLogger(name)

    def info(self, message: str, **params) -> None:
        suffix = " ".join(f"{k}={v}" for k, v in params.items())
        self._log.info("%s %s", message, suffix)


logger = StructuredLogger("sounds")

# A value that may change over the sound: a constant, or a function of normalized time u ∈ [0, 1].
Curve = float | Callable[[np.ndarray], np.ndarray]


def sweep(a: float, b: float, shape: float = 1.0) -> Callable[[np.ndarray], np.ndarray]:
    """Glide from a to b; shape > 1 lingers at the start, < 1 rushes ahead."""
    return lambda u: a + (b - a) * u ** shape


def expsweep(a: float, b: float) -> Callable[[np.ndarray], np.ndarray]:
    """Exponential glide, which sounds even across octaves."""
    return lambda u: a * (b / a) ** u


def _curve(c: Curve, u: np.ndarray) -> np.ndarray:
    return c(u) if callable(c) else np.full_like(u, float(c))


def _time(seconds: float) -> np.ndarray:
    n = max(int(seconds * RATE), 1)
    return np.linspace(0.0, 1.0, n, endpoint=False, dtype=np.float64)


# ---------- Nodes ----------

class Node(ABC):
    @abstractmethod
    def render(self) -> np.ndarray: ...


WAVEFORMS: dict[str, Callable[[np.ndarray], np.ndarray]] = {
    "sine": np.sin,
    "square": lambda ph: np.tanh(4 * np.sin(ph)),                 # rounded, less harsh
    "saw": lambda ph: 2 * ((ph / (2 * np.pi)) % 1.0) - 1,
    "triangle": lambda ph: 2 / np.pi * np.arcsin(np.sin(ph)),
    "reed": lambda ph: np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.33 * np.sin(3 * ph) + 0.2 * np.sin(5 * ph),
}


@dataclass
class Osc(Node):
    """Oscillator with a pitch curve and optional vibrato (Hz, depth as a pitch ratio)."""
    freq: Curve
    seconds: float
    wave: str = "sine"
    vibrato: tuple[float, float] = (0.0, 0.0)

    def render(self) -> np.ndarray:
        u = _time(self.seconds)
        f = _curve(self.freq, u)
        rate, depth = self.vibrato
        if depth:
            f = f * (1 + depth * np.sin(2 * np.pi * rate * u * self.seconds))
        phase = 2 * np.pi * np.cumsum(f) / RATE
        out = WAVEFORMS[self.wave](phase)
        return out / np.max(np.abs(out))


@dataclass
class Noise(Node):
    seconds: float
    seed: int = 0

    def render(self) -> np.ndarray:
        return np.random.default_rng(self.seed).uniform(-1, 1, len(_time(self.seconds)))


@dataclass
class Silence(Node):
    seconds: float

    def render(self) -> np.ndarray:
        return np.zeros(len(_time(self.seconds)))


@dataclass
class Env(Node):
    """Attack / exponential decay amplitude envelope, with an optional hold before the decay."""
    child: Node
    attack: float = 0.005
    hold: float = 0.0
    decay: float = 0.0   # time constant in seconds; 0 = linear fade over the remainder

    def render(self) -> np.ndarray:
        x = self.child.render()
        t = np.arange(len(x)) / RATE
        env = np.clip(t / max(self.attack, 1e-4), 0, 1)
        tail = np.clip(t - self.attack - self.hold, 0, None)
        if self.decay:
            env *= np.exp(-tail / self.decay)
        else:
            rest = max(t[-1] - self.attack - self.hold, 1e-4)
            env *= np.clip(1 - tail / rest, 0, 1)
        return x * env


@dataclass
class Shape(Node):
    """Multiply by an arbitrary amplitude curve over normalized time (tremolo, swells, ...)."""
    child: Node
    amp: Callable[[np.ndarray], np.ndarray]

    def render(self) -> np.ndarray:
        x = self.child.render()
        return x * self.amp(np.linspace(0, 1, len(x), endpoint=False))


@dataclass
class Filter(Node):
    """One-pole low-pass (or high-pass) with a possibly moving cutoff."""
    child: Node
    cutoff: Curve
    high: bool = False

    def render(self) -> np.ndarray:
        x = self.child.render()
        fc = _curve(self.cutoff, np.linspace(0, 1, len(x), endpoint=False))
        a = 1 - np.exp(-2 * np.pi * np.clip(fc, 10, RATE / 2.2) / RATE)
        y = np.empty_like(x)
        acc = 0.0
        for i, (xi, ai) in enumerate(zip(x, a)):
            acc += ai * (xi - acc)
            y[i] = acc
        return x - y if self.high else y


@dataclass
class Gain(Node):
    child: Node
    level: float

    def render(self) -> np.ndarray:
        return self.child.render() * self.level


@dataclass
class Mix(Node):
    """Layer children, each optionally delayed: Mix([node, (0.1, node2)])."""
    parts: list[Node | tuple[float, Node]]

    def render(self) -> np.ndarray:
        layers = [(p if isinstance(p, tuple) else (0.0, p)) for p in self.parts]
        rendered = [(int(d * RATE), n.render()) for d, n in layers]
        out = np.zeros(max(o + len(x) for o, x in rendered))
        for o, x in rendered:
            out[o:o + len(x)] += x
        return out


@dataclass
class Seq(Node):
    """Play children one after another."""
    parts: list[Node]

    def render(self) -> np.ndarray:
        return np.concatenate([p.render() for p in self.parts])


# ---------- Building blocks ----------

def note(name: str) -> float:
    """'C5', 'F#4', 'Bb3' → Hz."""
    steps = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    semis = steps[name[0]] + name[1:-1].count("#") - name[1:-1].count("b")
    return 440.0 * 2 ** ((semis + 12 * (int(name[-1]) - 4)) / 12)


def xylo(pitch: str | float, seconds: float = 0.35, level: float = 1.0) -> Node:
    """Wooden mallet bar: sine + a bright, fast-dying overtone."""
    f = note(pitch) if isinstance(pitch, str) else pitch
    return Gain(Mix([
        Env(Osc(f, seconds), attack=0.002, decay=seconds / 3.5),
        Gain(Env(Osc(f * 3.98, seconds), attack=0.001, decay=0.03), 0.35),
    ]), level)


def bell(pitch: str, seconds: float = 0.9) -> Node:
    f = note(pitch)
    return Mix([
        Env(Osc(f, seconds), attack=0.002, decay=seconds / 3),
        Gain(Env(Osc(f * 2.76, seconds), attack=0.002, decay=seconds / 6), 0.4),
        Gain(Env(Osc(f * 5.4, seconds), attack=0.001, decay=seconds / 12), 0.2),
    ])


def horn(freq: Curve, seconds: float, vibrato=(5.5, 0.012)) -> Node:
    """Muted brass / kazoo: a reed wave, darkened."""
    return Filter(Env(Osc(freq, seconds, "reed", vibrato), attack=0.03, hold=seconds * 0.5), 2200)


def hiss(seconds: float, cutoff: Curve, seed: int, high: bool = False) -> Node:
    return Filter(Noise(seconds, seed), cutoff, high)


def thump(f0: float, f1: float, seconds: float) -> Node:
    return Env(Osc(expsweep(f0, f1), seconds), attack=0.002, decay=seconds / 3)


def tremolo(rate: float, depth: float = 1.0) -> Callable[[np.ndarray], np.ndarray]:
    return lambda u: 1 - depth * 0.5 * (1 - np.cos(2 * np.pi * rate * u))


# ---------- Recipes ----------

def _laugh() -> Node:
    """'Nyah-ha-ha-ha': falling nasal syllables."""
    syll = [Env(Osc(expsweep(f, f * 0.82), 0.11, "reed", (30, 0.03)), attack=0.01, decay=0.05)
            for f in (620, 580, 540, 500, 460)]
    return Filter(Seq([p for s in syll for p in (s, Silence(0.035))]), 2600)


def _victory() -> Node:
    run = ["C5", "E5", "G5", "C6"]
    notes = [(i * 0.11, xylo(p, 0.3)) for i, p in enumerate(run)]
    chord = [(0.48, Gain(horn(note(p), 0.75, (6, 0.01)), 0.35)) for p in ("C4", "E4", "G4")]
    return Mix(notes + chord + [(0.48, xylo("C6", 0.8)), (0.48, xylo("E6", 0.8, 0.6))])


SOUNDS: dict[str, Node] = {
    # --- UI ---
    "click": Mix([xylo(1250, 0.08, 0.7), Gain(Env(hiss(0.02, 4000, 1, True), decay=0.004), 0.3)]),
    "iris": Gain(Shape(hiss(0.55, expsweep(300, 3000), 2), lambda u: np.sin(np.pi * u) ** 2), 0.5),

    # --- Workbench ---
    "card_right": Mix([
        Gain(Env(Osc(expsweep(500, 1500), 0.28, "sine", (9, 0.02)), attack=0.01, hold=0.2), 0.6),
        (0.26, xylo("G5", 0.3)), (0.36, xylo("C6", 0.4)),
    ]),
    "card_wrong": Seq([
        Gain(horn(note("G3"), 0.17), 0.8),
        Gain(horn(note("F#3"), 0.17), 0.8),
        Gain(horn(note("F3"), 0.17), 0.8),
        horn(expsweep(note("E3"), note("D3")), 0.6, (6, 0.03)),
    ]),
    "alien_laugh": _laugh(),
    "alien_scared": Filter(Env(Osc(expsweep(700, 1100), 0.45, "reed", (22, 0.06)), attack=0.01, hold=0.25), 3000),
    "energy_flow": Mix([
        Gain(Shape(Osc(expsweep(110, 330), 1.6, "saw", (60, 0.01)), lambda u: np.minimum(u * 4, 1) * (1 - u ** 6)), 0.25),
        Gain(Shape(hiss(1.6, sweep(1500, 6000), 3, True), tremolo(26, 0.8)), 0.2),
    ]),
    "lever_ready": bell("A5"),
    "lever_pull": Mix([
        Gain(Shape(hiss(0.25, 900, 4), tremolo(28)), 0.5),      # ratchet
        (0.22, Gain(thump(160, 60, 0.3), 1.0)),                   # clunk
        (0.22, Gain(Env(hiss(0.08, 1800, 5), decay=0.015), 0.6)),
    ]),

    # --- Porthole finale ---
    "ufo_arrive": Gain(Shape(Osc(lambda u: 520 + 140 * np.sin(2 * np.pi * 3 * u) + 120 * u, 1.6, "sine", (7, 0.03)),
                             lambda u: np.minimum(u * 3, 1) * np.minimum((1 - u) * 6, 1)), 0.55),
    "charge": Gain(Shape(Mix([Osc(expsweep(180, 1400), 0.85, "saw"), Gain(Osc(expsweep(360, 2800), 0.85), 0.4)]),
                         lambda u: u ** 1.5 * np.minimum((1 - u) * 15, 1)), 0.35),
    "fire_laser": Mix([
        Gain(Env(Osc(expsweep(2400, 500), 0.25, "square"), attack=0.002, decay=0.09), 0.45),
        (0.12, Gain(Shape(Osc(900, 0.9, "saw", (40, 0.02)), lambda u: (1 - u) ** 2), 0.25)),
    ]),
    "fire_sonic": Seq([
        Gain(horn(note("A3"), 0.3, (8, 0.02)), 0.8),
        Gain(Shape(Osc(note("A3"), 0.9, "reed", (14, 0.05)), lambda u: (1 - u) * tremolo(9, 0.7)(u)), 0.7),
    ]),
    "fire_wind": Gain(Shape(hiss(1.3, lambda u: 400 + 2200 * np.sin(np.pi * u), 6), lambda u: np.sin(np.pi * u) ** 1.2), 0.9),
    "fire_water": Mix([
        Gain(Shape(hiss(1.15, 5000, 7, True), lambda u: np.minimum(u * 12, 1) * (1 - u)), 0.6),
        *[(0.1 + i * 0.09, Gain(Env(Osc(expsweep(f, f * 2.2), 0.06), decay=0.02), 0.35))
          for i, f in enumerate([380, 520, 300, 460, 340, 600, 420, 360, 500, 440])],
    ]),
    "fire_flame": Mix([
        Gain(Shape(hiss(1.3, 700, 8), lambda u: np.minimum(u * 6, 1) * (1 - u ** 3)), 1.0),
        Gain(Shape(Noise(1.3, 9), lambda u: (np.random.default_rng(10).random(len(u)) > 0.9985) * (1 - u)), 0.5),  # crackle
    ]),
    "fire_sling": Mix([
        Gain(Env(Osc(expsweep(140, 95), 0.4, "triangle", (18, 0.04)), attack=0.002, decay=0.12), 0.8),   # twang
        (0.08, Gain(Shape(Osc(expsweep(1800, 900), 0.45, "sine"), lambda u: np.sin(np.pi * u)), 0.35)),  # whistle
    ]),
    "boom": Mix([
        Gain(thump(110, 30, 1.4), 1.0),
        Gain(Env(hiss(1.6, expsweep(2500, 150), 11), attack=0.003, decay=0.35), 1.0),
        (0.04, Gain(Env(hiss(0.9, 600, 12), attack=0.01, decay=0.25), 0.6)),
    ]),

    # --- Victory & quiz ---
    "victory": _victory(),
    "star": Mix([xylo("E6", 0.3, 0.6), (0.05, xylo("B6", 0.4, 0.4))]),
    "quiz_right": Mix([bell("E5", 0.6), (0.12, bell("A5", 0.8))]),
    "quiz_wrong": Mix([Gain(thump(220, 120, 0.25), 0.9), (0.14, Gain(thump(180, 90, 0.35), 0.9))]),
}


# ---------- Output ----------

@dataclass
class Mastering:
    """Final polish for every sound: soft clip, normalize, short fade-out, 16-bit PCM."""
    peak: float = 0.85
    fade: float = 0.01
    vintage_cutoff: float = 7000     # old optical soundtracks topped out around here

    def process(self, x: np.ndarray) -> np.ndarray:
        x = Filter(_Raw(x), self.vintage_cutoff).render()
        x = np.tanh(1.5 * x / (np.max(np.abs(x)) or 1))
        x = x / (np.max(np.abs(x)) or 1) * self.peak
        n = min(int(self.fade * RATE), len(x))
        x[len(x) - n:] *= np.linspace(1, 0, n)
        return x

    @staticmethod
    def to_pcm(x: np.ndarray) -> bytes:
        return (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()


@dataclass
class _Raw(Node):
    data: np.ndarray

    def render(self) -> np.ndarray:
        return self.data.copy()


def write_wav(path: Path, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(Mastering.to_pcm(samples))


def generate(names: list[str], force: bool, out_dir: Path = SFX_DIR) -> list[Path]:
    master = Mastering()
    written = []
    for name in names:
        path = out_dir / f"{name}.wav"
        if path.exists() and not force:
            logger.info("skip existing sound", name=name)
            continue
        samples = master.process(SOUNDS[name].render())
        write_wav(path, samples)
        logger.info("wrote sound", name=name, seconds=round(len(samples) / RATE, 2))
        written.append(path)
    return written


def main(argv: list[str]) -> int:
    force = "--force" in argv
    names = [a for a in argv if not a.startswith("--")]
    unknown = [n for n in names if n not in SOUNDS]
    if unknown:
        logger.info("unknown sound names", names=",".join(unknown), known=",".join(SOUNDS))
        return 1
    generate(names or list(SOUNDS), force=force or bool(names))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
