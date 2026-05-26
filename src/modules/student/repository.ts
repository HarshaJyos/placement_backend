import { prisma } from "../../lib/db";
import { Student, StudentSkill, ProficiencyLevel, PlacementStatus } from "@prisma/client";
import { CompleteStudentProfileDTO, StudentSearchFilter } from "./types";
import { paginate, PaginatedResult } from "../../lib/paginate";

export class StudentRepository {
  // Finds active student by associated User UUID
  async findByUserId(userId: string): Promise<Student | null> {
    return prisma.student.findFirst({
      where: {
        userId,
        isActive: true,
      },
      include: {
        profile: true,
        department: true,
        skills: {
          include: {
            skill: true,
          },
        },
      },
    });
  }

  // Finds active student by Student UUID
  async findById(studentId: string): Promise<Student | null> {
    return prisma.student.findFirst({
      where: {
        id: studentId,
        isActive: true,
      },
      include: {
        profile: true,
        department: true,
        skills: {
          include: {
            skill: true,
          },
        },
      },
    });
  }

  // Atomically updates student demographic data, profile details, and skill tags in a transaction
  async completeStudentProfile(
    studentId: string,
    data: CompleteStudentProfileDTO
  ): Promise<Student> {
    return prisma.$transaction(async (tx: any) => {
      // 1. Update Student Table
      const student = await tx.student.update({
        where: { id: studentId },
        data: {
          fullName: data.full_name,
          rollNumber: data.roll_number,
          batchYear: data.batch_year,
          cgpa: data.cgpa,
          backlogs: data.backlogs,
          phone: data.phone,
          departmentId: data.department_id,
        },
      });

      // 2. Update Student Profile Detail (marking completion as true)
      await tx.studentProfile.update({
        where: { studentId },
        data: {
          linkedinUrl: data.linkedin_url || null,
          githubUrl: data.github_url || null,
          portfolioUrl: data.portfolio_url || null,
          bio: data.bio || null,
          currentCity: data.current_city || null,
          isProfileComplete: true,
        },
      });

      // 3. Clear existing Skills tags
      await tx.studentSkill.deleteMany({
        where: { studentId },
      });

      // 4. Batch register new Skills tags
      if (data.skills && data.skills.length > 0) {
        await tx.studentSkill.createMany({
          data: data.skills.map((s) => ({
            studentId,
            skillId: s.skill_id,
            proficiencyLevel: s.proficiency_level,
          })),
        });
      }

      return tx.student.findUnique({
        where: { id: studentId },
        include: {
          profile: true,
          skills: {
            include: {
              skill: true,
            },
          },
        },
      }) as unknown as Student;
    });
  }

  // Executes high-performance cursor pagination with structured filters for recruiter student searches
  async searchStudents(filters: StudentSearchFilter): Promise<PaginatedResult<Student>> {
    const where: any = {
      isActive: true,
    };

    if (filters.college_id) {
      where.collegeId = filters.college_id;
    }
    if (filters.department_id) {
      where.departmentId = filters.department_id;
    }
    if (filters.batch_year) {
      where.batchYear = filters.batch_year;
    }
    if (filters.min_cgpa) {
      where.cgpa = { gte: filters.min_cgpa };
    }
    if (filters.max_backlogs !== undefined) {
      where.backlogs = { lte: filters.max_backlogs };
    }
    if (filters.placement_status) {
      where.placementStatus = filters.placement_status;
    }

    // Dynamic Skill filtering matching some skills
    if (filters.skill_ids && filters.skill_ids.length > 0) {
      where.skills = {
        some: {
          skillId: {
            in: filters.skill_ids,
          },
        },
      };
    }

    // Dynamic case-insensitive Full-text search
    if (filters.search) {
      where.fullName = {
        contains: filters.search,
        mode: "insensitive",
      };
    }

    const baseArgs = {
      where,
      include: {
        department: true,
        skills: {
          include: {
            skill: true,
          },
        },
        profile: true,
      },
    };

    return paginate<any>(
      prisma.student,
      baseArgs,
      {
        limit: filters.limit,
        cursor: filters.cursor,
        sortBy: filters.sort_by,
        sortOrder: filters.sort_order,
      }
    );
  }

  // Fetches core statistics of a student's placement journey
  async getStudentAnalytics(studentId: string): Promise<any> {
    const applications = await prisma.application.findMany({
      where: {
        studentId,
        isActive: true,
      },
      select: {
        currentStatus: true,
      },
    });

    const applicationsTotal = applications.length;
    
    // Group applications by status count
    const applicationsByStatus: Record<string, number> = {};
    applications.forEach((app: any) => {
      const status = app.currentStatus;
      applicationsByStatus[status] = (applicationsByStatus[status] || 0) + 1;
    });

    // Retrieve upcoming scheduled interviews
    const upcomingInterviews = await prisma.interviewRound.findMany({
      where: {
        application: {
          studentId,
          isActive: true,
        },
        status: "SCHEDULED",
        scheduledAt: { gte: new Date() },
      },
      include: {
        application: {
          include: {
            job: {
              include: {
                company: true,
              },
            },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    });

    return {
      applicationsTotal,
      applicationsByStatus,
      upcomingInterviews: upcomingInterviews.map((i: any) => ({
        id: i.id,
        round_number: i.roundNumber,
        round_type: i.roundType,
        scheduled_at: i.scheduledAt,
        venue_or_link: i.venueOrLink,
        job_title: i.application.job.title,
        company_name: i.application.job.company.name,
      })),
    };
  }

  // Updates the student's placement status
  async updatePlacementStatus(
    studentId: string,
    status: PlacementStatus
  ): Promise<void> {
    await prisma.student.update({
      where: { id: studentId },
      data: { placementStatus: status },
    });
  }
}
export const studentRepository = new StudentRepository();
