import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Role, User } from "@prisma/client";
import { userRepository } from "./repository";
import { authRepository } from "../auth/repository";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from "../../lib/errors";
import { uploadBuffer, validateFileBuffer } from "../../lib/storage";
import { addJobToQueue } from "../../lib/queue";

const OTP_SECRET = process.env.OTP_HMAC_SECRET || "default-otp-hmac-secret";

export class UserService {
  // Helper to generate secure email verification OTP hashes
  private hashOtp(email: string, otp: string, timestamp: number): string {
    return crypto
      .createHmac("sha256", OTP_SECRET)
      .update(`${email}:${otp}:${timestamp}`)
      .digest("hex");
  }

  // Obtains a formatted user profile with nested role-specific assets
  async getUserProfile(userId: string): Promise<any> {
    const user = (await userRepository.getUserProfile(userId)) as any;
    if (!user) {
      throw new NotFoundError("User profile not found");
    }

    // Standardize the profile payload nesting depending on the role
    let profileData: any = null;
    if (user.role === Role.STUDENT && user.students.length > 0) {
      profileData = user.students[0];
    } else if (user.role === Role.PLACEMENT_OFFICER && user.placementOfficers.length > 0) {
      profileData = user.placementOfficers[0];
    } else if (user.role === Role.COMPANY_ADMIN && user.companyAdmins.length > 0) {
      profileData = user.companyAdmins[0];
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      avatar_url: user.avatarUrl,
      created_at: user.createdAt,
      profile: profileData,
    };
  }

  // Initiates an email update request by sending a verification OTP to the new email address
  async initiateEmailChange(
    userId: string,
    newEmail: string
  ): Promise<{ otpToken: string; expires_in: number }> {
    // Check if the email address is already registered
    const existingUser = await authRepository.findByEmail(newEmail);
    if (existingUser) {
      throw new ConflictError("This email address is already in use");
    }

    // Generate TOTP session
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const timestamp = Date.now();
    const otpCodeHash = this.hashOtp(newEmail, otpCode, timestamp);

    // Create session token valid for 5 minutes
    const otpToken = jwt.sign(
      {
        userId,
        newEmail,
        otpCodeHash,
        timestamp,
      },
      OTP_SECRET,
      { expiresIn: "5m" }
    );

    // Queue TOTP background dispatch
    await addJobToQueue("SEND_EMAIL_OTP", {
      email: newEmail,
      otpCode,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV EMAIL CHANGE OTP] Verification code for ${newEmail} is: ${otpCode}`);
    }

    return {
      otpToken,
      expires_in: 300,
    };
  }

  // Confirms the email change OTP and commits the updated email to the database
  async confirmEmailChange(
    userId: string,
    otpToken: string,
    otpCode: string
  ): Promise<string> {
    let decoded: any;
    try {
      decoded = jwt.verify(otpToken, OTP_SECRET);
    } catch (err) {
      throw new BadRequestError("The email modification session has expired or is invalid");
    }

    const { userId: tokenUserId, newEmail, otpCodeHash, timestamp } = decoded;

    // Security guard: Ensure this request matches the token owner
    if (tokenUserId !== userId) {
      throw new ForbiddenError("You are not authorized to complete this email update");
    }

    // Verify OTP code matches
    const computedHash = this.hashOtp(newEmail, otpCode, timestamp);
    if (computedHash !== otpCodeHash) {
      throw new BadRequestError("Invalid verification code");
    }

    // Ensure email is still free
    const existingUser = await authRepository.findByEmail(newEmail);
    if (existingUser) {
      throw new ConflictError("This email address is already in use");
    }

    await userRepository.updateEmail(userId, newEmail);
    return newEmail;
  }

  // Processes profile avatar file uploads and publishes WebP files directly to R2
  async uploadAvatar(
    userId: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<string> {
    // Restrict to standard web images: JPEG, PNG, and WebP, max 2MB size limit
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    const maxSizeBytes = 2 * 1024 * 1024; // 2MB

    validateFileBuffer(fileBuffer, allowedMimes, maxSizeBytes, mimeType);

    // Standardize avatar pathing: avatars/{userId}.webp
    const key = `avatars/${userId}.webp`;
    
    // Upload image to Cloudflare R2
    const avatarUrl = await uploadBuffer(fileBuffer, key, "image/webp");

    // Commit URL to database User record
    await userRepository.updateAvatarUrl(userId, avatarUrl);

    return avatarUrl;
  }
}
export const userService = new UserService();
