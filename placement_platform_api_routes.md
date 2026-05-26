# Placement Platform — Production API Routes
> 100M-user grade · Next.js App Router (`/app/api/`) · REST + JSON
> Every route includes: Method, Path, Auth Guard, Rate Limit, Payload, Response, Production Notes

---

## CONVENTIONS

```
Auth Guards:
  PUBLIC        — no token required
  ACCESS_TOKEN  — valid JWT access token (15min expiry)
  REFRESH_TOKEN — httpOnly cookie, used only on /auth/refresh
  ROLE:*        — role-based (STUDENT | COMPANY_ADMIN | PLACEMENT_OFFICER | COLLEGE_ADMIN | UNIVERSITY_ADMIN | SUPER_ADMIN)

Rate Limits (per IP unless noted):
  STRICT   — 5 req/15 min   (auth, OTP endpoints)
  STANDARD — 100 req/min    (most read endpoints)
  RELAXED  — 1000 req/min   (public read, paginated lists)

Common Headers (all protected routes):
  Authorization: Bearer <access_token>
  x-request-id: <uuid>          (idempotency)
  x-device-fingerprint: <hash>  (fraud detection)
```

---

## 1. AUTH ROUTES — `/api/auth`

---

### 1.1 Register (initiate — sends OTP)
```
POST /api/auth/register/initiate
AUTH    : PUBLIC
RATE    : STRICT
```
**Payload**
```json
{
  "email": "student@college.edu",
  "role": "STUDENT | COMPANY_ADMIN | PLACEMENT_OFFICER",
  "college_code": "VJIT-2024"
}
```
**Response 200**
```json
{
  "success": true,
  "message": "OTP sent to email",
  "otp_token": "<signed_jwt_otp_session>",
  "expires_in": 300
}
```
> Production: OTP is a 6-digit TOTP, not stored in DB — verified via HMAC. `otp_token` is a short-lived signed JWT passed back to verify step. Never return the OTP itself.

---

### 1.2 Register (verify OTP + complete)
```
POST /api/auth/register/verify
AUTH    : PUBLIC (requires otp_token from 1.1)
RATE    : STRICT
```
**Payload**
```json
{
  "otp_token": "<jwt_from_initiate>",
  "otp_code": "847291",
  "full_name": "Ravi Kumar",
  "password": "Min8chars+1Upper+1Special"
}
```
**Response 201**
```json
{
  "success": true,
  "user": { "id": "uuid", "email": "...", "role": "STUDENT" },
  "access_token": "<jwt_15min>",
  "token_type": "Bearer",
  "expires_in": 900
}
```
> Production: `refresh_token` set as `httpOnly; Secure; SameSite=Strict` cookie — never in body. Password hashed with Argon2id (not bcrypt).

---

