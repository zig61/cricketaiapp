import { describe, it, expect } from "vitest";
import { diagnose } from "../../src/pipeline/diagnose.js";
import { queryResult, mockSupabaseAdmin } from "../helpers/mockSupabaseAdmin.js";

const BASE_INPUT = {
  analysisId: "analysis-1",
  measurementId: "measurement-1",
  markerKey: "head_stability",
  unit: "cm",
};

describe("diagnose", () => {
  it("returns null when the value is inside the reference range (no issue)", async () => {
    const admin = mockSupabaseAdmin();
    const result = await diagnose(admin as never, { ...BASE_INPUT, value: 3, confidence: 0.9 });
    expect(result).toBeNull();
  });

  it("returns null when confidence is below the candidate floor, even if out of range", async () => {
    const admin = mockSupabaseAdmin();
    const result = await diagnose(admin as never, { ...BASE_INPUT, value: 30, confidence: 0.4 });
    expect(result).toBeNull();
  });

  it("returns null when confidence clears the candidate floor but not the primary floor", async () => {
    const admin = mockSupabaseAdmin();
    const result = await diagnose(admin as never, { ...BASE_INPUT, value: 30, confidence: 0.55 });
    expect(result).toBeNull();
  });

  it("writes an issue and returns it when out of range with confidence above the primary floor", async () => {
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

    // value 30.65cm, range [0,5], scale 20 -> distance 25.65, severity clamps to 1
    const result = await diagnose(admin as never, { ...BASE_INPUT, value: 30.65, confidence: 0.999 });

    expect(result).toEqual({
      issueId: "issue-1",
      rootCauseId: "root-cause-1",
      rootCauseKey: "head_falling_away",
      rootCauseDescription: "Head drifts sideways.",
      severity: 1,
    });
  });

  it("computes severity proportionally below the clamp point", async () => {
    const admin = mockSupabaseAdmin();
    admin.from.mockImplementation((table: string) => {
      if (table === "root_causes") {
        return queryResult({ data: { id: "root-cause-1", description: "desc" } });
      }
      if (table === "issues") {
        return queryResult({ data: { id: "issue-1" } });
      }
      throw new Error(`unexpected table ${table}`);
    });

    // value 16.55, distance = 11.55, scale 20 -> severity 0.5775
    const result = await diagnose(admin as never, { ...BASE_INPUT, value: 16.55, confidence: 0.999 });
    expect(result?.severity).toBeCloseTo(0.5775, 4);
  });

  it("throws when the root cause isn't seeded", async () => {
    const admin = mockSupabaseAdmin();
    admin.from.mockImplementation((table: string) => {
      if (table === "root_causes") {
        return queryResult({ data: null });
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(
      diagnose(admin as never, { ...BASE_INPUT, value: 30, confidence: 0.9 }),
    ).rejects.toThrow();
  });

  it("returns null for an unmapped marker", async () => {
    const admin = mockSupabaseAdmin();
    const result = await diagnose(admin as never, {
      ...BASE_INPUT,
      markerKey: "backlift_alignment",
      value: 30,
      confidence: 0.9,
    });
    expect(result).toBeNull();
  });
});
