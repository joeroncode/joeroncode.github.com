import numpy as np

from photo_video.scoring.detector import (Detection, SubjectDetector, _iou,
                                          _nms)
from photo_video.scoring.scorer import _content_score, score_image


def test_detector_initialises_some_backend():
    det = SubjectDetector()
    # In any environment at least the OpenCV fallback must be available.
    assert det.backend in ("yolov8", "opencv")
    assert det.backend_detail


def test_detector_runs_on_blank_image():
    det = SubjectDetector()
    dets = det.detect(np.zeros((240, 320, 3), dtype=np.uint8))
    # A blank frame should yield no confident subjects.
    assert isinstance(dets, list)


def test_iou_and_nms():
    a = Detection("person", 0.9, 0, 0, 10, 10)
    b = Detection("person", 0.8, 1, 1, 11, 11)   # heavy overlap with a
    c = Detection("person", 0.7, 100, 100, 110, 110)  # disjoint
    assert _iou(a, b) > 0.5
    assert _iou(a, c) == 0.0
    kept = _nms([a, b, c], thr=0.45)
    assert a in kept and c in kept and b not in kept


def test_content_score_prefers_centered_large_subject():
    w, h = 200, 200
    centered_big = [Detection("person", 0.9, 50, 50, 150, 150)]
    tiny_corner = [Detection("person", 0.9, 0, 0, 20, 20)]
    assert _content_score(centered_big, w, h) > _content_score(tiny_corner, w, h)
    assert _content_score([], w, h) == 0.0


def test_score_image_composition(sharp_image):
    det = SubjectDetector()
    ps = score_image(sharp_image, "sharp.png", detector=det)
    assert 0.0 <= ps.score <= 1.0
    assert ps.width == sharp_image.shape[1]
    assert ps.metrics.sharpness_score > 0.5
