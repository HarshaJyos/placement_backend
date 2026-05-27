import { prisma } from "../../lib/db";
import { College, Department, Role, PlacementStatus } from "@prisma/client";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "../../lib/errors";
import { addJobToQueue } from "../../lib/queue";
import { studentRepository } from "../student/repository";
import { StudentSearchFilter } from "../student/types";

export class CollegeService {
  // Registers a new college record
  async registerCollege(dto: {
    university_id?: string;
    name: string;
    code: string;
    address: string;
    tpo_email: string;
  }): Promise<College> {
    const { university_id, name, code, address, tpo_email } = dto;

    // Check code uniqueness
    const exists = await prisma.college.findUnique({
      where: { code },
    });
    if (exists) {
      throw new ConflictError(`A college with code '${code}' already exists`);
    }

    let targetUniversityId = university_id;

    if (!targetUniversityId) {
      // Find or create the default university
      let university = await prisma.university.findFirst();
      if (!university) {
        university = await prisma.university.create({
          data: {
            name: "Placement Platform University",
            slug: "placement-platform-university",
            domain: "university.edu",
            address: "University Campus, Shamshabad, Hyderabad",
            contactEmail: "admin@university.edu",
          },
        });
      }
      targetUniversityId = university.id;
    } else {
      // Verify university validity if one was supplied
      const university = await prisma.university.findUnique({
        where: { id: university_id },
      });
      if (!university) {
        throw new NotFoundError("University record not found");
      }
      targetUniversityId = university.id;
    }

    return prisma.college.create({
      data: {
        universityId: targetUniversityId,
        name,
        code,
        address,
        tpoEmail: tpo_email,
        isActive: true,
      },
    });
  }

  // Generates analytics summary for placement officers college dashboard
  async getDashboard(
    role: Role,
    collegeId: string | null,
    targetCollegeId: string
  ): Promise<any> {
    if (role !== Role.SUPER_ADMIN && collegeId !== targetCollegeId) {
      throw new ForbiddenError("Access Denied: You cannot inspect this college dashboard");
    }

    const college = await prisma.college.findUnique({
      where: { id: targetCollegeId },
    });

    if (!college) {
      throw new NotFoundError("College record not found");
    }

    // 1. Student totals
    const totalStudents = await prisma.student.count({
      where: { collegeId: targetCollegeId, isActive: true },
    });

    const placedStudents = await prisma.student.count({
      where: {
        collegeId: targetCollegeId,
        placementStatus: PlacementStatus.PLACED,
        isActive: true,
      },
    });

    const placementRate = totalStudents > 0 ? (placedStudents / totalStudents) * 100 : 0;

    // 2. Active drives count
    const activeDrives = await prisma.placementDrive.count({
      where: { collegeId: targetCollegeId, status: "ACTIVE", isActive: true },
    });

    // 3. Open job posts & companies onboarded counts
    const jobs = await prisma.jobPost.findMany({
      where: {
        drive: {
          collegeId: targetCollegeId,
          isActive: true,
        },
        isActive: true,
      },
      select: { companyId: true, status: true, id: true },
    });

    const companiesOnboarded = Array.from(new Set(jobs.map((j) => j.companyId))).length;
    const openJobs = jobs.filter((j) => j.status === "OPEN").length;

    // 4. Pending applications count
    const pendingApplications = await prisma.application.count({
      where: {
        job: {
          drive: {
            collegeId: targetCollegeId,
            isActive: true,
          },
          isActive: true,
        },
        currentStatus: { in: ["APPLIED", "UNDER_REVIEW"] },
        isActive: true,
      },
    });

    // 5. Department wise summaries
    const depts = await prisma.department.findMany({
      where: { collegeId: targetCollegeId },
      include: {
        students: {
          where: { isActive: true },
        },
      },
    });

    const departmentsSummary = depts.map((d) => {
      const total = d.students.length;
      const placed = d.students.filter(
        (s) => s.placementStatus === PlacementStatus.PLACED
      ).length;
      return {
        name: d.code,
        placed,
        total,
      };
    });

    return {
      total_students: totalStudents,
      placed_students: placedStudents,
      placement_rate: Number(placementRate.toFixed(1)),
      active_drives: activeDrives,
      companies_onboarded: companiesOnboarded,
      open_jobs: openJobs,
      pending_applications: pendingApplications,
      departments: departmentsSummary,
    };
  }

  // Adds a department under the college record
  async addDepartment(
    role: Role,
    collegeId: string | null,
    targetCollegeId: string,
    dto: { name: string; code: string; seat_count: number }
  ): Promise<Department> {
    const { name, code, seat_count } = dto;

    if (role !== Role.SUPER_ADMIN && collegeId !== targetCollegeId) {
      throw new ForbiddenError("Access Denied: You cannot add departments to this college");
    }

    const college = await prisma.college.findUnique({
      where: { id: targetCollegeId },
    });

    if (!college) {
      throw new NotFoundError("College record not found");
    }

    return prisma.department.create({
      data: {
        collegeId: targetCollegeId,
        name,
        code,
        seatCount: seat_count,
      },
    });
  }

  // Lists students registered to this college (placement officer candidates search)
  async listStudents(
    role: Role,
    collegeId: string | null,
    targetCollegeId: string,
    filters: StudentSearchFilter
  ): Promise<any> {
    if (role !== Role.SUPER_ADMIN && collegeId !== targetCollegeId) {
      throw new ForbiddenError("Access Denied: You cannot browse this college's candidate records");
    }

    // Force collegeId scoping
    filters.college_id = targetCollegeId;

    return studentRepository.searchStudents(filters);
  }

  // Triggers an asynchronous, non-blocking report export job in the background via BullMQ
  async exportPlacementReport(
    userId: string,
    role: Role,
    collegeId: string | null,
    targetCollegeId: string,
    dto: { drive_id?: string; batch_year?: number; format: string }
  ): Promise<{ job_id: string; status: string; estimated_seconds: number; poll_url: string }> {
    if (role !== Role.SUPER_ADMIN && collegeId !== targetCollegeId) {
      throw new ForbiddenError("Access Denied: You do not possess clearance to export reports for this college");
    }

    // Trigger async exporting via BullMQ
    const jobId = await addJobToQueue("EXPORT_STUDENTS", {
      collegeId: targetCollegeId,
      driveId: dto.drive_id || null,
      batchYear: dto.batch_year || null,
      format: dto.format,
      userId,
    });

    return {
      job_id: jobId,
      status: "PROCESSING",
      estimated_seconds: 30,
      poll_url: `/api/async-jobs/${jobId}/status`,
    };
  }
}
export const collegeService = new CollegeService();
