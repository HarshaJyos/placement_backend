import { JobPost, JobStatus, Application, ApplicationStatus, Role } from "@prisma/client";
import { jobRepository } from "./repository";
import { studentRepository } from "../student/repository";
import { CreateJobPostDTO, UpdateJobPostDTO, JobSearchFilter } from "./types";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  UnprocessableError,
} from "../../lib/errors";
import { prisma } from "../../lib/db";
import { getDownloadPresignedUrl } from "../../lib/storage";
import { addJobToQueue } from "../../lib/queue";
import { PaginatedResult } from "../../lib/paginate";

export class JobService {
  // Creates a job post under DRAFT status
  async createJob(companyId: string, data: CreateJobPostDTO): Promise<JobPost> {
    // Verify placement drive exists
    const drive = await prisma.placementDrive.findUnique({
      where: { id: data.placement_drive_id },
    });
    if (!drive) {
      throw new NotFoundError("Placement drive not found");
    }

    return jobRepository.createJob(companyId, data);
  }

  // Publishes a job post, shifting status DRAFT -> OPEN, and offloads notifications
  async publishJob(
    jobId: string,
    userId: string,
    userRole: Role,
    userCompanyId: string | null
  ): Promise<void> {
    const job = await jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundError("Job post not found");
    }

    // Clearance check: Must be the job owner company or college placement officer managing the drive
    const isOwner = userRole === Role.COMPANY_ADMIN && job.companyId === userCompanyId;
    const isOfficer = userRole === Role.PLACEMENT_OFFICER && job.drive.collegeId === job.drive.collegeId; // matching officer college

    if (!isOwner && !isOfficer) {
      throw new ForbiddenError("Access Denied: You do not have clearance to publish this job post");
    }

    // State machine: Only allowed to transition from DRAFT to OPEN
    if (job.status !== JobStatus.DRAFT) {
      throw new UnprocessableError(
        `Invalid State Transition: Cannot publish job in status '${job.status}'`
      );
    }

    await jobRepository.updateStatus(jobId, JobStatus.OPEN);

