import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const router = Router();

// This endpoint triggers Claude Code to scan emails and generate materials
router.post('/trigger', async (req, res) => {
  try {
    const requestFile = path.join(__dirname, '../../../ai-workspace/sync-request.json');

    // Write sync request
    fs.writeFileSync(requestFile, JSON.stringify({
      requested_at: new Date().toISOString(),
      status: 'pending',
      sources: ['indeed', 'linkedin', 'glassdoor']
    }));

    res.json({
      success: true,
      message: 'Sync request created. Run Claude Code command to process.',
      command: 'claude "Process job sync request at ai-workspace/sync-request.json"'
    });
  } catch (error) {
    console.error('Error triggering sync:', error);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

// Get sync status
router.get('/status', (req, res) => {
  try {
    const requestFile = path.join(__dirname, '../../../ai-workspace/sync-request.json');
    const resultFile = path.join(__dirname, '../../../ai-workspace/sync-result.json');

    if (fs.existsSync(resultFile)) {
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
      res.json({ status: 'completed', result });
    } else if (fs.existsSync(requestFile)) {
      const request = JSON.parse(fs.readFileSync(requestFile, 'utf-8'));
      res.json({ status: request.status, requested_at: request.requested_at });
    } else {
      res.json({ status: 'idle' });
    }
  } catch (error) {
    res.json({ status: 'idle' });
  }
});

export default router;
