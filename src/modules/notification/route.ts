import { Router } from "express";
import { notificationController } from "./controller";
import { requireAuth } from "../../lib/auth";
import { rateLimiter, STANDARD_LIMIT, RELAXED_LIMIT } from "../../lib/ratelimit";
import { validateQuery, validateParams } from "../../lib/validate";
import { listNotificationsSchema } from "./schema";
import { z } from "zod";

const router = Router();

const notificationIdParamSchema = z.object({
  notification_id: z.string().uuid("Invalid notification UUID format"),
});

// 13.1 Get My Notifications (ACCESS_TOKEN, STANDARD limit)
router.get(
  "/",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  validateQuery(listNotificationsSchema),
  notificationController.list
);

// 13.4 Get Unread Count for Badge (ACCESS_TOKEN, RELAXED limit, read from Redis)
router.get(
  "/unread-count",
  requireAuth,
  rateLimiter(RELAXED_LIMIT),
  notificationController.getUnreadCount
);

// 13.3 Mark All as Read (ACCESS_TOKEN, STANDARD limit)
router.patch(
  "/read-all",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  notificationController.markAllRead
);

// 13.2 Mark Notification as Read (ACCESS_TOKEN, STANDARD limit)
router.patch(
  "/:notification_id/read",
  requireAuth,
  rateLimiter(STANDARD_LIMIT),
  validateParams(notificationIdParamSchema),
  notificationController.markRead
);

export default router;
