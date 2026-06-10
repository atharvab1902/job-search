import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { generateDocument, syncLog, runForSuggestions } from '../services/runner';
import { generateResumePDF, generateCoverLetterPDF } from '../services/pdfGenerator';
import { generateResumeDocx, generateCoverLetterDocx } from '../services/docxGenerator';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

import os from 'os';
const OUTPUT_DIR = path.join(os.tmpdir(), 'job-search-output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let generatingDoc: { jobId: number; type: string } | null = null;
const suggestionInProgress = new Map<string, boolean>(); // key: `${userId}-${jobId}`

const VALID_TYPES = ['resume', 'cover_letter', 'linkedin', 'interview'];

// GET /api/documents/:jobId/resume-suggestions
router.get('/:jobId/resume-suggestions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const jobId = Number(req.params.jobId);
    const suggestion = await prisma.resumeSuggestion.findUnique({
      where: { user_id_job_id: { user_id: req.userId!, job_id: jobId } }
    });

    const key = `${req.userId}-${jobId}`;
    const running = suggestionInProgress.get(key) || false;

    if (!suggestion) return res.json({ suggestions: null, generated_at: null, status: running ? 'running' : 'idle' });

    const data = suggestion.suggestions as Record<string, unknown>;
    if (data.error) return res.json({ suggestions: null, generated_at: null, status: 'error', error: data.error });

    res.json({
      suggestions: data.suggestions,
      recommended_resume: data.recommended_resume,
      recommendation_reason: suggestion.recommendation_reason,
      generated_at: suggestion.generated_at,
      additional_context: suggestion.additional_context,
      status: running ? 'running' : 'done'
    });
  } catch (error: any) {
    console.error('Error reading suggestions:', error);
    res.status(500).json({ error: error.message || 'Failed to read suggestions' });
  }
});

