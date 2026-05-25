export interface RegisterCompanyDTO {
  name: string;
  industry: string;
  website: string;
  hq_location: string;
  description: string;
  employee_count: number;
  linkedin_url?: string;
}

export interface UpdateCompanyProfileDTO {
  name?: string;
  industry?: string;
  website?: string;
  hq_location?: string;
  description?: string;
  employee_count?: number;
  linkedin_url?: string;
}

export interface VerifyCompanyDTO {
  is_verified: boolean;
  verification_note?: string;
}

export interface CompanySearchFilter {
  limit: number;
  cursor?: string;
  industry?: string;
  is_verified?: boolean;
  search?: string;
  sort_by?: "name" | "createdAt";
  sort_order?: "asc" | "desc";
}
