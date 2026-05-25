import { JobType, JobStatus } from "@prisma/client";

export interface JobEligibilityInput {
  min_cgpa: number;
  max_backlogs: number;
  allowed_branches: string[]; // array of department codes
  batch_year_from: number;
  batch_year_to: number;
}

export interface JobSkillInput {
  skill_id: string;
  is_mandatory: boolean;
}

export interface CreateJobPostDTO {
  placement_drive_id: string;
  title: string;
  job_type: JobType;
  location: string;
  ctc_min: number;
  ctc_max: number;
  description: string;
  application_deadline: Date;
  max_applications: number;
  eligibility: JobEligibilityInput;
  required_skills: JobSkillInput[];
}

export interface UpdateJobPostDTO {
  title?: string;
  job_type?: JobType;
  location?: string;
  ctc_min?: number;
  ctc_max?: number;
  description?: string;
  application_deadline?: Date;
  max_applications?: number;
  eligibility?: Partial<JobEligibilityInput>;
  required_skills?: JobSkillInput[];
}

export interface JobSearchFilter {
  limit: number;
  cursor?: string;
  status?: JobStatus;
  job_type?: JobType;
  min_ctc?: number;
  company_id?: string;
  drive_id?: string;
  skill_ids?: string[];
  search?: string;
  sort_by?: "ctcMax" | "createdAt" | "title";
  sort_order?: "asc" | "desc";
}