### 1.3 Login
```
POST /api/auth/login
AUTH    : PUBLIC
RATE    : STRICT (+ exponential backoff after 5 failures, device-level)
```
**Payload**
```json
{
  "email": "ravi@vjit.ac.in",
  "password": "...",
  "device_fingerprint": "sha256-hash",
  "remember_me": true
}
```
**Response 200**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "...",
    "role": "STUDENT",
    "college_id": "uuid",
    "is_profile_complete": false
  },
  "access_token": "<jwt_15min>",
  "token_type": "Bearer",
  "expires_in": 900
}
```
> Production: On 5th failed attempt → lock account for 30 min + send alert email. `refresh_token` in httpOnly cookie: 7 days if `remember_me`, else session-scoped. Log `ip`, `user_agent`, `device_fingerprint` in `login_sessions` table.

---

### 1.4 Refresh Access Token
```
POST /api/auth/refresh
AUTH    : REFRESH_TOKEN (httpOnly cookie, no body token)
RATE    : STANDARD
```
**Payload**: _(none — reads refresh token from cookie)_

**Response 200**
```json
{
  "access_token": "<new_jwt_15min>",
  "expires_in": 900
}
```
> Production: Refresh token rotation — on every refresh, old token is invalidated and a new one is issued. Family-based rotation: if a stolen token is reused, entire family is revoked (detect replay attacks). Store token families in Redis.

---

### 1.5 Logout
```
POST /api/auth/logout
AUTH    : ACCESS_TOKEN
RATE    : STANDARD
```
**Payload**
```json
{ "logout_all_devices": false }
```
**Response 200**
```json
{ "success": true }
```
> Production: Invalidate current refresh token (or all tokens if `logout_all_devices`). Blacklist current access token in Redis until expiry. Clear httpOnly cookie.

---

### 1.6 Forgot Password (initiate)
```
POST /api/auth/password/forgot
AUTH    : PUBLIC
RATE    : STRICT
```
**Payload**
```json
{ "email": "ravi@vjit.ac.in" }
```
**Response 200**
```json
{ "success": true, "message": "If this email exists, a reset link was sent." }
```
> Production: Always return same response regardless of whether email exists (prevent user enumeration). Token is a one-time signed URL with 15-min expiry stored as hashed value in DB.

---

### 1.7 Reset Password
```
POST /api/auth/password/reset
AUTH    : PUBLIC (requires reset_token)
RATE    : STRICT
```
**Payload**
```json
{
  "reset_token": "<uuid_from_email>",
  "new_password": "NewPass@123",
  "confirm_password": "NewPass@123"
}
```
**Response 200**
```json
{ "success": true, "message": "Password updated. Please log in." }
```

---

### 1.8 Change Password (authenticated)
```
POST /api/auth/password/change
AUTH    : ACCESS_TOKEN
RATE    : STRICT
```
**Payload**
```json
{
  "current_password": "OldPass@123",
  "new_password": "NewPass@456"
}
```
**Response 200**
```json
{ "success": true }
```
> Production: Invalidate all refresh tokens across all devices on password change.

---

### 1.9 Get Current Session Info
```
GET /api/auth/me
AUTH    : ACCESS_TOKEN
RATE    : STANDARD
```
**Response 200**
```json
{
  "id": "uuid",
  "email": "...",
  "role": "STUDENT",
  "college_id": "uuid",
  "company_id": null,
  "permissions": ["apply_jobs", "upload_resume"],
  "is_profile_complete": true,
  "last_login": "2025-01-10T08:30:00Z"
}
```

---

### 1.10 List Active Sessions
```
GET /api/auth/sessions
AUTH    : ACCESS_TOKEN
RATE    : STANDARD
```
**Response 200**
```json
{
  "sessions": [
    {
      "session_id": "uuid",
      "device": "Chrome on Windows",
      "ip": "103.x.x.x",
      "location": "Hyderabad, IN",
      "last_active": "2025-01-10T08:30:00Z",
      "is_current": true
    }
  ]
}
```

---

### 1.11 Revoke Specific Session
```
DELETE /api/auth/sessions/:session_id
AUTH    : ACCESS_TOKEN
RATE    : STANDARD
```
**Response 200**
```json
{ "success": true }
```

---

## 2. USER ROUTES — `/api/users`

---

### 2.1 Get User Profile
```
GET /api/users/:user_id/profile
AUTH    : ACCESS_TOKEN + ROLE:SELF | COLLEGE_ADMIN | UNIVERSITY_ADMIN
RATE    : STANDARD
```
**Response 200**
```json
{
  "id": "uuid",
  "email": "...",
  "role": "STUDENT",
  "created_at": "...",
  "profile": { "...entity-specific fields..." }
}
```

---

### 2.2 Update User Email (initiate OTP)
```
POST /api/users/email/change/initiate
AUTH    : ACCESS_TOKEN
RATE    : STRICT
```
**Payload**
```json
{ "new_email": "new@college.edu" }
```
**Response 200**
```json
{ "otp_token": "...", "expires_in": 300 }
```

---

### 2.3 Update User Email (confirm OTP)
```
POST /api/users/email/change/confirm
AUTH    : ACCESS_TOKEN
RATE    : STRICT
```
**Payload**
```json
{ "otp_token": "...", "otp_code": "293847" }
```
**Response 200**
```json
{ "success": true, "new_email": "new@college.edu" }
```

---

### 2.4 Upload Avatar
```
POST /api/users/avatar
AUTH    : ACCESS_TOKEN
RATE    : STANDARD
Content-Type: multipart/form-data
```
**Payload**: `file` (image, max 2MB, jpg/png/webp)

**Response 200**
```json
{ "avatar_url": "https://cdn.placementapp.in/avatars/uuid.webp" }
```
> Production: Validate MIME type server-side (not just extension). Resize to 200×200 via Sharp. Upload to S3/R2. Never serve user uploads from your own domain — use CDN.

---

## 3. STUDENT ROUTES — `/api/students`

---

### 3.1 Complete Student Profile (onboarding)
```
PUT /api/students/:student_id/profile
AUTH    : ACCESS_TOKEN + ROLE:STUDENT (own profile)
RATE    : STANDARD
```
**Payload**
```json
{
  "full_name": "Ravi Kumar",
  "roll_number": "20BCS0147",
  "batch_year": 2024,
  "cgpa": 8.4,
  "backlogs": 0,
  "phone": "+919876543210",
  "department_id": "uuid",
  "linkedin_url": "https://linkedin.com/in/ravikumar",
  "github_url": "https://github.com/ravikumar",
  "portfolio_url": "",
  "bio": "Full stack developer...",
  "current_city": "Hyderabad",
  "skills": [
    { "skill_id": "uuid", "proficiency_level": "ADVANCED" }
  ]
}
```
**Response 200**
```json
{
  "student": { "...all fields..." },
  "is_profile_complete": true,
  "profile_strength": 85
}
```

---

### 3.2 Get Student Profile (public view)
```
GET /api/students/:student_id
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN | PLACEMENT_OFFICER | COLLEGE_ADMIN
RATE    : STANDARD
```
**Response 200**
```json
{
  "id": "uuid",
  "full_name": "Ravi Kumar",
  "department": "CSE",
  "batch_year": 2024,
  "cgpa": 8.4,
  "backlogs": 0,
  "skills": ["React", "Node.js", "PostgreSQL"],
  "placement_status": "UNPLACED",
  "resume_count": 3,
  "application_count": 7
}
```

---

### 3.3 List Students (paginated, filterable)
```
GET /api/students
AUTH    : ACCESS_TOKEN + ROLE:PLACEMENT_OFFICER | COLLEGE_ADMIN | COMPANY_ADMIN
RATE    : STANDARD
```
**Query Params**
```
page=1&limit=20
college_id=uuid
department_id=uuid
batch_year=2024
min_cgpa=7.0
max_backlogs=0
placement_status=UNPLACED
skill_ids=uuid1,uuid2
search=ravi
sort_by=cgpa&sort_order=desc
```
**Response 200**
```json
{
  "data": [ { "...student objects..." } ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 4820,
    "total_pages": 241,
    "has_next": true,
    "cursor": "base64_encoded_cursor"
  }
}
```
> Production: Use cursor-based pagination (not offset) for 100M rows. Offset pagination is O(n) at scale — cursor is O(1).

---

### 3.4 Get Student Dashboard Stats
```
GET /api/students/:student_id/dashboard
AUTH    : ACCESS_TOKEN + ROLE:STUDENT (own)
RATE    : STANDARD
```
**Response 200**
```json
{
  "applications_total": 12,
  "applications_by_status": {
    "APPLIED": 3,
    "SHORTLISTED": 4,
    "INTERVIEW_SCHEDULED": 2,
    "SELECTED": 1,
    "REJECTED": 2
  },
  "upcoming_interviews": [ { "...interview objects..." } ],
  "recommended_jobs": [ { "...job objects..." } ],
  "profile_completion": 85,
  "placement_status": "PLACED"
}
```

---

## 4. RESUME ROUTES — `/api/resumes`

---

### 4.1 Upload Resume
```
POST /api/resumes
AUTH    : ACCESS_TOKEN + ROLE:STUDENT
RATE    : STANDARD (max 5 resumes/student enforced in logic)
Content-Type: multipart/form-data
```
**Payload**
```
file        : PDF only, max 5MB
version_label : "SDE Resume v2"
is_default  : true
```
**Response 201**
```json
{
  "id": "uuid",
  "file_url": "https://cdn.../resumes/uuid.pdf",
  "file_name": "Ravi_Kumar_SDE_v2.pdf",
  "version_label": "SDE Resume v2",
  "is_default": true,
  "created_at": "..."
}
```
> Production: Scan PDF for malware (ClamAV or S3 with GuardDuty). Store original filename sanitized. Serve via pre-signed URLs (expiry 1hr), never public URLs.

---

### 4.2 List My Resumes
```
GET /api/resumes
AUTH    : ACCESS_TOKEN + ROLE:STUDENT
RATE    : STANDARD
```
**Response 200**
```json
{
  "resumes": [
    {
      "id": "uuid",
      "version_label": "SDE Resume v2",
      "file_name": "...",
      "is_default": true,
      "download_url": "<presigned_url_1hr>",
      "created_at": "..."
    }
  ]
}
```

---

### 4.3 Set Default Resume
```
PATCH /api/resumes/:resume_id/set-default
AUTH    : ACCESS_TOKEN + ROLE:STUDENT (own resume)
RATE    : STANDARD
```
**Payload**: _(none)_

**Response 200**
```json
{ "success": true, "default_resume_id": "uuid" }
```

---

### 4.4 Delete Resume
```
DELETE /api/resumes/:resume_id
AUTH    : ACCESS_TOKEN + ROLE:STUDENT (own resume)
RATE    : STANDARD
```
**Response 200**
```json
{ "success": true }
```
> Production: Soft delete only (`is_active = false`). Hard delete from S3 via async job (preserve for audit if resume was used in applications).

---

### 4.5 Get Resume Download URL (pre-signed)
```
GET /api/resumes/:resume_id/download
AUTH    : ACCESS_TOKEN + ROLE:STUDENT(own) | COMPANY_ADMIN | PLACEMENT_OFFICER
RATE    : STANDARD
```
**Response 200**
```json
{
  "download_url": "https://s3.../presigned?...",
  "expires_in": 3600
}
```
> Production: Log every resume download (who, when, from which job context) — required for DPDP Act compliance in India.

---

## 5. COMPANY ROUTES — `/api/companies`

---

### 5.1 Register Company
```
POST /api/companies
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN
RATE    : STRICT
```
**Payload**
```json
{
  "name": "Infosys Limited",
  "industry": "IT Services",
  "website": "https://infosys.com",
  "hq_location": "Bengaluru, India",
  "description": "...",
  "employee_count": 350000,
  "linkedin_url": "https://linkedin.com/company/infosys"
}
```
**Response 201**
```json
{
  "company": { "id": "uuid", "name": "Infosys Limited", "is_verified": false },
  "message": "Company registered. Pending admin verification."
}
```

---

### 5.2 Get Company Profile
```
GET /api/companies/:company_id
AUTH    : ACCESS_TOKEN
RATE    : RELAXED
```
**Response 200**
```json
{
  "id": "uuid",
  "name": "Infosys",
  "industry": "IT Services",
  "is_verified": true,
  "profile": { "...profile fields..." },
  "active_job_count": 14
}
```

---

### 5.3 Update Company Profile
```
PUT /api/companies/:company_id
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN (own company)
RATE    : STANDARD
```
**Payload**: _(any updatable company/profile fields)_

**Response 200**
```json
{ "company": { "...updated fields..." } }
```

---

### 5.4 Upload Company Logo
```
POST /api/companies/:company_id/logo
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN
RATE    : STANDARD
Content-Type: multipart/form-data
```
**Payload**: `file` (image, max 1MB)

**Response 200**
```json
{ "logo_url": "https://cdn.../logos/uuid.webp" }
```

---

### 5.5 Verify Company (admin only)
```
PATCH /api/companies/:company_id/verify
AUTH    : ACCESS_TOKEN + ROLE:SUPER_ADMIN | UNIVERSITY_ADMIN
RATE    : STANDARD
```
**Payload**
```json
{ "is_verified": true, "verification_note": "Documents checked." }
```
**Response 200**
```json
{ "success": true, "is_verified": true }
```

---

### 5.6 List Companies
```
GET /api/companies
AUTH    : ACCESS_TOKEN
RATE    : RELAXED
```
**Query Params**: `page, limit, industry, is_verified, search, sort_by`

**Response 200**
```json
{
  "data": [ { "...company objects..." } ],
  "pagination": { "...cursor pagination..." }
}
```

---

## 6. JOB POST ROUTES — `/api/jobs`

---

### 6.1 Create Job Post
```
POST /api/jobs
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN
RATE    : STANDARD
```
**Payload**
```json
{
  "placement_drive_id": "uuid",
  "title": "Software Engineer",
  "job_type": "FULL_TIME",
  "location": "Hyderabad / Remote",
  "ctc_min": 600000,
  "ctc_max": 900000,
  "description": "We are looking for...",
  "application_deadline": "2025-02-28",
  "max_applications": 500,
  "eligibility": {
    "min_cgpa": 7.0,
    "max_backlogs": 0,
    "allowed_branches": ["CSE","IT","ECE"],
    "batch_year_from": 2024,
    "batch_year_to": 2025
  },
  "required_skills": [
    { "skill_id": "uuid", "is_mandatory": true },
    { "skill_id": "uuid", "is_mandatory": false }
  ]
}
```
**Response 201**
```json
{
  "job": {
    "id": "uuid",
    "title": "Software Engineer",
    "status": "DRAFT",
    "created_at": "..."
  }
}
```

---

### 6.2 Publish Job Post
```
PATCH /api/jobs/:job_id/publish
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN (own) | PLACEMENT_OFFICER
RATE    : STANDARD
```
**Response 200**
```json
{ "job_id": "uuid", "status": "OPEN", "published_at": "..." }
```
> Production: Triggers async notification job — notifies all eligible students via email + in-app. Uses BullMQ/SQS queue, not synchronous.

---

### 6.3 Get Job Post
```
GET /api/jobs/:job_id
AUTH    : ACCESS_TOKEN
RATE    : RELAXED
```
**Response 200**
```json
{
  "id": "uuid",
  "title": "Software Engineer",
  "company": { "name": "Infosys", "logo_url": "..." },
  "placement_drive": { "title": "...", "college": "VJIT" },
  "job_type": "FULL_TIME",
  "location": "Hyderabad",
  "ctc_range": "6 LPA – 9 LPA",
  "description": "...",
  "eligibility": { "...fields..." },
  "required_skills": [ "...skills..." ],
  "application_deadline": "2025-02-28",
  "status": "OPEN",
  "applicant_count": 234,
  "has_applied": false,
  "is_eligible": true
}
```

---

### 6.4 List Jobs (student view — shows eligibility)
```
GET /api/jobs
AUTH    : ACCESS_TOKEN
RATE    : RELAXED
```
**Query Params**: `page, limit, status, job_type, min_ctc, company_id, drive_id, skill_ids, search, sort_by`

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Software Engineer",
      "company_name": "Infosys",
      "ctc_range": "6–9 LPA",
      "deadline": "2025-02-28",
      "status": "OPEN",
      "is_eligible": true,
      "has_applied": false
    }
  ],
  "pagination": { "...cursor..." }
}
```

