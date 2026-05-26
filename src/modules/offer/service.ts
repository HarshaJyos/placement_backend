import { prisma } from "../../lib/db";
import { OfferLetter, ApplicationStatus, Role, PlacementStatus } from "@prisma/client";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "../../lib/errors";
import { uploadBuffer, getDownloadPresignedUrl } from "../../lib/storage";
import { addJobToQueue } from "../../lib/queue";
import { studentRepository } from "../student/repository";
import { Decimal } from "@prisma/client/runtime/library";

export class OfferService {
  // Issues a corporate offer letter to a SELECTED candidate, uploading the PDF to S3/R2
  async issueOffer(
    updaterId: string,
    updaterCompanyId: string | null,
    dto: {
      application_id: string;
      designation: string;
      ctc: number;
      joining_date: Date;
    },
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    }
  ): Promise<OfferLetter> {
    const { application_id, designation, ctc, joining_date } = dto;

    if (!updaterCompanyId) {
      throw new ForbiddenError("Access Denied: Recruiter has no corporate bounds");
    }

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

      // Check recruiter owns the job posting
      if (app.job.companyId !== updaterCompanyId) {
        throw new ForbiddenError("Access Denied: You do not have clearance to issue offers for this role");
      }

      // Validate that application is in SELECTED status before offering
      if (app.currentStatus !== ApplicationStatus.SELECTED) {
        throw new BadRequestError(
          "Hiring Order Violation: Offer letters can only be issued to candidates who have been formally SELECTED"
        );
      }

      // Check if an offer already exists
      const existingOffer = await tx.offerLetter.findUnique({
        where: { applicationId: application_id },
      });
      if (existingOffer) {
        throw new ConflictError("An offer letter has already been issued for this candidate");
      }

      // Upload file buffer to S3/R2
      const extension = file.originalname.split(".").pop() || "pdf";
      const key = `offers/${application_id}-${Date.now()}.${extension}`;
      const fileUrl = await uploadBuffer(file.buffer, key, file.mimetype);

      const offer = await tx.offerLetter.create({
        data: {
          applicationId: application_id,
          designation,
          ctc: new Decimal(ctc),
          joiningDate: joining_date,
          fileUrl: key, // Store key in fileUrl to resolve presigned later, or store complete fileUrl
        },
      });

      // Log action
      await tx.applicationStatusLog.create({
        data: {
          applicationId: application_id,
          changedBy: updaterId,
          fromStatus: app.currentStatus,
          toStatus: app.currentStatus,
          remarks: `Issued offer letter for '${designation}' with CTC: ${ctc} LPA`,
        },
      });

      // Notify student
      await addJobToQueue("BULK_NOTIFY", {
        type: "OFFER_LETTER_ISSUED",
        applicationId: application_id,
        studentEmail: app.student.user.email,
        designation,
        ctc,
      });

      return offer;
    });
  }

  // Accepts or declines the offer letter, modifying candidate placement registries
  async respondToOffer(
    userId: string,
    offerId: string,
    accept: boolean
  ): Promise<{ offerId: string; is_accepted: boolean; student_placement_status: PlacementStatus }> {
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      throw new NotFoundError("Student profile context not resolved");
    }

    return prisma.$transaction(async (tx: any) => {
      const offer = await tx.offerLetter.findUnique({
        where: { id: offerId },
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
      });

      if (!offer) {
        throw new NotFoundError("Offer letter not found");
      }

      if (offer.application.studentId !== student.id) {
        throw new ForbiddenError("Access Denied: You cannot respond to this offer letter");
      }

      if (offer.isAccepted !== null) {
        throw new BadRequestError("Action Forbidden: You have already responded to this offer letter");
      }

      // Update offer response
      const updatedOffer = await tx.offerLetter.update({
        where: { id: offerId },
        data: { isAccepted: accept },
      });

      const nextStatus = accept ? ApplicationStatus.SELECTED : ApplicationStatus.REJECTED;

      // Update application stage if changed
      await tx.application.update({
        where: { id: offer.applicationId },
        data: { currentStatus: nextStatus },
      });

      await tx.applicationStatusLog.create({
        data: {
          applicationId: offer.applicationId,
          changedBy: userId,
          fromStatus: offer.application.currentStatus,
          toStatus: nextStatus,
          remarks: accept
            ? "Candidate accepted formal corporate offer letter"
            : "Candidate declined formal corporate offer letter",
        },
      });

      let placementStatus = student.placementStatus;

      if (accept) {
        placementStatus = PlacementStatus.PLACED;

        // Update student placement status
        await tx.student.update({
          where: { id: student.id },
          data: { placementStatus: PlacementStatus.PLACED },
        });

        // Auto-withdraw other active applications
        await tx.application.updateMany({
          where: {
            studentId: student.id,
            id: { not: offer.applicationId },
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

        // Record logs for withdrawn applications
        const otherApps = await tx.application.findMany({
          where: {
            studentId: student.id,
            id: { not: offer.applicationId },
            isActive: true,
            currentStatus: ApplicationStatus.WITHDRAWN,
          },
        });

        for (const oApp of otherApps) {
          await tx.applicationStatusLog.create({
            data: {
              applicationId: oApp.id,
              changedBy: userId,
              fromStatus: ApplicationStatus.APPLIED, // simple fallback
              toStatus: ApplicationStatus.WITHDRAWN,
              remarks: "Auto-withdrawn: Candidate accepted another corporate offer letter",
            },
          });
        }
      }

      // Notify company recruiters
      await addJobToQueue("BULK_NOTIFY", {
        type: "OFFER_RESPONSE_SUBMITTED",
        applicationId: offer.applicationId,
        companyEmail: offer.application.job.company.website,
        jobTitle: offer.application.job.title,
        candidateName: student.fullName,
        isAccepted: accept,
      });

      return {
        offerId: offer.id,
        is_accepted: accept,
        student_placement_status: placementStatus,
      };
    });
  }

  // Resolves offer PDF pre-signed URLs
  async getDownloadUrl(
    userId: string,
    role: Role,
    companyId: string | null,
    collegeId: string | null,
    offerId: string
  ): Promise<string> {
    const offer = await prisma.offerLetter.findUnique({
      where: { id: offerId },
      include: {
        application: {
          include: {
            student: true,
            job: true,
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundError("Offer letter not found");
    }

    // Access control check
    let isAuthorized = false;

    if (role === Role.STUDENT) {
      const student = await studentRepository.findByUserId(userId);
      if (student && offer.application.studentId === student.id) {
        isAuthorized = true;
      }
    } else if (role === Role.COMPANY_ADMIN) {
      if (offer.application.job.companyId === companyId) {
        isAuthorized = true;
      }
    } else if (
      ([Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN] as Role[]).includes(role) &&
      offer.application.student.collegeId === collegeId
    ) {
      isAuthorized = true;
    } else if (role === Role.SUPER_ADMIN) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      throw new ForbiddenError("Access Denied: You do not possess clearance to download this offer letter");
    }

    return getDownloadPresignedUrl(offer.fileUrl);
  }
}
export const offerService = new OfferService();
