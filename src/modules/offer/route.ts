import { Router } from "express";
import multer from "multer";
import { offerController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { requireRole } from "../../lib/rbac";
import { rateLimiter, STANDARD_LIMIT, STRICT_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateParams } from "../../lib/validate";
import { issueOfferSchema, respondOfferSchema } from "./schema";
import { Role } from "@prisma/client";
import { z } from "zod";

const router = Router();

// Configure Multer for PDF file buffer memory limits (Max 5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const offerIdParamSchema = z.object({
  offer_id: z.string().uuid("Invalid offer letter UUID format"),
});

// 9.1 Issue Offer Letter (limited to COMPANY_ADMIN, processes multipart files)
router.post(
  "/",
  requireAuth,
  requireRole(Role.COMPANY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  upload.single("file"),
  validateBody(issueOfferSchema),
  offerController.issueOffer
);

// 9.2 Accept or Decline Offer Letter (limited to student owner, STRICT rate limits)
router.patch(
  "/:offer_id/respond",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(STRICT_LIMIT),
  validateParams(offerIdParamSchema),
  validateBody(respondOfferSchema),
  offerController.respondOffer
);

// 9.3 Download Offer Letter (1hr presigned download link)
router.get(
  "/:offer_id/download",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  validateParams(offerIdParamSchema),
  offerController.downloadOffer
);

export default router;
