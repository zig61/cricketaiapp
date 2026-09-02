import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const EXPLANATION_MODEL = "claude-sonnet-5";

const explanationSchema = z.object({
  observation: z.string().min(1),
  cause: z.string().min(1),
  consequence: z.string().min(1),
  correction: z.string().min(1),
});

const MARKER_DESCRIPTIONS: Record<string, string> = {
  head_stability:
    "head_stability — how far the player's head drifts sideways away from the ball line during the shot, in centimeters.",
  balance_weight_transfer:
    "balance_weight_transfer — how far the player's hips move toward their front foot during the shot, as a percentage of their own stance width (0% = no transfer at all, 100% = hips reached the front foot's line, more than 100% means the hips moved PAST the front foot — overbalanced, a loss of control in the other direction from insufficient transfer).",
};

const MARKER_KEY_TO_PLAIN_TERM: Record<string, string> = {
  head_stability: "head stability / head position",
  balance_weight_transfer: "weight transfer",
};

// Every marker this pipeline could ever discuss, whether measured this
// pass or not. Terms not in MARKER_KEY_TO_PLAIN_TERM's *values* for the
// markers actually in scope this call stay forbidden — this is what makes
// the scope constraint work correctly as more markers get built, without
// editing this list by hand each time.
const ALL_POSSIBLE_MARKER_TERMS = [
  "grip",
  "footwork",
  "foot movement",
  "bat path",
  "bat speed",
  "stance",
  "elbow position",
  "shoulder rotation",
  "hip rotation",
  "base width",
  "wrist position",
  ...Object.values(MARKER_KEY_TO_PLAIN_TERM),
];

function inScopeTerms(markerKeys: string[]): Set<string> {
  return new Set(markerKeys.map((k) => MARKER_KEY_TO_PLAIN_TERM[k]).filter((t): t is string => !!t));
}

function outOfScopeTermsFor(markerKeys: string[]): string[] {
  const allowed = inScopeTerms(markerKeys);
  return ALL_POSSIBLE_MARKER_TERMS.filter((t) => !allowed.has(t));
}

// Defense-in-depth against the model drifting into markers this pipeline
// doesn't measure this pass (docs/coaching-philosophy.md "DO NOT INVENT
// DATA"). The system prompt already instructs this; this is a second,
// code-level check on the actual output, since a prompt instruction is not
// a guarantee. Computed per-call from the markers actually in scope (see
// outOfScopeTermsFor) rather than a fixed list, since which markers are
// "measured" now varies call to call.
//
// Deliberately never includes "backlift" as a standalone check: the
// head_falling_away root-cause description itself says the drift happens
// "between backlift and contact" — the model legitimately echoes that as a
// timing reference, not a fabricated technical claim about backlift
// technique. Similarly "base width" stays forbidden even when
// weight_transfer is in scope — the formula uses base width only as an
// internal normalization unit, not as a claim about the separate,
// unmeasured base_width marker (stance width itself).
function containsOutOfScopeClaim(text: string, markerKeysInScope: string[]): boolean {
  const lower = text.toLowerCase();
  return outOfScopeTermsFor(markerKeysInScope).some((term) => lower.includes(term));
}

