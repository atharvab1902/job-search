# Job Sync Instructions for Claude Code

When the user clicks "Sync Jobs" in the app or asks you to sync jobs, follow these steps:

## Step 1: Scan Emails
Search for job alert emails from Indeed, LinkedIn, and Glassdoor from the last 7 days.
Use Gmail MCP: `mcp__gmail__search_emails` with query "from:indeed OR from:linkedin OR from:glassdoor newer_than:7d"

## Step 2: Parse Each Email
For each email, extract jobs with:
- Job title
- Company name
- Location
- Salary (if available)
- Job URL
- Brief description

## Step 3: Check for Duplicates
Read the database at `data/db.json` and skip jobs that already exist (match by title + company).

## Step 4: For Each NEW Job, Generate:

### A. Tailored Resume (`ai-workspace/output/job_[ID]_resume.md`)
- Match keywords from job description
- Highlight relevant experience
- Keep to 1 page
- Use Atharva's profile from `data/profile.md`

### B. Cover Letter (`ai-workspace/output/job_[ID]_cover_letter.md`)
- 250-350 words
- Opening hook, why this role, why this company, closing
- Professional but personable
- NO generic phrases

### C. LinkedIn Message (`ai-workspace/output/job_[ID]_linkedin.md`)
- 150-200 words
- For requesting referral
- Human tone, not desperate
- Soft ask (coffee chat, not "refer me")

### D. Interview Prep (`ai-workspace/output/job_[ID]_interview.md`)
- Likely technical questions based on job requirements
- Behavioral questions with STAR answers using Atharva's experience
- Questions to ask them
- Key talking points

## Step 5: Update Database
Add new jobs to `data/db.json` with:
- All job details
- Paths to generated documents
- Status: "new"
- Generated_at timestamp

## Step 6: Write Result
Write summary to `ai-workspace/sync-result.json`:
```json
{
  "completed_at": "ISO timestamp",
  "emails_scanned": 5,
  "new_jobs_added": 12,
  "documents_generated": 48,
  "jobs": [{"id": 1, "title": "...", "company": "..."}]
}
```
