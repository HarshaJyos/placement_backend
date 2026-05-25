import { z } from "zod";

export const uploadResumeSchema = z.object({
  version_label: z.string().min(2, "Version label must be at least 2 characters long"),
  is_default: z.coerce.boolean().optional().default(false),
});
