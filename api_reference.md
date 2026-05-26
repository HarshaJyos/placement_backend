# Placement Platform — Production API Reference
> 100M-user grade · Express.js REST API Backend · JSON Payloads
> Custom Credentials Example: **Email:** `haneesh0769@gmail.com` | **Password:** `Solvempire@1323`

---

## HEADERS & CONVENTIONS

### Authentication & Identification Headers
All protected endpoints require the following headers:
- `Authorization: Bearer <access_token>`
- `x-request-id: <uuid>` (Idempotency key)
- `x-device-fingerprint: <hash>` (Fraud & replay attack checking)

### Rate Limiting Presets
- **STRICT**: 5 requests per 15 minutes (Auth, OTP, Password operations)
- **STANDARD**: 100 requests per minute (Writes, updates, specific reads)
- **RELAXED**: 1000 requests per minute (Public reads, cached skill/drive lookups)

---

## 1. AUTH ROUTES — `/api/auth`

### 1.1 Register (initiate OTP)
- **Method**: `POST`
- **Path**: `/api/auth/register/initiate`
- **Authorization Bearer**: None (Public)
- **Rate Limit**: STRICT
- **Payload**
```json
{
  "email": "haneesh0769@gmail.com",
  "role": "STUDENT",
  "college_code": "VJIT-2024"
}
```
- **Response 200**
```json
{
  "success": true,
  "message": "OTP sent to email",
  "otp_token": "<signed_jwt_otp_session>",
  "expires_in": 300
}
```

### 1.2 Register (verify OTP + complete)
- **Method**: `POST`
- **Path**: `/api/auth/register/verify`
- **Authorization Bearer**: None (Requires OTP JWT token from 1.1)
- **Rate Limit**: STRICT
- **Payload**
```json
{
  "otp_token": "<jwt_from_initiate>",
  "otp_code": "847291",
  "full_name": "Haneesh Kumar",
  "password": "Solvempire@1323"
}
```
- **Response 201**
```json
{
  "success": true,
  "user": { "id": "uuid", "email": "haneesh0769@gmail.com", "role": "STUDENT" },
  "access_token": "<jwt_15min>",
  "token_type": "Bearer",
  "expires_in": 900
}
```

### 1.3 Login
- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Authorization Bearer**: None (Public)
- **Rate Limit**: STRICT (with lock after 5 failures)
- **Payload**
```json
{
  "email": "haneesh0769@gmail.com",
  "password": "Solvempire@1323",
  "device_fingerprint": "sha256-hash",
  "remember_me": true
}
```
- **Response 200**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "haneesh0769@gmail.com",
    "role": "STUDENT",
    "college_id": "uuid",
    "is_profile_complete": false
  },
  "access_token": "<jwt_15min>",
  "token_type": "Bearer",
  "expires_in": 900
}
```

### 1.4 Refresh Access Token
- **Method**: `POST`
- **Path**: `/api/auth/refresh`
- **Authorization Bearer**: None (Reads `refresh_token` from httpOnly secure cookie)
- **Rate Limit**: STANDARD
- **Payload**: None
- **Response 200**
```json
{
  "access_token": "<new_jwt_15min>",
  "expires_in": 900
}
```

### 1.5 Logout
- **Method**: `POST`
- **Path**: `/api/auth/logout`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "logout_all_devices": false
}
```
- **Response 200**
```json
{
  "success": true,
  "message": "Successfully logged out from all active sessions"
}
```

### 1.6 Forgot Password (initiate)
- **Method**: `POST`
- **Path**: `/api/auth/password/forgot`
- **Authorization Bearer**: None (Public)
- **Rate Limit**: STRICT
- **Payload**
```json
{
  "email": "haneesh0769@gmail.com"
}
```
- **Response 200**
```json
{
  "success": true,
  "message": "If this email exists, a password reset link has been successfully dispatched"
}
```

### 1.7 Reset Password
- **Method**: `POST`
- **Path**: `/api/auth/password/reset`
- **Authorization Bearer**: None (Requires token sent in email)
- **Rate Limit**: STRICT
- **Payload**
```json
{
  "reset_token": "<uuid_from_email>",
  "new_password": "Solvempire@1323"
}
```
- **Response 200**
```json
{
  "success": true,
  "message": "Password reset complete. You may now log in with your new credentials."
}
```

