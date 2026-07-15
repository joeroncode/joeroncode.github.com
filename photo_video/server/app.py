"""HTTP backend for the photo-scoring / video-render pipeline.

Endpoints
---------
GET  /health              -> liveness + which detector backend is active
GET  /                    -> tiny HTML upload form for manual testing
POST /score               -> score uploaded images, return ranked JSON
POST /render              -> render uploaded images into a slideshow video
POST /pipeline            -> score, rank, select top-k, then render
GET  /jobs/<id>           -> job manifest / status
GET  /download/<id>       -> download the rendered MP4

Images are sent as multipart/form-data under the field name ``images``
(repeatable).  The detector is created once at startup and reused.
"""

from __future__ import annotations

import io
import os
import tempfile
import time
import uuid
from collections import deque
from functools import wraps
from threading import Lock
from typing import List, Tuple

import cv2
import numpy as np
from flask import Flask, jsonify, request, send_file, send_from_directory

from ..render import RenderConfig, SlideshowRenderer
from ..scoring import SubjectDetector, score_image
from ..scoring.scorer import DEFAULT_WEIGHTS


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


WEB_DIR = os.path.join(os.path.dirname(__file__), "web")
SAMPLE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                          "data", "sample")

# Abuse guards (all overridable via env). A public deployment spends real
# compute per request, so cap how much any one caller can ask for.
MAX_IMAGES = _env_int("PV_MAX_IMAGES", 40)          # images per request
MAX_UPLOAD_MB = _env_int("PV_MAX_UPLOAD_MB", 64)     # total request body
RATE_LIMIT = _env_int("PV_RATE_LIMIT", 30)          # requests per window (0=off)
RATE_WINDOW = _env_int("PV_RATE_WINDOW", 60)         # window seconds

app = Flask(__name__, static_folder=WEB_DIR, static_url_path="/assets")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

# Shared, lazily-built detector (loading YOLO/cascades once is expensive).
_DETECTOR: SubjectDetector | None = None
# Where rendered videos live for later download.
JOB_DIR = os.environ.get("PV_JOB_DIR", os.path.join(tempfile.gettempdir(),
                                                    "pv_jobs"))
os.makedirs(JOB_DIR, exist_ok=True)
_JOBS: dict[str, dict] = {}


class _RateLimiter:
    """Fixed-window per-key limiter. Per-instance (fine for basic abuse
    protection on Cloud Run); swap for Redis if you need it global."""

    def __init__(self, limit: int, window: int):
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque] = {}
        self._lock = Lock()

    def check(self, key: str):
        if self.limit <= 0:
            return True, 0
        now = time.time()
        cutoff = now - self.window
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= self.limit:
                return False, int(self.window - (now - q[0])) + 1
            q.append(now)
            if len(self._hits) > 4096:      # opportunistic prune
                for k in [k for k, v in self._hits.items() if not v]:
                    self._hits.pop(k, None)
        return True, 0


_RATE = _RateLimiter(RATE_LIMIT, RATE_WINDOW)


def _client_ip() -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    return fwd.split(",")[0].strip() if fwd else (request.remote_addr or "?")


