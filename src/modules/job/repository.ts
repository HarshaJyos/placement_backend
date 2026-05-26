import { prisma } from "../../lib/db";
import { JobPost, JobStatus, Application, ApplicationStatus } from "@prisma/client";
import { CreateJobPostDTO, UpdateJobPostDTO, JobSearchFilter } from "./types";
import { paginate, PaginatedResult } from "../../lib/paginate";

export class JobRepository {
  // Atomically creates a JobPost, Eligibility, and mandatory Skill parameters
  async createJob(companyId: string, data: CreateJobPostDTO): Promise<JobPost> {
    return prisma.$transaction(async (tx: any) => {
      // 1. Create Job Post
      const job = await tx.jobPost.create({
        data: {
          companyId,
          placementDriveId: data.placement_drive_id,
          title: data.title,
          jobType: data.job_type,
          location: data.location,
          ctcMin: data.ctc_min,
          ctcMax: data.ctc_max,
          description: data.description,
          applicationDeadline: data.application_deadline,
          maxApplications: data.max_applications,
          status: JobStatus.DRAFT,
          isActive: true,
        },
      });

      // 2. Create Job Eligibility Rule Set
      await tx.jobEligibility.create({
        data: {
          jobId: job.id,
          minCgpa: data.eligibility.min_cgpa,
          maxBacklogs: data.eligibility.max_backlogs,
          allowedBranches: JSON.stringify(data.eligibility.allowed_branches),
          batchYearFrom: data.eligibility.batch_year_from,
          batchYearTo: data.eligibility.batch_year_to,
        },
      });

      // 3. Register mandatory and preferred skills
      if (data.required_skills && data.required_skills.length > 0) {
        await tx.jobSkill.createMany({
          data: data.required_skills.map((s) => ({
            jobId: job.id,
            skillId: s.skill_id,
            isMandatory: s.is_mandatory,
          })),
        });
      }

      return tx.jobPost.findUnique({
        where: { id: job.id },
        include: { eligibility: true, skills: true },
      }) as unknown as JobPost;
    });
  }

  // Finds a job post by ID with full nested details
  async findById(jobId: string): Promise<any> {
    return prisma.jobPost.findFirst({
      where: {
        id: jobId,
        isActive: true,
      },
      include: {
        company: true,
        drive: {
          include: {
            college: true,
          },
        },
        eligibility: true,
        skills: {
          include: {
            skill: true,
          },
        },
      },
    });
  }

  // Atomically updates job configurations
  async updateJob(jobId: string, data: UpdateJobPostDTO): Promise<JobPost> {
    return prisma.$transaction(async (tx: any) => {
      // Update core JobPost fields
      const coreData: any = {};
      if (data.title) coreData.title = data.title;
      if (data.job_type) coreData.jobType = data.job_type;
      if (data.location) coreData.location = data.location;
      if (data.ctc_min !== undefined) coreData.ctcMin = data.ctc_min;
      if (data.ctc_max !== undefined) coreData.ctcMax = data.ctc_max;
      if (data.description) coreData.description = data.description;
      if (data.application_deadline) coreData.applicationDeadline = data.application_deadline;
      if (data.max_applications !== undefined) coreData.maxApplications = data.max_applications;

      const job = await tx.jobPost.update({
        where: { id: jobId },
        data: coreData,
      });

      // Update eligibility
      if (data.eligibility) {
        const elData: any = {};
        if (data.eligibility.min_cgpa !== undefined) elData.minCgpa = data.eligibility.min_cgpa;
        if (data.eligibility.max_backlogs !== undefined) elData.maxBacklogs = data.eligibility.max_backlogs;
        if (data.eligibility.allowed_branches) {
          elData.allowedBranches = JSON.stringify(data.eligibility.allowed_branches);
        }
        if (data.eligibility.batch_year_from !== undefined) {
          elData.batchYearFrom = data.eligibility.batch_year_from;
        }
        if (data.eligibility.batch_year_to !== undefined) {
          elData.batchYearTo = data.eligibility.batch_year_to;
        }

        if (Object.keys(elData).length > 0) {
          await tx.jobEligibility.update({
            where: { jobId },
            data: elData,
          });
        }
      }

      // Update skills if provided
      if (data.required_skills) {
        await tx.jobSkill.deleteMany({
          where: { jobId },
        });

        if (data.required_skills.length > 0) {
          await tx.jobSkill.createMany({
            data: data.required_skills.map((s) => ({
              jobId,
              skillId: s.skill_id,
              isMandatory: s.is_mandatory,
            })),
          });
        }
      }

      return tx.jobPost.findUnique({
        where: { id: jobId },
        include: { eligibility: true, skills: true },
      }) as unknown as JobPost;
    });
  }

  // Updates the status of a job
  async updateStatus(jobId: string, status: JobStatus): Promise<void> {
    await prisma.jobPost.update({
      where: { id: jobId },
      data: { status },
    });
  }

  // Queries all job postings
  async searchJobs(filters: JobSearchFilter): Promise<PaginatedResult<JobPost>> {
    const where: any = {
      isActive: true,
    };

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.job_type) {
      where.jobType = filters.job_type;
    }
    if (filters.min_ctc !== undefined) {
      where.ctcMax = { gte: filters.min_ctc };
    }
    if (filters.company_id) {
      where.companyId = filters.company_id;
    }
    if (filters.drive_id) {
      where.placementDriveId = filters.drive_id;
    }

    if (filters.skill_ids && filters.skill_ids.length > 0) {
      where.skills = {
        some: {
          skillId: {
            in: filters.skill_ids,
          },
        },
      };
    }

    if (filters.search) {
      where.OR = [
        {
          title: {
            contains: filters.search,
            mode: "insensitive",
          },
        },
        {
          company: {
            name: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    const baseArgs = {
      where,
      include: {
        company: true,
        eligibility: true,
        skills: {
          include: {
            skill: true,
          },
        },
        drive: {
          include: {
            college: true,
          },
        },
      },
    };

    return paginate<any>(
      prisma.jobPost,
      baseArgs,
      {
        limit: filters.limit,
        cursor: filters.cursor,
        sortBy: filters.sort_by,
        sortOrder: filters.sort_order,
      }
    );
  }

  // Queries applicants applying to this job post
  async getApplicants(
    jobId: string,
    filters: {
      status?: ApplicationStatus;
      minCgpa?: number;
      departmentId?: string;
      limit: number;
      cursor?: string;
    }
  ): Promise<PaginatedResult<Application>> {
    const where: any = {
      jobId,
      isActive: true,
    };

    if (filters.status) {
      where.currentStatus = filters.status;
    }

    const studentConditions: any = { isActive: true };
    if (filters.minCgpa !== undefined) {
      studentConditions.cgpa = { gte: filters.minCgpa };
    }
    if (filters.departmentId) {
      studentConditions.departmentId = filters.departmentId;
    }

    if (Object.keys(studentConditions).length > 1) {
      where.student = studentConditions;
    }

    const baseArgs = {
      where,
      include: {
        student: {
          include: {
            department: true,
          },
        },
        resume: true,
      },
    };

    return paginate<any>(
      prisma.application,
      baseArgs,
      {
        limit: filters.limit,
        cursor: filters.cursor,
        sortBy: "appliedAt",
        sortOrder: "desc",
      }
    );
  }
}
export const jobRepository = new JobRepository();
