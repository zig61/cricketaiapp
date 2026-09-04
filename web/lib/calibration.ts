/**
 * Live side-on camera-angle check — pure geometry, no camera/React
 * involved, so it's directly unit-testable with hand-built landmark
 * inputs (same pattern as cv-service's compute_weight_transfer_from_samples).
 *
 * Uses the same MediaPipe world-landmark semantics (real-world meters,
 * hip-centered) the Python backend's real measurement relies on — this is
 * a live preview of the same geometry, not a separate heuristic that
 * could disagree with it.
 *
 * The ankle-to-shoulder-width RATIO (not a raw meter distance) is what's
 * classified: a true side-on stance spreads the ankles roughly as wide as
 * the shoulders on the camera's horizontal axis; a front-on stance
 * compresses that same separation toward zero (the exact failure mode
 * found on real footage — see pose.py's weight_transfer fix). A ratio is
 * robust to how far the camera actually is from the player; a raw-meters
 * threshold would need to know that distance.
 *
 * THRESHOLDS BELOW ARE A FIRST ESTIMATE, NOT VALIDATED against real
 * people — sized to separate a clearly-side-on stance from a clearly
 * front-on one in hand-built test data, same epistemic status as every
 * other threshold in this build (docs/08-coaching-engine.md §9). Expect
 * to retune once real players actually use this.
 */

export const LANDMARK_MIN_VISIBILITY = 0.5;
const RED_YELLOW_BOUNDARY = 0.3;
const YELLOW_GREEN_BOUNDARY = 0.6;

export interface CalibrationLandmark {
  x: number;
  visibility: number;
}

export interface CalibrationLandmarks {
  leftAnkle: CalibrationLandmark;
  rightAnkle: CalibrationLandmark;
  leftShoulder: CalibrationLandmark;
  rightShoulder: CalibrationLandmark;
}

export type CalibrationZone = "red" | "yellow" | "green";

export interface CalibrationResult {
  zone: CalibrationZone;
  percent: number;
  message: string;
  ratio: number | null;
}

function visible(landmark: CalibrationLandmark): boolean {
  return landmark.visibility > LANDMARK_MIN_VISIBILITY;
}

export function assessCalibrationFrame(landmarks: CalibrationLandmarks): CalibrationResult {
  const { leftAnkle, rightAnkle, leftShoulder, rightShoulder } = landmarks;

  if (![leftAnkle, rightAnkle, leftShoulder, rightShoulder].every(visible)) {
    return {
      zone: "red",
      percent: 0,
      ratio: null,
      message: "Step back so your whole body, including your feet, is in frame.",
    };
  }

  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
  const ankleSeparation = Math.abs(leftAnkle.x - rightAnkle.x);

  // A near-zero shoulder width means the pose itself isn't being read
  // meaningfully (e.g. facing directly away from camera) — not enough
  // signal to judge angle from, same "insufficient evidence" treatment
  // as everywhere else in this pipeline rather than a divide-by-near-zero.
  if (shoulderWidth < 0.05) {
    return {
      zone: "red",
      percent: 0,
      ratio: null,
      message: "Step back so your whole body, including your feet, is in frame.",
    };
  }

  const ratio = ankleSeparation / shoulderWidth;
  const percent = Math.max(0, Math.min(100, (ratio / YELLOW_GREEN_BOUNDARY) * 100));

  if (ratio < RED_YELLOW_BOUNDARY) {
    return { zone: "red", percent, ratio, message: "Turn side-on to the camera." };
  }
  if (ratio < YELLOW_GREEN_BOUNDARY) {
    return { zone: "yellow", percent, ratio, message: "Almost there — keep turning side-on." };
  }
  return { zone: "green", percent, ratio, message: "Hold still..." };
}
