import { Request, Response, NextFunction } from "express";
import { asyncJobService } from "./service";

export class AsyncJobController {
  // Retrieves status of background jobs
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { job_id } = req.params;
      const result = await asyncJobService.getJobStatus(job_id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}
export const asyncJobController = new AsyncJobController();
