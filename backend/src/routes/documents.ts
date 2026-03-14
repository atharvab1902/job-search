import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { generateDocument, syncLog } from '../services/claudeRunner';
import { generateResumePDF, generateCoverLetterPDF } from '../services/pdfGenerator';
import { generateResumeDocx, generateCoverLetterDocx } from '../services/docxGenerator';
import db from '../db/database';

const router = Router();

const OUTPUT_DIR = path.join(__dirname, '../../../ai-workspace/output');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Track generation status
let generatingDoc: { jobId: number; type: string } | null = null;

// Resume suggestions routes (must come before generic /:jobId/:type to avoid conflicts)
// Get existing resume suggestions
router.get('/:jobId/resume-suggestions', async (req, res) => {
  try {
    const { jobId } = req.params;
    const suggestionsPath = path.join(OUTPUT_DIR, `job_${jobId}_resume_suggestions.json`);

    if (!fs.existsSync(suggestionsPath)) {
      return res.json({ suggestions: null, generated_at: null });
    }

    const data = JSON.parse(fs.readFileSync(suggestionsPath, 'utf-8'));
    res.json({
      suggestions: data.suggestions,
      recommended_resume: data.recommended_resume,
      recommendation_reason: data.recommendation_reason,
      generated_at: data.generated_at,
      additional_context: data.additional_context
    });

  } catch (error: any) {
    console.error('Error reading suggestions:', error);
    res.status(500).json({ error: error.message || 'Failed to read suggestions' });
  }
});

// Generate resume suggestions based on job description
router.post('/:jobId/resume-suggestions', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { additionalContext } = req.body;
    const jobIdNum = parseInt(jobId, 10);

    // Get job details
    await db.read();
    const job = db.data!.jobs.find(j => j.id === jobIdNum);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Read both resume versions
    const resumeAiPath = path.join(__dirname, '../../../data/resumes/resume_ai.md');
    const resumeGeneralPath = path.join(__dirname, '../../../data/resumes/resume_general.md');

    if (!fs.existsSync(resumeAiPath) || !fs.existsSync(resumeGeneralPath)) {
      return res.status(404).json({ error: 'Resume files not found. Need both resume_ai.md and resume_general.md' });
    }

    const resumeAiContent = fs.readFileSync(resumeAiPath, 'utf-8');
    const resumeGeneralContent = fs.readFileSync(resumeGeneralPath, 'utf-8');

    // Get company name
    const company = db.data!.companies.find(c => c.id === job.company_id);
    const companyName = company?.name || job.company_name || 'Unknown Company';

    // Generate suggestions using Claude directly (simpler approach)
    const { spawn } = require('child_process');
    const { getConfig } = require('../services/claudeRunner');
    const config = getConfig();

    if (config.provider !== 'claude') {
      return res.status(400).json({ error: 'Resume suggestions only work with Claude provider. Please update settings.' });
    }

    const additionalContextSection = additionalContext ? `

ADDITIONAL CANDIDATE CONTEXT:
The candidate has provided the following NEW information to consider for the resume:
${additionalContext}

IMPORTANT: Incorporate this new information into your suggestions. If the candidate mentions new projects, skills, or experience, suggest adding them to the resume (and what to remove to maintain 1-page length).` : '';

    const prompt = `You have TWO resume versions for the same candidate. Analyze both against this job and recommend which one to use.

JOB DETAILS:
Title: ${job.title}
Company: ${companyName}
Description: ${job.description || 'No description provided'}

RESUME VERSION 1 (AI/ML focused):
${resumeAiContent}

RESUME VERSION 2 (General):
${resumeGeneralContent}${additionalContextSection}

TASK:
1. First, determine which resume is better suited for this job
2. Provide specific suggestions to tailor the RECOMMENDED resume for this job${additionalContext ? '\n3. Incorporate the additional candidate context into your suggestions' : ''}

Your response MUST be a JSON object with this structure:
{
  "recommended_resume": "resume_ai" or "resume_general",
  "recommendation_reason": "1-2 sentences explaining why this resume is better for this job",
  "suggestions": [
    {
      "type": "replace",
      "original": "exact text to find",
      "replacement": "exact text to use instead",
      "reason": "why this change helps"
    }
  ]
}

Each suggestion should be:
1. SPECIFIC - Point to exact text to change (copy exact Markdown text)
2. ACTIONABLE - Show exactly what to replace it with (in Markdown format)
3. SPACE-AWARE - If adding something, suggest what to remove to keep it concise

Format your response as a JSON array of suggestions:
[
  {
    "type": "replace",
    "original": "exact text to find",
    "replacement": "exact text to use instead",
    "reason": "why this change helps for this specific job"
  },
  {
    "type": "remove",
    "text": "exact text to remove",
    "reason": "why removing this helps (e.g., not relevant to this job)"
  },
  {
    "type": "add",
    "text": "exact text to add",
    "location": "where to add it (after which line)",
    "remove_to_compensate": "what to remove to keep 1-page",
    "reason": "why adding this helps"
  }
]

Focus on:
- Keywords from job description that should appear in resume
- Skills/technologies mentioned in job that candidate likely has
- Reordering/emphasizing relevant experience
- Removing less relevant content to make space

Output ONLY the JSON array, no other text.`;

    // Run Claude with simplified output
    const result: string = await new Promise((resolve, reject) => {
      const env = { ...process.env };
      delete env.CLAUDECODE;

      const child = spawn('claude', ['-p', '--model', 'sonnet', '--dangerously-skip-permissions'], {
        cwd: process.cwd(),
        shell: true,
        env,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => stdout += data.toString());
      child.stderr.on('data', (data: Buffer) => stderr += data.toString());

      child.stdin.write(prompt);
      child.stdin.end();

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          console.error('Claude stderr:', stderr);
          reject(new Error(`Claude exited with code ${code}`));
        }
      });
    });

    // Extract JSON object from response (might be wrapped in markdown code blocks)
    const jsonMatch = result.match(/```json\s*(\{[\s\S]*?\})\s*```/) || result.match(/(\{[\s\S]*\})/);
    if (!jsonMatch || !jsonMatch[1]) {
      console.error('Could not find JSON in Claude response. First 500 chars:', result.substring(0, 500));
      return res.status(500).json({ error: 'Failed to parse suggestions from AI' });
    }

    const response = JSON.parse(jsonMatch[1]);
    const { recommended_resume, recommendation_reason, suggestions } = response;

    // Save suggestions to file so they persist across page changes
    const suggestionsPath = path.join(OUTPUT_DIR, `job_${jobId}_resume_suggestions.json`);
    const suggestionsData = {
      job_id: jobIdNum,
      job_title: job.title,
      company: companyName,
      generated_at: new Date().toISOString(),
      recommended_resume,
      recommendation_reason,
      suggestions,
      additional_context: additionalContext || null
    };
    fs.writeFileSync(suggestionsPath, JSON.stringify(suggestionsData, null, 2));

    res.json({
      suggestions,
      recommended_resume,
      recommendation_reason,
      generated_at: suggestionsData.generated_at
    });

  } catch (error: any) {
    console.error('Error generating resume suggestions:', error);
    res.status(500).json({ error: error.message || 'Failed to generate suggestions' });
  }
});

