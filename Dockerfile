# Combined backend + web UI in one container.
#
# Lean by default: OpenCV detector, no torch/YOLO (its COCO weights aren't
# fetchable in many networks anyway). Enable YOLO at build time with:
#   docker build --build-arg WITH_YOLO=1 -t reel .
FROM python:3.11-slim

ARG WITH_YOLO=0
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PV_JOB_DIR=/data/jobs

# OpenCV runtime needs libGL and libglib; ffmpeg libs help video muxing.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt gunicorn \
    && if [ "$WITH_YOLO" = "1" ]; then pip install --no-cache-dir ultralytics; fi

COPY photo_video/ ./photo_video/
COPY wsgi.py ./

RUN mkdir -p /data/jobs
EXPOSE 8000

# 2 workers, generous timeout for render jobs, warmed via wsgi import.
CMD ["gunicorn", "wsgi:app", "--bind", "0.0.0.0:8000", \
     "--workers", "2", "--threads", "4", "--timeout", "180"]
