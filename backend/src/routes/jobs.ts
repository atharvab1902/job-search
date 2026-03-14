import { Router } from 'express';
import db, { getNextId, now, futureDate, Job, Company } from '../db/database';

const router = Router();

// Get all jobs with filters
router.get('/', async (req, res) => {
  try {
    await db.read();
    const { status, h1b_only, search, sort = '-created_at', limit = '100', offset = '0' } = req.query;

    let jobs = [...db.data!.jobs];

    // Filter by status
    if (status && status !== 'all') {
      jobs = jobs.filter(j => j.status === status);
    }

    // Filter by H1B
    if (h1b_only === 'true') {
      const h1bCompanyIds = new Set(
        db.data!.companies.filter(c => c.h1b_sponsor === 1).map(c => c.id)
      );
      jobs = jobs.filter(j => j.company_id && h1bCompanyIds.has(j.company_id));
    }

    // Search
    if (search) {
      const searchLower = (search as string).toLowerCase();
      jobs = jobs.filter(j =>
        j.title.toLowerCase().includes(searchLower) ||
        j.company_name.toLowerCase().includes(searchLower) ||
        (j.location && j.location.toLowerCase().includes(searchLower))
      );
    }

    // Sort
    const sortField = sort.toString().startsWith('-') ? sort.toString().slice(1) : sort.toString();
    const sortDir = sort.toString().startsWith('-') ? -1 : 1;
    jobs.sort((a, b) => {
      const aVal = (a as any)[sortField] || '';
      const bVal = (b as any)[sortField] || '';
      if (aVal < bVal) return -1 * sortDir;
      if (aVal > bVal) return 1 * sortDir;
      return 0;
    });

    const total = jobs.length;

    // Pagination
    jobs = jobs.slice(Number(offset), Number(offset) + Number(limit));

    // Add H1B info
    const companiesMap = new Map(db.data!.companies.map(c => [c.id, c]));
    const jobsWithH1B = jobs.map(j => {
      const company = j.company_id ? companiesMap.get(j.company_id) : null;
      return {
        ...j,
        h1b_sponsor: company?.h1b_sponsor ?? null,
        h1b_petitions: company?.h1b_petitions ?? null
      };
    });

    res.json({ jobs: jobsWithH1B, total });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get single job
router.get('/:id', async (req, res) => {
  try {
    await db.read();
    const job = db.data!.jobs.find(j => j.id === Number(req.params.id));

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const company = job.company_id
      ? db.data!.companies.find(c => c.id === job.company_id)
      : null;

    const application = db.data!.applications.find(a => a.job_id === job.id);
    const reminders = db.data!.reminders.filter(r => r.job_id === job.id);

    res.json({
      ...job,
      h1b_sponsor: company?.h1b_sponsor ?? null,
      h1b_petitions: company?.h1b_petitions ?? null,
      company_website: company?.website ?? null,
      application,
      reminders
    });
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Create job
router.post('/', async (req, res) => {
  try {
    await db.read();
    const {
      title, company_name, location, salary_min, salary_max, salary_type,
      remote_type, source, source_url, description, requirements, notes
    } = req.body;

    if (!title || !company_name) {
      return res.status(400).json({ error: 'Title and company_name are required' });
    }

    // Find or create company
    let company = db.data!.companies.find(
      c => c.name.toLowerCase() === company_name.toLowerCase()
    );

    if (!company) {
      company = {
        id: getNextId('companies'),
        name: company_name,
        h1b_sponsor: null,
        h1b_petitions: 0,
        website: null,
        notes: null,
        created_at: now(),
        updated_at: now()
      };
      db.data!.companies.push(company);
    }

    const job: Job = {
      id: getNextId('jobs'),
      title,
      company_name,
      company_id: company.id,
      location: location || null,
      salary_min: salary_min || null,
      salary_max: salary_max || null,
      salary_type: salary_type || null,
      remote_type: remote_type || null,
      source: source || 'manual',
      source_url: source_url || null,
      email_id: null,
      description: description || null,
      requirements: requirements || null,
      status: 'new',
      priority: 0,
      fit_score: null,
      notes: notes || null,
      created_at: now(),
      updated_at: now()
    };

    db.data!.jobs.push(job);
    await db.write();

    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Update job
router.patch('/:id', async (req, res) => {
  try {
    await db.read();
    const jobIndex = db.data!.jobs.findIndex(j => j.id === Number(req.params.id));

    if (jobIndex === -1) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const { status, priority, notes, fit_score, description } = req.body;
    const job = db.data!.jobs[jobIndex];

    if (status !== undefined) job.status = status;
    if (priority !== undefined) job.priority = priority;
    if (notes !== undefined) job.notes = notes;
    if (fit_score !== undefined) job.fit_score = fit_score;
    if (description !== undefined) job.description = description;
    job.updated_at = now();

    await db.write();
    res.json(job);
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Delete job
router.delete('/:id', async (req, res) => {
  try {
    await db.read();
    const jobId = Number(req.params.id);
    db.data!.jobs = db.data!.jobs.filter(j => j.id !== jobId);
    db.data!.applications = db.data!.applications.filter(a => a.job_id !== jobId);
    db.data!.reminders = db.data!.reminders.filter(r => r.job_id !== jobId);
    await db.write();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Mark as applied
router.post('/:id/apply', async (req, res) => {
  try {
    await db.read();
    const jobId = Number(req.params.id);
    const jobIndex = db.data!.jobs.findIndex(j => j.id === jobId);

    if (jobIndex === -1) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const { resume_version, cover_letter_path, referral_contact, notes } = req.body;

    // Update job status
    db.data!.jobs[jobIndex].status = 'applied';
    db.data!.jobs[jobIndex].updated_at = now();

    // Create application record
    db.data!.applications.push({
      id: getNextId('applications'),
      job_id: jobId,
      applied_date: new Date().toISOString().split('T')[0],
      resume_version: resume_version || 'ai',
      cover_letter_path: cover_letter_path || null,
      linkedin_message_sent: 0,
      referral_contact: referral_contact || null,
      referral_linkedin: null,
      notes: notes || null,
      created_at: now(),
      updated_at: now()
    });

    // Auto-create follow-up reminder (7 days)
    db.data!.reminders.push({
      id: getNextId('reminders'),
      job_id: jobId,
      type: 'follow_up',
      due_date: futureDate(7),
      message: 'Follow up on application',
      completed: 0,
      completed_at: null,
      created_at: now()
    });

    await db.write();
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking job as applied:', error);
    res.status(500).json({ error: 'Failed to mark as applied' });
  }
});

export default router;
