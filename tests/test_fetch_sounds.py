import io
import json
import re
import shutil
import sys
import wave
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import fetch_sounds as fs  # noqa: E402

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def _wav_bytes(samples: np.ndarray, rate: int = 22050, channels: int = 1) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = np.repeat(samples, channels) if channels > 1 else samples
        w.writeframes((frames * 32767).astype("<i2").tobytes())
    return buf.getvalue()


def _tone(seconds: float, rate: int = 22050, amp: float = 0.1) -> np.ndarray:
    t = np.arange(int(seconds * rate)) / rate
    return amp * np.sin(2 * np.pi * 440 * t)


def test_manifest_covers_exactly_the_games_sounds():
    names = re.search(r"names:\s*\[(.*?)\]", (ROOT / "mockup" / "sound.js").read_text(), re.S).group(1)
    assert set(fs.load_manifest()) == set(re.findall(r'"(\w+)"', names))


@pytest.mark.parametrize("name, entry", sorted(fs.load_manifest().items()))
def test_manifest_entries_are_valid_for_elevenlabs(name, entry):
    assert entry["prompt"].strip()
    assert 0.5 <= entry["seconds"] <= 22          # API limits for duration_seconds
    assert 0 <= entry["influence"] <= 1
    assert entry["kenney"] is None or entry["kenney"].keys() == {"pack", "file"}


def test_elevenlabs_request(monkeypatch):
    sent = {}

    class Resp:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self):
            return b"mp3-bytes"

    def fake_urlopen(req, timeout):
        sent.update(url=req.full_url, headers=dict(req.header_items()), body=json.loads(req.data))
        return Resp()

    monkeypatch.setattr(fs.urllib.request, "urlopen", fake_urlopen)
    src = fs.ElevenLabsSource(api_key="k123")
    data = src.fetch("boom", {"prompt": "big boom", "seconds": 1.5, "influence": 0.4}, 1)

    assert data == b"mp3-bytes"
    assert sent["url"] == "https://api.elevenlabs.io/v1/sound-generation"
    assert sent["headers"]["Xi-api-key"] == "k123"
    assert sent["body"] == {"text": "big boom", "duration_seconds": 1.5, "prompt_influence": 0.4}


def test_trim_is_relative_to_the_clips_own_peak():
    post = fs.Postprocess()
    quiet = np.concatenate([np.zeros(1000), _tone(0.1, fs.RATE, amp=0.001), np.zeros(1000)])
    trimmed = post.trim(quiet)
    assert len(trimmed) < len(quiet)
    assert len(trimmed) > 0.09 * fs.RATE        # a quiet recording keeps its body


def test_level_hits_target_and_respects_ceiling():
    post = fs.Postprocess()
    x = post.level(_tone(0.5, fs.RATE, amp=0.01), level_db=-12)
    assert 20 * np.log10(np.sqrt(np.mean(x ** 2))) == pytest.approx(-12, abs=0.1)
    spiky = post.level(np.concatenate([np.zeros(5000), [1.0], np.zeros(5000)]), level_db=-3)
    assert np.max(np.abs(spiky)) == pytest.approx(10 ** (post.peak_db / 20))


@needs_ffmpeg
def test_process_trims_downmixes_resamples_and_fades():
    padded = np.concatenate([np.zeros(4410), _tone(0.3), np.zeros(4410)])
    out = fs.Postprocess().process(_wav_bytes(padded, channels=2), level_db=-12)
    assert out.size == pytest.approx(0.3 * fs.RATE, rel=0.05)     # silence gone, now 44.1 kHz mono
    assert np.max(np.abs(out)) <= 10 ** (-1 / 20) + 1e-6
    assert abs(out[-1]) < 1e-3


@needs_ffmpeg
def test_process_cuts_long_loops_down():
    out = fs.Postprocess().process(_wav_bytes(_tone(3.0)), level_db=-12, max_seconds=1.0)
    assert out.size == fs.RATE
    assert abs(out[-1]) < 1e-3


class FakeSource(fs.SoundSource):
    key = "fake"

    def __init__(self, data, **kw):
        super().__init__(**kw)
        self.data, self.calls = data, 0

    def fetch(self, name, entry, variant):
        self.calls += 1
        return self.data


@needs_ffmpeg
def test_produce_writes_variants_caches_raw_and_skips_existing(tmp_path):
    src = FakeSource(_wav_bytes(_tone(0.3)), variants=2, raw_cache=tmp_path / "raw")
    entry = {"seconds": 0.5, "level_db": -12}
    written = src.produce("boom", entry, tmp_path / "out", force=False)
    assert [p.name for p in written] == ["boom.wav", "boom_v2.wav"]
    assert src.calls == 2

    assert src.produce("boom", entry, tmp_path / "out", force=False) == []
    src.produce("boom", entry, tmp_path / "out", force=True)        # re-master from the raw cache
    assert src.calls == 2
    src.produce("boom", entry, tmp_path / "out", force=False, refetch=True)
    assert src.calls == 4


def test_produce_stops_when_source_has_nothing(tmp_path):
    src = FakeSource(None, variants=2, raw_cache=tmp_path / "raw")
    assert src.produce("alien_laugh", {"seconds": 1}, tmp_path / "out", force=False) == []
    assert src.calls == 1


def test_index_lists_only_matching_candidates(tmp_path):
    for rel in ["elevenlabs/boom.wav", "elevenlabs/boom_v2.wav", "kenney/boom.wav", "kenney/boomerang.wav"]:
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_bytes(b"")
    index = json.loads(fs.write_index(tmp_path, ["boom", "click"]).read_text())
    assert index == {"boom": ["elevenlabs/boom.wav", "elevenlabs/boom_v2.wav", "kenney/boom.wav"], "click": []}


@needs_ffmpeg
def test_promote_encodes_every_variant_and_lists_them(tmp_path):
    cand = tmp_path / "cand" / "elevenlabs"
    cand.mkdir(parents=True)
    for stem in ["boom", "boom_v2", "boomerang"]:
        fs.write_wav(cand / f"{stem}.wav", _tone(0.2, fs.RATE))
    out = tmp_path / "sfx"
    variants = json.loads(fs.promote("elevenlabs", ["boom", "click"], tmp_path / "cand", out).read_text())
    assert variants == {"boom": ["boom.mp3", "boom_2.mp3"]}
    assert all((out / f).stat().st_size > 0 for f in variants["boom"])


def test_game_ships_every_sound_it_plays():
    sfx = ROOT / "assets" / "sfx"
    variants = json.loads((sfx / "variants.json").read_text())
    assert set(variants) == set(fs.load_manifest())
    for files in variants.values():
        assert files and all((sfx / f).is_file() for f in files)