// POST /api/documents/:jobId/resume-suggestions
router.post('/:jobId/resume-suggestions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const jobId = Number(req.params.jobId);
    const { additionalContext } = req.body;
    const userId = req.userId!;

    const job = await prisma.job.findFirst({ where: { id: jobId, user_id: userId } });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Read resumes from DB
    const resumes = await prisma.resume.findMany({
      where: { user_id: userId },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }]
    });

    if (resumes.length === 0) {
      return res.status(404).json({ error: 'No resumes found. Please upload at least one resume in the Profile page.' });
    }

    const settings = await prisma.userSettings.findUnique({ where: { user_id: userId } });

    // Build resume sections for the prompt
    const resumeSections = resumes.map((r, i) =>
      `RESUME ${i + 1}: ${r.name}${r.is_default ? ' (default)' : ''}\n${r.content}`
    ).join('\n\n---\n\n');

    const resumeCount = resumes.length;

    const additionalContextSection = additionalContext
      ? `\n\nADDITIONAL CANDIDATE CONTEXT:\n${additionalContext}\n\nIMPORTANT: Incorporate this new information into your suggestions.`
      : '';

    const prompt = `You are an expert ATS resume reviewer and career coach. You have ${resumeCount} resume version(s) for a candidate. Analyze them against this job and give a COMPREHENSIVE, section-by-section review.

JOB DETAILS:
Title: ${job.title}
Company: ${job.company_name}
Description: ${job.description || 'No description provided'}

${resumeSections}${additionalContextSection}

## YOUR TASK

1. Recommend which resume to use for this specific job.
2. Do a THOROUGH review of every section of the recommended resume — summary, skills, work experience bullets, education, projects, certifications. Leave nothing unchecked.
3. For ATS compliance: flag missing keywords from the job description, weak action verbs, vague bullet points, missing metrics, formatting issues, and anything that would cause ATS rejection.
4. For every issue found, provide the exact original text and a concrete improved replacement.
5. Produce as many suggestions as needed — do NOT limit yourself. A thorough review should typically produce 10-20+ suggestions covering the entire resume.

Your response MUST be a valid JSON object:
{
  "recommended_resume": "${resumes[0].name}",
  "recommendation_reason": "1-2 sentences explaining why this resume fits best",
  "suggestions": [
    { "type": "replace", "original": "exact original text from resume", "replacement": "improved text", "reason": "specific reason — ATS keyword match, stronger action verb, added metric, etc." },
    { "type": "add", "original": "", "replacement": "new bullet or section to add", "reason": "what's missing and why it matters" }
  ]
}

RULES:
- recommended_resume must be the exact name of one of the resumes listed above
- "original" must be the exact verbatim text from the resume so it can be found and replaced
- Cover ALL sections — do not stop after a few suggestions
- Flag every missing keyword from the job description that should be added
- **CRITICAL — Page length:** Every replacement must fit in the SAME number of lines as the original. If the original is 1 line, the replacement must also be 1 line. Do NOT expand a single bullet into multiple lines or sentences. Rewrite within the same space — be concise and punchy. Never add new lines that weren't there before.
- For "add" type suggestions (genuinely missing sections/keywords), keep additions to 1 line max
- Output ONLY the JSON object, no other text`;

    const key = `${userId}-${jobId}`;
    if (suggestionInProgress.get(key)) {
      return res.json({ status: 'running' });
    }

    const { runForSuggestions } = require('../services/runner');
    const config = {
      provider: (settings?.ai_provider || 'gemini') as 'claude' | 'gemini',
      model: settings?.ai_model || undefined,
      claudeAccessToken: settings?.claude_access_token || undefined,
      claudeRefreshToken: settings?.claude_refresh_token || undefined,
      claudeTokenExpiry: settings?.claude_token_expiry || undefined,
      geminiApiKey: settings?.gemini_api_key || undefined,
      geminiAccessToken: settings?.gemini_access_token || undefined,
      geminiRefreshToken: settings?.gemini_refresh_token || undefined,
      geminiTokenExpiry: settings?.gemini_token_expiry || undefined,
    };

    // Clear stale suggestions so frontend knows generation is fresh
    await prisma.resumeSuggestion.deleteMany({ where: { user_id: userId, job_id: jobId } });

    suggestionInProgress.set(key, true);
    res.json({ status: 'running' });

    // Run in background
    (async () => {
      try {
        const result: string = await runForSuggestions(prompt, config, userId);
        const jsonMatch = result.match(/```json\s*(\{[\s\S]*?\})\s*```/) || result.match(/(\{[\s\S]*\})/);
        if (!jsonMatch?.[1]) throw new Error('Failed to parse suggestions from AI');

        const response = JSON.parse(jsonMatch[1]);
        const { recommended_resume, recommendation_reason, suggestions } = response;

        await prisma.resumeSuggestion.upsert({
          where: { user_id_job_id: { user_id: userId, job_id: jobId } },
          create: { user_id: userId, job_id: jobId, recommendation_reason, suggestions: { recommended_resume, suggestions }, additional_context: additionalContext || null },
          update: { recommendation_reason, suggestions: { recommended_resume, suggestions }, additional_context: additionalContext || null, generated_at: new Date() }
        });
      } catch (error: any) {
        console.error('Error generating resume suggestions:', error);
        // Save error state so frontend can surface it
        await prisma.resumeSuggestion.upsert({
          where: { user_id_job_id: { user_id: userId, job_id: jobId } },
          create: { user_id: userId, job_id: jobId, recommendation_reason: 'error', suggestions: { error: error.message || 'Generation failed' }, additional_context: null },
          update: { recommendation_reason: 'error', suggestions: { error: error.message || 'Generation failed' }, generated_at: new Date() }
        });
      } finally {
        suggestionInProgress.delete(key);
      }
    })();
  } catch (error: any) {
    console.error('Error starting resume suggestions:', error);
    res.status(500).json({ error: error.message || 'Failed to start suggestions' });
  }
});

// GET /api/documents/:jobId/qa — get saved Q&As for a job
router.get('/:jobId/qa', requireAuth, async (req: AuthRequest, res) => {
  const jobId = Number(req.params.jobId);
  const userId = req.userId!;
  const qas = await prisma.applicationQA.findMany({
    where: { job_id: jobId, user_id: userId },
    orderBy: { created_at: 'asc' }
  });
  res.json(qas);
});