def rate_limited(fn):
    """Throttle a heavy endpoint by client IP (skipped under TESTING)."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not app.config.get("TESTING"):
            ok, retry = _RATE.check(_client_ip())
            if not ok:
                resp = jsonify({"error": "Too many requests — please slow down."})
                resp.status_code = 429
                resp.headers["Retry-After"] = str(retry)
                return resp
        return fn(*args, **kwargs)
    return wrapper


def _too_many_images():
    """Return an error response if the request exceeds the image-count cap."""
    n = len(request.files.getlist("images"))
    if n > MAX_IMAGES:
        return jsonify({"error": f"Too many images — {n} sent, max {MAX_IMAGES}."}), 413
    return None


def get_detector() -> SubjectDetector:
    global _DETECTOR
    if _DETECTOR is None:
        _DETECTOR = SubjectDetector()
    return _DETECTOR


def _read_uploads() -> List[Tuple[str, np.ndarray]]:
    """Decode every uploaded image into (filename, BGR array)."""
    files = request.files.getlist("images")
    out: List[Tuple[str, np.ndarray]] = []
    for f in files:
        raw = f.read()
        if not raw:
            continue
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is not None:
            out.append((f.filename or f"upload_{len(out)}", img))
    return out


def _weights_from_request():
    """Optional per-request scoring weights, normalised to sum to 1.

    Reads content/sharpness/exposure/contrast/colorfulness form fields;
    returns None to fall back to the pipeline defaults when none are given.
    """
    from ..scoring.scorer import DEFAULT_WEIGHTS
    keys = ("content", "sharpness", "exposure", "contrast", "colorfulness")
    if not any(k in request.form for k in keys):
        return None
    raw = {}
    for k in keys:
        try:
            raw[k] = max(0.0, float(request.form.get(k, DEFAULT_WEIGHTS[k])))
        except (ValueError, TypeError):
            raw[k] = DEFAULT_WEIGHTS[k]
    total = sum(raw.values()) or 1.0
    return {k: v / total for k, v in raw.items()}


def _conf_from_request():
    try:
        return max(0.0, min(1.0, float(request.form["conf"])))
    except (KeyError, ValueError, TypeError):
        return None


def _score_all(images):
    """Score every image with the shared detector, honouring optional
    per-request weights and detector confidence from the form."""
    det = get_detector()
    conf = _conf_from_request()
    prev = det.conf
    if conf is not None:
        det.conf = conf
    weights = _weights_from_request()
    try:
        scores = [score_image(img, name, detector=det, weights=weights)
                  for name, img in images]
    finally:
        det.conf = prev
    scores.sort(key=lambda s: s.score, reverse=True)
    return det, scores, weights


def _render_config_from_request() -> RenderConfig:
    """Build a RenderConfig from optional form fields, with defaults."""
    form = request.form
    def num(key, cast, default):
        try:
            return cast(form[key])
        except (KeyError, ValueError, TypeError):
            return default
    return RenderConfig(
        width=num("width", int, 1280),
        height=num("height", int, 720),
        fps=num("fps", int, 30),
        seconds_per_photo=num("seconds_per_photo", float, 2.5),
        crossfade_seconds=num("crossfade_seconds", float, 0.6),
        zoom=num("zoom", float, 0.12),
    )


@app.get("/health")
def health():
    det = get_detector()
    return jsonify({
        "status": "ok",
        "detector_backend": det.backend,
        "detector_detail": det.backend_detail,
    })


@app.post("/score")
@rate_limited
def score():
    over = _too_many_images()
    if over:
        return over
    images = _read_uploads()
    if not images:
        return jsonify({"error": "no decodable images in 'images' field"}), 400
    det, scores, weights = _score_all(images)
    return jsonify({
        "detector_backend": det.backend_detail,
        "count": len(scores),
        "weights": weights or DEFAULT_WEIGHTS,
        "ranking": [s.summary() for s in scores],
    })


def _render_images(images, cfg, top_k=None, min_score=0.0):
    det, scores, weights = _score_all(images)
    selected = [s for s in scores if s.score >= min_score]
    if top_k is not None:
        selected = selected[:top_k]

    name_to_img = {name: img for name, img in images}
    sel_imgs = [name_to_img[s.path] for s in selected]

    job_id = uuid.uuid4().hex[:12]
    out_path = os.path.join(JOB_DIR, f"{job_id}.mp4")
    manifest = SlideshowRenderer(cfg).render(
        [s.path for s in selected], out_path, images=sel_imgs)

    job = {
        "job_id": job_id,
        "detector_backend": det.backend_detail,
        "weights": weights or DEFAULT_WEIGHTS,
        "selected": [s.path for s in selected],
        "ranking": [s.summary() for s in scores],
        "render": manifest,
        "download_url": f"/download/{job_id}",
    }
    _JOBS[job_id] = job
    return job


@app.post("/render")
@rate_limited
def render():
    over = _too_many_images()
    if over:
        return over
    images = _read_uploads()
    if not images:
        return jsonify({"error": "no decodable images in 'images' field"}), 400
    cfg = _render_config_from_request()
    job = _render_images(images, cfg)
    return jsonify(job), 201


@app.post("/pipeline")
@rate_limited
def pipeline():
    over = _too_many_images()
    if over:
        return over
    images = _read_uploads()
    if not images:
        return jsonify({"error": "no decodable images in 'images' field"}), 400
    cfg = _render_config_from_request()
    try:
        top_k = int(request.form.get("top_k", "0")) or None
    except ValueError:
        top_k = None
    try:
        min_score = float(request.form.get("min_score", "0"))
    except ValueError:
        min_score = 0.0
    job = _render_images(images, cfg, top_k=top_k, min_score=min_score)
    return jsonify(job), 201


@app.get("/jobs/<job_id>")
def job_status(job_id):
    job = _JOBS.get(job_id)
    if job is None:
        return jsonify({"error": "unknown job"}), 404
    return jsonify(job)


@app.get("/download/<job_id>")
def download(job_id):
    path = os.path.join(JOB_DIR, f"{job_id}.mp4")
    if not os.path.exists(path):
        return jsonify({"error": "unknown or expired job"}), 404
    return send_file(path, mimetype="video/mp4", as_attachment=True,
                     download_name=f"slideshow_{job_id}.mp4")


def _ensure_samples() -> List[str]:
    """Return sorted sample filenames, generating the set if it's missing."""
    exts = (".jpg", ".jpeg", ".png")
    have = sorted(f for f in os.listdir(SAMPLE_DIR)
                  if f.lower().endswith(exts)) if os.path.isdir(SAMPLE_DIR) else []
    if have:
        return have
    # Lazily build the bundled demo set (needs scikit-image).
    from ..data.make_samples import build_samples
    build_samples(SAMPLE_DIR)
    return sorted(f for f in os.listdir(SAMPLE_DIR)
                  if f.lower().endswith(exts))


