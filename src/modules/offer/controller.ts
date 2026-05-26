import { Request, Response, NextFunction } from "express";
import { offerService } from "./service";
import { BadRequestError } from "../../lib/errors";

export class OfferController {
  // Issues a formal corporate offer letter, processing PDF file buffers
  async issueOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const file = req.file;

      if (!file) {
        throw new BadRequestError("Offer letter attachment PDF file is required");
      }

      // Check mime type is PDF
      if (file.mimetype !== "application/pdf") {
        throw new BadRequestError("Invalid file format. Offer letter must be a PDF file.");
      }

      const result = await offerService.issueOffer(
        user.id,
        user.companyId,
        req.body,
        {
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
        }
      );

      res.status(201).json({
        success: true,
        offer: {
          id: result.id,
          application_id: result.applicationId,
          designation: result.designation,
          ctc: Number(result.ctc),
          joining_date: result.joiningDate,
          is_accepted: result.isAccepted,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Student response (accepting/declining) to the issued offer letter
  async respondOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { offer_id } = req.params;
      const { accept } = req.body;

      const result = await offerService.respondToOffer(user.id, offer_id, accept);

      res.status(200).json({
        success: true,
        offer_id: result.offerId,
        is_accepted: result.is_accepted,
        message: result.is_accepted
          ? "Offer accepted. Congratulations!"
          : "Offer declined successfully.",
        student_placement_status: result.student_placement_status,
      });
    } catch (error) {
      next(error);
    }
  }

  // Resolves download URLs for candidate offer letters
  async downloadOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { offer_id } = req.params;

      const downloadUrl = await offerService.getDownloadUrl(
        user.id,
        user.role,
        user.companyId,
        user.collegeId,
        offer_id
      );

      res.status(200).json({
        success: true,
        download_url: downloadUrl,
        expires_in: 3600,
      });
    } catch (error) {
      next(error);
    }
  }
}
export const offerController = new OfferController();