### 1.8 Change Password
- **Method**: `POST`
- **Path**: `/api/auth/password/change`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STRICT
- **Payload**
```json
{
  "current_password": "Solvempire@1323",
  "new_password": "NewSolvempire@1323"
}
```
- **Response 200**
```json
{
  "success": true,
  "message": "Password updated successfully. Please re-authenticate."
}
```

### 1.9 Get Current Session Info
- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Payload**: None
- **Response 200**
```json
{
  "success": true,
  "id": "uuid",
  "email": "haneesh0769@gmail.com",
  "role": "STUDENT",
  "college_id": "uuid",
  "company_id": null,
  "is_profile_complete": false
}
```

### 1.10 List Active Sessions
- **Method**: `GET`
- **Path**: `/api/auth/sessions`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Payload**: None
- **Response 200**
```json
{
  "success": true,
  "sessions": [
    {
      "session_id": "uuid",
      "device": "Chrome on Windows",
      "ip": "103.x.x.x",
      "location": "Hyderabad, IN",
      "last_active": "2026-05-26T10:30:00.000Z",
      "is_current": true
    }
  ]
}
```

### 1.11 Revoke Specific Session
- **Method**: `DELETE`
- **Path**: `/api/auth/sessions/:session_id`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Payload**: None
- **Response 200**
```json
{
  "success": true,
  "message": "Session successfully revoked"
}
```

---

## 2. USER ROUTES — `/api/users`

### 2.1 Get User Profile
- **Method**: `GET`
- **Path**: `/api/users/:user_id/profile`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Payload**: None
- **Response 200**
```json
{
  "success": true,
  "id": "uuid",
  "email": "haneesh0769@gmail.com",
  "role": "STUDENT",
  "created_at": "...",
  "profile": {}
}
```

### 2.2 Update User Email (initiate OTP)
- **Method**: `POST`
- **Path**: `/api/users/email/change/initiate`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STRICT
- **Payload**
```json
{
  "new_email": "haneesh0769@gmail.com"
}
```
- **Response 200**
```json
{
  "success": true,
  "otp_token": "...",
  "expires_in": 300
}
```

### 2.3 Update User Email (confirm OTP)
- **Method**: `POST`
- **Path**: `/api/users/email/change/confirm`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STRICT
- **Payload**
```json
{
  "otp_token": "...",
  "otp_code": "293847"
}
```
- **Response 200**
```json
{
  "success": true,
  "message": "Email address updated successfully"
}
```

### 2.4 Upload Avatar
- **Method**: `POST`
- **Path**: `/api/users/avatar`
- **Authorization Bearer**: **REQUIRED**
- **Content-Type**: `multipart/form-data`
- **Rate Limit**: STANDARD
- **Payload**: `file` (image buffer, max 2MB, jpg/png/webp)
- **Response 200**
```json
{
  "success": true,
  "avatar_url": "https://cdn.placementapp.in/avatars/uuid.webp"
}
```

---

## 3. STUDENT ROUTES — `/api/students`

### 3.1 Complete Student Profile (onboarding)
- **Method**: `PUT`
- **Path**: `/api/students/:student_id/profile`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "full_name": "Haneesh Kumar",
  "roll_number": "20BCS0147",
  "batch_year": 2024,
  "cgpa": 8.4,
  "backlogs": 0,
  "phone": "+919876543210",
  "department_id": "uuid",
  "linkedin_url": "https://linkedin.com/in/haneesh",
  "github_url": "https://github.com/haneesh",
  "portfolio_url": "https://haneesh.dev",
  "bio": "Full stack developer...",
  "current_city": "Hyderabad",
  "skills": [
    { "skill_id": "uuid", "proficiency_level": "ADVANCED" }
  ]
}
```
- **Response 200**
```json
{
  "success": true,
  "message": "Profile configured successfully during onboarding",
  "student": { "id": "uuid", "fullName": "Haneesh Kumar", "...": "..." },
  "is_profile_complete": true,
  "profile_strength": 85
}
```

### 3.2 Get Student Profile (public view)
- **Method**: `GET`
- **Path**: `/api/students/:student_id`
- **Authorization Bearer**: **REQUIRED** (Hiring recruiters or officers only)
- **Rate Limit**: STANDARD
- **Payload**: None
- **Response 200**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "full_name": "Haneesh Kumar",
    "department": "CSE",
    "batch_year": 2024,
    "cgpa": 8.4,
    "backlogs": 0,
    "skills": ["React", "Node.js", "PostgreSQL"],
    "placement_status": "UNPLACED",
    "resume_count": 3,
    "application_count": 7
  }
}
```

