import { Resume, Role } from "@prisma/client";
import { resumeRepository } from "./repository";
import { studentRepository } from "../student/repository";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "../../lib/errors";
import { uploadBuffer, getDownloadPresignedUrl, validateFileBuffer } from "../../lib/storage";
import { writeAuditLog } from "../../lib/audit";
import crypto from "crypto";

export class ResumeService {
  // Processes resume file streams and uploads them to Cloudflare R2
  async uploadResume(
    userId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    versionLabel: string,
    isDefault: boolean
  ): Promise<Resume> {
    // 1. Resolve student entity associated with this User
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      throw new NotFoundError("Student profile could not be resolved");
    }

    // 2. Enforce active limit bounds: Maximum 5 resumes allowed per student
    const activeCount = await resumeRepository.countActiveResumes(student.id);
    if (activeCount >= 5) {
      throw new BadRequestError(
        "Upload limit reached: You can maintain a maximum of 5 active resumes"
      );
    }

    // 3. Enforce strict PDF MIME checks and 5MB size limits
    const allowedMimes = ["application/pdf"];
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB
    validateFileBuffer(fileBuffer, allowedMimes, maxSizeBytes, mimeType);

    // 4. Save to Cloudflare R2 under secure directory path resumes/student_id/uuid.pdf
    const uniqueId = crypto.randomUUID();
    const storageKey = `resumes/${student.id}/${uniqueId}.pdf`;
    
    await uploadBuffer(fileBuffer, storageKey, "application/pdf");

    // 5. Commit record to database
    return resumeRepository.createResume(student.id, {
      fileUrl: storageKey, // Store key in fileUrl as industry best practice
      fileName: originalName,
      versionLabel,
      isDefault,
    });
  }

  // Lists all resumes, mapping S3 storage keys to secure 1-hour pre-signed URLs
  async listResumes(userId: string): Promise<any[]> {
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      throw new NotFoundError("Student profile could not be resolved");
    }

    const resumes = await resumeRepository.listResumes(student.id);

    // Dynamic generation of download URLs valid for 1 hour
    return Promise.all(
      resumes.map(async (r) => {
        const url = await getDownloadPresignedUrl(r.fileUrl);
        return {
          id: r.id,
          version_label: r.versionLabel,
          file_name: r.fileName,
          is_default: r.isDefault,
          download_url: url,
          created_at: r.createdAt,
        };
      })
    );
  }

  // Sets a specific resume as default
  async setDefaultResume(userId: string, resumeId: string): Promise<void> {
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      throw new NotFoundError("Student profile could not be resolved");
    }

    const resume = await resumeRepository.findById(resumeId);
    if (!resume || resume.studentId !== student.id) {
      throw new NotFoundError("Resume not found or access denied");
    }

    await resumeRepository.setDefaultResume(student.id, resumeId);
  }

  // Soft-deletes a resume from database registry
  async softDeleteResume(userId: string, resumeId: string): Promise<void> {
    const student = await studentRepository.findByUserId(userId);
    if (!student) {
      throw new NotFoundError("Student profile could not be resolved");
    }

    const resume = await resumeRepository.findById(resumeId);
    if (!resume || resume.studentId !== student.id) {
      throw new NotFoundError("Resume not found or access denied");
    }

    await resumeRepository.softDeleteResume(resumeId);
  }

  // Generates a pre-signed resume download link and records compliance audit trail
  async generatePresignedDownloadUrl(
    requesterId: string,
    requesterRole: Role,
    resumeId: string,
    ipAddress: string
  ): Promise<{ download_url: string; expires_in: number }> {
    const resume = await resumeRepository.findById(resumeId);
    if (!resume) {
      throw new NotFoundError("Resume record not found");
    }

    // Access control: requester must be the student owner OR a corporate recruiter / officer
    let isAuthorized = false;

    if (requesterRole === Role.STUDENT) {
      const student = await studentRepository.findByUserId(requesterId);
      if (student && resume.studentId === student.id) {
        isAuthorized = true;
      }
    } else if (
      ([Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER, Role.COLLEGE_ADMIN, Role.SUPER_ADMIN] as Role[]).includes(
        requesterRole
      )
    ) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      throw new ForbiddenError("Access Denied: You are not authorized to download this resume");
    }

    const downloadUrl = await getDownloadPresignedUrl(resume.fileUrl);

    // DPDP Act Audit logging: log who accessed this PII document
    await writeAuditLog({
      userId: requesterId,
      action: "DOWNLOAD_RESUME",
      entity: "Resume",
      entityId: resume.id,
      ip: ipAddress,
      beforeSnapshot: null,
      afterSnapshot: {
        resume_id: resume.id,
        student_id: resume.studentId,
        downloaded_by: requesterId,
        role: requesterRole,
        compliance: "DPDP_ACT_PII_ACCESS_AUDIT",
      },
    });

    return {
      download_url: downloadUrl,
      expires_in: 3600,
    };
  }
}
export const resumeService = new ResumeService();