---

### 6.5 Update Job Post
```
PUT /api/jobs/:job_id
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN (own job)
RATE    : STANDARD
```
> Production: Only allowed when `status = DRAFT`. Once OPEN, only `application_deadline` and `max_applications` can be updated (partial update via PATCH).

---

### 6.6 Close Job Post
```
PATCH /api/jobs/:job_id/close
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN | PLACEMENT_OFFICER
RATE    : STANDARD
```
**Payload**
```json
{ "reason": "Position filled." }
```
**Response 200**
```json
{ "job_id": "uuid", "status": "CLOSED" }
```

---

### 6.7 Get Job Applicants
```
GET /api/jobs/:job_id/applicants
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN | PLACEMENT_OFFICER
RATE    : STANDARD
```
**Query Params**: `status, min_cgpa, department_id, page, limit, sort_by`

**Response 200**
```json
{
  "job_id": "uuid",
  "total_applicants": 412,
  "data": [
    {
      "application_id": "uuid",
      "student": {
        "id": "uuid",
        "full_name": "Ravi Kumar",
        "cgpa": 8.4,
        "department": "CSE",
        "resume_download_url": "<presigned>"
      },
      "current_status": "APPLIED",
      "applied_at": "..."
    }
  ],
  "pagination": { "...cursor..." }
}
```

