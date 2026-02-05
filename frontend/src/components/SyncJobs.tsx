import { useState, useEffect } from 'react';

export default function SyncJobs() {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<any>(null);

  const syncCommand = `cd D:/job-search && claude "Scan my Indeed, LinkedIn, and Glassdoor job alert emails from the last 7 days. For each new job: 1) Add it to data/db.json, 2) Generate tailored resume at ai-workspace/output/job_[ID]_resume.md, 3) Generate cover letter at ai-workspace/output/job_[ID]_cover_letter.md, 4) Generate LinkedIn referral message at ai-workspace/output/job_[ID]_linkedin.md, 5) Generate interview prep at ai-workspace/output/job_[ID]_interview.md. Use my profile from data/profile.md and resume from data/resumes/resume_ai.md as reference. Skip jobs already in the database."`;

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch('/api/sync/status');
      setStatus(await res.json());
    } catch (error) {
      console.error('Error checking status:', error);
    }
  }

  function copyCommand() {
    navigator.clipboard.writeText(syncCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sync Jobs from Email</h1>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-blue-800 mb-3">How It Works</h2>
        <ol className="list-decimal list-inside space-y-2 text-blue-900">
          <li>Copy the command below</li>
          <li>Open a terminal in the job-search folder</li>
          <li>Paste and run the command</li>
          <li>Claude will scan your emails and generate everything automatically</li>
          <li>Refresh this page to see new jobs</li>
        </ol>
      </div>

      {/* Command Box */}
      <div className="bg-gray-900 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400 text-sm">Run this command:</span>
          <button
            onClick={copyCommand}
            className={`px-4 py-2 rounded text-sm font-medium ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {copied ? 'Copied!' : 'Copy Command'}
          </button>
        </div>
        <code className="text-green-400 text-sm block whitespace-pre-wrap break-all">
          {syncCommand}
        </code>
      </div>

      {/* What Gets Generated */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">What Gets Generated (Per Job)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border rounded p-4 text-center">
            <div className="text-3xl mb-2">📄</div>
            <div className="font-medium">Tailored Resume</div>
            <div className="text-sm text-gray-500">ATS optimized</div>
          </div>
          <div className="border rounded p-4 text-center">
            <div className="text-3xl mb-2">✉️</div>
            <div className="font-medium">Cover Letter</div>
            <div className="text-sm text-gray-500">Personalized</div>
          </div>
          <div className="border rounded p-4 text-center">
            <div className="text-3xl mb-2">💼</div>
            <div className="font-medium">LinkedIn Message</div>
            <div className="text-sm text-gray-500">Referral request</div>
          </div>
          <div className="border rounded p-4 text-center">
            <div className="text-3xl mb-2">🎯</div>
            <div className="font-medium">Interview Prep</div>
            <div className="text-sm text-gray-500">Q&A + tips</div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-800 mb-2">Tips</h3>
        <ul className="text-sm text-yellow-900 space-y-1">
          <li>• Run this command once daily to get new jobs</li>
          <li>• Make sure Claude Code is installed and authenticated</li>
          <li>• Jobs already in your database will be skipped</li>
          <li>• All generated files are saved in ai-workspace/output/</li>
        </ul>
      </div>
    </div>
  );
}
