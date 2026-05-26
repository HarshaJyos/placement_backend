import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { errorHandler } from "./lib/errors";
import { NotFoundError } from "./lib/errors";

// Import Domain Routers
import authRouter from "./modules/auth/route";
import userRouter from "./modules/user/route";
import studentRouter from "./modules/student/route";
import resumeRouter from "./modules/resume/route";
import companyRouter from "./modules/company/route";
import jobRouter from "./modules/job/route";
import applicationRouter from "./modules/application/route";
import interviewRouter from "./modules/interview/route";
import offerRouter from "./modules/offer/route";
import driveRouter from "./modules/drive/route";
import collegeRouter from "./modules/college/route";
import skillRouter from "./modules/skill/route";
import notificationRouter from "./modules/notification/route";
import adminRouter from "./modules/admin/route";
import asyncJobRouter from "./modules/async-job/route";
import healthRouter from "./modules/health/route";
import swaggerRouter from "./lib/swagger";

const app = express();

// 13. Security Headers Setup (Helmet & Strict Policies)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://cdn.placementapp.in"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    frameguard: { action: "deny" },
  })
);

// Enable CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id", "x-device-fingerprint"],
  })
);

// Standard Body Parsers (with size limit bounds for protection)
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// Dynamic telemetry tracing: Bind Request ID
app.use((req, res, next) => {
  const reqId = req.headers["x-request-id"] || crypto.randomUUID?.() || Date.now().toString();
  req.headers["x-request-id"] = reqId;
  res.setHeader("X-Request-ID", reqId);
  next();
});

// Root Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "HEALTHY",
    timestamp: new Date(),
    uptime: process.uptime(),
  });
});

// Domain Routes Registrations
app.use("/api-docs", swaggerRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/students", studentRouter);
app.use("/api/resumes", resumeRouter);
app.use("/api/companies", companyRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/applications", applicationRouter);
app.use("/api/interviews", interviewRouter);
app.use("/api/offers", offerRouter);
app.use("/api/drives", driveRouter);
app.use("/api/colleges", collegeRouter);
app.use("/api/skills", skillRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/admin", adminRouter);
app.use("/api/async-jobs", asyncJobRouter);
app.use("/api/health", healthRouter);

// Catch-all Wildcard Route Handler for unmatched paths
app.use("*", (req, res, next) => {
  next(new NotFoundError(`The requested API route '${req.originalUrl}' does not exist`));
});

// 10. Core exception and validation error handling middleware
app.use(errorHandler);

export default app;
