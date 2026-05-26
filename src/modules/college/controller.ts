import { Request, Response, NextFunction } from "express";
import { collegeService } from "./service";
import { PlacementStatus } from "@prisma/client";
import { StudentSearchFilter } from "../student/types";

export class CollegeController {
  // Registers a college profile
  async registerCollege(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await collegeService.registerCollege(req.body);
      res.status(201).json({
        success: true,
        college: {
          id: result.id,
          code: result.code,
          is_active: result.isActive,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Resolves college dashboard analytical metrics
  async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { college_id } = req.params;

      const dashboard = await collegeService.getDashboard(
        user.role,
        user.collegeId,
        college_id
      );

      res.status(200).json(dashboard);
    } catch (error) {
      next(error);
    }
  }

  // Adds an academic department
  async addDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { college_id } = req.params;

      const result = await collegeService.addDepartment(
        user.role,
        user.collegeId,
        college_id,
        req.body
      );

      res.status(201).json({
        success: true,
        department: {
          id: result.id,
          name: result.name,
          seat_count: result.seatCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Lists college registered student candidates
  async listStudents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { college_id } = req.params;
      const query = req.query as any;

      let skillIdsArray: string[] | undefined = undefined;
      if (query.skill_ids) {
        skillIdsArray = query.skill_ids.split(",").map((id: string) => id.trim());
      }

      const filters: StudentSearchFilter = {
        limit: query.limit ? parseInt(query.limit) : 20,
        cursor: query.cursor,
        department_id: query.department_id,
        batch_year: query.batch_year ? parseInt(query.batch_year) : undefined,
        min_cgpa: query.min_cgpa ? parseFloat(query.min_cgpa) : undefined,
        max_backlogs: query.max_backlogs ? parseInt(query.max_backlogs) : undefined,
        placement_status: query.placement_status as PlacementStatus | undefined,
        skill_ids: skillIdsArray,
        search: query.search,
        sort_by: query.sort_by,
        sort_order: query.sort_order,
      };

      const result = await collegeService.listStudents(
        user.role,
        user.collegeId,
        college_id,
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

  // Initiates asynchronous non-blocking csv placement report exporting
  async exportReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { college_id } = req.params;

      const result = await collegeService.exportPlacementReport(
        user.id,
        user.role,
        user.collegeId,
        college_id,
        req.query as any
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}
export const collegeController = new CollegeController();
