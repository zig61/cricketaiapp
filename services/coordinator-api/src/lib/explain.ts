import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const EXPLANATION_MODEL = "claude-sonnet-5";

const explanationSchema = z.object({
  observation: z.string().min(1),
  interpretation: z.string().min(1),
  recommendationPreview: z.string().min(1),
  confidenceLabel: z.enum(["high", "medium", "low"]),
});

const SYSTEM_PROMPT = `You are a cricket batting coach explaining one diagnosed technique issue to a young player.
You are given structured facts computed by a deterministic pipeline — a measurement, a root cause, a severity score, and a confidence score.
Never invent facts not present in the input. Never state a different severity, confidence, or root cause than what you were given.
Keep language encouraging and age-appropriate for the given age band. Do not mention the specific drill — only bridge to it.`;

export interface ExplainInput {
  rootCauseKey: string;
  rootCauseDescription: string;
  markerKey: string;
  value: number;
  unit: string;
  referenceRange: readonly [number, number];
  severity: number;
  confidence: number;
  player: {
    ageBand: string | null;
    battingHand: string | null;
    playingLevel: string | null;
  };
}

function fallbackExplanation(input: ExplainInput): string {
  return (
    `${input.markerKey.replace(/_/g, " ")} was measured at ${input.value}${input.unit}, ` +
    `outside the typical range of ${input.referenceRange[0]}-${input.referenceRange[1]}${input.unit}. ` +
    `This is linked to: ${input.rootCauseDescription}`
  );
}

function composeExplanation(parsed: z.infer<typeof explanationSchema>): string {
  return [parsed.observation, parsed.interpretation, parsed.recommendationPreview].join(" ");
}

/**
 * Call site A (docs/06-ai-architecture.md §2) — LLM explains, never decides.
 * Every input field is already computed deterministically upstream; the
 * model only turns them into plain-language prose via a schema-constrained
 * tool call. Any failure (network, auth, malformed output) falls back to a
 * deterministic template rather than failing the whole pipeline stage —
 * a diagnosis that already has a valid severity/confidence shouldn't be
 * lost because the LLM call had a hiccup.
 */
export async function explainIssue(apiKey: string, input: ExplainInput): Promise<string> {
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: EXPLANATION_MODEL,
      max_tokens: 500,
      temperature: 0.25,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            player: input.player,
            rootCause: { key: input.rootCauseKey, description: input.rootCauseDescription },
            measurement: {
              markerKey: input.markerKey,
              value: input.value,
              unit: input.unit,
              referenceRange: input.referenceRange,
            },
            severity: input.severity,
            confidence: input.confidence,
          }),
        },
      ],
      tools: [
        {
          name: "explain_issue",
          description: "Provide a structured coaching explanation for the diagnosed issue.",
          input_schema: {
            type: "object",
            properties: {
              observation: { type: "string", description: "What was seen, tied to the measurement." },
              interpretation: { type: "string", description: "Why it matters for batting." },
              recommendationPreview: {
                type: "string",
                description: "One sentence bridging to the drill, without naming it.",
              },
              confidenceLabel: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["observation", "interpretation", "recommendationPreview", "confidenceLabel"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "explain_issue" },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error("No tool_use block in Claude's response.");
    }

    const parsed = explanationSchema.parse(toolUse.input);
    return composeExplanation(parsed);
  } catch {
    return fallbackExplanation(input);
  }
}
