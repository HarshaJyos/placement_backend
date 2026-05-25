import { Request, Response, NextFunction } from "express";
import { studentService } from "./service";
import { studentRepository } from "./repository";
import { ForbiddenError, BadRequestError, NotFoundError } from "../../lib/errors";
import { Role } from "@prisma/client";
import { StudentSearchFilter } from "./types";

export class StudentController {
  // Registers student onboarding attributes, checking self-ownership bounds
  async completeProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authenticatedUser = req.user!;
      const studentIdParam = req.params.student_id;

      // 1. Resolve student entity associated with the logged-in User
      const student = await studentRepository.findByUserId(authenticatedUser.id);
      if (!student) {
        throw new NotFoundError("Student context could not be resolved for this account");
      }

      // 2. Validate ownership (students can only configure their own profile)
      if (student.id !== studentIdParam) {
        throw new ForbiddenError("Access Denied: You cannot configure this student profile");
      }

      const result = await studentService.completeOnboardingProfile(
        studentIdParam,
        req.body
      );

      res.status(200).json({
        success: true,
        message: "Profile configured successfully during onboarding",
        student: result.student,
        is_profile_complete: result.is_profile_complete,
        profile_strength: result.profile_strength,
      });
    } catch (error) {
      next(error);
    }
  }

  // Resolves a public student profile summary for recruiter viewing
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authenticatedUser = req.user!;
      const studentIdParam = req.params.student_id;

      // Verify that COLLEGE_ADMIN or PLACEMENT_OFFICER only views students within their own college
      const targetStudent = await studentRepository.findById(studentIdParam);
      if (!targetStudent) {
        throw new NotFoundError("Student record not found");
      }

      if (
        ([Role.COLLEGE_ADMIN, Role.PLACEMENT_OFFICER] as Role[]).includes(authenticatedUser.role) &&
        targetStudent.collegeId !== authenticatedUser.collegeId
      ) {
        throw new ForbiddenError(
          "Access Denied: You are not authorized to view students outside your college"
        );
      }

      const profile = await studentService.getStudentProfilePublic(studentIdParam);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  // Lists students with full paginated and multi-criteria filters
  async listStudents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authenticatedUser = req.user!;
      const query = req.query as any;

      // Parse comma-separated skill list into array
      let skillIdsArray: string[] | undefined = undefined;
      if (query.skill_ids) {
        skillIdsArray = query.skill_ids.split(",").map((id: string) => id.trim());
      }

      // Restrict college_id checks: non-super-admins cannot inspect outside their college bounds
      let targetCollegeId = query.college_id;
      if (
        ([Role.COLLEGE_ADMIN, Role.PLACEMENT_OFFICER] as Role[]).includes(authenticatedUser.role)
      ) {
        targetCollegeId = authenticatedUser.collegeId;
      }

      const searchFilters: StudentSearchFilter = {
        limit: query.limit,
        cursor: query.cursor,
        college_id: targetCollegeId,
        department_id: query.department_id,
        batch_year: query.batch_year,
        min_cgpa: query.min_cgpa,
        max_backlogs: query.max_backlogs,
        placement_status: query.placement_status,
        skill_ids: skillIdsArray,
        search: query.search,
        sort_by: query.sort_by,
        sort_order: query.sort_order,
      };

      const result = await studentService.listStudents(searchFilters);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  // Fetches current student analytics and personal dashboard tasks
  async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authenticatedUser = req.user!;
      const studentIdParam = req.params.student_id;

      // Resolve student entity associated with this User
      const student = await studentRepository.findByUserId(authenticatedUser.id);
      if (!student || student.id !== studentIdParam) {
        throw new ForbiddenError("Access Denied: You cannot view this dashboard");
      }

      const dashboard = await studentService.getStudentDashboard(studentIdParam);

      res.status(200).json({
        success: true,
        data: dashboard,
      });
    } catch (error) {
      next(error);
    }
  }
}
export const studentController = new StudentController();
