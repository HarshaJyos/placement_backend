import { z } from "zod";

export const registerCompanySchema = z.object({
  name: z.string().min(2, "Company name must be at least 2 characters long"),
  industry: z.string().min(2, "Industry description is required"),
  website: z.string().url("Invalid company website URL"),
  hq_location: z.string().min(2, "HQ location is required"),
  description: z.string().min(10, "Provide a descriptive company bio"),
  employee_count: z.number().int().nonnegative("Employee count cannot be negative"),
  linkedin_url: z.string().url("Invalid LinkedIn URL").optional().or(z.literal("")),
});

export const updateCompanySchema = registerCompanySchema.partial();

export const verifyCompanySchema = z.object({
  is_verified: z.boolean(),
  verification_note: z.string().max(500, "Verification note must be under 500 characters").optional(),
});

export const companySearchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  industry: z.string().optional(),
  is_verified: z.preprocess((val) => {
    if (val === "true") return true;
    if (val === "false") return false;
    return val;
  }, z.boolean().optional()),
  search: z.string().optional(),
  sort_by: z.enum(["name", "createdAt"]).default("createdAt"),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
});
