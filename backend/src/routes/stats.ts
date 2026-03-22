import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const [jobs, reminders] = await Promise.all([
      prisma.job.findMany({ where: { user_id: userId }, select: { status: true, source: true, created_at: true, company_id: true, h1b_sponsor: true } }),
      prisma.reminder.findMany({ where: { user_id: userId }, select: { completed: true, due_date: true } })
    ]);

    // By status
    const byStatus: Record<string, number> = {};
    for (const job of jobs) {
      byStatus[job.status] = (byStatus[job.status] || 0) + 1;
    }

    // By source
    const bySource: Record<string, number> = {};
    for (const job of jobs) {
      const source = job.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    }

    // H1B sponsors
    const h1bSponsors = jobs.filter(j => j.h1b_sponsor === 1).length;

    // Reminders
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const upcomingReminders = reminders.filter(r => !r.completed && new Date(r.due_date) <= weekFromNow).length;
    const overdueReminders = reminders.filter(r => !r.completed && new Date(r.due_date) < today).length;

    // Recent jobs (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentJobs = jobs.filter(j => new Date(j.created_at) >= weekAgo).length;

    // Funnel
    const applied = byStatus['applied'] || 0;
    const interviewing = byStatus['interviewing'] || 0;
    const offers = byStatus['offer'] || 0;
    const rejected = byStatus['rejected'] || 0;
    const responseRate = applied > 0 ? Math.round(((interviewing + offers) / applied) * 100) : 0;

    res.json({
      total: jobs.length,
      h1bSponsors,
      byStatus,
      bySource,
      reminders: { upcoming: upcomingReminders, overdue: overdueReminders },
      recentJobs,
      funnel: { applied, interviewing, offers, rejected, responseRate }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
