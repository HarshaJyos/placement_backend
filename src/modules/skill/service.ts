import { prisma } from "../../lib/db";
import { redisClient } from "../../lib/redis";
import { Skill } from "@prisma/client";
import { ConflictError } from "../../lib/errors";
import { paginate, PaginatedResult } from "../../lib/paginate";

export class SkillService {
  // Registers a new skill tag, flushing skills cache keys in Redis
  async createSkill(dto: { name: string; category: string }): Promise<Skill> {
    const { name, category } = dto;

    const exists = await prisma.skill.findUnique({
      where: { name },
    });
    if (exists) {
      throw new ConflictError(`Skill with name '${name}' already exists`);
    }

    const skill = await prisma.skill.create({
      data: {
        name,
        category,
        isActive: true,
      },
    });

    // Proactively clear skills Redis cache keys
    try {
      if (redisClient.isOpen) {
        const keys = await redisClient.keys("skills:*");
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      }
    } catch (err) {
      console.error("Failed to clear skills Redis cache:", err);
    }

    return skill;
  }

  // Lists all skills, caching paginated results in Redis for 1 hour
  async listSkills(filters: {
    category?: string;
    search?: string;
    limit: number;
    cursor?: string;
  }): Promise<PaginatedResult<Skill>> {
    const { category, search, limit, cursor } = filters;

    const cacheKey = `skills:cat:${category || "all"}:search:${search || "all"}:limit:${limit}:cursor:${cursor || "none"}`;

    // Try reading from Redis cache
    try {
      if (redisClient.isOpen) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as PaginatedResult<Skill>;
        }
      }
    } catch (err) {
      console.error("Failed to read from skills Redis cache:", err);
    }

    const where: any = {
      isActive: true,
    };

    if (category) {
      where.category = {
        equals: category,
        mode: "insensitive",
      };
    }

    if (search) {
      where.name = {
        contains: search,
        mode: "insensitive",
      };
    }

    const baseArgs = {
      where,
    };

    const result = await paginate<any>(
      prisma.skill,
      baseArgs,
      {
        limit,
        cursor,
        sortBy: "name",
        sortOrder: "asc",
      }
    );

    // Save to Redis cache for 1 hour (3600 seconds)
    try {
      if (redisClient.isOpen) {
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(result));
      }
    } catch (err) {
      console.error("Failed to write to skills Redis cache:", err);
    }

    return result;
  }
}
export const skillService = new SkillService();