### 3.3 List Students
- **Method**: `GET`
- **Path**: `/api/students`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Query Params**: `page`, `limit`, `college_id`, `department_id`, `batch_year`, `min_cgpa`, `max_backlogs`, `placement_status`, `skill_ids`, `search`, `sort_by`
- **Response 200**
```json
{
  "success": true,
  "data": [ { "id": "uuid", "fullName": "Haneesh Kumar", "...": "..." } ],
  "pagination": {
    "cursor": "base64_encoded_cursor",
    "has_next": true,
    "total": 4820
  }
}
```

### 3.4 Get Student Dashboard Stats
- **Method**: `GET`
- **Path**: `/api/students/:student_id/dashboard`
- **Authorization Bearer**: **REQUIRED** (Student own only)
- **Rate Limit**: STANDARD
- **Payload**: None
- **Response 200**
```json
{
  "success": true,
  "data": {
    "applications_total": 12,
    "applications_by_status": {
      "APPLIED": 3,
      "SHORTLISTED": 4,
      "INTERVIEW_SCHEDULED": 2,
      "SELECTED": 1,
      "REJECTED": 2
    },
    "upcoming_interviews": [ { "...": "..." } ],
    "recommended_jobs": [ { "...": "..." } ],
    "profile_completion": 85,
    "placement_status": "PLACED"
  }
}
```

---

## 4. RESUME ROUTES — `/api/resumes`

### 4.1 Upload Resume
- **Method**: `POST`
- **Path**: `/api/resumes`
- **Authorization Bearer**: **REQUIRED** (Student only, max 5 resumes limit)
- **Content-Type**: `multipart/form-data`
- **Rate Limit**: STANDARD
- **Payload**: Form fields:
  - `file` (PDF file, max 5MB)
  - `version_label`: "SDE Resume v2"
  - `is_default`: true
- **Response 201**
```json
{
  "success": true,
  "resume": {
    "id": "uuid",
    "file_url": "https://cdn.placementapp.in/resumes/uuid.pdf",
    "file_name": "Haneesh_Kumar_SDE_v2.pdf",
    "version_label": "SDE Resume v2",
    "is_default": true,
    "created_at": "..."
  }
}
```

### 4.2 List My Resumes
- **Method**: `GET`
- **Path**: `/api/resumes`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Payload**: None
- **Response 200**
```json
{
  "success": true,
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

### 4.3 Set Default Resume
- **Method**: `PATCH`
- **Path**: `/api/resumes/:resume_id/set-default`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Payload**: None
- **Response 200**
```json
{
  "success": true,
  "message": "Default resume successfully updated"
}
```

### 4.4 Delete Resume
- **Method**: `DELETE`
- **Path**: `/api/resumes/:resume_id`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Response 200**
```json
{
  "success": true,
  "message": "Resume deleted successfully"
}
```

### 4.5 Get Resume Download URL
- **Method**: `GET`
- **Path**: `/api/resumes/:resume_id/download`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Response 200**
```json
{
  "success": true,
  "download_url": "https://s3.r2.cloudflarestorage.com/placement/resumes/uuid.pdf?...",
  "expires_in": 3600
}
```

---

## 5. COMPANY ROUTES — `/api/companies`

### 5.1 Register Company
- **Method**: `POST`
- **Path**: `/api/companies`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STRICT
- **Payload**
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
- **Response 201**
```json
{
  "success": true,
  "company": { "id": "uuid", "name": "Infosys Limited", "is_verified": false },
  "message": "Company registered successfully and is pending admin verification."
}
```

### 5.2 Get Company Profile
- **Method**: `GET`
- **Path**: `/api/companies/:company_id`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: RELAXED
- **Payload**: None
- **Response 200**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Infosys",
    "industry": "IT Services",
    "is_verified": true,
    "profile": { "description": "...", "employeeCount": 350000 },
    "active_job_count": 14
  }
}
```

