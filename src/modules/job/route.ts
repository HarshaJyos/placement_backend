import { Router } from "express";
import { jobController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { requireRole } from "../../lib/rbac";
import { rateLimiter, STANDARD_LIMIT, RELAXED_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateQuery, validateParams } from "../../lib/validate";
import { createJobSchema, updateJobSchema, jobSearchSchema } from "./schema";
import { Role } from "@prisma/client";
import { z } from "zod";

const router = Router();

const uuidParamSchema = z.object({
  job_id: z.string().uuid("Invalid job post UUID format"),
});

// 6.4 List jobs (paginated & relaxed limits)
router.get(
  "/",
  requireAuth,
  rateLimiter(RELAXED_LIMIT),
  validateQuery(jobSearchSchema),
  jobController.list
);

// 6.1 Create new job posting under DRAFT status (recruiter exclusive)
router.post(
  "/",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateBody(createJobSchema),
  jobController.create
);

// 6.3 Fetch job post details
router.get(
  "/:job_id",
  requireAuth,
  rateLimiter(RELAXED_LIMIT),
  validateParams(uuidParamSchema),
  jobController.getJobPost
);

// 6.5 Update job configurations (strict draft/structural guards inside service)
router.put(
  "/:job_id",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  validateBody(updateJobSchema),
  jobController.update
);

// 6.2 Publish job post, shifting DRAFT -> OPEN and alerting candidates
router.patch(
  "/:job_id/publish",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  jobController.publish
);

// 6.6 Close applications window
router.patch(
  "/:job_id/close",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  jobController.close
);

// 6.7 Get list of candidate applicants (restricted to company admins and officers)
router.get(
  "/:job_id/applicants",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  jobController.getApplicants
);

export default router;
