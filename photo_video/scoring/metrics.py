"""Technical image-quality metrics computed with OpenCV.

Every metric returns a raw measurement plus a normalised 0..1 quality
score, so they can be combined into a single composite value.  The
normalisers use simple, well-behaved curves rather than hard thresholds
so the ranking degrades gracefully on unusual images.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict

import cv2
import numpy as np


def _clip01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


@dataclass
class QualityMetrics:
    """Raw measurements and their normalised 0..1 quality scores."""

    sharpness: float
    sharpness_score: float
    brightness: float
    exposure_score: float
    contrast: float
    contrast_score: float
    colorfulness: float
    colorfulness_score: float

    def as_dict(self) -> Dict[str, float]:
        return asdict(self)


def sharpness(gray: np.ndarray) -> float:
    """Variance of the Laplacian — the classic focus/blur measure.

    Higher means more high-frequency detail (sharper).
    """
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def brightness(gray: np.ndarray) -> float:
    """Mean luma in 0..255."""
    return float(gray.mean())


def contrast(gray: np.ndarray) -> float:
    """Standard deviation of luma — a robust global-contrast proxy."""
    return float(gray.std())


def colorfulness(bgr: np.ndarray) -> float:
    """Hasler & Suesstrunk (2003) colorfulness metric."""
    b, g, r = cv2.split(bgr.astype(np.float32))
    rg = np.abs(r - g)
    yb = np.abs(0.5 * (r + g) - b)
    std_root = np.sqrt(rg.std() ** 2 + yb.std() ** 2)
    mean_root = np.sqrt(rg.mean() ** 2 + yb.mean() ** 2)
    return float(std_root + 0.3 * mean_root)


def _sharpness_score(value: float) -> float:
    # Laplacian variance is ~0 for very blurry, several hundred for sharp.
    # Saturating curve: ~0.5 at 100, ~0.9 at ~450.
    return _clip01(1.0 - np.exp(-value / 150.0))


def _exposure_score(mean_luma: float) -> float:
    # Best around mid-grey (~120); falls off toward pure black/white.
    # Gaussian centred at 120 with a generous width.
    return _clip01(float(np.exp(-((mean_luma - 120.0) ** 2) / (2 * 55.0 ** 2))))


def _contrast_score(std_luma: float) -> float:
    # Flat images (std < 20) look dull; std ~55+ is punchy.
    return _clip01(std_luma / 65.0)


def _colorfulness_score(value: float) -> float:
    # Grayscale ~0, vivid outdoor scenes ~80+.
    return _clip01(value / 80.0)


def compute_metrics(bgr: np.ndarray) -> QualityMetrics:
    """Compute all quality metrics for a BGR image."""
    if bgr is None or bgr.size == 0:
        raise ValueError("empty image passed to compute_metrics")
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    sh = sharpness(gray)
    br = brightness(gray)
    co = contrast(gray)
    cf = colorfulness(bgr)

    return QualityMetrics(
        sharpness=sh,
        sharpness_score=_sharpness_score(sh),
        brightness=br,
        exposure_score=_exposure_score(br),
        contrast=co,
        contrast_score=_contrast_score(co),
        colorfulness=cf,
        colorfulness_score=_colorfulness_score(cf),
    )
