"""Subject detection.

The primary detector is a YOLO model (Ultralytics YOLOv8).  It reports
the objects in a photo, which the scorer turns into a "content" score:
photos with prominent, well-placed subjects (people, animals, salient
objects) rank above empty or cluttered frames.

YOLO needs its pretrained weights (``yolov8n.pt``), which Ultralytics
hosts on GitHub.  When that download is reachable the YOLO backend is
used automatically.  When it is not (e.g. a locked-down egress policy),
the detector falls back to OpenCV's own object detectors — Haar cascades
for faces and a HOG pedestrian detector for people — which ship inside
the OpenCV wheel and need no network access.  Both back-ends emit the
same :class:`Detection` structure, so the rest of the pipeline does not
care which one ran.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Optional

import numpy as np


@dataclass
class Detection:
    """A single detected object in pixel coordinates."""

    label: str
    confidence: float
    # Bounding box, xyxy in pixels.
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def area(self) -> float:
        return max(0.0, self.x2 - self.x1) * max(0.0, self.y2 - self.y1)

    @property
    def cx(self) -> float:
        return 0.5 * (self.x1 + self.x2)

    @property
    def cy(self) -> float:
        return 0.5 * (self.y1 + self.y2)

    def as_dict(self) -> dict:
        return {
            "label": self.label,
            "confidence": round(self.confidence, 4),
            "box": [round(self.x1, 1), round(self.y1, 1),
                    round(self.x2, 1), round(self.y2, 1)],
        }


# Objects that make a photo "interesting" as a slideshow subject.
SALIENT_CLASSES = {
    "person", "face", "cat", "dog", "bird", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "bicycle", "motorcycle", "car",
    "boat", "airplane", "surfboard", "kite", "sports ball", "wine glass",
    "cake", "pizza", "potted plant", "teddy bear",
}


def _iou(a: Detection, b: Detection) -> float:
    ix1, iy1 = max(a.x1, b.x1), max(a.y1, b.y1)
    ix2, iy2 = min(a.x2, b.x2), min(a.y2, b.y2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    union = a.area + b.area - inter
    return inter / union if union > 0 else 0.0


def _nms(dets: List[Detection], thr: float = 0.45) -> List[Detection]:
    """Greedy non-maximum suppression across the merged detector output."""
    kept: List[Detection] = []
    for d in sorted(dets, key=lambda x: x.confidence, reverse=True):
        if all(_iou(d, k) < thr for k in kept):
            kept.append(d)
    return kept


class SubjectDetector:
    """Unified detector with a YOLO primary and an OpenCV fallback."""

    def __init__(self, model_path: str = "yolov8n.pt", conf: float = 0.25):
        self.conf = conf
        self.backend: str = "none"
        self.backend_detail: str = ""
        self._yolo = None
        self._face = None
        self._body = None
        self._hog = None
        self._model_path = model_path
        self._init_backend()

    def _resolve_weights(self) -> str:
        """Prefer a locally cached weights file if one exists."""
        if os.path.isfile(self._model_path):
            return self._model_path
        here = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        local = os.path.join(here, "models", os.path.basename(self._model_path))
        return local if os.path.isfile(local) else self._model_path

    def _init_backend(self) -> None:
        # 1. Try Ultralytics YOLO (downloads weights on first use).
        try:
            from ultralytics import YOLO  # type: ignore

            weights = self._resolve_weights()
            self._yolo = YOLO(weights)
            # Force weights to actually be present by touching the model.
            _ = self._yolo.names
            self.backend = "yolov8"
            self.backend_detail = f"ultralytics YOLO ({os.path.basename(weights)})"
            return
        except Exception as exc:  # weights unreachable / torch missing
            self._yolo = None
            self._yolo_error = f"{type(exc).__name__}: {exc}"

        # 2. Fallback: OpenCV built-in detectors (no download needed).
        try:
            import cv2

            casc = cv2.data.haarcascades
            self._face = cv2.CascadeClassifier(
                os.path.join(casc, "haarcascade_frontalface_default.xml"))
            self._body = cv2.CascadeClassifier(
                os.path.join(casc, "haarcascade_fullbody.xml"))
            self._hog = cv2.HOGDescriptor()
            self._hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
            self.backend = "opencv"
            self.backend_detail = "OpenCV Haar-cascade + HOG detectors"
        except Exception:  # pragma: no cover
            self.backend = "none"
            self.backend_detail = "no detector available"

    # -- detection ---------------------------------------------------------

    def detect(self, bgr: np.ndarray) -> List[Detection]:
        if self._yolo is not None:
            return self._detect_yolo(bgr)
        if self.backend == "opencv":
            return _nms(self._detect_opencv(bgr))
        return []

    def _detect_yolo(self, bgr: np.ndarray) -> List[Detection]:
        results = self._yolo.predict(bgr, conf=self.conf, verbose=False)
        out: List[Detection] = []
        for res in results:
            names = res.names
            boxes = res.boxes
            if boxes is None:
                continue
            for b in boxes:
                cls_id = int(b.cls[0])
                label = names.get(cls_id, str(cls_id))
                conf = float(b.conf[0])
                x1, y1, x2, y2 = (float(v) for v in b.xyxy[0].tolist())
                out.append(Detection(label, conf, x1, y1, x2, y2))
        return out

    def _detect_opencv(self, bgr: np.ndarray) -> List[Detection]:
        import cv2

        out: List[Detection] = []
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        # Faces (high-precision Haar cascade).
        faces = self._face.detectMultiScale(gray, scaleFactor=1.1,
                                            minNeighbors=5, minSize=(24, 24))
        for (x, y, w, h) in faces:
            out.append(Detection("face", 0.9, float(x), float(y),
                                 float(x + w), float(y + h)))

        # Full-body pedestrians (Haar cascade).
        bodies = self._body.detectMultiScale(gray, scaleFactor=1.05,
                                             minNeighbors=3, minSize=(40, 80))
        for (x, y, w, h) in bodies:
            out.append(Detection("person", 0.6, float(x), float(y),
                                 float(x + w), float(y + h)))

        # People via HOG + SVM (complementary to the cascade).
        rects, weights = self._hog.detectMultiScale(
            bgr, winStride=(8, 8), padding=(8, 8), scale=1.05)
        for (x, y, w, h), score in zip(rects, np.ravel(weights)):
            conf = float(1.0 / (1.0 + np.exp(-float(score))))
            if conf < self.conf:
                continue
            out.append(Detection("person", conf, float(x), float(y),
                                 float(x + w), float(y + h)))
        return out
