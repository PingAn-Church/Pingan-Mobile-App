import React, { useEffect, useState } from 'react';
import { Login } from './Login';
import { CurrentUser, getCurrentUser, hasSession, logoutUser, SESSION_EXPIRED_EVENT } from './api';
import { Announcements } from './Announcements';
import { CourseEditor } from './CourseEditor';
import { Dashboard } from './Dashboard';
import { UserManagement } from './UserManagement';
import { Sidebar } from './Sidebar';

export const App: React.FC = () => {
  // Signed in = we have tokens AND a saved admin/instructor profile.
  const [user, setUser] = useState<CurrentUser | null>(() => (hasSession() ? getCurrentUser() : null));
  // Set when the server says the session can't be refreshed any more.
  // The screen stays mounted underneath, so unsaved work is not lost.
  const [expiredUser, setExpiredUser] = useState<CurrentUser | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'courses' | 'announcements' | 'users'>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  useEffect(() => {
    const onExpired = () => setExpiredUser((prev) => prev ?? user);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [user]);

  const handleLogout = async () => {
    await logoutUser();
    setExpiredUser(null);
    setUser(null);
  };

  if (!user) {
    return <Login onLoginSuccess={setUser} />;
  }

  const displayName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  const roleLabel = user.admin ? 'Administrator' : 'Instructor';

  const themeStyles = isDarkMode
    ? {
        '--bg-main': '#0b0f19',
        '--bg-card': '#1e293b',
        '--bg-header': '#0f172a',
        '--text-primary': '#f8fafc',
        '--text-secondary': '#94a3b8',
        '--border-color': '#334155',
        '--input-bg': '#0f172a',
        '--table-header-bg': '#1e293b',
      }
    : {
        '--bg-main': '#f8fafc',
        '--bg-card': '#ffffff',
        '--bg-header': '#ffffff',
        '--text-primary': '#0f172a',
        '--text-secondary': '#64748b',
        '--border-color': '#e2e8f0',
        '--input-bg': '#ffffff',
        '--table-header-bg': '#f8fafc',
      };

  return (
    <div
      style={
        {
          display: 'flex',
          minHeight: '100vh',
          background: 'var(--bg-main)',
          color: 'var(--text-primary)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          transition: 'all 0.2s ease',
          ...themeStyles,
        } as React.CSSProperties
      }
    >
      {/* Global CSS Override for Dark/Light Mode Adaptability */}
      <style>{`
        div, card, form, table {
          transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
        }
        main div[style*="background: #ffffff"],
        main div[style*="background: rgb(255, 255, 255)"] {
          background: var(--bg-card) !important;
          border-color: var(--border-color) !important;
          color: var(--text-primary) !important;
        }
        main h2, main h3, main h4 {
          color: var(--text-primary) !important;
        }
        main p {
          color: var(--text-secondary) !important;
        }
        main table tr {
          border-color: var(--border-color) !important;
        }
        main table tr[style*="background: #f8fafc"],
        main table tr[style*="background: #f1f5f9"] {
          background: var(--table-header-bg) !important;
        }
        main table th, main table td {
          color: var(--text-primary) !important;
        }
        main input, main select {
          background: var(--input-bg) !important;
          color: var(--text-primary) !important;
          border-color: var(--border-color) !important;
        }
      `}</style>

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        isAdmin={Boolean(user.admin)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            height: '64px',
            background: 'var(--bg-header)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 32px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>
              {activeTab === 'dashboard' && 'System Overview & Platform Analytics'}
              {activeTab === 'courses' && 'Course Authoring Studio & Media Management'}
              {activeTab === 'announcements' && 'Church Newsfeed & Announcement Center'}
              {activeTab === 'users' && 'User Privileges & Community Access'}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#0284c7',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{displayName}</p>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {roleLabel} · {user.email}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              style={{
                padding: '6px 14px',
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </div>
        </header>

        <main style={{ flex: 1, padding: '32px', maxWidth: '1200px', width: '100%', boxSizing: 'border-box' }}>
          {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
          {activeTab === 'courses' && <CourseEditor />}
          {activeTab === 'announcements' && user.admin && <Announcements />}
          {activeTab === 'users' && user.admin && <UserManagement />}
        </main>
      </div>

      {expiredUser && (
        <Login
          sessionExpired
          expectedEmail={expiredUser.email}
          onLoginSuccess={(u) => {
            setUser(u);
            setExpiredUser(null);
          }}
        />
      )}
    </div>
  );
};

export default App;