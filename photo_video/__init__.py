"""Photo-scoring and video-render backend.

An end-to-end pipeline that:
  1. Scores photos on technical quality (sharpness, exposure, contrast,
     colorfulness) using OpenCV, and on subject content using a YOLO
     object detector.
  2. Ranks the photos by a weighted composite score.
  3. Renders the best photos into a video slideshow (Ken Burns pan/zoom
     plus crossfade transitions) with OpenCV's VideoWriter.

The whole thing is exposed through a small HTTP backend in
``photo_video.server``.
"""

__version__ = "1.0.0"
