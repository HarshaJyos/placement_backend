import { Request, Response, NextFunction } from "express";
import { authService } from "./service";
import { getClientIp } from "../../lib/audit";
import { UnauthorizedError } from "../../lib/errors";
import jwt from "jsonwebtoken";
import { authRepository } from "./repository";

const isProduction = process.env.NODE_ENV === "production";

// Helper to set standard httpOnly cookie for Refresh Tokens
const setRefreshTokenCookie = (res: Response, token: string) => {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// Helper to clear standard httpOnly cookie for Refresh Tokens
const clearRefreshTokenCookie = (res: Response) => {
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
  });
};

export class AuthController {
  // Initiates student/officer/recruiter onboarding verification
  async initiateRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, role, college_code, admin_invite_code } = req.body;
      const result = await authService.initiateRegister(email, role, college_code, admin_invite_code);
      res.status(200).json({
        success: true,
        message: "OTP successfully sent to college email",
        otp_token: result.otpToken,
        expires_in: result.expiresIn,
      });
    } catch (error) {
      next(error);
    }
  }

  // Confirms the registration OTP and activates the account session
  async verifyRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { otp_token, otp_code, full_name, password } = req.body;
      const result = await authService.verifyRegister(
        otp_token,
        otp_code,
        full_name,
        password
      );

      setRefreshTokenCookie(res, result.refreshToken);

      res.status(201).json({
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
        },
        access_token: result.accessToken,
        token_type: "Bearer",
        expires_in: 900,
      });
    } catch (error) {
      next(error);
    }
  }

  // Performs user login, sets refresh cookies, and returns access tokens
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, device_fingerprint, remember_me } = req.body;
      const ip = getClientIp(req);
      const userAgent = req.headers["user-agent"] || "unknown";

      const result = await authService.login(
        email,
        password,
        userAgent,
        ip,
        null // Geolocation can be populated in production
      );

      // Issue refresh cookie if user logged in
      setRefreshTokenCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          college_id: result.user.collegeId,
          is_profile_complete: result.isProfileComplete,
        },
        access_token: result.accessToken,
        token_type: "Bearer",
        expires_in: 900,
      });
    } catch (error) {
      next(error);
    }
  }

  // Rotates token sessions and generates a fresh JWT access token
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies.refresh_token;
      if (!token) {
        throw new UnauthorizedError("Refresh session cookie is missing");
      }

      const ip = getClientIp(req);
      const userAgent = req.headers["user-agent"] || "unknown";

      const result = await authService.rotateTokens(token, ip, userAgent);

      setRefreshTokenCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        access_token: result.accessToken,
        expires_in: 900,
      });
    } catch (error) {
      // Clear cookie on failure to prevent stale sessions
      clearRefreshTokenCookie(res);
      next(error);
    }
  }

  // Terminates the current refresh session and blacklists access tokens
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const accessToken = authHeader ? authHeader.split(" ")[1] : "";
      const refreshToken = req.cookies.refresh_token;
      const logoutAllDevices = req.body.logout_all_devices === true;

      await authService.logout(accessToken, refreshToken, logoutAllDevices);

      clearRefreshTokenCookie(res);

      res.status(200).json({
        success: true,
        message: "Successfully logged out from all active sessions",
      });
    } catch (error) {
      next(error);
    }
  }

  // Sends password recovery signed URLs asynchronously
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      await authService.initiateForgotPassword(email);
      res.status(200).json({
        success: true,
        message: "If this email exists, a password reset link has been successfully dispatched",
      });
    } catch (error) {
      next(error);
    }
  }

  // Completes the password reset sequence using cached recovery tokens
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reset_token, new_password } = req.body;
      await authService.resetPassword(reset_token, new_password);
      res.status(200).json({
        success: true,
        message: "Password reset complete. You may now log in with your new credentials.",
      });
    } catch (error) {
      next(error);
    }
  }

  // Updates authenticated user passwords, invalidating standard login sessions
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { current_password, new_password } = req.body;
      
      await authService.changePassword(userId, current_password, new_password);
      clearRefreshTokenCookie(res);

      res.status(200).json({
        success: true,
        message: "Password updated successfully. Please re-authenticate.",
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtains details of the currently authenticated request session
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const isProfileComplete =
        user.role === "STUDENT"
          ? await authRepository.isStudentProfileComplete(user.id)
          : true;

      res.status(200).json({
        success: true,
        id: user.id,
        email: user.email,
        role: user.role,
        college_id: user.collegeId,
        company_id: user.companyId,
        is_profile_complete: isProfileComplete,
      });
    } catch (error) {
      next(error);
    }
  }

  // Lists all active device sessions for this user account
  async listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const currentToken = req.cookies.refresh_token;

      // Extract current session ID if exists to flag is_current
      let currentSessionId = "";
      if (currentToken) {
        try {
          const decoded: any = jwt.decode(currentToken);
          currentSessionId = decoded?.sessionId || "";
        } catch {}
      }

      const sessions = await authService.getSessionsList(userId);
      const formattedSessions = sessions.map((s) => ({
        ...s,
        is_current: s.session_id === currentSessionId,
      }));

      res.status(200).json({
        success: true,
        sessions: formattedSessions,
      });
    } catch (error) {
      next(error);
    }
  }

  // Revokes a specific session (force logout a device)
  async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { session_id } = req.params;

      await authService.revokeSpecificSession(userId, session_id);

      res.status(200).json({
        success: true,
        message: "Session successfully revoked",
      });
    } catch (error) {
      next(error);
    }
  }
}
export const authController = new AuthController();
