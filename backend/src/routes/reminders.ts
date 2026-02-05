import { Router } from 'express';
import db, { getNextId, now } from '../db/database';

const router = Router();

// Get all reminders
router.get('/', async (req, res) => {
  try {
    await db.read();
    const { completed, upcoming } = req.query;

    let reminders = [...db.data!.reminders];

    if (completed === 'false') {
      reminders = reminders.filter(r => r.completed === 0);
    } else if (completed === 'true') {
      reminders = reminders.filter(r => r.completed === 1);
    }

    if (upcoming === 'true') {
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      reminders = reminders.filter(r =>
        r.completed === 0 && new Date(r.due_date) <= weekFromNow
      );
    }

    // Sort by due date
    reminders.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

    // Add job info
    const jobsMap = new Map(db.data!.jobs.map(j => [j.id, j]));
    const remindersWithJobs = reminders.map(r => {
      const job = jobsMap.get(r.job_id);
      return {
        ...r,
        job_title: job?.title || 'Unknown',
        company_name: job?.company_name || 'Unknown'
      };
    });

    res.json(remindersWithJobs);
  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// Create reminder
router.post('/', async (req, res) => {
  try {
    await db.read();
    const { job_id, type, due_date, message } = req.body;

    if (!job_id || !due_date) {
      return res.status(400).json({ error: 'job_id and due_date are required' });
    }

    const reminder = {
      id: getNextId('reminders'),
      job_id,
      type: type || 'custom',
      due_date,
      message: message || null,
      completed: 0,
      completed_at: null,
      created_at: now()
    };

    db.data!.reminders.push(reminder);
    await db.write();
    res.status(201).json(reminder);
  } catch (error) {
    console.error('Error creating reminder:', error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// Update reminder
router.patch('/:id', async (req, res) => {
  try {
    await db.read();
    const reminderIndex = db.data!.reminders.findIndex(r => r.id === Number(req.params.id));
    if (reminderIndex === -1) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    const { completed, due_date, message } = req.body;
    const reminder = db.data!.reminders[reminderIndex];

    if (completed !== undefined) {
      reminder.completed = completed ? 1 : 0;
      if (completed) {
        reminder.completed_at = now();
      }
    }
    if (due_date !== undefined) reminder.due_date = due_date;
    if (message !== undefined) reminder.message = message;

    await db.write();
    res.json(reminder);
  } catch (error) {
    console.error('Error updating reminder:', error);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// Delete reminder
router.delete('/:id', async (req, res) => {
  try {
    await db.read();
    db.data!.reminders = db.data!.reminders.filter(r => r.id !== Number(req.params.id));
    await db.write();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

export default router;
