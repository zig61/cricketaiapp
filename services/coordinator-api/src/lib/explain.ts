import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const EXPLANATION_MODEL = "claude-sonnet-5";

const explanationSchema = z.object({
  observation: z.string().min(1),
  cause: z.string().min(1),
  consequence: z.string().min(1),
  correction: z.string().min(1),
});

// Defense-in-depth against the model drifting into markers this pipeline
// doesn't measure (docs/coaching-philosophy.md "DO NOT INVENT DATA"). The
// system prompt already instructs this; this is a second, code-level check
// on the actual output, since a prompt instruction is not a guarantee.
//
// Deliberately excludes "backlift": the head_falling_away root-cause
// description itself says the drift happens "between backlift and
// contact" — the model legitimately echoes that as a timing reference, not
// a fabricated technical claim about backlift technique. A blocklist can't
// tell "naming the given timing window" from "inventing a new claim," so it
// only covers terms that never appear in this pipeline's own inputs.
const OUT_OF_SCOPE_TERMS = [
  "grip",
  "footwork",
  "foot work",
  "bat path",
  "bat speed",
  "stance",
  "elbow",
  "follow-through",
  "follow through",
  "weight transfer",
  "base width",
  "wrist",
  "shoulder rotation",
  "hip rotation",
];

const SYSTEM_PROMPT = `You are a world-class batting coach speaking directly to a player, reviewing exactly one measurement from their batting video: head_stability — how far their head drifts sideways during the shot, in centimeters. This is the ONLY thing you have evidence for.

You are given structured facts already computed by a deterministic pipeline: the measured value, its reference range, a severity score, a confidence score, and a plain-language root-cause description. You do not decide the diagnosis, severity, root cause, or drill — those are fixed before you're called. Your only job is turning them into a clear, specific, coach-voice explanation.

STRICT SCOPE — this is a hard constraint, not a style preference: You may discuss ONLY head position and head stability during the shot. Do NOT mention, infer, or speculate about grip, footwork, foot movement, bat path, bat speed, backlift, stance, elbow position, shoulder rotation, hip rotation, weight transfer, base width, or wrist position. None of these were measured. Stating anything about them — even something that sounds plausible — is fabrication, not coaching. If the natural cause of head movement would normally involve one of these, do not name it; explain the cause and consequence purely in terms of head position, timing, and its direct effect on contact, without inventing an unmeasured mechanical cause elsewhere in the body.

VOICE: Write like an elite, honest coach, not a commentator. Be specific and causal, never generic ("keep working on it" is not acceptable). Never invent a claim not present in the structured input. Age band, batting hand, and playing level (when given) may only calibrate tone and simplicity of language — they must never change the substance, severity, or confidence of what you say.

Return exactly four fields via the tool call, in this order:
1. observation — what was seen, stated as fact, tied directly to the measured number.
2. cause — the likely reason this is happening, framed only in terms of head control and timing.
3. consequence — the concrete batting outcome this produces (control, contact consistency, scoring options, vulnerability against certain deliveries) — not an abstract statement.
4. correction — ONE short, memorable technical cue the player can hold in mind while batting. A single sentence, not a list.

Do not add drills, success criteria, or any section beyond these four — those are handled elsewhere in the product.`;

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
  return [parsed.observation, parsed.cause, parsed.consequence, parsed.correction].join(" ");
}

function containsOutOfScopeClaim(text: string): boolean {
  const lower = text.toLowerCase();
  return OUT_OF_SCOPE_TERMS.some((term) => lower.includes(term));
}

/**
 * Call site A (docs/06-ai-architecture.md §2) — LLM explains, never decides.
 * Every input field is already computed deterministically upstream; the
 * model only turns them into plain-language prose via a schema-constrained
 * tool call, following the Observation -> Cause -> Consequence -> Correction
 * structure from docs/coaching-philosophy.md. Any failure — network, auth,
 * malformed output, or the model naming an unmeasured marker (grip,
 * footwork, bat path, etc.) — falls back to a deterministic template rather
 * than failing the whole pipeline stage or shipping a fabricated claim.
 */
export async function explainIssue(apiKey: string, input: ExplainInput): Promise<string> {
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: EXPLANATION_MODEL,
      max_tokens: 500,
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
              observation: {
                type: "string",
                description: "What was seen, tied directly to the measured number.",
              },
              cause: {
                type: "string",
                description: "The likely reason, framed only in terms of head control and timing.",
              },
              consequence: {
                type: "string",
                description: "The concrete batting outcome this produces.",
              },
              correction: {
                type: "string",
                description: "ONE short, memorable technical cue. A single sentence.",
              },
            },
            required: ["observation", "cause", "consequence", "correction"],
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
    const composed = composeExplanation(parsed);

    if (containsOutOfScopeClaim(composed)) {
      throw new Error("Model output referenced an unmeasured marker; discarding in favor of fallback.");
    }

    return composed;
  } catch (err) {
    // Never let an explain failure fail the pipeline stage (see docstring),
    // but a silent catch means there's no way to diagnose *why* it fell
    // back — Render captures stdout/stderr regardless of logger, so a plain
    // console.error is enough to make this visible without plumbing a
    // logger instance through a plain lib module.
    //
    // The Anthropic SDK's APIConnectionError wraps the real network error in
    // `.cause` (a plain console.error(err) doesn't reliably surface nested
    // causes through Render's log viewer), so pull out name/code/message
    // from both the error and its cause explicitly.
    const cause = err instanceof Error ? (err.cause as Error | undefined) : undefined;
    console.error("explainIssue: falling back to template.", {
      name: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
      causeName: cause?.name,
      causeCode: (cause as { code?: string } | undefined)?.code,
      causeMessage: cause?.message,
    });
    return fallbackExplanation(input);
  }
}
