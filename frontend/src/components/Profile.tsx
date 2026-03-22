import { useEffect, useState, useRef } from 'react';
import { apiFetch } from '../lib/api';

interface Resume {
  id: number;
  name: string;
  is_default: boolean;
  created_at: string;
}

type Tab = 'profile' | 'resumes';

export default function Profile() {
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Profile & Resumes</h1>
      <div className="flex gap-2 border-b">
        {(['profile', 'resumes'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            {t === 'profile' ? 'Profile / Bio' : 'Resumes'}
          </button>
        ))}
      </div>
      {tab === 'profile' ? <ProfileTab /> : <ResumesTab />}
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await apiFetch('/api/profile');
      const data = await res.json();
      setContent(data.content || '');
      setSavedContent(data.content || '');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch('/api/profile', { method: 'PUT', body: JSON.stringify({ content }) });
      if (!res.ok) throw new Error('Failed to save');
      setSavedContent(content);
      setMsg({ type: 'success', text: 'Profile saved!' });
    } catch {
      setMsg({ type: 'error', text: 'Failed to save profile' });
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/profile/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      setContent(data.content);
      setSavedContent(data.content);
      setMsg({ type: 'success', text: 'Profile uploaded and converted to markdown!' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Upload failed' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const isDirty = content !== savedContent;

  if (loading) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Your Profile</h2>
            <p className="text-sm text-gray-500 mt-1">
              Used by AI for cover letters, LinkedIn messages, and interview prep. Write in markdown or upload a PDF/Word file.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-3 py-2 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {uploading ? 'Converting...' : 'Upload PDF / Word'}
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.md,.txt" className="hidden" onChange={uploadFile} />
          </div>
        </div>

        {msg && (
          <div className={`mb-4 p-3 rounded text-sm ${msg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={20}
          className="w-full border rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={`# Your Name\n\n**Email** | **Phone** | **Location**\n\n## Summary\nBrief professional summary...\n\n## Experience\n### Job Title | Company | Date\n- Achievement...\n\n## Education\n### Degree | School | Year\n\n## Skills\n- Skill 1, Skill 2...`}
        />

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-400">Markdown format — the AI reads this to personalize your documents</span>
          <button
            onClick={save}
            disabled={saving || !isDirty}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Resumes Tab ──────────────────────────────────────────────────────────────

function ResumesTab() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [viewContent, setViewContent] = useState('');
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await apiFetch('/api/profile/resumes');
      setResumes(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function uploadResume(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (newName.trim()) form.append('name', newName.trim());
      const token = localStorage.getItem('token');
      const res = await fetch('/api/profile/resumes/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      setMsg({ type: 'success', text: 'Resume uploaded!' });
      setNewName('');
      await load();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Upload failed' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function setDefault(id: number) {
    await apiFetch(`/api/profile/resumes/${id}`, { method: 'PATCH', body: JSON.stringify({ is_default: true }) });
    await load();
  }

  async function deleteResume(id: number, name: string) {
    if (!confirm(`Delete resume "${name}"?`)) return;
    await apiFetch(`/api/profile/resumes/${id}`, { method: 'DELETE' });
    await load();
  }

  async function viewResume(id: number) {
    const res = await apiFetch(`/api/profile/resumes/${id}`);
    const data = await res.json();
    setViewContent(data.content);
    setViewingId(id);
  }

  if (loading) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-1">Upload Resume</h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload PDF or Word files. Converted to markdown so AI can tailor it per job.
        </p>

        {msg && (
          <div className={`mb-4 p-3 rounded text-sm ${msg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="Resume name (optional)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="border rounded px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'Converting...' : 'Choose File & Upload'}
          </button>
          <span className="text-xs text-gray-400">PDF, DOCX, or TXT/MD</span>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.md,.txt" className="hidden" onChange={uploadResume} />
        </div>
      </div>

      {/* Resume List */}
      <div className="bg-white rounded-lg shadow">
        {resumes.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            No resumes yet. Upload one above.
          </div>
        ) : (
          <div className="divide-y">
            {resumes.map(r => (
              <div key={r.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      {r.is_default && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Default</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Added {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => viewResume(r.id)}
                    className="text-sm text-blue-600 hover:underline px-2 py-1"
                  >
                    View
                  </button>
                  {!r.is_default && (
                    <button
                      onClick={() => setDefault(r.id)}
                      className="text-sm text-gray-600 hover:text-gray-800 px-2 py-1 border rounded"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => deleteResume(r.id, r.name)}
                    className="text-sm text-red-600 hover:text-red-800 px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View Modal */}
      {viewingId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">{resumes.find(r => r.id === viewingId)?.name}</h3>
              <button onClick={() => setViewingId(null)} className="text-gray-500 hover:text-gray-700 text-xl">×</button>
            </div>
            <pre className="p-4 overflow-y-auto font-mono text-sm whitespace-pre-wrap flex-1">{viewContent}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
