import { prisma } from "../../lib/db";
import { redisClient } from "../../lib/redis";
import { Notification } from "@prisma/client";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../lib/errors";
import { studentRepository } from "../student/repository";
import { paginate, PaginatedResult } from "../../lib/paginate";

export class NotificationService {
  // Resolves the Redis cache key for unread notifications counts
  private getCacheKey(studentId: string): string {
    return `notifications:unread:student:${studentId}`;
  }

  // Lists notifications filed to the student, using high-performance cursor pagination
  async listNotifications(
    userId: string,
    filters: { is_read?: boolean; limit: number; cursor?: string }
  ): Promise<PaginatedResult<Notification> & { unread_count: number }> {
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      return {
        data: [],
        pagination: { cursor: null, has_next: false, total: 0 },
        unread_count: 0,
      };
    }

    const unreadCount = await this.getUnreadCount(userId);

    const where: any = {
      studentId: student.id,
    };

    if (filters.is_read !== undefined) {
      where.isRead = filters.is_read;
    }

    const baseArgs = {
      where,
    };

    const paginated = await paginate<any>(
      prisma.notification,
      baseArgs,
      {
        limit: filters.limit,
        cursor: filters.cursor,
        sortBy: "createdAt",
        sortOrder: "desc",
      }
    );

    return {
      ...paginated,
      unread_count: unreadCount,
    };
  }

  // Marks a specific notification as read, transactionally clearing/adjusting the Redis unread counter
  async markAsRead(userId: string, notificationId: string): Promise<boolean> {
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      throw new NotFoundError("Student profile context not resolved");
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundError("Notification not found");
    }

    if (notification.studentId !== student.id) {
      throw new ForbiddenError("Access Denied: You do not own this notification record");
    }

    if (!notification.isRead) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      });

      // Clear/Decrement Redis unread counter cache
      try {
        if (redisClient.isOpen) {
          const key = this.getCacheKey(student.id);
          const cached = await redisClient.get(key);
          if (cached) {
            const count = parseInt(cached);
            await redisClient.set(key, Math.max(0, count - 1).toString());
          } else {
            await redisClient.del(key);
          }
        }
      } catch (err) {
        console.error("Failed to decrement notification Redis counter:", err);
      }
    }

    return true;
  }

  // Marks all notifications of this candidate as read
  async markAllAsRead(userId: string): Promise<number> {
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      throw new NotFoundError("Student profile context not resolved");
    }

    const unreads = await prisma.notification.updateMany({
      where: { studentId: student.id, isRead: false },
      data: { isRead: true },
    });

    // Invalidate Redis unread counter cache
    try {
      if (redisClient.isOpen) {
        const key = this.getCacheKey(student.id);
        await redisClient.set(key, "0");
      }
    } catch (err) {
      console.error("Failed to clear notification Redis counter:", err);
    }

    return unreads.count;
  }

  // Retrieves the unread notifications count, prioritizing speed via a Redis cached counter
  async getUnreadCount(userId: string): Promise<number> {
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      return 0;
    }

    const key = this.getCacheKey(student.id);

    // Try reading from Redis cache first
    try {
      if (redisClient.isOpen) {
        const cached = await redisClient.get(key);
        if (cached !== null) {
          return parseInt(cached);
        }
      }
    } catch (err) {
      console.error("Failed to read notification Redis counter:", err);
    }

    // Cache miss: read directly from database count query
    const count = await prisma.notification.count({
      where: { studentId: student.id, isRead: false },
    });

    // Cache count in Redis
    try {
      if (redisClient.isOpen) {
        await redisClient.set(key, count.toString());
      }
    } catch (err) {
      console.error("Failed to cache notification Redis counter:", err);
    }

    return count;
  }
}
export const notificationService = new NotificationService();
