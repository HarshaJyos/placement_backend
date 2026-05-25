import { Role } from "@prisma/client";

export interface UpdateEmailInitiateDTO {
  userId: string;
  newEmail: string;
}

export interface UpdateEmailConfirmDTO {
  userId: string;
  otpToken: string;
  otpCode: string;
}

export interface UserProfileResponse {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  profile: any; // Type depends on the role (Student, CompanyAdmin, PlacementOfficer, etc.)
}
