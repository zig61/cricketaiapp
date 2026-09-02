import { z } from "zod";

const measurementSchema = z.object({
  value: z.number(),
  unit: z.string(),
  confidence: z.number(),
  frameCount: z.number(),
  framesWithDetection: z.number(),
});

const battingMeasurementsResponseSchema = z.object({
  headStability: measurementSchema,
  weightTransfer: measurementSchema.nullable(),
  weightTransferSkipReason: z.string().nullable(),
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
