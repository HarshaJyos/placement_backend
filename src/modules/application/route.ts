import { Router } from "express";
import { applicationController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { requireRole } from "../../lib/rbac";
import { rateLimiter, STANDARD_LIMIT, RELAXED_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateQuery, validateParams } from "../../lib/validate";
import {
  submitApplicationSchema,
  updateApplicationStatusSchema,
  scheduleInterviewSchema,
  submitFeedbackSchema,
  issueOfferSchema,
  respondOfferSchema,
  applicationSearchSchema,
  bulkUpdateApplicationStatusSchema,
} from "./schema";
import { Role } from "@prisma/client";
import { z } from "zod";

const router = Router();

const uuidParamSchema = z.object({
  application_id: z.string().uuid("Invalid application UUID format"),
});

// 7.4 List my applications (limited to Role: STUDENT)
router.get(
  "/mine",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(RELAXED_LIMIT),
  applicationController.listMyApplications
);

// 7.5 List applications (accessible by Corporate recruiters & Placement Officers)
router.get(
  "/",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN),
  rateLimiter(RELAXED_LIMIT),
  validateQuery(applicationSearchSchema),
  applicationController.list
);

// 7.1 Submit new job application (limited to Role: STUDENT)
router.post(
  "/",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(STANDARD_LIMIT),
  validateBody(submitApplicationSchema),
  applicationController.submit
);

// 7.3 Fetch application detail sheets (accessible by student owner or hiring team)
router.get(
  "/:application_id",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  applicationController.getDetail
);

// 7.2 Withdraw job application
router.patch(
  "/:application_id/withdraw",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  applicationController.withdraw
);

// 7.5 Bulk Update Application Status (company/officer)
router.patch(
  "/bulk-status",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER),
  rateLimiter(STANDARD_LIMIT),
  validateBody(bulkUpdateApplicationStatusSchema),
  applicationController.bulkUpdateStatus
);

// 7.6 Update application hiring stage (APPLIED -> UNDER_REVIEW -> SHORTLISTED, etc.)
router.patch(
  "/:application_id/status",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  validateBody(updateApplicationStatusSchema),
  applicationController.updateStatus
);

// 7.7 Schedule a new interview round
router.post(
  "/:application_id/interviews",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  validateBody(scheduleInterviewSchema),
  applicationController.scheduleInterview
);

// 7.8 Submit feedback rating & comments on a specific interview round
router.post(
  "/interviews/:round_id/feedback",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(z.object({ round_id: z.string().uuid("Invalid interview round UUID format") })),
  validateBody(submitFeedbackSchema),
  applicationController.submitFeedback
);

// 7.9 Issue formal corporate offer letter
router.post(
  "/:application_id/offer",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  validateBody(issueOfferSchema),
  applicationController.issueOffer
);

// 7.10 Candidate responds to the issued corporate offer letter
router.patch(
  "/:application_id/offer/respond",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  validateBody(respondOfferSchema),
  applicationController.respondOffer
);

export default router;
