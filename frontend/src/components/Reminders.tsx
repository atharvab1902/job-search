import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Reminder } from '../types';

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');

  useEffect(() => {
    loadReminders();
  }, [filter]);

  async function loadReminders() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === 'pending') params.set('completed', 'false');
      if (filter === 'completed') params.set('completed', 'true');

      const res = await fetch(`/api/reminders?${params}`);
      setReminders(await res.json());
    } catch (error) {
      console.error('Error loading reminders:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleComplete(id: number, completed: boolean) {
    try {
      await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed })
      });
      loadReminders();
    } catch (error) {
      console.error('Error updating reminder:', error);
    }
  }

  async function deleteReminder(id: number) {
    if (!confirm('Delete this reminder?')) return;
    try {
      await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
      loadReminders();
    } catch (error) {
      console.error('Error deleting reminder:', error);
    }
  }

  function isOverdue(dueDate: string): boolean {
    return new Date(dueDate) < new Date(new Date().toDateString());
  }

  function isDueSoon(dueDate: string): boolean {
    const due = new Date(dueDate);
    const today = new Date(new Date().toDateString());
    const threeDays = new Date(today);
    threeDays.setDate(threeDays.getDate() + 3);
    return due >= today && due <= threeDays;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reminders</h1>
        <div className="flex gap-2">
          {(['pending', 'completed', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-sm ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : reminders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No {filter === 'all' ? '' : filter} reminders
          </div>
        ) : (
          <div className="divide-y">
            {reminders.map(reminder => (
              <div
                key={reminder.id}
                className={`p-4 flex items-center justify-between ${
                  reminder.completed ? 'bg-gray-50' : ''
                }`}
              >
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={!!reminder.completed}
                    onChange={() => toggleComplete(reminder.id, !!reminder.completed)}
                    className="w-5 h-5 rounded"
                  />
                  <div>
                    <div className={reminder.completed ? 'line-through text-gray-400' : ''}>
                      {reminder.message || `${reminder.type} reminder`}
                    </div>
                    <div className="text-sm text-gray-600">
                      <Link
                        to={`/jobs/${reminder.job_id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {reminder.job_title}
                      </Link>
                      <span className="mx-1">at</span>
                      <span>{reminder.company_name}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-sm ${
                      !reminder.completed && isOverdue(reminder.due_date)
                        ? 'text-red-600 font-semibold'
                        : !reminder.completed && isDueSoon(reminder.due_date)
                        ? 'text-yellow-600'
                        : 'text-gray-500'
                    }`}>
                      {new Date(reminder.due_date).toLocaleDateString()}
                    </div>
                    {!reminder.completed && isOverdue(reminder.due_date) && (
                      <div className="text-xs text-red-600">Overdue!</div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    reminder.type === 'follow_up' ? 'bg-blue-100 text-blue-700' :
                    reminder.type === 'interview_prep' ? 'bg-purple-100 text-purple-700' :
                    reminder.type === 'thank_you' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {reminder.type.replace('_', ' ')}
                  </span>
                  <button
                    onClick={() => deleteReminder(reminder.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
