import { Request, Response, NextFunction } from "express";
import { companyService } from "./service";
import { BadRequestError } from "../../lib/errors";
import { CompanySearchFilter } from "./types";

export class CompanyController {
  // Registers a corporate workspace
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const company = await companyService.registerCompany(req.body, adminUserId);
      res.status(201).json({
        success: true,
        message: "Company profile registered successfully. Awaiting administrative verification.",
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          is_verified: company.isVerified,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtains detailed company records
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { company_id } = req.params;
      const profile = await companyService.getCompanyProfile(company_id);
      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  // Modifies corporate profiles
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const userCompanyId = req.user!.companyId;
      const { company_id } = req.params;

      const company = await companyService.updateCompanyProfile(
        userId,
        role,
        userCompanyId,
        company_id,
        req.body
      );

      res.status(200).json({
        success: true,
        message: "Company details updated successfully",
        company,
      });
    } catch (error) {
      next(error);
    }
  }

  // Uploads a corporate logo
  async uploadLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const userCompanyId = req.user!.companyId;
      const { company_id } = req.params;
      const file = req.file;

      if (!file) {
        throw new BadRequestError("No logo file was supplied in the request");
      }

      const logoUrl = await companyService.uploadLogo(
        userId,
        role,
        userCompanyId,
        company_id,
        file.buffer,
        file.mimetype
      );

      res.status(200).json({
        success: true,
        logo_url: logoUrl,
      });
    } catch (error) {
      next(error);
    }
  }

  // Verification gating
  async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { company_id } = req.params;
      const { is_verified } = req.body;

      await companyService.verifyCompany(company_id, is_verified);

      res.status(200).json({
        success: true,
        is_verified,
        message: `Company verification status successfully modified to: ${is_verified}`,
      });
    } catch (error) {
      next(error);
    }
  }

  // Lists companies
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as any;

      const filters: CompanySearchFilter = {
        limit: query.limit,
        cursor: query.cursor,
        industry: query.industry,
        is_verified: query.is_verified,
        search: query.search,
        sort_by: query.sort_by,
        sort_order: query.sort_order,
      };

      const result = await companyService.listCompanies(filters);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
}
export const companyController = new CompanyController();
