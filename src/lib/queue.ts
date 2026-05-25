import { Queue, Worker, Job } from "bullmq";
import { redisClient } from "./redis";

// Reuse the established Redis connection configuration
const connection = {
  host: process.env.REDIS_URL ? new URL(process.env.REDIS_URL).hostname : "127.0.0.1",
  port: process.env.REDIS_URL ? parseInt(new URL(process.env.REDIS_URL).port || "6379") : 6379,
  username: process.env.REDIS_URL ? new URL(process.env.REDIS_URL).username : undefined,
  password: process.env.REDIS_URL ? new URL(process.env.REDIS_URL).password : undefined,
  maxRetriesPerRequest: null,
};

// Create the central Placement Job Queue
export const placementQueue = new Queue("placement-jobs", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export interface JobPayload {
  type: "SEND_EMAIL_OTP" | "BULK_NOTIFY" | "EXPORT_STUDENTS" | "RECALCULATE_PROFILE";
  data: any;
}

// Enqueue background async jobs securely
export const addJobToQueue = async (
  type: JobPayload["type"],
  data: any
): Promise<string> => {
  const job = await placementQueue.add(type, { type, data });
  return job.id || "";
};

// Initial stub for background worker. Actual processing logic handles individual types.
export const initializeWorker = (processJobCallback: (job: Job) => Promise<void>): Worker => {
  const worker = new Worker("placement-jobs", processJobCallback, {
    connection,
    concurrency: 5,
  });

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} of type ${job.name} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} of type ${job?.name} failed:`, err);
  });

  return worker;
};
