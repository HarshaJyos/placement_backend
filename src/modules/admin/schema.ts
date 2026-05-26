import { z } from "zod";
import { Role } from "@prisma/client";

export const deactivateUserSchema = z.object({
  reason: z.string().min(5, "Deactivation reason must be at least 5 characters long"),
});

export const listUsersQuerySchema = z.object({
  role: z.enum([
    Role.STUDENT,
    Role.COMPANY_ADMIN,
    Role.PLACEMENT_OFFICER,
    Role.COLLEGE_ADMIN,
    Role.UNIVERSITY_ADMIN,
    Role.SUPER_ADMIN,
  ]).optional(),
  is_active: z.preprocess((val) => {
    if (val === "true") return true;
    if (val === "false") return false;
    return val;
  }, z.boolean().optional()),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const listAuditLogQuerySchema = z.object({
  user_id: z.string().uuid("Invalid user UUID format").optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
