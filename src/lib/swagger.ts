import express from "express";
import swaggerUi from "swagger-ui-express";

// Comprehensive, static, type-safe OpenAPI 3.0 Specification
const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Placement Platform Production API",
    version: "1.0.0",
    description: "Production-grade, highly-scalable backend API specification for the Placement Platform. Serves student onboarding, resume management, company registration, job postings, application workflows, interview cycles, placement drive coordination, analytics, notifications, and administrative control.",
    contact: {
      name: "API Support",
      email: "haneesh0769@gmail.com",
    },
  },
  servers: [
    {
      url: "/",
      description: "Current Host Server (Default Relative)",
    },
    {
      url: "https://placement-api-324161304253.asia-south1.run.app",
      description: "Cloud Run Production Server",
    },
    {
      url: "http://localhost:5000",
      description: "Local Development Server",
    },
  ],
  tags: [
    { name: "Auth", description: "Session and Authentication management (OTP/Password)" },
    { name: "Users", description: "User accounts, profile updates, and avatar uploads" },
    { name: "Students", description: "Student profiles, academic stats, onboarding, and dashboard" },
    { name: "Resumes", description: "Resume file management (PDF uploads up to 5MB, versioning)" },
    { name: "Companies", description: "Company onboarding, verifications, and logo uploads" },
    { name: "Jobs", description: "Job posts creation, matching requirements, and eligibility" },
    { name: "Applications", description: "Job application lifecycle, withdrawal, and status updates" },
    { name: "Interviews", description: "Interview scheduling, rescheduling, and feedback grading" },
    { name: "Offers", description: "Offer letters issuance (PDF uploads), responses, and downloads" },
    { name: "Drives", description: "Placement drives initiation, invitations, and analytics" },
    { name: "Colleges", description: "Colleges setup, departments onboarding, dashboards, and reporting" },
    { name: "Skills", description: "Global skill index with proficiency category matrices" },
    { name: "Notifications", description: "Real-time alerts, read states, and badge counters" },
    { name: "Admin", description: "Platform analytics, user moderation, and audit logging" },
    { name: "Async Jobs", description: "BullMQ background task status polling for reports generation" },
    { name: "Health", description: "Standard load-balancer and internal database/cache telemetry" },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Valid JWT access token (15-minute expiry). Place token in value without bearer prefix.",
      },
    },
    parameters: {
      RequestIdHeader: {
        name: "x-request-id",
        in: "header",
        required: true,
        schema: {
          type: "string",
          format: "uuid",
        },
        description: "Unique Request ID for tracking and idempotency verification.",
        example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      },
      DeviceFingerprintHeader: {
        name: "x-device-fingerprint",
        in: "header",
        required: false,
        schema: {
          type: "string",
        },
        description: "Browser/device fingerprint hash for fraud detection and replay security checking.",
        example: "sha256-a94a8fe5ccb19ba61c4c0873d391e987982fbbd3",
      },
    },
  },
  paths: {
    // ----------------------------------------------------
    // 1. AUTH MODULE
    // ----------------------------------------------------
    "/api/auth/register/initiate": {
      post: {
        tags: ["Auth"],
        summary: "Initiate registration flow (OTP)",
        description: "Dispatches a verification OTP code to the requested email. Public access.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email", default: "haneesh0769@gmail.com", description: "Unique register email address" },
                  role: { type: "string", enum: ["STUDENT", "COMPANY_ADMIN", "PLACEMENT_OFFICER", "COLLEGE_ADMIN", "UNIVERSITY_ADMIN", "SUPER_ADMIN"], default: "STUDENT", description: "Target role of user" },
                  college_code: { type: "string", default: "VJIT-2024", description: "College Code (required for college-specific roles STUDENT, PLACEMENT_OFFICER, COLLEGE_ADMIN)" },
                  admin_invite_code: { type: "string", default: "Solvempire@1323", description: "Admin invite code (required for administrative roles SUPER_ADMIN, UNIVERSITY_ADMIN)" },
                },
                required: ["email", "role"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "OTP dispatched successfully.",
            content: {
              "application/json": {
                example: { success: true, message: "OTP sent to email", otp_token: "signed_jwt_otp_session_token", expires_in: 300 },
              },
            },
          },
        },
      },
    },
    "/api/auth/register/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify registration OTP & complete onboarding user",
        description: "Validates OTP JWT token session and inputs password/full_name to commit user creation in DB. Public.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  otp_token: { type: "string", description: "Signed JWT session token containing original register details" },
                  otp_code: { type: "string", description: "6-digit OTP code received in email", example: "847291" },
                  full_name: { type: "string", description: "Onboarding full name of the user", example: "Haneesh Kumar" },
                  password: { type: "string", default: "Solvempire@1323", description: "Secure credential password" },
                },
                required: ["otp_token", "otp_code", "full_name", "password"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "User registered successfully, session tokens returned.",
            content: {
              "application/json": {
                example: { success: true, user: { id: "uuid-id", email: "haneesh0769@gmail.com", role: "STUDENT" }, access_token: "jwt_15min_string", token_type: "Bearer", expires_in: 900 },
              },
            },
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "User Login",
        description: "Logs in a user, returning a 15-minute JWT access token and setting a HttpOnly refresh token cookie. STRICT Rate-Limit (5 attempts, then lock).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email", default: "haneesh0769@gmail.com", description: "Account email address" },
                  password: { type: "string", default: "Solvempire@1323", description: "Account security password" },
                  device_fingerprint: { type: "string", default: "sha256-hash", description: "Browser/device footprint hash" },
                  remember_me: { type: "boolean", default: true, description: "Whether to issue a long-term refresh token session" },
                },
                required: ["email", "password"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful.",
            content: {
              "application/json": {
                example: { success: true, user: { id: "uuid-id", email: "haneesh0769@gmail.com", role: "STUDENT", college_id: "uuid-college", is_profile_complete: false }, access_token: "jwt_15min_string", token_type: "Bearer", expires_in: 900 },
              },
            },
          },
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token",
        description: "Exchanges a valid HttpOnly refresh token cookie for a brand new 15-minute JWT access token.",
        responses: {
          200: {
            description: "Access token successfully refreshed.",
            content: {
              "application/json": {
                example: { access_token: "new_jwt_15min_string", expires_in: 900 },
              },
            },
          },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "User Logout",
        description: "Clears session keys in Redis, blacklists tokens, and wipes cookies.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  logout_all_devices: { type: "boolean", default: false, description: "If true, terminates all sessions on all devices in Redis." },
                },
                required: ["logout_all_devices"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Logout completed.",
            content: {
              "application/json": {
                example: { success: true, message: "Successfully logged out from active session" },
              },
            },
          },
        },
      },
    },
    "/api/auth/password/forgot": {
      post: {
        tags: ["Auth"],
        summary: "Forgot Password (initiate reset email)",
        description: "Generates an email dispatch containing a verification link to initiate security updates. STRICT rate-limiting.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email", default: "haneesh0769@gmail.com", description: "Registered email address" },
                },
                required: ["email"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Security link dispatched.",
            content: {
              "application/json": {
                example: { success: true, message: "If this email exists, a password reset link has been successfully dispatched" },
              },
            },
          },
        },
      },
    },
    "/api/auth/password/reset": {
      post: {
        tags: ["Auth"],
        summary: "Reset Password",
        description: "Applies password changes utilizing the verification token dispatched in security emails. Public.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reset_token: { type: "string", description: "Reset token received in email link", example: "uuid-reset-token" },
                  new_password: { type: "string", default: "Solvempire@1323", description: "New password value to apply" },
                },
                required: ["reset_token", "new_password"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Password reset complete.",
            content: {
              "application/json": {
                example: { success: true, message: "Password reset complete. You may now log in with your new credentials." },
              },
            },
          },
        },
      },
    },
    "/api/auth/password/change": {
      post: {
        tags: ["Auth"],
        summary: "Change Password (authenticated)",
        description: "Updates account password requiring confirmation of the current active password.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  current_password: { type: "string", default: "Solvempire@1323", description: "Current account password" },
                  new_password: { type: "string", default: "NewSolvempire@1323", description: "New replacement password" },
                },
                required: ["current_password", "new_password"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Password changed successfully.",
            content: {
              "application/json": {
                example: { success: true, message: "Password updated successfully. Please re-authenticate." },
              },
            },
          },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current session profile status",
        description: "Queries account meta-states mapping active credentials.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Session data loaded.",
            content: {
              "application/json": {
                example: { success: true, id: "uuid-id", email: "haneesh0769@gmail.com", role: "STUDENT", college_id: "uuid-college", company_id: null, is_profile_complete: false },
              },
            },
          },
        },
      },
    },
    "/api/auth/sessions": {
      get: {
        tags: ["Auth"],
        summary: "List active browser/device sessions",
        description: "Loads all active logged-in device records tracked in Redis.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Active sessions loaded.",
            content: {
              "application/json": {
                example: {
                  success: true,
                  sessions: [
                    { session_id: "uuid-session-1", device: "Chrome on Windows", ip: "103.x.x.x", location: "Hyderabad, IN", last_active: "2026-05-26T10:30:00.000Z", is_current: true },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/sessions/{session_id}": {
      delete: {
        tags: ["Auth"],
        summary: "Revoke single session",
        description: "Forces a logout of a specific session across devices using its tracking session ID.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "session_id", in: "path", required: true, schema: { type: "string" }, description: "The ID of the session to terminate." },
        ],
        responses: {
          200: {
            description: "Session revoked successfully.",
            content: {
              "application/json": {
                example: { success: true, message: "Session successfully revoked" },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 2. USER MODULE
    // ----------------------------------------------------
    "/api/users/{user_id}/profile": {
      get: {
        tags: ["Users"],
        summary: "Get User Profile",
        description: "Queries account and role details using user ID.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "user_id", in: "path", required: true, schema: { type: "string" }, description: "ID of target user account." },
        ],
        responses: {
          200: {
            description: "User details loaded.",
            content: {
              "application/json": {
                example: { success: true, id: "uuid-id", email: "haneesh0769@gmail.com", role: "STUDENT", created_at: "2026-05-26T00:00:00.000Z", profile: {} },
              },
            },
          },
        },
      },
    },
    "/api/users/email/change/initiate": {
      post: {
        tags: ["Users"],
        summary: "Initiate email shift OTP",
        description: "Dispatches a transfer OTP verification session to the new target email.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  new_email: { type: "string", format: "email", default: "haneesh0769@gmail.com", description: "New email target" },
                },
                required: ["new_email"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Transfer OTP issued.",
            content: {
              "application/json": {
                example: { success: true, otp_token: "jwt_otp_token_string", expires_in: 300 },
              },
            },
          },
        },
      },
    },
    "/api/users/email/change/confirm": {
      post: {
        tags: ["Users"],
        summary: "Confirm email change OTP",
        description: "Validates OTP session and updates account emails across the system.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  otp_token: { type: "string", description: "Signed verification OTP session JWT" },
                  otp_code: { type: "string", example: "293847", description: "6-digit OTP code received at the new email address" },
                },
                required: ["otp_token", "otp_code"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Email updated successfully.",
            content: {
              "application/json": {
                example: { success: true, message: "Email address updated successfully" },
              },
            },
          },
        },
      },
    },
    "/api/users/avatar": {
      post: {
        tags: ["Users"],
        summary: "Upload profile avatar image",
        description: "Processes multipart image buffers (JPG/PNG/WebP, max 2MB) and saves them in S3/R2 cloud storage.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary", description: "Image file to upload (max 2MB, JPG/PNG/WebP)" },
                },
                required: ["file"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Avatar uploaded successfully.",
            content: {
              "application/json": {
                example: { success: true, avatar_url: "https://cdn.placementapp.in/avatars/uuid-avatar.webp" },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 3. STUDENT MODULE
    // ----------------------------------------------------
    "/api/students/{student_id}/profile": {
      put: {
        tags: ["Students"],
        summary: "Complete student onboarding profile details",
        description: "Sets details including academic stats, bio, links, and skill records. Complete payload configuration shows all optional values.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "student_id", in: "path", required: true, schema: { type: "string" }, description: "ID of the student user record" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  full_name: { type: "string", example: "Haneesh Kumar", description: "Legal full name" },
                  roll_number: { type: "string", example: "20BCS0147", description: "Academic roll number" },
                  batch_year: { type: "integer", example: 2024, description: "Graduation batch year" },
                  cgpa: { type: "number", example: 8.4, description: "Cumulative Grade Point Average out of 10.0" },
                  backlogs: { type: "integer", example: 0, description: "Count of current active backlog subjects" },
                  phone: { type: "string", example: "+919876543210", description: "Contact phone number" },
                  department_id: { type: "string", example: "uuid-dept-cse", description: "Assigned department ID" },
                  // Optional Fields shown in body explicitly as requested:
                  linkedin_url: { type: "string", example: "https://linkedin.com/in/haneesh", description: "Optional LinkedIn profile URL link" },
                  github_url: { type: "string", example: "https://github.com/haneesh", description: "Optional GitHub profile URL link" },
                  portfolio_url: { type: "string", example: "https://haneesh.dev", description: "Optional personal website link" },
                  bio: { type: "string", example: "Full stack developer interested in distributed systems.", description: "Optional bio intro text" },
                  current_city: { type: "string", example: "Hyderabad", description: "Optional location city name" },
                  skills: {
                    type: "array",
                    description: "Optional array of skill proficiencies to seed",
                    items: {
                      type: "object",
                      properties: {
                        skill_id: { type: "string", example: "uuid-react-skill", description: "Reference ID of skill" },
                        proficiency_level: { type: "string", enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"], example: "ADVANCED", description: "Competency level" },
                      },
                      required: ["skill_id", "proficiency_level"],
                    },
                  },
                },
                required: ["full_name", "roll_number", "batch_year", "cgpa", "backlogs", "phone", "department_id"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Profile onboarding details submitted.",
            content: {
              "application/json": {
                example: { success: true, message: "Profile configured successfully during onboarding", is_profile_complete: true, profile_strength: 85 },
              },
            },
          },
        },
      },
    },
    "/api/students/{student_id}": {
      get: {
        tags: ["Students"],
        summary: "Get single student details",
        description: "Queries student records including skill arrays. Allowed for recruiters, officers, and own student account.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "student_id", in: "path", required: true, schema: { type: "string" }, description: "Target Student ID" },
        ],
        responses: {
          200: {
            description: "Student data fetched successfully.",
            content: {
              "application/json": {
                example: {
                  success: true,
                  data: { id: "uuid-student", full_name: "Haneesh Kumar", department: "CSE", batch_year: 2024, cgpa: 8.4, backlogs: 0, skills: ["React", "Node.js", "PostgreSQL"], placement_status: "UNPLACED", resume_count: 3, application_count: 7 },
                },
              },
            },
          },
        },
      },
    },
    "/api/students": {
      get: {
        tags: ["Students"],
        summary: "Search and List Students",
        description: "Standard paginated search filter list. Supports query parameters.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "college_id", in: "query", schema: { type: "string" } },
          { name: "department_id", in: "query", schema: { type: "string" } },
          { name: "batch_year", in: "query", schema: { type: "integer" } },
          { name: "min_cgpa", in: "query", schema: { type: "number" } },
          { name: "max_backlogs", in: "query", schema: { type: "integer" } },
          { name: "placement_status", in: "query", schema: { type: "string", enum: ["UNPLACED", "PLACED", "DREAM_OPTION_USED"] } },
          { name: "skill_ids", in: "query", schema: { type: "string" }, description: "Comma-separated list of skill UUIDs" },
          { name: "search", in: "query", schema: { type: "string" }, description: "Fuzzy search by name or roll number" },
          { name: "sort_by", in: "query", schema: { type: "string", default: "cgpa_desc" } },
        ],
        responses: {
          200: {
            description: "Students array loaded.",
            content: {
              "application/json": {
                example: { success: true, data: [{ id: "uuid-id", fullName: "Haneesh Kumar", rollNumber: "20BCS0147" }], pagination: { cursor: "cursor_string", has_next: true, total: 4820 } },
              },
            },
          },
        },
      },
    },
    "/api/students/{student_id}/dashboard": {
      get: {
        tags: ["Students"],
        summary: "Load Student Dashboard statistics",
        description: "Loads active student metrics, recommended listings, and interview milestones. Restricted to own student record.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "student_id", in: "path", required: true, schema: { type: "string" }, description: "Student UUID" },
        ],
        responses: {
          200: {
            description: "Dashboard stats compiled.",
            content: {
              "application/json": {
                example: {
                  success: true,
                  data: {
                    applications_total: 12,
                    applications_by_status: { APPLIED: 3, SHORTLISTED: 4, INTERVIEW_SCHEDULED: 2, SELECTED: 1, REJECTED: 2 },
                    upcoming_interviews: [],
                    recommended_jobs: [],
                    profile_completion: 85,
                    placement_status: "PLACED",
                  },
                },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 4. RESUME MODULE
    // ----------------------------------------------------
    "/api/resumes": {
      post: {
        tags: ["Resumes"],
        summary: "Upload Resume file (PDF)",
        description: "Uploads a PDF resume file (max 5MB) into AWS S3/Cloudflare R2 and associates it with the student. Limits to max 5 resumes per student account.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary", description: "PDF file element to upload" },
                  version_label: { type: "string", example: "SDE Resume v2", description: "Tracking label name" },
                  is_default: { type: "boolean", default: true, description: "Whether to configure as default application resume" },
                },
                required: ["file", "version_label"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Resume uploaded successfully.",
            content: {
              "application/json": {
                example: { success: true, resume: { id: "uuid-id", file_url: "https://cdn.placementapp.in/resumes/uuid.pdf", file_name: "Haneesh_Kumar_SDE_v2.pdf", version_label: "SDE Resume v2", is_default: true, created_at: "2026-05-26T00:00:00.000Z" } },
              },
            },
          },
        },
      },
      get: {
        tags: ["Resumes"],
        summary: "List own uploaded Resumes",
        description: "Loads details of all uploaded resumes belonging to the active student account.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Resumes listing fetched.",
            content: {
              "application/json": {
                example: {
                  success: true,
                  resumes: [
                    { id: "uuid-id", version_label: "SDE Resume v2", file_name: "Haneesh_Kumar_SDE_v2.pdf", is_default: true, download_url: "presigned_download_url", created_at: "2026-05-26T00:00:00.000Z" },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/api/resumes/{resume_id}/set-default": {
      patch: {
        tags: ["Resumes"],
        summary: "Set Default Resume",
        description: "Updates the default resume. All other resumes for the student are set to `is_default: false`.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "resume_id", in: "path", required: true, schema: { type: "string" }, description: "Target Resume UUID" },
        ],
        responses: {
          200: {
            description: "Default state updated.",
            content: {
              "application/json": {
                example: { success: true, message: "Default resume successfully updated" },
              },
            },
          },
        },
      },
    },
    "/api/resumes/{resume_id}": {
      delete: {
        tags: ["Resumes"],
        summary: "Delete Resume record",
        description: "Deletes the resume file from cloud storage and removes its record from the database.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "resume_id", in: "path", required: true, schema: { type: "string" }, description: "Target Resume UUID" },
        ],
        responses: {
          200: {
            description: "Resume deleted successfully.",
            content: {
              "application/json": {
                example: { success: true, message: "Resume deleted successfully" },
              },
            },
          },
        },
      },
    },
    "/api/resumes/{resume_id}/download": {
      get: {
        tags: ["Resumes"],
        summary: "Get Resume pre-signed download link",
        description: "Issues a secure, pre-signed download URL link for the PDF file (1-hour expiry).",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "resume_id", in: "path", required: true, schema: { type: "string" }, description: "Target Resume UUID" },
        ],
        responses: {
          200: {
            description: "Secure link generated.",
            content: {
              "application/json": {
                example: { success: true, download_url: "https://s3.r2.cloudflarestorage.com/placement/resumes/uuid.pdf?signature...", expires_in: 3600 },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 5. COMPANY MODULE
    // ----------------------------------------------------
    "/api/companies": {
      post: {
        tags: ["Companies"],
        summary: "Onboard Company",
        description: "Registers a corporate recruiter portal profile. Initially pending admin verification. STRICT rate limits.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Infosys Limited", description: "Corporate Legal Entity Name" },
                  industry: { type: "string", example: "IT Services & Consulting", description: "Primary Sector Industry" },
                  // Optional fields explicitly listed
                  website: { type: "string", example: "https://infosys.com", description: "Optional corporate website link URL" },
                  hq_location: { type: "string", example: "Bengaluru, India", description: "Optional HQ headquarter location address" },
                  description: { type: "string", example: "Infosys is a global leader in next-generation digital services and consulting.", description: "Optional overview details" },
                  employee_count: { type: "integer", example: 350000, description: "Optional employees metric count" },
                  linkedin_url: { type: "string", example: "https://linkedin.com/company/infosys", description: "Optional Corporate LinkedIn URL link" },
                },
                required: ["name", "industry"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Company registered successfully.",
            content: {
              "application/json": {
                example: { success: true, company: { id: "uuid-id", name: "Infosys Limited", is_verified: false }, message: "Company registered successfully and is pending admin verification." },
              },
            },
          },
        },
      },
      get: {
        tags: ["Companies"],
        summary: "Search and List Companies",
        description: "Loads lists of verified or unverified companies matching search parameters.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "industry", in: "query", schema: { type: "string" } },
          { name: "is_verified", in: "query", schema: { type: "boolean" } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Companies listed.",
            content: {
              "application/json": {
                example: { success: true, data: [{ id: "uuid-id", name: "Infosys" }], pagination: { cursor: "cursor_string", has_next: false, total: 1 } },
              },
            },
          },
        },
      },
    },
    "/api/companies/{company_id}": {
      get: {
        tags: ["Companies"],
        summary: "Get Company Profile Details",
        description: "Loads company overview and active job metrics. RELAXED rate limits.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "company_id", in: "path", required: true, schema: { type: "string" }, description: "Target Company UUID" },
        ],
        responses: {
          200: {
            description: "Company details loaded successfully.",
            content: {
              "application/json": {
                example: { success: true, data: { id: "uuid-id", name: "Infosys", industry: "IT Services", is_verified: true, profile: { description: "Corporate info...", employeeCount: 350000 }, active_job_count: 14 } },
              },
            },
          },
        },
      },
      put: {
        tags: ["Companies"],
        summary: "Update Company Profile",
        description: "Updates company attributes and details. Restricted to Corporate Administrators.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "company_id", in: "path", required: true, schema: { type: "string" }, description: "Target Company UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  industry: { type: "string", example: "IT Services & Consulting" },
                  website: { type: "string", example: "https://infosys.com" },
                  hq_location: { type: "string", example: "Bengaluru, India" },
                  description: { type: "string", example: "Top-tier MNC consulting firm..." },
                  employee_count: { type: "integer", example: 360000 },
                },
                required: ["industry", "website", "hq_location", "description", "employee_count"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Company details updated successfully.",
            content: {
              "application/json": {
                example: { success: true, company: { id: "uuid-id", name: "Infosys", industry: "IT Services & Consulting" } },
              },
            },
          },
        },
      },
    },
    "/api/companies/{company_id}/logo": {
      post: {
        tags: ["Companies"],
        summary: "Upload Corporate Logo image",
        description: "Saves corporate brand logos in S3/R2 cloud storage. Max image limit: 1MB.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "company_id", in: "path", required: true, schema: { type: "string" }, description: "Target Company UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary", description: "Image file to upload (max 1MB, JPG/PNG/WebP)" },
                },
                required: ["file"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Logo uploaded.",
            content: {
              "application/json": {
                example: { success: true, logo_url: "https://cdn.placementapp.in/logos/uuid.webp" },
              },
            },
          },
        },
      },
    },
    "/api/companies/{company_id}/verify": {
      patch: {
        tags: ["Companies"],
        summary: "Verify Corporate Recruiter status",
        description: "Confirms corporate documents verification. Restricted to University/Super Administrators only.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "company_id", in: "path", required: true, schema: { type: "string" }, description: "Target Company UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  is_verified: { type: "boolean", default: true, description: "Verification check state" },
                  verification_note: { type: "string", example: "Documents checked and confirmed.", description: "Verification comments note details" },
                },
                required: ["is_verified", "verification_note"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Verification completed.",
            content: {
              "application/json": {
                example: { success: true, is_verified: true },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 6. JOB MODULE
    // ----------------------------------------------------
    "/api/jobs": {
      post: {
        tags: ["Jobs"],
        summary: "Create Job Post",
        description: "Registers a job opening within an active placement drive. Includes strict eligibility rules and mandatory/optional skill maps. Restricted to verified Corporate Recruiters.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  placement_drive_id: { type: "string", example: "uuid-drive", description: "Reference Placement Drive UUID" },
                  title: { type: "string", example: "Software Engineer", description: "Job profile title" },
                  job_type: { type: "string", enum: ["FULL_TIME", "INTERN", "WORK_FROM_HOME"], example: "FULL_TIME", description: "Employment classification type" },
                  location: { type: "string", example: "Hyderabad / Remote", description: "Office location description" },
                  ctc_min: { type: "integer", example: 600000, description: "Minimum Compensation package in INR" },
                  ctc_max: { type: "integer", example: 900000, description: "Maximum Compensation package in INR" },
                  description: { type: "string", example: "We are looking for a backend engineer with solid experience in TypeScript...", description: "Markdown descriptions of role and responsibilities" },
                  application_deadline: { type: "string", format: "date-time", example: "2025-02-28T00:00:00.000Z", description: "Application close date-time" },
                  max_applications: { type: "integer", example: 500, description: "Cap limit of incoming applications allowed" },
                  eligibility: {
                    type: "object",
                    properties: {
                      min_cgpa: { type: "number", example: 7.0, description: "Minimum academic CGPA score threshold" },
                      max_backlogs: { type: "integer", example: 0, description: "Maximum backlog subject count allowed" },
                      allowed_branches: { type: "array", items: { type: "string" }, example: ["CSE", "IT", "ECE"], description: "Array of branch code strings eligible to apply" },
                      batch_year_from: { type: "integer", example: 2024, description: "Eligible graduation year start" },
                      batch_year_to: { type: "integer", example: 2025, description: "Eligible graduation year end" },
                    },
                    required: ["min_cgpa", "max_backlogs", "allowed_branches", "batch_year_from", "batch_year_to"],
                  },
                  required_skills: {
                    type: "array",
                    description: "Explicit list of skill maps",
                    items: {
                      type: "object",
                      properties: {
                        skill_id: { type: "string", example: "uuid-node-skill", description: "Reference ID of skill requirement" },
                        is_mandatory: { type: "boolean", default: true, description: "Whether the skill is mandatory" },
                      },
                      required: ["skill_id", "is_mandatory"],
                    },
                  },
                },
                required: ["placement_drive_id", "title", "job_type", "location", "ctc_min", "ctc_max", "description", "application_deadline", "max_applications", "eligibility", "required_skills"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Job created in draft status.",
            content: {
              "application/json": {
                example: { success: true, job: { id: "uuid-id", title: "Software Engineer", status: "DRAFT", created_at: "2026-05-26T00:00:00.000Z" } },
              },
            },
          },
        },
      },
      get: {
        tags: ["Jobs"],
        summary: "Search and List Jobs",
        description: "Queries active or archived job posts across drives. RELAXED rate limits.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "status", in: "query", schema: { type: "string", enum: ["DRAFT", "OPEN", "CLOSED"] } },
          { name: "job_type", in: "query", schema: { type: "string" } },
          { name: "min_ctc", in: "query", schema: { type: "integer" } },
          { name: "company_id", in: "query", schema: { type: "string" } },
          { name: "drive_id", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Jobs listed successfully.",
            content: {
              "application/json": {
                example: { success: true, data: [{ id: "uuid-id", title: "Software Engineer" }], pagination: { cursor: "cursor_string", has_next: false, total: 1 } },
              },
            },
          },
        },
      },
    },
    "/api/jobs/{job_id}": {
      get: {
        tags: ["Jobs"],
        summary: "Get Job Post details",
        description: "Loads full job descriptions, matching criteria, branch eligibility checks, and application states. RELAXED rate limits.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "job_id", in: "path", required: true, schema: { type: "string" }, description: "Target Job UUID" },
        ],
        responses: {
          200: {
            description: "Job details loaded.",
            content: {
              "application/json": {
                example: {
                  success: true,
                  id: "uuid-id",
                  title: "Software Engineer",
                  company: { name: "Infosys", logo_url: "logo_link" },
                  ctc_range: "6 LPA – 9 LPA",
                  description: "Markdown details...",
                  eligibility: { minCgpa: 7.0, maxBacklogs: 0 },
                  status: "OPEN",
                  applicant_count: 234,
                  has_applied: false,
                  is_eligible: true,
                },
              },
            },
          },
        },
      },
      put: {
        tags: ["Jobs"],
        summary: "Update Job Post Details",
        description: "Modifies attributes of an existing job post. Complete schema details showing all optional arguments available for update.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "job_id", in: "path", required: true, schema: { type: "string" }, description: "Target Job UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", example: "Software Engineer II", description: "Optional updated job title" },
                  location: { type: "string", example: "Bengaluru Office", description: "Optional updated work office details" },
                  max_applications: { type: "integer", example: 600, description: "Optional updated application cap threshold" },
                  description: { type: "string", example: "Updated description contents details...", description: "Optional updated job requirements text" },
                  ctc_min: { type: "integer", example: 700000, description: "Optional updated minimum compensation value" },
                  ctc_max: { type: "integer", example: 1000000, description: "Optional updated maximum compensation value" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Job details successfully updated.",
            content: {
              "application/json": {
                example: { success: true, job: { id: "uuid-id", title: "Software Engineer II", location: "Bengaluru Office" } },
              },
            },
          },
        },
      },
    },
    "/api/jobs/{job_id}/publish": {
      patch: {
        tags: ["Jobs"],
        summary: "Publish Job opening",
        description: "Transitions job post state from DRAFT to OPEN, sending notifications to all eligible students.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "job_id", in: "path", required: true, schema: { type: "string" }, description: "Target Job UUID" },
        ],
        responses: {
          200: {
            description: "Job successfully published.",
            content: {
              "application/json": {
                example: { success: true, job_id: "uuid-id", status: "OPEN", published_at: "2026-05-26T10:30:00.000Z" },
              },
            },
          },
        },
      },
    },
    "/api/jobs/{job_id}/close": {
      patch: {
        tags: ["Jobs"],
        summary: "Close Job opening",
        description: "Transitions job post state to CLOSED. Stops accepting new student applications.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "job_id", in: "path", required: true, schema: { type: "string" }, description: "Target Job UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", example: "Position filled.", description: "Reason for closing the job opening." },
                },
                required: ["reason"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Job closed successfully.",
            content: {
              "application/json": {
                example: { success: true, job_id: "uuid-id", status: "CLOSED" },
              },
            },
          },
        },
      },
    },
    "/api/jobs/{job_id}/applicants": {
      get: {
        tags: ["Jobs"],
        summary: "List Job Applicants",
        description: "Returns lists of student candidates who applied to the job. Restricted to recruiting Corporate HRs or Placement Officers.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "job_id", in: "path", required: true, schema: { type: "string" }, description: "Target Job UUID" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: {
            description: "Applicant candidate profiles listed successfully.",
            content: {
              "application/json": {
                example: {
                  success: true,
                  job_id: "uuid-id",
                  total_applicants: 412,
                  data: [
                    { application_id: "uuid-app", student: { id: "uuid-student", full_name: "Haneesh Kumar", cgpa: 8.4, department: "CSE" }, current_status: "APPLIED", applied_at: "2026-05-26T10:00:00.000Z" },
                  ],
                  pagination: { cursor: "cursor_string", has_next: false, total: 1 },
                },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 7. APPLICATION MODULE
    // ----------------------------------------------------
    "/api/applications": {
      post: {
        tags: ["Applications"],
        summary: "Submit Job Application",
        description: "Registers candidate application matching eligibility parameters. Max active applications per student is capped at 50 to prevent spam. Restricted to students.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  job_id: { type: "string", example: "uuid-job", description: "Reference Target Job UUID" },
                  resume_id: { type: "string", example: "uuid-resume", description: "Reference PDF Resume ID to attach" },
                  cover_note: { type: "string", example: "I am excited about this role because I have built deep stack applications.", description: "Optional applicant cover letter statements" },
                },
                required: ["job_id", "resume_id"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Application submitted.",
            content: {
              "application/json": {
                example: { success: true, message: "Job application submitted successfully", application: { id: "uuid-id", job_id: "uuid-job", resume_id: "uuid-resume", current_status: "APPLIED", applied_at: "2026-05-26T10:30:00.000Z" } },
              },
            },
          },
        },
      },
    },
    "/api/applications/{application_id}/withdraw": {
      patch: {
        tags: ["Applications"],
        summary: "Withdraw job application",
        description: "Allows candidates to withdraw active applications from pipelines.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "application_id", in: "path", required: true, schema: { type: "string" }, description: "Target Application UUID" },
        ],
        responses: {
          200: {
            description: "Application successfully withdrawn.",
            content: {
              "application/json": {
                example: { success: true, message: "Application withdrawn successfully" },
              },
            },
          },
        },
      },
    },
    "/api/applications/{application_id}": {
      get: {
        tags: ["Applications"],
        summary: "Get application profile states details",
        description: "Loads details of application, candidate profile, attached resume, and status logs timeline.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "application_id", in: "path", required: true, schema: { type: "string" }, description: "Target Application UUID" },
        ],
        responses: {
          200: {
            description: "Application details loaded.",
            content: {
              "application/json": {
                example: {
                  success: true,
                  data: {
                    id: "uuid-id",
                    student: { full_name: "Haneesh Kumar", roll_number: "20BCS0147" },
                    job: { title: "Software Engineer" },
                    resume: { download_url: "download_link" },
                    current_status: "SHORTLISTED",
                    status_history: [{ from: "APPLIED", to: "SHORTLISTED" }],
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/applications/mine": {
      get: {
        tags: ["Applications"],
        summary: "List own applications list",
        description: "Returns candidate status tracks. Restricted to student accounts.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Own applications listing loaded.",
            content: {
              "application/json": {
                example: {
                  success: true,
                  data: [{ application_id: "uuid-id", job_title: "Software Engineer", current_status: "SHORTLISTED" }],
                  pagination: { cursor: "cursor_string", has_next: false, total: 1 },
                },
              },
            },
          },
        },
      },
    },
    "/api/applications/bulk-status": {
      patch: {
        tags: ["Applications"],
        summary: "Bulk Update candidate applications status",
        description: "Updates multiple candidates' application states within a secure database transaction. Queues background notification processes. Restricted to Corporate HRs and Placement Officers.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  application_ids: { type: "array", items: { type: "string" }, example: ["uuid-app-1", "uuid-app-2"], description: "Array of Application UUIDs to update." },
                  new_status: { type: "string", example: "SHORTLISTED", description: "Target ApplicationStatus value" },
                  remarks: { type: "string", example: "Shortlisted based on technical coding metrics results.", description: "Comments logs detail" },
                  notify_students: { type: "boolean", default: true, description: "Whether to dispatch notifications via background workers" },
                },
                required: ["application_ids", "new_status", "remarks", "notify_students"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Bulk statuses applied successfully.",
            content: {
              "application/json": {
                example: { success: true, updated: 2, failed: 0, notifications_queued: 2 },
              },
            },
          },
        },
      },
    },
    "/api/applications/{application_id}/status": {
      patch: {
        tags: ["Applications"],
        summary: "Update single application status",
        description: "Updates a candidate application state. Restricted to Corporate HRs or Placement Officers.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "application_id", in: "path", required: true, schema: { type: "string" }, description: "Target Application UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "INTERVIEW_SCHEDULED", description: "Target application state value" },
                  remarks: { type: "string", example: "Round 1 Technical scheduled.", description: "Optional remarks logs details" },
                },
                required: ["status", "remarks"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Application status updated successfully.",
            content: {
              "application/json": {
                example: { success: true, message: "Application status successfully updated" },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 8. INTERVIEW MODULE
    // ----------------------------------------------------
    "/api/interviews": {
      post: {
        tags: ["Interviews"],
        summary: "Schedule Interview round",
        description: "Schedules interview events and dispatches notifications. Restricted to Corporate HRs or Placement Officers.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  application_id: { type: "string", example: "uuid-application", description: "Reference Application ID" },
                  round_number: { type: "integer", example: 1, description: "Interview sequence number" },
                  round_type: { type: "string", enum: ["TECHNICAL", "HR", "MANAGERIAL", "APTITUDE"], example: "TECHNICAL", description: "Type category classification" },
                  scheduled_at: { type: "string", format: "date-time", example: "2025-02-10T10:00:00.000Z", description: "Date and time of session" },
                  venue_or_link: { type: "string", example: "https://meet.google.com/xyz-abc", description: "Meeting URLs link or offline location detail" },
                  notes: { type: "string", example: "Prepare DSA + System Design basics.", description: "Optional candidate preparation guidelines notes" },
                },
                required: ["application_id", "round_number", "round_type", "scheduled_at", "venue_or_link"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Interview scheduled.",
            content: {
              "application/json": {
                example: { success: true, round: { id: "uuid-id", round_number: 1, round_type: "TECHNICAL", scheduled_at: "2025-02-10T10:00:00.000Z", status: "SCHEDULED" } },
              },
            },
          },
        },
      },
    },
    "/api/interviews/{round_id}/reschedule": {
      patch: {
        tags: ["Interviews"],
        summary: "Reschedule Interview session",
        description: "Updates scheduled times and dispatches alerts. Restricted to Corporate HRs or Placement Officers.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "round_id", in: "path", required: true, schema: { type: "string" }, description: "Target Round UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  new_scheduled_at: { type: "string", format: "date-time", example: "2025-02-12T14:00:00.000Z", description: "New updated target time" },
                  reason: { type: "string", example: "Interviewer unavailable on original date.", description: "Update reason description" },
                },
                required: ["new_scheduled_at", "reason"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Session successfully rescheduled.",
            content: {
              "application/json": {
                example: { success: true, round_id: "uuid-id", status: "RESCHEDULED", new_scheduled_at: "2025-02-12T14:00:00.000Z" },
              },
            },
          },
        },
      },
    },
    "/api/interviews/{round_id}/feedback": {
      post: {
        tags: ["Interviews"],
        summary: "Submit Interview feedback and grade decision",
        description: "Saves score ratings and makes PASS/FAIL evaluations. Restricted to corporate interviewers.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "round_id", in: "path", required: true, schema: { type: "string" }, description: "Target Round UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  rating: { type: "integer", minimum: 1, maximum: 5, example: 4, description: "Feedback rating score out of 5" },
                  remarks: { type: "string", example: "Strong DSA coding skills, average verbal communications.", description: "Technical feedback comments" },
                  decision: { type: "string", enum: ["PASS", "FAIL", "HOLD"], example: "PASS", description: "Candidate pass decision evaluation" },
                },
                required: ["rating", "remarks", "decision"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Feedback logged.",
            content: {
              "application/json": {
                example: { success: true, feedback_id: "uuid-feedback", decision: "PASS" },
              },
            },
          },
        },
      },
    },
    "/api/interviews/upcoming": {
      get: {
        tags: ["Interviews"],
        summary: "List candidate upcoming interviews",
        description: "Loads pending interview schedules. Restricted to student accounts.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Upcoming interviews loaded successfully.",
            content: {
              "application/json": {
                example: {
                  success: true,
                  interviews: [
                    { round_id: "uuid-round", job_title: "Software Engineer", company_name: "Infosys", round_type: "TECHNICAL", scheduled_at: "2025-02-10T10:00:00.000Z", venue_or_link: "https://meet.google.com/...", minutes_until: 4320 },
                  ],
                },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 9. OFFER LETTER MODULE
    // ----------------------------------------------------
    "/api/offers": {
      post: {
        tags: ["Offers"],
        summary: "Issue Offer Letter",
        description: "Uploads an official PDF offer letter (max 5MB) and maps employment terms. Restricted to corporate recruiter HRs.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary", description: "PDF offer letter file" },
                  application_id: { type: "string", example: "uuid-app", description: "Associated applicant UUID" },
                  designation: { type: "string", example: "Software Engineer", description: "Assigned job role title" },
                  ctc: { type: "number", example: 750000, description: "Total compensation Package in INR" },
                  joining_date: { type: "string", format: "date-time", example: "2025-07-01T00:00:00.000Z", description: "Assigned reporting date-time" },
                },
                required: ["file", "application_id", "designation", "ctc", "joining_date"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Offer issued.",
            content: {
              "application/json": {
                example: { success: true, offer: { id: "uuid-offer", application_id: "uuid-app", designation: "Software Engineer", ctc: 750000, joining_date: "2025-07-01T00:00:00.000Z", is_accepted: null } },
              },
            },
          },
        },
      },
    },
    "/api/offers/{offer_id}/respond": {
      patch: {
        tags: ["Offers"],
        summary: "Respond to issued offer",
        description: "Allows candidates to accept/decline offers. Accepting updates student profile status to PLACED and withdraws other active pipelines. STRICT rate limits. Restricted to student owners.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "offer_id", in: "path", required: true, schema: { type: "string" }, description: "Target Offer UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  accept: { type: "boolean", default: true, description: "Acceptance response decision flag." },
                },
                required: ["accept"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Offer decision applied.",
            content: {
              "application/json": {
                example: { success: true, offer_id: "uuid-offer", is_accepted: true, message: "Offer accepted. Congratulations!", student_placement_status: "PLACED" },
              },
            },
          },
        },
      },
    },
    "/api/offers/{offer_id}/download": {
      get: {
        tags: ["Offers"],
        summary: "Download Offer PDF pre-signed link",
        description: "Issues a 1-hour secure pre-signed download link to the offer letter file.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "offer_id", in: "path", required: true, schema: { type: "string" }, description: "Target Offer UUID" },
        ],
        responses: {
          200: {
            description: "Pre-signed link generated.",
            content: {
              "application/json": {
                example: { success: true, download_url: "https://s3.r2.cloudflarestorage.com/placement/offers/uuid.pdf?expires...", expires_in: 3600 },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 10. PLACEMENT DRIVE MODULE
    // ----------------------------------------------------
    "/api/drives": {
      post: {
        tags: ["Drives"],
        summary: "Create Placement Drive",
        description: "Registers a campus drive. Restricted to Placement Officers or College Admins.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  college_id: { type: "string", example: "uuid-college", description: "Target college campus entity UUID" },
                  title: { type: "string", example: "Campus Placement Drive 2025", description: "Drive title identifier" },
                  start_date: { type: "string", format: "date-time", example: "2025-01-15T00:00:00.000Z", description: "Drive start date-time" },
                  end_date: { type: "string", format: "date-time", example: "2025-04-30T00:00:00.000Z", description: "Drive end date-time" },
                  // Optional field listed explicitly
                  description: { type: "string", example: "Annual campus placement drive for batch 2025.", description: "Optional drive overview guidelines details" },
                },
                required: ["college_id", "title", "start_date", "end_date"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Placement drive created successfully in draft status.",
            content: {
              "application/json": {
                example: { success: true, drive: { id: "uuid-drive", title: "Campus Placement Drive 2025", status: "DRAFT" } },
              },
            },
          },
        },
      },
      get: {
        tags: ["Drives"],
        summary: "Search and List Placement Drives",
        description: "Queries lists of active or archived drives. RELAXED rate limits.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "college_id", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["DRAFT", "ACTIVE", "COMPLETED"] } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: {
            description: "Drives loaded.",
            content: {
              "application/json": {
                example: { success: true, data: [{ id: "uuid-drive", title: "Campus Placement Drive 2025" }], pagination: { cursor: "cursor_string", has_next: false, total: 1 } },
              },
            },
          },
        },
      },
    },
    "/api/drives/{drive_id}/activate": {
      patch: {
        tags: ["Drives"],
        summary: "Activate Placement Drive",
        description: "Switches drive status state to ACTIVE, making it visible to students and allowing companies to participate. Restricted to Placement Officers or College Admins.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "drive_id", in: "path", required: true, schema: { type: "string" }, description: "Target Drive UUID" },
        ],
        responses: {
          200: {
            description: "Drive activated successfully.",
            content: {
              "application/json": {
                example: { success: true, drive_id: "uuid-drive", status: "ACTIVE" },
              },
            },
          },
        },
      },
    },
    "/api/drives/{drive_id}/invite": {
      post: {
        tags: ["Drives"],
        summary: "Invite company to Placement Drive",
        description: "Dispatches official campus recruitment invitations. Complete schema details showing all optional arguments. Restricted to Placement Officers or College Admins.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "drive_id", in: "path", required: true, schema: { type: "string" }, description: "Target Drive UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  company_id: { type: "string", example: "uuid-company", description: "Reference Target Company UUID" },
                  // Optional fields listed explicitly
                  message: { type: "string", example: "We invite Infosys to participate in our 2025 campus drive.", description: "Optional invite message" },
                  proposed_date_range: { type: "string", example: "2025-02-01 to 2025-02-28", description: "Optional proposed interview dates window range" },
                },
                required: ["company_id"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Invitation dispatched successfully.",
            content: {
              "application/json": {
                example: { success: true, invitation_sent: true },
              },
            },
          },
        },
      },
    },
    "/api/drives/{drive_id}/analytics": {
      get: {
        tags: ["Drives"],
        summary: "Get Drive analytics insights metrics",
        description: "Loads aggregate placement charts and reports metrics. Restricted to officers or campus administrators.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "drive_id", in: "path", required: true, schema: { type: "string" }, description: "Target Drive UUID" },
        ],
        responses: {
          200: {
            description: "Analytics loaded.",
            content: {
              "application/json": {
                example: {
                  drive_id: "uuid-drive",
                  total_students: 800,
                  placed_count: 312,
                  placement_rate: 39.0,
                  companies_participated: 24,
                  total_job_posts: 38,
                  avg_ctc: 720000,
                  highest_ctc: 2400000,
                  by_department: [{ department: "CSE", placed: 140, total: 200, rate: 70.0 }],
                  by_company: [{ company: "Infosys", offers_made: 60, accepted: 55 }],
                },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 11. COLLEGE MODULE
    // ----------------------------------------------------
    "/api/colleges": {
      post: {
        tags: ["Colleges"],
        summary: "Register College campus entity",
        description: "Onboards new campuses. Restricted to University or Super Administrators only.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  university_id: { type: "string", example: "uuid-university", description: "Optional Reference Parent University UUID. Auto-generated on backend if omitted." },
                  name: { type: "string", example: "Vardhaman College of Engineering", description: "Campus name identifier" },
                  code: { type: "string", example: "VJIT-2024", description: "Unique campus enrollment verification code" },
                  address: { type: "string", example: "Kacharam, Shamshabad, Hyderabad", description: "Office address details" },
                  tpo_email: { type: "string", format: "email", example: "tpo@vjit.ac.in", description: "Primary Placement Officer email contact" },
                },
                required: ["name", "code", "address", "tpo_email"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "College campus created successfully.",
            content: {
              "application/json": {
                example: { success: true, college: { id: "uuid-college", code: "VJIT-2024", is_active: true } },
              },
            },
          },
        },
      },
    },
    "/api/colleges/{college_id}/dashboard": {
      get: {
        tags: ["Colleges"],
        summary: "Get College dashboard stats",
        description: "Loads aggregate metrics representing campus stats. Restricted to Placement Officers or College Admins.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "college_id", in: "path", required: true, schema: { type: "string" }, description: "Target College UUID" },
        ],
        responses: {
          200: {
            description: "College stats compiled.",
            content: {
              "application/json": {
                example: { total_students: 2400, placed_students: 940, placement_rate: 39.2, active_drives: 2, companies_onboarded: 45, open_jobs: 18, pending_applications: 1240, departments: [{ name: "CSE", placed: 380, total: 480 }] },
              },
            },
          },
        },
      },
    },
    "/api/colleges/{college_id}/departments": {
      post: {
        tags: ["Colleges"],
        summary: "Register new department",
        description: "Registers academic branches inside college listings. Restricted to College Administrators.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "college_id", in: "path", required: true, schema: { type: "string" }, description: "Target College UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Computer Science & Engineering", description: "Full department branch name" },
                  code: { type: "string", example: "CSE", description: "Unique shortcode branch key identifier" },
                  seat_count: { type: "integer", example: 240, description: "Total enrollable students seat capacity capacity" },
                },
                required: ["name", "code", "seat_count"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Department added.",
            content: {
              "application/json": {
                example: { success: true, department: { id: "uuid-dept", name: "CSE", seat_count: 240 } },
              },
            },
          },
        },
      },
    },
    "/api/colleges/{college_id}/students": {
      get: {
        tags: ["Colleges"],
        summary: "List College Students",
        description: "Loads paginated listing of students matching parameters, scoped exclusively to the target college. Restricted to Placement Officers or College Admins.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "college_id", in: "path", required: true, schema: { type: "string" }, description: "Target College UUID" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "department_id", in: "query", schema: { type: "string" } },
          { name: "batch_year", in: "query", schema: { type: "integer" } },
          { name: "min_cgpa", in: "query", schema: { type: "number" } },
          { name: "max_backlogs", in: "query", schema: { type: "integer" } },
          { name: "placement_status", in: "query", schema: { type: "string", enum: ["UNPLACED", "PLACED", "DREAM_OPTION_USED"] } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "College student array loaded.",
            content: {
              "application/json": {
                example: { success: true, data: [{ id: "uuid-student", fullName: "Haneesh Kumar" }], pagination: { cursor: "cursor_string", has_next: false, total: 1 } },
              },
            },
          },
        },
      },
    },
    "/api/colleges/{college_id}/reports/placement": {
      get: {
        tags: ["Colleges"],
        summary: "Export placement report job (CSV/Excel)",
        description: "Enqueues asynchronous BullMQ workers to compile Excel/CSV files. Restricted to officers or admins. STRICT rate limit of 1 request/minute.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "college_id", in: "path", required: true, schema: { type: "string" }, description: "Target College UUID" },
          { name: "drive_id", in: "query", schema: { type: "string" }, description: "Filter drive metrics" },
          { name: "batch_year", in: "query", schema: { type: "integer" }, description: "Filter graduation year" },
          { name: "format", in: "query", schema: { type: "string", enum: ["csv", "xlsx"], default: "csv" }, description: "Export document format file" },
        ],
        responses: {
          200: {
            description: "Background processing job successfully enqueued.",
            content: {
              "application/json": {
                example: { job_id: "uuid-job-key", status: "PROCESSING", estimated_seconds: 30, poll_url: "/api/async-jobs/uuid-job-key/status" },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 12. SKILL MODULE
    // ----------------------------------------------------
    "/api/skills": {
      get: {
        tags: ["Skills"],
        summary: "List all global skills index",
        description: "Retrieves list of active skills from DB (speed-cached in Redis for 1 hour). RELAXED rate limits.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "category", in: "query", schema: { type: "string" }, description: "Filter categories" },
          { name: "search", in: "query", schema: { type: "string" }, description: "Search by skill name string" },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
        ],
        responses: {
          200: {
            description: "Skills list retrieved.",
            content: {
              "application/json": {
                example: { success: true, data: [{ id: "uuid-skill", name: "React.js", category: "Frontend" }], pagination: { cursor: "cursor_string", has_next: false, total: 1 } },
              },
            },
          },
        },
      },
      post: {
        tags: ["Skills"],
        summary: "Register new Skill",
        description: "Creates global skills taxonomy. Restricted to Super or University Administrators.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Next.js", description: "Skill technical name string identifier" },
                  category: { type: "string", example: "Frontend", description: "Branch domain category grouping classification" },
                },
                required: ["name", "category"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Global skill created.",
            content: {
              "application/json": {
                example: { success: true, skill: { id: "uuid-skill", name: "Next.js", category: "Frontend" } },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 13. NOTIFICATION MODULE
    // ----------------------------------------------------
    "/api/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "Get my notifications",
        description: "Queries list of unread/read alerts.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "is_read", in: "query", schema: { type: "boolean" }, description: "Filter read state status" },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: {
            description: "Notifications array fetched successfully.",
            content: {
              "application/json": {
                example: {
                  success: true,
                  unread_count: 5,
                  data: [
                    { id: "uuid-alert", type: "APPLICATION_SHORTLISTED", title: "You've been shortlisted!", body: "Infosys has shortlisted you for Software Engineer.", is_read: false, ref_entity: "APPLICATION", ref_entity_id: "uuid-app", created_at: "2026-05-26T10:00:00.000Z" },
                  ],
                  pagination: { cursor: "cursor_string", has_next: false, total: 1 },
                },
              },
            },
          },
        },
      },
    },
    "/api/notifications/{notification_id}/read": {
      patch: {
        tags: ["Notifications"],
        summary: "Mark notification as read",
        description: "Updates read states. Syncs and decrements user badge count in Redis.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "notification_id", in: "path", required: true, schema: { type: "string" }, description: "Target notification UUID" },
        ],
        responses: {
          200: {
            description: "Read status updated.",
            content: {
              "application/json": {
                example: { success: true },
              },
            },
          },
        },
      },
    },
    "/api/notifications/read-all": {
      patch: {
        tags: ["Notifications"],
        summary: "Mark all notifications as read",
        description: "Configures all pending unread records to read state and resets active Redis count tracking.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "All notifications updated.",
            content: {
              "application/json": {
                example: { success: true, updated_count: 5 },
              },
            },
          },
        },
      },
    },
    "/api/notifications/unread-count": {
      get: {
        tags: ["Notifications"],
        summary: "Get unread count for badge",
        description: "Instantly yields unread alerts count using Redis-cached integers. RELAXED rate limits.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Unread count loaded.",
            content: {
              "application/json": {
                example: { unread_count: 3 },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 14. ADMIN MODULE
    // ----------------------------------------------------
    "/api/admin/stats": {
      get: {
        tags: ["Admin"],
        summary: "Query Platform Stats metrics",
        description: "Loads active system aggregates and DB health states. Restricted to Super Administrators only.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Stats loaded.",
            content: {
              "application/json": {
                example: { total_users: 98432, total_students: 87000, total_companies: 1240, total_colleges: 85, total_applications_today: 4500, placements_this_month: 2300, active_drives: 14, system_health: { db_latency_ms: 12, cache_hit_rate: 94.2, queue_depth: 42 } },
              },
            },
          },
        },
      },
    },
    "/api/admin/users": {
      get: {
        tags: ["Admin"],
        summary: "Search and List users profile status",
        description: "Paginated filter lists representing overall users index. Restricted to Super Administrators.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "role", in: "query", schema: { type: "string" }, description: "Filter by Role enum" },
          { name: "is_active", in: "query", schema: { type: "boolean" }, description: "Filter active flag" },
          { name: "search", in: "query", schema: { type: "string" }, description: "Search by email or full name" },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: {
            description: "User profiles loaded.",
            content: {
              "application/json": {
                example: { success: true, data: [{ id: "uuid-user", email: "haneesh0769@gmail.com", role: "STUDENT", isActive: true }], pagination: { cursor: "cursor_string", has_next: false, total: 1 } },
              },
            },
          },
        },
      },
    },
    "/api/admin/users/{user_id}/deactivate": {
      patch: {
        tags: ["Admin"],
        summary: "Deactivate user account",
        description: "Blacklists account status and terminates all active sessions in Redis instantly. Restricted to Super Administrators only.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "user_id", in: "path", required: true, schema: { type: "string" }, description: "Target user UUID" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", example: "Violation of platform terms.", description: "Audit reason details for deactivation" },
                },
                required: ["reason"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "User successfully deactivated.",
            content: {
              "application/json": {
                example: { success: true, user_id: "uuid-user", is_active: false },
              },
            },
          },
        },
      },
    },
    "/api/admin/audit-log": {
      get: {
        tags: ["Admin"],
        summary: "Search and List platform Audit Logs",
        description: "Loads system logs tracking actions, IPs, and telemetry logs. Restricted to Super Administrators.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "user_id", in: "query", schema: { type: "string" } },
          { name: "action", in: "query", schema: { type: "string" } },
          { name: "entity", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
        ],
        responses: {
          200: {
            description: "Audit logs fetched successfully.",
            content: {
              "application/json": {
                example: { success: true, data: [{ id: "uuid-audit", user_id: "uuid-user", action: "APPLICATION_STATUS_CHANGED", ip: "103.x.x.x" }], pagination: { cursor: "cursor_string", has_next: false, total: 1 } },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 15. ASYNC JOBS MODULE
    // ----------------------------------------------------
    "/api/async-jobs/{job_id}/status": {
      get: {
        tags: ["Async Jobs"],
        summary: "Poll background Async Job status",
        description: "Queries BullMQ status tracking background jobs. Yields pre-signed download URLs upon completion.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "job_id", in: "path", required: true, schema: { type: "string" }, description: "Target BullMQ Job ID key" },
        ],
        responses: {
          200: {
            description: "Job status successfully parsed.",
            content: {
              "application/json": {
                example: { job_id: "uuid-job-key", status: "COMPLETED", result: { download_url: "https://s3.r2.cloudflarestorage.com/placement/reports/uuid.csv?expires...", expires_in: 3600 } },
              },
            },
          },
        },
      },
    },

    // ----------------------------------------------------
    // 16. HEALTH MODULE
    // ----------------------------------------------------
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Public Health Check",
        description: "Used by cloud load-balancers to verify service routing health.",
        responses: {
          200: {
            description: "Server is healthy.",
            content: {
              "application/json": {
                example: { status: "ok", timestamp: "2026-05-26T10:30:00.000Z", version: "1.4.2" },
              },
            },
          },
        },
      },
    },
    "/api/health/deep": {
      get: {
        tags: ["Health"],
        summary: "Deep Health check telemetry",
        description: "Verifies database connections latency, Redis caching connections, S3 bucket reachability, and BullMQ queues depth. Restricted via client-IP allowlists.",
        responses: {
          200: {
            description: "Deep health metrics compiled.",
            content: {
              "application/json": {
                example: { status: "ok", checks: { database: { status: "ok", latency_ms: 8 }, redis: { status: "ok", latency_ms: 1 }, s3: { status: "ok" }, queue: { status: "ok", depth: 14 } } },
              },
            },
          },
        },
      },
    },
  },
};

const swaggerRouter = express.Router();
swaggerRouter.use("/", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

export default swaggerRouter;
export { swaggerSpec };
