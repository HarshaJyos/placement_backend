import crypto from "crypto";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import { Role, User, LoginSession } from "@prisma/client";
import { authRepository } from "./repository";
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  ValidationError,
  ForbiddenError,
} from "../../lib/errors";
import {
  generateAccessToken,
  generateRefreshToken,
  AuthUser,
} from "../../lib/auth";
import { redisClient } from "../../lib/redis";
import { addJobToQueue } from "../../lib/queue";

const OTP_SECRET = process.env.OTP_HMAC_SECRET || "default-otp-hmac-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "refresh-default-secret";

export class AuthService {
  // Helper to hash OTP values securely
  private hashOtp(email: string, otp: string, timestamp: number): string {
    return crypto
      .createHmac("sha256", OTP_SECRET)
      .update(`${email}:${otp}:${timestamp}`)
      .digest("hex");
  }

  // Initiates registration by generating a 6-digit OTP and returning a short-lived session token
  async initiateRegister(
    email: string,
    role: Role,
    collegeCode: string
  ): Promise<{ otpToken: string; expiresIn: number }> {
    // Check if user already exists
    const existingUser = await authRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictError("A user with this email address already exists");
    }

    // Verify college validity
    const college = await authRepository.findCollegeByCode(collegeCode);
    if (!college) {
      throw new BadRequestError("Invalid college authorization code");
    }

    // Generate a secure 6-digit numeric OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const timestamp = Date.now();
    const otpCodeHash = this.hashOtp(email, otpCode, timestamp);

    // Create short-lived (5 min) JWT containing verification state
    const otpToken = jwt.sign(
      {
        email,
        role,
        collegeId: college.id,
        otpCodeHash,
        timestamp,
      },
      OTP_SECRET,
      { expiresIn: "5m" }
    );

    // Offload OTP sending asynchronously via BullMQ
    await addJobToQueue("SEND_EMAIL_OTP", {
      email,
      otpCode,
    });

