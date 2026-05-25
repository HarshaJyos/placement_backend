import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { UnauthorizedError } from "./errors";
import { redisClient } from "./redis";

// Define the payload structure inside JWTs
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  collegeId: string | null;
  companyId: string | null;
}

// Extend global Express namespace to support typed req.user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access-default-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "refresh-default-secret";

// Generate an access token (15-minute expiry)
export const generateAccessToken = (user: AuthUser): string => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      collegeId: user.collegeId,
      companyId: user.companyId,
    },
    ACCESS_SECRET,
    { expiresIn: "15m" }
  );
};

// Generate a refresh token (7-day expiry)
export const generateRefreshToken = (
  user: AuthUser,
  familyId: string,
  sessionId: string
): string => {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      collegeId: user.collegeId,
      companyId: user.companyId,
      familyId,
      sessionId,
    },
    REFRESH_SECRET,
    { expiresIn: "7d", jwtid: sessionId }
  );
};

// Verify Access Token middleware
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authentication token is missing or malformed");
    }

    const token = authHeader.split(" ")[1];
    
    // Verify the JWT signature
    let decoded: any;
    try {
      decoded = jwt.verify(token, ACCESS_SECRET);
    } catch (err) {
      throw new UnauthorizedError("Authentication token is invalid or has expired");
    }

    // Check Redis blacklist to ensure session was not invalidated (e.g. logged out)
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedError("This token session has been logged out");
    }

    // Bind authenticated context to request object
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role as Role,
      collegeId: decoded.collegeId || null,
      companyId: decoded.companyId || null,
    };

    next();
  } catch (error) {
    next(error);
  }
};
