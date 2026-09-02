import { describe, it, expect } from "vitest";
import { evaluateCandidate, selectPrimary, writeIssue, lookupRootCause } from "../../src/pipeline/diagnose.js";
import { queryResult, mockSupabaseAdmin } from "../helpers/mockSupabaseAdmin.js";

const HEAD_STABILITY_INPUT = {
  measurementId: "measurement-hs",
  markerKey: "head_stability",
  unit: "cm",
};

const WEIGHT_TRANSFER_INPUT = {
  measurementId: "measurement-wt",
  markerKey: "balance_weight_transfer",
  unit: "percent_of_base_width",
};

describe("evaluateCandidate", () => {
  it("returns null when the value is inside the reference range (no issue)", () => {
    const result = evaluateCandidate({ ...HEAD_STABILITY_INPUT, value: 3, confidence: 0.9 });
    expect(result).toBeNull();
  });

  it("returns null when confidence is below the candidate floor, even if out of range", () => {
    const result = evaluateCandidate({ ...HEAD_STABILITY_INPUT, value: 30, confidence: 0.4 });
    expect(result).toBeNull();
  });

  it("returns a candidate (not yet primary) when out of range with confidence above the candidate floor", () => {
    // value 30.65cm, range [0,5], scale 20 -> distance 25.65, severity clamps to 1
    const result = evaluateCandidate({ ...HEAD_STABILITY_INPUT, value: 30.65, confidence: 0.999 });

    expect(result).toEqual({
      measurementId: "measurement-hs",
      markerKey: "head_stability",
      value: 30.65,
      unit: "cm",
      confidence: 0.999,
      severity: 1,
      priority: 0.999,
      rootCauseKey: "head_falling_away",
    });
  });

  it("computes severity proportionally below the clamp point", () => {
    // value 16.55, distance = 11.55, scale 20 -> severity 0.5775
    const result = evaluateCandidate({ ...HEAD_STABILITY_INPUT, value: 16.55, confidence: 0.999 });
    expect(result?.severity).toBeCloseTo(0.5775, 4);
  });

  it("returns null for an unmapped marker", () => {
    const result = evaluateCandidate({
      ...HEAD_STABILITY_INPUT,
      markerKey: "backlift_alignment",
      value: 30,
      confidence: 0.9,
    });
    expect(result).toBeNull();
  });

  it("weight_transfer below range maps to weight_transfer_incomplete", () => {
    // value 30%, range [55,100], scale 40 -> distance 25, severity 0.625
    const result = evaluateCandidate({ ...WEIGHT_TRANSFER_INPUT, value: 30, confidence: 0.95 });

    expect(result?.rootCauseKey).toBe("weight_transfer_incomplete");
    expect(result?.severity).toBeCloseTo(0.625, 4);
  });

  it("weight_transfer above range maps to weight_transfer_overbalanced", () => {
    // value 120%, range [55,100], scale 40 -> distance 20, severity 0.5
    const result = evaluateCandidate({ ...WEIGHT_TRANSFER_INPUT, value: 120, confidence: 0.95 });

    expect(result?.rootCauseKey).toBe("weight_transfer_overbalanced");
    expect(result?.severity).toBeCloseTo(0.5, 4);
  });

  it("weight_transfer inside the 55-100 range is not a candidate", () => {
    const result = evaluateCandidate({ ...WEIGHT_TRANSFER_INPUT, value: 75, confidence: 0.95 });
    expect(result).toBeNull();
  });
});

describe("selectPrimary", () => {
  it("returns null for an empty candidate list", () => {
    expect(selectPrimary([])).toBeNull();
  });

  it("excludes candidates below the primary confidence floor", () => {
    const belowFloor = evaluateCandidate({ ...HEAD_STABILITY_INPUT, value: 30, confidence: 0.55 });
    expect(belowFloor).not.toBeNull();
    expect(selectPrimary([belowFloor!])).toBeNull();
  });

  it("picks the higher-priority candidate when both markers are candidates", () => {
    const headStability = evaluateCandidate({ ...HEAD_STABILITY_INPUT, value: 30.65, confidence: 0.999 }); // severity 1, priority ~0.999
    const weightTransfer = evaluateCandidate({ ...WEIGHT_TRANSFER_INPUT, value: 40, confidence: 0.95 }); // severity 0.375, priority ~0.356

    const primary = selectPrimary([headStability!, weightTransfer!]);

    expect(primary?.markerKey).toBe("head_stability");
  });

  it("picks weight_transfer when it has higher priority", () => {
    const headStability = evaluateCandidate({ ...HEAD_STABILITY_INPUT, value: 6, confidence: 0.6 }); // just barely out of range, low severity
    const weightTransfer = evaluateCandidate({ ...WEIGHT_TRANSFER_INPUT, value: 130, confidence: 0.95 }); // severity ~0.875, high priority

    const primary = selectPrimary([headStability!, weightTransfer!]);

    expect(primary?.markerKey).toBe("balance_weight_transfer");
  });
});

describe("lookupRootCause", () => {
  it("returns the root cause row for a seeded key", async () => {
    const admin = mockSupabaseAdmin();
    admin.from.mockImplementation(() =>
      queryResult({ data: { id: "root-cause-1", description: "desc" } }),
    );

    const result = await lookupRootCause(admin as never, "head_falling_away");

    expect(result).toEqual({ id: "root-cause-1", description: "desc" });
  });

  it("throws when the root cause isn't seeded", async () => {
    const admin = mockSupabaseAdmin();
    admin.from.mockImplementation(() => queryResult({ data: null }));

    await expect(lookupRootCause(admin as never, "not_seeded")).rejects.toThrow();
  });
});

describe("writeIssue", () => {
  it("looks up the root cause and writes the issue row", async () => {
    const admin = mockSupabaseAdmin();
    admin.from.mockImplementation((table: string) => {
      if (table === "root_causes") {
        return queryResult({ data: { id: "root-cause-1", description: "Head drifts sideways." } });
      }
      if (table === "issues") {
        return queryResult({ data: { id: "issue-1" } });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const candidate = evaluateCandidate({ ...HEAD_STABILITY_INPUT, value: 30.65, confidence: 0.999 })!;
    const result = await writeIssue(admin as never, "analysis-1", candidate);

    expect(result).toEqual({
      issueId: "issue-1",
      rootCauseId: "root-cause-1",
      rootCauseKey: "head_falling_away",
      rootCauseDescription: "Head drifts sideways.",
      severity: 1,
      markerKey: "head_stability",
      value: 30.65,
      unit: "cm",
      confidence: 0.999,
    });
  });
});
