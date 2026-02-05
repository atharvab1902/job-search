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

interface GeneratedDoc {
  type: string;
  label: string;
  icon: string;
  filename: string;
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [h1bChecking, setH1bChecking] = useState(false);
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [activeDoc, setActiveDoc] = useState<string | null>(null);

  const docTypes: GeneratedDoc[] = [
    { type: 'resume', label: 'Tailored Resume', icon: '📄', filename: `job_${id}_resume.md` },
    { type: 'cover_letter', label: 'Cover Letter', icon: '✉️', filename: `job_${id}_cover_letter.md` },
    { type: 'linkedin', label: 'LinkedIn Message', icon: '💼', filename: `job_${id}_linkedin.md` },
    { type: 'interview', label: 'Interview Prep', icon: '🎯', filename: `job_${id}_interview.md` },
  ];

  useEffect(() => {
    loadJob();
    loadDocuments();
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

  async function loadDocuments() {
    // Try to load each document type
    for (const doc of docTypes) {
      try {
        const res = await fetch(`/api/documents/${id}/${doc.type}`);
        if (res.ok) {
          const data = await res.json();
          if (data.content) {
            setDocuments(prev => ({ ...prev, [doc.type]: data.content }));
          }
        }
      } catch (error) {
        // Document doesn't exist yet, that's ok
      }
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

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
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

      {/* Generated Documents */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Generated Materials</h2>

        {/* Document Tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {docTypes.map(doc => {
            const hasDoc = documents[doc.type];
            return (
              <button
                key={doc.type}
                onClick={() => setActiveDoc(activeDoc === doc.type ? null : doc.type)}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  activeDoc === doc.type
                    ? 'bg-blue-600 text-white'
                    : hasDoc
                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-400'
                }`}
                disabled={!hasDoc}
              >
                <span>{doc.icon}</span>
                <span>{doc.label}</span>
                {hasDoc && <span className="text-xs">✓</span>}
              </button>
            );
          })}
        </div>

        {/* Document Content */}
        {activeDoc && documents[activeDoc] && (
          <div className="border rounded-lg">
            <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
              <span className="font-medium">
                {docTypes.find(d => d.type === activeDoc)?.label}
              </span>
              <button
                onClick={() => copyToClipboard(documents[activeDoc])}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Copy to Clipboard
              </button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm font-mono">{documents[activeDoc]}</pre>
            </div>
          </div>
        )}

        {Object.keys(documents).length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No documents generated yet.</p>
            <p className="text-sm mt-2">
              Go to <Link to="/sync" className="text-blue-600 hover:underline">Sync Jobs</Link> to generate materials.
            </p>
          </div>
        )}
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

      <Link to="/jobs" className="inline-block text-blue-600 hover:underline">
        ← Back to Jobs
      </Link>
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
