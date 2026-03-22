import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });

async function fileToMarkdown(buffer: Buffer, mimetype: string, originalName: string): Promise<string> {
  const ext = originalName.split('.').pop()?.toLowerCase();

  if (mimetype === 'application/pdf' || ext === 'pdf') {
    const data = await pdfParse(buffer);
    return plainTextToMarkdown(data.text);
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword' ||
    ext === 'docx' || ext === 'doc'
  ) {
    const result = await mammoth.convertToHtml({ buffer });
    return turndown.turndown(result.value);
  }

  // Plain text or markdown — use as-is
  return buffer.toString('utf-8');
}

function plainTextToMarkdown(text: string): string {
  // Clean up PDF extraction artifacts
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === '')); // collapse multiple blanks

  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] || '';

    if (!line) {
      result.push('');
      continue;
    }

    // Short ALL-CAPS lines or short lines followed by blank → treat as section headers
    const isAllCaps = line === line.toUpperCase() && /[A-Z]/.test(line) && line.length < 40;
    const isShortFollowedByBlank = line.length < 50 && next === '';

    if (isAllCaps || (isShortFollowedByBlank && i < lines.length * 0.3)) {
      result.push(`## ${line}`);
    } else if (line.startsWith('•') || line.startsWith('·') || line.startsWith('◦')) {
      result.push(`- ${line.slice(1).trim()}`);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

// ─── Profile ──────────────────────────────────────────────────────────────────

// GET /api/profile
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = await prisma.userProfile.findUnique({ where: { user_id: req.userId! } });
    res.json({ content: profile?.content || null, updated_at: profile?.updated_at || null });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/profile — text body
router.put('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });

    const profile = await prisma.userProfile.upsert({
      where: { user_id: req.userId! },
      create: { user_id: req.userId!, content },
      update: { content }
    });
    res.json({ content: profile.content, updated_at: profile.updated_at });
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// POST /api/profile/upload — file upload
router.post('/upload', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const markdown = await fileToMarkdown(req.file.buffer, req.file.mimetype, req.file.originalname);

    const profile = await prisma.userProfile.upsert({
      where: { user_id: req.userId! },
      create: { user_id: req.userId!, content: markdown },
      update: { content: markdown }
    });
    res.json({ content: profile.content, updated_at: profile.updated_at });
  } catch (error: any) {
    console.error('Error uploading profile:', error);
    res.status(500).json({ error: error.message || 'Failed to process file' });
  }
});

// ─── Resumes ──────────────────────────────────────────────────────────────────

// GET /api/profile/resumes
router.get('/resumes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const resumes = await prisma.resume.findMany({
      where: { user_id: req.userId! },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
      select: { id: true, name: true, is_default: true, created_at: true, updated_at: true }
    });
    res.json(resumes);
  } catch (error) {
    console.error('Error fetching resumes:', error);
    res.status(500).json({ error: 'Failed to fetch resumes' });
  }
});

// GET /api/profile/resumes/:id
router.get('/resumes/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const resume = await prisma.resume.findFirst({
      where: { id: Number(req.params.id), user_id: req.userId! }
    });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json(resume);
  } catch (error) {
    console.error('Error fetching resume:', error);
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

// POST /api/profile/resumes/upload — file upload
router.post('/resumes/upload', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const name = (req.body.name || req.file.originalname.replace(/\.[^.]+$/, '')).trim();
    const markdown = await fileToMarkdown(req.file.buffer, req.file.mimetype, req.file.originalname);

    // First resume becomes default
    const existingCount = await prisma.resume.count({ where: { user_id: req.userId! } });
    const isDefault = existingCount === 0;

    const resume = await prisma.resume.create({
      data: { user_id: req.userId!, name, content: markdown, is_default: isDefault }
    });
    res.status(201).json({ id: resume.id, name: resume.name, is_default: resume.is_default, created_at: resume.created_at });
  } catch (error: any) {
    console.error('Error uploading resume:', error);
    res.status(500).json({ error: error.message || 'Failed to process file' });
  }
});

// PATCH /api/profile/resumes/:id — rename or set default
router.patch('/resumes/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.resume.findFirst({ where: { id, user_id: req.userId! } });
    if (!existing) return res.status(404).json({ error: 'Resume not found' });

    const { name, is_default } = req.body;

    if (is_default) {
      // Clear default on all others first
      await prisma.resume.updateMany({ where: { user_id: req.userId! }, data: { is_default: false } });
    }

    const resume = await prisma.resume.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(is_default !== undefined && { is_default: Boolean(is_default) })
      }
    });
    res.json({ id: resume.id, name: resume.name, is_default: resume.is_default });
  } catch (error) {
    console.error('Error updating resume:', error);
    res.status(500).json({ error: 'Failed to update resume' });
  }
});

// DELETE /api/profile/resumes/:id
router.delete('/resumes/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.resume.findFirst({ where: { id, user_id: req.userId! } });
    if (!existing) return res.status(404).json({ error: 'Resume not found' });

    await prisma.resume.delete({ where: { id } });

    // If deleted was default, promote newest remaining to default
    if (existing.is_default) {
      const next = await prisma.resume.findFirst({ where: { user_id: req.userId! }, orderBy: { created_at: 'desc' } });
      if (next) await prisma.resume.update({ where: { id: next.id }, data: { is_default: true } });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting resume:', error);
    res.status(500).json({ error: 'Failed to delete resume' });
  }
});

export default router;
