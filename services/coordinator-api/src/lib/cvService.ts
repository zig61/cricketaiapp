import { z } from "zod";

// The three components `confidence` is built from (2026-09-06 confidence-gating
// pass) — visibility alone used to be the entire signal, which is exactly
// what let a geometrically-nonsensical measurement (0.27cm base width,
// ~97% visibility) look fully trustworthy. overallScore is min() of the
// three, not a weighted average, so one bad component can't be diluted.
const confidenceBreakdownSchema = z.object({
  visibilityScore: z.number(),
  consistencyScore: z.number(),
  geometryScore: z.number(),
  overallScore: z.number(),
  level: z.enum(["high", "medium", "low"]),
});

const measurementSchema = z.object({
  value: z.number(),
  unit: z.string(),
  confidence: z.number(),
  confidenceBreakdown: confidenceBreakdownSchema,
  frameCount: z.number(),
  framesWithDetection: z.number(),
});

export type ConfidenceBreakdown = z.infer<typeof confidenceBreakdownSchema>;

// Always present, even when weightTransfer succeeds — lets a null result
// be debugged (ankles never detected vs. detected but just below the
// confidence bar, vs. an implausibly narrow stance width) without
// re-running anything against the live service.
const weightTransferDiagnosticsSchema = z.object({
  totalSampledFrames: z.number(),
  framesWithHipsOk: z.number(),
  framesWithFrontAnkleOk: z.number(),
  framesWithBackAnkleOk: z.number(),
  framesWithBothAnklesOk: z.number(),
  meanFrontAnkleVisibility: z.number(),
  meanBackAnkleVisibility: z.number(),
  baselineBaseWidthM: z.number().nullable(),
});

const battingMeasurementsResponseSchema = z.object({
  headStability: measurementSchema,
  weightTransfer: measurementSchema.nullable(),
  weightTransferSkipReason: z.string().nullable(),
  weightTransferDiagnostics: weightTransferDiagnosticsSchema.nullable(),
});

export type Measurement = z.infer<typeof measurementSchema>;
export type BattingMeasurementsResult = z.infer<typeof battingMeasurementsResponseSchema>;

export class CvServiceError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`cv-service returned ${status}`);
    this.name = "CvServiceError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Calls cv-service's combined batting-measurements endpoint. Stateless on
 * both ends — cv-service downloads the video itself from the signed URL.
 * One call, one pose-estimation pass: cv-service always returns
 * head_stability, and returns weight_transfer only when battingHand was
 * given and ankles were detected confidently enough (weightTransfer is
 * null otherwise — a valid outcome, not an error, see
 * weightTransferSkipReason).
 */
export async function requestBattingMeasurements(
  cvServiceUrl: string,
  videoUrl: string,
  battingHand: "left" | "right" | null,
): Promise<BattingMeasurementsResult> {
  const response = await fetch(`${cvServiceUrl}/measurements/batting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_url: videoUrl, batting_hand: battingHand }),
  });

  const body: unknown = await response.json();
  if (!response.ok) {
    throw new CvServiceError(response.status, body);
  }

  return battingMeasurementsResponseSchema.parse(body);
}
