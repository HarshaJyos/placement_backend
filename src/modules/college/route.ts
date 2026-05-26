import { Router } from "express";
import { collegeController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { requireRole } from "../../lib/rbac";
import { rateLimiter, STANDARD_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateQuery, validateParams } from "../../lib/validate";
import { registerCollegeSchema, addDepartmentSchema, exportReportSchema } from "./schema";
import { studentSearchSchema } from "../student/schema";
import { Role } from "@prisma/client";
import { z } from "zod";

const router = Router();

const collegeIdParamSchema = z.object({
  college_id: z.string().uuid("Invalid college UUID format"),
});

// 11.1 Register College (University/Super Admin only)
router.post(
  "/",
  requireAuth,
  requireRole(Role.UNIVERSITY_ADMIN, Role.SUPER_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateBody(registerCollegeSchema),
  collegeController.registerCollege
);

// 11.2 Get College Dashboard (Placement Officers & College Admins)
router.get(
  "/:college_id/dashboard",
  requireAuth,
  requireRole(Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(collegeIdParamSchema),
  collegeController.getDashboard
);

// 11.3 Add Academic Department
router.post(
  "/:college_id/departments",
  requireAuth,
  requireRole(Role.COLLEGE_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(collegeIdParamSchema),
  validateBody(addDepartmentSchema),
  collegeController.addDepartment
);

// 11.4 List College Students (Placement officer Scopes view, maps standard filters)
router.get(
  "/:college_id/students",
  requireAuth,
  requireRole(Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(collegeIdParamSchema),
  validateQuery(studentSearchSchema),
  collegeController.listStudents
);

// 11.5 Export Placement Report (CSV exporting)
router.get(
  "/:college_id/reports/placement",
  requireAuth,
  requireRole(Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN),
  rateLimiter(STANDARD_LIMIT), // Max 1 export/min per user is enforced logically, but rateLimiter rate limits standard requests
  validateParams(collegeIdParamSchema),
  validateQuery(exportReportSchema),
  collegeController.exportReport
);

export default router;