    // Offload notification triggers to background worker queue
    await addJobToQueue("BULK_NOTIFY", {
      type: "JOB_PUBLISHED",
      jobId: job.id,
      title: job.title,
      companyName: job.company.name,
      collegeId: job.drive.collegeId,
    });
  }

  // Resolves a job post, computing student-specific eligibility and application counts
  async getJobPostDetail(jobId: string, reqUser: { id: string; role: Role }): Promise<any> {
    const job = await jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundError("Job post not found");
    }

    const applicantCount = await prisma.application.count({
      where: { jobId, isActive: true },
    });

    let hasApplied = false;
    let isEligible = true;

    if (reqUser.role === Role.STUDENT) {
      const student = await studentRepository.findByUserId(reqUser.id);
      if (student) {
        // Check if student has already applied
        const appCount = await prisma.application.count({
          where: {
            jobId,
            studentId: student.id,
            isActive: true,
          },
        });
        hasApplied = appCount > 0;

        // Check eligibility constraints on-the-fly
        isEligible = this.checkStudentEligibility(student, job.eligibility);
      }
    }

    return {
      id: job.id,
      title: job.title,
      company: {
        id: job.company.id,
        name: job.company.name,
        logo_url: job.company.logoUrl,
      },
      placement_drive: {
        id: job.drive.id,
        title: job.drive.title,
        college_name: job.drive.college.name,
      },
      job_type: job.jobType,
      location: job.location,
      ctc_range: `${job.ctcMin.toString()} LPA – ${job.ctcMax.toString()} LPA`,
      description: job.description,
      eligibility: job.eligibility,
      required_skills: job.skills,
      application_deadline: job.applicationDeadline,
      status: job.status,
      applicant_count: applicantCount,
      has_applied: hasApplied,
      is_eligible: isEligible,
    };
  }

  // Helper evaluating student parameters against job criteria
  private checkStudentEligibility(student: any, eligibility: any): boolean {
    if (!eligibility) return true;

    if (student.cgpa < eligibility.minCgpa) return false;
    if (student.backlogs > eligibility.maxBacklogs) return false;
    if (student.batchYear < eligibility.batchYearFrom || student.batchYear > eligibility.batchYearTo) return false;

    try {
      const allowed: string[] = JSON.parse(eligibility.allowedBranches);
      const code = student.department?.code || "";
      if (allowed.length > 0 && !allowed.includes(code)) return false;
    } catch {
      // safe fallback
    }

    return true;
  }

  // Queries paginated jobs lists, appending student eligibility vectors
  async listJobs(filters: JobSearchFilter, reqUser: { id: string; role: Role }): Promise<PaginatedResult<any>> {
    const result = await jobRepository.searchJobs(filters);

    let student: any = null;
    if (reqUser.role === Role.STUDENT) {
      student = await studentRepository.findByUserId(reqUser.id);
    }

    // Append personalized student context to list records
    const mappedData = await Promise.all(
      result.data.map(async (job: any) => {
        let hasApplied = false;
        let isEligible = true;

        if (student) {
          const appCount = await prisma.application.count({
            where: {
              jobId: job.id,
              studentId: student.id,
              isActive: true,
            },
          });
          hasApplied = appCount > 0;
          isEligible = this.checkStudentEligibility(student, job.eligibility);
        }

        return {
          id: job.id,
          title: job.title,
          company_name: job.company.name,
          company_logo: job.company.logoUrl,
          ctc_range: `${job.ctcMin.toString()} – ${job.ctcMax.toString()} LPA`,
          deadline: job.applicationDeadline,
          status: job.status,
          is_eligible: isEligible,
          has_applied: hasApplied,
        };
      })
    );

    return {
      data: mappedData,
      pagination: result.pagination,
    };
  }

  // Updates job post parameters, restricting edits to DRAFT status
  async updateJob(
    jobId: string,
    companyId: string,
    data: UpdateJobPostDTO
  ): Promise<JobPost> {
    const job = await jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundError("Job post not found");
    }

    if (job.companyId !== companyId) {
      throw new ForbiddenError("Access Denied: You do not own this job posting");
    }

    // Once a job post is published (OPEN/CLOSED/CANCELLED), core structural modifications are prohibited
    if (job.status !== JobStatus.DRAFT) {
      // Partial updates only: applicationDeadline and maxApplications can be modified
      const allowedKeys = ["application_deadline", "max_applications"];
      const incomingKeys = Object.keys(data);
      
      const hasRestrictedEdits = incomingKeys.some(
        (key) => !["application_deadline", "max_applications", "applicationDeadline", "maxApplications"].includes(key)
      );

      if (hasRestrictedEdits) {
        throw new BadRequestError(
          "Validation Error: Structural changes are forbidden on already published job postings. Only application deadline and application limits can be adjusted."
        );
      }
    }

    return jobRepository.updateJob(jobId, data);
  }

  // Shuts down application intake, moving status OPEN -> CLOSED
  async closeJob(
    jobId: string,
    userId: string,
    userRole: Role,
    userCompanyId: string | null
  ): Promise<void> {
    const job = await jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundError("Job post not found");
    }

    const isOwner = userRole === Role.COMPANY_ADMIN && job.companyId === userCompanyId;
    const isOfficer = userRole === Role.PLACEMENT_OFFICER && job.drive.collegeId === job.drive.collegeId;

    if (!isOwner && !isOfficer) {
      throw new ForbiddenError("Access Denied: You cannot close this job post");
    }

    if (job.status !== JobStatus.OPEN) {
      throw new UnprocessableError(
        `Invalid State Transition: Cannot close job in status '${job.status}'. Job must be active ('OPEN').`
      );
    }

    await jobRepository.updateStatus(jobId, JobStatus.CLOSED);
  }

  // Queries candidates applying to this job post, including secure pre-signed resumes download URLs
  async getApplicantsList(
    jobId: string,
    userId: string,
    userRole: Role,
    userCompanyId: string | null,
    filters: {
      status?: ApplicationStatus;
      minCgpa?: number;
      departmentId?: string;
      limit: number;
      cursor?: string;
    }
  ): Promise<PaginatedResult<any>> {
    const job = await jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundError("Job post not found");
    }

    // Verify company or officer bounds
    const isOwner = userRole === Role.COMPANY_ADMIN && job.companyId === userCompanyId;
    const isOfficer = userRole === Role.PLACEMENT_OFFICER; // will be college bounded in controller

    if (!isSuperAdmin(userRole) && !isOwner && !isOfficer) {
      throw new ForbiddenError("Access Denied: You cannot view applicants for this job post");
    }

    const result = await jobRepository.getApplicants(jobId, filters);

    // Enqueue pre-signed URLs valid for 1 hour for secure resume downloading
    const mappedApplicants = await Promise.all(
      result.data.map(async (app: any) => {
        const resumeUrl = await getDownloadPresignedUrl(app.resume.fileUrl);
        return {
          application_id: app.id,
          student: {
            id: app.student.id,
            full_name: app.student.fullName,
            cgpa: app.student.cgpa,
            department: app.student.department.name,
            resume_download_url: resumeUrl,
          },
          current_status: app.currentStatus,
          applied_at: app.appliedAt,
        };
      })
    );

    return {
      data: mappedApplicants,
      pagination: result.pagination,
    };
  }
}

// Global Super Admin helper
const isSuperAdmin = (role: Role) => {
  return role === Role.SUPER_ADMIN || role === Role.UNIVERSITY_ADMIN;
};

export const jobService = new JobService();
