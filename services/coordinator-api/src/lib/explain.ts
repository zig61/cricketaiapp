import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { MEDIUM_CONFIDENCE_CAVEAT } from "./confidence.js";
import { UNVALIDATED_RANGE_MARKERS } from "../pipeline/diagnose.js";

const EXPLANATION_MODEL = "claude-sonnet-5";

const explanationSchema = z.object({
  observation: z.string().min(1),
  cause: z.string().min(1),
  consequence: z.string().min(1),
  correction: z.string().min(1),
});

const neutralObservationSchema = z.object({
  observation: z.string().min(1),
});

const MARKER_DESCRIPTIONS: Record<string, string> = {
  head_stability:
    "head_stability — how far the player's head drifts sideways away from the ball line during the shot, in centimeters.",
  balance_weight_transfer:
    "balance_weight_transfer — how far the player's hips move toward their front foot during the shot, as a percentage of their own stance width (0% = no transfer at all, 100% = hips reached the front foot's line, more than 100% means the hips moved PAST the front foot — overbalanced, a loss of control in the other direction from insufficient transfer).",
};

// Deliberately different wording from MARKER_DESCRIPTIONS above: that
// version already frames the measurement in verdict terms ("drifts sideways
// AWAY from the ball line") — appropriate for the normal diagnosis path,
// wrong for UNVALIDATED_RANGE_MARKERS, which must describe only what's
// measured, not which direction is bad.
// head_stability's wording deliberately avoids the literal phrase "weight
// transfer" -- that's balance_weight_transfer's own plain term (see
// MARKER_KEY_TO_PLAIN_TERM below), forbidden when head_stability alone is
// in scope. A real live run (2026-09-09) showed the model reliably echoing
// that exact phrase back when the briefing itself used it, tripping
// containsOutOfScopeClaim on nearly every call and silently discarding a
// perfectly good response in favor of the plainer fallback template.
const NEUTRAL_MARKER_DESCRIPTIONS: Record<string, string> = {
  head_stability:
    "head_stability — how far the player's head moves relative to their hips during the shot, isolated from the forward body motion expected as the front foot takes the player's weight, in centimeters.",
  balance_weight_transfer:
    "balance_weight_transfer — how far the player's hips move toward their front foot during the shot, as a percentage of their own stance width.",
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

/**
 * For UNVALIDATED_RANGE_MARKERS only (see diagnose.ts): report the
 * measurement plainly, with no verdict, cause, consequence, correction, or
 * drill — the reference range this marker would be judged against isn't
 * validated yet (2026-09-09), so there's nothing trustworthy to build a
 * diagnosis on top of. Root cause and severity are deliberately never
 * passed to the model here — doing so would invite exactly the
 * cause/consequence framing this path exists to avoid.
 */
function buildNeutralSystemPrompt(markerKey: string): string {
  const description = NEUTRAL_MARKER_DESCRIPTIONS[markerKey] ?? markerKey;

  return `You are a batting coach reporting a real measurement from a player's video directly to them.

This measurement's reference range has NOT been validated against real coaching or biomechanics data yet — we trust the number itself (it's measured directly from the video), but we do not yet know what value counts as good or bad for this specific metric. Your job is to report the measurement plainly and factually, in a confident, informative tone — WITHOUT framing it as a problem, fault, issue, or anything needing correction.

The measurement is ${description}

STRICT RULES:
- State the measured number and what it represents, plainly and with full confidence in the number itself.
- Do NOT use words like "problem", "issue", "fault", "wrong", "poor", "concern", or similar judgment language.
- Do NOT claim or imply the value is outside a healthy/stable/normal range, or pass any verdict on it either way.
- Do NOT suggest a correction, drill, technique fix, or next step.
- Do NOT mention severity, root cause, or consequences for batting performance — none of that is validated for this metric yet.
- Age band, batting hand, and playing level (when given) may only calibrate tone/language, never the substance.

Return exactly one field via the tool call: "observation" — 1-2 sentences, reporting the number and what it measures, in a neutral, informative tone. Nothing else.`;
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
  /**
   * The primary issue's confidence level (see pose.py's classify_confidence
   * / the 2026-09-06 confidence-gating plan). "low" should never actually
   * reach explainIssue in practice — a LOW-confidence measurement is
   * already excluded from becoming a diagnose candidate before explain is
   * ever called — but the type stays honest about all three rather than
   * silently assuming the caller enforced that.
   */
  confidenceLevel: "high" | "medium" | "low";
}

function fallbackExplanation(input: ExplainInput): string {
  return (
    `${input.markerKey.replace(/_/g, " ")} was measured at ${input.value}${input.unit}, ` +
    `outside the typical range of ${input.referenceRange[0]}-${input.referenceRange[1]}${input.unit}. ` +
    `This is linked to: ${input.rootCauseDescription}`
  );
}

/**
 * Fallback for UNVALIDATED_RANGE_MARKERS when the Claude call fails —
 * same neutral, no-verdict framing as buildNeutralSystemPrompt, since a
 * template fallback shouldn't say anything the model itself was told not
 * to say. Deliberately doesn't mention "outside the typical range of..."
 * the way fallbackExplanation does — that phrasing itself implies a
 * verdict against a range that isn't validated.
 */
function neutralFallbackExplanation(input: ExplainInput): string {
  return `${input.markerKey.replace(/_/g, " ")} measured at ${input.value}${input.unit}.`;
}

function composeExplanation(parsed: z.infer<typeof explanationSchema>): string {
  return [parsed.observation, parsed.cause, parsed.consequence, parsed.correction].join(" ");
}

/**
 * Applied to whatever explainIssue is about to return — Claude-generated
 * or the deterministic fallback alike — rather than only one path, so a
 * MEDIUM-confidence result always carries the caveat regardless of
 * whether the LLM call itself succeeded. Appended in code, not left to
 * the LLM's own prompt-following, for the same reason the out-of-scope
 * guard exists: an instruction is encouragement, not a guarantee.
 */
function applyConfidenceCaveat(text: string, confidenceLevel: ExplainInput["confidenceLevel"]): string {
  return confidenceLevel === "medium" ? `${text} ${MEDIUM_CONFIDENCE_CAVEAT}` : text;
}

/**
 * Public entry point — dispatches to whichever of the two explanation
 * styles below applies. See UNVALIDATED_RANGE_MARKERS (diagnose.ts) for
 * why the split exists: a marker whose reference range isn't validated
 * gets a neutral measurement report, never a diagnosed-issue verdict.
 */
export async function explainIssue(apiKey: string, input: ExplainInput): Promise<string> {
  if (UNVALIDATED_RANGE_MARKERS.has(input.markerKey)) {
    return explainNeutralMeasurement(apiKey, input);
  }
  return explainDiagnosedIssue(apiKey, input);
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
 *
 * Exported (alongside explainNeutralMeasurement) so tests can exercise this
 * path directly with a realistic, well-known marker key, independent of
 * whether that key happens to be in UNVALIDATED_RANGE_MARKERS today — the
 * two paths' internal logic is tested separately from explainIssue's
 * routing decision.
 */
export async function explainDiagnosedIssue(apiKey: string, input: ExplainInput): Promise<string> {
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

    return applyConfidenceCaveat(composed, input.confidenceLevel);
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
    return applyConfidenceCaveat(fallbackExplanation(input), input.confidenceLevel);
  }
}

/**
 * The UNVALIDATED_RANGE_MARKERS path — see buildNeutralSystemPrompt for
 * why root cause/severity are never passed to the model, and
 * neutralFallbackExplanation for why the failure-path template doesn't use
 * fallbackExplanation's "outside the typical range of..." wording either.
 * No confidence caveat is applied here even at MEDIUM: the caveat exists to
 * flag a shaky *verdict*, and this path never states one.
 */
export async function explainNeutralMeasurement(apiKey: string, input: ExplainInput): Promise<string> {
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: EXPLANATION_MODEL,
      max_tokens: 300,
      system: buildNeutralSystemPrompt(input.markerKey),
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            player: input.player,
            measurement: {
              markerKey: input.markerKey,
              value: input.value,
              unit: input.unit,
            },
            confidence: input.confidence,
          }),
        },
      ],
      tools: [
        {
          name: "report_measurement",
          description: "Report a single measurement plainly, without a verdict.",
          input_schema: {
            type: "object",
            properties: {
              observation: {
                type: "string",
                description: "1-2 sentences, neutral, no verdict.",
              },
            },
            required: ["observation"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_measurement" },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error("No tool_use block in Claude's response.");
    }

    const parsed = neutralObservationSchema.parse(toolUse.input);

    if (containsOutOfScopeClaim(parsed.observation, [input.markerKey])) {
      throw new Error("Model output referenced a marker outside this call's scope; discarding in favor of fallback.");
    }

    return parsed.observation;
  } catch (err) {
    const cause = err instanceof Error ? (err.cause as Error | undefined) : undefined;
    console.error("explainNeutralMeasurement: falling back to template.", {
      name: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
      causeName: cause?.name,
      causeCode: (cause as { code?: string } | undefined)?.code,
      causeMessage: cause?.message,
    });
    return neutralFallbackExplanation(input);
  }
}
