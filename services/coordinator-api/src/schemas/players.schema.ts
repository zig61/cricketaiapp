import { z } from "zod";

// DELETE /players/me
export const deleteAccountSchema = z.object({
  confirm: z.literal(true),
});
export type DeleteAccountBody = z.infer<typeof deleteAccountSchema>;
