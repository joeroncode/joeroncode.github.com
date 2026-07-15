import io

import cv2
import numpy as np
import pytest

from photo_video.server.app import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PV_JOB_DIR", str(tmp_path))
    app.config.update(TESTING=True)
    with app.test_client() as c:
        yield c


def _png_bytes(color=(0, 128, 255), h=120, w=160):
    img = np.full((h, w, 3), color, dtype=np.uint8)
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return io.BytesIO(buf.tobytes())


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.get_json()["status"] == "ok"
    assert r.get_json()["detector_backend"] in ("yolov8", "opencv")


def test_score_requires_images(client):
    assert client.post("/score").status_code == 400


def test_score_ranks(client):
    data = {"images": [(_png_bytes(), "a.png"), (_png_bytes(), "b.png")]}
    r = client.post("/score", data=data, content_type="multipart/form-data")
    assert r.status_code == 200
    body = r.get_json()
    assert body["count"] == 2
    assert len(body["ranking"]) == 2


def test_pipeline_and_download(client):
    data = {
        "images": [(_png_bytes((255, 0, 0)), "a.png"),
                   (_png_bytes((0, 255, 0)), "b.png"),
                   (_png_bytes((0, 0, 255)), "c.png")],
        "top_k": "2", "width": "160", "height": "90", "fps": "12",
    }
    r = client.post("/pipeline", data=data,
                    content_type="multipart/form-data")
    assert r.status_code == 201
    job = r.get_json()
    assert job["render"]["num_photos"] == 2
    assert job["render"]["frames"] > 0

    dl = client.get(job["download_url"])
    assert dl.status_code == 200
    assert dl.mimetype == "video/mp4"
    assert len(dl.data) == job["render"]["bytes"]


def test_download_unknown_job(client):
    assert client.get("/download/nope").status_code == 404


def test_samples_list_and_fetch(client):
    r = client.get("/samples")
    # 200 with a non-empty list, or 503 if scikit-image isn't installed.
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        imgs = r.get_json()["images"]
        assert imgs and all(u.startswith("/samples/") for u in imgs)
        first = client.get(imgs[0])
        assert first.status_code == 200
        assert first.mimetype.startswith("image/")
        assert client.get("/samples/../app.py").status_code in (404, 400)


def test_index_serves_web_ui(client):
    r = client.get("/")
    assert r.status_code == 200
    assert b"Reel" in r.data


def test_pwa_assets(client):
    assert client.get("/manifest.webmanifest").status_code == 200
    sw = client.get("/sw.js")
    assert sw.status_code == 200
    assert "javascript" in sw.mimetype
    # assetlinks 404s until PV_ASSETLINKS is configured
    assert client.get("/.well-known/assetlinks.json").status_code == 404


def test_score_weights_change_ranking(client):
    # A flat grey frame (no subject, low colour) vs a vivid one.
    grey = np.full((120, 160, 3), 128, dtype=np.uint8)
    hsv = np.zeros((120, 160, 3), np.uint8)
    hsv[..., 0] = (np.mgrid[0:120, 0:160][1] % 180).astype(np.uint8)
    hsv[..., 1] = 255; hsv[..., 2] = 220
    vivid = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

    def enc(a):
        ok, b = cv2.imencode(".png", a); return io.BytesIO(b.tobytes())

    data = {
        "images": [(enc(grey), "grey.png"), (enc(vivid), "vivid.png")],
        "content": "0", "sharpness": "0", "exposure": "0",
        "contrast": "0", "colorfulness": "100",
    }
    r = client.post("/score", data=data, content_type="multipart/form-data")
    assert r.status_code == 200
    body = r.get_json()
    assert body["weights"]["colorfulness"] == 1.0
    # With colour weighted fully, the vivid image ranks first.
    assert body["ranking"][0]["path"] == "vivid.png"
