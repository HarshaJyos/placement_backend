import { z } from "zod";
import { JobType, JobStatus } from "@prisma/client";

export const jobEligibilitySchema = z.object({
  min_cgpa: z.number().min(0.0).max(10.0, "CGPA must be between 0.0 and 10.0"),
  max_backlogs: z.number().int().nonnegative("Backlogs cannot be negative"),
  allowed_branches: z.array(z.string()).min(1, "Specify at least one allowed branch code"),
  batch_year_from: z.number().int().min(2000, "Invalid batch year"),
  batch_year_to: z.number().int().min(2000, "Invalid batch year"),
});

export const createJobSchemaRaw = z.object({
  placement_drive_id: z.string().uuid("Invalid placement drive UUID format"),
  title: z.string().min(2, "Job title must be at least 2 characters long"),
  job_type: z.enum([JobType.FULL_TIME, JobType.INTERNSHIP, JobType.CONTRACT]),
  location: z.string().min(2, "Location details are required"),
  ctc_min: z.number().nonnegative("Minimum CTC cannot be negative"),
  ctc_max: z.number().nonnegative("Maximum CTC cannot be negative"),
  description: z.string().min(10, "Provide a descriptive job overview"),
  application_deadline: z.coerce.date().refine((val) => val > new Date(), {
    message: "Application deadline must be a future date",
  }),
  max_applications: z.number().int().positive("Maximum applications count must be positive"),
  eligibility: jobEligibilitySchema,
  required_skills: z
    .array(
      z.object({
        skill_id: z.string().uuid("Invalid skill UUID format"),
        is_mandatory: z.boolean().default(true),
      })
    )
    .min(1, "Specify at least one required skill"),
});

export const createJobSchema = createJobSchemaRaw.refine((data) => data.ctc_max >= data.ctc_min, {
  message: "Maximum CTC must be greater than or equal to minimum CTC",
  path: ["ctc_max"],
});

export const updateJobSchema = createJobSchemaRaw.partial();

export const jobSearchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  status: z.enum([JobStatus.DRAFT, JobStatus.OPEN, JobStatus.CLOSED, JobStatus.CANCELLED]).optional(),
  job_type: z.enum([JobType.FULL_TIME, JobType.INTERNSHIP, JobType.CONTRACT]).optional(),
  min_ctc: z.coerce.number().optional(),
  company_id: z.string().uuid().optional(),
  drive_id: z.string().uuid().optional(),
  skill_ids: z.string().optional(), // split by comma
  search: z.string().optional(),
  sort_by: z.enum(["ctcMax", "createdAt", "title"]).default("createdAt"),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
});
