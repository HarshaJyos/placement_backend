import { prisma } from "../../lib/db";
import { PlacementDrive, DriveStatus, Role, PlacementStatus } from "@prisma/client";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../lib/errors";
import { addJobToQueue } from "../../lib/queue";
import { paginate, PaginatedResult } from "../../lib/paginate";

export class DriveService {
  // Creates a new placement drive, resolving the officerId associated with the creator
  async createDrive(
    userId: string,
    role: Role,
    collegeId: string | null,
    dto: {
      college_id: string;
      title: string;
      start_date: Date;
      end_date: Date;
      description: string;
    }
  ): Promise<PlacementDrive> {
    const { college_id, title, start_date, end_date, description } = dto;

    // College bounds security
    if (role !== Role.SUPER_ADMIN && collegeId !== college_id) {
      throw new ForbiddenError("Access Denied: You cannot create drives for another college");
    }

    // Resolve PlacementOfficer ID
    let officer = await prisma.placementOfficer.findFirst({
      where: { userId },
    });

    if (!officer) {
      // If none exists (e.g. COLLEGE_ADMIN creating it), find any officer in this college or create a placeholder TPO officer
      officer = await prisma.placementOfficer.findFirst({
        where: { collegeId: college_id },
      });

      if (!officer) {
        // Create placeholder officer for COLLEGE_ADMIN
        officer = await prisma.placementOfficer.create({
          data: {
            collegeId: college_id,
            userId,
            designation: "TPO Coordinator",
            phone: "0000000000",
          },
        });
      }
    }

    return prisma.placementDrive.create({
      data: {
        collegeId: college_id,
        officerId: officer.id,
        title,
        startDate: start_date,
        endDate: end_date,
        description,
        status: DriveStatus.DRAFT,
      },
    });
  }

  // Activates a placement drive
  async activateDrive(
    role: Role,
    collegeId: string | null,
    driveId: string
  ): Promise<PlacementDrive> {
    const drive = await prisma.placementDrive.findUnique({
      where: { id: driveId },
    });

    if (!drive) {
      throw new NotFoundError("Placement drive not found");
    }

    if (role !== Role.SUPER_ADMIN && drive.collegeId !== collegeId) {
      throw new ForbiddenError("Access Denied: You do not manage this college's drives");
    }

    if (drive.status !== DriveStatus.DRAFT) {
      throw new BadRequestError(`Cannot activate a drive that is in '${drive.status}' status`);
    }

    return prisma.placementDrive.update({
      where: { id: driveId },
      data: { status: DriveStatus.ACTIVE },
    });
  }

