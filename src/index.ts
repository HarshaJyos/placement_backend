import dotenv from "dotenv";
// Ensure environment variables are loaded first
dotenv.config();

import app from "./app";
import { startWorker } from "./worker";
import { redisClient } from "./lib/redis";
import { prisma } from "./lib/db";

const PORT = process.env.PORT || 5000;

// Connect to Redis and check DB connection before starting listeners
const bootstrap = async () => {
  try {
    // 1. Check PostgreSQL Prisma connection
    await prisma.$connect();
    console.log("Database connection has been established successfully via Prisma");

    // 2. Start background queues worker
    if (redisClient.isOpen) {
      startWorker();
    } else {
      console.warn("Redis client is not open. Background worker starting deferred.");
      redisClient.on("ready", () => {
        startWorker();
      });
    }

    // 3. Start listening for Express requests
    const server = app.listen(PORT, () => {
      console.log(`Placement Platform REST API server is listening on port ${PORT} [Mode: ${process.env.NODE_ENV}]`);
    });

    // Handle graceful shutdowns
    const shutdown = async () => {
      console.log("Shutting down servers gracefully...");
      server.close(async () => {
        console.log("Express server stopped");
        await prisma.$disconnect();
        console.log("Database disconnected");
        if (redisClient.isOpen) {
          await redisClient.disconnect();
          console.log("Redis disconnected");
        }
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

  } catch (error) {
    console.error("Critical: Failed to bootstrap server:", error);
    process.exit(1);
  }
};

bootstrap();
