import { ProficiencyLevel, PlacementStatus } from "@prisma/client";

export interface StudentSkillInput {
  skill_id: string;
  proficiency_level: ProficiencyLevel;
}

export interface CompleteStudentProfileDTO {
  full_name: string;
  roll_number: string;
  batch_year: number;
  cgpa: number;
  backlogs: number;
  phone: string;
  department_id: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  bio?: string;
  current_city?: string;
  skills: StudentSkillInput[];
}

export interface StudentSearchFilter {
  limit: number;
  cursor?: string;
  college_id?: string;
  department_id?: string;
  batch_year?: number;
  min_cgpa?: number;
  max_backlogs?: number;
  placement_status?: PlacementStatus;
  skill_ids?: string[]; // skill UUIDs
  search?: string;
  sort_by?: "cgpa" | "createdAt" | "fullName";
  sort_order?: "asc" | "desc";
}
