import { ApplicationStatus, InterviewRoundType, FeedbackDecision } from "@prisma/client";

export interface SubmitApplicationDTO {
  job_id: string;
  resume_id: string;
  cover_note?: string;
}

export interface UpdateApplicationStatusDTO {
  status: ApplicationStatus;
  remarks?: string;
}

export interface ScheduleInterviewDTO {
  round_number: number;
  round_type: InterviewRoundType;
  scheduled_at: Date;
  venue_or_link: string;
}

export interface SubmitFeedbackDTO {
  rating: number;
  remarks: string;
  decision: FeedbackDecision;
}

export interface IssueOfferDTO {
  designation: string;
  ctc: number;
  joining_date: Date;
  file_url: string; // S3 storage path or generated URL
}

export interface RespondOfferDTO {
  is_accepted: boolean;
}

export interface ApplicationSearchFilter {
  limit: number;
  cursor?: string;
  status?: ApplicationStatus;
  job_id?: string;
  student_id?: string;
  college_id?: string;
  sort_by?: "appliedAt" | "updatedAt";
  sort_order?: "asc" | "desc";
}

export interface BulkUpdateApplicationStatusDTO {
  application_ids: string[];
  new_status: ApplicationStatus;
  remarks?: string;
  notify_students?: boolean;
}

