import { Request } from "express";
import { prisma } from "./db";

export interface AuditLogData {
  userId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  ip: string;
  beforeSnapshot?: any;
  afterSnapshot?: any;
}

// Extracts the secure client IP address from Express headers
export const getClientIp = (req: Request): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = typeof forwarded === "string" ? forwarded.split(",") : forwarded;
    return ips[0].trim();
  }
  return req.socket.remoteAddress || "127.0.0.1";
};

// Saves snapshot changes into the AuditLog table
export const writeAuditLog = async (data: AuditLogData): Promise<void> => {
  try {
    // Write transactionally or as a standalone task to not block the main workflow
    await prisma.auditLog.create({
      data: {
        userId: data.userId || null,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        ip: data.ip,
        beforeSnapshot: data.beforeSnapshot ? JSON.parse(JSON.stringify(data.beforeSnapshot)) : null,
        afterSnapshot: data.afterSnapshot ? JSON.parse(JSON.stringify(data.afterSnapshot)) : null,
      },
    });
  } catch (error) {
    // Fail silently in audit log writing so the primary database transaction is not disrupted
    console.error("Failed to write audit log:", error);
  }
};
