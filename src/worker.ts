import { Job } from "bullmq";
import { initializeWorker } from "./lib/queue";
import { prisma } from "./lib/db";
import { sendOtpEmail, sendPasswordResetEmail } from "./lib/email";

// Background Job Processing Routing
const processBackgroundJob = async (job: Job): Promise<void> => {
  const { type, data } = job.data;
  console.log(`[Worker] Started processing job ${job.id} of type ${type}`);

  switch (type) {
    case "SEND_EMAIL_OTP": {
      const { email, otpCode } = data;
      console.log(`[Worker] Dispatching real OTP email to: ${email}`);
      await sendOtpEmail(email, otpCode);
      break;
    }

    case "BULK_NOTIFY": {
      const { type: notifyType, jobId, title, companyName, collegeId, applicationId, studentEmail, status, remarks } = data;
      
      if (notifyType === "JOB_PUBLISHED") {
        // Find all active students in this college who are eligible (simplification: notify all active students)
        const students = await prisma.student.findMany({
          where: {
            collegeId,
            isActive: true,
          },
        });

        // Batch insert notification records in DB
        if (students.length > 0) {
          await prisma.notification.createMany({
            data: students.map((s: any) => ({
              studentId: s.id,
              type: "JOB_ALERT",
              title: "New Job Posting Published!",
              body: `Hiring Alert: ${companyName} has published a new role: '${title}'. Check eligibility and submit your application now!`,
              refEntity: "JobPost",
              refEntityId: jobId,
            })),
          });
          console.log(`[Worker] Successfully broadcasted job alerts to ${students.length} students`);
        }
      } else if (notifyType === "APPLICATION_STATUS_UPDATED") {
        // Notify individual candidate
        const app = await prisma.application.findUnique({
          where: { id: applicationId },
          include: { student: true },
        });

        if (app) {
          await prisma.notification.create({
            data: {
              studentId: app.studentId,
              type: "APPLICATION_UPDATE",
              title: "Application Status Update",
              body: `Hiring Update: Your application for '${jobTitle(title || app.jobId)}' has transitioned to: ${status}.${remarks ? ` Note: ${remarks}` : ""}`,
              refEntity: "Application",
              refEntityId: app.id,
            },
          });
        }
      } else if (notifyType === "INTERVIEW_SCHEDULED") {
        const app = await prisma.application.findUnique({
          where: { id: data.applicationId },
        });

        if (app) {
          await prisma.notification.create({
            data: {
              studentId: app.studentId,
              type: "INTERVIEW_SCHEDULED",
              title: `Interview Round ${data.roundNumber} Scheduled!`,
              body: `Hiring Stage: A new ${data.roundType} interview round has been scheduled for ${new Date(data.scheduledAt).toLocaleString()}. Venue/Link: ${data.venueOrLink}`,
              refEntity: "InterviewRound",
              refEntityId: app.id,
            },
          });
        }
      } else if (notifyType === "PASSWORD_RESET") {
        const { email, resetLink } = data;
        console.log(`[Worker] Dispatching real Password Reset email to: ${email}`);
        await sendPasswordResetEmail(email, resetLink);
      }
      break;
    }

    case "EXPORT_STUDENTS": {
      // Heavy excel compiler simulation
      console.log(`[Worker] Running Excel/CSV report generation for filters:`, data);
      break;
    }

    default:
      console.warn(`[Worker] Unrecognized job type: ${type}`);
  }
};

const jobTitle = (id: string): string => {
  return "Software Engineer"; // fallback mock
};

// Initialize and start worker
export const startWorker = () => {
  initializeWorker(processBackgroundJob);
  console.log("BullMQ Background Worker initialized and listening for jobs");
};
