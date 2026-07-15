"""Materialise a realistic sample photo set to disk.

Real photos are needed to exercise the detector meaningfully.  We use the
photographs bundled inside ``scikit-image`` (astronaut, cat, coffee,
rocket, ...) — no network access required — and derive a couple of
deliberately degraded variants (blurred, under-exposed) so the scoring
and ranking have something to separate.
"""

from __future__ import annotations

import os
from typing import List

import cv2
import numpy as np


def _rgb_to_bgr(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    if img.shape[2] == 4:
        img = img[:, :, :3]
    return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)


def build_samples(out_dir: str) -> List[str]:
    from skimage import data

    os.makedirs(out_dir, exist_ok=True)
    written: List[str] = []

    def save(name: str, img: np.ndarray) -> None:
        path = os.path.join(out_dir, name)
        cv2.imwrite(path, img)
        written.append(path)

    astronaut = _rgb_to_bgr(data.astronaut())     # a person + a clear face
    cat = _rgb_to_bgr(data.chelsea())              # a cat
    coffee = _rgb_to_bgr(data.coffee())            # a still-life cup
    rocket = _rgb_to_bgr(data.rocket())            # rocket + tiny people
    colorwheel = _make_colorwheel(480, 640)        # vivid but subject-less

    # Sharp, well-exposed originals.
    save("01_astronaut.jpg", astronaut)
    save("02_cat.jpg", cat)
    save("03_coffee.jpg", coffee)
    save("04_rocket.jpg", rocket)
    save("05_colorwheel.jpg", colorwheel)

    # Degraded variants — these should rank lower.
    blurred = cv2.GaussianBlur(astronaut, (0, 0), sigmaX=7)
    save("06_astronaut_blurred.jpg", blurred)

    dark = np.clip(cat.astype(np.float32) * 0.25, 0, 255).astype(np.uint8)
    save("07_cat_underexposed.jpg", dark)

    washed = np.clip(coffee.astype(np.float32) * 0.4 + 150, 0, 255).astype(np.uint8)
    save("08_coffee_overexposed.jpg", washed)

    return sorted(written)


def _make_colorwheel(h: int, w: int) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w / 2.0, h / 2.0
    ang = (np.arctan2(yy - cy, xx - cx) + np.pi) / (2 * np.pi)
    hsv = np.zeros((h, w, 3), dtype=np.uint8)
    hsv[..., 0] = (ang * 179).astype(np.uint8)
    hsv[..., 1] = 220
    hsv[..., 2] = 230
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)


if __name__ == "__main__":
    import sys

    out = sys.argv[1] if len(sys.argv) > 1 else "photo_video/data/sample"
    files = build_samples(out)
    print(f"wrote {len(files)} sample images to {out}")
    for f in files:
        print("  ", f)
