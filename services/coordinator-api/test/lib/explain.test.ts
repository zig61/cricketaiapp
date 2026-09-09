import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const { explainIssue, explainDiagnosedIssue, explainNeutralMeasurement } = await import(
  "../../src/lib/explain.js"
);

// head_stability and balance_weight_transfer are both in
// UNVALIDATED_RANGE_MARKERS (diagnose.ts) as of 2026-09-09 -- explainIssue
// now routes them to the neutral-measurement path, not the diagnosed-issue
// path these fixtures originally exercised. The diagnosed-issue tests below
// call explainDiagnosedIssue directly (bypassing explainIssue's routing) so
// they keep testing that path's real, unchanged logic against realistic,
// well-known marker keys -- the maps these fixtures need (MARKER_DESCRIPTIONS,
// MARKER_KEY_TO_PLAIN_TERM) only have entries for these two markers, so
// reusing them here (rather than a synthetic key) is what makes the
// out-of-scope guard behave realistically in those tests.
const HEAD_STABILITY_INPUT = {
  rootCauseKey: "head_falling_away",
  rootCauseDescription: "Head drifts sideways away from the ball line.",
  markerKey: "head_stability",
  value: 16.55,
  unit: "cm",
  referenceRange: [0, 5] as const,
  severity: 0.58,
  confidence: 0.999,
  confidenceLevel: "high" as const,
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
  confidenceLevel: "high" as const,
  player: { ageBand: "13_17", battingHand: "right", playingLevel: "junior_club" },
};

function toolResponse(input: Record<string, string>) {
  return { content: [{ type: "tool_use", input }] };
}

describe("explainDiagnosedIssue (the full observation/cause/consequence/correction path)", () => {
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

    const text = await explainDiagnosedIssue("test-key", HEAD_STABILITY_INPUT);

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

    const text = await explainDiagnosedIssue("test-key", HEAD_STABILITY_INPUT);

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

    const text = await explainDiagnosedIssue("test-key", WEIGHT_TRANSFER_INPUT);

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

    const text = await explainDiagnosedIssue("test-key", WEIGHT_TRANSFER_INPUT);

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

    const text = await explainDiagnosedIssue("test-key", {
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

    await explainDiagnosedIssue("test-key", HEAD_STABILITY_INPUT);

    const promptArg = mockCreate.mock.calls[0]?.[0];
    if (!promptArg) throw new Error("mockCreate was not called");
    const userContent = JSON.parse(promptArg.messages[0].content);
    expect(userContent.secondaryMeasurement).toBeNull();
  });

  it("falls back to the deterministic template when no tool_use block is returned", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "not a tool call" }] });

    const text = await explainDiagnosedIssue("test-key", HEAD_STABILITY_INPUT);

    expect(text).toContain("outside the typical range of 0-5cm");
  });

  it("falls back to the deterministic template when the API call throws", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    const text = await explainDiagnosedIssue("test-key", HEAD_STABILITY_INPUT);

    expect(text).toContain(HEAD_STABILITY_INPUT.rootCauseDescription);
  });

  // --- confidence-gating (2026-09-06): the MEDIUM caveat is applied deterministically
  // in code, not left to the LLM to remember -- tested on both the Claude-success path
  // and the fallback-template path, since it must apply to whichever text is returned.

  it("appends the deterministic MEDIUM caveat to a real Claude response", async () => {
    mockCreate.mockResolvedValue(
      toolResponse({
        observation: "Your head drifted noticeably during the shot.",
        cause: "Your head comes off line before your front foot settles.",
        consequence: "This costs you control through the off side.",
        correction: "Keep your head still until the bat meets the ball.",
      }),
    );

    const text = await explainDiagnosedIssue("test-key", { ...HEAD_STABILITY_INPUT, confidenceLevel: "medium" });

    expect(text).toContain("Keep your head still until the bat meets the ball.");
    expect(text).toContain("moderate confidence");
  });

  it("appends the deterministic MEDIUM caveat to the fallback template too", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    const text = await explainDiagnosedIssue("test-key", { ...HEAD_STABILITY_INPUT, confidenceLevel: "medium" });

    expect(text).toContain(HEAD_STABILITY_INPUT.rootCauseDescription);
    expect(text).toContain("moderate confidence");
  });

  it("does not append any caveat for a HIGH-confidence result", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    const text = await explainDiagnosedIssue("test-key", { ...HEAD_STABILITY_INPUT, confidenceLevel: "high" });

    expect(text).not.toContain("moderate confidence");
  });
});

// --- explainNeutralMeasurement: UNVALIDATED_RANGE_MARKERS' path (2026-09-09) ---
// head_stability and balance_weight_transfer's reference ranges aren't
// validated (no citation supports either; the one real study found
// contradicts HEAD_STABILITY_REFERENCE_RANGE's assumed direction). This
// path reports the measurement plainly -- no verdict, cause, consequence,
// correction, or drill.

