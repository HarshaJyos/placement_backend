import { placementQueue } from "../../lib/queue";
import { NotFoundError } from "../../lib/errors";
import { getDownloadPresignedUrl } from "../../lib/storage";

export class AsyncJobService {
  // Polls the BullMQ background job status
  async getJobStatus(jobId: string): Promise<{
    job_id: string;
    status: "COMPLETED" | "PROCESSING" | "FAILED";
    result?: {
      download_url: string;
      expires_in: number;
    };
  }> {
    const job = await placementQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundError("Asynchronous background job not found");
    }

    let status: "COMPLETED" | "PROCESSING" | "FAILED" = "PROCESSING";

    const isCompleted = await job.isCompleted();
    const isFailed = await job.isFailed();

    if (isCompleted) {
      status = "COMPLETED";
    } else if (isFailed) {
      status = "FAILED";
    }

    let result: any = undefined;

    if (status === "COMPLETED" && job.returnvalue) {
      // The returnvalue contains the generated S3 file key or result details
      let downloadUrl = "";
      try {
        const fileKey = job.returnvalue.fileKey || job.returnvalue;
        downloadUrl = await getDownloadPresignedUrl(fileKey);
      } catch (err) {
        console.error("Failed to generate report presigned URL:", err);
      }

      result = {
        download_url: downloadUrl,
        expires_in: 3600,
      };
    }

    return {
      job_id: jobId,
      status,
      result,
    };
  }
}
export const asyncJobService = new AsyncJobService();
