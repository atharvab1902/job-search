import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/reminders
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { completed, upcoming } = req.query;
    const userId = req.userId!;

    const where: Record<string, unknown> = { user_id: userId };

    if (completed === 'false') where.completed = false;
    else if (completed === 'true') where.completed = true;

    if (upcoming === 'true') {
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      where.completed = false;
      where.due_date = { lte: weekFromNow.toISOString().split('T')[0] };
    }

    const reminders = await prisma.reminder.findMany({
      where,
      include: { job: { select: { title: true, company_name: true } } },
      orderBy: { due_date: 'asc' }
    });

    res.json(reminders.map(r => ({
      ...r,
      job_title: r.job.title,
      company_name: r.job.company_name,
      job: undefined
    })));
  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// POST /api/reminders
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { job_id, type, due_date, message } = req.body;

    if (!job_id || !due_date) {
      return res.status(400).json({ error: 'job_id and due_date are required' });
    }

    const reminder = await prisma.reminder.create({
      data: {
        user_id: req.userId!,
        job_id: Number(job_id),
        type: type || 'custom',
        due_date,
        message: message || ''
      }
    });
    res.status(201).json(reminder);
  } catch (error) {
    console.error('Error creating reminder:', error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// PATCH /api/reminders/:id
router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.reminder.findFirst({
      where: { id: Number(req.params.id), user_id: req.userId! }
    });
    if (!existing) return res.status(404).json({ error: 'Reminder not found' });

    const { completed, due_date, message } = req.body;
    const reminder = await prisma.reminder.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(completed !== undefined && {
          completed: Boolean(completed),
          completed_at: completed ? new Date() : null
        }),
        ...(due_date !== undefined && { due_date }),
        ...(message !== undefined && { message })
      }
    });
    res.json(reminder);
  } catch (error) {
    console.error('Error updating reminder:', error);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// DELETE /api/reminders/:id
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.reminder.findFirst({
      where: { id: Number(req.params.id), user_id: req.userId! }
    });
    if (!existing) return res.status(404).json({ error: 'Reminder not found' });

    await prisma.reminder.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

export default router;
