import { Request, Response, NextFunction } from "express";
import { driveService } from "./service";
import { DriveStatus } from "@prisma/client";

export class DriveController {
  // Creates a placement drive draft
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const result = await driveService.createDrive(
        user.id,
        user.role,
        user.collegeId,
        req.body
      );

      res.status(201).json({
        success: true,
        drive: {
          id: result.id,
          title: result.title,
          status: result.status,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Activates a placement drive
  async activate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { drive_id } = req.params;

      const result = await driveService.activateDrive(
        user.role,
        user.collegeId,
        drive_id
      );

      res.status(200).json({
        success: true,
        drive_id: result.id,
        status: result.status,
      });
    } catch (error) {
      next(error);
    }
  }

  // Invites a corporate partner to participate
  async invite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { drive_id } = req.params;

      await driveService.inviteCompany(
        user.role,
        user.collegeId,
        drive_id,
        req.body
      );

      res.status(200).json({
        success: true,
        invitation_sent: true,
      });
    } catch (error) {
      next(error);
    }
  }

  // Resolves drive metrics aggregates
  async getAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { drive_id } = req.params;

      const analytics = await driveService.getDriveAnalytics(
        user.role,
        user.collegeId,
        drive_id
      );

      res.status(200).json(analytics);
    } catch (error) {
      next(error);
    }
  }

  // Lists placement drives
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const query = req.query as any;

      const filters = {
        college_id: query.college_id,
        status: query.status as DriveStatus | undefined,
        limit: query.limit ? parseInt(query.limit) : 20,
        cursor: query.cursor,
      };

      const result = await driveService.listDrives(
        user.role,
        user.collegeId,
        filters
      );

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
}
export const driveController = new DriveController();
