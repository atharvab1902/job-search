import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Job, Reminder } from '../types';

interface JobWithDetails extends Job {
  application?: {
    id: number;
    applied_date: string;
    resume_version: string;
    cover_letter_path: string | null;
    referral_contact: string | null;
    notes: string | null;
  };
  reminders: Reminder[];
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [h1bChecking, setH1bChecking] = useState(false);

  useEffect(() => {
    loadJob();
  }, [id]);

  async function loadJob() {
    try {
      const res = await fetch(`/api/jobs/${id}`);
      if (!res.ok) throw new Error('Job not found');
      setJob(await res.json());
    } catch (error) {
      console.error('Error loading job:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(status: string) {
    if (!job) return;
    try {
      await fetch(`/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      loadJob();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  async function checkH1B() {
    if (!job) return;
    setH1bChecking(true);
    try {
      const res = await fetch(`/api/h1b/check/${encodeURIComponent(job.company_name)}`);
      const data = await res.json();
      alert(`H1B Status for ${job.company_name}:\n\nSponsors: ${data.sponsors ? 'Yes' : data.sponsors === false ? 'No' : 'Unknown'}\nConfidence: ${data.confidence}\nPetitions: ${data.petitions}\n\n${data.note || ''}`);
      loadJob();
    } catch (error) {
      console.error('Error checking H1B:', error);
    } finally {
      setH1bChecking(false);
    }
  }

  async function markApplied() {
    if (!job) return;
    try {
      await fetch(`/api/jobs/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_version: 'ai' })
      });
      loadJob();
    } catch (error) {
      console.error('Error marking as applied:', error);
    }
  }

  async function deleteJob() {
    if (!confirm('Are you sure you want to delete this job?')) return;
    try {
      await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      navigate('/jobs');
    } catch (error) {
      console.error('Error deleting job:', error);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!job) {
    return <div className="text-center py-8">Job not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <p className="text-lg text-gray-600">{job.company_name}</p>
            {job.location && <p className="text-gray-500">{job.location}</p>}
          </div>
          <div className="flex items-center space-x-2">
            <H1BBadge h1b={job.h1b_sponsor} petitions={job.h1b_petitions} />
            <StatusBadge status={job.status} />
          </div>
        </div>

        {/* Salary */}
        {job.salary_min && job.salary_max && (
          <div className="mt-4 text-lg">
            <span className="font-semibold">
              ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}
            </span>
            <span className="text-gray-500 ml-1">
              / {job.salary_type === 'hourly' ? 'hour' : 'year'}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          {job.source_url && (
            <a
              href={job.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              View Original Posting
            </a>
          )}
          <button
            onClick={checkH1B}
            disabled={h1bChecking}
            className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {h1bChecking ? 'Checking...' : 'Check H1B Status'}
          </button>
          {job.status !== 'applied' && job.status !== 'interviewing' && job.status !== 'offer' && (
            <button
              onClick={markApplied}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Mark as Applied
            </button>
          )}
          <button
            onClick={deleteJob}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Delete
          </button>
        </div>

        {/* Status Change */}
        <div className="mt-4">
          <label className="text-sm text-gray-600 mr-2">Change Status:</label>
          <select
            value={job.status}
            onChange={e => updateStatus(e.target.value)}
            className="border rounded px-3 py-1"
          >
            <option value="new">New</option>
            <option value="interested">Interested</option>
            <option value="applied">Applied</option>
            <option value="interviewing">Interviewing</option>
            <option value="offer">Offer</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>
      </div>

      {/* Description */}
      {job.description && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Job Description</h2>
          <div className="prose max-w-none whitespace-pre-wrap">{job.description}</div>
        </div>
      )}

      {/* Application Info */}
      {job.application && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Application</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Applied:</span>
              <span className="ml-2">{new Date(job.application.applied_date).toLocaleDateString()}</span>
            </div>
            <div>
              <span className="text-gray-600">Resume:</span>
              <span className="ml-2">{job.application.resume_version}</span>
            </div>
            {job.application.referral_contact && (
              <div className="col-span-2">
                <span className="text-gray-600">Referral:</span>
                <span className="ml-2">{job.application.referral_contact}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reminders */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Reminders</h2>
        {job.reminders.length === 0 ? (
          <p className="text-gray-500">No reminders</p>
        ) : (
          <div className="space-y-2">
            {job.reminders.map(reminder => (
              <div key={reminder.id} className="flex items-center justify-between p-3 border rounded">
                <div>
                  <span className={reminder.completed ? 'line-through text-gray-400' : ''}>
                    {reminder.message}
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({new Date(reminder.due_date).toLocaleDateString()})
                  </span>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  reminder.completed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {reminder.completed ? 'Done' : reminder.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">AI Actions</h2>
        <p className="text-sm text-gray-600 mb-4">
          Use Claude Code to generate tailored content for this job.
        </p>
        <div className="space-y-3">
          <AIAction
            label="Tailor Resume"
            command={`claude "Read the job description for ${job.title} at ${job.company_name} and tailor my resume from data/resumes/resume_ai.md. Focus on matching keywords and relevant experience. Output to ai-workspace/output/resume_${job.id}.md"`}
          />
          <AIAction
            label="Generate Cover Letter"
            command={`claude "Write a cover letter for ${job.title} at ${job.company_name}. Use my profile from data/profile.md. Keep it 250-350 words, professional but personable. Output to ai-workspace/output/cover_${job.id}.md"`}
          />
          <AIAction
            label="LinkedIn Message"
            command={`claude "Write a LinkedIn outreach message to request a referral for ${job.title} at ${job.company_name}. Keep it human, curious, 150-200 words. Output to ai-workspace/output/linkedin_${job.id}.md"`}
          />
        </div>
      </div>

      <Link to="/jobs" className="inline-block text-blue-600 hover:underline">
        ← Back to Jobs
      </Link>
    </div>
  );
}

function AIAction({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);

  function copyCommand() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{label}</span>
        <button
          onClick={copyCommand}
          className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {copied ? 'Copied!' : 'Copy Command'}
        </button>
      </div>
      <code className="text-xs text-gray-600 block bg-gray-50 p-2 rounded overflow-x-auto">
        {command}
      </code>
    </div>
  );
}

function H1BBadge({ h1b, petitions }: { h1b: number | null; petitions: number | null }) {
  if (h1b === 1) {
    return (
      <span className="px-3 py-1 text-sm rounded bg-green-100 text-green-700">
        H1B Sponsor {petitions ? `(${petitions})` : ''}
      </span>
    );
  }
  if (h1b === 0) {
    return <span className="px-3 py-1 text-sm rounded bg-red-100 text-red-700">No H1B</span>;
  }
  return <span className="px-3 py-1 text-sm rounded bg-gray-100 text-gray-600">H1B Unknown</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    interested: 'bg-purple-100 text-purple-700',
    applied: 'bg-yellow-100 text-yellow-700',
    interviewing: 'bg-orange-100 text-orange-700',
    offer: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    withdrawn: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={`px-3 py-1 text-sm rounded capitalize ${colors[status] || colors.new}`}>
      {status}
    </span>
  );
}
