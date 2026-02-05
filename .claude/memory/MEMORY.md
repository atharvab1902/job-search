# Job Search Assistant - Memory

## Email Access Restrictions
**IMPORTANT:** Only access emails from:
- Indeed
- LinkedIn
- Glassdoor

Do NOT read any other emails.

## User Profile
- **Name:** Atharva Betawadkar
- **Email:** atharvab1902@gmail.com
- **Current Role:** Software Developer AI/ML at Profound Logic
- **Current Salary:** $75,000/year
- **Target Salary:** $90,000+
- **Requirement:** H1B sponsorship required

## App Workflow

### When User Asks to "Sync Jobs" or Runs Sync Command:

1. **Search emails** from Indeed, LinkedIn, Glassdoor (last 7 days)
2. **Parse each job alert email** to extract:
   - Job title
   - Company name
   - Location
   - Salary (if available)
   - Job URL
   - Description snippet
3. **Check for duplicates** in `data/db.json` (skip existing jobs)
4. **For each NEW job, generate:**
   - `ai-workspace/output/job_[ID]_resume.md` - Tailored resume
   - `ai-workspace/output/job_[ID]_cover_letter.md` - Cover letter
   - `ai-workspace/output/job_[ID]_linkedin.md` - LinkedIn referral message
   - `ai-workspace/output/job_[ID]_interview.md` - Interview prep
5. **Update database** at `data/db.json`

### Document Generation Guidelines:

**Resume:**
- Match keywords from job description
- Keep to 1 page
- Quantify achievements
- Use `data/profile.md` and `data/resumes/resume_ai.md` as reference

**Cover Letter:**
- 250-350 words
- Opening hook → Why this role → Why this company → Closing
- NO generic phrases like "I am writing to apply"
- Don't mention H1B unless job explicitly says they sponsor

**LinkedIn Message:**
- 150-200 words
- Ask for coffee chat/advice, NOT direct referral
- Human tone, not desperate

**Interview Prep:**
- Technical questions based on job requirements
- Behavioral questions with STAR answers
- Questions to ask them
- Atharva's key talking points

## File Locations
- Database: `data/db.json`
- Profile: `data/profile.md`
- Resumes: `data/resumes/`
- Generated docs: `ai-workspace/output/`
- Instructions: `ai-workspace/instructions/`
