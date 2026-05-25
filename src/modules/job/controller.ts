import { Request, Response, NextFunction } from "express";
import { jobService } from "./service";
import { requireRole } from "../../lib/rbac";
import { Role, ApplicationStatus } from "@prisma/client";
import { BadRequestError, ForbiddenError } from "../../lib/errors";
import { JobSearchFilter } from "./types";
import { jobRepository } from "./repository";

export class JobController {
  // Registers a job posting in DRAFT status
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId;
      if (!companyId) {
        throw new ForbiddenError(
          "Access Denied: Recruiter account must be bound to a verified company to post jobs"
        );
      }

      const job = await jobService.createJob(companyId, req.body);
      res.status(201).json({
        success: true,
        message: "Job posting registered successfully under DRAFT status",
        job: {
          id: job.id,
          title: job.title,
          status: job.status,
          created_at: job.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Publishes a job post, shifting status DRAFT -> OPEN
  async publish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { job_id } = req.params;
      const userId = req.user!.id;
      const role = req.user!.role;
      const companyId = req.user!.companyId;

      await jobService.publishJob(job_id, userId, role, companyId);

      res.status(200).json({
        success: true,
        job_id,
        status: "OPEN",
        message: "Job post successfully published. Candiate alerts queued.",
      });
    } catch (error) {
      next(error);
    }
  }

  // Retrieves detailed specifications of a job posting
  async getJobPost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { job_id } = req.params;
      const user = req.user!;
      const result = await jobService.getJobPostDetail(job_id, user);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Lists all job postings
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as any;
      const user = req.user!;

      let skillIdsArray: string[] | undefined = undefined;
      if (query.skill_ids) {
        skillIdsArray = query.skill_ids.split(",").map((id: string) => id.trim());
      }

      // Dynamic default status filters: standard students view shows OPEN jobs, while recruiters can view all
      let defaultStatus = query.status;
      if (user.role === Role.STUDENT && !defaultStatus) {
        defaultStatus = "OPEN";
      }

      const filters: JobSearchFilter = {
        limit: query.limit,
        cursor: query.cursor,
        status: defaultStatus,
        job_type: query.job_type,
        min_ctc: query.min_ctc,
        company_id: query.company_id,
        drive_id: query.drive_id,
        skill_ids: skillIdsArray,
        search: query.search,
        sort_by: query.sort_by,
        sort_order: query.sort_order,
      };

      const result = await jobService.listJobs(filters, user);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  // Updates job post parameters, validating structural limits on published listings
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { job_id } = req.params;
      const companyId = req.user!.companyId;

      if (!companyId) {
        throw new ForbiddenError("Access Denied: Recruiter account not linked to any company");
      }

      const job = await jobService.updateJob(job_id, companyId, req.body);

      res.status(200).json({
        success: true,
        message: "Job configurations updated successfully",
        job,
      });
    } catch (error) {
      next(error);
    }
  }

  // Terminates application intakes, shifting status OPEN -> CLOSED
  async close(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { job_id } = req.params;
      const userId = req.user!.id;
      const role = req.user!.role;
      const companyId = req.user!.companyId;

      await jobService.closeJob(job_id, userId, role, companyId);

      res.status(200).json({
        success: true,
        job_id,
        status: "CLOSED",
        message: "Job post successfully CLOSED to further applications",
      });
    } catch (error) {
      next(error);
    }
  }

  // Queries all candidate applications submitted for this job
  async getApplicants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { job_id } = req.params;
      const userId = req.user!.id;
      const role = req.user!.role;
      const companyId = req.user!.companyId;
      const query = req.query as any;

      // College boundary verification: Placement officers can only fetch applicants inside their college drives
      if (role === Role.PLACEMENT_OFFICER || role === Role.COLLEGE_ADMIN) {
        const job = await jobRepository.findById(job_id);
        if (!job || job.drive.collegeId !== req.user!.collegeId) {
          throw new ForbiddenError(
            "Access Denied: You cannot inspect applicants for a job outside your college boundaries"
          );
        }
      }

      const filters = {
        status: query.status as ApplicationStatus | undefined,
        minCgpa: query.min_cgpa ? parseFloat(query.min_cgpa) : undefined,
        departmentId: query.department_id as string | undefined,
        limit: query.limit ? parseInt(query.limit) : 20,
        cursor: query.cursor as string | undefined,
      };

      const result = await jobService.getApplicantsList(
        job_id,
        userId,
        role,
        companyId,
        filters
      );

      res.status(200).json({
        success: true,
        job_id,
        total_applicants: result.pagination.total,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
}
export const jobController = new JobController();