---

## 7. APPLICATION ROUTES — `/api/applications`

---

### 7.1 Apply to Job
```
POST /api/applications
AUTH    : ACCESS_TOKEN + ROLE:STUDENT
RATE    : STANDARD (max 50 active applications/student enforced)
```
**Payload**
```json
{
  "job_id": "uuid",
  "resume_id": "uuid",
  "cover_note": "I am excited about this role because..."
}
```
**Response 201**
```json
{
  "application": {
    "id": "uuid",
    "job_id": "uuid",
    "resume_id": "uuid",
    "current_status": "APPLIED",
    "applied_at": "..."
  }
}
```
> Production: Check eligibility server-side before accepting (CGPA, backlogs, branch, batch, deadline, max_applications). Idempotent — duplicate applications return 409.

---

### 7.2 Withdraw Application
```
PATCH /api/applications/:application_id/withdraw
AUTH    : ACCESS_TOKEN + ROLE:STUDENT (own application)
RATE    : STANDARD
```
**Response 200**
```json
{ "application_id": "uuid", "current_status": "WITHDRAWN" }
```
> Production: Only allowed in statuses: APPLIED, UNDER_REVIEW. Cannot withdraw after SHORTLISTED.

---

### 7.3 Get Application Detail
```
GET /api/applications/:application_id
AUTH    : ACCESS_TOKEN + ROLE:STUDENT(own) | COMPANY_ADMIN | PLACEMENT_OFFICER
RATE    : STANDARD
```
**Response 200**
```json
{
  "id": "uuid",
  "student": { "...summary..." },
  "job": { "...summary..." },
  "resume": { "download_url": "...<presigned>..." },
  "current_status": "SHORTLISTED",
  "status_history": [
    { "from": "APPLIED", "to": "UNDER_REVIEW", "changed_at": "...", "by": "HR Team" },
    { "from": "UNDER_REVIEW", "to": "SHORTLISTED", "changed_at": "...", "by": "HR Team" }
  ],
  "interview_rounds": [ { "...rounds..." } ]
}
```

