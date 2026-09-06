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
  it("gives camera-angle guidance when geometry is the weak link", () => {
    const note = lowConfidenceNote(breakdown({ geometryScore: 0.2, overallScore: 0.2 }));
    expect(note).toContain("camera");
    expect(note).toContain("angle");
  });

  it("gives stay-in-frame guidance when consistency is the weak link", () => {
    const note = lowConfidenceNote(breakdown({ consistencyScore: 0.2, overallScore: 0.2 }));
    expect(note).toContain("lost track");
  });

  it("gives visibility/lighting guidance when visibility is the weak link", () => {
    const note = lowConfidenceNote(breakdown({ visibilityScore: 0.2, overallScore: 0.2 }));
    expect(note).toContain("couldn't see you clearly");
  });
});

describe("MEDIUM_CONFIDENCE_CAVEAT", () => {
  it("is a non-empty, player-facing sentence", () => {
    expect(MEDIUM_CONFIDENCE_CAVEAT.length).toBeGreaterThan(20);
    expect(MEDIUM_CONFIDENCE_CAVEAT.toLowerCase()).toContain("confidence");
  });
});
