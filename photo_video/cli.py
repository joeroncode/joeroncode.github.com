"""Command-line entry point for the photo → video pipeline.

Examples
--------
    python -m photo_video score  photo_video/data/sample
    python -m photo_video render photo_video/data/sample -o output/out.mp4 -k 5
    python -m photo_video serve  --port 8000
"""

from __future__ import annotations

import argparse
import json
import sys

from .pipeline import PhotoVideoPipeline, find_images
from .render import RenderConfig
from .scoring import SubjectDetector, score_path


def _cmd_score(args) -> int:
    det = SubjectDetector()
    paths = find_images(args.folder)
    if not paths:
        print(f"no images found in {args.folder}", file=sys.stderr)
        return 1
    scores = [score_path(p, detector=det) for p in paths]
    scores.sort(key=lambda s: s.score, reverse=True)
    print(json.dumps({
        "detector_backend": det.backend_detail,
        "ranking": [s.summary() for s in scores],
    }, indent=2))
    return 0


def _cmd_render(args) -> int:
    cfg = RenderConfig(width=args.width, height=args.height, fps=args.fps,
                       seconds_per_photo=args.seconds,
                       crossfade_seconds=args.crossfade)
    pipe = PhotoVideoPipeline(render_config=cfg)
    res = pipe.run(args.folder, args.output, top_k=args.top_k,
                   min_score=args.min_score)
    print(json.dumps(res.report(), indent=2))
    return 0 if res.manifest else 2


def _cmd_serve(args) -> int:
    from .server.app import app
    app.run(host=args.host, port=args.port)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="photo_video",
                                description="Photo scoring + video render")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("score", help="score & rank a folder of photos")
    s.add_argument("folder")
    s.set_defaults(func=_cmd_score)

    r = sub.add_parser("render", help="score, rank and render a slideshow")
    r.add_argument("folder")
    r.add_argument("-o", "--output", default="output/slideshow.mp4")
    r.add_argument("-k", "--top-k", type=int, default=None)
    r.add_argument("--min-score", type=float, default=0.0)
    r.add_argument("--width", type=int, default=1280)
    r.add_argument("--height", type=int, default=720)
    r.add_argument("--fps", type=int, default=30)
    r.add_argument("--seconds", type=float, default=2.5)
    r.add_argument("--crossfade", type=float, default=0.6)
    r.set_defaults(func=_cmd_render)

    v = sub.add_parser("serve", help="run the HTTP backend")
    v.add_argument("--host", default="127.0.0.1")
    v.add_argument("--port", type=int, default=8000)
    v.set_defaults(func=_cmd_serve)

    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
