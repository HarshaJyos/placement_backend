import { Application, ApplicationStatus, Role, InterviewRound, OfferLetter } from "@prisma/client";
import { applicationRepository } from "./repository";
import { studentRepository } from "../student/repository";
import { jobRepository } from "../job/repository";
import {
  SubmitApplicationDTO,
  UpdateApplicationStatusDTO,
  ScheduleInterviewDTO,
  SubmitFeedbackDTO,
  IssueOfferDTO,
  ApplicationSearchFilter,
} from "./types";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  UnprocessableError,
  ConflictError,
} from "../../lib/errors";
import { prisma } from "../../lib/db";
import { getDownloadPresignedUrl } from "../../lib/storage";
import { addJobToQueue } from "../../lib/queue";
import { PaginatedResult } from "../../lib/paginate";

export class ApplicationService {
  // Evaluates application status machine transitions
  private validateTransition(from: ApplicationStatus, to: ApplicationStatus): void {
    const validTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
      [ApplicationStatus.APPLIED]: [
        ApplicationStatus.UNDER_REVIEW,
        ApplicationStatus.REJECTED,
        ApplicationStatus.WITHDRAWN,
      ],
      [ApplicationStatus.UNDER_REVIEW]: [
        ApplicationStatus.SHORTLISTED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.WITHDRAWN,
      ],
      [ApplicationStatus.SHORTLISTED]: [
        ApplicationStatus.INTERVIEW_SCHEDULED,
        ApplicationStatus.ON_HOLD,
        ApplicationStatus.REJECTED,
        ApplicationStatus.WITHDRAWN,
      ],
      [ApplicationStatus.INTERVIEW_SCHEDULED]: [
        ApplicationStatus.SELECTED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.ON_HOLD,
        ApplicationStatus.WITHDRAWN,
      ],
      [ApplicationStatus.ON_HOLD]: [
        ApplicationStatus.SHORTLISTED,
        ApplicationStatus.INTERVIEW_SCHEDULED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.WITHDRAWN,
      ],
      [ApplicationStatus.SELECTED]: [
        ApplicationStatus.REJECTED,
        ApplicationStatus.WITHDRAWN,
      ],
      [ApplicationStatus.REJECTED]: [],
      [ApplicationStatus.WITHDRAWN]: [],
    };

