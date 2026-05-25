import { prisma } from "../../lib/db";
import {
  Application,
  ApplicationStatus,
  ApplicationStatusLog,
  InterviewRound,
  InterviewStatus,
  OfferLetter,
  PlacementStatus,
} from "@prisma/client";
import {
  SubmitApplicationDTO,
  ScheduleInterviewDTO,
  SubmitFeedbackDTO,
  IssueOfferDTO,
  ApplicationSearchFilter,
} from "./types";
import { paginate, PaginatedResult } from "../../lib/paginate";

export class ApplicationRepository {
  // Finds an active application by ID with full audit trails and sub-records
  async findById(id: string): Promise<Application | null> {
    return prisma.application.findFirst({
      where: {
        id,
        isActive: true,
      },
      include: {
        student: {
          include: {
            department: true,
            user: true,
          },
        },
        job: {
          include: {
            company: true,
            eligibility: true,
          },
        },
        resume: true,
        statusLogs: {
          include: {
            user: true,
          },
          orderBy: { changedAt: "desc" },
        },
        interviews: {
          include: {
            feedbacks: {
              include: {
                interviewer: true,
              },
            },
          },
          orderBy: { roundNumber: "asc" },
        },
        offerLetter: true,
      },
    });
  }

  // Verifies if a student has already applied to a job
  async checkApplicationExists(studentId: string, jobId: string): Promise<boolean> {
    const count = await prisma.application.count({
      where: {
        studentId,
        jobId,
        isActive: true,
      },
    });
    return count > 0;
  }

  // Atomically submits a job application and records initial status log
  async createApplication(
    studentId: string,
    data: SubmitApplicationDTO
  ): Promise<Application> {
    return prisma.$transaction(async (tx) => {
      const app = await tx.application.create({
        data: {
          studentId,
          jobId: data.job_id,
          resumeId: data.resume_id,
          currentStatus: ApplicationStatus.APPLIED,
          coverNote: data.cover_note || null,
          isActive: true,
        },
      });

      await tx.applicationStatusLog.create({
        data: {
          applicationId: app.id,
          changedBy: await this.getUserIdFromStudentId(studentId, tx),
          fromStatus: ApplicationStatus.APPLIED,
          toStatus: ApplicationStatus.APPLIED,
          remarks: "Initial application submission",
        },
      });

      return app;
    });
  }

  // Helper resolving User ID associated with a Student
  private async getUserIdFromStudentId(studentId: string, tx: any): Promise<string> {
    const student = await tx.student.findUnique({
      where: { id: studentId },
    });
    return student ? student.userId : "";
  }

