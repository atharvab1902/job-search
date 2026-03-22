import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import Fuse from 'fuse.js';

const router = Router();

function normalizeCompanyName(name: string): string {
  return name
    .replace(/,?\s*(Inc\.?|LLC|Corp\.?|Corporation|Ltd\.?|Co\.?|Company|L\.?P\.?)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function lookupH1BOnline(companyName: string): Promise<{ sponsors: boolean | null; petitions: number }> {
  try {
    const query = encodeURIComponent(companyName);
    const url = `https://h1bdata.info/index.php?em=${query}&job=&city=&year=All+Years`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return { sponsors: null, petitions: 0 };

    const html = await res.text();

    // Count table rows — each row is a petition record
    const rowMatches = html.match(/<tr[^>]*class="odd|even/gi);
    const petitions = rowMatches ? rowMatches.length : 0;

    if (petitions > 0) return { sponsors: true, petitions };

    // Check if "no records found" message appears
    if (html.includes('no records') || html.includes('No results')) {
      return { sponsors: false, petitions: 0 };
    }

    return { sponsors: null, petitions: 0 };
  } catch {
    return { sponsors: null, petitions: 0 };
  }
}

// GET /api/h1b/check/:company
router.get('/check/:company', requireAuth, async (req: AuthRequest, res) => {
  try {
    const companyName = req.params.company;
    const normalized = normalizeCompanyName(companyName);
    const userId = req.userId!;

    // Check user's companies table first
    const companies = await prisma.company.findMany({
      where: { user_id: userId },
      select: { id: true, name: true, h1b_sponsor: true, h1b_petitions: true }
    });

    // Exact match
    const exact = companies.find(c =>
      normalizeCompanyName(c.name).toLowerCase() === normalized.toLowerCase()
    );
    if (exact && exact.h1b_sponsor !== null) {
      return res.json({
        company: companyName,
        sponsors: exact.h1b_sponsor === 1,
        confidence: 'high',
        petitions: exact.h1b_petitions || 0,
        source: 'database'
      });
    }

    // Fuzzy match
    if (companies.length > 0) {
      const fuse = new Fuse(companies, { keys: ['name'], threshold: 0.3 });
      const results = fuse.search(normalized);
      if (results.length > 0 && results[0].item.h1b_sponsor !== null) {
        const match = results[0].item;
        return res.json({
          company: companyName,
          matchedAs: match.name,
          sponsors: match.h1b_sponsor === 1,
          confidence: 'medium',
          petitions: match.h1b_petitions || 0,
          source: 'database_fuzzy'
        });
      }
    }

    // Live lookup from h1bdata.info
    const live = await lookupH1BOnline(normalized);

    // Cache result in company record if it exists
    if (live.sponsors !== null) {
      const companyRecord = companies.find(c =>
        normalizeCompanyName(c.name).toLowerCase() === normalized.toLowerCase()
      );
      if (companyRecord) {
        await prisma.company.update({
          where: { id: companyRecord.id },
          data: { h1b_sponsor: live.sponsors ? 1 : 0, h1b_petitions: live.petitions }
        });
      }
    }

    return res.json({
      company: companyName,
      sponsors: live.sponsors,
      confidence: live.sponsors !== null ? 'high' : 'unknown',
      petitions: live.petitions,
      source: live.sponsors !== null ? 'h1bdata.info' : 'not_found',
      note: live.sponsors === null ? 'Not found in h1bdata.info — check manually' : undefined
    });

  } catch (error) {
    console.error('Error checking H1B:', error);
    res.status(500).json({ error: 'Failed to check H1B status' });
  }
});

// GET /api/h1b/stats
router.get('/stats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const count = await prisma.company.count({
      where: { user_id: req.userId!, h1b_sponsor: { not: null } }
    });
    res.json({
      totalRecords: count,
      uniqueEmployers: count,
      years: [],
      note: count === 0 ? 'H1B data loaded live from h1bdata.info per company lookup.' : undefined
    });
  } catch (error) {
    console.error('Error getting H1B stats:', error);
    res.status(500).json({ error: 'Failed to get H1B stats' });
  }
});

export default router;
