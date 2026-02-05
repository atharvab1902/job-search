import { Router } from 'express';
import db from '../db/database';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await db.read();

    // Count by status
    const byStatus: Record<string, number> = {};
    for (const job of db.data!.jobs) {
      byStatus[job.status] = (byStatus[job.status] || 0) + 1;
    }

    // Count by source
    const bySource: Record<string, number> = {};
    for (const job of db.data!.jobs) {
      const source = job.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    }

    // H1B sponsors
    const h1bCompanyIds = new Set(
      db.data!.companies.filter(c => c.h1b_sponsor === 1).map(c => c.id)
    );
    const h1bSponsors = db.data!.jobs.filter(j => j.company_id && h1bCompanyIds.has(j.company_id)).length;

    // Reminders
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const upcomingReminders = db.data!.reminders.filter(r =>
      r.completed === 0 && new Date(r.due_date) <= weekFromNow
    ).length;

    const overdueReminders = db.data!.reminders.filter(r =>
      r.completed === 0 && new Date(r.due_date) < today
    ).length;

    // Recent jobs (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentJobs = db.data!.jobs.filter(j => new Date(j.created_at) >= weekAgo).length;

    // Funnel
    const applied = byStatus['applied'] || 0;
    const interviewing = byStatus['interviewing'] || 0;
    const offers = byStatus['offer'] || 0;
    const rejected = byStatus['rejected'] || 0;
    const responseRate = applied > 0 ? Math.round(((interviewing + offers) / applied) * 100) : 0;

    res.json({
      total: db.data!.jobs.length,
      h1bSponsors,
      byStatus,
      bySource,
      reminders: {
        upcoming: upcomingReminders,
        overdue: overdueReminders
      },
      recentJobs,
      funnel: {
        applied,
        interviewing,
        offers,
        rejected,
        responseRate
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
