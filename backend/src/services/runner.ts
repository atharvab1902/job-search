import path from 'path';
import { ProviderConfig, DocGenResult, ExtractedJob } from './types';
import { runClaude } from './claudeRunner';
import { runGemini } from './geminiRunner';

// Re-export types and helpers so routes only need to import from runner
export type { Provider, ProviderConfig, SyncResult, DocGenResult, ExtractedJob } from './types';
export { writeClaudeCredentialsForUser } from './claudeRunner';

const PROJECT_ROOT = path.join(__dirname, '../../..');

// Live progress log — shared across all sync/doc operations
export const syncLog: string[] = [];

export function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${message}`;
  syncLog.push(entry);
  console.log(entry);
  if (syncLog.length > 50) syncLog.shift();
}

function runWithProvider(
  prompt: string,
  cwd: string,
  timeoutMs: number,
  config: ProviderConfig,
  userId?: number
): Promise<{ stdout: string; stderr: string }> {
  if (config.provider === 'gemini') {
    addLog('Using Gemini CLI...');
    return runGemini(prompt, cwd, timeoutMs, config, userId, addLog);
  }
  addLog(`Using Claude CLI (${config.model || 'sonnet'})...`);
  return runClaude(prompt, cwd, timeoutMs, config.model, config, userId, addLog);
}

export async function runForSuggestions(prompt: string, config: ProviderConfig, userId?: number): Promise<string> {
  const { stdout } = await runWithProvider(prompt, PROJECT_ROOT, 600000, config, userId);
  return stdout;
}

// ─── Job Sync ─────────────────────────────────────────────────────────────────

/**
 * Runs job sync. AI reads emails and outputs JSON — our code saves to DB.
 * AI never touches the database directly.
 */
export async function runJobSync(
  existingJobKeys: string[],
  config: ProviderConfig
): Promise<{ success: boolean; jobs: ExtractedJob[]; error?: string; output?: string }> {
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
 * Fetches jobs from the web using the AI provider's search tools.
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

  const today = new Date().toISOString().split('T')[0];
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const prompt = `You are a job search assistant for an international student on F1 OPT visa. Your ONLY goal is to find real, currently open, OPT-friendly job listings posted in the last 3 days that match this candidate.

## CANDIDATE RESUMES
${resumeContent}

## YOUR TASK

**Step 1 — Extract from ALL resumes:**
- Target job title(s) (e.g. "Software Engineer", "AI/ML Engineer", "Full Stack Engineer")
- Top 5-8 technical skills
- Total years of professional experience (work + internships only, NOT school years)
- Experience level: entry (0-2 yrs), mid (2-5 yrs), senior (5+ yrs)
- Location from resume address (for 1 local search)

**Step 2 — Do 4 targeted web searches (do NOT use WebFetch on any external pages):**
Use the experience level from Step 1 to pick the right seniority keywords:
- "[exact role] [top 3 skills] after:${threeDaysAgo} site:greenhouse.io OR site:lever.co OR site:ashbyhq.com"
- "[role] [skills] visa sponsorship OPT hiring after:${threeDaysAgo}"
- "[role] [skills] [location from resume] after:${threeDaysAgo}"
- "[role] [skills] OPT CPT international after:${threeDaysAgo}"

**Step 3 — Hard filter every single job through these gates (REJECT if ANY fail):**
- Posted after ${threeDaysAgo} — REJECT anything older. Check the actual posting date on the page.
- US-based role only — REJECT jobs in Europe, Canada, India, or any non-US location
- OPT/visa friendly — REJECT any mention of: "US Citizen only", "security clearance", "no sponsorship", "must be authorized without sponsorship now or in future", government/defense/federal roles, trading/HFT firms
- Experience match — REJECT roles requiring 3+ more years than candidate has. REJECT titles that are 2+ levels above the candidate's experience level (e.g. reject "staff", "principal", "director", "manager" for entry/mid candidates; reject "director", "VP" for senior candidates)
- Relevance — REJECT roles in domains with zero evidence in the resume (quantum, chip design, game dev, blockchain, pure hardware)
- Include the direct apply URL as-is — do not spend extra calls verifying links

${existingList}

## OUTPUT FORMAT
Output ONLY this JSON (no other text):

{
  "success": true,
  "jobs": [
    {
      "title": "Software Engineer",
      "company_name": "Acme Corp",
      "location": "Chicago, IL",
      "salary_min": null,
      "salary_max": null,
      "salary_type": null,
      "remote_type": "hybrid",
      "source": "web",
      "source_url": "https://jobs.ashbyhq.com/acme/...",
      "description": null,
      "email_id": null
    }
  ]
}

## STRICT RULES
- Every job MUST be in the United States — no exceptions
- NEVER include jobs that require US citizenship or security clearance
- NEVER include trading/HFT firm roles
- description must be null — do NOT fetch any job pages
- source_url: include the direct apply link from search results as-is — do NOT use WebFetch to verify it
- Return whatever qualifying jobs you find — even 1 good job is better than nothing`;

  try {
    syncLog.length = 0;
    addLog(`Analyzing resume and searching for matching jobs using ${config.provider}...`);
    const { stdout } = await runWithProvider(prompt, PROJECT_ROOT, 900000, config, userId);

    // Log tail of output for debugging
    addLog(`DEBUG output tail: ${stdout.slice(-800)}`);

    // Strategy 1: find ```json ... ``` block
    let parsed: any = null;
    const codeBlockMatch = stdout.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try { parsed = JSON.parse(codeBlockMatch[1]); } catch {}
    }

    // Strategy 2: greedy match for full JSON object
    if (!parsed) {
      const jsonMatch = stdout.match(/\{\s*"success"\s*:\s*true[\s\S]*"jobs"\s*:\s*\[[\s\S]*\]\s*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch (e: any) {
          addLog(`JSON parse error: ${e.message}`);
        }
      }
    }

    // Strategy 3: extract just the jobs array
    if (!parsed) {
      const arrayMatch = stdout.match(/"jobs"\s*:\s*(\[[\s\S]*\])/);
      if (arrayMatch) {
        try { parsed = { jobs: JSON.parse(arrayMatch[1]) }; } catch {}
      }
    }

    const jobs: ExtractedJob[] = parsed?.jobs || [];
    if (jobs.length > 0) {
      addLog(`Found ${jobs.length} matching jobs from web search.`);
      return { success: true, jobs };
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
    const { stdout } = await runWithProvider(prompt, PROJECT_ROOT, 300000, config, userId);

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
