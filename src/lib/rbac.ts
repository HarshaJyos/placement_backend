import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { ForbiddenError, UnauthorizedError } from "./errors";

// Role-based Access Control middleware generator
export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Ensure user is authenticated first
      if (!req.user) {
        throw new UnauthorizedError("Authentication context is missing");
      }

      // SUPER_ADMIN has immediate root clearance across all routes
      if (req.user.role === Role.SUPER_ADMIN) {
        return next();
      }

      // Verify user has one of the allowed roles
      const hasPermission = allowedRoles.includes(req.user.role);
      if (!hasPermission) {
        throw new ForbiddenError(
          `Access Denied: Role '${req.user.role}' does not have permission to access this resource`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
