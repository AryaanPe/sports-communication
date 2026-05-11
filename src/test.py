#!/usr/bin/env python3
"""Run your trained YOLO detector on a video with tracking (ByteTrack by default).

BoT-SORT: pass Ultralytics' bundled config or a copy you edit, e.g.
  python test.py input.mp4 --tracker botsort.yaml
  python test.py input.mp4 --tracker cfg/trackers/botsort_recovery.yaml

Usage:
  python test.py input.mp4
  python test.py input.mp4 -o out_overlay.mp4 --conf 0.35
  python test.py input.mp4 --no-track
  python test.py input.mp4 --tracker botsort.yaml
  python test.py input.mp4 -w path/to/other_run/weights
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path
import json

from ultralytics import YOLO

VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v", ".jpg", ".jpeg", ".png"}

DEFAULT_WEIGHTS = "runs/train/aisports_yolov8x8/weights/best.pt"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run YOLO detection on a video; default is tracking + your custom weights."
    )
    parser.add_argument(
        "video",
        type=str,
        help="Path to input video.",
    )
    parser.add_argument(
        "--weights",
        "-w",
        type=str,
        default=DEFAULT_WEIGHTS,
        help=(
            "Checkpoint file (.pt/.pth) or a weights directory "
            f"(default: {DEFAULT_WEIGHTS}; directory → best.pt / last.pt)."
        ),
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default="",
        help="Output video path. If omitted, saved under runs/detect with auto name.",
    )
    parser.add_argument(
        "--project",
        type=str,
        default="runs/detect",
        help="Project folder when --output is not set (default: runs/detect).",
    )
    parser.add_argument(
        "--name",
        type=str,
        default="predict",
        help="Run name folder when --output is not set (default: predict).",
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=640,
        help="Inference size (default: 640).",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="Confidence threshold (default: 0.25).",
    )
    parser.add_argument(
        "--device",
        type=str,
        default="0",
        help='Device: "0", "cpu", etc. (default: 0).',
    )
    parser.add_argument(
        "--line-width",
        type=int,
        default=2,
        help="Bounding box line width (default: 2).",
    )
    parser.add_argument(
        "--vid-stride",
        type=int,
        default=1,
        help="Process every Nth frame (1 = all frames).",
    )
    parser.add_argument(
        "--no-track",
        action="store_true",
        help="Detection only (no persistent track IDs). Default runs with tracking.",
    )
    parser.add_argument(
        "--tracker",
        type=str,
        default="bytetrack.yaml",
        help=(
            "Tracker YAML: bundled names bytetrack.yaml / botsort.yaml, or a path "
            "(e.g. cfg/trackers/botsort_recovery.yaml). BoT-SORT needs tracker_type: botsort in the file."
        ),
    )
    return parser.parse_args()


def resolve_path(script_dir: Path, p: str) -> Path:
    path = Path(p).expanduser()
    if not path.is_absolute():
        path = (script_dir / path).resolve()
    return path


def resolve_weights_file(script_dir: Path, weights: str) -> Path:
    """Resolve --weights to a single checkpoint file (dir → best.pt, else last.pt)."""
    path = resolve_path(script_dir, weights)
    if path.is_dir():
        for name in ("best.pt", "last.pt", "best.pth", "last.pth"):
            candidate = path / name
            if candidate.is_file():
                return candidate
        raise FileNotFoundError(
            f"No checkpoint found in weights directory: {path}\n"
            "Expected best.pt or last.pt (or .pth)."
        )
    return path


def weights_for_yolo(script_dir: Path, weights: str) -> str:
    """Absolute path to a local checkpoint, or a bare *.pt name for Ultralytics to fetch."""
    expanded = Path(weights).expanduser()
    if expanded.is_absolute():
        path = expanded.resolve()
        if path.is_dir():
            path = resolve_weights_file(script_dir, str(path))
        if not path.is_file():
            raise FileNotFoundError(
                f"Weights not found: {path}\n"
                "Pass an existing .pt/.pth file or weights directory."
            )
        return str(path)

    normalized = weights.replace("\\", "/")
    if "/" in normalized:
        path = resolve_weights_file(script_dir, weights)
        if not path.is_file():
            raise FileNotFoundError(
                f"Weights not found: {path}\n"
                f"Pass --weights to a .pt file or directory (default: {DEFAULT_WEIGHTS})."
            )
        return str(path)

    local = (script_dir / weights).resolve()
    if local.is_file():
        return str(local)
    if weights.endswith((".pt", ".pth")):
        return weights
    raise FileNotFoundError(
        f"Weights not found: {local}\n"
        "Use a project-relative path or a pretrained Ultralytics .pt name."
    )


def resolve_tracker(script_dir: Path, tracker: str) -> str:
    """Use a local .yaml if present under script_dir; otherwise pass through (built-in name)."""
    p = Path(tracker).expanduser()
    if p.is_file():
        return str(p.resolve())
    cand = (script_dir / tracker).resolve()
    if cand.is_file():
        return str(cand)
    return tracker


def find_saved_video(save_dir: Path) -> Path | None:
    """Ultralytics may save as .mp4 or .avi depending on build; pick the newest match."""
    candidates = []
    for ext in sorted(VIDEO_EXTENSIONS):
        for candidate in save_dir.glob(f"*{ext}"):
            candidates.append(candidate)
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def main() -> None:
    args = parse_args()
    script_dir = Path(__file__).resolve().parent

    video_path = resolve_path(script_dir, args.video)
    if not video_path.is_file():
        raise FileNotFoundError(f"Video not found: {video_path}")

    model = YOLO(weights_for_yolo(script_dir, args.weights))

    run_kw: dict = {
        "source": str(video_path),
        "save": True,
        "conf": args.conf,
        "imgsz": args.imgsz,
        "device": args.device,
        "line_width": args.line_width,
        "vid_stride": args.vid_stride,
        "exist_ok": True
    }

    if args.output:
        out_path = Path(args.output).expanduser()
        if not out_path.is_absolute():
            out_path = (script_dir / out_path).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        run_kw["project"] = str(out_path.parent)
        run_kw["name"] = out_path.stem
    else:
        run_kw["project"] = args.project
        run_kw["name"] = args.name

    if args.no_track:
        results = model.predict(**run_kw)
        detections = []

        for r in results:
            for box in r.boxes.data.tolist():
                detections.append({
                    "x1": box[0], "y1": box[1],
                    "x2": box[2], "y2": box[3],
                    "conf": box[4],
                    "class": int(box[5])
                })
        
        print(f"DETECTION_DATA:{json.dumps(detections)}")
    else:
        model.track(
            **run_kw,
            persist=True,
            tracker=resolve_tracker(script_dir, args.tracker),
        )

    save_dir = Path(model.predictor.save_dir)
    produced = find_saved_video(save_dir)

    if produced is None:
        raise RuntimeError(
            f"No output video found under {save_dir}. "
            "Check Ultralytics version and video codec support."
        )

    elif args.output:
        final = Path(args.output).expanduser()
        if not final.is_absolute():
            final = (script_dir / final).resolve()
        if produced.resolve() != final.resolve():
            shutil.move(str(produced), str(final))
            # print(f"Saved: {final}")
        else:
            print(f"Saved: {produced}")
    else:
        print(f"Saved: {produced}")


if __name__ == "__main__":
    main()
