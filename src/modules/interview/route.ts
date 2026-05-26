import { Router } from "express";
import { interviewController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { requireRole } from "../../lib/rbac";
import { rateLimiter, STANDARD_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateParams } from "../../lib/validate";
import {
  scheduleInterviewSchema,
  rescheduleInterviewSchema,
  submitFeedbackSchema,
} from "./schema";
import { Role } from "@prisma/client";
import { z } from "zod";

const router = Router();

const roundIdParamSchema = z.object({
  round_id: z.string().uuid("Invalid interview round UUID format"),
});

// 8.4 Get Upcoming Interviews (student Dashboard)
router.get(
  "/upcoming",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(STANDARD_LIMIT),
  interviewController.getUpcoming
);

// 8.1 Schedule Interview Round
router.post(
  "/",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER),
  rateLimiter(STANDARD_LIMIT),
  validateBody(scheduleInterviewSchema),
  interviewController.scheduleRound
);

// 8.2 Reschedule Interview Round
router.patch(
  "/:round_id/reschedule",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER),
  rateLimiter(STANDARD_LIMIT),
  validateParams(roundIdParamSchema),
  validateBody(rescheduleInterviewSchema),
  interviewController.rescheduleRound
);

// 8.3 Submit Interview Feedback rating scores
router.post(
  "/:round_id/feedback",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateParams(roundIdParamSchema),
  validateBody(submitFeedbackSchema),
  interviewController.submitFeedback
);

export default router;
