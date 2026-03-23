import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ProviderConfig } from './types';

/**
 * Writes Gemini OAuth credentials to a per-user temp directory.
 * Returns the HOME path to use when spawning the gemini CLI.
 */
function writeGeminiCredentials(userId: number, config: ProviderConfig): string {
  const homeDir = path.join(os.tmpdir(), `gemini-home-${userId}`);
  const geminiDir = path.join(homeDir, '.gemini');
  fs.mkdirSync(geminiDir, { recursive: true });

  const credentials = {
    access_token: config.geminiAccessToken,
    refresh_token: config.geminiRefreshToken || null,
    token_type: 'Bearer',
    expiry_date: config.geminiTokenExpiry ? Number(config.geminiTokenExpiry) : undefined,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
  };
  fs.writeFileSync(path.join(geminiDir, 'oauth_creds.json'), JSON.stringify(credentials, null, 2), { mode: 0o600 });

  const settings = { security: { auth: { selectedType: 'oauth-personal' } } };
  fs.writeFileSync(path.join(geminiDir, 'settings.json'), JSON.stringify(settings, null, 2));

  return homeDir;
}

/**
 * Spawns the gemini CLI and returns stdout/stderr.
 * Pass an optional `log` callback to capture progress messages.
 */
export function runGemini(
  prompt: string,
  cwd: string,
  timeoutMs: number,
  config?: ProviderConfig,
  userId?: number,
  log?: (msg: string) => void
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const addLog = log || ((_: string) => {});

    const env = { ...process.env };
    if (config?.geminiAccessToken && userId) {
      const homeDir = writeGeminiCredentials(userId, config);
      env.HOME = homeDir;
      addLog('Using user Google OAuth credentials for Gemini...');
    } else if (config?.geminiApiKey) {
      env.GEMINI_API_KEY = config.geminiApiKey;
      addLog('Using user Gemini API key...');
    }

    const child = spawn('gemini', ['-p', '.', '--output-format', 'stream-json', '-y'], {
      cwd, shell: true, timeout: timeoutMs, env, windowsHide: true
    });

    let stdout = '', stderr = '', lineBuffer = '', resultText = '';

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      lineBuffer += chunk;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          // Gemini streams assistant content as delta message events
          if (event.type === 'message' && event.role === 'assistant' && event.delta && typeof event.content === 'string') {
            resultText += event.content;
          }
          if (event.type === 'result') addLog('Complete.');
        } catch {
          if (line.trim()) addLog(line.trim().substring(0, 200));
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (text.trim()) addLog(`[gemini stderr] ${text.trim().substring(0, 300)}`);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout: resultText || stdout, stderr });
      else {
        const err: any = new Error(`gemini exited with code ${code}`);
        err.stdout = stdout; err.stderr = stderr;
        reject(err);
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