    const allowed = validTransitions[from];
    if (!allowed || !allowed.includes(to)) {
      throw new UnprocessableError(
        `Invalid Transition: Cannot change application status from '${from}' to '${to}'`
      );
    }
  }

  // Submits a student job application after verifying eligibility and limits
  async submitApplication(userId: string, data: SubmitApplicationDTO): Promise<Application> {
    const student = (await studentRepository.findByUserId(userId)) as any;
    if (!student) {
      throw new NotFoundError("Student profile not found. Onboarding is required.");
    }

    // 1. Verify onboarding completeness
    if (!student.profile?.isProfileComplete) {
      throw new ForbiddenError(
        "Access Denied: Onboarding profile must be completed first before applying to jobs"
      );
    }

    // 2. Check active limit: max 50 active applications allowed
    const activeStates = [
      ApplicationStatus.APPLIED,
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.SHORTLISTED,
      ApplicationStatus.INTERVIEW_SCHEDULED,
      ApplicationStatus.ON_HOLD,
    ];
    const activeCount = await prisma.application.count({
      where: {
        studentId: student.id,
        currentStatus: { in: activeStates },
        isActive: true,
      },
    });
    if (activeCount >= 50) {
      throw new BadRequestError(
        "Application Limit Exceeded: You may maintain a maximum of 50 active applications"
      );
    }

    // 3. Prevent duplicate applications (idempotency check)
    const exists = await applicationRepository.checkApplicationExists(student.id, data.job_id);
    if (exists) {
      throw new ConflictError("You have already submitted an application for this job posting");
    }

    // 4. Verify job existence and active status
    const job = (await jobRepository.findById(data.job_id)) as any;
    if (!job) {
      throw new NotFoundError("Job posting not found");
    }
    if ((job as any).status !== "OPEN") {
      throw new BadRequestError("Hiring Closed: This job posting is no longer active");
    }

    // 5. Verify deadline
    if (new Date() > (job as any).applicationDeadline) {
      throw new BadRequestError("Expired: Hires deadline for this posting has passed");
    }

    // 6. Verify max application limit bounds
    const totalJobApplicants = await prisma.application.count({
      where: { jobId: (job as any).id, isActive: true },
    });
    if (totalJobApplicants >= (job as any).maxApplications) {
      throw new BadRequestError("Hiring Limit Met: Job has reached its maximum application capacity");
    }

    // 7. Verify eligibility criteria
    const el = (job as any).eligibility;
    if (el) {
      if (student.cgpa < el.minCgpa) {
        throw new BadRequestError(`Ineligible: Minimum CGPA required is ${el.minCgpa}`);
      }
      if (student.backlogs > el.maxBacklogs) {
        throw new BadRequestError(`Ineligible: Maximum backlogs allowed is ${el.maxBacklogs}`);
      }
      if (student.batchYear < el.batchYearFrom || student.batchYear > el.batchYearTo) {
        throw new BadRequestError(
          `Ineligible: Eligible graduation batch years are ${el.batchYearFrom} to ${el.batchYearTo}`
        );
      }

      try {
        const allowedBranches: string[] = JSON.parse(el.allowedBranches);
        const code = student.department?.code || "";
        if (allowedBranches.length > 0 && !allowedBranches.includes(code)) {
          throw new BadRequestError("Ineligible: Your academic branch is not eligible for this role");
        }
      } catch {}
    }

    // 8. Verify resume belongs to student
    const resume = await prisma.resume.findFirst({
      where: { id: data.resume_id, studentId: student.id, isActive: true },
    });
    if (!resume) {
      throw new NotFoundError("Selected resume not found or access is denied");
    }

    const application = await applicationRepository.createApplication(student.id, data);

    // Queue confirmation triggers
    await addJobToQueue("BULK_NOTIFY", {
      type: "APPLICATION_SUBMITTED",
      applicationId: application.id,
      studentEmail: student.user.email,
      jobTitle: job.title,
    });

    return application;
  }

  // Withdraws an application, limited to early hiring stages
  async withdrawApplication(userId: string, applicationId: string): Promise<void> {
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      throw new NotFoundError("Student profile not found");
    }

    const app = (await applicationRepository.findById(applicationId)) as any;
    if (!app || app.studentId !== student.id) {
      throw new NotFoundError("Application not found");
    }

    // Withdrawal is only permitted during APPLIED or UNDER_REVIEW stages
    const permittedWithdrawals = [ApplicationStatus.APPLIED, ApplicationStatus.UNDER_REVIEW];
    if (!permittedWithdrawals.includes(app.currentStatus)) {
      throw new BadRequestError(
        `Withdrawal Forbidden: Applications already advanced to '${app.currentStatus}' cannot be withdrawn.`
      );
    }

    await applicationRepository.withdraw(applicationId, student.id);
  }

  // Fetches full application profiles, checking context credentials
  async getApplicationDetail(
    applicationId: string,
    requesterId: string,
    requesterRole: Role,
    requesterCompanyId: string | null
  ): Promise<any> {
    const app = (await applicationRepository.findById(applicationId)) as any;
    if (!app) {
      throw new NotFoundError("Application not found");
    }

    // Security bounds checks
    let isAuthorized = false;

    if (requesterRole === Role.STUDENT) {
      const student = await studentRepository.findByUserId(requesterId);
      if (student && app.studentId === student.id) {
        isAuthorized = true;
      }
    } else if (requesterRole === Role.COMPANY_ADMIN) {
      if (app.job.companyId === requesterCompanyId) {
        isAuthorized = true;
      }
    } else if (
      ([Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN, Role.SUPER_ADMIN] as Role[]).includes(requesterRole)
    ) {
      // Officers can only inspect applicants matching their college drive
      if (requesterRole === Role.SUPER_ADMIN || app.student.collegeId === app.student.collegeId) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenError("Access Denied: You cannot view this application file");
    }

    // Map resume and offer letter paths to pre-signed temporary URLs on-the-fly
    const resumeDownloadUrl = await getDownloadPresignedUrl(app.resume.fileUrl);
    
    let offerLetterUrl: string | null = null;
    if (app.offerLetter) {
      offerLetterUrl = await getDownloadPresignedUrl(app.offerLetter.fileUrl);
    }

    return {
      id: app.id,
      student: {
        id: app.student.id,
        full_name: app.student.fullName,
        roll_number: app.student.rollNumber,
        cgpa: app.student.cgpa,
        phone: app.student.phone,
        department: app.student.department.name,
      },
      job: {
        id: app.job.id,
        title: app.job.title,
        job_type: app.job.jobType,
        location: app.job.location,
        company_name: app.job.company.name,
      },
      resume: {
        id: app.resume.id,
        version_label: app.resume.versionLabel,
        download_url: resumeDownloadUrl,
      },
      current_status: app.currentStatus,
      applied_at: app.appliedAt,
      cover_note: app.coverNote,
      status_history: app.statusLogs.map((log: any) => ({
        from: log.fromStatus,
        to: log.toStatus,
        changed_at: log.changedAt,
        remarks: log.remarks,
        by: log.user.role,
      })),
      interview_rounds: app.interviews,
      offer_letter: app.offerLetter
        ? {
            designation: app.offerLetter.designation,
            ctc: app.offerLetter.ctc,
            joining_date: app.offerLetter.joiningDate,
            is_accepted: app.offerLetter.isAccepted,
            download_url: offerLetterUrl,
          }
        : null,
    };
  }

  // Updates application status, enforcing status transitions and enqueuing student notification alerts
  async updateApplicationStatus(
    applicationId: string,
    updaterId: string,
    updaterRole: Role,
    updaterCompanyId: string | null,
    data: UpdateApplicationStatusDTO
  ): Promise<void> {
    const app = (await applicationRepository.findById(applicationId)) as any;
    if (!app) {
      throw new NotFoundError("Application file not found");
    }

    // Access check: Recruiter must own the job post
    if (updaterRole === Role.COMPANY_ADMIN && app.job.companyId !== updaterCompanyId) {
      throw new ForbiddenError("Access Denied: You do not have clearance to manage this application");
    }

    // Verify machine transition limits
    this.validateTransition(app.currentStatus, data.status);

    await applicationRepository.updateStatus(
      applicationId,
      app.currentStatus,
      data.status,
      data.remarks || null,
      updaterId
    );

    // Queue dynamic candidate alert
    await addJobToQueue("BULK_NOTIFY", {
      type: "APPLICATION_STATUS_UPDATED",
      applicationId,
      studentEmail: app.student.user.email,
      jobTitle: app.job.title,
      status: data.status,
      remarks: data.remarks,
    });
  }

  // Schedules an interview round and advances status to INTERVIEW_SCHEDULED
  async scheduleInterview(
    applicationId: string,
    companyId: string,
    data: ScheduleInterviewDTO
  ): Promise<InterviewRound> {
    const app = (await applicationRepository.findById(applicationId)) as any;
    if (!app || app.job.companyId !== companyId) {
      throw new ForbiddenError("Access Denied: You do not own this application folder");
    }

    // Must be in SHORTLISTED or INTERVIEW_SCHEDULED status to schedule rounds
    const permittedRounds = [ApplicationStatus.SHORTLISTED, ApplicationStatus.INTERVIEW_SCHEDULED] as ApplicationStatus[];
    if (!permittedRounds.includes(app.currentStatus)) {
      throw new BadRequestError(
        `Hiring Order Violation: Interviews can only be scheduled for candidates in SHORTLISTED or active interview states.`
      );
    }

    const round = await applicationRepository.createInterviewRound(applicationId, data);

    // Transition application status to INTERVIEW_SCHEDULED automatically
    if (app.currentStatus !== ApplicationStatus.INTERVIEW_SCHEDULED) {
      await applicationRepository.updateStatus(
        applicationId,
        app.currentStatus,
        ApplicationStatus.INTERVIEW_SCHEDULED,
        `Scheduled Round ${data.round_number}: ${data.round_type}`,
        await this.getCompanyAdminUserId(companyId)
      );
    }

    // Alert candidate asynchronously
    await addJobToQueue("BULK_NOTIFY", {
      type: "INTERVIEW_SCHEDULED",
      applicationId,
      studentEmail: app.student.user.email,
      jobTitle: app.job.title,
      roundNumber: data.round_number,
      roundType: data.round_type,
      scheduledAt: data.scheduled_at,
      venueOrLink: data.venue_or_link,
    });

    return round;
  }

  private async getCompanyAdminUserId(companyId: string): Promise<string> {
    const admin = await prisma.companyAdmin.findFirst({
      where: { companyId },
    });
    return admin ? admin.userId : "";
  }

  // Submits interviewer feedback and rating score sheets
  async submitFeedback(
    roundId: string,
    interviewerId: string,
    data: SubmitFeedbackDTO
  ): Promise<void> {
    const round = await prisma.interviewRound.findUnique({
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

    const admin = await prisma.companyAdmin.findFirst({
      where: { userId: interviewerId },
    });
    if (!admin || round.application.job.companyId !== admin.companyId) {
      throw new ForbiddenError("Access Denied: You do not possess clearance to rate this candidate");
    }

    await applicationRepository.submitFeedback(roundId, interviewerId, data);
  }

  // Issues a formal corporate offer letter to a SELECTED candidate
  async issueOfferLetter(
    applicationId: string,
    companyId: string,
    data: IssueOfferDTO
  ): Promise<OfferLetter> {
    const app = (await applicationRepository.findById(applicationId)) as any;
    if (!app || app.job.companyId !== companyId) {
      throw new ForbiddenError("Access Denied: Application file is inaccessible");
    }

    // Validate that the status is already SELECTED before issuing formal offer letters
    if (app.currentStatus !== ApplicationStatus.SELECTED) {
      throw new BadRequestError(
        "Hiring Order Violation: Offer letters can only be issued to candidates who have been formally SELECTED"
      );
    }

    // Check if an offer letter already exists to enforce idempotency
    const existingOffer = await prisma.offerLetter.findUnique({
      where: { applicationId },
    });
    if (existingOffer) {
      throw new ConflictError("An offer letter has already been issued for this candidate");
    }

    const offer = await applicationRepository.createOfferLetter(applicationId, data);

    // Queue offer alert triggers
    await addJobToQueue("BULK_NOTIFY", {
      type: "OFFER_LETTER_ISSUED",
      applicationId,
      studentEmail: app.student.user.email,
      designation: data.designation,
      ctc: data.ctc,
    });

    return offer;
  }

  // Responds to an offer, promoting placement status PLACED in database registries
  async respondToOffer(
    userId: string,
    applicationId: string,
    isAccepted: boolean
  ): Promise<void> {
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      throw new NotFoundError("Student profile not found");
    }

    const app = (await applicationRepository.findById(applicationId)) as any;
    if (!app || app.studentId !== student.id) {
      throw new NotFoundError("Application record not found");
    }

    const offer = await prisma.offerLetter.findUnique({
      where: { applicationId },
    });
    if (!offer) {
      throw new NotFoundError("No offer letter has been issued for this application");
    }

    if (offer.isAccepted !== null) {
      throw new BadRequestError("Action Forbidden: You have already responded to this offer letter");
    }

    await applicationRepository.respondToOffer(
      applicationId,
      isAccepted,
      student.id,
      student.userId
    );

    // Alert company recruiter asynchronously
    await addJobToQueue("BULK_NOTIFY", {
      type: "OFFER_RESPONSE_SUBMITTED",
      applicationId,
      companyEmail: app.job.company.website, // using corporate email logic
      jobTitle: app.job.title,
      candidateName: student.fullName,
      isAccepted,
    });
  }

  // Lists applications
  async listApplications(filters: ApplicationSearchFilter): Promise<PaginatedResult<Application>> {
    return applicationRepository.listApplications(filters);
  }
}
export const applicationService = new ApplicationService();