---

### 7.4 List My Applications (student)
```
GET /api/applications/mine
AUTH    : ACCESS_TOKEN + ROLE:STUDENT
RATE    : STANDARD
```
**Query Params**: `status, job_type, page, limit`

**Response 200**
```json
{
  "data": [
    {
      "application_id": "uuid",
      "job_title": "Software Engineer",
      "company_name": "Infosys",
      "current_status": "SHORTLISTED",
      "applied_at": "...",
      "resume_used": "SDE Resume v2"
    }
  ],
  "pagination": { "...cursor..." }
}
```

---

### 7.5 Bulk Update Application Status (company/officer)
```
PATCH /api/applications/bulk-status
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN | PLACEMENT_OFFICER
RATE    : STANDARD
```
**Payload**
```json
{
  "application_ids": ["uuid1", "uuid2", "uuid3"],
  "new_status": "SHORTLISTED",
  "remarks": "Shortlisted based on aptitude round",
  "notify_students": true
}
```
**Response 200**
```json
{
  "updated": 3,
  "failed": 0,
  "notifications_queued": 3
}
```
> Production: DB transaction wrapping all updates. Status log entries created for each. Notifications via async queue — not blocking response.

---

### 7.6 Update Single Application Status
```
PATCH /api/applications/:application_id/status
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN | PLACEMENT_OFFICER
RATE    : STANDARD
```
**Payload**
```json
{
  "new_status": "INTERVIEW_SCHEDULED",
  "remarks": "Round 1 Technical",
  "notify_student": true
}
```
**Response 200**
```json
{
  "application_id": "uuid",
  "previous_status": "SHORTLISTED",
  "current_status": "INTERVIEW_SCHEDULED"
}
```
> Production: Enforce state machine transitions. REJECTED → SELECTED is not allowed. Validate valid state transitions server-side.

---

## 8. INTERVIEW ROUTES — `/api/interviews`

---

### 8.1 Schedule Interview Round
```
POST /api/interviews
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN | PLACEMENT_OFFICER
RATE    : STANDARD
```
**Payload**
```json
{
  "application_id": "uuid",
  "round_number": 1,
  "round_type": "TECHNICAL",
  "scheduled_at": "2025-02-10T10:00:00Z",
  "venue_or_link": "https://meet.google.com/xyz-abc",
  "notes": "Prepare DSA + System Design"
}
```
**Response 201**
```json
{
  "round": {
    "id": "uuid",
    "round_number": 1,
    "round_type": "TECHNICAL",
    "scheduled_at": "...",
    "status": "SCHEDULED"
  }
}
```
> Production: Triggers calendar invite email to student. Add to notification queue.

---

