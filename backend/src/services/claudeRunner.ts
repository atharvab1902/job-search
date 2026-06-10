import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ProviderConfig } from './types';

/**
 * Writes Claude OAuth credentials to a per-user temp directory.
 * Returns the HOME path to use when spawning the claude CLI.
 */
export function writeClaudeCredentials(userId: number, config: ProviderConfig): string {
  const homeDir = path.join(os.tmpdir(), `claude-home-${userId}`);
  const claudeDir = path.join(homeDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const credentials = {
    claudeAiOauth: {
      accessToken: config.claudeAccessToken,
      refreshToken: config.claudeRefreshToken,
      expiresAt: config.claudeTokenExpiry ? Number(config.claudeTokenExpiry) : undefined,
      scopes: ['org:create_api_key', 'user:profile', 'user:inference', 'user:sessions:claude_code'],
    }
  };
  fs.writeFileSync(path.join(claudeDir, '.credentials.json'), JSON.stringify(credentials, null, 2));
  return homeDir;
}

/**
 * Convenience wrapper for routes that only have partial config (OAuth token fields).
 */
export function writeClaudeCredentialsForUser(
  userId: number,
  config: Pick<ProviderConfig, 'claudeAccessToken' | 'claudeRefreshToken' | 'claudeTokenExpiry'>
): string {
  return writeClaudeCredentials(userId, config as ProviderConfig);
}

/**
 * Spawns the claude CLI and returns stdout/stderr.
 * Pass an optional `log` callback to capture progress messages.
 */
export function runClaude(
  prompt: string,
  cwd: string,
  timeoutMs: number,
  model?: string,
  config?: ProviderConfig,
  userId?: number,
  log?: (msg: string) => void,
  maxTurns: number = 80
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const addLog = log || ((_: string) => {});

    // Sanitize model — reject non-claude model names (e.g. gemini-* left over from settings)
    const validModels = ['haiku', 'sonnet', 'opus'];
    const resolvedModel = model && validModels.some(m => model.toLowerCase().includes(m)) ? model : 'haiku';
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', resolvedModel, '--dangerously-skip-permissions', '--max-turns', String(maxTurns)];
    const env = { ...process.env };
    delete env.CLAUDECODE;

    if (config?.claudeAccessToken && userId) {
      const homeDir = writeClaudeCredentials(userId, config);
      env.HOME = homeDir;
      addLog('Using user OAuth credentials for Claude...');
    }

    // shell:true is only needed on Windows (cmd.exe wrapper); on Linux spawn directly
    const useShell = process.platform === 'win32';
    const child = spawn('claude', args, { cwd, shell: useShell, timeout: timeoutMs, env });

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
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text' && block.text?.trim()) addLog(block.text.trim().substring(0, 200));
              if (block.type === 'tool_use') addLog(`Using tool: ${block.name}`);
            }
          }
          if (event.type === 'result') {
            addLog('Complete.');
            if (event.result) resultText = event.result;
          }
        } catch {
          if (line.trim()) addLog(line.trim().substring(0, 200));
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout: resultText || stdout, stderr });
      else {
        const err: any = new Error(`claude exited with code ${code}`);
        err.stdout = resultText || stdout; err.stderr = stderr;
        reject(err);
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