describe("explainNeutralMeasurement", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("reports the measurement plainly from a valid tool_use response, with nothing else", async () => {
    mockCreate.mockResolvedValue(
      toolResponse({
        observation:
          "Head stability measured at 14.3 cm, reflecting how much the head moves relative to the hips during the shot.",
      }),
    );

    const text = await explainNeutralMeasurement("test-key", { ...HEAD_STABILITY_INPUT, value: 14.3 });

    expect(text).toBe(
      "Head stability measured at 14.3 cm, reflecting how much the head moves relative to the hips during the shot.",
    );
  });

  it("calls the report_measurement tool, not explain_issue", async () => {
    mockCreate.mockResolvedValue(toolResponse({ observation: "obs" }));

    await explainNeutralMeasurement("test-key", HEAD_STABILITY_INPUT);

    const promptArg = mockCreate.mock.calls[0]?.[0];
    if (!promptArg) throw new Error("mockCreate was not called");
    expect(promptArg.tools[0].name).toBe("report_measurement");
  });

  it("never sends rootCause or severity to the model -- nothing to build a verdict on", async () => {
    mockCreate.mockResolvedValue(toolResponse({ observation: "obs" }));

    await explainNeutralMeasurement("test-key", HEAD_STABILITY_INPUT);

    const promptArg = mockCreate.mock.calls[0]?.[0];
    if (!promptArg) throw new Error("mockCreate was not called");
    const userContent = JSON.parse(promptArg.messages[0].content);
    expect(userContent.rootCause).toBeUndefined();
    expect(userContent.severity).toBeUndefined();
  });

  it("falls back to the neutral template (no 'outside the typical range' wording) when the API call throws", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    const text = await explainNeutralMeasurement("test-key", HEAD_STABILITY_INPUT);

    expect(text).toBe("head stability measured at 16.55cm.");
    expect(text).not.toContain("outside the typical range");
    expect(text).not.toContain(HEAD_STABILITY_INPUT.rootCauseDescription);
  });

  it("falls back to the neutral template when the model strays out of scope", async () => {
    mockCreate.mockResolvedValue(
      toolResponse({ observation: "Your weight transfer also looked shaky here." }),
    );

    const text = await explainNeutralMeasurement("test-key", HEAD_STABILITY_INPUT);

    expect(text).toBe("head stability measured at 16.55cm.");
  });

  it("never appends the MEDIUM confidence caveat -- there is no verdict to caveat", async () => {
    mockCreate.mockResolvedValue(toolResponse({ observation: "Head stability measured at 16.55cm." }));

    const text = await explainNeutralMeasurement("test-key", {
      ...HEAD_STABILITY_INPUT,
      confidenceLevel: "medium",
    });

    expect(text).not.toContain("moderate confidence");
  });
});

// --- explainIssue: routes by UNVALIDATED_RANGE_MARKERS membership ---

describe("explainIssue routing", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("routes head_stability (an UNVALIDATED_RANGE_MARKERS member) to the neutral-measurement path", async () => {
    mockCreate.mockResolvedValue(toolResponse({ observation: "Head stability measured at 16.55cm." }));

    await explainIssue("test-key", HEAD_STABILITY_INPUT);

    const promptArg = mockCreate.mock.calls[0]?.[0];
    if (!promptArg) throw new Error("mockCreate was not called");
    expect(promptArg.tools[0].name).toBe("report_measurement");
  });

  it("routes balance_weight_transfer (an UNVALIDATED_RANGE_MARKERS member) to the neutral-measurement path", async () => {
    mockCreate.mockResolvedValue(toolResponse({ observation: "Weight transfer measured at 30%." }));

    await explainIssue("test-key", WEIGHT_TRANSFER_INPUT);

    const promptArg = mockCreate.mock.calls[0]?.[0];
    if (!promptArg) throw new Error("mockCreate was not called");
    expect(promptArg.tools[0].name).toBe("report_measurement");
  });

  it("routes a marker outside UNVALIDATED_RANGE_MARKERS to the full diagnosed-issue path", async () => {
    // No such marker exists in the product yet -- this only proves the
    // routing decision itself is correct, independent of whether a real
    // validated-range marker exists to test end-to-end.
    mockCreate.mockResolvedValue(
      toolResponse({ observation: "o", cause: "c", consequence: "q", correction: "r" }),
    );

    await explainIssue("test-key", { ...HEAD_STABILITY_INPUT, markerKey: "front_elbow_height" });

    const promptArg = mockCreate.mock.calls[0]?.[0];
    if (!promptArg) throw new Error("mockCreate was not called");
    expect(promptArg.tools[0].name).toBe("explain_issue");
  });
});
