import os

import cv2
import numpy as np

from photo_video.render.video import (RenderConfig, SlideshowRenderer,
                                       _fit_letterbox, _ken_burns_frame)


def _swatch(color, h=120, w=160):
    return np.full((h, w, 3), color, dtype=np.uint8)


def test_letterbox_dimensions():
    out = _fit_letterbox(_swatch((0, 0, 255), 100, 400), 320, 240, (0, 0, 0))
    assert out.shape == (240, 320, 3)


def test_ken_burns_frame_shape():
    base = _fit_letterbox(_swatch((0, 255, 0)), 320, 240, (0, 0, 0))
    f = _ken_burns_frame(base, 320, 240, 0.5, 0.15, 1)
    assert f.shape == (240, 320, 3)


def test_render_produces_playable_video(tmp_path):
    imgs = [_swatch(c) for c in [(255, 0, 0), (0, 255, 0), (0, 0, 255)]]
    out = str(tmp_path / "out.mp4")
    cfg = RenderConfig(width=192, height=108, fps=12,
                       seconds_per_photo=1.0, crossfade_seconds=0.3)
    manifest = SlideshowRenderer(cfg).render(
        [f"img{i}.png" for i in range(len(imgs))], out, images=imgs)

    assert os.path.exists(out)
    assert manifest["frames"] > 0
    assert manifest["num_photos"] == 3

    cap = cv2.VideoCapture(out)
    assert cap.isOpened()
    decoded = 0
    while cap.read()[0]:
        decoded += 1
    cap.release()
    assert decoded == manifest["frames"]


def test_render_no_images_raises(tmp_path):
    import pytest
    with pytest.raises(ValueError):
        SlideshowRenderer().render([], str(tmp_path / "x.mp4"))
