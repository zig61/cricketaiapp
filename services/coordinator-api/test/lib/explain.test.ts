import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const { explainIssue } = await import("../../src/lib/explain.js");

const HEAD_STABILITY_INPUT = {
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

const WEIGHT_TRANSFER_INPUT = {
  rootCauseKey: "weight_transfer_incomplete",
  rootCauseDescription: "Weight doesn't move convincingly onto the front foot through the shot.",
  markerKey: "balance_weight_transfer",
  value: 30,
  unit: "percent_of_base_width",
  referenceRange: [55, 100] as const,
  severity: 0.6,
  confidence: 0.95,
  player: { ageBand: "13_17", battingHand: "right", playingLevel: "junior_club" },
};

function toolResponse(input: Record<string, string>) {
  return { content: [{ type: "tool_use", input }] };
}

describe("explainIssue", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("composes the explanation from a valid tool_use response, in Observation -> Cause -> Consequence -> Correction order", async () => {
    mockCreate.mockResolvedValue(
      toolResponse({
        observation: "Your head drifted noticeably during the shot.",
        cause: "You're losing your head position before your front foot settles.",
        consequence: "This makes your contact point inconsistent and costs you control through the off side.",
        correction: "Keep your head still until the bat meets the ball.",
      }),
    );

    const text = await explainIssue("test-key", HEAD_STABILITY_INPUT);

    expect(text).toBe(
      "Your head drifted noticeably during the shot. You're losing your head position before your front foot settles. This makes your contact point inconsistent and costs you control through the off side. Keep your head still until the bat meets the ball.",
    );
  });

  it("falls back to the deterministic template when the model names an unmeasured marker", async () => {
    mockCreate.mockResolvedValue(
      toolResponse({
        observation: "Your head drifted noticeably during the shot.",
        cause: "Your grip is too tight and your footwork is late, pulling your head off line.",
        consequence: "This costs you control through the off side.",
        correction: "Keep your head still until the bat meets the ball.",
      }),
    );

    const text = await explainIssue("test-key", HEAD_STABILITY_INPUT);

    expect(text).toContain("head stability was measured at 16.55cm");
    expect(text).not.toContain("grip");
    expect(text).not.toContain("footwork");
  });

  it("allows the model to discuss weight_transfer when it's the primary marker", async () => {
    mockCreate.mockResolvedValue(
      toolResponse({
        observation: "Your hips only reached 30% of the way to your front foot.",
        cause: "You're staying back on your heels instead of committing forward.",
        consequence: "This leaves you playing off the back foot and reduces your power through the shot.",
        correction: "Step your weight fully onto your front foot as you swing.",
      }),
    );

    const text = await explainIssue("test-key", WEIGHT_TRANSFER_INPUT);

    expect(text).toContain("weight");
    expect(mockCreate).toHaveBeenCalled();
  });

  it("still blocks a genuinely unmeasured marker (grip) even when weight_transfer is the primary", async () => {
    mockCreate.mockResolvedValue(
      toolResponse({
        observation: "Your hips only reached 30% of the way to your front foot.",
        cause: "Your grip is too tight, which is locking your weight onto your back foot.",
        consequence: "This leaves you playing off the back foot.",
        correction: "Step your weight fully onto your front foot as you swing.",
      }),
    );

    const text = await explainIssue("test-key", WEIGHT_TRANSFER_INPUT);

    expect(text).toContain("balance weight transfer was measured at 30percent_of_base_width");
    expect(text).not.toContain("grip");
  });

  it("passes secondaryMeasurement through to the prompt and allows a genuine connection", async () => {
    mockCreate.mockResolvedValue(
      toolResponse({
        observation: "Your head drifted 16.55cm off the ball line.",
        cause: "Your head is coming off line as you fall short of transferring your weight forward.",
        consequence: "Together these cost you control and consistency through the shot.",
        correction: "Keep your head still and drive your weight into your front foot.",
      }),
    );

    const text = await explainIssue("test-key", {
      ...HEAD_STABILITY_INPUT,
      secondaryMeasurement: {
        markerKey: "balance_weight_transfer",
        value: 30,
        unit: "percent_of_base_width",
        rootCauseKey: "weight_transfer_incomplete",
        rootCauseDescription: "Weight doesn't move convincingly onto the front foot through the shot.",
      },
    });

    expect(text).toContain("weight");
    const promptArg = mockCreate.mock.calls[0]?.[0];
    if (!promptArg) throw new Error("mockCreate was not called");
    expect(promptArg.system).toContain("balance_weight_transfer");
    const userContent = JSON.parse(promptArg.messages[0].content);
    expect(userContent.secondaryMeasurement.markerKey).toBe("balance_weight_transfer");
  });

  it("does not include secondary-measurement context in the prompt when none is given", async () => {
    mockCreate.mockResolvedValue(
      toolResponse({
        observation: "obs",
        cause: "cause",
        consequence: "consequence",
        correction: "correction",
      }),
    );

    await explainIssue("test-key", HEAD_STABILITY_INPUT);

    const promptArg = mockCreate.mock.calls[0]?.[0];
    if (!promptArg) throw new Error("mockCreate was not called");
    const userContent = JSON.parse(promptArg.messages[0].content);
    expect(userContent.secondaryMeasurement).toBeNull();
  });

  it("falls back to the deterministic template when no tool_use block is returned", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "not a tool call" }] });

    const text = await explainIssue("test-key", HEAD_STABILITY_INPUT);

    expect(text).toContain("outside the typical range of 0-5cm");
  });

  it("falls back to the deterministic template when the API call throws", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    const text = await explainIssue("test-key", HEAD_STABILITY_INPUT);

    expect(text).toContain(HEAD_STABILITY_INPUT.rootCauseDescription);
  });
});
