import { Suspense, lazy } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/useSession.js';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Bookings from './pages/Bookings.jsx';

// The charting library is only needed on the analytics route — keep it out of
// the initial bundle so the bookings table loads fast.
const Analytics = lazy(() => import('./pages/Analytics.jsx'));

import { BRAND } from './lib/brand.js';
import Wordmark from './components/Wordmark.jsx';

export default function App() {
  const { user, mustChangePassword, loading, login, logout, completePasswordChange } = useSession();

  if (loading) {
    return <div className="empty">Loading dashboard…</div>;
  }

  if (!user) {
    return <Login onLogin={login} />;
  }

  if (mustChangePassword) {
    return <ChangePassword onSubmit={completePasswordChange} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Wordmark />

        <div className="divider" />

        <nav className="stack" style={{ gap: '0.25rem' }}>
          <NavLink to="/bookings" className={navClass}>
            Bookings
          </NavLink>
          <NavLink to="/analytics" className={navClass}>
            Analytics
          </NavLink>
        </nav>

        <div style={{ marginTop: 'auto' }} className="stack">
          <div className="divider" />
          <div>
            <div style={{ fontWeight: 600 }}>{user.fullName}</div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              {user.clubName}
            </div>
          </div>
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <Suspense fallback={<div className="empty">Loading…</div>}>
          <Routes>
            <Route path="/bookings" element={<Bookings user={user} />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="*" element={<Navigate to="/bookings" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

const navClass = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`;
