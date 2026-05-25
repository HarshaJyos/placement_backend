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
app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/students", studentRouter);
app.use("/api/resumes", resumeRouter);
app.use("/api/companies", companyRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/applications", applicationRouter);

// Catch-all Wildcard Route Handler for unmatched paths
app.use("*", (req, res, next) => {
  next(new NotFoundError(`The requested API route '${req.originalUrl}' does not exist`));
});

// 10. Core exception and validation error handling middleware
app.use(errorHandler);

export default app;
