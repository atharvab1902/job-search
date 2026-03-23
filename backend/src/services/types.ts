export type Provider = 'claude' | 'gemini';

export interface ProviderConfig {
  provider: Provider;
  model?: string;
  // OAuth tokens for Claude
  claudeAccessToken?: string;
  claudeRefreshToken?: string;
  claudeTokenExpiry?: bigint | null;
  // API key for Gemini (legacy)
  geminiApiKey?: string;
  // OAuth tokens for Gemini
  geminiAccessToken?: string;
  geminiRefreshToken?: string;
  geminiTokenExpiry?: bigint | null;
}

export interface SyncResult {
  success: boolean;
  jobsAdded: number;
  documentsGenerated: number;
  error?: string;
  output?: string;
}

export interface DocGenResult {
  success: boolean;
  type: string;
  content?: string;
  error?: string;
}

export interface ExtractedJob {
  title: string;
  company_name: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_type: string | null;
  remote_type: string | null;
  source: string;
  source_url: string | null;
  description: string | null;
  email_id: string | null;
}
