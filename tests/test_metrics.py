import numpy as np

from photo_video.scoring.metrics import compute_metrics


def test_sharp_beats_blurred(sharp_image, blurred_image):
    sharp = compute_metrics(sharp_image)
    blur = compute_metrics(blurred_image)
    assert sharp.sharpness > blur.sharpness
    assert sharp.sharpness_score > blur.sharpness_score


def test_dark_image_low_exposure(dark_image):
    m = compute_metrics(dark_image)
    assert m.brightness < 30
    assert m.exposure_score < 0.2


def test_colorful_scores_higher_than_gray(colorful_image):
    gray = np.full((256, 256, 3), 128, dtype=np.uint8)
    assert compute_metrics(colorful_image).colorfulness_score > \
        compute_metrics(gray).colorfulness_score


def test_scores_bounded():
    img = np.random.randint(0, 255, (128, 128, 3), dtype=np.uint8)
    m = compute_metrics(img)
    for v in (m.sharpness_score, m.exposure_score,
              m.contrast_score, m.colorfulness_score):
        assert 0.0 <= v <= 1.0


def test_empty_image_raises():
    import pytest
    with pytest.raises(ValueError):
        compute_metrics(np.zeros((0, 0, 3), dtype=np.uint8))