@app.get("/samples")
@rate_limited
def samples():
    try:
        names = _ensure_samples()
    except Exception as exc:
        return jsonify({"error": f"sample set unavailable: {exc}"}), 503
    return jsonify({"images": [f"/samples/{n}" for n in names]})


@app.get("/samples/<path:name>")
def sample_file(name):
    if not os.path.isfile(os.path.join(SAMPLE_DIR, name)):
        return jsonify({"error": "unknown sample"}), 404
    return send_from_directory(SAMPLE_DIR, name)


@app.get("/sw.js")
def service_worker():
    # Served from root so its control scope covers the whole app.
    resp = send_file(os.path.join(WEB_DIR, "sw.js"), mimetype="application/javascript")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/manifest.webmanifest")
def manifest():
    return send_file(os.path.join(WEB_DIR, "manifest.webmanifest"),
                     mimetype="application/manifest+json")


@app.get("/.well-known/assetlinks.json")
def assetlinks():
    """Digital Asset Links for the Play/TWA wrapper.

    Point PV_ASSETLINKS at a JSON file containing your app's signing
    fingerprint to verify domain ownership (hides the Android URL bar).
    """
    path = os.environ.get("PV_ASSETLINKS")
    if not path or not os.path.isfile(path):
        return jsonify({"error": "assetlinks not configured"}), 404
    return send_file(path, mimetype="application/json")


@app.get("/privacy")
def privacy():
    return send_file(os.path.join(WEB_DIR, "privacy.html"))


@app.get("/")
def index():
    return send_file(os.path.join(WEB_DIR, "index.html"))


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Run the pipeline backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    # Build the detector once up front so the first request is fast (loading
    # YOLO — including any download retries — otherwise blocks it).
    det = get_detector()
    print(f"detector backend: {det.backend_detail}")
    print(f"serving on http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, threaded=True)


if __name__ == "__main__":
    main()
