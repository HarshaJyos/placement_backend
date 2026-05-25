import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

// Base application error class
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
    public readonly details: any = null
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Custom specialized error sub-classes
export class BadRequestError extends AppError {
  constructor(message = "Bad Request", details: any = null) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation Error", details: any = null) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", details: any = null) {
    super(401, "UNAUTHORIZED", message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details: any = null) {
    super(403, "FORBIDDEN", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not Found", details: any = null) {
    super(404, "NOT_FOUND", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details: any = null) {
    super(409, "CONFLICT", message, details);
  }
}

export class UnprocessableError extends AppError {
  constructor(message = "Unprocessable Entity", details: any = null) {
    super(422, "UNPROCESSABLE_ENTITY", message, details);
  }
}

// Global Express error handler middleware
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.headers["x-request-id"] || "N/A";
  
  // Format Zod validation errors to standardized format
  if (err instanceof ZodError) {
    const formattedDetails = err.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
      code: e.code,
    }));
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Validation failed for the requested payload",
      details: formattedDetails,
      requestId,
    });
    return;
  }

  // Handle known AppErrors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.errorCode,
      message: err.message,
      details: err.details,
      requestId,
    });
    return;
  }

  // Log unhandled server errors with context
  console.error(`[RequestId: ${requestId}] Unhandled Error:`, err);

  const isProduction = process.env.NODE_ENV === "production";
  
  // Deliver clean, secure JSON responses
  res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: isProduction ? "An unexpected system error occurred" : err.message,
    details: isProduction ? null : err.stack,
    requestId,
  });
};
