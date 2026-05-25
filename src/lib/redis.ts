import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

export const redisClient = createClient({
  url: redisUrl,
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err);
});

// Proactively connect to the Redis instance
(async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log("Successfully connected to Redis server");
    }
  } catch (error) {
    console.error("Failed to connect to Redis server:", error);
  }
})();
