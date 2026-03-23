import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const PROJECT_ROOT = path.join(__dirname, '../../..');

export type Provider = 'claude' | 'gemini';

export interface ProviderConfig {
  provider: Provider;
  model?: string;
  // OAuth tokens for Claude (replaces credential file mounting)
  claudeAccessToken?: string;
  claudeRefreshToken?: string;
  claudeTokenExpiry?: bigint | null;
  // API key for Gemini (legacy)
  geminiApiKey?: string;
  // OAuth tokens for Gemini
  geminiAccessToken?: string;
  geminiRefreshToken?: string;
  geminiTokenExpiry?: bigint | null;
}

/**
 * Writes Claude OAuth credentials to a per-user temp directory.
 * Returns the HOME path to use when spawning claude CLI.
 */
export function writeClaudeCredentialsForUser(userId: number, config: Pick<ProviderConfig, 'claudeAccessToken' | 'claudeRefreshToken' | 'claudeTokenExpiry'>): string {
  return writeClaudeCredentials(userId, config as ProviderConfig);
}

function writeClaudeCredentials(userId: number, config: ProviderConfig): string {
  const homeDir = path.join(os.tmpdir(), `claude-home-${userId}`);
  const claudeDir = path.join(homeDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const credentials = {
    claudeAiOauth: {
      accessToken: config.claudeAccessToken,
      refreshToken: config.claudeRefreshToken,
      expiresAt: config.claudeTokenExpiry ? Number(config.claudeTokenExpiry) : undefined,
      scopes: ['org:create_api_key', 'user:profile', 'user:inference', 'user:sessions:claude_code'],
    }
  };
  fs.writeFileSync(path.join(claudeDir, '.credentials.json'), JSON.stringify(credentials, null, 2));
  return homeDir;
}

/**
 * Writes Gemini OAuth credentials to a per-user temp directory.
 * Returns the HOME path to use when spawning gemini CLI.
 */
function writeGeminiCredentials(userId: number, config: ProviderConfig): string {
  const homeDir = path.join(os.tmpdir(), `gemini-home-${userId}`);
  const geminiDir = path.join(homeDir, '.gemini');
  fs.mkdirSync(geminiDir, { recursive: true });

  const credentials = {
    access_token: config.geminiAccessToken,
    refresh_token: config.geminiRefreshToken || null,
    token_type: 'Bearer',
    expiry_date: config.geminiTokenExpiry ? Number(config.geminiTokenExpiry) : undefined,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
  };
  fs.writeFileSync(path.join(geminiDir, 'oauth_creds.json'), JSON.stringify(credentials, null, 2), { mode: 0o600 });

  const settings = { security: { auth: { selectedType: 'oauth-personal' } } };
  fs.writeFileSync(path.join(geminiDir, 'settings.json'), JSON.stringify(settings, null, 2));

  return homeDir;
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
  content?: string;
  error?: string;
}

export interface ExtractedJob {
  title: string;
  company_name: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_type: string | null;
  remote_type: string | null;
  source: string;
  source_url: string | null;
  description: string | null;
  email_id: string | null;
}

// Live progress log
export const syncLog: string[] = [];

function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${message}`;
  syncLog.push(entry);
  console.log(entry);
  if (syncLog.length > 50) syncLog.shift();
}

function runClaude(prompt: string, cwd: string, timeoutMs: number, model?: string, config?: ProviderConfig, userId?: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Sanitize model — reject non-claude model names (e.g. gemini-* left over from settings)
    const validModels = ['haiku', 'sonnet', 'opus'];
    const resolvedModel = model && validModels.some(m => model.toLowerCase().includes(m)) ? model : 'haiku';
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', resolvedModel, '--dangerously-skip-permissions', '--max-turns', '30'];
    const env = { ...process.env };
    delete env.CLAUDECODE;

    // If user has OAuth tokens, write credentials file and set HOME
    if (config?.claudeAccessToken && userId) {
      const homeDir = writeClaudeCredentials(userId, config);
      env.HOME = homeDir;
      addLog('Using user OAuth credentials for Claude...');
    }

    // shell:true is only needed on Windows (cmd.exe wrapper); on Linux spawn directly
    const useShell = process.platform === 'win32';
    const child = spawn('claude', args, { cwd, shell: useShell, timeout: timeoutMs, env });

    let stdout = '', stderr = '', lineBuffer = '', resultText = '';

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
              if (block.type === 'text' && block.text?.trim()) addLog(block.text.trim().substring(0, 200));
              if (block.type === 'tool_use') addLog(`Using tool: ${block.name}`);
            }
          }
          // Capture the final result text from the result event
          if (event.type === 'result') {
            addLog('Complete.');
            if (event.result) resultText = event.result;
          }
        } catch {
          if (line.trim()) addLog(line.trim().substring(0, 200));
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout: resultText || stdout, stderr });
      else {
        const err: any = new Error(`claude exited with code ${code}`);
        err.stdout = resultText || stdout; err.stderr = stderr;
        reject(err);
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function runGemini(prompt: string, cwd: string, timeoutMs: number, config?: ProviderConfig, userId?: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    // If user has OAuth tokens, write credentials file and set HOME
    if (config?.geminiAccessToken && userId) {
      const homeDir = writeGeminiCredentials(userId, config);
      env.HOME = homeDir;
      addLog('Using user Google OAuth credentials for Gemini...');
    } else if (config?.geminiApiKey) {
      // Legacy: inject API key
      env.GEMINI_API_KEY = config.geminiApiKey;
      addLog('Using user Gemini API key...');
    }
    const child = spawn('gemini', ['-p', '.', '--output-format', 'stream-json', '-y'], {
      cwd, shell: true, timeout: timeoutMs, env, windowsHide: true
    });

    let stdout = '', stderr = '', lineBuffer = '', resultText = '';

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
          // Gemini streams assistant content as delta message events
          if (event.type === 'message' && event.role === 'assistant' && event.delta && typeof event.content === 'string') {
            resultText += event.content;
          }
          if (event.type === 'result') addLog('Complete.');
        } catch {
          if (line.trim()) addLog(line.trim().substring(0, 200));
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (text.trim()) addLog(`[gemini stderr] ${text.trim().substring(0, 300)}`);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout: resultText || stdout, stderr });
      else {
        const err: any = new Error(`gemini exited with code ${code}`);
        err.stdout = stdout; err.stderr = stderr;
        reject(err);
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function runWithProvider(prompt: string, cwd: string, timeoutMs: number, config: ProviderConfig, userId?: number): Promise<{ stdout: string; stderr: string }> {
  if (config.provider === 'gemini') {
    addLog('Using Gemini CLI...');
    return runGemini(prompt, cwd, timeoutMs, config, userId);
  }
  addLog(`Using Claude CLI (${config.model || 'sonnet'})...`);
  return runClaude(prompt, cwd, timeoutMs, config.model, config, userId);
}

export async function runForSuggestions(prompt: string, config: ProviderConfig, userId?: number): Promise<string> {
  const { stdout } = await runWithProvider(prompt, PROJECT_ROOT, 180000, config, userId);
  return stdout;
}

// ─── Job Sync ─────────────────────────────────────────────────────────────────

/**
 * Runs job sync. AI reads emails and outputs JSON — our code saves to DB.
 * AI never touches the database directly.
 */
export async function runJobSync(existingJobKeys: string[], config: ProviderConfig): Promise<{ success: boolean; jobs: ExtractedJob[]; error?: string; output?: string }> {
  const existingList = existingJobKeys.length > 0
    ? `\nALREADY IN DATABASE (skip these — match by title+company):\n${existingJobKeys.slice(0, 100).join('\n')}`
    : '\nDatabase is currently empty — add all jobs found.';

  const prompt = `You are a job data extractor. Read job alert emails and extract listings as JSON.

## TASK: Process 3 email portals

For EACH portal, follow these steps:

### Indeed
1. Search Gmail: mcp__gmail__search_emails with query "from:indeed newer_than:7d" maxResults:1
2. If found, read the email with mcp__gmail__read_email
3. Extract up to 10 job listings

### LinkedIn
1. Search Gmail: mcp__gmail__search_emails with query "from:linkedin newer_than:7d" maxResults:1
2. If found, read the email
3. Extract up to 10 job listings

### Glassdoor
1. Search Gmail: mcp__gmail__search_emails with query "from:glassdoor newer_than:7d" maxResults:1
2. If found, read the email
3. Extract up to 10 job listings

${existingList}

## OUTPUT FORMAT
After processing all portals, output ONLY this JSON (no other text):

{
  "success": true,
  "jobs": [
    {
      "title": "Software Engineer",
      "company_name": "Google",
      "location": "Mountain View, CA",
      "salary_min": 150000,
      "salary_max": 200000,
      "salary_type": "annual",
      "remote_type": "hybrid",
      "source": "indeed",
      "source_url": "https://www.indeed.com/viewjob?jk=...",
      "description": "1-2 sentence description of the role",
      "email_id": "the gmail message id"
    }
  ]
}

## RULES
- Do NOT write to any files or databases — just output JSON
- Skip jobs already in database (title+company match)
- salary_min/salary_max: integers or null. salary_type: "annual", "hourly", or null
- remote_type: "remote", "hybrid", "onsite", or null
- source: "indeed", "linkedin", or "glassdoor"
- source_url: include ANY link associated with the job from the email — tracking links, redirect links, and viewjob links are all fine. Never leave source_url null if there is any link at all.
- If no new jobs found: {"success": true, "jobs": []}`;

  try {
    syncLog.length = 0;
    addLog('Starting job sync from multiple portals...');
    const { stdout } = await runWithProvider(prompt, PROJECT_ROOT, 300000, config);

    // Extract JSON from output
    const jsonMatch = stdout.match(/\{\s*"success"\s*:\s*true[\s\S]*?"jobs"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { success: true, jobs: parsed.jobs || [], output: stdout };
    }

    addLog('No jobs JSON found in output');
    return { success: true, jobs: [], output: stdout };

  } catch (error: any) {
    console.error('Sync error:', error.message);
    return { success: false, jobs: [], error: error.message, output: error.stdout || error.stderr };
  }
}

// ─── Web Job Fetch ────────────────────────────────────────────────────────────

/**
 * Fetches jobs from the web using Claude's WebSearch tool.
 * Dynamically builds a search query from the candidate's resume.
 */
export async function runWebJobFetch(
  resumeContent: string,
  existingJobKeys: string[],
  config: ProviderConfig,
  userId?: number
): Promise<{ success: boolean; jobs: ExtractedJob[]; error?: string }> {
  const existingList = existingJobKeys.length > 0
    ? `\nSKIP THESE (already in database — match by title+company):\n${existingJobKeys.slice(0, 100).join('\n')}`
    : '\nDatabase is currently empty — add all jobs found.';

  const prompt = `You are a job search assistant. Your task is to find real, currently open job listings that match this candidate's resumes.

## CANDIDATE RESUMES
${resumeContent}

## YOUR TASK

**Step 1 — Extract the following from ALL resumes above:**
- Target job title(s) across all resumes (e.g. "Software Engineer", "AI Engineer")
- Top 5-8 technical skills appearing across the resumes
- **Total years of professional experience** (count only real work experience, internships, and co-ops — NOT education years). Be specific, e.g. "1.5 years", "3 years".
- **Experience level:** entry (0-2 yrs), mid (2-5 yrs), or senior (5+ yrs)
- Location preference (from the resume address)

**Step 2 — Search for RECENT job openings that directly match the candidate's actual background:**
Build queries around the EXACT skills and roles from Step 1. Use today's date filter for freshness. Focus only on roles the candidate can genuinely do based on their resume.
- "[exact role from resume] [top 2-3 skills] jobs after:2026-03-20"
- "[role] [skills] [location] hiring after:2026-03-20 site:linkedin.com"
- "[role] [skills] startup OR tech company after:2026-03-20"
- "AI engineer OR full stack engineer [skills] entry level jobs after:2026-03-20"
- "[role] [skills] visa sponsorship OPT after:2026-03-20"

Do EXACTLY 5 searches, no more. Aim to collect at least 10 unique currently-open job listings.

**Step 3 — For each job found, you MUST verify ALL of the following:**
- The job is still actively accepting applications (not closed/filled/expired)
- **Strict experience match:** Required experience must be within ±2 years of candidate's actual experience. Skip "senior", "staff", "lead", "principal", "manager" titles. Skip roles requiring 5+ years if candidate has under 3.
- **Strict relevance:** Only include roles that directly match the domains, technologies, and job titles present in the candidate's resume. Do NOT apply to domains that have zero evidence in the resume. If a role requires a completely different tech stack or domain than what appears in the resume, skip it.
- **OPT/Visa friendly:** SKIP any job mentioning "US Citizen only", "security clearance required", "Must be US Citizen or Permanent Resident", "no sponsorship", or government/defense/federal roles. The candidate is an international student on F1 OPT visa.

**Step 4 — Extract the direct apply link.** For Google Jobs listings use the actual employer/company career page URL if visible, otherwise use the Google Jobs URL.

**Step 5 — For each job URL collected, use WebFetch to visit the page and extract the FULL job description.** Company career pages (Workday, Greenhouse, Lever, Workable, Ashby, etc.) are accessible — fetch them. For LinkedIn or Indeed listings where the full description is not accessible, use whatever description text you can get from the search snippet. Put the full description text in the "description" field.

${existingList}

## OUTPUT FORMAT
Output ONLY this JSON (no other text):

{
  "success": true,
  "jobs": [
    {
      "title": "Software Engineer",
      "company_name": "Google",
      "location": "Chicago, IL",
      "salary_min": null,
      "salary_max": null,
      "salary_type": null,
      "remote_type": "hybrid",
      "source": "web",
      "source_url": "https://careers.google.com/...",
      "description": "Full job description text fetched from the page...",
      "email_id": null
    }
  ]
}

## RULES
- Only include jobs that are currently open and accepting applications
- SKIP roles in domains not present in the candidate's resume — if the resume shows no evidence of the required tech stack or domain, skip it
- SKIP senior/staff/lead/principal/manager titles
- source_url must be a real clickable apply link — never null
- source: always "web"
- Skip jobs already in the database
- Skip any job requiring US Citizenship, security clearance, "no sponsorship", or from trading firms — candidate is on F1 OPT
- description must be the full job description from the actual page — not a summary. If WebFetch fails for a URL, use whatever text is available from search.
- Return at least 10 jobs if found, up to 15
- If no qualifying jobs found: {"success": true, "jobs": []}`;

  try {
    syncLog.length = 0;
    addLog(`Analyzing resume and searching for matching jobs using ${config.provider}...`);
    const { stdout } = await runWithProvider(prompt, PROJECT_ROOT, 900000, config, userId);

    const jsonMatch = stdout.match(/\{\s*"success"\s*:\s*true[\s\S]*?"jobs"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      addLog(`Found ${parsed.jobs?.length || 0} matching jobs from web search.`);
      return { success: true, jobs: parsed.jobs || [] };
    }

    addLog('No jobs found in web search output.');
    return { success: true, jobs: [] };

  } catch (error: any) {
    console.error('Web fetch error:', error.message);
    return { success: false, jobs: [], error: error.message };
  }
}

// ─── Document Generation ──────────────────────────────────────────────────────

/**
 * Generate a single document for a job.
 * Profile content is passed in directly from DB — no file reading.
 */
export async function generateDocument(
  jobId: number,
  docType: 'resume' | 'cover_letter' | 'linkedin' | 'interview',
  jobTitle: string,
  companyName: string,
  description: string,
  config: ProviderConfig,
  profileContent?: string,
  location?: string,
  salary?: string,
  userId?: number
): Promise<DocGenResult> {
  const profile = profileContent
    ? `\nCANDIDATE PROFILE:\n${profileContent}\n`
    : '';

  const prompts: Record<string, string> = {
    resume: `Tailor this resume for the job below. Output ONLY the full tailored resume in markdown — no other text, no explanations.

JOB: ${jobTitle} at ${companyName}
DESCRIPTION: ${description}
${profile}`,

    cover_letter: `Write a cover letter for this job. Output ONLY the cover letter text — no other text, no explanations.
${profile}
JOB: ${jobTitle} at ${companyName}
LOCATION: ${location || 'Not specified'}
DESCRIPTION: ${description}

Requirements:
- 250-350 words
- Compelling opening hook (no "I am writing to apply")
- Specific reason for interest in this company/role
- Confident closing
- No generic phrases`,

    linkedin: `Write a LinkedIn message to request a referral for this job. Output ONLY the message text — no other text, no explanations.
${profile}
JOB: ${jobTitle} at ${companyName}
DESCRIPTION: ${description}

Requirements:
- 100-150 words
- Personalized, human tone
- Ask for a coffee chat, NOT directly for a referral
- Mention specific interest in the company
- Professional but warm`,

    interview: `Create interview prep for this job. Output ONLY the prep content in markdown — no other text, no explanations.
${profile}
JOB: ${jobTitle} at ${companyName}
DESCRIPTION: ${description}

Include:
1. 5 likely technical questions with strong answers
2. 5 behavioral questions with STAR-format answers
3. 5 thoughtful questions to ask the interviewer
4. Key talking points and value propositions`
  };

  const prompt = prompts[docType];
  if (!prompt) return { success: false, type: docType, error: 'Invalid document type' };

  try {
    syncLog.length = 0;
    addLog(`Generating ${docType} for job ${jobId}...`);
    const { stdout } = await runWithProvider(prompt, PROJECT_ROOT, 120000, config, userId);

    const content = stdout.trim();
    if (content) {
      addLog(`${docType} generated successfully!`);
      return { success: true, type: docType, content };
    }

    return { success: false, type: docType, error: 'No content returned from AI' };

  } catch (error: any) {
    console.error(`Error generating ${docType}:`, error.message);
    return { success: false, type: docType, error: error.message || 'Unknown error' };
  }
}

export async function generateDocumentsForJob(
  jobId: number,
  jobTitle: string,
  companyName: string,
  description: string,
  config: ProviderConfig,
  profileContent?: string,
  userId?: number
): Promise<boolean> {
  const results = await Promise.all([
    generateDocument(jobId, 'resume', jobTitle, companyName, description, config, profileContent, undefined, undefined, userId),
    generateDocument(jobId, 'cover_letter', jobTitle, companyName, description, config, profileContent, undefined, undefined, userId),
    generateDocument(jobId, 'linkedin', jobTitle, companyName, description, config, profileContent, undefined, undefined, userId),
    generateDocument(jobId, 'interview', jobTitle, companyName, description, config, profileContent, undefined, undefined, userId),
  ]);
  return results.every(r => r.success);
}
