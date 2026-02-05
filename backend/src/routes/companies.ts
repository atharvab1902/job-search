import { Router } from 'express';
import db, { now } from '../db/database';

const router = Router();

// Get all companies
router.get('/', async (req, res) => {
  try {
    await db.read();
    const companies = db.data!.companies.map(c => {
      const jobCount = db.data!.jobs.filter(j => j.company_id === c.id).length;
      return { ...c, job_count: jobCount };
    });
    companies.sort((a, b) => a.name.localeCompare(b.name));
    res.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// Get company by ID
router.get('/:id', async (req, res) => {
  try {
    await db.read();
    const company = db.data!.companies.find(c => c.id === Number(req.params.id));
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    const jobs = db.data!.jobs.filter(j => j.company_id === company.id);
    res.json({ ...company, jobs });
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// Update company
router.patch('/:id', async (req, res) => {
  try {
    await db.read();
    const companyIndex = db.data!.companies.findIndex(c => c.id === Number(req.params.id));
    if (companyIndex === -1) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const { h1b_sponsor, h1b_petitions, website, notes } = req.body;
    const company = db.data!.companies[companyIndex];

    if (h1b_sponsor !== undefined) company.h1b_sponsor = h1b_sponsor;
    if (h1b_petitions !== undefined) company.h1b_petitions = h1b_petitions;
    if (website !== undefined) company.website = website;
    if (notes !== undefined) company.notes = notes;
    company.updated_at = now();

    await db.write();
    res.json(company);
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

export default router;
