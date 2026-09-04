import { describe, it, expect } from "vitest";
import { assessCalibrationFrame, type CalibrationLandmarks } from "@/lib/calibration";

function landmarks(overrides: Partial<CalibrationLandmarks> = {}): CalibrationLandmarks {
  return {
    // Default: a clearly side-on stance. Shoulders roughly foreshortened
    // (small separation, as they'd appear edge-on from a true side-on
    // camera), ankles spread roughly shoulder-width -- ratio well above
    // the green boundary.
    leftShoulder: { x: 0.0, visibility: 0.9 },
    rightShoulder: { x: 0.05, visibility: 0.9 },
    leftAnkle: { x: 0.0, visibility: 0.9 },
    rightAnkle: { x: 0.3, visibility: 0.9 },
    ...overrides,
  };
}

describe("assessCalibrationFrame", () => {
  it("classifies a clearly side-on stance as green", () => {
    // shoulderWidth 0.05, ankleSeparation 0.3 -> ratio 6.0, well above 0.6
    const result = assessCalibrationFrame(landmarks());

    expect(result.zone).toBe("green");
    expect(result.percent).toBe(100);
    expect(result.message).toBe("Hold still...");
  });

  it("classifies a clearly front-on stance as red (the real bug's signature)", () => {
    // Mirrors the real finding: ankles compressed almost to nothing while
    // shoulders are fully spread (facing the camera).
    const result = assessCalibrationFrame(
      landmarks({
        leftShoulder: { x: 0.0, visibility: 0.9 },
        rightShoulder: { x: 0.4, visibility: 0.9 }, // shoulders fully visible/spread
        leftAnkle: { x: 0.15, visibility: 0.9 },
        rightAnkle: { x: 0.153, visibility: 0.9 }, // ankles nearly coincident
      }),
    );

    expect(result.zone).toBe("red");
    expect(result.ratio).not.toBeNull();
    expect(result.ratio!).toBeLessThan(0.3);
  });

  it("classifies a borderline angle as yellow", () => {
    // shoulderWidth 0.2, ankleSeparation 0.09 -> ratio 0.45, between the
    // two boundaries (0.3, 0.6).
    const result = assessCalibrationFrame(
      landmarks({
        leftShoulder: { x: 0.0, visibility: 0.9 },
        rightShoulder: { x: 0.2, visibility: 0.9 },
        leftAnkle: { x: 0.0, visibility: 0.9 },
        rightAnkle: { x: 0.09, visibility: 0.9 },
      }),
    );

    expect(result.zone).toBe("yellow");
    expect(result.percent).toBeGreaterThan(0);
    expect(result.percent).toBeLessThan(100);
  });

  it("returns red with a null ratio and a framing message when a landmark isn't visible", () => {
    const result = assessCalibrationFrame(
      landmarks({ leftAnkle: { x: 0.0, visibility: 0.1 } }), // below LANDMARK_MIN_VISIBILITY
    );

    expect(result.zone).toBe("red");
    expect(result.ratio).toBeNull();
    expect(result.message).toContain("Step back");
  });

  it("returns red with a null ratio when shoulder width is implausibly small", () => {
    const result = assessCalibrationFrame(
      landmarks({
        leftShoulder: { x: 0.2, visibility: 0.9 },
        rightShoulder: { x: 0.201, visibility: 0.9 }, // ~1mm apart
      }),
    );

    expect(result.zone).toBe("red");
    expect(result.ratio).toBeNull();
  });

  it("percent scales linearly up to the green boundary, then clamps at 100", () => {
    // ratio 0.3 (exactly the red/yellow boundary) -> 50%
    const atBoundary = assessCalibrationFrame(
      landmarks({
        leftShoulder: { x: 0.0, visibility: 0.9 },
        rightShoulder: { x: 0.2, visibility: 0.9 },
        leftAnkle: { x: 0.0, visibility: 0.9 },
        rightAnkle: { x: 0.06, visibility: 0.9 }, // ratio = 0.06/0.2 = 0.3
      }),
    );
    expect(atBoundary.percent).toBeCloseTo(50, 0);

    // A very large ratio should still clamp at 100, not exceed it.
    const wellPastGreen = assessCalibrationFrame(
      landmarks({
        leftShoulder: { x: 0.0, visibility: 0.9 },
        rightShoulder: { x: 0.05, visibility: 0.9 },
        leftAnkle: { x: 0.0, visibility: 0.9 },
        rightAnkle: { x: 1.0, visibility: 0.9 },
      }),
    );
    expect(wellPastGreen.percent).toBe(100);
  });
});
