import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/companies
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: { user_id: req.userId! },
      include: { _count: { select: { jobs: true } } },
      orderBy: { name: 'asc' }
    });
    res.json(companies.map(c => ({ ...c, job_count: c._count.jobs, _count: undefined })));
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/companies/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const company = await prisma.company.findFirst({
      where: { id: Number(req.params.id), user_id: req.userId! },
      include: { jobs: true }
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company);
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// PATCH /api/companies/:id
router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.company.findFirst({
      where: { id: Number(req.params.id), user_id: req.userId! }
    });
    if (!existing) return res.status(404).json({ error: 'Company not found' });

    const { h1b_sponsor, h1b_petitions, website, notes } = req.body;
    const company = await prisma.company.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(h1b_sponsor !== undefined && { h1b_sponsor }),
        ...(h1b_petitions !== undefined && { h1b_petitions }),
        ...(website !== undefined && { website }),
        ...(notes !== undefined && { notes })
      }
    });
    res.json(company);
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

export default router;
