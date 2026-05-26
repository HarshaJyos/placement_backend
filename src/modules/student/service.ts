import { Student, PlacementStatus } from "@prisma/client";
import { studentRepository } from "./repository";
import { CompleteStudentProfileDTO, StudentSearchFilter } from "./types";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../lib/errors";
import { prisma } from "../../lib/db";
import { PaginatedResult } from "../../lib/paginate";

export class StudentService {
  // Evaluates and returns the percentage strength of a student's profile completion
  calculateProfileStrength(student: any): number {
    let score = 0;
    
    if (student.fullName) score += 10;
    if (student.phone) score += 10;
    if (student.rollNumber && !student.rollNumber.startsWith("TEMP-")) score += 10;
    if (student.batchYear > 0) score += 10;
    if (student.cgpa > 0) score += 10;
    if (student.departmentId && student.departmentId !== "00000000-0000-0000-0000-000000000000") score += 10;

    const profile = student.profile;
    if (profile) {
      if (profile.linkedinUrl) score += 10;
      if (profile.githubUrl) score += 10;
      if (profile.bio) score += 10;
    }

    if (student.skills && student.skills.length > 0) score += 10;

    return score;
  }

  // Completes onboarding profiling, validates department existence, and calculates profile strength
  async completeOnboardingProfile(
    studentId: string,
    data: CompleteStudentProfileDTO
  ): Promise<{ student: Student; is_profile_complete: boolean; profile_strength: number }> {
    const student = await studentRepository.findById(studentId);
    if (!student) {
      throw new NotFoundError("Student record not found");
    }

    // Verify department exists
    const department = await prisma.department.findUnique({
      where: { id: data.department_id },
    });
    if (!department) {
      throw new BadRequestError("The requested department ID is invalid");
    }

    // Save profile adjustments to DB
    const updatedStudent = await studentRepository.completeStudentProfile(studentId, data);
    
    // Recalculate profile score
    const strength = this.calculateProfileStrength(updatedStudent);

    return {
      student: updatedStudent,
      is_profile_complete: true,
      profile_strength: strength,
    };
  }

  // Obtains a public student profile summary for companies/officers
  async getStudentProfilePublic(studentId: string): Promise<any> {
    const student: any = await studentRepository.findById(studentId);
    if (!student) {
      throw new NotFoundError("Student record not found");
    }

    const resumesCount = await prisma.resume.count({
      where: { studentId, isActive: true },
    });

    const applicationsCount = await prisma.application.count({
      where: { studentId, isActive: true },
    });

    return {
      id: student.id,
      full_name: student.fullName,
      roll_number: student.rollNumber,
      college_id: student.collegeId,
      department: student.department?.name || "N/A",
      batch_year: student.batchYear,
      cgpa: student.cgpa,
      backlogs: student.backlogs,
      skills: student.skills?.map((s: any) => s.skill.name) || [],
      placement_status: student.placementStatus,
      resume_count: resumesCount,
      application_count: applicationsCount,
      profile: student.profile,
    };
  }

  // Executes paginated queries for students listings
  async listStudents(filters: StudentSearchFilter): Promise<PaginatedResult<Student>> {
    return studentRepository.searchStudents(filters);
  }

  // Resolves personalized dashboard statistics and job postings recommendations
  async getStudentDashboard(studentId: string): Promise<any> {
    const student: any = await studentRepository.findById(studentId);
    if (!student) {
      throw new NotFoundError("Student record not found");
    }

    const stats = await studentRepository.getStudentAnalytics(studentId);
    const profileStrength = this.calculateProfileStrength(student);

    // Smart Job Recommendation Engine: Fetch top 5 OPEN jobs where student meets eligibility bounds
    const openJobs = await prisma.jobPost.findMany({
      where: {
        status: "OPEN",
        isActive: true,
        drive: {
          collegeId: student.collegeId,
          isActive: true,
        },
      },
      include: {
        company: true,
        eligibility: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter job eligibility server-side
    const recommendedJobs = openJobs
      .filter((job: any) => {
        const el = job.eligibility;
        if (!el) return true; // No eligibility defined = open to all

        // 1. CGPA threshold check
        if (student.cgpa < el.minCgpa) return false;

        // 2. Backlogs threshold check
        if (student.backlogs > el.maxBacklogs) return false;

        // 3. Graduation batch year bounds check
        if (student.batchYear < el.batchYearFrom || student.batchYear > el.batchYearTo) return false;

        // 4. Branch bounds check
        try {
          const allowedBranches: string[] = JSON.parse(el.allowedBranches);
          const studentBranchCode = student.department?.code || "";
          if (allowedBranches.length > 0 && !allowedBranches.includes(studentBranchCode)) {
            return false;
          }
        } catch {
          // Fallback if branch bounds parse fails
        }

        return true;
      })
      .slice(0, 5)
      .map((job: any) => ({
        id: job.id,
        title: job.title,
        job_type: job.jobType,
        location: job.location,
        ctc_range: `${job.ctcMin.toString()} LPA – ${job.ctcMax.toString()} LPA`,
        company_name: job.company.name,
        company_logo: job.company.logoUrl,
        application_deadline: job.applicationDeadline,
      }));

    return {
      applications_total: stats.applicationsTotal,
      applications_by_status: stats.applicationsByStatus,
      upcoming_interviews: stats.upcomingInterviews,
      recommended_jobs: recommendedJobs,
      profile_completion: profileStrength,
      placement_status: student.placementStatus,
    };
  }
}
export const studentService = new StudentService();
