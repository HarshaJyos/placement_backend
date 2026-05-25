import { z } from "zod";
import { Role } from "@prisma/client";

// Password constraint: Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 special character
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;

const passwordValidation = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(
    passwordRegex,
    "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
  );

export const initiateRegisterSchema = z.object({
  email: z.string().email("Invalid email format"),
  role: z.enum([Role.STUDENT, Role.COMPANY_ADMIN, Role.PLACEMENT_OFFICER]),
  college_code: z.string().min(2, "College code is required"),
});

export const verifyRegisterSchema = z.object({
  otp_token: z.string().min(1, "OTP session token is required"),
  otp_code: z.string().length(6, "OTP code must be exactly 6 digits"),
  full_name: z.string().min(2, "Full name must be at least 2 characters long"),
  password: passwordValidation,
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
  device_fingerprint: z.string().optional().default("unknown"),
  remember_me: z.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
});

export const resetPasswordSchema = z.object({
  reset_token: z.string().min(1, "Reset token is required"),
  new_password: passwordValidation,
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: passwordValidation,
});