### 8.2 Reschedule Interview
```
PATCH /api/interviews/:round_id/reschedule
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN | PLACEMENT_OFFICER
RATE    : STANDARD
```
**Payload**
```json
{
  "new_scheduled_at": "2025-02-12T14:00:00Z",
  "reason": "Interviewer unavailable on original date"
}
```
**Response 200**
```json
{ "round_id": "uuid", "status": "RESCHEDULED", "new_scheduled_at": "..." }
```

---

### 8.3 Submit Interview Feedback
```
POST /api/interviews/:round_id/feedback
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN
RATE    : STANDARD
```
**Payload**
```json
{
  "rating": 4,
  "remarks": "Strong DSA skills, average communication",
  "decision": "PASS"
}
```
**Response 201**
```json
{ "feedback_id": "uuid", "decision": "PASS" }
```

---

### 8.4 Get Upcoming Interviews (student)
```
GET /api/interviews/upcoming
AUTH    : ACCESS_TOKEN + ROLE:STUDENT
RATE    : STANDARD
```
**Response 200**
```json
{
  "interviews": [
    {
      "round_id": "uuid",
      "job_title": "Software Engineer",
      "company_name": "Infosys",
      "round_type": "TECHNICAL",
      "scheduled_at": "2025-02-10T10:00:00Z",
      "venue_or_link": "https://meet.google.com/...",
      "minutes_until": 4320
    }
  ]
}
```

---

## 9. OFFER LETTER ROUTES — `/api/offers`

---

### 9.1 Issue Offer Letter
```
POST /api/offers
AUTH    : ACCESS_TOKEN + ROLE:COMPANY_ADMIN
RATE    : STANDARD
Content-Type: multipart/form-data
```
**Payload**
```
application_id : uuid
designation    : "Software Engineer"
ctc            : 750000
joining_date   : "2025-07-01"
file           : PDF offer letter, max 5MB
```
**Response 201**
```json
{
  "offer": {
    "id": "uuid",
    "application_id": "uuid",
    "designation": "Software Engineer",
    "ctc": 750000,
    "joining_date": "2025-07-01",
    "is_accepted": null
  }
}
```
> Production: Triggers push notification + email to student. Updates `placement_status` to PLACED on acceptance. Notifies placement officer.

---

### 9.2 Accept / Decline Offer
```
PATCH /api/offers/:offer_id/respond
AUTH    : ACCESS_TOKEN + ROLE:STUDENT (own offer)
RATE    : STRICT
```
**Payload**
```json
{ "accept": true }
```
**Response 200**
```json
{
  "offer_id": "uuid",
  "is_accepted": true,
  "message": "Offer accepted. Congratulations!",
  "student_placement_status": "PLACED"
}
```
> Production: On accept — update `student.placement_status = PLACED`, trigger webhook to college ERP if configured. On decline — status remains for further applications.

---

### 9.3 Download Offer Letter
```
GET /api/offers/:offer_id/download
AUTH    : ACCESS_TOKEN + ROLE:STUDENT(own) | COMPANY_ADMIN | PLACEMENT_OFFICER
RATE    : STANDARD
```
**Response 200**
```json
{ "download_url": "<presigned_s3_url>", "expires_in": 3600 }
```

---

## 10. PLACEMENT DRIVE ROUTES — `/api/drives`

---

### 10.1 Create Placement Drive
```
POST /api/drives
AUTH    : ACCESS_TOKEN + ROLE:PLACEMENT_OFFICER | COLLEGE_ADMIN
RATE    : STANDARD
```
**Payload**
```json
{
  "college_id": "uuid",
  "title": "Campus Placement Drive 2025",
  "start_date": "2025-01-15",
  "end_date": "2025-04-30",
  "description": "Annual campus placement for batch 2025"
}
```
**Response 201**
```json
{ "drive": { "id": "uuid", "title": "...", "status": "DRAFT" } }
```

---

### 10.2 Activate Drive
```
PATCH /api/drives/:drive_id/activate
AUTH    : ACCESS_TOKEN + ROLE:PLACEMENT_OFFICER | COLLEGE_ADMIN
RATE    : STANDARD
```
**Response 200**
```json
{ "drive_id": "uuid", "status": "ACTIVE" }
```

---

### 10.3 Invite Company to Drive
```
POST /api/drives/:drive_id/invite
AUTH    : ACCESS_TOKEN + ROLE:PLACEMENT_OFFICER | COLLEGE_ADMIN
RATE    : STANDARD
```
**Payload**
```json
{
  "company_id": "uuid",
  "message": "We invite Infosys to participate in our 2025 campus drive.",
  "proposed_date_range": "2025-02-01 to 2025-02-28"
}
```
**Response 200**
```json
{ "success": true, "invitation_sent": true }
```

---

### 10.4 Get Drive Analytics
```
GET /api/drives/:drive_id/analytics
AUTH    : ACCESS_TOKEN + ROLE:PLACEMENT_OFFICER | COLLEGE_ADMIN | UNIVERSITY_ADMIN
RATE    : STANDARD
```
**Response 200**
```json
{
  "drive_id": "uuid",
  "total_students": 800,
  "placed_count": 312,
  "placement_rate": 39.0,
  "companies_participated": 24,
  "total_job_posts": 38,
  "avg_ctc": 720000,
  "highest_ctc": 2400000,
  "by_department": [
    { "department": "CSE", "placed": 140, "total": 200, "rate": 70.0 }
  ],
  "by_company": [
    { "company": "Infosys", "offers_made": 60, "accepted": 55 }
  ]
}
```
> Production: This endpoint reads from a pre-aggregated `drive_analytics` materialized view — not live DB queries. Refresh every 15 min via cron.

