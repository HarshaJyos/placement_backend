import { z } from "zod";

export const listNotificationsSchema = z.object({
  is_read: z.preprocess((val) => {
    if (val === "true") return true;
    if (val === "false") return false;
    return val;
  }, z.boolean().optional()),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
