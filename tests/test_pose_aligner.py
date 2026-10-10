import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from generate_assets import PoseAligner, PoseTransform  # noqa: E402


def draw_character(width: int, height: int, raised_arm: bool = False) -> Image.Image:
    """A simple silhouette: round head, tall body, two legs, optional raised arm."""
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    w, h = width, height
    d.ellipse((0.30 * w, 0.02 * h, 0.70 * w, 0.30 * h), fill="white")
    d.rectangle((0.25 * w, 0.28 * h, 0.75 * w, 0.75 * h), fill="white")
    d.rectangle((0.30 * w, 0.75 * h, 0.45 * w, 1.00 * h - 1), fill="white")
    d.rectangle((0.55 * w, 0.75 * h, 0.70 * w, 1.00 * h - 1), fill="white")
    if raised_arm:
        d.rectangle((0.78 * w, 0.0, 0.88 * w, 0.40 * h), fill="white")
    return img


def crop_to_content(img: Image.Image) -> Image.Image:
    return img.crop(img.getchannel("A").getbbox())


@pytest.fixture
def aligner() -> PoseAligner:
    return PoseAligner(grid=120)


def test_identical_pose_maps_to_identity(aligner):
    base = crop_to_content(draw_character(200, 400))
    t = aligner.find_transform(base, base)
    assert t.scale == pytest.approx(1.0, abs=0.03)
    assert abs(t.dx) <= 6 and abs(t.dy) <= 6


def test_recovers_scale_of_smaller_pose(aligner):
    base = crop_to_content(draw_character(200, 400))
    small = base.resize((round(base.width * 0.8), round(base.height * 0.8)), Image.LANCZOS)  # drawn at 80%
    t = aligner.find_transform(base, small)
    assert t.scale == pytest.approx(1.25, abs=0.05)


def test_raised_arm_does_not_shrink_body(aligner):
    base = crop_to_content(draw_character(200, 400))
    # Same body, but the extra arm makes the cropped image wider; the body must keep its scale.
    pose = crop_to_content(draw_character(200, 400, raised_arm=True))
    t = aligner.find_transform(base, pose)
    assert t.scale == pytest.approx(1.0, abs=0.06)


def test_place_keeps_canvas_size_constant(aligner):
    base = crop_to_content(draw_character(200, 400))
    frame_a = aligner.place(base, base, PoseTransform(1.0, 0, 0))
    half = base.resize((base.width // 2, base.height // 2))
    frame_b = aligner.place(base, half, PoseTransform(base.width / half.width, 0, 0))
    assert frame_a.size == frame_b.size == aligner.canvas_size(base)
    # The base sits at the same spot in both frames.
    a = np.asarray(frame_a.getchannel("A")) > 0
    b = np.asarray(frame_b.getchannel("A")) > 0
    assert (a & b).sum() / (a | b).sum() > 0.9
