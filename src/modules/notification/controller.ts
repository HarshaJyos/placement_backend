import { Request, Response, NextFunction } from "express";
import { notificationService } from "./service";

export class NotificationController {
  // Lists student notifications
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const query = req.query as any;

      const filters = {
        is_read: query.is_read !== undefined ? query.is_read === true : undefined,
        limit: query.limit ? parseInt(query.limit) : 20,
        cursor: query.cursor,
      };

      const result = await notificationService.listNotifications(user.id, filters);

      res.status(200).json({
        success: true,
        unread_count: result.unread_count,
        data: result.data.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          body: item.body,
          is_read: item.isRead,
          ref_entity: item.refEntity,
          ref_entity_id: item.refEntityId,
          created_at: item.createdAt,
        })),
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  // Marks a notification as read
  async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { notification_id } = req.params;

      await notificationService.markAsRead(user.id, notification_id);

      res.status(200).json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  // Marks all notifications of this candidate as read
  async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const count = await notificationService.markAllAsRead(user.id);

      res.status(200).json({
        success: true,
        updated_count: count,
      });
    } catch (error) {
      next(error);
    }
  }

  // Fetches unread count
  async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const count = await notificationService.getUnreadCount(user.id);

      res.status(200).json({
        unread_count: count,
      });
    } catch (error) {
      next(error);
    }
  }
}
export const notificationController = new NotificationController();
