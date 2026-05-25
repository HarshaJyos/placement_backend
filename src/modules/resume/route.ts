import { Router } from "express";
import multer from "multer";
import { resumeController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { requireRole } from "../../lib/rbac";
import { rateLimiter, STANDARD_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateParams } from "../../lib/validate";
import { uploadResumeSchema } from "./schema";
import { Role } from "@prisma/client";
import { z } from "zod";

const router = Router();

// Configure Multer for in-memory PDF uploads (Max 5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const uuidParamSchema = z.object({
  resume_id: z.string().uuid("Invalid resume UUID format"),
});

// 4.1 Upload student resume (limited to Role: STUDENT)
router.post(
  "/",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(STANDARD_LIMIT),
  upload.single("file"),
  validateBody(uploadResumeSchema),
  resumeController.upload
);

// 4.2 List own active resumes (limited to Role: STUDENT)
router.get(
  "/",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(STANDARD_LIMIT),
  resumeController.list
);

// 4.3 Set specific resume as default
router.patch(
  "/:resume_id/set-default",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  resumeController.setDefault
);

// 4.4 Soft-delete specific resume
router.delete(
  "/:resume_id",
  requireAuth,
  requireRole(Role.STUDENT),
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  resumeController.delete
);

// 4.5 Get pre-signed resume download link (accessible by student, recruiters, and TPOMs)
router.get(
  "/:resume_id/download",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  validateParams(uuidParamSchema),
  resumeController.getDownloadUrl
);

export default router;
