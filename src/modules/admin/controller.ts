import { Request, Response, NextFunction } from "express";
import { adminService } from "./service";
import { Role } from "@prisma/client";

export class AdminController {
  // Resolves platform aggregates stats
  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.getStats();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // Lists all users paginated
  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as any;

      const filters = {
        role: query.role as Role | undefined,
        is_active: query.is_active !== undefined ? query.is_active === true : undefined,
        search: query.search,
        limit: query.limit ? parseInt(query.limit) : 20,
        cursor: query.cursor,
      };

      const result = await adminService.listUsers(filters);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  // Deactivates a user account
  async deactivateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user_id } = req.params;
      const { reason } = req.body;

      await adminService.deactivateUser(user_id, reason);

      res.status(200).json({
        success: true,
        user_id: user_id,
        is_active: false,
      });
    } catch (error) {
      next(error);
    }
  }

  // Resolves audit trails listing
  async listAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as any;

      const filters = {
        user_id: query.user_id,
        action: query.action,
        entity: query.entity,
        from_date: query.from_date,
        to_date: query.to_date,
        limit: query.limit ? parseInt(query.limit) : 20,
        cursor: query.cursor,
      };

      const result = await adminService.listAuditLogs(filters);

      res.status(200).json({
        success: true,
        data: result.data.map((item) => ({
          id: item.id,
          user_id: item.userId,
          action: item.action,
          entity: item.entity,
          entity_id: item.entityId,
          ip: item.ip,
          timestamp: item.timestamp,
        })),
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
}
export const adminController = new AdminController();
