import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const CLAUDE_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const CLAUDE_REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback';
const CLAUDE_SCOPES = 'org:create_api_key user:profile user:inference user:sessions:claude_code';
const CLAUDE_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';

const GEMINI_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
const GEMINI_CLIENT_SECRET = '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';
const GEMINI_REDIRECT_URI = 'https://codeassist.google.com/authcode';
const GEMINI_SCOPES = 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const GEMINI_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GEMINI_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// In-memory PKCE verifier store (verifier lives only during the OAuth flow, ~5 min)
const pkceStore = new Map<number, { verifier: string; state: string; expiresAt: number }>();
const geminiPkceStore = new Map<number, { verifier: string; state: string; expiresAt: number }>();

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

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

    res.json({
      provider: settings.ai_provider,
      model: settings.ai_model,
      claudeConnected: !!settings.claude_access_token,
      geminiConnected: !!settings.gemini_access_token || !!settings.gemini_api_key,
      availableProviders
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// GET /api/settings/claude-oauth/start — returns the OAuth URL + starts PKCE
router.get('/claude-oauth/start', requireAuth, (req: AuthRequest, res) => {
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');
  const userId = req.userId!;
  pkceStore.set(userId, { verifier, state, expiresAt: Date.now() + 5 * 60 * 1000 });

  const params = new URLSearchParams({
    code: 'true',
    client_id: CLAUDE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: CLAUDE_REDIRECT_URI,
    scope: CLAUDE_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  res.json({ url: `https://claude.ai/oauth/authorize?${params.toString()}` });
});

// POST /api/settings/claude-oauth/exchange — user pastes the code, we get tokens
router.post('/claude-oauth/exchange', requireAuth, async (req: AuthRequest, res) => {
  const { code } = req.body;
  const userId = req.userId!;

  if (!code) return res.status(400).json({ error: 'Code is required' });

  const pkce = pkceStore.get(userId);
  if (!pkce || Date.now() > pkce.expiresAt) {
    return res.status(400).json({ error: 'OAuth session expired. Please start again.' });
  }
  pkceStore.delete(userId);

  try {
    // The display code is formatted as "<oauth_code>#<state>" — split to get the actual code
    const actualCode = code.trim().split('#')[0];
    const body = {
      grant_type: 'authorization_code',
      client_id: CLAUDE_CLIENT_ID,
      code: actualCode,
      redirect_uri: CLAUDE_REDIRECT_URI,
      code_verifier: pkce.verifier,
      state: pkce.state,
    };

    const tokenRes = await fetch(CLAUDE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Token exchange failed:', err);
      return res.status(400).json({ error: `Token exchange failed: ${err}` });
    }

    const tokens: any = await tokenRes.json();

    await prisma.userSettings.upsert({
      where: { user_id: userId },
      update: {
        claude_access_token: tokens.access_token,
        claude_refresh_token: tokens.refresh_token,
        claude_token_expiry: tokens.expires_in ? BigInt(Date.now() + tokens.expires_in * 1000) : null,
        ai_provider: 'claude',
      },
      create: {
        user_id: userId,
        ai_provider: 'claude',
        ai_model: 'sonnet',
        claude_access_token: tokens.access_token,
        claude_refresh_token: tokens.refresh_token,
        claude_token_expiry: tokens.expires_in ? BigInt(Date.now() + tokens.expires_in * 1000) : null,
      }
    });

    res.json({ success: true, message: 'Claude account connected successfully!' });
  } catch (error) {
    console.error('OAuth exchange error:', error);
    res.status(500).json({ error: 'Failed to connect Claude account' });
  }
});

// DELETE /api/settings/claude-oauth — disconnect Claude account
router.delete('/claude-oauth', requireAuth, async (req: AuthRequest, res) => {
  await prisma.userSettings.update({
    where: { user_id: req.userId! },
    data: { claude_access_token: null, claude_refresh_token: null, claude_token_expiry: null }
  });
  res.json({ success: true });
});

// GET /api/settings/gemini-oauth/start — returns the Google OAuth URL + starts PKCE
router.get('/gemini-oauth/start', requireAuth, (req: AuthRequest, res) => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const userId = req.userId!;
  geminiPkceStore.set(userId, { verifier, state, expiresAt: Date.now() + 5 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id: GEMINI_CLIENT_ID,
    redirect_uri: GEMINI_REDIRECT_URI,
    response_type: 'code',
    scope: GEMINI_SCOPES,
    access_type: 'offline',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  res.json({ url: `${GEMINI_AUTH_URL}?${params.toString()}` });
});

// POST /api/settings/gemini-oauth/exchange — user pastes the code, we get tokens
router.post('/gemini-oauth/exchange', requireAuth, async (req: AuthRequest, res) => {
  const { code } = req.body;
  const userId = req.userId!;

  if (!code) return res.status(400).json({ error: 'Code is required' });

  const pkce = geminiPkceStore.get(userId);
  if (!pkce || Date.now() > pkce.expiresAt) {
    return res.status(400).json({ error: 'OAuth session expired. Please start again.' });
  }
  geminiPkceStore.delete(userId);

  try {
    const tokenRes = await fetch(GEMINI_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: GEMINI_CLIENT_ID,
        client_secret: GEMINI_CLIENT_SECRET,
        code: code.trim(),
        redirect_uri: GEMINI_REDIRECT_URI,
        code_verifier: pkce.verifier,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Gemini token exchange failed:', err);
      return res.status(400).json({ error: 'Failed to exchange code. Make sure you copied the full authorization code.' });
    }

    const tokens: any = await tokenRes.json();

    await prisma.userSettings.upsert({
      where: { user_id: userId },
      update: {
        gemini_access_token: tokens.access_token,
        gemini_refresh_token: tokens.refresh_token || null,
        gemini_token_expiry: tokens.expires_in ? BigInt(Date.now() + tokens.expires_in * 1000) : null,
        ai_provider: 'gemini',
      },
      create: {
        user_id: userId,
        ai_provider: 'gemini',
        ai_model: 'gemini-2.0-flash',
        gemini_access_token: tokens.access_token,
        gemini_refresh_token: tokens.refresh_token || null,
        gemini_token_expiry: tokens.expires_in ? BigInt(Date.now() + tokens.expires_in * 1000) : null,
      }
    });

    res.json({ success: true, message: 'Google account connected successfully!' });
  } catch (error) {
    console.error('Gemini OAuth exchange error:', error);
    res.status(500).json({ error: 'Failed to connect Google account' });
  }
});

// DELETE /api/settings/gemini-oauth — disconnect Gemini account
router.delete('/gemini-oauth', requireAuth, async (req: AuthRequest, res) => {
  await prisma.userSettings.update({
    where: { user_id: req.userId! },
    data: { gemini_access_token: null, gemini_refresh_token: null, gemini_token_expiry: null, gemini_api_key: null }
  });
  res.json({ success: true });
});

// POST /api/settings/gemini-key — save Gemini API key (legacy fallback)
router.post('/gemini-key', requireAuth, async (req: AuthRequest, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API key required' });

  await prisma.userSettings.upsert({
    where: { user_id: req.userId! },
    update: { gemini_api_key: apiKey, ai_provider: 'gemini' },
    create: { user_id: req.userId!, ai_provider: 'gemini', ai_model: 'gemini-2.0-flash', gemini_api_key: apiKey }
  });
  res.json({ success: true, message: 'Gemini API key saved!' });
});

// DELETE /api/settings/gemini-key — remove Gemini key (legacy)
router.delete('/gemini-key', requireAuth, async (req: AuthRequest, res) => {
  await prisma.userSettings.update({
    where: { user_id: req.userId! },
    data: { gemini_api_key: null }
  });
  res.json({ success: true });
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
