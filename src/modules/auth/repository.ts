import { prisma } from "../../lib/db";
import { User, LoginSession, Role, College } from "@prisma/client";

export class AuthRepository {
  // Finds an active user by their email address
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        email,
        isActive: true,
      },
    });
  }

  // Finds an active user by their database UUID
  async findById(id: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        id,
        isActive: true,
      },
    });
  }

  // Finds an active college by its unique college code
  async findCollegeByCode(code: string): Promise<College | null> {
    return prisma.college.findFirst({
      where: {
        code,
        isActive: true,
      },
    });
  }

  // Creates a new user record in a database transaction
  async createUser(data: {
    email: string;
    passwordHash: string;
    role: Role;
    collegeId: string | null;
  }): Promise<User> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          role: data.role,
          collegeId: data.collegeId,
        },
      });

      // Automatically initialize an empty student profile if user is a student
      if (data.role === Role.STUDENT) {
        await tx.student.create({
          data: {
            userId: user.id,
            collegeId: data.collegeId!,
            departmentId: "00000000-0000-0000-0000-000000000000", // Will be completed in onboarding
            rollNumber: `TEMP-${Date.now()}`,
            fullName: "",
            batchYear: 0,
            cgpa: 0.0,
            backlogs: 0,
            phone: "",
            profile: {
              create: {
                isProfileComplete: false,
              },
            },
          },
        });
      } else if (data.role === Role.PLACEMENT_OFFICER) {
        await tx.placementOfficer.create({
          data: {
            userId: user.id,
            collegeId: data.collegeId!,
            designation: "",
            phone: "",
          },
        });
      }

      return user;
    });
  }

  // Creates a secure login session entry in the database
  async createSession(data: {
    userId: string;
    device: string;
    ip: string;
    location?: string;
    familyId: string;
    tokenHash: string;
  }): Promise<LoginSession> {
    return prisma.loginSession.create({
      data: {
        userId: data.userId,
        device: data.device,
        ip: data.ip,
        location: data.location || null,
        familyId: data.familyId,
        tokenHash: data.tokenHash,
      },
    });
  }

  // Retrieves login session details by database ID
  async getSession(sessionId: string): Promise<LoginSession | null> {
    return prisma.loginSession.findUnique({
      where: { id: sessionId },
    });
  }

  // Revokes a single specific session
  async revokeSession(sessionId: string): Promise<void> {
    await prisma.loginSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
  }

  // Revokes an entire refresh token family due to security threat/compromise
  async revokeFamily(familyId: string): Promise<void> {
    await prisma.loginSession.updateMany({
      where: { familyId },
      data: { isRevoked: true },
    });
  }

  // Lists all active, non-revoked sessions for a specific user
  async listActiveSessions(userId: string): Promise<LoginSession[]> {
    return prisma.loginSession.findMany({
      where: {
        userId,
        isRevoked: false,
      },
      orderBy: {
        lastActive: "desc",
      },
    });
  }

  // Updates the last active timestamp of a session
  async touchSession(sessionId: string, tokenHash: string): Promise<void> {
    await prisma.loginSession.update({
      where: { id: sessionId },
      data: {
        lastActive: new Date(),
        tokenHash,
      },
    });
  }

  // Revokes all sessions for a specific user (logout all devices)
  async revokeAllSessions(userId: string): Promise<void> {
    await prisma.loginSession.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }

  // Saves a new password hash for a user
  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  // Checks if a student profile is complete
  async isStudentProfileComplete(userId: string): Promise<boolean> {
    const student = await prisma.student.findFirst({
      where: { userId },
      include: { profile: true },
    });
    return student?.profile?.isProfileComplete || false;
  }
}
export const authRepository = new AuthRepository();
