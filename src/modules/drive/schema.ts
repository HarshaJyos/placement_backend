import { z } from "zod";
import { DriveStatus } from "@prisma/client";

export const createDriveSchema = z.object({
  college_id: z.string().uuid("Invalid college UUID format"),
  title: z.string().min(3, "Title must be at least 3 characters long"),
  start_date: z.coerce.date(),
  end_date: z.coerce.date().refine((val) => val > new Date(), {
    message: "End date must be in the future",
  }),
  description: z.string().min(5, "Description must be at least 5 characters long"),
});

export const inviteCompanySchema = z.object({
  company_id: z.string().uuid("Invalid company UUID format"),
  message: z.string().min(5, "Provide an invitation message (min 5 chars)"),
  proposed_date_range: z.string().min(5, "Proposed date range is required"),
});

export const listDrivesQuerySchema = z.object({
  college_id: z.string().uuid("Invalid college UUID format").optional(),
  status: z.enum([
    DriveStatus.DRAFT,
    DriveStatus.ACTIVE,
    DriveStatus.COMPLETED,
    DriveStatus.CANCELLED,
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