### 5.3 Update Company Profile
- **Method**: `PUT`
- **Path**: `/api/companies/:company_id`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "industry": "IT Services & Consulting",
  "website": "https://infosys.com",
  "hq_location": "Bengaluru, India",
  "description": "Top-tier MNC consulting firm...",
  "employee_count": 360000
}
```
- **Response 200**
```json
{
  "success": true,
  "company": { "...": "..." }
}
```

### 5.4 Upload Company Logo
- **Method**: `POST`
- **Path**: `/api/companies/:company_id/logo`
- **Authorization Bearer**: **REQUIRED**
- **Content-Type**: `multipart/form-data`
- **Rate Limit**: STANDARD
- **Payload**: `file` (image, max 1MB)
- **Response 200**
```json
{
  "success": true,
  "logo_url": "https://cdn.placementapp.in/logos/uuid.webp"
}
```

### 5.5 Verify Company
- **Method**: `PATCH`
- **Path**: `/api/companies/:company_id/verify`
- **Authorization Bearer**: **REQUIRED** (Super/University Admins only)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "is_verified": true,
  "verification_note": "Documents checked."
}
```
- **Response 200**
```json
{
  "success": true,
  "is_verified": true
}
```

### 5.6 List Companies
- **Method**: `GET`
- **Path**: `/api/companies`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: RELAXED
- **Query Params**: `page`, `limit`, `industry`, `is_verified`, `search`
- **Response 200**
```json
{
  "success": true,
  "data": [ { "id": "uuid", "name": "Infosys", "...": "..." } ],
  "pagination": { "cursor": "...", "has_next": false, "total": 1 }
}
```

---

## 6. JOB POST ROUTES — `/api/jobs`

### 6.1 Create Job Post
- **Method**: `POST`
- **Path**: `/api/jobs`
- **Authorization Bearer**: **REQUIRED** (Hiring companies recruiters)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "placement_drive_id": "uuid",
  "title": "Software Engineer",
  "job_type": "FULL_TIME",
  "location": "Hyderabad / Remote",
  "ctc_min": 600000,
  "ctc_max": 900000,
  "description": "We are looking for...",
  "application_deadline": "2025-02-28T00:00:00.000Z",
  "max_applications": 500,
  "eligibility": {
    "min_cgpa": 7.0,
    "max_backlogs": 0,
    "allowed_branches": ["CSE","IT","ECE"],
    "batch_year_from": 2024,
    "batch_year_to": 2025
  },
  "required_skills": [
    { "skill_id": "uuid", "is_mandatory": true }
  ]
}
```
- **Response 201**
```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "title": "Software Engineer",
    "status": "DRAFT",
    "created_at": "..."
  }
}
```

### 6.2 Publish Job Post
- **Method**: `PATCH`
- **Path**: `/api/jobs/:job_id/publish`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Response 200**
```json
{
  "success": true,
  "job_id": "uuid",
  "status": "OPEN",
  "published_at": "..."
}
```

### 6.3 Get Job Post Details
- **Method**: `GET`
- **Path**: `/api/jobs/:job_id`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: RELAXED
- **Response 200**
```json
{
  "success": true,
  "id": "uuid",
  "title": "Software Engineer",
  "company": { "name": "Infosys", "logo_url": "..." },
  "ctc_range": "6 LPA – 9 LPA",
  "description": "...",
  "eligibility": { "minCgpa": 7.0, "maxBacklogs": 0 },
  "status": "OPEN",
  "applicant_count": 234,
  "has_applied": false,
  "is_eligible": true
}
```

### 6.4 List Jobs
- **Method**: `GET`
- **Path**: `/api/jobs`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: RELAXED
- **Query Params**: `page`, `limit`, `status`, `job_type`, `min_ctc`, `company_id`, `drive_id`
- **Response 200**
```json
{
  "success": true,
  "data": [ { "id": "uuid", "title": "Software Engineer", "...": "..." } ],
  "pagination": { "cursor": "...", "has_next": false, "total": 1 }
}
```

### 6.5 Update Job Post
- **Method**: `PUT`
- **Path**: `/api/jobs/:job_id`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "title": "Software Engineer II",
  "location": "Bengaluru Office",
  "max_applications": 600
}
```
- **Response 200**
```json
{
  "success": true,
  "job": { "...": "..." }
}
```

