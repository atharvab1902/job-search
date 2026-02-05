# Job Search Assistant

AI-powered job search tracker with H1B sponsorship filtering.

## Quick Start

```bash
# Terminal 1 - Start backend
cd backend
npm run dev

# Terminal 2 - Start frontend
cd frontend
npm run dev
```

Then open http://localhost:3000

## Features

- **Job Tracking**: Add jobs manually or from email alerts
- **H1B Filtering**: Filter for H1B sponsoring companies
- **Status Workflow**: New → Interested → Applied → Interviewing → Offer
- **Reminders**: Auto-creates follow-up reminders when you apply
- **AI Generation**: Use Claude Code to generate tailored resumes, cover letters, LinkedIn messages

## Using AI Features

When viewing a job, click the "Copy Command" button and paste it in your terminal with Claude Code running:

```bash
# Tailor resume
claude "Read job description and tailor my resume from data/resumes/resume_ai.md..."

# Generate cover letter
claude "Write a cover letter for [Job Title] at [Company]..."

# LinkedIn message
claude "Write LinkedIn outreach message for referral..."
```

## File Structure

```
job-search/
├── backend/           # Express API server
├── frontend/          # React dashboard
├── data/
│   ├── db.json        # Database (auto-created)
│   ├── resumes/       # Your resume files (markdown)
│   └── profile.md     # Your profile for AI
└── ai-workspace/
    ├── instructions/  # Prompts for Claude Code
    └── output/        # Generated content
```

## Adding Jobs from Email

1. Run Claude Code in this directory
2. Ask: "Scan my Indeed/LinkedIn emails for new job postings"
3. I'll parse the emails and add jobs to the database

## Checking H1B Status

Click "Check H1B Status" on any job to verify if the company sponsors.
Note: H1B data needs to be loaded separately for full functionality.
