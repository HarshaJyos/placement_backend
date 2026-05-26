import { Request, Response, NextFunction } from "express";
import { interviewService } from "./service";

export class InterviewController {
  // Schedules a new round for a candidate
  async scheduleRound(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const result = await interviewService.scheduleRound(
        user.id,
        user.role,
        user.companyId,
        user.collegeId,
        req.body
      );

      res.status(201).json({
        success: true,
        round: {
          id: result.id,
          round_number: result.roundNumber,
          round_type: result.roundType,
          scheduled_at: result.scheduledAt,
          status: result.status,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Reschedules a pending round
  async rescheduleRound(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { round_id } = req.params;
      const result = await interviewService.rescheduleRound(
        user.id,
        user.role,
        user.companyId,
        user.collegeId,
        round_id,
        req.body
      );

      res.status(200).json({
        success: true,
        round_id: result.id,
        status: result.status,
        new_scheduled_at: result.scheduledAt,
      });
    } catch (error) {
      next(error);
    }
  }

  // Logs feedback scores for an interview round
  async submitFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { round_id } = req.params;
      const result = await interviewService.submitFeedback(
        user.id,
        user.companyId,
        round_id,
        req.body
      );

      res.status(201).json({
        success: true,
        feedback_id: result.feedback_id,
        decision: result.decision,
      });
    } catch (error) {
      next(error);
    }
  }

  // Lists upcoming interview events for student dashboard widgets
  async getUpcoming(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const interviews = await interviewService.getUpcoming(user.id);
      res.status(200).json({
        success: true,
        interviews,
      });
    } catch (error) {
      next(error);
    }
  }
}
export const interviewController = new InterviewController();
