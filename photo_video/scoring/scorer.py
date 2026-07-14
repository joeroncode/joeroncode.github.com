"""Composite photo scoring.

Combines the OpenCV quality metrics with the YOLO subject detections into
a single 0..1 score used to rank photos for the slideshow.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import cv2
import numpy as np

from .detector import Detection, SubjectDetector, SALIENT_CLASSES
from .metrics import QualityMetrics, compute_metrics


# Weights for the composite score. Content (is there a good subject?) and
# sharpness dominate; exposure/contrast/colorfulness are tie-breakers.
DEFAULT_WEIGHTS: Dict[str, float] = {
    "content": 0.35,
    "sharpness": 0.25,
    "exposure": 0.15,
    "contrast": 0.15,
    "colorfulness": 0.10,
}


@dataclass
class PhotoScore:
    path: str
    width: int
    height: int
    score: float
    content_score: float
    metrics: QualityMetrics
    detections: List[Detection] = field(default_factory=list)

    def summary(self) -> Dict[str, object]:
        return {
            "path": self.path,
            "width": self.width,
            "height": self.height,
            "score": round(self.score, 4),
            "content_score": round(self.content_score, 4),
            "num_detections": len(self.detections),
            "labels": sorted({d.label for d in self.detections}),
            "metrics": {
                "sharpness_score": round(self.metrics.sharpness_score, 4),
                "exposure_score": round(self.metrics.exposure_score, 4),
                "contrast_score": round(self.metrics.contrast_score, 4),
                "colorfulness_score": round(self.metrics.colorfulness_score, 4),
            },
        }


def _content_score(dets: List[Detection], w: int, h: int) -> float:
    """Reward prominent, well-centred, salient subjects.

    Combines the best single subject (size + centering + confidence) with
    a small bonus for having a few subjects, capped so crowds do not
    dominate.
    """
    if not dets:
        return 0.0

    frame_area = float(w * h)
    frame_cx, frame_cy = w / 2.0, h / 2.0
    # Half-diagonal, used to normalise how far a subject is from centre.
    max_dist = float(np.hypot(frame_cx, frame_cy))

    per_subject = []
    for d in dets:
        salient = 1.0 if d.label in SALIENT_CLASSES else 0.4
        size = min(1.0, (d.area / frame_area) / 0.35)  # ~35% area saturates
        dist = float(np.hypot(d.cx - frame_cx, d.cy - frame_cy)) / max_dist
        centering = 1.0 - min(1.0, dist)
        per_subject.append(salient * d.confidence * (0.6 * size + 0.4 * centering))

    best = max(per_subject)
    # Bonus for a couple of extra subjects, saturating quickly.
    extra = min(0.15, 0.05 * (len(per_subject) - 1))
    return float(min(1.0, best + extra))


def score_image(
    bgr: np.ndarray,
    path: str,
    detector: Optional[SubjectDetector] = None,
    weights: Optional[Dict[str, float]] = None,
) -> PhotoScore:
    weights = weights or DEFAULT_WEIGHTS
    h, w = bgr.shape[:2]

    metrics = compute_metrics(bgr)
    dets = detector.detect(bgr) if detector is not None else []
    content = _content_score(dets, w, h)

    score = (
        weights["content"] * content
        + weights["sharpness"] * metrics.sharpness_score
        + weights["exposure"] * metrics.exposure_score
        + weights["contrast"] * metrics.contrast_score
        + weights["colorfulness"] * metrics.colorfulness_score
    )

    return PhotoScore(
        path=path,
        width=w,
        height=h,
        score=float(score),
        content_score=content,
        metrics=metrics,
        detections=dets,
    )


def score_path(
    path: str,
    detector: Optional[SubjectDetector] = None,
    weights: Optional[Dict[str, float]] = None,
) -> PhotoScore:
    bgr = cv2.imread(path, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError(f"could not read image: {path}")
    return score_image(bgr, path, detector=detector, weights=weights)