function buildSystemPrompt(primaryMarkerKey: string, secondaryMarkerKey: string | null): string {
  const inScopeKeys = secondaryMarkerKey ? [primaryMarkerKey, secondaryMarkerKey] : [primaryMarkerKey];
  const primaryDescription = MARKER_DESCRIPTIONS[primaryMarkerKey] ?? primaryMarkerKey;

  const secondaryParagraph = secondaryMarkerKey
    ? `\n\nYou are ALSO given a second, secondary measurement that shows a deviation, though it was not selected as the primary issue: ${
        MARKER_DESCRIPTIONS[secondaryMarkerKey] ?? secondaryMarkerKey
      } If — and only if — there is a genuine, biomechanically plausible connection between the primary issue and this secondary one, clearly supported by the specific facts given, you may briefly note it in the cause or consequence section. Do not force a connection if there isn't a clear, specific one. In most cases you should say nothing about the secondary measurement at all — its mere presence is not evidence of a connection by itself.`
    : "";

  const scopeList = [...inScopeTerms(inScopeKeys)].join(" and ");
  const forbiddenList = outOfScopeTermsFor(inScopeKeys).join(", ");

  return `You are a world-class batting coach speaking directly to a player, reviewing real measurements from their batting video.

You are given structured facts already computed by a deterministic pipeline: the measured value(s), reference range(s), a severity score, a confidence score, and plain-language root-cause description(s). You do not decide the diagnosis, severity, root cause, or drill — those are fixed before you're called. Your only job is turning them into a clear, specific, coach-voice explanation.

Your primary measurement this time is ${primaryDescription}${secondaryParagraph}

STRICT SCOPE — this is a hard constraint, not a style preference: You may discuss ONLY ${scopeList}. Do NOT mention, infer, or speculate about ${forbiddenList} — none of these were measured this time. Stating anything about an unmeasured marker — even something that sounds plausible — is fabrication, not coaching. If the natural cause of the primary issue would normally involve an unmeasured marker, do not name it; explain the cause and consequence purely in terms of what was actually measured, without inventing an unmeasured mechanical cause elsewhere in the body.

VOICE: Write like an elite, honest coach, not a commentator. Be specific and causal, never generic ("keep working on it" is not acceptable). Never invent a claim not present in the structured input. Age band, batting hand, and playing level (when given) may only calibrate tone and simplicity of language — they must never change the substance, severity, or confidence of what you say.

Return exactly four fields via the tool call, in this order:
1. observation — what was seen, stated as fact, tied directly to the measured number.
2. cause — the likely reason this is happening, framed only in terms of what was actually measured.
3. consequence — the concrete batting outcome this produces (control, contact consistency, scoring options, vulnerability against certain deliveries) — not an abstract statement.
4. correction — ONE short, memorable technical cue the player can hold in mind while batting. A single sentence, not a list.

Do not add drills, success criteria, or any section beyond these four — those are handled elsewhere in the product.`;
}

export interface SecondaryMeasurementContext {
  markerKey: string;
  value: number;
  unit: string;
  rootCauseKey: string;
  rootCauseDescription: string;
}

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
  secondaryMeasurement?: SecondaryMeasurementContext;
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

/**
 * Call site A (docs/06-ai-architecture.md §2) — LLM explains, never decides.
 * Every input field is already computed deterministically upstream; the
 * model only turns them into plain-language prose via a schema-constrained
 * tool call, following the Observation -> Cause -> Consequence -> Correction
 * structure from docs/coaching-philosophy.md. When a secondary measurement
 * is given, the model may note a genuine connection to it — never a
 * scripted assumption, see buildSystemPrompt. Any failure — network, auth,
 * malformed output, or the model naming a marker outside this call's scope
 * — falls back to a deterministic template rather than failing the whole
 * pipeline stage or shipping a fabricated claim.
 */
export async function explainIssue(apiKey: string, input: ExplainInput): Promise<string> {
  const inScopeKeys = input.secondaryMeasurement
    ? [input.markerKey, input.secondaryMeasurement.markerKey]
    : [input.markerKey];

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: EXPLANATION_MODEL,
      max_tokens: 500,
      system: buildSystemPrompt(input.markerKey, input.secondaryMeasurement?.markerKey ?? null),
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
            secondaryMeasurement: input.secondaryMeasurement
              ? {
                  markerKey: input.secondaryMeasurement.markerKey,
                  value: input.secondaryMeasurement.value,
                  unit: input.secondaryMeasurement.unit,
                  rootCause: {
                    key: input.secondaryMeasurement.rootCauseKey,
                    description: input.secondaryMeasurement.rootCauseDescription,
                  },
                }
              : null,
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
                description: "The likely reason, framed only in terms of what was actually measured.",
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

    if (containsOutOfScopeClaim(composed, inScopeKeys)) {
      throw new Error("Model output referenced a marker outside this call's scope; discarding in favor of fallback.");
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
