import { Router } from "express";
import { authController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { rateLimiter, STRICT_LIMIT, STANDARD_LIMIT } from "../../lib/ratelimit";
import {
  validateBody,
  validateParams,
} from "../../lib/validate";
import {
  initiateRegisterSchema,
  verifyRegisterSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "./schema";
import { z } from "zod";

const router = Router();

// 1.1 Initiate Registration (OTP sent via background BullMQ)
router.post(
  "/register/initiate",
  rateLimiter(STRICT_LIMIT),
  validateBody(initiateRegisterSchema),
  authController.initiateRegister
);

// 1.2 Complete OTP registration validation
router.post(
  "/register/verify",
  rateLimiter(STRICT_LIMIT),
  validateBody(verifyRegisterSchema),
  authController.verifyRegister
);

// 1.3 User Login
router.post(
  "/login",
  rateLimiter(STRICT_LIMIT),
  validateBody(loginSchema),
  authController.login
);

// 1.4 Refresh Token Rotation
router.post(
  "/refresh",
  rateLimiter(STANDARD_LIMIT),
  authController.refresh
);

// 1.5 Account Logout
router.post(
  "/logout",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  authController.logout
);

// 1.6 Forgot Password link initiation
router.post(
  "/password/forgot",
  rateLimiter(STRICT_LIMIT),
  validateBody(forgotPasswordSchema),
  authController.forgotPassword
);

// 1.7 Reset Password with token
router.post(
  "/password/reset",
  rateLimiter(STRICT_LIMIT),
  validateBody(resetPasswordSchema),
  authController.resetPassword
);

// 1.8 Change password from authenticated session
router.post(
  "/password/change",
  requireAuth,
  rateLimiter(STRICT_LIMIT),
  validateBody(changePasswordSchema),
  authController.changePassword
);

// 1.9 Current session profile details
router.get(
  "/me",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  authController.me
);

// 1.10 List active sessions across all devices
router.get(
  "/sessions",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  authController.listSessions
);

// 1.11 Revoke a specific active session
router.delete(
  "/sessions/:session_id",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  validateParams(z.object({ session_id: z.string().uuid("Invalid session UUID format") })),
  authController.revokeSession
);

export default router;
