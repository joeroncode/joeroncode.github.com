"""Video rendering with OpenCV.

Turns a ranked list of photos into an MP4 slideshow.  Each photo gets a
gentle Ken-Burns pan/zoom, and consecutive photos are joined with a
crossfade.  Everything is drawn with NumPy/OpenCV and written frame by
frame through ``cv2.VideoWriter`` so there is no external ffmpeg
dependency.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np


@dataclass
class RenderConfig:
    width: int = 1280
    height: int = 720
    fps: int = 30
    seconds_per_photo: float = 2.5
    crossfade_seconds: float = 0.6
    zoom: float = 0.12          # extra scale travelled during Ken Burns
    fourcc: str = "mp4v"        # broadly available MP4 codec
    background: Tuple[int, int, int] = (16, 16, 16)  # letterbox colour (BGR)

    @property
    def frame_size(self) -> Tuple[int, int]:
        return (self.width, self.height)


def _fit_letterbox(img: np.ndarray, w: int, h: int,
                   bg: Tuple[int, int, int]) -> np.ndarray:
    """Resize preserving aspect ratio, pad to (w, h) with a background."""
    ih, iw = img.shape[:2]
    scale = min(w / iw, h / ih)
    nw, nh = max(1, int(round(iw * scale))), max(1, int(round(ih * scale)))
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.full((h, w, 3), bg, dtype=np.uint8)
    x0, y0 = (w - nw) // 2, (h - nh) // 2
    canvas[y0:y0 + nh, x0:x0 + nw] = resized
    return canvas


def _ken_burns_frame(base: np.ndarray, w: int, h: int, t: float,
                     zoom: float, direction: int) -> np.ndarray:
    """One Ken-Burns frame at progress ``t`` in [0, 1].

    ``base`` is a letterboxed (h, w) image.  We zoom into an
    ever-shrinking crop window and resize it back up to (w, h).  ``t`` is
    eased with a smoothstep so the motion starts and stops softly.
    ``direction`` alternates the pan so successive photos don't all drift
    the same way.
    """
    ease = t * t * (3.0 - 2.0 * t)  # smoothstep
    cur_zoom = 1.0 + zoom * ease
    cw, ch = w / cur_zoom, h / cur_zoom

    # Pan from one side toward the other across the available slack.
    slack_x = w - cw
    slack_y = h - ch
    if direction >= 0:
        x0 = slack_x * ease
        y0 = slack_y * (1.0 - ease)
    else:
        x0 = slack_x * (1.0 - ease)
        y0 = slack_y * ease

    x0 = float(np.clip(x0, 0, max(0.0, slack_x)))
    y0 = float(np.clip(y0, 0, max(0.0, slack_y)))
    x1, y1 = x0 + cw, y0 + ch

    # Sub-pixel crop via affine warp for smooth motion.
    src = np.float32([[x0, y0], [x1, y0], [x0, y1]])
    dst = np.float32([[0, 0], [w, 0], [0, h]])
    M = cv2.getAffineTransform(src, dst)
    return cv2.warpAffine(base, M, (w, h), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_REPLICATE)


class SlideshowRenderer:
    def __init__(self, config: Optional[RenderConfig] = None):
        self.cfg = config or RenderConfig()

    def _photo_clip(self, base: np.ndarray, n_frames: int,
                    direction: int) -> List[np.ndarray]:
        cfg = self.cfg
        frames = []
        denom = max(1, n_frames - 1)
        for i in range(n_frames):
            t = i / denom
            frames.append(_ken_burns_frame(base, cfg.width, cfg.height, t,
                                           cfg.zoom, direction))
        return frames

    def render(self, image_paths: Sequence[str], out_path: str,
               images: Optional[Sequence[np.ndarray]] = None) -> dict:
        """Render a slideshow to ``out_path``.

        ``images`` may be supplied directly (BGR arrays) to avoid a second
        disk read; otherwise each path is loaded with cv2.imread.
        Returns a small manifest describing the output.
        """
        cfg = self.cfg
        if not image_paths and not images:
            raise ValueError("no images to render")

        os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".",
                    exist_ok=True)

        fourcc = cv2.VideoWriter_fourcc(*cfg.fourcc)
        writer = cv2.VideoWriter(out_path, fourcc, cfg.fps, cfg.frame_size)
        if not writer.isOpened():
            raise RuntimeError(
                f"cv2.VideoWriter failed to open {out_path} "
                f"(codec {cfg.fourcc})")

        per_photo = max(2, int(round(cfg.seconds_per_photo * cfg.fps)))
        xfade = max(0, int(round(cfg.crossfade_seconds * cfg.fps)))
        xfade = min(xfade, per_photo - 1)

        loader = list(images) if images is not None else [None] * len(image_paths)
        n = len(image_paths) if image_paths else len(images)

        total_frames = 0
        prev_tail: Optional[List[np.ndarray]] = None

        for idx in range(n):
            img = loader[idx]
            if img is None:
                img = cv2.imread(image_paths[idx], cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError(f"could not read image: {image_paths[idx]}")

            base = _fit_letterbox(img, cfg.width, cfg.height, cfg.background)
            clip = self._photo_clip(base, per_photo, direction=(-1) ** idx)

            if prev_tail is None:
                # First clip: write everything except the fade-out tail.
                body = clip[:len(clip) - xfade] if xfade else clip
                for f in body:
                    writer.write(f)
                    total_frames += 1
            else:
                head = clip[:xfade]
                # Crossfade the previous clip's tail into this clip's head.
                for k in range(xfade):
                    alpha = (k + 1) / (xfade + 1)
                    blended = cv2.addWeighted(prev_tail[k], 1.0 - alpha,
                                              head[k], alpha, 0.0)
                    writer.write(blended)
                    total_frames += 1
                # Remaining body of this clip (minus its own fade tail).
                body = clip[xfade:len(clip) - xfade] if xfade else clip[xfade:]
                for f in body:
                    writer.write(f)
                    total_frames += 1

            prev_tail = clip[len(clip) - xfade:] if xfade else None

        # Flush the final clip's tail (no successor to fade into).
        if prev_tail:
            for f in prev_tail:
                writer.write(f)
                total_frames += 1

        writer.release()

        return {
            "output": out_path,
            "num_photos": n,
            "frames": total_frames,
            "fps": cfg.fps,
            "duration_seconds": round(total_frames / cfg.fps, 2),
            "resolution": [cfg.width, cfg.height],
            "codec": cfg.fourcc,
            "bytes": os.path.getsize(out_path) if os.path.exists(out_path) else 0,
        }
