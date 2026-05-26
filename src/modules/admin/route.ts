import { Router } from "express";
import { adminController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { requireRole } from "../../lib/rbac";
import { rateLimiter, STANDARD_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateQuery, validateParams } from "../../lib/validate";
import { deactivateUserSchema, listUsersQuerySchema, listAuditLogQuerySchema } from "./schema";
import { Role } from "@prisma/client";
import { z } from "zod";

const router = Router();

const userIdParamSchema = z.object({
  user_id: z.string().uuid("Invalid user UUID format"),
});

// 14.1 Get Platform Stats (Super Admin clearance only)
router.get(
  "/stats",
  requireAuth,
  requireRole(Role.SUPER_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  adminController.getStats
);

// 14.2 List All Users (Super Admin clearance only)
router.get(
  "/users",
  requireAuth,
  requireRole(Role.SUPER_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateQuery(listUsersQuerySchema),
  adminController.listUsers
);

// 14.3 Deactivate User Account (Super Admin clearance only)
router.patch(
  "/users/:user_id/deactivate",
  requireAuth,
  requireRole(Role.SUPER_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(userIdParamSchema),
  validateBody(deactivateUserSchema),
  adminController.deactivateUser
);

// 14.4 Audit Logs query (Super Admin clearance only)
router.get(
  "/audit-log",
  requireAuth,
  requireRole(Role.SUPER_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateQuery(listAuditLogQuerySchema),
  adminController.listAuditLogs
);

export default router;
