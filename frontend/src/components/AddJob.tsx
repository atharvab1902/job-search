import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AddJob() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    company_name: '',
    location: '',
    salary_min: '',
    salary_max: '',
    salary_type: 'annual',
    remote_type: '',
    source: 'manual',
    source_url: '',
    description: '',
  });

  function updateField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...form,
        salary_min: form.salary_min ? parseInt(form.salary_min) : null,
        salary_max: form.salary_max ? parseInt(form.salary_max) : null,
      };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to create job');

      const job = await res.json();
      navigate(`/jobs/${job.id}`);
    } catch (error) {
      console.error('Error creating job:', error);
      alert('Failed to create job');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Add Job</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-1">Job Title *</label>
          <input
            type="text"
            required
            value={form.title}
            onChange={e => updateField('title', e.target.value)}
            className="w-full px-3 py-2 border rounded"
            placeholder="Software Engineer"
          />
        </div>

        {/* Company */}
        <div>
          <label className="block text-sm font-medium mb-1">Company *</label>
          <input
            type="text"
            required
            value={form.company_name}
            onChange={e => updateField('company_name', e.target.value)}
            className="w-full px-3 py-2 border rounded"
            placeholder="Google"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium mb-1">Location</label>
          <input
            type="text"
            value={form.location}
            onChange={e => updateField('location', e.target.value)}
            className="w-full px-3 py-2 border rounded"
            placeholder="Mountain View, CA"
          />
        </div>

        {/* Remote Type */}
        <div>
          <label className="block text-sm font-medium mb-1">Work Type</label>
          <select
            value={form.remote_type}
            onChange={e => updateField('remote_type', e.target.value)}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="">Not specified</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </div>

        {/* Salary */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Salary Min</label>
            <input
              type="number"
              value={form.salary_min}
              onChange={e => updateField('salary_min', e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="80000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Salary Max</label>
            <input
              type="number"
              value={form.salary_max}
              onChange={e => updateField('salary_max', e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="120000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={form.salary_type}
              onChange={e => updateField('salary_type', e.target.value)}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="annual">Annual</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
        </div>

        {/* Source */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Source</label>
            <select
              value={form.source}
              onChange={e => updateField('source', e.target.value)}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="manual">Manual</option>
              <option value="indeed">Indeed</option>
              <option value="linkedin">LinkedIn</option>
              <option value="glassdoor">Glassdoor</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Job URL</label>
            <input
              type="url"
              value={form.source_url}
              onChange={e => updateField('source_url', e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="https://..."
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1">Job Description</label>
          <textarea
            value={form.description}
            onChange={e => updateField('description', e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border rounded"
            placeholder="Paste the job description here..."
          />
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Add Job'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/jobs')}
            className="px-6 py-2 border rounded hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
