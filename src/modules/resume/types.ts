export interface UploadResumeDTO {
  versionLabel: string;
  isDefault: boolean;
}

export interface ResumeResponse {
  id: string;
  fileName: string;
  fileUrl: string;
  versionLabel: string;
  isDefault: boolean;
  createdAt: Date;
}
