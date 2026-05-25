import { Router } from "express";
import { studentController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { requireRole } from "../../lib/rbac";
import { rateLimiter, STANDARD_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateQuery, validateParams } from "../../lib/validate";
import { completeProfileSchema, studentSearchSchema } from "./schema";
import { Role } from "@prisma/client";
import { z } from "zod";

const router = Router();

// 3.3 List students (paginated & filterable for Placement Officers / recruiters)
router.get(
  "/",
  requireAuth,
  requireRole(Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN, Role.COMPANY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateQuery(studentSearchSchema),
  studentController.listStudents
);

// 3.1 Complete onboarding student profile (students can only modify their own profile)
router.put(
  "/:student_id/profile",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(STANDARD_LIMIT),
  validateParams(z.object({ student_id: z.string().uuid("Invalid student UUID format") })),
  validateBody(completeProfileSchema),
  studentController.completeProfile
);

// 3.4 Fetch student personal dashboard stats
router.get(
  "/:student_id/dashboard",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(STANDARD_LIMIT),
  validateParams(z.object({ student_id: z.string().uuid("Invalid student UUID format") })),
  studentController.getDashboard
);

// 3.2 Get student profile details (recruiter/officer view)
router.get(
  "/:student_id",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(z.object({ student_id: z.string().uuid("Invalid student UUID format") })),
  studentController.getProfile
);

export default router;