### 6.6 Close Job Post
- **Method**: `PATCH`
- **Path**: `/api/jobs/:job_id/close`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "reason": "Position filled."
}
```
- **Response 200**
```json
{
  "success": true,
  "job_id": "uuid",
  "status": "CLOSED"
}
```

### 6.7 Get Job Applicants
- **Method**: `GET`
- **Path**: `/api/jobs/:job_id/applicants`
- **Authorization Bearer**: **REQUIRED** (Hiring HR or TPOM)
- **Rate Limit**: STANDARD
- **Response 200**
```json
{
  "success": true,
  "job_id": "uuid",
  "total_applicants": 412,
  "data": [
    {
      "application_id": "uuid",
      "student": {
        "id": "uuid",
        "full_name": "Haneesh Kumar",
        "cgpa": 8.4,
        "department": "CSE"
      },
      "current_status": "APPLIED",
      "applied_at": "..."
    }
  ],
  "pagination": { "cursor": "...", "has_next": false, "total": 1 }
}
```

---

## 7. APPLICATION ROUTES — `/api/applications`

### 7.1 Apply to Job
- **Method**: `POST`
- **Path**: `/api/applications`
- **Authorization Bearer**: **REQUIRED** (Student only, limits max 50 active applications)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "job_id": "uuid",
  "resume_id": "uuid",
  "cover_note": "I am excited about this role because..."
}
```
- **Response 201**
```json
{
  "success": true,
  "message": "Job application submitted successfully",
  "application": {
    "id": "uuid",
    "job_id": "uuid",
    "resume_id": "uuid",
    "current_status": "APPLIED",
    "applied_at": "..."
  }
}
```

### 7.2 Withdraw Application
- **Method**: `PATCH`
- **Path**: `/api/applications/:application_id/withdraw`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Response 200**
```json
{
  "success": true,
  "message": "Application withdrawn successfully"
}
```

### 7.3 Get Application Detail
- **Method**: `GET`
- **Path**: `/api/applications/:application_id`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Response 200**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "student": { "full_name": "Haneesh Kumar", "roll_number": "20BCS0147" },
    "job": { "title": "Software Engineer" },
    "resume": { "download_url": "..." },
    "current_status": "SHORTLISTED",
    "status_history": [ { "from": "APPLIED", "to": "SHORTLISTED" } ]
  }
}
```

### 7.4 List My Applications
- **Method**: `GET`
- **Path**: `/api/applications/mine`
- **Authorization Bearer**: **REQUIRED** (Student only)
- **Rate Limit**: STANDARD
- **Response 200**
```json
{
  "success": true,
  "data": [ { "application_id": "uuid", "job_title": "Software Engineer", "current_status": "SHORTLISTED" } ],
  "pagination": { "cursor": "...", "has_next": false, "total": 1 }
}
```

### 7.5 Bulk Update Application Status
- **Method**: `PATCH`
- **Path**: `/api/applications/bulk-status`
- **Authorization Bearer**: **REQUIRED** (Corporate HR or TPOM)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "application_ids": ["uuid1", "uuid2"],
  "new_status": "SHORTLISTED",
  "remarks": "Shortlisted based on aptitude round",
  "notify_students": true
}
```
- **Response 200**
```json
{
  "success": true,
  "updated": 2,
  "failed": 0,
  "notifications_queued": 2
}
```

### 7.6 Update Single Application Status
- **Method**: `PATCH`
- **Path**: `/api/applications/:application_id/status`
- **Authorization Bearer**: **REQUIRED** (Corporate HR or TPOM)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "status": "INTERVIEW_SCHEDULED",
  "remarks": "Round 1 Technical"
}
```
- **Response 200**
```json
{
  "success": true,
  "message": "Application status successfully updated"
}
```

---

## 8. INTERVIEW ROUTES — `/api/interviews`

### 8.1 Schedule Interview Round
- **Method**: `POST`
- **Path**: `/api/interviews`
- **Authorization Bearer**: **REQUIRED** (Corporate HR or TPOM)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "application_id": "uuid",
  "round_number": 1,
  "round_type": "TECHNICAL",
  "scheduled_at": "2025-02-10T10:00:00.000Z",
  "venue_or_link": "https://meet.google.com/xyz-abc",
  "notes": "Prepare DSA + System Design"
}
```
- **Response 201**
```json
{
  "success": true,
  "round": {
    "id": "uuid",
    "round_number": 1,
    "round_type": "TECHNICAL",
    "scheduled_at": "...",
    "status": "SCHEDULED"
  }
}
```