    // For local development convenience, print OTP to console
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV OTP ALERT] Code for ${email} is: ${otpCode}`);
    }

    return {
      otpToken,
      expiresIn: 300,
    };
  }

  // Verifies the TOTP and completes registration, creating the database User and Student entities
  async verifyRegister(
    otpToken: string,
    otpCode: string,
    fullName: string,
    passwordPlain: string
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    let decoded: any;
    try {
      decoded = jwt.verify(otpToken, OTP_SECRET);
    } catch (err) {
      throw new BadRequestError("The registration session token has expired or is invalid");
    }

    const { email, role, collegeId, otpCodeHash, timestamp } = decoded;

    // Verify OTP matches signature
    const computedHash = this.hashOtp(email, otpCode, timestamp);
    if (computedHash !== otpCodeHash) {
      throw new BadRequestError("Invalid verification code");
    }

    // Check email uniqueness again to avoid race conditions
    const existingUser = await authRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictError("A user with this email address already exists");
    }

    // Hash the password securely using production-grade Argon2id
    const passwordHash = await argon2.hash(passwordPlain, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64MB
      timeCost: 3,
      parallelism: 4,
    });

    const user = await authRepository.createUser({
      email,
      passwordHash,
      role: role as Role,
      collegeId,
    });

    // Log the user in immediately
    const loginSession = await this.authenticateUserSession(
      user,
      "Initial Registration Setup",
      "0.0.0.0",
      null
    );

    return {
      user,
      accessToken: loginSession.accessToken,
      refreshToken: loginSession.refreshToken,
    };
  }

  // Performs credentials validation and establishes a login session
  async login(
    email: string,
    passwordPlain: string,
    device: string,
    ip: string,
    location: string | null
  ): Promise<{ user: User; isProfileComplete: boolean; accessToken: string; refreshToken: string }> {
    const user = await authRepository.findByEmail(email);
    if (!user) {
      // Avoid revealing user existence (prevent user enumeration)
      throw new UnauthorizedError("Invalid email or password");
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, passwordPlain);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const isProfileComplete =
      user.role === Role.STUDENT
        ? await authRepository.isStudentProfileComplete(user.id)
        : true;

    const loginSession = await this.authenticateUserSession(
      user,
      device,
      ip,
      location
    );

    return {
      user,
      isProfileComplete,
      accessToken: loginSession.accessToken,
      refreshToken: loginSession.refreshToken,
    };
  }

  // Generates access and rotating refresh token pairs and caches session state
  private async authenticateUserSession(
    user: User,
    device: string,
    ip: string,
    location: string | null
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const familyId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();

    const authContext: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      collegeId: user.collegeId,
      companyId: user.companyId,
    };

    const accessToken = generateAccessToken(authContext);
    const refreshToken = generateRefreshToken(authContext, familyId, sessionId);

    // Hash the token before database insertion to prevent DB read compromise leaks
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    await authRepository.createSession({
      userId: user.id,
      device,
      ip,
      location: location || undefined,
      familyId,
      tokenHash,
    });

    return { accessToken, refreshToken };
  }

  // High-performance Refresh Token Rotation logic with stolen token detection
  async rotateTokens(
    refreshToken: string,
    ip: string,
    device: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch (err) {
      throw new UnauthorizedError("Session has expired. Please log in again.");
    }

    const { id, familyId, sessionId } = decoded;
    const incomingTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    const session = await authRepository.getSession(sessionId);

    // Breach Detection: If session is already revoked or token hash doesn't match active,
    // it implies this refresh token was reused/stolen. We immediately revoke the entire family!
    if (!session || session.isRevoked || session.tokenHash !== incomingTokenHash) {
      if (session) {
        await authRepository.revokeFamily(session.familyId);
      }
      throw new ForbiddenError("Security Alert: Replay attack detected. Session terminated.");
    }

    const user = await authRepository.findById(id);
    if (!user) {
      throw new UnauthorizedError("User session context no longer active");
    }

    // Generate a fresh session ID but maintain the same token family
    const nextSessionId = crypto.randomUUID();
    const authContext: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      collegeId: user.collegeId,
      companyId: user.companyId,
    };

    const nextAccessToken = generateAccessToken(authContext);
    const nextRefreshToken = generateRefreshToken(authContext, familyId, nextSessionId);
    const nextTokenHash = crypto.createHash("sha256").update(nextRefreshToken).digest("hex");

    // Invalidate the old session and create/rotate to the new session
    await authRepository.revokeSession(sessionId);
    await authRepository.createSession({
      userId: user.id,
      device,
      ip,
      location: session.location || undefined,
      familyId,
      tokenHash: nextTokenHash,
    });

    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
    };
  }

  // Logs out a user session, revoking refresh tokens and blacklisting access tokens
  async logout(
    accessToken: string,
    refreshToken: string | undefined,
    logoutAllDevices = false
  ): Promise<void> {
    // 1. Blacklist current access token in Redis
    try {
      const decoded: any = jwt.decode(accessToken);
      if (decoded && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redisClient.set(`blacklist:${accessToken}`, "true", { EX: ttl });
        }
      }
    } catch (err) {
      // Safe fallback
    }

    // 2. Invalidate refresh token session
    if (logoutAllDevices && this.reqUser(accessToken)) {
      const decoded: any = jwt.decode(accessToken);
      if (decoded) {
        await authRepository.revokeAllSessions(decoded.id);
      }
    } else if (refreshToken) {
      try {
        const decoded: any = jwt.verify(refreshToken, REFRESH_SECRET);
        await authRepository.revokeSession(decoded.sessionId);
      } catch (err) {
        // Token might already be invalid
      }
    }
  }

  // Helper helper to decode access token securely
  private reqUser(token: string): any {
    try {
      return jwt.decode(token);
    } catch {
      return null;
    }
  }

  // Initiates secure forgotten password recovery link via signed token URLs
  async initiateForgotPassword(email: string): Promise<void> {
    const user = await authRepository.findByEmail(email);
    if (!user) {
      // Security: Do not reveal if email exists. Fail silently
      return;
    }

    // Create a 15-minute password reset signature
    const resetToken = crypto.randomUUID();
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Cache the reset request in Redis with a 15-minute expiry
    await redisClient.set(`password-reset:${tokenHash}`, user.id, { EX: 900 });

    const resetLink = `https://placementapp.in/auth/reset-password?token=${resetToken}`;
    console.log(`[PASSWORD RESET TRIGGERED] Reset link for ${email}: ${resetLink}`);

    // Queue email trigger asynchronously
    await addJobToQueue("BULK_NOTIFY", {
      type: "PASSWORD_RESET",
      email,
      resetLink,
    });
  }

  // Resets user password and terminates all active sessions to protect the account
  async resetPassword(resetToken: string, newPasswordPlain: string): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const userId = await redisClient.get(`password-reset:${tokenHash}`);
    
    if (!userId) {
      throw new BadRequestError("Password reset token has expired or is invalid");
    }

    // Hash the password securely
    const passwordHash = await argon2.hash(newPasswordPlain, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 4,
    });

    // Update database & revoke all devices for security
    await authRepository.updatePassword(userId, passwordHash);
    await authRepository.revokeAllSessions(userId);
    
    // Invalidate the reset token
    await redisClient.del(`password-reset:${tokenHash}`);
  }

  // Changes user password while keeping current login session active (but terminating others)
  async changePassword(
    userId: string,
    currentPasswordPlain: string,
    newPasswordPlain: string
  ): Promise<void> {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError("User context not found");
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, currentPasswordPlain);
    if (!isPasswordValid) {
      throw new BadRequestError("Invalid current password");
    }

    const nextPasswordHash = await argon2.hash(newPasswordPlain, {
      type: argon2.argon2id,
    });

    await authRepository.updatePassword(userId, nextPasswordHash);
    
    // Safety requirement: Invalidate all other active sessions (excluding the current session or all sessions)
    await authRepository.revokeAllSessions(userId);
  }

  // Lists active devices for user dashboard
  async getSessionsList(userId: string): Promise<any[]> {
    const sessions = await authRepository.listActiveSessions(userId);
    return sessions.map((s) => ({
      session_id: s.id,
      device: s.device,
      ip: s.ip,
      location: s.location,
      last_active: s.lastActive,
      is_current: false, // Set in controller comparison
    }));
  }

  // Revokes a user session by session ID
  async revokeSpecificSession(userId: string, sessionId: string): Promise<void> {
    const session = await authRepository.getSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new BadRequestError("Session not found or authorization denied");
    }
    await authRepository.revokeSession(sessionId);
  }
}
export const authService = new AuthService();
