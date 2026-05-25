import { z } from "zod";
import { ProficiencyLevel, PlacementStatus } from "@prisma/client";

export const completeProfileSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters long"),
  roll_number: z.string().min(2, "Roll number is required"),
  batch_year: z.number().int().min(2000, "Invalid batch year"),
  cgpa: z.number().min(0.0).max(10.0, "CGPA must be between 0.0 and 10.0"),
  backlogs: z.number().int().nonnegative("Backlogs cannot be negative"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  department_id: z.string().uuid("Invalid department UUID format"),
  linkedin_url: z.string().url("Invalid LinkedIn URL").optional().or(z.literal("")),
  github_url: z.string().url("Invalid GitHub URL").optional().or(z.literal("")),
  portfolio_url: z.string().url("Invalid Portfolio URL").optional().or(z.literal("")),
  bio: z.string().max(1000, "Bio cannot exceed 1000 characters").optional().or(z.literal("")),
  current_city: z.string().min(1, "Current city is required").optional().or(z.literal("")),
  skills: z
    .array(
      z.object({
        skill_id: z.string().uuid("Invalid skill UUID format"),
        proficiency_level: z.enum([
          ProficiencyLevel.BEGINNER,
          ProficiencyLevel.INTERMEDIATE,
          ProficiencyLevel.ADVANCED,
        ]),
      })
    )
    .min(1, "At least one skill is required"),
});

export const studentSearchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  college_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  batch_year: z.coerce.number().int().optional(),
  min_cgpa: z.coerce.number().min(0).max(10).optional(),
  max_backlogs: z.coerce.number().int().optional(),
  placement_status: z.enum([
    PlacementStatus.UNPLACED,
    PlacementStatus.PLACED,
    PlacementStatus.OPTED_OUT,
  ]).optional(),
  skill_ids: z.string().optional(), // split by comma later
  search: z.string().optional(),
  sort_by: z.enum(["cgpa", "createdAt", "fullName"]).default("createdAt"),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
});
