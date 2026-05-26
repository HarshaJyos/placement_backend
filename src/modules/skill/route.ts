import { Router } from "express";
import { skillController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { requireRole } from "../../lib/rbac";
import { rateLimiter, STANDARD_LIMIT, RELAXED_LIMIT } from "../../lib/ratelimit";
import { validateBody, validateQuery } from "../../lib/validate";
import { createSkillSchema, listSkillsSchema } from "./schema";
import { Role } from "@prisma/client";

const router = Router();

// 12.1 List All Skills (ACCESS_TOKEN, RELAXED limit, Redis cached)
router.get(
  "/",
  requireAuth,
  rateLimiter(RELAXED_LIMIT),
  validateQuery(listSkillsSchema),
  skillController.list
);

// 12.2 Create Skill (limited to SUPER_ADMIN & UNIVERSITY_ADMIN, STANDARD limit)
router.post(
  "/",
  requireAuth,
  requireRole(Role.SUPER_ADMIN, Role.UNIVERSITY_ADMIN),
  rateLimiter(STANDARD_LIMIT),
  validateBody(createSkillSchema),
  skillController.create
);

export default router;
