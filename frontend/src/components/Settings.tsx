import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  models: string[];
}

interface SettingsData {
  provider: string;
  model: string;
  availableProviders: ProviderInfo[];
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await apiFetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(provider: string, model: string) {
    setSaving(true);
    setMessage(null);

    try {
      const res = await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ provider, model })
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(prev => prev ? { ...prev, provider: data.provider, model: data.model } : null);
        setMessage({ type: 'success', text: 'Settings saved!' });
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading settings...</div>;
  }

  if (!settings) {
    return <div className="text-center py-8 text-red-500">Failed to load settings</div>;
  }

  const currentProvider = settings.availableProviders.find(p => p.id === settings.provider);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        {message && (
          <div className={`mb-4 p-3 rounded ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* Provider Selection */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">AI Provider</h2>
          <p className="text-sm text-gray-500 mb-4">
            Choose which AI provider to use for generating documents and syncing jobs.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {settings.availableProviders.map(provider => (
              <div
                key={provider.id}
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  settings.provider === provider.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => saveSettings(provider.id, provider.models[0])}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{provider.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{provider.description}</p>
                  </div>
                  {settings.provider === provider.id && (
                    <span className="text-blue-600 text-xl">✓</span>
                  )}
                </div>

                {provider.id === 'gemini' && (
                  <div className="mt-3 p-2 bg-green-50 rounded text-xs text-green-700">
                    Recommended for users without Claude Pro subscription
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Model Selection (for Claude) */}
        {settings.provider === 'claude' && currentProvider && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Claude Model</h2>
            <p className="text-sm text-gray-500 mb-4">
              Choose which Claude model to use. Sonnet is recommended for best balance of quality and cost.
            </p>

            <div className="flex flex-wrap gap-3">
              {currentProvider.models.map(model => (
                <button
                  key={model}
                  onClick={() => saveSettings(settings.provider, model)}
                  disabled={saving}
                  className={`px-4 py-2 rounded-lg border-2 transition-all ${
                    settings.model === model
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {model.charAt(0).toUpperCase() + model.slice(1)}
                  {model === 'sonnet' && (
                    <span className="ml-2 text-xs bg-blue-100 px-2 py-0.5 rounded">Recommended</span>
                  )}
                  {model === 'haiku' && (
                    <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Cheapest</span>
                  )}
                  {model === 'opus' && (
                    <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Best Quality</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Gemini Setup Instructions */}
        {settings.provider === 'gemini' && (
          <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-800 mb-2">Gemini CLI Setup Required</h3>
            <p className="text-sm text-yellow-700 mb-3">
              To use Gemini, you need to install and configure the Gemini CLI:
            </p>
            <ol className="list-decimal list-inside text-sm text-yellow-700 space-y-2">
              <li>Install: <code className="bg-yellow-100 px-1 rounded">npm install -g @google/gemini-cli</code></li>
              <li>Authenticate: <code className="bg-yellow-100 px-1 rounded">gemini</code> (follow prompts)</li>
              <li>Add Gmail MCP: <code className="bg-yellow-100 px-1 rounded">gemini mcp add gmail -- npx @gongrzhe/server-gmail-autoauth-mcp</code></li>
              <li>Verify: <code className="bg-yellow-100 px-1 rounded">gemini mcp list</code></li>
            </ol>
            <p className="text-xs text-green-600 mt-3 font-medium">
              Gemini supports MCP! You can use it for both sync and document generation with generous free limits.
            </p>
                      </div>
        )}

        {/* Token Usage Info */}
        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Estimated Token Usage</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-gray-50 rounded">
              <div className="font-medium">Job Sync</div>
              <div className="text-gray-500">~2,000-3,000 tokens</div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="font-medium">Resume</div>
              <div className="text-gray-500">~2,000-3,000 tokens</div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="font-medium">Cover Letter</div>
              <div className="text-gray-500">~1,500-2,000 tokens</div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="font-medium">LinkedIn Msg</div>
              <div className="text-gray-500">~1,000-1,500 tokens</div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            With on-demand generation, you only use tokens for documents you actually need.
          </p>
        </div>
      </div>
    </div>
  );
}
