import { Company, Role } from "@prisma/client";
import { companyRepository } from "./repository";
import { RegisterCompanyDTO, UpdateCompanyProfileDTO, CompanySearchFilter } from "./types";
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from "../../lib/errors";
import { prisma } from "../../lib/db";
import { uploadBuffer, validateFileBuffer } from "../../lib/storage";
import { PaginatedResult } from "../../lib/paginate";

export class CompanyService {
  // Registers a corporate identity and links the creator as the master administrator
  async registerCompany(data: RegisterCompanyDTO, adminUserId: string): Promise<Company> {
    // Safety check: Recruiters can only be associated with 1 corporate identity
    const user = await prisma.user.findUnique({
      where: { id: adminUserId },
    });

    if (!user) {
      throw new NotFoundError("Recruiter account not found");
    }

    if (user.companyId) {
      throw new ConflictError("You are already linked to an existing corporate account");
    }

    return companyRepository.createCompany(data, adminUserId);
  }

  // Resolves a company profile, appending active job post aggregates
  async getCompanyProfile(companyId: string): Promise<any> {
    const company = (await companyRepository.findById(companyId)) as any;
    if (!company) {
      throw new NotFoundError("Company profile not found");
    }

    // Count open, active job postings
    const activeJobs = await prisma.jobPost.count({
      where: {
        companyId,
        status: "OPEN",
        isActive: true,
      },
    });

    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      industry: company.industry,
      website: company.website,
      logo_url: company.logoUrl,
      hq_location: company.hqLocation,
      is_verified: company.isVerified,
      created_at: company.createdAt,
      profile: company.profile,
      active_job_count: activeJobs,
    };
  }

  // Updates corporate attributes, verifying company admin credentials
  async updateCompanyProfile(
    userId: string,
    userRole: Role,
    userCompanyId: string | null,
    targetCompanyId: string,
    data: UpdateCompanyProfileDTO
  ): Promise<Company> {
    // Enforce administrative bounds: Requester must be the registered company admin
    const isSuper = userRole === Role.SUPER_ADMIN;
    const isCompanyAdmin = userRole === Role.COMPANY_ADMIN && userCompanyId === targetCompanyId;

    if (!isSuper && !isCompanyAdmin) {
      throw new ForbiddenError(
        "Access Denied: You do not possess clearance to modify this company profile"
      );
    }

    const company = await companyRepository.findById(targetCompanyId);
    if (!company) {
      throw new NotFoundError("Company profile not found");
    }

    return companyRepository.updateCompany(targetCompanyId, data);
  }

  // Processes corporate logo uploads to R2 (limited to JPEG, PNG, and WebP, max 1MB)
  async uploadLogo(
    userId: string,
    userRole: Role,
    userCompanyId: string | null,
    targetCompanyId: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<string> {
    // Verification
    const isSuper = userRole === Role.SUPER_ADMIN;
    const isCompanyAdmin = userRole === Role.COMPANY_ADMIN && userCompanyId === targetCompanyId;

    if (!isSuper && !isCompanyAdmin) {
      throw new ForbiddenError("Access Denied: You cannot modify this company's logo");
    }

    const company = await companyRepository.findById(targetCompanyId);
    if (!company) {
      throw new NotFoundError("Company profile not found");
    }

    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    const maxSizeBytes = 1 * 1024 * 1024; // 1MB

    validateFileBuffer(fileBuffer, allowedMimes, maxSizeBytes, mimeType);

    // Save logo to R2 under logos/company_id.webp
    const key = `logos/${targetCompanyId}.webp`;
    const logoUrl = await uploadBuffer(fileBuffer, key, "image/webp");

    await companyRepository.updateLogoUrl(targetCompanyId, logoUrl);

    return logoUrl;
  }

  // Toggles admin verification flags (Super / University admin exclusive)
  async verifyCompany(companyId: string, isVerified: boolean): Promise<void> {
    const company = await companyRepository.findById(companyId);
    if (!company) {
      throw new NotFoundError("Company profile not found");
    }

    await companyRepository.verifyCompany(companyId, isVerified);
  }

  // Queries all corporate accounts
  async listCompanies(filters: CompanySearchFilter): Promise<PaginatedResult<Company>> {
    return companyRepository.searchCompanies(filters);
  }
}
export const companyService = new CompanyService();
