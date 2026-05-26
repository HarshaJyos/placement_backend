import { prisma } from "../../lib/db";
import { InterviewRound, InterviewStatus, ApplicationStatus, Role, FeedbackDecision } from "@prisma/client";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "../../lib/errors";
import { addJobToQueue } from "../../lib/queue";
import { studentRepository } from "../student/repository";

export class InterviewService {
  // Schedules a new interview round, transitioning the application stage transactionally
  async scheduleRound(
    updaterId: string,
    updaterRole: Role,
    updaterCompanyId: string | null,
    updaterCollegeId: string | null,
    dto: {
      application_id: string;
      round_number: number;
      round_type: any;
      scheduled_at: Date;
      venue_or_link: string;
      notes?: string;
    }
  ): Promise<InterviewRound> {
    const { application_id, round_number, round_type, scheduled_at, venue_or_link, notes } = dto;

    return prisma.$transaction(async (tx: any) => {
      const app = await tx.application.findFirst({
        where: { id: application_id, isActive: true },
        include: {
          job: true,
          student: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!app) {
        throw new NotFoundError("Application record not found");
      }

      // Access checks
      if (updaterRole === Role.COMPANY_ADMIN && app.job.companyId !== updaterCompanyId) {
        throw new ForbiddenError("Access Denied: You do not own this application posting");
      }
      if (
        ([Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN] as Role[]).includes(updaterRole) &&
        app.student.collegeId !== updaterCollegeId
      ) {
        throw new ForbiddenError("Access Denied: Candidate is not from your college");
      }

      // Status check
      const permittedRounds = [ApplicationStatus.SHORTLISTED, ApplicationStatus.INTERVIEW_SCHEDULED] as ApplicationStatus[];
      if (!permittedRounds.includes(app.currentStatus)) {
        throw new BadRequestError(
          `Hiring Order Violation: Interviews can only be scheduled for candidates in SHORTLISTED or active interview states.`
        );
      }

      // Create InterviewRound
      const round = await tx.interviewRound.create({
        data: {
          applicationId: application_id,
          roundNumber: round_number,
          roundType: round_type,
          scheduledAt: scheduled_at,
          venueOrLink: venue_or_link,
          status: InterviewStatus.SCHEDULED,
        },
      });

      // Transition parent application status to INTERVIEW_SCHEDULED
      if (app.currentStatus !== ApplicationStatus.INTERVIEW_SCHEDULED) {
        await tx.application.update({
          where: { id: application_id },
          data: { currentStatus: ApplicationStatus.INTERVIEW_SCHEDULED },
        });

        await tx.applicationStatusLog.create({
          data: {
            applicationId: application_id,
            changedBy: updaterId,
            fromStatus: app.currentStatus,
            toStatus: ApplicationStatus.INTERVIEW_SCHEDULED,
            remarks: `Scheduled Round ${round_number}: ${round_type}. ${notes ? "Notes: " + notes : ""}`,
          },
        });
      } else if (notes) {
        // Just log the new round addition
        await tx.applicationStatusLog.create({
          data: {
            applicationId: application_id,
            changedBy: updaterId,
            fromStatus: app.currentStatus,
            toStatus: app.currentStatus,
            remarks: `Added Interview Round ${round_number}: ${round_type}. Notes: ${notes}`,
          },
        });
      }

      // Trigger calendar invite and push alerts asynchronously
      await addJobToQueue("BULK_NOTIFY", {
        type: "INTERVIEW_SCHEDULED",
        applicationId: application_id,
        studentEmail: app.student.user.email,
        jobTitle: app.job.title,
        roundNumber: round_number,
        roundType: round_type,
        scheduledAt: scheduled_at,
        venueOrLink: venue_or_link,
      });

      return round;
    });
  }

  // Reschedules a pending interview round
  async rescheduleRound(
    updaterId: string,
    updaterRole: Role,
    updaterCompanyId: string | null,
    updaterCollegeId: string | null,
    roundId: string,
    dto: { new_scheduled_at: Date; reason: string }
  ): Promise<InterviewRound> {
    const { new_scheduled_at, reason } = dto;

    return prisma.$transaction(async (tx: any) => {
      const round = await tx.interviewRound.findUnique({
        where: { id: roundId },
        include: {
          application: {
            include: {
              job: true,
              student: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      });

      if (!round) {
        throw new NotFoundError("Interview round not found");
      }

      if (round.status !== InterviewStatus.SCHEDULED && round.status !== InterviewStatus.RESCHEDULED) {
        throw new BadRequestError(`Cannot reschedule a round in '${round.status}' state`);
      }

      // Access checks
      if (updaterRole === Role.COMPANY_ADMIN && round.application.job.companyId !== updaterCompanyId) {
        throw new ForbiddenError("Access Denied: You do not own this hiring campaign");
      }
      if (
        ([Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN] as Role[]).includes(updaterRole) &&
        round.application.student.collegeId !== updaterCollegeId
      ) {
        throw new ForbiddenError("Access Denied: Student is not registered in your college");
      }

      const updatedRound = await tx.interviewRound.update({
        where: { id: roundId },
        data: {
          scheduledAt: new_scheduled_at,
          status: InterviewStatus.RESCHEDULED,
        },
      });

      await tx.applicationStatusLog.create({
        data: {
          applicationId: round.applicationId,
          changedBy: updaterId,
          fromStatus: round.application.currentStatus,
          toStatus: round.application.currentStatus,
          remarks: `Rescheduled Round ${round.roundNumber} to ${new_scheduled_at.toISOString()}. Reason: ${reason}`,
        },
      });

      // Notify candidate
      await addJobToQueue("BULK_NOTIFY", {
        type: "INTERVIEW_RESCHEDULED",
        applicationId: round.applicationId,
        studentEmail: round.application.student.user.email,
        jobTitle: round.application.job.title,
        roundNumber: round.roundNumber,
        newScheduledAt: new_scheduled_at,
        reason,
      });

      return updatedRound;
    });
  }

  // Submits interviewer feedback and closes the round status
  async submitFeedback(
    interviewerId: string,
    interviewerCompanyId: string | null,
    roundId: string,
    dto: { rating: number; remarks: string; decision: FeedbackDecision }
  ): Promise<{ feedback_id: string; decision: FeedbackDecision }> {
    const { rating, remarks, decision } = dto;

    return prisma.$transaction(async (tx: any) => {
      const round = await tx.interviewRound.findUnique({
        where: { id: roundId },
        include: {
          application: {
            include: {
              job: true,
            },
          },
        },
      });

      if (!round) {
        throw new NotFoundError("Interview round not found");
      }

      if (round.status !== InterviewStatus.SCHEDULED && round.status !== InterviewStatus.RESCHEDULED) {
        throw new BadRequestError("Feedback already logged or round cancelled");
      }

      // Verify interviewer belongs to the company hosting the job
      if (!interviewerCompanyId || round.application.job.companyId !== interviewerCompanyId) {
        throw new ForbiddenError("Access Denied: You do not possess clearance to rate this candidate");
      }

      const feedback = await tx.interviewFeedback.create({
        data: {
          roundId,
          interviewerId,
          rating,
          remarks,
          decision,
          createdAt: new Date(),
        },
      });

      await tx.interviewRound.update({
        where: { id: roundId },
        data: { status: InterviewStatus.COMPLETED },
      });

      return {
        feedback_id: feedback.id,
        decision: feedback.decision,
      };
    });
  }

  // Lists upcoming interviews for the authenticated student candidate
  async getUpcoming(userId: string): Promise<any[]> {
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      throw new NotFoundError("Student record not resolved");
    }

    const upcoming = await prisma.interviewRound.findMany({
      where: {
        application: {
          studentId: student.id,
          isActive: true,
        },
        status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED] },
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
    });

    return upcoming.map((round: any) => {
      const minutesUntil = Math.max(
        0,
        Math.floor((round.scheduledAt.getTime() - Date.now()) / (1000 * 60))
      );
      return {
        round_id: round.id,
        job_title: round.application.job.title,
        company_name: round.application.job.company.name,
        round_type: round.roundType,
        scheduled_at: round.scheduledAt,
        venue_or_link: round.venueOrLink,
        minutes_until: minutesUntil,
      };
    });
  }
}
export const interviewService = new InterviewService();
