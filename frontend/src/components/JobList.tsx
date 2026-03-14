import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Job, JobStatus } from '../types';

export default function JobList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const status = searchParams.get('status') || 'all';
  const h1bOnly = searchParams.get('h1b') === 'true';
  const search = searchParams.get('search') || '';

  useEffect(() => {
    loadJobs();
  }, [status, h1bOnly, search]);

  async function loadJobs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (h1bOnly) params.set('h1b_only', 'true');
      if (search) params.set('search', search);

      const res = await fetch(`/api/jobs?${params}`);
      const data = await res.json();
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  }

  function updateFilter(key: string, value: string) {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  }

  async function updateJobStatus(id: number, newStatus: JobStatus) {
    try {
      await fetch(`/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      loadJobs();
    } catch (error) {
      console.error('Error updating job:', error);
    }
  }

  const statuses: { value: string; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'new', label: 'New' },
    { value: 'interested', label: 'Interested' },
    { value: 'applied', label: 'Applied' },
    { value: 'interviewing', label: 'Interviewing' },
    { value: 'offer', label: 'Offer' },
    { value: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <input
            type="text"
            placeholder="Search jobs..."
            value={search}
            onChange={e => updateFilter('search', e.target.value)}
            className="px-3 py-2 border rounded-md w-64"
          />

          {/* Status Filter */}
          <select
            value={status}
            onChange={e => updateFilter('status', e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            {statuses.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {/* H1B Filter */}
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={h1bOnly}
              onChange={e => updateFilter('h1b', e.target.checked ? 'true' : '')}
              className="rounded"
            />
            <span>H1B Sponsors Only</span>
          </label>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-600">{total} jobs found</span>
            <Link
              to="/jobs/add"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
            >
              + Add Job
            </Link>
          </div>
        </div>
      </div>

      {/* Job List */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No jobs found. <Link to="/jobs/add" className="text-blue-600 hover:underline">Add one!</Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-4">Job</th>
                <th className="text-left p-4">Location</th>
                <th className="text-left p-4">Salary</th>
                <th className="text-left p-4">H1B</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} className="border-b hover:bg-gray-50">
                  <td className="p-4">
                    <Link to={`/jobs/${job.id}`} className="font-medium text-blue-600 hover:underline">
                      {job.title}
                    </Link>
                    <div className="text-sm text-gray-600">{job.company_name}</div>
                  </td>
                  <td className="p-4 text-sm">
                    {job.location || '-'}
                    {job.remote_type && (
                      <span className="ml-2 text-xs text-gray-500">({job.remote_type})</span>
                    )}
                  </td>
                  <td className="p-4 text-sm">
                    {job.salary_min && job.salary_max ? (
                      <span>
                        ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}
                        <span className="text-gray-500 text-xs ml-1">
                          /{job.salary_type === 'hourly' ? 'hr' : 'yr'}
                        </span>
                      </span>
                    ) : '-'}
                  </td>
                  <td className="p-4">
                    <H1BBadge h1b={job.h1b_sponsor} />
                  </td>
                  <td className="p-4">
                    <select
                      value={job.status}
                      onChange={e => updateJobStatus(job.id, e.target.value as JobStatus)}
                      className="text-sm border rounded px-2 py-1"
                    >
                      {statuses.filter(s => s.value !== 'all').map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-4">
                    <Link
                      to={`/jobs/${job.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View
                    </Link>
                    {job.source_url && (
                      <a
                        href={job.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-600 hover:underline ml-3"
                      >
                        Apply
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function H1BBadge({ h1b }: { h1b: number | null }) {
  if (h1b === 1) {
    return <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">Yes</span>;
  }
  if (h1b === 0) {
    return <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">No</span>;
  }
  return <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">?</span>;
}