  // Atomically transitions application states and logs the reason
  async updateStatus(
    applicationId: string,
    fromStatus: ApplicationStatus,
    toStatus: ApplicationStatus,
    remarks: string | null,
    userId: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id: applicationId },
        data: { currentStatus: toStatus },
      });

      await tx.applicationStatusLog.create({
        data: {
          applicationId,
          changedBy: userId,
          fromStatus,
          toStatus,
          remarks: remarks || "Status updated by admin/system",
        },
      });
    });
  }

  // Atomically withdraws a candidate's application
  async withdraw(applicationId: string, studentId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: applicationId },
      });

      if (!app || app.studentId !== studentId) {
        throw new Error("Application mismatch");
      }

      await tx.application.update({
        where: { id: applicationId },
        data: { currentStatus: ApplicationStatus.WITHDRAWN },
      });

      await tx.applicationStatusLog.create({
        data: {
          applicationId,
          changedBy: await this.getUserIdFromStudentId(studentId, tx),
          fromStatus: app.currentStatus,
          toStatus: ApplicationStatus.WITHDRAWN,
          remarks: "Withdrawn by candidate",
        },
      });
    });
  }

  // Lists applications with full paginated and dynamic sorting
  async listApplications(filters: ApplicationSearchFilter): Promise<PaginatedResult<Application>> {
    const where: any = {
      isActive: true,
    };

    if (filters.status) {
      where.currentStatus = filters.status;
    }
    if (filters.job_id) {
      where.jobId = filters.job_id;
    }
    if (filters.student_id) {
      where.studentId = filters.student_id;
    }
    if (filters.college_id) {
      where.student = {
        collegeId: filters.college_id,
        isActive: true,
      };
    }

    const baseArgs = {
      where,
      include: {
        student: {
          include: {
            department: true,
          },
        },
        job: {
          include: {
            company: true,
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
        sortBy: filters.sort_by,
        sortOrder: filters.sort_order,
      }
    );
  }

  // Registers an interview round in scheduling status
  async createInterviewRound(
    applicationId: string,
    data: ScheduleInterviewDTO
  ): Promise<InterviewRound> {
    return prisma.interviewRound.create({
      data: {
        applicationId,
        roundNumber: data.round_number,
        roundType: data.round_type,
        scheduledAt: data.scheduled_at,
        venueOrLink: data.venue_or_link,
        status: InterviewStatus.SCHEDULED,
      },
    });
  }

  // Resolves details of an interview round by ID
  async getInterviewRound(roundId: string): Promise<InterviewRound | null> {
    return prisma.interviewRound.findUnique({
      where: { id: roundId },
      include: {
        application: true,
      },
    });
  }

  // Atomically submits feedback on a candidate round and advances parent schedules
  async submitFeedback(
    roundId: string,
    interviewerId: string,
    data: SubmitFeedbackDTO
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // 1. Create Interview Feedback record
      await tx.interviewFeedback.create({
        data: {
          roundId,
          interviewerId,
          rating: data.rating,
          remarks: data.remarks,
          decision: data.decision,
          createdAt: new Date(),
        },
      });

      // 2. Complete the Interview Round status
      await tx.interviewRound.update({
        where: { id: roundId },
        data: { status: InterviewStatus.COMPLETED },
      });
    });
  }

  // Registers an offer letter under an application ID
  async createOfferLetter(
    applicationId: string,
    data: IssueOfferDTO
  ): Promise<OfferLetter> {
    return prisma.offerLetter.create({
      data: {
        applicationId,
        designation: data.designation,
        ctc: data.ctc,
        joiningDate: data.joining_date,
        fileUrl: data.file_url,
      },
    });
  }

  // Atomically responds to a corporate offer letter, toggling student placement tags if accepted
  async respondToOffer(
    applicationId: string,
    isAccepted: boolean,
    studentId: string,
    userId: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: applicationId },
      });

      if (!app) {
        throw new Error("Application mismatch");
      }

      // 1. Update OfferLetter response
      await tx.offerLetter.update({
        where: { applicationId },
        data: { isAccepted },
      });

      // 2. Adjust Application and student placement status depending on acceptance
      const nextStatus = isAccepted ? ApplicationStatus.SELECTED : ApplicationStatus.REJECTED;
      
      await tx.application.update({
        where: { id: applicationId },
        data: { currentStatus: nextStatus },
      });

      // Transition Log
      await tx.applicationStatusLog.create({
        data: {
          applicationId,
          changedBy: userId,
          fromStatus: app.currentStatus,
          toStatus: nextStatus,
          remarks: isAccepted
            ? "Candidate accepted issued corporate offer"
            : "Candidate declined issued corporate offer",
        },
      });

      if (isAccepted) {
        // Toggle student status to PLACED
        await tx.student.update({
          where: { id: studentId },
          data: { placementStatus: PlacementStatus.PLACED },
        });

        // Set all other active applications of this student to WITHDRAWN or CLOSED
        // Once a student is PLACED, standard compliance requires closing other active loops
        await tx.application.updateMany({
          where: {
            studentId,
            id: { not: applicationId },
            isActive: true,
            currentStatus: {
              in: [
                ApplicationStatus.APPLIED,
                ApplicationStatus.UNDER_REVIEW,
                ApplicationStatus.SHORTLISTED,
                ApplicationStatus.INTERVIEW_SCHEDULED,
              ],
            },
          },
          data: { currentStatus: ApplicationStatus.WITHDRAWN },
        });
      }
    });
  }
}
export const applicationRepository = new ApplicationRepository();