// Get document for a job
router.get('/:jobId/:type', (req, res) => {
  try {
    const { jobId, type } = req.params;

    const typeToFile: Record<string, string> = {
      resume: `job_${jobId}_resume.md`,
      cover_letter: `job_${jobId}_cover_letter.md`,
      linkedin: `job_${jobId}_linkedin.md`,
      interview: `job_${jobId}_interview.md`,
    };

    const filename = typeToFile[type];
    if (!filename) {
      return res.status(400).json({ error: 'Invalid document type' });
    }

    const filePath = path.join(OUTPUT_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document not found', exists: false });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content, filename, type, exists: true });
  } catch (error) {
    console.error('Error reading document:', error);
    res.status(500).json({ error: 'Failed to read document' });
  }
});

// List all documents for a job
router.get('/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;

    const types = ['resume', 'cover_letter', 'linkedin', 'interview'];
    const documents: { type: string; filename: string; exists: boolean }[] = [];

    for (const type of types) {
      const filename = `job_${jobId}_${type}.md`;
      const filePath = path.join(OUTPUT_DIR, filename);
      documents.push({
        type,
        filename,
        exists: fs.existsSync(filePath)
      });
    }

    res.json({ documents });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// Generate a document on-demand
router.post('/:jobId/:type/generate', async (req, res) => {
  try {
    const { jobId, type } = req.params;
    const jobIdNum = parseInt(jobId, 10);

    // Validate type
    const validTypes = ['resume', 'cover_letter', 'linkedin', 'interview'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid document type' });
    }

    // Check if already generating
    if (generatingDoc) {
      return res.status(409).json({
        error: 'Another document is being generated',
        current: generatingDoc
      });
    }

    // Get job details from database
    const job = db.data!.jobs.find(j => j.id === jobIdNum);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get company name
    const company = db.data!.companies.find(c => c.id === job.company_id);
    const companyName = company?.name || job.company_name || 'Unknown Company';

    // Set generating status
    generatingDoc = { jobId: jobIdNum, type };

    // Return immediately, generation happens in background
    res.json({
      success: true,
      message: 'Generation started',
      status: 'generating'
    });

    // Generate document in background
    try {
      const result = await generateDocument(
        jobIdNum,
        type as 'resume' | 'cover_letter' | 'linkedin' | 'interview',
        job.title,
        companyName,
        job.description || '',
        job.location,
        job.salary_min && job.salary_max
          ? `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}`
          : undefined
      );

      if (!result.success) {
        console.error(`Failed to generate ${type}:`, result.error);
      }
    } finally {
      generatingDoc = null;
    }

  } catch (error) {
    console.error('Error starting document generation:', error);
    generatingDoc = null;
    res.status(500).json({ error: 'Failed to start generation' });
  }
});

// Check generation status
router.get('/:jobId/:type/status', (req, res) => {
  const { jobId, type } = req.params;
  const jobIdNum = parseInt(jobId, 10);

  // Check if this document is being generated
  const isGenerating = generatingDoc?.jobId === jobIdNum && generatingDoc?.type === type;

  // Check if document exists
  const filePath = path.join(OUTPUT_DIR, `job_${jobId}_${type}.md`);
  const exists = fs.existsSync(filePath);

  res.json({
    generating: isGenerating,
    exists,
    log: isGenerating ? syncLog : []
  });
});

// Generate and download PDF for resume or cover letter
router.get('/:jobId/:type/pdf', async (req, res) => {
  try {
    const { jobId, type } = req.params;
    const jobIdNum = parseInt(jobId, 10);

    // Validate type
    if (type !== 'resume' && type !== 'cover_letter') {
      return res.status(400).json({ error: 'PDF only available for resume and cover_letter' });
    }

    // Get job and candidate name from database
    await db.read();
    const job = db.data!.jobs.find(j => j.id === jobIdNum);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Read profile for candidate name
    const profilePath = path.join(__dirname, '../../../data/profile.md');
    let candidateName = 'Candidate';
    if (fs.existsSync(profilePath)) {
      const profile = fs.readFileSync(profilePath, 'utf-8');
      const nameMatch = profile.match(/^#\s+(.+)$/m);
      if (nameMatch &&  nameMatch[1]) candidateName = nameMatch[1].trim();
    }

    // Generate PDF
    let pdfPath: string;
    if (type === 'resume') {
      pdfPath = await generateResumePDF(jobIdNum, candidateName);
    } else {
      pdfPath = await generateCoverLetterPDF(jobIdNum, candidateName);
    }

    // Send PDF file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(pdfPath)}"`);
    fs.createReadStream(pdfPath).pipe(res);

  } catch (error: any) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to generate PDF' });
  }
});

// Generate and download DOCX for resume or cover letter
router.get('/:jobId/:type/docx', async (req, res) => {
  try {
    const { jobId, type } = req.params;
    const jobIdNum = parseInt(jobId, 10);

    // Validate type
    if (type !== 'resume' && type !== 'cover_letter') {
      return res.status(400).json({ error: 'DOCX only available for resume and cover_letter' });
    }

    // Get job and candidate name from database
    await db.read();
    const job = db.data!.jobs.find(j => j.id === jobIdNum);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Read profile for candidate name
    const profilePath = path.join(__dirname, '../../../data/profile.md');
    let candidateName = 'Candidate';
    if (fs.existsSync(profilePath)) {
      const profile = fs.readFileSync(profilePath, 'utf-8');
      const nameMatch = profile.match(/^#\s+(.+)$/m);
      if (nameMatch && nameMatch[1]) candidateName = nameMatch[1].trim();
    }

    // Generate DOCX
    let docxPath: string;
    if (type === 'resume') {
      docxPath = await generateResumeDocx(jobIdNum, candidateName);
    } else {
      docxPath = await generateCoverLetterDocx(jobIdNum, candidateName);
    }

    // Send DOCX file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(docxPath)}"`);
    fs.createReadStream(docxPath).pipe(res);

  } catch (error: any) {
    console.error('Error generating DOCX:', error);
    res.status(500).json({ error: error.message || 'Failed to generate DOCX' });
  }
});

// Get existing resume suggestions
export default router;