// POST /api/documents/:jobId/qa — generate answer for a question
router.post('/:jobId/qa', requireAuth, async (req: AuthRequest, res) => {
  try {
    const jobId = Number(req.params.jobId);
    const userId = req.userId!;
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'Question is required' });

    const [job, resumes, profile, settings] = await Promise.all([
      prisma.job.findFirst({ where: { id: jobId, user_id: userId } }),
      prisma.resume.findMany({ where: { user_id: userId }, orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }] }),
      prisma.userProfile.findUnique({ where: { user_id: userId } }),
      prisma.userSettings.findUnique({ where: { user_id: userId } }),
    ]);

    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (resumes.length === 0) return res.status(404).json({ error: 'No resumes found. Please upload at least one resume.' });

    const resumeContent = resumes.map((r, i) =>
      `RESUME ${i + 1}${r.is_default ? ' (default)' : ''}: ${r.name}\n${r.content}`
    ).join('\n\n---\n\n');

    const profileSection = profile?.content ? `\nCANDIDATE PROFILE:\n${profile.content}\n` : '';

    const prompt = `You are a career coach helping a candidate answer application questions. Use their resume and profile to craft a personalized, authentic answer.

JOB: ${job.title} at ${job.company_name}
JOB DESCRIPTION: ${job.description || 'Not provided'}
${profileSection}
CANDIDATE RESUMES:
${resumeContent}

APPLICATION QUESTION:
"${question.trim()}"

Write a strong, authentic answer to this question. Requirements:
- Draw specifically from the candidate's actual experiences, projects, and skills in their resume
- Keep it concise and relevant (150-300 words unless the question implies otherwise)
- Use first person ("I")
- Be specific — mention real projects, technologies, or situations from the resume
- Tailor to the job and company
- Output ONLY the answer text, no preamble or explanation`;

    const config = {
      provider: (settings?.ai_provider || 'gemini') as 'claude' | 'gemini',
      model: settings?.ai_model || undefined,
      claudeAccessToken: settings?.claude_access_token || undefined,
      claudeRefreshToken: settings?.claude_refresh_token || undefined,
      claudeTokenExpiry: settings?.claude_token_expiry || undefined,
      geminiApiKey: settings?.gemini_api_key || undefined,
      geminiAccessToken: settings?.gemini_access_token || undefined,
      geminiRefreshToken: settings?.gemini_refresh_token || undefined,
      geminiTokenExpiry: settings?.gemini_token_expiry || undefined,
    };

    const answer = await runForSuggestions(prompt, config, userId);
    if (!answer.trim()) return res.status(500).json({ error: 'AI returned empty answer' });

    const qa = await prisma.applicationQA.create({
      data: { user_id: userId, job_id: jobId, question: question.trim(), answer: answer.trim() }
    });

    res.json(qa);
  } catch (error: any) {
    console.error('Error generating QA answer:', error);
    res.status(500).json({ error: error.message || 'Failed to generate answer' });
  }
});

// DELETE /api/documents/:jobId/qa/:qaId — delete a Q&A
router.delete('/:jobId/qa/:qaId', requireAuth, async (req: AuthRequest, res) => {
  const { jobId, qaId } = req.params;
  const userId = req.userId!;
  await prisma.applicationQA.deleteMany({
    where: { id: Number(qaId), job_id: Number(jobId), user_id: userId }
  });
  res.json({ success: true });
});

// GET /api/documents/:jobId/:type
router.get('/:jobId/:type', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { jobId, type } = req.params;
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid document type' });

    const doc = await prisma.generatedDocument.findUnique({
      where: { user_id_job_id_type: { user_id: req.userId!, job_id: Number(jobId), type } }
    });

    if (!doc) return res.status(404).json({ error: 'Document not found', exists: false });

    res.json({ content: doc.content, type, exists: true });
  } catch (error) {
    console.error('Error reading document:', error);
    res.status(500).json({ error: 'Failed to read document' });
  }
});

