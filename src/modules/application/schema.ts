import { z } from "zod";
import { ApplicationStatus, InterviewRoundType, FeedbackDecision } from "@prisma/client";

export const submitApplicationSchema = z.object({
  job_id: z.string().uuid("Invalid job UUID format"),
  resume_id: z.string().uuid("Invalid resume UUID format"),
  cover_note: z.string().max(1000, "Cover note cannot exceed 1000 characters").optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: z.enum([
    ApplicationStatus.APPLIED,
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.INTERVIEW_SCHEDULED,
    ApplicationStatus.SELECTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ON_HOLD,
  ]),
  remarks: z.string().max(500, "Remarks must be under 500 characters").optional(),
});

export const scheduleInterviewSchema = z.object({
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
});

export const submitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(10),
  remarks: z.string().min(5, "Provide descriptive feedback remarks"),
  decision: z.enum([FeedbackDecision.PASS, FeedbackDecision.FAIL, FeedbackDecision.HOLD]),
});

export const issueOfferSchema = z.object({
  designation: z.string().min(2, "Designation is required"),
  ctc: z.number().positive("CTC must be a positive number"),
  joining_date: z.coerce.date().refine((val) => val > new Date(), {
    message: "Joining date must be in the future",
  }),
  file_url: z.string().min(1, "Offer letter attachment file URL/key is required"),
});

export const respondOfferSchema = z.object({
  is_accepted: z.boolean(),
});

export const applicationSearchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  status: z.enum([
    ApplicationStatus.APPLIED,
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.INTERVIEW_SCHEDULED,
    ApplicationStatus.SELECTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ON_HOLD,
  ]).optional(),
  job_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  college_id: z.string().uuid().optional(),
  sort_by: z.enum(["appliedAt", "updatedAt"]).default("appliedAt"),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
});