### 8.2 Reschedule Interview
- **Method**: `PATCH`
- **Path**: `/api/interviews/:round_id/reschedule`
- **Authorization Bearer**: **REQUIRED** (Corporate HR or TPOM)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "new_scheduled_at": "2025-02-12T14:00:00.000Z",
  "reason": "Interviewer unavailable on original date"
}
```
- **Response 200**
```json
{
  "success": true,
  "round_id": "uuid",
  "status": "RESCHEDULED",
  "new_scheduled_at": "..."
}
```

### 8.3 Submit Interview Feedback
- **Method**: `POST`
- **Path**: `/api/interviews/:round_id/feedback`
- **Authorization Bearer**: **REQUIRED** (Corporate Interviewers only)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "rating": 4,
  "remarks": "Strong DSA skills, average communication",
  "decision": "PASS"
}
```
- **Response 201**
```json
{
  "success": true,
  "feedback_id": "uuid",
  "decision": "PASS"
}
```

### 8.4 Get Upcoming Interviews
- **Method**: `GET`
- **Path**: `/api/interviews/upcoming`
- **Authorization Bearer**: **REQUIRED** (Student only)
- **Rate Limit**: STANDARD
- **Payload**: None
- **Response 200**
```json
{
  "success": true,
  "interviews": [
    {
      "round_id": "uuid",
      "job_title": "Software Engineer",
      "company_name": "Infosys",
      "round_type": "TECHNICAL",
      "scheduled_at": "2025-02-10T10:00:00.000Z",
      "venue_or_link": "https://meet.google.com/...",
      "minutes_until": 4320
    }
  ]
}
```

---

## 9. OFFER LETTER ROUTES — `/api/offers`

### 9.1 Issue Offer Letter
- **Method**: `POST`
- **Path**: `/api/offers`
- **Authorization Bearer**: **REQUIRED** (Corporate HR only)
- **Content-Type**: `multipart/form-data`
- **Rate Limit**: STANDARD
- **Payload**: Form fields:
  - `file` (PDF file offer letter, max 5MB)
  - `application_id`: "uuid"
  - `designation`: "Software Engineer"
  - `ctc`: 750000
  - `joining_date`: "2025-07-01T00:00:00.000Z"
- **Response 201**
```json
{
  "success": true,
  "offer": {
    "id": "uuid",
    "application_id": "uuid",
    "designation": "Software Engineer",
    "ctc": 750000,
    "joining_date": "2025-07-01T00:00:00.000Z",
    "is_accepted": null
  }
}
```

### 9.2 Respond to Offer
- **Method**: `PATCH`
- **Path**: `/api/offers/:offer_id/respond`
- **Authorization Bearer**: **REQUIRED** (Student own only)
- **Rate Limit**: STRICT
- **Payload**
```json
{
  "accept": true
}
```
- **Response 200**
```json
{
  "success": true,
  "offer_id": "uuid",
  "is_accepted": true,
  "message": "Offer accepted. Congratulations!",
  "student_placement_status": "PLACED"
}
```

### 9.3 Download Offer Letter
- **Method**: `GET`
- **Path**: `/api/offers/:offer_id/download`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Response 200**
```json
{
  "success": true,
  "download_url": "https://s3.r2.cloudflarestorage.com/placement/offers/uuid.pdf?...",
  "expires_in": 3600
}
```

---

## 10. PLACEMENT DRIVE ROUTES — `/api/drives`

### 10.1 Create Placement Drive
- **Method**: `POST`
- **Path**: `/api/drives`
- **Authorization Bearer**: **REQUIRED** (Placement Officer or College Admin)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "college_id": "uuid",
  "title": "Campus Placement Drive 2025",
  "start_date": "2025-01-15T00:00:00.000Z",
  "end_date": "2025-04-30T00:00:00.000Z",
  "description": "Annual campus placement for batch 2025"
}
```
- **Response 201**
```json
{
  "success": true,
  "drive": { "id": "uuid", "title": "Campus Placement Drive 2025", "status": "DRAFT" }
}
```

### 10.2 Activate Drive
- **Method**: `PATCH`
- **Path**: `/api/drives/:drive_id/activate`
- **Authorization Bearer**: **REQUIRED** (Placement Officer or College Admin)
- **Rate Limit**: STANDARD
- **Response 200**
```json
{
  "success": true,
  "drive_id": "uuid",
  "status": "ACTIVE"
}
```

### 10.3 Invite Company to Drive
- **Method**: `POST`
- **Path**: `/api/drives/:drive_id/invite`
- **Authorization Bearer**: **REQUIRED** (Placement Officer or College Admin)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "company_id": "uuid",
  "message": "We invite Infosys to participate in our 2025 campus drive.",
  "proposed_date_range": "2025-02-01 to 2025-02-28"
}
```
- **Response 200**
```json
{
  "success": true,
  "invitation_sent": true
}
```

