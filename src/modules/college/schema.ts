import { z } from "zod";

export const registerCollegeSchema = z.object({
  university_id: z.string().uuid("Invalid university UUID format"),
  name: z.string().min(3, "College name must be at least 3 characters"),
  code: z.string().min(2, "College code must be at least 2 characters"),
  address: z.string().min(5, "College address must be at least 5 characters"),
  tpo_email: z.string().email("Invalid TPO email format"),
});

export const addDepartmentSchema = z.object({
  name: z.string().min(3, "Department name must be at least 3 characters"),
  code: z.string().min(2, "Department code must be at least 2 characters"),
  seat_count: z.number().int().positive("Seat count must be a positive integer"),
});

export const exportReportSchema = z.object({
  drive_id: z.string().uuid("Invalid drive UUID format").optional(),
  batch_year: z.coerce.number().int().positive("Batch year must be a positive integer").optional(),
  format: z.enum(["csv", "xlsx"]).default("csv"),
});
