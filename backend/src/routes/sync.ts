import { Router } from 'express';
import { runJobSync, runWebJobFetch, generateDocumentsForJob, syncLog } from '../services/claudeRunner';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

let syncInProgress = false;
let lastSyncResult: unknown = null;
let lastSyncTime: string | null = null;

// POST /api/sync/trigger
router.post('/trigger', requireAuth, async (req: AuthRequest, res) => {
  if (syncInProgress) {
    return res.status(409).json({ error: 'Sync already in progress', status: 'running' });
  }

  const userId = req.userId!;
  syncInProgress = true;
  res.json({ success: true, message: 'Sync started. This may take a few minutes.', status: 'running' });

  try {
    // Get user settings from DB
    const settings = await prisma.userSettings.findUnique({ where: { user_id: userId } });
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

    // Get existing jobs to avoid duplicates
    const existingJobs = await prisma.job.findMany({
      where: { user_id: userId },
      select: { title: true, company_name: true }
    });
    const existingKeys = existingJobs.map(j => `${j.title.toLowerCase()}|${j.company_name.toLowerCase()}`);

    console.log('Starting job sync...');
    const result = await runJobSync(existingKeys, config);

    let jobsAdded = 0;

    if (result.success && result.jobs.length > 0) {
      for (const job of result.jobs) {
        const key = `${job.title.toLowerCase()}|${job.company_name.toLowerCase()}`;
        if (existingKeys.includes(key)) continue; // double-check duplicates

        // Find or create company
        let company = await prisma.company.findFirst({
          where: { user_id: userId, name: { equals: job.company_name, mode: 'insensitive' } }
        });
        if (!company) {
          company = await prisma.company.create({
            data: { user_id: userId, name: job.company_name }
          });
        }

        // Create job
        await prisma.job.create({
          data: {
            user_id: userId,
            company_id: company.id,
            title: job.title,
            company_name: job.company_name,
            location: job.location,
            salary_min: job.salary_min,
            salary_max: job.salary_max,
            salary_type: job.salary_type,
            remote_type: job.remote_type,
            source: job.source,
            source_url: job.source_url,
            description: job.description,
            status: 'new'
          }
        });

        // Log email if we have an ID
        if (job.email_id) {
          await prisma.emailLog.upsert({
            where: { user_id_email_id: { user_id: userId, email_id: job.email_id } },
            create: { user_id: userId, email_id: job.email_id, from_address: job.source, jobs_extracted: 1 },
            update: { jobs_extracted: { increment: 1 } }
          }).catch(() => {});
        }

        existingKeys.push(key); // prevent duplicates within same batch
        jobsAdded++;
      }
    }

    lastSyncResult = { success: true, jobsAdded, documentsGenerated: 0 };
    lastSyncTime = new Date().toISOString();
    console.log(`Sync completed: ${jobsAdded} jobs added`);

  } catch (error) {
    console.error('Sync error:', error);
    lastSyncResult = { success: false, error: String(error) };
    lastSyncTime = new Date().toISOString();
  } finally {
    syncInProgress = false;
  }
});

// POST /api/sync/web-fetch
router.post('/web-fetch', requireAuth, async (req: AuthRequest, res) => {
  if (syncInProgress) {
    return res.status(409).json({ error: 'Sync already in progress', status: 'running' });
  }

  const userId = req.userId!;

  // Need at least one resume
  const resumes = await prisma.resume.findMany({
    where: { user_id: userId },
    orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }]
  });
  if (resumes.length === 0) {
    return res.status(400).json({ error: 'No resume found. Upload a resume on the Profile page first.' });
  }

  syncInProgress = true;
  res.json({ success: true, message: 'Web job search started. This may take a few minutes.', status: 'running' });

  try {
    const settings = await prisma.userSettings.findUnique({ where: { user_id: userId } });
    const config = {
      provider: 'claude' as const,
      model: settings?.ai_model || 'sonnet',
      claudeAccessToken: settings?.claude_access_token || undefined,
      claudeRefreshToken: settings?.claude_refresh_token || undefined,
      claudeTokenExpiry: settings?.claude_token_expiry || undefined,
    };

    const existingJobs = await prisma.job.findMany({
      where: { user_id: userId },
      select: { title: true, company_name: true }
    });
    const existingKeys = existingJobs.map(j => `${j.title.toLowerCase()}|${j.company_name.toLowerCase()}`);

    // Combine all resumes so Claude extracts keywords from all of them
    const combinedResumes = resumes.map((r, i) =>
      `--- RESUME ${i + 1}${r.is_default ? ' (Default)' : ''} ---\n${r.content}`
    ).join('\n\n');

    const result = await runWebJobFetch(combinedResumes, existingKeys, config, userId);

    let jobsAdded = 0;
    if (result.success && result.jobs.length > 0) {
      for (const job of result.jobs) {
        const key = `${job.title.toLowerCase()}|${job.company_name.toLowerCase()}`;
        if (existingKeys.includes(key)) continue;

        let company = await prisma.company.findFirst({
          where: { user_id: userId, name: { equals: job.company_name, mode: 'insensitive' } }
        });
        if (!company) {
          company = await prisma.company.create({ data: { user_id: userId, name: job.company_name } });
        }

        await prisma.job.create({
          data: {
            user_id: userId,
            company_id: company.id,
            title: job.title,
            company_name: job.company_name,
            location: job.location,
            salary_min: job.salary_min,
            salary_max: job.salary_max,
            salary_type: job.salary_type,
            remote_type: job.remote_type,
            source: 'web',
            source_url: job.source_url,
            description: job.description,
            status: 'new'
          }
        });

        existingKeys.push(key);
        jobsAdded++;
      }
    }

    lastSyncResult = { success: true, jobsAdded, source: 'web' };
    lastSyncTime = new Date().toISOString();
    console.log(`Web fetch completed: ${jobsAdded} jobs added`);

  } catch (error) {
    console.error('Web fetch error:', error);
    lastSyncResult = { success: false, error: String(error) };
    lastSyncTime = new Date().toISOString();
  } finally {
    syncInProgress = false;
  }
});

// GET /api/sync/status
router.get('/status', requireAuth, (req: AuthRequest, res) => {
  res.json({
    inProgress: syncInProgress,
    lastSync: lastSyncTime,
    lastResult: lastSyncResult,
    log: syncInProgress ? syncLog : []
  });
});

// POST /api/sync/generate/:jobId
router.post('/generate/:jobId', requireAuth, async (req: AuthRequest, res) => {
  const jobId = Number(req.params.jobId);
  const userId = req.userId!;

  const [job, settings, profile] = await Promise.all([
    prisma.job.findFirst({ where: { id: jobId, user_id: userId } }),
    prisma.userSettings.findUnique({ where: { user_id: userId } }),
    prisma.userProfile.findUnique({ where: { user_id: userId } })
  ]);

  if (!job) return res.status(404).json({ error: 'Job not found' });

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

  res.json({ success: true, message: 'Document generation started', status: 'running' });

  try {
    await generateDocumentsForJob(job.id, job.title, job.company_name, job.description || '', config, profile?.content, userId);
    console.log(`Documents generated for job ${jobId}`);
  } catch (error) {
    console.error(`Error generating documents for job ${jobId}:`, error);
  }
});

export default router;
