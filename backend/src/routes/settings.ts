import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const availableProviders = [
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    description: 'Best quality, uses Claude Pro limits',
    models: ['sonnet', 'opus', 'haiku']
  },
  {
    id: 'gemini',
    name: 'Gemini (Google)',
    description: 'Free tier with generous limits (1M+ tokens/day)',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro']
  }
];

// GET /api/settings
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    let settings = await prisma.userSettings.findUnique({ where: { user_id: req.userId! } });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { user_id: req.userId!, ai_provider: 'gemini', ai_model: 'gemini-2.0-flash-exp' }
      });
    }

    res.json({ provider: settings.ai_provider, model: settings.ai_model, availableProviders });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PATCH /api/settings
router.patch('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { provider, model } = req.body;

    if (provider && !['claude', 'gemini'].includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    const settings = await prisma.userSettings.upsert({
      where: { user_id: req.userId! },
      update: {
        ...(provider && { ai_provider: provider }),
        ...(model && { ai_model: model })
      },
      create: {
        user_id: req.userId!,
        ai_provider: provider || 'gemini',
        ai_model: model || 'gemini-2.0-flash-exp'
      }
    });

    res.json({ success: true, message: 'Settings updated', provider: settings.ai_provider, model: settings.ai_model });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
