import numpy as np
import pytest


@pytest.fixture
def sharp_image():
    """A high-contrast checkerboard: sharp, contrasty, mid-exposed."""
    tile = 16
    board = np.indices((256, 256)).sum(axis=0) // tile % 2
    gray = (board * 255).astype(np.uint8)
    return np.stack([gray, gray, gray], axis=-1)


@pytest.fixture
def blurred_image(sharp_image):
    import cv2
    return cv2.GaussianBlur(sharp_image, (0, 0), sigmaX=6)


@pytest.fixture
def dark_image():
    return np.full((256, 256, 3), 8, dtype=np.uint8)


@pytest.fixture
def colorful_image():
    yy, xx = np.mgrid[0:256, 0:256]
    import cv2
    hsv = np.zeros((256, 256, 3), np.uint8)
    hsv[..., 0] = (xx % 180).astype(np.uint8)
    hsv[..., 1] = 255
    hsv[..., 2] = 200
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