---

### 10.5 List Drives
```
GET /api/drives
AUTH    : ACCESS_TOKEN
RATE    : RELAXED
```
**Query Params**: `college_id, status, page, limit`

**Response 200**
```json
{
  "data": [ { "...drive summaries..." } ],
  "pagination": { "...cursor..." }
}
```

---

## 11. COLLEGE ROUTES — `/api/colleges`

---

### 11.1 Register College
```
POST /api/colleges
AUTH    : ACCESS_TOKEN + ROLE:UNIVERSITY_ADMIN | SUPER_ADMIN
RATE    : STANDARD
```
**Payload**
```json
{
  "university_id": "uuid",
  "name": "Vardhaman College of Engineering",
  "code": "VJIT-2024",
  "address": "Kacharam, Shamshabad, Hyderabad",
  "tpo_email": "tpo@vjit.ac.in"
}
```
**Response 201**
```json
{ "college": { "id": "uuid", "code": "VJIT-2024", "is_active": true } }
```

---

### 11.2 Get College Dashboard
```
GET /api/colleges/:college_id/dashboard
AUTH    : ACCESS_TOKEN + ROLE:PLACEMENT_OFFICER | COLLEGE_ADMIN
RATE    : STANDARD
```
**Response 200**
```json
{
  "total_students": 2400,
  "placed_students": 940,
  "placement_rate": 39.2,
  "active_drives": 2,
  "companies_onboarded": 45,
  "open_jobs": 18,
  "pending_applications": 1240,
  "departments": [ { "name": "CSE", "placed": 380, "total": 480 } ]
}
```

---

### 11.3 Add Department
```
POST /api/colleges/:college_id/departments
AUTH    : ACCESS_TOKEN + ROLE:COLLEGE_ADMIN
RATE    : STANDARD
```
**Payload**
```json
{
  "name": "Computer Science & Engineering",
  "code": "CSE",
  "seat_count": 240
}
```
**Response 201**
```json
{ "department": { "id": "uuid", "name": "CSE", "seat_count": 240 } }
```

---

### 11.4 List College Students (placement view)
```
GET /api/colleges/:college_id/students
AUTH    : ACCESS_TOKEN + ROLE:PLACEMENT_OFFICER | COLLEGE_ADMIN
RATE    : STANDARD
```
Same query params as `GET /api/students`. Scoped to college.

---

### 11.5 Export Placement Report (CSV)
```
GET /api/colleges/:college_id/reports/placement
AUTH    : ACCESS_TOKEN + ROLE:PLACEMENT_OFFICER | COLLEGE_ADMIN
RATE    : STANDARD (1 export/min per user)
```
**Query Params**: `drive_id, batch_year, format=csv|xlsx`

**Response**: Triggers async job → returns download URL when ready.

```json
{
  "job_id": "uuid",
  "status": "PROCESSING",
  "estimated_seconds": 30,
  "poll_url": "/api/jobs/uuid/status"
}
```
> Production: Never generate large exports synchronously. Queue via BullMQ, stream to S3, notify user when ready.

---

## 12. SKILL ROUTES — `/api/skills`

---

### 12.1 List All Skills
```
GET /api/skills
AUTH    : ACCESS_TOKEN
RATE    : RELAXED
```
**Query Params**: `category, search, page, limit`

**Response 200**
```json
{
  "data": [
    { "id": "uuid", "name": "React.js", "category": "Frontend" }
  ],
  "pagination": { "..." }
}
```
> Production: Cache in Redis for 1 hour. Skills list rarely changes.

---

### 12.2 Create Skill (admin)
```
POST /api/skills
AUTH    : ACCESS_TOKEN + ROLE:SUPER_ADMIN | UNIVERSITY_ADMIN
RATE    : STANDARD
```
**Payload**
```json
{ "name": "Next.js", "category": "Frontend" }
```
**Response 201**
```json
{ "skill": { "id": "uuid", "name": "Next.js", "category": "Frontend" } }
```

---

## 13. NOTIFICATION ROUTES — `/api/notifications`

---

### 13.1 Get My Notifications
```
GET /api/notifications
AUTH    : ACCESS_TOKEN
RATE    : STANDARD
```
**Query Params**: `is_read=false, page=1, limit=20`

**Response 200**
```json
{
  "unread_count": 5,
  "data": [
    {
      "id": "uuid",
      "type": "APPLICATION_SHORTLISTED",
      "title": "You've been shortlisted!",
      "body": "Infosys has shortlisted you for Software Engineer.",
      "is_read": false,
      "ref_entity": "APPLICATION",
      "ref_entity_id": "uuid",
      "created_at": "..."
    }
  ],
  "pagination": { "..." }
}
```

---

