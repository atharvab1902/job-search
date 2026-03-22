import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Job, Reminder } from '../types';
import { apiFetch } from '../lib/api';

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

interface DocStatus {
  exists: boolean;
  generating: boolean;
  content?: string;
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [h1bChecking, setH1bChecking] = useState(false);
  const [docStatuses, setDocStatuses] = useState<Record<string, DocStatus>>({});
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [genLog, setGenLog] = useState<string[]>([]);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionText, setDescriptionText] = useState('');
  const [resumeSuggestions, setResumeSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsGeneratedAt, setSuggestionsGeneratedAt] = useState<string | null>(null);
  const [recommendedResume, setRecommendedResume] = useState<string | null>(null);
  const [recommendationReason, setRecommendationReason] = useState<string | null>(null);
  const [additionalContext, setAdditionalContext] = useState<string>('');
  const [usedContext, setUsedContext] = useState<string | null>(null);

  const docTypes: GeneratedDoc[] = [
    { type: 'cover_letter', label: 'Cover Letter', icon: '✉️', filename: `job_${id}_cover_letter.md` },
    { type: 'linkedin', label: 'LinkedIn Message', icon: '💼', filename: `job_${id}_linkedin.md` },
    { type: 'interview', label: 'Interview Prep', icon: '🎯', filename: `job_${id}_interview.md` },
  ];

  const loadDocuments = useCallback(async () => {
    const statuses: Record<string, DocStatus> = {};

    for (const doc of docTypes) {
      try {
        const res = await apiFetch(`/api/documents/${id}/${doc.type}`);
        if (res.ok) {
          const data = await res.json();
          statuses[doc.type] = {
            exists: true,
            generating: false,
            content: data.content
          };
        } else {
          statuses[doc.type] = { exists: false, generating: false };
        }
      } catch {
        statuses[doc.type] = { exists: false, generating: false };
      }
    }

    setDocStatuses(statuses);
  }, [id]);

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/documents/${id}/resume-suggestions`);
      const data = await res.json();
      if (data.suggestions) {
        setResumeSuggestions(data.suggestions);
        setSuggestionsGeneratedAt(data.generated_at);
        setRecommendedResume(data.recommended_resume);
        setRecommendationReason(data.recommendation_reason);
        setUsedContext(data.additional_context);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    }
  }, [id]);

  useEffect(() => {
    loadJob();
    loadDocuments();
    loadSuggestions();
  }, [id, loadDocuments, loadSuggestions]);

  // Poll for generation status
  useEffect(() => {
    if (!generatingType) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/documents/${id}/${generatingType}/status`);
        const data = await res.json();

        setGenLog(data.log || []);

        if (data.exists && !data.generating) {
          // Document is ready
          setGeneratingType(null);
          setGenLog([]);
          loadDocuments();
        }
      } catch (error) {
        console.error('Error checking status:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [generatingType, id, loadDocuments]);

  async function loadJob() {
    try {
      const res = await apiFetch(`/api/jobs/${id}`);
      if (!res.ok) throw new Error('Job not found');
      const jobData = await res.json();
      setJob(jobData);
      setDescriptionText(jobData.description || '');
    } catch (error) {
      console.error('Error loading job:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveDescription() {
    if (!job) return;
    try {
      await apiFetch(`/api/jobs/${id}`, {
        method: 'PATCH',

        body: JSON.stringify({ description: descriptionText })
      });
      setEditingDescription(false);
      loadJob();
      alert('Description updated! You can now generate documents with the full details.');
    } catch (error) {
      console.error('Error updating description:', error);
      alert('Failed to update description');
    }
  }

  async function generateDoc(type: string) {
    if (generatingType) return;

    setGeneratingType(type);
    setGenLog([]);

    // Update status to show generating
    setDocStatuses(prev => ({
      ...prev,
      [type]: { exists: false, generating: true }
    }));

    try {
      await apiFetch(`/api/documents/${id}/${type}/generate`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('Error starting generation:', error);
      setGeneratingType(null);
      setDocStatuses(prev => ({
        ...prev,
        [type]: { exists: false, generating: false }
      }));
    }
  }

  async function updateStatus(status: string) {
    if (!job) return;
    try {
      await apiFetch(`/api/jobs/${id}`, {
        method: 'PATCH',

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
      const res = await apiFetch(`/api/h1b/check/${encodeURIComponent(job.company_name)}`);
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
      await apiFetch(`/api/jobs/${id}/apply`, {
        method: 'POST',

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
      await apiFetch(`/api/jobs/${id}`, { method: 'DELETE' });
      navigate('/jobs');
    } catch (error) {
      console.error('Error deleting job:', error);
    }
  }

  async function getResumeSuggestions() {
    setLoadingSuggestions(true);
    setShowSuggestions(true);
    try {
      const res = await apiFetch(`/api/documents/${id}/resume-suggestions`, {
        method: 'POST',

        body: JSON.stringify({ additionalContext })
      });
      const data = await res.json();
      setResumeSuggestions(data.suggestions || []);
      setSuggestionsGeneratedAt(data.generated_at || new Date().toISOString());
      setRecommendedResume(data.recommended_resume);
      setRecommendationReason(data.recommendation_reason);
      setUsedContext(additionalContext || null);
    } catch (error) {
      console.error('Error getting suggestions:', error);
      alert('Failed to get resume suggestions');
    } finally {
      setLoadingSuggestions(false);
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
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold"
            >
              📋 View Full Job on Indeed
            </a>
          )}
          <button
            onClick={() => setEditingDescription(!editingDescription)}
            className="px-4 py-2 border-2 border-orange-500 text-orange-700 rounded hover:bg-orange-50 font-semibold"
          >
            {editingDescription ? '❌ Cancel' : '✏️ Enhance Description'}
          </button>
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

      {/* Description Editor */}
      {editingDescription && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-2 text-orange-800">📝 Enhance Job Description</h2>
          <p className="text-sm text-gray-700 mb-4">
            1. Click "View Full Job on Indeed" above to open the job posting<br/>
            2. Copy the complete job description from Indeed<br/>
            3. Paste it below and click Save<br/>
            4. Generated documents will use this full description for better accuracy
          </p>
          <textarea
            value={descriptionText}
            onChange={e => setDescriptionText(e.target.value)}
            className="w-full h-64 border rounded p-3 font-mono text-sm"
            placeholder="Paste the full job description here..."
          />
          <div className="mt-3 flex gap-3">
            <button
              onClick={saveDescription}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
            >
              💾 Save Description
            </button>
            <button
              onClick={() => setEditingDescription(false)}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Resume Suggestions */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Resume Tailoring Suggestions</h2>
          <button
            onClick={getResumeSuggestions}
            disabled={loadingSuggestions}
            className={`px-4 py-2 rounded font-semibold ${
              loadingSuggestions
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {loadingSuggestions ? '🔄 Analyzing...' : '🎯 Suggest Changes'}
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Get specific, actionable suggestions to tailor your resume for this job.
          You'll receive exact changes to make while keeping your resume to 1 page.
        </p>

        {/* Additional Context Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            💡 Additional Context (Optional)
          </label>
          <textarea
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            placeholder="Add any new experience, projects, or skills to include in suggestions&#10;&#10;Example: 'I recently completed a C++ project called EasyNN - a neural network library from scratch. Also worked on IBM i systems using RPGLE and CLLE.'"
            className="w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            rows={4}
          />
          <p className="text-xs text-gray-500 mt-1">
            Mention new projects, skills, or experience not in your current resume. The AI will incorporate these into the suggestions.
          </p>
        </div>

        {showSuggestions && (
          <div className="space-y-3">
            {loadingSuggestions && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Analyzing job description and your resume...</p>
              </div>
            )}

            {!loadingSuggestions && resumeSuggestions.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                Click "Suggest Changes" to get tailoring recommendations
              </div>
            )}

            {!loadingSuggestions && resumeSuggestions.length > 0 && (
              <div className="space-y-4">
                {/* Resume Recommendation */}
                {recommendedResume && (
                  <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                      <span className="text-2xl">🎯</span>
                      <span>Recommended Resume: {recommendedResume === 'resume_ai' ? 'AI/ML Focused' : 'General'}</span>
                    </h3>
                    <p className="text-sm text-blue-800 mb-2">
                      <strong>Why:</strong> {recommendationReason}
                    </p>
                    <p className="text-xs text-blue-600">
                      📁 Use: <code className="bg-blue-100 px-2 py-1 rounded">data/resumes/{recommendedResume}.md</code>
                    </p>
                  </div>
                )}

                {/* Additional Context Used */}
                {usedContext && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                      <span className="text-xl">💡</span>
                      <span>Additional Context Provided</span>
                    </h3>
                    <p className="text-sm text-purple-800 whitespace-pre-wrap">{usedContext}</p>
                  </div>
                )}

                {/* Suggestions Count */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-800 mb-2">
                    ✅ {resumeSuggestions.length} Suggestions Generated
                  </h3>
                  <p className="text-sm text-green-700">
                    Review each suggestion below and update the recommended resume file accordingly.
                  </p>
                  {suggestionsGeneratedAt && (
                    <p className="text-xs text-green-600 mt-2">
                      Generated: {new Date(suggestionsGeneratedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                {resumeSuggestions.map((suggestion, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-start gap-3">
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        suggestion.type === 'replace' ? 'bg-blue-100 text-blue-800' :
                        suggestion.type === 'add' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {suggestion.type.toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>Why:</strong> {suggestion.reason}
                        </p>

                        {suggestion.type === 'replace' && (
                          <>
                            <div className="bg-red-50 border border-red-200 rounded p-2 mb-2">
                              <p className="text-xs text-red-600 font-semibold mb-1">Remove:</p>
                              <p className="text-sm text-red-800 font-mono">{suggestion.original}</p>
                            </div>
                            <div className="bg-green-50 border border-green-200 rounded p-2">
                              <p className="text-xs text-green-600 font-semibold mb-1">Replace with:</p>
                              <p className="text-sm text-green-800 font-mono">{suggestion.replacement}</p>
                            </div>
                          </>
                        )}

                        {suggestion.type === 'remove' && (
                          <div className="bg-red-50 border border-red-200 rounded p-2">
                            <p className="text-xs text-red-600 font-semibold mb-1">Remove this:</p>
                            <p className="text-sm text-red-800 font-mono">{suggestion.text}</p>
                          </div>
                        )}

                        {suggestion.type === 'add' && (
                          <>
                            <div className="bg-green-50 border border-green-200 rounded p-2 mb-2">
                              <p className="text-xs text-green-600 font-semibold mb-1">Add this:</p>
                              <p className="text-sm text-green-800 font-mono">{suggestion.text}</p>
                              <p className="text-xs text-gray-600 mt-1">Location: {suggestion.location}</p>
                            </div>
                            {suggestion.remove_to_compensate && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                                <p className="text-xs text-yellow-600 font-semibold mb-1">
                                  To maintain 1-page, remove:
                                </p>
                                <p className="text-sm text-yellow-800 font-mono">
                                  {suggestion.remove_to_compensate}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Generated Documents */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Generated Materials</h2>
        <p className="text-sm text-gray-500 mb-4">
          Click "Generate" to create each document on-demand. This saves tokens by only generating what you need.
        </p>

        {/* Document Tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {docTypes.map(doc => {
            const status = docStatuses[doc.type];
            const isGenerating = status?.generating || generatingType === doc.type;
            const hasDoc = status?.exists;

            return (
              <div key={doc.type} className="flex items-center gap-1">
                <button
                  onClick={() => hasDoc && setActiveDoc(activeDoc === doc.type ? null : doc.type)}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                    activeDoc === doc.type
                      ? 'bg-blue-600 text-white'
                      : hasDoc
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                  disabled={!hasDoc}
                >
                  <span>{doc.icon}</span>
                  <span>{doc.label}</span>
                  {hasDoc && <span className="text-xs">✓</span>}
                </button>

                {!hasDoc && (
                  <button
                    onClick={() => generateDoc(doc.type)}
                    disabled={isGenerating || !!generatingType}
                    className={`px-3 py-2 rounded text-sm ${
                      isGenerating
                        ? 'bg-yellow-100 text-yellow-800 animate-pulse'
                        : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                    }`}
                  >
                    {isGenerating ? 'Generating...' : 'Generate'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Generation Progress */}
        {generatingType && genLog.length > 0 && (
          <div className="mb-4 p-4 bg-gray-900 text-green-400 rounded-lg font-mono text-sm max-h-48 overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>Generating {docTypes.find(d => d.type === generatingType)?.label}...</span>
            </div>
            {genLog.slice(-10).map((log, i) => (
              <div key={i} className="text-xs opacity-80">{log}</div>
            ))}
          </div>
        )}

        {/* Document Content */}
        {activeDoc && docStatuses[activeDoc]?.content && (
          <div className="border rounded-lg">
            <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
              <span className="font-medium">
                {docTypes.find(d => d.type === activeDoc)?.label}
              </span>
              <div className="flex gap-2">
                {(activeDoc === 'resume' || activeDoc === 'cover_letter') && (
                  <>
                    <a
                      href={`/api/documents/${id}/${activeDoc}/pdf`}
                      download
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      📄 Download PDF
                    </a>
                    <a
                      href={`/api/documents/${id}/${activeDoc}/docx`}
                      download
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      📝 Download DOCX
                    </a>
                  </>
                )}
                <button
                  onClick={() => copyToClipboard(docStatuses[activeDoc]?.content || '')}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Copy to Clipboard
                </button>
              </div>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm font-mono">{docStatuses[activeDoc]?.content}</pre>
            </div>
          </div>
        )}

        {Object.values(docStatuses).every(s => !s.exists) && !generatingType && (
          <div className="text-center py-8 text-gray-500">
            <p>No documents generated yet.</p>
            <p className="text-sm mt-2">
              Click "Generate" next to each document type above to create it.
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