### 10.4 Get Drive Analytics
- **Method**: `GET`
- **Path**: `/api/drives/:drive_id/analytics`
- **Authorization Bearer**: **REQUIRED** (Placement Officer or College/University Admin)
- **Rate Limit**: STANDARD
- **Response 200**
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
  "by_department": [ { "department": "CSE", "placed": 140, "total": 200, "rate": 70.0 } ],
  "by_company": [ { "company": "Infosys", "offers_made": 60, "accepted": 55 } ]
}
```

### 10.5 List Drives
- **Method**: `GET`
- **Path**: `/api/drives`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: RELAXED
- **Query Params**: `college_id`, `status`, `page`, `limit`
- **Response 200**
```json
{
  "success": true,
  "data": [ { "id": "uuid", "title": "Campus Placement Drive 2025" } ],
  "pagination": { "cursor": "...", "has_next": false, "total": 1 }
}
```

---

## 11. COLLEGE ROUTES — `/api/colleges`

### 11.1 Register College
- **Method**: `POST`
- **Path**: `/api/colleges`
- **Authorization Bearer**: **REQUIRED** (University/Super Admins only)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "university_id": "uuid",
  "name": "Vardhaman College of Engineering",
  "code": "VJIT-2024",
  "address": "Kacharam, Shamshabad, Hyderabad",
  "tpo_email": "tpo@vjit.ac.in"
}
```
- **Response 201**
```json
{
  "success": true,
  "college": { "id": "uuid", "code": "VJIT-2024", "is_active": true }
}
```

### 11.2 Get College Dashboard
- **Method**: `GET`
- **Path**: `/api/colleges/:college_id/dashboard`
- **Authorization Bearer**: **REQUIRED** (Placement Officer or College Admin)
- **Rate Limit**: STANDARD
- **Response 200**
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

### 11.3 Add Department
- **Method**: `POST`
- **Path**: `/api/colleges/:college_id/departments`
- **Authorization Bearer**: **REQUIRED** (College Admin only)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "name": "Computer Science & Engineering",
  "code": "CSE",
  "seat_count": 240
}
```
- **Response 201**
```json
{
  "success": true,
  "department": { "id": "uuid", "name": "CSE", "seat_count": 240 }
}
```

### 11.4 List College Students
- **Method**: `GET`
- **Path**: `/api/colleges/:college_id/students`
- **Authorization Bearer**: **REQUIRED** (Placement Officer or College Admin)
- **Rate Limit**: STANDARD
- **Query Params**: Same as `/api/students` (scoped to college)
- **Response 200**
```json
{
  "success": true,
  "data": [ { "id": "uuid", "fullName": "Haneesh Kumar", "...": "..." } ],
  "pagination": { "cursor": "...", "has_next": false, "total": 1 }
}
```

### 11.5 Export Placement Report
- **Method**: `GET`
- **Path**: `/api/colleges/:college_id/reports/placement`
- **Authorization Bearer**: **REQUIRED** (Placement Officer or College Admin)
- **Rate Limit**: STRICT (1 request/minute enforced logically)
- **Query Params**: `drive_id`, `batch_year`, `format=csv|xlsx`
- **Response 200**
```json
{
  "job_id": "uuid",
  "status": "PROCESSING",
  "estimated_seconds": 30,
  "poll_url": "/api/async-jobs/uuid/status"
}
```

---

## 12. SKILL ROUTES — `/api/skills`

### 12.1 List All Skills
- **Method**: `GET`
- **Path**: `/api/skills`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: RELAXED (cached in Redis for 1hr)
- **Query Params**: `category`, `search`, `limit`, `cursor`
- **Response 200**
```json
{
  "success": true,
  "data": [ { "id": "uuid", "name": "React.js", "category": "Frontend" } ],
  "pagination": { "cursor": "...", "has_next": false, "total": 1 }
}
```

### 12.2 Create Skill
- **Method**: `POST`
- **Path**: `/api/skills`
- **Authorization Bearer**: **REQUIRED** (Super or University Admin only)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "name": "Next.js",
  "category": "Frontend"
}
```
- **Response 201**
```json
{
  "success": true,
  "skill": { "id": "uuid", "name": "Next.js", "category": "Frontend" }
}
```

