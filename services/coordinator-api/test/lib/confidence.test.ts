import { describe, it, expect } from "vitest";
import { weakestComponent, lowConfidenceNote, MEDIUM_CONFIDENCE_CAVEAT } from "../../src/lib/confidence.js";
import type { ConfidenceBreakdown } from "../../src/lib/cvService.js";

function breakdown(overrides: Partial<ConfidenceBreakdown> = {}): ConfidenceBreakdown {
  return {
    visibilityScore: 0.9,
    consistencyScore: 0.9,
    geometryScore: 0.9,
    overallScore: 0.9,
    level: "high",
    ...overrides,
  };
}

describe("weakestComponent", () => {
  it("identifies geometry as weakest -- the real 0.27cm-style case (visibility fine, geometry bad)", () => {
    const result = weakestComponent(breakdown({ geometryScore: 0.2, overallScore: 0.2 }));
    expect(result).toBe("geometry");
  });

  it("identifies consistency as weakest", () => {
    const result = weakestComponent(breakdown({ consistencyScore: 0.2, overallScore: 0.2 }));
    expect(result).toBe("consistency");
  });

  it("identifies visibility as weakest", () => {
    const result = weakestComponent(breakdown({ visibilityScore: 0.2, overallScore: 0.2 }));
    expect(result).toBe("visibility");
  });

  it("breaks a tie in favor of geometry, the specific gap this pass closes", () => {
    const result = weakestComponent(
      breakdown({ visibilityScore: 0.2, consistencyScore: 0.2, geometryScore: 0.2, overallScore: 0.2 }),
    );
    expect(result).toBe("geometry");
  });
});

describe("lowConfidenceNote", () => {
  // Regression test for a real bug found via live verification (2026-09-06):
  // a real video's compressed camera angle dropped BOTH markers' geometry
  // scores, and the first version of this function used weight_transfer's
  // "look across your feet" wording on a head_stability measurement --
  // same root cause, wrong marker's wording. Each marker needs its own
  // geometry message; consistency/visibility stay marker-agnostic.

  it("gives weight_transfer-specific stance-angle guidance for its own geometry failure", () => {
    const note = lowConfidenceNote(
      "balance_weight_transfer",
      breakdown({ geometryScore: 0.2, overallScore: 0.2 }),
    );
    expect(note).toContain("across your feet");
  });

  it("gives head_stability-specific guidance for its own geometry failure -- NOT the weight_transfer wording", () => {
    const note = lowConfidenceNote("head_stability", breakdown({ geometryScore: 0.2, overallScore: 0.2 }));
    expect(note).not.toContain("across your feet");
    expect(note.toLowerCase()).toContain("head movement");
  });

  it("falls back to a generic geometry message for an unknown marker rather than guessing wrong", () => {
    const note = lowConfidenceNote("some_future_marker", breakdown({ geometryScore: 0.2, overallScore: 0.2 }));
    expect(note).not.toContain("across your feet");
    expect(note).toContain("camera angle");
  });

  it("gives stay-in-frame guidance when consistency is the weak link, regardless of marker", () => {
    const note = lowConfidenceNote(
      "head_stability",
      breakdown({ consistencyScore: 0.2, overallScore: 0.2 }),
    );
    expect(note).toContain("lost track");
  });

  it("gives visibility/lighting guidance when visibility is the weak link, regardless of marker", () => {
    const note = lowConfidenceNote(
      "balance_weight_transfer",
      breakdown({ visibilityScore: 0.2, overallScore: 0.2 }),
    );
    expect(note).toContain("couldn't see you clearly");
  });
});

describe("MEDIUM_CONFIDENCE_CAVEAT", () => {
  it("is a non-empty, player-facing sentence", () => {
    expect(MEDIUM_CONFIDENCE_CAVEAT.length).toBeGreaterThan(20);
    expect(MEDIUM_CONFIDENCE_CAVEAT.toLowerCase()).toContain("confidence");
  });
});
