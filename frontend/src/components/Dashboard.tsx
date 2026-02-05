import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Stats, Job, Reminder } from '../types';

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [statsRes, jobsRes, remindersRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/jobs?limit=5&sort=-created_at'),
        fetch('/api/reminders?upcoming=true')
      ]);

      setStats(await statsRes.json());
      const jobsData = await jobsRes.json();
      setRecentJobs(jobsData.jobs || []);
      setUpcomingReminders(await remindersRes.json());
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Jobs"
          value={stats?.total || 0}
          color="blue"
        />
        <StatCard
          title="H1B Sponsors"
          value={stats?.h1bSponsors || 0}
          color="green"
        />
        <StatCard
          title="Applied"
          value={stats?.byStatus?.applied || 0}
          color="purple"
        />
        <StatCard
          title="Interviews"
          value={stats?.byStatus?.interviewing || 0}
          color="yellow"
        />
      </div>

      {/* Reminders Alert */}
      {(stats?.reminders?.overdue || 0) > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-600 font-medium">
              {stats?.reminders?.overdue} overdue reminder(s)!
            </span>
            <Link to="/reminders" className="ml-auto text-red-600 hover:underline">
              View all
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Jobs</h2>
            <Link to="/jobs" className="text-blue-600 hover:underline text-sm">
              View all
            </Link>
          </div>
          {recentJobs.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No jobs yet. Add some!</p>
          ) : (
            <div className="space-y-3">
              {recentJobs.map(job => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="block p-3 rounded border hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{job.title}</div>
                      <div className="text-sm text-gray-600">{job.company_name}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <H1BBadge h1b={job.h1b_sponsor} />
                      <StatusBadge status={job.status} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Reminders */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Upcoming Reminders</h2>
            <Link to="/reminders" className="text-blue-600 hover:underline text-sm">
              View all
            </Link>
          </div>
          {upcomingReminders.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No upcoming reminders</p>
          ) : (
            <div className="space-y-3">
              {upcomingReminders.slice(0, 5).map(reminder => (
                <div key={reminder.id} className="p-3 rounded border">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{reminder.job_title}</div>
                      <div className="text-sm text-gray-600">{reminder.company_name}</div>
                      <div className="text-sm text-gray-500 mt-1">{reminder.message}</div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(reminder.due_date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Funnel Stats */}
      {stats && (stats.funnel.applied > 0 || stats.funnel.interviewing > 0) && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Application Funnel</h2>
          <div className="flex items-center space-x-4">
            <FunnelStep label="Applied" value={stats.funnel.applied} />
            <div className="text-gray-400">→</div>
            <FunnelStep label="Interviewing" value={stats.funnel.interviewing} />
            <div className="text-gray-400">→</div>
            <FunnelStep label="Offers" value={stats.funnel.offers} />
            <div className="ml-auto text-sm text-gray-600">
              Response Rate: <span className="font-semibold">{stats.funnel.responseRate}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <div className="text-sm font-medium opacity-80">{title}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

function FunnelStep({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}

function H1BBadge({ h1b }: { h1b: number | null }) {
  if (h1b === 1) {
    return <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">H1B</span>;
  }
  if (h1b === 0) {
    return <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">No H1B</span>;
  }
  return <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">?</span>;
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
    <span className={`px-2 py-1 text-xs rounded capitalize ${colors[status] || colors.new}`}>
      {status}
    </span>
  );
}
