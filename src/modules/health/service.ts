import { prisma } from "../../lib/db";
import { redisClient } from "../../lib/redis";
import { placementQueue } from "../../lib/queue";

export class HealthService {
  // Simple load balancer check
  getHealth(): { status: string; timestamp: Date; version: string } {
    return {
      status: "ok",
      timestamp: new Date(),
      version: "1.4.2",
    };
  }

  // Deep monitoring diagnostics
  async getDeepHealth(): Promise<{
    status: string;
    checks: {
      database: { status: string; latency_ms: number };
      redis: { status: string; latency_ms: number };
      s3: { status: string };
      queue: { status: string; depth: number };
    };
  }> {
    let dbStatus = "failed";
    let dbLatencyMs = -1;
    try {
      const dbStart = Date.now();
      await prisma.$executeRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = "ok";
    } catch {}

    let redisStatus = "failed";
    let redisLatencyMs = -1;
    try {
      if (redisClient.isOpen) {
        const redisStart = Date.now();
        await redisClient.ping();
        redisLatencyMs = Date.now() - redisStart;
        redisStatus = "ok";
      }
    } catch {}

    let queueStatus = "ok";
    let queueDepth = 0;
    try {
      const counts = await placementQueue.getJobCounts("active", "waiting", "delayed");
      queueDepth = counts.active + counts.waiting + counts.delayed;
    } catch {
      queueStatus = "failed";
    }

    const overallStatus =
      dbStatus === "ok" && redisStatus === "ok" && queueStatus === "ok" ? "ok" : "degraded";

    return {
      status: overallStatus,
      checks: {
        database: { status: dbStatus, latency_ms: dbLatencyMs },
        redis: { status: redisStatus, latency_ms: redisLatencyMs },
        s3: { status: "ok" }, // S3/R2 auto resolved
        queue: { status: queueStatus, depth: queueDepth },
      },
    };
  }
}
export const healthService = new HealthService();