// GET /api/documents/:jobId
router.get('/:jobId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const jobId = Number(req.params.jobId);
    const docs = await prisma.generatedDocument.findMany({
      where: { user_id: req.userId!, job_id: jobId },
      select: { type: true }
    });
    const existingTypes = new Set(docs.map(d => d.type));
    res.json({
      documents: VALID_TYPES.map(type => ({ type, exists: existingTypes.has(type) }))
    });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// POST /api/documents/:jobId/:type/generate
router.post('/:jobId/:type/generate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { jobId, type } = req.params;
    const jobIdNum = Number(jobId);
    const userId = req.userId!;

    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid document type' });
    if (generatingDoc) {
      return res.status(409).json({ error: 'Another document is being generated', current: generatingDoc });
    }

    const job = await prisma.job.findFirst({ where: { id: jobIdNum, user_id: userId } });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    generatingDoc = { jobId: jobIdNum, type };
    res.json({ success: true, message: 'Generation started', status: 'generating' });

    // Generate in background
    try {
      const [settings, profile] = await Promise.all([
        prisma.userSettings.findUnique({ where: { user_id: userId } }),
        prisma.userProfile.findUnique({ where: { user_id: userId } })
      ]);
      const config = {
        provider: (settings?.ai_provider || 'gemini') as 'claude' | 'gemini',
        model: settings?.ai_model || undefined,
        claudeAccessToken: settings?.claude_access_token || undefined,
        claudeRefreshToken: settings?.claude_refresh_token || undefined,
        claudeTokenExpiry: settings?.claude_token_expiry || undefined,
        geminiApiKey: settings?.gemini_api_key || undefined,
        geminiAccessToken: settings?.gemini_access_token || undefined,
        geminiRefreshToken: settings?.gemini_refresh_token || undefined,
        geminiTokenExpiry: settings?.gemini_token_expiry || undefined,
      };
      const salary = job.salary_min && job.salary_max
        ? `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}` : undefined;

      const result = await generateDocument(
        jobIdNum,
        type as 'resume' | 'cover_letter' | 'linkedin' | 'interview',
        job.title, job.company_name, job.description || '',
        config, profile?.content ?? undefined,
        job.location ?? undefined, salary, userId
      );

      if (result.success && result.content) {
        await prisma.generatedDocument.upsert({
          where: { user_id_job_id_type: { user_id: userId, job_id: jobIdNum, type } },
          create: { user_id: userId, job_id: jobIdNum, type, content: result.content },
          update: { content: result.content }
        });
      } else {
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

// GET /api/documents/:jobId/:type/status
router.get('/:jobId/:type/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { jobId, type } = req.params;
    const isGenerating = generatingDoc?.jobId === Number(jobId) && generatingDoc?.type === type;

    const doc = await prisma.generatedDocument.findUnique({
      where: { user_id_job_id_type: { user_id: req.userId!, job_id: Number(jobId), type } }
    });

    res.json({ generating: isGenerating, exists: !!doc, log: isGenerating ? syncLog : [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// GET /api/documents/:jobId/:type/pdf
router.get('/:jobId/:type/pdf', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { jobId, type } = req.params;
    if (type !== 'resume' && type !== 'cover_letter') {
      return res.status(400).json({ error: 'PDF only available for resume and cover_letter' });
    }

    const [job, user] = await Promise.all([
      prisma.job.findFirst({ where: { id: Number(jobId), user_id: req.userId! } }),
      prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } })
    ]);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const candidateName = user?.name || 'Candidate';

    // Ensure file exists for PDF generator (write from DB if needed)
    const doc = await prisma.generatedDocument.findUnique({
      where: { user_id_job_id_type: { user_id: req.userId!, job_id: Number(jobId), type } }
    });
    if (doc) {
      fs.writeFileSync(path.join(OUTPUT_DIR, `job_${jobId}_${type}.md`), doc.content);
    }

    const pdfPath = type === 'resume'
      ? await generateResumePDF(Number(jobId), candidateName)
      : await generateCoverLetterPDF(Number(jobId), candidateName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(pdfPath)}"`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to generate PDF' });
  }
});

// GET /api/documents/:jobId/:type/docx
router.get('/:jobId/:type/docx', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { jobId, type } = req.params;
    if (type !== 'resume' && type !== 'cover_letter') {
      return res.status(400).json({ error: 'DOCX only available for resume and cover_letter' });
    }

    const [job, user] = await Promise.all([
      prisma.job.findFirst({ where: { id: Number(jobId), user_id: req.userId! } }),
      prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } })
    ]);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const candidateName = user?.name || 'Candidate';

    // Ensure file exists for DOCX generator
    const doc = await prisma.generatedDocument.findUnique({
      where: { user_id_job_id_type: { user_id: req.userId!, job_id: Number(jobId), type } }
    });
    if (doc) {
      fs.writeFileSync(path.join(OUTPUT_DIR, `job_${jobId}_${type}.md`), doc.content);
    }

    const docxPath = type === 'resume'
      ? await generateResumeDocx(Number(jobId), candidateName)
      : await generateCoverLetterDocx(Number(jobId), candidateName);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(docxPath)}"`);
    fs.createReadStream(docxPath).pipe(res);
  } catch (error: any) {
    console.error('Error generating DOCX:', error);
    res.status(500).json({ error: error.message || 'Failed to generate DOCX' });
  }
});

// GET /api/documents/:jobId/qa — get saved Q&As for a job
export default router;
