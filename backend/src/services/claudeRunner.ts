import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

const PROJECT_ROOT = path.join(__dirname, '../../..');

export interface SyncResult {
  success: boolean;
  jobsAdded: number;
  documentsGenerated: number;
  error?: string;
  output?: string;
}

/**
 * Runs Claude Code programmatically to sync jobs from email
 * Claude Code uses MCP to access Gmail, parses jobs, generates documents
 */
export async function runJobSync(): Promise<SyncResult> {
  const prompt = `
You are in the job-search project directory. Your task:

1. SCAN EMAILS: Use Gmail MCP to search for job alert emails from Indeed, LinkedIn, and Glassdoor from the last 7 days.
   - Query: "from:indeed OR from:linkedin OR from:glassdoor newer_than:7d"

2. PARSE JOBS: Extract from each email:
   - Job title, company name, location, salary, job URL, description

3. READ DATABASE: Read data/db.json to check existing jobs (avoid duplicates - match by title + company)

4. ADD NEW JOBS: For each NEW job, add to data/db.json with incremented ID

5. GENERATE DOCUMENTS: For each new job, create these files in ai-workspace/output/:
   - job_[ID]_resume.md - Tailored resume using data/profile.md and data/resumes/resume_ai.md
   - job_[ID]_cover_letter.md - 250-350 word cover letter
   - job_[ID]_linkedin.md - 150-200 word referral request message
   - job_[ID]_interview.md - Interview prep with questions and answers

6. SAVE DATABASE: Write updated data/db.json

7. OUTPUT SUMMARY: At the end, output a JSON summary:
   {"success": true, "jobsAdded": X, "documentsGenerated": Y}

IMPORTANT:
- Use the Read tool to read files
- Use the Write tool to write files
- Use mcp__gmail__search_emails and mcp__gmail__read_email for emails
- Only access emails from Indeed, LinkedIn, Glassdoor (privacy restriction)
- Skip jobs already in database
`.trim();

  try {
    // Run Claude Code with --print flag for non-interactive mode
    const { stdout, stderr } = await execAsync(
      `claude -p "${prompt.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      {
        cwd: PROJECT_ROOT,
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }
    );

    // Try to parse the JSON summary from output
    const jsonMatch = stdout.match(/\{"success":\s*true.*?\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        success: true,
        jobsAdded: result.jobsAdded || 0,
        documentsGenerated: result.documentsGenerated || 0,
        output: stdout
      };
    }

    // If no JSON found, still consider it success if no error
    return {
      success: true,
      jobsAdded: 0,
      documentsGenerated: 0,
      output: stdout
    };

  } catch (error: any) {
    console.error('Claude Code execution error:', error);
    return {
      success: false,
      jobsAdded: 0,
      documentsGenerated: 0,
      error: error.message || 'Unknown error',
      output: error.stdout || error.stderr
    };
  }
}

/**
 * Generate documents for a specific job
 */
export async function generateDocumentsForJob(jobId: number, jobTitle: string, companyName: string, description: string): Promise<boolean> {
  const prompt = `
Generate job application materials for:
- Job ID: ${jobId}
- Title: ${jobTitle}
- Company: ${companyName}
- Description: ${description}

Create these files in ai-workspace/output/:
1. job_${jobId}_resume.md - Tailored resume (use data/profile.md and data/resumes/resume_ai.md as reference)
2. job_${jobId}_cover_letter.md - Cover letter (250-350 words, professional but personable)
3. job_${jobId}_linkedin.md - LinkedIn referral message (150-200 words, ask for coffee chat not direct referral)
4. job_${jobId}_interview.md - Interview prep (technical questions, behavioral questions, questions to ask)

Use the Write tool to create each file.
`.trim();

  try {
    await execAsync(
      `claude -p "${prompt.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      {
        cwd: PROJECT_ROOT,
        timeout: 120000, // 2 minute timeout per job
      }
    );
    return true;
  } catch (error) {
    console.error(`Error generating documents for job ${jobId}:`, error);
    return false;
  }
}
