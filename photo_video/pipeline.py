"""End-to-end orchestration: score photos, rank them, render a video."""

from __future__ import annotations

import glob
import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

import cv2

from .render import RenderConfig, SlideshowRenderer
from .scoring import PhotoScore, SubjectDetector, score_image

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff")


def find_images(folder: str) -> List[str]:
    paths: List[str] = []
    for ext in IMAGE_EXTS:
        paths.extend(glob.glob(os.path.join(folder, f"*{ext}")))
        paths.extend(glob.glob(os.path.join(folder, f"*{ext.upper()}")))
    return sorted(set(paths))


@dataclass
class PipelineResult:
    scores: List[PhotoScore]
    selected: List[PhotoScore]
    detector_backend: str
    manifest: Optional[dict] = None

    def report(self) -> Dict[str, object]:
        return {
            "detector_backend": self.detector_backend,
            "num_scored": len(self.scores),
            "num_selected": len(self.selected),
            "ranking": [s.summary() for s in self.scores],
            "selected": [s.path for s in self.selected],
            "render": self.manifest,
        }


class PhotoVideoPipeline:
    def __init__(self, detector: Optional[SubjectDetector] = None,
                 render_config: Optional[RenderConfig] = None):
        self.detector = detector if detector is not None else SubjectDetector()
        self.renderer = SlideshowRenderer(render_config)

    def score_folder(self, folder: str) -> List[PhotoScore]:
        paths = find_images(folder)
        return self.score_paths(paths)

    def score_paths(self, paths: Sequence[str]) -> List[PhotoScore]:
        scored: List[PhotoScore] = []
        for p in paths:
            img = cv2.imread(p, cv2.IMREAD_COLOR)
            if img is None:
                continue
            scored.append(score_image(img, p, detector=self.detector))
        scored.sort(key=lambda s: s.score, reverse=True)
        return scored

    def run(self, folder: str, out_path: str, top_k: Optional[int] = None,
            min_score: float = 0.0) -> PipelineResult:
        scores = self.score_folder(folder)
        selected = [s for s in scores if s.score >= min_score]
        if top_k is not None:
            selected = selected[:top_k]

        manifest = None
        if selected:
            manifest = self.renderer.render([s.path for s in selected], out_path)

        return PipelineResult(
            scores=scores,
            selected=selected,
            detector_backend=self.detector.backend_detail or self.detector.backend,
            manifest=manifest,
        )
