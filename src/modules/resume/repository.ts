import { prisma } from "../../lib/db";
import { Resume } from "@prisma/client";

export class ResumeRepository {
  // Counts active resumes for a student
  async countActiveResumes(studentId: string): Promise<number> {
    return prisma.resume.count({
      where: {
        studentId,
        isActive: true,
      },
    });
  }

  // Atomically uploads a resume and resets default flags transactionally
  async createResume(
    studentId: string,
    data: {
      fileUrl: string;
      fileName: string;
      versionLabel: string;
      isDefault: boolean;
    }
  ): Promise<Resume> {
    return prisma.$transaction(async (tx: any) => {
      if (data.isDefault) {
        // Set all other active resumes to non-default
        await tx.resume.updateMany({
          where: { studentId, isActive: true },
          data: { isDefault: false },
        });
      }

      return tx.resume.create({
        data: {
          studentId,
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          versionLabel: data.versionLabel,
          isDefault: data.isDefault,
          isActive: true,
        },
      });
    });
  }

  // Lists all active resumes for a student
  async listResumes(studentId: string): Promise<Resume[]> {
    return prisma.resume.findMany({
      where: {
        studentId,
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  // Finds a resume by ID
  async findById(resumeId: string): Promise<Resume | null> {
    return prisma.resume.findFirst({
      where: {
        id: resumeId,
        isActive: true,
      },
    });
  }

  // Sets a specific resume as default, resetting others transactionally
  async setDefaultResume(studentId: string, resumeId: string): Promise<void> {
    await prisma.$transaction(async (tx: any) => {
      // Clear other defaults
      await tx.resume.updateMany({
        where: { studentId, isActive: true },
        data: { isDefault: false },
      });

      // Set target to default
      await tx.resume.update({
        where: { id: resumeId },
        data: { isDefault: true },
      });
    });
  }

  // Soft-deletes a resume by changing isActive to false
  async softDeleteResume(resumeId: string): Promise<void> {
    await prisma.resume.update({
      where: { id: resumeId },
      data: { isActive: false },
    });
  }
}
export const resumeRepository = new ResumeRepository();
