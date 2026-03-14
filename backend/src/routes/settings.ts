import { Router } from 'express';
import { getConfig, saveConfig, Provider } from '../services/claudeRunner';

const router = Router();

// Get current settings
router.get('/', (req, res) => {
  try {
    const config = getConfig();
    res.json({
      provider: config.provider,
      model: config.model || 'sonnet',
      availableProviders: [
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
      ]
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update settings
router.patch('/', (req, res) => {
  try {
    const { provider, model } = req.body;

    // Validate provider
    if (provider && !['claude', 'gemini'].includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    saveConfig({
      provider: provider as Provider,
      model
    });

    res.json({
      success: true,
      message: 'Settings updated',
      config: getConfig()
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
