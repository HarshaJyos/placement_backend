import { Router } from "express";
import { driveController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { requireRole } from "../../lib/rbac";
import { rateLimiter, STANDARD_LIMIT, RELAXED_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateQuery, validateParams } from "../../lib/validate";
import { createDriveSchema, inviteCompanySchema, listDrivesQuerySchema } from "./schema";
import { Role } from "@prisma/client";
import { z } from "zod";

const router = Router();

const driveIdParamSchema = z.object({
  drive_id: z.string().uuid("Invalid placement drive UUID format"),
});

// 10.5 List Placement Drives (ACCESS_TOKEN, RELAXED limits)
router.get(
  "/",
  requireAuth,
  rateLimiter(RELAXED_LIMIT),
  validateQuery(listDrivesQuerySchema),
  driveController.list
);

// 10.1 Create Placement Drive Draft (Placement Officer & College Admin only)
router.post(
  "/",
  requireAuth,
  requireRole(Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateBody(createDriveSchema),
  driveController.create
);

// 10.2 Activate Drive
router.patch(
  "/:drive_id/activate",
  requireAuth,
  requireRole(Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(driveIdParamSchema),
  driveController.activate
);

// 10.3 Invite Company to Drive
router.post(
  "/:drive_id/invite",
  requireAuth,
  requireRole(Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(driveIdParamSchema),
  validateBody(inviteCompanySchema),
  driveController.invite
);

// 10.4 Get Drive Analytics (pre-aggregated analytics views)
router.get(
  "/:drive_id/analytics",
  requireAuth,
  requireRole(Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN, Role.UNIVERSITY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(driveIdParamSchema),
  driveController.getAnalytics
);

export default router;
