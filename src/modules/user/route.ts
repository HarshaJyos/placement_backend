import { Router } from "express";
import multer from "multer";
import { userController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { rateLimiter, STRICT_LIMIT, STANDARD_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateParams } from "../../lib/validate";
import { updateEmailInitiateSchema, updateEmailConfirmSchema } from "./schema";
import { z } from "zod";

const router = Router();

// Configure Multer memory storage engine
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
});

// 2.1 Fetch user profile details (requires ownership or administrative roles)
router.get(
  "/:user_id/profile",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  validateParams(z.object({ user_id: z.string().uuid("Invalid user UUID format") })),
  userController.getProfile
);

// 2.2 Initiate email alteration OTP
router.post(
  "/email/change/initiate",
  requireAuth,
  rateLimiter(STRICT_LIMIT),
  validateBody(updateEmailInitiateSchema),
  userController.initiateEmailChange
);

// 2.3 Confirm email alteration OTP and commit changes
router.post(
  "/email/change/confirm",
  requireAuth,
  rateLimiter(STRICT_LIMIT),
  validateBody(updateEmailConfirmSchema),
  userController.confirmEmailChange
);

// 2.4 Upload new avatar picture (JPEG, PNG, or WebP)
router.post(
  "/avatar",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  upload.single("file"),
  userController.uploadAvatar
);

export default router;
