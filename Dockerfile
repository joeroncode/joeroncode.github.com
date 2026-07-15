# Combined backend + web UI in one container, tuned for Google Cloud Run.
#
# Lean by default: OpenCV detector, no torch/YOLO (its COCO weights aren't
# fetchable in many networks anyway). Enable YOLO at build time with:
#   docker build --build-arg WITH_YOLO=1 -t reel .
FROM python:3.11-slim

ARG WITH_YOLO=0
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # Cloud Run's filesystem is in-memory + ephemeral; keep jobs in /tmp.
    PV_JOB_DIR=/tmp/pv_jobs

# OpenCV runtime needs libGL and libglib.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt gunicorn \
    && if [ "$WITH_YOLO" = "1" ]; then pip install --no-cache-dir ultralytics; fi

COPY photo_video/ ./photo_video/
COPY wsgi.py ./

EXPOSE 8080

# Cloud Run injects $PORT (usually 8080); default to 8000 for local runs.
# One worker + threads keeps memory low and shares a single warmed detector.
CMD exec gunicorn wsgi:app \
      --bind "0.0.0.0:${PORT:-8000}" \
      --workers "${WEB_WORKERS:-1}" \
      --threads "${WEB_THREADS:-8}" \
      --timeout "${WEB_TIMEOUT:-180}"
