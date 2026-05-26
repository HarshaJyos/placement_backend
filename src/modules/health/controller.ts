import { Request, Response, NextFunction } from "express";
import { healthService } from "./service";
import { getClientIp } from "../../lib/audit";
import { ForbiddenError } from "../../lib/errors";

export class HealthController {
  // Load balancer health check
  check(req: Request, res: Response, next: NextFunction): void {
    try {
      const result = healthService.getHealth();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // Deep monitoring health diagnostics (Internal IP Allowlist protected)
  async deepCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = getClientIp(req);
      const isInternal =
        ip === "127.0.0.1" ||
        ip === "::1" ||
        ip === "::ffff:127.0.0.1" ||
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        ip.startsWith("172.16.") ||
        ip.startsWith("::ffff:10.") ||
        ip.startsWith("::ffff:192.168.") ||
        ip.startsWith("::ffff:172.16.");

      if (!isInternal) {
        throw new ForbiddenError("Access Denied: Internal IP allowlist only");
      }

      const result = await healthService.getDeepHealth();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}
export const healthController = new HealthController();
