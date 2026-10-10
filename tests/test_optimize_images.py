import re
import sys
from pathlib import Path

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import optimize_images as oi  # noqa: E402


@pytest.fixture
def dirs(tmp_path, monkeypatch):
    src, out = tmp_path / "art", tmp_path / "web"
    (src / "frames" / "hero").mkdir(parents=True)
    monkeypatch.setattr(oi, "SRC", src)
    monkeypatch.setattr(oi, "OUT", out)
    monkeypatch.setattr(oi, "ROOT", tmp_path)
    return src, out


def sprite(path, size=(2000, 1000)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    img.paste((255, 0, 0, 255), (0, 0, size[0] // 2, size[1]))
    img.save(path)


def test_sprite_is_capped_on_its_longest_side():
    img = Image.new("RGBA", (2000, 1000))
    assert oi.SPRITE.apply(img).size == (1024, 512)


def test_small_images_are_not_enlarged():
    img = Image.new("RGBA", (300, 200))
    assert oi.SPRITE.apply(img).size == (300, 200)


def test_paintings_and_sprites_get_their_own_policy():
    assert oi.policy_for(Path("lab_hub.jpg")) is oi.BACKDROP
    assert oi.policy_for(Path("alien.png")) is oi.SPRITE


def test_web_path_keeps_the_layout(dirs):
    src, out = dirs
    assert oi.web_path(src / "frames" / "hero" / "idle.png") == out / "frames" / "hero" / "idle.webp"
    assert oi.web_path(src / "layers.json") == out / "layers.json"


def test_build_keeps_transparency_and_copies_json(dirs):
    src, out = dirs
    sprite(src / "frames" / "hero" / "idle.png")
    (src / "layers.json").write_text('{"a": 1}')
    assert oi.build() == 2
    with Image.open(out / "frames" / "hero" / "idle.webp") as img:
        assert img.format == "WEBP" and img.size == (1024, 512)
        assert img.convert("RGBA").getpixel((1000, 10))[3] == 0      # the clear half stays clear
        assert img.convert("RGBA").getpixel((10, 10))[3] == 255
    assert (out / "layers.json").read_text() == '{"a": 1}'


def test_build_skips_up_to_date_and_removes_stale(dirs):
    src, out = dirs
    sprite(src / "a.png", (64, 64))
    oi.build()
    assert oi.build() == 0                                        # nothing changed
    (out / "gone.webp").write_bytes(b"x")
    oi.build()
    assert not (out / "gone.webp").exists()


def test_every_art_file_has_a_current_web_copy():
    # New art must go through tools/optimize_images.py, or the game won't find it.
    missing = [str(p.relative_to(ROOT)) for p in oi.sources() if not oi.web_path(p).exists()]
    assert missing == []


def test_game_only_points_at_web_images_that_exist():
    game = ROOT / "game"
    text = "".join((game / f).read_text() for f in ("index.html", "style.css"))
    refs = re.findall(r"\.\./assets/(\w+)/([\w/]+\.\w+)", text)
    assert refs
    for folder, name in refs:
        if name.endswith((".png", ".jpg", ".webp")):
            assert folder == "web", name
            assert (ROOT / "assets" / folder / name).exists(), name
