import { Router } from 'express';
import db, { now } from '../db/database';
import Fuse from 'fuse.js';

const router = Router();

function normalizeCompanyName(name: string): string {
  return name
    .replace(/,?\s*(Inc\.?|LLC|Corp\.?|Corporation|Ltd\.?|Co\.?|Company|L\.?P\.?)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Check H1B status
router.get('/check/:company', async (req, res) => {
  try {
    await db.read();
    const companyName = req.params.company;
    const normalized = normalizeCompanyName(companyName);

    // Check our companies table first
    const company = db.data!.companies.find(
      c => c.name.toLowerCase().includes(normalized.toLowerCase())
    );

    if (company && company.h1b_sponsor !== null) {
      return res.json({
        company: companyName,
        sponsors: company.h1b_sponsor === 1,
        confidence: 'high',
        petitions: company.h1b_petitions || 0,
        source: 'database'
      });
    }

    // Check H1B data
    const h1bRecords = db.data!.h1b_data.filter(
      r => r.employer.toLowerCase().includes(normalized.toLowerCase())
    );

    if (h1bRecords.length > 0) {
      const petitionCount = h1bRecords.length;

      // Update company record if exists
      if (company) {
        company.h1b_sponsor = 1;
        company.h1b_petitions = petitionCount;
        company.updated_at = now();
        await db.write();
      }

      return res.json({
        company: companyName,
        sponsors: true,
        confidence: petitionCount > 10 ? 'high' : 'medium',
        petitions: petitionCount,
        source: 'h1b_data'
      });
    }

    // Try fuzzy search
    if (db.data!.h1b_data.length > 0) {
      const employers = [...new Set(db.data!.h1b_data.map(r => r.employer))];
      const fuse = new Fuse(employers, { threshold: 0.3 });
      const fuzzyResults = fuse.search(normalized);

      if (fuzzyResults.length > 0) {
        const matchedEmployer = fuzzyResults[0].item;
        const records = db.data!.h1b_data.filter(r => r.employer === matchedEmployer);

        return res.json({
          company: companyName,
          matchedAs: matchedEmployer,
          sponsors: true,
          confidence: 'medium',
          petitions: records.length,
          source: 'h1b_data_fuzzy'
        });
      }
    }

    // Unknown
    res.json({
      company: companyName,
      sponsors: null,
      confidence: 'unknown',
      petitions: 0,
      source: 'not_found',
      note: 'Company not found in H1B database. May still sponsor - check manually at h1bdata.info'
    });
  } catch (error) {
    console.error('Error checking H1B:', error);
    res.status(500).json({ error: 'Failed to check H1B status' });
  }
});

// Get H1B stats
router.get('/stats', async (req, res) => {
  try {
    await db.read();
    const total = db.data!.h1b_data.length;
    const employers = new Set(db.data!.h1b_data.map(r => r.employer)).size;
    const years = [...new Set(db.data!.h1b_data.map(r => r.year).filter(Boolean))].sort((a, b) => (b || 0) - (a || 0));

    res.json({
      totalRecords: total,
      uniqueEmployers: employers,
      years,
      note: total === 0 ? 'No H1B data loaded. H1B checks will use manual lookup.' : undefined
    });
  } catch (error) {
    console.error('Error getting H1B stats:', error);
    res.status(500).json({ error: 'Failed to get H1B stats' });
  }
});

export default router;
