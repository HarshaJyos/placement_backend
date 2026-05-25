import { Request, Response, NextFunction } from "express";
import { userService } from "./service";
import { ForbiddenError, BadRequestError } from "../../lib/errors";
import { Role } from "@prisma/client";

export class UserController {
  // Obtains a user profile, enforcing self-ownership boundaries or administrative clearances
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authenticatedUser = req.user!;
      const targetUserId = req.params.user_id;

      // Security check: Enforce ROLE: SELF | COLLEGE_ADMIN | UNIVERSITY_ADMIN | SUPER_ADMIN
      const isSelf = authenticatedUser.id === targetUserId;
      const isPrivilegedAdmin = ([
        Role.SUPER_ADMIN,
        Role.UNIVERSITY_ADMIN,
        Role.COLLEGE_ADMIN,
      ] as Role[]).includes(authenticatedUser.role);

      if (!isSelf && !isPrivilegedAdmin) {
        throw new ForbiddenError(
          "Access Denied: You are not authorized to view this user profile"
        );
      }

      const profile = await userService.getUserProfile(targetUserId);

      // Boundaries validation: COLLEGE_ADMIN can only view students/officers from their own college
      if (!isSelf && authenticatedUser.role === Role.COLLEGE_ADMIN) {
        if (profile.profile?.collegeId !== authenticatedUser.collegeId) {
          throw new ForbiddenError(
            "Access Denied: You cannot view profiles outside your authorized college"
          );
        }
      }

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  // Initiates an email adjustment OTP flow
  async initiateEmailChange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { new_email } = req.body;

      const result = await userService.initiateEmailChange(userId, new_email);
      res.status(200).json({
        success: true,
        otp_token: result.otpToken,
        expires_in: result.expires_in,
        message: "Change OTP has been successfully transmitted to the new email address",
      });
    } catch (error) {
      next(error);
    }
  }

  // Finalizes email modification using OTP tokens
  async confirmEmailChange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { otp_token, otp_code } = req.body;

      const updatedEmail = await userService.confirmEmailChange(userId, otp_token, otp_code);
      res.status(200).json({
        success: true,
        new_email: updatedEmail,
        message: "Your primary profile email address has been updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Standardizes profile picture changes using sharp/multer streams
  async uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const file = req.file;

      if (!file) {
        throw new BadRequestError("No avatar file was supplied in the request");
      }

      const avatarUrl = await userService.uploadAvatar(
        userId,
        file.buffer,
        file.mimetype
      );

      res.status(200).json({
        success: true,
        avatar_url: avatarUrl,
      });
    } catch (error) {
      next(error);
    }
  }
}
export const userController = new UserController();
