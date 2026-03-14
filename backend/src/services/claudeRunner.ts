import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const PROJECT_ROOT = path.join(__dirname, '../../..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'data', 'config.json');

export type Provider = 'claude' | 'gemini';

export interface ProviderConfig {
  provider: Provider;
  model?: string; // Optional model override
}

export interface SyncResult {
  success: boolean;
  jobsAdded: number;
  documentsGenerated: number;
  error?: string;
  output?: string;
}

export interface DocGenResult {
  success: boolean;
  type: string;
  error?: string;
}

// Live progress log - accessible from sync route
export const syncLog: string[] = [];

function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${message}`;
  syncLog.push(entry);
  console.log(entry);
  // Keep only last 50 lines
  if (syncLog.length > 50) syncLog.shift();
}

/**
 * Get current provider configuration
 */
export function getConfig(): ProviderConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      return {
        provider: config.provider || 'claude',
        model: config.model
      };
    }
  } catch (error) {
    console.error('Error reading config:', error);
  }
  return { provider: 'claude', model: 'sonnet' };
}

/**
 * Save provider configuration
 */
export function saveConfig(config: ProviderConfig): void {
  try {
    const existing = fs.existsSync(CONFIG_PATH)
      ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      : {};
    const updated = { ...existing, ...config };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

/**
 * Runs Claude CLI with the given prompt
 */
export function runClaude(prompt: string, cwd: string, timeoutMs: number, model?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'stream-json', '--verbose'];

    // Use Sonnet by default (much cheaper than Opus)
    args.push('--model', model || 'sonnet');
    args.push('--dangerously-skip-permissions');

    // Remove CLAUDECODE env var to prevent nested session conflicts
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const child = spawn('claude', args, {
      cwd,
      shell: true,
      timeout: timeoutMs,
      env,
    });

    let stdout = '';
    let stderr = '';
    let lineBuffer = '';

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      lineBuffer += chunk;

      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text' && block.text) {
                const text = block.text.trim();
                if (text) addLog(text.substring(0, 200));
              }
              if (block.type === 'tool_use') {
                addLog(`Using tool: ${block.name}`);
              }
            }
          }
          if (event.type === 'tool_use') {
            addLog(`Calling: ${event.name || event.tool || 'tool'}`);
          }
          if (event.type === 'result') {
            addLog('Complete.');
          }
        } catch {
          if (line.trim()) addLog(line.trim().substring(0, 200));
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        // Log the actual error from stderr
        console.error('Claude stderr:', stderr);
        console.error('Claude stdout:', stdout);
        const err: any = new Error(`claude exited with code ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Runs Gemini CLI with the given prompt
 * Gemini CLI supports MCP! Configure Gmail MCP with: gemini mcp add gmail -- npx @gongrzhe/server-gmail-autoauth-mcp
 */
function runGemini(prompt: string, cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Don't specify model - let Gemini CLI use default (auto-gemini-2.5)
    // Manually specifying model names causes 404 errors
    const child = spawn('gemini', ['-p', '.', '--output-format', 'stream-json', '-y'], {
      cwd,
      shell: true,
      timeout: timeoutMs,
      env: { ...process.env },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let lineBuffer = '';

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      lineBuffer += chunk;

      // Parse stream-json output similar to Claude
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text' && block.text) {
                const text = block.text.trim();
                if (text) addLog(text.substring(0, 200));
              }
            }
          }
          if (event.type === 'result') {
            addLog('Complete.');
          }
        } catch {
          // Not JSON, log raw (Gemini may output plain text)
          if (line.trim()) addLog(line.trim().substring(0, 200));
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        // Log the actual error from stderr
        console.error('Gemini stderr:', stderr);
        console.error('Gemini stdout:', stdout);
        const err: any = new Error(`gemini exited with code ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });

    // Write prompt via stdin
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Run a prompt with the configured provider
 */
async function runWithProvider(prompt: string, cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  const config = getConfig();

  if (config.provider === 'gemini') {
    addLog('Using Gemini CLI...');
    return runGemini(prompt, cwd, timeoutMs);
  } else {
    addLog(`Using Claude CLI (${config.model || 'sonnet'})...`);
    return runClaude(prompt, cwd, timeoutMs, config.model);
  }
}

/**
 * Runs job sync - ONLY parses emails and adds jobs to DB
 * Documents are generated on-demand to save tokens
 */
export async function runJobSync(): Promise<SyncResult> {
  const prompt = `You are in the job-search project directory. Your task is to ONLY scan emails and add jobs to the database. DO NOT generate any documents.

## STEP 1: Scan Emails
Use Gmail MCP to search for job alert emails:
- Query: "from:indeed OR from:linkedin OR from:glassdoor newer_than:7d"
- Use maxResults: 1 (ONE email only)
- Tool: mcp__gmail__search_emails

## STEP 2: Read Email
Read the email content using mcp__gmail__read_email

## STEP 3: Parse Jobs
Extract ONLY 1 job from the email (first/best match):
- Job title
- Company name
- Location
- Salary (if available)
- Job URL
- Brief description

## STEP 4: Check Database
Read data/db.json to check for duplicates (match by title + company)

## STEP 5: Add Job to Database
If the job is NEW, add it to data/db.json using Edit tool with this EXACT structure (all fields required):

{
  "id": <increment counters.jobs + 1>,
  "company_id": null,
  "title": "Job Title Here",
  "company_name": "Company Name Here",
  "location": "Location Here",
  "salary_min": null,
  "salary_max": null,
  "salary_type": null,
  "remote_type": null,
  "source": "indeed",
  "source_url": "https://www.indeed.com/...",
  "email_id": null,
  "description": "Job description snippet",
  "requirements": null,
  "status": "new",
  "priority": 0,
  "fit_score": null,
  "notes": null,
  "created_at": "2026-02-06T...",
  "updated_at": "2026-02-06T...",
  "h1b_sponsor": null,
  "h1b_petitions": 0
}

CRITICAL REQUIREMENTS:
- Use Edit tool to add to jobs array (NOT Write)
- Increment counters.jobs by 1
- Keep source_url as the EXACT URL from email (do not modify)
- Escape all special characters in JSON strings
- Use company_name not company
- Use source_url not url

## STEP 6: Output Summary
After successfully adding the job, output EXACTLY this JSON on a single line:
{"success": true, "jobsAdded": 1, "documentsGenerated": 0}

IMPORTANT RULES:
- DO NOT generate any documents (resume, cover letter, etc.)
- Documents will be generated on-demand when user requests them
- Only process 1 email with 1 job
- ALWAYS use Edit tool to modify db.json, NEVER use Write
- The JSON summary MUST be on its own line at the end
- If no new jobs were added, output: {"success": true, "jobsAdded": 0, "documentsGenerated": 0}`;

  try {
    syncLog.length = 0;
    addLog('Starting job sync (lightweight mode)...');
    const { stdout } = await runWithProvider(prompt, PROJECT_ROOT, 180000);

    // Parse result
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === 'result' && event.result) {
          const text = typeof event.result === 'string' ? event.result : JSON.stringify(event.result);
          const jsonMatch = text.match(/\{"success":\s*true.*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              success: true,
              jobsAdded: parsed.jobsAdded || 0,
              documentsGenerated: 0,
              output: stdout
            };
          }
        }
      } catch {}
    }

    const jsonMatch = stdout.match(/\{"success":\s*true.*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        success: true,
        jobsAdded: parsed.jobsAdded || 0,
        documentsGenerated: 0,
        output: stdout
      };
    }

    return {
      success: true,
      jobsAdded: 0,
      documentsGenerated: 0,
      output: stdout
    };

  } catch (error: any) {
    console.error('Sync error:', error.message);
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
 * Generate a SINGLE document for a job (on-demand)
 * This is much more token-efficient than generating all 4 at once
 */
export async function generateDocument(
  jobId: number,
  docType: 'resume' | 'cover_letter' | 'linkedin' | 'interview',
  jobTitle: string,
  companyName: string,
  description: string,
  location?: string,
  salary?: string
): Promise<DocGenResult> {
  const outputPath = path.join(PROJECT_ROOT, 'ai-workspace', 'output', `job_${jobId}_${docType}.tex`);

  const prompts: Record<string, string> = {
    resume: `Edit data/resumes/resume_ai.tex to tailor it for this job:

Job: ${jobTitle} at ${companyName}
Description: ${description}

Edit the content to match this job. Keep the structure.
Write to: ai-workspace/output/job_${jobId}_resume.tex

Output: {"success": true}`,

    cover_letter: `Generate a COVER LETTER for this job. Read data/profile.md for reference.

Job: ${jobTitle} at ${companyName}
Location: ${location || 'Not specified'}
Description: ${description}

Create a 250-350 word cover letter that:
- Has a compelling opening hook
- Explains why this role specifically
- Shows knowledge of the company
- Has a confident closing
- NO generic phrases

Write to: ai-workspace/output/job_${jobId}_cover_letter.md

After writing, output: {"success": true, "type": "cover_letter"}`,

    linkedin: `Generate a LINKEDIN MESSAGE for requesting a referral. Read data/profile.md for reference.

Job: ${jobTitle} at ${companyName}
Description: ${description}

Create a 150-200 word message that:
- Is personalized and human
- Asks for a coffee chat, NOT a direct referral
- Mentions specific interest in the company
- Is professional but warm
- NOT desperate or pushy

Write to: ai-workspace/output/job_${jobId}_linkedin.md

After writing, output: {"success": true, "type": "linkedin"}`,

    interview: `Generate INTERVIEW PREP for this job. Read data/profile.md for reference.

Job: ${jobTitle} at ${companyName}
Description: ${description}

Create comprehensive interview prep including:
1. 5 likely technical questions with answers
2. 5 behavioral questions with STAR-format answers using candidate's experience
3. 5 questions to ask the interviewer
4. Key talking points and unique value propositions

Write to: ai-workspace/output/job_${jobId}_interview.md

After writing, output: {"success": true, "type": "interview"}`
  };

  const prompt = prompts[docType];
  if (!prompt) {
    return { success: false, type: docType, error: 'Invalid document type' };
  }

  try {
    syncLog.length = 0;
    addLog(`Generating ${docType} for job ${jobId}...`);

    const { stdout } = await runWithProvider(prompt, PROJECT_ROOT, 120000);

    // Check if file was created
    if (fs.existsSync(outputPath)) {
      addLog(`${docType} generated successfully!`);
      return { success: true, type: docType };
    }

    // Check for success in output
    if (stdout.includes('"success": true') || stdout.includes('"success":true')) {
      return { success: true, type: docType };
    }

    return { success: false, type: docType, error: 'Document may not have been created' };

  } catch (error: any) {
    console.error(`Error generating ${docType}:`, error.message);
    return {
      success: false,
      type: docType,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Generate ALL documents for a job (legacy function, still available)
 */
export async function generateDocumentsForJob(
  jobId: number,
  jobTitle: string,
  companyName: string,
  description: string
): Promise<boolean> {
  const results = await Promise.all([
    generateDocument(jobId, 'resume', jobTitle, companyName, description),
    generateDocument(jobId, 'cover_letter', jobTitle, companyName, description),
    generateDocument(jobId, 'linkedin', jobTitle, companyName, description),
    generateDocument(jobId, 'interview', jobTitle, companyName, description),
  ]);

  return results.every(r => r.success);
}
