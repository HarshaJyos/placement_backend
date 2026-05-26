import { z } from "zod";
import { InterviewRoundType, FeedbackDecision } from "@prisma/client";

export const scheduleInterviewSchema = z.object({
  application_id: z.string().uuid("Invalid application UUID format"),
  round_number: z.number().int().positive("Round number must be positive"),
  round_type: z.enum([
    InterviewRoundType.APTITUDE,
    InterviewRoundType.TECHNICAL,
    InterviewRoundType.HR,
    InterviewRoundType.CASE_STUDY,
    InterviewRoundType.GROUP_DISCUSSION,
  ]),
  scheduled_at: z.coerce.date().refine((val) => val > new Date(), {
    message: "Interview scheduled time must be in the future",
  }),
  venue_or_link: z.string().min(2, "Provide a valid venue location or meeting link"),
  notes: z.string().max(1000, "Notes cannot exceed 1000 characters").optional(),
});

export const rescheduleInterviewSchema = z.object({
  new_scheduled_at: z.coerce.date().refine((val) => val > new Date(), {
    message: "Rescheduled time must be in the future",
  }),
  reason: z.string().min(5, "Provide a descriptive reason for rescheduling (min 5 chars)").max(500),
});

export const submitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5, "Rating must be between 1 and 5"),
  remarks: z.string().min(5, "Provide descriptive feedback remarks (min 5 chars)"),
  decision: z.enum([FeedbackDecision.PASS, FeedbackDecision.FAIL, FeedbackDecision.HOLD]),
});
