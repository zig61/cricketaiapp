#!/usr/bin/env python3
"""Batch-processes several batting videos through the current pipeline and
prints/writes a comparison table of head_stability and weight_transfer
values -- for empirically calibrating HEAD_STABILITY_REFERENCE_RANGE and
WEIGHT_TRANSFER_REFERENCE_RANGE (coordinator-api's diagnose.ts) against real
footage, since no published research gives usable numeric thresholds for
either metric as currently defined (2026-09-09 literature review).

This script does NOT propose new ranges -- it only makes data collection
fast. Pair each row with your own plain-language assessment of whether that
shot looked technically sound, then compare the two once several clips are
in, before deciding on any new range.

Runs entirely locally against app.services.pose -- no network calls, no
upload/signed-URL dance, no coordinator-api or deployed cv-service involved.

Usage:
  python scripts/calibrate.py video1.mov video2.mov --batting-hand right
  python scripts/calibrate.py video1.mov:left video2.mov:right
  python scripts/calibrate.py *.mov --batting-hand right --out calibration.csv

Each video path may have an optional ":left" or ":right" suffix to override
--batting-hand for that one file (e.g. mixed footage of different players in
one batch). Run from services/cv-service/ (or anywhere, via absolute paths --
the script adds its own parent directory to sys.path either way).
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.pose import (  # noqa: E402
    InsufficientDetectionError,
    analyze_batting_video,
    classify_confidence,
)

COLUMNS = [
    ("video", "Video"),
    ("batting_hand", "Hand"),
    ("head_stability_cm", "Head (cm)"),
    ("head_stability_confidence", "Head conf"),
    ("head_stability_level", "Head lvl"),
    ("head_stability_isolated", "Isolated"),
    ("weight_transfer_pct", "Weight (%)"),
    ("weight_transfer_confidence", "Weight conf"),
    ("weight_transfer_level", "Weight lvl"),
    ("weight_transfer_skip_reason", "Weight skip reason"),
    ("error", "Error"),
]


def parse_video_arg(raw: str, default_hand: str | None) -> tuple[str, str | None]:
    """Splits an optional trailing ":left"/":right" off a video path."""
    if raw.count(":") >= 1:
        path, _, suffix = raw.rpartition(":")
        if suffix in ("left", "right"):
            return path, suffix
    return raw, default_hand


def process_one(path: str, batting_hand: str | None) -> dict:
    row = {key: "" for key, _ in COLUMNS}
    row["video"] = Path(path).name
    row["batting_hand"] = batting_hand or "(none)"

    if not Path(path).is_file():
        row["error"] = "file not found"
        return row

    try:
        result = analyze_batting_video(path, batting_hand)
    except InsufficientDetectionError as exc:
        row["error"] = (
            f"insufficient detection ({exc.frames_with_detection}/{exc.frame_count} frames)"
        )
        return row
    except (FileNotFoundError, ValueError) as exc:
        row["error"] = str(exc)
        return row

    hs = result.head_stability
    row["head_stability_cm"] = round(hs.value_cm, 2)
    row["head_stability_confidence"] = round(hs.confidence, 3)
    row["head_stability_level"] = classify_confidence(hs.confidence)
    row["head_stability_isolated"] = hs.isolated_from_weight_transfer

    if result.weight_transfer is not None:
        wt = result.weight_transfer
        row["weight_transfer_pct"] = round(wt.value_percent, 2)
        row["weight_transfer_confidence"] = round(wt.confidence, 3)
        row["weight_transfer_level"] = classify_confidence(wt.confidence)
    else:
        row["weight_transfer_skip_reason"] = result.weight_transfer_skip_reason or "unknown"

    return row


def print_table(rows: list[dict]) -> None:
    if not rows:
        print("(no videos processed)")
        return
    widths = {key: max(len(label), max(len(str(r[key])) for r in rows)) for key, label in COLUMNS}
    print("  ".join(label.ljust(widths[key]) for key, label in COLUMNS))
    print("  ".join("-" * widths[key] for key, _ in COLUMNS))
    for r in rows:
        print("  ".join(str(r[key]).ljust(widths[key]) for key, _ in COLUMNS))


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "videos", nargs="+", help="Video file paths, optionally suffixed :left or :right"
    )
    parser.add_argument(
        "--batting-hand",
        choices=["left", "right"],
        default=None,
        help="Default batting hand for videos without a per-file override",
    )
    parser.add_argument("--out", default=None, help="Also write results to this CSV path")
    args = parser.parse_args()

    rows = []
    for raw in args.videos:
        path, hand = parse_video_arg(raw, args.batting_hand)
        print(f"Processing {path}...", file=sys.stderr)
        rows.append(process_one(path, hand))

    print()
    print_table(rows)

    if args.out:
        with open(args.out, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=[key for key, _ in COLUMNS])
            writer.writeheader()
            writer.writerows(rows)
        print(f"\nWrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
