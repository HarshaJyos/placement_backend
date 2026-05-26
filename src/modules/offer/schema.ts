import { z } from "zod";

export const issueOfferSchema = z.object({
  application_id: z.string().uuid("Invalid application UUID format"),
  designation: z.string().min(2, "Designation is required"),
  ctc: z.coerce.number().positive("CTC must be a positive number"),
  joining_date: z.coerce.date().refine((val) => val > new Date(), {
    message: "Joining date must be in the future",
  }),
});

export const respondOfferSchema = z.object({
  accept: z.boolean(),
});