  // Invites a company recruiter to participate in the placement drive
  async inviteCompany(
    role: Role,
    collegeId: string | null,
    driveId: string,
    dto: { company_id: string; message: string; proposed_date_range: string }
  ): Promise<boolean> {
    const { company_id, message, proposed_date_range } = dto;

    const drive = await prisma.placementDrive.findUnique({
      where: { id: driveId },
    });

    if (!drive) {
      throw new NotFoundError("Placement drive not found");
    }

    if (role !== Role.SUPER_ADMIN && drive.collegeId !== collegeId) {
      throw new ForbiddenError("Access Denied: You do not manage this college's drives");
    }

    const company = await prisma.company.findUnique({
      where: { id: company_id },
      include: {
        admins: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundError("Company profile not found");
    }

    // Trigger async job to email invitations to company admins
    const companyAdminEmails = company.admins.map((a) => a.user.email);
    
    if (companyAdminEmails.length > 0) {
      await addJobToQueue("BULK_NOTIFY", {
        type: "DRIVE_INVITATION_SENT",
        companyEmails: companyAdminEmails,
        driveTitle: drive.title,
        message,
        proposedDateRange: proposed_date_range,
      });
    }

    return true;
  }

  // Generates analytical statistics of a placement drive
  async getDriveAnalytics(
    role: Role,
    collegeId: string | null,
    driveId: string
  ): Promise<any> {
    const drive = await prisma.placementDrive.findUnique({
      where: { id: driveId },
    });

    if (!drive) {
      throw new NotFoundError("Placement drive not found");
    }

    if (
      role !== Role.SUPER_ADMIN &&
      role !== Role.UNIVERSITY_ADMIN &&
      drive.collegeId !== collegeId
    ) {
      throw new ForbiddenError("Access Denied: You cannot view analytics for this college's drives");
    }

    // 1. Total student registrations in the college
    const totalStudents = await prisma.student.count({
      where: { collegeId: drive.collegeId, isActive: true },
    });

    // 2. Placed students
    const placedCount = await prisma.student.count({
      where: {
        collegeId: drive.collegeId,
        placementStatus: PlacementStatus.PLACED,
        isActive: true,
      },
    });

    const placementRate = totalStudents > 0 ? (placedCount / totalStudents) * 100 : 0;

    // 3. Companies participated
    const jobs = await prisma.jobPost.findMany({
      where: { placementDriveId: driveId, isActive: true },
      select: { companyId: true, ctcMax: true, ctcMin: true, id: true },
    });

    const uniqueCompanies = Array.from(new Set(jobs.map((j) => j.companyId)));
    const totalJobPosts = jobs.length;

    // 4. CTC metrics
    let avgCtc = 0;
    let highestCtc = 0;

    if (totalJobPosts > 0) {
      let sumCtc = 0;
      jobs.forEach((j) => {
        const mid = (Number(j.ctcMin) + Number(j.ctcMax)) / 2;
        sumCtc += mid;
        if (Number(j.ctcMax) > highestCtc) {
          highestCtc = Number(j.ctcMax);
        }
      });
      avgCtc = sumCtc / totalJobPosts;
    }

    // 5. Department wise metrics
    const departments = await prisma.department.findMany({
      where: { collegeId: drive.collegeId },
      include: {
        students: {
          where: { isActive: true },
        },
      },
    });

    const byDepartment = departments.map((dept) => {
      const total = dept.students.length;
      const placed = dept.students.filter(
        (s) => s.placementStatus === PlacementStatus.PLACED
      ).length;
      const rate = total > 0 ? (placed / total) * 100 : 0;

      return {
        department: dept.code,
        placed,
        total,
        rate: Number(rate.toFixed(1)),
      };
    });

    // 6. Company wise metrics (distinct jobs, applications, acceptances)
    const companyWise: Record<string, { company: string; offers_made: number; accepted: number }> = {};

    for (const job of jobs) {
      const company = await prisma.company.findFirst({
        where: { id: job.companyId },
      });

      if (!company) continue;

      const offers = await prisma.offerLetter.findMany({
        where: {
          application: {
            jobId: job.id,
            isActive: true,
          },
        },
      });

      const offersMade = offers.length;
      const accepted = offers.filter((o) => o.isAccepted === true).length;

      if (companyWise[company.id]) {
        companyWise[company.id].offers_made += offersMade;
        companyWise[company.id].accepted += accepted;
      } else {
        companyWise[company.id] = {
          company: company.name,
          offers_made: offersMade,
          accepted,
        };
      }
    }

    const byCompany = Object.values(companyWise);

    return {
      drive_id: driveId,
      total_students: totalStudents,
      placed_count: placedCount,
      placement_rate: Number(placementRate.toFixed(1)),
      companies_participated: uniqueCompanies.length,
      total_job_posts: totalJobPosts,
      avg_ctc: Math.round(avgCtc),
      highest_ctc: highestCtc,
      by_department: byDepartment,
      by_company: byCompany,
    };
  }

  // Lists placement drives paginated with cursor pagination
  async listDrives(
    role: Role,
    collegeId: string | null,
    filters: { college_id?: string; status?: DriveStatus; limit: number; cursor?: string }
  ): Promise<PaginatedResult<PlacementDrive>> {
    const where: any = {
      isActive: true,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    // Enforce scoping rules
    if (role !== Role.SUPER_ADMIN) {
      where.collegeId = collegeId || "00000000-0000-0000-0000-000000000000";
    } else if (filters.college_id) {
      where.collegeId = filters.college_id;
    }

    const baseArgs = {
      where,
      include: {
        college: true,
      },
    };

    return paginate<any>(
      prisma.placementDrive,
      baseArgs,
      {
        limit: filters.limit,
        cursor: filters.cursor,
        sortBy: "createdAt",
        sortOrder: "desc",
      }
    );
  }
}
export const driveService = new DriveService();
