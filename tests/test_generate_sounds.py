import re
import sys
import wave
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import generate_sounds as gs  # noqa: E402


@pytest.mark.parametrize("name", sorted(gs.SOUNDS))
def test_every_recipe_renders_finite_audio(name):
    samples = gs.Mastering().process(gs.SOUNDS[name].render())
    assert np.all(np.isfinite(samples))
    assert 0.05 < len(samples) / gs.RATE < 3
    assert 0.9 * gs.Mastering.peak < np.max(np.abs(samples)) <= gs.Mastering.peak
    assert abs(samples[-1]) < 1e-3          # faded out: no click at the end


def test_note_names():
    assert gs.note("A4") == pytest.approx(440)
    assert gs.note("C5") == pytest.approx(523.25, abs=0.01)
    assert gs.note("Bb3") == pytest.approx(gs.note("A#3"))


def test_mix_offsets_and_seq_lengths():
    a, b = gs.Silence(0.1), gs.Silence(0.2)
    assert len(gs.Seq([a, b]).render()) == len(a.render()) + len(b.render())
    assert len(gs.Mix([a, (0.5, b)]).render()) == int(0.5 * gs.RATE) + len(b.render())


def test_generate_writes_wavs_and_skips_existing(tmp_path):
    written = gs.generate(["click"], force=False, out_dir=tmp_path)
    assert written == [tmp_path / "click.wav"]
    with wave.open(str(written[0])) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, gs.RATE)
    assert gs.generate(["click"], force=False, out_dir=tmp_path) == []


def test_player_and_assets_match_recipes():
    js = (ROOT / "mockup" / "sound.js").read_text()
    names = re.findall(r'"(\w+)"', js[js.index("names:"):js.index("buffers:")])
    assert sorted(names) == sorted(gs.SOUNDS)
    assert sorted(p.stem for p in gs.SFX_DIR.glob("*.wav")) == sorted(gs.SOUNDS)
