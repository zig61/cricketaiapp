import { z } from "zod";

// POST /videos
export const createVideoSchema = z
  .object({
    kind: z.enum(["initial", "followup"]),
    linkedIssueId: z.string().uuid().nullable(),
  })
  .superRefine((body, ctx) => {
    if (body.kind === "followup" && body.linkedIssueId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "linkedIssueId is required when kind is 'followup'.",
        path: ["linkedIssueId"],
      });
    }
  });
export type CreateVideoBody = z.infer<typeof createVideoSchema>;

// POST /videos/:videoId/confirm-upload
export const confirmUploadSchema = z.object({
  durationSeconds: z.number().positive(),
});
export type ConfirmUploadBody = z.infer<typeof confirmUploadSchema>;

export const videoIdParamsSchema = z.object({
  videoId: z.string().uuid(),
});
export type VideoIdParams = z.infer<typeof videoIdParamsSchema>;

// GET /players/me/history
export const historyQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
