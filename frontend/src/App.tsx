import { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import JobList from './components/JobList';
import JobDetail from './components/JobDetail';
import AddJob from './components/AddJob';
import Reminders from './components/Reminders';
import SyncJobs from './components/SyncJobs';
import Settings from './components/Settings';
import Profile from './components/Profile';
import Login from './components/Login';

interface User {
  id: number;
  name: string;
  email: string;
}

function App() {
  const location = useLocation();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  function handleLogin(newToken: string, _newUser: User) {
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    setToken(null);
  }

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/sync', label: 'Sync Jobs' },
    { path: '/jobs', label: 'Jobs' },
    { path: '/reminders', label: 'Reminders' },
    { path: '/profile', label: 'Profile' },
    { path: '/settings', label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Job Search Assistant</h1>
            <div className="flex items-center space-x-4">
              <nav className="flex space-x-4">
                {navItems.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      location.pathname === item.path
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded hover:bg-gray-100"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sync" element={<SyncJobs />} />
          <Route path="/jobs" element={<JobList />} />
          <Route path="/jobs/add" element={<AddJob />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
