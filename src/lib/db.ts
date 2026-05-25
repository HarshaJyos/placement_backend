import { PrismaClient } from "@prisma/client";

// Set up single database client instance
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
});