### 13.2 Mark Notification as Read
```
PATCH /api/notifications/:notification_id/read
AUTH    : ACCESS_TOKEN
RATE    : STANDARD
```
**Response 200**
```json
{ "success": true }
```

---

### 13.3 Mark All as Read
```
PATCH /api/notifications/read-all
AUTH    : ACCESS_TOKEN
RATE    : STANDARD
```
**Response 200**
```json
{ "updated_count": 5 }
```

---

### 13.4 Get Unread Count (for badge)
```
GET /api/notifications/unread-count
AUTH    : ACCESS_TOKEN
RATE    : RELAXED
```
**Response 200**
```json
{ "unread_count": 3 }
```
> Production: Read from Redis counter, not DB count query. Decrement on read. Invalidate on new notification.

---

## 14. ADMIN ROUTES — `/api/admin`

---

### 14.1 Platform Stats (super admin)
```
GET /api/admin/stats
AUTH    : ACCESS_TOKEN + ROLE:SUPER_ADMIN
RATE    : STANDARD
```
**Response 200**
```json
{
  "total_users": 98432,
  "total_students": 87000,
  "total_companies": 1240,
  "total_colleges": 85,
  "total_applications_today": 4500,
  "placements_this_month": 2300,
  "active_drives": 14,
  "system_health": {
    "db_latency_ms": 12,
    "cache_hit_rate": 94.2,
    "queue_depth": 42
  }
}
```

---

### 14.2 List All Users (paginated)
```
GET /api/admin/users
AUTH    : ACCESS_TOKEN + ROLE:SUPER_ADMIN
RATE    : STANDARD
```
**Query Params**: `role, is_active, search, page, limit`

---

### 14.3 Deactivate User
```
PATCH /api/admin/users/:user_id/deactivate
AUTH    : ACCESS_TOKEN + ROLE:SUPER_ADMIN
RATE    : STANDARD
```
**Payload**
```json
{ "reason": "Violation of platform terms." }
```
**Response 200**
```json
{ "success": true, "user_id": "uuid", "is_active": false }
```
> Production: Immediately invalidate all active sessions and refresh tokens via Redis.

---

### 14.4 Audit Log (super admin)
```
GET /api/admin/audit-log
AUTH    : ACCESS_TOKEN + ROLE:SUPER_ADMIN
RATE    : STANDARD
```
**Query Params**: `user_id, action, entity, from_date, to_date, page, limit`

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action": "APPLICATION_STATUS_CHANGED",
      "entity": "APPLICATION",
      "entity_id": "uuid",
      "ip": "103.x.x.x",
      "timestamp": "..."
    }
  ],
  "pagination": { "..." }
}
```

---

## 15. FILE / ASYNC JOB STATUS — `/api/jobs`

> (Not to be confused with job posts — this is background task tracking)

### 15.1 Poll Async Job Status
```
GET /api/async-jobs/:job_id/status
AUTH    : ACCESS_TOKEN
RATE    : RELAXED
```
**Response 200**
```json
{
  "job_id": "uuid",
  "status": "COMPLETED | PROCESSING | FAILED",
  "result": {
    "download_url": "<presigned_s3_url>",
    "expires_in": 3600
  }
}
```

---

## 16. HEALTH & INTERNAL — `/api/health`

---

### 16.1 Health Check (load balancer)
```
GET /api/health
AUTH    : PUBLIC
RATE    : none
```
**Response 200**
```json
{
  "status": "ok",
  "timestamp": "2025-01-10T08:30:00Z",
  "version": "1.4.2"
}
```

### 16.2 Deep Health Check (internal monitoring only)
```
GET /api/health/deep
AUTH    : Internal IP allowlist only
RATE    : none
```
**Response 200**
```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "latency_ms": 8 },
    "redis": { "status": "ok", "latency_ms": 1 },
    "s3": { "status": "ok" },
    "queue": { "status": "ok", "depth": 14 }
  }
}
```

---

## PRODUCTION TECHNIQUES SUMMARY

| Technique | Where Applied |
|---|---|
| Refresh token rotation with family invalidation | Auth routes |
| Argon2id password hashing | Register, Change Password |
| OTP via HMAC TOTP (no DB storage) | Register, Email change |
| httpOnly + Secure + SameSite cookies | All refresh tokens |
| Access token blacklist in Redis | Logout, Deactivate |
| Cursor-based pagination | All list endpoints |
| Pre-signed S3 URLs (1hr expiry) | Resume, Offer downloads |
| Soft deletes everywhere | Resume, Users, Jobs |
| State machine enforcement | Application status transitions |
| Async queues (BullMQ/SQS) | Bulk notifications, Report exports |
| Materialized views for analytics | Drive analytics, Dashboards |
| Redis caching | Skills list, Unread count |
| Idempotency keys (x-request-id) | Apply, Offer issue |
| User enumeration prevention | Forgot password |
| Audit log on every write | Admin routes, Status changes |
| Resume malware scanning | Upload routes |
| Rate limiting per IP + device | Auth routes especially |
| Role-based access control | Every protected route |
| Server-side eligibility validation | Apply to job |
| Polymorphic ref_entity on notifications | Notification table |
