import { useState, useEffect } from 'react';

interface SyncStatus {
  inProgress: boolean;
  lastSync: string | null;
  lastResult: {
    success: boolean;
    jobsAdded: number;
    documentsGenerated: number;
    error?: string;
  } | null;
}

export default function SyncJobs() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (polling) {
      interval = setInterval(checkStatus, 3000); // Poll every 3 seconds while syncing
    }
    return () => clearInterval(interval);
  }, [polling]);

  async function checkStatus() {
    try {
      const res = await fetch('/api/sync/status');
      const data = await res.json();
      setStatus(data);
      setPolling(data.inProgress);
    } catch (error) {
      console.error('Error checking status:', error);
    }
  }

  async function startSync() {
    setLoading(true);
    try {
      const res = await fetch('/api/sync/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPolling(true);
        checkStatus();
      } else {
        alert(data.error || 'Failed to start sync');
      }
    } catch (error) {
      console.error('Error starting sync:', error);
      alert('Failed to start sync');
    } finally {
      setLoading(false);
    }
  }

  const isRunning = status?.inProgress || loading;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sync Jobs from Email</h1>

      {/* Main Sync Button */}
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <button
          onClick={startSync}
          disabled={isRunning}
          className={`px-8 py-4 text-xl font-semibold rounded-lg ${
            isRunning
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isRunning ? (
            <span className="flex items-center gap-3">
              <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Syncing... Please Wait
            </span>
          ) : (
            'Sync Jobs Now'
          )}
        </button>
        <p className="mt-4 text-gray-600">
          Scans your Indeed, LinkedIn, and Glassdoor emails for new job postings
        </p>
      </div>

      {/* Status Display */}
      {status?.inProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-blue-800 font-medium">
              Sync in progress... This may take a few minutes.
            </span>
          </div>
          <p className="mt-2 text-sm text-blue-600">
            Claude Code is scanning your emails and generating documents for each job.
          </p>
        </div>
      )}

      {/* Last Sync Result */}
      {status?.lastResult && !status.inProgress && (
        <div className={`rounded-lg p-4 ${
          status.lastResult.success
            ? 'bg-green-50 border border-green-200'
            : 'bg-red-50 border border-red-200'
        }`}>
          <h3 className={`font-semibold ${
            status.lastResult.success ? 'text-green-800' : 'text-red-800'
          }`}>
            {status.lastResult.success ? 'Last Sync Successful' : 'Last Sync Failed'}
          </h3>
          {status.lastResult.success ? (
            <div className="mt-2 text-sm text-green-700">
              <p>Jobs added: {status.lastResult.jobsAdded}</p>
              <p>Documents generated: {status.lastResult.documentsGenerated}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-red-700">{status.lastResult.error}</p>
          )}
          {status.lastSync && (
            <p className="mt-2 text-xs text-gray-500">
              {new Date(status.lastSync).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* What Gets Generated */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">What Happens When You Sync</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3 p-3 border rounded">
            <span className="text-2xl">📧</span>
            <div>
              <div className="font-medium">1. Scan Emails</div>
              <div className="text-sm text-gray-500">Reads job alerts from Indeed, LinkedIn, Glassdoor</div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border rounded">
            <span className="text-2xl">📋</span>
            <div>
              <div className="font-medium">2. Parse Jobs</div>
              <div className="text-sm text-gray-500">Extracts job details, salary, location, company</div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border rounded">
            <span className="text-2xl">📄</span>
            <div>
              <div className="font-medium">3. Generate Resume</div>
              <div className="text-sm text-gray-500">Tailored resume for each job with matching keywords</div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border rounded">
            <span className="text-2xl">✉️</span>
            <div>
              <div className="font-medium">4. Generate Cover Letter</div>
              <div className="text-sm text-gray-500">Personalized 250-350 word cover letter</div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border rounded">
            <span className="text-2xl">💼</span>
            <div>
              <div className="font-medium">5. Generate LinkedIn Message</div>
              <div className="text-sm text-gray-500">Referral request message for networking</div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border rounded">
            <span className="text-2xl">🎯</span>
            <div>
              <div className="font-medium">6. Generate Interview Prep</div>
              <div className="text-sm text-gray-500">Questions, answers, and tips for interviews</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-800 mb-2">Tips</h3>
        <ul className="text-sm text-yellow-900 space-y-1">
          <li>• Run sync once daily to catch new job postings</li>
          <li>• Jobs already in your database will be skipped</li>
          <li>• All generated materials are saved and ready to use</li>
          <li>• Click on any job to view and copy the generated content</li>
        </ul>
      </div>
    </div>
  );
}
