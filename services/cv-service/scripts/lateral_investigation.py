"""Investigation tool for the 2026-09-10 head_stability redesign direction
(decompose head movement relative to the stance line into forward/lateral
components) -- NOT wired into the live pipeline. app/services/pose.py's
FrameSample only keeps the x coordinate; this extracts x AND z to test the
decomposition against real footage before any of it touches production.

Includes MIN_RELIABLE_STANCE_LINE_M, the analog of weight_transfer's
MIN_RELIABLE_BASE_WIDTH_M -- added now per instruction, even though no real
clip tested so far has come close to triggering it.

Also reports a Z-reliability diagnostic: hip width and ankle-to-ankle
(stance) width are both physically ~constant through a clip (bones don't
change length), so their frame-to-frame jitter is a real, checkable signal
for how much noisier adding the z coordinate makes an already-trusted x-only
measurement. MediaPipe's Landmark only exposes one visibility/presence pair
per 3D point -- there is no per-axis confidence to read directly, so this
indirect internal-consistency check is the available option.

Usage:
  python scripts/lateral_investigation.py clip1.mov clip2.mov --batting-hand right
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2  # noqa: E402
import mediapipe as mp  # noqa: E402
from mediapipe.tasks.python import vision  # noqa: E402
from mediapipe.tasks.python.core.base_options import BaseOptions  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.pose import (  # noqa: E402
    BASELINE_FRACTION,
    LANDMARK_MIN_SCORE,
    LEFT_ANKLE,
    LEFT_HIP,
    NOSE,
    RIGHT_ANKLE,
    RIGHT_HIP,
    ROTATE_CODE_BY_DEGREES,
    _front_back_attrs,
    _sample_step,
)

# Same floor weight_transfer uses for its x-only base width (a real cricket
# stance is normally tens of centimeters wide). The full x-z stance vector
# is >= the x-only distance by construction (hypotenuse >= a leg), so this
# can never trigger on a clip that already passes weight_transfer's floor --
# it only catches the NEW failure mode this redesign introduces: a stance
# vector whose direction (not just magnitude) can't be trusted because both
# components are tiny or ambiguous.
MIN_RELIABLE_STANCE_LINE_M = 0.05


def landmark_ok(lm) -> bool:
    return lm.visibility > LANDMARK_MIN_SCORE and lm.presence > LANDMARK_MIN_SCORE


def extract_full_samples(video_path: str) -> list[dict]:
    options = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=settings.pose_model_path),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
    )
    cap = cv2.VideoCapture(video_path)
    source_fps = cap.get(cv2.CAP_PROP_FPS)
    step = _sample_step(source_fps)
    rotate_code = ROTATE_CODE_BY_DEGREES.get(int(cap.get(cv2.CAP_PROP_ORIENTATION_META)))
    samples = []
    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        index = 0
        while True:
            ok, frame_bgr = cap.read()
            if not ok:
                break
            if index % step == 0:
                if rotate_code is not None:
                    frame_bgr = cv2.rotate(frame_bgr, rotate_code)
                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
                timestamp_ms = int((index / (source_fps or 30.0)) * 1000)
                result = landmarker.detect_for_video(mp_image, timestamp_ms)
                if result.pose_world_landmarks:
                    lm = result.pose_world_landmarks[0]
                    samples.append(
                        {
                            "nose": (lm[NOSE].x, lm[NOSE].z, landmark_ok(lm[NOSE])),
                            "left_hip": (lm[LEFT_HIP].x, lm[LEFT_HIP].z, landmark_ok(lm[LEFT_HIP])),
                            "right_hip": (
                                lm[RIGHT_HIP].x,
                                lm[RIGHT_HIP].z,
                                landmark_ok(lm[RIGHT_HIP]),
                            ),
                            "left_ankle": (
                                lm[LEFT_ANKLE].x,
                                lm[LEFT_ANKLE].z,
                                landmark_ok(lm[LEFT_ANKLE]),
                            ),
                            "right_ankle": (
                                lm[RIGHT_ANKLE].x,
                                lm[RIGHT_ANKLE].z,
                                landmark_ok(lm[RIGHT_ANKLE]),
                            ),
                        }
                    )
            index += 1
    cap.release()
    return samples


def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


def investigate(video_path: str, batting_hand: str = "right") -> dict:
    front, back = _front_back_attrs(batting_hand)
    samples = extract_full_samples(video_path)

    def hips_ok(s):
        return s["left_hip"][2] and s["right_hip"][2]

    valid = [s for s in samples if s["nose"][2] and hips_ok(s)]
    combined = [s for s in valid if s[f"{front}_ankle"][2] and s[f"{back}_ankle"][2]]

    row = {"video": Path(video_path).name, "combined_frames": len(combined)}
    if len(combined) < 5:
        row["error"] = f"insufficient combined detection ({len(combined)} frames)"
        return row

    baseline_count = max(1, round(len(combined) * BASELINE_FRACTION))
    baseline = combined[:baseline_count]

    def ankle_xz(s, side):
        return s[f"{side}_ankle"][0], s[f"{side}_ankle"][1]

    bfx, bfz = (sum(v) / len(baseline) for v in zip(*[ankle_xz(s, front) for s in baseline]))
    bbx, bbz = (sum(v) / len(baseline) for v in zip(*[ankle_xz(s, back) for s in baseline]))

    stance_vec = (bfx - bbx, bfz - bbz)
    stance_length = math.hypot(*stance_vec)
    row["stance_line_length_m"] = round(stance_length, 4)
    row["stance_line_x_only_m"] = round(abs(bfx - bbx), 4)

    if stance_length < MIN_RELIABLE_STANCE_LINE_M:
        row["error"] = (
            f"degenerate stance line ({stance_length:.3f}m < {MIN_RELIABLE_STANCE_LINE_M}m floor)"
        )
        return row

    unit_forward = (stance_vec[0] / stance_length, stance_vec[1] / stance_length)
    unit_lateral = (-unit_forward[1], unit_forward[0])

    def hip_mid_xz(s):
        lx, lz, _ = s["left_hip"]
        rx, rz, _ = s["right_hip"]
        return (lx + rx) / 2, (lz + rz) / 2

    def head_rel_xz(s):
        nx, nz, _ = s["nose"]
        hx, hz = hip_mid_xz(s)
        return nx - hx, nz - hz

    def dot(a, b):
        return a[0] * b[0] + a[1] * b[1]

    forward_series = [dot(head_rel_xz(s), unit_forward) for s in combined]
    lateral_series = [dot(head_rel_xz(s), unit_lateral) for s in combined]
    baseline_forward = _mean(forward_series[:baseline_count])
    baseline_lateral = _mean(lateral_series[:baseline_count])

    row["peak_forward_cm"] = round(max(abs(v - baseline_forward) for v in forward_series) * 100, 2)
    row["peak_lateral_cm"] = round(max(abs(v - baseline_lateral) for v in lateral_series) * 100, 2)

    # Z-reliability diagnostic, take 3: take 2 compared raw stddev of the
    # ankle x/z-difference during the BASELINE_FRACTION (10%) window,
    # correctly avoiding take 1's hypotenuse blind spot -- but batch 1
    # (2026-09-11) showed BASELINE_FRACTION gives just 1-2 frames on
    # several shorter clips, making that stddev statistically meaningless
    # (1 frame's "stddev" is 0 by definition). Widened to a fixed floor of
    # 5 frames -- still the earliest frames in the clip, so still the part
    # most likely to be genuine static stance, just enough of them to
    # estimate a variance from. Real production logic (the stance vector
    # used for the actual forward/lateral split above) is untouched --
    # this window is only used for this diagnostic.
    noise_window = combined[: max(baseline_count, min(5, len(combined)))]
    baseline_ankle_x_diff = [ankle_xz(s, front)[0] - ankle_xz(s, back)[0] for s in noise_window]
    baseline_ankle_z_diff = [ankle_xz(s, front)[1] - ankle_xz(s, back)[1] for s in noise_window]

    def _stddev_cm(values: list[float]) -> float:
        m = _mean(values)
        return math.sqrt(_mean([(v - m) ** 2 for v in values])) * 100

    row["baseline_ankle_x_diff_stddev_cm"] = round(_stddev_cm(baseline_ankle_x_diff), 2)
    row["baseline_ankle_z_diff_stddev_cm"] = round(_stddev_cm(baseline_ankle_z_diff), 2)
    row["baseline_ankle_z_diff_mean_cm"] = round(_mean(baseline_ankle_z_diff) * 100, 2)
    # A real gap found running batch 1 (2026-09-11): BASELINE_FRACTION (10%)
    # gives just 1-2 frames on several shorter clips, which makes the
    # stddev above statistically meaningless (a 1-frame "stddev" is 0 by
    # definition; 2 frames is barely better) -- surfaced explicitly rather
    # than silently trusting a noise estimate built on too little data.
    row["baseline_frame_count"] = len(noise_window)

    return row


COLUMNS = [
    "video",
    "combined_frames",
    "peak_forward_cm",
    "peak_lateral_cm",
    "stance_line_length_m",
    "stance_line_x_only_m",
    "baseline_ankle_x_diff_stddev_cm",
    "baseline_ankle_z_diff_stddev_cm",
    "baseline_ankle_z_diff_mean_cm",
    "baseline_frame_count",
    "error",
]


def print_table(rows: list[dict]) -> None:
    for r in rows:
        for c in COLUMNS:
            r.setdefault(c, "")
    widths = {c: max(len(c), max(len(str(r[c])) for r in rows)) for c in COLUMNS}
    print("  ".join(c.ljust(widths[c]) for c in COLUMNS))
    print("  ".join("-" * widths[c] for c in COLUMNS))
    for r in rows:
        print("  ".join(str(r[c]).ljust(widths[c]) for c in COLUMNS))


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("videos", nargs="+")
    parser.add_argument("--batting-hand", choices=["left", "right"], default="right")
    args = parser.parse_args()
    rows = [investigate(v, args.batting_hand) for v in args.videos]
    print_table(rows)


if __name__ == "__main__":
    main()
