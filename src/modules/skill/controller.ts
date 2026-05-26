import { Request, Response, NextFunction } from "express";
import { skillService } from "./service";

export class SkillController {
  // Registers a new corporate skill tag
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await skillService.createSkill(req.body);
      res.status(201).json({
        success: true,
        skill: {
          id: result.id,
          name: result.name,
          category: result.category,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Lists all active corporate skills
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as any;

      const filters = {
        category: query.category,
        search: query.search,
        limit: query.limit ? parseInt(query.limit) : 20,
        cursor: query.cursor,
      };

      const result = await skillService.listSkills(filters);

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
export const skillController = new SkillController();
