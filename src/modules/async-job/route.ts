import { Router } from "express";
import { asyncJobController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { rateLimiter, RELAXED_LIMIT } from "../../lib/ratelimit";
import { validateParams } from "../../lib/validate";
import { z } from "zod";

const router = Router();

const jobIdParamSchema = z.object({
  job_id: z.string().min(1, "Job ID is required"),
});

// 15.1 Poll Async Job Status (ACCESS_TOKEN, RELAXED rate limits)
router.get(
  "/:job_id/status",
  requireAuth,
  rateLimiter(RELAXED_LIMIT),
  validateParams(jobIdParamSchema),
  asyncJobController.getStatus
);

export default router;
