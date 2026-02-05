import { Router } from 'express';
import { runJobSync, generateDocumentsForJob, syncLog } from '../services/claudeRunner';
import db from '../db/database';

const router = Router();

let syncInProgress = false;
let lastSyncResult: any = null;
let lastSyncTime: string | null = null;

// Trigger job sync - runs Claude Code in background
router.post('/trigger', async (req, res) => {
  if (syncInProgress) {
    return res.status(409).json({
      error: 'Sync already in progress',
      status: 'running'
    });
  }

  // Start sync in background
  syncInProgress = true;
  res.json({
    success: true,
    message: 'Sync started. This may take a few minutes.',
    status: 'running'
  });

  // Run sync asynchronously
  try {
    console.log('Starting job sync via Claude Code...');
    const result = await runJobSync();
    lastSyncResult = result;
    lastSyncTime = new Date().toISOString();
    console.log('Sync completed:', result);
  } catch (error) {
    console.error('Sync error:', error);
    lastSyncResult = { success: false, error: String(error) };
    lastSyncTime = new Date().toISOString();
  } finally {
    syncInProgress = false;
  }
});

// Get sync status
router.get('/status', (req, res) => {
  res.json({
    inProgress: syncInProgress,
    lastSync: lastSyncTime,
    lastResult: lastSyncResult,
    log: syncInProgress ? syncLog : []
  });
});

// Generate documents for a specific job
router.post('/generate/:jobId', async (req, res) => {
  const jobId = parseInt(req.params.jobId);

  await db.read();
  const job = db.data!.jobs.find(j => j.id === jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    success: true,
    message: 'Document generation started',
    status: 'running'
  });

  // Generate in background
  try {
    await generateDocumentsForJob(
      job.id,
      job.title,
      job.company_name,
      job.description || ''
    );
    console.log(`Documents generated for job ${jobId}`);
  } catch (error) {
    console.error(`Error generating documents for job ${jobId}:`, error);
  }
});

export default router;
