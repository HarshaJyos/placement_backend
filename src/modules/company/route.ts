import { Router } from "express";
import multer from "multer";
import { companyController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { requireRole } from "../../lib/rbac";
import { rateLimiter, STANDARD_LIMIT, RELAXED_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateQuery, validateParams } from "../../lib/validate";
import {
  registerCompanySchema,
  updateCompanySchema,
  verifyCompanySchema,
  companySearchSchema,
} from "./schema";
import { Role } from "@prisma/client";
import { z } from "zod";

const router = Router();

// Configure Multer memory limit (Max 1MB logo)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024,
  },
});

const uuidParamSchema = z.object({
  company_id: z.string().uuid("Invalid company UUID format"),
});

// 5.6 List companies (relaxed limits, open to authenticated sessions)
router.get(
  "/",
  requireAuth,
  rateLimiter(RELAXED_LIMIT),
  validateQuery(companySearchSchema),
  companyController.list
);

// 5.1 Register a new company (limited to Role: COMPANY_ADMIN)
router.post(
  "/",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateBody(registerCompanySchema),
  companyController.register
);

// 5.2 Fetch company profile details (relaxed limits)
router.get(
  "/:company_id",
  requireAuth,
  rateLimiter(RELAXED_LIMIT),
  validateParams(uuidParamSchema),
  companyController.getProfile
);

// 5.3 Update company profile attributes
router.put(
  "/:company_id",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  validateBody(updateCompanySchema),
  companyController.update
);

// 5.4 Upload corporate logo (JPEG, PNG, WebP)
router.post(
  "/:company_id/logo",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  upload.single("file"),
  companyController.uploadLogo
);

// 5.5 Verify company profile (Admin clearance only)
router.patch(
  "/:company_id/verify",
  requireAuth,
  requireRole(Role.SUPER_ADMIN, Role.UNIVERSITY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  validateBody(verifyCompanySchema),
  companyController.verify
);

export default router;
