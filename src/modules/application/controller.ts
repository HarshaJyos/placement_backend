import { Request, Response, NextFunction } from "express";
import { applicationService } from "./service";
import { requireRole } from "../../lib/rbac";
import { Role, ApplicationStatus } from "@prisma/client";
import { ForbiddenError, BadRequestError } from "../../lib/errors";
import { studentRepository } from "../student/repository";
import { ApplicationSearchFilter } from "./types";

export class ApplicationController {
  // Submits a candidate job application
  async submit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const app = await applicationService.submitApplication(userId, req.body);
      
      res.status(201).json({
        success: true,
        message: "Job application submitted successfully",
        application: {
          id: app.id,
          job_id: app.jobId,
          resume_id: app.resumeId,
          current_status: app.currentStatus,
          applied_at: app.appliedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Withdraws an application during early stages
  async withdraw(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { application_id } = req.params;

      await applicationService.withdrawApplication(userId, application_id);

      res.status(200).json({
        success: true,
        message: "Application withdrawn successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtains detailed application sheets
  async getDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requesterId = req.user!.id;
      const role = req.user!.role;
      const companyId = req.user!.companyId;
      const { application_id } = req.params;

      const detail = await applicationService.getApplicationDetail(
        application_id,
        requesterId,
        role,
        companyId
      );

      res.status(200).json({
        success: true,
        data: detail,
      });
    } catch (error) {
      next(error);
    }
  }

  // Lists applications filed by the authenticated student
  async listMyApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const query = req.query as any;

      const student = await studentRepository.findByUserId(userId);
      if (!student) {
        throw new BadRequestError("Student profile context not resolved");
      }

      const filters: ApplicationSearchFilter = {
        limit: query.limit ? parseInt(query.limit) : 20,
        cursor: query.cursor,
        status: query.status as ApplicationStatus | undefined,
        student_id: student.id,
        sort_by: "appliedAt",
        sort_order: "desc",
      };

      const result = await applicationService.listApplications(filters);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  // Lists all applications (for recruiters or officers with college boundaries)
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const query = req.query as any;

      let targetCollegeId = query.college_id;
      if (([Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN] as Role[]).includes(user.role)) {
        targetCollegeId = user.collegeId;
      }

      const filters: ApplicationSearchFilter = {
        limit: query.limit ? parseInt(query.limit) : 20,
        cursor: query.cursor,
        status: query.status as ApplicationStatus | undefined,
        job_id: query.job_id,
        student_id: query.student_id,
        college_id: targetCollegeId,
        sort_by: "appliedAt",
        sort_order: "desc",
      };

      const result = await applicationService.listApplications(filters);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  // Modifies application status, checking recruiter boundaries
  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const companyId = req.user!.companyId;
      const { application_id } = req.params;

      await applicationService.updateApplicationStatus(
        application_id,
        userId,
        role,
        companyId,
        req.body
      );

      res.status(200).json({
        success: true,
        message: "Application status successfully updated",
      });
    } catch (error) {
      next(error);
    }
  }

  // Schedules an interview round
  async scheduleInterview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId;
      const { application_id } = req.params;

      if (!companyId) {
        throw new ForbiddenError("Access Denied: Recruiter has no corporate bounds");
      }

      const round = await applicationService.scheduleInterview(
        application_id,
        companyId,
        req.body
      );

      res.status(201).json({
        success: true,
        message: "Interview round scheduled successfully",
        interview_round: round,
      });
    } catch (error) {
      next(error);
    }
  }

  // Submits ratings feedback on an interview round
  async submitFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const interviewerId = req.user!.id;
      const { round_id } = req.params;

      await applicationService.submitFeedback(round_id, interviewerId, req.body);

      res.status(201).json({
        success: true,
        message: "Interview feedback score successfully logged",
      });
    } catch (error) {
      next(error);
    }
  }

  // Issues a formal corporate offer letter
  async issueOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId;
      const { application_id } = req.params;

      if (!companyId) {
        throw new ForbiddenError("Access Denied: Recruiter has no company context");
      }

      const offer = await applicationService.issueOfferLetter(
        application_id,
        companyId,
        req.body
      );

      res.status(201).json({
        success: true,
        message: "Offer letter issued successfully",
        offer: {
          id: offer.id,
          designation: offer.designation,
          ctc: offer.ctc,
          joining_date: offer.joiningDate,
          issued_at: offer.issuedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Candidate response accepting or declining the issued offer
  async respondOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { application_id } = req.params;
      const { is_accepted } = req.body;

      await applicationService.respondToOffer(userId, application_id, is_accepted);

      res.status(200).json({
        success: true,
        message: is_accepted
          ? "Congratulations! You have accepted the offer. Other active application pipelines closed."
          : "You have successfully declined this offer letter.",
      });
    } catch (error) {
      next(error);
    }
  }
}
export const applicationController = new ApplicationController();
