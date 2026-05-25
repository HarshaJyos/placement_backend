import { z } from "zod";

export const updateEmailInitiateSchema = z.object({
  new_email: z.string().email("Invalid email format"),
});

export const updateEmailConfirmSchema = z.object({
  otp_token: z.string().min(1, "OTP session token is required"),
  otp_code: z.string().length(6, "OTP code must be exactly 6 digits"),
});
