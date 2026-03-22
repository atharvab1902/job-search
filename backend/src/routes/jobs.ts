import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/jobs
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { status, h1b_only, search, sort = '-created_at', limit = '100', offset = '0' } = req.query;
    const userId = req.userId!;

    const where: Record<string, unknown> = { user_id: userId };

    if (status && status !== 'all') where.status = status;
    if (h1b_only === 'true') where.h1b_sponsor = 1;
    if (search) {
      const s = search as string;
      where.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { company_name: { contains: s, mode: 'insensitive' } },
        { location: { contains: s, mode: 'insensitive' } }
      ];
    }

    // Parse sort
    const sortStr = sort.toString();
    const sortDir = sortStr.startsWith('-') ? 'desc' : 'asc';
    const sortField = sortStr.startsWith('-') ? sortStr.slice(1) : sortStr;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        take: Number(limit),
        skip: Number(offset)
      }),
      prisma.job.count({ where })
    ]);

    res.json({ jobs, total });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /api/jobs/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: Number(req.params.id), user_id: req.userId! },
      include: {
        company: { select: { website: true, h1b_sponsor: true, h1b_petitions: true } },
        applications: true,
        reminders: true
      }
    });

    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { company, ...rest } = job;
    res.json({
      ...rest,
      h1b_sponsor: job.h1b_sponsor ?? company?.h1b_sponsor ?? null,
      h1b_petitions: job.h1b_petitions ?? company?.h1b_petitions ?? null,
      company_website: company?.website ?? null,
      application: job.applications[0] || null,
      reminders: job.reminders
    });
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// POST /api/jobs
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      title, company_name, location, salary_min, salary_max, salary_type,
      remote_type, source, source_url, description, requirements, notes
    } = req.body;

    if (!title || !company_name) {
      return res.status(400).json({ error: 'Title and company_name are required' });
    }

    const userId = req.userId!;

    // Find or create company
    let company = await prisma.company.findFirst({
      where: { user_id: userId, name: { equals: company_name, mode: 'insensitive' } }
    });

    if (!company) {
      company = await prisma.company.create({
        data: { user_id: userId, name: company_name }
      });
    }

    const job = await prisma.job.create({
      data: {
        user_id: userId,
        company_id: company.id,
        title,
        company_name,
        location: location || null,
        salary_min: salary_min || null,
        salary_max: salary_max || null,
        salary_type: salary_type || null,
        remote_type: remote_type || null,
        source: source || 'manual',
        source_url: source_url || null,
        description: description || null,
        requirements: requirements || null,
        notes: notes || null
      }
    });

    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// PATCH /api/jobs/:id
router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.job.findFirst({
      where: { id: Number(req.params.id), user_id: req.userId! }
    });
    if (!existing) return res.status(404).json({ error: 'Job not found' });

    const { status, priority, notes, fit_score, description } = req.body;

    const job = await prisma.job.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(notes !== undefined && { notes }),
        ...(fit_score !== undefined && { fit_score }),
        ...(description !== undefined && { description })
      }
    });
    res.json(job);
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// DELETE /api/jobs/:id
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.job.findFirst({
      where: { id: Number(req.params.id), user_id: req.userId! }
    });
    if (!existing) return res.status(404).json({ error: 'Job not found' });

    await prisma.job.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// POST /api/jobs/:id/apply
router.post('/:id/apply', requireAuth, async (req: AuthRequest, res) => {
  try {
    const jobId = Number(req.params.id);
    const userId = req.userId!;

    const existing = await prisma.job.findFirst({ where: { id: jobId, user_id: userId } });
    if (!existing) return res.status(404).json({ error: 'Job not found' });

    const { resume_version, notes } = req.body;

    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 7);
    const followUpDateStr = followUpDate.toISOString().split('T')[0];

    await prisma.$transaction([
      prisma.job.update({ where: { id: jobId }, data: { status: 'applied' } }),
      prisma.application.create({
        data: {
          user_id: userId,
          job_id: jobId,
          applied_date: new Date().toISOString().split('T')[0],
          resume_version: resume_version || 'ai',
          notes: notes || null
        }
      }),
      prisma.reminder.create({
        data: {
          user_id: userId,
          job_id: jobId,
          type: 'follow_up',
          due_date: followUpDateStr,
          message: 'Follow up on application'
        }
      })
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking job as applied:', error);
    res.status(500).json({ error: 'Failed to mark as applied' });
  }
});

export default router;
