import { prisma } from "../../lib/db";
import { Company, CompanyProfile } from "@prisma/client";
import { RegisterCompanyDTO, UpdateCompanyProfileDTO, CompanySearchFilter } from "./types";
import { paginate, PaginatedResult } from "../../lib/paginate";
import crypto from "crypto";

export class CompanyRepository {
  // Slugifies a string for URL-friendly paths
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  }

  // Atomically creates a Company, Profile, and maps CompanyAdmin link to user context
  async createCompany(data: RegisterCompanyDTO, adminUserId: string): Promise<Company> {
    return prisma.$transaction(async (tx) => {
      const slugSuffix = crypto.randomBytes(4).toString("hex");
      const slug = `${this.slugify(data.name)}-${slugSuffix}`;

      // 1. Create Company Core
      const company = await tx.company.create({
        data: {
          name: data.name,
          slug,
          industry: data.industry,
          website: data.website,
          hqLocation: data.hq_location,
          isVerified: false,
          isActive: true,
        },
      });

      // 2. Create Company Profile Details
      await tx.companyProfile.create({
        data: {
          companyId: company.id,
          description: data.description,
          employeeCount: data.employee_count,
          linkedinUrl: data.linkedin_url || null,
        },
      });

      // 3. Create CompanyAdmin junction
      await tx.companyAdmin.create({
        data: {
          companyId: company.id,
          userId: adminUserId,
          role: "admin",
        },
      });

      // 4. Bind the recruiter's user context to this company
      await tx.user.update({
        where: { id: adminUserId },
        data: { companyId: company.id },
      });

      return tx.company.findUnique({
        where: { id: company.id },
        include: { profile: true },
      }) as unknown as Company;
    });
  }

  // Finds a company by ID
  async findById(companyId: string): Promise<Company | null> {
    return prisma.company.findFirst({
      where: {
        id: companyId,
        isActive: true,
      },
      include: {
        profile: true,
      },
    });
  }

  // Atomically updates company fields and company details
  async updateCompany(
    companyId: string,
    data: UpdateCompanyProfileDTO
  ): Promise<Company> {
    return prisma.$transaction(async (tx) => {
      // Update core company fields
      const coreData: any = {};
      if (data.name) coreData.name = data.name;
      if (data.industry) coreData.industry = data.industry;
      if (data.website) coreData.website = data.website;
      if (data.hq_location) coreData.hqLocation = data.hq_location;

      const company = await tx.company.update({
        where: { id: companyId },
        data: coreData,
      });

      // Update profile fields
      const profileData: any = {};
      if (data.description) profileData.description = data.description;
      if (data.employee_count !== undefined) profileData.employeeCount = data.employee_count;
      if (data.linkedin_url !== undefined) profileData.linkedinUrl = data.linkedin_url || null;

      if (Object.keys(profileData).length > 0) {
        await tx.companyProfile.update({
          where: { companyId },
          data: profileData,
        });
      }

      return tx.company.findUnique({
        where: { id: companyId },
        include: { profile: true },
      }) as unknown as Company;
    });
  }

  // Updates the logo URL for a company
  async updateLogoUrl(companyId: string, logoUrl: string): Promise<void> {
    await prisma.company.update({
      where: { id: companyId },
      data: { logoUrl },
    });
  }

  // Updates verification status
  async verifyCompany(companyId: string, isVerified: boolean): Promise<void> {
    await prisma.company.update({
      where: { id: companyId },
      data: { isVerified },
    });
  }

  // Searches companies with paginated cursor envelopes
  async searchCompanies(filters: CompanySearchFilter): Promise<PaginatedResult<Company>> {
    const where: any = {
      isActive: true,
    };

    if (filters.industry) {
      where.industry = {
        contains: filters.industry,
        mode: "insensitive",
      };
    }
    if (filters.is_verified !== undefined) {
      where.isVerified = filters.is_verified;
    }
    if (filters.search) {
      where.name = {
        contains: filters.search,
        mode: "insensitive",
      };
    }

    const baseArgs = {
      where,
      include: {
        profile: true,
      },
    };

    return paginate<any>(
      prisma.company,
      baseArgs,
      {
        limit: filters.limit,
        cursor: filters.cursor,
        sortBy: filters.sort_by,
        sortOrder: filters.sort_order,
      }
    );
  }
}
export const companyRepository = new CompanyRepository();
