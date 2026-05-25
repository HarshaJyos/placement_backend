import { prisma } from "../../lib/db";
import { User, Role } from "@prisma/client";

export class UserRepository {
  // Retrieves user and role-specific nested details
  async getUserProfile(userId: string): Promise<User | null> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
      },
      include: {
        students: {
          where: { isActive: true },
          include: {
            profile: true,
            department: true,
          },
        },
        placementOfficers: {
          include: {
            college: true,
          },
        },
        companyAdmins: {
          include: {
            company: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    return user;
  }

  // Updates the user email address in the database
  async updateEmail(userId: string, email: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { email },
    });
  }

  // Updates the profile avatar URL
  async updateAvatarUrl(userId: string, avatarUrl: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
  }
}
export const userRepository = new UserRepository();
