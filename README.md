# Job Search Assistant

A full-stack app I built to run my own H1B job search: track applications, log H1B sponsorship history per company, and use Claude Code / Gemini CLI to generate tailored resumes and outreach copy for each role — all from one dashboard instead of a spreadsheet.

Built and used daily during an active job search as an international student on F1 OPT targeting H1B sponsorship, so every feature exists because I actually needed it (sponsorship tracking, follow-up reminders, per-JD resume tailoring), not because it looked good on a roadmap.

## What it does

- **Job & company tracker** — log postings, status (new → applied → interview → offer/rejected), fit score, priority, and notes per job.
- **H1B sponsorship lookup** — cross-references companies against historical H1B petition data so I can filter out employers with no sponsorship track record before spending time on an application.
- **Reminders** — follow-up nudges per job so outreach doesn't silently go stale.
- **AI-assisted document generation** — the backend shells out to the `claude` and `gemini` CLIs (using my own authenticated accounts, not API keys) to draft tailored resumes, cover letters, and outreach messages from a job's actual description, then renders them to PDF/DOCX.
- **Email sync** — pulls application-status signals (interview invites, rejections) out of Gmail into the tracker.
- **Auth** — single-user login (JWT + bcrypt), since this is personal-use, not multi-tenant.

## Stack

- **Backend:** Node.js, Express, TypeScript, Prisma ORM + PostgreSQL, JWT auth
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router
- **AI generation:** Claude Code CLI and Gemini CLI, invoked as subprocesses (`services/claudeRunner.ts`, `services/geminiRunner.ts`) — no API keys, uses locally authenticated CLI sessions
- **Docs:** `docx`, `html-pdf-node`, `node-latex`, `mammoth`, `turndown` for generating/parsing resumes and cover letters in multiple formats
- **Infra:** Docker + docker-compose for both services; deployed to a single AWS EC2 free-tier instance (see [AWS_DEPLOY.md](./AWS_DEPLOY.md)); GitHub Actions workflow for deploy

## Architecture

```
job-search/
├── backend/
│   ├── src/
│   │   ├── routes/       # jobs, companies, h1b, reminders, stats, sync, documents, auth, profile, settings
│   │   ├── services/     # claudeRunner, geminiRunner, pdf/docx/latex generators
│   │   ├── middleware/   # JWT auth
│   │   └── db/
│   ├── prisma/           # schema + migrations (Postgres)
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/   # Dashboard, JobList, JobDetail, AddJob, Reminders, Profile, Settings, SyncJobs, Login
│   │   └── lib/api.ts
│   └── Dockerfile
├── ai-workspace/         # prompt instructions the AI runners feed to claude/gemini CLIs
├── docker-compose.yml
└── AWS_DEPLOY.md
```

## Why CLI subprocesses instead of an LLM API

The AI generation features call the `claude` and `gemini` CLIs directly rather than the Anthropic/Google APIs. That means generation runs under my own authenticated CLI session instead of a metered API key — no separate billing to wire up, and it reuses the same tool I already use for everything else in this job search.

## Data model (Prisma)

Per-user: `Job`, `Company` (with H1B sponsor/petition counts), `Application`, `Reminder`, `Resume`, `GeneratedDocument`, `ApplicationQA`, `ResumeSuggestion`, `EmailLog`, plus `UserProfile`/`UserSettings` for the AI-generation context and stored OAuth tokens for the CLI integrations.

## Running it locally

```bash
npm install          # installs root, backend, frontend
npm run dev           # runs backend + frontend concurrently
```

Needs a `backend/.env` with `DATABASE_URL` (Postgres) and a `PORT`; see `backend/.env` variables referenced in `src/index.ts` and `prisma/schema.prisma`. Not included in the repo — copy from your own Postgres instance.

Or via Docker:

```bash
docker-compose up
```

## Status

Personal project, actively used, not intended for other users — no multi-tenant support, and the AI features assume the CLIs are authenticated on the host machine. Shared publicly as a portfolio piece; the tracked job/company/resume data itself stays local and gitignored.
