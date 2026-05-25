import { Role, User, LoginSession } from "@prisma/client";

export interface InitiateRegisterDTO {
  email: string;
  role: Role;
  collegeCode: string;
}

export interface VerifyRegisterDTO {
  otpToken: string;
  otpCode: string;
  fullName: string;
  passwordHashOrPlain: string;
}

export interface LoginDTO {
  email: string;
  passwordPlain: string;
  deviceFingerprint: string;
  userAgent: string;
  ipAddress: string;
  rememberMe?: boolean;
}

export interface RefreshTokenDTO {
  refreshToken: string;
  ipAddress: string;
  userAgent: string;
}

export interface ResetPasswordInitiateDTO {
  email: string;
}

export interface ResetPasswordDTO {
  resetToken: string;
  newPasswordPlain: string;
}

export interface ChangePasswordDTO {
  userId: string;
  currentPasswordPlain: string;
  newPasswordPlain: string;
  ipAddress: string;
}

export interface AuthenticatedUserResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    role: Role;
    collegeId: string | null;
    companyId: string | null;
    isProfileComplete: boolean;
  };
  accessToken: string;
  expiresIn: number;
}
