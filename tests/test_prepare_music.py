import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import prepare_music as pm  # noqa: E402


def stereo(x):
    return np.stack([x, x], axis=1)


def test_loop_is_shorter_by_the_crossfade():
    x = stereo(np.random.default_rng(0).normal(size=pm.RATE * 10))
    maker = pm.LoopMaker(crossfade=1.0)
    assert len(maker.seamless(x)) == len(x) - pm.RATE


def test_loop_seam_is_continuous():
    # A tone whose end and start are out of phase: a plain loop would click at the seam.
    t = np.arange(int(pm.RATE * 8.3)) / pm.RATE
    x = stereo(np.sin(2 * np.pi * 220 * t))
    loop = pm.LoopMaker(crossfade=1.0).seamless(x)
    wrapped = np.concatenate([loop[-200:], loop[:200]])[:, 0]
    step = np.max(np.abs(np.diff(wrapped)))
    assert step < 2 * np.max(np.abs(np.diff(x[:400, 0]))) + 1e-6    # no bigger jump than the tone itself has


def test_seam_keeps_its_loudness():
    x = stereo(np.random.default_rng(1).normal(size=pm.RATE * 10))
    loop = pm.LoopMaker(crossfade=1.0).seamless(x)
    n = pm.RATE // 2
    seam = np.concatenate([loop[-n:], loop[:n]])
    rms = lambda a: np.sqrt(np.mean(a ** 2))
    assert rms(seam) == pytest.approx(rms(x), rel=0.15)          # equal-power blend: no dip or bump


def test_level_hits_target_without_clipping():
    x = stereo(np.random.default_rng(2).normal(scale=0.01, size=pm.RATE * 10))
    out = pm.LoopMaker(rms_db=-20).level(x)
    assert 20 * np.log10(np.sqrt(np.mean(out ** 2))) == pytest.approx(-20, abs=0.5)
    assert np.max(np.abs(out)) <= 0.97 + 1e-9


def test_too_short_to_loop():
    with pytest.raises(ValueError):
        pm.LoopMaker(crossfade=2.0).seamless(stereo(np.zeros(pm.RATE * 5)))
