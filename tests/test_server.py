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