---

## 13. NOTIFICATION ROUTES — `/api/notifications`

### 13.1 Get My Notifications
- **Method**: `GET`
- **Path**: `/api/notifications`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Query Params**: `is_read`, `limit`, `cursor`
- **Response 200**
```json
{
  "success": true,
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
  "pagination": { "cursor": "...", "has_next": false, "total": 1 }
}
```

### 13.2 Mark Notification as Read
- **Method**: `PATCH`
- **Path**: `/api/notifications/:notification_id/read`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Response 200**
```json
{
  "success": true
}
```

### 13.3 Mark All as Read
- **Method**: `PATCH`
- **Path**: `/api/notifications/read-all`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: STANDARD
- **Response 200**
```json
{
  "success": true,
  "updated_count": 5
}
```

### 13.4 Get Unread Count for Badge
- **Method**: `GET`
- **Path**: `/api/notifications/unread-count`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: RELAXED (speed optimized via Redis cached counter)
- **Response 200**
```json
{
  "unread_count": 3
}
```

---

## 14. ADMIN ROUTES — `/api/admin`

### 14.1 Platform Stats
- **Method**: `GET`
- **Path**: `/api/admin/stats`
- **Authorization Bearer**: **REQUIRED** (Super Admin only)
- **Rate Limit**: STANDARD
- **Response 200**
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

### 14.2 List All Users
- **Method**: `GET`
- **Path**: `/api/admin/users`
- **Authorization Bearer**: **REQUIRED** (Super Admin only)
- **Rate Limit**: STANDARD
- **Query Params**: `role`, `is_active`, `search`, `limit`, `cursor`
- **Response 200**
```json
{
  "success": true,
  "data": [ { "id": "uuid", "email": "haneesh0769@gmail.com", "role": "STUDENT", "isActive": true } ],
  "pagination": { "cursor": "...", "has_next": false, "total": 1 }
}
```

### 14.3 Deactivate User
- **Method**: `PATCH`
- **Path**: `/api/admin/users/:user_id/deactivate`
- **Authorization Bearer**: **REQUIRED** (Super Admin only)
- **Rate Limit**: STANDARD
- **Payload**
```json
{
  "reason": "Violation of platform terms."
}
```
- **Response 200**
```json
{
  "success": true,
  "user_id": "uuid",
  "is_active": false
}
```

### 14.4 Audit Logs query
- **Method**: `GET`
- **Path**: `/api/admin/audit-log`
- **Authorization Bearer**: **REQUIRED** (Super Admin only)
- **Rate Limit**: STANDARD
- **Query Params**: `user_id`, `action`, `entity`, `from_date`, `to_date`, `limit`, `cursor`
- **Response 200**
```json
{
  "success": true,
  "data": [ { "id": "uuid", "user_id": "uuid", "action": "APPLICATION_STATUS_CHANGED", "ip": "103.x.x.x" } ],
  "pagination": { "cursor": "...", "has_next": false, "total": 1 }
}
```

---

## 15. FILE / ASYNC JOB STATUS — `/api/async-jobs`

### 15.1 Poll Async Job Status
- **Method**: `GET`
- **Path**: `/api/async-jobs/:job_id/status`
- **Authorization Bearer**: **REQUIRED**
- **Rate Limit**: RELAXED (Checks BullMQ job completion states)
- **Response 200**
```json
{
  "job_id": "uuid",
  "status": "COMPLETED",
  "result": {
    "download_url": "https://s3.r2.cloudflarestorage.com/placement/reports/uuid.csv?...",
    "expires_in": 3600
  }
}
```

---

## 16. HEALTH & INTERNAL — `/api/health`

### 16.1 Health Check (load balancer)
- **Method**: `GET`
- **Path**: `/api/health`
- **Authorization Bearer**: None (Public)
- **Rate Limit**: None
- **Response 200**
```json
{
  "status": "ok",
  "timestamp": "2026-05-26T10:30:00.000Z",
  "version": "1.4.2"
}
```

### 16.2 Deep Health Check (internal monitoring only)
- **Method**: `GET`
- **Path**: `/api/health/deep`
- **Authorization Bearer**: None (**IP Allowlist Protected**; only allows localhost / private RFC1918 subnets)
- **Rate Limit**: None
- **Response 200**
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
