import { z } from "zod";

const headStabilityResponseSchema = z.object({
  value: z.number(),
  unit: z.string(),
  confidence: z.number(),
  frameCount: z.number(),
  framesWithDetection: z.number(),
});

export type HeadStabilityResult = z.infer<typeof headStabilityResponseSchema>;

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
 * Calls the cv-service's single-marker head-stability endpoint. Stateless on
 * both ends — cv-service downloads the video itself from the signed URL.
 */
export async function requestHeadStability(
  cvServiceUrl: string,
  videoUrl: string,
): Promise<HeadStabilityResult> {
  const response = await fetch(`${cvServiceUrl}/measurements/head-stability`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_url: videoUrl }),
  });

  const body: unknown = await response.json();
  if (!response.ok) {
    throw new CvServiceError(response.status, body);
  }

  return headStabilityResponseSchema.parse(body);
}
