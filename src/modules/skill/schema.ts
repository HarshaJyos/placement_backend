import { z } from "zod";

export const createSkillSchema = z.object({
  name: z.string().min(1, "Skill name is required"),
  category: z.string().min(1, "Category is required"),
});

export const listSkillsSchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
