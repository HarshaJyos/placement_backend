import { Request, Response, NextFunction } from "express";
import { resumeService } from "./service";
import { getClientIp } from "../../lib/audit";
import { BadRequestError } from "../../lib/errors";

export class ResumeController {
  // Registers a student's resume PDF stream, validating sizes and versions
  async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const file = req.file;

      if (!file) {
        throw new BadRequestError("No resume file was supplied in the request");
      }

      const versionLabel = req.body.version_label;
      const isDefault = req.body.is_default === true || req.body.is_default === "true";

      if (!versionLabel) {
        throw new BadRequestError("A version label is required for this resume");
      }

      const resume = await resumeService.uploadResume(
        userId,
        file.buffer,
        file.originalname,
        file.mimetype,
        versionLabel,
        isDefault
      );

      res.status(201).json({
        success: true,
        id: resume.id,
        file_name: resume.fileName,
        version_label: resume.versionLabel,
        is_default: resume.isDefault,
        created_at: resume.createdAt,
      });
    } catch (error) {
      next(error);
    }
  }

  // Lists all active resumes and returns temporary pre-signed links
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const resumes = await resumeService.listResumes(userId);
      res.status(200).json({
        success: true,
        resumes,
      });
    } catch (error) {
      next(error);
    }
  }

  // Promotes a resume to be the primary default version for applications
  async setDefault(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { resume_id } = req.params;

      await resumeService.setDefaultResume(userId, resume_id);

      res.status(200).json({
        success: true,
        message: "Default resume updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Soft-deletes a resume by changing isActive to false
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { resume_id } = req.params;

      await resumeService.softDeleteResume(userId, resume_id);

      res.status(200).json({
        success: true,
        message: "Resume deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtains a pre-signed temporary link for resume retrieval, recording audit tracks
  async getDownloadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const { resume_id } = req.params;
      const ip = getClientIp(req);

      const result = await resumeService.generatePresignedDownloadUrl(
        userId,
        role,
        resume_id,
        ip
      );

      res.status(200).json({
        success: true,
        download_url: result.download_url,
        expires_in: result.expires_in,
      });
    } catch (error) {
      next(error);
    }
  }
}
export const resumeController = new ResumeController();
