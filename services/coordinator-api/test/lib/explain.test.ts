import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const { explainIssue } = await import("../../src/lib/explain.js");

const BASE_INPUT = {
  rootCauseKey: "head_falling_away",
  rootCauseDescription: "Head drifts sideways away from the ball line.",
  markerKey: "head_stability",
  value: 16.55,
  unit: "cm",
  referenceRange: [0, 5] as const,
  severity: 0.58,
  confidence: 0.999,
  player: { ageBand: "13_17", battingHand: "right", playingLevel: "junior_club" },
};

describe("explainIssue", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("composes the explanation from a valid tool_use response", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: {
            observation: "Your head drifted noticeably during the shot.",
            interpretation: "This makes it harder to keep your eyes on the ball.",
            recommendationPreview: "A simple drill can help you keep your head still.",
            confidenceLabel: "high",
          },
        },
      ],
    });

    const text = await explainIssue("test-key", BASE_INPUT);

    expect(text).toBe(
      "Your head drifted noticeably during the shot. This makes it harder to keep your eyes on the ball. A simple drill can help you keep your head still.",
    );
  });

  it("falls back to the deterministic template when the tool output is malformed", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", input: { observation: "only one field" } }],
    });

    const text = await explainIssue("test-key", BASE_INPUT);

    expect(text).toContain("head stability was measured at 16.55cm");
    expect(text).toContain(BASE_INPUT.rootCauseDescription);
  });

  it("falls back to the deterministic template when no tool_use block is returned", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "not a tool call" }] });

    const text = await explainIssue("test-key", BASE_INPUT);

    expect(text).toContain("outside the typical range of 0-5cm");
  });

  it("falls back to the deterministic template when the API call throws", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    const text = await explainIssue("test-key", BASE_INPUT);

    expect(text).toContain(BASE_INPUT.rootCauseDescription);
  });
});
