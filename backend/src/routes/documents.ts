import { Router } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

const OUTPUT_DIR = path.join(__dirname, '../../../ai-workspace/output');

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
      return res.status(404).json({ error: 'Document not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content, filename, type });
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
      const filename = `job_${jobId}_${type === 'cover_letter' ? 'cover_letter' : type}.md`;
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

export default router;
