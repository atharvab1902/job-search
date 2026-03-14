# Setup Guide

This guide will help you set up the Job Search Assistant on your local machine.

## Prerequisites

- Node.js 18+ and npm
- Claude Code CLI (or Gemini CLI)
- Gmail account with MCP access configured

## Initial Setup

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <your-repo-url>
cd job-search

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Your Personal Data

Copy the example files and fill in your information:

```bash
# Create your profile
cp data/profile.example.md data/profile.md
# Edit data/profile.md with your information

# Create your resume(s)
cp data/resumes/resume_example.md data/resumes/resume_ai.md
# Edit data/resumes/resume_ai.md with your information
# Optionally create resume_general.md for a second version

# Create config
cp data/config.example.json data/config.json
# Edit if you want to use gemini instead of claude

# Create database
cp data/db.template.json data/db.json
```

### 3. Configure Gmail MCP

For Claude CLI:
```bash
claude mcp add gmail -- npx @modelcontextprotocol/server-gmail
```

For Gemini CLI:
```bash
gemini mcp add gmail -- npx @gongrzhe/server-gmail-autoauth-mcp
```

### 4. Start the Application

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev
```

The app will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Features

### 1. Email Job Scanning
Click "Sync Jobs" to scan your Gmail for job alerts from Indeed, LinkedIn, and Glassdoor.

### 2. Manual Job Entry
Click "+ Add Job" to manually add jobs.

### 3. Resume Suggestions
For each job, click "Suggest Changes" to get AI-powered resume tailoring suggestions.
- Analyzes both your resume versions
- Recommends which resume to use
- Provides specific edits to match the job description
- Optional: Add additional context (new projects, skills) for more tailored suggestions

### 4. Document Generation
Generate cover letters, LinkedIn messages, and interview prep materials for each job.

### 5. H1B Tracking
Automatically checks H1B sponsorship status for companies (requires H1B data - see below).

## Optional: H1B Data

Download DOL LCA Disclosure Data:
1. Visit https://www.dol.gov/agencies/eta/foreign-labor/performance
2. Download the latest H-1B disclosure data (CSV)
3. Place in `data/h1b_sponsors.csv`

## Privacy & Security

⚠️ **IMPORTANT:** Never commit the following files:
- `data/db.json` - Contains your job applications
- `data/profile.md` - Contains your personal info
- `data/resumes/*.md` - Contains your resume
- `data/config.json` - Your settings
- `ai-workspace/output/*` - Your generated documents

These files are already in `.gitignore` to protect your privacy.

## Troubleshooting

### "Claude Code cannot be launched inside another Claude Code session"
This happens if you run the app from inside a Claude Code session. Run it from a normal terminal instead.

### Resume suggestions not generating
Make sure:
1. You have Claude CLI installed (`claude --version`)
2. `data/config.json` has `"provider": "claude"`
3. Both `data/resumes/resume_ai.md` and `resume_general.md` exist

### Gmail sync not working
1. Check your Gmail MCP is configured: `claude mcp list` (or `gemini mcp list`)
2. Verify you have authenticated with Gmail
3. Check backend logs for errors

## Contributing

Contributions are welcome! Please ensure you don't commit any personal data.

## License

MIT
