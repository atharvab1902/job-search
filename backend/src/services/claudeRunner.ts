import { spawn } from 'child_process';
import path from 'path';

const PROJECT_ROOT = path.join(__dirname, '../../..');

export interface SyncResult {
  success: boolean;
  jobsAdded: number;
  documentsGenerated: number;
  error?: string;
  output?: string;
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
 * Runs a claude -p command by piping prompt through stdin.
 * This avoids Windows command-line length limits and escaping issues.
 */
function runClaude(prompt: string, cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--output-format', 'stream-json', '--verbose'], {
      cwd,
      shell: true,
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';
    let lineBuffer = '';

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      lineBuffer += chunk;

      // Parse complete JSON lines from the stream
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          // Show meaningful events
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
            addLog('Sync complete.');
          }
        } catch {
          // Not JSON, log raw
          if (line.trim()) addLog(line.trim().substring(0, 200));
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err: any = new Error(`claude exited with code ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });

    // Write prompt to stdin and close it
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Runs Claude Code programmatically to sync jobs from email
 * Claude Code uses MCP to access Gmail, parses jobs, generates documents
 */
export async function runJobSync(): Promise<SyncResult> {
  const prompt = `You are in the job-search project directory. Your task:

1. SCAN EMAILS: Use Gmail MCP to search for job alert emails from Indeed, LinkedIn, and Glassdoor from the last 7 days. LIMIT to maxResults: 1 (ONE email only).
   - Query: "from:indeed OR from:linkedin OR from:glassdoor newer_than:7d"
   - Use maxResults: 1 when calling mcp__gmail__search_emails

2. PARSE JOBS: Extract UP TO 5 jobs from each email:
   - Job title, company name, location, salary, job URL, description
   - LIMIT: Only process the first 5 jobs from the email, skip the rest

3. READ DATABASE: Read data/db.json to check existing jobs (avoid duplicates - match by title + company)

4. ADD NEW JOBS: For each NEW job (max 5), add to data/db.json with incremented ID

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
- Use mcp__gmail__search_emails with maxResults: 1 and mcp__gmail__read_email for emails
- Only access emails from Indeed, LinkedIn, Glassdoor (privacy restriction)
- Skip jobs already in database
- NEVER process more than 1 email per sync
- NEVER process more than 5 jobs per email to conserve usage limits`;

  try {
    syncLog.length = 0; // Clear previous logs
    addLog('Starting job sync via Claude Code...');
    const { stdout } = await runClaude(prompt, PROJECT_ROOT, 300000);

    // Parse stream-json output: look for result event or JSON summary in any line
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        // Check result event for final text
        if (event.type === 'result' && event.result) {
          const text = typeof event.result === 'string' ? event.result : JSON.stringify(event.result);
          const jsonMatch = text.match(/\{"success":\s*true.*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              success: true,
              jobsAdded: parsed.jobsAdded || 0,
              documentsGenerated: parsed.documentsGenerated || 0,
              output: stdout
            };
          }
        }
      } catch {}
    }

    // Fallback: search entire output for summary JSON
    const jsonMatch = stdout.match(/\{"success":\s*true.*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        success: true,
        jobsAdded: parsed.jobsAdded || 0,
        documentsGenerated: parsed.documentsGenerated || 0,
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
    console.error('Claude Code execution error:', error.message);
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
  const prompt = `Generate job application materials for:
- Job ID: ${jobId}
- Title: ${jobTitle}
- Company: ${companyName}
- Description: ${description}

Create these files in ai-workspace/output/:
1. job_${jobId}_resume.md - Tailored resume (use data/profile.md and data/resumes/resume_ai.md as reference)
2. job_${jobId}_cover_letter.md - Cover letter (250-350 words, professional but personable)
3. job_${jobId}_linkedin.md - LinkedIn referral message (150-200 words, ask for coffee chat not direct referral)
4. job_${jobId}_interview.md - Interview prep (technical questions, behavioral questions, questions to ask)

Use the Write tool to create each file.`;

  try {
    await runClaude(prompt, PROJECT_ROOT, 120000);
    return true;
  } catch (error: any) {
    console.error(`Error generating documents for job ${jobId}:`, error.message);
    return false;
  }
}
