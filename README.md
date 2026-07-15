# Photo-scoring pipeline & video-render backend

An end-to-end system that scores a pile of photos, ranks the best ones,
and renders them into a slideshow video — driven by OpenCV and (when
available) a YOLO object detector.

```
photos ──▶ [ score ] ──▶ [ rank ] ──▶ [ select top-K ] ──▶ [ render ] ──▶ slideshow.mp4
             │
             ├─ OpenCV quality metrics: sharpness, exposure, contrast, colorfulness
             └─ YOLO subject detection (→ "content" score)
```

## What it does

**1. Scoring (`photo_video/scoring`)** — every photo gets a composite
`0..1` score from:

| Signal        | How                                                        | Weight |
|---------------|------------------------------------------------------------|--------|
| Content       | subject size, centering & confidence from the detector     | 0.35   |
| Sharpness     | variance of the Laplacian (OpenCV)                         | 0.25   |
| Exposure      | mean luma, Gaussian-scored around mid-grey                 | 0.15   |
| Contrast      | luma standard deviation                                    | 0.15   |
| Colorfulness  | Hasler–Süsstrunk metric                                    | 0.10   |

**2. Ranking & selection (`photo_video/pipeline.py`)** — sorts by score,
optionally keeps the top-K above a minimum score.

**3. Rendering (`photo_video/render`)** — writes an MP4 with
`cv2.VideoWriter`: each photo is letterboxed to the target resolution,
given a smooth Ken-Burns pan/zoom, and crossfaded into the next. No
external ffmpeg needed.

**4. Backend (`photo_video/server`)** — a Flask service exposing the
pipeline over HTTP.

## The detector: YOLO with an OpenCV fallback

The primary subject detector is **Ultralytics YOLOv8**. It is used
automatically whenever its pretrained weights (`yolov8n.pt`) are present
or downloadable.

If the weights cannot be fetched — for example under a locked-down
network egress policy, which is the case in the sandbox this was built
in (GitHub / HuggingFace / PyTorch download hosts all return `403`) — the
detector transparently falls back to **OpenCV's own detectors**: Haar
cascades for faces plus a HOG pedestrian detector for people. These ship
inside the OpenCV wheel and need no network access, so the pipeline runs
end-to-end regardless. `GET /health` (and every response) reports which
backend is live.

To force real YOLO where the network allows it:

```bash
pip install ultralytics
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"   # caches weights
# or drop a yolov8n.pt into ./models/
```

## Install

```bash
pip install -r requirements.txt          # core + scikit-image (sample data)
pip install ultralytics                  # optional: enable the YOLO backend
```

> OpenCV must be a **4.x** build — `opencv-python-headless` 5.x drops the
> `objdetect` module (cascades / HOG) that the fallback detector uses.

## Usage

### Generate sample photos (real bundled images, no download)

```bash
python -m photo_video.data.make_samples photo_video/data/sample
```

### Command line

```bash
# Score & rank a folder, print JSON
python -m photo_video score photo_video/data/sample

# Score, pick the best 5, render a 720p slideshow
python -m photo_video render photo_video/data/sample -o output/slideshow.mp4 -k 5

# Run the HTTP backend + web UI
python -m photo_video serve --port 8000
# then open http://127.0.0.1:8000 in a browser
```

### Web UI

Serving the backend also serves a single-page front end at `/` (**Reel**):
drag in photos, press **Analyze** to score and rank them — each card shows the
composite score, the per-metric breakdown, and the detector's bounding boxes
drawn live on the photo — then **Render slideshow** to build and play the MP4.
It's plain HTML/CSS/JS (no build step) talking to the JSON API below, and it
lives in `photo_video/server/web/`. No photos handy? Hit **Try it with sample
photos** — the server generates the bundled demo set on demand (`GET /samples`)
and scores it in one click.

The UI is also an installable **PWA** (`manifest.webmanifest`, service worker,
maskable icons) — the basis for the Google Play wrapper described in
[`deploy/DEPLOY.md`](deploy/DEPLOY.md).

### Scoring lab (experiment & test)

The **Scoring lab** panel turns the app into a testbench: five sliders for the
signal weights (content / sharpness / exposure / contrast / color) plus a
detector-confidence slider. Flip on **re-rank live** and the ranking updates as
you drag — the same knobs are available on the API (`content`, `sharpness`,
`exposure`, `contrast`, `colorfulness`, `conf` form fields on `/score` and
`/pipeline`), so you can A/B a scoring profile before baking it in.

## Deploy

Front end and backend are one process, so deployment is a single unit. The
container reads `$PORT` and is tuned for **Google Cloud Run**:

```bash
docker compose up --build          # local -> http://localhost:8000

# Google Cloud Run (builds the Dockerfile via Cloud Build):
PROJECT=your-gcp-project ./deploy/cloudrun-deploy.sh
```

The image is lean by default (OpenCV detector, no PyTorch); build with
`--build-arg WITH_YOLO=1` to include YOLO. Once it's live over HTTPS, wrap the
PWA as an Android app for **Google Play** with `./deploy/build-twa.sh`
(Bubblewrap Trusted Web Activity). The full path — Cloud Run deploy, custom
domain, Bubblewrap, Digital Asset Links, Play submission — is in
[`deploy/DEPLOY.md`](deploy/DEPLOY.md).

### HTTP API

| Method & path        | Purpose                                             |
|----------------------|-----------------------------------------------------|
| `GET /health`        | liveness + active detector backend                  |
| `GET /`              | the **Reel** web UI (single-page app)               |
| `GET /samples`       | list bundled demo photos (generated on demand)      |
| `POST /score`        | rank uploaded `images`, return JSON                 |
| `POST /render`       | render uploaded `images` into a slideshow           |
| `POST /pipeline`     | score → select `top_k` → render                     |
| `GET /jobs/<id>`     | job manifest                                         |
| `GET /download/<id>` | download the rendered MP4                            |

```bash
# Score three photos
curl -s -X POST http://127.0.0.1:8000/score \
  -F images=@photo_video/data/sample/01_astronaut.jpg \
  -F images=@photo_video/data/sample/02_cat.jpg

# Full pipeline: best 5, then fetch the video
curl -s -X POST http://127.0.0.1:8000/pipeline \
  -F images=@photo_video/data/sample/01_astronaut.jpg \
  -F images=@photo_video/data/sample/03_coffee.jpg \
  -F top_k=5 -F width=1280 -F height=720
# -> {"download_url": "/download/<id>", ...}
curl -s http://127.0.0.1:8000/download/<id> -o slideshow.mp4
```

## Tests

```bash
pip install pytest
python -m pytest tests/ -q
```

Covers the quality metrics, detector fallback + NMS, content scoring, the
video renderer (asserting the MP4 decodes with the expected frame count),
and every HTTP endpoint.

## Layout

```
photo_video/
  scoring/
    metrics.py     OpenCV quality metrics
    detector.py    YOLO primary + OpenCV Haar/HOG fallback
    scorer.py      composite score
  render/
    video.py       Ken-Burns + crossfade slideshow (cv2.VideoWriter)
  server/app.py    Flask backend
  pipeline.py      score → rank → render orchestration
  cli.py           `python -m photo_video {score,render,serve}`
  data/            sample-photo generator (uses scikit-image)
tests/             pytest suite
```
